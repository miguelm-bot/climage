import path from 'node:path';

import type {
  GenerateOptions,
  GenerateRequest,
  GeneratedMedia,
  GeneratedMediaPartial,
  MediaKind,
  OutputFormat,
  Provider,
  ProviderEnv,
  ProviderId,
} from './types.js';
import { loadEnv } from './env.js';
import {
  makeOutputPath,
  resolveImageInput,
  resolveImageInputs,
  resolveOutDir,
  writeMediaFile,
} from './output.js';
import { slugify, timestampLocalCompact } from './strings.js';
import { xaiProvider } from '../providers/xai.js';
import { falProvider } from '../providers/fal.js';
import { googleProvider } from '../providers/google.js';
import { openaiProvider } from '../providers/openai.js';

const providers: Provider[] = [googleProvider, xaiProvider, falProvider, openaiProvider];

function log(verbose: boolean, ...args: unknown[]) {
  if (verbose) console.error('[router]', ...args);
}

export function listProviders(): Provider[] {
  return [...providers];
}

export function pickProvider(id: ProviderId, env: ProviderEnv): Provider {
  if (id !== 'auto') {
    const p = providers.find((p) => p.id === id);
    if (!p) throw new Error(`Unknown provider: ${id}`);
    if (!p.isAvailable(env)) throw new Error(`Provider ${id} is not available (missing API key)`);
    return p;
  }

  const p = providers.find((pp) => pp.isAvailable(env));
  if (!p)
    throw new Error(
      'No providers available. Set XAI_API_KEY (or other provider keys) in .env or environment.'
    );
  return p;
}

function defaultFormatForKind(kind: MediaKind): OutputFormat {
  return kind === 'video' ? 'mp4' : 'png';
}

async function normalizeOptions(
  prompt: string,
  opts: GenerateOptions,
  verbose: boolean
): Promise<GenerateRequest> {
  const nRaw = opts.n ?? 1;
  const n = Math.max(1, Math.min(10, Math.floor(nRaw)));

  const kind = opts.kind ?? 'image';
  const format = opts.format ?? defaultFormatForKind(kind);

  const outDir = resolveOutDir(opts.outDir ?? '.');
  const timestamp = timestampLocalCompact();

  const nameBase = slugify(opts.name ?? prompt);

  // Resolve input images (convert local paths to data URIs)
  let inputImages: string[] | undefined;
  if (opts.inputImages?.length) {
    log(verbose, `Resolving ${opts.inputImages.length} input image(s)...`);
    inputImages = await resolveImageInputs(opts.inputImages);
    log(verbose, `Resolved input images`);
  }

  // Resolve start/end frames for video
  let startFrame: string | undefined;
  let endFrame: string | undefined;

  if (opts.startFrame) {
    log(verbose, `Resolving start frame: ${opts.startFrame}`);
    startFrame = await resolveImageInput(opts.startFrame);
  }

  if (opts.endFrame) {
    log(verbose, `Resolving end frame: ${opts.endFrame}`);
    endFrame = await resolveImageInput(opts.endFrame);
  }

  return {
    prompt,
    provider: opts.provider ?? 'auto',
    model: opts.model ?? undefined,
    n,
    aspectRatio: opts.aspectRatio ?? undefined,
    kind,
    format,
    outDir,
    out: opts.out ? path.resolve(process.cwd(), opts.out) : undefined,
    nameBase,
    timestamp,
    verbose: Boolean(opts.verbose),
    // New fields
    inputImages,
    startFrame,
    endFrame,
    duration: opts.duration,
  };
}

/**
 * Validate request parameters against provider capabilities.
 */
