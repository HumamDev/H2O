# Folder Delete Tombstone Phase 4B

Date: 2026-06-22

## Purpose

Extend Phase 4A Desktop-local folder soft delete so folders with chat bindings can move to Recently Deleted without deleting any chat. Bound chats are moved to Unfiled by removing their folder bindings through the existing safe binding API, and restore reattaches only eligible chats that are still Unfiled.

## Design Summary

Phase 4B keeps the existing `sync_tombstones` / `meta_json` substrate and does not add Migration v7. The folder tombstone remains the authoritative recovery record. `recoverySnapshot` now includes `bindings[]`, `bindingCaptureOk`, and affected-chat counts.

The restore source is `recoverySnapshot.bindings[]`, not binding tombstones. Per-binding tombstones remain audit/future-sync substrate only.

## Files Changed

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js`
- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-folder-delete-tombstone-phase4a.mjs`
- `tools/validation/sync/validate-folder-delete-tombstone-phase4b.mjs`
- `release-evidence/2026-06-22/folder-delete-tombstone-phase4b.md`

## Behavior Implemented

- Desktop `Move to Recently Deleted` is enabled for user folders that have chats.
- Soft delete pre-reads `folder_bindings` with `readFolderBindingsForRemoveSafely`.
- `recoverySnapshot.bindings[]` captures each affected binding:
  - `chatId`
  - `folderId`
  - `folderName`
  - `assignedAt`
  - `priorUpdatedAt`
  - `priorDigest` when available
  - `capturedAt`
  - restore policy metadata
- The folder tombstone stores:
  - `bindingCount`
  - `affectedChatCount`
  - `bindingCaptureOk`
  - `noHardDelete: true`
  - `noChatDelete: true`
  - `crossPlatformSync: "deferred"`
- Each affected chat is unbound with `unbindChat`, moving it to Unfiled/no-folder in current Studio behavior.
- Restore recreates the folder and calls the safe `bindChat` path for eligible bindings.
- `bindChat` rejects new binds into an active tombstoned folder with `folder-tombstoned`, except for the narrow restore-rebind path.

## Invariants

- No chat row is deleted.
- No folder row is hard deleted by the Phase 4B public soft-delete path.
- No snapshot row is deleted.
- No raw SQL delete/insert is used by the Phase 4B binding unbind/rebind helpers.
- Chrome delete/tombstone request/apply remains disabled/deferred.
- Tombstone sync propagation remains deferred.
- Hard purge and retention sweep remain deferred.

## Binding Restore Policy

Restore attempts every `recoverySnapshot.bindings[]` entry.

- If the chat is still Unfiled/unbound, restore rebinds it to the restored folder.
- If the chat is already bound to the restored folder, restore treats it as already restored.
- If the chat is bound to another folder, restore skips it and reports `restore-binding-skipped-rebound`.
- If the chat is missing or cannot be read, restore skips it and reports `restore-binding-skipped-chat-missing`.
- If `bindChat` fails, restore skips it and reports `restore-binding-skipped-bind-failed`.

Folder restore returns `ok:true` when the folder itself is restored, even if some bindings are skipped with warnings.

## Sync Health

`tombstoneLocalDelete` now exposes:

- `affectedChatCount`
- `lastAffectedChatCount`
- `lastBindingRestoreAttemptedCount`
- `lastBindingRestoredCount`
- `lastBindingSkippedCount`
- `lastRestoreWarnings`
- `purgeBlocked: true`
- `chromeDeleteSync: "deferred"`
- `tombstoneSync: "deferred"`

## Validation Commands / Results

```bash
node --check src-surfaces-base/studio/store/folders.tauri.js
node --check "src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js"
node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check tools/validation/sync/validate-folder-delete-tombstone-phase4a.mjs
node --check tools/validation/sync/validate-folder-delete-tombstone-phase4b.mjs
node tools/validation/sync/validate-folder-delete-tombstone-phase4a.mjs
node tools/validation/sync/validate-folder-delete-tombstone-phase4b.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/studio/validate-studio-library-organization-ui.mjs
node tools/validation/sync/validate-f19-shell-row-ux.mjs
git diff --check
git diff --cached --check
```

Result: all commands passed in this workspace.

