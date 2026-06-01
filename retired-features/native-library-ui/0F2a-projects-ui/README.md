# 0F2a Projects UI — Retirement Record

**Status (R4.7.1): scaffolding only — no code moved yet. UI retires in R4.7.2.**

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

## What R4.7.2 will retire (planned)

From `src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js`, move into this
folder:

- `projects-sidebar-rows.js` — `UI_PROJECT_TITLE_ROW_CLASS`,
  `UI_installProjectTitleContainerStyle`, and the class-add/remove
  logic at line 2211 area
- `r46-per-element-sync.js` — the R4.6.3 sync function block (boot
  wrapper + `R46_ORG_SELECTORS` + `syncR46OrgElements` +
  `installR46OrgCssGate`)

`extracted-from-0F2a.md` (added by R4.7.2) records exact line ranges
+ commit hash.

## What STAYS in 0F2a post-R4.7

ALL of the data layer:

- `findProjectsH2`, `findProjectsSection`, `getProjectsMoreRow`
- `PROJECTS_recordNativeSidebarPayload`, `PROJECTS_nativeSidebarHeaders`
- Projects cache + reconcile + viewer helpers
- `nativeSidebarEnv`
- The R4.6.0 flag-reader helpers
  (`isNativeWorkspaceUiEnabled`, etc.)
- The `H2O.deprecation.native['0F2a']` diagnose registration

The diagnose entry will be updated to reflect the post-R4.7 state
(empty `gatedSurfaces` since the UI is gone; `unconditionalSurfaces`
remains as the data layer).

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

`git revert <R4.7.2 commit hash>` restores the projects sidebar UI
(`.ho-project-row` class injection + CSS).

Per-file rollback: copy `projects-sidebar-rows.js` contents back into
0F2a at the recorded line ranges (see `extracted-from-0F2a.md`),
then run `npm run dev:rebuild && npm run dev:all`.
