# NOTES

Date: 2026-02-15
Purpose: verify/fix Google Veo 3.1 `--start-frame` + `--duration` flow around PR #7.

Issue reproduction (before fix):

- commit: `8f0add8` (master at the time) and PR branch commit `6c58da1`
- command:

```bash
node dist/cli.js "cinematic drone shot over rugged coastal cliffs at sunrise, gentle forward motion" \
  --video \
  --provider google \
  --model veo-3.1 \
  --start-frame manual-tests/2026-02-02-pr5-xai-start-frame/start-frame-input.jpg \
  --duration 4 \
  --out manual-tests/2026-02-15-pr7-veo-fix/veo3-before-pr.mp4
```

- observed failure: `INVALID_ARGUMENT` about missing image fields in Veo payload (`veo3-before-pr.log`, `veo3-after-pr.log`).

Fix verification:

- fix commit: `bec06ff`
- same command run after fix
- intermediate result: payload accepted but direct download could return 403 (`veo3-after-fix.log`)
- final result after download fallback change: success, output video created (`veo3-after-fix2.mp4`)

Files:

- `veo3-before-pr.*` = before PR result
- `veo3-after-pr.*` = PR #7 result
- `veo3-after-fix.*` = first local fix attempt (download 403)
- `veo3-after-fix2.*` = final successful run

Notes:

- Manual smoke evidence only; provider behavior may vary over time.
