# Recently Deleted Folder UI Placement

Date: 2026-06-24

## Scope

This note records the placement correction for the Desktop Recently Deleted folder UI.

The previous UI rendered the full tombstone list as an expandable section inside the left folders sidebar. Visual QA found that placement too cramped and confusing. The full Recently Deleted view now belongs to the main Folders page/body.

## Design Note

The change is layout-only.

The existing read-only diagnostics and safe restore behavior remain intact:

- `listRecentlyDeletedFolders`
- `restoreTombstonedFolder` / `restoreFolder` when `restoreAvailable:true`
- retention diagnostics
- purge and hard-delete safety labels

No sync behavior changed.

## Sidebar Placement

The sidebar no longer renders the full Recently Deleted tombstone row list.

The sidebar keeps only a compact entry/counter:

- `Recently Deleted · <count>`
- links to `#/library/folders`
- can scroll/focus the main Recently Deleted panel when already on the Folders page

The sidebar compact entry does not show tombstone rows.

## Main Folders Page Placement

The full Recently Deleted panel now renders in the main Folders page/body under the normal folder list.

The panel preserves:

- aggregate retention counts
- tombstone rows
- restore status
- `restoreAvailable`
- `retentionCountdownStatus`
- `retentionExpiresAt`
- `Purge deferred`
- `Hard delete blocked`
- `Retention enforcement deferred`
- safe restore action for `restoreAvailable:true` rows
- empty/loading/error states

## Safety Invariants

Preserved:

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- no Chrome behavior change
- no WebDAV/cloud/relay behavior

No purge or hard-delete action was added.

## Validation

Passed validation for this placement change:

- `npm run dev:all`
- `node apps/studio/desktop/build-tools/prepare-dist.mjs`
- `node --check` on changed JS/MJS
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- existing sync validators for retention 4E, delete/restore 4D.4, delete request 4C, and restore receipt 4D
- `git diff --check`
- `git diff --cached --check`

`npm run dev:all` retained the existing optional loader-order warning for `7A1a._Prompt_Manager_.js`.

Prepared asset verification confirmed placement markers in:

- `apps/studio/desktop/dist/studio.js`
- `apps/studio/desktop/dist/S0Z1g-Library-Sidebar-Sections-Studio.js`
- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/studio.js`
- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`

## Runtime / Manual Proof

Manual Desktop Studio visual QA should confirm:

- sidebar no longer expands a full Recently Deleted tombstone list
- sidebar shows only a compact Recently Deleted entry/counter if available
- full Recently Deleted view appears in the main Folders page/body
- restore buttons and safety labels still render
- no purge or hard-delete action appears
- no visual flicker, full-page shake, or forced refresh loop occurs
