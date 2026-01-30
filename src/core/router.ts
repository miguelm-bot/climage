import path from 'node:path'

import type { GenerateOptions, GenerateRequest, GeneratedImage, GeneratedImagePartial, Provider, ProviderEnv, ProviderId } from './types.js'
import { loadEnv } from './env.js'
import { makeOutputPath, resolveOutDir, writeImageFile } from './output.js'
import { slugify, timestampLocalCompact } from './strings.js'
import { xaiProvider } from '../providers/xai.js'

const providers: Provider[] = [xaiProvider]

export function listProviders(): Provider[] {
  return [...providers]
}

export function pickProvider(id: ProviderId, env: ProviderEnv): Provider {
  if (id !== 'auto') {
    const p = providers.find((p) => p.id === id)
    if (!p) throw new Error(`Unknown provider: ${id}`)
    if (!p.isAvailable(env)) throw new Error(`Provider ${id} is not available (missing API key)`)
    return p
  }

  const p = providers.find((pp) => pp.isAvailable(env))
  if (!p) throw new Error('No providers available. Set XAI_API_KEY (or other provider keys) in .env or environment.')
  return p
}

function normalizeOptions(prompt: string, opts: GenerateOptions): GenerateRequest {
  const nRaw = opts.n ?? 1
  const n = Math.max(1, Math.min(10, Math.floor(nRaw)))

  const format = opts.format ?? 'png'
  const outDir = resolveOutDir(opts.outDir ?? '.')
  const timestamp = timestampLocalCompact()

  const nameBase = slugify(opts.name ?? prompt)

  return {
    prompt,
    provider: opts.provider ?? 'auto',
    model: opts.model ?? undefined,
    n,
    aspectRatio: opts.aspectRatio ?? undefined,
    format,
    outDir,
    out: opts.out ? path.resolve(process.cwd(), opts.out) : undefined,
    nameBase,
    timestamp,
    verbose: Boolean(opts.verbose),
  }
}

export async function generateImage(prompt: string, opts: GenerateOptions = {}): Promise<GeneratedImage[]> {
  const { env } = loadEnv(process.cwd())
  const req = normalizeOptions(prompt, opts)
  const provider = pickProvider(req.provider, env)

  const partials = await provider.generate(req, env)
  const images: GeneratedImage[] = []

  for (let i = 0; i < partials.length; i++) {
    const p: GeneratedImagePartial | undefined = partials[i]
    if (!p) continue
    const filePath = makeOutputPath(req, i)
    await writeImageFile(filePath, p.bytes)
    images.push({ ...p, filePath })
  }

  return images
}
