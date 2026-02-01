export type ProviderId = 'auto' | 'xai' | 'fal' | 'google' | 'openai';

export type MediaKind = 'image' | 'video';

export type ImageFormat = 'png' | 'jpg' | 'webp';
export type VideoFormat = 'mp4' | 'webm' | 'gif';
export type OutputFormat = ImageFormat | VideoFormat;

export type GenerateOptions = {
  provider?: ProviderId;
  model?: string;
  /** Default: 1. Max: 10. */
  n?: number;
  aspectRatio?: string;
  /** Default: image. */
  kind?: MediaKind;
  /** Default depends on kind: png for image, mp4 for video. */
  format?: OutputFormat;
  out?: string;
  outDir?: string;
  name?: string;
  verbose?: boolean;

  // Input images (for editing, image-to-video, reference images)
  /** Paths or URLs to input images. Used for image editing, image-to-video, or reference images. */
  inputImages?: string[];

  // Video-specific parameters
  /** Path/URL to first frame image (for video generation from image or interpolation). */
  startFrame?: string;
  /** Path/URL to last frame image (for video interpolation). */
  endFrame?: string;
  /** Video duration in seconds. Provider-specific ranges apply. */
  duration?: number;
};

export type GenerateRequest = {
  prompt: string;
  provider: ProviderId;
  model?: string | undefined;
  n: number;
  aspectRatio?: string | undefined;
  kind: MediaKind;
  format: OutputFormat;
  outDir: string;
  out?: string | undefined;
  nameBase: string;
  timestamp: string;
  verbose: boolean;

  // Input images (resolved to data URIs or URLs)
  /** Resolved input images as data URIs or URLs. */
  inputImages?: string[] | undefined;
  /** Resolved first frame image as data URI or URL. */
  startFrame?: string | undefined;
  /** Resolved last frame image as data URI or URL. */
  endFrame?: string | undefined;
  /** Video duration in seconds. */
  duration?: number | undefined;
};

export type GeneratedMedia = {
  kind: MediaKind;
  provider: Exclude<ProviderId, 'auto'>;
  model?: string;
  index: number;
  url?: string;
  bytes: Uint8Array;
  mimeType?: string;
  filePath: string;
};

export type GeneratedMediaPartial = Omit<GeneratedMedia, 'filePath'>;

export type ProviderEnv = Record<string, string | undefined>;

/** Provider capabilities for input images, aspect ratio, and video parameters. */
export interface ProviderCapabilities {
  /** Maximum number of input images supported.
   *
   * Notes:
   * - Some providers only use the *first* image for certain operations.
   * - Others treat multiple images as reference images.
   */
  maxInputImages: number;

  /** Supported aspect ratios as strings like "1:1", "16:9".
   *
   * If omitted, climage will not pre-validate (provider may still reject).
   */
  supportedAspectRatios?: string[];

  /** Whether the provider supports arbitrary custom ratios like "7:5".
   *
   * If false/omitted and supportedAspectRatios is provided, climage will validate against the list.
   */
  supportsCustomAspectRatio?: boolean;

  /** Whether the provider supports video interpolation (start + end frames). */
  supportsVideoInterpolation: boolean;
  /** Video duration range [min, max] in seconds. Undefined if video not supported. */
  videoDurationRange?: [number, number];
  /** Whether the provider supports image editing. */
  supportsImageEditing: boolean;
}

export interface Provider {
  id: Exclude<ProviderId, 'auto'>;
  displayName: string;
  supports: MediaKind[];
  /** Provider capabilities for validation and feature detection. */
  capabilities: ProviderCapabilities;
  isAvailable(env: ProviderEnv): boolean;
  generate(req: GenerateRequest, env: ProviderEnv): Promise<GeneratedMediaPartial[]>; // router assigns filePath
}
