# fullBundle.v2 Transport Envelope - Live Contract Fix

Verdict: **FULLBUNDLE V2 TRANSPORT ENVELOPE LIVE CONTRACT FIXED - ZERO WRITE**.

This slice fixes the DevTools live-request contract for:

`H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight(request)`

## Root Cause

Commit `868d085ed00857b5f893c1e4387ae64c9007384c` exposed the preflight API and kept all no-write
boundaries intact, but its request normalizer expected flatter or differently named fields for the fullBundle.v2
candidate:

- flat `candidatePayloadHash`,
- flat `candidateBundleHash`,
- flat `expectedBindingProjectionHash`,
- flat `fullBundleV2BindingProjectionCount`,
- nested `candidate.candidatePayloadHash`,
- nested `candidate.candidateBundleHash`.

The live DevTools request used the documented nested candidate shape:

- `candidate.payloadHash`,
- `candidate.bundleHash`,
- `candidate.expectedProjectionCount`,
- `candidate.expectedBindingProjectionCount`.

As a result, the live preflight recognized the gate and preserved every no-write flag, but returned:

- `fullbundle-v2-envelope-checksum-mismatch`,
- `fullbundle-v2-envelope-projection-count-mismatch`.

## Fix

The preflight now normalizes the live nested candidate shape:

- `candidate.payloadHash`,
- `candidate.bundleHash`,
- `candidate.expectedProjectionHash`,
- `candidate.expectedBindingProjectionHash`,
- `candidate.projectionHash`,
- `candidate.expectedProjectionCount`,
- `candidate.expectedBindingProjectionCount`,
- `candidate.projectionCount`.

When the fullBundle.v2 readonly projection hash is the same hash used for the candidate payload and bundle, the
preflight accepts that hash as the projection hash for this non-writing envelope evaluation.

## Correct Live DevTools Request Shape

```js
await H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight({
  schema: "h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1",
  dryRun: true,
  apply: false,
  gate: "fullbundle-v2-transport-envelope-preflight-evaluate",
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false
  },
  candidate: {
    kind: "fullBundle.v2-readonly-projection",
    payloadHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    bundleHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    expectedProjectionCount: 12,
    expectedBindingProjectionCount: 12,
    fullBundleV3Required: false,
    startFullBundleV3: false,
    mutatePayload: false
  },
  sequence: {
    mintNewExport: false,
    burnSequence: false,
    requireExistingOnly: true
  },
  target: {
    peerTargetHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    remoteRootHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    ambiguous: false
  },
  transport: {
    enqueueRelay: false,
    writeWebDAV: false,
    writeCloud: false,
    touchChatSavingCAS: false,
    writeFiles: false,
    startFullBundleV3: false
  },
  safety: {
    a950DocumentedDebtVisible: true,
    a950DocumentedDebtQuarantined: true,
    a950LeaksIntoExportablePayload: false,
    mutateA950: false,
    cleanupAuthority: false
  },
  privacy: {
    mode: "hash-only"
  }
});
```

Expected result:

- `ok:true`,
- `status:"fullbundle-v2-transport-envelope-preflight-ready"`,
- `candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`,
- `candidateBundleHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`,
- `expectedProjectionHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`,
- `expectedProjectionCount:12`,
- `blockers:[]`,
- `warnings:[]`.

## Boundaries Preserved

This fix does not authorize transport.

This fix does not authorize WebDAV/cloud/relay.

This fix does not enqueue relay.

This fix does not write CAS or files.

This fix does not mutate export state.

This fix does not mint an export id.

This fix does not burn sequence.

This fix does not alter the fullBundle.v2 payload.

This fix does not mint or start fullBundle.v3.

This fix does not flip `productSyncReady`.

This fix does not set `transportReady:true`.

This fix does not clean or mutate `row:a950a44b859f`.

Strict tombstone cleanup rules remain unchanged.

`localExportableSyncReady:true` remains an input to this preflight, not transport authorization.

`row:a950a44b859f` remains documented/quarantined debt and cannot leak into the exportable payload.

Chat Saving CAS remains separate and blocked/deferred.
