# Operational.5 - Orphan-Binding Manual-Approval Controlled-Apply Contract Fix

Verdict: **OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CONTROLLED-APPLY CONTRACT FIX IMPLEMENTED - LIVE CLEANUP APPLY NOT RUN BY CODEX**.

This slice fixes the controlled-apply manual approval contract for
`operational5OrphanBindingManualApprovalCleanupOverride(opts)`. It does not run live cleanup apply,
does not delete or mutate folders, chats, bindings, tombstones, ledgers, import/export state, or the
render mirror, does not flip `productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`,
and does not touch Chat Saving WebDAV/cloud/archive CAS.

## Context

- Manual approval cleanup override implementation: `ab6455991db40bd5fc00e02a9e00f8485caab810`.
- Manual approval dry-run contract fix: `ab3c8c75b427a6ded7525b1ee3eba904a0f1b749`.
- Target row: `row:fdd2456fc8a2`.
- Excluded/documented-debt row: `row:a950a44b859f`.
- Gate: `operational5-orphan-binding-manual-approval-cleanup-override-apply`.

After the dry-run contract fix, live dry-run passed:

- `ok:true`
- `status:"dry-run-manual-approval-cleanup-override-ready"`
- `dryRun:true`
- `removedCount:0`
- `rowA950Excluded:true`
- `rawCanonicalBindingCountBefore:14`
- `rawCanonicalBindingCountAfter:14`
- `exportableCanonicalBindingCount:12`
- `productSyncReady:false`

The operator then explicitly approved and ran controlled apply for `row:fdd2456fc8a2` only. The
result was safe and zero-write, but blocked:

- `ok:false`
- `status:"blocked-manual-approval-required"`
- `gateSatisfied:true`
- `applyRequested:true`
- `dryRun:false`
- `rowA950Excluded:true`
- `rawCanonicalBindingCountBefore:14`
- `rawCanonicalBindingCountAfter:14`
- `exportableCanonicalBindingCount:12`
- `removedCount:0`
- blocker: `operational5-orphan-binding-manual-approval-cleanup-override-manual-approval-required`
- `productSyncReady:false`

## Root Cause

The source accepted only a controlled-apply manual approval object that repeated the top-level
`chatToken` and `folderToken`, and included `removeOnlyExactDanglingFolderBindingRow:true`. The live
operator approval object supplied the chat/folder tokens at the command top level and did not include
that redundant exact-row field. The API already enforces exact-row targeting in source:

- `rowToken:"row:fdd2456fc8a2"` is required;
- `row:a950a44b859f` is rejected/excluded;
- the resolved canonical row must match the fixed chat and folder tokens;
- the strict evidence receipt for `row:fdd2456fc8a2` is required;
- the exact apply gate is required before any write.

The missing field was therefore a contract mismatch, not an operator authorization failure.

## Fix

`operational5ManualApprovalCleanupOverrideAccepted(...)` now treats nested approval `chatToken` and
`folderToken` as optional-but-matching, and treats `removeOnlyExactDanglingFolderBindingRow` as
optional-but-not-false for controlled apply:

- absent: accepted, because the source-side exact-row gates still apply;
- `true`: accepted;
- `false`: rejected.

The dry-run approval contract from `ab3c8c75` remains lighter and still uses `noCleanupApplyYet:true`.

## Approved Controlled-Apply Call Shape

Controlled apply is still not run by this slice. The approved operator-controlled call shape is:

```js
await H2O.Studio.store.folders.operational5OrphanBindingManualApprovalCleanupOverride({
  dryRun: false,
  apply: true,
  gate: "operational5-orphan-binding-manual-approval-cleanup-override-apply",
  rowToken: "row:fdd2456fc8a2",
  chatToken: "r:2f29d39a6c4f",
  folderToken: "r:2d5469848470",
  manualApproval: {
    schema: "h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1",
    approved: true,
    reviewedOverrideApproved: true,
    cleanupApplyApproved: true,
    scope: "row:fdd2456fc8a2-only",
    targetRowToken: "row:fdd2456fc8a2",
    excludedRowToken: "row:a950a44b859f",
    strictEvidenceReceiptId: "operational5-orphan-binding-strict-evidence-receipt:row:fdd2456fc8a2",
    strictEvidenceReceiptHash: "7d169983ebbfb0d5076ac319282cd49ae04af2b70d93ba0a8f51674a1fdccf5c",
    reason: "operator-approved-fdd-only-controlled-cleanup-after-dry-run",
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

`removeOnlyExactDanglingFolderBindingRow:true` may also be supplied, but an explicit
`removeOnlyExactDanglingFolderBindingRow:false` must block.

## Retained Boundaries

- Apply without the exact gate still blocks.
- Apply with missing/invalid approval still blocks.
- `row:fdd2456fc8a2` remains the only eligible target.
- `row:a950a44b859f` remains documented debt and rejected/excluded.
- Persisted strict evidence receipt is still required.
- Controlled apply model removes exactly one row only when gated and approved.
- Duplicate apply remains zero-write/idempotent.
- No live cleanup apply was run by Codex.
- No folder/chat/binding/tombstone/ledger/import/export/render-mirror/WebDAV/CAS mutation occurred.
- `productSyncReady:false` remains.
- WebDAV/cloud/relay/`fullBundle.v3` remains deferred/not started.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Next Step

If the operator chooses to proceed, rerun controlled apply with the approved call shape above. Do not
broaden scope beyond `row:fdd2456fc8a2`; keep `row:a950a44b859f` as documented debt.
