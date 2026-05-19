# src/extensions/gemini/firefox/ — minimal dev stub (Phase 8G-9)

Gemini on Firefox — final new host+browser combo in the multi-host/multi-browser
architecture. As of Phase 8G-9 (2026-05-19) all 5 new combos have proof-of-chain
stubs in place. This one is the mechanical clone of Phase 8G-6 (chatgpt+firefox)
+ Phase 8G-8 (claude+firefox) pattern applied to `gemini.google.com`.

**This is not a real Gemini Firefox port yet.** The content script only logs
a single console line and sets one data attribute on `document.documentElement`.

## What's here

```
src/extensions/gemini/firefox/
├── scripts/
│   └── content.js               minimal stub content script (gemini.google.com only)
├── surfaces/                    (empty)
├── config/
│   └── manifest.dev.json        Firefox MV3 manifest template for the dev variant
├── assets/                      (empty)
└── README.md                    this file
```

## Variants

| Variant | Status | Source manifest | Output | Firefox gecko_id |
|---|---|---|---|---|
| `dev` | ✅ stub | `config/manifest.dev.json` | `apps/extensions/gemini/firefox/dev/` | `h2o-gemini-dev-firefox@h2ocockpitpro.com` |
| `prod` | not yet | — | — | — |

Identity scheme: Firefox `browser_specific_settings.gecko.id` (Phase 8G-6
pattern). String injected verbatim; no key derivation.

## Build

```sh
node tools/product/extensions/gemini/firefox/build.mjs
# writes to apps/extensions/gemini/firefox/dev/ (gitignored)
```

## Load in Firefox (manual)

1. Build (above)
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `apps/extensions/gemini/firefox/dev/manifest.json`
5. Open `https://gemini.google.com/`
6. Confirm DevTools console: `[H2O Gemini Firefox dev stub] loaded on gemini.google.com`
7. `document.documentElement.dataset.h2oGeminiFirefoxDev === "loaded"`

## Host

- Target site: `https://gemini.google.com/*`
- DOM/event adapter: `packages/host-adapters/gemini/` (Phase 7D placeholder; shared with `gemini/chrome/`)
- gemini.google.com runs in Google account context; identity handling will differ from chatgpt/claude OAuth patterns

## Browser

- Target: Firefox 109+ (MV3-capable)
- API wrapper: `packages/browser-adapters/firefox/` (placeholder)
- Extension ID: `browser_specific_settings.gecko.id` from `config/extensions/gemini/firefox/keys.json`

## What's NOT in this stub

Same as the four prior stubs — no background, no identity, no Studio, no
popup, no storage, no network, no Cockpit Pro features.

## Sibling stubs (all 5 new combos now scaffolded)

| Combo | Phase | README |
|---|---|---|
| chatgpt+chrome (legacy) | pre-migration | `apps/extensions/chatgpt/chrome/README.md` |
| claude+chrome | 8G-5 | [`../chrome/README.md`](../chrome/README.md) (wait — wrong; see below) |
| chatgpt+firefox | 8G-6 | [`../../chatgpt/firefox/README.md`](../../chatgpt/firefox/README.md) |
| gemini+chrome | 8G-7 | [`../chrome/README.md`](../chrome/README.md) |
| claude+firefox | 8G-8 | [`../../claude/firefox/README.md`](../../claude/firefox/README.md) |
| gemini+firefox (this) | 8G-9 | THIS FILE |

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
- [../../../tools/product/extensions/gemini/firefox/README.md](../../../tools/product/extensions/gemini/firefox/README.md)
