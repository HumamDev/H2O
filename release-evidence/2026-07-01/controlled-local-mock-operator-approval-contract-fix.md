# Controlled Local Mock Operator Approval Contract Fix

Verdict: **CONTROLLED LOCAL MOCK OPERATOR APPROVAL CONTRACT DOCUMENTED - SOURCE ALREADY DISTINGUISHES DRY-RUN APPROVAL FROM APPLY APPROVAL / REAL TRANSPORT STILL BLOCKED**.

This is an approval-contract clarification and proof slice. It does not run local mock apply, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not mutate the `fullBundle.v2` payload, does not mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- Controlled local mock dry-run live closeout: `d2e57ea360191cd159922fb23ee9670b74effda1`.
- Controlled local mock live-contract fix: `2e9850e672710fea2157df2f34e00277c6723274`.
- Controlled local mock implementation: `050286fe4f695102e529c646e5a72fe60d5266d0`.
- Controlled transport implementation design: `5d0190d54a1a62f00cbb028c94ff19d1a37f651b`.
- Controlled-write kill switch implementation: `edb306774a011f5af5fa4141ce9d85972b16283a`.

## Root Cause

The successful live dry-run closeout returned `operatorApprovalAccepted:false` because the live request supplied a non-authoritative safety acknowledgment:

- `approved:true`;
- `scope:"dry-run-no-real-transport"`;
- no `reviewedTransportDryRunApproved:true`;
- no hash-bound `idempotencyKeyHash`;
- no hash-bound `candidatePayloadHash`;
- no hash-bound `candidateBundleHash`;
- no hash-bound `peerTargetHash`;
- no hash-bound `remoteRootRefHash`;
- no `productSyncReady:false` / `transportReady:false` fields inside the approval object.

That object is sufficient as a zero-write diagnostic caveat, but it is not the controlled local mock transport approval contract. The source correctly treated it as non-authoritative and still kept all writes blocked.

No product source change is required for this slice. The current source already accepts the strict dry-run approval object documented by `2e9850e6` and already requires the stronger apply approval object for modeled local mock apply.

## Approval Semantics

`operatorApprovalAccepted:true` means the supplied approval object matched the current mode and hash-bound scope.

Dry-run approval and apply approval are intentionally different:

- dry-run approval proves an operator reviewed a zero-write local mock dry-run;
- apply approval is stronger and is only valid for local mock modeled apply;
- neither approval authorizes real WebDAV/cloud/relay;
- neither approval flips `productSyncReady` or `transportReady`;
- neither approval starts `fullBundle.v3`;
- neither approval creates cleanup authority for `row:a950a44b859f`.

The prior closeout remains valid as a zero-write dry-run proof with the caveat `operatorApprovalAccepted:false`. It is not an approval proof and does not approve local mock apply.

## Exact Dry-Run Approval Shape

Use this shape when proving dry-run approval acceptance:

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
    idempotencyKeyHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
    idempotencyKeyHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
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

Expected dry-run approval result:

- `ok:true`;
- `status:"controlled-local-mock-webdav-transport-dry-run-ready"`;
- `operatorApprovalAccepted:true`;
- `modeledMockApply:false`;
- `modeledMockWriteCount:0`;
- `duplicateReplayZeroWrite:true`;
- `restartFailClosed:true`;
- all real write/enqueue/export/CAS/file/fullBundle.v3 flags remain false;
- `productSyncReady:false`;
- `transportReady:false`.

## Exact Future Local Mock Apply Approval Shape

This shape is defined for a future operator-controlled local mock apply proof only. It was not run live in this slice.

```js
await H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport({
  dryRun: false,
  apply: true,
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
    schema: "h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1",
    approved: true,
    reviewedTransportApplyApproved: true,
    controlledLocalMockApplyApproved: true,
    scope: "local-mock-webdav-target-only",
    controlledGate: "webdav-cloud-relay-transport-controlled-apply",
    killSwitchEnabled: true,
    idempotencyKeyHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
    idempotencyKeyHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
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

Expected modeled apply decision:

- `operatorApprovalAccepted:true`;
- local mock target only;
- `realWebDAVWrite:false`;
- `writesWebDAV:false`;
- `writesCloud:false`;
- `enqueuesRelay:false`;
- `writesCAS:false`;
- `writesFiles:false`;
- `mutatesExportState:false`;
- `mintsExportId:false`;
- `burnsSequence:false`;
- `fullBundleV3Started:false`;
- `productSyncReady:false`;
- `transportReady:false`.

This future shape is not a real WebDAV/cloud/relay approval and does not make the reserved gate usable for real transport.

## Blocking Rules

The validator proves:

- the strict dry-run approval contract is accepted and clearly reported;
- the future local mock apply approval contract is defined in the source model but was not run live;
- missing apply approval blocks with `controlled-local-mock-operator-approval-required`;
- invalid apply approval blocks with `controlled-local-mock-operator-approval-required`;
- dry-run-only approval does not approve apply;
- real WebDAV/cloud target blocks;
- relay enqueue blocks;
- CAS/file writes block;
- `fullBundle.v3` start blocks;
- export mutation / export id mint / sequence burn blocks;
- cleanup or `row:a950a44b859f` mutation blocks.

## Final State

No local mock apply was run.

No cleanup/mutation/real transport write/relay enqueue occurred.

No `fullBundle.v3` start/mint occurred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.
