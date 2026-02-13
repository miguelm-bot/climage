import fs from 'node:fs/promises';
import path from 'node:path';

import type { GenerateRequest, GeneratedMedia } from './types.js';

/** Map file extensions to MIME types for images. */
const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.heif': 'image/heif',
  '.heic': 'image/heic',
};

export function extensionForFormat(format: GenerateRequest['format']): string {
  switch (format) {
    case 'jpg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'mp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    case 'gif':
      return 'gif';
  }
}

export function resolveOutDir(outDir: string): string {
  return path.isAbsolute(outDir) ? outDir : path.resolve(process.cwd(), outDir);
}

function extensionFromMimeType(mimeType: string | undefined): string | undefined {
  if (!mimeType) return undefined;

  const t = mimeType.toLowerCase().split(';')[0]?.trim();
  if (!t) return undefined;

  // Images
  if (t === 'image/png') return 'png';
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/gif') return 'gif';
  if (t === 'image/avif') return 'avif';

  // Videos
  if (t === 'video/mp4') return 'mp4';
  if (t === 'video/webm') return 'webm';

  return undefined;
}

export function makeOutputPath(req: GenerateRequest, index: number, mimeType?: string): string {
  // If user explicitly requested an output path, respect it verbatim.
  if (req.out) return path.resolve(process.cwd(), req.out);

  // Some providers return a different MIME type than requested (e.g. JPEG bytes even if
  // --format png was requested). Prefer the actual MIME type for file extension to avoid
  // misleading file names.
  const ext = extensionFromMimeType(mimeType) ?? extensionForFormat(req.format);

  const base = `${req.nameBase}-${req.timestamp}`;
  const suffix = req.n > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
  const filename = `${base}${suffix}.${ext}`;
  return path.join(req.outDir, filename);
}

export async function writeMediaFile(filePath: string, bytes: Uint8Array): Promise<void> {
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

export function toJsonResult(items: GeneratedMedia[]) {
  const images = items
    .filter((i) => i.kind === 'image')
    .map((img) => ({
      provider: img.provider,
      model: img.model,
      index: img.index,
      filePath: img.filePath,
      url: img.url,
      bytes: img.bytes.byteLength,
      mimeType: img.mimeType,
    }));

  const videos = items
    .filter((i) => i.kind === 'video')
    .map((vid) => ({
      provider: vid.provider,
      model: vid.model,
      index: vid.index,
      filePath: vid.filePath,
      url: vid.url,
      bytes: vid.bytes.byteLength,
      mimeType: vid.mimeType,
    }));

  return {
    ...(images.length ? { images } : {}),
    ...(videos.length ? { videos } : {}),
  };
}

/**
 * Resolve an image input path or URL to a usable format.
 * - URLs (http/https) are returned as-is
 * - Data URIs are returned as-is
 * - Local file paths are read and converted to base64 data URIs
 *
 * @param pathOrUrl - A file path or URL to an image
 * @returns The resolved image as a URL or data URI
 */
export async function resolveImageInput(pathOrUrl: string): Promise<string> {
  // Already a URL (http/https)
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  // Already a data URI
  if (pathOrUrl.startsWith('data:')) {
    return pathOrUrl;
  }

  // Local file path - resolve and read
  const resolvedPath = path.isAbsolute(pathOrUrl)
    ? pathOrUrl
    : path.resolve(process.cwd(), pathOrUrl);

  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext];

  if (!mimeType) {
    throw new Error(
      `Unsupported image format: ${ext}. Supported: ${Object.keys(IMAGE_MIME_TYPES).join(', ')}`
    );
  }

  const fileBuffer = await fs.readFile(resolvedPath);
  const base64 = fileBuffer.toString('base64');

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Resolve multiple image inputs in parallel.
 *
 * @param pathsOrUrls - Array of file paths or URLs
 * @returns Array of resolved images as URLs or data URIs
 */
export async function resolveImageInputs(pathsOrUrls: string[]): Promise<string[]> {
  return Promise.all(pathsOrUrls.map(resolveImageInput));
}
