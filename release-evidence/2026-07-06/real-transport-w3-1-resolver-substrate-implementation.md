# Real Transport W3.1 Resolver Substrate Implementation

Verdict: W3.1 RUST-ONLY OUT-OF-REPO DESCRIPTOR RESOLVER SUBSTRATE IMPLEMENTED.

This slice extends `h2o_rt_capability_probe` with resolver-readiness support
only. It does not perform a live remote probe, does not add a network client,
does not implement `h2o_rt_first_write`, and does not add any write command.

## Anchors

- W3.1 read-only capability probe substrate: `5dd884aea2d4e554ea7bd1282df7369ac4060ab8`
- W3.1 mock/loopback closeout: `d1ef09955c3a8208226674341c68a761bf080e2b`
- W3 ADR operator acceptance: `89b6ec476a0bf0ff7cff38a0d652f36469acb36e`

## Resolver Design

- resolver is Rust-only
- registry/config must live outside repo
- registry file location is supplied to Rust outside JS
- JS provides only hash/ref inputs
- JS never provides endpoint URL, credential material, or remote-root path
- endpoint descriptor refs are hash-verified before use
- remote-root descriptor refs are hash-verified before use
- credential descriptor refs are hash-verified before use
- `credentialRefHash` is descriptor-hash semantics, not secret-hash semantics
- missing registry/config fails closed
- descriptor hash mismatch fails closed
- registry hash mismatch fails closed
- resolver exposes only redacted/hash-only status to JS

## Probe Result Additions

`h2o_rt_capability_probe` can now report:

- `resolverAvailable:true|false`
- `endpointDescriptorResolved:true|false`
- `remoteRootDescriptorResolved:true|false`
- `credentialDescriptorResolved:true|false`
- `descriptorRegistryRefHash`
- `networkAttempted:false`
- `writesWebDAV:false`
- `productSyncReady:false`
- `transportReady:false`

When resolver checking is requested and the registry is missing, the command
fails closed with `real-transport-w3-resolver-config-missing`.

When descriptor hashes do not match, the command fails closed with
`real-transport-w3-descriptor-hash-mismatch`.

When descriptors resolve, the command can return `ok:true` for resolver
readiness only. It is not a live remote probe and not write authority.

## Privacy

- no raw endpoint in JS, repo, evidence, IPC response, or logs
- no raw credential in JS, repo, evidence, IPC response, or logs
- no raw remote path in JS, repo, evidence, IPC response, or logs
- no raw listing in JS, repo, evidence, IPC response, or logs
- private redacted W2c helper files are not used as resolver config source
- raw credential material is not retrieved in this slice
- no keyring access is introduced

## Network And Write Boundaries

- `networkAttempted:false`
- live remote probe remains blocked/pending
- no `reqwest` dependency added
- no network use introduced
- no `tauri-plugin-http`
- no CSP widening
- no capability widening
- no webview fetch transport
- no local helper process
- `h2o_rt_first_write` absent
- no write command
- no real WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn
- productSyncReady:false
- transportReady:false

## Later Phase Status

- W3.1 live remote probe remains pending until safe out-of-repo resolver config exists and passes readiness check.
- W3.2 remains blocked.
- W3.3 remains blocked.
- W3.4 remains blocked.
- W3.5 remains blocked.
