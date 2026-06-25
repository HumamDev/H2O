# Phase 6A.4 - Clear restored Recently Deleted history

## Verdict

Phase 6A.4 adds a Desktop-only safe cleanup path for restored/history folder tombstone rows that remain in Recently Deleted after restore.

This is separate from active deleted folder permanent purge:

- `Delete permanently (N)` remains for active deleted tombstones only.
- `Clear restored history (N)` clears restored/history tombstone rows only.
- Chrome receives no UI or authority.
- Folder rows, chats, snapshots, assets, active visible folders, protected/system folders, and receipt/audit rows are not deleted.

## Design Note

The current runtime state after Phase 6A.3 is:

- `RECENTLY DELETED · 11`
- `Active 0`
- `Restored 11`
- `Purge eligible 0`
- `Purge blocked 11`

The active permanent-delete button is correctly disabled because there are no active deleted folder tombstones. The remaining rows are restored/history records, so Phase 6A.4 introduces a separate operator-confirmed history clear flow.

## APIs Added

Folder store APIs:

- `H2O.Studio.store.folders.previewRecentlyDeletedRestoredHistoryClear(options)`
- `H2O.Studio.store.folders.clearRecentlyDeletedRestoredHistory(options)`

Tombstone store helper:

- `H2O.Studio.store.tombstones.clearRestoredFolderTombstonesByIds(ids, options)`

The tombstone helper is intentionally narrow:

- exact tombstone IDs only
- `record_kind === "folder"` only
- `restored_at IS NOT NULL` only
- SQL-delete only matching restored folder tombstone history rows
- no active deleted tombstone rows
- no folder row deletion
- no chat/snapshot/asset deletion
- no receipt/review/audit deletion

## Commit Preconditions

`clearRecentlyDeletedRestoredHistory(options)` requires:

- `dryRun:false`
- preview token from `previewRecentlyDeletedRestoredHistoryClear()`
- expected restored history candidate count
- explicit reason
- confirmation via `confirmationPhrase:"CLEAR RESTORED HISTORY"` or explicit confirmation flag
- unchanged candidate set since preview
- non-expired preview token

If any precondition fails, the commit returns a blocker and does not clear rows.

## Candidate Rules

Candidates are restored folder tombstone history rows only:

- `recordKind:"folder"`
- `restoredAt` present or `restoreStatus:"restored"`
- valid tombstone ID
- valid folder ID
- not protected/system/reserved

Skipped rows are diagnosed separately:

- active deleted tombstones
- protected/system rows
- malformed/missing identity rows

## Diagnostics

Preview and commit return:

- `beforeCount`
- `restoredHistoryCandidateCount`
- `candidateCount`
- `clearedCount`
- `skippedCount`
- `activeDeletedSkippedCount`
- `protectedSkippedCount`
- `malformedSkippedCount`
- `alreadyClearedSkippedCount`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `desktopOnly:true`
- `chromeAuthority:false`

Recently Deleted diagnostics now expose:

- `restoredHistoryClearableCount`
- `operatorRestoredHistoryClearAvailableCount`
- `restoredHistoryClearPreviewApi:"previewRecentlyDeletedRestoredHistoryClear"`
- `restoredHistoryClearCommitApi:"clearRecentlyDeletedRestoredHistory"`

`purgeEligibleCount` remains scoped to active deleted folder purge only.

## UI

The Desktop main Recently Deleted panel now shows a separate `Restored history` action block:

- `Clear restored history (N)`
- Enabled only when `restoredHistoryClearableCount > 0`
- Confirmation requires `CLEAR RESTORED HISTORY`
- Confirmation explains this only clears restored/history entries from Recently Deleted
- Confirmation states folders, chats, snapshots, assets, active folders, and receipts are not deleted

The existing `Delete permanently (N)` danger button remains separate and continues to target active deleted tombstones only.

No restored-history clear button is rendered in the sidebar compact Recently Deleted entry or in Chrome Studio.

## Safety

Preserved:

- no Chrome purge authority
- no Chrome delete authority
- no Chrome restore authority
- no active deleted tombstone cleanup through the restored-history API
- no active visible folder delete
- no protected/system folder delete
- no hard folder-row delete
- no chat delete
- no snapshot delete
- no asset delete
- no receipt/audit deletion
- no WebDAV/cloud/relay behavior

## Validation

Static validation added:

```bash
node tools/validation/sync/validate-folder-purge-phase6a4-restored-history.mjs
```

Validation confirms:

- preview and commit APIs exist
- exact-ID restored-only tombstone helper exists
- helper requires `restored_at IS NOT NULL`
- helper rejects active deleted rows by query shape
- commit requires `dryRun:false`
- commit requires preview token
- commit requires expected count
- commit requires confirmation
- commit validates candidate set stability
- commit does not call folder `remove()`
- commit does not call soft delete or restore
- commit does not delete chats/snapshots/assets/receipts
- commit does not delete folder rows
- Desktop main UI has a separate `Clear restored history` action
- sidebar compact entry does not expose the action
- evidence is present

Validation run:

```bash
node --check src-surfaces-base/studio/store/folders.tauri.js
node --check src-surfaces-base/studio/store/tombstones.tauri.js
node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"
node --check tools/validation/sync/validate-folder-purge-phase6a4-restored-history.mjs
node tools/validation/sync/validate-folder-purge-phase6a4-restored-history.mjs
node tools/validation/sync/validate-folder-purge-phase6a.mjs
node tools/validation/sync/validate-folder-purge-phase6a1b.mjs
node tools/validation/sync/validate-folder-purge-phase6a1c.mjs
node tools/validation/sync/validate-folder-purge-phase6a2-ui.mjs
node tools/validation/sync/validate-folder-purge-phase6a2b-ui-layout.mjs
node tools/validation/sync/validate-folder-purge-phase6a2c-ui-layout.mjs
node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs
git diff --check
git diff --cached --check
```

Result:

- All validation commands passed.

## Runtime Proof

Runtime proof was not executed in this implementation slice because the clear commit requires an operator-confirmed live Desktop Studio action. Recommended runtime proof:

1. Open Desktop Studio with Recently Deleted visible.
2. In Desktop DevTools, run:

```js
const preview = await H2O.Studio.store.folders.previewRecentlyDeletedRestoredHistoryClear({
  reason: "phase6a4-runtime-preview"
});
preview;
```

Expected current state:

- `ok:true`
- `beforeCount:11`
- `restoredHistoryCandidateCount:11`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

3. Commit:

```js
await H2O.Studio.store.folders.clearRecentlyDeletedRestoredHistory({
  dryRun: false,
  confirmationToken: preview.previewToken,
  expectedCount: preview.restoredHistoryCandidateCount,
  confirmationPhrase: "CLEAR RESTORED HISTORY",
  reason: "phase6a4-runtime-operator-confirmed"
});
```

Expected:

- `ok:true`
- `clearedCount:11`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

4. Confirm:

- Recently Deleted total is `0`
- `purgeEligibleCount:0`
- normal folder list remains clean
- no `zz-*` or `F5D*` resurrected rows appear

## Status

Phase 6A.4 is implemented and ready for runtime proof.
