# Real Transport W3 ADR Operator Acceptance

Verdict: W3.0 OPERATOR ADR ACCEPTANCE RECORDED.

This is evidence only. It accepts the W3.0 design decisions recorded in
`release-evidence/2026-07-06/real-transport-w3-design-adr.md` at commit
`af886b2fb20d86e9f010ac702cc572b64403dbb3`. It does not implement W3.1, Rust
commands, capabilities, loaders, dependencies, or real transport behavior.

## Accepted ADR-RT-1: Byte Egress

The operator accepts ADR-RT-1:

- dedicated Rust Tauri command path only
- future command names: `h2o_rt_capability_probe` and `h2o_rt_first_write`
- no webview fetch for remote transport
- no `tauri-plugin-http`
- no local helper process
- CSP remains unchanged
- `shell:allow-open` residual risk is accepted, but it is not part of sync transport

## Accepted ADR-RT-2: Credential Resolution

The operator accepts ADR-RT-2:

- `credentialRefHash` is a descriptor hash, not a secret hash
- credential material resolves in Rust only
- no secrets in JS, DevTools, repo, logs, or evidence
- no credential material in IPC responses
- zeroize resolved credential material in the future Rust path

## Accepted W3 Phase Split

The operator accepts the phase split:

- W3.1: read-only probe first
- W3.2: mock executor proof
- W3.3: gate-refused write command / loopback tests
- W3.4: sacrificial probe-object write
- W3.5: separately-approved payload write

No later W3 phase is authorized by this acceptance.

## Accepted W3-F1 Classification

The operator accepts W3-F1:

- receipt hash:
  `sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65`
- expiryUtc: `2099-07-06T00:00:00.000Z`
- classification: fixture/mock-grade only
- the receipt must never authorize W3.4 or W3.5 real writes
- write-grade receipts require `expiryUtc <= 7 days from mint`

The W2 receipt alone never authorizes any real write.

## Accepted Hard Boundaries

- no real write authorized by this acceptance
- no automatic sync
- no productSyncReady:true
- no transportReady:true
- no global realWebDAVTransportAvailable:true
- no fullBundle.v3
- no Chat Saving CAS
- no a950 cleanup
- W2 receipt alone never authorizes
- no blind retry after uncertain remote write
- no WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn
- productSyncReady:false
- transportReady:false

Next permitted lane: W3.1 Rust read-only capability probe design /
implementation, after this operator acceptance evidence is committed and
validated.
