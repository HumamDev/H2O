# Chat-folder binding sync B6 delete fallback

## Verdict

PASS / B6 CLOSED. B6 proves Desktop-authoritative folder delete binding fallback / Unfiled behavior against the canonical binding projection. Bindings to deleted or missing folders are not exported as active Chrome display bindings.

B6 does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply from Chrome, hard delete, purge, chat deletion, snapshot deletion, or asset deletion.

## Scope

B6 is limited to folder delete binding fallback / Unfiled behavior against the Desktop canonical projection:

- Desktop remains canonical authority.
- Chrome remains a read-only consumer of the Desktop projection.
- Folder delete remains soft/tombstone-based.
- Bound chats and snapshots are not deleted.
- Deleted-folder bindings are excluded from active normal binding projection.

## Implementation

B6 reuses the existing Desktop soft-delete and binding recovery substrate:

- `readFolderBindingsForRemoveSafely`
- `buildFolderBindingTombstone`
- `writeFolderRemoveTombstonesSafely`
- `unbindSnapshotBindingsForSoftDelete`
- `restoreBindingsFromRecoverySnapshot`

The existing soft-delete path already:

- captures bound chat rows into the folder recovery snapshot,
- creates a folder tombstone with `affectedChatCount` / `bindingCount`,
- unbinds those chats with reason `phase4b-folder-soft-delete-move-to-unfiled`,
- sets `noChatDelete:true`,
- avoids hard delete.

B6 adds a Desktop-only smoke helper:

- op: `softDeleteFolderForBindingFallback`
- confirmation phrase: `B6 DESKTOP BINDING FALLBACK`
- requires `--allow-mutation` through the Desktop queue
- requires a folder with at least `expectedBindingCountMin` active bindings
- delegates to `store.folders.softDeleteEmptyFolder`
- records before/after binding diagnostics and chat/snapshot counts

B6 also updates Desktop canonical binding diagnostic/export behavior:

- `fallbackUnfiledBindingCount`
- `activeDanglingFolderBindingCount`
- `activeDeletedFolderBindingExportedAsActive:false`
- `deletedFolderBindingsExcludedFromActiveProjection:true`

If a canonical binding row points at an active-deleted or missing folder, it is counted as fallback/unfiled diagnostic state and excluded from the active `bindings[]` / `rows[]` projection sent to Chrome.

Chrome import and diagnostics preserve/read the same fields:

- `fallbackUnfiledBindingCount`
- `activeDanglingFolderBindingCount`
- `activeDeletedFolderBindingExportedAsActive`
- `deletedFolderBindingsExcludedFromActiveProjection`

## Runtime Proof Plan

1. Desktop queue/health green.
2. Create or identify a safe folder with at least one bound chat.
3. Capture pre-delete Desktop `diagnoseChatFolderBindingParity`.
4. Run:
   - op: `softDeleteFolderForBindingFallback`
   - `confirmationPhrase:"B6 DESKTOP BINDING FALLBACK"`
   - `expectedBindingCountMin:1`
5. Confirm:
   - `status:"folder-soft-deleted-binding-fallback-proven"`
   - before folder binding count `>= 1`
   - after folder binding count `0`
   - chat count unchanged
   - snapshot count unchanged
   - `activeDeletedFolderBindingExportedAsActive:false`
   - `deletedFolderBindingsExcludedFromActiveProjection:true`
   - `blockers:[]`
6. Desktop export `desktop-to-chrome`.
7. Chrome import `desktop-to-chrome`.
8. Chrome `diagnoseChatFolderBindingParity` confirms:
   - `parityComparable:true`
   - `parityOk:true`
   - no active display count for the deleted folder
   - fallback/recovery fields are present
   - `blockers:[]`

If a temporary fixture is used, restore it through the existing Desktop restore path and record the cleanup result.

## Runtime Status

Runtime proof status: PASS.

Pre-delete Desktop diagnostic:

- queue enabled: `true`
- queue started: `true`
- queue blockers: `[]`
- health status: `syncing`
- binding diagnostic `ok:true`
- `totalBindingCount:14`
- `unfiledCount:27`
- `deletedFolderBindingCount:0`
- `missingFolderBindingCount:2`
- `bindingRecoverySnapshotCount:0`
- Tech folder `f_3bf15f43b835d19dbac0fb13` active binding count: `2`

