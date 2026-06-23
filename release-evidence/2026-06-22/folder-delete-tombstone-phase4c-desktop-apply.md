# Folder Delete Tombstone Phase 4C.3b Desktop Apply

Date: 2026-06-23

## Purpose

Add a Desktop-only approval/apply API for pending Chrome-created folder delete requests. The API applies a request by calling the existing safe Desktop folder soft-delete path and does not implement a new delete path.

## APIs Added

- `H2O.Studio.store.tombstoneReviews.applyFolderDeleteRequest(input, options)`

Accepted input:

- `reviewId`
- `requestId`
- direct string id

The API validates that the review/request is:

- `schema:"h2o.studio.folder-delete-request.v1"` in the raw request payload
- `classification:"delete-request"`
- `intent:"folder-soft-delete-request"`
- `recordKind:"folder"`
- `status:"pending"`
- `desktopApplyRequired:true`
- identity-bearing with a non-empty `folderId`

Then it calls only:

```js
H2O.Studio.store.folders.softDeleteFolder({ folderId }, {
  deleteReason: "desktop-approved-chrome-folder-delete-request",
  sourceReviewId: reviewId,
  reviewId,
  requestId,
  noHardDelete: true,
  noChatDelete: true
});
```

## Behavior Implemented

- Desktop can explicitly apply a pending imported Chrome folder-delete request.
- Desktop re-checks the target folder by `folderId` before calling `softDeleteFolder`.
- Protected/system/Unfiled/local-review/already-tombstoned blockers remain owned by the existing `softDeleteFolder` authority.
- On successful soft delete, the review row is marked:
  - `status:"resolved"`
  - `decision:"applied-folder-delete-request"`
  - `decided_at:<appliedAt>`
  - `decided_by_sync_peer_id:<local peer if available>`
- The raw request JSON records a `desktopApplyResult` block with:
  - `appliedAt`
  - `appliedBySurface:"desktop-studio"`
  - `tombstoneId`
  - `folderId`
  - `affectedChatCount`
  - `bindingCount`
  - `noHardDelete:true`
  - `noChatDelete:true`
  - `chromeReceiptDeferred:true`
  - `tombstonePropagation:"deferred"`
- Non-pending reviews are blocked idempotently and do not call `softDeleteFolder`.

## Safety Invariants

- No new delete implementation was added.
- No raw SQL delete is used for folders or bindings.
- No hard delete or purge is introduced.
- No chat rows are deleted.
- No snapshot/library rows are deleted.
- No direct binding mutation is performed by the review apply API.
- Chat unbinding for folder-with-chat delete remains inside the existing Phase 4B `softDeleteFolder` path.
- Import remains non-applying; apply only runs when `applyFolderDeleteRequest(...)` is explicitly called.
- Chrome receipt/export and Chrome hiding remain deferred.

## Blocked Behavior

Blocked apply returns blockers without mutating review status unless the safe soft-delete succeeds. This is the conservative choice for Phase 4C.3b because Desktop operator review/apply is still console/API-only and Chrome receipts are deferred.

Expected blocked examples:

- `review-not-found`
- `review-not-delete-request`
- `review-record-kind-not-folder`
- `folder-delete-request-not-pending`
- `folder-delete-request-already-applied`
- `folder-identity-missing`
- `folder-store-unavailable`
- existing `softDeleteFolder` blockers such as `protected-folder`, `system-folder`, `unfiled-folder`, `local-review-folder-not-editable`, `already-tombstoned`

## Validation Commands / Results

```bash
node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js
node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs
git diff --check
git diff --cached --check
```

Results:

