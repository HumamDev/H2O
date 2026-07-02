# Folder Sync - F32c Tied-sortOrder Basis Normalization Preflight

Date: 2026-07-02

## Status

DESIGN-ONLY PREFLIGHT. No product source was edited in this slice.

Verdict: GO-WITH-CONDITIONS for a later F32c implementation, but NO-GO for S3 retry until F32c lands and is re-proven.

This slice does not run live Desktop, does not call apply, does not pass the F32 gate, does not retry S3, does not start S4, does not implement S2b, does not change the F11 allowed or blocked set, and does not flip `productSyncReady`.

## Context

- F32b persistent idempotency and behavioral apply proof: `247a0de`.
- F34 blocked closeout: `4915d2a`.
- F34a basis-hash diagnostic: `0cab297`.
- F34b classifier introspection: `bdb66bf`.

F34b confirmed the live Desktop real classifier was exposed and reproducible:

```json
{
  "classifyExposed": true,
  "classifierSource": "real-api-classify",
  "visibleFolderCount": 6,
  "allSortOrderTied": true,
  "identity": {
    "classifyReason": null,
    "basisOrderingHash": "oh:d526bd90",
    "requestedOrderingHash": "oh:d526bd90",
    "classifierDerivedCurrentHash": "oh:d526bd90"
  },
  "genuineReorder": {
    "classifyReason": "stale-basis",
    "basisOrderingHash": "oh:d526bd90",
    "requestedOrderingHash": "oh:d91ad328",
    "classifierDerivedCurrentHash": "oh:d91ad328",
    "derivedCurrentHashEqualsRequested": true,
    "derivedCurrentHashEqualsBasis": false,
    "genuineReorderUnsatisfiableUnderTies": true
  }
}
```

F34b is diagnostic-only and not an S3 pass. S3 retry remains blocked. S4 controlled apply remains blocked. S2b remains design-only. S5/F11 remains blocked. Product sync remains `productSyncReady:false`. Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Root Cause

The F32/F32b safety model is sound and must not be weakened.

The defect is localized to basis derivation. The current handler helper `f32CurrentPayloadOrder(payloadIds, snapshot)` stable-sorts request payload IDs by canonical `sortOrder`. Under all-tied `sortOrder`, that sort is a no-op, so the classifier derives current hash from the proposed payload order.

For a genuine reorder in all-tied state, derived current hash equals requested hash instead of the pre-reorder basis hash. This makes stale-basis unsatisfiable for real reorder requests in the degenerate all-tied sortOrder state.

## F32c Contract

Preferred handler-side normalization:

`derived current order = payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)`

Preferred proposer basis contract:

`basisOrderingHash = orderingHash(current visible order restricted to the payload set)`

This preserves the F34 Attempt 1 convention: basis was `orderingHash(snapshot.visibleOrderIds)`. For subset payloads, the basis is the current visible order filtered to the payload IDs before hashing.

The later F32c implementation should change only the handler-side basis derivation helper, preferably `f32CurrentPayloadOrder`.

## Rejected Fix Paths

- Do not use proposer-side-only hashing of the broken handler derivation as the sole fix.
- Do not reject all-tied `sortOrder` as the fix.
- Do not normalize by writing canonical `sortOrder` in this slice.
- Do not implement mirror-after-write.
- Do not change request schema.
- Do not change receipt schema.
- Do not change conflict precedence except fixing the derived current order.
- Do not change dry-run default.
- Do not change F32b idempotency ledger semantics.
- Do not change the apply gate.
- Do not write the mirror.
- Do not change the F11 allowed or blocked set.
- Do not flip `productSyncReady`.
- Do not touch binding schemas, binding handlers, binding receipts, WebDAV/cloud/archive, Chat Saving, saved-chat, or Reader Notes.

## Required Implementation Proofs Later

F32c implementation must add tied-sortOrder fixtures:

- F33 VM decision-path matrix: all-zero sortOrder genuine reorder should classify accepted/null with correct visible-order basis.
- F33 wrong-basis tied fixture should still classify `stale-basis`.
- F32b sqlite behavioral harness should seed all-zero sortOrder and prove dry-run genuine reorder produces a planned dry-run receipt after F32c.
- Existing distinct-sortOrder fixtures must remain green.

S3 retry after F32c must be a genuine reorder with no `apply:true`, no gate, and expected planned `status:"dry-run"` receipt.

S4 remains blocked even after F32c until S3 passes and explicit approval is given.

## Boundary Decisions

- S3 retry remains blocked until F32c lands and is re-proven.
- S4 controlled apply remains blocked.
- S2b remains design-only.
- S5/F11 remains blocked.
- `field-mismatch:sortOrder` remains blocked in F11.
- `binding-mismatch` remains blocked.
- Binding receipt schema remains unminted.
- `mirrorReprojection: 'deferred-to-s2b'` remains the current posture.
- `FOLDER_STATE_DATA_KEY` mirror write-through is not introduced by this slice.
- `productSyncReady` remains `false`.
- WebDAV/cloud/archive CAS remains blocked.
- Chat Saving CAS remains blocked.

## Recommended Next Step

After review, commit F32c-preflight. Then separately authorize F32c implementation as a product-source slice focused only on handler-side tied-sortOrder basis normalization.
