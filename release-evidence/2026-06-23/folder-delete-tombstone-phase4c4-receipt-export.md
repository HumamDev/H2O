# Phase 4C.4a Folder Delete Receipt Export

## Purpose

Phase 4C.4a adds Desktop-only, status-only export receipts for Chrome-created folder delete requests that Desktop has explicitly approved and applied through the safe soft-delete path.

This phase does not change Chrome import behavior. Chrome does not resolve requests, hide folders, apply tombstones, or mutate any folder/chat/binding/snapshot data from these receipts yet.

## Files Changed

- `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c4-receipt-export.md`

## Exported Receipt Shape

Desktop projects resolved `delete-request` reviews with decision `applied-folder-delete-request` into `latest.json`:

```json
{
  "folderDeleteReceipts": [
    {
      "schema": "h2o.studio.folder-delete-receipt.v1",
      "receiptId": "folder-delete-receipt:<requestId>",
      "requestId": "folder-delete-request:...",
      "reviewId": "folder-delete-request:...",
      "folderId": "fold_...",
      "folderName": "optional name",
      "recordKind": "folder",
      "intent": "folder-soft-delete-request",
      "decision": "applied-folder-delete-request",
      "status": "applied",
      "appliedAt": "2026-...",
      "appliedBy": "desktop-studio",
      "appliedBySurface": "desktop-studio",
      "sourcePeerId": "chrome-studio",
      "tombstoneId": "tombstone:...",
      "noHardDelete": true,
      "noChatDelete": true,
      "affectedChatCount": 0,
      "bindingCount": 0,
      "chromeReceipt": true,
      "statusOnly": true,
      "noTombstoneApply": true,
      "tombstonePropagation": "deferred",
      "chromeHideDeferred": true
    }
  ]
}
```

`folderDeleteReceipts[]` is additive and backward compatible. The receipt references the Desktop tombstone id as status metadata only; it does not export an applied tombstone for Chrome to apply.

## Safety Guarantees

- Export does not call `softDeleteFolder`.
- Export does not create tombstones.
- Export does not hard-delete folders.
- Export does not delete chats, snapshots, bindings, or library rows.
- Chrome import/hide behavior is unchanged in Phase 4C.4a.
- Repeated exports are idempotent; no acknowledgement ledger is added in this phase. Chrome receipt import will deduplicate by `receiptId`/`requestId` in a later phase.

## Deferred

- Chrome receipt import and request resolution remain deferred.
- Chrome folder hiding after Desktop-approved apply remains deferred.
- Real tombstone propagation remains deferred.
- Restore receipts remain deferred.
- Retention/purge remains deferred.
- WebDAV/cloud/relay remain deferred.

## Validation

Commands run:

```sh
node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js # pass
node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js # pass
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js # pass
node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs # pass
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs # pass
git diff --check # pass
```

`git diff --cached --check` is run after staging before commit.

## Runtime Proof Commands

Desktop console: export `latest.json`.

```js
await H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4c4a-folder-delete-receipt-export-proof"
});
```

Desktop console: verify the receipt projection source.

```js
await H2O.Studio.store.tombstoneReviews.listFolderDeleteReceipts({
  reviewId: "folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"
});
```

Terminal: inspect `latest.json`.

```sh
node -e 'const fs=require("fs"); const p="/Users/hobayda/H2O Studio Sync/latest.json"; const b=JSON.parse(fs.readFileSync(p,"utf8")); const r=(b.folderDeleteReceipts||[]).find((x)=>x.requestId==="folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"||x.reviewId==="folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a"); console.log(JSON.stringify({count:(b.folderDeleteReceipts||[]).length, receipt:r&&{schema:r.schema, requestId:r.requestId, reviewId:r.reviewId, folderId:r.folderId, status:r.status, decision:r.decision, tombstoneId:r.tombstoneId, statusOnly:r.statusOnly, noTombstoneApply:r.noTombstoneApply, noHardDelete:r.noHardDelete, noChatDelete:r.noChatDelete, tombstonePropagation:r.tombstonePropagation, chromeHideDeferred:r.chromeHideDeferred}}, null, 2));'
```

Expected receipt proof for the Phase 4C.3b runtime fixture:

- `requestId` / `reviewId`: `folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a`
- `folderId`: `fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- `status`: `applied`
- `decision`: `applied-folder-delete-request`
- `tombstoneId`: `tombstone:0d5ed9cf-6a1f-4ae9-9089-6b22114a34df`
- `statusOnly`: `true`
- `noTombstoneApply`: `true`
- `noHardDelete`: `true`
- `noChatDelete`: `true`

Chrome behavior is intentionally unchanged in this phase.
