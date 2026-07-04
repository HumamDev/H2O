# Folder Sync - Binding F15 Settlement One-Active-Per-Chat (Preflight)

Verdict: **BINDING F15 SETTLEMENT ONE-ACTIVE PROJECTION FIX DESIGN APPROVED**.

This is design-only preflight. No product source was edited, no live retry was run, no Phase A/Phase B was started,
no binding allowed-set flip was performed, and no fallback was reintroduced. It designs the next fix for the settlement
`binding-one-active-per-chat` blocker observed on the live Phase A retry after `e6a91051`.

## Commit Chain

- F15-settled repair-write implementation: `ff3ccd44`.
- F15 live Phase A proposal blocker evidence: `0b015cc7`.
- F15 canonical-row enrichment implementation: `501635ae`.
- F15 canonical-row shadow regression fix: `0833d4a1`.
- F15 live Phase A settlement blocker evidence: `8b5e13d0`.
- F15 settlement context fix design preflight: `08527e9d`.
- F15 settlement context implementation: `e6a91051`.

## Live Phase A Result After `e6a91051`

- Dry-run passed.
- Controlled apply rejected with `canonical-binding-bind-failed`.
- `shadow.ok:true`, `proposal.ok:true`, `proposal.generated:true`, `handoff.ok:true`, `execute.ok:true`.
- Settlement failed:
  - `settlement.ok:false`, `settlement.settled:false`.
  - `settlement.blockers:["library-binding-cross-install-state-conflict"]`.
  - `conflictRuntime.mode:"settlement"`, `conflictRuntime.operation:"bind"`.
  - decision rule `binding-one-active-per-chat`, outcome `one active binding per chat rule violated`.
  - warning `library-conflict-refresh-required`.
- The previous blocker is gone: `contextMissing:false`, no `library-conflict-runtime-context-missing`, no
  `f15-folder-binding-settlement-context-failed`.
- Execute is preview/receipt: `execute.sideEffectSummary.nativeCalled:false`,
  `execute.sideEffectSummary.applyExecuted:false`, warnings include `receipt-preview-only`.
- Settlement side effects: `bindingMutated:false`, `nativeCalled:false`, `applyExecuted:false` (blocked before apply).

## Source-Grounded Root Cause

The context threading from `e6a91051` works; its design assumption was wrong.

1. **The repair-origin move is decomposed into unbind + bind.** `delegateF15FolderBindingWrite('bind', folderId,
   chatId, opts)` reads the chat's current folder via `listForChat(chatId)`, and when a different
   `previousFolderId` is present it first runs `delegateF15FolderBindingWrite('unbind', previousFolderId, chatId,
   { skipRebindDecompose: true })`, then runs `runF15FolderBindingDelegationPipeline('bind', folderId, chatId, opts)`.

2. **The F15 settlement journals a settled intent; it does not synchronously mutate `folder_bindings`.**
   `settleLibraryExecuteEnvelope(...)` validates and calls `appendJournal(...)` (a settled execute-journal row) and, on
   success, marks `applyExecuted`/`bindingMutated`/`sqliteSentinelUsed` on the settlement side-effect sentinel with
   `nativeCalled:false`. There is no `DELETE`/`INSERT` of `folder_bindings` in the settlement writer. Execute is
   preview/receipt (`nativeCalled:false`, `receipt-preview-only`). So the unbind-half journals the unbind intent; it does
   not remove the `chat -> previousFolder` row from `folder_bindings` before the bind-half runs.

3. **The bind-half settlement context is a fresh read of the still-current canonical state.**
   `buildF15SettlementExistingBindingContext(chatId, chatSubjectId, ...)` (added in `e6a91051`) reads
   `listCanonicalChatFolderBindingsForChat(chatId)` from the `folder_bindings` table. Because the unbind was only
   journaled (not materialized), that read still returns `chat -> previousFolder`.

