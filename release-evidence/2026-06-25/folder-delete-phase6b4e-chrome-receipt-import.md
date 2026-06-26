# Phase 6B.4e - Chrome Desktop Delete Receipt Import

## Verdict

Phase 6B.4e fixes Chrome-side Desktop receipt recognition for Chrome-originated folder soft-delete requests.

Chrome still does not own canonical tombstones, purge, restore, hard delete, chat deletion, snapshot deletion, or asset deletion. Desktop remains authoritative. Chrome imports trusted Desktop delete receipts as visible-state-only confirmation so the folder appears in Chrome Recently Deleted as deleted on Desktop.

## Root Cause

The Desktop export already wrote valid `folderDeleteReceipts[]` into `latest.json`, including the target `requestId` and `folderId`.

Chrome receipt import failed because it required a matching local request row in the Chrome request store before applying the visible-state hide. In runtime, the receipt came from Desktop, but the CDP profile/request store did not expose the fresh request row after export/import/reload. The import then reported `receipt-no-matching-request`.

There was a second Chrome-side failure path: if Chrome had already hidden the folder using the local pending-delete overlay, the receipt hide path could not find the row in the normal mirror and tried to read fields from a missing removed row, producing `folder-delete-receipt-hide-failed`.

## Fix Semantics

Chrome now accepts a trusted Desktop receipt for visible-state-only hide when the receipt itself passes the strict Desktop receipt safety contract:

- schema is `h2o.studio.folder-delete-receipt.v1`
- `status:"applied"`
- `decision:"applied-folder-delete-request"`
- `statusOnly:true`
- `noTombstoneApply:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `tombstonePropagation:"deferred"`
- exact `folderId` and `requestId` are present

If a local request row exists, Chrome still validates the request/review match. If the local row is absent but the Desktop receipt is trusted, Chrome records a visible-state-only Desktop receipt marker without creating or applying tombstones.

Historical receipts without local request rows are now warnings/skipped for the request-store import path instead of making the whole receipt import fail. The visible-state hide path records target-friendly receipt diagnostics.

## Diagnostics Added

Chrome companion diagnostics now expose:

- `receiptImportedCount`
- `desktopReceiptHiddenCount`
- `receiptRows[]` with `requestId`, `reviewId`, `receiptId`, and `folderId`
- request rows with `requestId` and `folderId`
- companion rows with `requestId`, `reviewId`, `receiptId`, and `folderId`
- probe matching by `folderId` and `requestId`, not just folder name
- skipped receipts with reason in the receipt import subreport
- `trustedDesktopReceiptWithoutLocalRequestCount`

## Safety Invariants

- no Chrome tombstone apply
- no Chrome tombstone create
- no Chrome permanent delete
- no Chrome purge authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains authoritative

## Validation

Static validation passed:

- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"`
- `node --check tools/validation/sync/validate-folder-delete-phase6b4e-chrome-receipt-import.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4e-chrome-receipt-import.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4d-chrome-export-gate.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4c-chrome-request-export.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4-chrome-to-desktop-soft-delete.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b3a-companion-state.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b3-chrome-recently-deleted-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b2-chrome-delete-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b1-chrome-soft-delete-ui.mjs`
- `git diff --check`
- `git diff --cached --check`

## Runtime Attempt

Runtime command attempted:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase6b4e-receipt-import-proof"}' --timeout-ms 60000
```

The Chrome CDP profile was reachable and the sync folder gate was healthy:

- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `status:"sync-folder-imported"`
- top-level `blockers:[]`

The runtime receipt-import proof is blocked by stale loaded Chrome assets. The import subreport still showed the pre-6B.4e shape and behavior:

- `folderDeleteReceiptImport.ok:false`
- `found:12`
- `alreadyResolvedCount:1`
- `skippedCount:11`
- `blockers:[{ code:"receipt-no-matching-request" }]`
- missing the new `receiptRows`, `skippedReceipts`, and `trustedDesktopReceiptWithoutLocalRequestCount` diagnostics

This indicates the running Chrome Studio profile has not been rebuilt/reloaded with the scoped 6B.4e source changes. The product source fix remains scoped to Chrome receipt import/matching and should be rerun after generated/runtime assets are refreshed.

## Runtime Proof Target

Expected runtime proof for a fresh Chrome-originated folder delete:

1. Chrome creates and exports a `folderDeleteRequest`.
2. Desktop imports and applies the request as `applied-folder-delete-request`.
3. Desktop exports a delete receipt in `latest.json` with the exact `requestId` and `folderId`.
4. Chrome imports the receipt.
5. Chrome companion diagnostics show the target in `receiptRows` or `companionRows`.
6. `companion.blockers:[]`.
7. `noChromePurgeAuthority:true`.
8. `noChromeTombstoneApply:true`.
9. `noHardDelete:true`.
10. `noChatDelete:true`.
11. `noSnapshotDelete:true`.
12. `noAssetDelete:true`.

Runtime proof should be rerun from the current Chrome/CDP profile once the local Chrome and Desktop smoke gates are available.
