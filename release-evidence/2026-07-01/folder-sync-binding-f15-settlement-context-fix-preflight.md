# Folder Sync - Binding F15 Settlement Conflict-Runtime Context Fix (Preflight)

Verdict: **BINDING F15 SETTLEMENT CONTEXT FIX DESIGN APPROVED**.

This is design-only preflight. No product source was edited, no live retry was run, no Phase A/Phase B was started,
no binding allowed-set flip was performed, and no fallback was reintroduced. It designs the fix for the settlement
conflict-runtime context gap recorded in `8b5e13d0`, to be implemented and reviewed as a separate slice.

## Commit Chain

- F15-settled repair-write implementation: `ff3ccd44`.
- F15 live Phase A proposal blocker evidence: `0b015cc7`.
- F15 canonical-row enrichment implementation: `501635ae`.
- F15 canonical-row shadow regression fix: `0833d4a1`.
- F15 live Phase A settlement blocker evidence: `8b5e13d0`.

## Root Cause Summary

Existing binding context reaches the proposal/preflight but is dropped before settlement:

- `buildF15FolderBindingDelegationInput(...)` carries `existingBindings` / `siblingBindings` on the delegation input,
  and `resolveDiagnostics` threads `siblingBindings` into the proposal diagnostics for `bind` (that is why proposal now
  passes).
- Settlement is a separate call. `runF15FolderBindingDelegationPipeline(...)` calls
  `settleLibraryExecuteEnvelope({ envelope, receipt, dispatchResult, observedAtIso })` and omits
  `existingBindings` / `siblingBindings` / `existingSubjects`.
- `settlementConflictInput(args)` sets `input.existingBindings` only when the settle `args` has that key
  (`hasOwnProperty.call(args, 'existingBindings')` or `... 'siblingBindings')`), with `mode: 'settlement'` and
  `requireContext: true`. It reads existing-binding context from `args`, never from the execute envelope.
- `supplied(input, key)` in the conflict runtime is presence-only (`hasOwnProperty`). For `operation:'bind'`,
  `inspectBindingDuplicateAndOneActive` sees neither key supplied and emits `binding-duplicate-context` `warning`
  with code `library-conflict-runtime-context-missing`, which settlement promotes to a hard blocker.

The conflict runtime is correct; context is simply not threaded into settlement.

## Design Answers

### 1. Where should existing binding context be sourced?

A **fresh canonical read immediately before settlement**, not the pre-computed `siblingBindings`.

- Read the chat's current canonical folder bindings with `listCanonicalChatFolderBindingsForChat(chatId)`.
- Map each raw `folder_id` into the conflict runtime's hashed subject-id space with the same hashing the delegation
  input already uses: `hashLegacyEndpoint('folder.metadata', folderId)` for the folder endpoint, and
  `input.canonicalBinding.leftSubjectId` (the already-canonical chat subject hash) for the chat endpoint.
- Emit each existing binding as `{ bindingKind: 'chat-folder', bindingState: 'bound', leftSubjectId: <chatSubjectId>,
  rightSubjectId: <folderSubjectId>, leftSubjectType: 'chat.metadata', rightSubjectType: 'folder.metadata' }`.

A fresh read is required because the rebind decomposition runs the `unbind` half fully before the `bind` half. The
`bind` half must observe the **post-unbind** state (old edge removed). The pre-computed `siblingBindings` is empty for
repair-origin writes and, if it carried the pre-unbind edge, would falsely trip `binding-one-active-per-chat`. Reading
real state is not a weakening: a genuine move yields an empty active set for the chat (conflict-free), while a true
duplicate or one-active-per-chat conflict is still surfaced and blocked.

### 2. Pass into settle args, or embed in the execute envelope?

Pass **directly into the `settleLibraryExecuteEnvelope` args** as `existingBindings`. This is the minimal change:
`settlementConflictInput(args)` already reads `args.existingBindings || args.siblingBindings`. Embedding the context in
`execute.envelope.payloadShapes` / `settlementShapes` would require changing the execute-envelope shaper and
`settlementConflictInput`, enlarging the surface for no benefit.

