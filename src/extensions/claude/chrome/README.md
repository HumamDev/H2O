# src/extensions/claude/chrome/ — minimal dev stub (Phase 8G-5)

Claude on Chrome — first new-host source root in the multi-host/multi-browser
architecture. As of Phase 8G-5 (2026-05-19) this contains a minimal
proof-of-chain stub: the full chain from `src/extensions/claude/chrome/` →
builder → `apps/extensions/claude/chrome/dev/` → Chrome `Load unpacked` is
proven to work end-to-end.

**This is not a real Claude integration yet.** The content script only logs a
single console line and sets one data attribute on `document.documentElement`.
Real Cockpit Pro feature implementation for Claude happens in later phases.

## What's here

```
src/extensions/claude/chrome/
├── scripts/
│   └── content.js               minimal stub content script (claude.ai only)
├── surfaces/                    (empty — no UI surfaces yet)
├── config/
│   └── manifest.dev.json        MV3 manifest template for the dev variant
├── assets/                      (empty — no icons yet)
└── README.md                    this file
```

## Variants

| Variant | Status | Source manifest | Output | Chrome ID |
|---|---|---|---|---|
| `dev` | ✅ stub | `config/manifest.dev.json` | `apps/extensions/claude/chrome/dev/` | `pdhldppkggpefneaemodleadcgpmpmnc` |
| `prod` | not yet | — | — | — |

The dev variant ID comes from `config/extensions/claude/chrome/keys.json` (Phase
8G-5) — same key-derivation scheme as Phase 8A-1 for chatgpt+chrome.

## Build

```sh
node tools/product/extensions/claude/chrome/build.mjs
# writes to apps/extensions/claude/chrome/dev/ (gitignored)
```

## Load in Chrome (manual)

1. Build (above)
2. `chrome://extensions` → enable Developer mode
3. "Load unpacked" → select `apps/extensions/claude/chrome/dev/`
4. Open `https://claude.ai/`
5. Confirm the DevTools console shows: `[H2O Claude Chrome dev stub] loaded on claude.ai`
6. Confirm `document.documentElement.dataset.h2oClaudeChromeDev` is `"loaded"`

## Host

- Target site: `https://claude.ai/*`
- DOM/event adapter: `packages/host-adapters/claude/` (still a Phase 7D placeholder; real adapter implemented later)

## Browser

- Target: Chrome (MV3)
- API namespace: `chrome.*` direct
- Extension ID: derived from `config/extensions/claude/chrome/keys.json`

## What's NOT in this stub

- No background service worker
- No identity / OAuth
- No Studio integration
- No content-script feature logic
- No popup / sidebar UI
- No storage usage
- No external network calls
- No build-time bundling (esbuild etc.) — pure file-copy + manifest injection

Adding any of the above is a later phase.

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
- [../../../tools/product/extensions/claude/chrome/README.md](../../../tools/product/extensions/claude/chrome/README.md)
  — the builder's README
