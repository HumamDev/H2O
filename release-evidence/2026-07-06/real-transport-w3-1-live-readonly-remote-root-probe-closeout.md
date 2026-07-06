# Real Transport W3.1.7 Live Read-Only Remote-Root Probe Closeout

Verdict: LIVE READ-ONLY REMOTE-ROOT PROBE COMPLETED HASH-ONLY.

This closeout records the first live read-only WebDAV remote-root probe run
against the prepared default-private descriptor registry. The probe used only
the existing Rust `h2o_rt_capability_probe` path, with the live read-only gate
enabled for this phase.

The command returned `ok:true` and `networkAttempted:true`. The current redacted
result did not prove the remote root as fully reachable: `rootExists:false` and
`child404Ok:false` were returned, while a hash-only `listingHash` was produced.
W3.2 remains pending until a later decision accepts this redacted reachability
shape or a follow-up read-only closeout proves the expected root/nonexistent
child behavior.

## Anchors

- W3.1.5P prepared-registry evidence: `81b5338c6319f5744ed25c9453635ec5fb91864e`
- W3 WebDAV setup UX aligned with native extension: `2ec8a465a4393c31d75536d9cea974d76ff528cf`
- W3 WebDAV setup UI foundation: `523a1978258ad4e5e844984de986a6677440bcc7`
- W3.1 live read-only probe previous blocked retry: `38d7d18b29d142133421d35e5cc34344bf83a09d`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`
- W3.1 Rust-only resolver substrate: `979e8a5ba3584d50ab18ae848645e1163d008eae`
- W3.1 mock/loopback read-only capability probe closeout: `d1ef09955c3a8208226674341c68a761bf080e2b`
- W3.1 read-only capability probe substrate: `5dd884aea2d4e554ea7bd1282df7369ac4060ab8`

## Probe Request

- pathSource: default-private
- command in scope: `h2o_rt_capability_probe`
- live read-only flag used: `liveReadOnlyProbe:true`
- live read-only gate used: `real-transport-w3-readonly-remote-root-probe`
- `h2o_rt_capability_probe` exists: true
- `h2o_rt_first_write` absent: true
- write command absent: true
- descriptorRegistryRefHash: `sha256:587b8681ee910bf3828413e17f949fa52b53a191db72ee4e05c87c0138525167`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`
- descriptor registry JSON parsed: true
- descriptor registry hash matched expected value: true
- endpointRefHash resolved by Rust-only registry: true
- remoteRootRefHash resolved by Rust-only registry: true
- credentialRefHash resolved by Rust-only registry: true

## Read-Only Methods

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
- relay enqueue performed: false
- outbox/ledger/store mutation performed: false

## Redacted Probe Result

- probeResult: pass
- command status: `real-transport-readonly-capability-probe-ready`
- command reason: `read-only-capability-probe-substrate-ready`
- blockers: none
- networkAttempted:true
- remoteRootReachable:false
- rootExists:false
- rootEmpty:false
- listingHash: `sha256:d089c8a9fc28e4e50223eb38c9409e362521be9380a37341304fbac7a4cd9e5f`
- child404Ok:false
- davClassSummaryHash: not-produced
- allowedMethodsSummaryHash: not-produced
- createOnlyBehavior: unknown
- etagBehavior: unknown
- ifNoneMatchBehavior: unknown
- rawPrivateFieldsLogged:false
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

The command redacted response does not expose raw response bodies or raw status
lines. It records only booleans and hashes. No raw directory listing was
recorded; only `listingHash` was recorded.

## Cross-Client Compatibility

This closeout is transport-level evidence only. It does not define a
Desktop-only sync protocol, Desktop-only remote path layout, Desktop-only
receipt semantics, or Desktop-only resolver semantics.

Future Desktop Studio sync, browser/native extension WebDAV sync across
different devices, and future mobile app sync can share the same transport-level
probe semantics: hash/ref inputs, platform-native private resolution,
redacted/hash-only receipts, and no product readiness flip from probe evidence
alone.

No Desktop-only remote semantics were introduced.

## Boundaries Held

- no raw endpoint URL was printed or committed
- no username was printed or committed
- no credential, token, password, or auth header was printed or committed
- no raw remote path was printed or committed
- no raw server listing was printed or committed
- no private registry contents were committed
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

- W3.1 live read-only network path has now been exercised against the prepared registry.
- Remote root reachability remains not fully proven by the current redacted result.
- W3.2 remains pending.
- W3.3 remains blocked.
- W3.4 remains blocked.
- W3.5 remains blocked.
