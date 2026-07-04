# Operational.5 - localExportableSyncReady Design

Verdict: **OPERATIONAL.5 LOCAL EXPORTABLE SYNC READY DESIGN COMPLETE - DESIGN ONLY; `productSyncReady:false` REMAINS**.

This is a design/evidence slice only. It does not mutate product state, does not clean or mutate
`row:a950a44b859f`, does not delete or mutate folders, chats, bindings, tombstones, ledgers,
import/export state, or the render mirror, does not flip `productSyncReady`, does not start
WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving WebDAV/cloud/archive CAS.

## Current State

- a950 documented-debt readiness policy: `684ea497522b1804beb04fc3de0f5672b6901356`.
- fdd cleanup closeout and post-cleanup readiness decision:
  `bfbbd04302f9330d3e0e140d33e17ed5a2ed471f`.
- Remaining documented raw canonical debt: `row:a950a44b859f`.
- Current counts:
  - raw canonical bindings: `13`
  - exportable canonical bindings: `12`
  - `fullBundle.v2` bindings: `12`
  - dangling bindings: `1`
- Global `productSyncReady:false`.
- WebDAV/cloud/relay/`fullBundle.v3` remains blocked/deferred.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Existing Readiness Representation

`productSyncReady` is currently represented across multiple diagnostic/receipt/import/export/transport
surfaces. It is not one clean computed readiness object. The Operational.5 flip gate defines
`productSyncReady` as the v1 single-canonical local metadata sync model being release-grade, and
requires folder-sync source-of-truth reconciliation plus canonical count parity before a dedicated
flip slice.

Because `row:a950a44b859f` remains as documented raw canonical debt, `productSyncReady` cannot flip.
The safe design is a separate readiness marker for exportable local sync parity, not a reinterpretation
of global product readiness.

## Recommended Flag Name

Recommended name: **`localExportableSyncReady`**.

Rejected alternatives:

- `exportableCanonicalSyncReady`: technically precise but easy to read as canonical/global readiness.
- `productSyncReadyWithDebt`: rejected because it weakens the meaning of `productSyncReady`.
- `productSyncReady:true-with-documented-local-debt-exception`: rejected by the a950 policy.

`localExportableSyncReady` is clearer because it says:

- local: no WebDAV/cloud/relay/`fullBundle.v3`;
- exportable: only the exportable canonical subset and `fullBundle.v2` projection;
- sync ready: a readiness marker, not a writer, cleanup approval, or transport gate.

## Proposed Semantics

`localExportableSyncReady:true` may be considered in a future source implementation only when all of
the following are true:

1. Exportable canonical bindings equal `fullBundle.v2` binding projection.
2. Exportable canonical folders equal `fullBundle.v2` folder projection.
3. No exportable dangling bindings exist.
4. Remaining raw dangling rows, if any, are explicitly documented debt.
5. `row:a950a44b859f` remains non-exportable and quarantined from export.
6. Raw canonical debt remains visible in diagnostics and is not hidden.
7. No cleanup authority exists for the documented debt, or cleanup is intentionally deferred.
8. Strict tombstone cleanup rules remain unchanged.
9. `productSyncReady:false` remains unless a separate global readiness flip is later approved.
10. WebDAV/cloud/relay/`fullBundle.v3` remains blocked by separate global + transport gates.
11. Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.
12. The flag does not authorize folder/chat/binding/tombstone/ledger/import/export/render-mirror mutation.

Current local exportable facts after fdd cleanup:

- exportable canonical bindings: `12`
- `fullBundle.v2` bindings: `12`
- raw canonical bindings: `13`
- dangling raw canonical rows: `["row:a950a44b859f"]`
- `productSyncReady:false`

These facts support designing a future `localExportableSyncReady` marker, but this slice does not
implement it.

## Scope Recommendation

Recommended level: **product source-level diagnostic/readiness flag in a future slice**, not UI-only
and not evidence-only.

Reason:

- UI-only would risk divergent semantics.
- Evidence-only would not give runtime callers a stable contract.
- A source-level diagnostic flag can be validator-gated and can remain explicitly non-transport.

This flag may unblock local-only UI/operator progress such as showing that exportable local
`fullBundle.v2` parity is clean, but it must not enable transport, cloud, WebDAV, CAS, cleanup apply,
or global product sync readiness.

## Validator Requirements For Future Implementation

A future implementation validator must prove:

- `localExportableSyncReady:true` only when exportable canonical count/hash matches `fullBundle.v2`
  count/hash.
- raw canonical debt remains reported separately.
- `row:a950a44b859f` remains documented debt unless separately reconciled.
- no exportable dangling binding exists.
- strict tombstone cleanup verification remains unchanged.
- `productSyncReady:false` remains.
- WebDAV/cloud/relay/`fullBundle.v3` remains blocked/deferred.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.
- the flag cannot call cleanup, apply, import/export writes, render-mirror writes, or transport writes.

## Final Decision

Design approved for a future implementation prompt:

- Introduce `localExportableSyncReady` as a separate diagnostic/source-level readiness flag.
- Do not flip `productSyncReady`.
- Do not allow the flag to start WebDAV/cloud/relay or Chat Saving CAS.
- Do not mutate `row:a950a44b859f`.
- Keep global readiness closed until raw source-of-truth debt is resolved or an explicit future
  global readiness policy changes the definition of `productSyncReady`.

## Next Step

Recommended next slice: implement a minimal read-only diagnostic/source flag for
`localExportableSyncReady`, with validators proving it is non-transport, non-mutating, and separate
from global `productSyncReady`.
