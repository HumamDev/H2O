# Phase 6B.2 - Chrome Delete UX simplification

## Purpose

Phase 6B.2 simplifies the Chrome folder Delete experience after Phase 6B.1.

Manual QA found that the browser/native confirmation popup and long explanatory copy in the folder action popover made the action feel too heavy. The product expectation is simple:

- click `Delete`
- create the existing soft-delete request
- show compact pending state
- keep permanent delete Desktop-only

## Design Note

Chrome folder Delete remains request-only.

The UI now:

- keeps the menu action label as `Delete`
- removes the browser/native confirmation popup
- removes long explanatory paragraph copy from the popover
- directly calls the existing `requestChromeFolderDelete()` path
- keeps the folder visible after request creation
- shows compact status:
  - `Delete pending`
  - `Already pending`
- blocks protected/system folders with:
  - `Cannot delete this folder.`

The underlying request path is unchanged:

- `H2O.Studio.actions.folders.requestDelete`
- `H2O.Studio.store.tombstoneReviews.requestFolderDelete`
- Phase 4C request export/import and Desktop apply/receipt loop

## Permanent Delete Policy

Chrome does not expose permanent delete.

If a Chrome permanent-delete affordance becomes reachable in a future path, it must not execute and must show:

`Permanent delete is only available from Desktop Studio.`

## Safety Invariants

- request-only Chrome folder Delete
- no Chrome permanent delete
- no Chrome restore action
- no Chrome Recently Deleted panel
- no tombstone apply/create on Chrome
- no hard delete
- no purge
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay

## Manual Runtime Proof

Manual proof pending live Chrome Studio validation:

1. Open Chrome Studio.
2. Create or use a normal non-protected folder.
3. Open the folder menu.
4. Confirm the action says `Delete`.
5. Click `Delete`.
6. Expected:
   - no browser/native confirmation popup appears
   - the Phase 4C request path creates or reuses a pending delete request
   - the folder remains visible
   - the compact status shows `Delete pending` or `Already pending`
   - no long explanatory text appears in the menu
   - no permanent delete action appears

Full delete lifecycle proof remains the existing Phase 4C+ flow:

1. Chrome exports pending `folderDeleteRequests`.
2. Desktop imports/applies the request.
3. Desktop exports the delete receipt.
4. Chrome imports the receipt.
5. Chrome hides the folder through visible-state-only receipt handling.

## Verdict

Phase 6B.2 is a Chrome UX simplification only. It does not change sync semantics or add Chrome delete authority.
