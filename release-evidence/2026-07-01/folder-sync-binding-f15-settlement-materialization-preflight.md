# Folder Sync - Binding F15 Settlement Materialization (Preflight)

Verdict: **BINDING F15 SETTLEMENT MATERIALIZATION FIX DESIGN APPROVED**.

This is design-only preflight. No product source was edited, no live retry was run, no Phase A/Phase B was started,
no binding allowed-set flip was performed, and no fallback was reintroduced. It designs the next fix for the
`post-apply-binding-hash-mismatch` rejection observed on the live Phase A retry after `bb4675dc`.

## Commit Chain

- F15 settlement context implementation: `e6a91051`.
- F15 settlement one-active projection preflight: `b260da0f`.
- F15 settlement one-active projection implementation: `bb4675dc`.

## Live Phase A Result After `bb4675dc`

The F15 route now clears shadow/proposal/handoff/execute/settlement, but the canonical read-back is unchanged:

- `dryRun.status:"dry-run"`.
- `controlledApply.status:"rejected"`, `controlledApply.reason:"post-apply-binding-hash-mismatch"`.
- `controlledApply.canonicalBindingWriteCount:1`, `controlledApply.idempotencyPersisted:false`.
- `f15Delegation.evidencePresent:true`, `f15Delegation.ok:true`.
- `durableGate.fenceInterpretation:"checkpoint-confirmed"`, `durableGate.checkpointBusy:0`, `durableGate.durable:true`.
- `immediateReadbackMatchesRequested:false`, `afterBindingHash` remained the old before-hash.
- duplicate replay also rejected with `post-apply-binding-hash-mismatch`.

The post-apply hash gate correctly rejects and prevents consumed-ledger persistence. It must not be bypassed.

## Source-Grounded Root Cause

The F15 write path settles and journals the binding decision but never materializes the canonical Desktop
`folder_bindings` row, and no other component materializes it either.

1. **The F15 `bindChat`/`unbindChat` path does not write `folder_bindings`.** In
   `src-surfaces-base/studio/store/folders.tauri.js`, `bindChat` (F15 branch) calls
   `delegateF15FolderBindingWrite('bind', ...)` and on `result.ok === true` runs `recordWrite('bindChat.f15')` and
   returns `true` - with no `INSERT OR REPLACE INTO folder_bindings`. The only `folder_bindings` writers in the store are
   the JS canonical writers `moveCanonicalChatFolderBinding` (`INSERT OR REPLACE INTO folder_bindings`),
   `bindChatLegacy` (`INSERT OR REPLACE`), and `unbindChatLegacy` (`DELETE FROM folder_bindings ...`) - none of which
   the F15 path invokes.

2. **The F15 settlement journals; it does not materialize `folder_bindings`.**
   `settleLibraryExecuteEnvelope(...)` validates and calls `appendJournal(...)` (`appendExecuteJournalRow`, a settled
   execute-journal row) and marks side effects (`applyExecuted`/`bindingMutated`/`sqliteSentinelUsed`, `nativeCalled:false`).
   The settlement writer performs no direct `folder_bindings` `INSERT`/`DELETE`.

3. **There is no native/Rust materializer, and no reconcile consumer.** `folder_bindings` is a JS/`plugin:sql`
   table: `apps/studio/desktop/src-tauri/src/lib.rs` only `CREATE TABLE folder_bindings` plus the disabled-by-default
   `f16_folder_bindings_trigger_guard`; the only `folder_bindings`-writing Rust is a test fixture and the guard-config
   command (`f16_configure_folder_bindings_trigger_protection`), neither of which materializes a repair. The derived
   native command name `h2o_library_binding_bind_chat_folder_apply` has no Rust implementation that writes
   `folder_bindings`; the pipeline supplies a simulated `dispatchStatus:'confirmed'` instead of invoking it. No
   execute-journal consumer (including `execute-resume-on-boot`) drains the settled journal into `folder_bindings`.

4. **`canonicalBindingWriteCount:1` counts delegation success, not a row mutation.** In the repair handler
   (`folder-sync.tauri.js`), `writeOk = await folders.bindChat(targetFolderId, chatId, writeOpts)` and
   `writeCount = writeOk ? 1 : 0`; `bindChat` returns `true` on F15 delegation/settlement success. `writeCount` is then
   reported as `canonicalBindingWriteCount`. Because `folder_bindings` was never mutated, the fresh
   `chatFolderBindingCanonicalSnapshot()` read-back hash equals the old hash, so
   `afterHash !== requestedBindingHash` triggers `post-apply-binding-hash-mismatch` - correctly, with zero ledger
   consume.

