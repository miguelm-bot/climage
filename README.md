# climage

Generate images from the terminal via multiple providers.

## Install / run

```bash
npx climage "make image of kitten"
```

## Providers

### xAI (grok-imagine-image)

Set one of:

- `XAI_API_KEY` (preferred)
- `XAI_TOKEN`
- `GROK_API_KEY`

Example:

```bash
XAI_API_KEY=... npx climage "A cat in a tree" --provider xai
```

### Google (Imagen)

Set one of:

- `GEMINI_API_KEY` (preferred)
- `GOOGLE_API_KEY`

Example:

```bash
GEMINI_API_KEY=... npx climage "A cat in a tree" --provider google --model imagen-4.0-generate-001
```

### fal.ai

Set one of:

- `FAL_KEY` (preferred by fal docs)
- `FAL_API_KEY` (also common)

Example:

```bash
FAL_KEY=... npx climage "A cat in a tree" --provider fal
```

## Options

- `--provider auto|xai|fal|google`
- `--model <id>`
- `--n <1..10>`
- `--format png|jpg|webp`
- `--out <path>` (only for single image)
- `--outDir <dir>` (default: current directory)
- `--name <text>` base name override
- `--aspect-ratio <w:h>` (xAI supports e.g. `4:3`)
- `--json`

## Library API

```ts
import { generateImage } from 'climage';

const images = await generateImage('make image of kitten', {
  provider: 'xai',
  n: 2,
});

console.log(images.map((i) => i.filePath));
```

## Notes

- v0.1 ships xAI provider first.
- `google` and `fal` providers are planned next.
