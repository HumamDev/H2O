# assets — operator-managed icon packs + brand assets

This top-level folder holds **untracked** brand assets and Chrome/Firefox
extension icon packs consumed by the build pipeline. Contents are
intentionally gitignored (`/assets/*` + `!/assets/README.md` in
`.gitignore`); only this README is tracked.

## Why untracked

- Icon packs are large (PNG sets at 16/32/48/128/256/512/1024 px per
  variant) and brand-controlled.
- They are restored from an out-of-band operator-state distribution
  rather than committed to git history.
- Builds will fail on a fresh clone until the packs are populated.

## What lives here

| Subdir / file | Consumer | Notes |
|---|---|---|
| `chrome-dev-controls-icons/` | `tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs` | Dev-controls + dev-controls-armed + dev-controls-oauth-google variants. |
| `chrome-dev-lean-icons/` | same builder | Dev-lean variant. Also reused by `studio-launcher`. |
| `chrome-ops-panel-icons/` | `tools/product/extensions/chatgpt/chrome/pack-ops-panel.mjs` | Ops Panel variant. |
| `internal-dev-controls-icons/` | `build-chrome-live-extension.mjs` (manifest icons) | Internal variant pack. |
| `surface-chrome-desk-icons/` | `tools/product/extensions/chatgpt/chrome/pack-desk.mjs` | Desk MV3 side-panel. |
| Brand PNGs (e.g. `Aether&Northstar_t.png`) | n/a | Reference assets for design work. |

## Path authority

Resolved through [tools/paths.mjs](../tools/paths.mjs) constant `ASSETS_DIR`
(`path.join(REPO_ROOT, "assets")`). New host/browser icon packs SHOULD
follow the convention `assets/extensions/<host>/<browser>/` to avoid
name collisions with the legacy chatgpt+chrome packs above.

## Restoring on a fresh clone

Icon packs are not bundled in the git tree. Obtain them from operator
distribution (one-off zip, shared drive, or future signed artifact
manifest). Place the unzipped subdirs under `assets/`.

## Where outputs land

Icons consumed here are copied into the bundled extension at build time
under `<ext-out>/icons/icon16.png`, etc. The bundle's `icons/` subdir is
the Chrome extension layout convention — see
[docs/architecture/PRODUCTS.md](../docs/architecture/PRODUCTS.md) for the
full builder/output table.
