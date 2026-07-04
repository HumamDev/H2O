# Folder Sync - F28 S13: Sustained Multi-Surface Parity Proof

Verdict: **F28 S13 SUSTAINED MULTI-SURFACE PARITY PROVEN (EVIDENCE/VALIDATOR-ONLY)**.

This slice proves the F15-settled chat-folder binding repair path remains stable across the retained Desktop,
Chrome/native/mobile request-submission, render-mirror, restart-convergence, and multi-device read-only import surfaces.
It is evidence/validator-only: no product source was changed, no live Phase A/Phase B was rerun, no `productSyncReady`
flip happened, no WebDAV/cloud/relay or `fullBundle.v3` work started, and Chat Saving WebDAV/cloud/archive CAS remains
blocked/deferred.

## Commit Chain Reviewed

- F28 S9 live F15 restart-survival proof: `138f7e120e385b6b5f4dccccc97a73d5868fd112`.
- F28 S10 binding-mismatch reviewed repair path: `69e5a33d946f078761b4344b7ab35cda5b4a3bdb`.
- F28 S11 Chrome/native/mobile request-submission proof: `c9fcc08b3ed3ccab01f7923e68115d0524d52a60`.
- F28 S12 multi-device import/read-only proof: `df0323e2369a3ff72b42e585a71dc9a924601a80`.
- productSyncReady readiness decision after S9-S12: `32fc3c5f3086e834a0df5b5b8a0eeb0baf7aa99d`.

## F28 S13 Definition

F28 defines S13 as the **sustained multi-surface parity proof**:

- entry criteria: S12 done.
- exit criteria: sustained parity across Desktop + Chrome/native multi-device surfaces with drift auto-reconciled over
  re-runs, not a single snapshot.
- blocked boundaries: no `productSyncReady` flip until S14.

This S13 proof is therefore a retained-ladder parity proof over S9-S12 plus current source anchors, not a new writer.

## Surfaces Covered

- **Desktop Studio canonical**: S9 proves the F15-settled binding repair applied, survived full Desktop restart, and
  retained the requested canonical binding hash `sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.
- **Restart convergence / settled journal**: S9 proves convergence ran from `source:"init"`, journal-verified two settled
  records, found them already current, and performed zero re-materialization writes.
- **Duplicate replay / idempotency**: S9 proves duplicate replay was `status:"skipped"` with
  `canonicalBindingWriteCount:0` and `duplicateReplayZeroWrite:true`.
- **F11 render mirror boundary**: S10 proves `binding-mismatch` is routed to the reviewed F15-settled repair path while
  the F11 render mirror remains render-only (`noBindingRepair:true`) and keeps `binding-mismatch` in `blockedClasses`.
- **Chrome Studio / MV3 and native/mobile request contract**: S11 proves non-Desktop surfaces submit reviewed requests
  with `desktopApplyRequired:true`, `noLocalApply:true`, and no Chrome/native/mobile canonical binding mutation.
- **Multi-device import/read-only projection**: S12 proves `fullBundle.v2` carries the read-only canonical binding
  projection (`readOnlyProjection:true`) and chat-folder binding receipts as evidence, not repair commands.

## Parity Dimensions Checked

- Canonical Desktop `folder_bindings` hash and post-restart readback.
- Read-only binding projection and receipt export/import evidence.
- Reviewed request/receipt schema and apply gate retained.
- Duplicate replay zero-write posture when already current.
- Restart convergence no-op / already-current / journal-verified behavior.
- F11 render mirror no-write boundary.
- Chrome/native/mobile non-canonical request-submission posture.
- Multi-device import remains read-only and does not re-apply receipts.

## Drift Result

No active drift was found in the retained proof chain:

- Desktop canonical state survives restart at the requested S9 hash.
- Restart convergence is bounded and idempotent (`alreadyCurrentCount:2`, `convergedCount:0`, blockers/warnings empty).
- The reviewed repair path is the only canonical binding write path for `binding-mismatch`.
- Non-Desktop surfaces are proposers only and retain `desktopApplyRequired:true` / `noLocalApply:true`.
- Read-only bundle import/projection does not perform direct/bare binding mutation or receipt re-apply.

## Boundaries Held

- `productSyncReady:false` remains unchanged.
- No WebDAV/cloud/relay/`fullBundle.v3` started.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, planned-unbind projection, restart convergence, reviewed request
  path, and the F11 render-only boundary were not weakened.

## Next

S13 is complete. The next step is **F28 S14 final productSyncReady flip review** with explicit approval and exact source
diff/validator/evidence. S14 is not automatic, and WebDAV/cloud/relay remains a separate transport-readiness slice even
after any future productSyncReady decision.
