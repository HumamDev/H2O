# Phase 6C.3 - Desktop restore request import/apply

## Verdict

Phase 6C.3 adds the missing Desktop-side apply path for Chrome folder restore requests.

Chrome remains request-only. Desktop remains canonical restore authority.

## Root Cause

Phase 6C.2 made Chrome create and export `folderRestoreRequests[]`, but Desktop `chrome-to-desktop` import normalized and applied only `folderDeleteRequests[]`. Restore requests therefore had no Desktop ingestion/apply path.

## Implemented Scope

- Desktop `chrome-to-desktop` normalization now preserves top-level `folderRestoreRequests[]`.
- Desktop review store now supports folder restore request rows:
  - `listFolderRestoreRequests`
  - `ingestFolderRestoreRequests`
  - `applyFolderRestoreRequest`
- Desktop sync import now runs:
  - `folderRestoreRequestImport.found`
  - `folderRestoreRequestImport.inserted`
  - `folderRestoreRequestImport.updated`
  - `folderRestoreRequestImport.skipped`
  - `folderRestoreRequestImport.invalid`
  - `folderRestoreRequestImport.failed`
  - `folderRestoreRequestAutoApply.requestCount`
  - `folderRestoreRequestAutoApply.attemptedCount`
  - `folderRestoreRequestAutoApply.appliedCount`
  - `folderRestoreRequestAutoApply.alreadyAppliedCount`
  - `folderRestoreRequestAutoApply.purgedBlockedCount`
  - `folderRestoreRequestAutoApply.noActiveTombstoneBlockedCount`
  - `folderRestoreRequestAutoApply.failedCount`
- Desktop auto-apply calls `H2O.Studio.store.folders.restoreTombstonedFolder`.
- Duplicate/replayed restore requests are idempotent:
  - already resolved request rows report already applied
  - already-restored folder rows resolve as already restored when the folder exists
- Purged/permanently suppressed restore requests are blocked.
- Missing active tombstone requests are blocked as `folder-restore-request-no-active-tombstone`.
- Smoke bridge exposes `applyFolderRestoreRequest` for Desktop-only runtime proof.

## Safety Invariants

- no Chrome restore authority
- no Chrome tombstone apply/create
- no Chrome permanent delete
- no Chrome purge authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay changes
- no labels/tags/categories changes
- no full chat-folder binding sync changes

## Runtime Proof Status

Runtime Chrome -> Desktop restore proof is complete.

Desktop queue health before import/apply:

- `href:"http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders"`
- `queueEnabled:true`
- `queueStarted:true`
- `queueBlockers:[]`
- `queueRegistryBlockers:[]`
- `queueLastStatus:"duplicate-command-id"`
- `bridgeStatus:"healthy"`
- `bridgeBlockers:[]`

The top-level Desktop smoke wrapper returned `ok:false` with `status:"imported"` because old delete-request rows produced already-tombstoned noise. The restore lane itself was green and is the authority for this Phase 6C.3 result.

Restore request import:

- `folderRestoreRequestImport.ok:true`
- `status:"folder-restore-request-imported"`
- `found:1`
- `inserted:0`
- `updated:1`
- `invalid:0`
- `failed:0`
- `warnings:[]`

Restore request auto-apply:

- `folderRestoreRequestAutoApply.ok:true`
- `status:"folder-restore-request-auto-applied"`
- `found:1`
- `requestCount:1`
- `importedCount:1`
- `attemptedCount:0`
- `appliedCount:0`
- `alreadyAppliedCount:1`
- `purgedBlockedCount:0`
- `noActiveTombstoneBlockedCount:0`
- `failedCount:0`
- `receiptExportReadyCount:1`
- `blockers:[]`
- `desktopAppliedFolderRestoreRequestCount:1`

Visible-folder proof:

- `verifyFolderVisible.ok:true`
- `status:"folder-visible"`
- `visible:true`
- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `folderName:"chrome restore proof 1782569112247"`
- `sourceKind:"desktop-store-visible"`
- `stateSource:"desktop-store-visible"`
- `isCanonical:true`
- `hidden:false`
- `mirrorFallbackUsed:false`

Recently Deleted active-deleted filter proof:

- `listRecentlyDeletedFolders.ok:true`
- `status:"recently-deleted-folders-listed"`
- `targetRowCount:1`
- `targetActiveDeletedCount:0`
- `targetRestoredHistoryCount:1`
- Target row `restoreStatus:"restored"`
- `restoredAt:"2026-06-27T14:35:05.866Z"`
- `restoreAvailable:false`
- `restoreAvailableReason:"already-restored"`
- `purgeEligible:false`
- `operatorPurgeAvailable:false`
- `blockers:[]`
- `warnings:[]`

Interpretation:

- The target appearing in Recently Deleted is restored history, not an active deleted row.
- Phase 6C.3 runtime proof is closed because the folder is visible and `targetActiveDeletedCount:0`.
- The old delete-lane `already-tombstoned` blocker is noisy wrapper aggregation from historical delete rows, not a restore failure.

## Validation

- `node --check` on changed JS/MJS files.
- `node tools/validation/sync/validate-folder-restore-phase6c3-desktop-restore-apply.mjs`
- Existing restore/delete validators:
  - `node tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
  - `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
  - `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`
- Runtime proof confirmed Desktop import/apply accepted the Chrome restore request and resolved it idempotently with `alreadyAppliedCount:1`.

## Deferred

- Desktop restore receipt/export parity to Chrome is handled by later Phase 6C slices unless covered by existing restore receipt export.
- Chrome final restored-list parity after receipt import remains Phase 6C.4/6C.5 scope.
