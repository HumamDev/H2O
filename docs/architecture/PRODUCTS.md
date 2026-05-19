# Cockpit Pro — Product Architecture Map

> **Purpose**: this document is the operator's index for "what produces what."
> For every runnable / generated output in this repo, it records the builder, the
> source inputs, the env-var gates, the output location, the Chrome extension ID
> (where applicable), and the validation command.
>
> Reading this file before touching the build pipeline is faster than tracing the
> dependencies by grep.

Last verified: 2026-05-19 (Phase 8G-7 — added gemini+chrome dev stub as product #11; total products now 15).

**Companion document**: [MULTI_HOST_ARCHITECTURE.md](MULTI_HOST_ARCHITECTURE.md)
— full reference for adding new hosts (claude, gemini) and new browsers
(firefox) without breaking the chatgpt+chrome legacy. Phase 8G-2 created the
folder skeleton; PRODUCTS.md (this file) covers the **current** state.

---

## 1. Conceptual layout

Cockpit Pro is organised around four top-level concerns. **This is a conceptual
grouping — the folders below are NOT physically merged under a `platform/`
umbrella** (per the Phase 8F discussion, scripts/ is frozen and cannot be moved;
see §6 "Do not move yet").

| Concept | Physical folders | Role |
|---|---|---|
| **Runtime source** ("platform") | `scripts/`, `surfaces/`, `config/`, parts of `assets/` | What ends up *inside* a built product. Loaded by the browser / Tauri / Expo at runtime. |
| **Build tooling** | `tools/` | Generators, validators, release/archive helpers. Reads from runtime source + config + assets; writes to apps/extensions. |
| **Generated / runnable products** | `apps/` | Outputs that an operator launches: chrome extensions, the Tauri desktop shell, the Expo mobile app, the marketing site, the dev server. |
| **Reusable libraries** | `packages/` | Workspace TS/JS packages consumed by apps + tools at build/runtime. |

Cross-cutting helpers (not products in themselves but referenced by builders):
`tools/script-registry.mjs`, `tools/paths.mjs`, `config/extension-keys.json`,
`config/loader-deps.json`, `config/dev-order.tsv`, `tools/loader/*` (alias farm +
proxy pack), `tools/product/identity/*`, `tools/product/billing/*`.

---

## 2. Master product table

Every product the repo currently builds, with its full chain.

| # | Product | Built by | Reads from | Output | Env-var gates | Extension ID | Validation |
|---|---|---|---|---|---|---|---|
| 1 | **Chrome / chatgpt / prod** | `tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs` | `scripts/`, `surfaces/`, `config/dev-order.tsv`, `config/loader-deps.json`, `assets/chrome-dev-controls-icons/`, `assets/chrome-dev-lean-icons/`, `tools/product/identity/*`, `tools/product/studio/pack-studio.mjs`, `config/local/identity-provider.local.json`, `config/extension-keys.json` | `apps/extensions/chatgpt/chrome/prod/` | `H2O_EXT_DEV_VARIANT=production` + `H2O_EXT_OUT_DIR=apps/extensions/chatgpt/chrome/prod` | `bgdapdcjckbiejckpfeinlmcdnijifpg` | `npm run dev:check`; `node tools/validation/identity/run-identity-release-gate.mjs` |
| 2 | **Chrome / chatgpt / dev-controls** | same | same | `apps/extensions/chatgpt/chrome/dev-controls/` | `H2O_EXT_DEV_VARIANT=controls` (default) + `H2O_EXT_OUT_DIR=...dev-controls` | `bkijejgemjjolmdnkgcimoaniocegkij` | same |
| 3 | **Chrome / chatgpt / dev-controls-armed** | same | same | `apps/extensions/chatgpt/chrome/dev-controls-armed/` | `H2O_EXT_DEV_VARIANT=controls` + `H2O_IDENTITY_PHASE_NETWORK=request_otp` + `H2O_EXT_OUT_DIR=...dev-controls-armed` | `ceenhihlkfdfjdolchjffpeejblnejdb` | same |
| 4 | **Chrome / chatgpt / dev-controls-oauth-google** | same | same | `apps/extensions/chatgpt/chrome/dev-controls-oauth-google/` | `H2O_EXT_DEV_VARIANT=controls` + `H2O_IDENTITY_PHASE_NETWORK=request_otp` + `H2O_IDENTITY_OAUTH_PROVIDER=google` + `H2O_EXT_OUT_DIR=...dev-controls-oauth-google` | `ogcjkeaiicglflamhjaaimdhphjlgkbb` ⚠ Supabase Auth coupling | `node tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs` |
| 5 | **Chrome / chatgpt / dev-lean** | same | same | `apps/extensions/chatgpt/chrome/dev-lean/` | `H2O_EXT_DEV_VARIANT=lean` + `H2O_EXT_OUT_DIR=...dev-lean` | `eeebgndgehjalflefaldogahaklnlahi` | same as #1 |
| 6 | **Chrome / chatgpt / studio-launcher** | same | `surfaces/studio/` + `assets/chrome-dev-lean-icons/` + `config/extension-keys.json` (no chatgpt.com content-script — Studio-only) | `apps/extensions/chatgpt/chrome/studio-launcher/` | `H2O_EXT_DEV_VARIANT=studio-launcher` + `H2O_EXT_OUT_DIR=...studio-launcher` | `bpobkkppdlldlkccaehmpfclmkhiemhg` | same as #1 |
| 7 | **Chrome / chatgpt / ops-panel** | `tools/product/extensions/chatgpt/chrome/pack-ops-panel.mjs` | `assets/chrome-ops-panel-icons/`, `config/extension-keys.json` | `apps/extensions/chatgpt/chrome/ops-panel/` | `H2O_PANEL_OUT_DIR=apps/extensions/chatgpt/chrome/ops-panel` | `golnehognopjlokldgcinoaliipodagb` | structural-only (no chatgpt.com integration) |
| 8 | **Chrome / chatgpt / desk** | `tools/product/extensions/chatgpt/chrome/pack-desk.mjs` | `surfaces/desk/`, `assets/surface-chrome-desk-icons/`, `config/extension-keys.json` | `apps/extensions/chatgpt/chrome/desk/` | none (writes to default `extensionBuildDir("desk")`) | `kfecaemfhhhjpecildjejapfemhakhha` | structural-only (MV3 side panel) |
| 9 | **Chrome / claude / dev** *(stub)* | `tools/product/extensions/claude/chrome/build.mjs` | `src/extensions/claude/chrome/{scripts,config}/`, `config/extensions/claude/chrome/keys.json` | `apps/extensions/claude/chrome/dev/` | `H2O_EXT_DEV_VARIANT=dev` (default) + optional `H2O_EXT_OUT_DIR` | `pdhldppkggpefneaemodleadcgpmpmnc` | manual: load unpacked → confirm `[H2O Claude Chrome dev stub]` console log on `claude.ai`; Phase 8G-5 proof-of-chain |
| 10 | **Firefox / chatgpt / dev** *(stub)* | `tools/product/extensions/chatgpt/firefox/build.mjs` | `src/extensions/chatgpt/firefox/{scripts,config}/`, `config/extensions/chatgpt/firefox/keys.json` | `apps/extensions/chatgpt/firefox/dev/` | `H2O_EXT_DEV_VARIANT=dev` (default) + optional `H2O_EXT_OUT_DIR` | Firefox `gecko_id`: `h2o-chatgpt-dev-firefox@h2ocockpitpro.com` (NOT a SHA256-of-key derivation; Firefox uses the string verbatim) | manual: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json` → confirm `[H2O ChatGPT Firefox dev stub]` console log on `chatgpt.com`; Phase 8G-6 proof-of-chain |
| 11 | **Chrome / gemini / dev** *(stub)* | `tools/product/extensions/gemini/chrome/build.mjs` | `src/extensions/gemini/chrome/{scripts,config}/`, `config/extensions/gemini/chrome/keys.json` | `apps/extensions/gemini/chrome/dev/` | `H2O_EXT_DEV_VARIANT=dev` (default) + optional `H2O_EXT_OUT_DIR` | `lmehehjmcjmnpndgehepcpggmpjcljkk` | manual: load unpacked → confirm `[H2O Gemini Chrome dev stub]` console log on `gemini.google.com`; Phase 8G-7 proof-of-chain |
| 12 | **Studio Desktop (Tauri V2)** | `npm --workspace @h2o/studio-desktop run prepare-dist` (copies built Studio assets) + `cd apps/studio/desktop && npm run tauri:dev` / `tauri:build` (Rust + Tauri) | `apps/extensions/chatgpt/chrome/prod/surfaces/studio/` (built first by #1) → copied into `apps/studio/desktop/dist/` | `apps/studio/desktop/dist/` (Tauri frontendDist) + Tauri app bundle in `apps/studio/desktop/src-tauri/target/` | none | n/a (Tauri app) | `npm --workspace @h2o/studio-desktop run prepare-dist` exit 0 |
| 13 | **Studio Mobile (Expo SDK 55, React Native)** | `cd apps/studio/mobile && npm start` (Metro) or `expo prebuild`/`expo run:ios` | `apps/studio/mobile/src/`, `packages/identity-core/`, `packages/studio-core/` | Native iOS/Android bundles via Expo | none | n/a | `cd apps/studio/mobile && npx tsc --noEmit --skipLibCheck` exit 0; `pod install` for iOS (UTF-8 env) |
| 14 | **Marketing site (Vite + React 19)** | `npm --workspace cockpit-pro-site run build` (Vite) | `apps/site/src/`, `apps/site/public/` | `apps/site/dist/` (deployed to Cloudflare Pages) | none | n/a | `npm --workspace cockpit-pro-site run build` exit 0 |
| 15 | **Dev server (Python HTTP, port 5500)** | `cd apps/dev-server && python3 serve.py 5500` | `apps/dev-server/alias/` (regenerated by `tools/loader/make-aliases.mjs`), `apps/dev-server/dev_output/proxy/_paste-pack.ext.txt` (regenerated by `tools/loader/make-ext-proxy-pack.mjs`), `scripts/` (referenced via alias-farm symlinks) | HTTP at `http://127.0.0.1:5500/alias/{aliasId}?v={ts}` + `/dev_output/proxy/_paste-pack.ext.txt` | `H2O_SERVER_DIR=apps/dev-server` (default; env-overridable) | n/a | `npm run dev:check` (alias farm + proxy pack consistency) |

### Embedded sub-products (shipped *inside* extensions, not standalone)

These are produced as part of variants #1–6 above. They have no independent
build output, but they have their own source + builder for traceability.

| Sub-product | Built by | Reads from | Embedded at | Notes |
|---|---|---|---|---|
| **Identity provider bundle (Supabase)** | `tools/product/identity/build-identity-provider-bundle.mjs` (esbuild) | `tools/product/identity/identity-provider-supabase.entry.mjs`, `packages/identity-core/`, `config/local/identity-provider.local.json` | `<ext-out>/provider/identity-provider-supabase.js` | Built into every variant that has chatgpt.com content-script (all 6 chrome-live variants); not in ops-panel or desk |
| **Identity surfaces** | `tools/product/identity/pack-identity.mjs` (file-copy) | `surfaces/identity/identity.html` + `scripts/0D4a.⬛️🔐 Identity Core 🔐.js` | `<ext-out>/surfaces/identity/identity.html` + script | Same scope as identity bundle |
| **Studio surfaces (extension-embedded)** | `tools/product/studio/pack-studio.mjs` (file-copy) | `surfaces/studio/*` (60 S-prefix files) | `<ext-out>/surfaces/studio/` | Embedded in `prod` and `studio-launcher`; consumed by Studio Desktop (#9) too |
| **Billing provider bundle (Supabase)** | `tools/product/billing/billing-provider-supabase.entry.mjs` (esbuild, similar to identity) | source entry + Supabase config | `<ext-out>/provider/billing-provider-supabase.js` | Only in variants that have billing; same env-gating as identity |
| **Dev-controls popup** | `tools/product/extensions/chatgpt/chrome/popup/chrome-live-popup-{html,css,js,view,data}.mjs` | (generated text) | `<ext-out>/popup.{html,css,js}` | Only when `DEV_HAS_CONTROLS` (i.e., variants with `H2O_EXT_DEV_VARIANT=controls`) |
| **Folder bridge page** | `tools/product/extensions/chatgpt/chrome/chrome-live-folder-bridge.mjs` | (generated text) | `<ext-out>/folder-bridge-page.js` | All chatgpt.com-injecting variants |
| **Pilot observer page** | `tools/product/extensions/chatgpt/chrome/chrome-live-pilot-observer.mjs` | (generated text) | `<ext-out>/pilot-observer-page.js` | All chatgpt.com-injecting variants |
| **Extension icons (per variant)** | `tools/product/extensions/chatgpt/chrome/write-extension-icons.mjs` | `assets/<icon-pack-dir>/` (chrome-dev-controls-icons, chrome-dev-lean-icons, etc.) | `<ext-out>/icons/icon{16,32,48,128}.png` + larger panel icons | Per-variant icon pack mapping in build-context |

---

## 3. Flow diagram

```
                                 ┌─────────────────────────────────────────┐
                                 │      RUNTIME SOURCE ("platform")        │
                                 │                                         │
                                 │   scripts/    surfaces/    config/      │
                                 │   ─────────   ──────────   ────────     │
                                 │   149         desk/        dev-order    │
                                 │   userscripts identity/    loader-deps  │
                                 │   (FROZEN)    studio/      ext-keys     │
                                 │                                         │
                                 │   + assets/<icon-packs>/                │
                                 │   + packages/{identity-core,studio-*}/  │
                                 └────────────────────┬────────────────────┘
                                                      │
                                                      ▼
       ┌──────────────────────────────────────────────────────────────────────────────┐
       │                              BUILD TOOLING (tools/)                          │
       │                                                                              │
       │   tools/product/extensions/chatgpt/chrome/  ──┐                                              │
       │   tools/product/extensions/chatgpt/chrome/        ─┤                                              │
       │   tools/product/studio/      ─┼──► tools/loader/  (alias farm + proxy pack)  │
       │   tools/product/identity/    ─┤    tools/validation/                         │
       │   tools/product/billing/     ─┤    tools/release/                            │
       │   tools/dev-controls/        ─┤    tools/archive/                            │
       │   tools/paths.mjs            ─┤    tools/git/                                │
       │                              ─┘                                              │
       └──────────────────────────────┬───────────────────────────────────────────────┘
                                      │
                                      ▼
       ┌──────────────────────────────────────────────────────────────────────────────┐
       │                      GENERATED / RUNNABLE PRODUCTS (apps/)                   │
       │                                                                              │
       │   apps/extensions/chatgpt/chrome/{prod, dev-controls, dev-controls-armed,    │
       │                                   dev-controls-oauth-google, dev-lean,       │
       │                                   ops-panel, studio-launcher, desk}/         │
       │                          → loaded into Chrome via chrome://extensions        │
       │                                                                              │
       │   apps/studio/desktop/dist/ + apps/studio/desktop/src-tauri/target/          │
       │                          → Tauri V2 desktop app                              │
       │                                                                              │
       │   apps/studio/mobile/                                                        │
       │                          → Expo SDK 55 (iOS + Android via Metro)             │
       │                                                                              │
       │   apps/site/dist/                                                            │
       │                          → Cloudflare Pages (marketing site)                 │
       │                                                                              │
       │   apps/dev-server/ (Python HTTP at 127.0.0.1:5500)                           │
       │                          → serves alias farm + proxy pack to extensions     │
       │                                                                              │
       │   apps/extensions/{chatgpt/firefox, claude/{chrome,firefox},                 │
       │                    gemini/{chrome,firefox}}/  → Phase 7D placeholders        │
       └──────────────────────────────────────────────────────────────────────────────┘
```

Future host/browser combinations: when (e.g.) a Firefox build is added, its
output will land under `apps/extensions/chatgpt/firefox/<variant>/`. The Phase
7D placeholder READMEs reserve those locations.

---

## 4. Operator quick reference

| Task | Command |
|---|---|
| Build the OAuth-Google variant | `H2O_EXT_DEV_VARIANT=controls H2O_IDENTITY_PHASE_NETWORK=request_otp H2O_IDENTITY_OAUTH_PROVIDER=google H2O_EXT_OUT_DIR=apps/extensions/chatgpt/chrome/dev-controls-oauth-google node tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs` |
| Build the Lean variant | `H2O_EXT_DEV_VARIANT=lean H2O_EXT_OUT_DIR=apps/extensions/chatgpt/chrome/dev-lean node tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs` |
| Build the Prod variant | `H2O_EXT_DEV_VARIANT=production H2O_EXT_OUT_DIR=apps/extensions/chatgpt/chrome/prod node tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs` |
| Build Ops Panel | `H2O_PANEL_OUT_DIR=apps/extensions/chatgpt/chrome/ops-panel node tools/product/extensions/chatgpt/chrome/pack-ops-panel.mjs` |
| Build Desk | `node tools/product/extensions/chatgpt/chrome/pack-desk.mjs` |
| Build all (.vscode tasks) | See `.vscode/tasks.json` labels starting with `H2O: 2)` (DEV), `H2O: 3)` (OPS PANEL / DESK), `H2O: 4)` (BOTH), `H2O: #)` (one-button) |
| Start dev server | `cd apps/dev-server && python3 serve.py 5500` |
| Run Studio Desktop | `cd apps/studio/desktop && npm run tauri:dev` |
| Start Studio Mobile | `cd apps/studio/mobile && npm start` (Metro) |
| Build marketing site | `npm --workspace cockpit-pro-site run build` |
| Snapshot archive (outer-shell after 8C) | `H2O_ARCHIVE_DIR=/Users/.../cockpit-pro/archive npm run archive:snap` |
| Verify loader order | `node tools/loader/validate-loader-order.mjs` |
| Run identity release gates | `node tools/validation/identity/run-identity-release-gate.mjs` |

---

## 5. Architectural rules

These hold for all current code and any new code:

1. **`tools/paths.mjs` is the single source of truth for repo-level paths.** New
   builders MUST import constants from there. Folder moves only edit this one
   file.
2. **`config/extension-keys.json` is the single source of truth for Chrome
   extension manifest keys + derived IDs.** Per Phase 8A-1, all 8 variant
   manifests include `"key"` from this file; Chrome IDs are key-derived and
   path-independent.
3. **`apps/extensions/<host>/<browser>/<variant>/`** is the canonical generated
   output root for every unpacked extension. Phase 4C-B established this; Phase
   8E-3 removed the legacy `build/chrome-ext-*` symlink bridge.
4. **`scripts/`, `supabase/` are frozen.** No filename changes, no `@h2o-id`
   changes, no relocations. See MIGRATION.md §4.
5. **Outer-workspace-shell items** (`archive/`, `references/`, `s-files/`,
   `tmp/`, `plans/`, `operator-notes/`, `.claude/`) live under
   `cockpit-pro/<item>/`, NOT inside the repo. `archive/` is env-gated via
   `H2O_ARCHIVE_DIR` (Phase 8C). See MIGRATION.md §2.1.
6. **Every new tool refactor requires byte-equivalent proof.** Deterministic
   extension build hash must remain stable across the change (locked
   `H2O_BUILD_TS=9999999999999`). Current baseline:
   `77bd47cf904c6e4b2b9062a90d8e2faaa62393d79eebfe2f105a217a64a46e8a`
   (NUL-safe relative-path form on the dev-controls variant; see Phase 8A-1
   row in MIGRATION.md §1 for the recipe).

---

## 6. Do not move yet

For each item, the constraint that pins it in place.

| Folder | Why it must stay |
|---|---|
| `scripts/` | Filenames are coupled to: load order in `config/dev-order.tsv` (146 entries); `config/loader-deps.json` runtime-order invariants (MiniMap 1A1e-before-1A1b, etc.); 50+ daily archive snapshots in outer `cockpit-pro/archive/`; `versions.csv` release log; alias farm symlinks in `apps/dev-server/alias/` (relative `../../../scripts/...`); `LEGACY_ALIAS_COMPAT` map in `make-aliases.mjs`; doc-comment refs throughout `tools/`. See MIGRATION.md §4 forever-forbidden list. |
| `surfaces/` | Path is referenced by `tools/product/identity/pack-identity.mjs` (`surfaces/identity/`), `tools/product/extensions/chatgpt/chrome/pack-desk.mjs` (`surfaces/desk/`), `tools/product/studio/pack-studio.mjs` (`surfaces/studio/`). The Identity Core script also hardcodes `chrome.runtime.getURL('surfaces/identity/identity.html')` (see MIGRATION.md §8 #1 — extension-runtime path is shipped to installed extensions). |
| `config/` | Read by every loader / build tool via `tools/paths.mjs` constants (`CONFIG_DIR`, `DEV_ORDER_TSV`, `LOADER_DEPS_JSON`, `LOADER_TIERS_JSON`, `CONFIG_LOCAL_DIR`, etc.). Also the home of `config/extension-keys.json` (Phase 8A-1) and `config/local/identity-provider.local.json` (operator-only). |
| `supabase/` | Stripe webhook URL is bound to deployed function names. `supabase/.temp/linked-project.json` is local-only state. See MIGRATION.md §3.3 + §4. |
| `apps/extensions/chatgpt/chrome/<variant>/` | These are the **canonical** generated extension outputs (Phase 4C-B) and the path Chrome loads from. Build pipeline writes here by default via `tools/paths.mjs::extensionBuildDir()`. |
| `tools/` (top-level) | Cross-cutting helpers (`loader/`, `release/`, `archive/`, `versioning/`, `git/`, `validation/`) are not per-product and should stay top-level. Only the product-specific subdirectories under `tools/` are candidates for the §7 cleanup. |

---

## 7. Future cleanup candidates (not authorised)

Each is an audit-only suggestion. Requires explicit operator authorisation per
phase.

| # | Proposal | Rationale | Risk |
|---|---|---|---|
| 7.1 | `tools/product/extensions/chatgpt/chrome/` → `tools/product/ops-panel/` | All 8 chrome variants would live under `tools/product/<product>/`. Removes the asymmetry where 7 builders live in `tools/product/` and 1 lives in `tools/dev-controls/`. | Low. One folder rename, ~4 path updates (the builder's relative imports + .vscode/tasks.json + identity validators that mention the path + this PRODUCTS.md). No env-var or output-path changes. |
| 7.2 | `tools/product/extensions/chatgpt/chrome/` → `tools/product/extensions/chatgpt/chrome/` | Mirror the `apps/extensions/<host>/<browser>/<variant>/` shape on the tooling side, so adding (e.g.) `tools/product/extensions/claude/firefox/` is natural. | Medium. Many import paths to update across the build pipeline; many doc-comment refs across validators. Worth the work only when a second host/browser actually gets built. |
| 7.3 | Document a `platform/` *concept* without moving anything | Add a `docs/architecture/PLATFORM.md` clarifying that `scripts/`+`surfaces/`+`config/` is the runtime-source quadrant. Strictly docs. | Zero risk; pure clarification. |
| 7.4 | `tools/product/billing/` → consider parallelism with `tools/product/identity/` (it's already there but only has the entry file) | Match identity's structure if billing grows. | Wait for the actual second consumer. |
| 7.5 | Phase 7G-3 (`H2O_META_DIR` + `meta/` outer-shell move) | Already planned. Independent of this PRODUCTS.md work. | Low (per Phase 7G audit). |

These are **not authorised** by Phase 8F-1. They are recorded here so future
phase planning has a starting point.

---

## 8. How this document is maintained

Update this file when any of these change:

- A new product variant is added (new chrome-ext variant, new app, new host/browser).
- A builder moves (e.g. `tools/product/extensions/chatgpt/chrome/` → `tools/product/ops-panel/`).
- The canonical output path for any product changes.
- A new env-var gate is added.
- The Chrome extension ID rotates (e.g. if `config/extension-keys.json` is regenerated).
- The deterministic build hash baseline shifts (intentional refactor).

The MIGRATION.md phase table remains the historical record. PRODUCTS.md is the
**current-state** map. Old states do not need to remain in this file.
