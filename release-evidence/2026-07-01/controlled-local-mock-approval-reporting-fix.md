# Controlled Local Mock Approval Reporting Fix

Verdict: **CONTROLLED LOCAL MOCK APPROVAL REPORTING FIXED - DRY-RUN APPROVAL IS EXPLICIT / APPLY STILL NOT APPROVED**.

This slice updates approval reporting only. It does not run local mock apply, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- Controlled local mock implementation: `050286fe4f695102e529c646e5a72fe60d5266d0`.
- Controlled local mock live-contract fix: `2e9850e672710fea2157df2f34e00277c6723274`.
- Operator approval contract documentation: `2cf439116db984f18060dfe24a394e0b474bafbe`.
- Controlled local mock dry-run live closeout with caveat: `d2e57ea360191cd159922fb23ee9670b74effda1`.

## Root Cause

`operatorApprovalAccepted` was an overloaded field. It did not distinguish dry-run approval from apply approval, and the result did not expose why a dry-run could be `ok:true` while `operatorApprovalAccepted:false`.

The approval helper also only accepted `noChatSavingCas:true`. The live strict approval rerun used the same safety intent but can reasonably use `noChatSavingCAS:true`. The reporting fix accepts both spellings for that safety assertion while keeping the rest of the approval contract strict.

## Selected Reporting Semantics

The result now reports:

- `operatorDryRunApprovalAccepted:true` when the current request supplies the strict dry-run approval contract;
- `operatorApplyApprovalAccepted:false` during dry-run;
- `operatorApprovalAccepted:true` for strict dry-run because it is accepted for the current mode;
- `localMockApplyApproved:false` during dry-run;
- `realTransportApprovalAccepted:false` always in this lane.

Apply approval remains separate and stronger. It requires `reviewedTransportApplyApproved:true` and `controlledLocalMockApplyApproved:true` and is local-mock-only. This slice did not run local mock apply.

## Exact Live Strict Dry-Run Shape To Rerun

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
    noChatSavingCAS: true,
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

Expected result:

- `ok:true`;
- `status:"controlled-local-mock-webdav-transport-dry-run-ready"`;
- `operatorApprovalAccepted:true`;
- `operatorDryRunApprovalAccepted:true`;
- `operatorApplyApprovalAccepted:false`;
- `localMockApplyApproved:false`;
- `realTransportApprovalAccepted:false`;
- `modeledMockApply:false`;
- `modeledMockWriteCount:0`;
- `duplicateReplayZeroWrite:true`;
- `restartFailClosed:true`;
- all real write/enqueue/export/fullBundle.v3/CAS flags remain false;
- `productSyncReady:false`;
- `transportReady:false`;
- `blockers:[]`;
- `warnings:[]`.

## Apply Remains Not Approved

This closeout does not approve local mock apply. A future local mock apply proof must still be explicitly operator-controlled and must use the stronger apply approval contract:

- `reviewedTransportApplyApproved:true`;
- `controlledLocalMockApplyApproved:true`;
- `scope:"local-mock-webdav-target-only"`;
- exact controlled gate;
- fixed hash-only idempotency key;
- fixed payload/bundle hashes;
- fixed peer/mock target hashes;
- `productSyncReady:false`;
- `transportReady:false`.

Real WebDAV/cloud/relay approval remains impossible through this path.

## Boundary Confirmation

- no local mock apply was run;
- no real WebDAV/cloud/relay/CAS/file write occurred;
- no relay enqueue occurred;
- no export-state mutation occurred;
- no export id was minted;
- no sequence was burned;
- `fullBundle.v3` was not started;
- `productSyncReady:false` remains authoritative;
- `transportReady:false` remains authoritative;
- `row:a950a44b859f` remains documented/quarantined debt;
- `noCleanupAuthority:true`.
