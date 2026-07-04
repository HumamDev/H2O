# Folder Sync - Binding F15 Ledger / Journal / Restart-Survival Audit (Preflight)

Verdict: **DURABLE RECORDS SURVIVED, MATERIALIZATION DID NOT, AND THE SURVIVING CONSUMED LEDGER BLOCKS RECOVERY. A
LEDGER/JOURNAL-BACKED RESTART CONVERGENCE IS REQUIRED (COMPLEMENTS DURABLE-GATE HARDENING)**.

This is design-only preflight/audit. No product source was edited, no live retry was run, no Phase A/Phase B was
started, no Desktop reload was performed, no gate was bypassed or weakened, and no fallback was reintroduced. It is
scoped to the ledger/journal/restart-survival source audit and deliberately does NOT redesign the durable-gate itself
(a parallel prompt owns that); it only depends on the durable-gate ordering.

## Commit Chain

- F15 settled materialization implementation: `81de3a63`.
- F15 post-reload boot-writer pinning: `0c4c2128`.
- F15 durable-gate hardening preflight (parallel, referenced not duplicated): `e50db532`.

## Where Phase A Persists Each Artifact (Q1) - source-grounded

- **Binding repair consumed ledger / idempotency record**:
  `chrome.storage.local['h2o:studio:sync:ledger:v1']` (`LEDGER_KEY`), via `getLedger()` -> `readKv`/`writeKv`. The KV
  helpers are documented as "chrome.storage.local KV helpers (SQLite-backed on Desktop)". So on Desktop the ledger is
  persisted to the SQLite-backed KV shim.
- **F15 settlement journal / execute journal / receipt**:
  `appendExecuteJournalRow` (`execute-journal.tauri.js`) persists via `global.chrome.storage.local` - the same
  SQLite-backed KV shim on Desktop.
- **Materialization receipt**: NONE. `materializeSettledCanonicalChatFolderBinding` returns a transient
  `settled-binding-materialized` status; there is no persisted materialization-receipt table. The only durable record of
  a materialization is the `folder_bindings` row itself.
- **Final `folder_bindings` row**: the `folder_bindings` table in `sqlite:studio-v1.db` (via `plugin:sql|execute`).

## What Survives Restart (Q2-Q5) - source-grounded

- **Consumed ledger (Q3)**: SURVIVES. It lives in the SQLite-backed KV shim (`chrome.storage.local` on Desktop), so
  `idempotencyPersisted:true` is durable across restart. `bindingRepairAlreadyConsumed()` reads it back on the next boot
  and returns `consumed:true`.
- **F15 settlement / execute journal (Q4/Q5)**: SURVIVES. Same SQLite-backed KV shim.
- **`folder_bindings` row**: DID NOT survive - Phase B read the OLD hash (`rowCount:14`, `sqliteMatchesOld:true`).

**Key asymmetry**: the durable RECORDS (ledger says "consumed"; settlement journal says "settled to the NEW binding")
survived, while the materialized `folder_bindings` row reverted to OLD. This corroborates the persistence-boundary
problem (the `plugin:sql` `folder_bindings` write did not durably land) and, crucially, it means the surviving journal
still holds the correct NEW decision that could be re-materialized.

## Does Startup Reconcile Any Of These Into `folder_bindings`? (Q6)

**No.** `execute-resume-on-boot` does not write `folder_bindings` (no `bindChat`/`INSERT OR REPLACE`); no boot/init path
reads the settled F15 journal, the execute journal, or the consumed ledger and re-materializes `folder_bindings`. The
store `init()`/`reload()` are read-only. So the surviving settled decision is never converged into the reverted
canonical table.

## Should Startup Re-Materialize From The Settled F15 Journal? (Q7)

**Yes.** The settled F15 journal survived and encodes the NEW binding, while `folder_bindings` reverted. A boot-time
guarded convergence - "for each settled F15 binding decision, if canonical `folder_bindings` does not match, re-materialize
through the existing settled materialization path (durable + hash gated)" - would heal the Phase B revert using the
durable journal. This is not currently done.

## Does The Surviving Consumed Ledger Block Safe Replay/Reapply? (Q8) - CRITICAL, source-grounded

**Yes - the surviving ledger permanently blocks recovery.** In the handler, when the ledger survived
(`persisted.consumed === true`) it sets `effCtx.appliedKeys[idempotencyKey] = true`. Then
`classifyChatFolderBindingRepairConflict()` checks, as its FIRST rule, `if (appliedKeys[cleanString(req.idempotencyKey)])
return 'duplicate';` - BEFORE any current-canonical-state check (`currentFolderId`, `already-targeted`, etc.). The
handler maps `'duplicate'` to a `skipped` receipt with `canonicalBindingWriteCount:0`.

So after a false-positive durable success (Phase A consumed the ledger, the ledger survived restart, but
`folder_bindings` reverted), a replay of the SAME `idempotencyKey` is short-circuited to `duplicate` -> `skipped` and
never re-materializes. The reverted binding is stuck for that `idempotencyKey`; the surviving durable ledger actively
prevents self-healing. This is independent of, and not fixed by, the durable-gate hardening.

## Safest Recovery Model (Q9)

A combination, primarily boot-time journal convergence plus a ledger-dedup ordering fix:

