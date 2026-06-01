# Migration Map — Native Library UI → Desktop Studio

Replacement table for every Native ChatGPT Library UI surface that
R4.7 retires.

## Canonical Studio module IDs

The Native UI surfaces are replaced by the following Desktop Studio
modules (committed in R4.5.x):

| Studio module ID | File | R4.5 slice | Role |
|---|---|---|---|
| **S0F3b** | `S0F3b. 🎬 Folders Actions - Studio.js` | R4.4 | Folders write API (create/rename/update/remove/bindChat/unbindChat) |
| **S0F4b** | `S0F4b. 🎬 Categories Actions - Studio.js` | R4.1 | Categories write API |
| **S0F5b** | `S0F5b. 🎬 Tags Actions - Studio.js` | R4.3 | Tag CATALOG write API (no extraction) |
| **S0F6b** | `S0F6b. 🎬 Labels Actions - Studio.js` | R4.2 | Labels write API |
| **S0F1m** | `S0F1m. 🎬 Library Organization Modals - Studio.js` | R4.5.1.a–R4.5.3 | `openFolderEditor` / `openCategoryEditor` / `openLabelEditor` / `openTagEditor` UI surfaces |
| **S0F1n** | `S0F1n. 🎬 Library Batch Toolbar - Studio.js` | R4.5.4 | Multi-select batch operations toolbar |
| **S0Z1g** | `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` | R4.5.1.a–R4.5.3 | Sidebar rendering + Desktop-conditional re-wiring of rename/delete handlers |

## Surface-by-surface mapping

### Library workspace + button

| Native (retiring in R4.7.2) | Replacement |
|---|---|
| Native Library sidebar BUTTON (0F1b `UI_LIBRARY_TOP_BUTTON`, `UI_LIBRARY_RAIL_BUTTON`) | Desktop Studio's top-level navigation entry |
| Native `/library` route | Desktop Studio `#/library/dashboard`, `#/library/explorer`, `#/library/recents`, `#/library/saved`, `#/library/folders`, `#/library/folder/<id>` (handled by studio.js parseHash + renderRoute) |
| Native Dashboard workspace page (0F1b `mountPage`, `renderWorkspaceBody`) | Desktop Studio Dashboard surface in S0F1d |
| Native Explorer + Analytics tabs (0F1d) | `S0F1d. 🎬 Library Insights - Studio.js` |
| R4.6.1 deprecation banner | Removed (banner exists only to announce the deprecation; with UI physically retired, there is nothing to wrap or restore-link to) |

### Folders

| Native (retiring in R4.7.3) | Replacement |
|---|---|
| Native folders sidebar list rendering (`UI_FSECTION_FOLDER_ROW`, `UI_FSECTION_FOLDER_MORE`) | `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` folders section |
| Native folder context-menu rename/color/delete | `S0F1m. 🎬 Library Organization Modals - Studio.js`'s `openFolderEditor({mode: 'rename' \| 'color' \| 'delete'})` |
| Native folder-create canonical panel UI | `S0F1m`'s `openFolderEditor({mode: 'create'})` |
| Native folder-create logic (`STORE_validateFolderCreate`) | **STAYS in 0F3a** — Desktop Studio R4.5.1.a Chrome MV3 fallback path still calls it via S0Z1g openFolderCreatePanel |
| Native folder-row "more" action button | `S0Z1g` sidebar item menu + `S0F1m` modals |
| `ENGINE_injectAddToLibrary` (chat-row capture menu) | **STAYS in 0F3a** — Native capture path; never retired |
| `ENGINE_injectAddToFolder` (chat-row capture menu) | **STAYS in 0F3a** — Native capture path; never retired |

### Categories

| Native (retiring in R4.7.2) | Replacement |
|---|---|
| Native categories sidebar section (`UI_FSECTION_CATEGORIES_ROOT = 'flsc-categories-root'`) | `S0Z1g` categories section |
| Native category rename/delete UI | `S0F1m`'s `openCategoryEditor({mode: 'rename' \| 'delete'})` |
| Native category-create UI | `S0F1m`'s `openCategoryEditor({mode: 'create'})` |
| `H2O.archiveBoot.renameCategory` / `deleteCategory` / `createCategory` call sites | **STAY in 0F4a** — Studio Chrome MV3 fallback path still calls them via S0Z1g |
| The underlying `H2O.archiveBoot.*` function definitions (in 0D3a) | **NEVER retired** — Studio Desktop + MV3 both depend on archiveBoot |

