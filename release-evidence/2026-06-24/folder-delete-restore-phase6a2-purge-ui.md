# Phase 6A.2 - Recently Deleted permanent delete UI

## Purpose

Add a Desktop-only operator button at the top of the main Recently Deleted folder section for permanent deletion of purge-eligible active folder tombstones.

This phase adds UI only. It does not add Chrome UI, Chrome authority, WebDAV/cloud/relay behavior, or any chat/snapshot/asset deletion.

## UI Placement

The button is rendered only in the main Folders page Recently Deleted panel:

- Label: `Delete permanently (N)`
- Placement: top of the main Recently Deleted section, above aggregates and rows.
- Sidebar: unchanged compact `Recently Deleted · <count>` entry only. No purge button is rendered in the sidebar.

## Enabled State

The button is enabled only when:

- Desktop/Tauri store exposes `previewRecentlyDeletedFolderPurge`.
- Desktop/Tauri store exposes `purgeRecentlyDeletedFolders`.
- `purgeEligibleCount > 0`.

When `purgeEligibleCount:0`, the button is disabled and no destructive action can run.

## Confirmation Flow

On click:

1. The UI calls `previewRecentlyDeletedFolderPurge()`.
2. If the preview has no candidates, it shows an empty-state status and stops.
3. If candidates exist, the operator must type:

```text
DELETE PERMANENTLY
```

The prompt states:

- number of folders affected
- restore will no longer be possible for those folder tombstones
- chats, snapshots, assets, active folders, and receipts will not be deleted

## Commit Call

The UI commits with:

```js
purgeRecentlyDeletedFolders({
  dryRun: false,
  confirmationToken,
  expectedCount,
  reason,
  deleteChats:false,
  deleteSnapshots:false,
  deleteAssets:false
})
```

After success, the UI refreshes the Recently Deleted panel and requests normal folder metadata refresh.

## Result Summary

The UI status summarizes:

- `purgedCount`
- `skippedCount`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `hardDeletedFolderRowCount:0`

## Safety Invariants

- Desktop-only.
- No Chrome UI.
- No Chrome delete/restore/purge authority.
- No WebDAV/cloud/relay behavior.
- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No hard folder-row deletion.
- No receipt deletion.
- No `remove()` call.

Expected zero-delete fields:

- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`

## Manual Proof Plan

Open Desktop Studio Folders page.

Expected current-state proof after Phase 6A.1c repair:

- Main Recently Deleted panel shows `Delete permanently (0)`.
- Button is disabled because `purgeEligibleCount:0`.
- Clicking does not run a destructive action.
- Sidebar still shows compact Recently Deleted entry only.
- Chrome Studio does not show the button.

Future candidate proof:

- If active deleted folder tombstones exist, button enables with count.
- Preview runs first.
- Typed confirmation is required.
- Commit result reports zero chat/snapshot/asset/hard-row/receipt deletion.

## Validation

Validation run:

- `node --check src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `node --check tools/validation/sync/validate-folder-purge-phase6a2-ui.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a2-ui.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1b.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1c.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `node tools/validation/sync/validate-folder-visible-parity-phase5a5.mjs`
- `git diff --check`

All source/static validators passed.

## Runtime Status

Manual visual QA was not run in this pass. Current expected runtime behavior, based on Phase 6A.1c proof, is a disabled `Delete permanently (0)` button because there are no purge-eligible active deleted folder tombstones after resurrection repair.
