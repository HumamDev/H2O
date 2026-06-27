# Phase 6C Plan — Chrome folder restore request parity

## Reason For 6C

Phase 6B closed Chrome folder soft delete through Desktop apply, Desktop receipt export, Chrome receipt import, Recently Deleted canonical parity, and purge/reload suppression.

The remaining lifecycle gap is restore parity. Chrome can show Desktop-confirmed Recently Deleted rows, but Chrome restore is currently read-only/Desktop-only. Product parity now requires Chrome to request restore while Desktop remains the canonical restore authority.

Goal for Phase 6C: Chrome may request restore, Desktop applies or rejects the request, Desktop exports restore receipt/canonical state, and Chrome imports that state so normal folder lists and Recently Deleted lists match across Desktop and Chrome after sync and reload.

## Files Inspected

- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/store/tombstones.tauri.js`
- `src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`

## Current Restore Architecture Found

Desktop already owns the canonical restore path:

- Desktop Recently Deleted restore calls `restoreRecentlyDeletedFolder(...)`.
- The UI delegates to `H2O.Studio.store.folders.restoreTombstonedFolder` or `restoreFolder`.
- `restoreTombstonedFolder` restores folder metadata from the tombstone recovery snapshot, restores eligible bindings through the existing Desktop path, and marks the tombstone restored through `tombstones.markRestored(...)`.
- `tombstones.markRestored(...)` sets `restored_at` only when the tombstone is still active.
- The Desktop smoke bridge exposes `restoreFolder` as a Desktop mutation op.
- Phase 4D/4D.4 validation already checks restore smoke behavior and restore receipt import diagnostics.

Desktop export already has restore receipt support:

- `export-bundle.tauri.js` builds `folderRestoreReceipts` from restored folder tombstones.
- Restore receipts are status-only records with `noTombstoneApply:true`, `noHardDelete:true`, and `noChatDelete:true`.

Chrome already has receipt-only restore handling:

- `folder-import.mv3.js` imports Desktop `folderRestoreReceipts`.
- Chrome re-shows a folder from receipt state only when it can reconcile a Desktop restore receipt against locally hidden state.
- The Chrome receipt import path is visible-state only and does not create canonical tombstones or perform hard deletes.

Chrome Recently Deleted currently blocks restore authority:

- Chrome companion rows render a disabled Restore control with `Restore is available from Desktop Studio.`
- Permanent delete remains blocked with `Permanent delete is only available from Desktop Studio.`

## What Already Works

- Desktop can restore active folder tombstones from Recently Deleted.
- Desktop restore is idempotent for already-restored tombstones with an existing folder row.
- Desktop restore receipts can be exported from restored tombstones.
- Chrome can import Desktop restore receipts as a visible-state-only re-show operation.
- Existing safety flags keep Chrome from applying tombstones or performing destructive mutation.
- Phase 6B recently deleted canonical parity and purge suppression give Chrome a Desktop-authoritative Recently Deleted projection to target.

## Missing For Chrome Restore Parity

- No Chrome Restore request UX is enabled.
- No Chrome `folderRestoreRequests[]` export equivalent to `folderDeleteRequests[]`.
- No Chrome restore request store/mirror/dedupe contract was found.
- No Desktop import/apply path for Chrome-origin restore requests was found.
- No Desktop restore receipt/request correlation for Chrome request IDs was found.
- Chrome has no pending-restore state or diagnostics.
- Chrome reload behavior after restore still needs a guard against stale delete receipts or pending-delete hidden state re-hiding restored folders.
- Purged/permanently suppressed folders must be explicitly blocked from restore.

## Architecture Verdict

Implement restore parity using the same authority model as Phase 6B:

- Chrome is request-only.
- Desktop is canonical.
- Chrome must not directly restore canonical tombstones.
- Desktop validates and applies restore through the existing Desktop restore API.
- Desktop exports restore receipt and canonical visible/Recently Deleted projections.
- Chrome imports Desktop state and updates visible state only.

Chrome should not gain permanent delete, purge, canonical restore, tombstone apply/create, hard delete, or chat/snapshot/asset deletion authority.

## Proposed Implementation Slices

### 6C.1 Chrome Restore Request UX

- Enable Restore in the Chrome Recently Deleted companion only for Desktop-confirmed active canonical Recently Deleted rows.
- Label the action `Restore`.
- On click, create a request-only pending restore intent.
- Do not remove the row from Chrome Recently Deleted immediately.
- Show compact pending state such as `Restore pending`.
- Block restore for purged/permanently deleted, missing identity, protected/system, and non-canonical stale rows.
- Keep Permanent Delete blocked as Desktop-only.

### 6C.2 Chrome Restore Request Export

- Add a Chrome request writer/store for `folderRestoreRequests[]`, likely adjacent to the existing `tombstone-reviews.mv3.js` delete request path.
- Export requests through the Chrome sync export path in `auto-import.mv3.js`.
- Include `requestId`, `folderId`, `folderName`, `tombstoneId` when known, `requestedAt`, source metadata, and request-only safety flags.
- Dedupe by folder ID and unresolved request ID.
- Add diagnostics for request count, exportable count, duplicate count, and pending local restore count.

### 6C.3 Desktop Restore Request Import/Apply

- Extend Desktop chrome-to-desktop import in `folder-sync.tauri.js` to ingest `folderRestoreRequests[]`.
- Auto-apply only safe requests:
  - active folder tombstone exists
  - tombstone is not restored
  - tombstone is not purged/permanently suppressed
  - folder is not protected/system
  - folder ID matches the tombstone recovery snapshot
- Apply through `store.folders.restoreTombstonedFolder`, not through Chrome state.
- Reject safely when the tombstone is missing, already restored, purged, protected, or malformed.
- No chat/snapshot/asset deletion. Any binding restore remains Desktop-owned existing restore behavior.

### 6C.4 Desktop Restore Receipt And Canonical Export

- Ensure restored tombstones export receipts that include the Chrome restore `requestId` when the restore was request-driven.
- Ensure Desktop visible folder export includes the restored folder.
- Ensure Desktop canonical Recently Deleted projection excludes the restored row.
- Preserve Desktop purge suppression projection so purged folders cannot be restored by stale Chrome state.

### 6C.5 Chrome Restore Receipt Import And Parity

- Extend Chrome restore receipt import to match by `requestId`, `tombstoneId`, and `folderId`.
- Clear pending restore state after trusted Desktop receipt import.
- Clear stale pending delete and desktop receipt hide markers for the restored folder.
- Re-show/adopt the restored folder from Desktop visible set.
- Remove the folder from Chrome Recently Deleted companion once Desktop canonical Recently Deleted no longer includes it.
- Diagnostics must prove Desktop and Chrome normal folder lists and Recently Deleted lists match.

### 6C.6 Reload And Purge Suppression Regression Proof

- Verify Chrome reload does not re-hide restored folders from stale delete receipt, stale pending delete, or local hidden overlay state.
- Verify restore of a purged/permanently deleted folder is blocked.
- Verify already-restored requests are idempotent.
- Verify Desktop/Chrome normal folder parity and Recently Deleted parity remain green after reload.

## Required Diagnostics

Add or extend diagnostics to report:

- `chromeRestoreRequestCount`
- `chromeExportedFolderRestoreRequestCount`
- `desktopImportedFolderRestoreRequestCount`
- `desktopAppliedFolderRestoreRequestCount`
- `desktopRejectedFolderRestoreRequestCount`
- `desktopRestoreReceiptExportedCount`
- `chromeRestoreReceiptImportedCount`
- `pendingRestoreCount`
- `restoredFolderVisibleInChrome`
- `restoredFolderVisibleInDesktop`
- `desktopChromeRecentlyDeletedParityOk`
- `desktopChromeVisibleFolderParityOk`
- `restoreBlockedPurgedCount`
- `restoreAlreadyRestoredCount`
- `restoreMissingTombstoneCount`
- `staleDeleteHideClearedOnRestoreCount`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`
- `noChromeTombstoneCreate:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`

