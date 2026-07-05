# WebDAV Transport Readiness Dry-Run Live Contract Fix

Verdict: WEBDAV TRANSPORT READINESS DRY-RUN LIVE CONTRACT FIXED - ZERO WRITE.

Implementation anchor: `f776e66d595de7ac80746fcd7e337d5452c2e26e`.

The first live DevTools dry-run reached `H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun(request)` and satisfied the dry-run gate, but it returned:

- `ok:false`
- `status:"blocked-webdav-transport-dry-run"`
- `reason:"webdav-product-sync-ready-mismatch"`
- zero write flags

## Root Cause

The implementation accepted only flat validator fields:

- `productSyncReady:false`
- `transportReady:false`
- `localExportableSyncReady:true`
- `transportEligibilityFromLocalExportableReady:true`
- `privacyMode:"hash-only"`
- flat bundle hash fields
- flat sequence fields
- flat peer / remote root hash fields

The live DevTools request used the nested shape from the design:

- `readiness.localExportableSyncReady:true`
- `readiness.productSyncReady:false`
- `readiness.transportReady:false`
- `expectedBundle.expectedHash`
- `sequence.mintNewExport:false`
- `sequence.requireExistingOnly:true`
- `target.mode:"mock-peer"`
- `target.peerToken`
- `target.remoteRootToken`
- `transport.enqueueRelay:false`
- `transport.writeRemote:false`
- `transport.startFullBundleV3:false`
- `transport.touchChatSavingCAS:false`
- `safety.mutateA950:false`
- `safety.cleanupAuthority:false`

Because those nested fields were not normalized, the evaluator treated readiness as missing, hash/checksum as missing, sequence as missing, target as ambiguous, and privacy mode as missing.

## Fix

`src-surfaces-base/studio/sync/webdav-transport-gates.js` now accepts the documented nested live request shape while preserving the flat validator-compatible shape.

The fix maps:

- `readiness.*` into readiness guards.
- `expectedBundle.expectedHash` into the candidate payload / bundle hash.
- `sequence.mintNewExport:false` plus `sequence.requireExistingOnly:true` into `sequenceMode:"not-minted-in-dry-run"`.
- `target.mode:"mock-peer"` plus redacted peer/root tokens into an unambiguous local mock target.
- `transport.*` into write/relay/CAS/fullBundle.v3 blockers.
- `safety.*` into cleanup/a950 mutation blockers.

The fix does not permit writes. The fix does not weaken privacy, transport, CAS, fullBundle.v3, cleanup, productSyncReady, or transportReady boundaries.

## Corrected Live DevTools Request Shape

```js
await H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun({
  schema: "h2o.studio.transport.webdav-readiness-dry-run-request.v1",
  dryRun: true,
  apply: false,
  gate: "webdav-transport-readiness-dry-run-evaluate",
  source: "operational5-local-exportable-ready",
  reason: "operator live WebDAV transport readiness dry-run only",
  privacy: {
    mode: "hash-only",
    hashOnly: true
  },
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
    chatSavingCasBlocked: true,
    a950DocumentedDebtVisible: true
  },
  expectedBundle: {
    kind: "fullBundle.v2-readonly-projection",
    expectedBindingProjectionCount: 12,
    expectedHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"
  },
  sequence: {
    mintNewExport: false,
    requireExistingOnly: true
  },
  target: {
    mode: "mock-peer",
    peerToken: "peer:webdav-dry-run-local-mock",
    remoteRootToken: "root:webdav-dry-run-mock",
    ambiguous: false
  },
  transport: {
    enqueueRelay: false,
    writeRemote: false,
    startFullBundleV3: false,
    touchChatSavingCAS: false
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false
  },
  transportControlledApplyGateReserved: "webdav-cloud-relay-transport-controlled-apply"
});
```

Expected result:

- `ok:true`
- `status:"webdav-transport-dry-run-ready"`
- `writesData:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `mutatesExportState:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `enqueuesRelay:false`
- `fullBundleV3Started:false`
- `productSyncReady:false`
- `transportReady:false`
- `localExportableSyncReady:true`
- `transportEligibilityFromLocalExportableReady:true`
- `webdavCloudRelayBlocked:true`
- `chatSavingCasBlocked:true`
- `a950DocumentedDebtQuarantined:true`
- `noCleanupAuthority:true`

## Failure Modes Still Block

The fixed evaluator still blocks:

- wrong gate
- `apply:true`
- `dryRun:false`
- `productSyncReady:true`
- `transportReady:true`
- `localExportableSyncReady:false`
- privacy/hash-only violations
- missing or malformed bundle hash
- sequence mint/regression
- ambiguous peer target
- relay enqueue
- remote write
- `fullBundle.v3` start/mint
- Chat Saving CAS boundary requests
- cleanup or a950 mutation authority

## Boundaries

No WebDAV/cloud/relay write occurred.

No relay enqueue occurred.

No real transport was implemented.

No `fullBundle.v3` was minted or started.

No Chat Saving CAS path was touched.

`productSyncReady:false` remains.

`transportReady:false` remains.

a950 remains documented/quarantined debt.

No cleanup or mutation authority is introduced.
