# Phase 6A.4 - Restored history clear runtime proof

## Implementation

Implementation commit:

- `bf3287ee4a2cf04db0d78caa29e092a4574e6806` - `fix(sync): clear restored recently deleted history`

## Semantics

Phase 6A.4 adds a Desktop-only restored/history cleanup path for Recently Deleted folder tombstone rows that have already been restored.

This is separate from active permanent delete:

- `Delete permanently` remains scoped to active deleted folder tombstones.
- `Clear restored history` is scoped to restored/history folder tombstone rows.
- Chrome receives no UI, purge authority, delete authority, or restore authority.
- No folders, chats, snapshots, assets, active visible folders, protected/system folders, or receipt/audit rows are deleted.

## Runtime Source

Runtime proof was run from Desktop Studio DevTools.

## Before State

Recently Deleted:

- `ok:true`
- `total:11`
- `purgeEligibleCount:0`
- `restoredHistoryClearableCount:11`
- `purgeBlockedCount:11`
- `blockers:[]`

Normal folder suspect scan:

- `visibleFolderCount:5`
- `suspectVisibleCount:0`
- `suspects:[]`

## Previews

Active purge preview:

- `ok:true`
- `candidateCount:0`
- `blockers:[]`

Resurrection repair preview:

- `ok:true`
- `candidateCount:0`
- `blockers:[]`

Clear restored history preview:

- `ok:true`
- `restoredHistoryCandidateCount:11`
- `blockers:[]`

## Clear Result

Clear restored history commit:

- `ok:true`
- `status:"folder-restored-history-cleared"`
- `clearedCount:11`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

## After State

Recently Deleted:

- `ok:true`
- `total:0`
- `purgeEligibleCount:0`
- `restoredHistoryClearableCount:0`
- `purgeBlockedCount:0`
- `blockers:[]`

Normal folder suspect scan:

- `visibleFolderCount:5`
- `suspectVisibleCount:0`
- `suspects:[]`

## Safety Invariants

- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No hard folder-row deletion.
- No receipt deletion.
- No Chrome authority.
- No Chrome purge UI.
- No WebDAV/cloud/relay behavior.

## Final Result

Phase 6A.4 runtime proof passed.

- Recently Deleted total is `0`.
- Normal folder suspect rows are `0`.
- Normal visible folder count is `5`.
- Active purge remains separate from restored/history cleanup.
