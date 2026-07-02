# Folder Sync — Phase F34b: No-Write Classifier Introspection

Date: 2026-07-02

## Status

DIAGNOSTIC / EVIDENCE ONLY (no write). F34b was executed as a live **read-only Desktop Studio WebView DevTools** diagnostic:

- `readOnly: true`
- `calledApply: false`
- `passedGate: false`
- `mutated: false`

No apply. No `F32` apply gate. No canonical write, no mirror write, no productSyncReady flip. No WebDAV/cloud/archive or Chat Saving CAS changes.

## Context

- F34 blocked closeout already committed: `4915d2a`.
- F34a basis-hash diagnostic already committed: `0cab297`.
- F32b persistent idempotency apply proof committed: `247a0de`.
- F34a narrowed the root cause to tied-sortOrder classifier derivation while confirming Attempt 2 as a proposer-side hashing issue. F34b directly introspects the exposed classifier to close that gap.

Cross-surface posture remains unchanged:

- Desktop SQLite is canonical.
- Chrome/native extension and mobile stay non-canonical proposers.
- No multi-device/import writeback path started in this slice.
- Real remote WebDAV remains deferred.
- Public/premium sync remains blocked.
- `productSyncReady` remains blocked (`false`).

## Live F34b Output (live console capture, hash-only/redacted)

```json
{
  "tag": "folder-sync-f34b-classifier-introspection",
  "readOnly": true,
  "calledApply": false,
  "passedGate": false,
  "mutated": false,
  "classifyExposed": true,
  "classifierSource": "real-api-classify",
  "visibleFolderCount": 6,
  "allSortOrderTied": true,
  "sortOrderValues": [0, 0, 0, 0, 0, 0],
  "identityRequest": {
    "basisOrderingHash": "oh:d526bd90",
    "requestedOrderingHash": "oh:d526bd90",
    "classifierDerivedCurrentHash": "oh:d526bd90",
    "validate": { "ok": true },
    "classifyReason": null,
    "classifyEquivReason": null
  },
  "genuineReorderRequest": {
    "payload": "first-two-swap",
    "basisOrderingHash": "oh:d526bd90",
    "requestedOrderingHash": "oh:d91ad328",
    "classifierDerivedCurrentHash": "oh:d91ad328",
    "derivedCurrentHashEqualsRequested": true,
    "derivedCurrentHashEqualsBasis": false,
    "validate": { "ok": true },
    "classifyReason": "stale-basis",
    "classifyEquivReason": "stale-basis"
  },
  "genuineReorderUnsatisfiableUnderTies": true
}
```

## Interpretation

1. `allSortOrderTied: true` confirms the live canonical set has six tied folders (`sortOrder` is all `0`).
2. The identity request confirms a matched basis:
   - basis/requested/derived-all currently hash all `oh:d526bd90`.
3. The genuine reorder (`first-two-swap`) produces `classifierDerivedCurrentHash: "oh:d91ad328"`, matching the requested hash.
4. Because `derivedCurrentHashEqualsBasis: false`, classifier current derivation did not preserve the basis and instead recomputed the current hash from the candidate payload-order under all-tied sortOrder.
5. With all ties, this is unsatisfiable-under-ties behavior: a real reorder request becomes unsatisfiable under the current live basis model (`genuineReorderUnsatisfiableUnderTies: true`), because basis-check compares against a non-canonical current hash computed from the requested order.

F34b therefore **confirms the tied-sortOrder basis-derivation bug in the live exposed classifier** and explains why F34 Attempt 1 is still rejected as `stale-basis` even with an otherwise correct basis hash.

## Verdict

- F34b confirms that the root cause is the live classifier current-hash derivation being request-order-shaped when folders are all tied by `sort_order`.
- F34b is diagnostic-only and **does not** produce an S3 pass.
- F34b does not authorize S3 retry yet.
- F34b does not authorize S4 controlled apply.
- S4 controlled apply remains blocked.
- S2b remains design-only (no implementation).
- S5 / F11 allowed-set flip remains blocked (`field-mismatch:sortOrder` stays in blocked set).
- `binding-mismatch` remains blocked.
- Binding receipt schema remains unminted.
- `productSyncReady` stays `false`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.
- Full `folder-sync` source path remains unchanged in this slice.

## Recommended next slice

F32c-preflight design-only as the next approved slice (sort-order preflight + tie handling proof/review path), after F34b evidence is reviewed.
