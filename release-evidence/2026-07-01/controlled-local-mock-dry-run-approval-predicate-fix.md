# Controlled Local Mock Dry-Run Approval Predicate Fix

Verdict: **CONTROLLED LOCAL MOCK DRY-RUN APPROVAL PREDICATE FIXED - STRICT DRY-RUN APPROVAL ACCEPTED / APPLY STILL NOT RUN**.

This slice fixes the dry-run approval acceptance predicate. It does not run local mock apply, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- Approval reporting fix: `8a57a9226a0c80b285439f63fc892957d57b221e`.
- Operator approval contract documentation: `2cf439116db984f18060dfe24a394e0b474bafbe`.
- Controlled local mock live-contract fix: `2e9850e672710fea2157df2f34e00277c6723274`.
- Controlled local mock implementation: `050286fe4f695102e529c646e5a72fe60d5266d0`.

## Root Cause

The source changes from `8a57a922` were loaded because live results showed the new fields:

- `operatorDryRunApprovalAccepted:false`;
- `operatorApplyApprovalAccepted:false`;
- `localMockApplyApproved:false`;
- `realTransportApprovalAccepted:false`.

The remaining rejection was not stale runtime. It was a predicate/field mismatch in the safety assertions inside the operator approval object.

The approval predicate accepted only a narrow set of safety fields:

- `noChatSavingCas:true` or `noChatSavingCAS:true`;
- `noFullBundleV3:true`;
- `noA950Mutation:true`;
- `privacyHashOnly:true`.

The live strict dry-run approval used equivalent no-write/no-CAS/no-relay/no-file/no-v3/no-export/no-sequence/no-a950 safety intent, but not every field matched the narrow aliases. The predicate now accepts explicit safe aliases while still rejecting any positive write, relay, CAS, export, sequence, fullBundle.v3, cleanup, a950, or real-transport approval flag.

## Predicate Fix

The approval predicate now accepts these strict safety aliases:

- CAS boundary: `noChatSavingCas:true`, `noChatSavingCAS:true`, `noCASWrite:true`, `noCasWrite:true`, `noCAS:true`, or `noChatSavingCasWrite:true`;
- fullBundle.v3 boundary: `noFullBundleV3:true`, `noFullBundleV3Start:true`, `noFullBundleV3Started:true`, `noFullBundleV3Mint:true`, `noV3Start:true`, or `noV3Mint:true`;
- a950/cleanup boundary: `noA950Mutation:true`, `noA950Mutate:true`, `noCleanupAuthority:true`, or explicit `mutateA950:false` / `cleanupAuthority:false`;
- privacy boundary: `privacyHashOnly:true`, `hashOnly:true`, or `privacyRedactedHashOnly:true`.

It still rejects any approval object with:

- `realWebDAVApproved:true`;
- `realTransportApproved:true`;
- `webdavCloudRelayApproved:true`;
- `writeWebDAV:true`;
- `writeCloud:true`;
- `enqueueRelay:true`;
- `writeRelay:true`;
- `writeCAS:true`;
- `writeFiles:true`;
- `startFullBundleV3:true`;
- `mintFullBundleV3:true`;
- `mutateExportState:true`;
- `mintExportId:true`;
- `burnSequence:true`;
- `mutateA950:true`;
- `cleanupAuthority:true`.

Positive real-transport approval flags fail closed with
`controlled-local-mock-real-transport-approval-forbidden`, even during dry-run.

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
    targetMode: "local-mock-webdav",
    gate: "webdav-cloud-relay-transport-controlled-apply",
    killSwitchEnabled: true,
    idempotencyKeyHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    candidatePayloadHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    candidateBundleHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85",
    peerTargetHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    remoteRootHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    productSyncReady: false,
    transportReady: false,
    hashOnly: true,
    noCASWrite: true,
    noRelayWrite: true,
    noFileWrite: true,
    noFullBundleV3Start: true,
    noExportStateMutation: true,
    noSequenceBurn: true,
    noA950Mutation: true
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
