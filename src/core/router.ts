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
import { makeOutputPath, resolveOutDir, writeMediaFile } from './output.js';
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

function normalizeOptions(prompt: string, opts: GenerateOptions): GenerateRequest {
  const nRaw = opts.n ?? 1;
  const n = Math.max(1, Math.min(10, Math.floor(nRaw)));

  const kind = opts.kind ?? 'image';
  const format = opts.format ?? defaultFormatForKind(kind);

  const outDir = resolveOutDir(opts.outDir ?? '.');
  const timestamp = timestampLocalCompact();

  const nameBase = slugify(opts.name ?? prompt);

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
  };
}

export async function generateMedia(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<GeneratedMedia[]> {
  const { env } = loadEnv(process.cwd());
  const req = normalizeOptions(prompt, opts);
  const verbose = req.verbose;

  log(verbose, 'Request:', JSON.stringify({ ...req, prompt: req.prompt.slice(0, 50) + '...' }));

  const provider = pickProvider(req.provider, env);
  log(verbose, 'Selected provider:', provider.id, '| supports:', provider.supports);

  if (!provider.supports.includes(req.kind)) {
    throw new Error(`Provider ${provider.id} does not support ${req.kind} generation`);
  }

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
