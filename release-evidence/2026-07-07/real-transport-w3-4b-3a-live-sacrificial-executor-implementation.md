# Real Transport W3.4b-3A Live Sacrificial Executor Implementation

Verdict: W3.4b-3A IMPLEMENTED THE GATED LIVE SACRIFICIAL WEBDAV EXECUTOR PATH. NO LIVE INVOCATION. NO WEBDAV WRITE.

This phase adds the live executor substrate behind `h2o_rt_first_write` after the
W3.4b-3 blocked result:

- W3.4b-3 blocked invocation commit: `f305982d3000aef81664ed7b4ce4a681584de3df`
- blocker resolved in code: `real-transport-w3-4b-live-executor-not-implemented`
- W3.4b-3B remains the future explicit live invocation phase.

## Implementation Summary

- liveExecutorPathImplemented:true
- liveInvocationPerformed:false
- h2oRtFirstWriteStillRefusesByDefault:true
- defaultRefusalBlocker: `real-transport-w3-write-grade-approval-missing`
- loopbackMockProofStillSupported:true
- loopbackMockSequence: `PROPFIND 404, PUT 201, PUT 412, GET 200`
- networkAttemptedInThisPhase:false
- writesWebDAVInThisPhase:false

## Live Gate

- live gate: `real-transport-w3-4b-live-sacrificial-webdav-invocation`
- loopback gate remains: `real-transport-w3-4a-refused-first-write-loopback`
- live path requires `liveWebdavInvocation:true`
- live path rejects `mockOnly:true`
- loopback path still requires `mockOnly:true` and `loopbackMock:true`

## Pre-Network Validation

The live path validates all of the following before any network request can be
selected:

- receiptCoreHash
- receiptGrade: `write-grade`
- canonicalization: `json-sorted-keys-v1`
- receipt not expired
- expiry <= approval expiry
- maxInvocations:1
- requestBudget.createOnlyPutMax:2
- requestBudget.readbackGetMax:1
- requestBudget.otherMethods:0
- W3.4b-1 approval artifact binding
- W3.4b-2 receipt binding
- oneShotTokenHash match
- killSwitchTokenHash match
- kill switch enabled and fresh
- registryPathSource: `app-local` or eligible `env`
- default-private-legacy refused for write-grade
- writeGradeRegistryEligible:true
- owner/permission checks
- writeGradeRegistryRefHash match
- credentialMaterialPresent:true
- descriptor bindings match the app-local registry
- payloadHash match
- payloadByteMax <= 256

## Future Live Sequence

The only live network sequence implemented for a future W3.4b-3B invocation is:

1. `PROPFIND` pre-write absence check.
2. `PUT` create-only request #1 to the deterministic sacrificial object.
3. `PUT` create-only request #2 to the same object, expected `412`.
4. `GET` read-back once.

No other live method is selected by this path.

## Failure Rules

- missing approval refuses before network
- missing one-shot token refuses before network
- missing kill-switch token refuses before network
- token hash mismatch refuses before network
- kill switch disabled or stale refuses before network
- receipt core hash mismatch refuses before network
- expired or future receipt refuses before network
- app-local registry missing/ineligible refuses before network
- default-private-legacy registry refuses before network
- owner/permission failure refuses before network
- payload larger than 256 bytes refuses before network
- target exists on `PROPFIND` refuses before `PUT`
- redirect refuses; redirects are not followed
- `401` or `403` refuses with no credential retry
- timeout/drop after send is classified as remote-write-uncertain
- second `PUT` returning 2xx is classified as createOnlyBehavior:not-enforced
- read-back hash mismatch is classified as read-back mismatch

## Durable Apply-Intent Marker

- consumedMarkerCodeImplemented:true
- consumedMarkerExecutedInThisPhase:false
- markerActionOrder: marker is written before the future live network send.
- markerContentRedacted:true
- no real token/export-id/sequence burn occurred in this phase.

## Boundary Confirmations

- liveInvocationPerformed:false
- networkAttempted:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- forbiddenMethodUsed:false
- deleteCleanupPathAdded:false
- cleanupPerformed:false
- archiveUserDataWritten:false
- fullBundleV3Started:false
- relayOutboxLedgerStoreMutation:false
- tokenBurnOccurred:false
- productSyncReady:false
- transportReady:false

## Redaction Rules Observed

- raw endpoint not printed or committed
- raw folder/root not printed or committed
- raw username not printed or committed
- raw credential not printed or committed
- raw auth header not printed or committed
- raw private registry contents not printed or committed
- raw one-shot token not printed or committed
- raw kill-switch token not printed or committed
- raw listing not printed or committed
- raw response body not printed or committed

## Next Step

W3.4b-3B may perform the future explicit live invocation only after separate
operator approval. W3.4b-3A does not authorize background dispatch, cleanup,
archive/fullBundle writes, product readiness, transport readiness, or W3.5.
