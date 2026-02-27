# NOTES

Date: 2026-02-27
Purpose: Verify fal.ai support for Hunyuan Image 3.0 Instruct and Kling Image o1 models, including the `image_urls` array fix.

## Background

Hunyuan Image edit and Kling Image o1 endpoints expect `image_urls` (array) instead of `image_url` (singular). The fix generalizes detection via `usesImageUrlsArray()` in `src/providers/fal.ts`.

## 1. Hunyuan text-to-image

```bash
node dist/cli.js "a serene japanese garden with cherry blossoms and a koi pond" \
  --provider fal \
  --model fal-ai/hunyuan-image/v3/instruct/text-to-image \
  --out manual-tests/2026-02-27-fal-hunyuan-kling/hunyuan-text-to-image.png \
  --verbose
```

- `hunyuan-text-to-image.png` generated in ~55s, 1.4MB.

## 2. Hunyuan edit (image_urls fix)

```bash
node dist/cli.js "add falling snow and make it winter" \
  --provider fal \
  --model fal-ai/hunyuan-image/v3/instruct/edit \
  --input manual-tests/2026-02-27-fal-hunyuan-kling/hunyuan-text-to-image.png \
  --out manual-tests/2026-02-27-fal-hunyuan-kling/hunyuan-edit.png \
  --verbose
```

- `hunyuan-edit.png` generated in ~20s, 1.7MB. Edit successfully applied to source image.

## 3. Kling Image o1 (image_urls fix)

```bash
node dist/cli.js "transform this into a watercolor painting style" \
  --provider fal \
  --model fal-ai/kling-image/o1 \
  --input manual-tests/2026-02-27-fal-hunyuan-kling/hunyuan-text-to-image.png \
  --out /tmp/kling-o1-edit.png \
  --verbose
```

- `kling-o1-edit.png` generated in ~55s, 1.9MB. Reference-based edit applied successfully.

## Notes

- Before the fix, both Hunyuan edit and Kling o1 returned 422 Unprocessable Entity when using `image_url` (singular).
- The fix detects these models via `usesImageUrlsArray()` and sends `image_urls` (array) instead.
- Commit used: generalization of 28649ac (Hunyuan-only fix → Hunyuan + Kling).
