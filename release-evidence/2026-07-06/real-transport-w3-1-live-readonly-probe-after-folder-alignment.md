# Real Transport W3.1.7-R4 Live Read-Only Probe After Folder Alignment

Verdict: LIVE READ-ONLY PROBE COMPLETED; REMOTE-ROOT READINESS STILL NOT PROVEN.

This evidence records a live read-only WebDAV probe after the operator used the
current FIX2 Desktop WebDAV setup UI to align Folder / remote root with the
native extension Folder value. The probe used only the existing Rust
`h2o_rt_capability_probe` path and the W3.1 live read-only gate.

## Anchors

- W3.1.7-R2 diagnostic: `54a193a952f20ae8cac2f52b3a6010ed2b66d2e0`
- W3.1.7 live read-only WebDAV probe evidence: `39206f4f505c198218570ded66a7da05270fa58c`
- W3.1.5P prepared-registry evidence: `81b5338c6319f5744ed25c9453635ec5fb91864e`
- W3 WebDAV setup UX aligned with native extension: `2ec8a465a4393c31d75536d9cea974d76ff528cf`
- W3 WebDAV setup UI foundation: `523a1978258ad4e5e844984de986a6677440bcc7`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`
- W3.1 Rust-only resolver substrate: `979e8a5ba3584d50ab18ae848645e1163d008eae`

## Prepared Registry

- pathSource: default-private
- descriptorRegistryRefHash: `sha256:ee7ca9946f0a04baa8d13a3b3d2909b8205de7854b8434badd5c000e322706c5`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`
- descriptor registry JSON parsed: true
- required private fields present: true
- endpoint no longer reserved-invalid-domain: true
- reachable candidate: true

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

Read-only method status families, names only:

- OPTIONS statusFamily: `4xx`
- PROPFIND Depth 0 statusFamily: `4xx`
- HEAD root statusFamily: `4xx`
- HEAD deterministic nonexistent child statusFamily: `4xx`

The response records only hashes, booleans, method names, and status families.
No raw endpoint URL, username, credential, token, password, authorization
header, folder/root value, remote path, response body, raw directory listing, or
private registry content is recorded.

## Boundary Confirmation

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

W3.1.7-R4 remains a command-level live read-only probe pass only. It is not a
full remote-root readiness pass because `remoteRootReachable:false`,
`rootExists:false`, and `child404Ok:false` were still returned after folder
alignment.