4. **The conflict runtime correctly blocks.** The bind-half candidate is `chat -> newFolder`. The existing context has
   `chat -> previousFolder` (same chat, different folder, `bound`), so `binding-one-active-per-chat` fires
   (`library-binding-cross-install-state-conflict`), settlement blocks, nothing mutates, and the handler rejects with
   `canonical-binding-bind-failed`, no ledger consume.

Note: `listForChat` (`SELECT folder_id FROM folder_bindings WHERE chat_id = ?`) and
`listCanonicalChatFolderBindingsForChat` (`SELECT ... FROM folder_bindings b ... WHERE b.chat_id = ?`) read the SAME
`folder_bindings` table, so this is not a split-source bug: the decomposition and the settlement context observe the
same state, and that state still contains the move's source edge at bind-half settlement time.

## Design Answers

### Q1 - Is the move decomposed into unbind + bind?

Yes (`delegateF15FolderBindingWrite`, lines around the `skipRebindDecompose` branch).

### Q2 - Is execute preview/receipt-only before settlement?

Yes. Execute builds a receipt/envelope (`receipt-preview-only`, `nativeCalled:false`), and the settlement `appendJournal`
records a settled journal row without synchronously mutating `folder_bindings`.

### Q3 - Where is `existingBindings` computed for settlement after `e6a91051`?

In `buildF15SettlementExistingBindingContext(...)` (fresh `listCanonicalChatFolderBindingsForChat` read), threaded into
`settleLibraryExecuteEnvelope(...)` as `existingBindings: settlementExistingBindings` inside
`runF15FolderBindingDelegationPipeline`.

### Q4 - What state does the settlement conflict runtime expect?

