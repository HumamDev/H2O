# apps/studio/mobile/scripts — PLACEHOLDER (no active scripts yet)

This folder is **reserved for future Studio Mobile build/helper tooling**.
It does not contain any active scripts at the moment — the only tracked
file is this README.

## What goes here when something is added

Future helper scripts that the Studio Mobile workspace needs but that
do not belong inside `src/` (the app source) — for example:

- Post-`expo prebuild` patches (e.g., editing generated Android manifest
  flags that EAS Build needs).
- Asset-generation helpers (icon sizing, splash regeneration) that go
  beyond what `assets/` static files cover.
- One-off operator utilities (re-link a workspace, regenerate a local
  cache, etc.).

If a real script is added later and it's a load-bearing build step (run
from `package.json` `scripts`), consider whether the parallel rename
applied to desktop in Phase 8H-3 (`scripts/` → `build-tools/`) should
also be applied here for naming symmetry.

## What this folder is NOT

- **Not the same as the top-level `scripts/` folder at the repo root.**
  That is the frozen legacy chatgpt+chrome userscript source
  (`scripts/0A1a._H2O_Core_.js`, etc.); it is consumed by `tools/loader/`
  and `tools/product/extensions/chatgpt/chrome/` builders and is intentionally
  not relocated. The two `scripts/` folders are unrelated.
- **Not generated output.** Anything added here is hand-written tooling
  source and would be tracked in git.
- **Not the place for Expo's default `reset-project.js`.** That template
  helper is not part of this repo; it would be a fresh-scaffold convenience
  only and is not needed once the app has real source under `src/`.

## Status

| State | Detail |
|---|---|
| Active scripts | None |
| Tracked files | This `README.md` only |
| `package.json` npm scripts that reference this folder | None |
| Date confirmed empty | 2026-05-19 (Phase 8H-5) |

If you find this folder still empty months from now, that is fine — its
job is to claim the namespace and document the intent without forcing
premature tooling creation.
