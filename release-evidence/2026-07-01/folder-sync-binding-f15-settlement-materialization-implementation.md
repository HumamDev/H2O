# Folder Sync Binding F15 Settlement Materialization Implementation

Date: 2026-07-01

## Verdict

F15 binding settled materialization implemented.

## Commit Context

- Binding durable gate implementation: `71616328`
- Busy-aware fence fix: `a2864ad6`
- Rust/writer-authority investigation: `7dd1e069`
- F15-settled repair-write implementation: `ff3ccd44`
- F15 settlement context implementation: `e6a910510551ffd4dfa338d602bb03bb0b06d995`
- F15 settlement one-active projection implementation: `bb4675dc59a05e8158720dd1361d8a06b4cd0ef2`
- F15 settlement materialization preflight: `5dc99e11ca4582e46595c42d6c2f285ed98962aa`

## Root Cause

After `bb4675dc`, live Phase A reached F15 delegation and settlement with `ok:true`, but the controlled apply rejected with `post-apply-binding-hash-mismatch`.

The settlement writer journals the F15 decision but does not materialize the canonical Desktop `folder_bindings` row. The F15 `bindChat` / `unbindChat` branch returned success after delegation, so `canonicalBindingWriteCount:1` represented F15 delegation success rather than an actual `folder_bindings` mutation. The existing post-apply hash gate correctly rejected because the canonical readback still had the old binding hash.

## Fix

`src-surfaces-base/studio/store/folders.tauri.js` now has a dedicated settled-materialization bridge:

- `materializeSettledCanonicalChatFolderBinding(...)`

The helper runs only after F15 delegation and settlement are confirmed:

- `delegationResult.ok === true`
- `delegationResult.settlement.ok === true`
- `delegationResult.settlement.settled === true`

For settled `bind`, it materializes:

- `INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)`

For settled `unbind`, it materializes:

- `DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?`

Move/rebind remains atomic through the `chat_id` primary key and `INSERT OR REPLACE`, after the planned-unbind projection fixed the settlement context. The helper immediately re-reads `listCanonicalChatFolderBindingsForChat(chatId)` and fails closed if the expected canonical edge is not visible or duplicate rows appear.

The helper also fails closed on zero-row materialization, so the handler does not report `canonicalBindingWriteCount:1` for a delegation-only or no-op path.

## Preserved Gate Order

The repair handler remains unchanged:

1. F15 settlement success.
2. Settled materialization in the store.
3. Handler fresh canonical readback.
4. `post-apply-binding-hash-mismatch` if the hash differs.
5. Busy-aware durable gate.
6. Consumed ledger persistence only after materialization, readback, and durable verification succeed.

If settlement fails, materialization does not run. If materialization fails, `bindChat` / `unbindChat` returns falsy, so the handler rejects and consumes no ledger row.

## Proof

The implementation validator proves:

- F15 bind success materializes the requested `folder_bindings` edge.
- F15 unbind success removes the requested `folder_bindings` edge.
- Move uses `INSERT OR REPLACE` / `chat_id` primary key behavior.
- Materialization is reachable only after F15 ok/settled success.
- F15 failure does not materialize.
- Materialization failure does not persist the consumed ledger.
- `post-apply-binding-hash-mismatch` remains before consumed-ledger persistence.
- The durable gate remains after hash verification and before ledger consume.
- `canonicalBindingWriteCount` now corresponds to actual settled materialization visibility, not delegation-only success.
- Duplicate replay remains gated by `bindingRepairAlreadyConsumed` / idempotency and is expected to be zero-write after successful consume.
- Planned-unbind projection remains intact.
- Conflict runtime remains unchanged.
- Settlement writer remains journal-only.
- No fallback strings were added.
- No bare `moveCanonicalChatFolderBinding` repair route was restored.

The validator includes a temp `node:sqlite` harness, with an in-memory fallback, for the `folder_bindings` materialization semantics. Live Phase A was not run in this slice.

## Boundaries

- No live retry was run.
- Phase A was not run.
- Phase B was not run.
- No Desktop Studio reload/restart was performed.
- No fallback was added or restored.
- No Rust file was edited.
- No settlement writer or execute adapter file was edited.
- No WebDAV/cloud/relay/fullBundle.v3 work was started.
- No Chat Saving WebDAV/cloud/archive CAS work was started.
- `binding-mismatch` remains blocked.
- `productSyncReady:false`.
- WebDAV/cloud/relay remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Recommended next step: independent review before live Phase A retry.
