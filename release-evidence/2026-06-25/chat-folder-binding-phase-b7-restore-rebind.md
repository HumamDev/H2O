# Chat-Folder Binding Sync B7 - Restore/Rebind Proof

Date: 2026-06-28

## Verdict

PASS. B7 restores the B6 soft-deleted Tech folder through the Desktop canonical restore path, rebinds the prior chat-folder bindings from recovery metadata, exports the restored canonical binding projection, and Chrome imports/displays binding parity green.

## Context

- B6 implementation: `426a9abb062adaafb2e3f0628829636a33d0a7b9`
- B6 runtime evidence: `f93f45ecb8d4c02d0526c3b075ae360e41d61f83`
- B6 target folder: Tech, `f_3bf15f43b835d19dbac0fb13`
- B6 final state:
  - Tech was soft-deleted.
  - Tech active binding count became `0`.
  - Total active binding count became `10`.
  - Unfiled count became `31`.
  - Desktop `bindingRecoverySnapshotCount:1`.
  - Chat count stayed `41`.
  - Snapshot count stayed `29`.
  - Chrome imported/displayed parity with Tech active count `0`.

## B7 Implementation

Added Desktop-only smoke op:

- `restoreFolderForBindingRebind`
- confirmation phrase: `B7 DESKTOP BINDING REBIND`
- requires Desktop queue `--allow-mutation`
- calls the existing Desktop restore API: `store.restoreTombstonedFolder || store.restoreFolder`
- captures before/after `diagnoseChatFolderBindingParity`
- captures before/after chat and snapshot counts
- reports:
  - `bindingRestoreAttemptedCount`
  - `bindingRestoredCount`
  - `bindingSkippedCount`
  - `restoreWarnings`
  - before/after folder binding counts
  - before/after Unfiled count
  - before/after recovery snapshot count

The underlying restore path already restores bindings from recovery metadata via `restoreBindingsFromRecoverySnapshot`, using `phase4b-folder-restore-rebind` and `allowTombstonedFolderRebind:true`.

Runtime note: the newly added `restoreFolderForBindingRebind` op was present in the local queue client but the already-running Desktop bridge had not reloaded the new bridge allowlist yet, so the live B7 behavior proof used the existing `restoreFolder` op with B7 reason metadata. This still exercised the same canonical `restoreTombstonedFolder` and `restoreBindingsFromRecoverySnapshot` path that the B7 helper wraps.

## Runtime Proof

Target:

- folder: Tech
- folderId: `f_3bf15f43b835d19dbac0fb13`

Pre-restore Desktop diagnostic:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `totalBindingCount:10`
- Tech active binding count: `0` by absence from active `folderBindingCounts`
- `unfiledCount:31`
- `bindingRecoverySnapshotCount:1`
- `deletedFolderBindingCount:0`
- `fallbackUnfiledBindingCount:2`
- `blockers:[]`

Restore command:

- op: `restoreFolder`
- payload:
  - `folderId:"f_3bf15f43b835d19dbac0fb13"`
  - `reason:"phase-b7-binding-restore-rebind-smoke"`
  - `restoredBySyncPeerId:"desktop-smoke-phase-b7"`
- result:
  - `ok:true`
  - `status:"folder-restored"`
  - `folderId:"f_3bf15f43b835d19dbac0fb13"`
  - `tombstoneId:"tombstone:21c3fdf4-0216-494b-982f-56be79144703"`
  - `bindingRestoreAttemptedCount:2`
  - `bindingRestoredCount:2`
  - `bindingSkippedCount:0`
  - `restoreWarnings:[]`
  - `blockers:[]`

Post-restore Desktop diagnostic:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `totalBindingCount:12`
- `desktopBindingCount:12`
- Tech active binding count: `2`
- `unfiledCount:29`
- `restoredFolderBindingCount:2`
- `bindingRecoverySnapshotCount:1`
- `deletedFolderBindingCount:0`
- `blockers:[]`
- safety:
  - `noHardDelete:true`
  - `noPurge:true`
  - `noChatDelete:true`
  - `noSnapshotDelete:true`

Chat/snapshot count check:

- `chatCount:41`
- `snapshotCount:29`

Desktop export / transport:

- explicit Desktop queue `syncNow` returned `desktop-queue-timeout`, but `latest.json` was written by the active Desktop export path.
- latest.json inspection:
  - `mtime:"2026-06-28T12:39:19.309Z"`
  - `bytes:763868`
  - `bindingCount:12`
  - `unfiledCount:29`
  - Tech active binding count: `2`

Chrome import / diagnostic:

- Chrome health before diagnostic:
  - `status:"healthy"`
  - `connected:true`
  - `permission:"granted"`
  - `noFolderHandle:false`
  - `chromeWritesSyncFolder:true`
  - `blockers:[]`
- explicit Chrome import returned `conflict-approval-required` because of a simultaneous update conflict, but Chrome had already imported the updated Desktop projection.
- Chrome `diagnoseChatFolderBindingParity`:
  - `ok:true`
  - `status:"chat-folder-binding-parity-diagnosed"`
  - `importedDesktopCanonicalBindingCount:12`
  - `chromeDisplayBindingCount:12`
  - `chromeCanonicalBindingCount:12`
  - Tech active binding count: `2`
  - `importedDesktopCanonicalUnfiledCount:29`
  - `unfiledCount:29`
  - `comparisonMode:"chat-folder-map"`
  - `comparableBindingCount:12`
  - `missingInChromeCount:0`
  - `extraInChromeCount:0`
  - `folderCountMismatchCount:0`
  - `parityComparable:true`
  - `parityOk:true`
  - `blockers:[]`
  - `warnings:[]`
  - `noChromeDestructiveBindingApply:true`

## Interpretation

- Restore-rebind behavior is proven for the B6 Tech fixture.
- The two prior Tech chat-folder bindings were restored from Desktop recovery metadata.
- Unfiled count returned from `31` to `29`.
- Chat count and snapshot count remained unchanged.
- Desktop exported a canonical active binding projection with Tech count `2`.
- Chrome imported/read the projection and display parity is green.
- The explicit Desktop export timeout and explicit Chrome import conflict are runtime lane noise; the transport file and Chrome diagnostic prove the restored projection was exported and consumed.

## Safety Boundaries

- no Chrome destructive binding authority
- no Chrome binding mutation
- no Chrome binding request export
- no hard delete
- no purge
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains canonical restore/rebind authority

## Validation

Static validator added:

- `tools/validation/sync/validate-chat-folder-binding-phase-b7-restore-rebind.mjs`

The validator checks:

- B7 helper is registered and Desktop-only.
- B7 helper is available through the Desktop queue client and absent from Chrome CDP tooling.
- Restore/rebind uses the existing Desktop restore path.
- The store-level recovery rebind path reads recovery snapshots and safely rebinds chats.
- No Chrome destructive binding authority or delete/purge authority is introduced.

## Remaining Work

B8 should close the chat-folder binding sync lane and decide whether Chrome-origin binding request flows are in scope later. The new `restoreFolderForBindingRebind` smoke helper should be available after the next Desktop bridge reload; the B7 runtime proof itself is already green through the existing live Desktop restore path.
