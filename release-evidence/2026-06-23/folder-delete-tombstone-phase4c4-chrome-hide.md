# Folder Delete Tombstone Phase 4C.4c - Chrome Receipt Hide

Date: 2026-06-23

## Purpose

Phase 4C.4c completes the status receipt loop for Chrome-visible state only. After Chrome imports a validated Desktop-applied folder delete receipt and the matching local Chrome delete request/review is resolved or resolvable by the Phase 4C.4b receipt import flow, Chrome hides the folder from normal visible folder state.

This is not a tombstone apply. It is a local Chrome folder-state mirror visibility update.

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c4-chrome-hide.md`

## Hide Semantics

Chrome processes `folderDeleteReceipts[]` during Desktop-to-Chrome `latest.json` import. A folder can be hidden only when the receipt is valid and the matching local Chrome folder-delete request/review is resolved/applied.

Validation gates:

- `schema: h2o.studio.folder-delete-receipt.v1`
- `status: applied`
- `decision: applied-folder-delete-request`
- `statusOnly: true`
- `noTombstoneApply: true`
- `noHardDelete: true`
- `noChatDelete: true`
- `tombstonePropagation: deferred`
- receipt includes request/review identity and folder identity
- local Chrome review/request exists
- local review folder id matches the receipt folder id
- local review is resolved with decision `applied-folder-delete-request`

The visible-state update removes the folder id from the Chrome folder-state mirror (`FOLDER_STATE_KEY_LOCAL`) and records a reversible local marker under `hiddenByDesktopReceipt` with receipt/request/review metadata:

- `hiddenByDesktopReceipt: true`
- `deletedByDesktopReceipt: true`
- `statusOnly: true`
- `noTombstoneApply: true`
- `noHardDelete: true`
- `noChatDelete: true`
- `tombstonePropagation: deferred`

The import refresh summary includes `delete-receipt-hide` and uses the existing post-import sidebar refresh path. It does not trigger a full page reload.

## Idempotency

Repeated import of the same receipt:

- keeps the Chrome review resolved/applied
- keeps the folder hidden
- reports `alreadyHiddenCount` when the mirror already has the hide marker
- does not create duplicate request rows
- does not create Chrome tombstones
- does not perform destructive folder/chat/snapshot/binding writes

## Safety Guarantees

- No Chrome tombstone apply.
- No Chrome tombstone creation.
- No hard delete.
- No chat delete.
- No snapshot delete.
- No destructive binding mutation.
- No restore receipt behavior.
- No retention or purge behavior.
- WebDAV/cloud/relay remain deferred.

## Validation

- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js` - passed
- `node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs` - passed
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs` - passed
- `git diff --check` - passed
- `git diff --cached --check` - passed

## Runtime Proof Commands

Chrome before import:

```js
const folderId = "fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7";
const reviewId = "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a";

const beforeModel = await H2O.Library.FolderParity.getDisplayModel({ fresh: true, reason: "phase4c4c-before" });
const beforeVisible = (beforeModel.canonicalRows || []).some((row) => (row.id || row.folderId) === folderId);
const beforeReview = await H2O.Studio.store.tombstoneReviews.getReview(reviewId);
({ beforeVisible, reviewStatus: beforeReview?.status, reviewDecision: beforeReview?.decision });
```

Chrome import:

```js
const importResult = await H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4c4c-folder-hide-proof"
});
importResult.folderDeleteReceiptImport;
```

Chrome after import:

```js
const afterModel = await H2O.Library.FolderParity.getDisplayModel({ fresh: true, reason: "phase4c4c-after" });
const afterVisible = (afterModel.canonicalRows || []).some((row) => (row.id || row.folderId) === folderId);
const afterReview = await H2O.Studio.store.tombstoneReviews.getReview(reviewId);
({
  afterVisible,
  reviewStatus: afterReview?.status,
  reviewDecision: afterReview?.decision,
  folderDeleteReceiptImport: H2O.Studio.sync.folder.diagnose?.().folderDeleteReceiptImport
});
```

Expected:

- `folderDeleteReceiptImport.hiddenCount >= 1` on first hide, or `alreadyHiddenCount >= 1` on repeat import.
- `afterVisible === false`.
- review remains `resolved` with decision `applied-folder-delete-request`.
- `noTombstoneApply === true`.
- `noHardDelete === true`.
- `noChatDelete === true`.
- `noBindingMutation === true`.
- `noChatMutation === true`.
- `noSnapshotMutation === true`.

Repeat/idempotency proof:

```js
const repeat = await H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4c4c-folder-hide-idempotency-proof"
});
const repeatModel = await H2O.Library.FolderParity.getDisplayModel({ fresh: true, reason: "phase4c4c-repeat" });
({
  folderStillHidden: !(repeatModel.canonicalRows || []).some((row) => (row.id || row.folderId) === folderId),
  receiptImport: repeat.folderDeleteReceiptImport
});
```

Expected:

- folder remains hidden
- receipt import is idempotent
- no Chrome tombstone is created
- no chat/snapshot/binding mutation occurs

## Remaining Deferred Work

- Restore receipts.
- Tombstone propagation to Chrome.
- Retention and purge.
- WebDAV/cloud/relay transport adapters.
