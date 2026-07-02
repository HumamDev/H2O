# Folder Sync - Post-S4 Readback / Idempotency Evidence

Status: POST-S4 READBACK AND LEDGER PERSISTENCE PASSED.

This evidence records the manual read-only Desktop Studio WebView DevTools diagnostic run after the S4
controlled apply. It proves that the S4 canonical `sortOrder` write persisted in canonical Desktop SQLite
state and that the F32b consumed-operation ledger holds the corresponding applied record. It proves readback
persistence + ledger persistence, NOT duplicate replay. It is read-only: no new canonical write, no apply, no
F32 gate, no mirror write. It does not implement S2b, does not unblock S5/F11 allowed-set changes, does not
flip `productSyncReady`, and does not touch binding/WebDAV/cloud/archive/Chat Saving/Reader Notes.

## References

- F32c tied-sortOrder basis normalization implementation: `8293156`.
- S3 live dry-run retry evidence: `d0e330cb`.
- S4 controlled apply evidence: `c5553526`.

## Live Desktop Output (read-only)

The post-S4 readback / idempotency diagnostic was run manually in Desktop Studio WebView DevTools using the
read-only path (`snapshot()` + `orderingHash()` + `listConsumedOperations()`). No `apply:true`, no F32 apply
gate, no canonical write, no mirror write, no `recordConsumedOperation`.

```json
{
  "tag": "folder-sync-post-s4-readback-idempotency",
  "readOnly": true,
  "calledApply": false,
  "newCanonicalWriteExpected": false,
  "s4Reference": {
    "requestedOrderingHash": "oh:d91ad328",
    "appliedAt": "2026-07-02T12:17:13.148Z"
  },
  "visibleFolderCount": 6,
  "readbackVisibleOrderHash": "oh:d91ad328",
  "readbackCanonicalSortedHash": "oh:d91ad328",
  "postApplyMatchesS4Requested": true,
  "canonicalSortedMatchesS4Requested": true,
  "sortOrderSummary": {
    "allSortOrderTied": false,
    "distinctSortOrderValueCount": 6,
    "minSortOrder": 0,
    "maxSortOrder": 5
  },
  "perFolderSortOrder": [
    { "token": "e8dd987a", "sortOrder": 0 },
    { "token": "c4a8ecfa", "sortOrder": 1 },
    { "token": "d5f12d57", "sortOrder": 2 },
    { "token": "a86ecb25", "sortOrder": 3 },
    { "token": "88c057f2", "sortOrder": 4 },
    { "token": "7fa4cad1", "sortOrder": 5 }
  ],
  "ledger": {
    "available": true,
    "totalRows": 1,
    "folderSortorderReorderCount": 1,
    "consumedApplyEventCount": 1,
    "hasTimestampField": false,
    "anyAtOrAfterS4AppliedAt": false,
    "samplesRedacted": [
      {
        "operationKind": "folder-sortorder-reorder",
        "envelopeKind": "applyEvent",
        "consumedStatus": "consumed",
        "dedupeKeyRedacted": "redacted",
        "eventDigestRedacted": "redacted",
        "timestamp": null
      }
    ]
  },
  "consumedRecordPresent": true,
  "idempotencyKeyRecoverable": false,
  "duplicateReplay": {
    "duplicateReplayAttempted": false,
    "duplicateReplayReason": "raw-s4-idempotency-key-not-captured"
  },
  "interpretation": "canonical sortOrder persisted to S4 applied order, sortOrder is no longer tied, consumed folder-sortorder-reorder applyEvent is present in the ledger, duplicate replay skipped because raw key was not captured."
}
```

## What This Proves

- **Canonical readback persistence.** The live canonical readback hash `readbackVisibleOrderHash:"oh:d91ad328"`
  and the canonical sorted readback hash `readbackCanonicalSortedHash:"oh:d91ad328"` both equal the S4
  requested/resulting hash `oh:d91ad328` (`postApplyMatchesS4Requested:true`,
  `canonicalSortedMatchesS4Requested:true`). The S4 write survived in canonical Desktop SQLite state.
- **sortOrder is no longer all tied.** `allSortOrderTied:false`, `distinctSortOrderValueCount:6`,
  `minSortOrder:0`, `maxSortOrder:5` — the six folders now carry the applied distinct order 0..5 (the F32c
  degenerate all-tied state is gone).
- **F32b ledger persistence.** The consumed-operation ledger is `available:true` with `totalRows:1`,
  `folderSortorderReorderCount:1`, and `consumedApplyEventCount:1` — exactly one
  `operationKind:"folder-sortorder-reorder"` / `envelopeKind:"applyEvent"` / `consumedStatus:"consumed"`
  record. `consumedRecordPresent:true`.
- **Timestamp not proven.** The ledger record has `hasTimestampField:false` (and `anyAtOrAfterS4AppliedAt:false`),
  so a timestamp-at-or-after the S4 `appliedAt` could NOT be proven from the ledger row. This is a recorded
  limitation, not a failure.
- **Duplicate replay NOT attempted / NOT proven.** `duplicateReplay.duplicateReplayAttempted:false` with
  `duplicateReplayReason:"raw-s4-idempotency-key-not-captured"` (`idempotencyKeyRecoverable:false`). The raw
  S4 idempotencyKey was not captured, so the persistent replay-is-a-0-write-duplicate behavior was NOT
  re-exercised here. This evidence therefore proves readback persistence + ledger persistence, not duplicate
  replay.
- **No new apply/write happened.** `readOnly:true`, `calledApply:false`, `newCanonicalWriteExpected:false`.

## Boundaries

- S2b remains blocked / design-only; mirror re-projection remains `deferred-to-s2b`; no mirror write-through
  was introduced.
- S5 / F11 allowed-set changes remain blocked (`field-mismatch:sortOrder` and `binding-mismatch` stay in the
  F11 `blockedClasses`).
- `productSyncReady` remains `false`; public/premium remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked; no `fullBundle.v3`; binding receipt schema remains
  unminted.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical proposers; hard delete
  blocked; folder delete preserves chats.
- No product source change is part of this evidence slice.

## Verdict

POST-S4 READBACK AND LEDGER PERSISTENCE PASSED. The S4 controlled `sortOrder` write persisted in canonical
Desktop state (readback `oh:d91ad328`), `sortOrder` is no longer tied (distinct 0..5), and the F32b
consumed-operation ledger holds the single folder-sortorder-reorder applyEvent consumed record. Duplicate
replay was skipped (raw key not captured) and is therefore not proven by this slice. No apply, no gate, no
canonical write, no mirror write, no flip, no CAS, no source change.

## Recommended Next Slice

Next recommended slice is S2b preflight / design (sortOrder mirror re-projection preflight) — NOT
`productSyncReady`, NOT WebDAV/cloud/archive CAS, NOT S5/F11 allowed-set changes. Keep
`field-mismatch:sortOrder` gated, `binding-mismatch` blocked, `productSyncReady` false, Chat Saving CAS
blocked, and S5 blocked until S2b is designed, proven, and separately approved.
