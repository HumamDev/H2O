# Operational.5 - Source-of-Truth / Canonical Count Parity Preflight

Verdict: **OPERATIONAL.5 SOURCE-OF-TRUTH / CANONICAL COUNT PARITY PREFLIGHT REQUIRED**.

This slice starts the next local readiness gate after the F28 binding lane completed through S14. It is
evidence/validator-only: no product source was edited, `productSyncReady` was not flipped,
WebDAV/cloud/relay/`fullBundle.v3` was not started, and Chat Saving WebDAV/cloud/archive CAS remains
blocked/deferred.

## Completed F28 Chain

- F28 S9 live F15 restart-survival proof: `138f7e120e385b6b5f4dccccc97a73d5868fd112`.
- F28 S10 binding-mismatch reviewed repair path: `69e5a33d946f078761b4344b7ab35cda5b4a3bdb`.
- F28 S11 request-submission proof: `c9fcc08b3ed3ccab01f7923e68115d0524d52a60`.
- F28 S12 multi-device read-only import proof: `df0323e2369a3ff72b42e585a71dc9a924601a80`.
- F28 S13 sustained multi-surface parity proof: `f0d19294d958cc0a66a2c13c7f567e1a9a422039`.
- F28 S14 final productSyncReady review: `ceba8239b5d347024aca23aab55a92f4006fefc0`.

The F28 binding lane is clear for the reviewed F15-settled binding repair path. The remaining blocker
is the broader Operational.5 local product readiness gate, not `binding-mismatch`.

## Where Operational.5 Is Defined

Operational.5 is defined by:

- `release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md`
- `tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`

That gate defines `productSyncReady` as the local v1 single-canonical metadata sync readiness marker.
It explicitly excludes WebDAV/cloud transport, `fullBundle.v3`, identity/key/E2E runtime, and archive
package CAS. It still records two local blockers:

1. source-of-truth reconciliation not release-grade,
2. canonical count parity not proven.

## Source-of-Truth Reconciliation State

The source-of-truth split is anchored by:

- `release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md`
- `release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md`

F1 records Desktop SQLite `folders`, `folder_bindings`, tombstones, and recently deleted records as the
canonical owner. F1 also records `FOLDER_STATE_DATA_KEY`
(`h2o:prm:cgx:fldrs:state:data:v1`) as a render mirror, not the canonical source.

F2 makes the split detectable but not repaired. Its drift classes include:

- `missing-mirror-folder`
- `extra-mirror-folder`
- `field-mismatch:name`
- `field-mismatch:color`
- `field-mismatch:sortOrder`
- `tombstone-status-mismatch`
- `binding-mismatch`
- `desktop-sqlite-source-diverged`
- `stale-deferred-propagation`

F28 closed the binding repair lane and proved sustained binding parity, but it did not supersede the
whole F1/F2 source-of-truth and canonical count parity gate for folders, tombstones, mirrors,
import/export projections, request/receipt ledgers, and restart convergence records.

## Required Canonical Count Parity

The global readiness flip needs a current Operational.5 proof that the following surfaces agree or are
explicitly read-only/derived from Desktop canonical state:

- Desktop SQLite canonical folder rows.
- Desktop SQLite canonical `folder_bindings`.
- Desktop tombstone and recently deleted state.
- `FOLDER_STATE_DATA_KEY` render mirror rows and `items` binding projection.
- Chrome/MV3 projection and import diagnostics.
- `fullBundle.v2` export/import projection.
- Request/receipt ledgers, including chat-folder binding receipts.
- F15-settled restart convergence records and already-current/no-op state.

Minimum parity dimensions:

- canonical folder count and visible folder count,
- canonical folder id/order/hash,
- canonical binding row count and binding hash,
- mirror folder count and mirror item/binding projection count,
- tombstone/recently-deleted count and hash,
- exported `fullBundle.v2` folder/binding/receipt counts,
- imported read-only projection count,
- request/receipt ledger count and hash,
- restart convergence checked/already-current/materialized counts,
- duplicate replay zero-write posture when already current.

The UI/user-visible synced state must be based on confirmed canonical projection plus receipt/parity
state, not optimistic request success alone.

## productSyncReady False Literal Classification

The current `productSyncReady:false` posture is a combination of:

- true readiness blockers in folder sync/import/export/readiness diagnostics,
- diagnostic-only receipt fields that record a boundary for a specific proof or dry-run,
- transport/WebDAV/CAS boundaries that must remain false/deferred even after a future local readiness
  flip.

The future global flip cannot blindly change every literal. It must distinguish local folder readiness
markers from transport boundaries such as `webdav-transport-gates.js`, `fullBundle.v3`,
WebDAV/cloud/relay, and Chat Saving WebDAV/cloud/archive CAS.

## Preflight Decision

`productSyncReady` remains `false`.

WebDAV/cloud/relay cannot start from this preflight. Even after a future global local readiness flip,
WebDAV/cloud/relay needs a separate transport-readiness lane.

The next required slice is a canonical count parity read-only harness/validator. Source implementation
should happen only if the existing read-only surfaces cannot expose the required counts/hashes safely.

## Boundaries Held

- No product source edited.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and the F11 render-only boundary were not weakened.
- F11 render mirror was not changed into a writer.

## Recommended Next Step

Implement an Operational.5 canonical count parity read-only harness/validator that compares Desktop
canonical SQLite, render mirror, Chrome/MV3 projection, `fullBundle.v2` import/export projection,
request/receipt ledgers, and restart convergence records. Only after that proof passes should a
separate global productSyncReady flip review be considered. WebDAV/cloud/relay remains a later
transport-readiness lane.
