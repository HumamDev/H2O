# Folder Sync - Binding F15 Live Phase A Settlement Blocked

Verdict: **BINDING F15 LIVE PHASE A BLOCKED AT SETTLEMENT CONTEXT**.

This is design-only evidence and preflight. No product source was edited, no live retry was run, no Phase B was
started, no binding allowed-set flip was performed, and no fallback was reintroduced. This slice records that after the
canonical-row shadow regression fix the F15-settled repair now clears shadow, proposal, handoff, and execute-envelope
generation, and fails only at settlement because the settlement conflict runtime is not given existing binding context
for its duplicate/conflict checks.

## Commit Chain

- Binding durable gate implementation: `71616328`.
- Busy-aware fence fix: `a2864ad6`.
- Rust/writer-authority investigation: `7dd1e069`.
- F15-settled repair-write preflight: `44151f14`.
- F15-settled repair-write implementation: `ff3ccd44`.
- F15 live Phase A proposal blocker evidence: `0b015cc7`.
- F15 canonical-row enrichment implementation: `501635ae`.
- F15 canonical-row shadow regression fix: `0833d4a1`.

## Live Phase A Dry-Run

The live Desktop Phase A dry-run reached the binding repair handler and passed as a dry-run:

- `schema:"h2o.studio.folder-sync.binding-f15-settled-live-proof.v1"`.
- `phase:"A-dry-run+controlled-apply+immediate-readback (same-session)"`.
- `candidateFound:true`.
- `validate.ok:true`.
- `dryRun.status:"dry-run"`.
- `dryRun.reason:"dry-run-binding-repair-plan-ready"`.
- `dryRun.canonicalBindingWriteCount:0`.
- `dryRun.idempotencyPersisted:false`.
- `dryRun.bindingHashUnchanged:true`.

## Live Phase A Controlled Apply Result

The controlled apply did not apply:

- `controlledApply.status:"rejected"`.
- `controlledApply.reason:"canonical-binding-bind-failed"`.
- `controlledApply.canonicalBindingWriteCount:0`.
- `controlledApply.idempotencyPersisted:false`.
- `afterBindingHash` remained the old hash.
- `immediateReadbackMatchesRequested:false`.
- `duplicateReplayZeroWrite:false` because the first apply never succeeded.

No canonical binding write landed. No consumed ledger row was inserted for this attempt. Phase B/reload proof must not
run because Phase A did not apply.

## F15 Delegation Blocker Capture v2

The live diagnostic capture proved the repair reached F15 delegation and this time failed at settlement, not proposal:

- `schema:"h2o.studio.folder-sync.f15-delegation-blocker-capture.v2"`.
- `diagnosticOnly:true`.
- `evidencePresent:true`.
- `ok:false`.
- `blockerCount:1`.
- `blockers:["f15-folder-binding-settlement-failed"]`.

## Progress Since 0833d4a1 (shadow → execute all pass)

The F15-settled pipeline now advances through every step up to settlement:

- `shadow.ok:true`.
- `shadow.blockers:[]`.
- `proposal.ok:true`.
- `proposal.status:"generated"`.
- `proposal.generated:true`.
- `proposal.preflight.ok:true`.
- `proposal.preflight.actionable:true`.
- `proposal.blockers:[]`.
- `handoff.ok:true`.
- `handoff.handoffReady:true`.
- `execute.ok:true`.
- execute envelope built.
- native command: `h2o_library_binding_bind_chat_folder_apply`.

## Actual Blocker (settlement conflict-runtime context)

The failure is isolated to settlement:

- `settlement.ok:false`.
- `settlement.settled:false`.
- `settlement.blockers:["library-conflict-runtime-context-missing"]`.
- `settlement.conflictRuntime.ok:false`.
- `settlement.conflictRuntime.conflictFree:false`.
- `settlement.conflictRuntime.mode:"settlement"`.
- `settlement.conflictRuntime.operation:"bind"`.
- `settlement.conflictRuntime.decisions` includes:
  - `rule:"binding-duplicate-context"`.
  - `status:"warning"`.
  - `code:"library-conflict-runtime-context-missing"`.
  - `outcome:"existing binding context missing"`.
- `settlement.conflictRuntimeSummary.blockerCount:1`.

The `sideEffectSummary` confirms nothing mutated:

- `bindingMutated:false`.
- `catalogMutated:false`.
- `storageWritten:false`.
- `consumedOperationWritten:false`.
- `applyExecuted:false`.
- `nativeCalled:false`.

## Interpretation

The previous proposal blocker (`0b015cc7`) is fixed. The F15-settled path now reaches settlement. The new failure is a
settlement conflict-runtime context gap: F15 needs existing binding context for its duplicate/one-active checks at
settlement time, and the pipeline does not supply it to the settlement call.

This is not a silent no-op, not a bare `moveCanonicalChatFolderBinding` fallback, and not a conflict-runtime defect.
The conflict runtime is correctly requiring context; the pipeline simply fails to thread that context into settlement.

## Root Cause (source-grounded)

The context that reaches the proposal/preflight is not threaded into settlement.

