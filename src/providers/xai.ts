import type {
  GenerateRequest,
  Provider,
  ProviderCapabilities,
  ProviderEnv,
} from '../core/types.js';

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
  // When pending
  status?: 'pending' | string;
  // When complete - video info is at top level, not nested in response
  video?: {
    duration?: number;
    respect_moderation?: boolean;
    url?: string | null;
  };
  model?: string;
};

let verboseMode = false;

function log(...args: unknown[]) {
  if (verboseMode) console.error('[xai]', ...args);
}

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  log('Downloading from:', url.slice(0, 100) + '...');
  const start = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`xAI download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  log(`Downloaded ${ab.byteLength} bytes in ${Date.now() - start}ms, type: ${ct}`);
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Generate images using xAI's /v1/images/generations endpoint (text-to-image).
 */
async function generateXaiImages(req: GenerateRequest, apiKey: string) {
  const model = req.model ?? 'grok-imagine-image';
  log('Starting image generation, model:', model, 'n:', req.n);

  const body: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    n: req.n,
    // xAI docs: endpoint supports aspect_ratio
    ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
    // Use URL format to download + save.
    response_format: 'url',
  };
  log('Request body:', JSON.stringify(body));

  log('Calling xAI images/generations...');
  const startTime = Date.now();

  const res = await fetch(`${XAI_API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  log(`API responded in ${Date.now() - startTime}ms, status: ${res.status}`);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    log('Error response:', txt.slice(0, 1000));
    throw new Error(`xAI generations failed (${res.status}): ${txt.slice(0, 500)}`);
  }

  const json = (await res.json()) as XaiImagesResponse;
  log('Response data count:', json.data?.length);

  if (!json.data?.length) throw new Error('xAI returned no images');

  return processXaiImageResponse(json, model);
}

/**
 * Edit images using xAI's /v1/images/edits endpoint (image-to-image).
 * Uses JSON format with image_url (data URI or URL).
 */
async function editXaiImages(req: GenerateRequest, apiKey: string) {
  const model = req.model ?? 'grok-imagine-image';
  const inputImage = req.inputImages?.[0];
  if (!inputImage) throw new Error('No input image provided for editing');

  if ((req.inputImages?.length ?? 0) > 1) {
    log(
      'NOTE: xAI image edit supports a single image_url; using only the first input image and ignoring the rest'
    );
  }

  log('Starting image editing, model:', model, 'n:', req.n);

  const body: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    n: req.n,
    image: { url: inputImage }, // Object with url field containing data URI or URL
    response_format: 'url',
    ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
  };
  log('Request body:', JSON.stringify({ ...body, image: { url: '...(data uri)...' } }));

  log('Calling xAI images/edits...');
  const startTime = Date.now();

  const res = await fetch(`${XAI_API_BASE}/images/edits`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  log(`API responded in ${Date.now() - startTime}ms, status: ${res.status}`);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    log('Error response:', txt.slice(0, 1000));
    throw new Error(`xAI edits failed (${res.status}): ${txt.slice(0, 500)}`);
  }

  const json = (await res.json()) as XaiImagesResponse;
  log('Response data count:', json.data?.length);

  if (!json.data?.length) throw new Error('xAI returned no images');

  return processXaiImageResponse(json, model);
}

/**
 * Process xAI image response and download images.
 */
async function processXaiImageResponse(json: XaiImagesResponse, model: string) {
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
    log(`Processing image ${i}...`);
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
      log(`Image ${i} is base64 encoded`);
      const bytes = Uint8Array.from(Buffer.from(img.b64_json, 'base64'));
      results.push({ kind: 'image', provider: 'xai', model, index: i, bytes });
      continue;
    }
    throw new Error('xAI returned image without url or b64_json');
  }

  log(`Successfully generated ${results.length} image(s)`);
  return results;
}

