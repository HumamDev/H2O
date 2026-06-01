# Extracted from 0F3a — R4.7.6 Folders Sidebar UI

Source:
`src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js`

Destination:
`retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js`

Commit: _<commit hash; populated post-commit>_

## Moved Regions

| Block | Source lines (pre-R4.7.6) | Moved surface | Destination |
|---|---:|---|---|
| 1 | 108-162 | R4.6.3 per-element org gate for folder sidebar row/more selectors | `folders-sidebar-list.js` Block 1 |
| 2 | 1114-1116, 1188-1222, 1903-1913 | `flsc-folder-row` / `flsc-folder-more` sidebar CSS selector usage and active-row styling | `folders-sidebar-list.js` Block 2 |
| 3 | 3145-3256 | `UI_openFolderActionsPop` archival reference for sidebar more-button context menu | `folders-sidebar-list.js` Block 3 |
| 4 | 4713-5067 | `UI_buildFoldersSection` sidebar row/list render path | `folders-sidebar-list.js` Block 4 |
| 5 | 6242-6266 | `CORE_FS_syncFolderSidebarActiveState` active-row sync path | `folders-sidebar-list.js` Block 5 |
| 6 | 6626-6757 | `CORE_FS_ensureInjected` sidebar injection lifecycle | `folders-sidebar-list.js` Block 6 |

## Live Compatibility Stubs

0F3a keeps no-op compatibility stubs for:

- `UI_buildFoldersSection`
- `CORE_FS_syncFolderSidebarActiveState`
- `CORE_FS_ensureInjected`

The stubs preserve symbol availability for legacy callers while
preventing Native sidebar UI from being rendered.

## Boundaries

These stayed live in 0F3a and were not moved:

- `ENGINE_injectAddToLibrary`
- `ENGINE_injectAddToFolder`
- `STORE_validateFolderCreate`
- `STORE_readData`
- `STORE_writeData`
- `STORE_createFolder`
- `STORE_renameFolder`
- `STORE_setFolderIconColor`
- `STORE_listFolderItems`
- `API_getBinding`
- `API_setBinding`
- `API_saveAndBindToFolder`
- `API_previewMetadataOperation`
- `API_applyMetadataOperation`
- `H2O.folders` public API and LibraryCore folder owner/service/route registration

The capture menu cgxui values `flsc-add-to-library` and
`flsc-add-to-folder` remain active. The retired sidebar cgxui values
`flsc-folder-row` and `flsc-folder-more` remain only as historical
diagnostic constants/comments and archived source.

## Files Explicitly Out of Scope

- `src-runtime-base/0F5a.⬛️🗂️ Tags 🗂️.js` remains byte-exact
  273099 bytes.
- 0D3*/3X* capture files are untouched.
- 0F1j Library Actions is untouched.
- 0F1b, 0F2a, 0F4a, and 0F6a are untouched.
- Studio files and generated build outputs are untouched.

## Replacement

Native folder sidebar UI is replaced by the Studio library stack:

- S0F3b
- S0F1m
- S0F1n
- S0Z1g

## Rollback

Restore the moved blocks from `folders-sidebar-list.js` into the
breadcrumb locations in 0F3a, then rerun:

- `node tools/validation/native/validate-native-library-deprecation.mjs`
- `node tools/validation/studio/validate-studio-library-organization-ui.mjs`
- `node tools/validation/studio/validate-studio-library-actions.mjs`
- `node tools/validation/studio/validate-studio-import-bundle.mjs`
- `node tools/validation/cross-platform/scans/scan-runtime-import-graph.mjs`
