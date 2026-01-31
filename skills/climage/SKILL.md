---
name: climage
description: Generate images from the terminal or code using climage. Use when the user asks to generate, create, or make images, or mentions image generation, AI images, or climage.
---

# climage

Generate images via multiple AI providers (Google Imagen, xAI Grok, fal.ai, OpenAI).

## Quick Start

```bash
npx climage "a cat wearing a top hat"
```

## Providers & API Keys

| Provider      | Env Variable     | Model Example             |
| ------------- | ---------------- | ------------------------- |
| Google Imagen | `GEMINI_API_KEY` | `imagen-4.0-generate-001` |
| xAI Grok      | `XAI_API_KEY`    | `grok-imagine-image`      |
| fal.ai        | `FAL_KEY`        | (default)                 |
| OpenAI        | `OPENAI_API_KEY` | `gpt-image-1`             |

Auto-detection picks the first available provider.

## CLI Options

```
--provider <auto|google|xai|fal|openai>  Provider selection
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
# Generate with specific provider
npx climage "sunset over mountains" --provider google

# Multiple images
npx climage "cyberpunk cityscape" --n 4 --outDir ./images

# Custom aspect ratio
npx climage "wide landscape" --aspect-ratio 16:9 --provider xai

# JSON output for scripting
npx climage "logo design" --json
```

## Library API

```ts
import { generateImage } from 'climage';

const images = await generateImage('a futuristic robot', {
  provider: 'openai',
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
