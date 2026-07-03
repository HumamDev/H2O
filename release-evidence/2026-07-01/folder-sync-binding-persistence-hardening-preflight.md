# Folder Sync - Binding Persistence Hardening Preflight

Verdict: **BINDING PERSISTENCE HARDENING PREFLIGHT REQUIRED**.

This is a design-only preflight and source-fix readiness audit. No product source was edited, no live apply was
retried, no binding apply gate was passed, and no `apply:true` request was used in this slice.

## Commit Chain

- Binding repair implementation: `d4d5db19`.
- Binding live dry-run proof: `d139e062`.
- Binding controlled apply proof: `5c89ba95`.
- Binding post-apply readback blocked: `d46f0805`.
- Binding state-source diagnostic: `132002b6`.

## Current Blocker

The binding controlled apply proof reported:

- `controlledApplyReceipt.status:"applied"`.
- `canonicalBindingWriteCount:1`.
- `afterMatchesRequested:true`.
- `beforeChangedAfterApply:true`.
- `idempotencyPersisted:true`.

The later state-source diagnostic proved the controlled apply was not enough for binding readiness:

- `snapshotHash = storeHash = directSqlHash = "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d"`.
- The requested/applied hash from the controlled apply was
  `sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869`.
- `currentEqualsOldBeforeHash:true`.
- `currentEqualsRequestedAppliedHash:false`.
- `consumedBindingRepairRows:1`.

Therefore the blocker is a write-durability / later-revert gap, not a hash-source or read-freshness gap. The
handler already performs a same-session fresh canonical SQLite re-read and checks `afterHash ===
requestedBindingHash` before ledger consume and `applied`. `moveCanonicalChatFolderBinding` already performs
write-visible and 75ms stability checks. Despite that, later `bindingRepair.snapshot()`, direct store read, and
direct SQLite read all show the old before hash.

## Durability Contract

`status:"applied"`, `idempotencyPersisted:true`, and consumed-ledger insertion are only valid after durable
canonical persistence is proven.

Durable canonical persistence means:

1. The canonical binding write is persisted to `sqlite:studio-v1.db` / `folder_bindings`.
2. A fresh canonical readback equals `requestedBindingHash`.
3. The state survives a commit/checkpoint/reopen or equivalent durability fence.
4. The state is not silently reverted by known competing writers.
5. If canonical persistence cannot be proven, the handler must return a persistence-verification failure and must
   not consume the operation.

Consumed ledger row exists, but it is insufficient as canonical persistence proof.

## Required Future Proof Categories

1. Durability harness with close/reopen or equivalent commit/checkpoint fence.
2. Revert-detection proof for competing `folder_bindings` writers.
3. Ledger-contingency proof proving failed or non-durable writes consume no ledger row.
4. Live reload-surviving proof before any binding allowed-set flip.

## Source-Fix Readiness Audit

Inspected product source areas for the later implementation slice:

- `src-surfaces-base/studio/store/folders.tauri.js`
  - `moveCanonicalChatFolderBinding`
  - `bindChat`
  - `bindChatLegacy`
  - `unbindChat`
  - `listCanonicalChatFolderBindings`
  - `sqlExecute`
  - `sqlSelect`
  - `canonicalBindingStoreIdentity`
  - `recordWrite`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  - `applyChatFolderBindingRepairRequest`
  - `chatFolderBindingCanonicalSnapshot`
  - `buildChatFolderBindingRepairReceipt`
  - `bindingRepairRecordConsumed`
  - `bindingRepairAlreadyConsumed`
  - binding request/receipt schema constants
  - binding apply gate
  - `post-apply-binding-hash-mismatch`
- `src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js`
  - reviewed apply path writes `folder_bindings` inside explicit `BEGIN IMMEDIATE` / `COMMIT`.
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
  - import path calls `store.folders.bindChat(...)` for imported folder bindings.
- `apps/studio/desktop/src-tauri/src/lib.rs`
  - `folder_bindings` table and primary key.
  - F16 folder binding trigger protection.
  - SQL plugin registration for `sqlite:studio-v1.db`.

## Competing Writer Inventory

Known source areas that can affect `folder_bindings` and must be accounted for by the later durability/revert
fix:

- `src-surfaces-base/studio/store/folders.tauri.js`
  - `bindChatLegacy` uses `INSERT OR REPLACE INTO folder_bindings`.
  - `unbindChatLegacy` uses `DELETE FROM folder_bindings`.
  - `moveCanonicalChatFolderBinding` uses `INSERT OR REPLACE INTO folder_bindings`.
  - soft-delete/restore flows call `unbindChat` / `bindChat`.
- `src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js`
  - reviewed binding apply uses `INSERT INTO folder_bindings` within a transaction.
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
  - bundle import materializes folder bindings through `store.folders.bindChat`.
- `apps/studio/desktop/src-tauri/src/lib.rs`
  - schema, writer-identity trigger protection, and SQL plugin runtime behavior determine durability boundaries.

## Preferred Future Fix Direction

In `src-surfaces-base/studio/store/folders.tauri.js`:

- Harden `moveCanonicalChatFolderBinding` and related `bindChat` / `unbindChat` paths with a durable
  confirmation result.
- Inspect `sqlExecute` / `sqlSelect` and commit/checkpoint/reopen feasibility.
- Preserve no folder/chat/delete/tombstone/purge mutation beyond the requested binding operation.

In `src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- Keep the existing same-session hash gate.
- Add a durable persistence gate before returning `status:"applied"`.
- Do not report `idempotencyPersisted:true` unless durable persistence is confirmed.
- Do not insert a consumed ledger row unless durable persistence is confirmed.
- Return/reject with `persistence-verification-failure` if durable persistence fails.
- Add detection for consumed ledger rows whose canonical binding state no longer matches the expected hash.
- Add explicit proof that a failed or non-durable canonical write consumes no ledger row.

## Blocks Held

- `binding-mismatch` remains blocked.
- `productSyncReady` remains `false`.
- WebDAV/cloud/relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.
- No binding allowed-set flip is authorized.
- No blind live apply retry is approved.
- No product source change is included in this preflight.

## Next Step

Recommended next step: Codex source-fix implementation preflight, then Claude review before any live retry. The
next implementation must prove durable/reload-surviving canonical persistence and ledger contingency before
binding readiness or any F11/S5 binding allowed-set flip can be reconsidered.