function validateRequestForProvider(req: GenerateRequest, provider: Provider): void {
  const caps = provider.capabilities;

  // Validate input images count
  const inputCount = req.inputImages?.length ?? 0;
  if (inputCount > caps.maxInputImages) {
    throw new Error(
      `Provider ${provider.id} supports max ${caps.maxInputImages} input image(s), but ${inputCount} provided`
    );
  }

  // Validate aspect ratio (when provider declares supported ratios)
  if (req.aspectRatio) {
    const ar = req.aspectRatio.trim();

    // Providers that explicitly support custom ratios may also accept provider-specific enums.
    if (caps.supportsCustomAspectRatio === true) return;

    // If provider has an allowlist, validate against it.
    if (Array.isArray(caps.supportedAspectRatios) && caps.supportedAspectRatios.length) {
      const normalized = ar.replace(/\s+/g, '');
      const ok = caps.supportedAspectRatios.includes(normalized);
      if (!ok) {
        throw new Error(
          `Provider ${provider.id} does not support aspect ratio "${normalized}". ` +
            `Supported: ${caps.supportedAspectRatios.join(', ')}`
        );
      }
      return;
    }

    // Otherwise enforce basic w:h format to avoid passing junk.
    const looksLikeRatio = /^\d+\s*:\s*\d+$/.test(ar);
    if (!looksLikeRatio) {
      throw new Error(`Invalid aspect ratio: "${req.aspectRatio}" (expected format: w:h)`);
    }
  }

  // Validate video interpolation (start + end frame)
  if (req.endFrame && !caps.supportsVideoInterpolation) {
    throw new Error(
      `Provider ${provider.id} does not support video interpolation (end frame). ` +
        `Only startFrame is supported for image-to-video.`
    );
  }

  // Validate duration range
  if (req.duration !== undefined && req.kind === 'video' && caps.videoDurationRange) {
    const [min, max] = caps.videoDurationRange;
    if (req.duration < min || req.duration > max) {
      throw new Error(
        `Provider ${provider.id} supports video duration ${min}-${max}s, but ${req.duration}s requested`
      );
    }
  }

  // Validate image editing support
  if (req.kind === 'image' && inputCount > 0 && !caps.supportsImageEditing) {
    throw new Error(`Provider ${provider.id} does not support image editing with input images`);
  }
}

export async function generateMedia(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<GeneratedMedia[]> {
  const { env } = loadEnv(process.cwd());
  const verbose = Boolean(opts.verbose);

  // Normalize and resolve options (including reading input image files)
  const req = await normalizeOptions(prompt, opts, verbose);

  // Build a summary object for logging (truncate large data URIs)
  const reqSummary = {
    ...req,
    prompt: req.prompt.slice(0, 50) + '...',
    inputImages: req.inputImages?.map((img) =>
      img.startsWith('data:') ? `data:...${img.length} chars` : img
    ),
    startFrame: req.startFrame?.startsWith('data:')
      ? `data:...${req.startFrame.length} chars`
      : req.startFrame,
    endFrame: req.endFrame?.startsWith('data:')
      ? `data:...${req.endFrame.length} chars`
      : req.endFrame,
  };
  log(verbose, 'Request:', JSON.stringify(reqSummary));

  const provider = pickProvider(req.provider, env);
  log(verbose, 'Selected provider:', provider.id, '| supports:', provider.supports);

  if (!provider.supports.includes(req.kind)) {
    throw new Error(`Provider ${provider.id} does not support ${req.kind} generation`);
  }

  // Validate request against provider capabilities
  validateRequestForProvider(req, provider);

  log(verbose, 'Calling provider.generate()...');
  const startTime = Date.now();

  const partials = await provider.generate(req, env);

  log(verbose, `Provider returned ${partials.length} items in ${Date.now() - startTime}ms`);

  const items: GeneratedMedia[] = [];

  for (let i = 0; i < partials.length; i++) {
    const p: GeneratedMediaPartial | undefined = partials[i];
    if (!p) continue;
    const filePath = makeOutputPath(req, i);
    log(verbose, `Writing ${p.bytes.byteLength} bytes to: ${filePath}`);
    await writeMediaFile(filePath, p.bytes);
    items.push({ ...p, filePath });
  }

  log(verbose, `Done! Generated ${items.length} ${req.kind}(s)`);
  return items;
}

export async function generateImage(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<GeneratedMedia[]> {
  return generateMedia(prompt, { ...opts, kind: 'image' });
}

export async function generateVideo(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<GeneratedMedia[]> {
  return generateMedia(prompt, { ...opts, kind: 'video' });
}
