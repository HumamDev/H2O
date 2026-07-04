# Folder Sync - Binding F15 Durable-Gate Hardening (Preflight)

Verdict: **DURABLE-GATE BUG PINNED: `durable:true` IS DECOUPLED FROM `matchesRequested`. HARDENING IS NECESSARY BUT
NOT SUFFICIENT FOR PHASE B RESTART-SURVIVAL**.

This is design-only preflight. No product source was edited, no live retry was run, no Phase A/Phase B was started, no
Desktop reload was performed, no gate was bypassed or weakened, and no fallback was reintroduced. It designs the
durable-gate hardening and states explicitly why the hardening alone does not fix Phase B restart survival.

## Commit Chain

- F15 settled materialization implementation: `81de3a63`.
- F15 post-reload revert vector preflight: `f2764d24`.
- F15 post-reload boot-writer pinning (durable-fence hypothesis): `0c4c2128`.

## Live Facts

Phase A passed in-session; Phase B (post-reload) failed with the old hash and `reconcileSurvivalProven:false`. The WAL
diagnostic after reload showed `checkpointLog:0`, `checkpointFrames:0`, `checkpointBusy:0` (no residual WAL), yet
`confirmCanonicalChatFolderBindingDurable()` returned `durable:true`, `canonicalBindingHash:` old hash,
`matchesRequested:false`. So `durable:true` can coexist with `matchesRequested:false`.

## Pinned Durable-Gate Bug (source-grounded)

In `confirmCanonicalChatFolderBindingDurable()` the `durable` field is set from the checkpoint fence ALONE and is not
combined with the hash match:

- `result.matchesRequested` is computed separately:
  `result.matchesRequested = !!result.canonicalBindingHash && !!reqHash && result.canonicalBindingHash === reqHash`.
- Then durability is assigned from the fence only: `if (fence && fence.durable === true) { result.durable = true; ... }`
  with no `&& result.matchesRequested` term.

Therefore a WAL checkpoint that returns `busy === 0` (fence `durable:true`) yields `result.durable:true` even when the
fresh canonical re-read hash does not equal the requested hash (`matchesRequested:false`). That is exactly the
post-reload diagnostic: fence confirmed, re-read = old, `durable:true` + `matchesRequested:false`.

The Phase A handler is currently protected against consuming on this state: it computes
`durableOk = durableConfirmation.durable === true && durableConfirmation.unverifiable !== true &&
durableConfirmation.matchesRequested === true` and returns `persistence-verification-failure` (zero ledger consume)
when `durableOk` is false. So the handler already requires `matchesRequested === true`; the bug is that the `durable`
FIELD itself is not truthful, which is unsafe for any caller that trusts `durable` alone.

## Answers To The Review Questions

- **Q1 (why durable:true with matchesRequested:false)**: `result.durable` is derived only from `fence.durable === true`
  (checkpoint `busy === 0`); `matchesRequested` is computed but never ANDed into `durable`.
- **Q2 (what durable success should require)**: ALL of - requested-hash match (`matchesRequested`), WAL checkpoint
  success (`fence.durable`), full merge / zero residual WAL (`checkpointLog === 0` and full
  `checkpointFrames`), and a fresh canonical re-read. Today only the checkpoint drives `durable`.
- **Q3 (should the handler require durable && matchesRequested)**: it ALREADY does
  (`durableOk` requires `matchesRequested === true`). Keep it explicit; also make the store's `durable` field a truthful
  composite so callers cannot be misled.
- **Q4 (does the API expose enough fields)**: YES - it exposes `durable`, `checkpointed`, `fenceInterpretation`,
  `checkpointBusy`, `checkpointLog`, `checkpointFrames`, `canonicalBindingHash`, `matchesRequested`. Callers can already
  distinguish: checkpoint-ok-but-hash-mismatch (`checkpointed:true`,`matchesRequested:false`),
  hash-ok-but-checkpoint-incomplete (`checkpointed:false`,`matchesRequested:true`), and full success
  (`durable:true`&&`matchesRequested:true`). The gap is only that `durable` is not the composite.
- **Q5 (cross-connection/reopen from JS/plugin SQL)**: not cleanly available. Only `plugin:sql|load` is used;
  tauri-plugin-sql pools connections by db URL, so a second `load` returns the SAME pooled connection, and a
  `close`+`load` would disrupt every store that shares `sqlite:studio-v1.db`. A genuinely independent main-file read
  (the true restart proxy) likely needs plugin/Rust support.
- **Q6 (second connection/process reading old main DB while current sees WAL)**: yes - that is precisely the WAL
  isolation concern; but from JS we cannot spawn that independent reader to verify durability across the boundary.

## Minimal Fix (Q7)

- **A (core)**: harden `confirmCanonicalChatFolderBindingDurable()` so `result.durable = fence.durable === true &&
  result.matchesRequested === true` (and see C). `durable:false` whenever `matchesRequested:false`. Keep the rich
  diagnostic fields so callers can still see WHY (checkpoint vs hash).
- **B**: keep the Phase A handler's `durable === true && matchesRequested === true` requirement explicit and robust (it
  is already present); do not regress it.
