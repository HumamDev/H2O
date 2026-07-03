# Folder Sync - Binding Persistence Busy-Aware Fence Fix

Status: BINDING PERSISTENCE BUSY-AWARE FENCE FIX IMPLEMENTED.

This slice fixes the durable gate from commit `71616328` so the persistence fence no longer treats a
non-throwing `PRAGMA wal_checkpoint(TRUNCATE)` as durable. It inspects the returned checkpoint row and only
confirms durability when the checkpoint actually completed. It remains **detection + safe-fail hardening
only**, NOT the final Rust/Tauri-SQL / competing-writer persistence fix. No live apply retry was performed. The
change is **store-helper/fence-only** in `folders.tauri.js`; `folder-sync.tauri.js` was not modified.

## References

- Durable gate implementation: `71616328`.
- Independent review verdict: REVISE / approve-with-conditions (busy-awareness required).
- Live checkpoint-availability diagnostic: `release-evidence/2026-07-01/folder-sync-binding-checkpoint-availability-diagnostic.md`.

## What the live diagnostic showed

- Live checkpoint diagnostic showed **WAL mode** and **inspectable checkpoint rows** via the `select` path.
- `checkpointSelect.busy:0`, `log:0`, `checkpointed:0` (`recommendedFenceInterpretation:"checkpoint-confirmed"`).
- `checkpointExecute` exposes **no** checkpoint columns (`rawShape:"array[2]"`,
  `exposesCheckpointColumns:false`) and must not be used as durable proof.

## Source change (`folders.tauri.js` only)

- New `bindingCheckpointRowParse(raw)` — parses the `PRAGMA wal_checkpoint` row (object-keyed `{busy, log,
  checkpointed}` or positional) into numeric `busy` / `log` / `checkpointed`.
- `bindingDurablePersistenceFence()` rewritten to be **busy-aware**:
  - **Prefers the `select` path** (it returns the checkpoint row so it can be inspected).
  - The returned row is parsed for `busy`, `log`, `checkpointed`.
  - `busy === 0` → `checkpoint-confirmed` → durable.
  - `busy === 1` → `busy-incomplete` (checkpoint blocked/incomplete) → **not durable / unverifiable → safe-fail**.
  - `log === -1 && checkpointed === -1` (or `journal_mode !== wal`) → `non-wal-no-checkpoint-needed` → fenced OK
    (rollback-journal autocommit already durable).
  - **execute-only fallback** (select unavailable) → `unverifiable`, **not durable** (execute exposes no
    `busy/log/checkpointed`).
  - both paths throw → `unavailable`, not durable.
  - **Uncertainty never becomes `durable:true`.**
- `confirmCanonicalChatFolderBindingDurable(opts)` now consumes the fence's CONFIRMED verdict
  (`fence.durable`/`fence.interpretation`) rather than merely "the PRAGMA did not throw"; it preserves the
  structured helper result used by `folder-sync.tauri.js` (`durable`, `unverifiable`, `matchesRequested`,
  `canonicalBindingHash`, `checkpointed`) and adds `fenceInterpretation` / `checkpointBusy` for observability.

The handler gate in `folder-sync.tauri.js` is unchanged — it still requires
`durable === true && unverifiable !== true && matchesRequested === true`; the existing
`post-apply-binding-hash-mismatch` gate is preserved and untouched.

## Behavioral proof

- **Fence classification** (real fence source evaluated with a stubbed SQL layer):
  - `busy:0` → `checkpoint-confirmed`, `durable:true`.
  - `busy:1` → `busy-incomplete`, `durable:false`.
  - non-WAL (`busy:0, log:-1, checkpointed:-1`) → `non-wal-no-checkpoint-needed`, `durable:true`.
  - `select` throws + `execute` ok → `unverifiable`, `durable:false` (execute exposes no columns).
  - both throw → `unavailable`, `durable:false`.
- **Handler end-to-end** (durable-gate implementation validator): durable success → `applied` + ledger consume
  +1; non-durable/unverifiable → `rejected` / `persistence-verification-failure` + zero consume; revert →
  `rejected` / `persistence-verification-failure` + zero consume; and a **busy-incomplete** shape →
  `rejected` / `persistence-verification-failure` + zero consume.

## Boundaries

- `binding-mismatch` remains BLOCKED; `productSyncReady` remains `false`; WebDAV/cloud/relay blocked; Chat
  Saving WebDAV/cloud/archive CAS blocked; no `fullBundle.v3`.
- No Rust `lib.rs` edit; f16 trigger guard not enabled; no `h2o_writer_identity()` routing; competing-writer
  files untouched; existing `post-apply-binding-hash-mismatch` preserved.
- No live apply retry; no gate passed live; no `apply:true` live.

## Verdict

BINDING PERSISTENCE BUSY-AWARE FENCE FIX IMPLEMENTED. The fence now inspects the checkpoint row: `busy:0`
(or non-WAL) is accepted as durable; `busy:1` is treated as incomplete/unverifiable and safe-fails; the
execute-only / no-column result is unverifiable. This remains detection + safe-fail only — NOT the final
Rust/Tauri-SQL or competing-writer persistence fix.

## Recommended Next Step

Rust/Tauri-SQL durability + `h2o_writer_identity()` writer-authorization + competing-writer investigation
(`binding-reviewed-apply.tauri.js`, `import-bundle.tauri.js`, `tombstone-reviews.tauri.js`) to identify the
true revert vector, BEFORE any live Desktop apply retry. Keep `binding-mismatch` blocked, `productSyncReady`
false, and Chat Saving CAS blocked until that investigation and the true persistence fix land and are
separately approved.
