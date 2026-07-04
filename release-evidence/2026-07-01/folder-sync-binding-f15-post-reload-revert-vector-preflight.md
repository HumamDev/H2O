# Folder Sync - Binding F15 Post-Reload Revert Vector (Preflight / Investigation)

Verdict: **BINDING F15 POST-RELOAD REVERT VECTOR IDENTIFIED (BOOT SOURCE-OF-TRUTH OVERWRITE); EXACT BOOT WRITER
REQUIRES A LIVE BOOT DIAGNOSTIC**.

This is design-only investigation and preflight. No product source was edited, no live retry was run, no Phase A/Phase B
was started, no binding allowed-set flip was performed, no gate was bypassed, and no fallback was reintroduced. It
records the source-grounded root cause (narrowed) for the Phase B post-reload revert observed after `81de3a63`, and the
safest fix direction, to be confirmed by a read-only live boot diagnostic before any implementation.

## Commit Chain

- F15 settlement one-active projection implementation: `bb4675dc`.
- F15 settlement materialization design preflight: `5dc99e11`.
- F15 settled materialization implementation: `81de3a63`.

## Live Phase A (PASSED, in-session) vs Phase B (FAILED, post-reload)

Phase A after `81de3a63` passed in-session:

- `controlledApply.status:"applied"`, `reason:"binding-repair-applied"`.
- `canonicalBindingWriteCount:1`, `idempotencyPersisted:true`.
- `f15Delegation.evidencePresent:true`, `f15Delegation.ok:true`.
- `afterBindingHash === requestedBindingHash`, `immediateReadbackMatchesRequested:true`.
- durable gate: `checkpoint-confirmed`, `checkpointBusy:0`, `durable:true`.
- duplicate replay skipped/duplicate with zero write.

Phase B after a full Desktop Studio reload/restart FAILED:

