# Folder Sync - Binding F15 Post-Reload Boot-Writer Pinning (Investigation)

Verdict: **NOT A BOOT WRITER. LEADING SOURCE-GROUNDED ROOT CAUSE: DURABLE-GATE WAL-CHECKPOINT FALSE-POSITIVE (WRITE
NOT MERGED TO THE MAIN DB FILE)**.

This is design-only investigation and preflight. No product source was edited, no live retry was run, no Phase A/Phase B
was started, no Desktop reload was performed, no gate was bypassed or weakened, and no fallback was reintroduced. It
supersedes the mirror/boot-writer hypothesis from the prior revert-vector preflight with a narrowed, source-grounded
root cause, to be confirmed by a read-only durability diagnostic before any implementation.

## Commit Chain

- F15 settled materialization implementation: `81de3a63`.
- F15 post-reload revert vector preflight (mirror/boot-writer hypothesis, now superseded): `f2764d24`.

## Live Facts

Phase A (in-session) passed: `controlledApply.status:"applied"`, `canonicalBindingWriteCount:1`,
`idempotencyPersisted:true`, `f15Delegation.ok:true`, `afterBindingHash == requestedBindingHash`,
`immediateReadbackMatchesRequested:true`, `durableGate.durable:true`, `duplicateReplayZeroWrite:true`.

Hashes: Phase A requested `sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`; old before hash
`sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d`.

Phase B (post-reload) failed: `postReloadSnapshotHash` and `postReloadRecomputedHash` both returned the OLD before hash;
`reconcileSurvivalProven:false`. Read-only diagnostic: `sqliteSnapshot.bindingHash == old`, `sqliteHash == old`,
`sqliteMatchesOld:true`, `sqliteMatchesPhaseA:false`, `rowCount:14`, `durableGate.checkpointBusy:0`,
`durableGate.durable:true`, no localStorage `FOLDER_STATE_DATA_KEY` candidate, exposed folder functions included
`rebuildRenderMirrorFromSqlite`.

## What Was Ruled Out (source-grounded)

1. **No JS boot/shutdown `folder_bindings` writer.** `folders.init()` and `reload()` are read-only
   (`waitForSqlite()` + `countFolders()`); `saveNow()` is a no-op. There is no `beforeunload`/close persist handler that
   writes `folder_bindings` or folder state.
2. **`rebuildRenderMirrorFromSqlite` goes SQLite -> mirror**, not mirror -> SQLite (its `target` is
   `FOLDER_STATE_DATA_KEY` via `chromeStorageSet`), so it cannot revert canonical `folder_bindings`.
3. **The `FOLDER_STATE_DATA_KEY` mirror is `chrome.storage.local`-backed** (`chromeStorageLocal()` returns
   `global.chrome.storage.local` or null). In the Tauri webview that API is absent/shimmed, so mirror writes are
   effectively no-ops on Desktop - consistent with the diagnostic finding no localStorage mirror. The mirror is not the
   Desktop reverter.
4. **Rust does not write `folder_bindings` in production.** The only Rust `folder_bindings` writes (`lib.rs` INSERT/DELETE)
   are the `f5g4-proof-*` F5G.4 proof/test harness rows, not a boot/production path. The "no Rust unless proven"
   boundary holds.
5. **No DB/path split at the JS store level.** Every store (`folders`, `chats`, `categories`, `labels`, `snapshots`,
   `conflicts`, `assets`, `tags`) uses the single `DB_URL = 'sqlite:studio-v1.db'`; the repair, the durable re-read, and
   the app all read/write the same file via `plugin:sql`.
6. **Import / reviewed-apply / execute-resume are not statically auto-run on boot.** `importFolderBindings` (via
   `bindChat`), `importFolderStateOnly`, `binding-reviewed-apply` (`INSERT INTO folder_bindings`), and
   `resumeExecuteOnBoot` are exposed but file/operator/transport-triggered; boot is `renderRoute()` (render/read).

## Leading Root Cause (source-grounded, pinned pending one confirming metric)

**The durable gate declares `durable:true` on a WAL checkpoint that returned `busy === 0` WITHOUT verifying the WAL was
actually merged into the main DB file.** In `bindingDurablePersistenceFence()` the classification is:

