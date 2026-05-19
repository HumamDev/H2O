# tools/product/extensions/gemini/chrome/ — Gemini Chrome builder (Phase 8G-7)

Builds the H2O Gemini Chrome extension. As of Phase 8G-7 (2026-05-19), this
folder contains a minimal proof-of-chain stub builder mirroring the Phase 8G-5
claude+chrome pattern.

## What's here

| File | Purpose |
|---|---|
| `build.mjs` | Entry point — reads source from `src/extensions/gemini/chrome/`, injects manifest key from `config/extensions/gemini/chrome/keys.json`, writes to `apps/extensions/gemini/chrome/<variant>/`. |
| `README.md` | This file. |

## Build commands

```sh
# Build the dev variant (default)
node tools/product/extensions/gemini/chrome/build.mjs

# Explicit variant (forward-compatible; today only 'dev' exists)
H2O_EXT_DEV_VARIANT=dev node tools/product/extensions/gemini/chrome/build.mjs

# Custom output dir
H2O_EXT_OUT_DIR=/tmp/gemini-chrome-dev node tools/product/extensions/gemini/chrome/build.mjs
```

## Default output

```
apps/extensions/gemini/chrome/dev/
├── manifest.json     (MV3, includes Phase 8A-1-style manifest key)
├── content.js        (the minimal stub content script)
└── README.txt        (operator-facing what-is-this note)
```

All output is **gitignored** (`apps/extensions/gemini/chrome/**` in
`.gitignore`, with the existing Phase 7D `README.md` placeholder kept tracked).

## Extension ID

`lmehehjmcjmnpndgehepcpggmpjcljkk` — derived from
[`../../../../config/extensions/gemini/chrome/keys.json`](../../../../config/extensions/gemini/chrome/keys.json)
via the same SHA256-of-SPKI-public-key scheme Chrome uses (path-agnostic).

## Manual load (Chrome)

1. Build: `node tools/product/extensions/gemini/chrome/build.mjs`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. "Load unpacked" → select `apps/extensions/gemini/chrome/dev/`
5. Open `https://gemini.google.com/`
6. Open DevTools console → look for `[H2O Gemini Chrome dev stub] loaded on gemini.google.com`

## Sibling builders

- [`../../claude/chrome/`](../claude/chrome/) — Phase 8G-5 claude+chrome (same Chrome pattern)
- [`../../chatgpt/firefox/`](../chatgpt/firefox/) — Phase 8G-6 chatgpt+firefox (Firefox pattern)
- [`../../chatgpt/chrome/`](../chatgpt/chrome/) — Phase 8G-4 chatgpt+chrome legacy (full production pipeline)

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../../docs/architecture/PRODUCTS.md](../../../../docs/architecture/PRODUCTS.md)
- [../../../../src/extensions/gemini/chrome/README.md](../../../../src/extensions/gemini/chrome/README.md)
