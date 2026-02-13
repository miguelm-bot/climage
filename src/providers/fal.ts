import { fal } from '@fal-ai/client';

import type {
  GenerateRequest,
  Provider,
  ProviderCapabilities,
  ProviderEnv,
} from '../core/types.js';

function getFalKey(env: ProviderEnv): string | undefined {
  // community is split; support both
  return env.FAL_API_KEY || env.FAL_KEY;
}

type FalMedia = {
  url: string;
  content_type?: string;
};

type FalResult = {
  images?: FalMedia[];
  image?: FalMedia;
  videos?: FalMedia[];
  video?: FalMedia;
};

function log(verbose: boolean, ...args: unknown[]) {
  if (verbose) console.error('[fal]', ...args);
}

async function downloadBytes(
  url: string,
  verbose: boolean
): Promise<{ bytes: Uint8Array; mimeType: string | undefined }> {
  log(verbose, 'Downloading from:', url.slice(0, 100) + '...');
  const start = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || undefined;
  log(verbose, `Downloaded ${ab.byteLength} bytes in ${Date.now() - start}ms, type: ${ct}`);
  return { bytes: new Uint8Array(ab), mimeType: ct };
}

function pickMany(result: FalResult, kind: 'image' | 'video'): FalMedia[] {
  if (kind === 'image') {
    if (Array.isArray(result.images) && result.images.length) return result.images;
    if (result.image?.url) return [result.image];
    return [];
  }

  if (Array.isArray(result.videos) && result.videos.length) return result.videos;
  if (result.video?.url) return [result.video];
  return [];
}

// Default models per kind and input type
const DEFAULT_IMAGE_MODEL = 'fal-ai/flux/dev';
const DEFAULT_IMAGE_TO_IMAGE_MODEL = 'fal-ai/flux/dev/image-to-image';
const DEFAULT_VIDEO_MODEL = 'fal-ai/ltxv-2/text-to-video/fast'; // LTX Video 2.0 Fast - very quick
const DEFAULT_IMAGE_TO_VIDEO_MODEL = 'fal-ai/vidu/q2/image-to-video'; // Vidu Q2 for image-to-video
const KLING_V3_PRO_IMAGE_TO_VIDEO_MODEL = 'fal-ai/kling-video/v3/pro/image-to-video';
const DEFAULT_START_END_VIDEO_MODEL = 'fal-ai/vidu/start-end-to-video'; // Vidu for start-end interpolation
const DEFAULT_REFERENCE_VIDEO_MODEL = 'fal-ai/vidu/q2/reference-to-video'; // Vidu Q2 for reference images

function isKlingV3Model(model: string): boolean {
  return model === KLING_V3_PRO_IMAGE_TO_VIDEO_MODEL || model.startsWith('fal-ai/kling-video/v3/');
}

function isViduModel(model: string): boolean {
  return model.includes('/vidu/');
}

/**
 * Determine the best model based on request inputs.
 */
function selectVideoModel(req: GenerateRequest): string {
  // User specified model takes precedence
  if (req.model) return req.model;

  // Start + End frame → interpolation model
  if (req.startFrame && req.endFrame) {
    return DEFAULT_START_END_VIDEO_MODEL;
  }

  // Reference images (inputImages without startFrame) → reference-to-video
  if (req.inputImages?.length && !req.startFrame) {
    return DEFAULT_REFERENCE_VIDEO_MODEL;
  }

  // Start frame only → image-to-video
  if (req.startFrame || req.inputImages?.length) {
    return DEFAULT_IMAGE_TO_VIDEO_MODEL;
  }

  // No images → text-to-video
  return DEFAULT_VIDEO_MODEL;
}

/**
 * Determine the best image model based on request inputs.
 */
function selectImageModel(req: GenerateRequest): string {
  if (req.model) return req.model;
  if (req.inputImages?.length) return DEFAULT_IMAGE_TO_IMAGE_MODEL;
  return DEFAULT_IMAGE_MODEL;
}

/**
 * Map aspect ratio string to fal enum values.
 */
