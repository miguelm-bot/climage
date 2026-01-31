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

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
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

    // Configure credentials at runtime
    fal.config({ credentials: key });

    // Default model: Flux dev (fast + popular). Can be overridden via --model.
    const model = req.model ?? 'fal-ai/flux/dev';

    // Map common aspect ratios to fal enums when possible.
    // If user passes e.g. 4:3, use landscape_4_3.
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

    const result = (await fal.subscribe(model, { input })) as { data: FalResult };

    const items = pickMany(result?.data ?? {}, req.kind);
    if (!items?.length) {
      const noun = req.kind === 'video' ? 'videos' : 'images';
      throw new Error(`fal returned no ${noun}`);
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
      if (!m?.url) continue;
      const { bytes, mimeType } = await downloadBytes(m.url);
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

    return out;
  },
};
