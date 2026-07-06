# Real Transport W3.1 Read-Only Network Probe Path Implementation

Verdict: W3.1 READ-ONLY NETWORK PROBE PATH IMPLEMENTED.

This slice adds a gated read-only network path inside
`h2o_rt_capability_probe`. It does not perform a live remote probe, does not add
`h2o_rt_first_write`, and does not add any write command.

## Anchors

- Blocked live read-only probe closeout: `095783dd0b677e800bc8d1552dbfb116736b4390`
- Resolver config readiness closeout: `f670a18c509dc79d8d651da1e9e9aea06969a2cc`
- Rust-only resolver substrate: `979e8a5ba3584d50ab18ae848645e1163d008eae`
- Mock/loopback read-only capability probe closeout: `d1ef09955c3a8208226674341c68a761bf080e2b`
- Read-only capability probe substrate: `5dd884aea2d4e554ea7bd1282df7369ac4060ab8`

## Command Behavior

- command: `h2o_rt_capability_probe`
- live read-only network path added
- live read-only flag: `liveReadOnlyProbe:true`
- live read-only gate: `real-transport-w3-readonly-remote-root-probe`
- resolver-only mode preserved: true
- resolver-only mode result: `networkAttempted:false`
- missing live read-only gate blocks before network
- missing descriptor registry blocks before network
- descriptor hash mismatch blocks before network
- JS still provides only hash/ref inputs
- endpoint, remote-root, and credential material are resolved only in Rust from the out-of-repo registry
- IPC response remains redacted/hash-only

## Network Client

- client: direct `reqwest` dependency
- TLS: rustls feature
- default TLS features disabled: true
- redirect policy: none
- timeout configured: true
- response size ceiling configured: true
- no `tauri-plugin-http`
- no CSP widening
- no webview fetch transport
- no local helper process
- no general-purpose HTTP command

No live remote probe was performed in this implementation slice. The new path is
covered by mocked Rust tests only.

## Allowed Methods

The live path maps request operation names only to these read-only methods:

- OPTIONS
- PROPFIND Depth 0
- PROPFIND Depth 1
- HEAD root
- GET root
- HEAD deterministic nonexistent child

## Forbidden Methods

The following methods are not executable production paths and are covered only
as rejection-test and forbidden-list evidence:

- PUT
- DELETE
- MKCOL
- PROPPATCH
- MOVE
- COPY
- LOCK
- UNLOCK
- POST

No request body write path is present.

## Redacted Response Shape

The response exposes only redacted/hash-only fields:

- `ok`
- `status`
- `networkAttempted`
- `endpointRefHash`
- `remoteRootRefHash`
- `credentialRefHash`
- `descriptorRegistryRefHash`
- `rootExists`
- `rootEmpty`
- `listingHash`
- `child404Ok`
- `davClassSummaryHash`
- `allowedMethodsSummaryHash`
- `createOnlyBehavior:"unknown"`
- `etagBehavior:"unknown"`
- `ifNoneMatchBehavior:"unknown"`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `productSyncReady:false`
- `transportReady:false`

The command does not return raw endpoint URL, credential material, raw
remote-root path, raw server listing, payload body, or CAS key.

## Tests

Targeted Rust tests cover:

- missing live probe gate -> `networkAttempted:false`
- missing registry -> fail closed and `networkAttempted:false`
- descriptor mismatch -> fail closed and `networkAttempted:false`
- forbidden method names are rejected
- mocked live read-only response is redacted/hash-only
- mocked live read-only response keeps write/readiness flags false
- `h2o_rt_first_write` remains absent
- no write command exists

## Boundaries

- live remote probe performed: false
- no real WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn
- productSyncReady:false
- transportReady:false
- W3.2 remains blocked
- W3.3 remains blocked
- W3.4 remains blocked
- W3.5 remains blocked

Next step: retry the W3.1 live read-only remote-root probe closeout using the
safe out-of-repo resolver registry.
