# Original Path Map

Cross-module move log for R4.7.x retired code. Records the source
location, line range, retirement commit, and destination for every
piece of code moved from `src-runtime-base/0F*` into
`retired-features/native-library-ui/`.

R4.7.1 was scaffolding only. R4.7.2 (this entry's first batch) moves
the Native Categories sidebar UI. R4.7.3 will move folders / labels /
projects / workspace.

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
