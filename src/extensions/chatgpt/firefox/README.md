# src/extensions/chatgpt/firefox/ — FUTURE PLACEHOLDER

ChatGPT on Firefox — source root for the future Firefox-targeted variants
of the H2O ChatGPT extension. Not yet implemented.

## When this gets populated

This folder fills in when Firefox support is added to the ChatGPT product
line. The chatgpt+chrome line lives at the repo's top-level `scripts/`,
`surfaces/`, `config/` (frozen legacy). The Firefox line will live here as
fresh source — NOT copied from the legacy.

The shared cross-browser/cross-host primitives (DOM observer, storage
abstraction, browser API polyfill) will be imported from
[`../../_shared/`](../../_shared/) and/or from `packages/host-adapters/chatgpt/`
+ `packages/browser-adapters/firefox/` (Phase 7D placeholders ready to consume).

## Expected source-tree shape

```
chatgpt/firefox/
├── scripts/        runtime scripts injected into chatgpt.com
├── surfaces/       HTML/JS surfaces packaged inside the extension
├── config/         loader/build config (variants, dev-order, deps)
├── assets/         icons, images
└── README.md       this file
```

## Host

- Target site: `https://chatgpt.com/*`
- DOM/event adapter: `packages/host-adapters/chatgpt/` (placeholder)

## Browser

- Target: Firefox 109+ (MV3-capable)
- API wrapper: `packages/browser-adapters/firefox/` (placeholder)
- Extension ID: `browser_specific_settings.gecko.id` in `config/extensions/chatgpt/firefox/keys.json`

## How outputs flow

```
src/extensions/chatgpt/firefox/
        ↓
tools/product/extensions/chatgpt/firefox/build.mjs
        ↓
apps/extensions/chatgpt/firefox/<variant>/   (gitignored)
        ↓
Firefox about:debugging → Load Temporary Add-on
```

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
  — full multi-host/multi-browser architecture reference
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
  — current product map
