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

type XaiVideoGenerationResponse = {
  request_id?: string;
};

type XaiVideoResultResponse = {
  status?: 'pending' | 'done' | string;
  response?: {
    model?: string;
    video?: {
      duration?: number;
      respect_moderation?: boolean;
      url?: string | null;
    };
  } | null;
};

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`xAI download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function generateXaiImages(req: GenerateRequest, apiKey: string) {
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
}

async function generateXaiVideo(req: GenerateRequest, apiKey: string) {
  const model = req.model ?? 'grok-imagine-video';

  // xAI is async: create request_id, then poll /v1/videos/{request_id}
  const createBody: Record<string, unknown> = {
    prompt: req.prompt,
    model,
    ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
    // docs default duration: 6
    duration: 6,
  };

  const createRes = await fetch(`${XAI_API_BASE}/videos/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '');
    throw new Error(`xAI video generations failed (${createRes.status}): ${txt.slice(0, 500)}`);
  }

  const createJson = (await createRes.json()) as XaiVideoGenerationResponse;
  const requestId = createJson.request_id;
  if (!requestId) throw new Error('xAI video generation returned no request_id');

  // Poll (best-effort). Keep this bounded so CLI doesn't hang forever.
  const maxAttempts = 60; // ~3 minutes at 3s interval
  const intervalMs = 3000;

  let result: XaiVideoResultResponse | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${XAI_API_BASE}/videos/${encodeURIComponent(requestId)}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`xAI video poll failed (${res.status}): ${txt.slice(0, 500)}`);
    }

    const json = (await res.json()) as XaiVideoResultResponse;
    result = json;

    if (json.status === 'done') break;
    await sleep(intervalMs);
  }

  if (!result || result.status !== 'done') {
    throw new Error(`xAI video generation timed out (request_id=${requestId})`);
  }

  const url = result.response?.video?.url ?? undefined;
  if (!url) {
    // moderation can result in empty url
    const respected = result.response?.video?.respect_moderation;
    if (respected === false) {
      throw new Error('xAI video generation was blocked by moderation (no video url returned)');
    }
    throw new Error('xAI video generation completed but returned no video url');
  }

  const { bytes, mimeType } = await downloadBytes(url);

  return [
    {
      kind: 'video' as const,
      provider: 'xai' as const,
      model: result.response?.model ?? model,
      index: 0,
      url,
      bytes,
      ...(mimeType !== undefined ? { mimeType } : {}),
    },
  ];
}

export const xaiProvider: Provider = {
  id: 'xai',
  displayName: 'xAI',
  supports: ['image', 'video'],
  isAvailable(env) {
    return Boolean(getXaiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getXaiApiKey(env);
    if (!apiKey) throw new Error('Missing xAI API key. Set XAI_API_KEY (or XAI_TOKEN).');

    if (req.kind === 'video') return generateXaiVideo(req, apiKey);
    return generateXaiImages(req, apiKey);
  },
};
