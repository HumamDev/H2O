# Real Transport W3.1.7-R8 WebDAV Auth Parity Diagnostic

Verdict: AUTH PARITY DIAGNOSIS COMPLETE; REMOTE-ROOT READINESS STILL NOT PROVEN.

This evidence records a hash-only diagnosis of the Koofr WebDAV authentication
blocker after the R7 saved-credential probe. The diagnostic used only read-only
methods and printed no raw endpoint, username, credential, authorization header,
folder/root, remote path, listing, response body, or private registry contents.

## Anchors

- W3.1.7-R7 probe after saved credential fix: `4b275b0b66434aee9202a7ac1c19e47a994df61f`
- W3.1.7-R6F saved credential behavior: `f74fde2d8f70ddb167a2f27aaa31d79d8747e508`
- W3.1.7-R5 exact status-code diagnostic: `34ed66d78d2696e082d24fd9cb450a547887b25c`
- W3.1.7-R2 root reachability diagnostic: `54a193a952f20ae8cac2f52b3a6010ed2b66d2e0`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`

## Prepared Registry Hashes

- registryPathSource: default-private
- descriptorRegistryRefHash: `sha256:ee7ca9946f0a04baa8d13a3b3d2909b8205de7854b8434badd5c000e322706c5`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`
- credentialMaterialPresent:true

## Credential Input Sanitation

- authHeaderPresent:true
- authScheme: Basic
- basicAuthDecodedForWhitespaceCheck:true
- usernameHadOuterWhitespace:false
- tokenHadOuterWhitespace:false

The operator previously reported re-entering a Koofr app-specific WebDAV token
through the Desktop UI. This phase cannot independently prove the human source
of the token without exposing secret material; it can only prove that private
credential material exists and is presented as a Basic auth header.

## Desktop Rust Status Codes

Committed R7 `h2o_rt_capability_probe` result:

- OPTIONS statusCode: `401`
- OPTIONS statusFamily: `4xx`
- PROPFIND Depth 0 statusCode: `401`
- PROPFIND Depth 0 statusFamily: `4xx`
- HEAD root statusCode: `401`
- HEAD root statusFamily: `4xx`
- HEAD deterministic nonexistent child statusCode: `401`
- HEAD deterministic nonexistent child statusFamily: `4xx`

## External Read-Only Parity Check

An external read-only parity helper was run locally from private temp space. It
read the prepared private registry and emitted only redacted status and shape
fields. No command line contained raw credential material.

External read-only status codes:

- desktop-shape OPTIONS statusCode: `401`
- desktop-shape OPTIONS statusFamily: `4xx`
- desktop-shape PROPFIND Depth 0 statusCode: `429`
- desktop-shape PROPFIND Depth 0 statusFamily: `4xx`
- mobile-like PROPFIND Depth 0 statusCode: `429`
- mobile-like PROPFIND Depth 0 statusFamily: `4xx`

## Redacted Request Shape Comparison

Desktop current shape:

- targetShape: `endpoint-plus-folder`
- requestShapeClass: `desktop-current`
- trailingSlash:false
- doubleSlash:false
- authHeaderPresent:true
- authScheme: Basic
- PROPFIND propfindDepthHeaderPresent:true
- PROPFIND propfindBodyPresent:false
- userAgentPresent:false
- acceptClass: none
- contentTypeClass: none

Mobile-like folder shape:

- targetShape: `endpoint-plus-folder`
- requestShapeClass: `mobile-like-folder`
- trailingSlash:true
- doubleSlash:false
- authHeaderPresent:true
- authScheme: Basic
- PROPFIND propfindDepthHeaderPresent:true
- PROPFIND propfindBodyPresent:true
- userAgentPresent:false
- acceptClass: xml
- contentTypeClass: xml

## Auth Construction Comparison

Desktop Rust:

- username source: Desktop WebDAV credential identifier field
- credential source: private Desktop resolver registry
- auth scheme class: Basic
- Basic auth bytes are built from a UTF-8 username/token pair
- outer whitespace is trimmed before Basic auth construction
- special/internal credential characters are preserved

Mobile WebDAV:

- username source: mobile WebDAV settings username field
- credential source: mobile WebDAV settings password field
- auth scheme class: Basic
- Basic auth bytes are built from a UTF-8 username/token pair
- connection test uses a folder URL with trailing slash
- connection test sends PROPFIND Depth 0 with a minimal XML body
- connection test sends XML accept/content-type classes

## Diagnosis

The strongest current signal remains authentication rejection or provider
throttling after authentication failures:

- R7 returned `401` for every Desktop Rust read-only method.
- R8 external parity returned `401` for OPTIONS and then `429` for both
  Desktop-shape and mobile-like PROPFIND.
- Because the mobile-like PROPFIND was also throttled, this phase did not prove
  that request-shape parity alone fixes authentication.
- The redacted whitespace check did not find leading/trailing whitespace in the
  Basic auth material.

Most likely remaining blocker: Koofr app-specific token/account/scope validity
or temporary provider throttling after repeated auth failures.

Request-shape parity is still a secondary suspected issue. A later read-only
fix may align Desktop PROPFIND with the mobile folder-target shape, but that
should be done only after auth/token validity is confirmed or throttling has
cleared.

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
- writesWebDAV:false
- productSyncReady:false
- transportReady:false
