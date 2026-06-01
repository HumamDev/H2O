# 0F2a Projects UI — Retirement Record

**Status (R4.7.4): RETIRED.** Native projects sidebar row UI moved
to `projects-sidebar-rows.js`. See `extracted-from-0F2a.md` for
exact line ranges + commit hash. 0F2a went from 2531 lines
(post-R4.6.4) to 2356 lines. Note: R4.7.4 is the projects slice
(R4.7.2 = categories, R4.7.3 = labels).

## What was here pre-R4.7

`src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js` owned BOTH the projects
DATA layer AND the projects sidebar UI:

**Data layer (KEEPS in 0F2a — never retired):**
- `findProjectsH2`, `findProjectsSection`, `getProjectsMoreRow`
- `PROJECTS_recordNativeSidebarPayload` — fetch interception
- `PROJECTS_nativeSidebarHeaders` — auth + header handling
- Projects cache, reconcile, viewer DOM helpers
- `nativeSidebarEnv` — service binding

**UI layer (RETIRES in R4.7.2):**
- `UI_PROJECT_TITLE_ROW_CLASS = 'ho-project-row'` (the H2O-added
  class for project rows injected into ChatGPT's chat-history nav)
- `UI_installProjectTitleContainerStyle` — CSS injection for
  `.ho-project-row`
- The render path that adds `.ho-project-row` class to anchors
  matching `a[href*="/g/"][href$="/project"]` (line 2211 area)
- R4.6.3 per-element sync (`R46_ORG_SELECTORS`, `syncR46OrgElements`,
  `installR46OrgCssGate`) — defunct once the UI it gates is gone

## What R4.7.4 retired (done)

From `src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js`, the following
moved into this folder's `projects-sidebar-rows.js` as four
archival blocks (see `extracted-from-0F2a.md` for exact line
ranges):

- **Block 1** — R4.6.3 per-element org gate (`R46_ORG_SELECTORS`,
  `syncR46OrgElements`, `installR46OrgCssGate`, boot IIFE)
- **Block 2** — `UI_installProjectTitleContainerStyle` (the
  `.ho-project-row` decoration CSS injector — padding, shadows,
  hover/active/scroll-cover gradients)
- **Block 3** — `UI_markProjectTitleRows` (adds the
  `.ho-project-row` class to native project anchors)
- **Block 4** — `UI_applyProjectsNativeControls` (sidebar UI
  orchestrator; KEPT in 0F2a as a no-op stub because MOD API +
  boot + canonical-store observer call it)

Blocks 1, 2, 3 are fully removed. Block 4 is preserved as a no-op
stub so the MOD API and boot/observer callers continue to resolve.

**The behaviorally meaningful piece of Block 4** — the
more-button event interception used by the projects data-harvest
path — is INDEPENDENTLY installed by
`OBS_hookProjectsMorePageOverrideOnce` via document-level
listeners (still active in 0F2a). The retirement intentionally
drops the row decoration without disrupting harvest plumbing.

## What STAYS in 0F2a post-R4.7.4

ALL of the projects DATA layer + workspace viewer (R4.7.5 scope):

- **Projects fetch interception**: `OBS_hookProjectsNativeFetchCaptureOnce`,
  `PROJECTS_fetchAllProjects`, `PROJECTS_fetchNativePage`, etc.
- **Projects cache + store**: `PROJECTS_readStore`,
  `PROJECTS_writeStore`, `PROJECTS_emitChanged`,
  `PROJECTS_normalizeStore`, etc.
- **Projects reconcile**: `PROJECTS_reconcileStoreSnapshot`,
  `PROJECTS_reconcileDropdownRows`, `PROJECTS_applyRowsToStore`,
  `PROJECTS_loadRows`, etc.
- **Projects harvest**: `PROJECTS_autoharvestNativeDropdown`,
  `PROJECTS_dispatchNativeMoreEvent`,
  `PROJECTS_closeNativeDropdown`,
  `PROJECTS_waitForNativeDropdownHarvest`
- **More-button event helpers**: `PROJECTS_eventTargetsMoreRow`,
  `PROJECTS_suppressNativeMoreEvent`,
  `PROJECTS_openMorePageFromEvent`
- **Document-level more-button override**:
  `OBS_hookProjectsMorePageOverrideOnce`
- **Canonical-store mutation observer**:
  `OBS_hookProjectsCanonicalStoreOnce`
- **Row + anchor utilities**: `DOM_findProjectsH2`,
  `DOM_findProjectsSection`, `DOM_getProjectsMoreRow`,
  `DOM_getNativeProjectRows`,
  `DOM_collectNativeProjectAnchors`, etc.
- **Row normalization + API parsing**: `PROJECTS_normalizeRow`,
  `PROJECTS_normalizeApiItem`, `PROJECTS_normalizeApiColor`,
  `PROJECTS_iconHtmlFromApi`, `PROJECTS_iconHtmlFromParts`, etc.
- **Workspace viewer + page UI (R4.7.5 scope)**:
  `UI_openProjectsViewer`, `UI_appendInShellProjectRow`,
  `UI_handleProjectsManualRefresh`,
  `UI_setProjectsRefreshButtonState`,
  `UI_wireProjectsPageScrollGuard`, `UI_projectIconHtml`
- **Constants**: `UI_PROJECT_TITLE_STYLE_ID`,
  `UI_PROJECT_TITLE_ROW_CLASS = 'ho-project-row'` (legacy
  reference for diagnose-block metadata; no live consumer)
- **`function UI_applyProjectsNativeControls`** — no-op stub for
  MOD API + boot/observer callers
- **R4.6.0 flag-reader helpers**
- **`H2O.deprecation.native['0F2a']` diagnose registration**

## Replacement

| Native surface | Replacement |
|---|---|
| `.ho-project-row` class on ChatGPT's project anchors | Desktop Studio's S0Z1g Projects section (renders Projects via the Library Index facets) |
| H2O-styled `:where(nav, aside) .ho-project-row` CSS | Removed (Studio uses its own styles) |
| Native projects DATA flow (fetch interception, cache, reconcile) | **STAYS in 0F2a** — Studio reads projects via the same data path |

## Safety invariants for this retirement

- **NO change to capture path** (0F2a never owned capture).
- **NO change to projects DATA flow.** Fetch interception, cache,
  reconcile, intercept hooks all stay. Section P of the validator
  re-asserts `findProjectsH2`, `findProjectsSection`,
  `PROJECTS_recordNativeSidebarPayload` still present.
- **NO change to 0F5a, 0F1j, MV3 fallback APIs.**
- **NO change to Studio R4.5.**

## Rollback procedure

`git revert <R4.7.4 commit hash>` restores the projects sidebar UI
(`.ho-project-row` class injection + CSS).

Per-file rollback: paste Blocks 1, 2, 3 from
`projects-sidebar-rows.js` back into 0F2a at the recorded line
ranges (see `extracted-from-0F2a.md`), replace the Block 4 stub
with its original body, remove the breadcrumb comments, then run
`npm run dev:rebuild && npm run dev:all`.