- `node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js`: PASS.
- `node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs`: PASS.
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs`: PASS.
- `git diff --check`: PASS.
- `git diff --cached --check`: PASS before commit.

## Runtime Test Commands

### 1. List pending Desktop request

```js
const reviewId = "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a";
const folderId = "fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7";
const pending = await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
  folderId,
  status: "pending",
  limit: 20
});
({ pendingCount: pending.length, pending });
```

### 2. Apply request

```js
const applyResult = await H2O.Studio.store.tombstoneReviews.applyFolderDeleteRequest({
  reviewId: "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"
}, {
  reason: "phase4c-desktop-apply-runtime-proof"
});
applyResult;
```

Expected:

```js
{
  ok: true,
  applied: true,
  status: "folder-delete-request-applied",
  decision: "applied-folder-delete-request",
  tombstoneId: "tombstone:...",
  noHardDelete: true,
  noChatDelete: true,
  chromeReceiptDeferred: true,
  tombstonePropagation: "deferred"
}
```

### 3. Verify folder soft-deleted

```js
const folders = await H2O.Studio.store.folders.list();
const activeRows = folders.filter((row) => String(row.id || row.folderId) === folderId);
({ folderStillVisibleInNormalList: activeRows.length > 0, activeRows });
```

Expected: `folderStillVisibleInNormalList:false`.

### 4. Verify active tombstone created

```js
const tombstones = await H2O.Studio.store.tombstones.list({
  recordKind: "folder",
  includeRestored: false,
  limit: 100
});
const active = tombstones.filter((row) => String(row.recordId) === `folder:${folderId}`);
active.map((row) => ({
  tombstoneId: row.tombstoneId,
  recordKind: row.recordKind,
  recordId: row.recordId,
  restoredAt: row.restoredAt,
  deleteReason: row.deleteReason
}));
```

Expected: one active folder tombstone for the target folder.

### 5. Verify review status/result

```js
const review = await H2O.Studio.store.tombstoneReviews.getReview(
  "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"
);
({
  status: review.status,
  decision: review.decision,
  decidedAt: review.decidedAt,
  raw: JSON.parse(review.rawTombstoneJson)
});
```

Expected:

- `status:"resolved"`
- `decision:"applied-folder-delete-request"`
- `raw.desktopApplyResult.tombstoneId` present
- `raw.desktopApplyResult.noHardDelete:true`
- `raw.desktopApplyResult.noChatDelete:true`

### 6. Repeat apply / idempotency

```js
const again = await H2O.Studio.store.tombstoneReviews.applyFolderDeleteRequest({
  reviewId: "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"
}, {
  reason: "phase4c-desktop-apply-repeat-proof"
});

const activeAgain = (await H2O.Studio.store.tombstones.list({
  recordKind: "folder",
  includeRestored: false,
  limit: 100
})).filter((row) => String(row.recordId) === `folder:${folderId}`);

({ again, activeTombstoneCount: activeAgain.length });
```

Expected:

- repeat apply does not create a duplicate active tombstone
- `again.status:"folder-delete-request-already-applied"` or equivalent non-pending blocker
- `activeTombstoneCount:1`

### 7. Verify no chat/snapshot deletion

Before and after applying a request against a folder with chats, capture counts:

```js
const chatsBefore = await H2O.Studio.store.chats.list?.({ limit: 100000 });
const snapshotsBefore = await H2O.Studio.store.snapshots.list?.({ limit: 100000 });

// apply request here

const chatsAfter = await H2O.Studio.store.chats.list?.({ limit: 100000 });
const snapshotsAfter = await H2O.Studio.store.snapshots.list?.({ limit: 100000 });
({
  chatCountBefore: Array.isArray(chatsBefore) ? chatsBefore.length : "unavailable",
  chatCountAfter: Array.isArray(chatsAfter) ? chatsAfter.length : "unavailable",
  snapshotCountBefore: Array.isArray(snapshotsBefore) ? snapshotsBefore.length : "unavailable",
  snapshotCountAfter: Array.isArray(snapshotsAfter) ? snapshotsAfter.length : "unavailable"
});
```

Expected: chat and snapshot counts do not decrease.

## Runtime Proof

Implementation commit under test:

- `5b8da7e5b0de11f28f9a47db690eadb8536788db`
- `feat(sync): apply chrome folder delete requests on desktop`

### Request / Folder Under Test

- `reviewId: folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a`
- `folderId: fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- folder name: `zz-delete-ui-test`

