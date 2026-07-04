# Operational.5 - Orphan-Binding Manual-Approval Contract Fix

Verdict: **OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CONTRACT FIX IMPLEMENTED - LIVE CLEANUP APPLY NOT RUN**.

This slice fixes the manual approval contract for
`operational5OrphanBindingManualApprovalCleanupOverride(opts)`. It does not run live cleanup apply,
does not delete or mutate folders, chats, bindings, tombstones, ledgers, import/export state, or the
render mirror, does not flip `productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`,
and does not touch Chat Saving WebDAV/cloud/archive CAS.

## Context

- Manual-approval cleanup override implementation: `ab6455991db40bd5fc00e02a9e00f8485caab810`.
- Strict evidence receipt live closeout: `3e2f55eeaca5e18cea679348349ca9082313f77a`.
- Target row: `row:fdd2456fc8a2`.
- Excluded/documented-debt row: `row:a950a44b859f`.
- Gate: `operational5-orphan-binding-manual-approval-cleanup-override-apply`.

The operator ran a live dry-run for `row:fdd2456fc8a2` with:

```js
manualApproval: {
  approved: true,
  scope: "row:fdd2456fc8a2-only",
  reason: "operator-approved-dry-run-only-after-strict-evidence-receipt",
  noCleanupApplyYet: true
}
```

The result was safe and zero-write, but blocked:

- `ok:false`
- `status:"blocked-manual-approval-required"`
- `gateSatisfied:true`
- `applyRequested:false`
- `dryRun:true`
- `rawCanonicalBindingCountBefore:14`
- `rawCanonicalBindingCountAfter:14`
- `exportableCanonicalBindingCount:12`
- `removedCount:0`
- blocker: `operational5-orphan-binding-manual-approval-cleanup-override-manual-approval-required`
- `productSyncReady:false`

## Root Cause

`operational5ManualApprovalCleanupOverrideAccepted(...)` required the full controlled-apply approval
schema even when `applyRequested:false`. That made the dry-run approval contract stricter than the
design and live operator packet: the gate was recognized, but the minimal dry-run approval object was
rejected before the command could return `dry-run-manual-approval-cleanup-override-ready`.

## Fix

The approval helper now distinguishes two contracts:

1. Dry-run approval contract.
2. Controlled-apply approval contract.

### Approved Dry-Run Call Shape

Dry-run is zero-write and may use:

```js
await H2O.Studio.store.folders.operational5OrphanBindingManualApprovalCleanupOverride({
  rowToken: "row:fdd2456fc8a2",
  chatToken: "r:2f29d39a6c4f",
  folderToken: "r:2d5469848470",
  dryRun: true,
  apply: false,
  gate: "operational5-orphan-binding-manual-approval-cleanup-override-apply",
  manualApproval: {
    approved: true,
    scope: "row:fdd2456fc8a2-only",
    reason: "operator-approved-dry-run-only-after-strict-evidence-receipt",
    noCleanupApplyYet: true
  }
});
```

Expected dry-run result:

- `ok:true`
- `status:"dry-run-manual-approval-cleanup-override-ready"`
- `applyRequested:false`
- `dryRun:true`
- `removedCount:0`
- `rowA950Excluded:true`
- `strictEvidenceReceiptRequired:true`
- `productSyncReady:false`

### Approved Controlled-Apply Call Shape

Controlled apply is still not run by this slice. A future controlled apply must include `apply:true`,
the exact gate, and the full reviewed approval object:

```js
await H2O.Studio.store.folders.operational5OrphanBindingManualApprovalCleanupOverride({
  rowToken: "row:fdd2456fc8a2",
  chatToken: "r:2f29d39a6c4f",
  folderToken: "r:2d5469848470",
  apply: true,
  gate: "operational5-orphan-binding-manual-approval-cleanup-override-apply",
  manualApproval: {
    schema: "h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1",
    approved: true,
    scope: "row:fdd2456fc8a2-only",
    targetRowToken: "row:fdd2456fc8a2",
    rejectedRowTokenShouldRemainDebt: "row:a950a44b859f",
    chatToken: "r:2f29d39a6c4f",
    folderToken: "r:2d5469848470",
    strictEvidenceReceiptId: "operational5-orphan-binding-strict-evidence-receipt:row:fdd2456fc8a2",
    reviewedOverrideApproved: true,
    cleanupApplyApproved: true,
    removeOnlyExactDanglingFolderBindingRow: true,
    noFolderDelete: true,
    noChatDelete: true,
    noTombstoneMutation: true,
    noLedgerMutation: true,
    noImportExportMutation: true,
    noRenderMirrorWrite: true,
    noWebdavWrite: true,
    noChatSavingCas: true,
    productSyncReady: false
  }
});
```

The controlled-apply contract remains stronger than the dry-run contract. Apply without the exact
gate still blocks. Apply with only the dry-run approval still blocks. Duplicate apply remains
zero-write/idempotent after a successful approved cleanup.

## Retained Boundaries

- `row:fdd2456fc8a2` is the only eligible target.
- `row:a950a44b859f` remains documented debt and rejected/excluded.
- Persisted strict evidence receipt is still required.
- The strict evidence receipt is not cleanup authorization.
- The strict evidence receipt is not a tombstone substitute.
- No live cleanup apply was run by Codex.
- No folder/chat/binding/tombstone/ledger/import/export/render-mirror/WebDAV/CAS mutation occurred.
- `productSyncReady:false` remains.
- WebDAV/cloud/relay/`fullBundle.v3` remains deferred/not started.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Next Step

Run the live dry-run again with the approved dry-run call shape above. Do not run controlled apply
until the dry-run returns `ok:true`, `status:"dry-run-manual-approval-cleanup-override-ready"`,
`removedCount:0`, and confirms `row:a950a44b859f` remains excluded.
