# Folder Sync - Binding-Mismatch Allowed-Set / productSyncReady Readiness Decision

Verdict: **BINDING REPAIR READINESS MET (S9 COMPLETE); KEEP `binding-mismatch` BLOCKED AND `productSyncReady` FALSE THIS
SLICE - THE NEXT STEP IS THE S10 REVIEWED ALLOWED-SET SLICE, NOT A `productSyncReady` FLIP, NOT WebDAV/cloud/relay**.

This is an evidence-only local readiness decision. No product source was edited, no `productSyncReady` flip was
performed, no `binding-mismatch` allowed-set change was made, no fallback was added, no WebDAV/cloud/relay was started,
and no Chat Saving CAS was touched. The decision is grounded in the F28 authoritative sequencing plan and the live
restart-survival closeout.

## Commit Chain

- F28 implementation sequencing plan (authoritative ordered gates): `folder-sync-f28-implementation-sequencing-plan.md`.
- F26 binding-repair implementation-readiness gate.
- productSyncReady readiness re-check after S5 (verdict NOT_READY; next lane = binding-mismatch repair / readiness).
- binding-mismatch repair implementation: `d4d5db19` (handler + minted receipt schema).
- F15 restart-survival implementation: `a28f2a5c`; restart convergence awaited/observable fix: `a6f8b978`.
- F15 live restart-survival closeout (Phase A + Phase B passed): `138f7e12`.

## Q1 - What exactly blocks `binding-mismatch`?

Two grounded facts:

1. **Source (F11 render mirror):** `rebuildRenderMirrorFromSqlite(...)` sets
   `blockedClasses: classSelection.blocked.concat(['binding-mismatch'])` and `noBindingRepair: true` /
   `noBindingWrite: true`. The F11 render-mirror rebuild is render-only and intentionally never performs binding repair;
   `binding-mismatch` is force-blocked there by design. Binding REPAIR is not done via the render mirror - it is the
   separate F15-settled `bindingRepair` request -> apply -> receipt path.
2. **Procedure (F28):** `binding-mismatch` is intentionally kept out of the reviewed repair path until step **S10**
   (`move binding-mismatch into the reviewed repair path`), whose entry criterion is **S9 done** and whose own boundary
   is `no flip until multi-surface proofs land`.

So `binding-mismatch` is not blocked by a missing capability - the F15-settled repair works and is live-proven - it is
gated by the ordered F28 sequence (S10 not yet executed) and correctly excluded from the render-only F11 mirror.

## Q2 - Does the F15 live restart-survival closeout satisfy the evidence to unblock?

It satisfies the **S9** exit criteria (binding live controlled apply + post-apply survival). The closeout (`138f7e12`)
proves:

- Phase A: `applied`, `canonicalBindingWriteCount:1`, `idempotencyPersisted:true`, `afterBindingHash ===
  requestedBindingHash`, `durableGate.durable:true`, duplicate replay zero-write.
- Phase B (post full restart): `postRestartSnapshotHash === requestedBindingHash`, `reconcileSurvivalProven:true`,
  convergence `source:"init"`, `checkedCount:2`, `journalVerifiedCount:2`, `alreadyCurrentCount:2`, `blockers:[]`.

This meets the S10 entry criterion (S9 done). It does NOT by itself satisfy S11 (multi-surface Chrome/native/mobile
submission proofs) or S12 (multi-device import/read-only proofs), which the F28 plan requires before any flip.

## Q3 - Remaining local blockers after S5 + F15 live-proof + durable hardening + restart convergence + duplicate zero-write

For **binding repair readiness**: NONE. The local binding-repair chain S5 -> S6 -> S7 -> S8 -> S9 is complete:

- S5 sortOrder allowed-set flip: done (`field-mismatch:sortOrder` no longer the active blocker).
- S6 binding receipt schema minted in source (`CHAT_FOLDER_BINDING_RECEIPT_SCHEMA`) - the earlier "receipt schema
  unminted" blocker is cleared.
