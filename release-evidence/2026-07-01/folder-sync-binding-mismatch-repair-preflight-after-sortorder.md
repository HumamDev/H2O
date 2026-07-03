# Folder Sync - Binding-Mismatch Repair Preflight After sortOrder

Verdict: BINDING-MISMATCH REPAIR PREFLIGHT REQUIRED.

This preflight follows the productSyncReady readiness re-check committed in `93dd818f`
and the S5/F11 sortOrder-only allowed-set flip committed in `6bf420be`.

## Current Readiness Posture

The sortOrder lane is closed and no longer the active blocker:

- S2 local sortOrder lane is closed.
- S2b live projection passed.
- S5/F11 sortOrder-only allowed-set flip landed.

`productSyncReady` remains NOT READY after S5.

The remaining primary blocker is `binding-mismatch`.

`binding-mismatch` remains blocked.

The canonical Desktop binding repair/handler receipt schema remains unminted.

Binding repair handler is not implemented in this slice.

No product source changed in this slice.

WebDAV/cloud/relay remains blocked.

No `fullBundle.v3` was started.

Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Historical Binding Lane Groundwork

The following assets exist and are historical/spec/proof groundwork only. They do not make the
current product ready. They do not unblock `binding-mismatch`, and they do not mint the canonical
Desktop binding repair/handler receipt path.

| Phase | Evidence | Validator | Status in this preflight |
| --- | --- | --- | --- |
| F21 | `release-evidence/2026-06-25/folder-sync-f21-binding-mismatch-repair-readiness-audit.md` | `tools/validation/sync/validate-folder-sync-f21-binding-mismatch-repair-readiness-audit.mjs` | present; historical readiness audit groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F22 | `release-evidence/2026-06-25/folder-sync-f22-binding-repair-request-receipt-spec.md` | `tools/validation/sync/validate-folder-sync-f22-binding-repair-request-receipt-spec.mjs` | present; design/spec groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F23 | `release-evidence/2026-06-25/folder-sync-f23-binding-repair-envelope-conflict-matrix-harness.md` | `tools/validation/sync/validate-folder-sync-f23-binding-repair-envelope-conflict-matrix-harness.mjs` | present; envelope/conflict harness groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F24 | `release-evidence/2026-06-25/folder-sync-f24-binding-repair-apply-proof-harness.md` | `tools/validation/sync/validate-folder-sync-f24-binding-repair-apply-proof-harness.mjs` | present; apply-proof harness groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F25 | `release-evidence/2026-06-25/folder-sync-f25-binding-repair-negative-apply-proof-harness.md` | `tools/validation/sync/validate-folder-sync-f25-binding-repair-negative-apply-proof-harness.mjs` | present; negative-path proof groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F26 | `release-evidence/2026-06-25/folder-sync-f26-binding-repair-implementation-readiness-gate.md` | `tools/validation/sync/validate-folder-sync-f26-binding-repair-implementation-readiness-gate.mjs` | present; implementation-readiness gate groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F27 | `release-evidence/2026-06-25/folder-sync-f27-lane-status-readiness-ledger-v2.md` | `tools/validation/sync/validate-folder-sync-f27-lane-status-readiness-ledger-v2.mjs` | present; readiness ledger groundwork; direct validator currently fails on superseded pre-S5 source assertion |
| F28 | `release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md` | `tools/validation/sync/validate-folder-sync-f28-implementation-sequencing-plan.mjs` | present; sequencing-plan groundwork; direct validator currently fails on superseded pre-S5 source assertion |

The shared direct validator failure is:

- `source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch`

That failure is expected after S5 because `field-mismatch:sortOrder` is now allowed. It does not
mean binding repair is product-ready; `binding-mismatch` remains blocked.

## Required Next Lane

Next implementation lane must handle binding mismatch safely before `productSyncReady` can be
reconsidered.

That lane must decide whether to proceed with a binding-mismatch implementation-readiness review
or an implementation prompt. It must keep destructive folder/chat behavior blocked, preserve the
canonical Desktop authority model, and prove receipt/import/apply semantics before any
productSyncReady reconsideration.

The next step is not WebDAV/cloud.
