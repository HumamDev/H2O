# Real Transport W3.1.7-R9 Read-Only Probe With Saved Credential

Verdict: CONTROLLED READ-ONLY PROBE COMPLETED; REMOTE-ROOT READINESS STILL NOT PROVEN.

This evidence records one controlled live read-only probe using the existing
saved WebDAV credential in the default-private resolver registry. The operator
reported that the saved token is the intended working token. No new token was
requested in this phase.

## Anchors

- W3.1.7-R6G reload-state hydration: `4ee8e6a7196a4706bc58ae43a94e5a5e38b6674c`
- W3.1.7-R8 auth parity diagnostic: `7caff3f9e7b961c7a16768dcf39913bbc9c7fcbb`
- W3.1.7-R6F saved credential behavior: `f74fde2d8f70ddb167a2f27aaa31d79d8747e508`
- W3.1.7-R7 probe after saved credential fix: `4b275b0b66434aee9202a7ac1c19e47a994df61f`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`

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
- remoteRootReachable:false
- rootExists:false
- rootEmpty:false
- child404Ok:true
- listingHash: `sha256:0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5`

## Method Status Table

| Method | Status code | Status family |
| --- | ---: | --- |
| OPTIONS | `200` | `2xx` |
| PROPFIND Depth 0 | `404` | `4xx` |
| HEAD root | `404` | `4xx` |
| HEAD deterministic nonexistent child | `404` | `4xx` |

## Redacted Request Shape

All attempted requests were redacted as:

- targetShape: `endpoint-plus-folder`
- trailingSlash:false
- doubleSlash:false
- authHeaderPresent:true
- propfindBodyPresent:false

Per-method request-shape fields:

- OPTIONS propfindDepthHeaderPresent:false
- PROPFIND Depth 0 propfindDepthHeaderPresent:true
- HEAD root propfindDepthHeaderPresent:false
- HEAD deterministic nonexistent child propfindDepthHeaderPresent:false

## Classification

The saved credential is now accepted enough for the endpoint-level OPTIONS call
to return `200`. The prior all-`401` auth blocker is no longer the strongest
signal for this run.

Remote-root readiness is still not proven because the root PROPFIND and HEAD
checks returned `404`. The most likely remaining blocker is Desktop
request/path shape parity with the working WebDAV client behavior:

- Desktop current shape uses trailingSlash:false for the tested root target.
- Desktop current PROPFIND sends Depth 0 but no PROPFIND body.
- Mobile/native WebDAV behavior previously inspected uses a folder target with
  trailing slash and a minimal XML PROPFIND body.

Next recommended phase: align the Desktop read-only probe request shape with the
native/mobile WebDAV folder target behavior, still read-only only.

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