- **C**: in `bindingDurablePersistenceFence()`, require a full merge, not only `busy === 0`: a `busy === 0` TRUNCATE
  must also show the WAL fully flushed (`log === 0` and `checkpointed === 0`, i.e. WAL truncated) to be
  `checkpoint-confirmed`; a `busy === 0` with residual WAL becomes `partial-checkpoint-not-durable` (`durable:false`).
- **D**: add a cross-connection / reopen proof IF the plugin can provide an independent read of the main DB file; if it
  cannot (Q5), this is a separate plugin/Rust design and must not be faked from a pooled connection.
- **E**: add a post-restart survival harness (node:sqlite write -> close -> reopen -> re-read) that proves a settled
  write survives a connection reopen; this is the only local proof that exercises the restart boundary.

Files likely to change: `src-surfaces-base/studio/store/folders.tauri.js` (the `confirmCanonicalChatFolderBindingDurable`
composite + the fence full-merge criterion) and the busy-aware fence / durable-gate validators. The handler already
enforces `matchesRequested`; no `folder-sync.tauri.js` behavior change is required beyond keeping that assertion. No
competing-writer files; no Rust unless the cross-connection reopen proof (D) is implemented plugin/Rust-side.

## Does This Fix Phase B Survival, Or Only Prevent A False Phase A Pass? (Q8 - explicit)

**A + B + C only prevent false-positive durable declarations. They do NOT, by themselves, fix Phase B restart
survival.** In Phase A the in-session `matchesRequested` was TRUE (the same-connection re-read matched the requested
hash) and the checkpoint returned `busy === 0`, so a composite `durable = fence.durable && matchesRequested` rule would
STILL have declared `durable:true` and applied - and the write STILL would not have survived restart. The restart-
survival failure is a persistence-BOUNDARY problem: a same-connection in-session confirmation cannot prove cross-restart
durability, because the writing connection sees its own WAL/committed state regardless of whether the main DB file that
a fresh process opens will contain the write.

Therefore:

- The hardening is **necessary**: it makes `durable` truthful, eliminates the `durable:true`/`matchesRequested:false`
  false-positive class, and is a prerequisite for any correct boundary proof.
- The hardening is **not sufficient** for Phase B: fixing restart survival requires a genuine cross-connection / reopen
  proof (D) - not available cleanly from JS/plugin SQL today (Q5) - or resolving the underlying persistence so a
  full-merge checkpoint truly lands in the main file a fresh open reads. That is a separate, larger design gated on the
  live durability diagnostic and possibly plugin/Rust support.

Do NOT declare Phase B survival on the strength of this hardening; keep Phase B blocked until a real post-restart
equal-hash read (or a reopen-boundary proof) passes.

## Required Validators / Evidence For The Eventual Fix

- **Durable composite validator**: `confirmCanonicalChatFolderBindingDurable` returns `durable:false` whenever
  `matchesRequested:false`, whenever the checkpoint is not full-merge, and whenever the fence is unverifiable; `durable:true`
  only on fence-durable + full-merge + matchesRequested; the handler consumes the ledger only then.
- **Reopen-survival harness (node:sqlite)**: write -> close -> reopen -> re-read equals requested; a write left only in a
  discarded WAL fails the reopen read (proves the harness catches the Phase B class).
- **Static anchors + regression battery**: composite `durable`; fence full-merge; hash gate before durable before ledger
  consume; no fallback; boundaries intact; full binding lane battery green.

Required evidence: `release-evidence/2026-07-01/folder-sync-binding-f15-durable-gate-hardening-implementation.md`.

## Live Retry Conditions After The Fix

- Phase A passes only when `durable:true` (composite: fence full-merge + matchesRequested) AND the handler consumes the
  ledger only then.
- Phase B: after restart `postReloadSnapshotHash === requestedBindingHash` and `reconcileSurvivalProven:true` - which
  requires the SEPARATE restart-survival fix, not just this hardening.
- Any non-full-merge or hash-mismatch durable check returns `persistence-verification-failure` with zero ledger consume.

## NO-GO Conditions

- Bypassing Phase B, or declaring reconcile-survival without a real post-restart equal-hash read / reopen proof.
- Weakening `post-apply-binding-hash-mismatch` or the durable gate. (This change only STRENGTHENS the durable gate.)
- Faking a cross-connection proof from a pooled connection.
- `allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback` or bare legacy binding writes.
- `productSyncReady` flip, `binding-mismatch` unblock, WebDAV/cloud/relay/`fullBundle.v3`, or Chat Saving CAS drift.

## Boundaries Held

- No product source edited; no live Phase A/Phase B; no Desktop reload performed by this slice.
- `post-apply-binding-hash-mismatch`, the durable gate, the conflict runtime, `requireContext`, and the planned-unbind
  projection remain intact (the recommended change strengthens the durable gate only).
- No fallback; `binding-mismatch` remains blocked; `productSyncReady` remains false; WebDAV/cloud/relay remains blocked;
  Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Design the durable composite + fence full-merge hardening (A+B+C) with the durable-composite validator and the
node:sqlite reopen-survival harness (E), and - separately, gated on the live durability diagnostic - the cross-boundary
restart-survival proof (D). Get review before any product-source implementation or live retry.
