# Local Folder Sync Manual Mutation Roundtrip Proof

Date: 2026-06-23

## Purpose

Record the completed manual Slice 5B mutation proof for local Chrome <-> Desktop folder sync create, rename, and color propagation. This proof intentionally excludes delete, tombstone, restore, purge, chat deletion, snapshot deletion, WebDAV/cloud/relay, and public release signing.

## Folder Under Test

- `folderId`: `fold_smoke_zz-5a-chrome-create_mqr1i0co_9d3c10ab68c7`
- Initial Chrome-created name: `zz-5a-chrome-create`
- Final Desktop-renamed name: `zz-5b-desktop-renamed`
- Initial Chrome-created color: `#FF4C4C`
- Chrome-applied color: `#22C55E`
- Final Desktop-applied color: `#A855F7`
- Chrome CDP port: `9247`

## Proven Sequence

1. Chrome `createFolder` succeeded.
   - `status`: `folder-created`
   - `folderId`: `fold_smoke_zz-5a-chrome-create_mqr1i0co_9d3c10ab68c7`
   - `name`: `zz-5a-chrome-create`
   - `color`: `#FF4C4C`
   - `createPathUsed`: `chrome-folder-state-mirror`
   - `blockers`: `[]`

2. Chrome exported to Desktop.
   - `status`: `chrome-to-desktop-exported`
   - `transport`: `chrome-latest.json`
   - `blockers`: `[]`

3. Desktop verified the Chrome-created folder was visible.
   - `status`: `folder-visible`
   - `folderId`: matched
   - `name`: `zz-5a-chrome-create`
   - `color`: `#FF4C4C`
   - `blockers`: `[]`

4. Desktop renamed the folder.
   - `op`: `renameFolder`
   - `status`: `ok`
   - `action`: `rename`
   - `folderId`: matched
   - `name`: `zz-5b-desktop-renamed`
   - `blockers`: `[]`

5. Desktop exported the rename to Chrome.
   - `status`: `latest-sync-bundle-written`
   - `direction`: `desktop-to-chrome`
   - `transport`: `latest.json`
   - `blockers`: `[]`

6. Chrome imported the Desktop rename.
   - `status`: `sync-folder-imported`
   - `direction`: `desktop-to-chrome`
   - `blockers`: `[]`
   - Deferred warnings appeared and were classified as non-blocking.

7. Chrome verified the rename.
   - `status`: `folder-visible`
   - `folderId`: matched
   - `row.name`: `zz-5b-desktop-renamed`
   - `row.color`: `#FF4C4C`
   - `blockers`: `[]`

8. Chrome changed the folder color.
   - `op`: `setFolderColor`
   - `status`: `folder-color-set`
   - `folderId`: matched
   - `row.name`: `zz-5b-desktop-renamed`
   - `colorBefore`: `#FF4C4C`
   - `colorAfter`: `#22C55E`
   - `colorPathUsed`: `folder-metadata-preview-apply`
   - `staleGuardProvided`: `true`
   - `blockers`: `[]`

9. Chrome exported the color to Desktop.
   - `status`: `chrome-to-desktop-exported`
   - `direction`: `chrome-to-desktop`
   - `transport`: `chrome-latest.json`
   - `blockers`: `[]`

10. Desktop verified the Chrome color.
    - `status`: `folder-visible`
    - `folderId`: matched
    - `row.name`: `zz-5b-desktop-renamed`
    - `row.color`: `#22C55E`
    - `blockers`: `[]`

11. Desktop changed the folder color.
    - `op`: `setFolderColor`
    - `status`: `ok`
    - `action`: `update`
    - `folderId`: matched
    - `blockers`: `[]`

12. Desktop verified the local color.
    - `status`: `folder-visible`
    - `folderId`: matched
    - `row.name`: `zz-5b-desktop-renamed`
    - `row.color`: `#A855F7`
    - `blockers`: `[]`

13. Desktop exported the final color to Chrome.
    - `status`: `latest-sync-bundle-written`
    - `direction`: `desktop-to-chrome`
    - `transport`: `latest.json`
    - `blockers`: `[]`

14. Chrome imported the final color.
    - `status`: `sync-folder-imported`
    - `direction`: `desktop-to-chrome`
    - `blockers`: `[]`
    - Deferred warnings appeared and were classified as non-blocking.

15. Chrome verified the final color.
    - `status`: `folder-visible`
    - `folderId`: matched
    - `row.name`: `zz-5b-desktop-renamed`
    - `row.color`: `#A855F7`
    - `row.iconColor`: `#A855F7`
    - `blockers`: `[]`

## Safety Invariants

- No delete or tombstone mutation was included in this proof.
- No hard delete or purge path was used.
- No raw SQL path was used.
- No chat rows were deleted.
- No snapshot rows were deleted.
- No tombstone propagation apply path was used.
- Chrome remained the light companion surface.
- Desktop remained the canonical folder authority for Desktop-applied rename and color updates.

## Verdict

Manual Slice 5B create/rename/color mutation roundtrip passed. The flow proved Chrome create -> Desktop visibility, Desktop rename -> Chrome visibility, Chrome color -> Desktop visibility, and Desktop color -> Chrome visibility. Deferred propagation warnings during Chrome imports were non-blocking because top-level blockers were empty and the expected folder state converged.

The combined mutation smoke runner now automates this same create/rename/color path while keeping delete/tombstone behavior out of scope.
