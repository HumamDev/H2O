# tools/product/extensions/claude/chrome/ — Claude Chrome builder (Phase 8G-5)

Builds the H2O Claude Chrome extension. As of Phase 8G-5 (2026-05-19), this
folder contains a minimal proof-of-chain stub builder (`build.mjs`) that
produces a single `dev` variant.

## What's here

| File | Purpose |
|---|---|
| `build.mjs` | Entry point — reads source from `src/extensions/claude/chrome/`, injects manifest key from `config/extensions/claude/chrome/keys.json`, writes to `apps/extensions/claude/chrome/<variant>/`. |
| `README.md` | This file. |

## Build commands

```sh
# Build the dev variant (default)
node tools/product/extensions/claude/chrome/build.mjs

# Explicit variant (forward-compatible; today only 'dev' exists)
H2O_EXT_DEV_VARIANT=dev node tools/product/extensions/claude/chrome/build.mjs

# Custom output dir (rare; for byte-equivalence testing or sandboxed builds)
H2O_EXT_OUT_DIR=/tmp/claude-chrome-dev node tools/product/extensions/claude/chrome/build.mjs
```

## Default output

```
apps/extensions/claude/chrome/dev/
├── manifest.json     (MV3, includes Phase 8A-1-style manifest key)
├── content.js        (the minimal stub content script)
└── README.txt        (operator-facing what-is-this note)
```

All output is **gitignored** (`apps/extensions/claude/chrome/**` in `.gitignore`,
with the existing `apps/extensions/claude/chrome/README.md` placeholder kept
tracked via `!apps/extensions/claude/chrome/README.md`).

## How this differs from chatgpt+chrome builders

The chatgpt+chrome builders at
[`../../chatgpt/chrome/`](../chatgpt/chrome/) read from the **legacy
top-level** `src-runtime-base/` (renamed from `scripts/` in Phase 8K-5),
`surfaces/`, `config/` (frozen). They also pull in the
identity provider bundle, billing bundle, Studio surfaces, popup generators,
and 8 variant outputs. They're complex because they ship a real product.

This Claude builder reads from `src/extensions/claude/chrome/` (the new
per-host source root) and outputs a single dev variant. It has no
dependencies on the chatgpt+chrome legacy pipeline. The shared cross-host
helpers will graduate into `tools/product/extensions/_shared/` or `packages/`
when a second consumer needs them — until then, this stub builder is
deliberately tiny and standalone.

## Extension ID

The dev variant's Chrome ID is **`pdhldppkggpefneaemodleadcgpmpmnc`** —
derived from the SPKI public key in
[`../../../../config/extensions/claude/chrome/keys.json`](../../../../config/extensions/claude/chrome/keys.json)
via the same `sha256(SPKI)[:16]` → `a-p` character map Chrome uses.

The ID is **path-agnostic**: it does NOT change if the unpacked extension is
loaded from a different filesystem path. Same scheme as Phase 8A-1 for the
chatgpt+chrome variants.

## Manual load (Chrome)

1. Build: `node tools/product/extensions/claude/chrome/build.mjs`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. "Load unpacked" → select `apps/extensions/claude/chrome/dev/`
5. Open `https://claude.ai/`
6. Open DevTools console → look for `[H2O Claude Chrome dev stub] loaded on claude.ai`

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../../docs/architecture/PRODUCTS.md](../../../../docs/architecture/PRODUCTS.md)
- [../../../../src/extensions/claude/chrome/README.md](../../../../src/extensions/claude/chrome/README.md)
  — the source-side README
