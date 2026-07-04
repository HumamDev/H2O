# Operational.5 - Orphan-Binding Strict Evidence Receipt Write-Intent Fix

Verdict: **OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT WRITE-INTENT FIX IMPLEMENTED - CLEANUP STILL BLOCKED**.

This slice fixes the strict evidence receipt write-intent check after live operator proof showed that
the receipt gate was recognized but `apply:true` did not request persistence.

## Context

- Strict evidence receipt implementation: `6d9267f42e88cb14084ed46483a9cd870b2ac159`.
- Live dry-run passed for:
  - `rowToken:"row:fdd2456fc8a2"`;
  - `chatToken:"r:2f29d39a6c4f"`;
  - `folderToken:"r:2d5469848470"`.
- The operator then attempted the intended controlled receipt call:
  - `dryRun:false`;
  - `apply:true`;
  - `gate:"operational5-orphan-binding-strict-evidence-receipt-record"`.
- Live result showed:
  - `ok:true`;
  - `gateSatisfied:true`;
  - `writeRequested:false`;
  - `dryRun:true`;
  - `status:"dry-run-strict-evidence-receipt-ready"`;
  - `receiptPersisted:false`.

## Root Cause

`operational5OrphanBindingStrictEvidenceReceipt(opts)` only treated `opts.write === true` or
`opts.record === true` as write intent. The standard controlled-write call shape in this lane uses
`apply:true` plus the exact gate, so the gate was accepted while persistence remained disabled.

## Source Fix

Product source changed:

- `src-surfaces-base/studio/store/folders.tauri.js`

The write-intent predicate now accepts all explicit receipt write spellings:

- `opts.apply === true`;
- `opts.write === true`;
- `opts.record === true`.

The approved live recording call shape is:

```js
await H2O.Studio.store.folders.operational5OrphanBindingStrictEvidenceReceipt({
  rowToken: 'row:fdd2456fc8a2',
  chatToken: 'r:2f29d39a6c4f',
  folderToken: 'r:2d5469848470',
  dryRun: false,
  apply: true,
  gate: 'operational5-orphan-binding-strict-evidence-receipt-record'
});
```

Expected controlled receipt result after this fix:

- `writeRequested:true`;
- `dryRun:false`;
- `receiptPersisted:true`;
- `status:"recorded-strict-evidence-receipt"`, or
  `status:"already-recorded-strict-evidence-receipt"` on idempotent duplicate replay;
- `cleanupApplyApproved:false`;
- `noBindingDelete:true`;
- `productSyncReady:false`.

## Retained Boundaries

- Dry-run remains zero-write.
- `apply:true` without the exact gate remains blocked.
- Duplicate apply remains zero-write/idempotent.
- The receipt remains manual-review evidence only.
- The receipt is not cleanup authorization.
- The receipt is not a tombstone substitute.
- Cleanup apply remains blocked.
- No folder/chat/binding/tombstone deletion.
- No tombstone create/update/delete.
- No import/export state mutation.
- No render-mirror write.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.

## Live Execution

Codex did not run live receipt recording. Codex did not run cleanup apply. The next live step is an
operator-controlled retry of the approved receipt recording call above.
