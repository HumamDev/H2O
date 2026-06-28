# Chat-folder binding sync B5 Desktop-origin convergence

## Verdict

PASS / B5 IMPLEMENTED. B5 adds a Desktop-only smoke convergence harness for proving that a Desktop-origin chat-folder binding move flows through the Desktop canonical projection and converges to Chrome read/display parity.

B5 does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply from Chrome, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

## Strategy

The B5 harness uses the existing Desktop folder binding APIs:

- `H2O.Studio.store.folders.listForChat(chatId)`
- `H2O.Studio.store.folders.bindChat(targetFolderId, chatId, options)`
- `diagnoseChatFolderBindingParity`

The new smoke op is:

- `moveChatFolderBinding`

It is Desktop-only and requires:

- `chatId`
- `expectedCurrentFolderId`
- `targetFolderId`
- explicit `reason`
- confirmation phrase `B5 DESKTOP BINDING CONVERGENCE`
- Desktop queue `--allow-mutation`

The helper returns before/after binding summaries and folder binding counts, while redacting chat IDs unless `includeSensitive:true` is explicitly passed.

## Runtime Proof Plan

1. Run Desktop `diagnoseChatFolderBindingParity`.
2. Select one existing low-risk binding and a target folder.
3. Run `moveChatFolderBinding` through the Desktop queue with the required confirmation phrase.
4. Run Desktop `diagnoseChatFolderBindingParity` again and confirm changed folder counts.
5. Run Desktop `syncNow` direction `desktop-to-chrome`.
6. Run Chrome `syncNow` direction `desktop-to-chrome`.
7. Run Chrome `diagnoseChatFolderBindingParity`.
8. Confirm:
   - `parityComparable:true`
   - `parityOk:true`
   - `importedDesktopCanonicalBindingCount` equals Desktop binding count
   - `chromeDisplayBindingCount` equals imported Desktop binding count
   - `missingInChromeCount:0`
   - `extraInChromeCount:0`
   - `folderCountMismatchCount:0`
   - `blockers:[]`
9. Move the chat back to the original folder and repeat export/import/diagnostic, unless the mutation is intentionally retained.

## Runtime Status

Runtime proof status: BLOCKED by Desktop queue runtime access.

Attempted Desktop queue calls:

- `diagnoseHealth`
- `diagnoseChatFolderBindingParity` with `includeSensitive:true` for selecting a reversible binding target

Both returned:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`
- `nextAction:"Open Desktop Studio with ?h2oSmokeBridge=folder-sync-rc, set localStorage h2o:studio:smoke-bridge:enabled:v1 to folder-sync-rc, and confirm H2O.Studio.devSmoke.folderSyncQueue.diagnose().started is true."`

No Desktop binding mutation was performed.

Expected additional blocker if Chrome is launched in a fresh CDP profile without sync-folder permission:

- `permission-required`

These are operator runtime gates, not B5 product-code blockers.

## Validation

Validation passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check` after staging the B5-only files

## Safety Boundaries

Confirmed by implementation and validator:

- Desktop-origin only
- smoke-gated helper
- explicit current-folder expectation
- explicit confirmation phrase
- no Chrome destructive binding apply
- no Chrome binding mutation
- no Chrome binding request export
- no Desktop binding request apply from Chrome
- no chat deletion
- no snapshot deletion
- no hard delete
- no purge
- no asset deletion

## Remaining For B6/B7

B6 should prove folder delete binding fallback / Unfiled behavior against the canonical projection.

B7 should prove folder restore rebind behavior using the captured binding recovery mechanics.
