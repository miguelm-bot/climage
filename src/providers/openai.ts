import type {
  GenerateRequest,
  Provider,
  ProviderCapabilities,
  ProviderEnv,
} from '../core/types.js';

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

let verboseMode = false;

function log(...args: unknown[]) {
  if (verboseMode) console.error('[openai]', ...args);
}

/**
 * Convert a data URI to a Blob for FormData upload.
 */
function dataUriToBlob(dataUri: string): Blob {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URI');
  const mimeType = match[1] ?? 'image/png';
  const base64 = match[2] ?? '';
  const binary = Buffer.from(base64, 'base64');
  return new Blob([binary], { type: mimeType });
}

/**
 * Fetch an image from URL and return as Blob.
 */
async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return res.blob();
}

/**
 * Convert image input (data URI or URL) to a Blob.
 */
async function imageInputToBlob(input: string): Promise<Blob> {
  if (input.startsWith('data:')) {
    return dataUriToBlob(input);
  }
  return urlToBlob(input);
}

async function downloadBytes(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  log('Downloading from:', url.slice(0, 100) + '...');
  const start = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAI image download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type');
  log(`Downloaded ${ab.byteLength} bytes in ${Date.now() - start}ms, type: ${ct}`);
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

const openaiCapabilities: ProviderCapabilities = {
  maxInputImages: 2, // image + optional mask
  supportsVideoInterpolation: false, // OpenAI doesn't support video
  // videoDurationRange omitted - no video support
  supportsImageEditing: true,
};

/**
 * Generate images using OpenAI's edit endpoint (for image editing with input images).
 */
async function generateWithEdit(
  req: GenerateRequest,
  apiKey: string,
  model: string
): Promise<
  Array<{
    kind: 'image';
    provider: 'openai';
    model?: string;
    index: number;
    url?: string;
    bytes: Uint8Array;
    mimeType?: string;
  }>
> {
  log('Using edit endpoint for image editing');
  const startTime = Date.now();

  // Build FormData for multipart upload
  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', req.prompt);
  formData.append('n', String(req.n));

  // Add size if specified
  const size = mapAspectRatioToSize(req.aspectRatio, model);
  if (size) formData.append('size', size);

  // Add the input image
  const imageInput = req.inputImages?.[0];
  if (!imageInput) throw new Error('No input image provided for editing');

  const imageBlob = await imageInputToBlob(imageInput);
  formData.append('image', imageBlob, 'image.png');
  log('Added input image to form data');

  // Add mask if provided (second input image)
  const maskInput = req.inputImages?.[1];
  if (maskInput) {
    const maskBlob = await imageInputToBlob(maskInput);
    formData.append('mask', maskBlob, 'mask.png');
    log('Added mask image to form data');
  }

  log('Calling OpenAI images/edits...');
  const res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      // Don't set content-type - FormData sets it with boundary
    },
    body: formData,
  });

  log(`API responded in ${Date.now() - startTime}ms, status: ${res.status}`);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    log('Error response:', txt.slice(0, 1000));
    throw new Error(`OpenAI edit failed (${res.status}): ${txt.slice(0, 500)}`);
  }

  const json = (await res.json()) as OpenAIImagesResponse;
  log('Response data count:', json.data?.length);

  if (!json.data?.length) throw new Error('OpenAI edit returned no images');

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
    log(`Processing image ${i}...`);
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
      log(`Image ${i} is base64 encoded, ${img.b64_json.length} chars`);
      const bytes = Uint8Array.from(Buffer.from(img.b64_json, 'base64'));
      results.push({ kind: 'image', provider: 'openai', model, index: i, bytes });
      continue;
    }
    throw new Error('OpenAI returned image without url or b64_json');
  }

  log(`Successfully edited ${results.length} image(s)`);
  return results;
}

export const openaiProvider: Provider = {
  id: 'openai',
  displayName: 'OpenAI (GPT Image / DALL-E)',
  supports: ['image'],
  capabilities: openaiCapabilities,
  isAvailable(env) {
    return Boolean(getOpenAIApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getOpenAIApiKey(env);
    if (!apiKey) throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY.');

    verboseMode = req.verbose;
    log('Provider initialized, kind:', req.kind);

    // Default to gpt-image-1 (stable), can be overridden to dall-e-3 or dall-e-2
    const model = req.model ?? 'gpt-image-1';
    log('Using model:', model, 'hasInputImages:', !!req.inputImages?.length);

    // Use edit endpoint if input images provided
    if (req.inputImages?.length) {
      return generateWithEdit(req, apiKey, model);
    }

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
    log('Request body:', JSON.stringify(body));

    log('Calling OpenAI images/generations...');
    const startTime = Date.now();

    const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
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
      throw new Error(`OpenAI generations failed (${res.status}): ${txt.slice(0, 500)}`);
    }

    const json = (await res.json()) as OpenAIImagesResponse;
    log('Response data count:', json.data?.length);

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
      log(`Processing image ${i}...`);
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
        log(`Image ${i} is base64 encoded, ${img.b64_json.length} chars`);
        const bytes = Uint8Array.from(Buffer.from(img.b64_json, 'base64'));
        results.push({ kind: 'image', provider: 'openai', model, index: i, bytes });
        continue;
      }
      throw new Error('OpenAI returned image without url or b64_json');
    }

    log(`Successfully generated ${results.length} image(s)`);
    return results;
  },
};
