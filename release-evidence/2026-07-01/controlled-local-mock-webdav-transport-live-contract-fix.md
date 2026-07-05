# Controlled Local Mock WebDAV Transport Live Contract Fix

Verdict: **CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED - DRY-RUN CONTRACT NORMALIZED / REAL TRANSPORT STILL BLOCKED**.

Root cause of the live dry-run rejection: the initial implementation validator used a flatter request shape than the DevTools live snippet. The source only accepted `idempotency.idempotencyKeyHash`, required `duplicateReplay.sameIdempotencyKey:true`, required `restart.allowDispatchWithoutControlledGate:false`, and only treated the strict controlled-apply approval shape as accepted. The live request used nested `candidate.idempotencyKey`, `duplicateReplay.samePayloadTargetSequence:true`, `restart.simulateReload:true`, and a dry-run-only operator approval object.

The fix normalizes the live dry-run contract while keeping all evidence hash-only and all real writes blocked.

## Source Change

Source file:

`src-surfaces-base/studio/sync/webdav-transport-gates.js`

API:

`H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)`

The patch accepts:

- `candidate.idempotencyKeyHash`;
- `candidate.idempotencyKey` only when it is already a real `sha256:<64-hex>` value;
- `idempotency.idempotencyKeyHash`;
- `idempotency.idempotencyKey` only when it is already a real `sha256:<64-hex>` value;
- dry-run operator approval with `approved:true`, `reviewedTransportDryRunApproved:true`, `scope:"local-mock-webdav-target-only"`, and hash-only safety fields;
- duplicate replay proof from `duplicateReplay.samePayloadTargetSequence:true` + `duplicateReplay.expectZeroWrite:true` when a hash-only idempotency key is present;
- restart proof from `restart.simulateReload:true` + `restart.expectFailClosed:true` when dispatch without controlled gate is not allowed.

Non-hash idempotency strings remain rejected. A long relay-idempotency string is not accepted as proof; the corrected live request must supply a hash-only idempotency key or hash.

## Corrected Live DevTools Dry-Run Request Shape

```js
await H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport({
  dryRun: true,
  apply: false,
  gate: "webdav-cloud-relay-transport-controlled-apply",
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false
  },
  killSwitch: {
    enabled: true
  },
  operatorApproval: {
    schema: "h2o.studio.transport.webdav-cloud-relay-controlled-dry-run-approval.v1",
    approved: true,
    reviewedTransportDryRunApproved: true,
    scope: "local-mock-webdav-target-only",
    controlledGate: "webdav-cloud-relay-transport-controlled-apply",
    killSwitchEnabled: true,
    idempotencyKeyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    candidatePayloadHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    candidateBundleHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    peerTargetHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    remoteRootRefHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    productSyncReady: false,
    transportReady: false,
    noChatSavingCas: true,
    noFullBundleV3: true,
    noA950Mutation: true,
    privacyHashOnly: true
  },
  candidate: {
    kind: "fullBundle.v2-readonly-projection",
    payloadHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    bundleHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    projectionHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    idempotencyKeyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  target: {
    mode: "local-mock-webdav",
    peerTargetHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    remoteRootHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    ambiguous: false
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
    simulateReload: true,
    expectFailClosed: true
  },
  transport: {
    writeWebDAV: false,
    writeCloud: false,
    enqueueRelay: false,
    touchChatSavingCAS: false,
    writeFiles: false,
    startFullBundleV3: false
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false
  },
  privacy: {
    mode: "hash-only"
  }
});
```

Expected dry-run output:

- `ok:true`
- `status:"controlled-local-mock-webdav-transport-dry-run-ready"`
- `dryRun:true`
- `applyRequested:false`
- `operatorApprovalAccepted:true`
- `idempotencyKeyHash:"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`
- `duplicateReplayZeroWrite:true`
- `restartFailClosed:true`
- `modeledMockWriteCount:0`
- `realWebDAVWrite:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `enqueuesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `mutatesExportState:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `fullBundleV3Started:false`
- `productSyncReady:false`
- `transportReady:false`
- `webdavCloudRelayBlocked:true`
- `chatSavingCasBlocked:true`
- `a950DocumentedDebtQuarantined:true`
- `noCleanupAuthority:true`
- `blockers:[]`

## Still Blocked

The fix does not authorize real transport. These remain blocked:

- real WebDAV target;
- cloud target;
- relay enqueue;
- CAS write;
- file write;
- `fullBundle.v3` start/mint;
- export-state mutation;
- export id mint;
- sequence burn;
- raw/private evidence;
- cleanup or `row:a950a44b859f` mutation;
- `productSyncReady:true`;
- `transportReady:true`.

The reserved controlled gate is still local-mock-only and does not authorize real WebDAV/cloud/relay.

## Final State

No cleanup/mutation/transport write/relay enqueue occurred.

No `fullBundle.v3` start/mint occurred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.
