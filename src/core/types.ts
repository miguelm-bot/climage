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

export interface Provider {
  id: Exclude<ProviderId, 'auto'>;
  displayName: string;
  supports: MediaKind[];
  isAvailable(env: ProviderEnv): boolean;
  generate(req: GenerateRequest, env: ProviderEnv): Promise<GeneratedMediaPartial[]>; // router assigns filePath
}
