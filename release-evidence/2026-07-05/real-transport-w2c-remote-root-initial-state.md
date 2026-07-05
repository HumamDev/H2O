# Real Transport W2c Remote Root Initial-State Statement

Status: hash-bound operator artifact ready for W2c live proof; not W2c live proof; not W2c PASS.

Anchors:
- W2c operator artifact prep/templates: ab82ba706d234ad1acf97810ed0deafb76436e78
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Artifact fields:
- remoteRootRefHash: sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45
- endpointRefHash: sha256:b85e5a8516d5d28a15fc89c4914bfc50b213df8a0421de3a26f96837704c4ea3
- initialStateStatementHash: sha256:0260483c0c033aef5a8a8832390d8886042fecb8ac78c584006e125b55b511fb
- expectedEmptyOrListingHash: sha256:3e20363fd8b3780472d81000244070945e8a306fc76f1f43659ff87e2cb1c055
- remoteRootInitialStateHash: sha256:df8dda23a0a8afd8c1cbb30aa37c68ada06381528bfd6434f55f662dfe05b54e
- initialStateKind: operator-trusted-redacted-statement
- createOnlyBehavior: unknown
- etagBehavior: unknown
- ifNoneMatchBehavior: unknown
- readOnlyRemoteCheckPerformed: false
- rawUrlIncluded: false
- rawRemotePathIncluded: false
- rawListingIncluded: false
- productSyncReady: false
- transportReady: false

Boundary assertions:
- Remote-root evidence must be expected-empty or listing-hash only.
- Remote-root state is represented by an operator-trusted redacted statement; no read-only remote-root check was performed in this commit.
- Create-only, ETag, and If-None-Match behavior remain unknown.
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

Private bindings:
- The endpoint reference, remote-root reference, initial-state statement, listing summary, and remote-root initial-state values were copied only as sha256:<64hex> digests from local private redacted artifacts.
- Private JSON artifacts were not copied into the repo.
