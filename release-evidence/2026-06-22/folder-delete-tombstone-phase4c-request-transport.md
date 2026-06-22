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

## Remaining Limitations

- Desktop operator review/apply is deferred to Phase 4C.3b.
- Status receipts back to Chrome are deferred.
- Chrome folder hiding after Desktop-approved apply is deferred.
- Tombstone propagation remains deferred.
- Hard delete, purge, retention sweep, WebDAV, cloud/relay, Labels/Categories, and broad F10.8 activation remain deferred.
