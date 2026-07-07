# Real Transport W3.1.7-R10 Read-Only Probe Request Shape Alignment

Verdict: CONTROLLED READ-ONLY PROBE PASSED REMOTE-ROOT READINESS AFTER REQUEST-SHAPE ALIGNMENT.

This evidence records one controlled live read-only probe after aligning the
Desktop Rust probe request shape with the native/mobile WebDAV folder test
shape. The phase did not perform sync, enqueue, approval, or any write method.

## Anchors

- W3.1.7-R9 saved-credential probe: `e26378e70fe4f84e5e9ab413d11d8ce92b203530`
- W3.1.7-R6G reload-state hydration: `4ee8e6a7196a4706bc58ae43a94e5a5e38b6674c`
- W3.1.7-R6F saved credential behavior: `f74fde2d8f70ddb167a2f27aaa31d79d8747e508`
- W3.1.7-R8 auth parity diagnostic: `7caff3f9e7b961c7a16768dcf39913bbc9c7fcbb`

## Request Shape Change

- endpoint/root join now preserves the endpoint path before appending the folder
- root target now uses a trailing slash
- PROPFIND Depth 0 now sends a minimal read-only XML metadata body
- PROPFIND Content-Type class: `xml`
- PROPFIND Accept header class: `xml`
- no raw URL, path, header value, credential, response body, or listing is recorded

## Preflight

- registryPathSource: default-private
- descriptorRegistryRefHash: `sha256:b08bf32a3b41f019c7a7474a1588510b80a0a7e8b40891c3b43d758784312094`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`
- credentialMaterialPresent:true
- JSON parses:true
- private fields:true
- endpoint ready:true
- reachable candidate:true
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

## Probe Result

- networkAttempted:true
- command ok:true
- remoteRootReachable:true
- rootExists:true
- rootEmpty:false
- child404Ok:true
- listingHash: `sha256:623e56fd3ef23e76bd9a127904745056f1933292940fae3507687d5f79a64baf`

## Method Status Table

| Method | Status code | Status family |
| --- | ---: | --- |
| OPTIONS | `200` | `2xx` |
| PROPFIND Depth 0 | `207` | `2xx` |
| HEAD root | `405` | `4xx` |
| HEAD deterministic nonexistent child | `404` | `4xx` |

## Redacted Request Shape

All attempted requests were redacted as:

- targetShape: `endpoint-plus-folder`
- doubleSlash:false
- authHeaderPresent:true

Per-method request-shape fields:

| Method | trailingSlash | propfindDepthHeaderPresent | propfindBodyPresent | propfindContentTypeClass | acceptHeaderClass |
| --- | --- | --- | --- | --- | --- |
| OPTIONS | true | false | false | `none` | `none` |
| PROPFIND Depth 0 | true | true | true | `xml` | `xml` |
| HEAD root | true | false | false | `none` | `none` |
| HEAD deterministic nonexistent child | false | false | false | `none` | `none` |

## Classification

Remote-root readiness is proven by the WebDAV PROPFIND Depth 0 response and the
deterministic nonexistent child check. The provider returns `405` for HEAD root,
so HEAD is recorded as provider-specific and not treated as stronger than the
successful WebDAV PROPFIND readiness signal.

This phase does not unblock any write lane. W3.2/W3.4 remain separate explicit
phases.

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
- write or mutation request body sent:false
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
