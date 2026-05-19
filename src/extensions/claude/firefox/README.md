# src/extensions/claude/firefox/ — FUTURE PLACEHOLDER

Claude on Firefox — source root for a future H2O Claude extension targeting
the Firefox browser. Not yet implemented.

## When this gets populated

This folder fills in when Firefox support is added to the Claude product line.
Most claude.ai-specific code will be shared with `claude/chrome/` via
`packages/host-adapters/claude/`; only Firefox-specific manifest + API wrappers
diverge.

Shared primitives come from [`../../_shared/`](../../_shared/) and/or from
`packages/host-adapters/claude/` + `packages/browser-adapters/firefox/`
(Phase 7D placeholders ready to consume).

## Expected source-tree shape

```
claude/firefox/
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

- Target: Firefox 109+ (MV3-capable)
- API wrapper: `packages/browser-adapters/firefox/` (placeholder)
- Extension ID: `browser_specific_settings.gecko.id` in `config/extensions/claude/firefox/keys.json`

## How outputs flow

```
src/extensions/claude/firefox/
        ↓
tools/product/extensions/claude/firefox/build.mjs
        ↓
apps/extensions/claude/firefox/<variant>/   (gitignored)
        ↓
Firefox about:debugging → Load Temporary Add-on
```

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
