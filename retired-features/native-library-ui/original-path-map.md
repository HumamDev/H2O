# Original Path Map

Cross-module move log for R4.7.x retired code. Records the source
location, line range, retirement commit, and destination for every
piece of code moved from `src-runtime-base/0F*` into
`retired-features/native-library-ui/`.

R4.7.1 was scaffolding only. R4.7.2 moved the Native Categories
sidebar UI. R4.7.3 moved the Native Labels sidebar UI. R4.7.4
moved the Native Projects sidebar row UI. R4.7.5 moved the Native
Library Workspace UI and retired 0F1d Library Insights. R4.7.6
moved the Native Folders sidebar UI only; 0F3a capture/store logic
stays live.

## Format

Each row records one move:

| Source file | Source lines | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|

## Moves

| Source file | Source lines (pre-R4.7.2) | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|
| `src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js` | 108–177 (R4.6.3 per-element org gate — `R46_ORG_SELECTORS`, `syncR46OrgElements`, `installR46OrgCssGate`, boot IIFE) | `0F4a-categories-ui/categories-sidebar.js` Block 1 | R4.7.2 | _<commit hash; populated post-commit>_ |
| `src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js` | 1779–1787 (`makeFallbackSidebarHeader`) | `0F4a-categories-ui/categories-sidebar.js` Block 3 | R4.7.2 | _<commit hash>_ |
| `src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js` | 1789–1832 (`prepareCategoriesSection`) | `0F4a-categories-ui/categories-sidebar.js` Block 4 | R4.7.2 | _<commit hash>_ |
| `src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js` | 1834–2045 (`buildCategoriesSection` body — header, per-row, "New category" action row, row context-menu wiring) | `0F4a-categories-ui/categories-sidebar.js` Block 5 | R4.7.2 | _<commit hash>_ |

### Pending / kept in 0F4a

`openCategoryAppearanceEditor` (pre-R4.7.2 lines 1474–1566) was
NOT moved in R4.7.2. The function has additional callers in the
workspace viewer (R4.7.3 scope) and in the `MOD` API surface. The
archive file's Block 2 contains a copy for reference; R4.7.3 will
move the function (together with the workspace viewer it serves)
once those callers are also retired.

The category CRUD entrypoints — `H2O.archiveBoot.renameCategory`,
`deleteCategory`, `createCategory` — STAY callable from 0F4a:

- Via direct call sites at lines 1525–1526, 1540–1541 (inside
  `openCategoryAppearanceEditor`, which stays) and at lines
  2495, 2502 (inside `acceptCategoryCandidate`).
- Via a new `H2O.Categories.archiveBootApi` audit-trail shim at
  lines 141, 144, 147.

These calls are protected by the deprecation validator's Section O
audit-trail assertion.

### R4.7.3 moves (Labels sidebar UI)

| Source file | Source lines (pre-R4.7.3) | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|
| `src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js` | 128–183 (R4.6.3 per-element org gate — `R46_ORG_SELECTORS`, `syncR46OrgElements`, `installR46OrgCssGate`, boot IIFE) | `0F6a-labels-ui/labels-sidebar.js` Block 1 | R4.7.3 | _<commit hash; populated post-commit>_ |
| `src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js` | 1483–1544 (`openLabelActionsPop` — sidebar row context-menu popup with rename/delete UI) | `0F6a-labels-ui/labels-sidebar.js` Block 2 | R4.7.3 | _<commit hash>_ |
| `src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js` | 1799–1807 (`makeFallbackSidebarHeader`) | `0F6a-labels-ui/labels-sidebar.js` Block 3 | R4.7.3 | _<commit hash>_ |
| `src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js` | 1809–1849 (`prepareLabelsSection` — sets `data-cgxui="lbsc-root"`) | `0F6a-labels-ui/labels-sidebar.js` Block 4 | R4.7.3 | _<commit hash>_ |

### R4.7.3 stubs (kept in 0F6a as no-ops for external callers)

The following functions remain DEFINED in 0F6a but with no-op
bodies; their original bodies are preserved in
`labels-sidebar.js` Blocks 5 and 6:

