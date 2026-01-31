import { fal } from '@fal-ai/client';

import type { GenerateRequest, Provider, ProviderEnv } from '../core/types.js';

function getFalKey(env: ProviderEnv): string | undefined {
  // community is split; support both
  return env.FAL_API_KEY || env.FAL_KEY;
}

type FalMedia = {
  url: string;
  content_type?: string;
};

type FalResult = {
  images?: FalMedia[];
  image?: FalMedia;
  videos?: FalMedia[];
  video?: FalMedia;
};

function log(verbose: boolean, ...args: unknown[]) {
  if (verbose) console.error('[fal]', ...args);
}

async function downloadBytes(
  url: string,
  verbose: boolean
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  log(verbose, 'Downloading from:', url.slice(0, 100) + '...');
  const start = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  log(verbose, `Downloaded ${ab.byteLength} bytes in ${Date.now() - start}ms, type: ${ct}`);
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

function pickMany(result: FalResult, kind: 'image' | 'video'): FalMedia[] {
  if (kind === 'image') {
    if (Array.isArray(result.images) && result.images.length) return result.images;
    if (result.image?.url) return [result.image];
    return [];
  }

  if (Array.isArray(result.videos) && result.videos.length) return result.videos;
  if (result.video?.url) return [result.video];
  return [];
}

// Default models per kind
const DEFAULT_IMAGE_MODEL = 'fal-ai/flux/dev';
const DEFAULT_VIDEO_MODEL = 'fal-ai/ltxv-2/text-to-video/fast'; // LTX Video 2.0 Fast - very quick

export const falProvider: Provider = {
  id: 'fal',
  displayName: 'fal.ai',
  supports: ['image', 'video'],
  isAvailable(env) {
    return Boolean(getFalKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const key = getFalKey(env);
    if (!key) throw new Error('Missing fal API key. Set FAL_KEY (or FAL_API_KEY).');

    const verbose = req.verbose;
    log(verbose, 'Starting generation, kind:', req.kind, 'n:', req.n);

    // Configure credentials at runtime
    fal.config({ credentials: key });

    // Default model depends on kind
    const defaultModel = req.kind === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL;
    const model = req.model ?? defaultModel;
    log(verbose, 'Using model:', model);

    // Map common aspect ratios to fal enums when possible.
    let image_size: any = undefined;
    if (req.aspectRatio) {
      const ar = req.aspectRatio.trim();
      if (ar === '1:1') image_size = 'square';
      else if (ar === '4:3') image_size = 'landscape_4_3';
      else if (ar === '16:9') image_size = 'landscape_16_9';
      else if (ar === '3:4') image_size = 'portrait_4_3';
      else if (ar === '9:16') image_size = 'portrait_16_9';
    }

    const input: Record<string, unknown> = {
      prompt: req.prompt,
      ...(image_size ? { image_size } : {}),
      // Some fal models support "num_images"; some video models use "num_videos".
      ...(req.n ? { num_images: req.n, num_videos: req.n } : {}),
    };
    log(verbose, 'Request input:', JSON.stringify(input));

    log(verbose, 'Calling fal.subscribe...');
    const startTime = Date.now();

    const result = (await fal.subscribe(model, {
      input,
      logs: verbose,
      onQueueUpdate: verbose
        ? (update) => {
            log(true, 'Queue update:', update.status, JSON.stringify(update).slice(0, 200));
          }
        : undefined,
    })) as { data: FalResult };

    log(verbose, `fal.subscribe completed in ${Date.now() - startTime}ms`);
    log(verbose, 'Raw result keys:', Object.keys(result?.data ?? {}));
    log(verbose, 'Result preview:', JSON.stringify(result?.data ?? {}).slice(0, 500));

    const items = pickMany(result?.data ?? {}, req.kind);
    log(verbose, `Found ${items.length} ${req.kind}(s) in response`);

    if (!items?.length) {
      const noun = req.kind === 'video' ? 'videos' : 'images';
      throw new Error(
        `fal returned no ${noun}. Raw response: ${JSON.stringify(result?.data).slice(0, 300)}`
      );
    }

    const out = [] as Array<{
      kind: 'image' | 'video';
      provider: 'fal';
      model?: string;
      index: number;
      url?: string;
      bytes: Uint8Array;
      mimeType?: string;
    }>;

    for (let i = 0; i < Math.min(items.length, req.n); i++) {
      const m = items[i];
      if (!m?.url) {
        log(verbose, `Item ${i} has no URL, skipping`);
        continue;
      }
      log(verbose, `Downloading item ${i}...`);
      const { bytes, mimeType } = await downloadBytes(m.url, verbose);
      const finalMimeType = m.content_type ?? mimeType;
      out.push({
        kind: req.kind,
        provider: 'fal',
        model,
        index: i,
        url: m.url,
        bytes,
        ...(finalMimeType !== undefined ? { mimeType: finalMimeType } : {}),
      });
    }

    if (!out.length) {
      const noun = req.kind === 'video' ? 'videos' : 'images';
      throw new Error(`fal returned ${noun} but none were downloadable`);
    }

    log(verbose, `Successfully generated ${out.length} ${req.kind}(s)`);
    return out;
  },
};
