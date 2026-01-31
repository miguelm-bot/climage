---
name: climage
description: Generate images or videos from the terminal or code using climage. Use when the user asks to generate, create, or make images/videos, or mentions media generation, AI images, AI video, or climage.
---

# climage

Generate images and videos via multiple AI providers (Google Nano Banana/Imagen/Veo, OpenAI GPT Image, xAI Grok, fal.ai).

## Quick Start

```bash
npx climage "a cat wearing a top hat"

# video
npx climage "a cinematic shot of a corgi running" --type video
```

## Providers & Models

### Google (Default Provider)

**Images**

| Model                           | Alias             | Description                                          |
| ------------------------------- | ----------------- | ---------------------------------------------------- |
| `gemini-3-pro-image-preview`    | `nano-banana-pro` | **Default.** Best quality, 4K support, thinking mode |
| `gemini-2.5-flash-image`        | `nano-banana`     | Fast, efficient for high-volume                      |
| `imagen-4.0-generate-001`       | -                 | Imagen 4 Standard                                    |
| `imagen-4.0-ultra-generate-001` | -                 | Imagen 4 Ultra                                       |
| `imagen-4.0-fast-generate-001`  | -                 | Imagen 4 Fast                                        |

**Video (Veo)**

| Model                      | Alias     | Description                  |
| -------------------------- | --------- | ---------------------------- |
| `veo-3.1-generate-preview` | `veo3.1`  | **Default.** Preview channel |
| `veo-3.1-generate-preview` | `veo-3.1` | Preview channel alias        |

### OpenAI

(Image only)

| Model              | Description                                     |
| ------------------ | ----------------------------------------------- |
| `gpt-image-1.5`    | **Default.** Latest, best instruction following |
| `gpt-image-1`      | Previous generation                             |
| `gpt-image-1-mini` | Cost-effective                                  |

### xAI

| Model                | Kind  | Description                          |
| -------------------- | ----- | ------------------------------------ |
| `grok-imagine-image` | image | **Default.** Grok's image generation |
| `grok-imagine-video` | video | **Default.** Grok's video generation |

### fal.ai

(Depends on model; many support image and/or video)

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
--provider <auto|google|openai|xai|fal>     Provider selection
--model <id>                               Model id (provider-specific)
--n <1..10>                                Number of outputs
--type <image|video>                       Output type (default: image)
--video                                    Shortcut for: --type video
--format <png|jpg|webp|mp4|webm|gif>       Output format (default: png for image, mp4 for video)
--out <path>                               Output file (only when n=1)
--outDir <dir>                             Output directory (default: .)
--name <text>                              Base filename
--aspect-ratio <w:h>                       Aspect ratio (provider-specific)
--json                                     JSON output
```

## Examples

```bash
# Default (Google Nano Banana Pro)
npx climage "sunset over mountains"

# Fast generation with Nano Banana
npx climage "sunset over mountains" --model nano-banana

# Google video (Veo)
GEMINI_API_KEY=... npx climage "a neon hologram of a cat driving at top speed" --type video

# xAI video
XAI_API_KEY=... npx climage "a cat playing with a ball" --provider xai --type video

# OpenAI GPT Image
OPENAI_API_KEY=... npx climage "cyberpunk cityscape" --provider openai

# Multiple outputs with custom aspect ratio
npx climage "wide landscape" --n 4 --aspect-ratio 16:9 --outDir ./out

# JSON output for scripting
npx climage "logo design" --json
```

## Library API

```ts
import { generateImage, generateVideo } from 'climage';

const images = await generateImage('a futuristic robot', {
  provider: 'google',
  model: 'nano-banana-pro',
  n: 2,
  format: 'webp',
});

const videos = await generateVideo('a cinematic corgi running', {
  provider: 'google',
  model: 'veo-3.1-generate-preview',
  n: 1,
});

for (const item of [...images, ...videos]) {
  console.log(item.filePath);
}
```

## Output

- CLI prints file paths to stdout (one per line)
- With `--json`: `{ "images": [...], "videos": [...] }` (keys only present when applicable)
- Files saved to current directory or `--outDir`
