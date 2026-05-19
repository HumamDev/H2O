# src/extensions/gemini/firefox/ — FUTURE PLACEHOLDER

Gemini on Firefox — source root for a future H2O Gemini extension targeting
the Firefox browser. Not yet implemented.

## When this gets populated

This folder fills in when Firefox support is added to the Gemini product line.
Most gemini.google.com-specific code will be shared with `gemini/chrome/` via
`packages/host-adapters/gemini/`; only Firefox-specific manifest + API wrappers
diverge.

Shared primitives come from [`../../_shared/`](../../_shared/) and/or from
`packages/host-adapters/gemini/` + `packages/browser-adapters/firefox/`
(Phase 7D placeholders ready to consume).

## Expected source-tree shape

```
gemini/firefox/
├── scripts/        runtime scripts injected into gemini.google.com
├── surfaces/       HTML/JS surfaces packaged inside the extension
├── config/         loader/build config (variants, dev-order, deps)
├── assets/         icons, images
└── README.md       this file
```

## Host

- Target site: `https://gemini.google.com/*`
- DOM/event adapter: `packages/host-adapters/gemini/` (placeholder)

## Browser

- Target: Firefox 109+ (MV3-capable)
- API wrapper: `packages/browser-adapters/firefox/` (placeholder)
- Extension ID: `browser_specific_settings.gecko.id` in `config/extensions/gemini/firefox/keys.json`

## How outputs flow

```
src/extensions/gemini/firefox/
        ↓
tools/product/extensions/gemini/firefox/build.mjs
        ↓
apps/extensions/gemini/firefox/<variant>/   (gitignored)
        ↓
Firefox about:debugging → Load Temporary Add-on
```

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
