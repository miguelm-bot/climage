import { GoogleGenAI } from '@google/genai';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  GenerateRequest,
  Provider,
  ProviderCapabilities,
  ProviderEnv,
} from '../core/types.js';

function getGeminiApiKey(env: ProviderEnv): string | undefined {
  // Standard names + common aliases
  return env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY;
}

function mimeForImageFormat(format: GenerateRequest['format']): string {
  switch (format) {
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return 'image/png';
  }
}

let verboseMode = false;

function log(...args: unknown[]) {
  if (verboseMode) console.error('[google]', ...args);
}

// Model aliases for Nano Banana (Gemini native image generation)
const MODEL_ALIASES: Record<string, string> = {
  'nano-banana': 'gemini-2.5-flash-image',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  // Veo (video)
  veo2: 'veo-2.0-generate-001',
  'veo-2': 'veo-2.0-generate-001',
  veo3: 'veo-3.0-generate-001',
  'veo-3': 'veo-3.0-generate-001',
  'veo-3.1': 'veo-3.1-generate-preview',
  veo31: 'veo-3.1-generate-preview',
};

// Veo 3.1 models that support advanced features (interpolation, reference images)
const VEO_31_MODELS = ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'];

/**
 * Check if model supports Veo 3.1 features (interpolation, reference images).
 */
function isVeo31Model(model: string): boolean {
  return VEO_31_MODELS.some((m) => model.includes(m) || model.includes('veo-3.1'));
}

/**
 * Parse a data URI and extract base64 data and mime type.
 */
function parseDataUri(dataUri: string): { data: string; mimeType: string } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] ?? 'image/png', data: match[2] ?? '' };
}

/**
 * Convert image input (URL or data URI) to format suitable for Google API.
 */
function imageToGoogleFormat(
  imageInput: string
): { inlineData: { data: string; mimeType: string } } | { fileUri: string } {
  // Data URI - extract base64
  if (imageInput.startsWith('data:')) {
    const parsed = parseDataUri(imageInput);
    if (parsed) {
      return { inlineData: { data: parsed.data, mimeType: parsed.mimeType } };
    }
  }
  // URL - use as file URI
  return { fileUri: imageInput };
}

// Veo video endpoints expect Image = { imageBytes, mimeType } or { gcsUri }.
// This differs from Gemini generateContent image parts.
function imageToVeoFormat(
  imageInput: string
): { imageBytes: string; mimeType: string } | { gcsUri: string } {
  if (imageInput.startsWith('data:')) {
    const parsed = parseDataUri(imageInput);
    if (!parsed?.data) {
      throw new Error('Failed to parse data URI for Veo image input');
    }
    return { imageBytes: parsed.data, mimeType: parsed.mimeType };
  }
  if (imageInput.startsWith('gs://')) {
    return { gcsUri: imageInput };
  }
  throw new Error(
    `Veo image inputs must be data: URIs or gs:// URIs (got ${imageInput.slice(0, 24)}...)`
  );
}

function resolveModel(model: string | undefined): string {
  if (!model) return 'gemini-2.5-flash-image'; // Default: Nano Banana (fast)
  return MODEL_ALIASES[model] ?? model;
}

// Gemini models use generateContent; Imagen models use generateImages.
function isGeminiImageModel(model: string): boolean {
  return model.startsWith('gemini-');
}

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  log('Downloading from:', url.slice(0, 100) + '...');
  const start = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google video download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  log(`Downloaded ${ab.byteLength} bytes in ${Date.now() - start}ms, type: ${ct}`);
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

