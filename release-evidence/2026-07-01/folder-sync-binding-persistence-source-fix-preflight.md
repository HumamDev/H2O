# Folder Sync - Binding Persistence Source-Fix Implementation Preflight

Verdict: **BINDING PERSISTENCE SOURCE-FIX PREFLIGHT READY**.

This is an implementation-preflight document only. No product source was edited, no live apply was retried, no
binding apply gate was passed, no `apply:true` request was used, and no binding allowed-set flip was performed in
this slice.

## Commit Chain

- Binding repair implementation: `d4d5db19`.
- Binding live dry-run proof: `d139e062`.
- Binding controlled apply proof: `5c89ba95`.
- Binding post-apply readback blocked: `d46f0805`.
- Binding state-source diagnostic: `132002b6`.
- Binding persistence hardening preflight: `01dc9957`.

## Blocker Summary

The binding controlled apply proof reported `status:"applied"`, `canonicalBindingWriteCount:1`,
`afterMatchesRequested:true`, `beforeChangedAfterApply:true`, and `idempotencyPersisted:true`.

The later post-apply readback and state-source diagnostic showed that durable canonical persistence was not proven:

- Old before hash:
  `sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d`.
- Requested/applied hash:
  `sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869`.
- `snapshotHash = storeHash = directSqlHash = old before hash`.
- `consumedBindingRepairRows:1`.

The current blocker is a durable persistence / later-revert gap. A consumed ledger row is not canonical persistence
proof. Same-session readback is necessary but not sufficient.

## Contract From 01dc9957

`status:"applied"`, `idempotencyPersisted:true`, and consumed-ledger insertion are only valid after durable canonical persistence is proven.

Durable canonical persistence means:

1. The canonical binding write persists to `sqlite:studio-v1.db` / `folder_bindings`.
2. A fresh canonical readback equals `requestedBindingHash`.
3. State survives commit/checkpoint/reopen or an equivalent durability fence.
4. State is not silently reverted by known competing writers.
5. If persistence cannot be proven, the handler returns `persistence-verification-failure` and consumes no
   operation.

## Source Files Inspected

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
- `apps/studio/desktop/src-tauri/src/lib.rs`

## Functions Inspected

`src-surfaces-base/studio/store/folders.tauri.js`:

- `moveCanonicalChatFolderBinding`
- `bindChat`
- `bindChatLegacy`
- `unbindChat`
- `unbindChatLegacy`
- `listCanonicalChatFolderBindings`
- `listCanonicalChatFolderBindingsForChat`
- `getCanonicalChatFolderBindingForChat`
- `sqlExecute`
- `sqlSelect`
- `canonicalBindingStoreIdentity`
- `recordWrite`

`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- `applyChatFolderBindingRepairRequest`
- `chatFolderBindingCanonicalSnapshot`
- `chatFolderBindingHashFromRows`
- `buildChatFolderBindingRepairReceipt`
- `bindingRepairRecordConsumed`
- `bindingRepairAlreadyConsumed`
- `validateChatFolderBindingRepairRequestForDesktopApply`
- binding request schema: `h2o.studio.chat-folder-binding-request.v1`
- binding receipt schema: `h2o.studio.chat-folder-binding-receipt.v1`
- binding apply gate: `folder-sync-chat-folder-binding-repair-apply`
- same-session mismatch reason: `post-apply-binding-hash-mismatch`

`apps/studio/desktop/src-tauri/src/lib.rs`:

- `folder_bindings` table definition.
- `PRIMARY KEY (chat_id)`.
- guarded F16 folder binding trigger protection.
- SQL plugin migration registration for `sqlite:studio-v1.db`.

## Discovered folder_bindings Write Paths

Canonical store path:

- `src-surfaces-base/studio/store/folders.tauri.js`
  - `bindChatLegacy`: `INSERT OR REPLACE INTO folder_bindings`.
  - `unbindChatLegacy`: `DELETE FROM folder_bindings`.
  - `moveCanonicalChatFolderBinding`: `INSERT OR REPLACE INTO folder_bindings`.
  - folder delete/remove flows delete `folder_bindings` for the removed folder.
  - soft-delete/restore flows can call `unbindChat` / `bindChat`.

Binding repair handler path:

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  - `applyChatFolderBindingRepairRequest` writes through `store.folders.unbindChat`,
    `store.folders.bindChat`, or `store.folders.moveCanonicalChatFolderBinding`.

Reviewed apply path:

- `src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js`
  - Uses `BEGIN IMMEDIATE`, `INSERT INTO folder_bindings`, and `COMMIT`.

Import/materialization path:

- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
  - Calls `folderStore.bindChat(...)` while materializing imported folder bindings.

Review/reconcile path:

- `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
  - Applies reviewed chat-folder binding requests through `folders.unbindChat` and
    `folders.moveCanonicalChatFolderBinding`.

