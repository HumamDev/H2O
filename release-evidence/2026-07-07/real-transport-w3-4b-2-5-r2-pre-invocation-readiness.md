# Real Transport W3.4b-2.5-R2 Pre-Invocation Readiness

Verdict: W3.4b-2.5-R2 VERIFIED REMINTED PRE-INVOCATION READINESS ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.

This artifact records a final redacted readiness check for a future W3.4b-3B-R2
live sacrificial invocation using the reminted W3.4b-2-R2 receipt. It does not
invoke `h2o_rt_first_write`, does not consume token material, and does not
perform network or write behavior.

## Validation Timing

- validationUtc: `2026-07-09T16:00:17Z`
- receiptNotExpiredAtValidation:true
- currentTimeCaveat: validator is time-sensitive; after `expiryUtc`, W3.4b-3B-R2 must not proceed without a fresh receipt/approval path.

## Receipt Readiness

- W3.4b-2-R2 receipt commit: `4b3f90fc45d8c07696c03afc031784e254f9a135`
- original W3.4b-2 receipt commit: `19b81af406b5d731035f7ec004d1eebbcb8beef3`
- W3.4b-3B missing-token fail-closed commit: `d4171915b30cef69ef53234ef12a533e8ed6e846`
- receiptEvidence: `release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt.md`
- receiptCoreArtifact: `release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt-core.json`
- receiptCoreHash: `sha256:38570bc5ef7e5f8eaabc4092d3878bc1194ae93cf41bf41377912d1fda88203d`
- mintUtc: `2026-07-09T15:01:52Z`
- expiryUtc: `2026-07-10T16:00:00Z`
- approvalExpiryUtc: `2026-07-10T16:00:00Z`
- expiryWithinApproval:true
- receiptConsumed:false
- receiptInvoked:false

## Token Readiness

- oneShotTokenHash: `sha256:1b49841cc56e1c6bb663fbf0547134ef6ae2007c1cf93330fd4130104b735e97`
- killSwitchTokenHash: `sha256:8e7fda833d2d0bf85fd64db12e45655436b799ec6a77b846e3faa9f4776ba9dc`
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
- consumedMarkerNote: no W3.4b-R2 consumed marker has been created; W3.4b-3B-R2 must create the first durable apply-intent / consumed marker before any network send.
- w34b3bR2RequiresExplicitOperatorGo:true

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

W3.4b-3B-R2 can proceed only after explicit operator go. This readiness check
does not authorize background dispatch, product readiness, transport readiness,
cleanup, archive/fullBundle writes, or any object beyond the approved single
sacrificial probe object budget.
