import type { GenerateRequest, Provider, ProviderEnv } from '../core/types.js';

const XAI_API_BASE = 'https://api.x.ai/v1';

function getXaiApiKey(env: ProviderEnv): string | undefined {
  return env.XAI_API_KEY || env.XAI_TOKEN || env.GROK_API_KEY;
}

type XaiImage = {
  url?: string;
  b64_json?: string;
};

type XaiImagesResponse = {
  created?: number;
  data: XaiImage[];
};

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`xAI image download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

export const xaiProvider: Provider = {
  id: 'xai',
  displayName: 'xAI (Grok Imagine)',
  supports: ['image'],
  isAvailable(env) {
    return Boolean(getXaiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getXaiApiKey(env);
    if (!apiKey) throw new Error('Missing xAI API key. Set XAI_API_KEY (or XAI_TOKEN).');

    const model = req.model ?? 'grok-imagine-image';
    const body: Record<string, unknown> = {
      model,
      prompt: req.prompt,
      n: req.n,
      // xAI docs: endpoint supports aspect_ratio
      ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
      // Use URL format to download + save.
      response_format: 'url',
    };

    const res = await fetch(`${XAI_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`xAI generations failed (${res.status}): ${txt.slice(0, 500)}`);
    }

    const json = (await res.json()) as XaiImagesResponse;
    if (!json.data?.length) throw new Error('xAI returned no images');

    const results = [] as Array<{
      kind: 'image';
      provider: 'xai';
      model?: string;
      index: number;
      url?: string;
      bytes: Uint8Array;
      mimeType?: string;
    }>;

    for (let i = 0; i < json.data.length; i++) {
      const img = json.data[i];
      if (!img) continue;
      if (img.url) {
        const { bytes, mimeType } = await downloadBytes(img.url);
        results.push({
          kind: 'image',
          provider: 'xai',
          model,
          index: i,
          url: img.url,
          bytes,
          ...(mimeType !== undefined ? { mimeType } : {}),
        });
        continue;
      }
      if (img.b64_json) {
        const bytes = Uint8Array.from(Buffer.from(img.b64_json, 'base64'));
        results.push({ kind: 'image', provider: 'xai', model, index: i, bytes });
        continue;
      }
      throw new Error('xAI returned image without url or b64_json');
    }

    return results;
  },
};
