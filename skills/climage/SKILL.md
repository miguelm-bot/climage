---
name: climage
description: Generate images from the terminal or code using climage. Use when the user asks to generate, create, or make images, or mentions image generation, AI images, or climage.
---

# climage

Generate images via multiple AI providers (Google Nano Banana/Imagen, OpenAI GPT Image, xAI Grok, fal.ai).

## Quick Start

```bash
npx climage "a cat wearing a top hat"
```

## Providers & Models

### Google (Default Provider)

| Model                           | Alias             | Description                                          |
| ------------------------------- | ----------------- | ---------------------------------------------------- |
| `gemini-3-pro-image-preview`    | `nano-banana-pro` | **Default.** Best quality, 4K support, thinking mode |
| `gemini-2.5-flash-image`        | `nano-banana`     | Fast, efficient for high-volume                      |
| `imagen-4.0-generate-001`       | -                 | Imagen 4 Standard                                    |
| `imagen-4.0-ultra-generate-001` | -                 | Imagen 4 Ultra                                       |
| `imagen-4.0-fast-generate-001`  | -                 | Imagen 4 Fast                                        |

### OpenAI

| Model              | Description                                     |
| ------------------ | ----------------------------------------------- |
| `gpt-image-1.5`    | **Default.** Latest, best instruction following |
| `gpt-image-1`      | Previous generation                             |
| `gpt-image-1-mini` | Cost-effective                                  |

### xAI

| Model                | Description                          |
| -------------------- | ------------------------------------ |
| `grok-imagine-image` | **Default.** Grok's image generation |

### fal.ai

| Model                 | Description               |
| --------------------- | ------------------------- |
| `fal-ai/flux/dev`     | **Default.** Flux dev     |
| `fal-ai/flux/pro`     | Flux pro (higher quality) |
| `fal-ai/flux-realism` | Photorealistic            |

## API Keys

| Provider | Env Variable     |
| -------- | ---------------- |
| Google   | `GEMINI_API_KEY` |
| OpenAI   | `OPENAI_API_KEY` |
| xAI      | `XAI_API_KEY`    |
| fal.ai   | `FAL_KEY`        |

## CLI Options

```
--provider <auto|google|openai|xai|fal>  Provider selection
--model <id>                             Model id (provider-specific)
--n <1..10>                              Number of images
--format <png|jpg|webp>                  Output format (default: png)
--out <path>                             Output file (single image only)
--outDir <dir>                           Output directory (default: .)
--name <text>                            Base filename
--aspect-ratio <w:h>                     Aspect ratio (e.g. 4:3, 16:9)
--json                                   JSON output
```

## Examples

```bash
# Default (Google Nano Banana Pro)
npx climage "sunset over mountains"

# Fast generation with Nano Banana
npx climage "sunset over mountains" --model nano-banana

# OpenAI GPT Image
npx climage "cyberpunk cityscape" --provider openai

# Multiple images with custom aspect ratio
npx climage "wide landscape" --n 4 --aspect-ratio 16:9 --outDir ./images

# JSON output for scripting
npx climage "logo design" --json
```

## Library API

```ts
import { generateImage } from 'climage';

const images = await generateImage('a futuristic robot', {
  provider: 'google',
  model: 'nano-banana-pro',
  n: 2,
  format: 'webp',
});

for (const img of images) {
  console.log(img.filePath);
}
```

## Output

- CLI prints file paths to stdout (one per line)
- With `--json`: `{ "images": [{ "filePath": "...", ... }] }`
- Files saved to current directory or `--outDir`
