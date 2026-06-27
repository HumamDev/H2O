# Phase 6C.5 - Final restore parity audit

## Verdict

PARTIAL. The audit found one real Chrome-side restore parity defect and fixed it with a narrow source change, but post-fix runtime reload/import proof could not complete because the relaunched Chrome CDP profile requires the sync folder permission grant again.

Phase 6C should not be marked fully closed until the post-fix Chrome import proof is rerun in a profile with `/Users/hobayda/H2O Studio Sync` permission granted and shows `pendingTargetRequestCount:0`.

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

## Post-Fix Runtime Blocker

After source fix and `npm run dev:all`, the Studio Launcher extension was rebuilt successfully. A fresh Chrome CDP launch loaded the rebuilt extension, but the smoke profile no longer had granted sync folder permission:

- `status:"blocked"`
- `blockers:["permission-required"]`
- `connected:true`
- `permission:"prompt"`
- `folderName:"H2O Studio Sync"`
- `chromeWritesSyncFolder:true`
- `permissionRequired:true`
- `noFolderHandle:false`

Because Desktop-to-Chrome import requires the folder grant, post-fix runtime proof is blocked until the operator re-grants `/Users/hobayda/H2O Studio Sync` in that Chrome profile.

Required next proof:

1. Grant sync folder permission in the Chrome CDP profile.
2. Run Desktop export `desktop-to-chrome`.
3. Run Chrome import `desktop-to-chrome`.
4. Run `listFolderRestoreRequests` for the target.
5. Expected:
   - `pendingTargetRequestCount:0`
   - `sameFolderPendingRestoreResolvedCount >= 1` if the stale pending row is still present before import
   - target remains visible in normal folder list
   - target remains absent from Chrome Recently Deleted companion

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
