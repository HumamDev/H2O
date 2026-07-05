# Real Transport W2c B8 Approval Artifact Template

Status: template only; not live approval; not W2c PASS.

Anchors:
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Purpose:
This template prepares the hash-only B8 approval artifact required before a future W2c first-write preflight proof can be attempted. Filling this template does not create standing authority, does not mint a token, does not generate a W2 receipt, and does not authorize W3.

Required hash-only fields to fill later:
- operatorIdHash: sha256:<operator-id-hash>
- reviewIdHash: sha256:<review-id-hash>
- approvedAtIso: <UTC ISO-8601 timestamp>
- b8ApprovalArtifactHash: sha256:<artifact-hash-placeholder>
- b8ApprovalRefHash: sha256:<approval-ref-hash>
- endpointRefHash: sha256:<endpoint-ref-hash>
- remoteRootRefHash: sha256:<remote-root-ref-hash>
- credentialRefHash: sha256:<credential-ref-hash>
- peerIdentityBindingHash: sha256:<peer-identity-binding-hash>
- localClientIdentityHash: sha256:<local-client-identity-hash>
- candidatePayloadHash: sha256:<candidate-payload-hash>
- candidateBundleHash: sha256:<candidate-bundle-hash>
- fullBundleV2EnvelopeHash: sha256:<fullbundle-v2-envelope-hash>
- scope: "real-webdav-cloud-relay-target"
- productSyncReady: false
- transportReady: false
- noA950Mutation: true
- noCleanupAuthority: true
- noFullBundleV3: true
- chatSavingCasSeparate: true
- noChatSavingCAS: true

Required operator assertions to fill later:
- approved: true only for the reviewed artifact, never as standing authority.
- reviewedRealTransportApplyApproved: true only for the reviewed artifact.
- realWebDAVCloudRelayApproved: true only for the reviewed artifact.
- privacyHashOnly: true.
- rawEndpointLogged: false.
- rawCredentialLogged: false.
- rawRemotePathLogged: false.
- rawPayloadBodyLogged: false.

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
