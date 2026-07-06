# Real Transport W3.1 Read-Only Capability Probe Mock Closeout

Verdict: W3.1 MOCK / LOOPBACK READ-ONLY CAPABILITY PROBE CLOSEOUT PASS.

This closeout is mock/loopback only. It does not claim a live remote-root probe,
does not perform any real remote probe, and does not perform any real
WebDAV/cloud/relay/CAS/file write.

## Anchors

- W3.1 read-only capability probe substrate: `5dd884aea2d4e554ea7bd1282df7369ac4060ab8`
- W3 ADR operator acceptance: `89b6ec476a0bf0ff7cff38a0d652f36469acb36e`
- W3.0 design / ADR evidence: `af886b2fb20d86e9f010ac702cc572b64403dbb3`

## Command Surface

- command exists: `h2o_rt_capability_probe`
- command absent / not added: `h2o_rt_first_write`
- no write command exists
- no Cargo dependency was added for this closeout
- no `tauri-plugin-http`
- no CSP or capability widening

## Mock / Loopback Proof

The mock/loopback proof is the Rust unit-test and validator path for
`real_transport_capability_probe`, not a live remote-root check.

Mock/loopback assertions:

- valid hash-only request returns `real-transport-readonly-capability-probe-ready`
- response is redacted/hash-only
- `networkAttempted:false`
- `real-remote-probe-not-performed-in-this-slice`
- `createOnlyBehavior:"unknown"`
- `etagBehavior:"unknown"`
- `ifNoneMatchBehavior:"unknown"`
- `productSyncReady:false`
- `transportReady:false`

## Fail-Closed Proof

The command refuses without the required gate:

- missing / wrong gate blocks with `real-transport-w3-readonly-gate-required`

The command refuses raw/private input:

- raw endpoint input is rejected
- raw credential input is rejected
- raw path input is rejected
- private markers are not echoed in the result

The command rejects forbidden verb requests:

- PUT rejected
- DELETE rejected
- MKCOL rejected
- PROPPATCH rejected
- MOVE rejected
- COPY rejected
- LOCK rejected
- UNLOCK rejected
- POST rejected

No PUT/DELETE/MKCOL/PROPPATCH/MOVE/COPY/LOCK/UNLOCK/POST was performed.

## Response Shape

The JS-visible response remains redacted/hash-only:

- `ok`
- `status`
- `gateSatisfied`
- `endpointRefHash`
- `remoteRootRefHash`
- `credentialRefHash`
- `capabilityProbeReceiptHash`
- `receiptCorePlaceholder`
- `rootExists`
- `rootEmpty`
- `createOnlyBehavior:"unknown"`
- `etagBehavior:"unknown"`
- `ifNoneMatchBehavior:"unknown"`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `enqueuesRelay:false`
- `fullBundleV3Started:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `productSyncReady:false`
- `transportReady:false`

## Boundaries Held

- mock/loopback only
- no live remote probe
- no real remote probe was performed
- no real WebDAV/cloud/relay/CAS/file write occurred
- no relay enqueue occurred
- no outbox/ledger/store mutation occurred
- no fullBundle.v3 start/mint occurred
- no token/export id mint occurred
- no sequence burn occurred
- productSyncReady:false
- transportReady:false
- W3.2 remains blocked pending closeout
- W3.3 remains blocked
- W3.4 remains blocked
- W3.5 remains blocked
