# src/extensions/claude/firefox/ — minimal dev stub (Phase 8G-8)

Claude on Firefox — fourth proof-of-chain stub in the multi-host/multi-browser
architecture. Combines the Phase 8G-5 new-host pattern (claude) with the Phase
8G-6 new-browser pattern (firefox). As of Phase 8G-8 (2026-05-19) this is a
minimal stub matching the established template.

**This is not a real Claude Firefox port yet.** The content script only logs a
single console line and sets one data attribute on `document.documentElement`.

## What's here

```
src/extensions/claude/firefox/
├── scripts/
│   └── content.js               minimal stub content script (claude.ai only)
├── surfaces/                    (empty — no UI surfaces yet)
├── config/
│   └── manifest.dev.json        Firefox MV3 manifest template for the dev variant
├── assets/                      (empty — no icons yet)
└── README.md                    this file
```

## Variants

| Variant | Status | Source manifest | Output | Firefox gecko_id |
|---|---|---|---|---|
| `dev` | ✅ stub | `config/manifest.dev.json` | `apps/extensions/claude/firefox/dev/` | `h2o-claude-dev-firefox@h2ocockpitpro.com` |
| `prod` | not yet | — | — | — |

Identity scheme: same Firefox `browser_specific_settings.gecko.id` pattern as
chatgpt+firefox (Phase 8G-6). Firefox uses the string verbatim — no key
derivation.

## Build

```sh
node tools/product/extensions/claude/firefox/build.mjs
# writes to apps/extensions/claude/firefox/dev/ (gitignored)
```

## Load in Firefox (manual)

1. Build (above)
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `apps/extensions/claude/firefox/dev/manifest.json`
5. Open `https://claude.ai/`
6. Confirm the DevTools console shows: `[H2O Claude Firefox dev stub] loaded on claude.ai`
7. In the console, run `document.documentElement.dataset.h2oClaudeFirefoxDev` → should return `"loaded"`

Note: "Temporary Add-on" loads are removed when Firefox restarts. For
persistent installs an unsigned build needs Developer Edition / Nightly with
`xpinstall.signatures.required=false`, OR a signed `.xpi` from AMO.

## Host

- Target site: `https://claude.ai/*`
- DOM/event adapter: `packages/host-adapters/claude/` (still a Phase 7D placeholder; shared with `claude/chrome/`)

## Browser

- Target: Firefox 109+ (MV3-capable)
- API wrapper: `packages/browser-adapters/firefox/` (placeholder; not yet needed for this stub)
- Extension ID: `browser_specific_settings.gecko.id` injected from `config/extensions/claude/firefox/keys.json`

## What's NOT in this stub

Same as the three prior stubs — no background, no identity, no Studio, no
popup, no storage, no network, no Cockpit Pro features.

## Sibling stubs

- [`../chrome/README.md`](../chrome/README.md) — Phase 8G-5 claude+chrome (Chrome-key pattern, same host)
- [`../../chatgpt/firefox/README.md`](../../chatgpt/firefox/README.md) — Phase 8G-6 chatgpt+firefox (Firefox pattern, different host)
- [`../../gemini/chrome/README.md`](../../gemini/chrome/README.md) — Phase 8G-7 gemini+chrome (Chrome-key pattern, different host)

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
- [../../../tools/product/extensions/claude/firefox/README.md](../../../tools/product/extensions/claude/firefox/README.md)
