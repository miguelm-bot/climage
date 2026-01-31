export type ProviderId = 'auto' | 'xai' | 'fal' | 'google';

export type ImageFormat = 'png' | 'jpg' | 'webp';

export type GenerateOptions = {
  provider?: ProviderId;
  model?: string;
  n?: number;
  aspectRatio?: string;
  format?: ImageFormat;
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
  format: ImageFormat;
  outDir: string;
  out?: string | undefined;
  nameBase: string;
  timestamp: string;
  verbose: boolean;
};

export type GeneratedImage = {
  provider: Exclude<ProviderId, 'auto'>;
  model?: string;
  index: number;
  url?: string;
  bytes: Uint8Array;
  mimeType?: string;
  filePath: string;
};

export type ProviderEnv = Record<string, string | undefined>;

export type GeneratedImagePartial = Omit<GeneratedImage, 'filePath'>;

export interface Provider {
  id: Exclude<ProviderId, 'auto'>;
  displayName: string;
  isAvailable(env: ProviderEnv): boolean;
  generate(req: GenerateRequest, env: ProviderEnv): Promise<GeneratedImagePartial[]>; // router assigns filePath
}
