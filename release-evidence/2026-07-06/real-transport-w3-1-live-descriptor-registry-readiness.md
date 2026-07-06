# Real Transport W3.1 Live Descriptor Registry Readiness

Verdict: W3.1 LIVE DESCRIPTOR REGISTRY READINESS PASS.

This evidence records a new out-of-repo live descriptor registry for the W3.1
read-only remote-root probe path. The registry is private local configuration
only. It was not committed, copied into evidence, printed, logged, or exposed to
JS/DevTools.

This slice did not run a live remote probe. It only hash-binds the private
registry and records that the Rust resolver can use it later to resolve the
endpoint, remote-root, and credential refs without changing the JS-facing
hash/ref contract.

## Anchors

- W3.1 live read-only probe blocked retry: `3df39bbcd50d44222817aaf3defdd1c13850bd42`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`
- W3.1 resolver config readiness closeout: `f670a18c509dc79d8d651da1e9e9aea06969a2cc`
- W3.1 Rust-only resolver substrate: `979e8a5ba3584d50ab18ae848645e1163d008eae`
- W3.1 mock/loopback read-only capability probe closeout: `d1ef09955c3a8208226674341c68a761bf080e2b`
- W3.1 read-only capability probe substrate: `5dd884aea2d4e554ea7bd1282df7369ac4060ab8`

## Private Registry

- private registry path shape: `/private/tmp/h2o-real-transport-w3-live-descriptor-registry.json`
- private registry is outside repo: true
- private registry committed to repo: false
- private registry copied into evidence: false
- private registry contents printed: false
- private registry JSON parsed: true
- descriptorRegistryRefHash: `sha256:4c6cbdcbc19e42a6f68e71de9ac2fadb20c7dc7a5adaeb8e6605cdc55f454764`
- endpointRefHash: `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- remoteRootRefHash: `sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
- credentialRefHash: `sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc`
- endpointRefHash resolvable by Rust-only registry: true
- remoteRootRefHash resolvable by Rust-only registry: true
- credentialRefHash resolvable by Rust-only registry: true
- Rust-only live endpoint descriptor present: true
- Rust-only live remote-root descriptor present: true
- Rust-only live credential descriptor present: true

No raw endpoint URL, credential value, remote path, server listing, payload body,
or CAS key is included in this evidence.

## Resolver Readiness

- `h2o_rt_capability_probe` exists: true
- `h2o_rt_first_write` absent: true
- write command absent: true
- resolver mode: Rust-only
- JS input shape: hash/ref inputs only
- JS passes raw endpoint value: false
- JS passes raw remote-root value: false
- JS passes raw credential value: false
- IPC returns raw endpoint value: false
- IPC returns raw remote-root value: false
- IPC returns raw credential value: false
- IPC returns raw listing: false
- descriptor hash verification preserved: true
- descriptor registry hash verification preserved: true

## Probe Status

- live remote probe performed: false
- networkAttempted:false
- allowed methods performed: none
- forbidden methods performed: none
- PUT performed: false
- DELETE performed: false
- MKCOL performed: false
- PROPPATCH performed: false
- MOVE performed: false
- COPY performed: false
- LOCK performed: false
- UNLOCK performed: false
- POST performed: false
- request body sent: false
- redirect followed: false
- credential forwarding to redirect target: false

## Cross-Client Compatibility

This registry is local credential/endpoint resolution only. It does not define a
Desktop-only remote protocol, Desktop-only remote path layout, Desktop-only
receipt semantics, or Desktop-only resolver semantics.

The transport-level contract remains compatible with future Desktop Studio sync,
browser/native extension WebDAV sync across different devices, and future mobile
app sync: clients provide hash/ref identities, the platform-native layer resolves
private endpoint and credential material outside JS, and evidence records only
redacted/hash-only probe results.

## Boundaries Held

- no live remote probe
- no write operation occurred
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- enqueuesRelay:false
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn
- productSyncReady:false
- transportReady:false

## Phase Status

- W3.1 live read-only remote-root probe remains pending.
- W3.2 remains blocked.
- W3.3 remains blocked.
- W3.4 remains blocked.
- W3.5 remains blocked.

Next step: retry W3.1 live read-only remote-root probe using this hash-bound
live descriptor registry, without committing raw endpoint, credential, remote
path, or listing data.
