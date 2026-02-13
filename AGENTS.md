# AGENTS

## CI and Release Basics

- CI workflow file: `.github/workflows/ci.yml`
- Pushes to `master` and `main` run build/test checks.
- Pull requests also run build/test checks.
- Release flow is tag-based (not branch-based).

## How Releases Work

- Create and push a git tag in the format `v*` (example: `v1.2.3`).
- On tag push:
  - `test` job runs first.
  - `publish` job publishes to npm (`npm publish --access public`) after tests pass.
  - `github-release` job creates a GitHub Release from that same tag with generated notes.

## Important Conditions

- npm publish runs only when `github.ref` is a tag starting with `refs/tags/v`.
- GitHub Release creation runs only when `github.ref` is a tag starting with `refs/tags/v`.
- No npm publish happens from direct pushes to `master`.
