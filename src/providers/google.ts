import { GoogleGenAI } from '@google/genai';

import type { GenerateRequest, Provider, ProviderEnv } from '../core/types.js';

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
  // Veo (video)
  veo2: 'veo-2.0-generate-001',
  'veo-2': 'veo-2.0-generate-001',
};

// Gemini native image models (use generateContent with IMAGE modality)
const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];

function resolveModel(model: string | undefined): string {
  if (!model) return 'gemini-2.5-flash-image'; // Default: Nano Banana (fast)
  return MODEL_ALIASES[model] ?? model;
}

function isGeminiImageModel(model: string): boolean {
  return GEMINI_IMAGE_MODELS.some((m) => model.startsWith(m));
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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export const googleProvider: Provider = {
  id: 'google',
  displayName: 'Google (Gemini / Imagen / Veo)',
  supports: ['image', 'video'],
  isAvailable(env) {
    return Boolean(getGeminiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getGeminiApiKey(env);
    if (!apiKey) throw new Error('Missing Google API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).');

    verboseMode = req.verbose;
    log('Provider initialized, kind:', req.kind);

    const ai = new GoogleGenAI({ apiKey });

    if (req.kind === 'video') {
      const model = MODEL_ALIASES[req.model ?? ''] ?? req.model ?? 'veo-2.0-generate-001';
      log('Using video model:', model);
      log(
        'WARNING: Google Veo video generation requires Vertex AI and is not available via AI Studio API'
      );
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

  // The SDK returns a long-running operation. Poll until done.
  log('Calling ai.models.generateVideos...');
  let op = await ai.models.generateVideos({
    model,
    prompt: req.prompt,
    config: {
      numberOfVideos: req.n,
      ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
    },
  });

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
    const uri = (v as any)?.video?.uri as string | undefined;
    if (!uri) {
      log(`Video ${i} has no URI, skipping`);
      continue;
    }

    // SDK may return gs:// URIs on Vertex; we only support downloadable http(s) URLs.
    if (uri.startsWith('gs://')) {
      throw new Error(
        `Google Veo returned a gs:// URI (${uri}). Configure outputGcsUri / Vertex flow to fetch from GCS.`
      );
    }

    const { bytes, mimeType } = await downloadBytes(uri);
    out.push({
      kind: 'video',
      provider: 'google',
      model,
      index: i,
      url: uri,
      bytes,
      ...(mimeType !== undefined ? { mimeType } : {}),
    });
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
  log('Starting Gemini image generation, model:', model, 'n:', req.n);
  const startTime = Date.now();

  const out: Array<{
    kind: 'image';
    provider: 'google';
    model?: string;
    index: number;
    bytes: Uint8Array;
    mimeType?: string;
  }> = [];

  // Gemini native image generation produces one image per call
  // Generate sequentially for n > 1
  for (let i = 0; i < req.n; i++) {
    log(`Generating image ${i + 1}/${req.n}...`);
    const callStart = Date.now();

    try {
      const res = await ai.models.generateContent({
        model,
        contents: req.prompt,
        config: {
          responseModalities: ['IMAGE'],
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
