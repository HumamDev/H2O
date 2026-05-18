# apps/studio/desktop/mac — FUTURE PLACEHOLDER ONLY

**This subfolder is reserved for a possible future native-macOS desktop
app. It is NOT the active desktop app root.**

The active H2O Studio Desktop is the cross-platform Tauri V2 shell that
lives directly at `apps/studio/desktop/` (one level up from here):

  - `apps/studio/desktop/package.json` — pkg name `@h2o/studio-desktop`
  - `apps/studio/desktop/src-tauri/`   — Tauri Rust project
  - `apps/studio/desktop/scripts/prepare-dist.mjs` — asset copy
  - `apps/studio/desktop/dist/`        — Tauri frontendDist (gitignored)

If macOS-specific native code is ever split out of the Tauri shell
(e.g., a native SwiftUI host, Mac-only menu-bar app, or App-Store-bound
sandboxed variant), it would live here. Until then this README is the
only tracked content in this folder, and no build pipeline targets it.
