# Multi-Host / Multi-Browser Architecture

> **Status**: Established in Phase 8G-2 (2026-05-19). The folder skeleton exists;
> chatgpt+chrome legacy populates the top-level frozen folders, and as of
> Phase 8G-5 (2026-05-19) `src/extensions/claude/chrome/` holds the first
> minimal proof-of-chain stub (a dev variant content script that runs on
> claude.ai). All other host/browser source roots are still empty.
>
> **Purpose**: This document is the canonical reference for how Cockpit Pro
> grows from the current single-product reality (chatgpt+chrome with 8 variants)
> into a multi-host (chatgpt + claude + gemini) and multi-browser (chrome +
> firefox) product family — **without** breaking the validated chatgpt+chrome
> legacy runtime.
>
> Read this before adding a new host, a new browser, or a new shared module.

---

## 1. The four-quadrant model

Cockpit Pro is organized around four physically distinct concerns. **`platform/`
is NOT a physical folder** — it is a conceptual label for the runtime-source
quadrant. The actual physical layout is:

| Quadrant | Where | What lives here |
|---|---|---|
| **Source (what you write)** | `scripts/`, `surfaces/`, `config/`, `src/`, `packages/`, `assets/` | Hand-written runtime, UI, config, libraries |
| **Build tooling** | `tools/` | Generators, validators, release/archive helpers |
| **Generated outputs** | `apps/extensions/<host>/<browser>/<variant>/`, `apps/studio/*/dist/`, `apps/site/dist/` | What builders produce; what you load into Chrome/Firefox/Tauri |
| **Workspace apps with their own source** | `apps/studio/{desktop,mobile}/`, `apps/site/`, `apps/dev-server/` | Self-contained apps with tracked source + generated outputs co-located |

The line is enforced by `.gitignore`: every `apps/extensions/<host>/<browser>/`
subtree except its `README.md` placeholder is gitignored. You can verify the
boundary at any time:

```sh
git ls-files src/                              # tracked source you wrote
git ls-files apps/extensions/                  # only README.md placeholders
```

---

## 2. Legacy vs new — the two source patterns

Cockpit Pro currently has **two source patterns** that coexist:

### 2.1 Legacy chatgpt+chrome (top-level, frozen)

The original Cockpit Pro extension was built as a single chatgpt+chrome product.
Its source lives at the **top level** of the repo:

```
h2o-cp-source/
├── scripts/        146 emoji-named userscripts, load-order-coupled
├── surfaces/       desk/, identity/, studio/ HTML+JS surfaces
├── config/         dev-order.tsv, loader-deps.json, loader-tiers.json
└── assets/         chrome-*-icons/ packs
```

**These are frozen** by the migration (MIGRATION.md §4):

- Renaming any file in `scripts/` cascades through `config/dev-order.tsv`,
  `config/loader-deps.json`, the alias farm at `apps/dev-server/alias/`,
  archive history under `cockpit-pro/archive/` (~50 daily snapshots), the
  `LEGACY_ALIAS_COMPAT` map, `versions.csv` release log, and identity
  validators. The freeze exists because these couplings are fragile.
- The chatgpt+chrome legacy builders (`tools/product/extensions/chatgpt/chrome/*` + `pack-desk`
  + `make-chrome-ops-panel-extension`) read directly from these top-level
  folders. They will continue to do so.

**Do not move these folders. Do not propose unfreezing them in any phase plan.**
Add new chatgpt+chrome features to them following the existing load-order
convention (numeric ID prefix + tier prefix in filename).

### 2.2 New per-host/per-browser source (Phase 8G-2)

Every NEW host+browser combination uses a fresh, self-contained source root
under `src/extensions/<host>/<browser>/`:

```
src/
└── extensions/
    ├── _shared/                ← incubator for cross-host code
    │   ├── browser/            cross-browser API wrapper
    │   ├── dom/                shared MutationObserver / selector helpers
    │   ├── overlay/            popup / tooltip primitives
    │   └── storage/            chrome.storage / browser.storage abstraction
    ├── chatgpt/firefox/        ChatGPT on Firefox (new)
    ├── claude/chrome/          Claude on Chrome (new)
    ├── claude/firefox/         Claude on Firefox (new)
    ├── gemini/chrome/          Gemini on Chrome (new)
    └── gemini/firefox/         Gemini on Firefox (new)
```

Each `src/extensions/<host>/<browser>/` is a self-contained source tree with
its own `scripts/`, `surfaces/`, `config/`, and `assets/` subdirs. Adding a
new host/browser combo is a copy-template operation.

