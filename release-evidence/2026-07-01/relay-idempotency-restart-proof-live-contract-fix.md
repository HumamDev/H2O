# Relay Idempotency / Restart Proof Live Contract Fix

Verdict: RELAY IDEMPOTENCY RESTART PROOF LIVE CONTRACT FIXED - ZERO WRITE.

This slice fixes/documents the live DevTools request contract for `H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof(request)`. It does not write to WebDAV/cloud/relay, does not enqueue relay, does not implement real transport, does not mint or start `fullBundle.v3`, does not touch Chat Saving CAS, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- Relay proof harness implementation: `a8779f24ee8f043745ff3fe969d542bcf8bf2839`.
- Relay proof harness design: `5a728d1d2d8e19ce67f6f51ae50bf5102bb8c46d`.
- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.
- WebDAV live contract fix: `d28cf0b8beb857c65ec1251030087c5229241477`.
- Transport source inventory / no-write audit: `35607afcaca0263c2105e98e13b5d20ea08e37e9`.

## Live Rejection Root Cause

The first live proof attempt was safely non-writing but blocked because the request shape did not match the implemented contract:

- The proof gate was omitted. The harness requires top-level `gate:"relay-idempotency-restart-proof-harness-evaluate"`.
- The live request placed `peerTargetHash`, `remoteRootHash`, `activeTransport`, and `reservedControlledGate` under `candidate`, but the implementation only accepted top-level or `target`/`transport` locations.
- The live request used symbolic target strings such as `sha256:webdav-dry-run-local-mock-peer`, which are not SHA-256 hashes. The harness requires `sha256:` plus 64 hex characters.
- `transport.touchChatSavingCAS:false` and `safety.mutateA950:false` / `safety.cleanupAuthority:false` were not accepted as equivalent boundary visibility signals, so warnings were emitted.
- `duplicateReplayZeroWrite:false` and `idempotencyKeyHashOnly:false` were downstream effects of the missing gate and missing/invalid target hashes.

## Source Fix

Updated source:

- `src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js`

The harness now safely normalizes these nested fields:

- `candidate.peerTargetHash`
- `candidate.remoteRootHash`
- `candidate.activeTransport`
- `candidate.reservedControlledGate`
- `transport.touchChatSavingCAS:false`
- `safety.mutateA950:false`
- `safety.cleanupAuthority:false`
- `sequence.mintNewExport:false`
- `sequence.burnSequence:false`
- `sequence.requireExistingOnly:true`

The fix does not infer or auto-satisfy the proof gate. The proof gate remains explicit and top-level.

The fix does not accept symbolic target values as hashes. Real SHA-256 strings are still required.

## Exact Corrected Live DevTools Request Shape

Use this request shape for the next live read-only proof:

```js
await H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof({
  schema: "h2o.studio.transport.relay-idempotency-restart-proof-request.v1",
  dryRun: true,
  apply: false,
  gate: "relay-idempotency-restart-proof-harness-evaluate",
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false
  },
  candidate: {
    payloadHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    bundleHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    peerTargetHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    remoteRootHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    operationKind: "webdav-cloud-relay-transport-dry-run",
    activeTransport: "local-sync-folder-json",
    reservedControlledGate: "webdav-cloud-relay-transport-controlled-apply"
  },
  sequence: {
    mintNewExport: false,
    burnSequence: false,
    requireExistingOnly: true
  },
  duplicateReplay: {
    samePayloadTargetSequence: true,
    expectZeroWrite: true
  },
  restart: {
    simulateBootResume: true,
    expectFailClosed: true,
    allowDispatchWithoutControlledGate: false
  },
  transport: {
    enqueueRelay: false,
    writeRemote: false,
    writeWebDAV: false,
    writeCloud: false,
    touchChatSavingCAS: false,
    startFullBundleV3: false
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
    localExportableIsRelayAuthorization: false
  },
  privacy: {
    mode: "hash-only"
  }
});
```

Expected modeled result:

- `ok:true`.
- `status:"relay-idempotency-restart-proof-ready"`.
- `gateSatisfied:true`.
- `idempotencyKeyHashOnly:true`.
- `duplicateReplayZeroWrite:true`.
- `restartFailClosed:true`.
- `bootResumeDispatch:false`.
- `localExportableSyncReadyIsAuthorization:false`.
- `blockers:[]`.
- `warnings:[]`.
- `writesRelay:false`.
- `enqueuesRelay:false`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesCAS:false`.
- `writesFiles:false`.
- `mutatesExportState:false`.
- `mintsExportId:false`.
- `burnsSequence:false`.
- `fullBundleV3Started:false`.
- `productSyncReady:false`.
- `transportReady:false`.
- `chatSavingCasBlocked:true`.
- `a950DocumentedDebtQuarantined:true`.
- `noCleanupAuthority:true`.

## Required Failure Behavior Preserved

The validator proves:

- missing gate blocks,
- symbolic non-hex target hash blocks,
- missing controlled gate blocks write transition,
- `apply:true` blocks,
- `dryRun:false` blocks,
- relay enqueue request blocks,
- WebDAV/cloud write request blocks,
- CAS request blocks,
- `fullBundle.v3` request blocks,
- cleanup/a950 mutation request blocks,
- boot resume dispatch request blocks,
- all modeled failure modes block before enqueue/write.

## Final State

WebDAV/cloud/relay cannot start now.

No relay enqueue is authorized now.

No real transport is implemented.

`fullBundle.v3` remains not-started.

Chat Saving CAS remains blocked/deferred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

`localExportableSyncReady:true` is not relay or transport authorization.

a950 remains documented/quarantined debt and no cleanup authority is introduced.
