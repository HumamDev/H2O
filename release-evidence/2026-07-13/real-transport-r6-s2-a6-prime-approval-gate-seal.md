# Real Transport R6-S2 - Replacement A6' Approval-Gate Seal

S2 parent / replacement A6' commit: `b2de60b88aa750897948e504e6458d943bf83f3b`

Replacement A6' approval-core hash:
`sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`

## Expiry Gate

- a6PrimeMintUtc: `2026-07-13T17:10:31Z`
- a6PrimeExpiryUtc: `2026-07-15T17:10:31Z`
- s2EvidenceGeneratedUtc: `2026-07-13T17:32:16Z`
- clockSkewSeconds: `120`
- remainingSecondsAtGeneration: `171494`
- remainingSecondsAfterSkewAtGeneration: `171374`
- remintTrigger: `currentUtc + 120s >= 2026-07-15T17:10:31Z`

The replacement approval was unexpired under the 120-second fail-closed skew rule when this S2
candidate was generated. Expiry is not extended by sealing. If the remint trigger is reached before
later preparation or execution, this approval must be abandoned and replaced through a separately
reviewed ceremony.

## Exact Production Delta

Only these three compiled assignments change in
`apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs`:

- `R6_APPROVAL_GATE_SEALED`: `false` -> `true`
- `R6_APPROVAL_COMMIT`: `""` -> `"b2de60b88aa750897948e504e6458d943bf83f3b"`
- `R6_APPROVAL_ARTIFACT_HASH`: `""` ->
  `"sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13"`

Compiled state:

- approvalGateSealed: `true`
- compiledApprovalCommit: `b2de60b88aa750897948e504e6458d943bf83f3b`
- compiledApprovalArtifactHash:
  `sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`
- rustBytesOutsideThreeAssignmentsIdentical: `true`
- testBytesChanged: `false`

The historical A6 commit `892d88769c7897a9efe23e63aa2fb5a091ecaa64` and historical hash
`sha256:ead9927bcb249c2efcdff267c922aaa5b2deb1b6e4b6bb717e5524d34669095e`
are absent from the three compiled trust constants and remain permanently prohibited. Replacement
A6' is the sole trusted fresh R6 approval.

## Independent Approval-Core Verification

- canonicalMarkerPairs: `1`
- canonicalFieldCount: `7`
- canonicalByteLength: `412`
- approvalCoreHashDomain: `h2o.r6.approval-core.v1\n`
- independentlyRecomputedApprovalCoreHash:
  `sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`
- independentlyRecomputedHashMatchesCompiledHash: `true`
- approvalSchemaVersion: `h2o.r6.approval.v1`
- approvalArtifactIdentifier: `h2o.real-transport.r6.a6-prime.approval.20260713T171031Z`
- constrainedDescendantAuthorizationDescriptor:
  `h2o.r6.constrained-descendant-authorization.v1`
- ceremonyPolicyIdentifier: `h2o.r6.sacrificial-webdav-four-step.v1`
- e6Commit: `6cb091c75c49191f2e8e751847c347d11b3fa0a6`

## Preserved Runtime Invariants

- tcTest: `r6_synthetic_unsealed_gate_rejects_before_any_callback`
- tcTestUsesExplicitSealedFalse: `true`
- tcTestCallbackCount: `0`
- tcTestStateIndependent: `true`
- tcTestByteIdenticalToA6Prime: `true`
- protectedRegionsCompared: `10`
- protectedRegionsByteIdentical: `true`
- r4BurnedReceiptCoreHash:
  `sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183`
- r5BurnedReceiptCoreHash:
  `sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57`
- r4R5DenylistByteIdentical: `true`
- r4R5DenialOrderingUnchanged: `true`
- markerImplementationByteIdentical: `true`
- markerBeforeFirstNetworkCall: `true`
- runtimeSchemaHashGateLogicIdenticalOutsideConstants: `true`
- readinessImplementationByteIdentical: `true`

## Offline Validation

- replacementA6PrimeValidatorAtExactCommit: `passed`
- independentA6PrimeHashRecomputation: `passed`
- s2ValidatorCandidateMode: `passed`
- targetedStateIndependentGateTest: `1 passed, 0 failed`
- completeR6Tests: `14 passed, 0 failed`
- completeRealTransportTests: `44 passed, 0 failed`
- fullLibraryTests: `196 passed, 0 failed`
- cargoCheck: `passed`
- directRustfmtCheck: `passed`
- exactThreeConstantDeltaProof: `passed`
- gitDiffCheck: `passed`

All validation in this phase is offline. No network-capable diagnostic or executor was run.

## Safety State

- networkRequestPerformed: `false`
- receiptMinted: `false`
- oneShotTokenGenerated: `false`
- killSwitchTokenGenerated: `false`
- consumedMarkerCreated: `false`
- invocationCommandCreated: `false`
- liveInvocationAuthorized: `false`
- productSyncReady: `false`
- transportReady: `false`

S2 seals replacement A6' only for V6 and later R6 preparation. S2 is not the operator's live
approval and authorizes no live invocation. No receipt or token may be minted until V6 exists and is
accepted through its own separately reviewed phase.
