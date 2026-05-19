# tools/product/extensions/claude/firefox/ — Claude Firefox builder (Phase 8G-8)

Builds the H2O Claude Firefox extension. Combines the Phase 8G-5 (claude+chrome,
new-host) and Phase 8G-6 (chatgpt+firefox, new-browser) patterns.

## What's here

| File | Purpose |
|---|---|
| `build.mjs` | Entry point — reads source from `src/extensions/claude/firefox/`, injects `browser_specific_settings.gecko.id` from `config/extensions/claude/firefox/keys.json`, writes to `apps/extensions/claude/firefox/<variant>/`. |
| `README.md` | This file. |

## Build commands

```sh
node tools/product/extensions/claude/firefox/build.mjs
# (forward-compatible) H2O_EXT_DEV_VARIANT=dev node tools/product/extensions/claude/firefox/build.mjs
# (custom out)         H2O_EXT_OUT_DIR=/tmp/claude-firefox-dev node tools/product/extensions/claude/firefox/build.mjs
```

## Default output

```
apps/extensions/claude/firefox/dev/
├── manifest.json     (MV3, includes browser_specific_settings.gecko)
├── content.js        (the minimal stub content script)
└── README.txt        (operator-facing what-is-this note + load instructions)
```

All output is **gitignored**.

## Firefox extension ID

`h2o-claude-dev-firefox@h2ocockpitpro.com` — taken verbatim from
[`../../../../config/extensions/claude/firefox/keys.json`](../../../../config/extensions/claude/firefox/keys.json).
Firefox uses this string directly; no key-derivation step.

## Manual load (Firefox)

1. Build: `node tools/product/extensions/claude/firefox/build.mjs`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `apps/extensions/claude/firefox/dev/manifest.json`
5. Open `https://claude.ai/`
6. Open DevTools console → look for `[H2O Claude Firefox dev stub] loaded on claude.ai`

## Sibling builders

- [`../chrome/`](../chrome/) — Phase 8G-5 claude+chrome (same host, Chrome SPKI-key pattern)
- [`../../chatgpt/firefox/`](../../chatgpt/firefox/) — Phase 8G-6 chatgpt+firefox (different host, same Firefox pattern)
- [`../../gemini/chrome/`](../../gemini/chrome/) — Phase 8G-7 gemini+chrome (different host, Chrome pattern)
- [`../../chatgpt/chrome/`](../../chatgpt/chrome/) — Phase 8G-4 chatgpt+chrome legacy (full production pipeline)

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../../docs/architecture/PRODUCTS.md](../../../../docs/architecture/PRODUCTS.md)
- [../../../../src/extensions/claude/firefox/README.md](../../../../src/extensions/claude/firefox/README.md)