| Source lines (pre-R4.7.3) | Function | External caller(s) requiring the stub |
|---|---|---|
| 1851–2000 | `buildLabelsSection` | `MOD.buildSection` API |
| 2002–2010 | `activePageLabelKey` | (kept for symmetry) |
| 2012–2039 | `syncLabelSidebarActiveState` | Workspace viewer (R4.7.4 scope) |
| 2041–2050 | `scheduleLabelSidebarActiveSync` | (kept for symmetry) |
| 2052–2066 | `rerenderLabelsSection` | CRUD: `createLabel`/`renameLabel`/`deleteLabel`/`afterLabelMutation`/`setTypeVisible`/show-counts toggle |
| 2068–2101 | `ensureSidebarObserver` | (kept for symmetry) |
| 2103–2112 | `scheduleEnsure` | MOD API + boot late-init |
| 2114–2202 | `ensureInjected` | MOD API + boot late-init + `scheduleEnsure` |

### Pending / kept in 0F6a (NOT moved in R4.7.3)

- `function createLabel`, `function renameLabel`, `function deleteLabel`
  (line 889 / 914 / 933 post-R4.7.3) — STAY for Studio MV3
  fallback. Studio's S0Z1g calls `H2O.Labels.renameLabel(...)` etc.
- Per-turn `lbsc-chip-color` chip UI (line 2055 post-R4.7.3 inside
  `openAssignModal`) + supporting CSS — turn-level UI; different
  DOM subtree from `lbsc-root`.
- Workspace viewer + modal UI (`mountPage`, `openLabelsViewer`,
  `openLabelViewer`, `openAssignModal`, etc.) — R4.7.4 scope.

These calls are protected by the deprecation validator's Section P
audit-trail assertion.

### R4.7.4 moves (Projects sidebar row UI)

| Source file | Source lines (pre-R4.7.4) | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|
| `src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js` | 112–166 (R4.6.3 per-element org gate — `R46_ORG_SELECTORS`, `syncR46OrgElements`, `installR46OrgCssGate`, boot IIFE) | `0F2a-projects-ui/projects-sidebar-rows.js` Block 1 | R4.7.4 | _<commit hash; populated post-commit>_ |
| `src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js` | 2145–2237 (`UI_installProjectTitleContainerStyle` — `.ho-project-row` decoration CSS injector) | `0F2a-projects-ui/projects-sidebar-rows.js` Block 2 | R4.7.4 | _<commit hash>_ |
| `src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js` | 2239–2249 (`UI_markProjectTitleRows` — adds `.ho-project-row` class to native project anchors) | `0F2a-projects-ui/projects-sidebar-rows.js` Block 3 | R4.7.4 | _<commit hash>_ |

### R4.7.4 stub (kept in 0F2a as no-op for external callers)

| Source lines (pre-R4.7.4) | Function | External caller(s) requiring the stub |
|---|---|---|
| 2251–2295 | `UI_applyProjectsNativeControls` | `MOD.applyNativeControls` API; `PROJECTS_boot`; `OBS_hookProjectsCanonicalStoreOnce` mutation handler |

The behaviorally meaningful piece of the original
`UI_applyProjectsNativeControls` — the more-button event
interception that supports the projects data-harvest path — is
INDEPENDENTLY installed by `OBS_hookProjectsMorePageOverrideOnce`
via document-level listeners (still active in 0F2a).

### Pending / kept in 0F2a (NOT moved in R4.7.4)

The ENTIRE projects DATA layer stays in 0F2a:

- Fetch interception (`OBS_hookProjectsNativeFetchCaptureOnce`,
  `PROJECTS_fetchAllProjects`, etc.)
- Cache + store (`PROJECTS_readStore`, `PROJECTS_writeStore`,
  `PROJECTS_normalizeStore`, etc.)
- Reconcile (`PROJECTS_reconcileStoreSnapshot`,
  `PROJECTS_reconcileDropdownRows`, `PROJECTS_loadRows`, etc.)
- Harvest (`PROJECTS_autoharvestNativeDropdown`,
  `PROJECTS_dispatchNativeMoreEvent`, etc.)
- More-button event helpers (`PROJECTS_eventTargetsMoreRow`,
  `PROJECTS_suppressNativeMoreEvent`,
  `PROJECTS_openMorePageFromEvent`)
- Document-level more-button override
  (`OBS_hookProjectsMorePageOverrideOnce`)
