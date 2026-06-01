# R4.7.4 — Extracted from 0F2a (Projects Sidebar UI)

Retirement log. Records exactly which lines of
`src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js` were physically removed
in R4.7.4, which lines were turned into no-op stubs, and which
surfaces stayed (the entire data layer).

**Commit:** _<R4.7.4 commit hash; populated post-commit>_

**Source file size before R4.7.4:** 2531 lines (post-R4.6.4 baseline)
**Source file size after R4.7.4:** 2356 lines
**Net retirement:** ~175 lines removed from 0F2a (net of new
breadcrumb comments + no-op stub).

## Moves (fully removed from 0F2a)

| Source lines (pre-R4.7.4) | Region name | Destination |
|---|---|---|
| 112–166 | R4.6.3 per-element org gate (`R46_ORG_SELECTORS`, `syncR46OrgElements`, `installR46OrgCssGate`, `bootR46OrgCssGate` IIFE) | `projects-sidebar-rows.js` Block 1 |
| 2145–2237 | `UI_installProjectTitleContainerStyle` (`.ho-project-row` decoration CSS injector — full stylesheet with padding/shadows/hover/active/scroll-cover gradients) | `projects-sidebar-rows.js` Block 2 |
| 2239–2249 | `UI_markProjectTitleRows` (adds `.ho-project-row` class to native project anchors; strips it from non-anchors) | `projects-sidebar-rows.js` Block 3 |

At each removal site a breadcrumb comment now points to
`retired-features/native-library-ui/0F2a-projects-ui/projects-sidebar-rows.js`.

## Stubs (kept in 0F2a as no-ops for external callers)

| Source lines (pre-R4.7.4) | Function | Why kept (external caller) |
|---|---|---|
| 2251–2295 | `UI_applyProjectsNativeControls` | `MOD.applyNativeControls` API forwards to it; `PROJECTS_boot` and `OBS_hookProjectsCanonicalStoreOnce` call it on boot + on every native sidebar mutation. Stub returns `undefined`. |

The behaviorally meaningful piece of the original
`UI_applyProjectsNativeControls` — the more-button event
interception used by the projects data-harvest path — is
INDEPENDENTLY installed by `OBS_hookProjectsMorePageOverrideOnce`
via document-level listeners (still active in 0F2a). The stub
intentionally drops the row-decoration wiring without disrupting
the harvest plumbing.

## KEEP in 0F2a (NOT moved in R4.7.4)

The entire projects DATA layer stays in 0F2a per the R4.7.4 scope
discipline:

### Projects fetch interception

- `OBS_hookProjectsNativeFetchCaptureOnce` — installs the fetch
  shim that observes native sidebar payloads
- `PROJECTS_observedHeadersFromFetchArgs`,
  `PROJECTS_recordNativeFetchSuccess`,
  `PROJECTS_recordNativeFetchFailure`,
  `PROJECTS_rememberObservedNativeHeaders`,
  `PROJECTS_extractNativeHeaders`, etc.
- `PROJECTS_fetchNativePage`, `PROJECTS_fetchAllProjectsFromSource`,
  `PROJECTS_fetchAllProjects`

### Projects cache + store

- `PROJECTS_readStore`, `PROJECTS_writeStore`,
  `PROJECTS_emitChanged`, `PROJECTS_emptyStore`,
  `PROJECTS_normalizeStore`, `PROJECTS_normalizeStoreViaCore`,
  `PROJECTS_storageHandles`,
  `PROJECTS_readNativeSnorlaxHistoryStore`,
  `PROJECTS_importNativeSnorlaxHistory`

### Projects reconcile

- `PROJECTS_reconcileStoreSnapshot`,
  `PROJECTS_reconcileDropdownRows`,
  `PROJECTS_applyRowsToStore`,
  `PROJECTS_recordNativeSidebarPayload`,
  `PROJECTS_loadRows`, `PROJECTS_loadRowsFast`,
  `PROJECTS_schedulePageReconcile`,
  `PROJECTS_refreshFullStore`,
  `PROJECTS_scheduleRefresh`, `PROJECTS_invalidateStore`,
  `PROJECTS_mutationTouchesNativeRows`

### Projects harvest (dropdown scraping)

- `PROJECTS_dispatchNativeMoreEvent`,
  `PROJECTS_closeNativeDropdown`,
  `PROJECTS_waitForNativeDropdownHarvest`,
  `PROJECTS_autoharvestNativeDropdown`
- `PROJECTS_eventTargetsMoreRow`,
  `PROJECTS_suppressNativeMoreEvent`,
  `PROJECTS_openMorePageFromEvent` (more-button event helpers
  used by the document-level interception)
- `OBS_hookProjectsMorePageOverrideOnce` (document-level more-
  button override that uses the helpers above)
