# Folder Sync - S4 Controlled Apply After F32c

Status: S4 CONTROLLED APPLY PASSED AFTER F32C AND S3.

This evidence records the manual Desktop Studio WebView DevTools controlled apply after F32c and the S3 dry-run pass. This was the first controlled canonical Desktop SQLite `sortOrder` write in this lane. It was guarded by request validation and a successful dry-run precheck before `apply:true` was used with the F32 apply gate.

This slice records evidence only. It does not implement S2b, does not unblock S5/F11 allowed-set changes, does not flip `productSyncReady`, and does not touch binding/WebDAV/cloud/archive/Chat Saving/Reader Notes.

## References

- F32c tied-sortOrder basis normalization implementation: `8293156`.
- S3 live dry-run retry evidence: `d0e330cb`.

## Live Desktop Output

The S4 controlled apply was run manually in Desktop Studio WebView DevTools:

- validation passed first
- dry-run precheck passed first
- controlled apply used `apply:true`
- controlled apply used gate `folder-sync-f32-sortorder-apply`

```json
{
  "schema": "h2o.studio.folder-sync.s4-controlled-apply-after-f32c.v1",
  "phase": "S4",
  "step": "controlled-desktop-apply-after-s3-dry-run-pass",
  "surface": "desktop-studio",
  "mode": "manual-devtools-controlled-apply",
  "applyGate": "folder-sync-f32-sortorder-apply",
  "validation": {
    "ok": true,
    "blockers": []
  },
  "dryRunPrecheck": {
    "schema": "h2o.studio.folder-sortorder-reorder-receipt.v1",
    "status": "dry-run",
    "reason": "dry-run-sortorder-reorder-plan-ready",
    "dryRun": true,
    "canonicalWriteCount": 0,
    "mirrorReprojection": "deferred-to-s2b",
    "appliedAt": null,
    "idempotencyPersisted": false,
    "resultingOrderingHash": "oh:d526bd90",
    "noDestructiveMutation": true,
    "noFolderDelete": true,
    "noFolderPurge": true,
    "noChatDelete": true,
    "noBindingMutation": true,
    "noTombstoneMutation": true,
    "privacy": {
      "redacted": true,
      "hashOnly": true
    }
  },
  "controlledApply": {
    "schema": "h2o.studio.folder-sortorder-reorder-receipt.v1",
    "status": "applied",
    "reason": "sortorder-reorder-applied",
    "dryRun": false,
    "canonicalWriteCount": 6,
    "mirrorReprojection": "deferred-to-s2b",
    "appliedAt": "2026-07-02T12:17:13.148Z",
    "idempotencyPersisted": true,
    "resultingOrderingHash": "oh:d91ad328",
    "noDestructiveMutation": true,
    "noFolderDelete": true,
    "noFolderPurge": true,
    "noChatDelete": true,
    "noBindingMutation": true,
    "noTombstoneMutation": true,
    "privacy": {
      "redacted": true,
      "hashOnly": true
    }
  },
  "basisOrderingHash": "oh:d526bd90",
  "requestedOrderingHash": "oh:d91ad328",
  "resultingOrderingHash": "oh:d91ad328",
  "resultingMatchesRequested": true,
  "visibleFolderCount": 6,
  "canonicalWriteCount": 6,
  "sortOrderTieSummaryBeforeApply": {
    "allSortOrderTied": true,
    "distinctSortOrderValueCount": 1,
    "minSortOrder": 0,
    "maxSortOrder": 0
  },
  "safety": {
    "noHardDelete": true,
    "noPurge": true,
    "noChatDelete": true,
    "noFolderDelete": true,
    "noBindingMutation": true,
    "noTombstoneMutation": true,
    "noChromeCanonicalMutation": true,
    "noMirrorWrite": true,
    "noTransportWrite": true,
    "noWebdavWrite": true
  },
  "boundaries": {
    "s2b": "blocked",
    "s5": "blocked",
    "productSyncReady": false,
    "chatSavingWebdavCloudArchiveCas": "blocked",
    "bindingSchemaChanges": false,
    "webdavCloudArchiveCasChanges": false,
    "readerNotesChanges": false
  }
}
```

## Verdict

S4 controlled Desktop apply passed after F32c and S3.

The dry-run precheck produced the planned dry-run receipt:

- `status:"dry-run"`
- `reason:"dry-run-sortorder-reorder-plan-ready"`
- `canonicalWriteCount:0`
- `mirrorReprojection:"deferred-to-s2b"`
- `appliedAt:null`
- `resultingOrderingHash:"oh:d526bd90"`

The controlled apply produced the applied receipt:

- `status:"applied"`
- `reason:"sortorder-reorder-applied"`
- `dryRun:false`
- `canonicalWriteCount:6`
- `resultingOrderingHash:"oh:d91ad328"`
- `resultingMatchesRequested:true`
- `mirrorReprojection:"deferred-to-s2b"`
- `appliedAt:"2026-07-02T12:17:13.148Z"`
- `idempotencyPersisted:true`

No delete, purge, chat, binding, or tombstone mutation occurred. No mirror, WebDAV, or transport write occurred. The write was scoped to canonical Desktop SQLite folder `sortOrder`.

## Boundaries

- S2b remains blocked/design-only.
- S5/F11 remains blocked.
- `productSyncReady` remains `false`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.
- Binding receipt schema remains unminted.
- Mirror reprojection remains `deferred-to-s2b`.
- No mirror write-through was introduced.
- No product source change is part of this evidence slice.

Next recommended slice: post-apply readback/idempotency evidence, not S2b/S5/productSyncReady.
