# Real Transport W3.1.7-R5 Read-Only Status Code Diagnostic

Verdict: DIAGNOSIS COMPLETE; REMOTE-ROOT READINESS STILL NOT PROVEN.

This evidence records exact HTTP status codes and redacted request-shape classes
for the W3.1 live read-only WebDAV probe. The diagnostic used only the existing
Rust `h2o_rt_capability_probe` path and the W3.1 live read-only gate.

## Anchors

- W3.1.7-R4 after-folder-alignment probe evidence: `6c09741cdc324550986c4d1f542b19fc51274305`
- W3.1.7-R2 root reachability diagnostic: `54a193a952f20ae8cac2f52b3a6010ed2b66d2e0`
- W3.1.7 live read-only WebDAV probe evidence: `39206f4f505c198218570ded66a7da05270fa58c`
- W3 WebDAV setup UX aligned with native extension: `2ec8a465a4393c31d75536d9cea974d76ff528cf`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`

## Prepared Registry Hashes

- pathSource: default-private
- descriptorRegistryRefHash: `sha256:ee7ca9946f0a04baa8d13a3b3d2909b8205de7854b8434badd5c000e322706c5`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`

## Exact Status Codes

- OPTIONS statusCode: `401`
- OPTIONS statusFamily: `4xx`
- PROPFIND Depth 0 statusCode: `429`
- PROPFIND Depth 0 statusFamily: `4xx`
- HEAD root statusCode: `429`
- HEAD root statusFamily: `4xx`
- HEAD deterministic nonexistent child statusCode: `429`
- HEAD deterministic nonexistent child statusFamily: `4xx`

## Redacted Request Shape

All attempted requests were redacted as:

- targetShape: `endpoint-plus-folder`
- doubleSlash: false
- authHeaderPresent: true
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

Per-method shape:

- OPTIONS trailingSlash:false
- OPTIONS propfindDepthHeaderPresent:false
- OPTIONS propfindBodyPresent:false
- PROPFIND Depth 0 trailingSlash:false
- PROPFIND Depth 0 propfindDepthHeaderPresent:true
- PROPFIND Depth 0 propfindBodyPresent:false
- HEAD root trailingSlash:false
- HEAD root propfindDepthHeaderPresent:false
- HEAD root propfindBodyPresent:false
- HEAD deterministic nonexistent child trailingSlash:false
- HEAD deterministic nonexistent child propfindDepthHeaderPresent:false
- HEAD deterministic nonexistent child propfindBodyPresent:false

## Native/Mobile Comparison

The mobile WebDAV test implementation uses these comparable non-secret request
semantics:

- folder URL builder emits a folder target with a trailing slash
- PROPFIND is used for the connection test
- Depth header is present with value class `0`
- PROPFIND body is present
- Accept and content-type headers are present
- auth scheme class is Basic

The current Desktop Rust probe differs in request shape:

- trailingSlash:false for the tested targets
- PROPFIND body present:false
- no read-only request body is sent

## Diagnosis

The strongest immediate signal is auth/scope failure or missing accepted auth:
the first read-only method returned `401` while authHeaderPresent was true.

The subsequent `429` responses indicate provider throttling or request-rate
limiting after the initial failed/unauthorized attempt. Because the diagnostic
then receives `429` for PROPFIND and HEAD, those later status codes cannot prove
root existence or folder reachability.

Request-shape mismatch is also suspected because Desktop Rust does not match the
mobile WebDAV connection-test shape. The smallest future fix is to align the
read-only Desktop probe with the mobile connection-test shape: folder target
with trailing slash and PROPFIND Depth 0 with a minimal request body and
non-secret content negotiation headers. That fix must remain read-only and must
not add any write command.

W3.1.7 remains a command-level live read-only probe only. It is not a full
remote-root readiness pass.

## Boundaries Held

- no raw endpoint URL was printed or committed
- no username was printed or committed
- no credential value was printed or committed
- no authorization header value was printed or committed
- no folder/root value or remote path was printed or committed
- no response body was printed or committed
- no raw directory listing was printed or committed
- no private registry contents were committed
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden WebDAV method was used
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
- relay enqueue performed: false
- outbox/ledger/store mutation performed: false
- fullBundleV3Started:false
- mintsExportId:false
- burnsSequence:false
- `h2o_rt_first_write` absent: true
- write command absent: true
- productSyncReady:false
- transportReady:false