B6 soft delete helper proof:

- op: `softDeleteFolderForBindingFallback`
- `ok:true`
- `status:"folder-soft-deleted-binding-fallback-proven"`
- folderId: `f_3bf15f43b835d19dbac0fb13`
- tombstoneId: `tombstone:21c3fdf4-0216-494b-982f-56be79144703`
- `beforeFolderBindingCount:2`
- `afterFolderBindingCount:0`
- `beforeUnfiledCount:29`
- `afterUnfiledCount:31`
- `beforeDeletedFolderBindingCount:0`
- `afterDeletedFolderBindingCount:0`
- `beforeFallbackUnfiledBindingCount:2`
- `afterFallbackUnfiledBindingCount:2`
- `bindingRecoverySnapshotCount:1`
- `activeDeletedFolderBindingExportedAsActive:false`
- `deletedFolderBindingsExcludedFromActiveProjection:true`
- `chatCountBefore:41`
- `chatCountAfter:41`
- `snapshotCountBefore:29`
- `snapshotCountAfter:29`
- `blockers:[]`
- `warnings:[]`
- safety flags preserved:
  - `noHardDelete:true`
  - `noPurge:true`
  - `noChatDelete:true`
  - `noSnapshotDelete:true`
  - `noBroadFilesystemAccess:true`
  - `noChromeDestructiveBindingApply:true`
  - `noAssetDelete:true`

Post-delete Desktop diagnostic:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `totalBindingCount:10`
- `unfiledCount:31`
- `deletedFolderBindingCount:0`
- `missingFolderBindingCount:2`
- `bindingRecoverySnapshotCount:1`
- Tech active count: `0`
- `blockers:[]`

Desktop export:

- op: `syncNow`
- direction: `desktop-to-chrome`
- `ok:true`
- `status:"latest-sync-bundle-written"`
- transport: `latest.json`
- exportedAt: `2026-06-28T12:23:37.638Z`
- bytes: `756007`
- `blockers:[]`
- `warnings:[]`

Chrome import + diagnostic:

- import `ok:true`
- import status: `sync-folder-imported`
- import blockers: `[]`
- diagnostic `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `importedDesktopCanonicalBindingCount:10`
- `chromeDisplayBindingCount:10`
- `parityComparable:true`
- `parityOk:true`
- `missingInChromeCount:0`
- `extraInChromeCount:0`
- `folderCountMismatchCount:0`
- `unfiledCount:31`
- `importedDesktopCanonicalUnfiledCount:31`
- `deletedFolderBindingCount:0`
- `missingFolderBindingCount:2`
- Tech active count: `0`
- `blockers:[]`
- `warnings:[]`
- safety flags remain true:
  - `noChromeDestructiveBindingApply:true`
  - `noChatDelete:true`
  - `noSnapshotDelete:true`
  - `noHardDelete:true`
  - `noPurge:true`

Interpretation:

- Folder delete binding fallback / Unfiled behavior is proven.
- Deleting Tech with two bound chats did not delete chats, snapshots, or assets.
- Deleted folder bindings are excluded from active canonical projection.
- Unfiled count increased from `29` to `31`.
- Desktop exported the fallback projection.
- Chrome imported and displayed parity with Tech active count `0`.
- Desktop recovery snapshot count is `1`, while Chrome diagnostic showed `bindingRecoverySnapshotCount:0`; this is non-blocking Desktop-side recovery metadata and belongs to the B7 restore-rebind proof.
- Current state after B6: Tech folder is soft-deleted and should be restored/rebound in B7.

## Validation

Validation required:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b6-delete-fallback.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b6-delete-fallback.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`

## Safety Boundaries

Confirmed by implementation and validator:

- Desktop-only smoke helper
- explicit bound-folder precondition
- exact confirmation phrase required
- Desktop queue `--allow-mutation` required
- uses existing soft-delete/tombstone path
- binding recovery snapshot remains available for restore
- deleted-folder bindings are not exported as active normal bindings
- Chrome remains read-only
- no Chrome destructive binding authority
- no Chrome binding mutation
- no Chrome binding request export
- no Desktop binding request apply from Chrome
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no purge

## Remaining For B7/B8

B7 should prove folder restore rebind behavior from the captured recovery snapshot.

B8 should close chat-folder binding sync after B6 and B7 runtime proof are green.
