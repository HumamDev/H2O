# Real Transport W2c B8 Approval Artifact

Status: hash-bound operator artifact ready for W2c live proof; not W2c live proof; not W2c PASS.

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
- operatorIdHash: sha256:84ab3b2d702f3966a5e1b35f283218a6c53bcaf85288ad7cbf33fa13b577003d
- reviewIdHash: sha256:45f4270f059272f8c65e66a20f6a621e68bc541fd50058c383a0dc1b16276dbb
- approvedAtIso: sha256:45f4270f059272f8c65e66a20f6a621e68bc541fd50058c383a0dc1b16276dbb
- b8ApprovalArtifactHash: sha256:a501620c2c0e5915ac351ef8cb3d6dc1139b2892c107c6de4c5c318c1bf11984
- b8ApprovalRefHash: sha256:a501620c2c0e5915ac351ef8cb3d6dc1139b2892c107c6de4c5c318c1bf11984
- endpointRefHash: sha256:b85e5a8516d5d28a15fc89c4914bfc50b213df8a0421de3a26f96837704c4ea3
- remoteRootRefHash: sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45
- credentialRefHash: sha256:d096297999444a95e2df9b3e0ff36b84cb1f3fb8e754d207d0e8af3808dc4e19
- peerIdentityBindingHash: sha256:80bd1df04eb7c118f587f7640394190d529766adda7c3bcea24537c887871fdd
- localClientIdentityHash: sha256:5dd14409d749aee37b6e93a5337deff3ab4a1d9b838a968e1d8dca7a31563d89
- candidatePayloadHash: sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85
- candidateBundleHash: sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85
- fullBundleV2EnvelopeHash: sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85
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
- W2c live proof remains blocked until the separate live proof slice runs.
- W3 remains blocked pending W2c live proof and later red-team review.

Repo-safe bindings:
- The candidate payload, candidate bundle, and fullBundle.v2 envelope values are sourced from committed fullBundle.v2 transport-envelope live closeout evidence.
- Private bindings:
- The operator, review, approval artifact, target reference, credential reference, peer binding, and local client identity values were copied only as sha256:<64hex> digests from local private redacted artifacts.
- Private JSON artifacts were not copied into the repo.