### 3. Should settlementConflictInput read from args only, or also envelope.settlementContext?

**Args-only is sufficient.** No change to `settlementConflictInput` is required, so its `requireContext` / `mode:
'settlement'` behavior stays intact. An `envelope.settlementContext` read is an optional future hardening and is
explicitly out of scope for this fix.

### 4. Repair-origin rebind

- **Keep the decomposed `unbind` + `bind`.** A dedicated combined settled rebind/move is **unsafe**: the conflict
  runtime `inspectBindingReplacement` blocks `move`/`replace` operations with `replacement must remain independent
  unbind plus bind`. Introducing a combined move op would be rejected by the runtime by design.
- **The bind settlement needs post-unbind context.** `binding-one-active-per-chat` blocks a `bind` when an existing
  bound binding has the same chat and a different folder. So the `bind` half must see the state after the `unbind` half
  has removed the old edge.
- **Link old unbind + new bind** by shared lineage/`observedAtIso` and by having each half read its own fresh per-half
  context at settle time (the `unbind` half naturally sees the old edge bound; the `bind` half sees it removed).
- **Bind-alone false duplicate:** avoided precisely because context is read fresh post-unbind; passing stale pre-unbind
  context is the failure mode being fixed, not introduced.

### 5. Minimal safe implementation plan

Single-file JS change in `src-surfaces-base/studio/store/folders.tauri.js`:

1. Add a helper `buildF15SettlementExistingBindingContext(chatId, chatSubjectId, opts)` that reads
   `listCanonicalChatFolderBindingsForChat(chatId)`, hashes each `folder_id` via `hashLegacyEndpoint('folder.metadata',
   folderId)`, and returns the hashed existing-binding array (possibly empty).
2. In `runF15FolderBindingDelegationPipeline(...)`, immediately before `settleLibraryExecuteEnvelope(...)`, compute
   `existingBindings` via the helper (using `input.canonicalBinding.leftSubjectId` as the chat subject) and add
   `existingBindings: <array>` to the settle args. No other settle arg changes.
3. Do not touch `settlementConflictInput`, the conflict runtime, the execute-envelope shaper, the canonicalizer,
   preflight, diagnostics, privacy kernel, the busy-aware durable gate, or the `post-apply-binding-hash-mismatch` gate.

### 6. Required validators before live retry

- **Settlement context implementation validator**
  (`validate-folder-sync-binding-f15-settlement-context-fix-implementation.mjs`): a behavioral harness loading the real
  conflict runtime + settlement writer extension that proves: a `bind` settlement supplied threaded `existingBindings`
  is `conflictFree` with no `library-conflict-runtime-context-missing`; a genuine move (post-unbind empty context)
  settles; a **true** duplicate edge and a **true** `binding-one-active-per-chat` are still blocked (runtime not
  weakened); the `unbind` half is unaffected; and static anchors confirm the pipeline threads `existingBindings` into
  the settle args and `settlementConflictInput` / `requireContext` are unchanged.
- **Rebind torn-write recovery validator**: proves that if the `bind` half fails after the `unbind` half commits, the
  repair handler's `post-apply-binding-hash-mismatch` gate returns `rejected` with no ledger consume, and a retry
  (unbind skipped, bind-only) recovers — no silent partial state.
- **Regression battery**: re-run the enrichment, shadow-fix, settlement-blocked, F15 settled repair-write
  implementation/preflight, rust-writer investigation, busy-aware fence, durable gate, binding-mismatch repair,
  productSyncReady recheck, Chat Saving archive-cloud boundary, and F21-F26 binding validators.

### 7. Live Phase A success conditions after the fix

