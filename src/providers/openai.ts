import type { GenerateRequest, Provider, ProviderEnv } from '../core/types.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

function getOpenAIApiKey(env: ProviderEnv): string | undefined {
  return env.OPENAI_API_KEY || env.OPENAI_KEY;
}

type OpenAIImage = {
  url?: string;
  b64_json?: string;
};

type OpenAIImagesResponse = {
  created?: number;
  data: OpenAIImage[];
};

async function downloadBytes(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAI image download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type');
  return ct ? { bytes: new Uint8Array(ab), mimeType: ct } : { bytes: new Uint8Array(ab) };
}

// Map aspect ratios to OpenAI size parameters
function mapAspectRatioToSize(aspectRatio?: string, model?: string): string | undefined {
  if (!aspectRatio) return undefined;

  const ar = aspectRatio.trim();
  // gpt-image-1.5/1/1-mini supports: 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), auto
  // dall-e-3 supports: 1024x1024, 1792x1024 (landscape), 1024x1792 (portrait)
  // dall-e-2 supports: 256x256, 512x512, 1024x1024

  if (model?.startsWith('gpt-image')) {
    if (ar === '1:1') return '1024x1024';
    if (ar === '3:2' || ar === '4:3' || ar === '16:9') return '1536x1024';
    if (ar === '2:3' || ar === '3:4' || ar === '9:16') return '1024x1536';
  } else if (model === 'dall-e-3') {
    if (ar === '1:1') return '1024x1024';
    if (ar === '16:9' || ar === '4:3') return '1792x1024';
    if (ar === '9:16' || ar === '3:4') return '1024x1792';
  }

  return undefined;
}

export const openaiProvider: Provider = {
  id: 'openai',
  displayName: 'OpenAI (GPT Image / DALL-E)',
  supports: ['image'],
  isAvailable(env) {
    return Boolean(getOpenAIApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getOpenAIApiKey(env);
    if (!apiKey) throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY.');

    // Default to gpt-image-1.5 (latest), can be overridden to gpt-image-1, gpt-image-1-mini, dall-e-3 or dall-e-2
    const model = req.model ?? 'gpt-image-1.5';

    const size = mapAspectRatioToSize(req.aspectRatio, model);

    const body: Record<string, unknown> = {
      model,
      prompt: req.prompt,
      n: req.n,
      ...(size ? { size } : {}),
      // gpt-image-1 doesn't support response_format, defaults to b64_json
      // dall-e-2/3 support response_format
      ...(!model.startsWith('gpt-image') ? { response_format: 'url' } : {}),
    };

    const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`OpenAI generations failed (${res.status}): ${txt.slice(0, 500)}`);
    }

    const json = (await res.json()) as OpenAIImagesResponse;
    if (!json.data?.length) throw new Error('OpenAI returned no images');

    const results = [] as Array<{
      kind: 'image';
      provider: 'openai';
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
        const dl = await downloadBytes(img.url);
        results.push({
          kind: 'image',
          provider: 'openai',
          model,
          index: i,
          url: img.url,
          bytes: dl.bytes,
          ...(dl.mimeType ? { mimeType: dl.mimeType } : {}),
        });
        continue;
      }
      if (img.b64_json) {
        const bytes = Uint8Array.from(Buffer.from(img.b64_json, 'base64'));
        results.push({ kind: 'image', provider: 'openai', model, index: i, bytes });
        continue;
      }
      throw new Error('OpenAI returned image without url or b64_json');
    }

    return results;
  },
};
