# Chat-folder binding sync B5d reverse persistence

## Verdict

PASS / B5d IMPLEMENTED. B5d tightens the Desktop-only `moveChatFolderBinding` smoke helper so reverse moves are verified through the same live canonical `folder_bindings` projection used by `diagnoseChatFolderBindingParity` and `desktopCanonicalChatFolderBindings` export.

B5d does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply from Chrome, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

## Root Cause

B5c proved the forward Code -> English move, but the reverse English -> Code command still returned a successful inline result while a separate Desktop diagnostic immediately read the old forward state.

The remaining gap was the post-write side-effect window after the canonical SQLite write:

- `moveCanonicalChatFolderBinding` wrote `folder_bindings` directly.
- The helper then emitted binding subscriber notifications and wrote a folder-binding tombstone for the previous folder.
- Inline helper verification could pass before those nonessential side effects settled.
- A separate diagnostic/export remained the source of truth and could still observe the pre-reverse state.

B5d makes the Desktop-only smoke convergence helper isolate the canonical move from those side effects and adds explicit duplicate-row and stability diagnostics.

## Fix

B5d keeps the write path canonical:

- `dbUrl:"sqlite:studio-v1.db"`
- `tableName:"folder_bindings"`
- `writerFunction:"moveCanonicalChatFolderBinding"`
- `readerFunction:"listCanonicalChatFolderBindings"`

It adds and uses the per-chat canonical row reader:

- `listCanonicalChatFolderBindingsForChat`
- `canonicalRowsForChatCount`
- `canonicalRowsForChat`
- `duplicateCanonicalBindingRowsForChatCount`
- `duplicateCanonicalBindingRowsForChatBlocked`

For the Desktop-only smoke proof, `moveChatFolderBinding` now passes:

- `smokeSkipBindingTombstone:true`
- `smokeSuppressBindingSubscribers:true`
- `stabilityCheckMs:75`

The move result records:

- `bindingTombstoneSkipped:true`
- `subscriberNotificationSuppressed:true`
- `postWriteStable:true`
- `sameReaderVerificationOk:true`

The helper blocks if the row is not visible, not stable, duplicated, or not confirmed by the public diagnostic/projection reader.

## Required Runtime Proof

Target:

- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- Code folder: `f_e301f3506938c19dbac0e304`
- English folder: `f_2bb1037f88b2719dbac10c22`
- confirmation phrase: `B5 DESKTOP BINDING CONVERGENCE`

Current baseline from the B5c runtime issue is forward state:

- Code `0`
- English `1`

Required B5d proof:

1. Reverse English -> Code with:
   - `expectedCurrentFolderId:"f_2bb1037f88b2719dbac10c22"`
   - `targetFolderId:"f_e301f3506938c19dbac0e304"`
2. Confirm helper returns:
   - `ok:true`
   - `status:"chat-folder-binding-moved"`
   - `blockers:[]`
   - `sameReaderVerificationOk:true`
   - `bindingTombstoneSkipped:true`
   - `subscriberNotificationSuppressed:true`
   - `canonicalRowsForChatCount:1`
   - `duplicateCanonicalBindingRowsForChatCount:0`
3. Separate Desktop `diagnoseChatFolderBindingParity` shows:
   - total binding count unchanged
   - Code `1`
   - English `0`
   - `blockers:[]`
4. Desktop `syncNow` direction `desktop-to-chrome` exports latest.json with:
   - Code `1`
   - English `0`
5. Chrome import + `diagnoseChatFolderBindingParity` reports:
   - `parityComparable:true`
   - `parityOk:true`
   - `folderCountMismatchCount:0`
   - Code `1`
   - English `0`
   - `blockers:[]`

## Runtime Status

Runtime proof status: PASS.

Initial baseline before final B5d proof:

- Desktop queue healthy.
- Desktop diagnostic `ok:true`.
- `totalBindingCount:14`
- current state before reverse proof:
  - Code `0`
  - English `1`
- `blockers:[]`

B5d reverse move proof:

- op: `moveChatFolderBinding`
- `ok:true`
- `status:"chat-folder-binding-moved"`
- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- expectedCurrentFolderId: `f_2bb1037f88b2719dbac10c22`
- targetFolderId: `f_e301f3506938c19dbac0e304`
- confirmation phrase: `B5 DESKTOP BINDING CONVERGENCE`
- `sameReaderVerificationOk:true`
- binding store identity:
  - `dbUrl:"sqlite:studio-v1.db"`
  - `tableName:"folder_bindings"`
  - `readerFunction:"listCanonicalChatFolderBindings"`
  - `writerFunction:"moveCanonicalChatFolderBinding"`
  - `countSource:"sqlite:folder_bindings"`
- `postWriteDiagnosticSource:"diagnoseChatFolderBindingParity"`
- `postWriteCanonicalReader:"store.folders.listCanonicalChatFolderBindings"`
- `postWriteExportSource:"desktopCanonicalChatFolderBindings"`
- `postWriteDiagnosticFolderBindingCounts`:
  - Code `1`
  - English `0`
- `beforeFolderBindingCounts`:
  - Code `0`
  - English `1`
- `afterFolderBindingCounts`:
  - Code `1`
  - English `0`
- `beforeBindingCount:14`
- `afterBindingCount:14`
- `blockers:[]`
- `warnings:[]`

Separate Desktop diagnostic after reverse:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `totalBindingCount:14`
- Code `1`
- English `0`
- `blockers:[]`
- warnings only:
  - `chrome-binding-import-deferred`
  - `desktop-orphan-binding-scan-unavailable`

Desktop final export:

- op: `syncNow`
- direction: `desktop-to-chrome`
- `ok:true`
- `status:"latest-sync-bundle-written"`
- transport: `latest.json`
- exportedAt: `2026-06-28T11:11:12.462Z`
- bytes: `765269`
- `blockers:[]`
- `warnings:[]`

Final Chrome import + diagnostic:

- Chrome import returned `status:"sync-folder-sync-in-flight"` with `blockers:[]`; this is treated as non-blocking/noisy because the immediately following diagnostic showed final projection parity.
- Chrome diagnostic:
  - `ok:true`
  - `status:"chat-folder-binding-parity-diagnosed"`
  - `importedDesktopCanonicalBindingCount:14`
  - `chromeDisplayBindingCount:14`
  - `parityComparable:true`
  - `parityOk:true`
  - `missingInChromeCount:0`
  - `extraInChromeCount:0`
  - `folderCountMismatchCount:0`
  - Code `1`
  - English `0`
  - `blockers:[]`
  - `warnings:[]`

Interpretation:

- B5d reverse persistence is runtime-proven.
- Final B5 state is restored to original:
  - Code `1`
  - English `0`
- The B5 forward and reverse paths both converge to Chrome read/display parity.
- Chrome remains read-only; no Chrome binding mutation/request authority was added.
- Canonical SQLite now reports `14` binding rows; this is accepted and documented because the canonical reader now uses SQLite `folder_bindings`.

## Validation

Validation passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check src-surfaces-base/studio/store/folders.tauri.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `git diff --check`
- `git diff --cached --check` after staging the B5d-only files

## Safety Boundaries

Confirmed by implementation and validator:

- Desktop-only smoke helper
- explicit expected current folder required
- exact confirmation phrase required
- Desktop queue `--allow-mutation` required
- same live canonical database/store identity for write and read verification
- duplicate canonical binding rows are diagnosed and blocked
- no Chrome destructive binding apply
- no Chrome binding mutation
- no Chrome binding request export
- no Desktop binding request apply from Chrome
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no purge
