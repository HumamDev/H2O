# Folder Sync - Binding F15 Restart Convergence Non-Effect Fix

Status: **BINDING F15 RESTART CONVERGENCE NON-EFFECT FIXED (ORDERING + OBSERVABILITY)**.

This slice fixes why `runF15SettledBindingRestartConvergence()` had no effect on Phase B after `a28f2a5c`: the
convergence ran fire-and-forget on boot and was neither awaited before the binding snapshot read nor observable, so a
post-restart snapshot could read canonical `folder_bindings` before convergence completed, and the live diagnostic could
not confirm whether convergence ran. JS-only change to `folders.tauri.js` and `folder-sync.tauri.js`. No durable/hash
gate weakened, no fallback, no live proof run.

## Commit Chain

- F15 restart-survival implementation (durable composite + ledger recovery + convergence): `a28f2a5c`.
- Durable-gate hardening preflight: `e50db532`.
- Ledger/journal restart-survival audit: `be3d982e`.

## Live Facts (from `a28f2a5c`)

- Phase A passed in-session (`applied`, `durableGate.durable:true`, `idempotencyPersisted:true`).
- Phase B after restart failed: `postRestartSnapshotHash`/`postRestartRecomputedHash` returned the old before hash;
  `reconcileSurvivalProven:false`.
- Durable gate now CORRECTLY reports the old state: `durable:false`, `matchesRequested:false`,
  `reason:"fresh-canonical-hash-mismatch-not-durable"` - the durable hardening works.
- Restart convergence signal: `availableKeys:["runF15SettledBindingRestartConvergence"]`, `lastResult:null` - only the
  function was exposed; no result field was observable.

## Root Cause (source-grounded)

The convergence function existed and was wired into `init()`/`reload()`, but two gaps made it a non-effect:

1. **Fire-and-forget on boot, not awaited before the snapshot read (race).** The store auto-initializes with
   `global.setTimeout(function () { init().catch(...); }, 0)` - `init()` (which runs convergence) is deferred and never
   awaited. `chatFolderBindingCanonicalSnapshot()` (the snapshot the repair reads) called
   `folders.listCanonicalChatFolderBindings()` without waiting for convergence, so a post-restart snapshot could read
   the stale pre-convergence `folder_bindings`.
2. **Result not exposed for live proof.** The convergence result was written only to internal `state` and surfaced in
   `diagnose()`, but NOT as `store.folders.__lastF15SettledBindingRestartConvergenceResult`, so the DevTools diagnostic
   read `null` and could not confirm whether convergence ran, nor its `checkedCount` / `journalVerifiedCount` /
   `convergedCount` / `alreadyCurrentCount` / `skippedCount` / blockers.

The record-persistence and journal-verification shapes were audited and AGREE (so the non-effect is ordering +
observability, not a shape mismatch):

- The settled execute-journal row is written with `phase:'settled'`, `domainId:'library.binding'` (`BINDING_DOMAIN`),
  `operationKind: operationKindFor(op)`, `subjectId`, and `evidence.settlementDigest`.
- The verifier `f15SettledJournalConfirmsMaterializationRecord()` matches `phase==='settled'`,
  `domainId==='library.binding'`, `operationKind === f15MaterializationOperationKind(op)`, `subjectId`, and
  `evidence.settlementDigest`.
- `operationKindFor(op)` (`'library-binding-'+op+'-applied'`) equals `f15MaterializationOperationKind(op)`
  (`'library-binding-'+op+'-applied'`), and `normalizeEvidence` preserves the `settlementDigest` string. The shapes are
  aligned.

## Fix (JS-only)

`src-surfaces-base/studio/store/folders.tauri.js`:

- Expose the convergence result: `api.__lastF15SettledBindingRestartConvergenceResult = result` at both return paths of
  `runF15SettledBindingRestartConvergence` (redacted counts/blockers only; no raw chat/folder ids).
- Add a one-shot memoized readiness gate `ensureF15SettledBindingRestartConvergenceReady(source)` that runs convergence
  at most once and caches the promise; `init()` and `reload()` now drive convergence through it (`reload()` resets the
  one-shot first so a post-reload read re-awaits). Exposed as `api.whenF15SettledBindingRestartConvergenceReady`.
- The exposed `runF15SettledBindingRestartConvergence` remains a safe manual diagnostic (operators can force + inspect).

`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- `chatFolderBindingCanonicalSnapshot()` now awaits `folders.whenF15SettledBindingRestartConvergenceReady('binding-snapshot')`
  (guarded, fail-safe) BEFORE reading `listCanonicalChatFolderBindings()`. The first canonical read after boot/reload
  therefore triggers and awaits the one-shot convergence, so the snapshot reflects the re-materialized `folder_bindings`
  and never a stale pre-convergence read. Convergence is bounded and always resolves; a convergence failure never blocks
  the snapshot.

Convergence itself is unchanged and stays bounded (<=200 records), idempotent (already-current skips zero-write),
journal-verified (survived settled execute-journal must confirm the record), and fail-closed (settled materialization
path only). No manual convergence is required for product correctness - the snapshot gate drives it automatically.

## Boundaries Held

- Durable gate, `post-apply-binding-hash-mismatch`, conflict runtime, `requireContext`, and the planned-unbind
  projection are unchanged.
- No fallback (`allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback`) and no bare `moveCanonicalChatFolderBinding`.
- `binding-mismatch` remains blocked; `productSyncReady:false`; WebDAV/cloud/relay/`fullBundle.v3` remains blocked; Chat
  Saving WebDAV/cloud/archive CAS remains blocked.
- No live Phase A / Phase B was run; no Desktop reload was performed.

## Live Retry Expectations

- Phase A unchanged (still `applied` with the composite durable gate).
- Phase B after restart: the first binding snapshot awaits the boot convergence one-shot;
  `store.folders.__lastF15SettledBindingRestartConvergenceResult` exposes `checkedCount` / `journalVerifiedCount` /
  `convergedCount` / `alreadyCurrentCount` / `skippedCount` / blockers. If the settled record + journal survived (they
  are SQLite-backed KV), convergence re-materializes the requested edge and `postRestartSnapshotHash ===
  requestedBindingHash`, `reconcileSurvivalProven:true`. If instead `checkedCount:0` / `journalVerifiedCount:0`, the
  exposed result pinpoints record-persistence vs journal-confirmation for the next slice - no longer a silent null.

## Verdict

BINDING F15 RESTART CONVERGENCE NON-EFFECT FIXED. Convergence now runs on the real startup/reload path, is awaited
before the binding snapshot reads canonical truth, and exposes a redacted last-result for live confirmation, while
staying bounded, idempotent, journal-verified, and fail-closed. A real Desktop restart/reload Phase B proof is still
required to confirm survival end-to-end.
