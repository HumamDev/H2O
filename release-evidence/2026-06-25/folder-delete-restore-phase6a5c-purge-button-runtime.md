# Phase 6A.5c - Purge button live runtime proof

## Implementation

Commit:

`8af37c259de6cb0ca2b6d0b6bc3e6cee3c7b3f8c fix(sync): execute recently deleted purge button`

## Root Cause

The Desktop Recently Deleted `Delete permanently` UI was reaching the preview path, but the UI confirmation wiring could report `Delete permanently cancelled.` before the backend commit ran. The backend purge API was already proven correct from Desktop DevTools.

## Fix Summary

The UI now mirrors the proven backend purge flow:

- preview via `previewRecentlyDeletedFolderPurge`
- token fallback via `preview.confirmationToken || preview.previewToken`
- native confirmation via `window.confirm`
- commit via `purgeRecentlyDeletedFolders`
- full confirmation fields:
  - `confirmationPhrase:"DELETE PERMANENTLY"`
  - `confirmPhrase:"DELETE PERMANENTLY"`
  - `typedConfirmation:"DELETE PERMANENTLY"`
- safety flags:
  - `deleteChats:false`
  - `deleteSnapshots:false`
  - `deleteAssets:false`

## Live UI Proof

Manual Desktop UI sequence:

1. Created a test folder through the Desktop UI.
2. Deleted the folder so it appeared in Recently Deleted as an active purge-eligible row.
3. Confirmed Recently Deleted showed `Delete permanently (1)`.
4. Clicked `Delete permanently (1)`.
5. Accepted the native confirmation dialog.
6. Verified final state from Desktop DevTools.

Desktop DevTools verification:

```json
{
  "recentlyDeletedOk": true,
  "recentlyDeletedTotal": 0,
  "purgeEligibleCount": 0,
  "restoredHistoryClearableCount": 0,
  "testRowsVisible": 0,
  "blockers": []
}
```

## Final State

- Recently Deleted is empty.
- The test folder is not visible in the normal folder list.
- The purge button flow completed from the live Desktop UI.
- No blockers were reported.

## Safety Invariants

- no Chrome purge authority
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard folder-row deletion
- no receipt deletion

## Verdict

Phase 6A.5c live UI proof passed. The Desktop-only `Delete permanently` button now completes the proven safe backend purge flow from the operator UI.
