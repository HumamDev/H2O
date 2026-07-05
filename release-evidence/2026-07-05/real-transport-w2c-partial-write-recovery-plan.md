# Real Transport W2c Partial-Write Recovery Plan

Status: hash-bound operator artifact ready for W2c live proof; not W2c live proof; not W2c PASS.

Anchors:
- W2c operator artifact prep/templates: ab82ba706d234ad1acf97810ed0deafb76436e78
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Artifact fields:
- recoveryPlanHash: sha256:3f2a029558aa8bd0f4fedfd5a460772bb150ef4f4284c000108dd83e0f4fbc9f
- b5ConflictPolicyRefHash: sha256:d4fca32bc33f0cb15c7720afe1f20d372f86b14ec5e5a822a9fab28d91eb99dd
- b6SequenceExportRefHash: sha256:b55003071030979f3fd295f071e53d527e33d025f8c7a0bc9de4865393040681
- b3IdempotencyRefHash: sha256:2b1a1e2bfffe41d657b1e4f63d4a721c5413b7a176b6712100ee56ad0159184a
- b4OutboxBoundaryRefHash: sha256:eff76aabf3c499d568b792c70cd8b62bae0f32f33299ed1e6432afa8a563a516
- remoteRootRefHash: sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45
- candidatePayloadHash: sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85
- candidateBundleHash: sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85
- manualCleanupStepsHash: sha256:97f758e7ff661f01325172e982adfd7fe50559ebd89a0a915ecf61944b659bfd
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
- W2c live proof remains blocked until the separate live proof slice runs.
- W3 remains blocked pending W2c live proof and later red-team review.

Repo-safe bindings:
- The B3, B4, B5, and B6 reference values are sha256 digests of their committed implementation evidence files.
- The candidate payload and bundle values are sourced from committed fullBundle.v2 transport-envelope live closeout evidence.
- Private bindings:
- The recovery plan, remote-root reference, and manual cleanup steps values were copied only as sha256:<64hex> digests from local private redacted artifacts.
- Private JSON artifacts were not copied into the repo.