- `validate-folder-delete-tombstone-phase4a.mjs`: PASS
- `validate-folder-delete-tombstone-phase4b.mjs`: PASS
- `validate-f19-sync-hardening.mjs`: PASS
- `validate-studio-library-organization-ui.mjs`: PASS, 107 checks
- `validate-f19-shell-row-ux.mjs`: PASS, `SHELL ROW UX READY`

## Manual Retest Steps

1. Create a Desktop test folder with one or more chats bound to it.
2. Move it to Recently Deleted from the Desktop folder action menu.
3. Confirm the folder disappears from the normal Desktop folder list/sidebar.
4. Confirm chats are not deleted.
5. Confirm affected chats are now Unfiled/no-folder.
6. Confirm the folder tombstone has `recoverySnapshot.bindings[]`.
7. Restore the folder with `H2O.Studio.store.folders.restoreTombstonedFolder({ tombstoneId })`.
8. Confirm the folder reappears.
9. Confirm eligible chats reattach to the restored folder.
10. Repeat with one chat moved to another folder before restore and confirm it is skipped with `restore-binding-skipped-rebound`.
11. Confirm protected/system/Unfiled/local-review folder delete remains blocked.
12. Confirm Chrome delete/tombstone sync remains disabled/deferred.

## Runtime Proof

Runtime proof recorded after Phase 4B implementation.

Folder under test:

- name: `zz-delete-with-chat-test`
- folderId: `fold_d0c66b27-b245-449f-904b-4c8c9878bf3c`
- color: `#FFD54F`

Chat under test:

- chatId: `69f0ea75-1b38-838d-a930-e72796eba175`

Normal delete proof:

- `softDeleteFolder` returned `ok:true`
- `affectedChatCount: 1`
- `bindingCount: 1`
- `bindingSnapshotCount: 1`
- `bindingUnbindAttemptedCount: 1`
- `bindingUnboundCount: 1`
- `bindingUnbindSkippedCount: 0`
- `bindingUnbindWarnings: []`
- `noChatDelete: true`
- `noHardDelete: true`
- `tombstoneId: tombstone:936548c9-6db8-4a9f-84b5-138259743d6f`
- after delete, `getForChat` returned `folderId:""` and `folder:null`

Normal restore proof:

- `restoreTombstonedFolder` returned `ok:true`
- `bindingRestoreAttemptedCount: 1`
- `bindingRestoredCount: 1`
- `bindingSkippedCount: 0`
- `restoreWarnings: []`
- `getForChat` returned `folderId: fold_d0c66b27-b245-449f-904b-4c8c9878bf3c`

Moved-chat safety edge proof:

- Created second folder:
  - name: `zz-phase4b-other-folder`
  - folderId: `fold_d2bf376c-3095-4a2c-b3ba-4b16cf5e72d2`
  - color: `#60A5FA`
- Deleted original folder again:
  - `tombstoneId: tombstone:8cb5911e-703a-4e44-9fa5-8939b897ec9c`
  - `affectedChatCount: 1`
  - `bindingCount: 1`
  - `bindingSnapshotCount: 1`
  - `bindingUnboundCount: 1`
  - `noChatDelete: true`
  - `noHardDelete: true`
- Moved chat to the other folder before restore:
  - `getForChat` returned `folderId: fold_d2bf376c-3095-4a2c-b3ba-4b16cf5e72d2`
- Restored original folder:
  - `restoreTombstonedFolder` returned `ok:true`
  - `bindingRestoreAttemptedCount: 1`
  - `bindingRestoredCount: 0`
  - `bindingSkippedCount: 1`
  - `restoreWarnings` contained `code: restore-binding-skipped-rebound`
  - `currentFolderId: fold_d2bf376c-3095-4a2c-b3ba-4b16cf5e72d2`
  - `getForChat` after restore still returned `folderId: fold_d2bf376c-3095-4a2c-b3ba-4b16cf5e72d2`

Runtime verdict:

- Phase 4B Desktop local folder-with-chat soft delete plus restore-rebind core path passed.
- Moved-chat safety edge passed: restore does not steal chats moved elsewhere.
- Chrome delete request/review, tombstone propagation, retention, and purge remain deferred.

## Remaining Limitations

- Phase 4B is Desktop-local only.
- Chrome cannot request or apply folder deletes.
- Tombstones are not synced to Chrome/Desktop peers.
- Recently Deleted list UI remains later.
- Retention, purge, hard delete, and WebDAV/cloud/relay transport remain deferred.
