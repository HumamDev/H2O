# Real Transport W3.4b-3B-R3 Live Sacrificial Invocation

Verdict: W3.4b-3B-R3 FAIL-CLOSED BEFORE NETWORK. NO WEBDAV WRITE. NO CLEANUP.

The operator approval phrase was received:

`I approve W3.4b-3B-R3 live sacrificial invocation.`

The R3 invocation command was submitted once to `h2o_rt_first_write` under the
renewed approval and R3 receipt. The command failed closed during pre-network
validation, before creating the consumed/apply-intent marker and before sending
any WebDAV method.

## Timing

- invocationUtc: `2026-07-12T21:04:16Z`
- receiptExpiryUtc: `2026-07-15T20:00:00Z`
- renewedApprovalExpiryUtc: `2026-07-15T20:00:00Z`
- receiptNotExpiredAtInvocation:true
- expiryWithinRenewedApproval:true

## Anchors

- renewed operator approval: `714f80a458808550dc8fd59ee937837349f416da`
- W3.4b-2-R3 write-grade receipt: `8c3422965c1202099c7177d4e63c53cf2b72a422`
- W3.4b-2.5-R3 readiness: `bab94bc677f6e38417f4ced98c0bd2b7404fa756`
- W3.4b-3A gated live executor implementation: `3048ab2dba3f4cbff4ec199dbb36093975659b52`

## Invocation Result

- invocationResult: `fail-closed`
- failureStage: `pre-network-validation`
- h2oRtFirstWriteInvoked:true
- h2oRtFirstWriteInvokeCount:1
- liveInvocationCommandSubmitted:true
- networkAttempted:false
- consumedMarkerCreated:false
- consumedMarkerPathClass: `app-local-first-write-consumed-marker`
- receiptConsumed:false
- receiptInvoked:false
- tokenBurnOccurred:false
- gateSatisfied:false
- mockOnlyResult:true

## Blockers

- primaryBlocker: `real-transport-w3-first-write-payload-hash-mismatch`
- blocker: `real-transport-w3-first-write-payload-hash-mismatch`
- blocker: `real-transport-w3-first-write-commit-binding-mismatch`
- blocker: `real-transport-w3-write-grade-receipt-core-hash-mismatch`

The command did not proceed to the durable apply-intent marker or to the
approved WebDAV method sequence because the R3 receipt/request did not pass the
executor's pre-network receipt and payload validation.

## Receipt And Token Binding

- receiptCoreHash: `sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd`
- receiptGrade: `write-grade`
- maxInvocations:1
- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- oneShotTokenHash: `sha256:5c5b803c2612b94e0e6ceca999ebd1198eb4d2caff39909591aceaa74b1f3631`
- killSwitchTokenHash: `sha256:5cfb8c26eb9e5c14b05e140c708d1b9ac90df15714f8f51aea5f3307c491847a`
- tokenPrivateMaterialPresent:true
- tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`
- tokenPrivatePermissions:true
- tokenHashesMatchPrivateMaterial:true
- rawOneShotTokenPrinted:false
- rawKillSwitchTokenPrinted:false
- rawOneShotTokenCommitted:false
- rawKillSwitchTokenCommitted:false

## Registry Readiness Baseline

- registryPathSource: `app-local`
- writeGradeRegistryEligible:true
- credentialMaterialPresent:true
- writeGradeRegistryRefHash: `sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff`
- writeGradeRegistryHashBoundary: `descriptor-refs-only-excludes-private-material`

## Approved Sequence Status

- allowedMethodSequence: `PROPFIND, PUT, PUT, GET`
- methodsAttempted: `none`
- methodStatusCodes: `none`
- methodStatusFamilies: `none`
- targetPathCount:0
- createOnlyBehavior: `not-attempted`
- readBackHashMatch: `not-attempted`
- payloadHash: `sha256:7d9491ac8a547de8e9e7138d8408b8d609359e4f74b690960201d093e1aaf440`

No WebDAV request was sent. Therefore there are no live method status codes,
no remote object state change, no read-back response, and no create-only proof.

## Boundary Confirmations

- liveInvocationPerformed:false
- networkAttempted:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- forbiddenMethodUsed:false
- deleteCleanupPerformed:false
- cleanupPerformed:false
- archiveUserDataWritten:false
- fullBundleV3Started:false
- relayOutboxLedgerStoreMutation:false
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
- raw token material path not committed
- raw sacrificial path not printed or committed
- raw listing not printed or committed
- raw response body not printed or committed

## Next Step

W3.5 remains separate and blocked. A later phase must resolve the R3 receipt /
executor compatibility blockers before any live sacrificial WebDAV method can be
attempted again. This evidence does not authorize retry, cleanup, product
readiness, transport readiness, archive/fullBundle writes, or any additional
object.
