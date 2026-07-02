# Folder Sync - S2b Live Projection Activation

Status: S2B LIVE PROJECTION PASSED.

This evidence records the manual Desktop Studio WebView DevTools activation of the S2b sortOrder-preserving render mirror projection after the live mirror readback showed stale render state. The activation used a current-order identity request only to trigger S2b projection on the render mirror. It was not a semantic reorder.

This slice records evidence only. It does not edit product source, does not implement S5/F11 allowed-set changes, does not flip `productSyncReady`, and does not touch binding/WebDAV/cloud/archive/Chat Saving/Reader Notes.

## References

- S2b sortOrder-preserving mirror reprojection implementation: `06839407`.
- S2b preflight: `aa2da1ac`.
- S4 controlled apply evidence: `c5553526`.
- Post-S4 readback/idempotency evidence: `a47742d5`.

## Live Desktop Output

The S2b live activation was run manually in Desktop Studio WebView DevTools:

- the snippet confirmed S2b code was loaded before apply
- the render mirror was stale before apply
- validation passed
- dry-run guard passed before controlled apply
- controlled apply used `apply:true`
- controlled apply used gate `folder-sync-f32-sortorder-apply`
- the request used current canonical visible order as both basis and requested order

No raw folder IDs, folder names, chat titles/content, peer identifiers, or raw idempotency key are recorded here. The idempotency key was present in the live request and is intentionally redacted.

```json
{
  "schema": "h2o.studio.folder-sync.s2b-live-projection-activation.v1",
  "phase": "S2b-live-projection-activation",
  "status": "passed",
  "blockers": [],
  "s2bCodeConfirmedLoaded": true,
  "applyGate": "folder-sync-f32-sortorder-apply",
  "preApply": {
    "canonicalVisibleOrderHash": "oh:d91ad328",
    "canonicalExpectedHash": "oh:d91ad328",
    "mirrorOrderHash": "oh:4d5d3d80",
    "mirrorMatchesCanonical": false,
    "mirrorSortOrderPreserved": false,
    "mirrorSortOrderStripped": true,
    "mirrorDistinctSortOrderValueCount": 3,
    "mirrorMinSortOrder": 0,
    "mirrorMaxSortOrder": 4,
    "mirrorCanonicalRowCount": 6
  },
  "validation": {
    "ok": true,
    "blockers": []
  },
  "dryRunReceipt": {
    "schema": "h2o.studio.folder-sortorder-reorder-receipt.v1",
    "status": "dry-run",
    "reason": "dry-run-sortorder-reorder-plan-ready",
    "resultingOrderingHash": "oh:d91ad328",
    "canonicalWriteCount": 0,
    "mirrorReprojection": "deferred-to-s2b",
    "idempotencyPersisted": false,
    "dryRun": true,
    "appliedAt": null
  },
  "controlledApplyReceipt": {
    "schema": "h2o.studio.folder-sortorder-reorder-receipt.v1",
    "status": "applied",
    "reason": "sortorder-reorder-applied",
    "resultingOrderingHash": "oh:d91ad328",
    "canonicalWriteCount": 6,
    "mirrorReprojection": "applied-sortorder-preserving-s2b",
    "mirrorReprojectionResult": "projected",
    "idempotencyPersisted": true,
    "dryRun": false,
    "appliedAt": "2026-07-02T15:33:37.167Z"
  },
  "postApply": {
    "mirrorOrderHash": "oh:d91ad328",
    "mirrorMatchesCanonical": true,
    "mirrorSortOrderPreserved": true,
    "mirrorSortOrderStripped": false,
    "mirrorDistinctSortOrderValueCount": 6,
    "mirrorMinSortOrder": 0,
    "mirrorMaxSortOrder": 5,
    "mirrorCanonicalRowCount": 6,
    "visualMetadataPresent": {
      "nameOrTitleRowCount": 6,
      "colorRowCount": 3
    },
    "redactedRows": [
      { "hasSortOrder": true, "hasSort_order": true, "sortOrder": 0 },
      { "hasSortOrder": true, "hasSort_order": true, "sortOrder": 1 },
      { "hasSortOrder": true, "hasSort_order": true, "sortOrder": 2 },
      { "hasSortOrder": true, "hasSort_order": true, "sortOrder": 3 },
      { "hasSortOrder": true, "hasSort_order": true, "sortOrder": 4 },
      { "hasSortOrder": true, "hasSort_order": true, "sortOrder": 5 }
    ]
  },
  "safety": {
    "dryRunGuardBeforeApply": true,
    "staleMirrorPrecheck": true,
    "noHardDelete": true,
    "noPurge": true,
    "noChatDelete": true,
    "noFolderDelete": true,
    "noBindingMutation": true,
    "noTombstoneMutation": true,
    "noChromeCanonicalMutation": true,
    "noTransportWrite": true,
    "noWebdavWrite": true
  },
  "boundaries": {
    "productSyncReady": false,
    "s5": "blocked",
    "f11AllowedSetFlip": "blocked",
    "chatSavingWebdavCloudArchiveCas": "blocked"
  }
}
```

## Verdict

S2b live projection passed.

Before activation, the Desktop canonical state was already correct and persisted, but the render mirror was stale:

- `mirrorMatchesCanonical:false`
- `mirrorSortOrderPreserved:false`
- `mirrorSortOrderStripped:true`
- `mirrorOrderHash:"oh:4d5d3d80"`

The dry-run guard passed first:

- `status:"dry-run"`
- `canonicalWriteCount:0`
- `mirrorReprojection:"deferred-to-s2b"`
- `resultingOrderingHash:"oh:d91ad328"`

The controlled identity/current-order apply then triggered S2b projection:

- `status:"applied"`
- `reason:"sortorder-reorder-applied"`
- `mirrorReprojection:"applied-sortorder-preserving-s2b"`
- `mirrorReprojectionResult:"projected"`
- `resultingOrderingHash:"oh:d91ad328"`
- `canonicalWriteCount:6`
- `idempotencyPersisted:true`

After activation, the render mirror matched canonical order and preserved sortOrder:

- `mirrorOrderHash:"oh:d91ad328"`
- `mirrorMatchesCanonical:true`
- `mirrorSortOrderPreserved:true`
- `mirrorSortOrderStripped:false`
- distinct sortOrder count: `6`
- minimum sortOrder: `0`
- maximum sortOrder: `5`

Visual metadata was preserved enough for render continuity:

- name/title rows: `6`
- color rows: `3`

## Boundaries

- No binding, tombstone, chat, delete, WebDAV, cloud, archive, or transport mutation occurred.
- S5/F11 allowed-set flip remains blocked.
- `productSyncReady` remains `false`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.
- Binding receipt schema remains unminted.
- Full S2 may be considered ready for a separate closeout decision after this evidence is committed, but this slice does not close S2.