function mapAspectRatio(aspectRatio?: string, model?: string): string | undefined {
  if (!aspectRatio) return undefined;
  const ar = aspectRatio.trim();
  if (model && isKlingV3Model(model)) {
    // Kling expects literal ratios like 16:9, 9:16, 1:1
    return ar;
  }
  if (ar === '1:1') return 'square';
  if (ar === '4:3') return 'landscape_4_3';
  if (ar === '16:9') return 'landscape_16_9';
  if (ar === '3:4') return 'portrait_4_3';
  if (ar === '9:16') return 'portrait_16_9';
  return ar; // Pass through if not mapped
}

/**
 * Build input for video generation based on request parameters.
 */
function buildVideoInput(req: GenerateRequest, model: string): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: req.prompt,
  };

  // Start + End frame interpolation (Vidu start-end-to-video)
  if (req.startFrame && req.endFrame) {
    input.start_image_url = req.startFrame;
    input.end_image_url = req.endFrame;
    const ar = mapAspectRatio(req.aspectRatio, model);
    if (ar) input.aspect_ratio = ar;
    if (req.duration) input.duration = String(req.duration);
    return input;
  }

  // Reference images (Vidu reference-to-video)
  if (req.inputImages?.length && !req.startFrame) {
    if (isKlingV3Model(model)) {
      // Kling v3 image-to-video models require a start image.
      input.start_image_url = req.inputImages[0];
      const ar = mapAspectRatio(req.aspectRatio, model);
      if (ar) input.aspect_ratio = ar;
      if (req.duration) input.duration = String(req.duration);
      return input;
    }

    input.reference_image_urls = req.inputImages.slice(0, 7); // Max 7 reference images
    const ar = mapAspectRatio(req.aspectRatio, model);
    if (ar) input.aspect_ratio = ar;
    if (req.duration) input.duration = String(req.duration); // Vidu uses string enum
    return input;
  }

  // Single image → image-to-video
  const imageUrl = req.startFrame ?? req.inputImages?.[0];
  if (imageUrl) {
    if (isKlingV3Model(model)) {
      input.start_image_url = imageUrl;
      const ar = mapAspectRatio(req.aspectRatio, model);
      if (ar) input.aspect_ratio = ar;
    } else {
      input.image_url = imageUrl;
    }
    if (req.duration) input.duration = String(req.duration);
    return input;
  }

  if (isKlingV3Model(model)) {
    throw new Error(
      `Model ${model} requires --start-frame (or --input) because it is image-to-video only`
    );
  }

  // Text-to-video
  const imageSize = mapAspectRatio(req.aspectRatio, model);
  if (imageSize) input.image_size = imageSize;
  if (req.n) input.num_videos = req.n;

  return input;
}

/**
 * Build input for image generation based on request parameters.
 */
function buildImageInput(req: GenerateRequest): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: req.prompt,
  };

  const imageSize = mapAspectRatio(req.aspectRatio);
  if (imageSize) input.image_size = imageSize;
  if (req.n) input.num_images = req.n;

  // Image-to-image: add input image
  if (req.inputImages?.[0]) {
    input.image_url = req.inputImages[0];
    // Common i2i parameters
    input.strength = 0.75; // Default strength for image-to-image
  }

  return input;
}

const falCapabilities: ProviderCapabilities = {
  maxInputImages: 7, // Vidu supports up to 7 reference images
  supportsVideoInterpolation: true, // Vidu start-end-to-video
  videoDurationRange: [2, 15], // Most models are 2-8; Kling v3 supports up to 15
  supportsImageEditing: true,
};

