# tools/product/extensions/chatgpt/firefox/ — ChatGPT Firefox builder (Phase 8G-6)

Builds the H2O ChatGPT Firefox extension. As of Phase 8G-6 (2026-05-19), this
folder contains a minimal proof-of-chain stub builder (`build.mjs`) that
produces a single `dev` variant.

## What's here

| File | Purpose |
|---|---|
| `build.mjs` | Entry point — reads source from `src/extensions/chatgpt/firefox/`, injects `browser_specific_settings.gecko.id` from `config/extensions/chatgpt/firefox/keys.json`, writes to `apps/extensions/chatgpt/firefox/<variant>/`. |
| `README.md` | This file. |

## Build commands

```sh
# Build the dev variant (default)
node tools/product/extensions/chatgpt/firefox/build.mjs

# Explicit variant (forward-compatible; today only 'dev' exists)
H2O_EXT_DEV_VARIANT=dev node tools/product/extensions/chatgpt/firefox/build.mjs

# Custom output dir
H2O_EXT_OUT_DIR=/tmp/chatgpt-firefox-dev node tools/product/extensions/chatgpt/firefox/build.mjs
```

## Default output

```
apps/extensions/chatgpt/firefox/dev/
├── manifest.json     (MV3, includes browser_specific_settings.gecko.id)
├── content.js        (the minimal stub content script)
└── README.txt        (operator-facing what-is-this note + load instructions)
```

All output is **gitignored** (`apps/extensions/chatgpt/firefox/**` in
`.gitignore`, with the existing Phase 7D `README.md` placeholder kept tracked
via `!apps/extensions/chatgpt/firefox/README.md`).

## How this differs from the chatgpt+chrome builders

The chatgpt+chrome builders at
[`../chrome/`](../chrome/) read from the **legacy top-level**
`src-runtime-base/` (renamed from `scripts/` in Phase 8K-5),
`src-surfaces-base/` (renamed from `surfaces/` in Phase 8L-5),
`config/` (frozen) and produce 8 production variants with full
identity / Studio / popup integration. They're complex because they ship a
real product.

This Firefox builder is intentionally tiny and standalone. It reads from
`src/extensions/chatgpt/firefox/` (the new per-host/per-browser source root)
and outputs a single dev variant. It has no dependencies on the
chatgpt+chrome legacy pipeline. The shared cross-host helpers (manifest
templates, icon writer, popup, identity bundle) will graduate into
`tools/product/extensions/_shared/` or `packages/` when a second consumer
needs them.

## How this differs from the claude+chrome builder

| Concern | chrome (claude/chrome) | firefox (chatgpt/firefox — this one) |
|---|---|---|
| ID derivation | SHA256 of base64 SPKI public key in `keys.json::variants.<v>.key` | String `keys.json::variants.<v>.gecko_id`, injected verbatim |
| Manifest field | `key` (base64) | `browser_specific_settings.gecko.id` |
| Min version | n/a (Chrome MV3 supported widely) | `browser_specific_settings.gecko.strict_min_version = "109.0"` |
| Load procedure | `chrome://extensions` → "Load unpacked" | `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on..." → select **manifest.json** |
| Persistence | Survives Chrome restart | "Temporary" — removed on Firefox restart unless signed |

## Firefox extension ID

The dev variant's Firefox ID is **`h2o-chatgpt-dev-firefox@h2ocockpitpro.com`**
— taken verbatim from
[`../../../../config/extensions/chatgpt/firefox/keys.json`](../../../../config/extensions/chatgpt/firefox/keys.json).
Firefox uses this string directly; there is no key-derivation step.

The ID is **path-agnostic** (same as Phase 8A-1 for chatgpt+chrome): loading
the extension from a different filesystem path does not change the ID.

## Manual load (Firefox)

1. Build: `node tools/product/extensions/chatgpt/firefox/build.mjs`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `apps/extensions/chatgpt/firefox/dev/manifest.json`
5. Open `https://chatgpt.com/`
6. Open DevTools console → look for `[H2O ChatGPT Firefox dev stub] loaded on chatgpt.com`

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../../docs/architecture/PRODUCTS.md](../../../../docs/architecture/PRODUCTS.md)
- [../../../../src/extensions/chatgpt/firefox/README.md](../../../../src/extensions/chatgpt/firefox/README.md)
  — the source-side README
- [../claude/chrome/README.md](../claude/chrome/README.md) — the claude+chrome
  builder (Phase 8G-5 sibling)
