import fs from 'node:fs/promises';
import path from 'node:path';

import type { GeneratedImage, GenerateRequest } from './types.js';

export function extensionForFormat(format: GenerateRequest['format']): string {
  switch (format) {
    case 'jpg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
  }
}

export function resolveOutDir(outDir: string): string {
  return path.isAbsolute(outDir) ? outDir : path.resolve(process.cwd(), outDir);
}

export function makeOutputPath(req: GenerateRequest, index: number): string {
  const ext = extensionForFormat(req.format);
  if (req.out) return path.resolve(process.cwd(), req.out);

  const base = `${req.nameBase}-${req.timestamp}`;
  const suffix = req.n > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
  const filename = `${base}${suffix}.${ext}`;
  return path.join(req.outDir, filename);
}

export async function writeImageFile(filePath: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
}

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function toJsonResult(images: GeneratedImage[]) {
  return {
    images: images.map((img) => ({
      provider: img.provider,
      model: img.model,
      index: img.index,
      filePath: img.filePath,
      url: img.url,
      bytes: img.bytes.byteLength,
      mimeType: img.mimeType,
    })),
  };
}