async function generateXaiVideo(req: GenerateRequest, apiKey: string) {
  const model = req.model ?? 'grok-imagine-video';

  // Get image URL from startFrame or inputImages[0]
  const imageUrl = req.startFrame ?? req.inputImages?.[0];
  if ((req.inputImages?.length ?? 0) > 1 && !req.startFrame) {
    log(
      'NOTE: xAI video generation accepts a single image_url; using only the first input image and ignoring the rest'
    );
  }
  log(
    'Starting video generation, model:',
    model,
    'hasImageUrl:',
    !!imageUrl,
    'duration:',
    req.duration
  );

  // xAI is async: create request_id, then poll /v1/videos/{request_id}
  // Note: xAI video API uses image_url as a string (data URI or URL), not an object
  const createBody: Record<string, unknown> = {
    prompt: req.prompt,
    model,
    ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
    // Add image_url for image-to-video (data URI or URL string)
    ...(imageUrl ? { image_url: imageUrl } : {}),
    // Add duration (xAI supports 1-15 seconds)
    ...(req.duration !== undefined ? { duration: req.duration } : {}),
  };
  log(
    'Request body:',
    JSON.stringify({
      ...createBody,
      image_url: createBody.image_url
        ? `...(${String(createBody.image_url).length} chars)`
        : undefined,
    })
  );

  log('Calling xAI videos/generations...');
  const startTime = Date.now();

  const createRes = await fetch(`${XAI_API_BASE}/videos/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  log(`API responded in ${Date.now() - startTime}ms, status: ${createRes.status}`);

  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '');
    log('Error response:', txt.slice(0, 1000));
    throw new Error(`xAI video generations failed (${createRes.status}): ${txt.slice(0, 500)}`);
  }

  const createJson = (await createRes.json()) as XaiVideoGenerationResponse;
  const requestId = createJson.request_id;
  log('Got request_id:', requestId);
  if (!requestId) throw new Error('xAI video generation returned no request_id');

  // Poll (best-effort). Video generation can take a while.
  const maxAttempts = 120; // ~6 minutes at 3s interval
  const intervalMs = 3000;

  let result: XaiVideoResultResponse | undefined;
  log(`Starting poll loop (max ${maxAttempts} attempts, ${intervalMs}ms interval)...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${XAI_API_BASE}/videos/${encodeURIComponent(requestId)}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      log(`Poll attempt ${attempt + 1} failed:`, txt.slice(0, 500));
      throw new Error(`xAI video poll failed (${res.status}): ${txt.slice(0, 500)}`);
    }

    const json = (await res.json()) as XaiVideoResultResponse;
    result = json;

    log(
      `Poll attempt ${attempt + 1}/${maxAttempts}: status=${json.status}, raw:`,
      JSON.stringify(json).slice(0, 300)
    );

    // xAI returns video object at top level (not nested in response) when complete
    if (json.video?.url) {
      log('Video generation complete!');
      break;
    }

    if (json.status === 'failed' || json.status === 'error') {
      log('Video generation failed:', JSON.stringify(json));
      throw new Error(`xAI video generation failed: ${JSON.stringify(json)}`);
    }

    await sleep(intervalMs);
  }

  if (!result?.video?.url) {
    log('Timed out. Last result:', JSON.stringify(result));
    throw new Error(`xAI video generation timed out (request_id=${requestId})`);
  }

  const url = result.video.url;
  log('Video URL:', url);

  // Check moderation status
  if (result.video?.respect_moderation === false) {
    throw new Error('xAI video generation was blocked by moderation');
  }

  const { bytes, mimeType } = await downloadBytes(url);

  log(`Successfully generated video, ${bytes.byteLength} bytes`);
  return [
    {
      kind: 'video' as const,
      provider: 'xai' as const,
      model: result.model ?? model,
      index: 0,
      url,
      bytes,
      ...(mimeType !== undefined ? { mimeType } : {}),
    },
  ];
}

const xaiCapabilities: ProviderCapabilities = {
  // xAI image edit currently accepts a single image_url, but users often pass multiple
  // reference images. We allow multiple and use the first one where applicable.
  maxInputImages: 10,
  // xAI aspect_ratio examples show "4:3"; docs don't publish a strict allowlist.
  supportsCustomAspectRatio: true,
  supportsVideoInterpolation: false, // xAI does not support end frame
  videoDurationRange: [1, 15], // 1-15 seconds
  supportsImageEditing: true,
};

export const xaiProvider: Provider = {
  id: 'xai',
  displayName: 'xAI',
  supports: ['image', 'video'],
  capabilities: xaiCapabilities,
  isAvailable(env) {
    return Boolean(getXaiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getXaiApiKey(env);
    if (!apiKey) throw new Error('Missing xAI API key. Set XAI_API_KEY (or XAI_TOKEN).');

    verboseMode = req.verbose;
    log('Provider initialized, kind:', req.kind);

    if (req.kind === 'video') return generateXaiVideo(req, apiKey);

    // Use edit endpoint if input images provided, otherwise generation
    const hasInputImages = req.inputImages && req.inputImages.length > 0;
    if (hasInputImages) {
      log('Input images detected, using edit endpoint');
      return editXaiImages(req, apiKey);
    }
    return generateXaiImages(req, apiKey);
  },
};
