# src/extensions/claude/chrome/ — FUTURE PLACEHOLDER

Claude on Chrome — source root for a future H2O Claude extension targeting
the Chrome browser. Not yet implemented.

## When this gets populated

This folder fills in when Claude support is added to the H2O product line.
This is a green-field source root — there is no Claude legacy to copy from.

Shared cross-host/cross-browser primitives come from
[`../../_shared/`](../../_shared/) and/or from `packages/host-adapters/claude/`
+ `packages/browser-adapters/chrome/` (Phase 7D placeholders ready to consume).

## Expected source-tree shape

```
claude/chrome/
├── scripts/        runtime scripts injected into claude.ai
├── surfaces/       HTML/JS surfaces packaged inside the extension
├── config/         loader/build config (variants, dev-order, deps)
├── assets/         icons, images
└── README.md       this file
```

## Host

- Target site: `https://claude.ai/*`
- DOM/event adapter: `packages/host-adapters/claude/` (placeholder)

## Browser

- Target: Chrome (MV3)
- API namespace: `chrome.*` direct (no polyfill needed for Chrome-only)
- Extension ID: SHA256 of SPKI public key in `config/extensions/claude/chrome/keys.json`
  (same key-derivation scheme as Phase 8A-1 for chatgpt+chrome)

## How outputs flow

```
src/extensions/claude/chrome/
        ↓
tools/product/extensions/claude/chrome/build.mjs
        ↓
apps/extensions/claude/chrome/<variant>/    (gitignored)
        ↓
Chrome chrome://extensions → Load unpacked
```

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
  — full multi-host/multi-browser architecture reference
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
  — current product map
