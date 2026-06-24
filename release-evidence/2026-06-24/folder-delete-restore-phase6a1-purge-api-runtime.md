# Phase 6A.1 Runtime Proof - Desktop Folder Purge API

## Verdict

Phase 6A.1 Desktop Recently Deleted folder purge API is runtime-proven.

The Desktop-only API previewed and purged active folder tombstone/recovery records while preserving the agreed safety boundaries:

- no chat deletion
- no snapshot deletion
- no asset deletion
- no active visible folder deletion
- no protected/system folder deletion
- no Chrome row deletion
- no receipt/audit deletion

Implementation commit:

- `717765b8767feca1f77eefa1bd040adf0a19d28b` - `feat(sync): add desktop folder purge api`

## API Semantics

`Delete permanently` means purging active folder tombstone/recovery records from Desktop's local tombstone store.

It does not delete:

- chats
- snapshots
- assets
- active visible folders
- protected/system folders
- Chrome rows
- delete receipts
- restore receipts
- review/audit records

The API remains Desktop-only. Chrome remains a light companion and does not gain purge, delete, restore, hard-delete, or tombstone authority.

## Runtime Source

Runtime proof was run from Desktop Studio DevTools against:

- `H2O.Studio.store.folders.previewRecentlyDeletedFolderPurge(...)`
- `H2O.Studio.store.folders.purgeRecentlyDeletedFolders(...)`
- `H2O.Studio.store.folders.listRecentlyDeletedFolders(...)`

No UI button was used or added in this phase.

## Preview Proof

Preview result:

- `ok:true`
- `status:"folder-purge-previewed"`
- `beforeCount:63`
- `candidateCount:52`
- `skippedCount:11`
- `restoredSkippedCount:11`
- `protectedSkippedCount:0`
- `activeVisibleSkippedCount:0`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

Interpretation:

- 52 active folder tombstone/recovery records were eligible for operator-confirmed purge.
- 11 rows were restored/history rows and were correctly skipped.
- No active visible folders or protected/system folders were candidates.

## Commit Proof

Commit result:

- `ok:true`
- `status:"folder-tombstones-purged"`
- `desktopOnly:true`
- `chromeAuthority:false`
- `automaticPurge:false`
- `operatorConfirmedPurge:true`
- `purgeDeletesTombstoneRecoveryRecordsOnly:true`
- `noChromeRowsDeleted:true`
- `noActiveVisibleFolderDelete:true`
- `noProtectedSystemFolderDelete:true`
- `candidateCount:52`
- `purgedCount:52`
- `skippedCount:11`
- `restoredSkippedCount:11`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

Tombstone store result:

- `requestedCount:52`
- `matchedCount:52`
- `purgedCount:52`
- `exactTombstoneIdsOnly:true`
- `restoredRowsRejected:true`

Interpretation:

- The commit purged exactly the 52 previewed active folder tombstone rows.
- The tombstone store helper operated by exact tombstone IDs only.
- Restored rows were not purged.
- The operation did not call folder remove/soft-delete behavior.

## After Proof

Post-purge `listRecentlyDeletedFolders` result:

- `ok:true`
- total rows: `11`
- `purgeEligibleCount:0`
- `purgeBlockedCount:11`

Interpretation:

- The remaining 11 Recently Deleted rows are restored/history rows.
- They are not purge-eligible active deleted folders.
- Operator purge availability is now correctly `0` after the active tombstone purge.

## Safety Invariants

Runtime safety proof:

- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `noChromeRowsDeleted:true`
- `noActiveVisibleFolderDelete:true`
- `noProtectedSystemFolderDelete:true`
- `desktopOnly:true`
- `chromeAuthority:false`

Preserved scope:

- no Chrome purge authority
- no Chrome delete authority
- no Chrome restore authority
- no hard delete
- no chat/snapshot mutation
- no WebDAV/cloud/relay
- no public release/signing scope

## Phase Boundary

Phase 6A.1 is API/diagnostics only.

Phase 6A.2 remains pending and should add the Desktop-only UI button:

- label: `Delete permanently`
- placement: top of the main Recently Deleted section
- disabled when `purgeEligibleCount === 0`
- explicit confirmation using preview token and expected count
- no Chrome UI
- no sidebar purge button
