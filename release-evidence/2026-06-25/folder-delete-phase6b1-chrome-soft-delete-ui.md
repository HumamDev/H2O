# Phase 6B.1 - Chrome soft-delete folder menu UX

## Purpose

Phase 6B.1 makes the Chrome Studio folder menu expose a product-normal `Delete` action while preserving the existing Phase 4C request-only architecture.

Chrome remains a light companion. Desktop Studio remains authoritative for canonical tombstones, Recently Deleted lifecycle, restore, and permanent delete.

## Design Note

The Chrome folder menu now presents `Delete` instead of the old request-oriented label.

The action is still request-only:

- it uses the existing `requestChromeFolderDelete()` path
- it routes through `H2O.Studio.actions.folders.requestDelete`
- it creates a pending folder delete request for Desktop review
- it does not hide the folder immediately
- it does not apply a tombstone on Chrome

Confirmation copy:

`Move this folder to Recently Deleted? Desktop Studio will apply the soft delete. No chats or snapshots are deleted.`

## Runtime Behavior

After the user confirms `Delete` in Chrome:

- the request is created through the Phase 4C path
- the folder remains visible in the normal Chrome list
- Chrome shows `Delete pending`
- duplicate requests show `Delete already pending Desktop review.`
- Desktop receipt import later hides the folder from Chrome visible state after Desktop applies the soft delete

Protected or system folders are blocked with:

`This folder cannot be deleted.`

Permanent delete remains Desktop-only. If a future Chrome path attempts permanent delete, the product policy message is:

`Permanent delete is only available from Desktop Studio.`

Restore is not part of Phase 6B.1. Chrome does not add a restore action; restore remains from Desktop Studio.

## Safety Invariants

- no Chrome permanent delete
- no Chrome restore action
- no Chrome purge authority
- no tombstone apply/create on Chrome
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay

## Manual Runtime Proof

Manual proof pending live Chrome Studio validation:

1. Open Chrome Studio.
2. Create or use a normal non-protected folder.
3. Open the folder menu.
4. Confirm the menu action label is `Delete`.
5. Click `Delete`.
6. Accept the confirmation.
7. Expected:
   - pending request is created through the existing Phase 4C request path
   - folder remains visible
   - `Delete pending` badge/status appears
   - no hard delete
   - no permanent delete
   - no chat, snapshot, or asset deletion

If the full local sync loop is available, continue proof with:

1. Chrome exports pending `folderDeleteRequests`.
2. Desktop imports/applies request.
3. Desktop exports delete receipt.
4. Chrome imports receipt.
5. Chrome hides the folder from the normal list via visible-state-only receipt handling.

## Verdict

Phase 6B.1 is a Chrome UI/product-copy wrapper over the existing safe Phase 4C request loop. It does not expand Chrome authority.
