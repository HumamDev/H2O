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

## Runtime Proof Target

Use the current restored folder when runtime access is available:

- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `folderName:"chrome restore proof 1782569112247"`

Expected runtime sequence:

1. Desktop export `desktop-to-chrome`.
2. `folderRestoreReceiptExport.receiptCount >= 1`.
3. Chrome import `desktop-to-chrome`.
4. `folderRestoreReceiptImport.importedRestoreReceiptCount >= 1`.
5. `folderRestoreReceiptImport.confirmedRestoreRequestCount >= 1` for the target request, or `alreadyResolvedCount >= 1` if the receipt was replayed.
6. Chrome pending restore request is not left pending forever.
7. Target is not shown as active Recently Deleted after restore.
8. Restore receipt path reports `blockers:[]`.

## Runtime Proof Status

Runtime proof could not complete in this implementation pass because both local runtime gates were unavailable from the current shell.

Desktop queue health attempt:

- Command: `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 15000`
- Result: `ok:false`
- Status: `desktop-queue-client-threw`
- Error: `EPERM: operation not permitted, open '/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json'`
- Blockers: `["desktop-queue-client-threw"]`

Chrome CDP health attempt:

- Command: `node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 10000`
- Result: `ok:false`
- Status: `chrome-cdp-unavailable`
- Error: `chrome-cdp-unavailable: fetch failed`
- Blockers: `["chrome-cdp-unavailable"]`

The static contract is ready for the next Desktop export and Chrome import against the current restored folder once the Desktop smoke queue can write its command file and Chrome CDP is running on port `9247`.

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
- Runtime proof attempts recorded exact blockers:
  - Desktop queue command-file `EPERM`
  - Chrome CDP unavailable on port `9247`
