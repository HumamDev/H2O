# Chat-folder binding sync B6 delete fallback

## Verdict

PARTIAL / B6 IMPLEMENTED, RUNTIME PROOF PENDING. B6 adds the Desktop-authoritative folder delete binding fallback proof path and updates the canonical binding projection so bindings to deleted or missing folders are not exported as active Chrome display bindings.

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

Runtime proof status: BLOCKED by stale Desktop smoke bridge source.

Read-only Desktop queue health was reachable:

- command: `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 30000`
- `ok:true`
- `status:"syncing"`
- `blockers:[]`
- Desktop-to-Chrome last export: `latest-sync-bundle-written`
- unrelated Chrome-to-Desktop delete request auto-apply noise remained present:
  - `folder-delete-request-auto-apply-failed`
  - `already-tombstoned`

Read-only Desktop binding diagnostic was reachable:

- command: `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 30000`
- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `canonicalBindingReadPath:"store.folders.listCanonicalChatFolderBindings"`
- `totalBindingCount:14`
- `knownChatCount:41`
- `unfiledCount:27`
- `missingFolderBindingCount:2`
- `deletedFolderBindingCount:0`
- `blockers:[]`
- warnings only:
  - `chrome-binding-import-deferred`
  - `desktop-orphan-binding-scan-unavailable`

However, that live diagnostic did not yet emit the new B6 fields:

- `fallbackUnfiledBindingCount`
- `activeDanglingFolderBindingCount`
- `activeDeletedFolderBindingExportedAsActive`
- `deletedFolderBindingsExcludedFromActiveProjection`

Interpretation:

- The Desktop queue is processing read-only commands.
- The live Desktop WebView is still running source older than this B6 implementation.
- The read-only diagnostic already shows two missing-folder binding references in the current runtime state.
- B6 source now classifies those as fallback/dangling diagnostic rows instead of active Chrome display rows, but live proof requires reloading/rebuilding Desktop Studio so the WebView runs the B6 source.
- No B6 live folder delete mutation was performed while creating this evidence note.

Full B6 runtime proof still requires:

- fresh Desktop Studio source with B6 fields loaded,
- a safe bound smoke folder fixture,
- `softDeleteFolderForBindingFallback`,
- Desktop export,
- Chrome import with sync-folder permission,
- Chrome parity diagnostic.

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
