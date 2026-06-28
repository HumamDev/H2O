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

Runtime proof status: BLOCKED by Desktop smoke queue runtime access.

The product-code fix is implemented and statically validated. A read-only Desktop queue probe was attempted after the B5d implementation:

- command: `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 30000`
- status: `desktop-queue-timeout`
- blockers: `["desktop-queue-timeout"]`
- next action: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set `localStorage` key `h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`, reload, and confirm the queue has started.

Because the read-only diagnostic queue is not processing commands, no B5d live binding mutation was performed while creating this fix. Live proof requires Desktop Studio to be running the current B5d smoke bridge/store source, then rerunning the reverse proof sequence.

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