- **C/E (primary)**: add a boot-time, guarded "settled F15 journal -> canonical `folder_bindings`" convergence. For each
  surviving settled binding decision, verify `folder_bindings`; if it diverged, re-materialize through the EXISTING
  settled materialization path (`materializeSettledCanonicalChatFolderBinding`), gated by the same durable + hash checks.
  The settled journal is the authority (E); no new receipt table is required (D is redundant since the journal already
  is the durable record).
- **Ledger-dedup ordering fix**: the ledger `duplicate` short-circuit must not fire when the current canonical state does
  NOT already satisfy the settled decision. Condition the `appliedKeys` -> `duplicate` result on the current
  `folder_bindings` matching the settled/requested edge, so a reverted-but-consumed binding is re-applied instead of
  skipped. After boot convergence re-materializes, the `duplicate` skip becomes correct because state then matches.
- **B (from the parallel durable-gate hardening)**: consume the ledger only after strict durable success - reduces how
  often divergence is created in the first place.
- **Not A alone** (never consume until cross-restart proof): cross-restart durability is not provable at consume time
  from JS/`plugin:sql` (parallel finding), so A would disable idempotency entirely; impractical.

## Should The Final Fix Merge Durable-Gate Hardening With This Convergence? (Q10)

**Yes - they are complementary and both belong in the final fix.**

- Durable-gate hardening (parallel prompt): prevents creating the divergence (do not declare durable / consume unless the
  write is truly confirmed) - minimizes reverted-but-consumed states.
- Ledger/journal restart convergence (this prompt): HEALS a divergence when it occurs (re-materialize from the surviving
  settled journal) AND removes the recovery-blocking behavior of the surviving ledger.

Neither alone is complete: hardening does not heal an already-reverted binding nor unblock the recovery-blocking ledger;
convergence without hardening tolerates avoidable divergence and false-positive consumes.

## Is This Task's Fix Required For Phase B, Or Only A Safety Net? (Q11) - explicit

**Required for Phase B survival and recoverability - not merely a safety net.** Because (a) cross-restart durability
cannot be proven at consume time from JS/`plugin:sql`, so `folder_bindings` can still revert after a consumed ledger, and
(b) the surviving ledger permanently blocks a same-key replay via the `classify` `duplicate` short-circuit, the reverted
binding is otherwise stuck forever. The boot-time journal convergence is the mechanism that actually restores the NEW
binding on restart (using the durable settled journal) and the dedup-ordering fix is what lets recovery proceed. Without
this task's fix, Phase B cannot survive even with a truthful durable gate.

## Files Likely To Change (for the eventual implementation)

- `src-surfaces-base/studio/sync/folder-sync.tauri.js` (the ledger-dedup ordering so `duplicate` is conditioned on
  current-state match; and/or a boot-time convergence entry point) and/or
- `src-surfaces-base/studio/store/folders.tauri.js` (a guarded boot convergence that re-materializes from the settled
  journal via the existing settled materialization path).
- No competing-writer files; no new fallback; no Rust unless a durable cross-boundary read is implemented plugin/Rust-side
  (that belongs to the parallel durable-gate track).

## Required Validators / Evidence For The Eventual Fix

- **Journal-convergence harness**: a surviving settled journal decision + a reverted `folder_bindings` -> boot convergence
  re-materializes the NEW edge through the settled path (durable + hash gated); no divergence remains.
- **Ledger-recovery ordering validator**: a consumed ledger key with a MISMATCHED current canonical state does NOT
  short-circuit to `duplicate`/`skipped`; recovery proceeds; a consumed key with a MATCHING state still returns
  `skipped` zero-write.
- **Static anchors + regression battery**: ledger/journal persistence backing; boot convergence entry; dedup ordering;
  gates and boundaries intact; full binding lane battery green.

Required evidence: `release-evidence/2026-07-01/folder-sync-binding-f15-ledger-journal-restart-convergence-implementation.md`.

## NO-GO Conditions

- Bypassing Phase B, or declaring reconcile-survival without a real post-restart equal-hash read.
- Weakening the durable gate or `post-apply-binding-hash-mismatch`; re-materialization must remain durable + hash gated.
- Consuming the ledger without at least strict durable success, or making the `duplicate` skip fire when current state
  does not match the settled decision (that is the recovery-blocking bug).
- `allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback` or bare legacy binding writes.
- `productSyncReady` flip, `binding-mismatch` unblock, WebDAV/cloud/relay/`fullBundle.v3`, or Chat Saving CAS drift.

## Boundaries Held

- No product source edited; no live Phase A/Phase B; no Desktop reload performed by this slice.
- `post-apply-binding-hash-mismatch`, the durable gate, the conflict runtime, `requireContext`, and the planned-unbind
  projection remain intact.
- No fallback; `binding-mismatch` remains blocked; `productSyncReady` remains false; WebDAV/cloud/relay remains blocked;
  Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Design the boot-time settled-journal -> `folder_bindings` convergence plus the ledger-dedup ordering fix (this prompt),
to be merged with the durable-gate hardening (parallel prompt) into a single restart-survival fix, with the
journal-convergence harness and the ledger-recovery ordering validator; get review before any implementation or live
retry.
