# tools/product/extensions/ — per-host/per-browser extension builders

Established in Phase 8G-2 (2026-05-19).

Each subdirectory hosts the build pipeline for one extension product:

```
tools/product/extensions/
├── _shared/                ← cross-host/cross-browser build helpers (future)
├── chatgpt/firefox/        ← builder for chatgpt+firefox
├── claude/chrome/          ← builder for claude+chrome
├── claude/firefox/         ← builder for claude+firefox
├── gemini/chrome/          ← builder for gemini+chrome
└── gemini/firefox/         ← builder for gemini+firefox
```

**Note**: `chatgpt/chrome/` builders currently live at
`tools/product/extensions/chatgpt/chrome/` (singular, top-level), `tools/product/extensions/chatgpt/chrome/`,
and `tools/product/extensions/chatgpt/chrome/`. Their move into
`tools/product/extensions/chatgpt/chrome/` is a future phase (8G-4 in the
proposed roadmap) with byte-equivalence proof. Until then, this subtree
is empty for chatgpt+chrome.

## Per-host/per-browser builder shape

```
tools/product/extensions/<host>/<browser>/
├── build.mjs                  ← parameterized entry point (variant via env var)
├── manifest.mjs               ← per-host manifest customization
├── pack-<specialty>.mjs       ← single-variant specialty builders (optional)
└── README.md                  ← per-host build instructions
```

## What goes in `_shared/`

Cross-host build helpers that aren't host-specific:

- `manifest-chrome.mjs` — Chrome MV3 manifest template
- `manifest-firefox.mjs` — Firefox MV3 manifest template (with `browser_specific_settings.gecko.id`)
- `icon-writer.mjs` — generic icon-pack-to-extension copier
- `key-generator.mjs` (Phase 8G-5) — RSA-2048 key + Chrome ID generator
- `template/` — copy-template-from for new host/browser combos

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
  — full architecture reference
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
  — current product map