For the bind-half of a validated repair-origin move it must evaluate against the **post-planned-transition** state (the
move's `chat -> previousFolder` edge already unbound), not the raw current live state. Today it receives the raw current
live state, which is why the still-present source edge trips `binding-one-active-per-chat`.

### Q5 - Safe design for move/rebind

Project the planned unbind: for the bind-half, exclude **only** the exact `chat -> previousFolder` edge being moved from
the fresh canonical read used to build `existingBindings`. This:

- does not fabricate empty context broadly (only the single planned-unbind edge is projected out);
- does not suppress `binding-one-active-per-chat` (the rule still runs, against the projected state);
- still blocks a true duplicate edge (`chat -> newFolder` already present is not excluded);
- still blocks a true one-active conflict (`chat -> anyOtherFolder` that is not the move source is not excluded).

### Q6 - Fix location

`src-surfaces-base/studio/store/folders.tauri.js` only. The settlement writer already threads `args.existingBindings`,
and the conflict runtime already evaluates correctly; neither changes. No execute-adapter change.

### Q7 - Model choice

Approved: **A + B** - a settlement `existingBindings` projection inside `runF15FolderBindingDelegationPipeline` (A),
driven by an explicit planned-transition previous edge threaded from the decomposition (B).

- Not C (settle unbind before bind): the decomposition already runs unbind first, but the F15 settlement journals rather
  than materializes, so the removal is not visible to the bind-half read; forcing a real `folder_bindings` delete
  mid-delegation adds torn-write risk and touches the settlement/materialization mechanism.
- Not D (dedicated combined settled-rebind): the conflict runtime `inspectBindingReplacement` blocks `move`/`replace`
  (`replacement must remain independent unbind plus bind`).

## Recommended Source-Fix Approach

In `folders.tauri.js` only:

1. `delegateF15FolderBindingWrite` threads its computed `previousFolderId` into the bind-half pipeline opts (for example
   `plannedUnbindFolderId`) when it decomposes a move.
2. `buildF15SettlementExistingBindingContext(chatId, chatSubjectId, opts)` accepts the planned-unbind folder and, for a
   `bind`, excludes the single edge whose `rightSubjectId === hashLegacyEndpoint('folder.metadata',
   plannedUnbindFolderId)` and `leftSubjectId === chatSubjectId` from the fresh canonical read.
3. Guard the projection: only exclude when `plannedUnbindFolderId` is present and is a real current edge for the chat;
   if the repair request declares `previousFolderId`, cross-check it and fail closed (do not project, let
   `binding-one-active-per-chat` block) on mismatch. Never fabricate empty context.
4. Change nothing in the settlement writer, conflict runtime, execute adapter, canonicalizer/preflight/diagnostics,
   privacy kernel, the busy-aware durable gate, or the `post-apply-binding-hash-mismatch` gate.

## Open Design Questions For The Implementer

1. Confirm the materialization path: where/when the settled journal is applied to `folder_bindings` (the real
   unbind delete + bind insert), and ensure a move's unbind+bind materialize atomically or that the
   `post-apply-binding-hash-mismatch` gate catches a torn end state and the repair is retry-safe.
2. Prefer deriving `previousFolderId` from the decomposition's detected current edge; cross-check the repair request's
   declared `previousFolderId` when present; fail closed on mismatch.

## Required Validators Before Live Retry

- **One-active projection implementation validator**: a behavioral harness loading the real conflict runtime proving a
  bind-half with the planned-unbind edge projected out is `conflictFree`; a genuine move passes; a **true** duplicate
  edge (`chat -> newFolder`) still blocks; a **true** one-active conflict (`chat -> otherFolder`, not the move source)
  still blocks; unbind unaffected; plus static anchors that the decomposition threads `plannedUnbindFolderId`, the
  context builder excludes only the exact previous edge, no empty-context fabrication, and `requireContext` is intact.
- **Rebind torn-write recovery validator**: a torn move (unbind materialized, bind fails) is caught by
  `post-apply-binding-hash-mismatch` (rejected, no ledger consume) and recovered on retry.
- **Regression battery**: enrichment, shadow-fix, settlement-blocked, settlement-context-fix, F15 settled repair-write
  implementation/preflight, rust-writer investigation, busy-aware fence, durable gate, binding-mismatch repair,
  productSyncReady recheck, Chat Saving archive-cloud boundary, F21-F26 binding validators.

## Live Phase A Success Conditions After The Fix

- Dry-run passes (0 canonical write, hash unchanged, `idempotencyPersisted !== true`).
- Controlled apply reaches F15 delegation (`f15Delegation.evidencePresent:true`).
- `shadow.ok:true`, `proposal.generated:true`, `handoff.ok:true`, `execute.ok:true`.
- `settlement.ok:true`, `settlement.settled:true`, no `library-binding-cross-install-state-conflict`, no
  `binding-one-active-per-chat` false block, no `library-conflict-runtime-context-missing`.
- `f15Delegation.ok:true`.
- `controlledApply.status:"applied"`.
- Immediate same-session readback equals the requested binding hash.
- Busy-aware durable gate passes (no `persistence-verification-failure`).
- Duplicate replay (same idempotencyKey) is zero-write.
- No Phase B until Phase A passes.

## NO-GO Conditions

- Any F15 blocker, or `binding-one-active-per-chat` still blocking a legitimate validated move.
- A true duplicate edge or a true one-active conflict NOT blocking.
- Settlement context fabricated empty, or `requireContext` disabled, or the context-missing / one-active decision
  suppressed.
- Fallback restored (`allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback`/bare `moveCanonicalChatFolderBinding`).
- `post-apply-binding-hash-mismatch` or busy-aware durable gate weakened.
- `productSyncReady` flip, `binding-mismatch` unblocked, WebDAV/cloud/relay/`fullBundle.v3`, or Chat Saving CAS drift.

## Boundaries Held (design preserves)

- F15 settled route preserved (`useF15FolderBindingDelegation: true`).
- canonicalizer/preflight/diagnostics/privacy rules preserved.
- binding duplicate / one-active conflict runtime preserved (evaluated against the correct projected state, never
  weakened).
- `requireContext` preserved.
- busy-aware durable gate preserved.
- `post-apply-binding-hash-mismatch` gate preserved.
- no fallback.
- `binding-mismatch` remains blocked.
- `productSyncReady` remains false.
- WebDAV/cloud/relay remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Implement the single-file planned-unbind projection in `folders.tauri.js` with the two new validators + implementation
evidence, run the full battery, and get independent review before any live Phase A retry.
