import { fal } from '@fal-ai/client';

import type { GenerateRequest, Provider, ProviderEnv } from '../core/types.js';

function getFalKey(env: ProviderEnv): string | undefined {
  // community is split; support both
  return env.FAL_API_KEY || env.FAL_KEY;
}

type FalImage = {
  url: string;
  content_type?: string;
};

type FalResult = {
  images?: FalImage[];
};

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal image download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

export const falProvider: Provider = {
  id: 'fal',
  displayName: 'fal.ai',
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
      // Some fal models support "num_images"; flux/dev returns images array length.
      ...(req.n ? { num_images: req.n } : {}),
    };

    const result = (await fal.subscribe(model, { input })) as { data: FalResult };

    const images = result?.data?.images;
    if (!images?.length) throw new Error('fal returned no images');

    const out = [] as Array<{
      provider: 'fal';
      model?: string;
      index: number;
      url?: string;
      bytes: Uint8Array;
      mimeType?: string;
    }>;

    for (let i = 0; i < Math.min(images.length, req.n); i++) {
      const img = images[i];
      if (!img?.url) continue;
      const { bytes, mimeType } = await downloadBytes(img.url);
      const finalMimeType = img.content_type ?? mimeType;
      out.push({
        provider: 'fal',
        model,
        index: i,
        url: img.url,
        bytes,
        ...(finalMimeType !== undefined ? { mimeType: finalMimeType } : {}),
      });
    }

    if (!out.length) throw new Error('fal returned images but none were downloadable');

    return out;
  },
};
