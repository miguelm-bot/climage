import {
  experimental_generateVideo as sdkGenerateVideo,
  generateImage as sdkGenerateImage,
  createGateway,
} from 'ai';

import type {
  GenerateRequest,
  GeneratedMediaPartial,
  Provider,
  ProviderCapabilities,
  ProviderEnv,
} from '../core/types.js';

function getGatewayApiKey(env: ProviderEnv): string | undefined {
  return env.AI_GATEWAY_API_KEY;
}

let verboseMode = false;

function log(...args: unknown[]) {
  if (verboseMode) console.error('[vercel]', ...args);
}

function makeGateway(apiKey: string) {
  return createGateway({ apiKey });
}

/**
 * Convert a data URI to a Uint8Array.
 */
function dataUriToUint8Array(dataUri: string): Uint8Array {
  const commaIdx = dataUri.indexOf(',');
  const b64 = dataUri.slice(commaIdx + 1);
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

// Default models (cheapest / most accessible options)
const DEFAULT_VIDEO_MODEL = 'xai/grok-imagine-video';
const DEFAULT_IMAGE_MODEL = 'xai/grok-imagine-image';

async function generateVercelVideo(
  req: GenerateRequest,
  apiKey: string
): Promise<GeneratedMediaPartial[]> {
  const gw = makeGateway(apiKey);
  const model = req.model ?? DEFAULT_VIDEO_MODEL;
  log('Starting video generation, model:', model);

  // Build prompt: string or { image, text } for image-to-video
  const imageInput = req.startFrame ?? req.inputImages?.[0];
  let prompt: string | { image: string | Uint8Array; text?: string };

  if (imageInput) {
    // Image-to-video
    const imageData = imageInput.startsWith('data:') ? dataUriToUint8Array(imageInput) : imageInput;
    prompt = { image: imageData, text: req.prompt };
    log('Using image-to-video mode');
  } else {
    prompt = req.prompt;
  }

  log('Calling experimental_generateVideo...');
  const startTime = Date.now();

  const result = await sdkGenerateVideo({
    model: gw.video(model),
    prompt,
    ...(req.aspectRatio ? { aspectRatio: req.aspectRatio as `${number}:${number}` } : {}),
    ...(req.duration !== undefined ? { duration: req.duration } : {}),
    n: req.n,
  });

  log(`Video generation completed in ${Date.now() - startTime}ms`);

  const videos = result.videos ?? (result.video ? [result.video] : []);
  log(`Got ${videos.length} video(s)`);

  if (!videos.length) {
    throw new Error('Vercel AI Gateway returned no videos');
  }

  return videos.map((v, i) => ({
    kind: 'video' as const,
    provider: 'vercel' as const,
    model,
    index: i,
    bytes: v.uint8Array,
    mimeType: 'video/mp4',
  }));
}

async function generateVercelImage(
  req: GenerateRequest,
  apiKey: string
): Promise<GeneratedMediaPartial[]> {
  const gw = makeGateway(apiKey);
  const model = req.model ?? DEFAULT_IMAGE_MODEL;
  log('Starting image generation, model:', model);

  // Build prompt: string or { images, text } for image editing
  const hasInputImages = req.inputImages && req.inputImages.length > 0;
  let prompt: string | { images: Uint8Array[]; text: string };

  if (hasInputImages) {
    const images = req.inputImages!.map((img) =>
      img.startsWith('data:') ? dataUriToUint8Array(img) : Uint8Array.from(Buffer.from(img))
    );
    prompt = { images, text: req.prompt };
    log('Using image editing mode with', images.length, 'input image(s)');
  } else {
    prompt = req.prompt;
  }

  log('Calling generateImage...');
  const startTime = Date.now();

  const result = await sdkGenerateImage({
    model: gw.image(model),
    prompt,
    ...(req.aspectRatio ? { aspectRatio: req.aspectRatio as `${number}:${number}` } : {}),
    n: req.n,
  });

  log(`Image generation completed in ${Date.now() - startTime}ms`);

  const images = result.images ?? (result.image ? [result.image] : []);
  log(`Got ${images.length} image(s)`);

  if (!images.length) {
    throw new Error('Vercel AI Gateway returned no images');
  }

  return images.map((img, i) => ({
    kind: 'image' as const,
    provider: 'vercel' as const,
    model,
    index: i,
    bytes: img.uint8Array,
    mimeType: 'image/png',
  }));
}

const vercelCapabilities: ProviderCapabilities = {
  maxInputImages: 1,
  supportsCustomAspectRatio: true,
  supportsVideoInterpolation: false,
  videoDurationRange: [1, 15],
  supportsImageEditing: true,
};

export const vercelProvider: Provider = {
  id: 'vercel',
  displayName: 'Vercel AI Gateway',
  supports: ['video', 'image'],
  capabilities: vercelCapabilities,
  isAvailable(env) {
    return Boolean(getGatewayApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getGatewayApiKey(env);
    if (!apiKey) throw new Error('Missing AI Gateway API key. Set AI_GATEWAY_API_KEY.');

    verboseMode = req.verbose;
    log('Provider initialized, kind:', req.kind);

    if (req.kind === 'video') return generateVercelVideo(req, apiKey);
    return generateVercelImage(req, apiKey);
  },
};
