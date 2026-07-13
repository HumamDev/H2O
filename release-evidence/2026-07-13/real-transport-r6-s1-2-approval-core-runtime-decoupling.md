# R6-S1.2 Approval-Core Runtime Decoupling

## Scope

- parentS11: `d892be30ea91034f6ff4e0db7004c591d4e2f330`
- architectureVerdict: `C — REQUIRE S1.2 SCHEMA CORRECTION BEFORE A6`
- phase: `S1.2 only`
- s12AuthorizesExecution:false

## Defect

The S1 approval core duplicated the future final runtime commit from the receipt
runtime binding. That made the canonical A6 approval hash depend on V6 before
V6 could exist, while S2 must seal the A6 hash before V6. A future runtime would
therefore reconstruct a different approval core and fail closed for the wrong
reason.

## Correction

- approvalCoreFieldCount:7
- approvedFinalRuntimeCommitInApprovalCore:false
- approvedFinalRuntimeCommitInApprovalReconstruction:false
- approvedFinalRuntimeCommitInRuntimeBinding:true
- runtimeCommitBoundByCompleteReceiptHash:true
- runtimeCommitRemainsRequired:true
- requiredEmbeddedBuildGitShaRemainsRequired:true
- runtimeAndEmbeddedBuildGitShaEqualityChecksPreserved:true
- constrainedDescendantValidationPreserved:true
- approvalSchemaVersionChanged:false

The corrected canonical approval core contains exactly:

1. `schemaVersion`
2. `approvalArtifactIdentifier`
3. `mintUtc`
4. `expiryUtc`
5. `constrainedDescendantAuthorizationDescriptor`
6. `ceremonyPolicyIdentifier`
7. `e6Commit`

All seven fields remain required, non-optional, null-rejected,
unknown-field-protected, duplicate-key-protected, and canonically hashed.

## Hash Boundaries

- approvalHashDomain: `h2o.r6.approval-core.v1\n`
- receiptHashDomain: `h2o.r6.write-grade-receipt-core.v1\n`
- approvalHashIndependentOfFutureRuntimeCommit:true
- receiptHashSensitiveToRuntimeCommit:true
- approvalInputOrderIndependent:true
- everyApprovalCoreFieldHashSensitive:true

## Protected Runtime Comparison

- protectedBaseline: `d892be30ea91034f6ff4e0db7004c591d4e2f330`
- protectedRegionsCompared:10
- protectedRegionsByteIdentical:true
- registryOrCredentialSelectionChanged:false
- endpointOrRootResolutionChanged:false
- httpClientChanged:false
- redirectOrTimeoutPolicyChanged:false
- propfindPutGetConstructionChanged:false
- fourRequestStateMachineChanged:false
- consumedMarkerImplementationChanged:false
- markerBeforeFirstNetworkOrderingPreserved:true
- readinessImplementationChanged:false
- webdavUiOrTauriConfigurationChanged:false

## Approval And Burned-Receipt State

- R6_APPROVAL_GATE_SEALED:false
- R6_APPROVAL_COMMIT:empty
- R6_APPROVAL_ARTIFACT_HASH:empty
- r4BurnedDenialActive:true
- r5BurnedDenialActive:true
- burnedDenialBeforeParsingMarkerNetwork:true

## Offline Validation

- targetedS12Tests:2 passed, 0 failed
- completeR6Tests:14 passed, 0 failed
- realTransportTests:44 passed, 0 failed
- cargoCheck:passed
- directRustfmtCheck:passed
- s12PointInTimeValidator:passed
- gitDiffChecks:passed
- networkTestsExecuted:false

## Safety State

- networkRequestPerformed:false
- a6Created:false
- approvalGateSealed:false
- receiptMinted:false
- tokenGenerated:false
- consumedMarkerCreated:false
- invocationCommandProduced:false
- invocationPerformed:false
- productSyncReady:false
- transportReady:false
- rawPrivateMaterialRecorded:false

S1.2 authorizes nothing. A6 remains a separate reviewed phase and cannot begin
until S1.2 receives post-commit review and guarded integration.
