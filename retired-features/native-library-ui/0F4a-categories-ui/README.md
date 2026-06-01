# 0F4a Categories UI — Retirement Record

**Status (R4.7.2): RETIRED.** Native categories sidebar UI moved to
`categories-sidebar.js`. See `extracted-from-0F4a.md` for exact
line ranges + commit hash. 0F4a went from ~3564 lines (post-R4.6.4)
to 3303 lines.

## What was here pre-R4.7

`src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js` owns the Native
categories catalog + sidebar UI. R4.7.2 retires the sidebar UI
surgically while preserving the catalog API call sites.

**KEEPS (NEVER retired — Studio MV3 fallback):**
- `H2O.archiveBoot?.renameCategory(group.id, trimmed)` call sites
  (e.g., line 1505 in pre-R4.6 numbering; post-R4.6.4 the offsets
  shift due to inserted helper block)
- `H2O.archiveBoot?.deleteCategory(group.id)` call sites
- `H2O.archiveBoot?.createCategory(name)` call sites
- The R4.6.0 flag-reader helpers + diagnose registration
- The R4.6.1 + R4.6.2 + R4.6.3 plumbing block (constants for
  selectors, but the SYNC FUNCTION moves with the sidebar UI)
- All event-handler glue that fires from archiveBoot for
  cross-module sync

**RETIRES (R4.7.2):**
- `UI_FSECTION_CATEGORIES_ROOT = 'flsc-categories-root'` —
  data-cgxui value set on the categories section element (line 1762
  area pre-R4.6 numbering)
- The section render function that builds the categories sidebar
  (`section.setAttribute('data-cgxui', UI_FSECTION_CATEGORIES_ROOT)`
  setup, headerBtn, listWrap construction, render() async function
  that mounts "New category" action row)
- The category-row rendering loop + per-row context-menu wiring
  (rename / delete UI surface; the CRUD call sites within stay if
  separable, else move)
- The "New category" action row
- R4.6.3 per-element sync (`R46_ORG_SELECTORS`,
  `syncR46OrgElements`, `installR46OrgCssGate`)

## What R4.7.2 retired (done)

From `src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js`, the following
moved into this folder's `categories-sidebar.js`:

- **Block 1** — R4.6.3 per-element org gate (`R46_ORG_SELECTORS`,
  `syncR46OrgElements`, `installR46OrgCssGate`, boot IIFE)
- **Block 3** — `makeFallbackSidebarHeader` (the fallback header
  builder used when ChatGPT's section template was unavailable)
- **Block 4** — `prepareCategoriesSection` (sets `data-cgxui` to
  `flsc-categories-root` and constructs the section shell)
- **Block 5** — `buildCategoriesSection` (the main sidebar render
  function — section header, per-category rows, "New category"
  action row, and row context-menu wiring)

**Block 2 — `openCategoryAppearanceEditor`** is reproduced in the
archive file as a reference but was NOT removed from 0F4a in
R4.7.2. The function has additional callers in the workspace
viewer (R4.7.3 scope) and in the `MOD` API surface. It moves with
the workspace viewer in R4.7.3.

`buildCategoriesSection` is kept in 0F4a as a no-op stub
(`return null`) so that `MOD.buildSection` continues to resolve;
removing the symbol entirely would silently break legacy callers.

The R4.6.3 per-element gate is no longer needed at runtime now
that the UI it gated is physically gone — but Block 1's archive
preserves the gate logic for reference.

`extracted-from-0F4a.md` records exact line ranges + commit hash,
which call sites stayed, and the rationale.

## What STAYS in 0F4a post-R4.7.2

- Module IIFE skeleton
- `const MOD = (H2O.Categories = H2O.Categories || {})` and any
  catalog data-layer exports
- Category event listeners for cross-module sync
- `function openCategoryAppearanceEditor` (kept for workspace
  viewer + MOD API consumers; retires in R4.7.3)
- `function buildCategoriesSection` (kept as a no-op stub for MOD
  API)
- All `H2O.archiveBoot.{rename,delete,create}Category` invocations
  via:
  - Direct calls in `openCategoryAppearanceEditor` (lines
    1525–1526 / 1540–1541 post-R4.7.2)
  - Direct calls in `acceptCategoryCandidate` (lines 2495 / 2502)
  - The new `H2O.Categories.archiveBootApi` audit-trail shim
    (lines 141–148)
- Category candidate pool + acceptance flow
- R4.6.0 flag-reader helpers
- `H2O.deprecation.native['0F4a']` diagnose registration

## Replacement

| Native surface | Replacement |
|---|---|
| Categories sidebar section root | Desktop Studio's S0Z1g categories section |
| Category rename/delete UI (sidebar row context menu) | S0F1m's `openCategoryEditor({mode: 'rename' \| 'delete'})` |
| Category-create UI ("New category" action row) | S0F1m's `openCategoryEditor({mode: 'create'})` |
| Multi-select batch operations on categories | S0F1n Library Batch Toolbar |
| Category business actions (set/clear) from Library | S0F4b Categories Actions |
| `H2O.archiveBoot.*` category CRUD call sites | **STAY in 0F4a** — Studio MV3 fallback via S0Z1g re-wiring depends on these |

## Safety invariants for this retirement

- **NO change to capture path.**
- **NO change to 0F5a tag extraction.**
- **archiveBoot.* category CRUD call sites preserved.** Validator
  Section P re-asserts via STRIPPED source scan that
  `H2O.archiveBoot?.renameCategory`, `deleteCategory`, `createCategory`
  literal substrings still appear in 0F4a.
- **NO change to Studio R4.5.**
- **NO change to 0F1k flag system.**

## Rollback procedure

`git revert <R4.7.2 commit hash>` restores the categories sidebar UI.

Per-file rollback: copy `categories-sidebar.js` contents back into
0F4a at the recorded line ranges (see `extracted-from-0F4a.md`),
then run `npm run dev:rebuild && npm run dev:all`.