- Dry-run passes (0 canonical write, hash unchanged, `idempotencyPersisted !== true`).
- Controlled apply reaches F15 delegation (`f15Delegation.evidencePresent:true`).
- `shadow.ok:true`, `proposal.generated:true`, `handoff.ok:true`, `execute.ok:true`.
- `settlement.ok:true`, `settlement.settled:true`, no `library-conflict-runtime-context-missing`.
- `f15Delegation.ok:true`.
- No `f15-folder-binding-shadow-failed`, `-proposal-failed`, `-settlement-failed`.
- `controlledApply.status:"applied"`.
- Immediate same-session readback equals the requested binding hash.
- Busy-aware durable gate passes (no `persistence-verification-failure`).
- Duplicate replay (same idempotencyKey) is zero-write.
- No Phase B until Phase A passes.

## Files Likely To Change

- `src-surfaces-base/studio/store/folders.tauri.js` (only).

Not changed: `execute-settlement-writer-library-extension.tauri.js`, `library-conflict-runtime.tauri.js`,
`library-binding-*` canonicalizer/preflight/diagnostics, the privacy kernel, `folder-sync.tauri.js` repair handler,
and all Rust.

## Recommended Source-Fix Approach

Thread a freshly-read, hashed existing-binding context for the chat into the `settleLibraryExecuteEnvelope` args inside
`runF15FolderBindingDelegationPipeline`, sourced from `listCanonicalChatFolderBindingsForChat` + `hashLegacyEndpoint`.
Preserve the decomposed unbind+bind, the presence-only conflict runtime, `requireContext`, and every existing gate.

## Exact Implementation Steps For Codex

1. In `folders.tauri.js`, add `async function buildF15SettlementExistingBindingContext(chatId, chatSubjectId, opts)`
   that reads `listCanonicalChatFolderBindingsForChat(chatId)`, maps each row's `folderId` via
   `hashLegacyEndpoint('folder.metadata', folderId)`, and returns hashed `chat-folder` `bound` binding objects
   (`leftSubjectId: chatSubjectId`, `rightSubjectId: folderSubjectId`). Return `[]` when there are none.
2. In `runF15FolderBindingDelegationPipeline`, after `execute` succeeds and before `settleLibraryExecuteEnvelope`,
   compute `var settleExistingBindings = await buildF15SettlementExistingBindingContext(chatId,
   input.canonicalBinding && input.canonicalBinding.leftSubjectId, opts);` and add
   `existingBindings: settleExistingBindings` to the settle args object.
3. Do not alter any other settle arg, `settlementConflictInput`, the conflict runtime, the envelope shaper, or any gate.
4. Add the settlement context implementation validator and the rebind torn-write recovery validator, and an
   implementation evidence file `release-evidence/2026-07-01/folder-sync-binding-f15-settlement-context-fix-implementation.md`.
5. Run the full battery, then request independent review before any live Phase A retry.

## Rejected / NO-GO Directions

- Do not add `allowF7Fallback` or `f15AllowF7Fallback`.
- Do not restore a bare `moveCanonicalChatFolderBinding` repair route.
- Do not weaken the conflict runtime.
- Do not disable `requireContext`.
- Do not suppress `library-conflict-runtime-context-missing`.
- Do not fabricate an empty `existingBindings` to force a pass; read real canonical state.
- Do not introduce a combined settled move/replace op (blocked by `inspectBindingReplacement`).
- Do not run Phase B or reload proof until Phase A applies.
- Do not perform a binding allowed-set flip.

## Boundaries Held (design preserves)

- F15 settled route preserved (`useF15FolderBindingDelegation: true`).
- canonicalizer/preflight/diagnostics/privacy rules preserved.
- binding duplicate / one-active conflict runtime preserved.
- busy-aware durable gate preserved.
- `post-apply-binding-hash-mismatch` gate preserved.
- no fallback.
- `binding-mismatch` remains blocked.
- `productSyncReady` remains false.
- WebDAV/cloud/relay remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Implement the single-file fix in `folders.tauri.js` with the two new validators + implementation evidence, run the full
battery, and get independent review before any live Phase A retry.
