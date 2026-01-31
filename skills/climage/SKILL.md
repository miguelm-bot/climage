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
--aspect-ratio <w:h>                       Aspect ratio (provider-specific; see notes below)
--input <path>                             Input image for editing/reference (repeatable; provider-specific limits apply)
--start-frame <path>                       Start frame image for video
--end-frame <path>                         End frame image for video interpolation
--duration <seconds>                       Video duration in seconds
--json                                     JSON output
```

### Aspect ratio support (by provider)

- **Google (Imagen/Veo):** `1:1`, `4:3`, `3:4`, `16:9`, `9:16`
- **OpenAI (gpt-image-_/dall-e-_):** limited set (depends on model). Custom ratios are not supported.
- **xAI:** accepts `aspect_ratio: "w:h"` (docs show `4:3`).
- **fal.ai:** provider/model-specific; arbitrary `w:h` is passed through for models that accept it.

### Multiple input images

- **Google (Veo 3.1):** up to 3 reference images via repeated `--input`.
- **fal.ai:** up to 7 reference images via repeated `--input` (model-dependent).
- **OpenAI:** uses first `--input` as image and second (optional) as mask.
- **xAI:** currently uses only the first `--input` for edits / image-to-video.

## Examples

```bash
# Default (Google Nano Banana Pro)
npx climage "sunset over mountains"

# Fast generation with Nano Banana
npx climage "sunset over mountains" --model nano-banana

# Google video (Veo)
npx climage "a neon hologram of a cat driving" --video

# xAI video
npx climage "a cat playing with a ball" --provider xai --video

# Multiple outputs with custom aspect ratio
npx climage "wide landscape" --n 4 --aspect-ratio 16:9 --outDir ./out

# JSON output for scripting
npx climage "logo design" --json
```

## Image Editing

Edit existing images with a text prompt:

```bash
# Edit with Google
npx climage "add a sunset background" --provider google --input photo.png

# Edit with xAI
npx climage "make the cat blue" --provider xai --input cat.jpg

# Edit with OpenAI (supports optional mask as second input)
npx climage "replace the sky" --provider openai --input photo.png --input mask.png
```

## Image-to-Video

Generate videos from images:

```bash
# Google Veo with start frame
npx climage "the scene comes to life" --video --provider google --start-frame scene.png --duration 8

# fal.ai with start frame
npx climage "camera slowly zooms in" --video --provider fal --start-frame photo.jpg

# xAI with start frame
npx climage "animate this image" --video --provider xai --start-frame cat.png --duration 5
```

## Video Interpolation

Create smooth transitions between two images (fal.ai and Google Veo):

```bash
# fal.ai Vidu interpolation
npx climage "smooth transition" --video --provider fal --start-frame before.png --end-frame after.png

# Google Veo interpolation
npx climage "morph between frames" --video --provider google --start-frame a.png --end-frame b.png
```

## Provider Capabilities

| Feature             | Google | xAI | fal.ai | OpenAI |
| ------------------- | ------ | --- | ------ | ------ |
| Image Generation    | Yes    | Yes | Yes    | Yes    |
| Image Editing       | Yes    | Yes | Yes    | Yes    |
| Video Generation    | Yes    | Yes | Yes    | No     |
| Image-to-Video      | Yes    | Yes | Yes    | No     |
| Video Interpolation | Yes    | No  | Yes    | No     |
| Max Input Images    | 3      | 1   | 7      | 2      |

## Library API

```ts
import { generateImage, generateVideo } from 'climage';

// Basic image generation
const images = await generateImage('a futuristic robot', {
  provider: 'google',
  model: 'nano-banana-pro',
  n: 2,
  format: 'webp',
});

// Image editing
const edited = await generateImage('make the sky purple', {
  provider: 'google',
  inputImages: ['./photo.png'],
});

// Video generation
const videos = await generateVideo('a cinematic corgi running', {
  provider: 'google',
  n: 1,
});

// Image-to-video
const animated = await generateVideo('the scene comes to life', {
  provider: 'fal',
  startFrame: './scene.png',
  duration: 5,
});

// Video interpolation
const interpolated = await generateVideo('smooth transition', {
  provider: 'fal',
  startFrame: './before.png',
  endFrame: './after.png',
});

for (const item of [...images, ...videos]) {
  console.log(item.filePath);
}
```

## Output

- CLI prints file paths to stdout (one per line)
- With `--json`: `{ "images": [...], "videos": [...] }` (keys only present when applicable)
- Files saved to current directory or `--outDir`