export const falProvider: Provider = {
  id: 'fal',
  displayName: 'fal.ai',
  supports: ['image', 'video'],
  capabilities: falCapabilities,
  isAvailable(env) {
    return Boolean(getFalKey(env));
  },
  async generate(req: GenerateRequest, env: ProviderEnv) {
    const key = getFalKey(env);
    if (!key) throw new Error('Missing fal API key. Set FAL_KEY (or FAL_API_KEY).');

    const verbose = req.verbose;
    log(verbose, 'Starting generation, kind:', req.kind, 'n:', req.n);
    log(
      verbose,
      'Input images:',
      req.inputImages?.length ?? 0,
      'startFrame:',
      !!req.startFrame,
      'endFrame:',
      !!req.endFrame
    );

    // Configure credentials at runtime
    fal.config({ credentials: key });

    // Select model based on kind and inputs
    const model = req.kind === 'video' ? selectVideoModel(req) : selectImageModel(req);
    log(verbose, 'Selected model:', model);

    if (req.kind === 'video' && req.duration !== undefined) {
      if (isKlingV3Model(model) && (req.duration < 3 || req.duration > 15)) {
        throw new Error(
          `Model ${model} supports video duration 3-15s, but ${req.duration}s requested`
        );
      }
      if (isViduModel(model) && (req.duration < 2 || req.duration > 8)) {
        throw new Error(
          `Model ${model} supports video duration 2-8s, but ${req.duration}s requested`
        );
      }
    }

    // Build input based on kind
    const input = req.kind === 'video' ? buildVideoInput(req, model) : buildImageInput(req);

    // Log input without large data URIs
    const inputSummary = { ...input };
    for (const key of ['image_url', 'start_image_url', 'end_image_url']) {
      if (
        typeof inputSummary[key] === 'string' &&
        (inputSummary[key] as string).startsWith('data:')
      ) {
        inputSummary[key] = `data:...${(inputSummary[key] as string).length} chars`;
      }
    }
    if (Array.isArray(inputSummary.reference_image_urls)) {
      inputSummary.reference_image_urls = (inputSummary.reference_image_urls as string[]).map(
        (url) => (url.startsWith('data:') ? `data:...${url.length} chars` : url)
      );
    }
    log(verbose, 'Request input:', JSON.stringify(inputSummary));

    log(verbose, 'Calling fal.subscribe...');
    const startTime = Date.now();

    const subscribeOptions: Parameters<typeof fal.subscribe>[1] = {
      input,
      logs: verbose,
    };
    if (verbose) {
      subscribeOptions.onQueueUpdate = (update) => {
        log(true, 'Queue update:', update.status, JSON.stringify(update).slice(0, 200));
      };
    }

    const result = (await fal.subscribe(model, subscribeOptions)) as { data: FalResult };

    log(verbose, `fal.subscribe completed in ${Date.now() - startTime}ms`);
    log(verbose, 'Raw result keys:', Object.keys(result?.data ?? {}));
    log(verbose, 'Result preview:', JSON.stringify(result?.data ?? {}).slice(0, 500));

    const items = pickMany(result?.data ?? {}, req.kind);
    log(verbose, `Found ${items.length} ${req.kind}(s) in response`);

    if (!items?.length) {
      const noun = req.kind === 'video' ? 'videos' : 'images';
      throw new Error(
        `fal returned no ${noun}. Raw response: ${JSON.stringify(result?.data).slice(0, 300)}`
      );
    }

    const out = [] as Array<{
      kind: 'image' | 'video';
      provider: 'fal';
      model?: string;
      index: number;
      url?: string;
      bytes: Uint8Array;
      mimeType?: string;
    }>;

    for (let i = 0; i < Math.min(items.length, req.n); i++) {
      const m = items[i];
      if (!m?.url) {
        log(verbose, `Item ${i} has no URL, skipping`);
        continue;
      }
      log(verbose, `Downloading item ${i}...`);
      const { bytes, mimeType } = await downloadBytes(m.url, verbose);
      const finalMimeType = m.content_type ?? mimeType;
      out.push({
        kind: req.kind,
        provider: 'fal',
        model,
        index: i,
        url: m.url,
        bytes,
        ...(finalMimeType !== undefined ? { mimeType: finalMimeType } : {}),
      });
    }

    if (!out.length) {
      const noun = req.kind === 'video' ? 'videos' : 'images';
      throw new Error(`fal returned ${noun} but none were downloadable`);
    }

    log(verbose, `Successfully generated ${out.length} ${req.kind}(s)`);
    return out;
  },
};
