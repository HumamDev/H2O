# 0F4a Categories UI — Retirement Record

**Status (R4.7.1): scaffolding only — no code moved yet. UI retires in R4.7.2.**

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

## What R4.7.2 will retire (planned)

From `src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js`, move into this
folder:

- `categories-sidebar.js` — section root mount, render functions,
  category-row renderer, "New category" action row, context-menu
  wiring
- `r46-per-element-sync.js` — R4.6.3 sync block

`extracted-from-0F4a.md` (added by R4.7.2) records exact line ranges
+ commit hash. Critically, it lists which lines STAYED (the
archiveBoot.* call sites) and why.

## What STAYS in 0F4a post-R4.7

- Module IIFE skeleton
- `const MOD = (H2O.Categories = H2O.Categories || {})` and any
  catalog data-layer exports
- Category event listeners for cross-module sync
- All `H2O.archiveBoot.{rename,delete,create}Category` invocations
  (these may need to be relocated WITHIN 0F4a if they were inside
  the retired renderer; preserved either way)
- R4.6.0 flag-reader helpers
- `H2O.deprecation.native['0F4a']` diagnose registration

## Replacement

| Native surface | Replacement |
|---|---|
| Categories sidebar section root | Desktop Studio's S0Z1g categories section |
| Category rename/delete UI (sidebar row context menu) | S0F1m's `openCategoryEditor({mode: 'rename' \| 'delete'})` |
| Category-create UI ("New category" action row) | S0F1m's `openCategoryEditor({mode: 'create'})` |
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
