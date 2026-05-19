# tools/product/extensions/gemini/firefox/ — Gemini Firefox builder (Phase 8G-9)

Builds the H2O Gemini Firefox extension. Final new host+browser combo in the
scaffolding cycle. Clone of Phase 8G-6 (chatgpt+firefox) + Phase 8G-8
(claude+firefox) with HOST="gemini".

## What's here

| File | Purpose |
|---|---|
| `build.mjs` | Entry point — reads source from `src/extensions/gemini/firefox/`, injects `browser_specific_settings.gecko.id` from `config/extensions/gemini/firefox/keys.json`, writes to `apps/extensions/gemini/firefox/<variant>/`. |
| `README.md` | This file. |

## Build commands

```sh
node tools/product/extensions/gemini/firefox/build.mjs
# (forward-compatible)
H2O_EXT_DEV_VARIANT=dev node tools/product/extensions/gemini/firefox/build.mjs
# (custom out)
H2O_EXT_OUT_DIR=/tmp/gemini-firefox-dev node tools/product/extensions/gemini/firefox/build.mjs
```

## Default output

```
apps/extensions/gemini/firefox/dev/
├── manifest.json     (MV3, includes browser_specific_settings.gecko)
├── content.js        (the minimal stub content script)
└── README.txt        (operator-facing what-is-this note + load instructions)
```

All output is **gitignored**.

## Firefox extension ID

`h2o-gemini-dev-firefox@h2ocockpitpro.com` — taken verbatim from
[`../../../../config/extensions/gemini/firefox/keys.json`](../../../../config/extensions/gemini/firefox/keys.json).

## Manual load (Firefox)

1. Build: `node tools/product/extensions/gemini/firefox/build.mjs`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `apps/extensions/gemini/firefox/dev/manifest.json`
5. Open `https://gemini.google.com/`
6. DevTools console → `[H2O Gemini Firefox dev stub] loaded on gemini.google.com`

## Sibling builders (all 5 new combos)

- [`../chrome/`](../chrome/) — Phase 8G-7 gemini+chrome (same host, Chrome SPKI-key pattern)
- [`../../chatgpt/firefox/`](../../chatgpt/firefox/) — Phase 8G-6 chatgpt+firefox (different host, same Firefox pattern)
- [`../../claude/firefox/`](../../claude/firefox/) — Phase 8G-8 claude+firefox (different host, same Firefox pattern)
- [`../../claude/chrome/`](../../claude/chrome/) — Phase 8G-5 claude+chrome (different host, Chrome pattern)
- [`../../chatgpt/chrome/`](../../chatgpt/chrome/) — Phase 8G-4 chatgpt+chrome legacy (full production pipeline)

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../../docs/architecture/PRODUCTS.md](../../../../docs/architecture/PRODUCTS.md)
- [../../../../src/extensions/gemini/firefox/README.md](../../../../src/extensions/gemini/firefox/README.md)
