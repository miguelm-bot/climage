import { GoogleGenAI } from "@google/genai";

import type { GenerateRequest, Provider, ProviderEnv } from "../core/types.js";

function getGeminiApiKey(env: ProviderEnv): string | undefined {
  // Standard names + common aliases
  return env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY;
}

function mimeForFormat(format: GenerateRequest["format"]): string {
  switch (format) {
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}

export const googleProvider: Provider = {
  id: "google",
  displayName: "Google (Gemini / Imagen)",
  isAvailable(env) {
    return Boolean(getGeminiApiKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const apiKey = getGeminiApiKey(env);
    if (!apiKey)
      throw new Error(
        "Missing Google API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).",
      );

    const ai = new GoogleGenAI({ apiKey });

    // Default to Imagen for pure text-to-image.
    const model = req.model ?? "imagen-4.0-generate-001";

    const res = await ai.models.generateImages({
      model,
      prompt: req.prompt,
      config: {
        numberOfImages: req.n,
        outputMimeType: mimeForFormat(req.format),
        // Note: aspect ratio / size varies by model. Add later.
      },
    });

    const imgs = res.generatedImages;
    if (!imgs?.length)
      throw new Error("Google generateImages returned no images");

    const out = [] as Array<{
      provider: "google";
      model?: string;
      index: number;
      bytes: Uint8Array;
      mimeType?: string;
    }>;

    for (let i = 0; i < Math.min(imgs.length, req.n); i++) {
      const img = imgs[i];
      const rawBytes = img?.image?.imageBytes;
      if (!rawBytes) continue;
      // SDK returns base64 string, decode to binary
      const bytes =
        typeof rawBytes === "string"
          ? Uint8Array.from(Buffer.from(rawBytes, "base64"))
          : rawBytes;
      out.push({
        provider: "google",
        model,
        index: i,
        bytes,
        mimeType: mimeForFormat(req.format),
      });
    }

    if (!out.length)
      throw new Error("Google returned images but no bytes were present");
    return out;
  },
};
