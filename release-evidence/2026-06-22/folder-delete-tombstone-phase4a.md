# Folder Delete Tombstone Phase 4A

Date: 2026-06-22

## Purpose

Implement the first safe delete lifecycle step for H2O Studio folders: Desktop-only empty-folder soft delete and restore using the existing `sync_tombstones` substrate. This phase deliberately does not propagate deletes to Chrome, does not hard delete folders, does not delete chats, and does not implement purge.

## Root Cause / Rationale

Phase 3 closed create/rename/color sync, but folder delete remained deferred because destructive sync needs a tombstone lifecycle, conflict policy, and restore path before any cross-platform delete can be enabled. The Desktop app already has an inert tombstone store over `sync_tombstones`; Phase 4A activates only the local, reversible empty-folder subset.

## Files Changed

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js`
- `src-surfaces-base/studio/sync/auto-export.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-folder-delete-tombstone-phase4a.mjs`
- `release-evidence/2026-06-22/folder-delete-tombstone-phase4a.md`

## Behavior Implemented

- Public Desktop folder delete paths now route through local soft delete:
  - `H2O.Studio.store.folders.softDeleteEmptyFolder(folderId)`
  - `H2O.Studio.store.folders.remove(folderId)`
  - `H2O.Studio.store.folders.delete(folderId)`
  - `H2O.Studio.actions.folders.remove(folderId)`
  - `H2O.Studio.actions.folders.delete(folderId)`
- Soft delete creates an active `recordKind: "folder"` tombstone in `sync_tombstones`.
- `meta_json.recoverySnapshot` captures:
  - folder id
  - name/title
  - normalizedName
  - color/iconColor
  - icon
  - parentId
  - sortOrder
  - source/sourceKind
  - createdAt/updatedAt
  - meta fields needed to restore display
  - binding count and known row count, both required to be zero in Phase 4A
- Normal Desktop folder list/count reads hide active folder tombstones by default.
- Soft delete also removes the folder from the local folder-state mirror so normal FolderParity/sidebar display does not keep rendering the tombstoned row.
- Restore is available through:
  - `H2O.Studio.store.folders.restoreTombstonedFolder(folderIdOrTombstoneId)`
  - `H2O.Studio.actions.folders.restore(folderIdOrTombstoneId)`
- Restore rehydrates the folder from `recoverySnapshot`, marks the tombstone restored, restores the folder-state mirror row, and keeps the operation local-only.

## Blocking / Deferred Behavior

Soft delete blocks with precise reasons:

- `protected-folder`
- `system-folder`
- `unfiled-folder`
- `local-review-folder-not-editable`
- `folder-not-empty`
- `folder-identity-missing`
- `tombstone-store-unavailable`
- `already-tombstoned`

Deferred:

- Chrome delete remains disabled.
- Tombstone sync to Chrome remains disabled.
- Folder-with-chats delete remains blocked in Phase 4A.
- Hard purge remains blocked.
- WebDAV/cloud/relay transport remains later.

## Sync Health

Desktop Folder Sync Health now includes a local tombstone block:

- `tombstoneLocalDelete.phase: "desktop-local-soft-delete"`
- `tombstoneStoreAvailable`
- `activeTombstoneCount`
- `restoreAvailableCount`
- `purgeBlocked: true`
- `hardDeleteBlocked: true`
- `chatDeleteBlocked: true`
- `chromeDeleteSync: "deferred"`
- `tombstoneSync: "deferred"`

`deferred.deleteTombstone` remains `deferred` for cross-platform tombstone/delete sync.

## Invariants

- No folder row is hard deleted by the Phase 4A public delete path.
- No chat row is deleted.
- No snapshot row is deleted.
- No folder binding is deleted by Phase 4A soft delete because only empty folders are accepted.
- Auto-export ignores Phase 4A soft-delete/restore store events so local tombstones do not propagate as Desktop-to-Chrome delete in this phase.

## Validation Commands / Results

```bash
node --check src-surfaces-base/studio/store/folders.tauri.js
node --check "src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js"
node --check src-surfaces-base/studio/sync/auto-export.tauri.js
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check tools/validation/sync/validate-folder-delete-tombstone-phase4a.mjs
```

Result: passed.

```bash
node tools/validation/sync/validate-folder-delete-tombstone-phase4a.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/studio/validate-studio-library-organization-ui.mjs
node tools/validation/sync/validate-f19-shell-row-ux.mjs
node tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs
node tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs
node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs
```

Result: passed.

## Manual Retest Steps

1. Rebuild/reload Desktop assets if testing in packaged/Tauri runtime.
2. Create an empty test folder in Desktop Studio.
3. Soft delete it:
   ```js
   await H2O.Studio.actions.folders.delete("<folder-id>");
   ```
4. Confirm it disappears from normal Desktop folder list/sidebar.
5. Confirm tombstone state:
   ```js
   await H2O.Studio.store.folders.diagnosePhase4aTombstones();
   await H2O.Studio.store.tombstones.list({ recordKind: "folder", activeOnly: true });
   ```
6. Restore it:
   ```js
   await H2O.Studio.actions.folders.restore("<folder-id-or-tombstone-id>");
   ```
7. Confirm it reappears with name/color/order where available.
8. Try deleting Unfiled/protected/system/local-review folders and confirm precise blockers.
9. Try deleting a folder with chats/bindings and confirm `folder-not-empty`.
10. Confirm Chrome delete/tombstone sync remains disabled/deferred.
11. Confirm no chats or snapshots are deleted.

## Remaining Limitations

- Phase 4A is Desktop-local only.
- Chrome cannot request or apply folder deletes in this phase.
- Tombstones are not exported/imported across Chrome/Desktop.
- Non-empty folder delete remains blocked.
- Purge and retention sweeps remain deferred.
- WebDAV/cloud/relay remain later transport adapters.
