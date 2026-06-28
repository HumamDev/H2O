# Chat-folder binding sync B5c DB identity persistence

## Verdict

PASS / B5c IMPLEMENTED. B5c makes the Desktop-only `moveChatFolderBinding` proof helper write and verify through the same live canonical database/store used by `diagnoseChatFolderBindingParity` and `desktopCanonicalChatFolderBindings` export.

B5c does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply from Chrome, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

## Root Cause

B5 and B5a/B5b could still return successful after-counts without proving persistence to the same live store that a separate Desktop diagnostic/export used. The remaining data-path gap was:

- the helper wrote through `store.folders.bindChat()` / delegated binding write behavior,
- the diagnostic/export read from canonical `folder_bindings`,
- helper verification could therefore prove an internal or immediate view, not the exact live database/store used by the next diagnostic/export command.

The observed runtime confirmed this gap:

- helper result: Code `0`, English `1`, `ok:true`
- separate Desktop diagnostic immediately after: Code `1`, English `0`
- Desktop reload did not change the separate diagnostic result

## Fix

B5c stops using `bindChat()` for the B5 smoke proof and adds explicit canonical store methods:

- `moveCanonicalChatFolderBinding`
- `getCanonicalChatFolderBindingForChat`
- `canonicalBindingStoreIdentity`

The B5 helper now calls `moveCanonicalChatFolderBinding`, which writes directly to:

- `dbUrl:"sqlite:studio-v1.db"`
- `tableName:"folder_bindings"`
- `writerFunction:"moveCanonicalChatFolderBinding"`

It then reads the target chat back through:

- `readerFunction:"listCanonicalChatFolderBindings"`
- `rowReaderFunction:"getCanonicalChatFolderBindingForChat"`

The helper result now includes:

- `sameReaderVerificationOk:true` when the same live canonical path verifies
- `bindingStoreIdentity`
- `canonicalMoveResult`
- `postWriteDiagnosticSource:"diagnoseChatFolderBindingParity"`
- `postWriteCanonicalReader:"store.folders.listCanonicalChatFolderBindings"`
- `postWriteExportSource:"desktopCanonicalChatFolderBindings"`
- `postWriteDiagnosticFolderBindingCounts`

The helper blocks if the same-reader proof fails:

- `same-reader-verification-failed`
- `canonical-folder-binding-diagnostic-mismatch`
- `folder-binding-move-failed`

## Required Runtime Proof

Use the known target from the B5/B5a/B5b runtime failure:

- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- Code folder: `f_e301f3506938c19dbac0e304`
- English folder: `f_2bb1037f88b2719dbac10c22`
- confirmation phrase: `B5 DESKTOP BINDING CONVERGENCE`

Forward proof:

1. Baseline Desktop diagnostic shows Code `1` / English `0`.
2. Move Code -> English with `moveChatFolderBinding`.
3. Confirm helper returns:
   - `ok:true`
   - `status:"chat-folder-binding-moved"`
   - `blockers:[]`
   - `sameReaderVerificationOk:true`
   - `bindingStoreIdentity.dbUrl:"sqlite:studio-v1.db"`
   - `bindingStoreIdentity.tableName:"folder_bindings"`
   - `bindingStoreIdentity.writerFunction:"moveCanonicalChatFolderBinding"`
   - `bindingStoreIdentity.readerFunction:"listCanonicalChatFolderBindings"`
   - `postWriteDiagnosticFolderBindingCounts` has Code `0` / English `1`
4. Separate Desktop `diagnoseChatFolderBindingParity` shows:
   - `totalBindingCount:12`
   - Code `0`
   - English `1`
   - `blockers:[]`
5. Desktop `syncNow` direction `desktop-to-chrome` exports latest.json with:
   - `desktopCanonicalChatFolderBindings.bindingCount:12`
   - Code `0`
   - English `1`
6. Chrome import + `diagnoseChatFolderBindingParity` reports:
   - `parityComparable:true`
   - `parityOk:true`
   - `importedDesktopCanonicalBindingCount:12`
   - `chromeDisplayBindingCount:12`
   - `folderCountMismatchCount:0`
   - Code `0`
   - English `1`
   - `blockers:[]`

Reverse proof:

1. Move English -> Code with:
   - expectedCurrentFolderId `f_2bb1037f88b2719dbac10c22`
   - targetFolderId `f_e301f3506938c19dbac0e304`
2. Confirm helper, Desktop diagnostic/export, and Chrome import/diagnostic return original counts:
   - Code `1`
   - English `0`
   - `parityOk:true`
   - `blockers:[]`

## Runtime Status

Runtime proof status: BLOCKED by stale Desktop smoke bridge source.

Desktop queue health was recovered:

- `diagnoseHealth.ok:true`
- `diagnoseHealth.status:"healthy"`
- `blockers:[]`

Baseline Desktop diagnostic was reachable, but the currently loaded Desktop bridge did not expose the B5b/B5c `canonicalBindingReadPath` diagnostic field. It reported the current persisted state from prior operator runs:

- `totalBindingCount:12`
- Code `0`
- English `1`
- `blockers:[]`

To avoid a real mutation against stale source, a no-op already-targeted move was run with current English state:

- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- expectedCurrentFolderId: `f_2bb1037f88b2719dbac10c22`
- targetFolderId: `f_2bb1037f88b2719dbac10c22`
- status: `chat-folder-binding-already-targeted`
- changed: `false`
- blockers: `[]`

That no-op result did not include B5c fields:

- missing `sameReaderVerificationOk:true`
- missing `bindingStoreIdentity`
- missing `postWriteCanonicalReader`
- missing `canonicalMoveResult`

Interpretation:

- The Desktop queue is available, but the Desktop WebView is still running an older smoke bridge source.
- No B5c real binding move was attempted.
- No Desktop binding mutation was performed while creating this B5c fix.
- Live proof requires reloading/rebuilding Desktop Studio so the WebView runs the B5c source, then rerunning the forward/reverse proof sequence.

The Chrome import leg also requires the same Chrome profile to have sync-folder permission.

## Validation

Validation passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check src-surfaces-base/studio/store/folders.tauri.js`
- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `git diff --check`
- `git diff --cached --check` after staging the B5c-only files

## Safety Boundaries

Confirmed by implementation and validator:

- Desktop-only smoke helper
- explicit expected current folder required
- exact confirmation phrase required
- Desktop queue `--allow-mutation` required
- same live canonical database/store identity for write and read verification
- no Chrome destructive binding apply
- no Chrome binding mutation
- no Chrome binding request export
- no Desktop binding request apply from Chrome
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no purge
