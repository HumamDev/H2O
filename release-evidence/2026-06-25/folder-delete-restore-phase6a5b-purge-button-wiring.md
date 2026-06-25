# Phase 6A.5b - Recently Deleted purge button wiring

## Verdict

Phase 6A.5b fixes the Desktop Recently Deleted `Delete permanently (N)` button wiring so it matches the proven Desktop DevTools backend flow.

Backend purge semantics are unchanged:

- active deleted folder tombstones only
- Desktop/Tauri only
- no Chrome purge authority
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard folder-row deletion
- no receipt deletion

## Root Cause

Phase 6A.5 replaced the typed `prompt()` with native `confirm()`, but the UI still cancelled before calling the backend in the manual test.

The failure mode was UI-side, not backend-side:

- Direct DevTools backend preview returned `candidateCount:1`.
- Direct DevTools backend purge returned `ok:true`.
- Direct DevTools backend purge returned `status:"folder-tombstones-purged"`.
- Direct DevTools backend purge returned `purgedCount:1`.
- Direct DevTools backend purge returned `permanentlyHiddenFolderRowCount:1`.
- Direct DevTools backend purge returned safety counts all `0`.
- After the direct call, Recently Deleted returned `afterTotal:0` and `afterPurgeEligibleCount:0`.

## Fix

The UI now follows the proven backend sequence:

1. Call `previewRecentlyDeletedFolderPurge({ reason })`.
2. Require `preview.ok === true`.
3. Require `preview.candidateCount > 0`.
4. Read token using `preview.confirmationToken || preview.previewToken`.
5. Show native `confirm()` with the count and safety text.
6. Treat only `confirmResult === false` as user cancellation.
7. Call `purgeRecentlyDeletedFolders(...)` with:
   - `dryRun:false`
   - `confirmationToken`
   - `previewToken`
   - `expectedCount`
   - `reason`
   - `confirmationPhrase:"DELETE PERMANENTLY"`
   - `confirmPhrase:"DELETE PERMANENTLY"`
   - `typedConfirmation:"DELETE PERMANENTLY"`
   - `deleteChats:false`
   - `deleteSnapshots:false`
   - `deleteAssets:false`

If native confirmation is unavailable, the UI now reports `native-confirm-unavailable` instead of incorrectly reporting user cancellation.

## UI Results

Cancel path:

- Shows `Delete permanently cancelled.`
- Only happens when native confirm returns explicit `false`.
- Does not hide or mutate the row.

Success path:

- Shows `Deleted permanently: N`.
- Refreshes Recently Deleted.
- Refreshes normal folder metadata state.

Backend failure path:

- Shows `Delete permanently failed: <blocker>`.
- Keeps the row visible.

## Direct Backend Proof

The direct Desktop DevTools backend call already proved the safe backend flow:

- preview `candidateCount:1`
- purge `ok:true`
- purge `status:"folder-tombstones-purged"`
- `purgedCount:1`
- `permanentlyHiddenFolderRowCount:1`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`
- after `total:0`
- after `purgeEligibleCount:0`

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
node tools/validation/sync/validate-folder-purge-phase6a5b-ui-wiring.mjs
```

Validation confirms:

- token fallback uses `preview.confirmationToken || preview.previewToken`
- only explicit `confirmResult === false` is treated as cancellation
- missing native confirm is a blocker, not a cancellation
- all confirmation aliases are sent to backend
- success and failure messages are explicit
- no prompt remains in the purge flow
- no sidebar purge button exists
- no forbidden delete/remove calls exist in the UI flow

Validation run:

```bash
node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"
node --check tools/validation/sync/validate-folder-purge-phase6a5-ui-flow.mjs
node --check tools/validation/sync/validate-folder-purge-phase6a5b-ui-wiring.mjs
node tools/validation/sync/validate-folder-purge-phase6a5-ui-flow.mjs
node tools/validation/sync/validate-folder-purge-phase6a5b-ui-wiring.mjs
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

Manual runtime proof pending after this wiring fix:

1. Create a folder named `test delete final ui`.
2. Delete it.
3. Confirm Recently Deleted shows:
   - `Active 1`
   - `Purge eligible 1`
   - `Delete permanently (1)`
4. Click `Delete permanently (1)`.
5. Confirm the native dialog.
6. Expected:
   - success message shown: `Deleted permanently: 1`
   - Recently Deleted total becomes `0`
   - `purgeEligibleCount:0`
   - normal folder list does not show `test delete final ui`
   - `chatDeletedCount:0`
   - `snapshotDeletedCount:0`
   - `assetDeletedCount:0`
   - `hardDeletedFolderRowCount:0`
   - `receiptDeletedCount:0`
   - Chrome has no purge button
