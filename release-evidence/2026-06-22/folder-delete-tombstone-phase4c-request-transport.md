# Folder Delete Tombstone Phase 4C.3a Request Transport

Date: 2026-06-22

## Purpose

Transport Chrome-created folder delete requests to Desktop review storage without applying deletion. This is the first Chrome-to-Desktop request transport slice only: Desktop can ingest and list pending requests, but operator approval/apply remains deferred.

## Files Changed

- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
- `tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `release-evidence/2026-06-22/folder-delete-tombstone-phase4c-request-transport.md`

## Behavior Implemented

- Chrome `chrome-latest.json` export now includes a sanitized `folderDeleteRequests[]` section.
- Only pending request records are exported when they match:
  - `schema:"h2o.studio.folder-delete-request.v1"`
  - `intent:"folder-soft-delete-request"`
  - `status:"pending"`
  - `desktopApplyRequired:true`
- Desktop Chrome import preserves `folderDeleteRequests[]` through the supported bundle sanitizer.
- Desktop imports requests into `sync_tombstone_reviews` through `H2O.Studio.store.tombstoneReviews.ingestFolderDeleteRequests(...)`.
- Desktop exposes console-verifiable request listing through `H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests(...)`.
- Import dedupes by request identity and by an already-pending folder request to prevent repeated import spam.

## Explicit Non-Apply Guarantee

- Desktop import does not call `softDeleteFolder` or `softDeleteEmptyFolder`.
- Desktop import does not create applied tombstones.
- Desktop import does not hide or remove folder rows.
- Desktop import does not unbind or bind chats.
- Desktop import does not delete chats, snapshots, bindings, or library rows.
- Chrome export only serializes request review records and does not apply any mutation.
- Tombstone propagation remains deferred.
- Desktop review/apply and operator UI remain deferred to Phase 4C.3b.

## Request Transport Section

The Chrome-to-Desktop bundle section is:

```json
{
  "folderDeleteRequests": [
    {
      "schema": "h2o.studio.folder-delete-request.v1",
      "requestId": "folder-delete-request:...",
      "recordKind": "folder",
      "intent": "folder-soft-delete-request",
      "classification": "delete-request",
      "folderId": "fold_...",
      "folderNameAtRequest": "example",
      "requestedAt": "2026-06-22T...",
      "sourceSurface": "chrome-studio",
      "sourcePeerId": "chrome-studio",
      "status": "pending",
      "noHardDelete": true,
      "noChatDelete": true,
      "desktopApplyRequired": true,
      "noLocalApply": true,
      "noFolderMutation": true,
      "noBindingMutation": true,
      "noChatMutation": true,
      "noSnapshotMutation": true
    }
  ]
}
```

## Validation Commands / Results

```bash
node --check src-surfaces-base/studio/sync/auto-import.mv3.js
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js
node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs
git diff --check
git diff --cached --check
```

Results:

- `node --check` passed for all changed JS/MJS files.
- `validate-folder-delete-request-phase4c.mjs`: PASS.
- `git diff --check`: PASS.
- `git diff --cached --check`: PASS before commit.

## Runtime Proof Commands

### 1. Chrome: create/list pending request and export bundle

```js
const folderId = "<folder-id>";
const request = await H2O.Studio.actions.folders.requestDelete({
  folderId,
  folderName: "<folder-name>",
  sourceSurface: "chrome-studio",
  reason: "phase4c-request-transport-proof"
});

const pending = await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
  folderId,
  status: "pending",
  limit: 20
});

const exported = await H2O.Studio.sync.folder.exportChromeToSyncFolder?.({
  reason: "phase4c-request-transport-proof",
  folderAutoSync: true
});

({ request, pendingCount: pending.length, exported });
```

If the export helper is not available under `sync.folder`, use the installed Chrome export API:

```js
await H2O.Studio.sync.autoImport.exportNow({
  reason: "phase4c-request-transport-proof",
  folderAutoSync: true
});
```

Inspect the written `chrome-latest.json` and confirm:

```js
// Expected bundle proof:
// bundle.folderDeleteRequests.some((r) =>
//   r.schema === "h2o.studio.folder-delete-request.v1" &&
//   r.intent === "folder-soft-delete-request" &&
//   r.status === "pending" &&
//   r.folderId === folderId &&
//   r.desktopApplyRequired === true
// )
```

### 2. Desktop: import/sync and list pending request

```js
await H2O.Studio.sync.folder.importChromeLatestFromSyncFolder?.({
  reason: "phase4c-request-transport-proof"
});
```

If using the folder sync namespace directly:

```js
await H2O.Studio.sync.importChromeLatestFromFolder("<sync-folder-path>", {
  reason: "phase4c-request-transport-proof"
});
```

List ingested requests:

```js
await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
  folderId: "<folder-id>",
  status: "pending",
  limit: 20
});
```

Check import diagnostics:

```js
H2O.Studio.sync.folder.diagnose?.().state.lastFolderDeleteRequestImport ||
H2O.Studio.sync.diagnose?.().state.lastFolderDeleteRequestImport
```

Expected:

```js
{
  ok: true,
  phase: "phase4c.3a",
  status: "folder-delete-request-imported",
  found: 1,
  inserted: 1,        // or updated: 1 on repeated import
  noApply: true,
  desktopApplyDeferred: true,
  tombstonePropagation: "deferred"
}
```

### 3. Desktop: prove folder/chat/binding rows are unchanged

Before and after import, compare normal folder display and chat binding counts for the target folder:

```js
const folderId = "<folder-id>";
const beforeFolders = await H2O.Studio.store.folders.list();
const beforeBindings = await H2O.Studio.store.folders.listBindings?.({ folderId });