### 2.3 Why two patterns

The asymmetry is the cost of preserving the chatgpt+chrome legacy runtime.
The alternative — refactoring the 146 scripts into `src/extensions/chatgpt/chrome/`
— is weeks of risky work that buys nothing functional. The legacy works; new
products use the new pattern; shared logic graduates from `src/extensions/_shared/`
into `packages/` over time.

---

## 3. Glossary — exact meaning of every top-level folder

| Folder | Meaning |
|---|---|
| `scripts/` | **Legacy chatgpt+chrome runtime userscripts.** 146 emoji-named files loaded by the chrome+chatgpt loader. Frozen. Add new chatgpt+chrome features here following the existing convention. |
| `surfaces/` | **Legacy chatgpt+chrome UI sources.** HTML+JS surfaces shipped inside chatgpt+chrome extension builds. Frozen. |
| `config/` | **Loader + build configuration.** Contains the frozen chatgpt+chrome runtime configs (`dev-order.tsv`, `loader-deps.json`, `loader-tiers.json`) + Phase 8A-1 Chrome keys (`extension-keys.json`) + operator-local secrets (`local/`). New per-host configs go under `config/extensions/<host>/<browser>/`. |
| `assets/` | **Static asset packs** (PNG icons, etc.). The current packs are chatgpt+chrome-named (`chrome-dev-controls-icons/`, etc.). New host/browser packs should go under `assets/extensions/<host>/<browser>/` to avoid name collision. |
| `src/` | **NEW per-host/per-browser source root.** Only contains `src/extensions/<host>/<browser>/` subtrees + the `_shared/` incubator. Chatgpt+chrome legacy is NOT under here — it stays at the top level. |
| `packages/` | **Workspace TypeScript/JS libraries.** Imported via workspace package names (`@h2o/identity-core`, `studio-core`, etc.). Place here when code is mature, multi-consumer, and benefits from versioning. |
| `tools/` | **Build, validation, release, archive, and version helpers.** Per-product builders live under `tools/product/extensions/<host>/<browser>/`. Cross-cutting helpers stay top-level. |
| `apps/` | **Runnable / generated products.** Always operator-launchable. Extensions land at `apps/extensions/<host>/<browser>/<variant>/` (gitignored outputs). Studio Desktop/Mobile/site/dev-server are workspace apps with tracked source + generated outputs co-located. |
| `docs/` | Project documentation, including this file. |
| `supabase/` | Backend (Stripe webhook, identity, billing migrations). Frozen — see MIGRATION.md §4. |

---

## 4. Source vs Generated — the bright line

| What you wrote | Where it lives | Tracked in git? |
|---|---|---|
| chatgpt+chrome legacy runtime | `scripts/` | ✅ yes |
| chatgpt+chrome legacy UI | `surfaces/` | ✅ yes |
| chatgpt+chrome legacy config | `config/dev-order.tsv`, etc. | ✅ yes |
| Per-host/per-browser new source | `src/extensions/<host>/<browser>/` | ✅ yes |
| Shared incubator code | `src/extensions/_shared/` | ✅ yes |
| Workspace libs | `packages/` | ✅ yes |
| Build tools | `tools/` | ✅ yes |
| Documentation | `docs/` | ✅ yes |
| Stripe/Supabase backend | `supabase/` | ✅ yes |
| **Generated unpacked extensions** | `apps/extensions/<host>/<browser>/<variant>/` | ❌ gitignored (`apps/extensions/chatgpt/chrome/**` rule; new combos add their own rules as needed) |
| **Generated Tauri build** | `apps/studio/desktop/dist/`, `apps/studio/desktop/src-tauri/target/` | ❌ gitignored |
| **Generated site build** | `apps/site/dist/` | ❌ gitignored |
| **Generated alias farm + proxy pack** | `apps/dev-server/alias/`, `apps/dev-server/dev_output/` | ❌ gitignored |
| node_modules, caches | various | ❌ gitignored |

**Operator check**:

```sh
# All these MUST return only README.md or .gitkeep files (or empty):
git ls-files apps/extensions/
git ls-files apps/studio/desktop/dist apps/studio/desktop/src-tauri/target
git ls-files apps/site/dist
git ls-files apps/dev-server/alias apps/dev-server/dev_output
```

If any of these returns generated artifacts, the boundary has been broken.

---

## 5. Multi-host scaling strategy

Adding a new host (e.g., perplexity, mistral, you-name-it) is mechanical:

