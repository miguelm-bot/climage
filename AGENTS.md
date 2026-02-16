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

## Manual Tests Workflow

- Store manual smoke evidence in `manual-tests/<YYYY-MM-DD>-<slug>/`.
- Keep the structure lightweight and flexible; only the date prefix is required.
- Each manual test folder must contain a `NOTES.md` written by the agent who ran it.
- `NOTES.md` should be short but complete:
  - what was tested and why
  - exact command(s) to rerun
  - expected vs observed result
  - commit(s) used (especially for repro/fix cases)
- Keep both failure and success artifacts (logs, exit codes, images/videos) in the same dated folder when useful.