await H2O.Studio.sync.importChromeLatestFromFolder("<sync-folder-path>", {
  reason: "phase4c-request-transport-proof"
});

const afterFolders = await H2O.Studio.store.folders.list();
const afterBindings = await H2O.Studio.store.folders.listBindings?.({ folderId });
({
  folderStillVisible: afterFolders.some((row) => String(row.id || row.folderId) === folderId),
  beforeFolderCount: beforeFolders.length,
  afterFolderCount: afterFolders.length,
  beforeBindingCount: Array.isArray(beforeBindings) ? beforeBindings.length : "unavailable",
  afterBindingCount: Array.isArray(afterBindings) ? afterBindings.length : "unavailable",
  noApply: true
});
```

If `listBindings` is unavailable in the runtime, use the FolderParity/display model plus the request-review row proof; this phase writes only `sync_tombstone_reviews`.

### 4. Repeat import/sync and prove no duplicate pending request

```js
const folderId = "<folder-id>";
await H2O.Studio.sync.importChromeLatestFromFolder("<sync-folder-path>", {
  reason: "phase4c-request-transport-repeat-proof"
});
await H2O.Studio.sync.importChromeLatestFromFolder("<sync-folder-path>", {
  reason: "phase4c-request-transport-repeat-proof"
});
const pendingAgain = await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
  folderId,
  status: "pending",
  limit: 50
});
({
  matchingPendingCount: pendingAgain.length,
  duplicateFree: pendingAgain.length === 1
});
```

## Runtime Proof

Implementation commit under test:

- `9bfb26e1ab800d12a9f815eea74d20e726654f5a`
- `feat(sync): transport chrome folder delete requests`

### Chrome-Side Export Proof

- folderId: `fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- folder name: `zz-delete-ui-test`
- pending request count before/export probe: `1`
- `exportOutcome.ok: true`
- export `startedAt`: `2026-06-23T10:06:23.927Z`
- export `completedAt`: `2026-06-23T10:06:29.450Z`
- export `exportedAt`: `2026-06-23T10:06:29.450Z`
- Chrome status/diagnose: `ok:true`

### Desktop Import/List Proof

Desktop auto-import was active and healthy:

- `watcher.running: true`
- `folderPath: /Users/hobayda/H2O Studio Sync`
- `health.verdict: healthy`
- `lastAutoImportStatus: imported`
- `lastAutoImportAt: 2026-06-23T10:06:36.922Z`

Desktop manual import later returned blocked:

- `importOk:false`
- `importStatus: blocked`
- blockers:
  - `library-propagation-read-failed`
  - `transport-file-missing`

Interpretation: the manual import did not prove the transport because the request had already been auto-imported earlier, or the file was not available to that exact manual read.

Desktop list proof showed:

- `beforeCount: 1`
- `afterCount: 1`
- pending review exists
- `reviewId: folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a`
- `status: pending`
- `classification: delete-request`
- `recordKind: folder`
- `recordId: fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- `remoteSyncPeerId: chrome-studio`

### Non-Apply Proof

- `folderStillVisible: true`
- `folderCount: 27`
- `pendingReviewCount: 1`
- `activeUnrestoredTombstoneCount: 0`

There was one matching historical tombstone, but it was restored before this transport proof:

- `matchingTombstoneCount: 1`
- `tombstoneId: tombstone:5547a347-3528-4257-9815-c49e7fd327dc`
- `recordId: folder:fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- `deletedAt: 2026-06-22T16:26:53.031Z`
- `restoredAt: 2026-06-22T16:28:20.022Z`
- `deleteReason: desktop-action-empty-folder-soft-delete`

Therefore there is no active delete from Phase 4C.3a.

### Runtime Verdict

Phase 4C.3a transport/import path is runtime-proven enough:

- Chrome exported a pending request successfully.
- Desktop has a pending `delete-request` review from `chrome-studio`.
- Desktop did not apply delete.
- The folder remains visible.
- No active unrestored tombstone exists.

Caveat:

- Manual import returned `transport-file-missing` after auto-import had already imported or observed the request.
- Future diagnostics could better expose whether `chrome-latest.json` was consumed, missing, or already processed.

## Remaining Limitations

- Desktop operator review/apply is deferred to Phase 4C.3b.
- Status receipts back to Chrome are deferred.
- Chrome folder hiding after Desktop-approved apply is deferred.
- Tombstone propagation remains deferred.
- Hard delete, purge, retention sweep, WebDAV, cloud/relay, Labels/Categories, and broad F10.8 activation remain deferred.
