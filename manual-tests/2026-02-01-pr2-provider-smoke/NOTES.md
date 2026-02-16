# NOTES

Date: 2026-02-01
Purpose: PR #2 real-provider image smoke check across providers.

Prompt:
`A cozy reading nook in a spaceship, warm lighting, ultra detailed`

How it was run:
`climage <prompt> --provider <google|openai|xai|fal> --n 1 --format png`

Expected:

- One output image per provider.

Observed:

- Outputs are present in this folder (`google.png`, `openai.png`, `xai.jpg`, `fal.jpg`).
- Some providers returned JPEG bytes even when `--format png` was requested.

Notes:

- This is a manual smoke artifact set (non-deterministic).
- Validate visually and by exit code/logs when rerunning.
