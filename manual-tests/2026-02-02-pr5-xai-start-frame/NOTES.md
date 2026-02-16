# NOTES

Date: 2026-02-02
Purpose: PR #5 verify xAI video generation honors `--start-frame`.

Provider/model:

- provider: xAI
- model: grok-imagine-video
- duration: 4s

How to replicate:

```bash
node dist/cli.js "The dinosaur in the image gently waves and smiles" \
  --video \
  --provider xai \
  --model grok-imagine-video \
  --duration 4 \
  --start-frame manual-tests/2026-02-02-pr5-xai-start-frame/start-frame-input.jpg \
  --out manual-tests/2026-02-02-pr5-xai-start-frame/xai-start-frame.mp4 \
  --verbose
```

Observed:

- `xai-start-frame.mp4` generated successfully.
- `xai-start-frame-first.png` first frame visually matches input composition.

Notes:

- This is a manual smoke test (non-deterministic).