1. **Source root** — copy `src/extensions/_template/` (when it exists) to
   `src/extensions/<host>/<browser>/`. Or copy an existing claude/chrome
   skeleton.
2. **Host adapter** — implement `packages/host-adapters/<host>/` (the Phase 7D
   placeholder is ready). DOM selectors, event observers, conversation parsing.
3. **Builder** — copy `tools/product/extensions/_template/build.mjs` (when it
   exists) to `tools/product/extensions/<host>/<browser>/build.mjs`. Edit imports.
4. **Extension keys/IDs** — generate Chrome keys + Firefox gecko IDs:
   - Chrome: run the key generator (TBD in Phase 8G-5) → `config/extensions/<host>/<browser>/keys.json`
   - Firefox: pick a gecko ID (format `h2o-<host>-<variant>-firefox@h2ocockpitpro.com`)
5. **Output dir** — already reserved via `apps/extensions/<host>/<browser>/README.md`
   (Phase 7D placeholder). Builder auto-creates the variant subdirs.
6. **VS Code task** (optional) — copy a task block, swap paths.

The shared adapter pattern: every host's source root imports from
`packages/host-adapters/<host>/` + `packages/browser-adapters/<browser>/` +
`packages/extension-core/`. The builder injects the right adapters at build time.

---

## 6. Multi-browser scaling strategy

Chrome (MV3) and Firefox (MV3 with quirks) differ on these axes:

| Concern | Chrome | Firefox | Strategy |
|---|---|---|---|
| Extension ID | SHA256(SPKI public key) from manifest `key` | `browser_specific_settings.gecko.id` (string) | Two ID systems; both tracked in per-host `config/extensions/<host>/<browser>/keys.json` |
| Background | `service_worker: "bg.js"` | `service_worker` (MV3 from Firefox 109+); has lifecycle quirks | Same bg.js source; manifest template differs per browser |
| API namespace | `chrome.*` | `browser.*` (also supports `chrome.*` for compat) | `src/extensions/_shared/browser/` provides a thin polyfill or use webextension-polyfill |
| Content scripts | `content_scripts` array | Identical schema | Same source |
| Web-accessible resources | MV3 schema | MV3 schema | Identical |
| Permissions | `permissions`, `host_permissions`, `optional_host_permissions` | Same | Identical |
| Manifest min version | `manifest_version: 3` | `manifest_version: 3` (Firefox 109+) | Firefox manifests set `strict_min_version: "109.0"` |
| Popup | `action.default_popup` | Same | Identical |
| Side panel | `side_panel.default_path` (chrome 114+) | **Not supported** — uses `sidebar_action` | Per-browser conditional logic in manifest generator |
| identity.launchWebAuthFlow | `chrome.identity.launchWebAuthFlow` | `browser.identity.launchWebAuthFlow` | Use `_shared/browser/` polyfill or per-call conditional |
| Storage | `chrome.storage` | `browser.storage` | Same |

**Recommended pattern**:
- One source per host (`src/extensions/<host>/<browser>/scripts/`)
- One manifest template per browser (`tools/product/extensions/_shared/manifest-chrome.mjs`, `manifest-firefox.mjs`)
- Builder composes: host source + browser manifest + browser API shim → output

---

## 7. Shared incubator strategy (`src/extensions/_shared/`)

`src/extensions/_shared/` is an **incubator** for cross-host/cross-browser code
that's not yet stable enough to become a workspace package.

### 7.1 What lives here

| Subdir | Intent |
|---|---|
| `_shared/browser/` | Cross-browser WebExtension API wrapper (`chrome.*` vs `browser.*` polyfill, feature detection) |
| `_shared/dom/` | Shared MutationObserver helpers, selector utilities, chat-thread parsers (generic patterns) |
| `_shared/overlay/` | Tooltip / overlay / popup primitives (no host-specific styling) |
| `_shared/storage/` | Storage abstraction (chrome.storage / browser.storage / GM_setValue fallback) |

### 7.2 What does NOT live here

- Anything host-specific (lives under `src/extensions/<host>/<browser>/`)
- Anything truly mature with stable APIs and ≥2 consumers (graduates to `packages/`)
- chatgpt+chrome legacy code (stays in `scripts/`)

### 7.3 Graduation path: `_shared/` → `packages/`

When a module in `_shared/` meets ALL these criteria, graduate it:

1. **Stable API** — the public function signatures haven't changed in 4+ weeks.
2. **≥2 real consumers** — at least 2 different `src/extensions/<host>/<browser>/`
   builds depend on it.