- expected Phase A hash: `sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.
- before Phase A old hash: `sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d`.
- `postReloadSnapshotHash` returned the old before hash.
- `postReloadRecomputedHash` returned the old before hash.
- `postReloadMatchesPhaseARequested:false`.
- `oldHashNotRestored:false`.
- durable gate still `checkpoint-confirmed`, `checkpointBusy:0`, `durable:true`.
- `reconcileSurvivalProven:false`.

## Source-Grounded Root Cause (narrowed)

1. **The repair snapshot reads TRUE SQLite `folder_bindings`, not a mirror.** `chatFolderBindingCanonicalSnapshot()`
   (in `folder-sync.tauri.js`) builds `bindingByChatId`/`bindingHash` from `folders.listCanonicalChatFolderBindings()`,
   which reads the canonical `folder_bindings` table (`SELECT ... FROM folder_bindings ...`). Phase A and Phase B use
   the same snapshot, so both read the same SQLite source. Therefore the revert is an actual **SQLite `folder_bindings`
   overwrite between the durable-checkpointed Phase A write and the post-reload read** - not a snapshot-source artifact.

2. **The F15 repair writes SQLite `folder_bindings` only; it never updates the `FOLDER_STATE_DATA_KEY` mirror.** The
   settled materializer `materializeSettledCanonicalChatFolderBinding(...)` and the F15 `bindChat`/`unbindChat` branches
   make zero writes to `FOLDER_STATE_DATA_KEY` / the folder-state mirror (they only `sqlExecute` on `folder_bindings`).
   The mirror is written only by folder soft-delete/restore and the import/export paths. This is the split
   source-of-truth: the settled binding lives in SQLite `folder_bindings`, while a parallel `FOLDER_STATE_DATA_KEY`
   mirror (used for render/export and file/transport import) still encodes the OLD binding after the repair.

3. **`folder_bindings` has multiple competing writers, several of which can re-apply a stale binding.**
   - `materializeSettledCanonicalChatFolderBinding` (`INSERT OR REPLACE` / scoped `DELETE`) - the new settled writer.
   - `bindChatLegacy` / `unbindChatLegacy` / `moveCanonicalChatFolderBinding` in `folders.tauri.js`.
   - `importFolderBindings(...)` in `ingestion/import-bundle.tauri.js`, which re-applies bundle bindings via
     `folderStore.bindChat(folderId, chatId, ...)`; reachable through `importFolderStateOnly` and `importBundle`
     (including the F19 `f19-chrome-desktop` transport import).
   - `binding-reviewed-apply.tauri.js` (`INSERT INTO folder_bindings`).

4. **The exact auto-boot writer is not statically evident.** The Desktop boot entry is `renderRoute()` (render/read);
   the import, reviewed-apply, and `resumeExecuteOnBoot` paths are exposed but are operator/file/transport-triggered in
   the source, not visibly self-invoked on `renderRoute()`. Because the durable gate confirms the Phase A write reached
   disk, yet post-reload SQLite shows the old edge, one of the following must hold and must be confirmed live:
   - **(S1, strongest)** a boot/first-render re-hydration or auto-import re-applies a stale binding source (the
     `FOLDER_STATE_DATA_KEY` mirror and/or a persisted/imported bundle) into `folder_bindings` via
     `bindChat`/`importFolderBindings` - reverting to old because the mirror/bundle was never updated by the repair;
   - **(S2)** `resumeExecuteOnBoot` re-dispatches a stale settled execute-journal row;
   - **(S3)** `binding-reviewed-apply` runs a queued/approved review at boot;
   - **(S4, must be ruled out)** the durable checkpoint confirmed a different DB connection/path than the app reads
     post-reload (a canonical-DB-path mismatch).

## Answers To The Investigation Questions

- **Q1 (startup code touching `folder_bindings`)**: the competing writers in item 3; boot itself is `renderRoute()`
  (read/render). No single auto-boot writer is statically confirmed - see item 4.
- **Q2 (rebuild source)**: the most likely stale source is the `FOLDER_STATE_DATA_KEY` folder-state mirror and/or a
  persisted/imported bundle re-applied via `importFolderBindings` -> `bindChat`. Memory cache / materialized cache /
  execute journal are lower-probability suspects (S2).
- **Q3 (boot repair/fallback/reconcile/migration/hydrate that overwrites SQLite)**: none is statically proven to
  auto-run; the import/reviewed-apply/resume paths are the candidates and must be instrumented live.
- **Q4 (snapshot read source after reload)**: TRUE SQLite `folder_bindings` via `listCanonicalChatFolderBindings` - not
  a rebuilt/mirrored in-memory state.
- **Q5 (why Phase A readback new, post-reload old)**: Phase A materialized SQLite and read it back (match); after
  reload, a boot process overwrote SQLite `folder_bindings` back to the old edge from a stale source. Both readbacks use
  the same SQLite snapshot, so the change is in the underlying table, not the read path.
- **Q6 (consumed ledger interaction)**: the consumed ledger (`bindingRepairAlreadyConsumed` /
  `bindingRepairRecordConsumed`) makes a re-run of the repair a no-op (skipped), so it does NOT re-materialize on boot;
  it neither causes nor prevents the revert. It does mean a naive "just replay the repair on boot" will be skipped by
  idempotency - so replay-based fixes must account for the consumed ledger.
- **Q7 (should boot consume the settled journal or stop overwriting SQLite?)**: stop overwriting canonical SQLite
  `folder_bindings` with stale mirror/bundle state, and make SQLite authoritative; converge the mirror FROM SQLite.

## Recommended Fix Direction

Primary: **A - prevent startup from overwriting canonical `folder_bindings`** with stale mirror/bundle state; SQLite
`folder_bindings` is authoritative and the mirror must be reconciled FROM SQLite (SQLite -> mirror), never
mirror -> SQLite for an already-materialized settled binding.

Complementary: **D - the F15 settled materialization also converges the `FOLDER_STATE_DATA_KEY` mirror (and any
persisted bundle source) to the settled edge**, so the two representations never diverge and no boot re-seed can revert.

- Not **B** alone (replay the settled journal on boot): it adds boot-time writes, is short-circuited by the consumed
  ledger, and does not fix the stale-mirror overwrite ordering.
- Not **C** unless the live diagnostic proves a canonical-DB-path/connection mismatch (S4).
- Competing-writer files (`binding-reviewed-apply.tauri.js`, `import-bundle.tauri.js`, `tombstone-reviews.tauri.js`)
  must NOT be edited; if a competing writer is the boot reverter, gate the fix at the boot orchestration (stop the
  stale re-seed) and/or converge the mirror in the store, rather than editing the competing writer.

## Required Confirmation Before Implementation (read-only, no source edit)

A live boot diagnostic (DevTools, no product-source change) must:

1. Capture the `FOLDER_STATE_DATA_KEY` mirror content immediately after Phase A and confirm it still encodes the OLD
   binding (proves the mirror is the stale source).
2. Instrument/observe which code path writes `folder_bindings` on the next boot (before/after boot canonical snapshots
   plus a write trace / `recordWrite` observation), to pin S1 vs S2 vs S3.
3. Confirm the durable-checkpoint DB path equals the app's post-reload DB path, ruling out S4.

## Required Validators / Evidence For The Eventual Fix

- **Reconcile-survival implementation validator**: after a settled materialization, a simulated boot reconcile (apply
  the stale mirror/bundle) does NOT revert `folder_bindings`; SQLite remains authoritative and the mirror converges to
  the settled edge; the post-reload snapshot equals the Phase A requested hash; no gate is weakened.
- **Static anchors**: SQLite `folder_bindings` remains authoritative for the snapshot; the F15 materialization converges
  the mirror; no fallback; `post-apply-binding-hash-mismatch` + durable gate + conflict runtime + `requireContext`
  unchanged; competing-writer files unedited.
- **Regression battery**: the full binding lane battery plus the materialization implementation validator.

Required evidence: `release-evidence/2026-07-01/folder-sync-binding-f15-post-reload-reconcile-survival-implementation.md`.

## Live Retry Conditions After The Fix (Phase B)

- Phase A still passes (as after `81de3a63`).
- After reload: `postReloadSnapshotHash === requestedBindingHash` and `postReloadRecomputedHash === requestedBindingHash`.
- `postReloadMatchesPhaseARequested:true`; `oldHashNotRestored:true`; `reconcileSurvivalProven:true`.
- No `binding-mismatch` unblock, no gate weakening.
- No Phase B declared survived until the post-reload snapshot equals the requested hash across a real restart.

## NO-GO Conditions

- Bypassing the Phase B failure, or declaring reconcile-survival without a real post-reload equal-hash read.
- Weakening `post-apply-binding-hash-mismatch`, the busy-aware durable gate, the conflict runtime, or `requireContext`.
- `allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback` or bare legacy binding writes.
- Editing competing-writer files, or Rust unless the diagnostic proves the restart writer is Rust.
- `productSyncReady` flip, `binding-mismatch` unblock, WebDAV/cloud/relay/`fullBundle.v3`, or Chat Saving CAS drift.

## Boundaries Held

- No product source edited; no live Phase A/Phase B run; no Desktop reload performed by this slice.
- `post-apply-binding-hash-mismatch`, durable gate, conflict runtime, `requireContext`, and the planned-unbind
  projection remain intact.
- No fallback; `binding-mismatch` remains blocked; `productSyncReady` remains false; WebDAV/cloud/relay remains
  blocked; Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Run the read-only live boot diagnostic to pin the exact `folder_bindings` boot writer (S1-S4), then design the
reconcile-survival fix (A + D) and get review before any product-source implementation or live retry.
