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

// Model aliases for Nano Banana (Gemini native image generation)
const MODEL_ALIASES: Record<string, string> = {
  'nano-banana': 'gemini-2.5-flash-image',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  // Veo (video)
  'veo3.1': 'veo-3.1-generate-preview',
  'veo-3.1': 'veo-3.1-generate-preview',
};

// Gemini native image models (use generateContent with IMAGE modality)
const GEMINI_IMAGE_MODELS = [
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash',
];

function resolveModel(model: string | undefined): string {
  if (!model) return 'gemini-3-pro-image-preview'; // Default: Nano Banana Pro
  return MODEL_ALIASES[model] ?? model;
}

function isGeminiImageModel(model: string): boolean {
  return GEMINI_IMAGE_MODELS.some((m) => model.startsWith(m));
}

async function downloadBytes(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google video download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export const googleProvider: Provider = {
  id: 'google',
  displayName: 'Google (Nano Banana / Imagen / Veo)',
  supports: ['image', 'video'],
  isAvailable(env) {
    return Boolean(getGeminiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getGeminiApiKey(env);
    if (!apiKey) throw new Error('Missing Google API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).');

    const ai = new GoogleGenAI({ apiKey });

    if (req.kind === 'video') {
      const model = MODEL_ALIASES[req.model ?? ''] ?? req.model ?? 'veo-3.1-generate-preview';
      return generateWithVeo(ai, model, req);
    }

    const model = resolveModel(req.model);

    // Use Gemini native image generation for Nano Banana models
    if (isGeminiImageModel(model)) {
      return generateWithGemini(ai, model, req);
    }

    // Use Imagen API for imagen-* models
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
  // The SDK returns a long-running operation. Poll until done.
  let op = await ai.models.generateVideos({
    model,
    source: {
      prompt: req.prompt,
    },
    config: {
      numberOfVideos: req.n,
      ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
    },
  });

  const maxAttempts = 60; // ~10 minutes at 10s
  const intervalMs = 10000;

  for (let attempt = 0; attempt < maxAttempts && !op.done; attempt++) {
    await sleep(intervalMs);
    op = await ai.operations.getVideosOperation({ operation: op });
  }

  if (!op.done) throw new Error('Google Veo video generation timed out');

  const videos = op.response?.generatedVideos;
  if (!videos?.length) throw new Error('Google Veo returned no videos');

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
    const uri = (v as any)?.video?.uri as string | undefined;
    if (!uri) continue;

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
  return out;
}

// Generate images using Gemini native image generation (Nano Banana)
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
    const res = await ai.models.generateContent({
      model,
      contents: req.prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(req.aspectRatio
          ? {
              imageConfig: {
                aspectRatio: req.aspectRatio,
              },
            }
          : {}),
      },
    });

    const parts = res.candidates?.[0]?.content?.parts;
    if (!parts) continue;

    for (const part of parts) {
      if (part.inlineData?.data) {
        const rawBytes = part.inlineData.data;
        const bytes =
          typeof rawBytes === 'string'
            ? Uint8Array.from(Buffer.from(rawBytes, 'base64'))
            : rawBytes;
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
  }

  if (!out.length) throw new Error('Gemini returned no images');
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

  const imgs = res.generatedImages;
  if (!imgs?.length) throw new Error('Google generateImages returned no images');

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
    if (!rawBytes) continue;
    // SDK returns base64 string, decode to binary
    const bytes =
      typeof rawBytes === 'string' ? Uint8Array.from(Buffer.from(rawBytes, 'base64')) : rawBytes;
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
  return out;
}
