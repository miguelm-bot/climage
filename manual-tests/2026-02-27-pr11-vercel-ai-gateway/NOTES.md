# NOTES

Date: 2026-02-27
Purpose: PR #11 verify Vercel AI Gateway provider (image, video, aspect ratio, start frame).

Provider/model:

- provider: vercel (AI Gateway)
- image model: xai/grok-imagine-image
- video model: xai/grok-imagine-video

## 1. Image generation

```bash
node dist/cli.js "a serene mountain landscape at golden hour" \
  --provider vercel \
  --model xai/grok-imagine-image \
  --out manual-tests/2026-02-27-pr11-vercel-ai-gateway/image.png \
  --verbose
```

- `image.png` generated in ~4s, 441KB.

## 2. Video with aspect ratio

```bash
node dist/cli.js "a cinematic sunset over the ocean" \
  --provider vercel --video \
  --model xai/grok-imagine-video \
  --aspect-ratio 16:9 \
  --out manual-tests/2026-02-27-pr11-vercel-ai-gateway/video-aspect-ratio.mp4 \
  --verbose
```

- `video-aspect-ratio.mp4` generated in ~18s, 3.1MB, 16:9 aspect ratio.

## 3. Image-to-video with start frame

```bash
node dist/cli.js "the sun slowly sets and the sky turns orange and purple" \
  --provider vercel --video \
  --model xai/grok-imagine-video \
  --start-frame manual-tests/2026-02-27-pr11-vercel-ai-gateway/image.png \
  --out manual-tests/2026-02-27-pr11-vercel-ai-gateway/video-start-frame.mp4 \
  --verbose
```

- `video-start-frame.mp4` generated in ~28s, 4.0MB. First frame matches input composition.

Notes:

- This is a manual smoke test (non-deterministic).
- All tests used xAI models via Vercel AI Gateway (cheapest available).
