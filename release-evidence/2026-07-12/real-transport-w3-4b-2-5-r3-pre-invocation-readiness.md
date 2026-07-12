# Real Transport W3.4b-2.5-R3 Pre-Invocation Readiness

Verdict: W3.4b-2.5-R3 VERIFIED R3 PRE-INVOCATION READINESS ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.

This artifact records a final redacted readiness check for a future W3.4b-3B-R3
live sacrificial invocation using the renewed-approval W3.4b-2-R3 receipt. It
does not invoke `h2o_rt_first_write`, does not consume token material, and does
not perform network or write behavior.

## Validation Timing

- validationUtc: `2026-07-12T20:44:46Z`
- receiptNotExpiredAtValidation:true
- currentTimeCaveat: validator is time-sensitive; after `expiryUtc`, W3.4b-3B-R3 must not proceed without a fresh receipt/approval path.

## Receipt Readiness

- W3.4b-1-R2 renewed approval commit: `714f80a458808550dc8fd59ee937837349f416da`
- W3.4b-2-R3 receipt commit: `8c3422965c1202099c7177d4e63c53cf2b72a422`
- renewedApprovalArtifactHash: `sha256:e6c7df7a015f06807cb2dba7ae89f6dd085f33843a40a01c53ff2885b214b48b`
- receiptEvidence: `release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt.md`
- receiptCoreArtifact: `release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt-core.json`
- receiptCoreHash: `sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd`
- mintUtc: `2026-07-12T20:31:02Z`
- expiryUtc: `2026-07-15T20:00:00Z`
- renewedApprovalExpiryUtc: `2026-07-15T20:00:00Z`
- expiryWithinRenewedApproval:true
- receiptConsumed:false
- receiptInvoked:false

## Token Readiness

- oneShotTokenHash: `sha256:5c5b803c2612b94e0e6ceca999ebd1198eb4d2caff39909591aceaa74b1f3631`
- killSwitchTokenHash: `sha256:5cfb8c26eb9e5c14b05e140c708d1b9ac90df15714f8f51aea5f3307c491847a`
- tokenHashesPresent:true
- tokenPrivateMaterialPresent:true
- tokenPrivateMaterialPathClass: `out-of-repo-private-token-file`
- tokenPrivatePermissions:true
- tokenHashesMatchPrivateMaterial:true
- rawOneShotTokenPrinted:false
- rawKillSwitchTokenPrinted:false
- rawOneShotTokenCommitted:false
- rawKillSwitchTokenCommitted:false

## Registry Readiness

- appLocalRegistryExists:true
- registryPathSource: `app-local`
- writeGradeRegistryEligible:true
- registryOwnerOk:true
- registryPermissionOk:true
- registryFileOwner:true
- registryFilePrivate:true
- registryParentOwner:true
- registryParentPrivate:true
- credentialMaterialPresent:true
- privateFieldsPresent:true
- writeGradeRegistryRefHash: `sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff`
- writeGradeRegistryRefHashMatchesReceipt:true
- defaultPrivateLegacyWriteGradeEligible:false

## Refusal And Consumption Readiness

- h2oRtFirstWriteExists:true
- defaultRefusalStillWorks:true
- defaultRefusalBlocker: `real-transport-w3-write-grade-approval-missing`
- optionalLocalRefusalCheckSource: `W3.4a validator and cargo real_transport tests`
- consumedMarkerExists:false
- consumedMarkerPathClass: `app-local-first-write-consumed-marker`
- consumedMarkerNote: no W3.4b-R3 consumed marker has been created; W3.4b-3B-R3 must create the first durable apply-intent / consumed marker before any network send.
- w34b3bR3RequiresExplicitOperatorGo:true

## Boundary Confirmations

- liveInvocationPerformed:false
- h2oRtFirstWriteInvoked:false
- networkAttempted:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- forbiddenMethodUsed:false
- tokenBurnOccurred:false
- tokenExportIdSequenceBurn:false
- relayOutboxLedgerStoreMutation:false
- fullBundleV3Started:false
- archiveUserDataWritten:false
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
- raw sacrificial path not printed or committed
- raw listing not printed or committed
- raw response body not printed or committed

## Next Phase

W3.4b-3B-R3 can proceed only after explicit operator go. This readiness check
does not authorize background dispatch, product readiness, transport readiness,
cleanup, archive/fullBundle writes, or any object beyond the approved single
sacrificial probe object budget.