The gate is behaving correctly. The missing piece is materialization of the settled decision into `folder_bindings`.

## Design Answers

### Q1 - Where should the settled journal become the canonical `folder_bindings` mutation?

Today: nowhere - that is the gap. `folder_bindings` is JS/`plugin:sql`-materialized; the settled decision must be
materialized by the store's existing JS canonical writer (`INSERT OR REPLACE` for bind, `DELETE` for unbind). There is
no native/Rust materializer.

### Q2 - Does an existing materialization/reconcile path consume settled rows into `folder_bindings`?

No. The execute journal (`appendExecuteJournalRow`) is written by settlement/brokers but is not drained back into
`folder_bindings` by any consumer (`execute-resume-on-boot` does not; no Rust command does; no reconcile does).

### Q3 - Synchronous materialize before the hash gate, or invoke a materialization step after settlement?

Synchronously materialize inside the store's F15 `bindChat`/`unbindChat` path, AFTER
`delegateF15FolderBindingWrite(...)` returns `ok:true` and BEFORE `bindChat`/`unbindChat` returns `true`, using the
existing JS canonical writer. The repair handler's existing sequence
(`bindChat` -> fresh read-back -> `post-apply-binding-hash-mismatch` -> busy-aware durable gate -> ledger consume) then
verifies the real materialized state unchanged. The hash gate stays authoritative and is not moved or weakened.

### Q4 - Why `canonicalBindingWriteCount:1` with an unchanged hash?

Because `writeCount = writeOk ? 1 : 0` and `writeOk` is `bindChat(...)` returning `true` on F15 settlement success.
It counts settlement/delegation success, not a `folder_bindings` mutation. No row changed, so the read-back hash stayed
old.

### Q5 - Safest minimal design (settled materialization)

`src-surfaces-base/studio/store/folders.tauri.js` only:

- On F15 **bind** success, materialize `folder_bindings` via the existing canonical writer
  (`INSERT OR REPLACE INTO folder_bindings`, whose `chat_id` PRIMARY KEY makes a move an atomic single-statement
  replace) using the already-supplied settled edge (`writeOpts.expectedCurrentFolderId = previousFolderId || currentFolderId`).
- On F15 **unbind** success, materialize the canonical `DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?`.
- Materialization runs ONLY on F15 success - it is a **settled materialization** of an already-settled decision, so
  `folder_bindings` and the settled journal stay convergent (no divergence, no revert). It is NOT the forbidden
  bare/unsettled write and NOT an F15-failure fallback.
- If materialization fails or its write-verify reports blockers, `bindChat`/`unbindChat` returns falsy so the handler
  safe-fails (`rejected`, zero ledger consume).
- Prefer a dedicated helper (for example `materializeSettledCanonicalChatFolderBinding`) invoked only from the
  F15-success branch, so the forbidden bare `moveCanonicalChatFolderBinding` repair route stays clearly separate.

Explicitly NOT: `allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback` (those are F15-failure fallbacks); a bare
unsettled write; moving/weakening `post-apply-binding-hash-mismatch`; disabling the durable gate; `productSyncReady`;
WebDAV/cloud/relay/`fullBundle.v3`; Chat Saving CAS; Rust edits (Rust is not the materializer).

### Q6 - Edge-case handling

- **Duplicate replay zero-write after a successful apply**: already handled by the handler's early
  `bindingRepairAlreadyConsumed(request)` precheck and the current-canonical-state conflict classifier
  (`already-targeted`/`already-unbound` -> `skipped`, `canonicalBindingWriteCount:0`). Once the first apply materializes
  and consumes the ledger, a replay short-circuits to `skipped` zero-write; the `INSERT OR REPLACE`/`DELETE`
  materialization is itself idempotent. The validator must prove this end-to-end.
- **Torn unbind/bind**: caught by `post-apply-binding-hash-mismatch` (read-back != requested -> `rejected`, zero
  consume) and recovered on retry (unbind skipped, bind-only). For a move, `INSERT OR REPLACE` on the `chat_id` PRIMARY
  KEY replaces atomically, minimizing the torn window.
- **Journal / `folder_bindings` divergence**: prevented by materializing exactly the settled edge; the validator must
  assert the materialized edge equals the settled decision.
- **Materialization failure must not persist the consumed ledger**: materialization failure -> `bindChat` falsy ->
  handler `rejected` BEFORE `bindingRepairRecordConsumed`; the existing gate ordering
  (`post-apply-binding-hash-mismatch` and durable gate before consume) is preserved.

