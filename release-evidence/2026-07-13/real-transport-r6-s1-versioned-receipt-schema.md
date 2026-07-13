# R6-S1 Versioned Receipt Schema and Fail-Closed Dispatch

## Scope

- architectureDecision: `Claude-approved R6 architecture, S1 only`
- e6Parent: `6cb091c75c49191f2e8e751847c347d11b3fa0a6`
- schemaVersion: `h2o.r6.write-grade-receipt.v1`
- approvalSchemaVersion: `h2o.r6.approval.v1`
- receiptHashDomain: `h2o.r6.write-grade-receipt-core.v1\n`
- approvalHashDomain: `h2o.r6.approval-core.v1\n`
- s1AuthorizesExecution:false
- a6Created:false
- s2Completed:false

## Changed Paths

1. `apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs`
2. `release-evidence/2026-07-13/real-transport-r6-s1-versioned-receipt-schema.md`
3. `tools/validation/sync/validate-real-transport-r6-s1-versioned-receipt-schema.mjs`

## Historical Architecture Mapping

- historicalReceiptType: `WriteGradeReceipt`
- historicalReceiptBindingsType: `WriteGradeReceiptBindings`
- historicalReceiptDeserialization: optional/defaulted typed projection
- historicalReceiptHash: `write_grade_receipt_core_hash`
- historicalApprovalValidation: `validate_write_grade_receipt`
- historicalTokenValidation: `token_hash_matches`
- consumedMarkerCreation: `write_first_write_apply_intent_marker`
- liveCommand: `h2o_rt_first_write`
- firstLiveClientCall: `client.propfind_absence`
- findingUnknownHistoricalReceiptFieldsIgnored:true
- findingHistoricalBindingsOptional:true
- findingHistoricalHashUsesTypedDeserializedProjection:true
- findingHistoricalApprovalGateCompiledCommitOnly:true
- findingGenericSafeR6ApprovalMechanismPreviouslyAbsent:true

## S1 Design

- separateR6Type:true
- historicalTypeReinterpreted:false
- allR6StructsDenyUnknownFields:true
- securityBindingsRequiredAndNonOptional:true
- duplicateTopLevelKeysRejected:true
- duplicateNestedKeysRejected:true
- duplicateIdenticalKeysRejected:true
- floatingPointJsonRejected:true
- canonicalHashUsesValidatedTypedR6Value:true
- canonicalObjectKeysSorted:true
- strictUtcSeconds:true
- schemaDispatchBeforeTokenValidation:true
- schemaDispatchBeforeConsumedMarker:true
- schemaDispatchBeforeClientConstruction:true
- schemaDispatchBeforeNetwork:true
- historicalReceiptFallbackAllowed:false
- unknownSchemaFallbackAllowed:false
- r6TauriCommandRegistered:false

The consumed-marker policy uses the typed value
`canonicalR6ReceiptCoreHash`. This avoids a self-referential digest field while
requiring the future marker to bind the computed domain-separated canonical R6
receipt-core hash.

## Approval Gate

- R6_APPROVAL_GATE_SEALED:false
- R6_APPROVAL_COMMIT:empty
- R6_APPROVAL_ARTIFACT_HASH:empty
- historicalApprovalDb4AcceptedForR6:false
- historicalApproval714AcceptedForR6:false
- arbitraryReceiptSuppliedApprovalAccepted:false
- s1ApprovalGateResult: `real-transport-r6-approval-gate-unsealed`

S1 defines the strict R6 approval type and approval-core hash only. It does not
create A6 and does not seal an approval.

## Burned Receipt Denial

- r4ReceiptCoreHash: `sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183`
- r4ImmutableEvidenceSource: `release-evidence/2026-07-12/real-transport-w3-4b-2-r4-write-grade-receipt-core.json`
- r5ReceiptCoreHash: `sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57`
- r5ImmutableEvidenceSource: `release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt-core.json`
- burnedReceiptDenylistCompiled:true
- burnedReceiptDenialBeforeSchemaDispatch:true
- burnedReceiptDenialBeforeMarker:true
- burnedReceiptDenialBeforeNetwork:true
- historicalTokenMaterialCanReviveBurnedReceipt:false

## Protected Runtime Comparison

- protectedBaseline: `6cb091c75c49191f2e8e751847c347d11b3fa0a6`
- protectedRegionsCompared:10
- protectedRegionsByteIdentical:true
- registrySelectionChanged:false
- credentialSelectionChanged:false
- authorizationConstructionChanged:false
- httpClientChanged:false
- redirectOrTimeoutPolicyChanged:false
- urlConstructionChanged:false
- propfindPutGetConstructionChanged:false
- fourRequestStateMachineChanged:false
- consumedMarkerImplementationChanged:false
- markerBeforeFirstNetworkOrderingPreserved:true
- readinessImplementationChanged:false
- webdavUiChanged:false
- cargoOrTauriConfigurationChanged:false

## Offline Tests

- targetedR6RustTests:12 passed, 0 failed
- realTransportRustTests:42 passed, 0 failed
- duplicateKeyTestsPassed:true
- requiredFieldRemovalMatrixPassed:true
- requiredLeafHashSensitivityMatrixPassed:true
- downgradeTestsPassed:true
- burnedReceiptTestsPassed:true
- zeroPostPreflightCallbackOnFailureTestsPassed:true
- networkTestsExecuted:false

## Commit Gate

- s1RepositoryValidatorPassed:true
- e6ValidatorPassedAtPristineE6:true
- historicalExecutorValidatorPassedAtPristineE6:true
- historicalPropfindDiagnosticValidatorPassedAtPristineE6:true
- candidateE6ValidatorResult: `stale-point-in-time-path-scope-failure`
- candidateHistoricalExecutorValidatorResult: `stale-whole-file-forbidden-method-literal-scan`
- candidateHistoricalPropfindValidatorResult: `stale-whole-file-forbidden-method-literal-scan`
- commitAuthorized:false

The candidate failures are caused by historical validator scope assumptions:
the E6 validator permits only the original two E6 paths, and the two transport
validators reject the typed R6 forbidden-method declaration for `DELETE` even
though all ten protected request/network regions remain byte-identical to E6.
The phase requires an explicit exclusion approval before committing this
candidate.

## Safety State

- networkRequestPerformed:false
- approvalArtifactCreated:false
- receiptMinted:false
- oneShotTokenGenerated:false
- killSwitchTokenGenerated:false
- consumedMarkerCreated:false
- invocationCommandProduced:false
- productSyncReady:false
- transportReady:false
- rawPrivateMaterialRecorded:false

S1 authorizes nothing. A fresh A6 approval artifact and a reviewed S2 approval
seal are still required before any R6 receipt preparation or execution work.
