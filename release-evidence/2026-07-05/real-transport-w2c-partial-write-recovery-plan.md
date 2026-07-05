# Real Transport W2c Partial-Write Recovery Plan

Status: prepared operator artifact with pending hash bindings; not W2c live proof; not W2c PASS.

Anchors:
- W2c operator artifact prep/templates: ab82ba706d234ad1acf97810ed0deafb76436e78
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Artifact fields:
- recoveryPlanHash: PENDING_OPERATOR_HASH:recoveryPlanHash
- b5ConflictPolicyRefHash: PENDING_OPERATOR_HASH:b5ConflictPolicyRefHash
- b6SequenceExportRefHash: PENDING_OPERATOR_HASH:b6SequenceExportRefHash
- b3IdempotencyRefHash: PENDING_OPERATOR_HASH:b3IdempotencyRefHash
- b4OutboxBoundaryRefHash: PENDING_OPERATOR_HASH:b4OutboxBoundaryRefHash
- remoteRootRefHash: PENDING_OPERATOR_HASH:remoteRootRefHash
- candidatePayloadHash: PENDING_OPERATOR_HASH:candidatePayloadHash
- candidateBundleHash: PENDING_OPERATOR_HASH:candidateBundleHash
- manualCleanupStepsHash: PENDING_OPERATOR_HASH:manualCleanupStepsHash
- explicitRecoveryRequiredForUncertainWrite: true
- noBlindRetry: true
- verifyThenLedger: true
- killSwitchDisableFirstResponse: true
- remoteHashVerificationRequiredBeforeLedger: true
- noLedgerBeforeVerifiedRemoteWrite: true
- noExportIdMintBeforeVerifiedRemoteWrite: true
- noSequenceBurnBeforeVerifiedRemoteWrite: true
- manualCleanupStepsContainRawEndpointCredentialPath: false
- productSyncReady: false
- transportReady: false

Manual cleanup constraints:
- The first response to uncertain write outcome is kill-switch disable.
- No blind retry is allowed after partial, uncertain, or checksum-unverified write state.
- Verify remote hash first, then ledger only after reviewed verification.
- Manual cleanup steps are represented by hash-only evidence and do not include raw endpoint, credential, or path values.

Boundary assertions:
- This artifact is hash-only and contains no raw endpoint URL.
- This artifact contains no raw credential.
- This artifact contains no raw remote path.
- This artifact contains no payload body.
- This artifact contains no CAS key.
- fullBundle.v3 is not started or minted.
- a950 mutation is not authorized.
- Chat Saving CAS remains separate and blocked.
- No standing authority is created.
- No one-shot token is minted.
- No W2 receipt was generated.
- W2c live proof remains blocked until every PENDING_OPERATOR_HASH field is replaced by a real sha256:<64hex> value.