- `PRAGMA wal_checkpoint(TRUNCATE)` returns `(busy, log, checkpointed)`.
- The fence branches: `busy === 1` -> `busy-incomplete` (not durable); `log === -1 && checkpointed === -1` ->
  `non-wal-no-checkpoint-needed` (durable); **`busy === 0` -> `checkpoint-confirmed` / `durable:true`** - regardless of
  `log` / `checkpointed`.

A `wal_checkpoint(TRUNCATE)` can return `busy:0` while `checkpointed < log` (or `log > 0`) when a concurrent reader
(the app's render/read connection, or another `plugin:sql` pooled connection) pins an older WAL snapshot: the
checkpoint runs but does not merge all frames and does not truncate the WAL. The busy-aware fence treats this as
`checkpoint-confirmed` (`durable:true`), and the fence's fresh re-read - issued on the same connection - still sees the
WAL frames, so `matchesRequested:true`. Both in-session signals pass while the write remains only in the WAL, not in the
authoritative main `studio-v1.db` file. On restart, `plugin:sql` reopens the DB; the un-merged WAL frames are not
present in the main file (and are discarded / not applied on the reconnect), so the canonical read returns the OLD
14-row state - exactly the Phase B result.

This single mechanism explains every observation (in-session readback match, `durable:true`, `checkpointBusy:0`, and
post-restart old) without any boot/shutdown `folder_bindings` writer.

## Answers To The Investigation Questions

- **Q1/Q2 (startup writers, direct/indirect via bindChat/importFolderBindings/importFolderStateOnly/
  rebuildRenderMirrorFromSqlite/reviewed-apply/execute-resume)**: none is statically auto-run on boot; init/reload are
  read-only; `rebuildRenderMirrorFromSqlite` is SQLite -> mirror. See "What Was Ruled Out".
- **Q3 (DB/path split)**: no JS-level split (single `studio-v1.db`). A residual possibility is that the JS `plugin:sql`
  pool and a Rust `sqlx` pool over the same WAL DB diverge on reconnect - this is part of the confirming diagnostic, but
  the primary cause is the un-merged WAL, not two files.
- **Q4 (consumed ledger survives restart?)**: must be confirmed live; the ledger is not the reverter (a surviving ledger
  makes a repair replay a no-op; a lost ledger would allow replay but not by itself revert `folder_bindings`).
- **Q5 (execute journal rows survive restart?)**: must be confirmed live; not the reverter for the same reason (a
  settled journal encodes the NEW binding, so replaying it would re-materialize NEW, not OLD).
- **Q6 (startup ignores ledger and re-applies stale import/bundle?)**: no statically auto-run import path re-applies on
  boot; not the cause.
- **Q7 (materialized write missing from a secondary authoritative source?)**: the "secondary source" that startup treats
  as authoritative is the **main `studio-v1.db` file itself** - the Phase A write lived in the WAL, never merged to the
  main file, so on restart the authoritative main file still holds OLD.

## Recommended Fix Direction

Safest, and it **strengthens** (never weakens) the durable gate - closest to task option **F** (a stronger persistence
guarantee), with **D** (persistence correctness) framing:

- Harden `bindingDurablePersistenceFence()` so `durable:true` requires a **true full merge**, not just `busy === 0`:
  after `wal_checkpoint(TRUNCATE)`, require the WAL to be fully flushed (`log === 0` and `checkpointed === 0`, i.e. the
  WAL was truncated) - or equivalently `checkpointed === log` with a subsequent `log === 0` confirmation - before
  emitting `checkpoint-confirmed`/`durable:true`. Any `busy === 0` result with residual `log`/unmerged frames becomes
  `partial-checkpoint-not-durable` (`durable:false`), so the handler returns `persistence-verification-failure` and
  consumes NOTHING.
- Optionally add a strongest-guarantee cross-connection re-read (reopen / fresh connection) that confirms the main DB
  file holds the requested hash before `applied` + ledger consume.
- This removes the false-positive so `applied`/`idempotencyPersisted:true` only happens when the write will survive a
  restart. It does not touch `post-apply-binding-hash-mismatch`, the conflict runtime, `requireContext`, the
  planned-unbind projection, or add any fallback.
- If the confirming diagnostic instead proves the un-merged WAL is discarded specifically by a separate Rust `sqlx`
  pool / plugin reconnect, the fix is a proven persistence correction at that boundary (Rust edit then justified by the
  boundary's "unless source proves the restart writer is Rust").

Files likely to change: `src-surfaces-base/studio/store/folders.tauri.js` (the fence classification) and its busy-aware
fence validator. No competing-writer files, no `folder-sync.tauri.js` handler change (its gate ordering is already
correct), no Rust unless the diagnostic proves the WAL-discard is Rust-side.

## Required Confirmation Before Implementation (read-only, no source edit)

1. Re-run the durable gate and capture `checkpointLog` (`result.checkpointLog`) and `checkpointFrames`
   (`result.checkpointFrames`) alongside `checkpointBusy`. `log > 0` or `checkpointed < log` at Phase A **confirms** the
   false-positive.
2. Disk-level check: immediately after Phase A, inspect the on-disk `studio-v1.db` main file vs `studio-v1.db-wal` -
   does the main file hold OLD while the WAL holds NEW? After restart, re-check.
3. Confirm whether a separate Rust `sqlx` pool opens `studio-v1.db` and whether the plugin reconnect applies vs discards
   the WAL on boot; confirm `journal_mode`/`synchronous` PRAGMAs.
4. Confirm the consumed ledger and execute-journal rows survive restart (Q4/Q5) to fully exclude replay effects.

## Required Validators / Evidence For The Eventual Fix

- **Durable full-merge fence validator**: a fence that returns `busy:0` but `checkpointed < log` (residual WAL) is
  classified `partial-checkpoint-not-durable` (`durable:false`); only a fully-flushed WAL (`log === 0`) is `durable:true`;
  the handler returns `persistence-verification-failure` with zero ledger consume otherwise.
- **Reconcile-survival implementation validator**: after a hardened-durable apply, a simulated restart read equals the
  requested hash; `reconcileSurvivalProven:true`.
- **Static anchors + regression battery**: fence hardening present; `post-apply-binding-hash-mismatch`, conflict
  runtime, `requireContext`, projection, no fallback, boundaries intact; full binding lane battery green.

Required evidence: `release-evidence/2026-07-01/folder-sync-binding-f15-durable-fullmerge-fence-implementation.md`.

## Live Retry Conditions After The Fix (Phase B)

- Phase A still passes, and the durable gate now emits `durable:true` ONLY on a fully-merged WAL (or non-WAL).
- After restart: `postReloadSnapshotHash === requestedBindingHash`, `postReloadRecomputedHash === requestedBindingHash`,
  `reconcileSurvivalProven:true`.
- If a checkpoint cannot fully merge, the apply returns `persistence-verification-failure` and consumes no ledger (safe
  fail, retryable) rather than a false `applied`.

## NO-GO Conditions

- Bypassing Phase B, or declaring reconcile-survival without a real post-restart equal-hash read.
- Weakening the durable gate, `post-apply-binding-hash-mismatch`, the conflict runtime, or `requireContext`. (The
  recommended change strengthens the durable gate.)
- `allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback` or bare legacy binding writes.
- Editing competing-writer files, or Rust unless the diagnostic proves the restart WAL-discard is Rust-side.
- `productSyncReady` flip, `binding-mismatch` unblock, WebDAV/cloud/relay/`fullBundle.v3`, or Chat Saving CAS drift.

## Boundaries Held

- No product source edited; no live Phase A/Phase B; no Desktop reload performed by this slice.
- `post-apply-binding-hash-mismatch`, durable gate, conflict runtime, `requireContext`, and the planned-unbind
  projection remain intact.
- No fallback; `binding-mismatch` remains blocked; `productSyncReady` remains false; WebDAV/cloud/relay remains
  blocked; Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Run the read-only durability diagnostic (capture `checkpointLog`/`checkpointFrames`; inspect main-file vs WAL) to
confirm the false-positive, then design the durable full-merge fence hardening (+ optional reopen-verify) and get review
before any product-source implementation or live retry.
