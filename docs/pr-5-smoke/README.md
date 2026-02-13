# PR #5 smoke test outputs

These files are **real provider outputs** generated via `climage` to verify xAI `--start-frame` is passed through for video generation.

- Date: 2026-02-02
- Provider: xAI
- Model: grok-imagine-video
- Duration: 4s

## Command

```bash
node dist/cli.js "The dinosaur in the image gently waves and smiles" \
  --video \
  --provider xai \
  --model grok-imagine-video \
  --duration 4 \
  --start-frame docs/pr-2-smoke/xai.jpg \
  --out docs/pr-5-smoke/xai-start-frame.mp4 \
  --verbose
```

## Files

- `start-frame-input.jpg` — the input image provided via `--start-frame`
- `xai-start-frame.mp4` — generated video
- `xai-start-frame-first.png` — extracted first frame from the generated video

Notes:

- The first frame visually matches the input scene (same composition) and then animates.
