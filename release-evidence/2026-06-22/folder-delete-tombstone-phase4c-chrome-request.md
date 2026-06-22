# Folder Delete Tombstone Phase 4C.1 / 4C.2 Chrome Request

Date: 2026-06-22

## Purpose

Add the first Chrome-side slice of the folder delete lifecycle: a Chrome Studio user can request folder deletion for later Desktop/operator review. This phase is request-only and non-destructive.

## Files Changed

- `src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js`
- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `release-evidence/2026-06-22/folder-delete-tombstone-phase4c-chrome-request.md`

## Behavior Implemented

- Chrome MV3 review store accepts `classification:"delete-request"` and `schema:"h2o.studio.folder-delete-request.v1"`.
- `H2O.Studio.store.tombstoneReviews.requestFolderDelete(...)` creates a pending review row.
- Pending requests are deduped by `folderId` while a pending request already exists.
- `H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests(...)` and `diagnoseFolderDeleteRequests(...)` expose console-verifiable state.
- Chrome `H2O.Studio.actions.folders.requestDelete(...)` delegates to the review store.
- Chrome folder menu shows `Request delete (review on Desktop)`.
- Folder rows with pending requests show a targeted `delete requested` badge after sidebar rerender.

## Non-Destructive Guarantees

- Chrome does not call Desktop `softDeleteFolder` / `softDeleteEmptyFolder`.
- Chrome does not create tombstones.
- Chrome does not delete folders, chats, snapshots, bindings, or library rows.
- Chrome does not mutate folder bindings.
- Chrome does not add request transport/export/apply.
- Chrome does not expose a direct `delete` / `remove` folder action in the Chrome request facade.
- `desktopApplyRequired:true`, `noHardDelete:true`, and `noChatDelete:true` are recorded on requests.

## Deferred To Phase 4C.3

- Chrome-to-Desktop request transport.
- Desktop review inbox / operator approval UI.
- Desktop apply through the existing Phase 4B `softDeleteFolder` path.
- Status-only receipts from Desktop back to Chrome.
- Chrome hiding a folder after Desktop-approved apply.

## Validation Commands / Results

```bash
node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js
node --check "src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js"
node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"
node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs
git diff --check
git diff --cached --check
```

Result: all commands passed in this workspace.

- `node --check` passed for all changed JS/MJS files.
- `validate-folder-delete-request-phase4c.mjs`: PASS.
- `git diff --check`: PASS.
- `git diff --cached --check`: PASS before commit.

## Chrome Console Runtime Test

Create a folder delete request:

```js
await H2O.Studio.actions.folders.requestDelete({
  folderId: "<folder-id>",
  folderName: "<folder-name>",
  isCanonical: true,
  sourceSurface: "chrome-studio"
});
```

List pending requests/reviews:

```js
await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
  status: "pending",
  limit: 50
});
```

Confirm diagnostics:

```js
await H2O.Studio.store.tombstoneReviews.diagnoseFolderDeleteRequests({
  includeRows: true
});
```

Prove folder/chat/binding rows were not deleted:

```js
const folderId = "<folder-id>";
const before = await H2O.Library.FolderParity.getDisplayModel({ fresh: true });
await H2O.Studio.actions.folders.requestDelete({ folderId, isCanonical: true });
const after = await H2O.Library.FolderParity.getDisplayModel({ fresh: true });
({
  folderStillVisible: after.canonicalRows.some((row) => String(row.folderId || row.id) === folderId),
  noChromeDeleteApi: typeof H2O.Studio.actions.folders.delete === "undefined" &&
    typeof H2O.Studio.actions.folders.remove === "undefined",
  requestCount: (await H2O.Studio.store.tombstoneReviews.listFolderDeleteRequests({
    status: "pending",
    limit: 100
  })).filter((row) => String(row.recordId || "") === folderId).length,
  beforeFolderCount: before.canonicalRows.length,
  afterFolderCount: after.canonicalRows.length
});
```

If a chat id is available, confirm its folder binding is unchanged:

```js
const chatId = "<chat-id>";
const beforeBinding = await H2O.Studio.actions.folders?.getForChat?.(chatId);
await H2O.Studio.actions.folders.requestDelete({ folderId: "<folder-id>", isCanonical: true });
const afterBinding = await H2O.Studio.actions.folders?.getForChat?.(chatId);
({ beforeBinding, afterBinding });
```

Note: Chrome may not expose Desktop SQLite binding helpers. In that case, use the display-model proof and the request-store proof; Chrome request creation is IndexedDB review bookkeeping only.

## Chrome Runtime Proof

Implementation commit under test:

- `bcf47cbba572f3e60d31e8d52de645f55d6291a4`

Folder used:

- folderId: `fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- name: `zz-delete-ui-test`

Request proof:

- `request.ok: true`
- `request.status: pending-created`
- `request.phase: phase4c-chrome-delete-request`
- `request.duplicate: false`
- `matchingPendingRequests.length: 1`
- `schema: h2o.studio.folder-delete-request.v1`
- `classification: delete-request`
- `desktopApplyRequired: true`
- `noHardDelete: true`
- `noChatDelete: true`
- `noLocalApply: true`
- `noFolderMutation: true`
- `noBindingMutation: true`
- `noChatMutation: true`
- `noSnapshotMutation: true`
- warning: `desktop-apply-required`

Non-destructive proof:

- `folderStillVisible: true`
- `beforeFolderCount: 20`
- `afterFolderCount: 20`
- `noChromeDeleteApi: true`
- `noBindingMutationApi: true`

Duplicate request proof:

- `second.ok: true`
- `second.duplicate: true`
- `second.status: pending-existing`
- `matchingCount: 1`
- original pending request reused: `folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a`

Runtime verdict:

- Phase 4C.1 + 4C.2 runtime proof passed.
- Chrome request-only flow is closed.
- Chrome-to-Desktop transport, Desktop review/apply, status receipts, tombstone propagation, purge/retention, and WebDAV remain deferred.

## Remaining Limitations

- Desktop/operator review and apply are not implemented in this slice.
- Tombstone propagation remains deferred.
- Hard delete, purge, and retention sweep remain deferred.
- WebDAV/cloud/relay transports remain deferred.