### Labels

| Native (retiring in R4.7.2) | Replacement |
|---|---|
| Native labels sidebar section (`UI_LABELS_ROOT = 'lbsc-root'`) | `S0Z1g` labels section |
| Native label rename/delete UI | `S0F1m`'s `openLabelEditor({mode: 'rename' \| 'color' \| 'delete'})` |
| Native label-create UI | `S0F1m`'s `openLabelEditor({mode: 'create'})` |
| Native label rows + label "more" buttons | `S0Z1g` sidebar item menu + `S0F1m` modals |
| `function renameLabel` / `deleteLabel` / `createLabel` (top-level in 0F6a) | **STAY in 0F6a** — Studio Chrome MV3 fallback calls `H2O.Labels.renameLabel` etc.; the functions must remain exported |
| Per-turn `lbsc-chip-color` chip UI | **NEVER retired** — chip-color is part of the turn-level UI that ships alongside tag extraction |

### Tags

| Native (turn-level extraction — stays forever) | Replacement |
|---|---|
| Turn-level tag extraction (MutationObserver, conversation-turn observation, chip injection) | **NOT REPLACED** — `0F5a` remains the canonical extraction owner. R4.3 hard invariant. R4.7 never touches 0F5a. |
| Native tag CATALOG organization UI (create/rename/delete catalog rows) | `S0F1m`'s `openTagEditor({mode: 'create' \| 'rename' \| 'delete'})`. Studio handles catalog management; Native handles extraction. |

### Projects

| Native (retiring in R4.7.2) | Replacement |
|---|---|
| Native projects sidebar row injection (`UI_PROJECT_TITLE_ROW_CLASS = 'ho-project-row'`) | `S0Z1g` projects section |
| Native projects fetch interception | **STAYS in 0F2a** — Native projects DATA flow continues; downstream modules depend on it |
| Native projects cache + reconcile | **STAYS in 0F2a** |
| Native projects viewer page | If still present after R4.6 gating, retire in R4.7.2 alongside the sidebar rows |

### Capture path (NEVER retired)

| Surface | Reason kept |
|---|---|
| `H2O.LibraryActions.addToLibrary` / `saveToFolder` / `openLinkedChat` (0F1j) | Capture business logic — hard invariant |
| `ENGINE_injectAddToLibrary` / `ENGINE_injectAddToFolder` (0F3a) | Chat-row "..." menu injection — hard invariant |
| Save Strip after capture (0D3d) | Capture UX |
| Transcript Archive Engine (0D3a) | Canonical archive infra |
| Transcript Renderer + Bridge (0D3b, 0D3c) | Capture/render plumbing |
| Studio H2O Host bridge (0D3e) | Studio reader → H2O runtime |
| 3X* capture modules | Native capture path |

### Cosmetic surfaces (kept; not Library UI)

| Surface | Notes |
|---|---|
| `9A1b` Chat List Decorator | Color palettes, sidebar/main-list decoration, active row styling |
| `9A1c` Chat Meta Enricher | Created date, answer count, preview tooltip, pin sorting |

## Validator coverage

The native deprecation validator
(`tools/validation/native/validate-native-library-deprecation.mjs`)
asserts the KEEP invariants in:

- Section E — capture / extraction / MV3-fallback APIs unconditional
- Section F — 0F5a Tags extraction module untouched (byte-exact 273099)
- Section J — R4.6.1 invariant re-verification (capture / CRUD / extraction unchanged after R4.6.1)
- Section M — R4.6.4 default flag flip didn't introduce gates on capture / CRUD
- Section N (R4.7.1 onward) — retired-features inventory + cross-module preservation

Studio R4.5 validators
(`validate-studio-library-organization-ui.mjs`,
`validate-studio-library-actions.mjs`,
`validate-studio-import-bundle.mjs`)
assert that the Studio replacement modules exist, route correctly,
and never touch the Native side. They remain unchanged across all
R4.7 slices.