- S7 Desktop validate/apply/receipt handler: implemented.
- S8 binding live dry-run proof: captured.
- S9 binding live controlled apply + restart-survival: LIVE-PROVEN (durable gate hardened; restart convergence
  live-proven; duplicate replay zero-write).

For **`productSyncReady`**: NOT cleared. Per F28, the flip is gated behind:

- **S10** move `binding-mismatch` into the reviewed repair path (a separate reviewed implementation+proof slice), and
- **S11** Chrome/native/mobile request-submission proofs, and
- **S12** multi-device import/read-only proofs.

S11/S12 involve non-Desktop surfaces and multi-device convergence and are NOT done; F28 S10 explicitly states `no flip
until multi-surface proofs land`.

## Q4 - Decision (A / B / C / D)

**A + D (evidence-only readiness decision, with a scoped blocker/next-step report):**

- **Not C (do not flip `productSyncReady`).** F28 requires S11 + S12 multi-surface/multi-device proofs before any flip
  (`no flip until multi-surface proofs land`); those are not done and are outside this Desktop slice. `productSyncReady`
  is also a hardcoded `false` flag across many receipts, not a single computed gate; flipping it is a broad,
  transport-coupled change with no readiness verdict authorizing it. The readiness re-check still returns `NOT_READY`.
- **Not B in this slice (do not move `binding-mismatch` into the allowed set here).** S10 is its own reviewed
  implementation phase with distinct exit criteria (`binding-mismatch` handled ONLY via the reviewed
  request -> apply -> receipt path) and its own validators/parity re-probe. A readiness DECISION slice does not perform
  the S10 source change; it records that S10 is now unblocked.
- **Decision recorded:** binding repair readiness is MET (S9 complete, all local binding-repair blockers cleared and
  live-proven). The next step is the **S10 reviewed allowed-set slice**. `binding-mismatch` stays blocked in F11 and
  `productSyncReady` stays `false` this slice. WebDAV/cloud/relay remains deferred (transport-only, separate) and is NOT
  the next step.

## Q5 - Exact minimal file + validator for the eventual S10 flip (identified, NOT executed here)

- File: `src-surfaces-base/studio/store/folders.tauri.js` - the F11 render-mirror allowed-set at
  `blockedClasses: classSelection.blocked.concat(['binding-mismatch'])`; S10 would move `binding-mismatch` handling into
  the reviewed request -> apply -> receipt repair path (not a free render-mirror allowance), keeping `noBindingRepair`
  scoping for the render mirror.
- Validator: the F11 allowed-set validator updated to reflect the gated reviewed-repair allowance, plus a sustained
  parity re-probe, per F28 S10 `validators/proofs`.
- This is a separate reviewed implementation+proof slice with `no flip until multi-surface proofs land`; it is not done
  in this decision slice.

## Boundaries Held

- No product source edited; `productSyncReady` not flipped; `binding-mismatch` not moved into the F11 allowed set.
- No fallback (`allowF7Fallback` / `f15AllowF7Fallback` / `explicitF7Fallback`) and no bare
  `moveCanonicalChatFolderBinding`.
- Durable gate, `post-apply-binding-hash-mismatch`, conflict runtime, `requireContext`, and the planned-unbind
  projection unchanged.
- `binding-mismatch` remains blocked in F11; `productSyncReady` remains `false`; WebDAV/cloud/relay remains blocked; Chat
  Saving WebDAV/cloud/archive CAS remains blocked.

## Conclusion

The F15-settled chat-folder binding repair is functionally complete and live-proven (S9 done): repair applies durably
in-session and survives a full restart. The readiness decision is to KEEP `binding-mismatch` blocked and
`productSyncReady` false in this slice; the next reviewed step is F28 S10 (move `binding-mismatch` into the reviewed
repair path), followed by S11/S12 multi-surface/multi-device proofs before any `productSyncReady` flip. WebDAV/cloud/relay
and Chat Saving CAS remain out of scope.