3. **Versionable** — the module can be semver'd independently without breaking
   consumers.
4. **No tight coupling** — does not import from any specific host or browser.

Graduation steps:

1. Create `packages/<module>/` with `package.json`.
2. Move the code from `src/extensions/_shared/<module>/` to `packages/<module>/`.
3. Add to root `package.json` workspaces list.
4. `npm install` (regenerates symlinks).
5. Update import sites in consumer `src/extensions/<host>/<browser>/` trees.

Until graduation, consumers import via relative path:
```js
import { X } from "../../../_shared/dom/observer.js";
```

After graduation:
```js
import { X } from "@h2o/<module>";
```

---

## 8. Tooling architecture: `tools/product/extensions/<host>/<browser>/`

The terminal builder layout mirrors the source layout:

```
tools/product/extensions/
├── _shared/                   ← cross-host build helpers (manifest templates, icon writer, etc.)
├── chatgpt/
│   ├── chrome/                ← (future) — current builders at tools/product/extensions/chatgpt/chrome/ + pack-desk + ops-panel will move here in a future phase
│   └── firefox/               ← NEW chatgpt+firefox builder
├── claude/
│   ├── chrome/                ← NEW
│   └── firefox/               ← NEW
└── gemini/
    ├── chrome/                ← NEW
    └── firefox/                ← NEW
```

Per-host/per-browser builder folder shape:

```
tools/product/extensions/<host>/<browser>/
├── build.mjs                  ← parameterized entry point (variant via env var)
├── manifest.mjs               ← per-host manifest customization on top of _shared/manifest-<browser>.mjs
├── pack-<specialty>.mjs       ← single-variant specialty builders if needed
└── README.md                  ← per-host build instructions
```

The current chatgpt+chrome builders live at `tools/product/extensions/chatgpt/chrome/`,
`tools/product/extensions/chatgpt/chrome/`, `tools/product/extensions/chatgpt/chrome/`. **Their move into
`tools/product/extensions/chatgpt/chrome/` is a separate phase** (8G-4
in the proposed roadmap) with byte-equivalence proof. Do NOT preemptively
move them in 8G-2.

---

## 9. Future output structure

Already established by Phase 4C-B + 8E-3:

```
apps/extensions/<host>/<browser>/<variant>/
```

- `apps/extensions/chatgpt/chrome/<variant>/` — current 8 variants
- `apps/extensions/chatgpt/firefox/<variant>/` — future
- `apps/extensions/claude/<browser>/<variant>/` — future
- `apps/extensions/gemini/<browser>/<variant>/` — future

Each `apps/extensions/<host>/<browser>/` already has a tracked `README.md`
placeholder (Phase 7D). The variant subdirs are gitignored — generated by
builders, never tracked.

---

## 10. Naming conventions

### 10.1 Variant naming

Per host+browser, use the chatgpt+chrome 8-variant convention as a template:

| Class | Examples |
|---|---|
| Production | `prod` |
| Dev (full controls) | `dev-controls`, `dev-controls-armed`, `dev-controls-oauth-google` |
| Dev (minimal) | `dev-lean` |
| Specialty | `ops-panel`, `studio-launcher`, `desk` |

A new host+browser typically starts with: `dev`, `prod`. Add specialty variants
only when a real use case appears.

### 10.2 Environment variables

Pattern: `H2O_<DOMAIN>_<KNOB>`.

Path overrides:
- `H2O_SRC_DIR`, `H2O_SERVER_DIR`, `H2O_ARCHIVE_DIR`

Extension build:
- `H2O_EXT_DEV_VARIANT`, `H2O_EXT_OUT_DIR`, `H2O_EXT_MATCH`,
  `H2O_EXT_PROXY_PACK_URL`, `H2O_EXT_HOST_PERMS`
- Future: `H2O_EXT_HOST` ∈ {chatgpt, claude, gemini}, `H2O_EXT_BROWSER` ∈ {chrome, firefox}

Identity:
- `H2O_IDENTITY_PHASE_NETWORK`, `H2O_IDENTITY_OAUTH_PROVIDER`

Build determinism:
- `H2O_BUILD_TS`, `H2O_ALIAS_MODE`, `H2O_SKIP_REV_STAMP`

### 10.3 Extension key + Firefox ID naming

Today (chatgpt+chrome only):
- `config/extension-keys.json` — flat `{ variants: { <variant>: { key, id } } }`

