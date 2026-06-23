# Phase 4C.4b Folder Delete Receipt Import

## Purpose

Phase 4C.4b lets Chrome Studio import Desktop status-only folder delete receipts from `latest.json` and mark the matching local Chrome folder-delete request/review as resolved.

This phase is bookkeeping only. Chrome does not hide folders yet, does not apply tombstones, and does not mutate chats, snapshots, bindings, or library rows.

## Files Changed

- `src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c4-receipt-import.md`

## Receipt Import Behavior

Chrome processes top-level `folderDeleteReceipts[]` from Desktop `latest.json` during Desktop-to-Chrome import.

Accepted receipt requirements:

- `schema`: `h2o.studio.folder-delete-receipt.v1`
- `status`: `applied`
- `decision`: `applied-folder-delete-request`
- `statusOnly`: `true`
- `noTombstoneApply`: `true`
- `noHardDelete`: `true`
- `noChatDelete`: `true`
- `tombstonePropagation`: `deferred`
- `requestId` or `reviewId`
- `folderId`

Chrome matches receipts by request identity and `folderId`. Duplicate folder names do not matter.

If no local request matches, Chrome returns `receipt-no-matching-request` and does not mutate folder state. If the receipt targets a different folder than the local request, Chrome returns `receipt-folder-mismatch`.

## Resolved Review Behavior

On a valid receipt with a matching pending local Chrome request, Chrome updates that request review to:

- `status`: `resolved`
- `decision`: `applied-folder-delete-request`

The review raw payload records a `desktopReceiptResult` block with receipt metadata:

- `receiptId`
- `requestId`
- `reviewId`
- `folderId`
- `importedAt` / `receivedAt`
- `appliedAt`
- `tombstoneId` reference only
- `noHardDelete`: `true`
- `noChatDelete`: `true`
- `statusOnly`: `true`
- `noTombstoneApply`: `true`
- `noFolderHide`: `true`
- `chromeHideDeferred`: `true`
- `tombstonePropagation`: `deferred`

Repeat imports are idempotent. A matching already-resolved request returns `folder-delete-receipt-already-resolved` without creating duplicate request rows or applying any entity mutation.

## Safety Guarantees

- Chrome does not hide/remove the folder in Phase 4C.4b.
- Chrome does not create or apply tombstone records.
- Chrome does not call local folder delete/remove APIs.
- Chrome does not mutate chats, snapshots, bindings, or library rows.
- Real tombstone propagation remains deferred.
- Restore receipts remain deferred.
- Retention/purge remains deferred.
- WebDAV/cloud/relay remain deferred.

## Validation

Commands run:

```sh
node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js # pass
node --check src-surfaces-base/studio/sync/folder-import.mv3.js # pass
node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs # pass
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs # pass
git diff --check # pass
```

`git diff --cached --check` is run after staging before commit.

## Runtime Proof Commands

Chrome: verify the local request before import if it is still pending.

```js
await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
  status: "pending",
  folderId: "fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7",
  limit: 20
});
```

Chrome: import Desktop `latest.json`.

```js
await H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4c4b-folder-delete-receipt-import-proof"
});
```

Chrome: list/get the local review after import and confirm it is resolved.

```js
await H2O.Studio.store.tombstoneReviews.getReview(
  "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"
);
```

Expected review state:

- `status`: `resolved`
- `decision`: `applied-folder-delete-request`
- `rawTombstoneJson.desktopReceiptResult.status`: `applied`
- `rawTombstoneJson.desktopReceiptResult.noFolderHide`: `true`
- `rawTombstoneJson.desktopReceiptResult.noTombstoneApply`: `true`

Chrome: inspect the import diagnostic.

```js
H2O.Studio.sync.folder.diagnose().folderDeleteReceiptImport;
```

Expected diagnostic:

- `receiptCount >= 1`
- `resolvedCount === 1` on first import, or `alreadyResolvedCount >= 1` on repeat import
- `noFolderHide: true`
- `noTombstoneApply: true`
- `tombstonePropagation: "deferred"`

