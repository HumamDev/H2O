# Phase 6C.5 - Final restore parity audit

## Verdict

PASS. Phase 6C.5 runtime proof is now green after reconnecting the Chrome sync folder.

The final closeout condition is satisfied: the target Chrome restore request is resolved, not pending, and the restored target does not reappear in Chrome Recently Deleted companion.

## Target

- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `folderName:"chrome restore proof 1782569112247"`

## Audit Finding

The previously proven restore path still held the important user-visible states:

- Desktop export `desktop-to-chrome` wrote `latest.json`.
- Chrome import `desktop-to-chrome` succeeded.
- Desktop showed the target as visible and canonical.
- Chrome Recently Deleted did not show the target as an active companion row.

However, Chrome still had a same-folder restore request row in the request store:

- `listFolderRestoreRequests.ok:true`
- `status:"folder-restore-requests-listed"`
- `count:1`
- target `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- target request `status:"pending"`
- target request `requestId:"folder-restore-request:baf2e96a-cfef-4e10-a755-f0cd86c15a33"`
- warning: `desktop-restore-required`

This violated the Phase 6C.5 audit requirement that the target restore request remains resolved, not pending, after trusted Desktop restore receipt import.

## Root Cause

Chrome restore receipt import could visually re-show the restored folder and keep it out of Recently Deleted, but a later same-folder local restore request could survive as pending/exportable when the trusted Desktop receipt did not match that exact request id.

The intended 6C.4 authority model already allowed folder-id reconciliation for trusted Desktop restore receipts. The final audit exposed that the reconciliation needed a defensive post-receipt pass to resolve any still-pending same-folder restore request.

## Fix Applied

The Chrome MV3 tombstone review store now runs a same-folder pending restore reconciliation after trusted Desktop restore receipt import:

- resolves pending restore requests for the receipt folder id,
- marks them `status:"resolved"`,
- sets `decision:"applied-folder-restore-request"`,
- records `folder-restore-receipt-imported`,
- records `folder-restore-request-applied-on-desktop`,
- records `chrome-restore-direct-apply-blocked`,
- records `no-tombstone-apply`,
- prunes same-folder pending restore export mirror rows,
- reports `sameFolderPendingRestoreResolvedCount`.

The Chrome sync import summary now carries `sameFolderPendingRestoreResolvedCount` forward.

No direct Chrome restore authority was added. The fix is request-state reconciliation only.

## Runtime Proof Before Fix

Desktop export:

- `ok:true`
- `status:"latest-sync-bundle-written"`
- `direction:"desktop-to-chrome"`
- `transport:"latest.json"`
- `bytes:703119`
- `blockers:[]`
- `warnings:[]`
- `folderRestoreReceiptExport.receiptCount:2`
- `folderRestoreReceiptExport.requestReceiptCount:1`
- `folderRestoreReceiptExport.tombstoneFallbackCount:1`

Chrome import:

- `ok:true`
- `status:"sync-folder-imported"`
- `direction:"desktop-to-chrome"`
- `blockers:[]`
- restore receipt import:
  - `found:2`
  - `receiptCount:2`
  - `reShownCount:1`
  - `alreadyVisibleCount:1`
  - `blockers:[]`

Desktop visible check:

- `ok:true`
- `status:"folder-visible"`
- `visible:true`
- `sourceKind:"desktop-store-visible"`
- `stateSource:"desktop-store-visible"`
- `isCanonical:true`
- `hidden:false`
- `mirrorFallbackUsed:false`

Chrome companion check:

- `ok:true`
- `status:"chrome-recently-deleted-companion-diagnosed"`
- `desktopChromeRecentlyDeletedParityOk:true`
- `extraChromeRows:[]`
- `missingChromeRows:[]`
- target probe:
  - `existsInNormalRows:true`
  - `existsInCompanionRows:false`
- `blockers:[]`

Defect observed:

- `chromeRestoreRequestPendingCount:1`
- `pendingRestoreCount:1`
- `folderRestoreRequestExportableCount:1`
- target restore request still `status:"pending"`

## Post-Fix Runtime Proof

Chrome health before proof:

- `status:"healthy"`
- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:[]`

Chrome Desktop-to-Chrome import:

- `imported.ok:true`
- `imported.status:"sync-folder-imported"`
- `imported.blockers:[]`
- `folderRestoreReceiptImport.ok:true`
- `folderRestoreReceiptImport.found:2`
- `folderRestoreReceiptImport.receiptCount:2`
- `folderRestoreReceiptImport.blockerCount:0`
- `folderRestoreReceiptImport.blockers:[]`
- `folderRestoreReceiptImport.staleRestoreRequestCount:2`
- `folderRestoreReceiptImport.sameFolderPendingRestoreResolvedCount:0`

Interpretation: `sameFolderPendingRestoreResolvedCount:0` is expected on this rerun because the request was already resolved by the prior import/fix path. The final request state below is the authoritative closeout condition.

Warning-only restore receipt entries:

- `restore-receipt-no-matching-request`
- non-blocking
- trusted Desktop receipt without a local request

Final target restore request state:

- `listFolderRestoreRequests.ok:true`
- `status:"folder-restore-requests-listed"`
- `count:1`
- `targetRequestCount:1`
- `pendingTargetRequestCount:0`
- target `requestId:"folder-restore-request:baf2e96a-cfef-4e10-a755-f0cd86c15a33"`
- target `status:"resolved"`
- target `decision:"applied-folder-restore-request"`
- warnings include:
  - `folder-restore-receipt-imported`
  - `folder-restore-request-applied-on-desktop`
  - `chrome-restore-direct-apply-blocked`
  - `no-tombstone-apply`
  - `restore-receipt-request-id-mismatch`

Chrome Recently Deleted companion:

- `diagnoseChromeRecentlyDeletedCompanion.ok:true`
- `status:"chrome-recently-deleted-companion-diagnosed"`
- `targetCompanionCount:0`
- `targetCompanionRows:[]`
- `blockers:[]`
- `warnings:[]`

## Runtime Interpretation

Phase 6C.5 runtime proof is green. The key closeout condition is `pendingTargetRequestCount:0`: Chrome no longer keeps a same-folder restore request pending after trusted Desktop restore receipt reconciliation.

The target request is resolved, not pending. The target does not reappear in Chrome Recently Deleted companion.

Desktop trusted receipt reconciliation remains status/request-state reconciliation only. It does not grant Chrome restore authority, tombstone apply/create, purge, hard delete, chat delete, snapshot delete, or asset delete.

## Safety Invariants

- no Chrome direct restore authority
- no Chrome tombstone apply/create
- no Chrome purge authority
- no Chrome permanent delete
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay work

## Validation

- `npm run dev:all`
- `node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c3-desktop-restore-apply.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c2b-export-inflight-recovery.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`
