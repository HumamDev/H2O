# Real Transport W2c Live Desktop First-Write Preflight Proof

Verdict: W2c verdict PASS.

## Anchors

- W2a expired expiryUtc fail-closed patch: `3c7e203eaa5d30c0198fa4977983e980f3658ac9`
- W2a execute:true fail-closed patch: `a613264e2c168ccb460ab4e7a8d81dca1f171d57`
- Final W2c operator artifact hashes bound: `079369002da07c80c5553cd064064960ba58ebab`
- W2b loader registration: `e3217aac1af7fe2e1d46fe86ea0025f197565d80`
- W2a first-write preflight substrate: `b08bb910791bdfd89c8a823da8987154787fd0d2`
- W1c Desktop Studio webview proof: `eebbb8745d5bf1dba3ec145009c1ba6ae5bac1a5`

## Runtime Proof Method

The proof was collected from the loaded Desktop Studio runtime DevTools
console. The proof was manual DevTools proof from the actual Desktop Studio
webview. No automated CDP proof is claimed in this evidence.

The preflight used committed W2c hash-bound operator artifacts. The operator
artifact validator status was
`W2C_OPERATOR_ARTIFACTS_HASH_BOUND_READY_FOR_W2C_LIVE_PROOF`.

The snippet called only:

- `H2O.Studio.sync.realTransportFirstWritePreflight.diagnose()`
- `H2O.Studio.sync.realTransportFirstWritePreflight.evaluateRealTransportFirstWritePreflight(request)`
- `H2O.Studio.sync.realTransportFirstWritePreflight.buildReceiptCore(result)`
- browser `crypto.subtle.digest` for external sha256 of `receiptCore`

No W3 implementation was started. No real transport write path was executed.

## Desktop Studio DevTools Result

```json
{
  "proofName": "W2c live Desktop Studio first-write preflight proof",
  "timestamp": "2026-07-05T22:18:24.629Z",
  "apiAvailable": true,
  "diagnoseOk": true,
  "validPreflightOk": true,
  "receiptCoreGenerated": true,
  "receiptCoreCanonicalization": "json-sorted-keys-v1",
  "receiptHash": "sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65",
  "firstWriteAuthorizationCandidate": true,
  "failClosedOk": true,
  "zeroWriteOk": true,
  "readinessOk": true,
  "rawMarkersNotEchoed": true,
  "remoteRootBehavior": {
    "createOnlyBehavior": "unknown",
    "etagBehavior": "unknown",
    "ifNoneMatchBehavior": "unknown"
  },
  "w3Blocked": true,
  "validStatus": "real-transport-w2-first-write-preflight-ready",
  "failClosedCases": [
    {
      "name": "wrongGate",
      "passed": true,
      "blocker": "real-transport-w2-wrong-gate",
      "zeroWriteOk": true
    },
    {
      "name": "applyTrue",
      "passed": true,
      "blocker": "real-transport-w2-apply-requested",
      "zeroWriteOk": true
    },
    {
      "name": "executeTrue",
      "passed": true,
      "blocker": "real-transport-w2-execute-requested",
      "zeroWriteOk": true
    },
    {
      "name": "expiredExpiryUtc",
      "passed": true,
      "blocker": "real-transport-w2-expiry-expired",
      "zeroWriteOk": true
    },
    {
      "name": "missingW1cProof",
      "passed": true,
      "blocker": "real-transport-w2-w1c-proof-missing",
      "zeroWriteOk": true
    },
    {
      "name": "missingB8Artifact",
      "passed": true,
      "blocker": "real-transport-w2-b8-artifact-missing",
      "zeroWriteOk": true
    },
    {
      "name": "productSyncReadyTrue",
      "passed": true,
      "blocker": "real-transport-w2-product-sync-ready-claim-rejected",
      "zeroWriteOk": true
    },
    {
      "name": "transportReadyTrue",
      "passed": true,
      "blocker": "real-transport-w2-transport-ready-claim-rejected",
      "zeroWriteOk": true
    },
    {
      "name": "localMockApproval",
      "passed": true,
      "blocker": "real-transport-w2-local-mock-approval-rejected",
      "zeroWriteOk": true
    },
    {
      "name": "rawEndpoint",
      "passed": true,
      "blocker": "real-transport-w2-raw-input-rejected",
      "zeroWriteOk": true
    },
    {
      "name": "casInput",
      "passed": true,
      "blocker": "real-transport-w2-cas-input-rejected",
      "zeroWriteOk": true
    },
    {
      "name": "fullBundleV3",
      "passed": true,
      "blocker": "real-transport-w2-fullbundle-v3-rejected",
      "zeroWriteOk": true
    },
    {
      "name": "payloadCountGreaterThanOne",
      "passed": true,
      "blocker": "real-transport-w2-scope-not-single-payload",
      "zeroWriteOk": true
    },
    {
      "name": "standingAuthorityTrue",
      "passed": true,
      "blocker": "",
      "zeroWriteOk": true
    },
    {
      "name": "oneShotTokenMintedTrue",
      "passed": true,
      "blocker": "",
      "zeroWriteOk": true
    }
  ],
  "finalVerdict": "PASS",
  "failures": []
}
```