Chrome: prove the folder is still visible after receipt import.

```js
const model = await H2O.LibraryWorkspace.getDisplayModel({ fresh: true });
model.folderDisplayRows.find((row) => row.id === "fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7");
```

Chrome: prove no local tombstone apply and no chat/snapshot deletion occurred.

```js
({
  receiptImport: H2O.Studio.sync.folder.diagnose().folderDeleteReceiptImport,
  matchingReview: await H2O.Studio.store.tombstoneReviews.getReview("folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"),
  noChromeTombstoneApply: true,
  noFolderHide: true,
  noChatDelete: true,
  noSnapshotDelete: true
});
```

Chrome: repeat import and confirm idempotency.

```js
await H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4c4b-folder-delete-receipt-import-idempotency"
});

H2O.Studio.sync.folder.diagnose().folderDeleteReceiptImport;
```

Expected repeat result:

- no duplicate request rows
- same review remains `resolved`
- `alreadyResolvedCount >= 1`
- folder still visible because Chrome hide remains deferred to Phase 4C.4c

## Runtime Proof - 2026-06-23

Implementation commit:

- `80ec02ee4f484f6f49549aa477c517c8f3dffde9`
- `feat(sync): import folder delete receipts on chrome`

### Request / Receipt Under Test

- `reviewId` / `requestId`: `folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a`
- `folderId`: `fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- Folder name: `zz-delete-ui-test`

### Chrome Receipt Import Proof

Ran in Chrome Studio:

```js
H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4c4b-folder-delete-receipt-import-proof"
});
```

Import result:

- `ok`: `true`
- `status`: `sync-folder-imported`

`folderDeleteReceiptImport`:

- `schema`: `h2o.studio.folder-delete-receipt-import.v1`
- `phase`: `phase4c.4b`
- `ok`: `true`
- `attempted`: `true`
- `found`: `1`
- `receiptCount`: `1`
- `resolvedCount`: `0`
- `alreadyResolvedCount`: `1`
- `skippedCount`: `0`
- `blockerCount`: `0`
- `warningCount`: `0`
- `tombstonePropagation`: `deferred`

### Review Status Proof

- `beforeReview.status`: `resolved`
- `beforeReview.decision`: `applied-folder-delete-request`
- `afterReview.status`: `resolved`
- `afterReview.decision`: `applied-folder-delete-request`

`afterReview.warningsJson` contained:

- `desktop-apply-required`
- `folder-delete-receipt-imported`
- `folder-delete-request-applied-on-desktop`
- `chrome-hide-deferred`
- `no-tombstone-apply`

`beforePendingCount` was `0` because the request was already resolved before this proof run. This is acceptable for this runtime proof because idempotent re-import was proven by `alreadyResolvedCount: 1`.

### No-Hide / No-Local-Apply Proof

- `folderVisibleBefore`: `true`
- `folderVisibleAfter`: `true`

`folderAfter`:

- `id`: `fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- `name`: `zz-delete-ui-test`

`folderDeleteReceiptImport` safety fields:

- `noFolderHide`: `true`
- `noFolderMutation`: `true`
- `noBindingMutation`: `true`
- `noChatMutation`: `true`
- `noSnapshotMutation`: `true`
- `noTombstoneApply`: `true`
- `noHardDelete`: `true`
- `noChatDelete`: `true`

### Runtime Verdict

Phase 4C.4b Chrome receipt import passed.

- Chrome imports the status-only Desktop receipt.
- The matching Chrome delete request/review remains resolved with decision `applied-folder-delete-request`.
- Re-import is idempotent.
- Chrome does not hide the folder yet.
- Chrome does not apply tombstones.
- Chrome does not mutate folders, chats, bindings, or snapshots.

Still deferred:

- Chrome hide remains deferred to Phase 4C.4c.
- Restore receipts remain deferred.
- Retention/purge remains deferred.
- WebDAV/cloud/relay remain deferred.
