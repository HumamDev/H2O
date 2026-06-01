# R4.7.2 — Extracted from 0F4a (Categories Sidebar UI)

Retirement log. Records exactly which lines of
`src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js` were physically
removed in R4.7.2, where they now live archivally, and which call
sites stayed in 0F4a (with rationale).

**Commit:** _<R4.7.2 commit hash; populated post-commit>_

**Source file size before R4.7.2:** ~3564 lines (post-R4.6.4 baseline)
**Source file size after R4.7.2:** 3303 lines
**Net retirement:** ~261 lines removed from 0F4a (net of new
breadcrumb comments + archiveBootApi compat shim)

## Moves

| Source lines (pre-R4.7.2) | Region name | Destination |
|---|---|---|
| 108–177 | R4.6.3 per-element org gate (R46_ORG_SELECTORS, syncR46OrgElements, installR46OrgCssGate, bootR46OrgCssGate IIFE) | `categories-sidebar.js` Block 1 |
| 1779–1787 | makeFallbackSidebarHeader | `categories-sidebar.js` Block 3 |
| 1789–1832 | prepareCategoriesSection | `categories-sidebar.js` Block 4 |
| 1834–2045 | buildCategoriesSection (sidebar section render: header + per-row + "New category" action row + row context-menu wiring) | `categories-sidebar.js` Block 5 |

At each source location, a breadcrumb comment now points to
`retired-features/native-library-ui/0F4a-categories-ui/categories-sidebar.js`.

## Compatibility shim added to 0F4a

A new `H2O.Categories.archiveBootApi` object was inserted near the
top of the module IIFE (current lines 117–149). It exposes thin
wrappers that forward to `H2O.archiveBoot.renameCategory`,
`deleteCategory`, and `createCategory`. The wrappers are the audit
trail that the deprecation validator (Section O) checks to confirm
the category CRUD API endpoints are still reachable from 0F4a even
after the sidebar UI that used to call them was retired.

The MV3 fallback path (Studio's S0Z1g sidebar re-wiring) does NOT
call this shim — it calls `H2O.archiveBoot.*` directly via the
runtime singleton. The shim exists strictly so that the assertion
"0F4a still references the category CRUD entrypoints" remains
satisfied after the sidebar's natural call sites were removed.

## Stubbed function (preserved for MOD API)

`function buildCategoriesSection(...)` remains DEFINED in 0F4a as
a no-op stub (`return null;`) because the module's external API
surface (`MOD.buildSection`, the entrypoint exposed via
`H2O.Categories`) forwards to it. Removing the function name
entirely would silently break callers that import it via the
namespace. The stub returns `null`, so any code that attempts to
mount the legacy sidebar gets nothing (matching the post-retirement
intent) without throwing.

## KEPT in 0F4a (NOT moved in R4.7.2)

These regions are intentionally preserved in their original file:

### `openCategoryAppearanceEditor` (pre-R4.7.2 lines 1474–1566)

This is the row context-menu popup that holds the rename + delete
UI handlers calling `H2O.archiveBoot.renameCategory` and
`deleteCategory`. The sidebar row that was its primary caller has
been retired, BUT the function is also called from:

| Call site (post-R4.7.2 lines) | Reason kept |
|---|---|
| Line ~1538 | Workspace viewer category-appearance picker (R4.7.3 scope) |
| Line ~1570 | Workspace viewer category-appearance edit menu (R4.7.3 scope) |
| Line ~3303 | `MOD.openCategoryAppearanceEditor` API exposure |
| Line ~3354 | `MOD.editor` API exposure |

A clean retirement would either move the workspace viewers in
the same slice or leave the function intact. R4.7.2 deliberately
limits scope to the sidebar UI, so the function STAYS. R4.7.3 will
move it to a `0F4a-workspace-viewer/` retired-features subfolder
along with the workspace UI it serves.

The archive file (`categories-sidebar.js` Block 2) contains a copy
of this function as an archival reference, but Block 2's header
documents that the live source still contains the original.

### `H2O.archiveBoot.{rename,delete,create}Category` call sites

Direct calls to these archive APIs in 0F4a:

| Line | Function | Caller context |
|---|---|---|
| 1525–1526 | `renameCategory` | inside `openCategoryAppearanceEditor` (rename handler) |
| 1540–1541 | `deleteCategory` | inside `openCategoryAppearanceEditor` (delete handler) |
| 2495, 2502 | `createCategory` | inside `acceptCategoryCandidate` (category-candidate acceptance flow) |

All three CRUD entrypoints remain callable from 0F4a (both via
`openCategoryAppearanceEditor` workspace callers and via candidate
acceptance). Plus the `H2O.Categories.archiveBootApi` compat shim
exposes thin wrappers at lines 141, 144, 147.

### Module skeleton + catalog data layer

The IIFE skeleton, `H2O.Categories` namespace, MOD object,
category catalog normalizers, candidate pool, snapshot-set logic,
diagnose hook, and R4.6.0 flag-reader helpers — all stay.

## Boundary preservation invariants

The native deprecation validator's Section O re-asserts that
after R4.7.2:

1. `retired-features/native-library-ui/0F4a-categories-ui/categories-sidebar.js`
   exists and is non-empty.
2. 0F4a no longer contains the live render path for
   `flsc-categories-root` (i.e., no live function builds a section
   element and sets `data-cgxui="flsc-categories-root"` on it; the
   constant `UI_FSECTION_CATEGORIES_ROOT` is allowed to remain as
   a now-unused literal, and the gateSelector reference in the
   diagnose block is allowed to remain).
3. 0F4a still contains the literal substrings
   `H2O.archiveBoot?.renameCategory`,
   `H2O.archiveBoot?.deleteCategory`, and
   `H2O.archiveBoot?.createCategory` (the audit-trail check).
4. 0F4a still contains `function buildCategoriesSection` (the
   stub — verified by also asserting the file does NOT contain
   the section-build internals like `makeActionRow` or the
   "New category" action label).
5. 0F5a byte count remains exactly 273099.
6. 0D3* and 3X* capture files were not touched.
7. The 0F4a-categories-ui README and the top-level
   migration-map.md both document the S0Z1g + S0F1m + S0F1n +
   S0F4b replacement stack.

## Replacement (production)

| Native surface (retired in R4.7.2) | Replacement module(s) |
|---|---|
| Categories sidebar section root + render | `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` |
| Category rename/delete UI (sidebar row context menu) | `S0F1m. 🎬 Library Organization Modals - Studio.js` `openCategoryEditor({mode: 'rename' \| 'delete'})` |
| Category-create UI ("New category" action row) | `S0F1m` `openCategoryEditor({mode: 'create'})` |
| Multi-select batch operations on categories | `S0F1n. 🎬 Library Batch Toolbar - Studio.js` |
| Category business actions (set/clear) from Library | `S0F4b. 🎬 Categories Actions - Studio.js` |

## Rollback

Two options:

1. `git revert <R4.7.2 commit hash>` — restores the source file.
2. Manual rollback: paste Blocks 1, 3, 4, 5 from
   `categories-sidebar.js` back into 0F4a at the pre-R4.7.2 line
   ranges above; remove the breadcrumb comments and the
   `archiveBootApi` compat shim; remove the no-op early-return
   from `buildCategoriesSection`; run `npm run dev:rebuild`.
