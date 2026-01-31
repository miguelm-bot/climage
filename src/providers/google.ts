import { GoogleGenAI } from '@google/genai';

import type { GenerateRequest, Provider, ProviderEnv } from '../core/types.js';

function getGeminiApiKey(env: ProviderEnv): string | undefined {
  // Standard names + common aliases
  return env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY;
}

function mimeForFormat(format: GenerateRequest['format']): string {
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

export const googleProvider: Provider = {
  id: 'google',
  displayName: 'Google (Nano Banana / Imagen)',
  isAvailable(env) {
    return Boolean(getGeminiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getGeminiApiKey(env);
    if (!apiKey) throw new Error('Missing Google API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).');

    const ai = new GoogleGenAI({ apiKey });
    const model = resolveModel(req.model);

    // Use Gemini native image generation for Nano Banana models
    if (isGeminiImageModel(model)) {
      return generateWithGemini(ai, model, req);
    }

    // Use Imagen API for imagen-* models
    return generateWithImagen(ai, model, req);
  },
};

// Generate images using Gemini native image generation (Nano Banana)
async function generateWithGemini(
  ai: GoogleGenAI,
  model: string,
  req: GenerateRequest
): Promise<
  Array<{
    provider: 'google';
    model?: string;
    index: number;
    bytes: Uint8Array;
    mimeType?: string;
  }>
> {
  const out: Array<{
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
          provider: 'google',
          model,
          index: i,
          bytes,
          mimeType: part.inlineData.mimeType ?? mimeForFormat(req.format),
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
      outputMimeType: mimeForFormat(req.format),
      // Imagen 4 supports aspectRatio
      ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
    },
  });

  const imgs = res.generatedImages;
  if (!imgs?.length) throw new Error('Google generateImages returned no images');

  const out: Array<{
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
      provider: 'google',
      model,
      index: i,
      bytes,
      mimeType: mimeForFormat(req.format),
    });
  }

  if (!out.length) throw new Error('Google returned images but no bytes were present');
  return out;
}
