# Real Transport W3.4b-3B-R4 Live Sacrificial Invocation

Verdict: W3.4b-3B-R4 FAIL-CLOSED DURING PRE-WRITE PROPFIND. NO WEBDAV WRITE. NO CLEANUP.

The operator approval phrase was received:

`I approve W3.4b-3B-R4 live sacrificial invocation.`

The R4 invocation command was submitted exactly once to `h2o_rt_first_write`
under the renewed approval and R4 receipt. The command created the durable
apply-intent / consumed marker before network, then attempted only the approved
pre-write `PROPFIND` absence check. The provider returned `401`, so the
executor failed closed before any `PUT` or `GET`.

## Timing

- invocationUtc: `2026-07-12T22:32:38Z`
- receiptExpiryUtc: `2026-07-15T20:00:00Z`
- renewedApprovalExpiryUtc: `2026-07-15T20:00:00Z`
- receiptNotExpiredAtInvocation:true
- expiryWithinRenewedApproval:true

## Anchors

- renewed operator approval: `714f80a458808550dc8fd59ee937837349f416da`
- R3 binding mismatch diagnostic/fix: `d57fefebe66537ecbeac9ecf9ba56cf02f1b21dd`
- W3.4b-2-R4 write-grade receipt: `6e0f89f9e25baf15c7a254f8bc350d14df2eae98`
- W3.4b-2.5-R4 readiness: `159c21420723cadd28e42a64182ef57c3ffa1c1e`
- W3.4b-3A gated live executor implementation: `3048ab2dba3f4cbff4ec199dbb36093975659b52`

## Invocation Result

- invocationResult: `fail-closed`
- primaryBlocker: `real-transport-w3-first-write-auth-refused`
- failureStage: `PROPFIND pre-write absence check`
- h2oRtFirstWriteInvoked:true
- h2oRtFirstWriteInvokeCount:1
- liveInvocationCommandSubmitted:true
- liveInvocationPerformed:true
- networkAttempted:true
- mockOnly:false
- loopbackAttempted:false
- gateSatisfied:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false

## Receipt And Token Binding

- receiptCoreHash: `sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183`
- receiptGrade: `write-grade`
- maxInvocations:1
- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- oneShotTokenHash: `sha256:a1deea9c2850e013f9c88f3b5554458f75c3c839742eba737b3a0e6055d440a1`
- killSwitchTokenHash: `sha256:5b1c98e62f0cff5de31e9ff81f47083033b3e5592669def7c7dadde3691cda09`
- tokenPrivateMaterialPresent:true
- tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`
- tokenPrivatePermissions:true
- tokenHashesMatchPrivateMaterial:true
- rawOneShotTokenPrinted:false
- rawKillSwitchTokenPrinted:false
- rawOneShotTokenCommitted:false
- rawKillSwitchTokenCommitted:false

## Payload Binding

- payloadHash: `sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829`
- payloadHashMatchesExecutorDeterministicSentinel:true
- payloadByteMax:256
- rawPayloadPrinted:false
- rawPayloadCommitted:false

## Registry Readiness Baseline

- registryPathSource: `app-local`
- writeGradeRegistryEligible:true
- credentialMaterialPresent:true
- writeGradeRegistryRefHash: `sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff`
- writeGradeRegistryHashBoundary: `descriptor-refs-only-excludes-private-material`

## Consumed Marker

- consumedMarkerCreated:true
- consumedMarkerExists:true
- consumedMarkerPathClass: `app-local-first-write-consumed-marker`
- consumedMarkerPrivate:true
- consumedMarkerReceiptHashMatches:true
- consumedMarkerNetworkAttemptedFalse:true
- receiptConsumed:true
- receiptInvoked:true
- tokenBurnOccurred:true
- tokenExportIdSequenceBurn:false

The consumed marker records the pre-network apply-intent state by design. The
result-level invocation reached network only after that marker existed.

## Approved Sequence Status

- allowedMethodSequence: `PROPFIND, PUT, PUT, GET`
- methodsAttempted: `PROPFIND`
- targetPathCount:1
- method: `PROPFIND pre-write absence check`
  - statusCode:401
  - statusFamily: `4xx`
- putCreateOnlyFirstAttempted:false
- putCreateOnlySecondAttempted:false
- getReadBackAttempted:false
- createOnlyBehavior: `not-attempted`
- readBackHashMatch: `not-attempted`
- noAutomaticRetry:true

No `PUT` request was attempted. No read-back `GET` was attempted. No cleanup was
performed.

## Boundary Confirmations

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

W3.5 remains separate and blocked. The R4 receipt has been consumed by the
approved invocation attempt. Any future live attempt requires a separate phase
and fresh approval/receipt/token ceremony. This evidence does not authorize
retry, cleanup, product readiness, transport readiness, archive/fullBundle
writes, or any additional object.