- Canonical-store mutation observer
  (`OBS_hookProjectsCanonicalStoreOnce`)
- Workspace viewer + page UI (`UI_openProjectsViewer`,
  `UI_appendInShellProjectRow`, etc.) — R4.7.5 scope

These calls are protected by the deprecation validator's Section Q
audit-trail assertion.

### R4.7.5 moves (Library Workspace UI + Library Insights)

| Source file | Source lines (pre-R4.7.5) | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | 108-196 (R4.6.3 workspace body-attribute + CSS gate) | `0F1b-library-workspace/library-workspace-ui.js` Block 1 | R4.7.5 | _<commit hash; populated post-commit>_ |
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | 198-265 (R4.6.1 deprecation banner) | `0F1b-library-workspace/library-workspace-ui.js` Block 2 | R4.7.5 | _<commit hash>_ |
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | 956-2468 (Library sidebar button + prepaint/layout UI) | `0F1b-library-workspace/library-workspace-ui.js` Block 3 | R4.7.5 | _<commit hash>_ |
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | 2469-2784 (Workspace CSS renderer) | `0F1b-library-workspace/library-workspace-ui.js` Block 4 | R4.7.5 | _<commit hash>_ |
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | 2800-3658 (`/library` route, native navigation guard, page host, workspace renderers) | `0F1b-library-workspace/library-workspace-ui.js` Block 5 | R4.7.5 | _<commit hash>_ |
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | 3666-4881 (read-model fallback, route/event bindings, public UI API, boot wiring) | `0F1b-library-workspace/library-workspace-ui.js` Block 6 | R4.7.5 | _<commit hash>_ |
| `src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js` | 1-1445 (entire Explorer + Analytics renderer) | `0F1d-library-insights/0F1d-original.js` Block 1 | R4.7.5 | _<commit hash>_ |

### R4.7.5 stubs (kept live as no-op compatibility APIs)

| Source file | Live compatibility API | Notes |
|---|---|---|
| `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` | `H2O.LibraryWorkspace` | Diagnostics + no-op legacy method names only; no Native route/page/sidebar UI registration |
| `src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js` | `H2O.LibraryInsights` | Diagnostics + no-op `refresh`; no `renderExplorer` or `renderAnalytics` |

### Pending / kept out of R4.7.5 scope

- 0F3a Folders is untouched.
- 0F5a Tags extraction is untouched.
- 0D3 and 3X capture files are untouched.
- 0F1k flags remain queryable.
- Studio files and generated build outputs are untouched.

### R4.7.6 moves (Folders sidebar UI)

| Source file | Source lines (pre-R4.7.6) | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|
| `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | 108-162 (R4.6.3 per-element org gate — `R46_ORG_SELECTORS`, `syncR46OrgElements`, `installR46OrgCssGate`, boot IIFE) | `0F3a-folders-ui/folders-sidebar-list.js` Block 1 | R4.7.6 | _<commit hash; populated post-commit>_ |
| `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | 1114-1116, 1188-1222, 1903-1913 (`flsc-folder-row` / `flsc-folder-more` sidebar CSS selector usage and active-row styling) | `0F3a-folders-ui/folders-sidebar-list.js` Block 2 | R4.7.6 | _<commit hash>_ |
| `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | 3145-3256 (`UI_openFolderActionsPop` archival reference for sidebar more-button context menu) | `0F3a-folders-ui/folders-sidebar-list.js` Block 3 | R4.7.6 | _<commit hash>_ |
| `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | 4713-5067 (`UI_buildFoldersSection` sidebar row/list render path) | `0F3a-folders-ui/folders-sidebar-list.js` Block 4 | R4.7.6 | _<commit hash>_ |
| `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | 6242-6266 (`CORE_FS_syncFolderSidebarActiveState` active-row sync path) | `0F3a-folders-ui/folders-sidebar-list.js` Block 5 | R4.7.6 | _<commit hash>_ |
| `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | 6626-6757 (`CORE_FS_ensureInjected` sidebar injection lifecycle) | `0F3a-folders-ui/folders-sidebar-list.js` Block 6 | R4.7.6 | _<commit hash>_ |

### R4.7.6 stubs / kept live in 0F3a

The following functions remain DEFINED in 0F3a as no-op compatibility
stubs; their original bodies are preserved in `folders-sidebar-list.js`:

