# 0F3a Folders UI — Retirement Record

**Status (R4.7.6): RETIRED — Native Folders sidebar UI only.**

## What was here pre-R4.7

`src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` owned two different
surfaces:

- Native Library folder sidebar UI: folder rows, more buttons,
  sidebar active-state sync, sidebar injection, and sidebar-only
  create/manage affordances.
- Folder data/capture logic: capture menu injection, folder store,
  folder binding, metadata operations, and Studio/MV3 fallback APIs.

R4.7.6 retires only the first surface. The data/capture surface stays
live in 0F3a.

## RETIRED in R4.7.6

Moved to `folders-sidebar-list.js`:

- Block 1 — R4.6.3 per-element org gate for
  `data-cgxui="flsc-folder-row"` and `data-cgxui="flsc-folder-more"`.
- Block 2 — folder row / more-button CSS for sidebar list affordances.
- Block 3 — `UI_openFolderActionsPop` archival reference for the
  retired sidebar more-button context menu. The live function can remain
  for non-sidebar compatibility.
- Block 4 — `UI_buildFoldersSection` sidebar row/list render path,
  including folder rows, preview rows, sidebar-only "New folder" affordance,
  and sidebar more-button wiring.
- Block 5 — `CORE_FS_syncFolderSidebarActiveState` active-row sync.
- Block 6 — `CORE_FS_ensureInjected` sidebar injection lifecycle.

Live 0F3a keeps no-op compatibility stubs for the sidebar section,
active-state sync, and ensure-injected entrypoints.

## STAYS in 0F3a

- `ENGINE_injectAddToLibrary` — chat-row "Add to Library" menu injection.
- `ENGINE_injectAddToFolder` — chat-row "Save to Folder" menu injection.
- `STORE_validateFolderCreate` — Native folder-create validation used by
  Studio/MV3 fallback paths.
- Folder store/data/cache functions, including `STORE_readData`,
  `STORE_writeData`, `STORE_createFolder`, `STORE_renameFolder`,
  `STORE_setFolderIconColor`, and `STORE_listFolderItems`.
- Folder binding APIs, including `API_getBinding`, `API_setBinding`, and
  `API_saveAndBindToFolder`.
- Metadata fallback APIs, including `API_previewMetadataOperation` and
  `API_applyMetadataOperation`.
- Capture menu cgxui values `flsc-add-to-library` and
  `flsc-add-to-folder`.
- `H2O.folders` public API and LibraryCore owner/service/route
  registration used by Studio and MV3 fallback code.

## Replacement

| Native surface | Replacement |
|---|---|
| Folder sidebar list rendering | S0Z1g Studio sidebar section |
| Folder rows and active state | S0Z1g folder catalog selection state |
| Folder create/manage UI | S0F1m folder editor |
| Folder context-menu commands | S0F1m + S0F1n folder command flows |
| Folder catalog/read model | S0F3b folder catalog surface |
| Save/Add capture menu injection | **STAYS in 0F3a** |
| Folder data/store/binding logic | **STAYS in 0F3a** |

## Safety Invariants

- 0F5a tag extraction remains byte-exact at 273099 bytes.
- 0D3*/3X* capture files are untouched.
- 0F1j Library Actions is untouched.
- 0F1b, 0F2a, 0F4a, and 0F6a retirements are not changed by R4.7.6.
- Studio files and generated build outputs are untouched.
- Capture menu injection is not gated or retired.
- Folder data/store/binding logic is not gated or retired.
- `STORE_validateFolderCreate` stays live and ungated.

## Rollback Procedure

`git revert <R4.7.6 commit hash>` restores the Native folder sidebar UI.

For targeted rollback, restore the moved blocks from
`folders-sidebar-list.js` into
`src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` at the breadcrumb comments
listed in `extracted-from-0F3a.md`, then rerun the native and Studio
validators.