## Proof Summary

- W2 preflight API was available in Desktop Studio runtime.
- `diagnose()` passed.
- Valid W2 first-write preflight passed.
- Valid preflight status was `real-transport-w2-first-write-preflight-ready`.
- `receiptCore` was generated.
- `receiptCoreCanonicalization` was `json-sorted-keys-v1`.
- External receipt hash was computed outside the W2a module:
  `sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65`.
- `firstWriteAuthorizationCandidate:true` was returned.
- The receipt is candidate-only, expiring, and single-invocation scoped.
- `standingAuthority:false` remained false.
- `oneShotTokenMinted:false` remained false.
- No token was minted.
- Raw/CAS markers were not echoed.
- Zero-write and readiness invariants held.
- `productSyncReady:false` remained false.
- `transportReady:false` remained false.

## Fail-Closed Cases

All fail-closed cases passed and preserved zero-write/readiness invariants:

- `wrongGate` -> `real-transport-w2-wrong-gate`
- `applyTrue` -> `real-transport-w2-apply-requested`
- `executeTrue` -> `real-transport-w2-execute-requested`
- `expiredExpiryUtc` -> `real-transport-w2-expiry-expired`
- `missingW1cProof` -> `real-transport-w2-w1c-proof-missing`
- `missingB8Artifact` -> `real-transport-w2-b8-artifact-missing`
- `productSyncReadyTrue` -> `real-transport-w2-product-sync-ready-claim-rejected`
- `transportReadyTrue` -> `real-transport-w2-transport-ready-claim-rejected`
- `localMockApproval` -> `real-transport-w2-local-mock-approval-rejected`
- `rawEndpoint` -> `real-transport-w2-raw-input-rejected`
- `casInput` -> `real-transport-w2-cas-input-rejected`
- `fullBundleV3` -> `real-transport-w2-fullbundle-v3-rejected`
- `payloadCountGreaterThanOne` -> `real-transport-w2-scope-not-single-payload`
- `standingAuthorityTrue` -> passed, flag stayed false, zeroWriteOk:true
- `oneShotTokenMintedTrue` -> passed, flag stayed false, zeroWriteOk:true

## Remote-Root Caveat

Remote-root behavior remains unknown:

- `createOnlyBehavior: unknown`
- `etagBehavior: unknown`
- `ifNoneMatchBehavior: unknown`

W3 remains blocked pending Fable red-team and byte-egress/remote-root risk
review.

## Boundaries Held

- `realWriteExecuted:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `enqueuesRelay:false`
- `realOutboxRowCreated:false`
- `relayOutboxTouched:false`
- `publicationLedgerTouched:false`
- `durableStoreCreated:false`
- `fullBundleV3Started:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `standingAuthority:false`
- `oneShotTokenMinted:false`
- `productSyncReady:false`
- `transportReady:false`
- no real WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn
