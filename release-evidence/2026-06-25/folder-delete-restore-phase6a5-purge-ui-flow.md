# Phase 6A.5 - Recently Deleted purge UI flow

## Verdict

Phase 6A.5 makes the Desktop-only `Delete permanently (N)` button use a practical confirmation flow and pass the full confirmation payload to the existing safe purge backend.

The backend purge semantics are unchanged:

- active deleted folder tombstones only
- Desktop/Tauri only
- no Chrome purge authority
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard folder-row deletion
- no receipt deletion

## Root Cause

The Phase 6A.2 UI used a native `prompt()` and required the exact typed phrase `DELETE PERMANENTLY`.

In the manual runtime case with one active deleted folder named `test for delete`, clicking `Delete permanently (1)` produced `Delete permanently cancelled`. The flow was too fragile for the Desktop operator path.

## Fix

The Desktop UI now uses a native confirm dialog instead of `prompt()`.

Confirmation message includes:

- count of folders to permanently delete
- restore will no longer be possible for those deleted folder tombstones
- chats, snapshots, assets, active folders, and receipts will not be deleted

Cancel behavior:

- shows `Delete permanently cancelled.`
- does not treat cancellation as a destructive error
- does not hide or mutate the row

Successful commit behavior:

- calls `purgeRecentlyDeletedFolders(...)`
- refreshes Recently Deleted
- refreshes normal folder metadata state
- shows `Deleted permanently: N`

## Commit Payload

The UI passes the full compatibility payload:

- `dryRun:false`
- `confirmationToken`
- `expectedCount`
- `reason`
- `deleteChats:false`
- `deleteSnapshots:false`
- `deleteAssets:false`
- `confirmationPhrase:"DELETE PERMANENTLY"`
- `confirmPhrase:"DELETE PERMANENTLY"`
- `typedConfirmation:"DELETE PERMANENTLY"`

## Separation From Restored History

`Clear restored history (N)` remains separate from active deleted folder purge.

Phase 6A.5 does not change restored-history clear semantics.

## Safety Invariants

- Chrome has no purge button.
- Chrome has no purge authority.
- Chrome has no delete/restore authority from this flow.
- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No hard folder-row deletion.
- No receipt deletion.
- No WebDAV/cloud/relay behavior.
- The flow does not call `remove()`.

## Validation

Static validator added:

```bash
node tools/validation/sync/validate-folder-purge-phase6a5-ui-flow.mjs
```

Validation confirms:

- `prompt()` is not used by the active purge flow
- native `confirm()` is used
- clear cancel message is present
- all confirmation aliases are sent to the backend
- success message uses `Deleted permanently: N`
- delete chats/snapshots/assets flags remain false
- no sidebar purge button exists
- no forbidden delete/remove calls exist in the UI flow

Validation run:

```bash
node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"
node --check tools/validation/sync/validate-folder-purge-phase6a5-ui-flow.mjs
node tools/validation/sync/validate-folder-purge-phase6a5-ui-flow.mjs
node tools/validation/sync/validate-folder-purge-phase6a.mjs
node tools/validation/sync/validate-folder-purge-phase6a1b.mjs
node tools/validation/sync/validate-folder-purge-phase6a1c.mjs
node tools/validation/sync/validate-folder-purge-phase6a2-ui.mjs
node tools/validation/sync/validate-folder-purge-phase6a2c-ui-layout.mjs
node tools/validation/sync/validate-folder-purge-phase6a4-restored-history.mjs
node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs
git diff --check
git diff --cached --check
```

Result:

- All validation commands passed.

## Manual Runtime Proof

Manual runtime proof should use the reported case:

1. Create a folder named `test for delete`.
2. Delete it so Recently Deleted shows:
   - `RECENTLY DELETED · 1`
   - `Active 1`
   - `Purge eligible 1`
   - `Delete permanently (1)`
3. Click `Delete permanently (1)`.
4. Confirm the native dialog.
5. Expected:
   - success message shown: `Deleted permanently: 1`
   - Recently Deleted total becomes `0`
   - `purgeEligibleCount:0`
   - normal folder list does not show `test for delete`
   - `chatDeletedCount:0`
   - `snapshotDeletedCount:0`
   - `assetDeletedCount:0`
   - `hardDeletedFolderRowCount:0`
   - `receiptDeletedCount:0`
   - Chrome Studio has no purge button

Runtime proof was not executed in this implementation turn because it requires a live Desktop operator confirmation.
