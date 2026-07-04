# Operational.5 - Orphan-Binding Cleanup Manual-Review Blocker Decision

Verdict: **MANUAL-REVIEW BLOCKER RECORDED - AUTOMATED TOMBSTONE-BACKED CLEANUP IS EXHAUSTED (LIVE DRY-RUN SAFE-FAILED,
`verifiedCount:0`); CONTROLLED APPLY REMAINS BLOCKED; DECISION = LEAVE DOCUMENTED DEBT AND KEEP `productSyncReady:false`
(route D), WITH MANUAL OPERATOR REVIEW OF THE TWO TOKENIZED ROWS AS THE NEXT SAFE ACTION (route A). `productSyncReady`
CANNOT FLIP WITH THE TWO DANGLING RAW CANONICAL ROWS UNRECONCILED.**

This slice is evidence/validator-only: no product source edited, no folders/chats/bindings/tombstones/ledgers/receipts/
import-export/render-mirror mutated, no `productSyncReady` flip, no WebDAV/cloud/relay/`fullBundle.v3`, no Chat Saving
CAS, no fallback, no cleanup apply, and no weakening of strict tombstone verification.

## Status Recap

- Cleanup command implemented: `9fdf2dab` (dry-run default; scoped exact-row delete only under the
  `operational5-orphan-binding-cleanup-apply` gate; strict exact + active tombstone verification).
- Tombstone verification fix/investigation: `221d91b6` (root cause + diagnostic tightened to the strict bar).
- Live dry-run (operator, Desktop Studio DevTools): `status:"dry-run-orphan-binding-cleanup-ready"`, `dryRun:true`,
  `candidateCount:2`, `verifiedCount:0`, `removedCount:0`, `skippedCount:2` (both `skipped-not-fully-tombstone-verified`),
  `rawCanonicalBindingCountBefore:14`, `rawCanonicalBindingCountAfter:14`, `exportableBindingCount:12`, no writes,
  `productSyncReady:false`.
- Candidate 1: no strict active folder tombstone AND no strict active folderBinding tombstone.
- Candidate 2: strict active folderBinding tombstone present, but NO strict active folder tombstone.

## Investigation Answers

### Q1 - Can `productSyncReady` flip with 2 dangling raw canonical rows that are export-filtered but not cleanup-verified?

**No.** Export-filtering only makes the `fullBundle.v2` projection match the exportable canonical subset
(`12 == 12`); it does NOT reconcile the source of truth. The raw canonical `folder_bindings` count is still `14` with
two unreconciled dangling rows. The Operational.5 flip gate
(`release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md` /
`tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`) and the post-live-parity readiness decision
(`operational5-product-sync-ready-readiness-decision-after-live-parity.md`, verdict
`KEEP productSyncReady:false / NOT FLIPPED`) both require **folder-sync source-of-truth reconciled and release-grade**
and **canonical count parity proven** before any flip. `match-with-known-debt` cleared the export parity issue but is
explicitly **not sufficient** to flip global `productSyncReady`. The dangling-row debt is a blocking local gate, not on
the flip gate's "what does not block" list (catalog CRUD / `fullBundle.v3` / WebDAV / archive CAS / multi-writer /
`tags.updated_at`). So `productSyncReady` stays `false`.

### Q2 - Exact blocker state

Two coupled blockers:

1. **Source-of-truth reconciliation debt**: raw canonical `folder_bindings` = `14`, exportable canonical subset =
   `12`, `fullBundle.v2` projection = `12`, known debt `rawCanonicalDanglingBindingsFilteredFromExport`. Raw != exportable
   means source-of-truth is not reconciled and raw-level canonical count parity is not proven -> `productSyncReady` flip
   gate BLOCKED.
2. **Automated cleanup exhausted**: the only automated reconciliation-by-cleanup path (the reviewed
   `operational5OrphanBindingCleanup`) safe-failed its live dry-run with `verifiedCount:0` because neither dangling row
   satisfies strict exact + active tombstone verification. So the debt cannot be cleared by the automated cleanup path
   as-is; it is now in a **manual-review-required** state.

Net: `blocked-manual-review-required` - controlled cleanup apply is blocked, and the source-of-truth debt that blocks
`productSyncReady` cannot be auto-resolved without manual operator review / stricter evidence.

### Q3 - Next route

**Chosen now: D + A.** Leave the documented debt in place and keep `productSyncReady:false` (D), and route the two
tokenized rows to **manual operator review** (A) as the next safe action. Controlled cleanup apply is NOT taken.

- **A (manual operator review of the two tokenized rows)** - next action. The read-only row-level diagnostic (strict,
  corrected in `221d91b6`) and the strict re-verify snippet already classify the rows with redacted tokens; a human
  decides per row.