- `OBS_hookProjectsCanonicalStoreOnce` (mutation observer that
  invalidates the store on native DOM changes)

### Row + anchor utilities

- `DOM_findProjectsH2`, `DOM_findProjectsSection`,
  `DOM_getProjectsMoreRow`, `DOM_getNativeProjectRows`,
  `DOM_getNativeProjectDropdownRows`,
  `DOM_getNativeProjectDropdownAnchors`,
  `DOM_scrollNativeProjectDropdownPanels`,
  `DOM_collectNativeProjectAnchors`,
  `DOM_collectNativeProjectRows`,
  `DOM_isH2OOwnedNode`, `DOM_mutationHasOnlyH2OOwnedNodes`,
  etc.

### Row normalization + API parsing

- `PROJECTS_normalizeRowViaCore`, `PROJECTS_normalizeRow`,
  `PROJECTS_normalizeApiItem`, `PROJECTS_normalizeApiColor`,
  `PROJECTS_iconPartsFromHtml`, `PROJECTS_iconHtmlFromApi`,
  `PROJECTS_iconHtmlFromParts`, `PROJECTS_pickIconHtml`,
  `PROJECTS_mergeRows`, `PROJECTS_enrichRows`,
  `PROJECTS_rowsSignature`, `PROJECTS_serializeRows`, etc.

### Workspace viewer + page UI (R4.7.5 scope)

- `UI_openProjectsViewer`, `UI_appendInShellProjectRow`,
  `UI_appendInShellProjectRows`, `UI_handleProjectsManualRefresh`,
  `UI_setProjectsRefreshButtonState`,
  `UI_syncProjectsRefreshButtons`,
  `UI_wireProjectsPageScrollGuard`, `UI_projectIconHtml`
- `UI_makeInShellPageShell`, `UI_mountInShellPage`,
  `UI_closeViewer`, `ROUTE_commitPageRoute`

### Constants kept for legacy reference

- `UI_PROJECT_TITLE_STYLE_ID` — referenced by the diagnose-block
  metadata via comments; no live consumer
- `UI_PROJECT_TITLE_ROW_CLASS = 'ho-project-row'` — referenced by
  the diagnose-block `gateSelector` literal `.ho-project-row`; no
  live consumer

### Module skeleton

- IIFE, `H2O.Projects` namespace, `MOD` object + MOD API
  exposures
- R4.6.0 flag-reader helpers
- `H2O.deprecation.native['0F2a']` diagnose registration

## Boundary preservation invariants

The native deprecation validator's Section Q re-asserts that
after R4.7.4:

1. `retired-features/native-library-ui/0F2a-projects-ui/projects-sidebar-rows.js`
   exists and is non-empty.
2. 0F2a no longer defines `R46_ORG_SELECTORS`,
   `syncR46OrgElements`, `installR46OrgCssGate`,
   `UI_installProjectTitleContainerStyle`, or
   `UI_markProjectTitleRows`.
3. 0F2a still defines `function UI_applyProjectsNativeControls`
   (no-op stub form).
4. 0F2a still defines the fetch / cache / reconcile entrypoints
   (`PROJECTS_fetchAllProjects`, `PROJECTS_readStore`,
   `PROJECTS_writeStore`, `PROJECTS_reconcileStoreSnapshot`,
   `OBS_hookProjectsNativeFetchCaptureOnce`,
   `OBS_hookProjectsMorePageOverrideOnce`,
   `OBS_hookProjectsCanonicalStoreOnce`).
5. The fetch / cache / reconcile entrypoints are NOT gated by any
   `library.native*` flag helper.
6. 0F2a's file size shrank measurably vs the pre-R4.7.4 baseline.
7. 0F5a byte count remains exactly 273099.
8. 0D3* and 3X* capture files were not touched.
9. The 0F2a-projects-ui README documents Desktop Studio's S0Z1g
   replacement.
10. R4.7.2 + R4.7.3 invariants still hold (cross-slice canaries).

## Replacement (production)

| Native surface (retired in R4.7.4) | Replacement |
|---|---|
| `.ho-project-row` row decoration in native sidebar | Desktop Studio's `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` projects section (renders its own row UI inside Studio) |
| `UI_installProjectTitleContainerStyle` decoration CSS | No replacement — the Native row decoration was Native-only chrome |
| R4.6.3 per-element org gate | Gate retired with the UI it gated |

## Rollback

Two options:

1. `git revert <R4.7.4 commit hash>` — restores the source file.
2. Manual rollback: paste Blocks 1, 2, 3 from
   `projects-sidebar-rows.js` back into 0F2a at the pre-R4.7.4
   line ranges above; replace the Block 4 stub with its original
   body (from Block 4 of the archive); remove the breadcrumb
   comments; run `npm run dev:rebuild`.
