# apps/studio/web — FUTURE PLACEHOLDER

Future web-Studio scaffold.

Not yet implemented. Currently H2O Studio runs in two surfaces:

  - **Desktop**: Tauri V2 shell at `apps/studio/desktop/` (loads bundled
    Studio assets from `apps/extensions/chatgpt/chrome/prod/surfaces/studio/`).
  - **Mobile**: Expo / React Native at `apps/studio/mobile/`.

This folder reserves the spot for a future browser-hosted Studio
(`cockpitpro.app/studio` or similar), if/when one is added. Until then
this README is the only tracked content here, and no build pipeline,
no workspace entry, no package.json, and no source code lives here.

## Source vs generated — when this gets implemented

(Added in Phase 8H-0 to pre-establish the boundary for when web-Studio is
built out. Matches the source/generated boundary established for the
extension architecture and the other apps/studio/<host>/ subdirs.)

Expected shape:

| Path | Status |
|---|---|
| `src/` | Source (TypeScript or whatever framework is chosen) |
| `public/` | Static assets |
| `package.json`, `vite.config.ts` (or similar) | Source |
| `dist/` | Generated (gitignored) |
| `node_modules/` | Generated (gitignored) |

The Studio UI itself will be shared with desktop/mobile via either
`src-surfaces-base/studio/` (the current legacy source) or, eventually,
`packages/studio-ui/` / `packages/studio-core/` (the Phase 7D placeholders
ready to consume).

## Where to read more

- [`../README.md`](../README.md) — `apps/studio/` umbrella
- [../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
