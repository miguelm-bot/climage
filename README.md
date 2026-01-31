# climage

Generate images (and videos) from the terminal via multiple AI providers.

## Install / run

```bash
npx climage "make image of kitten"
```

## Providers

### Google (Nano Banana / Imagen / Veo)

**Default provider** with Gemini's native image generation (Nano Banana).

Also supports video generation via **Veo**.

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

Also supports video generation.

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
- `--type image|video` (default: `image`)
- `--video` (shortcut for `--type video`)
- `--format png|jpg|webp|mp4|webm|gif`
- `--out <path>` (only when `n=1`)
- `--outDir <dir>` (default: current directory)
- `--name <text>` base name override
- `--aspect-ratio <w:h>` (e.g. `16:9`, `4:3`, `1:1`)
- `--json`

### Input Images

- `--input <path>` Input image for editing or reference (can be used multiple times)
- `--start-frame <path>` First frame image for video generation
- `--end-frame <path>` Last frame image for video interpolation
- `--duration <seconds>` Video duration in seconds

## Image Editing

Edit existing images by providing an input image:

```bash
# Edit with xAI
npx climage "make the cat orange" --provider xai --input photo.jpg

# Edit with Google Gemini
npx climage "add a sunset background" --provider google --input photo.png

# Edit with OpenAI (supports optional mask as second input)
npx climage "replace the sky" --provider openai --input photo.png --input mask.png
```

## Image-to-Video

Generate videos from images:

```bash
# Basic image-to-video with xAI
npx climage "the cat walks away" --video --provider xai --start-frame cat.png

# Image-to-video with Google Veo
npx climage "the scene comes to life" --video --provider google --start-frame scene.png --duration 8

# Image-to-video with fal.ai
npx climage "dramatic camera zoom" --video --provider fal --start-frame photo.jpg
```

## Video Interpolation

Create smooth transitions between two images (supported by Google Veo 3.1 and fal.ai):

```bash
# Interpolation with fal.ai Vidu
npx climage "morphing transition" --video --provider fal --start-frame before.png --end-frame after.png

# Interpolation with Google Veo 3.1
npx climage "smooth transition" --video --provider google --start-frame a.png --end-frame b.png
```

## Reference Images

Use multiple images as style/content references:

```bash
# Reference-guided video with Google Veo 3.1 (up to 3 images)
npx climage "person walking in this style" --video --provider google --input style1.png --input style2.png

# Reference-guided video with fal.ai Vidu (up to 7 images)
npx climage "character in motion" --video --provider fal --input ref1.png --input ref2.png --input ref3.png
```

## Provider Capabilities

| Feature                  | Google | xAI  | fal.ai | OpenAI |
| ------------------------ | ------ | ---- | ------ | ------ |
| Image Generation         | Yes    | Yes  | Yes    | Yes    |
| Image Editing            | Yes    | Yes  | Yes    | Yes    |
| Video Generation         | Yes    | Yes  | Yes    | No     |
| Image-to-Video           | Yes    | Yes  | Yes    | No     |
| Video Interpolation      | Yes    | No   | Yes    | No     |
| Max Input Images         | 3      | 1    | 7      | 2      |
| Video Duration (seconds) | 4-8    | 1-15 | 2-8    | N/A    |

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