async function downloadGeneratedVideo(
  ai: GoogleGenAI,
  generatedVideo: Record<string, any>
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  const video = generatedVideo?.video as
    | { uri?: string; videoBytes?: string; mimeType?: string }
    | undefined;

  // Some responses include inline bytes directly.
  if (video?.videoBytes) {
    return {
      bytes: new Uint8Array(Buffer.from(video.videoBytes, 'base64')),
      mimeType: video.mimeType,
    };
  }

  // Fast path for directly downloadable URLs.
  if (video?.uri && !video.uri.startsWith('gs://')) {
    try {
      return await downloadBytes(video.uri);
    } catch (err) {
      log('Direct video download failed, falling back to ai.files.download:', String(err));
    }
  }

  // Fallback path that lets the SDK handle auth/download mechanics.
  const tempDir = await mkdtemp(join(tmpdir(), 'climage-veo-'));
  const downloadPath = join(tempDir, 'video.mp4');
  try {
    await ai.files.download({ file: generatedVideo as any, downloadPath });
    const buf = await readFile(downloadPath);
    return { bytes: new Uint8Array(buf), mimeType: video?.mimeType ?? 'video/mp4' };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

const googleCapabilities: ProviderCapabilities = {
  maxInputImages: 3, // Veo 3.1 supports up to 3 reference images
  // Imagen / Veo aspect ratio is expressed as "w:h" (e.g. "16:9").
  // Public docs/examples focus on the common set below.
  supportedAspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
  supportsVideoInterpolation: true, // Veo 3.1 supports first + last frame
  videoDurationRange: [4, 8], // Veo 3.1 supports 4, 6, 8 seconds
  supportsImageEditing: true,
};

export const googleProvider: Provider = {
  id: 'google',
  displayName: 'Google (Gemini / Imagen / Veo)',
  supports: ['image', 'video'],
  capabilities: googleCapabilities,
  isAvailable(env) {
    return Boolean(getGeminiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getGeminiApiKey(env);
    if (!apiKey) throw new Error('Missing Google API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).');

    verboseMode = req.verbose;
    log('Provider initialized, kind:', req.kind);
    log(
      'Input images:',
      req.inputImages?.length ?? 0,
      'startFrame:',
      !!req.startFrame,
      'endFrame:',
      !!req.endFrame
    );

    const ai = new GoogleGenAI({ apiKey });

    if (req.kind === 'video') {
      // Default to Veo 3.1 if using advanced features, otherwise Veo 2
      const hasAdvancedFeatures = req.startFrame || req.endFrame || req.inputImages?.length;
      const defaultModel = hasAdvancedFeatures
        ? 'veo-3.1-generate-preview'
        : 'veo-2.0-generate-001';
      const model = MODEL_ALIASES[req.model ?? ''] ?? req.model ?? defaultModel;
      log('Using video model:', model);

      // Warn if using advanced features with non-Veo 3.1 model
      if (hasAdvancedFeatures && !isVeo31Model(model)) {
        log(
          'WARNING: Advanced video features (startFrame, endFrame, referenceImages) require Veo 3.1'
        );
      }

      return generateWithVeo(ai, model, req);
    }

    const model = resolveModel(req.model);
    log('Resolved model:', model);

    // Use Gemini native image generation for Gemini models
    if (isGeminiImageModel(model)) {
      log('Using Gemini native image generation');
      return generateWithGemini(ai, model, req);
    }

    // Use Imagen API for imagen-* models
    log('Using Imagen API');
    return generateWithImagen(ai, model, req);
  },
};

// Generate videos using Veo via Gemini API.
async function generateWithVeo(
  ai: GoogleGenAI,
  model: string,
  req: GenerateRequest
): Promise<
  Array<{
    kind: 'video';
    provider: 'google';
    model?: string;
    index: number;
    url?: string;
    bytes: Uint8Array;
    mimeType?: string;
  }>
> {
  log('Starting Veo video generation, model:', model, 'n:', req.n);
  const startTime = Date.now();

  // Build config for generateVideos
  const config: Record<string, unknown> = {
    numberOfVideos: req.n,
    ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
    // Add duration if specified (Veo supports 4-8 seconds depending on model)
    ...(req.duration !== undefined ? { durationSeconds: req.duration } : {}),
  };

  // Build reference images array for Veo 3.1 (up to 3 images)
  if (req.inputImages?.length && isVeo31Model(model)) {
    const referenceImages = req.inputImages.slice(0, 3).map((img) => {
      const imageData = imageToVeoFormat(img);
      return {
        image: imageData,
        referenceType: 'ASSET' as const,
      };
    });
    (config as any).referenceImages = referenceImages;
    log('Added', referenceImages.length, 'reference images');
  }

  // Build generateVideos params
  const generateParams: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    config,
  };

  // Add image (first frame) for Veo 3.1 image-to-video
  const firstFrameImage =
    req.startFrame ?? (req.inputImages?.length === 1 ? req.inputImages[0] : undefined);
  if (firstFrameImage && isVeo31Model(model)) {
    const imageData = imageToVeoFormat(firstFrameImage);
    (generateParams as any).image = imageData;
    log('Added first frame image');
  }

  // Add lastFrame for Veo 3.1 interpolation
  if (req.endFrame && isVeo31Model(model)) {
    const lastFrameData = imageToVeoFormat(req.endFrame);
    (config as any).lastFrame = lastFrameData;
    log('Added last frame for interpolation');
  }

  // The SDK returns a long-running operation. Poll until done.
  log('Calling ai.models.generateVideos...');
  let op = await ai.models.generateVideos(generateParams as any);

  log('Initial operation state:', op.done ? 'done' : 'pending', 'name:', (op as any).name);

  const maxAttempts = 60; // ~10 minutes at 10s
  const intervalMs = 10000;

  for (let attempt = 0; attempt < maxAttempts && !op.done; attempt++) {
    log(`Poll attempt ${attempt + 1}/${maxAttempts}...`);
    await sleep(intervalMs);
    op = await ai.operations.getVideosOperation({ operation: op });
    log(`Poll result: done=${op.done}`);
  }

  log(`Operation completed in ${Date.now() - startTime}ms`);

  if (!op.done) {
    log('Timed out. Operation state:', JSON.stringify(op).slice(0, 500));
    throw new Error('Google Veo video generation timed out');
  }

  const videos = op.response?.generatedVideos;
  log('Generated videos count:', videos?.length);

  if (!videos?.length) {
    log('Full response:', JSON.stringify(op.response).slice(0, 1000));
    throw new Error('Google Veo returned no videos');
  }

  const out: Array<{
    kind: 'video';
    provider: 'google';
    model?: string;
    index: number;
    url?: string;
    bytes: Uint8Array;
    mimeType?: string;
  }> = [];

  for (let i = 0; i < Math.min(videos.length, req.n); i++) {
    const v = videos[i];
    log(`Processing video ${i}:`, JSON.stringify(v).slice(0, 300));
    if (!(v as any)?.video) {
      log(`Video ${i} has no video payload, skipping`);
      continue;
    }
    const uri = (v as any)?.video?.uri as string | undefined;
    const { bytes, mimeType } = await downloadGeneratedVideo(ai, v as any);
    const item: {
      kind: 'video';
      provider: 'google';
      model?: string;
      index: number;
      url?: string;
      bytes: Uint8Array;
      mimeType?: string;
    } = {
      kind: 'video',
      provider: 'google',
      model,
      index: i,
      bytes,
      ...(mimeType !== undefined ? { mimeType } : {}),
    };
    if (uri) item.url = uri;
    out.push(item);
  }

  if (!out.length) throw new Error('Google Veo returned videos but none were downloadable');
  log(`Successfully generated ${out.length} video(s)`);
  return out;
}

// Generate images using Gemini native image generation
async function generateWithGemini(
  ai: GoogleGenAI,
  model: string,
  req: GenerateRequest
): Promise<
  Array<{
    kind: 'image';
    provider: 'google';
    model?: string;
    index: number;
    bytes: Uint8Array;
    mimeType?: string;
  }>
> {
  const hasInputImage = req.inputImages?.length;
  log(
    'Starting Gemini image generation, model:',
    model,
    'n:',
    req.n,
    'hasInputImage:',
    !!hasInputImage
  );
  const startTime = Date.now();

  const out: Array<{
    kind: 'image';
    provider: 'google';
    model?: string;
    index: number;
    bytes: Uint8Array;
    mimeType?: string;
  }> = [];

  // Build contents - either text prompt or multimodal with image for editing
  const buildContents = () => {
    if (hasInputImage && req.inputImages?.[0]) {
      // Multimodal content: image + text prompt for editing
      const imageData = imageToGoogleFormat(req.inputImages[0]);
      return [{ ...imageData }, { text: req.prompt }] as const;
    }
    // Text-only prompt
    return req.prompt;
  };

  // Gemini native image generation produces one image per call
  // Generate sequentially for n > 1
  for (let i = 0; i < req.n; i++) {
    log(`Generating image ${i + 1}/${req.n}...`);
    const callStart = Date.now();

    try {
      const res = await ai.models.generateContent({
        model,
        contents: buildContents() as any,
        config: {
          responseModalities: ['IMAGE'],
          // Gemini native image generation (Nano Banana) supports aspect ratio via imageConfig.
          // Note: when editing from an input image, the model may still bias toward the input image's aspect.
          ...(req.aspectRatio ? { imageConfig: { aspectRatio: req.aspectRatio } } : {}),
        },
      });

      log(`API call ${i + 1} took ${Date.now() - callStart}ms`);

      const parts = res.candidates?.[0]?.content?.parts;
      log(`Response has ${parts?.length ?? 0} parts`);

      if (!parts) {
        log(
          `No parts in response for image ${i}. Full response:`,
          JSON.stringify(res).slice(0, 500)
        );
        continue;
      }

      for (const part of parts) {
        if (part.inlineData?.data) {
          const rawBytes = part.inlineData.data;
          const bytes =
            typeof rawBytes === 'string'
              ? Uint8Array.from(Buffer.from(rawBytes, 'base64'))
              : rawBytes;
          log(`Image ${i}: got ${bytes.byteLength} bytes, mimeType: ${part.inlineData.mimeType}`);
          out.push({
            kind: 'image',
            provider: 'google',
            model,
            index: i,
            bytes,
            mimeType: part.inlineData.mimeType ?? mimeForImageFormat(req.format),
          });
          break; // One image per call
        }
      }
    } catch (err) {
      log(`Error generating image ${i}:`, err);
      throw err;
    }
  }

  log(`Total generation time: ${Date.now() - startTime}ms`);

  if (!out.length) throw new Error('Gemini returned no images');
  log(`Successfully generated ${out.length} image(s)`);
  return out;
}

// Generate images using Imagen API
async function generateWithImagen(
  ai: GoogleGenAI,
  model: string,
  req: GenerateRequest
): Promise<
  Array<{
    kind: 'image';
    provider: 'google';
    model?: string;
    index: number;
    bytes: Uint8Array;
    mimeType?: string;
  }>
> {
  log('Starting Imagen generation, model:', model, 'n:', req.n);
  const startTime = Date.now();

  log('Calling ai.models.generateImages...');
  const res = await ai.models.generateImages({
    model,
    prompt: req.prompt,
    config: {
      numberOfImages: req.n,
      outputMimeType: mimeForImageFormat(req.format),
      // Imagen 4 supports aspectRatio
      ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
    },
  });

  log(`API call took ${Date.now() - startTime}ms`);

  const imgs = res.generatedImages;
  log('Generated images count:', imgs?.length);

  if (!imgs?.length) {
    log('Full response:', JSON.stringify(res).slice(0, 1000));
    throw new Error('Google generateImages returned no images');
  }

  const out: Array<{
    kind: 'image';
    provider: 'google';
    model?: string;
    index: number;
    bytes: Uint8Array;
    mimeType?: string;
  }> = [];

  for (let i = 0; i < Math.min(imgs.length, req.n); i++) {
    const img = imgs[i];
    const rawBytes = img?.image?.imageBytes;
    if (!rawBytes) {
      log(`Image ${i} has no bytes, skipping`);
      continue;
    }
    // SDK returns base64 string, decode to binary
    const bytes =
      typeof rawBytes === 'string' ? Uint8Array.from(Buffer.from(rawBytes, 'base64')) : rawBytes;
    log(`Image ${i}: got ${bytes.byteLength} bytes`);
    out.push({
      kind: 'image',
      provider: 'google',
      model,
      index: i,
      bytes,
      mimeType: mimeForImageFormat(req.format),
    });
  }

  if (!out.length) throw new Error('Google returned images but no bytes were present');
  log(`Successfully generated ${out.length} image(s)`);
  return out;
}
