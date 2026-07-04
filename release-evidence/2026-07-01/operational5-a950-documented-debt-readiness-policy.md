# Operational.5 - a950 Documented-Debt Readiness Policy

Verdict: **OPERATIONAL.5 A950 DOCUMENTED-DEBT POLICY - KEEP `productSyncReady:false`; DO NOT FLIP WITH A950 DEBT**.

This is a policy/design evidence slice only. It does not clean or mutate
`row:a950a44b859f`, does not delete or mutate folders, chats, bindings, tombstones, ledgers,
import/export state, or the render mirror, does not flip `productSyncReady`, does not start
WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving WebDAV/cloud/archive CAS.

## Current State

- fdd-only cleanup closeout and post-cleanup readiness decision:
  `bfbbd04302f9330d3e0e140d33e17ed5a2ed471f`.
- `row:fdd2456fc8a2` was removed exactly once.
- Remaining dangling raw canonical row: `row:a950a44b859f`.
- Current counts:
  - raw canonical bindings: `13`
  - exportable canonical bindings: `12`
  - `fullBundle.v2` bindings: `12`
  - dangling bindings: `1`
- `row:a950a44b859f` remains documented debt.
- `productSyncReady:false`.
- WebDAV/cloud/relay/`fullBundle.v3` remains blocked/deferred.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Decision Questions

### 1. Is raw-vs-exportable parity required before productSyncReady can flip?

Yes. The existing Operational.5 flip gate defines `productSyncReady` as the v1 single-canonical
local metadata sync model being release-grade. That gate requires:

- folder-sync source-of-truth reconciled and release-grade;
- canonical count parity proven;
- single-canonical authority respected;
- a dedicated explicit flip slice.

With `row:a950a44b859f` still present, raw canonical bindings are `13` while exportable canonical
bindings and `fullBundle.v2` bindings are `12`. That is not raw-level canonical count parity.

### 2. Is documented debt allowed as a productSyncReady exception?

No for global `productSyncReady`. Documented debt is useful for operator clarity and for keeping
export projections safe, but it is not enough to claim the global local sync product is release-grade.
The current gate says canonical count parity must be proven before a flip. It does not define a
documented-debt exception for raw canonical dangling rows.

### 3. If an exception is allowed, what invariant must hold?

An exception is not approved for global `productSyncReady` in this slice.

A narrower future concept could be considered, such as `localExportableSyncReady:true`, but it must
be a separate source/evidence design and not a silent reinterpretation of `productSyncReady`.

Minimum invariants for any future exportable-readiness exception would be:

- the row is non-exportable and quarantined from export;
- `fullBundle.v2` projection is clean;
- exportable canonical count matches `fullBundle.v2`;
- the row is documented and stable as debt;
- no cleanup authority exists or cleanup is intentionally deferred;
- raw canonical debt is still visible in diagnostics;
- no WebDAV/cloud/relay transport starts from that local exportable flag;
- global `productSyncReady` remains false unless a separate reviewed flip explicitly changes its semantics.

### 4. If an exception is not allowed, what is the exact blocker?

Exact remaining blocker: `row:a950a44b859f` remains as one raw canonical dangling
`folder_bindings` row with no strict cleanup evidence. Raw canonical count parity is still:

- raw canonical bindings: `13`
- exportable canonical bindings: `12`
- `fullBundle.v2` bindings: `12`

### 5. Final policy choice

Recommended product-level semantics:

- Keep `productSyncReady:false` until `row:a950a44b859f` is resolved or a later explicit policy
  changes the meaning of `productSyncReady`.
- Do not use `productSyncReady:true-with-documented-local-debt-exception`.
- If the product needs forward progress before a950 is resolved, introduce a separate future flag
  such as `localExportableSyncReady:true`, guarded by its own evidence, validators, and transport
  boundary. That flag must not start WebDAV/cloud/relay and must not imply global product readiness.

## WebDAV / Cloud / CAS

WebDAV/cloud/relay/`fullBundle.v3` cannot start next from this policy decision. Transport still needs
a separate transport-readiness lane after global readiness semantics are settled. Chat Saving
WebDAV/cloud/archive CAS remains blocked/deferred.

## Boundaries

- No cleanup or mutation occurred.
- `row:a950a44b859f` was not touched.
- Strict tombstone cleanup rules were not weakened.
- Broad text matching remains non-authoritative and not accepted as cleanup proof.
- No fallback was added.
- No product source was edited.
- `productSyncReady:false` remains.
- WebDAV/cloud/relay/`fullBundle.v3` remains deferred/not started.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Next Step

Recommended next slice: choose between continuing a950 provenance/cleanup review, or designing a
separate `localExportableSyncReady` policy and source contract that does not redefine
`productSyncReady` and does not start transport.