For new host+browser combos:
- `config/extensions/<host>/<browser>/keys.json` — per-host/per-browser file
- Chrome variants: `{ <variant>: { key: <base64-SPKI>, id: <derived-id> } }`
- Firefox variants: `{ <variant>: { gecko_id: "h2o-<host>-<variant>-firefox@h2ocockpitpro.com" } }`

Firefox gecko ID format: lowercase, host-variant-browser segments, organizational
domain suffix. Email-style or UUID; this project uses email-style for readability.

### 10.4 Builder naming

- `pack-<variant>.mjs` for single-output builders (like the current `pack-desk.mjs`)
- `build-<context>.mjs` for parameterized multi-output builders (like the current
  `build-chrome-live-extension.mjs`)
- `build.mjs` as the canonical entry point under each `tools/product/extensions/<host>/<browser>/` folder

### 10.5 Output naming

Already established: `apps/extensions/<host>/<browser>/<variant>/`. Don't deviate.

---

## 11. Risk + rollback

For every phase that moves files or adds source:

| Risk | Mitigation |
|---|---|
| Deterministic build hash drift | Compute with `H2O_BUILD_TS=9999999999999` against `apps/extensions/chatgpt/chrome/dev-controls`-named `OUT_DIR` before AND after. Hash must match `77bd47cf904c6e4b2b9062a90d8e2faaa62393d79eebfe2f105a217a64a46e8a`. |
| Chrome extension ID rotation | All 8 chatgpt+chrome IDs are key-derived (Phase 8A-1). They survive folder renames. New variants get new keys generated when added. |
| OAuth-Google Supabase coupling | The `ogcjkeaiicglflamhjaaimdhphjlgkbb` ID is registered in Supabase Auth. Phase 8A-1 made this path-independent. Future changes must keep this key stable in `config/extension-keys.json`. |
| `scripts/` cascading break | Don't touch `scripts/`. Period. |
| `surfaces/identity/identity.html` path | Hardcoded in `scripts/0D4a.⬛️🔐 Identity Core 🔐.js` via `chrome.runtime.getURL`. Path must remain `surfaces/identity/identity.html` inside built extensions forever. |

Rollback for scaffolding phases: `git reset --hard <pre-phase-tag>` reverses
empty-folder + README + .gitkeep additions completely.

---

## 12. How to add a new host+browser (mechanical checklist)

1. Create source folder:
   ```sh
   mkdir -p src/extensions/<host>/<browser>/{scripts,surfaces,config,assets}
   ```

2. Create builder folder:
   ```sh
   mkdir -p tools/product/extensions/<host>/<browser>
   ```

3. Add a README to each, pointing back to this document.

4. Generate extension keys/IDs (Phase 8G-5+ will provide a generator):
   - Chrome: `node tools/product/extensions/_shared/generate-chrome-key.mjs <host> <browser> <variant>`
   - Firefox: hand-edit `config/extensions/<host>/<browser>/keys.json` to add gecko_id

5. Confirm the placeholder output dir README exists:
   ```sh
   ls apps/extensions/<host>/<browser>/README.md
   ```

6. Implement the build chain. Run it:
   ```sh
   H2O_EXT_HOST=<host> H2O_EXT_BROWSER=<browser> \
     H2O_EXT_DEV_VARIANT=dev H2O_EXT_OUT_DIR=apps/extensions/<host>/<browser>/dev \
     node tools/product/extensions/<host>/<browser>/build.mjs
   ```

7. Load in browser:
   - Chrome: `chrome://extensions` → "Load unpacked"
   - Firefox: `about:debugging` → "Load Temporary Add-on" → select `manifest.json`

8. Verify ID matches `keys.json`.

9. (Optional) Add a VS Code task block to `.vscode/tasks.json`.

10. (Optional) Add a release-gate validator under `tools/validation/<host>/<browser>/`.

---

## 13. Cross-references

- [PRODUCTS.md](PRODUCTS.md) — current product map (what produces what; per-product builder + IDs + validation)
- [../migration/MIGRATION.md](../migration/MIGRATION.md) — full migration history; §1 phase table; §2 repo topology; §2.1 outer-workspace-shell; §4 forever-forbidden operations; §8 known danger areas
- [../../config/extension-keys.json](../../config/extension-keys.json) — chatgpt+chrome public keys + IDs (Phase 8A-1)
- `apps/extensions/<host>/<browser>/README.md` — Phase 7D placeholders for future combos
- `packages/host-adapters/<host>/README.md`, `packages/browser-adapters/<browser>/README.md` — Phase 7D adapter placeholders ready to consume
