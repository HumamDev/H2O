# Phase 6A.5c - Recently Deleted purge button executes backend call

## Purpose

Phase 6A.5c fixes the Desktop-only Recently Deleted `Delete permanently (N)` button wiring so it executes the same purge backend flow that was proven from Desktop DevTools.

The backend purge API was already correct. The remaining failure was in the UI path: the button reported `Delete permanently cancelled.` while the direct backend sequence succeeded for the same active deleted folder.

## UI Flow

The Desktop UI handler now uses this direct sequence:

1. Preview with `previewRecentlyDeletedFolderPurge({ reason })`.
2. Use `preview.confirmationToken || preview.previewToken`.
3. Call `window.confirm(message)`.
4. Only treat `confirmResult === false` as user cancellation.
5. Commit with `purgeRecentlyDeletedFolders(...)` using the exact confirmation payload.
6. Refresh Recently Deleted and the normal folder projection after success.

The reason is stable:

`recently-deleted-ui-delete-permanently`

The confirmation payload includes:

`confirmationPhrase:"DELETE PERMANENTLY"`

`confirmPhrase:"DELETE PERMANENTLY"`

`typedConfirmation:"DELETE PERMANENTLY"`

The success message includes `Deleted permanently: N`.

## Safety

The UI still passes:

- `deleteChats:false`
- `deleteSnapshots:false`
- `deleteAssets:false`

Expected backend safety counters remain:

- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`

The UI does not call `remove()`, does not soft-delete, and does not issue raw SQL.

Chrome has no purge button and no purge authority.

## Diagnostics

Temporary guarded console diagnostics were added around the Desktop UI flow:

- preview ok/count/token present
- confirm result
- commit ok/status/purgedCount/blockers

These diagnostics are intended to distinguish real user cancellation from backend failure if a live Desktop runtime still reports cancellation.

## Runtime Proof Status

Manual runtime proof must be performed in the live Desktop UI:

1. Use the active deleted folder `test delete final ui` if still present.
2. Click `Delete permanently (1)`.
3. Confirm the native dialog.
4. Expected result:
   - `Deleted permanently: 1`
   - Recently Deleted total becomes `0`
   - `purgeEligibleCount:0`
   - the normal folder list does not show `test delete final ui`
   - no chat, snapshot, asset, hard folder-row, or receipt deletion

No Chrome runtime behavior changed.
