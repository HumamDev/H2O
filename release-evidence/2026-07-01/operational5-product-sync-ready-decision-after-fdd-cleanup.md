# Operational.5 - productSyncReady Decision After fdd Cleanup

Verdict: **OPERATIONAL.5 PRODUCTSYNCREADY DECISION AFTER FDD CLEANUP - KEEP `productSyncReady:false` / NOT FLIPPED**.

The fdd-only cleanup succeeded and reduced raw canonical `folder_bindings` from `14` to `13`.
However, `row:a950a44b859f` remains documented raw canonical dangling binding debt. The existing
readiness procedure does not authorize flipping global `productSyncReady` while raw canonical
source-of-truth debt remains unreconciled or explicitly superseded by a reviewed readiness decision.

## Inputs

- fdd cleanup live closeout: `operational5-fdd-orphan-binding-cleanup-live-closeout.md`.
- Manual-review blocker decision: `operational5-orphan-binding-cleanup-manual-review-blocker-decision.md`.
- Operational.5 live parity decision before cleanup:
  `operational5-product-sync-ready-readiness-decision-after-live-parity.md`.
- Operational.5 productSyncReady flip gate:
  `release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md`.
- F28 S9-S14 remain complete.

## Decision Questions

### 1. Can productSyncReady flip while `row:a950a44b859f` remains documented debt?

No. The readiness procedure still requires folder-sync source-of-truth reconciliation and canonical
count parity to be release-grade. After fdd cleanup, local parity is improved but still not raw-level
clean:

- raw canonical `folder_bindings`: `13`
- exportable canonical bindings: `12`
- `fullBundle.v2` binding projection: `12`
- remaining dangling row: `row:a950a44b859f`

`row:a950a44b859f` is still documented debt, not reconciled source-of-truth parity. Therefore
`productSyncReady` remains `false`.

### 2. Exact remaining blocker

Remaining blocker: `row:a950a44b859f` raw canonical dangling binding row remains present and
documented debt. Raw canonical source-of-truth count parity is still `13` raw vs `12` exportable /
`fullBundle.v2`.

### 3. Is a source flip authorized?

No source flip is authorized in this slice. No product source was edited for readiness. The next
readiness review can only reopen after either:

- `row:a950a44b859f` is reconciled by a reviewed, non-destructive-first path; or
- a separate explicit readiness review supersedes the remaining documented debt as non-blocking.

### 4. Can WebDAV/cloud/relay start next?

No. WebDAV/cloud/relay/`fullBundle.v3` still requires a separate transport-readiness lane after
global product readiness is resolved. This decision does not start transport.

## Boundaries

- No additional cleanup/mutation was performed by this decision slice.
- `row:a950a44b859f` was not touched.
- `productSyncReady:false` remains.
- WebDAV/cloud/relay/`fullBundle.v3` remains deferred/not started.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.
- No fallback was added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary remain unchanged.

## Next Step

Recommended next slice: decide the route for `row:a950a44b859f` documented debt. That can be either
continued documented-debt review, a stronger provenance search, or a separate reviewed readiness
decision that explicitly proves the remaining row no longer blocks global `productSyncReady`.
