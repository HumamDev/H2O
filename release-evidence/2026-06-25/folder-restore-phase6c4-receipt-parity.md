# Phase 6C.4 - Restore receipt parity

## Verdict

Phase 6C.4 closes the restore receipt parity gap between Desktop Studio and Chrome Studio.

Desktop now exports request-backed `folderRestoreReceipts[]` after applying or recognizing a Chrome folder restore request. Chrome imports trusted Desktop restore receipts and resolves the matching pending restore request without gaining restore authority.

## Gap Closed

Phase 6C.3 made Desktop import and safely apply Chrome `folderRestoreRequests[]`, but Chrome could still keep the request pending until a trusted Desktop restore receipt was imported.

The existing Desktop restore receipt export was tombstone-derived and status-only. It could re-show a hidden folder by `folderId`, but it did not carry `requestId` / `reviewId` identity for Chrome request reconciliation.

## Implemented Contract

Desktop restore receipt export:

- Projects resolved Desktop restore request reviews into `folderRestoreReceipts[]`.
- Includes:
  - `requestId`
  - `reviewId`
  - `folderId`
  - `folderName`
  - `status:"restored"`
  - `decision:"desktop-folder-restored"`
  - `restoreDecision`
  - `restoredAt`
  - `tombstoneId`
  - Desktop authority/source fields
- Keeps tombstone-derived restore receipts as fallback for restored folders that do not have a request review.
- Exposes `folderRestoreReceiptExport` diagnostics:
  - `receiptCount`
  - `requestReceiptCount`
  - `tombstoneFallbackCount`

Chrome restore receipt import:

- Validates trusted Desktop restore receipts.
- Resolves matching pending restore requests by `requestId` / `reviewId`.
- Falls back to safe folder-id reconciliation when needed and records `restoreReceiptRequestIdMismatchCount`.
- Treats trusted Desktop restore receipts without a local request as warning-only stale receipt history.
- Prunes the pending restore request export mirror after confirmation.
- Preserves the existing visible-state-only re-show behavior for restored folders.

Chrome import diagnostics now include:

- `folderRestoreReceiptImport`
- `importedRestoreReceiptCount`
- `confirmedRestoreRequestCount`
- `staleRestoreRequestCount`
- `restoreReceiptRequestIdMismatchCount`

## Runtime Proof

Target restored folder:

- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `folderName:"chrome restore proof 1782569112247"`

Desktop restore receipt export:

- Command direction: `desktop-to-chrome`
- `ok:true`
- `status:"latest-sync-bundle-written"`
- `transport:"latest.json"`
- `bytes:703129`
- `blockers:[]`
- `warnings:[]`
- `folderRestoreReceiptExport.schema:"h2o.studio.folder-restore-receipt.v1"`
- `folderRestoreReceiptExport.receiptCount:2`
- `folderRestoreReceiptExport.requestReceiptCount:1`
- `folderRestoreReceiptExport.tombstoneFallbackCount:1`
- Safety flags:
  - `noChromeRestoreAuthority:true`
  - `noTombstoneApply:true`
  - `noHardDelete:true`
  - `noChatDelete:true`
  - `noSnapshotDelete:true`
  - `noAssetDelete:true`

Chrome restore receipt import:

- Import direction: `desktop-to-chrome`
- `imported.ok:true`
- `imported.status:"sync-folder-imported"`
- `imported.blockers:[]`
- `folderRestoreReceiptImport.schema:"h2o.studio.folder-restore-receipt.v1.chrome-import"`
- `folderRestoreReceiptImport.ok:true`
- `folderRestoreReceiptImport.found:2`
- `folderRestoreReceiptImport.receiptCount:2`
- `folderRestoreReceiptImport.importedRestoreReceiptCount:1`
- `folderRestoreReceiptImport.confirmedRestoreRequestCount:1`
- `folderRestoreReceiptImport.staleRestoreRequestCount:1`
- `folderRestoreReceiptImport.restoreReceiptRequestIdMismatchCount:0`
- `folderRestoreReceiptImport.reShownCount:1`
- `folderRestoreReceiptImport.alreadyVisibleCount:1`
- `folderRestoreReceiptImport.blockerCount:0`
- `folderRestoreReceiptImport.blockers:[]`
- Warning count: `1`
  - `code:"restore-receipt-no-matching-request"`
  - `trustedDesktopReceiptWithoutLocalRequest:true`
  - `warningOnly:true`
  - Interpretation: tombstone fallback receipt had no matching local request. This is non-blocking restored-history noise.

Chrome pending restore request resolution:

- `listFolderRestoreRequests.ok:true`
- `status:"folder-restore-requests-listed"`
- `count:1`
- `targetRequestCount:1`
- `pendingTargetRequestCount:0`
- Target request:
  - `requestId:"folder-restore-request:9a732e99-d63c-413f-aeae-274db6f2b25e"`
  - `status:"resolved"`
  - `decision:"applied-folder-restore-request"`
  - Warnings include:
    - `folder-restore-receipt-imported`
    - `folder-restore-request-applied-on-desktop`
    - `chrome-restore-direct-apply-blocked`
    - `no-tombstone-apply`

Chrome Recently Deleted companion:

- `diagnoseChromeRecentlyDeletedCompanion.ok:true`
- `status:"chrome-recently-deleted-companion-diagnosed"`
- `targetCompanionCount:0`
- `targetCompanionRows:[]`
- `blockers:[]`
- `warnings:[]`

## Runtime Interpretation

Phase 6C.4 runtime proof is closed. Desktop exports restore receipts, Chrome imports trusted Desktop restore receipts, and Chrome resolves the pending restore request without leaving the target pending forever.

The target no longer appears as an active Chrome Recently Deleted companion row. The fallback tombstone receipt without a matching local request is warning-only and non-blocking.

Chrome health returned `status:"blocked"` with blocker `chrome-to-desktop-export-failed` during this pass. That is unrelated noise from the opposite export direction. The Phase 6C.4 `desktop-to-chrome` import lane reports `blockers:[]` and is green.

## Safety Invariants

- no Chrome restore authority
- no Chrome tombstone apply/create
- no Chrome purge authority
- no Chrome permanent delete
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no Desktop purge behavior change
- no WebDAV/cloud/relay work

## Validation

- `node --check` on changed JS/MJS files.
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- Existing validators:
  - `node tools/validation/sync/validate-folder-restore-phase6c3-desktop-restore-apply.mjs`
  - `node tools/validation/sync/validate-folder-restore-phase6c2b-export-inflight-recovery.mjs`
  - `node tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
  - `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`
- Runtime proof passed for Desktop restore receipt export and Chrome restore receipt import.
