# Real Transport W2c B8 Approval Artifact

Status: prepared operator artifact with pending hash bindings; not W2c live proof; not W2c PASS.

Anchors:
- W2c operator artifact prep/templates: ab82ba706d234ad1acf97810ed0deafb76436e78
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Artifact fields:
- schema: h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1
- approved: true
- reviewedRealTransportApplyApproved: true
- realWebDAVCloudRelayApproved: true
- scope: "real-webdav-cloud-relay-target"
- operatorIdHash: PENDING_OPERATOR_HASH:operatorIdHash
- reviewIdHash: PENDING_OPERATOR_HASH:reviewIdHash
- approvedAtIso: PENDING_OPERATOR_HASH:approvedAtIso
- b8ApprovalArtifactHash: PENDING_OPERATOR_HASH:b8ApprovalArtifactHash
- b8ApprovalRefHash: PENDING_OPERATOR_HASH:b8ApprovalRefHash
- endpointRefHash: PENDING_OPERATOR_HASH:endpointRefHash
- remoteRootRefHash: PENDING_OPERATOR_HASH:remoteRootRefHash
- credentialRefHash: PENDING_OPERATOR_HASH:credentialRefHash
- peerIdentityBindingHash: PENDING_OPERATOR_HASH:peerIdentityBindingHash
- localClientIdentityHash: PENDING_OPERATOR_HASH:localClientIdentityHash
- candidatePayloadHash: PENDING_OPERATOR_HASH:candidatePayloadHash
- candidateBundleHash: PENDING_OPERATOR_HASH:candidateBundleHash
- fullBundleV2EnvelopeHash: PENDING_OPERATOR_HASH:fullBundleV2EnvelopeHash
- productSyncReady: false
- transportReady: false
- noA950Mutation: true
- noCleanupAuthority: true
- noFullBundleV3: true
- chatSavingCasSeparate: true
- noChatSavingCAS: true
- privacyHashOnly: true
- rawEndpointLogged: false
- rawCredentialLogged: false
- rawRemotePathLogged: false
- rawPayloadBodyLogged: false

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