- **D (leave documented debt, keep `productSyncReady:false`)** - the safe default holds until manual review concludes.
- **B (restore missing folder evidence)** - a POSSIBLE per-row outcome of manual review (esp. candidate 2, which has a
  binding tombstone but no folder tombstone: the folder may need reviewed restore - in which case the binding is
  legitimate and the row is NOT dangling and must NOT be cleaned). Reviewed + dry-run-first; not taken now.
- **C (reviewed tombstone-backed cleanup receipt after manual approval)** - only valid AFTER manual approval AND when
  LEGITIMATE strict tombstone evidence exists (produced by the real reviewed folder-delete / unbind path). Tombstones/
  receipts must NEVER be fabricated to force the gate to pass. Reviewed + dry-run-first; not taken now.
- **E (other non-destructive path)** - stricter evidence acquisition: trace each row's provenance (why is it dangling,
  is the chat live, was the folder ever deleted via a path that should have cascaded tombstones, is this a sync-merge
  artifact) read-only, before any B/C decision.

The next action is **manual review / stricter evidence acquisition, NOT cleanup apply**.

### Q4 - Evidence needed before any future cleanup apply

Before ANY future controlled apply of a dangling row, ALL of the following must hold (strict, non-weakened, non-broad):

- exact ACTIVE folder tombstone: `record_kind='folder'`, `record_id='folder:'+encodeURIComponent(folderId)`,
  `restored_at IS NULL` (via `store.tombstones.getTombstone`);
- exact ACTIVE folderBinding tombstone: `record_kind='folderBinding'`,
  `record_id='folderBinding:'+encodeURIComponent(chatId)+':'+encodeURIComponent(folderId)`, `restored_at IS NULL`;
- safe desktop-canonical row shape and folder genuinely absent from canonical folders;
- the tombstone evidence is LEGITIMATE (produced by the real reviewed folder-delete / unbind path), never fabricated to
  pass the gate; broad text / meta / receipt-field / substring matching is not accepted as proof;
- a manual operator review sign-off plus a reviewed tombstone-backed cleanup receipt;
- the cleanup runs dry-run FIRST and applies only under the explicit `operational5-orphan-binding-cleanup-apply` gate.
- For candidate 2 specifically, the missing folder tombstone must be resolved by manual review: either the folder is
  legitimately deleted (a real reviewed folder-delete tombstone exists) OR the folder should be restored (route B), in
  which case the row is not dangling and is not cleaned.
- For candidate 1, full provenance is required before any route, since it currently has no strict tombstone evidence at
  all.

### Q5 - Should the stale validators under `task_aea665fc` be cleaned now or kept separate?

**Keep separate.** The two stale validators (`validate-folder-sync-f15-sortorder-absorption-request-receipt-spec.mjs`
and `validate-folder-sync-s5-f11-sortorder-allowed-set-flip-preflight.mjs`) are post-S5 render-mirror/sortOrder
staleness, unrelated to the Operational.5 orphan-binding decision. They are already tracked under `task_aea665fc` for a
dedicated validator-only cleanup slice. Folding them into this decision slice would mix concerns and break the
commit-only-exact-decision-files discipline. Keep separate.

## Decision

- Automated tombstone-backed cleanup is EXHAUSTED for the current DB state (live dry-run safe-failed, `verifiedCount:0`).
- Controlled cleanup apply REMAINS BLOCKED (`blocked-manual-review-required`).
- The two dangling raw canonical rows are LEFT as documented source-of-truth debt; `productSyncReady` stays `false`.
- Next safe action: manual operator review of the two tokenized rows (read-only), then a reviewed, dry-run-first B/C/E
  decision if and only if legitimate strict evidence is acquired. No cleanup apply, no restore, no receipt mint here.
- `productSyncReady` cannot flip until the source-of-truth debt is reconciled or explicitly superseded by a reviewed
  source-of-truth readiness decision, followed by a separate dedicated flip slice.

## Boundaries Held

- No controlled cleanup apply run; no folder/chat/binding/tombstone/ledger/receipt/import-export/render-mirror mutation.
- `productSyncReady` remains `false`; not flipped.
- No WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving WebDAV/cloud/archive CAS.
- No fallback; strict tombstone verification not weakened; broad text matching not accepted as cleanup proof.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, the reviewed request path, and the F11
  render-mirror no-write boundary are unchanged.

## Next Step

Manual operator review of the two tokenized dangling rows (read-only), using the strict re-verify snippet from
`operational5-orphan-binding-cleanup-tombstone-verification-fix.md`. Only if manual review yields legitimate strict
tombstone evidence (or a reviewed folder restore) does a separate, reviewed, dry-run-first cleanup/restore slice reopen.
The `productSyncReady` flip review stays closed until the source-of-truth debt is reconciled or explicitly superseded.