Rust/Tauri test/proof and schema paths:

- `apps/studio/desktop/src-tauri/src/lib.rs`
  - Defines `folder_bindings`, proof seed/delete paths, and F16 trigger protection.

## Preflight Answers

1. **Smallest safe source patch**

   Add a binding-specific durable verification helper/result in `src-surfaces-base/studio/store/folders.tauri.js`,
   then require that result in `src-surfaces-base/studio/sync/folder-sync.tauri.js` before the binding handler returns
   `applied` or records consumed ledger state.

2. **Where the fix should live**

   The fix should live in both files:

   - `folders.tauri.js` owns canonical SQLite binding write/read substrate and should expose the durable
     confirmation/fence result.
   - `folder-sync.tauri.js` owns request/receipt semantics and must gate `applied`, `idempotencyPersisted:true`, and
     `bindingRepairRecordConsumed` on durable proof.

3. **How to prove durable persistence without same-session-only readback**

   Add a local harness that performs a controlled binding write into a temporary or isolated SQLite database, forces a
   durability fence, reopens or reinitializes the DB handle if available, and confirms the canonical binding hash still
   equals the requested hash after the fence. The harness must also prove a failed durability fence returns
   `persistence-verification-failure`.

4. **Close/reopen or checkpoint feasibility from JS/Tauri**

   The current JS layer exposes `plugin:sql|select` and `plugin:sql|execute`; no explicit close/reopen API was found in
   the inspected JS wrappers. The implementation should first use SQLite-level durability fence SQL through `sqlExecute`
   / `sqlSelect` when available, such as a transaction boundary plus checkpoint/readback strategy. If an explicit
   close/reopen command is not exposed, the safest equivalent proof is a checkpoint-or-fence helper followed by a fresh
   canonical `listCanonicalChatFolderBindingsForChat` / full snapshot readback through the same Desktop store substrate,
   plus a live reload/restart proof before any allowed-set flip.

5. **Safest equivalent proof if direct close/reopen is unavailable**

   Use a layered proof:

   - Store-level durability fence helper records whether checkpoint/fence was available and completed.
   - Fresh canonical row readback after the fence must match the expected row and requested hash.
   - A later live reload/restart/readback must prove the hash still matches before binding readiness advances.
   - If the fence is unavailable or inconclusive, the handler must return `persistence-verification-failure` and consume
     no ledger row.

6. **Competing writer guard/detection**

   The implementation should record pre-write and post-fence canonical hashes plus a per-chat expected current folder
   check. It should return `persistence-verification-failure` when the post-fence canonical state does not equal the
   requested hash, and it should add read-only diagnostics that identify whether import/review/store writers changed the
   same `chat_id` after the repair path. It must not silently override competing writers.

7. **Ledger consumption prevention**

   `bindingRepairRecordConsumed(request)` must move after durable verification and must not run when durability is
   unavailable, fails, or cannot prove the requested hash. Existing duplicate detection may remain read-only, but new
   consumed rows must be contingent on durable canonical persistence.

8. **New receipt reason**

   Use `persistence-verification-failure` for writes that pass immediate store execution but fail durable persistence
   proof. The receipt must be `status:"rejected"`, `idempotencyPersisted:false`, and must include zero new consumed
   ledger rows.

