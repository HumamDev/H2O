# Phase 6A.1c - Purge resurrection repair runtime proof

## Implementation

Implementation commit:

- `d238b513304dfe802228700e27b17229be3ceaf5` - `fix(sync): repair purged folder resurrection`

## Root Cause

Phase 6A.1 purged active folder tombstone/recovery records only. Desktop normal folder visibility depended on those active tombstones to hide already-soft-deleted folder rows. Once the tombstones were removed, the underlying SQLite `folders` rows became visible again.

## Fix

Phase 6A.1c adds a Desktop-only repair path that permanently suppresses guarded resurrected smoke/test folder rows with the same Desktop-local marker introduced in 6A.1b:

- `phase6aPermanentlyPurged:true`

The repair targets only known smoke/test resurrection patterns and requires preview token plus exact expected count confirmation.

## Runtime Source

Runtime proof was run from Desktop Studio DevTools.

## Preview Result

- `ok:true`
- `status:"purged-folder-resurrection-repair-previewed"`
- `beforeVisibleFolderCount:57`
- `candidateCount:31`
- `protectedSkippedCount:0`
- `activeRealUserSkippedCount:26`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

## Repair Result

- `ok:true`
- `status:"purged-folder-resurrections-repaired"`
- `desktopOnly:true`
- `chromeAuthority:false`
- `operatorConfirmedRepair:true`
- `permanentFolderRowSuppression:true`
- `candidateCount:31`
- `repairedCount:31`
- `permanentlyHiddenFolderRowCount:31`
- `skippedCount:0`
- `protectedSkippedCount:0`
- `activeRealUserSkippedCount:26`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

## After State

- `visibleFolderCount:26`
- `suspectVisibleCount:0`
- `suspectVisibleRows:[]`
- `recentlyDeletedOk:true`
- `recentlyDeletedTotal:11`
- `purgeEligibleCount:0`
- `purgeBlockedCount:11`

The remaining 11 Recently Deleted rows are restored/history rows and are not purge-eligible active deleted folders.

## Safety Invariants

- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No hard folder-row deletion.
- No receipt deletion.
- No Chrome authority.
- No WebDAV/cloud/relay behavior.

## Status

Phase 6A.1c runtime proof passed.

Phase 6A.2 UI button is still not implemented.
