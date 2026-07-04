# Folder Sync Binding F15 Settlement Context Fix Implementation

Date: 2026-07-01

## Verdict

BINDING F15 SETTLEMENT CONTEXT FIX IMPLEMENTED.

## Commit Context

- F15-settled repair-write implementation: `ff3ccd44`
- F15 live Phase A proposal blocker evidence: `0b015cc7`
- F15 canonical-row enrichment implementation: `501635ae865b460ac0bb4e0cb4e5d6196714022d`
- F15 canonical-row shadow regression fix: `0833d4a19e89ee6a4d171a15a44d2e5291308cb6`
- F15 live Phase A settlement blocker evidence: `8b5e13d07f5eaf5734fe83391bdbefd89a0c5d52`
- F15 settlement context fix design preflight: `08527e9d`

## Blocker

Live Phase A reached F15 settlement and failed with:

- `f15-folder-binding-settlement-failed`
- `library-conflict-runtime-context-missing`
- rule: `binding-duplicate-context`
- mode: `settlement`
- operation: `bind`

The root cause was that proposal had context, settlement args did not. Existing-binding context reached proposal/preflight, but `runF15FolderBindingDelegationPipeline()` called `settleLibraryExecuteEnvelope` without `existingBindings` or `siblingBindings`.

`settlementConflictInput(args)` already accepts `args.existingBindings`, so the fix is to supply real context to settlement rather than weaken the conflict runtime.

## Fix

`src-surfaces-base/studio/store/folders.tauri.js` now adds `buildF15SettlementExistingBindingContext(chatId, chatSubjectId, opts)`.

The helper:

- freshly reads canonical per-chat bindings through `listCanonicalChatFolderBindingsForChat(chatId)`;
- maps active rows into the F15 conflict-runtime binding shape;
- uses `chatSubjectId` as `leftSubjectId`;
- hashes each current folder id through `hashLegacyEndpoint('folder.metadata', folderId)`;
- emits `subjectType:'library.binding'`;
- emits `bindingKind:'chat-folder'`;
- emits `bindingState:'bound'`;
- emits `leftSubjectType:'chat.metadata'`;
- emits `rightSubjectType:'folder.metadata'`;
- returns `[]` when the fresh read has no active rows after the unbind half;
- fails closed with `f15-folder-binding-settlement-context-failed` when context cannot be trusted.

`runF15FolderBindingDelegationPipeline()` now computes that fresh hashed existing binding context after the execute envelope succeeds and immediately before settlement, then passes it to `settleLibraryExecuteEnvelope` as `existingBindings`.

## Proof

The implementation validator proves:

- settlement receives `existingBindings`;
- settlement context is freshly read and hashed, not reused from proposal-only context;
- real conflict runtime emits `library-conflict-runtime-context-missing` when bind settlement lacks context;
- real conflict runtime does not emit `library-conflict-runtime-context-missing` when supplied an empty post-unbind context;
- clean repair-origin bind after the unbind half can pass with supplied context;
- true duplicate edge still blocks;
- true one-active-per-chat conflict still blocks;
- unbind behavior remains unaffected by the bind duplicate-context rule;
- torn-write/retry safety remains covered by the retained `post-apply-binding-hash-mismatch` gate and no ledger consume before successful durable settlement.

## Boundaries

- Conflict runtime was not weakened.
- `requireContext` remains.
- `library-conflict-runtime-context-missing` remains active.
- True duplicate and one-active conflicts still block.
- Decomposed unbind+bind preserved.
- No combined move/replace operation was added.
- No fallback was restored.
- No `allowF7Fallback` or `f15AllowF7Fallback` was added.
- No bare `moveCanonicalChatFolderBinding` repair route was restored.
- No live apply was run.
- Phase A was not run.
- Phase B was not run.
- `binding-mismatch` remains blocked.
- `productSyncReady:false`.
- WebDAV/cloud/relay remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Recommended next step: independent review, then live Phase A retry if approved.
