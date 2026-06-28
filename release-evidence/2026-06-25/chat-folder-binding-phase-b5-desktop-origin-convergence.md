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

Runtime proof status: PASS.

B5 Desktop-origin binding convergence is now runtime-proven after the B5a/B5b/B5c/B5d persistence fixes:

- B5 implementation: `eed3f34aa1f65ffb223fd13210b373e77d4573c4`
- B5a canonical move persistence: `a2ed5fdc5fb78dfe264d61888206cc6288242b85`
- B5b same-reader persistence: `e8a10bfd0be7041b636e5f93c0ef6050cdfa2237`
- B5c DB identity persistence: `3798f3391179917b2bd738f28d00ae1bd0d05bb6`
- B5d reverse persistence: `be47c2be2f698c5af0a27489496d881138893340`

Initial baseline before final B5d proof:

- Desktop queue healthy.
- Desktop diagnostic `ok:true`.
- `totalBindingCount:14`
- current state before reverse proof was forward:
  - Code folder `f_e301f3506938c19dbac0e304`: `0`
  - English folder `f_2bb1037f88b2719dbac10c22`: `1`
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
- before counts:
  - Code `0`
  - English `1`
- after counts:
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

- Desktop-origin binding convergence is proven in both directions.
- Code -> English forward move converged to Chrome parity.
- English -> Code reverse move converged back to original Chrome parity.
- Final state is restored to original:
  - Code `1`
  - English `0`
- Chrome remains read-only; no Chrome binding mutation/request authority was added.
- B5 now uses canonical SQLite `folder_bindings`, which sees `14` rows instead of the earlier `12`; this is expected after the canonical reader was unified.

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
