# climage

Generate images from the terminal via multiple AI providers.

## Install / run

```bash
npx climage "make image of kitten"
```

## Providers

### Google (Nano Banana / Imagen)

**Default provider** with Gemini's native image generation (Nano Banana).

Set one of:

- `GEMINI_API_KEY` (preferred)
- `GOOGLE_API_KEY`

**Models:**

| Model                           | Alias             | Description                                                                           |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `gemini-3-pro-image-preview`    | `nano-banana-pro` | **Default.** State-of-the-art, professional asset production, up to 4K, thinking mode |
| `gemini-2.5-flash-image`        | `nano-banana`     | Fast & efficient, optimized for high-volume tasks                                     |
| `imagen-4.0-generate-001`       | -                 | Imagen 4 Standard                                                                     |
| `imagen-4.0-ultra-generate-001` | -                 | Imagen 4 Ultra (best quality)                                                         |
| `imagen-4.0-fast-generate-001`  | -                 | Imagen 4 Fast                                                                         |

Example:

```bash
# Default (Nano Banana Pro)
GEMINI_API_KEY=... npx climage "A cat in a tree" --provider google

# Nano Banana (fast)
GEMINI_API_KEY=... npx climage "A cat in a tree" --model nano-banana

# Imagen 4
GEMINI_API_KEY=... npx climage "A cat in a tree" --model imagen-4.0-generate-001
```

### OpenAI (GPT Image / DALL-E)

Set:

- `OPENAI_API_KEY`

**Models:**

| Model              | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `gpt-image-1.5`    | **Default.** Latest and most advanced, superior instruction following |
| `gpt-image-1`      | Previous generation, still excellent quality                          |
| `gpt-image-1-mini` | Cost-effective option                                                 |
| `dall-e-3`         | DALL-E 3 (deprecated May 2026)                                        |
| `dall-e-2`         | DALL-E 2 (deprecated May 2026)                                        |

Example:

```bash
OPENAI_API_KEY=... npx climage "A cat in a tree" --provider openai

# Cost-effective
OPENAI_API_KEY=... npx climage "A cat in a tree" --provider openai --model gpt-image-1-mini
```

### xAI (Grok Imagine)

Set one of:

- `XAI_API_KEY` (preferred)
- `XAI_TOKEN`
- `GROK_API_KEY`

**Models:**

| Model                | Description                          |
| -------------------- | ------------------------------------ |
| `grok-imagine-image` | **Default.** Grok's image generation |

Example:

```bash
XAI_API_KEY=... npx climage "A cat in a tree" --provider xai
```

### fal.ai

Set one of:

- `FAL_KEY` (preferred by fal docs)
- `FAL_API_KEY`

**Models:**

| Model                 | Description                            |
| --------------------- | -------------------------------------- |
| `fal-ai/flux/dev`     | **Default.** Flux dev (fast & popular) |
| `fal-ai/flux/pro`     | Flux pro (higher quality)              |
| `fal-ai/flux-realism` | Photorealistic style                   |

Example:

```bash
FAL_KEY=... npx climage "A cat in a tree" --provider fal
```

## Options

- `--provider auto|google|openai|xai|fal`
- `--model <id>`
- `--n <1..10>`
- `--format png|jpg|webp`
- `--out <path>` (only for single image)
- `--outDir <dir>` (default: current directory)
- `--name <text>` base name override
- `--aspect-ratio <w:h>` (e.g. `16:9`, `4:3`, `1:1`)
- `--json`

## Library API

```ts
import { generateImage } from 'climage';

const images = await generateImage('make image of kitten', {
  provider: 'google',
  model: 'nano-banana-pro',
  n: 2,
});

console.log(images.map((i) => i.filePath));
```

## Provider Selection

Auto-detection picks the first available provider in this order:

1. Google (if `GEMINI_API_KEY` is set)
2. xAI (if `XAI_API_KEY` is set)
3. fal.ai (if `FAL_KEY` is set)
4. OpenAI (if `OPENAI_API_KEY` is set)
