# apps/studio/ — H2O Studio (umbrella)

H2O Studio is the operator-facing workspace for browsing, annotating, and
working with captured ChatGPT (and future Claude / Gemini) conversations. It
ships as three host shells, each in its own subdirectory under this folder:

| Subdir | Host | Status | Stack |
|---|---|---|---|
| [`desktop/`](desktop/) | macOS / Windows desktop app | Active (M1 — Tauri shell + boot proof) | Tauri V2 + Rust + the shared Studio assets |
| [`mobile/`](mobile/) | iOS / Android | Active scaffold | Expo SDK 55 + React Native + TypeScript |
| [`web/`](web/) | Future browser-hosted Studio | Placeholder (Phase 7D) | TBD; reserved for `cockpitpro.app/studio` or similar |

The shared Studio UI source itself currently lives in **top-level legacy
folders** (`src-surfaces-base/studio/` for HTML/JS surfaces; relevant runtime
userscripts in `src-runtime-base/` — renamed from `scripts/` in Phase 8K-5).
The desktop and mobile shells reuse those assets through different build chains.

## Source vs generated boundary (high-level)

For details, see each subdir's README. In summary:

| Subdir | Source you edit | Generated/cache (gitignored) |
|---|---|---|
| `desktop/` | `src-tauri/`, `build-tools/prepare-dist.mjs`, `package.json` | `dist/`, `src-tauri/target/`, `node_modules/` |
| `mobile/` | `src/`, `assets/`, `app.json`, `babel.config.js`, `metro.config.js`, `package.json`, `tsconfig.json` + the **native managed projects** under `ios/` (and future `android/`) | `.expo/`, `ios/build/`, `ios/Pods/`, `android/build/` (future), `node_modules/` |
| `web/` | (placeholder) | (n/a until implemented) |

The shared Studio UI lives at:

```
src-surfaces-base/studio/    ← legacy ChatGPT+Chrome source (frozen)
```

Both `desktop/` and `mobile/` consume those assets at build time. The
chatgpt+chrome legacy extension pipeline builds Studio into
`apps/extensions/chatgpt/chrome/prod/surfaces/studio/`, which the desktop
shell then copies into `apps/studio/desktop/dist/` via `prepare-dist.mjs`.

## Where to read more

- [`desktop/README.md`](desktop/README.md) — Tauri shell details
- [`mobile/README.md`](mobile/README.md) — Expo / React Native details
- [`web/README.md`](web/README.md) — placeholder rationale
- [../../docs/architecture/PRODUCTS.md](../../docs/architecture/PRODUCTS.md) — full product map including which builder produces each Studio output
- [../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../docs/architecture/MULTI_HOST_ARCHITECTURE.md) — overall source/generated boundary across the whole monorepo