### First Desktop Apply Proof

- `pendingBeforeCount: 1`
- `visibleBefore: true`
- `applyResult.schema: h2o.studio.tombstone-review-apply-result.v1`
- `applyResult.phase: phase4c.3b`
- `applyResult.ok: true`
- `applyResult.applied: true`
- `applyResult.requestApplyOnly: true`
- `applyResult.mutationType: folder.softDelete`
- `applyResult.noHardDelete: true`
- `applyResult.noChatDelete: true`
- `visibleAfter: false`
- `reviewAfter.status: resolved`
- `reviewAfter.decision: applied-folder-delete-request`
- `reviewAfter.decidedAt: 2026-06-23T10:21:54.461Z`
- `chatCountBefore: 20`
- `chatCountAfter: 20`
- `snapshotCountBefore: 7`
- `snapshotCountAfter: 7`

### Tombstone Proof

New active tombstone:

- `tombstoneId: tombstone:0d5ed9cf-6a1f-4ae9-9089-6b22114a34df`
- `recordKind: folder`
- `recordId: folder:fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- `deletedAt: 2026-06-23T10:21:54.450Z`
- `restoredAt: null`
- `deleteReason: desktop-approved-chrome-folder-delete-request`
- `noChatDelete: true`
- `bindingCount: 0`
- `affectedChatCount: 0`

Historical restored tombstone also existed:

- `tombstoneId: tombstone:5547a347-3528-4257-9815-c49e7fd327dc`
- `deletedAt: 2026-06-22T16:26:53.031Z`
- `restoredAt: 2026-06-22T16:28:20.022Z`
- `deleteReason: desktop-action-empty-folder-soft-delete`

Important interpretation:

- `totalMatchingTombstones: 2`
- `activeUnrestoredTombstoneCount: 1`
- the second tombstone is historical/restored, not an active duplicate
- `tombstones.list({ includeRestored:false })` appeared to still surface restored tombstones, so active proof should filter by `!restoredAt`

### Repeat Apply / Idempotency Proof

- `again.schema: h2o.studio.tombstone-review-apply-result.v1`
- `again.phase: phase4c.3b`
- `again.ok: false`
- `again.applied: false`
- `again.alreadyApplied: true`
- `again.status: folder-delete-request-already-applied`
- `again.blockers` included code: `folder-delete-request-already-applied`
- `again.reviewFound: true`
- `again.reviewStatus: resolved`
- `again.reviewUpdated: false`
- `again.localTombstoneCreated: false`
- `again.writesPerformed: 0`
- `again.noHardDelete: true`
- `again.noChatDelete: true`
- active unrestored tombstone count after repeat: `1`
- `reviewAfterRepeat.status: resolved`
- `reviewAfterRepeat.decision: applied-folder-delete-request`

### Runtime Verdict

Phase 4C.3b Desktop review/apply path passed:

- Desktop applies a pending Chrome folder-delete request only through safe `softDeleteFolder`.
- The review transitions to resolved/applied.
- The folder is soft-deleted and hidden from the normal folder list.
- An active tombstone is created exactly once.
- Repeat apply is idempotently blocked and performs no writes.
- No chats or snapshots were deleted.
- Chrome receipt/hiding remains deferred.
- Tombstone propagation remains deferred.
- Retention/purge and WebDAV/cloud/relay remain deferred.

## Remaining Deferred

- Desktop operator UI for reviewing/applying requests.
- Status receipt back to Chrome.
- Chrome hiding after Desktop-approved apply.
- Real tombstone propagation to Chrome.
- Retention/purge.
- WebDAV/cloud/relay.
- Labels/Categories.
- Broad F10.8 activation.
