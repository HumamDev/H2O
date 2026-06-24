# Phase 6A.1 - Desktop Folder Purge API

## Verdict

Phase 6A.1 adds the Desktop-only API and diagnostics layer for operator-confirmed Recently Deleted folder purge.

No UI button is added in this slice.

## Design Note

`Delete permanently` means purging active folder tombstone/recovery records from Desktop's local tombstone store.

This does not delete:

- chats
- snapshots
- assets
- active visible folders
- protected/system folders
- Chrome rows
- delete receipts
- restore receipts
- review/audit records

Desktop remains authoritative. Chrome remains a light companion and receives no purge, delete, restore, hard-delete, or tombstone authority.

## APIs Added

Folder store APIs:

- `H2O.Studio.store.folders.previewRecentlyDeletedFolderPurge(options)`
- `H2O.Studio.store.folders.purgeRecentlyDeletedFolders(options)`

Tombstone store helper:

- `H2O.Studio.store.tombstones.purgeFolderTombstonesByIds(ids, options)`

The tombstone helper is intentionally narrow:

- exact tombstone IDs only
- `record_kind === "folder"` only
- `restored_at IS NULL` only
- SQL-delete only the matching tombstone rows
- no folder row deletion
- no binding deletion
- no receipt deletion

## Commit Preconditions

`purgeRecentlyDeletedFolders(options)` requires:

- `dryRun:false`
- preview token from `previewRecentlyDeletedFolderPurge()`
- expected purge candidate count
- explicit reason
- unchanged candidate set since preview
- non-expired preview token

If any precondition fails, the commit returns a blocker and does not purge.

## Candidate Rules

Candidates are active folder tombstones only:

- `recordKind:"folder"`
- active / not restored
- valid tombstone ID
- valid folder ID
- not currently visible/active in Desktop folder list
- not protected/system/reserved

Skipped rows are diagnosed separately:

- restored rows
- active visible rows
- protected/system rows
- malformed/missing identity rows

## Diagnostics

Preview and commit return:

- `beforeCount`
- `candidateCount`
- `purgedCount`
- `skippedCount`
- `protectedSkippedCount`
- `activeVisibleSkippedCount`
- `restoredSkippedCount`
- `alreadyPurgedSkippedCount`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `desktopOnly:true`
- `chromeAuthority:false`
- `automaticPurge:false`
- `operatorConfirmedPurge:true` only after successful commit

Recently Deleted diagnostics now distinguish:

- automatic purge remains deferred
- operator-confirmed purge may be available
- `purgeEligibleCount` reflects guarded active folder tombstone candidates

## Safety

Preserved:

- no Chrome purge authority
- no Chrome delete authority
- no Chrome restore authority
- no tombstone apply/create on Chrome
- no active visible folder delete
- no protected/system folder delete
- no hard delete
- no purge without preview token and explicit confirmation preconditions
- no chat delete
- no snapshot delete
- no asset delete
- no receipt/audit deletion

## Validation

Static validation added:

```bash
node tools/validation/sync/validate-folder-purge-phase6a.mjs
```

Validation confirms:

- preview and commit APIs exist
- exact-ID tombstone purge helper exists
- commit requires `dryRun:false`
- commit requires preview token
- commit requires expected count
- commit validates candidate set stability
- purge does not call folder `remove()`
- purge does not call soft delete or restore
- purge does not delete chats/snapshots/assets/receipts
- purge does not delete folder rows
- evidence is present

## Runtime Proof

Runtime proof was not executed in this implementation slice because the task is API/diagnostics first and no UI button is added.

Recommended runtime proof for Phase 6A.1:

1. Open Desktop Studio.
2. In Desktop DevTools, run:

```js
const preview = await H2O.Studio.store.folders.previewRecentlyDeletedFolderPurge({
  reason: "phase6a1-runtime-preview"
});
preview;
```

3. If `preview.candidateCount > 0`, run:

```js
await H2O.Studio.store.folders.purgeRecentlyDeletedFolders({
  dryRun: false,
  previewToken: preview.previewToken,
  expectedCount: preview.candidateCount,
  reason: "phase6a1-runtime-operator-confirmed"
});
```

4. Confirm:

- `purgedCount > 0` if candidates existed
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- normal visible folders unchanged
- Recently Deleted count decreases by purged active tombstones

## Next Slice

Phase 6A.2 should add the Desktop-only Recently Deleted UI button:

- label: `Delete permanently`
- top of the main Recently Deleted section
- disabled when `purgeEligibleCount === 0`
- explicit confirmation showing affected count
- no Chrome UI
- no purge button in the sidebar compact entry
