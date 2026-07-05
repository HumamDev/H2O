# Real Transport W2c Partial-Write Recovery Plan Template

Status: template only; not live approval; not W2c PASS.

Anchors:
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Purpose:
This template prepares the hash-only partial-write recovery plan required before a future W2c first-write preflight proof can be attempted. Filling this template does not generate a W2 receipt, does not mint a token, does not authorize W3, and does not execute transport.

Required hash-only fields to fill later:
- recoveryPlanHash: sha256:<recovery-plan-hash-placeholder>
- b5ConflictPolicyRefHash: sha256:<conflict-policy-ref-hash>
- b6SequenceExportRefHash: sha256:<sequence-export-ref-hash>
- b3IdempotencyRefHash: sha256:<idempotency-ref-hash>
- b4OutboxBoundaryRefHash: sha256:<outbox-boundary-ref-hash>
- remoteRootRefHash: sha256:<remote-root-ref-hash>
- candidatePayloadHash: sha256:<candidate-payload-hash>
- candidateBundleHash: sha256:<candidate-bundle-hash>

Required recovery semantics to fill later:
- explicitRecoveryRequiredForUncertainWrite: true.
- noBlindRetry: true.
- verifyThenLedger: true.
- killSwitchDisableFirstResponse: true.
- remoteHashVerificationRequiredBeforeLedger: true.
- noLedgerBeforeVerifiedRemoteWrite: true.
- noExportIdMintBeforeVerifiedRemoteWrite: true.
- noSequenceBurnBeforeVerifiedRemoteWrite: true.
- manualCleanupStepsHash: sha256:<manual-cleanup-steps-hash>
- manualCleanupStepsContainRawEndpointCredentialPath: false.
- productSyncReady: false.
- transportReady: false.

Manual cleanup description constraints:
- Describe steps by hashed target references only.
- Do not include raw endpoint, raw credential, raw remote path, payload body, or CAS key values.
- The first response to uncertain write outcome is kill-switch disable.
- Recovery remains explicit-recovery-required until reviewed hash-only evidence proves the remote state.

Forbidden in the filled artifact:
- productSyncReady:true is forbidden.
- transportReady:true is forbidden.
- realWebDAVTransportAvailable:true is forbidden.
- standingAuthority:true is forbidden.
- oneShotTokenMinted:true is forbidden.
- writesWebDAV:true is forbidden.
- enqueuesRelay:true is forbidden.
- fullBundleV3Started:true is forbidden.
- mintsExportId:true is forbidden.
- burnsSequence:true is forbidden.
- raw endpoint URL values are forbidden.
- raw credentials are forbidden.
- raw remote paths are forbidden.
- payload bodies are forbidden.
- CAS keys are forbidden.
- fullBundle.v3 start remains forbidden.
- a950 mutation authority is forbidden.
- Chat Saving CAS start or write authority is forbidden.

Boundary statement:
This template is not a live approval, not a W2c PASS, not a receipt, and not real write authority.
