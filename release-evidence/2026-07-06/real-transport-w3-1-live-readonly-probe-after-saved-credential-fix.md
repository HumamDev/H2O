# Real Transport W3.1.7-R7 Live Read-Only Probe After Saved Credential Fix

Verdict: LIVE READ-ONLY PROBE COMPLETED; REMOTE-ROOT READINESS STILL NOT PROVEN.

This evidence records a live read-only WebDAV probe after the R6F saved
credential reuse fix. The probe used only the existing Rust
`h2o_rt_capability_probe` path and the W3.1 live read-only gate. It performed no
WebDAV/cloud/relay/CAS/file write and did not expose raw endpoint, credential,
authorization header, folder/root value, response body, private registry
content, or directory listing.

## Anchors

- R6F saved credential reuse behavior: `f74fde2d8f70ddb167a2f27aaa31d79d8747e508`
- R6E-FIX2 professional WebDAV form layout: `8c6632c88abbef7122d1b5bb708eb219c26e9899`
- R6B credential prepare proof status: `42af19455cd163e331c6e92498aa4066ca7b38f7`
- R5 exact read-only status-code diagnostic: `34ed66d78d2696e082d24fd9cb450a547887b25c`
- R4 after-folder-alignment probe evidence: `6c09741cdc324550986c4d1f542b19fc51274305`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`
- W3.1 Rust-only resolver substrate: `979e8a5ba3584d50ab18ae848645e1163d008eae`

## Prepared Registry Preflight

- registryPathSource: `default-private`
- descriptorRegistryRefHash: `sha256:ee7ca9946f0a04baa8d13a3b3d2909b8205de7854b8434badd5c000e322706c5`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`
- credentialMaterialPresent:true
- descriptor registry JSON parsed: true
- required private fields present: true
- endpoint no longer reserved-invalid-domain: true
- reachable candidate: true
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

## Probe Request

- command in scope: `h2o_rt_capability_probe`
- live read-only flag used: `liveReadOnlyProbe:true`
- live read-only gate used: `real-transport-w3-readonly-remote-root-probe`
- `h2o_rt_capability_probe` exists: true
- `h2o_rt_first_write` absent: true
- write command absent: true

Read-only methods attempted, names only:

- OPTIONS
- PROPFIND Depth 0
- HEAD root
- HEAD deterministic nonexistent child

Forbidden methods were not requested and not used:

- PUT performed: false
- DELETE performed: false
- MKCOL performed: false
- PROPPATCH performed: false
- MOVE performed: false
- COPY performed: false
- LOCK performed: false
- UNLOCK performed: false
- POST performed: false
- request body mutation sent: false

## Redacted Probe Result

- probeResult: fail-remote-root-readiness
- command status: `real-transport-readonly-capability-probe-ready`
- command-level pass: true
- full remote-root readiness pass: false
- blockers: none
- warnings: `real-remote-probe-readonly-only`
- networkAttempted:true
- remoteRootReachable:false
- rootExists:false
- rootEmpty:false
- child404Ok:false
- listingHash: `sha256:d089c8a9fc28e4e50223eb38c9409e362521be9380a37341304fbac7a4cd9e5f`
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- enqueuesRelay:false
- fullBundleV3Started:false
- mintsExportId:false
- burnsSequence:false
- productSyncReady:false
- transportReady:false
- rawPrivateFieldsLogged:false

Read-only method exact status codes and families:

- OPTIONS statusCode: `401`; statusFamily: `4xx`
- PROPFIND Depth 0 statusCode: `401`; statusFamily: `4xx`
- HEAD root statusCode: `401`; statusFamily: `4xx`
- HEAD deterministic nonexistent child statusCode: `401`; statusFamily: `4xx`

Redacted request-shape summary:

- OPTIONS targetShape: `endpoint-plus-folder`; trailingSlash:false; doubleSlash:false; authHeaderPresent:true; propfindDepthHeaderPresent:false; propfindBodyPresent:false
- PROPFIND Depth 0 targetShape: `endpoint-plus-folder`; trailingSlash:false; doubleSlash:false; authHeaderPresent:true; propfindDepthHeaderPresent:true; propfindBodyPresent:false
- HEAD root targetShape: `endpoint-plus-folder`; trailingSlash:false; doubleSlash:false; authHeaderPresent:true; propfindDepthHeaderPresent:false; propfindBodyPresent:false
- HEAD deterministic nonexistent child targetShape: `endpoint-plus-folder`; trailingSlash:false; doubleSlash:false; authHeaderPresent:true; propfindDepthHeaderPresent:false; propfindBodyPresent:false

## Diagnosis

The saved credential is present and was forwarded by the read-only probe path as
an authorization header presence boolean, but all attempted read-only operations
returned `401`. The most likely remaining blocker is still
auth/app-specific-token/scope for the prepared WebDAV credential. Because
authentication is rejected before any `2xx` read-only root response, this phase
does not prove remote-root reachability.

No unsafe method fallback was attempted. If the operator confirms the credential
source and scope, the next retry should remain read-only and continue using the
same hash-only resolver boundary. Request-shape fixes such as trailing slash or
PROPFIND body behavior remain secondary until auth is accepted.

## Boundary Confirmation

- no raw endpoint URL was printed or committed
- no username was printed or committed
- no credential, password, token, or authorization header was printed or committed
- no folder/root value or remote path was printed or committed
- no response body or raw server listing was printed or committed
- no private registry contents were printed or committed
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden WebDAV method was used
- no relay enqueue occurred
- no outbox/ledger/store mutation occurred
- no fullBundle.v3 start/mint occurred
- no token/export id mint occurred
- no sequence burn occurred
- `h2o_rt_first_write` remains absent
- no write command was added
- productSyncReady:false
- transportReady:false

## Phase Status

W3.1.7-R7 remains a command-level live read-only probe pass only. It is not a
full remote-root readiness pass because `remoteRootReachable:false`,
`rootExists:false`, and `child404Ok:false` were returned after the saved
credential fix.
