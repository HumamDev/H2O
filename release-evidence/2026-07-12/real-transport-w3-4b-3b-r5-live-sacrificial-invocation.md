# Real Transport W3.4b-3B-R5 Live Sacrificial Invocation

Verdict: W3.4b-3B-R5 FAIL-CLOSED BEFORE NETWORK. NO WEBDAV WRITE. NO CLEANUP.

The operator approval phrase was received:

`I approve W3.4b-3B-R5 live sacrificial invocation.`

The R5 invocation harness reached `h2o_rt_first_write` exactly once under the
renewed approval and R5 receipt. The command failed closed during pre-network
receipt validation before creating the durable apply-intent / consumed marker
and before sending any WebDAV method.

## Timing

- invocationUtc: `2026-07-12T23:33:49Z`
- receiptExpiryUtc: `2026-07-15T20:00:00Z`
- renewedApprovalExpiryUtc: `2026-07-15T20:00:00Z`
- receiptNotExpiredAtInvocation:true
- expiryWithinRenewedApproval:true

## Anchors

- renewed operator approval: `714f80a458808550dc8fd59ee937837349f416da`
- W3.5B parent-PROPFIND fix: `305ff023ad12f14b6a9b505dab4123cf44c7cfba`
- W3.4b-2-R5 write-grade receipt: `ad569f70f33c5610649e7da381045b08b6e32cd7`
- W3.4b-2.5-R5 readiness: `c3d4d1160cc63c8514dcd6877e9c81e20f1dca2b`
- W3.4b-3A gated live executor implementation: `3048ab2dba3f4cbff4ec199dbb36093975659b52`

## Invocation Result

- invocationResult: `fail-closed`
- failureStage: `pre-network-validation`
- h2oRtFirstWriteInvoked:true
- h2oRtFirstWriteInvokeCount:1
- liveInvocationCommandSubmitted:true
- liveInvocationPerformed:false
- networkAttempted:false
- consumedMarkerCreated:false
- consumedMarkerExists:false
- consumedMarkerPathClass: `app-local-first-write-consumed-marker`
- receiptConsumed:false
- receiptInvoked:false
- tokenBurnOccurred:false
- gateSatisfied:false
- mockOnlyResult:true

## Blockers

- primaryBlocker: `real-transport-w3-first-write-commit-binding-mismatch`
- blocker: `real-transport-w3-first-write-commit-binding-mismatch`
- blocker: `real-transport-w3-write-grade-receipt-core-hash-mismatch`

The command did not proceed to the durable apply-intent marker or to the
approved WebDAV method sequence because the R5 receipt/request did not pass the
executor's pre-network receipt and commit-binding validation.

## Receipt And Token Binding

- receiptCoreHash: `sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57`
- receiptGrade: `write-grade`
- maxInvocations:1
- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- oneShotTokenHash: `sha256:4e6056552d5d6afc7ac1bc89624957ef324eb64b353bae6b64942174d74785d4`
- killSwitchTokenHash: `sha256:0ee62ecc6a594c752942702197d79fe49fa35ec5b3363551d7648f0c15aae02e`
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

## Approved Sequence Status

- allowedMethodSequence: `PROPFIND, PUT, PUT, GET`
- methodsAttempted: `none`
- methodStatusCodes: `none`
- methodStatusFamilies: `none`
- targetPathCount:0
- putCreateOnlyFirstAttempted:false
- putCreateOnlySecondAttempted:false
- getReadBackAttempted:false
- createOnlyBehavior: `not-attempted`
- readBackHashMatch: `not-attempted`
- noAutomaticRetry:true

No WebDAV request was sent. Therefore there are no live method status codes,
no remote object state change, no read-back response, and no create-only proof.

## Boundary Confirmations

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
- tokenExportIdSequenceBurn:false
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

W3.5 final closeout remains separate and blocked. A later phase must diagnose
the R5 receipt/executor binding mismatch before any future live sacrificial
WebDAV method can be attempted. This evidence does not authorize retry, cleanup,
product readiness, transport readiness, archive/fullBundle writes, or any
additional object.