### Q7 - Files likely to change + required validators/evidence

Files: `src-surfaces-base/studio/store/folders.tauri.js` only (F15 `bindChat`/`unbindChat` settled materialization plus
an optional dedicated materialize helper). Not changed: `folder-sync.tauri.js` handler (already reads back and gates),
the settlement writer, the conflict runtime, the execute adapter, and all Rust.

Required validators before live retry:

- **Settled-materialization implementation validator** (behavioral; prefer a `node:sqlite` harness on a temp DB copy
  loading the REAL store adapters, routing `plugin:sql` to `node:sqlite`): F15 bind/unbind success actually mutates
  `folder_bindings` to the requested edge; the handler read-back hash equals `requestedBindingHash`; the
  `post-apply-binding-hash-mismatch` gate passes; the busy-aware durable gate passes; the ledger is consumed;
  `canonicalBindingWriteCount` reflects a real mutation; duplicate replay returns `skipped`/`duplicate` with
  `canonicalBindingWriteCount:0` and an unchanged hash; F15 failure yields no materialization and `rejected` with zero
  consume; materialization failure yields `rejected` with zero consume; a move is atomic via `INSERT OR REPLACE`; and
  the materialized edge equals the settled decision (no divergence).
- **Static anchors**: materialization only in the F15-success branch; no `allowF7Fallback`/`f15AllowF7Fallback`/
  `explicitF7Fallback`; no bare/unsettled `moveCanonicalChatFolderBinding` as the primary repair write;
  `post-apply-binding-hash-mismatch` and the busy-aware durable gate remain and stay ordered before ledger consume; no
  settlement-writer/conflict-runtime/execute-adapter/Rust change.
- **Regression battery**: the one-active projection implementation/preflight, settlement-context implementation/preflight,
  settlement-blocked, enrichment, proposal-blocked, F15 settled repair-write implementation/preflight, rust-writer
  investigation, busy-aware fence, durable gate, binding-mismatch repair, productSyncReady recheck, Chat Saving
  archive-cloud boundary, and F21-F26 binding validators.

Required evidence: `release-evidence/2026-07-01/folder-sync-binding-f15-settlement-materialization-implementation.md`.

## Live Phase A Success Conditions After The Fix

- Dry-run passes (0 canonical write, hash unchanged, `idempotencyPersisted !== true`).
- Controlled apply reaches F15 delegation; `f15Delegation.ok:true`.
- `shadow.ok:true`, `proposal.generated:true`, `handoff.ok:true`, `execute.ok:true`, settlement `ok:true`/`settled:true`.
- `afterBindingHash` equals `requestedBindingHash`; `immediateReadbackMatchesRequested:true`.
- `controlledApply.status:"applied"`; `canonicalBindingWriteCount:1` now reflecting a real `folder_bindings` mutation.
- Busy-aware durable gate passes (`durable:true`, `checkpointBusy:0`, no `persistence-verification-failure`).
- `idempotencyPersisted:true`.
- Duplicate replay returns `skipped`/`duplicate` with `canonicalBindingWriteCount:0` and an unchanged hash.
- No Phase B until Phase A passes.

## NO-GO Conditions

- Any bypass, move, or weakening of `post-apply-binding-hash-mismatch`.
- Disabling or weakening the busy-aware durable gate.
- `allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback`, or a bare/unsettled `moveCanonicalChatFolderBinding`
  repair write.
- Silent divergence between the settled journal and `folder_bindings`, or materializing an edge that does not equal the
  settled decision.
- Persisting the consumed ledger when materialization failed.
- Rust edits (Rust is not the canonical materializer), `productSyncReady` flip, `binding-mismatch` unblocked,
  WebDAV/cloud/relay/`fullBundle.v3`, or Chat Saving CAS drift.
- Running Phase B before Phase A passes.

## Boundaries Held (design preserves)

- F15 settled route preserved (`useF15FolderBindingDelegation: true`); materialization applies only the settled edge.
- canonicalizer/preflight/diagnostics/privacy rules preserved.
- binding duplicate / one-active conflict runtime preserved.
- `post-apply-binding-hash-mismatch` gate preserved and authoritative.
- busy-aware durable gate preserved.
- no fallback.
- `binding-mismatch` remains blocked.
- `productSyncReady` remains false.
- WebDAV/cloud/relay remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Implement the single-file settled materialization in `folders.tauri.js` with the settled-materialization validator +
implementation evidence, run the full battery, and get independent review before any live Phase A retry.
