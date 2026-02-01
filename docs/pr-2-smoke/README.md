# PR #2 smoke test outputs

These files are **real provider outputs** generated via `climage` using the same prompt across providers.

- Date: 2026-02-01
- Prompt: "A cozy reading nook in a spaceship, warm lighting, ultra detailed"
- Commands: `climage <prompt> --provider <google|openai|xai|fal> --n 1 --format png`

Notes:

- Some providers return JPEG bytes even when `--format png` is requested (handled by `mimeType`-based extension selection in code).
