# Real Transport W2c Remote Root Initial-State Template

Status: template only; not live approval; not W2c PASS.

Anchors:
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Purpose:
This template prepares the hash-only remote-root initial-state statement required before a future W2c first-write preflight proof can be attempted. Filling this template does not generate a W2 receipt, does not mint a token, does not authorize W3, and does not execute transport.

Required hash-only fields to fill later:
- remoteRootRefHash: sha256:<remote-root-ref-hash>
- endpointRefHash: sha256:<endpoint-ref-hash>
- initialStateStatementHash: sha256:<initial-state-statement-hash-placeholder>
- expectedEmptyOrListingHash: sha256:<expected-empty-or-listing-hash>
- remoteRootInitialStateHash: sha256:<remote-root-initial-state-hash>

Required state fields to fill later:
- initialStateKind: "expected-empty" or "listing-hash".
- createOnlyBehavior: "unknown" or "verified".
- etagBehavior: "unknown" or "verified".
- ifNoneMatchBehavior: "unknown" or "verified".
- rawUrlIncluded: false.
- rawRemotePathIncluded: false.
- rawListingIncluded: false.
- productSyncReady: false.
- transportReady: false.

Required notes:
- Listing evidence must be represented only by hash.
- Endpoint and remote-root references must remain hash-only.
- Create-only, ETag, and If-None-Match behavior must be explicitly marked unknown or verified before W2c.

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
