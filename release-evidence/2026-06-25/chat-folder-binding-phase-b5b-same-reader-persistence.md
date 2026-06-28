# Chat-folder binding sync B5b same-reader persistence

## Verdict

PASS / B5b IMPLEMENTED. B5b changes Desktop chat-folder binding diagnostics and Desktop canonical export to read through the same canonical binding projection reader, then makes `moveChatFolderBinding` verify its post-write state through that same diagnostic/export-compatible path.

B5b does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply from Chrome, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

## Root Cause

B5a forced the smoke move through the canonical SQLite write option, but the proof still used inconsistent read layers:

- `moveChatFolderBinding` verified an immediate after-state inside the mutation operation.
- Follow-up `diagnoseChatFolderBindingParity` still reported the old Code/English counts.
- Follow-up `desktopCanonicalChatFolderBindings` export still reported the old Code/English counts.

The remaining mismatch was that Desktop diagnostics and export derived binding counts by walking folders and calling `store.folders.listChats(folderId)`. That path reads `folder_bindings`, then hydrates through the chat store, which is not an explicit reusable canonical projection reader. The B5 helper therefore still lacked an enforceable contract that its verification, the diagnostic, and latest.json export all read the same canonical binding projection.

## Fix

B5b adds one shared Desktop canonical reader:

- `H2O.Studio.store.folders.listCanonicalChatFolderBindings()`

The reader returns active rows directly from the canonical SQLite `folder_bindings` table joined with `folders` for folder names. It is read-only and carries safety markers:

- `source:"desktop-canonical-folder-bindings-sqlite"`
- `sourceSurface:"desktop-studio"`
- `authority:"desktop"`
- `status:"active"`
- `noChromeDestructiveBindingApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noHardDelete:true`
- `noPurge:true`

Both canonical consumers now prefer the same reader:

- `diagnoseChatFolderBindingParity`
- `desktopCanonicalChatFolderBindings` in latest.json export

`moveChatFolderBinding` now reports the same-reader verification fields:

- `postWriteDiagnosticSource:"diagnoseChatFolderBindingParity"`
- `postWriteCanonicalReader:"store.folders.listCanonicalChatFolderBindings"`
- `postWriteExportSource:"desktopCanonicalChatFolderBindings"`
- `postWriteDiagnosticFolderBindingCounts`

The helper still blocks with `canonical-folder-binding-diagnostic-mismatch` if the post-write diagnostic counts do not match the expected move result.

## Required Runtime Proof

Use the known target from the B5/B5a runtime failure:

- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- Code folder: `f_e301f3506938c19dbac0e304`
- English folder: `f_2bb1037f88b2719dbac10c22`
- confirmation phrase: `B5 DESKTOP BINDING CONVERGENCE`

Forward proof:

1. Move Code -> English with `moveChatFolderBinding`.
2. Confirm helper returns:
   - `ok:true`
   - `blockers:[]`
   - `bindingStoreWritePath:"canonical-folder-bindings-sqlite"`
   - `postWriteDiagnosticSource:"diagnoseChatFolderBindingParity"`
   - `postWriteCanonicalReader:"store.folders.listCanonicalChatFolderBindings"`
   - `postWriteExportSource:"desktopCanonicalChatFolderBindings"`
3. Confirm Desktop `diagnoseChatFolderBindingParity` shows:
   - `totalBindingCount:12`
   - Code `0`
   - English `1`
   - `blockers:[]`
4. Confirm Desktop `syncNow` direction `desktop-to-chrome` exports latest.json with:
   - `desktopCanonicalChatFolderBindings.bindingCount:12`
   - Code `0`
   - English `1`
   - `canonicalBindingReadPath:"store.folders.listCanonicalChatFolderBindings"`
5. Confirm Chrome import + `diagnoseChatFolderBindingParity` reports:
   - `parityComparable:true`
   - `parityOk:true`
   - `importedDesktopCanonicalBindingCount:12`
   - `chromeDisplayBindingCount:12`
   - `folderCountMismatchCount:0`
   - Code `0`
   - English `1`
   - `blockers:[]`

Reverse proof:

1. Move English -> Code with the same confirmation phrase.
2. Confirm helper, Desktop diagnostic/export, and Chrome import/diagnostic return original counts:
   - Code `1`
   - English `0`
   - `parityOk:true`
   - `blockers:[]`

## Runtime Status

Runtime proof status: BLOCKED by Desktop queue runtime access.

Attempted Desktop queue health probe:

- `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 30000`

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`
- `commandPath:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"`
- `nextAction:"Open Desktop Studio with ?h2oSmokeBridge=folder-sync-rc, set localStorage h2o:studio:smoke-bridge:enabled:v1 to folder-sync-rc, and confirm H2O.Studio.devSmoke.folderSyncQueue.diagnose().started is true."`

Because the queue did not process a read-only health probe, no B5b Desktop binding mutation was attempted.

The B5b live proof requires Desktop Studio to run the current source with `?h2oSmokeBridge=folder-sync-rc` and the queue started. The Chrome import leg requires the same Chrome profile to have sync-folder permission.

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
- `git diff --cached --check` after staging the B5b-only files

## Safety Boundaries

Confirmed by implementation and validator:

- Desktop-only smoke helper
- explicit expected current folder required
- exact confirmation phrase required
- Desktop queue `--allow-mutation` required
- same canonical reader for helper verification, Desktop diagnostic, and Desktop latest.json export
- no Chrome destructive binding apply
- no Chrome binding mutation
- no Chrome binding request export
- no Desktop binding request apply from Chrome
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no purge
