# Real-Transport B1 - Target Config + Credentials + Peer Identity - Implementation

Verdict: **B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY
EVALUATE/VALIDATE MODULE - IT DOES NOT ENABLE REAL TRANSPORT, DOES NOT MAKE REAL WEBDAV AVAILABLE, DOES NOT ACCEPT A
REAL-TRANSPORT APPROVAL, DOES NOT FLIP `productSyncReady` OR `transportReady`, AND STORES / LOGS NO RAW ENDPOINT /
CREDENTIAL / PATH VALUE. B2-B6 IMPLEMENTATION REMAINS OPEN. THIS SLICE AUTHORIZES NO REAL WRITE, NO FLIP, AND NO
CLEANUP**.

Operator approval for this slice: begin B1 implementation only; do not implement real transport writes. This
implementation is non-writing with respect to transport. It does not write to real WebDAV/cloud/relay/CAS/files, does
not enqueue relay, does not add real credentials, does not log raw endpoint/credential/path values, does not mint or
start `fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not flip
`productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B1 real target config + credentials + peer identity design: `b2e10531`.
- Real-transport B1-B8 implementation-readiness rollup: `36e46513`.
- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.
- Controlled local mock WebDAV transport final rollup: `15a33852`.

## Source Change (focused, single new module)

- New module: `src-surfaces-base/studio/sync/real-transport-target-config.js`.
- Exposed API: `H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig(request)` (plus a
  `diagnose()` and the schema constants).
- The module is a self-bootstrapping IIFE that mirrors the existing `webdav-transport-gates.js` idioms
  (`safeObject` / `cleanString` / `addUnique` / `bool` / `hashLike`, a result object + `blockers[]`, an `__installed`
  guard). It is a PURE evaluator: it reads a request and returns a validation result; it performs no I/O, no
  persistence, and no transport.

### Deliberately NOT wired into the app loader (non-activating)

The module is present as product source but is intentionally NOT registered in the app loader (`studio.html` /
`tools/product/studio/pack-studio.mjs`). Wiring the module into the runtime is a separate, later, gated step; keeping
B1 non-wired keeps it strictly non-activating for real transport (consistent with the gated order in `36e46513`).
`studio.html` is currently modified by a concurrent Studio lane and is not touched or staged by this slice. The B1
contract is proven by re-executing the real module directly (in a Node `vm` sandbox) in the validator.

## B1 Implementation Semantics

`evaluateRealTransportTargetConfig(request)` validates a hash-only target-config request and returns a redacted result:

- **Hash-only references only**: `endpointRefHash`, `remoteRootRefHash`, `credentialRefHash`, `peerIdentityBindingHash`,
  `localClientIdentityHash` - each accepted only as a `sha256:<64hex>` reference (via `hashLike`); any non-hash value is
  not a valid reference.
- **Credential handling is reference-only**: only `credentialRefHash` is accepted; `credentialReferenceOnly:true`. No
  raw credential is stored or logged.
- **Raw input is rejected and never echoed**: if the request carries a raw endpoint URL, raw credential, or raw remote
  path (by known raw key, or a `ref` value that looks like a URL/path), the evaluator blocks with
  `real-transport-b1-raw-input-rejected` and NEVER copies the raw value into the result (`privacy.rawInputRejected:true`,
  and `rawEndpointLogged`/`rawCredentialLogged`/`rawRemotePathLogged` stay `false`).
- **Local mock target is not a real target**: `targetMode:'local-mock-webdav'` / `'mock-peer'` blocks with
  `real-transport-b1-local-mock-target-not-real`; a real target requires `targetMode` in `real-webdav` / `cloud` /
  `relay`.

### Valid evaluation result

A valid hash-only request returns:

- `ok:true`
- `status:"real-transport-b1-target-config-ready"`
- `realTargetConfigReady:true`
- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `productSyncReady:false`
- `transportReady:false`
- `rawEndpointLogged:false`
- `rawCredentialLogged:false`
- `rawRemotePathLogged:false`
- `credentialReferenceOnly:true`
- `chatSavingCasBlocked:true`
- `fullBundleV3Started:false`
- `noCleanupAuthority:true`
- `blockers:[]`

### Non-activation invariants (hardcoded, not request-controllable)

The result always reports `realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`,
`productSyncReady:false`, `transportReady:false`, `writesWebDAV/writesCloud/writesRelay/enqueuesRelay/writesCAS/
writesFiles/touchChatSavingCas:false`, `mutatesExportState/mintsExportId/burnsSequence/fullBundleV3Started:false`,
`chatSavingCasBlocked:true`, `noCleanupAuthority:true`, `noA950Mutation:true` - regardless of any request field. A
request that tries to set `realWebDAVTransportAvailable:true`, `realTransportApprovalAccepted:true`,
`productSyncReady:true`, `transportReady:true`, or any `write*` flag is IGNORED; the substrate cannot be coerced into
enabling real transport, accepting an approval, flipping a readiness flag, or writing.

## Blocked Failure Modes

- missing endpoint ref -> `real-transport-b1-endpoint-ref-missing`;
- missing remote root ref -> `real-transport-b1-remote-root-missing`;
- missing credential ref -> `real-transport-b1-credential-ref-missing`;
- missing peer identity binding -> `real-transport-b1-peer-binding-missing`;
- ambiguous target -> `real-transport-b1-target-ambiguous`;
- raw endpoint/credential/path input -> `real-transport-b1-raw-input-rejected`;
- peer mismatch -> `real-transport-b1-peer-mismatch`;
- remote root mismatch -> `real-transport-b1-remote-root-mismatch`;
- local mock target supplied as real target -> `real-transport-b1-local-mock-target-not-real`.

## Boundaries Held

- B1 substrate is non-writing: it does not write WebDAV/cloud/relay/CAS/files, does not enqueue relay, and does not
  persist anything (evaluate/validate only).
- No raw endpoint URL, raw credential, or raw remote path is stored, logged, or echoed (hash-only references only; raw
  input rejected).
- B1 substrate does not make real transport available (`realWebDAVTransportAvailable:false`) and does not accept a
  real-transport approval (`realTransportApprovalAccepted:false`).
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced.
- Chat Saving CAS untouched (`chatSavingCasBlocked:true`); the existing `webdav-transport-gates.js` control plane is
  unchanged (still `realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`).
- Only the one new module file is added; `studio.html` and `pack-studio.mjs` are not touched; no unrelated Studio-lane
  files staged.

## Remaining Implementation Blockers (B2-B6)

B2 (kill-switch lifecycle), B3 (durable idempotency store), B4 (enqueue/outbox), B5 (conflict/partial-write), B6
(sequence/export-id) implementation, plus B8 real approval acceptance and the B7 `transportReady` flip, all remain open
and unimplemented.

## Recommended Next Lane After B1

**B2 implementation - real kill-switch lifecycle** (per the B2 design `09bf7701`), non-writing / non-activating,
behind the B8 approval + B7 readiness gate, only after an explicit operator go-ahead.

## Final State

The B1 real target config + credentials + peer identity substrate is implemented as a non-writing, hash-only
evaluate/validate module. Real transport remains blocked: `realWebDAVTransportAvailable:false`,
`realTransportApprovalAccepted:false`, `transportReady:false`, `productSyncReady:false`, `fullBundle.v3` deferred, Chat
Saving CAS blocked/deferred, `row:a950a44b859f` quarantined. B2-B6 implementation remains open.