9. **New local validators before live retry**

   Required validators/proofs:

   1. Durability / reopen-or-fence harness.
   2. Revert-detection harness for competing `folder_bindings` writers.
   3. Ledger-contingency harness proving failed/non-durable write consumes no ledger row.
   4. Receipt contract validator for `persistence-verification-failure`.
   5. Boundary validator keeping `binding-mismatch`, `productSyncReady`, WebDAV/cloud/relay, and Chat Saving CAS
      blocked.

10. **Exact live proof sequence after implementation**

    1. Binding live dry-run.
    2. Binding controlled apply with `folder-sync-chat-folder-binding-repair-apply`.
    3. App reload/restart or equivalent fresh readback.
    4. Canonical binding hash still equals requested hash.
    5. Consumed ledger row matches durable canonical state.
    6. Duplicate replay is zero-write/no-op.
    7. No binding allowed-set flip, no `productSyncReady` flip, no WebDAV/cloud/relay, and no Chat Saving CAS.

## Ranked Implementation Options

1. **Chosen: store durable verification helper plus handler durable gate**

   Add a narrow helper in `folders.tauri.js` for binding repair durability proof and require it in
   `applyChatFolderBindingRepairRequest` before `applied` / ledger consume. This is smallest because it preserves the
   current request schema, receipt schema, conflict rules, and store writer path while adding only the missing durable
   proof boundary.

2. **Handler-only extra snapshot read**

   Rejected as insufficient. The current handler already performs a same-session canonical snapshot/hash check, and the
   blocker survived that model.

3. **Rewrite binding repair around reviewed apply transaction**

   Defer. `binding-reviewed-apply.tauri.js` has explicit transaction semantics, but moving the repair handler to that
   substrate would widen the patch beyond the smallest source fix and risks changing request/receipt behavior.

4. **Allow-set flip despite readback block**

   Rejected. `binding-mismatch` must remain blocked until durable persistence and reload-surviving live proof pass.

## Later Patch Boundaries

Allowed later source patch boundaries:

- `src-surfaces-base/studio/store/folders.tauri.js`
  - Add a binding durability confirmation helper.
  - Optionally extend `moveCanonicalChatFolderBinding` result with durable confirmation fields.
  - Add narrow support for checkpoint/fence SQL if available through existing `sqlExecute` / `sqlSelect`.
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  - Gate `applied`, `idempotencyPersisted:true`, and `bindingRepairRecordConsumed` on durable proof.
  - Return `persistence-verification-failure` when durable proof fails.
  - Add stale consumed-row diagnostics when ledger rows exist but canonical state no longer matches expected hash.

Forbidden later source patch boundaries for the immediate fix:

- Do not edit F11 allowed-set behavior.
- Do not unblock `binding-mismatch`.
- Do not flip `productSyncReady`.
- Do not start WebDAV/cloud/relay/fullBundle.v3.
- Do not touch Chat Saving/saved-chat.
- Do not change binding request schema or receipt schema except adding the receipt reason
  `persistence-verification-failure`.
- Do not weaken `post-apply-binding-hash-mismatch`.
- Do not add destructive folder/chat/delete/tombstone/purge behavior.

## NO-GO Conditions

- No blind live retry.
- No same-session-only success claim.
- No ledger consume before durable proof.
- No weakening `post-apply-binding-hash-mismatch`.
- No binding allowed-set flip.
- No `productSyncReady`.
- No WebDAV/cloud/relay.
- No Chat Saving CAS.

## Boundaries Held

- No product source was edited.
- No apply/gate/write happened.
- `binding-mismatch` remains blocked.
- `productSyncReady` remains `false`.
- WebDAV/cloud/relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.

## Recommended Next Step

Recommended next step: Claude review of this source-fix preflight before Codex implementation. After review, the
implementation slice should add the durable store confirmation helper, handler durable gate, local durability/revert/
ledger validators, and only then prepare a new live dry-run/apply/reload proof sequence.
