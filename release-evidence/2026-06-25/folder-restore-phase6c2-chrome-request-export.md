# Phase 6C.2 — Chrome folder restore request writer and export

## Scope

Phase 6C.2 adds the Chrome-side restore request writer/store/export contract only.

Chrome can now request restore from the Chrome Recently Deleted companion and export that request in `chrome-latest.json` as `folderRestoreRequests[]`. Desktop restore import/apply remains deferred to Phase 6C.3.

## Missing Contract Fixed

Phase 6C.1 exposed `Request Restore` but kept it disabled because Chrome had no safe `requestFolderRestore` writer and no `folderRestoreRequests[]` export path.

Phase 6C.2 adds:

- `requestFolderRestore`
- `findPendingFolderRestoreRequest`
- `listFolderRestoreRequests`
- `diagnoseFolderRestoreRequests`
- `folderRestoreRequests[]` Chrome export
- `folderRestoreRequestExport` export diagnostics
- Chrome companion click handling that creates a pending restore request without restoring locally

## Restore Request Shape

Chrome restore requests use:

- `schema:"h2o.studio.folder-restore-request.v1"`
- `intent:"folder-restore-request"`
- `classification:"restore-request"`
- `requestId` / `reviewId`
- `folderId`
- `folderName`
- `tombstoneId` when available
- `requestedAt` / `createdAt`
- `requestedBy:"chrome-studio"`
- `source:"chrome-studio"`
- `sourceSurface:"chrome-studio"`
- `status:"pending"`
- `reason`
- `desktopRestoreRequired:true`
- `desktopApplyRequired:true`
- `noLocalApply:true`
- `noChromeRestoreAuthority:true`
- `noTombstoneApply:true`
- `noTombstoneCreate:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`

## Chrome UX Behavior

In Chrome Recently Deleted:

- `Request Restore` is enabled only for Desktop-canonical Recently Deleted rows.
- Clicking it writes a pending restore request.
- Duplicate clicks are idempotent and return `pending-existing`.
- The row remains in Chrome Recently Deleted.
- The folder is not reinserted into the normal folder list.
- Status changes to `Restore pending`.
- Permanent Delete remains Desktop-only/read-only.

Blocked cases:

- purged/permanently suppressed rows return `folder-restore-request-blocked-purged`
- non-canonical rows return `folder-restore-request-non-canonical-row`
- missing identity returns `folder-identity-missing`

## Chrome Export Contract

Chrome export now adds:

- top-level `folderRestoreRequests[]`
- `folderRestoreRequestExport.requestCount`
- `folderRestoreRequestExport.pendingRestoreRequestCount`
- `folderRestoreRequestExport.skippedCount`
- `folderRestoreRequestExport.purgedRestoreBlockedCount`
- `folderRestoreRequestExport.invalidCount`
- `folderRestoreRequestExport.reviewRequestCount`
- `folderRestoreRequestExport.mirrorRequestCount`
- `folderRestoreRequestExport.staleMirrorSkippedCount`
- `folderRestoreRequestExport.blockers`
- `folderRestoreRequestExport.warnings`

The export path does not apply restore and does not mutate Desktop state.

## Diagnostics

Chrome companion diagnostics now include:

- `chromeRestoreRequestUxAvailable:true`
- `chromeRestoreRequestExportAvailable:true`
- `chromeRestoreRequestPendingCount`
- `folderRestoreRequestExportableCount`
- `pendingRestoreCount`
- `restoreRequestRows`
- `chromeRestoreDirectApplyBlocked:true`
- `noChromeRestoreAuthority:true`
- `noChromeTombstoneApply:true`
- `noHardDelete:true`

## Safety Invariants

- Desktop remains canonical restore authority.
- Chrome creates request intent only.
- no Chrome restore authority
- no Chrome tombstone apply/create
- no Chrome permanent delete
- no Chrome purge authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay changes

## Runtime Proof Status

Runtime proof was not run in this implementation pass. Static validators verify the request writer, export contract, UI wiring, diagnostics, and safety markers.

Expected runtime proof for a later pass:

1. Open Chrome Studio with sync folder connected.
2. Import Desktop canonical Recently Deleted state.
3. Click `Request Restore` on one eligible row.
4. Confirm the row shows `Restore pending`.
5. Confirm the row remains in Recently Deleted and does not reappear in the normal folder list.
6. Export Chrome-to-Desktop.
7. Confirm `folderRestoreRequestExport.requestCount >= 1`.
8. Confirm duplicate click is idempotent.
9. Confirm purged/permanently deleted rows cannot create restore requests.

## Validation

- `node --check src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/smoke/chrome-cdp-studio.mjs`
- `node --check tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `git diff --check`
- `git diff --cached --check`
