# Folder Sync - Binding Persistence Durable-Verification Gate (Implementation)

Status: BINDING PERSISTENCE DURABLE GATE IMPLEMENTED.

This slice is **detection + safe-fail hardening only**, NOT the final Rust/Tauri-SQL / competing-writer
persistence fix. It prevents the chat↔folder binding repair handler from returning `status:"applied"`,
`idempotencyPersisted:true`, or consuming the operation ledger unless durable canonical binding persistence is
proven. If durable persistence cannot be proven, the handler returns `status:"rejected"` with
`reason:"persistence-verification-failure"`, consumes nothing, and keeps every release gate blocked. No live
Desktop apply was performed. All identifiers here are redacted/hash-only.

## References

- Binding repair implementation: `d4d5db19`.
- Binding controlled apply proof: `5c89ba95`.
- Binding post-apply readback blocked: `d46f0805`.
- Binding state-source diagnostic: `132002b6`.
- Binding persistence hardening preflight: `01dc9957`.
- Binding persistence source-fix preflight: `3afd4058`.

## Blocker this addresses

The binding controlled apply previously returned `status:"applied"`, `canonicalBindingWriteCount:1`,
`afterMatchesRequested:true`, `idempotencyPersisted:true`, yet later snapshot/store/direct-SQL all read the OLD
before hash (`sha256:1d602101…`) and never the requested/applied hash (`sha256:d53244…`), while a consumed
ledger row existed. The handler's existing `post-apply-binding-hash-mismatch` gate is a **same-session** fresh
read and passed at apply time; the failure is **durability/revert**, not read-freshness. This gate makes the
handler safe-fail instead of falsely reporting `applied` + consuming the ledger on unproven persistence.

## Source changes (two product files)

### `src-surfaces-base/studio/store/folders.tauri.js`
- New `confirmCanonicalChatFolderBindingDurable(opts)` helper (exposed on `store.folders`) — the
  durable-confirmation surface for the repair path's canonical binding writes
  (`moveCanonicalChatFolderBinding` / `bindChat` / `unbindChat`). It performs a best-effort JS-reachable
  persistence fence (`PRAGMA wal_checkpoint(TRUNCATE)` via `sqlSelect`/`sqlExecute`), then a FRESH canonical
  re-read via `listCanonicalChatFolderBindings`, and — when the caller injects its row-hash convention +
  expected hash — reports `{ durable, unverifiable, method, canonicalBindingHash, matchesRequested,
  checkpointed, storeIdentity, reason, rows }`. It NEVER claims `durable:true` without a confirmed fence: if a
  checkpoint cannot be confirmed it returns `durable:false` / `unverifiable:true` so the caller safe-fails. It
  does NOT rewrite transactions, does NOT change binding SQL, and does NOT route through the Rust writer
  identity.

### `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `applyChatFolderBindingRepairRequest`: a new **durable persistence gate** runs AFTER the preserved
  `post-apply-binding-hash-mismatch` gate and BEFORE `bindingRepairRecordConsumed` / `applied` /
  `idempotencyPersisted`. For a real write it calls `folders.confirmCanonicalChatFolderBindingDurable({
  hashRows: chatFolderBindingHashFromRows, requestedBindingHash })` and requires `durable === true &&
  unverifiable !== true && matchesRequested === true`. Otherwise it returns `status:"rejected"`,
  `reason:"persistence-verification-failure"`, `canonicalBindingWriteCount:0`, `canonicalWriteCount:0`,
  `idempotencyPersisted:false`, all destructive-safety flags true, `bindingMismatchAllowed:false`,
  `productSyncReady:false`, `noMirrorWrite/noTransportWrite/noWebdavWrite:true`, and **does not** call
  `bindingRepairRecordConsumed`. The existing `post-apply-binding-hash-mismatch` gate is unchanged and still
  runs first.

## Durable verification invariant

> Emit `status:"applied"` (and `idempotencyPersisted:true`, and consume the ledger, and report
> `canonicalBindingWriteCount > 0`) **only if** a JS-reachable persistence fence succeeded AND a fresh canonical
> re-read after that fence hashes equal to `requestedBindingHash`. Any other outcome (fence unavailable,
> `unverifiable`, missing helper, or hash mismatch) ⇒ `rejected` / `persistence-verification-failure`, no
> ledger consume, `idempotencyPersisted:false`, `canonicalBindingWriteCount:0`.

## Receipt / ledger ordering rule

`validate → write → same-session snapshot → post-apply-binding-hash-mismatch gate (preserved) → durable gate
(new) → (only if durable && matchesRequested) bindingRepairRecordConsumed → applied + idempotencyPersisted:true`.
On durable failure the ledger consume is never reached.

## Behavioral proof (node:sqlite; real handler + real ledger)

The implementation validator loads the REAL `folder-sync.tauri.js` handler + REAL consumed-operation ledger
over a mock canonical binding store whose `confirmCanonicalChatFolderBindingDurable` is toggled per case:

- **Durable success:** `durable:true` + `matchesRequested:true` ⇒ `status:"applied"`,
  `canonicalBindingWriteCount:1`, `idempotencyPersisted:true`, consumed ledger rows +1.
- **Non-durable (unverifiable):** `durable:false` / `unverifiable:true` ⇒ `status:"rejected"`,
  `reason:"persistence-verification-failure"`, `canonicalBindingWriteCount:0`, `canonicalWriteCount:0`,
  `idempotencyPersisted:false`, safety flags true, consumed ledger rows +0.
- **Revert/mismatch:** fenced but the fresh re-read does not match the requested hash
  (`matchesRequested:false`) ⇒ `rejected` / `persistence-verification-failure`, zero consume — the competing
  writer / revert is DETECTED, not reported as applied.
- The preserved `post-apply-binding-hash-mismatch` gate still exists and is unchanged; `binding-mismatch`
  remains blocked; `productSyncReady` remains false; WebDAV/cloud/relay + Chat Saving CAS remain blocked.

## Boundaries

- `binding-mismatch` remains BLOCKED (F11 `blockedClasses` still concat `['binding-mismatch']`).
- `productSyncReady` remains `false`; no `fullBundle.v3`; WebDAV/cloud/relay blocked; Chat Saving CAS blocked.
- No Rust `apps/studio/desktop/src-tauri/src/lib.rs` edit; the f16 folder_bindings trigger guard is NOT
  enabled; the repair is NOT routed through `h2o_writer_identity()`; competing-writer files
  (`binding-reviewed-apply.tauri.js`, `import-bundle.tauri.js`, `tombstone-reviews.tauri.js`) are untouched.
- No live Desktop apply, no gate passed live, no `apply:true` live.

## Verdict

BINDING PERSISTENCE DURABLE GATE IMPLEMENTED (detection + safe-fail). `applied` / `idempotencyPersisted:true`
/ consumed-ledger insertion now require durable confirmation; unproven persistence returns
`persistence-verification-failure` and consumes nothing; the existing `post-apply-binding-hash-mismatch` gate
is preserved. This is NOT the final Rust/Tauri-SQL or competing-writer persistence fix — that investigation
remains a separate, separately-approved slice.

## Recommended Next Step

Independent patch review of this durable gate, then a Rust/Tauri-SQL durability + `h2o_writer_identity()`
authorization + competing-writer investigation, BEFORE any live Desktop retry. Do NOT retry live apply, flip
`binding-mismatch`, flip `productSyncReady`, or start WebDAV/cloud/relay/Chat Saving CAS until that review and
the true persistence fix land and are separately approved.