## Required Validators

Suggested validators:

- `tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-request-ui.mjs`
- `tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
- `tools/validation/sync/validate-folder-restore-phase6c3-desktop-restore-apply.mjs`
- `tools/validation/sync/validate-folder-restore-phase6c4-receipt-export.mjs`
- `tools/validation/sync/validate-folder-restore-phase6c5-chrome-receipt-import-parity.mjs`
- `tools/validation/sync/validate-folder-restore-phase6c6-reload-purge-regression.mjs`

Existing validators to keep green:

- `tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- Phase 6B delete lifecycle validators, especially 6B.4e, 6B.5, and 6B.6.
- Phase 5A visible parity validator.
- Phase 6A purge UI/API validators.

## Runtime Proof Sequence

1. Start Desktop and Chrome healthy with folder sync connected.
2. Create a folder in Chrome.
3. Delete it from Chrome.
4. Sync Chrome to Desktop.
5. Confirm Desktop applies the soft delete and both Recently Deleted panels show the same active deleted folder.
6. In Chrome Recently Deleted, click Restore.
7. Confirm Chrome creates a request-only restore intent and exports `folderRestoreRequests[]`.
8. Import/apply the restore request on Desktop.
9. Confirm Desktop normal folders show the restored folder and Desktop Recently Deleted no longer shows it.
10. Export Desktop latest state and restore receipt.
11. Import Desktop state into Chrome.
12. Confirm Chrome normal folders show the restored folder and Chrome Recently Deleted no longer shows it.
13. Reload Chrome Studio.
14. Confirm the restored folder remains visible and is not re-hidden by stale delete/pending state.
15. Confirm diagnostics show normal list parity, Recently Deleted parity, no blockers, and all safety flags true.

## Risks And Edge Cases

- Purged/permanently deleted folder restore must be blocked even if Chrome has stale receipt/history rows.
- Already-restored folder restore must be idempotent and not duplicate folder rows.
- Restore request without a matching Desktop active tombstone must be rejected safely.
- Stale delete receipts or pending-delete hidden overlays must not re-hide a restored folder after Chrome reload.
- Chrome offline/no sync-folder permission should leave a restore request pending/export-needed or block clearly.
- Duplicate restore requests should not duplicate Desktop apply work.
- Protected/system folders should be rejected.
- Restore must not delete or mutate chats, snapshots, or assets from Chrome.
- Desktop binding restore behavior must remain the only binding mutation path and should stay within existing restore semantics.

## Recommended First Implementation Prompt

Implement Phase 6C.1 only: Chrome restore request UX scaffold.

Scope should be Chrome UI/request-intent only. Enable the Restore button in Chrome Recently Deleted for Desktop-confirmed active canonical rows, create a request-only pending restore marker, keep Desktop as authority, do not export/apply yet unless a tiny diagnostic is needed, and keep Permanent Delete blocked. Add a validator and evidence for the UX/request marker only.

## Validation For This Plan

- `git diff --check`
- `git diff --cached --check`
