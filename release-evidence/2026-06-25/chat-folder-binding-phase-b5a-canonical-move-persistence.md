# Chat-folder binding sync B5a canonical move persistence

## Verdict

PASS / B5a IMPLEMENTED. B5a fixes the Desktop-only `moveChatFolderBinding` smoke helper so a successful move is forced through the canonical Desktop SQLite `folder_bindings` store used by `diagnoseChatFolderBindingParity` and the Desktop `latest.json` canonical binding export.

B5a does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply from Chrome, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

## Root Cause

The B5 helper called `H2O.Studio.store.folders.bindChat(targetFolderId, chatId, opts)` without forcing the canonical SQLite binding write path. In current Desktop runtime, the folder store can route binding writes through F15 folder-binding delegation when that lane is enabled. That delegated path may report success for the helper and produce an immediate computed after-state, while the canonical `folder_bindings` table read by `diagnoseChatFolderBindingParity` and `desktopCanonicalChatFolderBindings` export remains unchanged.

Observed failure:

- helper result: `status:"chat-folder-binding-moved"`, `ok:true`, Code `1 -> 0`, English `0 -> 1`
- follow-up Desktop diagnostic: Code remained `1`, English remained `0`
- follow-up Desktop `latest.json`: Code remained `1`, English remained `0`

## Fix

B5a adds a per-call canonical binding write override in the Desktop folder store:

- `forceCanonicalFolderBindingStoreWrite:true`
- `forceLegacyFolderBindingWrite:true`

When either override is present, `f15FolderBindingDelegationEnabled(opts)` returns false and the write uses the canonical SQLite `folder_bindings` path.

`moveChatFolderBinding` now passes the override and returns additional proof fields:

- `bindingStoreWritePath:"canonical-folder-bindings-sqlite"`
- `forceCanonicalFolderBindingStoreWrite:true`
- `expectedTargetFolderBindingCount`
- `actualTargetFolderBindingCount`
- `expectedCurrentFolderBindingCount`
- `actualCurrentFolderBindingCount`

The helper now blocks with `canonical-folder-binding-diagnostic-mismatch` if the post-write Desktop diagnostic counts do not match the expected canonical result. This prevents the false-success mode observed in B5.

## Required Runtime Proof

Use the known target from the B5 runtime failure:

- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- Code folder: `f_e301f3506938c19dbac0e304`
- English folder: `f_2bb1037f88b2719dbac10c22`
- confirmation phrase: `B5 DESKTOP BINDING CONVERGENCE`

Forward proof:

1. Move Code -> English with `moveChatFolderBinding`.
2. Confirm helper returns `ok:true`, `bindingStoreWritePath:"canonical-folder-bindings-sqlite"`, `blockers:[]`.
3. Confirm Desktop `diagnoseChatFolderBindingParity` shows:
   - `totalBindingCount:12`
   - `f_e301f3506938c19dbac0e304:0`
   - `f_2bb1037f88b2719dbac10c22:1`
   - `blockers:[]`
4. Confirm Desktop `syncNow` direction `desktop-to-chrome` exports `latest.json` with the same counts.
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

No Desktop binding mutation was performed during B5a because the queue did not process even the read-only health probe.

The B5 runtime failure is fully attributed and guarded statically. A live rerun requires the Desktop Studio smoke bridge to load the B5a source and the Chrome profile to have sync-folder permission if the Chrome import leg is exercised.

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
- `git diff --cached --check` after staging the B5a-only files

## Safety Boundaries

Confirmed by implementation and validator:

- Desktop-only smoke helper
- explicit expected current folder required
- explicit confirmation phrase required
- Desktop queue `--allow-mutation` required
- canonical Desktop `folder_bindings` store write only
- no Chrome destructive binding apply
- no Chrome binding mutation
- no Chrome binding request export
- no Desktop binding request apply from Chrome
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no purge
