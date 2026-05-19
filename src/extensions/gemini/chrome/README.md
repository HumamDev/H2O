# src/extensions/gemini/chrome/ — FUTURE PLACEHOLDER

Gemini on Chrome — source root for a future H2O Gemini extension targeting
the Chrome browser. Not yet implemented.

## When this gets populated

This folder fills in when Gemini support is added to the H2O product line.
This is a green-field source root — there is no Gemini legacy to copy from.

Shared primitives come from [`../../_shared/`](../../_shared/) and/or from
`packages/host-adapters/gemini/` + `packages/browser-adapters/chrome/`
(Phase 7D placeholders ready to consume).

## Expected source-tree shape

```
gemini/chrome/
├── scripts/        runtime scripts injected into gemini.google.com
├── surfaces/       HTML/JS surfaces packaged inside the extension
├── config/         loader/build config (variants, dev-order, deps)
├── assets/         icons, images
└── README.md       this file
```

## Host

- Target site: `https://gemini.google.com/*`
- DOM/event adapter: `packages/host-adapters/gemini/` (placeholder)
- Note: gemini.google.com is Google-account-context-dependent; identity flow
  may differ from chatgpt/claude OAuth patterns.

## Browser

- Target: Chrome (MV3)
- API namespace: `chrome.*` direct
- Extension ID: SHA256 of SPKI public key in `config/extensions/gemini/chrome/keys.json`

## How outputs flow

```
src/extensions/gemini/chrome/
        ↓
tools/product/extensions/gemini/chrome/build.mjs
        ↓
apps/extensions/gemini/chrome/<variant>/    (gitignored)
        ↓
Chrome chrome://extensions → Load unpacked
```

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
