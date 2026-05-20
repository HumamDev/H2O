# src/extensions/chatgpt/firefox/ — minimal dev stub (Phase 8G-6)

ChatGPT on Firefox — first new-browser source root in the multi-host/multi-browser
architecture. As of Phase 8G-6 (2026-05-19) this contains a minimal proof-of-chain
stub: the full chain from `src/extensions/chatgpt/firefox/` → builder →
`apps/extensions/chatgpt/firefox/dev/` → Firefox `about:debugging` "Load
Temporary Add-on" is proven to work end-to-end.

**This is not the full ChatGPT Firefox port yet.** The content script only
logs a single console line and sets one data attribute on
`document.documentElement`. The chatgpt+chrome legacy runtime at the top
level (`src-runtime-base/` — renamed from `scripts/` in Phase 8K-5 — plus
`src-surfaces-base/` — renamed from `surfaces/` in Phase 8L-5 — plus
`config/`) is intentionally NOT reused here
— that's frozen for chatgpt+chrome only. The Firefox port grows fresh and
will eventually share logic through `packages/host-adapters/chatgpt/` +
`packages/browser-adapters/firefox/` once those packages have real code.

## What's here

```
src/extensions/chatgpt/firefox/
├── scripts/
│   └── content.js               minimal stub content script (chatgpt.com only)
├── surfaces/                    (empty — no UI surfaces yet)
├── config/
│   └── manifest.dev.json        Firefox MV3 manifest template for the dev variant
├── assets/                      (empty — no icons yet)
└── README.md                    this file
```

## Variants

| Variant | Status | Source manifest | Output | Firefox gecko_id |
|---|---|---|---|---|
| `dev` | ✅ stub | `config/manifest.dev.json` | `apps/extensions/chatgpt/firefox/dev/` | `h2o-chatgpt-dev-firefox@h2ocockpitpro.com` |
| `prod` | not yet | — | — | — |

The dev variant's gecko_id comes from `config/extensions/chatgpt/firefox/keys.json`
(Phase 8G-6). Firefox does NOT derive the ID from a public key — it uses the
gecko_id string verbatim.

## Build

```sh
node tools/product/extensions/chatgpt/firefox/build.mjs
# writes to apps/extensions/chatgpt/firefox/dev/ (gitignored)
```

## Load in Firefox (manual)

1. Build (above)
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `apps/extensions/chatgpt/firefox/dev/manifest.json`
5. Open `https://chatgpt.com/`
6. Confirm the DevTools console shows: `[H2O ChatGPT Firefox dev stub] loaded on chatgpt.com`
7. In the console, run `document.documentElement.dataset.h2oChatgptFirefoxDev` → should return `"loaded"`

Note: "Temporary Add-on" loads are removed when Firefox restarts. For
persistent installs an unsigned build needs Developer Edition / Nightly with
`xpinstall.signatures.required=false`, OR a signed `.xpi` from AMO.

## Host

- Target site: `https://chatgpt.com/*`
- DOM/event adapter: `packages/host-adapters/chatgpt/` (still a Phase 7D placeholder)

## Browser

- Target: Firefox 109+ (MV3-capable)
- API wrapper: `packages/browser-adapters/firefox/` (placeholder; not yet needed
  for this stub since the content script does not call `browser.*` APIs)
- Extension ID: `browser_specific_settings.gecko.id` injected from
  `config/extensions/chatgpt/firefox/keys.json`

## What's NOT in this stub

- No background service worker
- No identity / OAuth
- No Studio integration
- No content-script feature logic
- No popup / sidebar UI
- No storage usage
- No external network calls
- No build-time bundling
- No reuse of the chatgpt+chrome legacy source tree

Adding any of the above is a later phase.

## Where to read more

- [../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
- [../../../docs/architecture/PRODUCTS.md](../../../docs/architecture/PRODUCTS.md)
- [../../../tools/product/extensions/chatgpt/firefox/README.md](../../../tools/product/extensions/chatgpt/firefox/README.md)
  — the builder's README