| Source lines (pre-R4.7.6) | Function | External caller(s) requiring the stub |
|---|---|---|
| 4713-5067 | `UI_buildFoldersSection` | Historical internal sidebar API |
| 6242-6266 | `CORE_FS_syncFolderSidebarActiveState` | Timer/listener compatibility |
| 6626-6757 | `CORE_FS_ensureInjected` | `H2O.folders.ensureInjected` public API |

These remain live and were not retired:

- `ENGINE_injectAddToLibrary`
- `ENGINE_injectAddToFolder`
- `STORE_validateFolderCreate`
- Folder data/store/cache functions
- Folder binding APIs
- Metadata operation APIs
- `H2O.folders` public API and LibraryCore owner/service/route registration
- Capture menu cgxui values `flsc-add-to-library` and
  `flsc-add-to-folder`

0F5a Tags extraction, 0D3/3X capture files, 0F1j Library Actions,
Studio files, and generated build outputs are not in R4.7.6 scope.

## R4.7.7 Final Completion Gate

R4.7.7 closes the Native Library UI retirement release gate. It adds
documentation and validator consolidation only; no runtime code moves
or source module movement are in scope.

### R4.7 commit ledger

| Slice | Commit | Scope |
|---|---|---|
| R4.7.1 | `7a2980ad74a70643b2ae42d4b1557a7d7a74ed52` | Scaffolding for the retired Native Library UI archive |
| R4.7.2 | `a4a525120fc12e577fd9a8917c452932551fdcdf` | Categories sidebar UI |
| R4.7.3 | `5b9db0d734bc3beb77b617088a58d1592bf0f2be` | Labels sidebar UI |
| R4.7.4 | `5e32bfb1164102b442ac1f4a3be69e52ca67c671` | Projects sidebar UI |
| R4.7.5 | `1ee9021cee94fdb20836eaeee33f5ae867e3b896` | Library Workspace UI and 0F1d Library Insights |
| R4.7.6 | `4627f2f81cc45acb5180e21ab80b8be77b8a69e1` | Folders sidebar UI |
| R4.7.7 | _pending commit_ | Final release-gate documentation and validator consolidation |

### Final inventory count

- 6 retired module folders.
- 6 module README files.
- 6 extracted-from files.
- 6 archived JavaScript implementation files.
- 3 top-level archive files: `README.md`, `migration-map.md`,
  `original-path-map.md`.
- 3 notes files under `notes/`.

The 6 archived implementation files are:

- `0F1b-library-workspace/library-workspace-ui.js`
- `0F1d-library-insights/0F1d-original.js`
- `0F2a-projects-ui/projects-sidebar-rows.js`
- `0F3a-folders-ui/folders-sidebar-list.js`
- `0F4a-categories-ui/categories-sidebar.js`
- `0F6a-labels-ui/labels-sidebar.js`

### Final release-gate document

See
`docs/systems/library/r4.7-native-library-ui-retirement-gate.md`.

The final document records the retired inventory, kept-active
invariants, rollback procedure, validator matrix, known non-goals,
and smoke checklist.

## Re-verification

Whenever a row is added to this table, the corresponding move must
also:

1. Add the destination file under
   `retired-features/native-library-ui/<module-id>-<purpose>/`
2. Remove the source lines from the original Native module
3. Insert a one-comment breadcrumb in the source file:

   ```js
   /* R4.7.X — <surface name> retired. Code moved to:
    *   retired-features/native-library-ui/<module-id>-<purpose>/<file>.js
    * See that file's header for the original line ranges + rollback. */
   ```

4. Update the corresponding module folder's `extracted-from-<module>.md`
5. Run all 5 validators to confirm:
   - native deprecation validator's Section N (folder inventory) passes
   - native deprecation validator's Section O (size shrinkage proof) passes
   - native deprecation validator's Section P (invariant re-verification — capture / extraction / MV3 fallback APIs all still in their original files) passes
   - studio R4.5 validators unchanged
   - import-graph clean

## Cross-reference

For the Native → Studio replacement mapping, see `migration-map.md`.
For the slice-by-slice schedule, see the top-level `README.md`.
For per-module retirement details, see each `<module-id>-<purpose>/
README.md` and `extracted-from-<module>.md`.
