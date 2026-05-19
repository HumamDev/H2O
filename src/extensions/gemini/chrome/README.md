# src/extensions/gemini/chrome/ — minimal dev stub (Phase 8G-7)

Gemini on Chrome — third new-host source root in the multi-host/multi-browser
architecture. As of Phase 8G-7 (2026-05-19) this contains a minimal
proof-of-chain stub matching the Phase 8G-5 (claude+chrome) pattern.

**This is not a real Gemini integration yet.** The content script only logs
a single console line and sets one data attribute on `document.documentElement`.

## What's here

```
src/extensions/gemini/chrome/
├── scripts/
│   └── content.js               minimal stub content script (gemini.google.com only)
├── surfaces/                    (empty — no UI surfaces yet)
├── config/
│   └── manifest.dev.json        MV3 manifest template for the dev variant
├── assets/                      (empty — no icons yet)
└── README.md                    this file
```

## Variants

| Variant | Status | Source manifest | Output | Chrome ID |
|---|---|---|---|---|
| `dev` | ✅ stub | `config/manifest.dev.json` | `apps/extensions/gemini/chrome/dev/` | `lmehehjmcjmnpndgehepcpggmpjcljkk` |
| `prod` | not yet | — | — | — |

ID derivation: same Phase 8A-1 scheme as chatgpt+chrome / claude+chrome —
SHA256 of the SPKI public key in `config/extensions/gemini/chrome/keys.json`,
first 16 bytes hex, mapped 0-9a-f → a-p.

## Build

```sh
node tools/product/extensions/gemini/chrome/build.mjs
# writes to apps/extensions/gemini/chrome/dev/ (gitignored)
```

## Load in Chrome (manual)

1. Build (above)
2. `chrome://extensions` → enable Developer mode
3. "Load unpacked" → select `apps/extensions/gemini/chrome/dev/`
4. Open `https://gemini.google.com/`
5. Confirm the DevTools console shows: `[H2O Gemini Chrome dev stub] loaded on gemini.google.com`
6. Confirm `document.documentElement.dataset.h2oGeminiChromeDev` is `"loaded"`

## Host

- Target site: `https://gemini.google.com/*`
- DOM/event adapter: `packages/host-adapters/gemini/` (still a Phase 7D placeholder)
- Note: gemini.google.com runs in Google account context; identity flow will
  differ from chatgpt/claude OAuth patterns (probably uses the existing Google
  session via `chrome.identity.getAuthToken` rather than a Web-App OAuth flow).

## Browser

- Target: Chrome (MV3)
- API namespace: `chrome.*` direct
- Extension ID: derived from `config/extensions/gemini/chrome/keys.json`

## What's NOT in this stub

Same as the claude+chrome and chatgpt+firefox stubs — no background, no
identity, no Studio, no popup, no storage, no network, no Cockpit Pro features.

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
- [../../../tools/product/extensions/gemini/chrome/README.md](../../../tools/product/extensions/gemini/chrome/README.md)
- Sibling stubs (Phase 8G-5 + 8G-6):
  - [`../../claude/chrome/README.md`](../../claude/chrome/README.md)
  - [`../../chatgpt/firefox/README.md`](../../chatgpt/firefox/README.md)