- `buildF15FolderBindingDelegationInput(...)` (in `src-surfaces-base/studio/store/folders.tauri.js`) builds a delegation
  `input` that carries `existingBindings: siblingBindings` and `siblingBindings`. That `input` flows to the proposal
  step, and `resolveDiagnostics` in `library-binding-preflight.tauri.js` threads `siblingBindings` into the diagnostics
  for the `bind` operation. So proposal/preflight received sibling context (that is why proposal now passes).
- Settlement is a separate call. `runF15FolderBindingDelegationPipeline(...)` invokes
  `sync.settleLibraryExecuteEnvelope({ envelope: execute.envelope, receipt: receipt, dispatchResult: {...}, observedAtIso: input.observedAtIso })`.
  This call omits `existingBindings` / `siblingBindings` / `existingSubjects`.
- In `src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js`, `settlementConflictInput(args)`
  builds the conflict-runtime input with `mode:'settlement'`, `requireContext:true`, and only sets `input.existingBindings`
  when `Object.prototype.hasOwnProperty.call(args, 'existingBindings')` or `... 'siblingBindings')` is true — i.e. it reads
  existing-binding context from the settlement `args`, never from the execute envelope. Because the pipeline's settle
  `args` has no such key, `input.existingBindings` is never set.
- In `src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js`, `supplied(input, key)` is presence-only
  (`hasOwnProperty`). For `operation:'bind'`, `inspectBindingDuplicateAndOneActive` sees neither `existingBindings` nor
  `existingSubjects` supplied and emits `binding-duplicate-context` `warning` with code
  `library-conflict-runtime-context-missing` and outcome `existing binding context missing`.
- `evaluateSettlementConflict` promotes that `library-conflict-runtime-context-missing` warning to a hard blocker, so
  `settlement.ok:false` / `settled:false`, and the pipeline returns `f15-folder-binding-settlement-failed`.
- The repair handler then safe-fails: `controlledApply.status:"rejected"`, `reason:"canonical-binding-bind-failed"`,
  zero canonical write, zero ledger consume, `idempotencyPersisted:false`, and no native call.

Because `supplied()` is presence-only, threading the context key into the settle args (with a real existing-binding
list) is sufficient to satisfy `requireContext` and let the duplicate/one-active checks run on real data.

## Source Areas Inspected

`src-surfaces-base/studio/store/folders.tauri.js`:

- `delegateF15FolderBindingWrite`
- `buildF15FolderBindingDelegationInput`
- `runF15FolderBindingDelegationPipeline`
- `settleLibraryExecuteEnvelope` call args
- existing/sibling binding context supplied to proposal vs settlement
- `listForChat`

F15 settlement / conflict-runtime source:

- `src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js`
  - `settlementConflictInput`
  - `evaluateSettlementConflict`
  - `mode: 'settlement'` / `requireContext: true`
  - `existingBindings` / `siblingBindings` `hasOwnProperty` gate
- `src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js`
  - `evaluateLibraryBindingRuntimeConflict`
  - `inspectBindingDuplicateAndOneActive`
  - `binding-duplicate-context`
  - `library-conflict-runtime-context-missing`
  - `supplied` (presence-only)
  - `collectBindings`
- `src-surfaces-base/studio/sync/execute/adapters/library-binding-execute-adapter.tauri.js`
  - native command `h2o_library_binding_bind_chat_folder_apply`

## Fix Direction Preflight

Recommended next step: **settlement conflict-runtime context fix design**.

The safest source-fix direction is to carry existing binding context into settlement, not to relax the conflict runtime:

1. Thread existing/sibling binding context into the `settleLibraryExecuteEnvelope({...})` call in
   `runF15FolderBindingDelegationPipeline`, sourced from the same canonical/sibling context already computed in
   `buildF15FolderBindingDelegationInput` (`input.existingBindings` / `input.siblingBindings`), so proposal and
   settlement see symmetric context.
2. Prefer materializing the real current bindings for the chat (for example via the store's `listForChat(chatId)`) and
   passing them as `existingBindings`, so the settlement duplicate/one-active check runs on real data instead of a
   present-but-empty list.
3. For the repair rebind, which decomposes into `unbind(old)` + `bind(new)`, link the bind-half settlement to the
   post-unbind state so the existing-binding context reflects the removed old edge and no false one-active-per-chat
   conflict is raised.
4. Consider a dedicated settled rebind operation only if settlement cannot validate the `bind` half alone safely with
   linked existing-binding context.

Rejected fix directions:

- Do not add `allowF7Fallback` or `f15AllowF7Fallback`.
- Do not restore a bare `moveCanonicalChatFolderBinding` repair route.
- Do not weaken the conflict runtime.
- Do not disable `requireContext` or suppress the `library-conflict-runtime-context-missing` warning.
- Do not run Phase B or reload proof until Phase A applies.
- Do not perform a binding allowed-set flip.

## Boundaries Held

- No canonical binding write landed.
- No ledger consume happened.
- No live retry happened in this slice.
- No Phase B was run.
- No fallback was reintroduced.
- Conflict runtime must not be weakened.
- `binding-mismatch` remains blocked.
- `productSyncReady:false`.
- WebDAV/cloud/relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.

## Next Step

Prepare a settlement conflict-runtime context fix design that proves exactly how existing/sibling binding context is
threaded into the F15 settlement call for a repair-origin bind/rebind, then get review before any product-source
implementation or live retry.
