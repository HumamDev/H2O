# Real Transport W3.1 Read-Only Capability Probe Implementation

Verdict: W3.1 READ-ONLY CAPABILITY PROBE SUBSTRATE IMPLEMENTED.

This slice adds a gated Rust/Tauri command substrate for future read-only
WebDAV/server capability checks. It does not perform a real remote probe and
does not implement any write command.

## Anchors

- W3 ADR operator acceptance: `89b6ec476a0bf0ff7cff38a0d652f36469acb36e`
- W3.0 design / ADR evidence: `af886b2fb20d86e9f010ac702cc572b64403dbb3`
- W2c receipt-core supplement: `678c7b95a188c9faa3133316e06a5196bf7c988e`
- W2c live Desktop Studio proof: `7e431b16c9f0665514eecd31dd0e0273972daed6`

## Rust Command

- Exposed command: `h2o_rt_capability_probe`
- Not implemented: `h2o_rt_first_write`
- Command module: `apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs`
- Registration: explicit `tauri::generate_handler!` entry in both debug and
  release invoke-handler macros.

The command accepts only hash/ref inputs plus redacted diagnostic metadata. It
does not accept raw endpoint URL, raw credential, raw remote path, raw listing,
payload body, or CAS key data as valid input. Unknown or private-looking inputs
fail closed and are not echoed.

## Gate And Mode

Required gate:

`real-webdav-cloud-relay-transport-readonly-capability-probe-evaluate`

Required mode:

- `diagnosticOnly:true`
- `readOnly:true`
- `dryRun:true`

This implementation slice performs no network attempt. A valid request returns
`networkAttempted:false` and the warning
`real-remote-probe-not-performed-in-this-slice`.

## Read-Only Operation Names

The command accepts only these redacted operation names:

- `options`
- `propfind-depth-0`
- `propfind-depth-1`
- `head-root`
- `get-root`
- `head-deterministic-nonexistent-child`

Forbidden remote verbs remain forbidden by W3 ADR:

- PUT
- DELETE
- MKCOL
- PROPPATCH
- MOVE
- COPY
- LOCK
- UNLOCK
- POST

No request body, redirect following, or credential forwarding is implemented in
this slice. Because no network client is added, redirect refusal is represented
by absence of a network path. If a later slice adds `reqwest`, it must use
`rustls` and redirect refusal.

## Response Schema

The JS-visible response is redacted/hash-only:

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
- `productSyncReady:false`
- `transportReady:false`
- `realWebDAVTransportAvailable:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `enqueuesRelay:false`
- `fullBundleV3Started:false`
- `mintsExportId:false`
- `burnsSequence:false`

## Dependency / Capability Scope

- no `tauri-plugin-http`
- no CSP widening
- no webview fetch transport
- no local helper process
- no real secret retrieval
- no keyring dependency
- no `reqwest` dependency added in this slice
- `credentialRefHash` remains descriptor-hash semantics, not secret-hash semantics
- raw credentials never enter JS or evidence

## W3-F1 Carry-Forward

The confirmed W2c receipt hash
`sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65`
with expiryUtc `2099-07-06T00:00:00.000Z` remains fixture-grade /
mock-grade only. It must never authorize W3.4 or W3.5 real writes. Write-grade
receipts require `expiryUtc <= 7 days from mint`.

## Blocked Later Phases

- W3.2 mock executor proof remains blocked.
- W3.3 gate-refused write command / loopback tests remain blocked.
- W3.4 sacrificial probe-object write remains blocked.
- W3.5 separately-approved payload write remains blocked.

## Boundaries Held

- no real remote probe closeout is claimed in this slice
- no real WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn
- productSyncReady:false
- transportReady:false
- no automatic sync
- no write command
- no `h2o_rt_first_write`
