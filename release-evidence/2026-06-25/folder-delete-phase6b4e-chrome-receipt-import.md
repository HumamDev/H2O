# Phase 6B.4e - Chrome Desktop Delete Receipt Import

## Verdict

Phase 6B.4e fixes Chrome-side Desktop receipt recognition for Chrome-originated folder soft-delete requests.

Chrome still does not own canonical tombstones, purge, restore, hard delete, chat deletion, snapshot deletion, or asset deletion. Desktop remains authoritative. Chrome imports trusted Desktop delete receipts as visible-state-only confirmation so the folder appears in Chrome Recently Deleted as deleted on Desktop.

Final runtime proof is green after loading fresh Chrome Studio assets from the rebuilt Studio Launcher.

## Implementation Commits

- `8e708661eeb12f93e0fddf8602a8c72b0f22f816` - 6B.4c request export repair
- `bb9e76e5d9dfbab7dbe714f2d317fc5f9b44680a` - 6B.4d Chrome export gate fix
- `7a06c0f5fff6b5a82b96477f00817fd016dcaaef` - 6B.4e Chrome receipt import fix

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

## Earlier Runtime Attempt

The first runtime attempt was blocked by stale loaded Chrome assets. It is superseded by the final green runtime proof below.

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

This indicated that the running Chrome Studio profile had not been rebuilt/reloaded with the scoped 6B.4e source changes.

## Final Runtime Proof

Phase: 6B.4e - Chrome receipt import/matching for Desktop-applied Chrome folder delete receipts.

Target:

- `folderId:"fold_smoke_chrome-receipt-import-proof-1782489489705_mqv47woy_935ab2615f49"`
- `requestId:"folder-delete-request:f3a218e1-1368-45ed-a0ab-6d559d4a6e42"`

Fresh Chrome Studio assets were loaded via CDP from the rebuilt Studio Launcher.

### Chrome Health

- `status:"healthy"`
- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:[]`

### Chrome Create And Delete Request

Chrome created a fresh folder:

- `status:"folder-created"`

Chrome created the soft-delete request:

- `status:"pending-created"`
- `requestId:"folder-delete-request:f3a218e1-1368-45ed-a0ab-6d559d4a6e42"`

Chrome exported the request:

- `status:"chrome-to-desktop-exported"`
- `bytes:497398`
- `requestCount:1`
- `reviewRequestCount:1`
- `mirrorRequestCount:1`
- `hiddenWithoutExportableRequestCount:0`
- `blockers:[]`
- `warnings:[]`

### Desktop Queue And Apply

Desktop queue health:

- `queueEnabled:true`
- `queueStarted:true`
- `queueBlockers:[]`
- `queueRegistryBlockers:[]`
- `bridgeStatus:"healthy"`
- `bridgeBlockers:[]`

Desktop import/apply ran. Older already-tombstoned rows produced noise during the run, but the target request was applied and the target later appeared in Desktop `latest.json`.

Desktop receipt export:

- `status:"latest-sync-bundle-written"`
- `bytes:547692`
- `blockers:[]`
- `warnings:[]`

Grep confirmed the target was exported in `/Users/hobayda/H2O Studio Sync/latest.json`:

- contains `folderId:"fold_smoke_chrome-receipt-import-proof-1782489489705_mqv47woy_935ab2615f49"`
- contains `requestId:"folder-delete-request:f3a218e1-1368-45ed-a0ab-6d559d4a6e42"`

### Chrome Receipt Import

Chrome receipt import ran with fresh 6B.4e assets:

- `href` starts with `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg`
- `status:"sync-folder-imported"`
- `direction:"desktop-to-chrome"`
- `blockers:[]`
- `receiptFound:15`
- `trustedWithoutLocalRequest:9`
- `receiptRowsPresent:true`

### Chrome Companion Target Match

The target matched in Chrome Recently Deleted companion:

- `companionMatches` contains the target `folderId`
- `companionMatches` contains the target `requestId`
- `status:"deleted"`
- `source:"desktop-folder-delete-receipt"`
- `companionStatusLabel:"Deleted on Desktop"`
- `pendingDeleteHidden:false`
- `pendingDeleteRequest:false`
- `desktopReceiptHidden:true`

Companion summary:

- `ok:true`
- `status:"chrome-recently-deleted-companion-diagnosed"`
- `chromeRecentlyDeletedCount:13`
- `chromeReceiptImportedCount:13`
- `desktopReceiptHiddenCount:13`
- `pendingDeleteHiddenCount:2`
- `exportableFolderDeleteRequestCount:2`
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`
- `blockers:[]`
- `warnings:[]`

## Caveats

- The target helper returned empty `requestMatches` and `receiptMatches`, but `companionMatches` was non-empty and receipt-confirmed. The product-facing Chrome Recently Deleted companion correctly recognizes the Desktop receipt.
- Desktop Recently Deleted diagnostics previously returned `0` despite active tombstones. That is a follow-up candidate only and was not changed in this evidence step.
- Old historical receipt/request rows produced noise in earlier attempts. The final 6B.4e proof uses a fresh target and a companion match.

## Final Result

Phase 6B.4e is runtime-green for Chrome importing and displaying Desktop-applied folder delete receipts in the Chrome Recently Deleted companion while preserving Chrome as a visible-state-only companion.
