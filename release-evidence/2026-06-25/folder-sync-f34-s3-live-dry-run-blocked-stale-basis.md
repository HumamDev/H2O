# Folder Sync — Phase F34: S3 Live Desktop Dry-Run — BLOCKED by live stale-basis

Date: 2026-07-01

## Status

LIVE DESKTOP DRY-RUN — BLOCKED (not passed, not failed). Two live Desktop Studio DevTools dry-run attempts
of the F32 sortOrder handler (`H2O.Studio.sync.sortOrderReorder.apply(request)`, NO `apply:true`, NO gate)
both returned `status: "rejected"`, `reason: "stale-basis"` with zero writes. F34 therefore did NOT produce
the required planned dry-run receipt (`status: "dry-run"`), so the S3 live dry-run proof is BLOCKED. It is
NOT a product failure: the handler correctly rejected a stale basis and wrote nothing. No `apply:true`, no
gate, no canonical write, no mirror write, no `productSyncReady` flip, no Chat Saving / WebDAV / archive CAS
work. No product source was modified.

## Context

- F33 in-process re-prove committed: `fbfd6d8`. F32 handler committed: `abe4ca0`.
- F34 was approved for a live Desktop dry-run ONLY. No `apply:true` was used; no gate was passed; no
  controlled apply was run. Two live DevTools attempts were made.

## Cross-Surface Requirement (carried)

Desktop SQLite canonical; Chrome / native extension and mobile remain non-canonical proposers. No
multi-device / mobile / remote-WebDAV / CAS work here.

## Live Attempts (recorded)

### Attempt 1 (recorded receipt)
```json
{
  "status": "rejected",
  "reason": "stale-basis",
  "dryRun": true,
  "canonicalWriteCount": 0,
  "mirrorReprojection": "deferred-to-s2b",
  "canonicalAuthority": "desktop-sqlite",
  "noFolderDelete": true,
  "noFolderPurge": true,
  "noChatDelete": true,
  "noBindingMutation": true,
  "noTombstoneMutation": true,
  "appliedAt": null,
  "orderPayloadCount": 6,
  "basisOrderingHash": "oh:d526bd90",
  "requestedOrderingHash": "oh:7b510f16"
}
```

### Attempt 2 (recorded receipt)
```json
{
  "status": "rejected",
  "reason": "stale-basis",
  "dryRun": true,
  "canonicalWriteCount": 0,
  "mirrorReprojection": "deferred-to-s2b",
  "canonicalAuthority": "desktop-sqlite",
  "noFolderDelete": true,
  "noFolderPurge": true,
  "noChatDelete": true,
  "noBindingMutation": true,
  "noTombstoneMutation": true,
  "appliedAt": null,
  "orderPayloadCount": 6,
  "basisOrderingHash": "oh:2842e705",
  "requestedOrderingHash": "oh:2842e705"
}
```

## Interpretation

- F34 did NOT pass: the required planned receipt `status: "dry-run"` was never produced, because the
  handler rejects conflicts (here `stale-basis`) BEFORE reaching the dry-run planned-receipt branch.
- F34 is NOT a product failure: on both attempts the handler wrote nothing (`canonicalWriteCount: 0`,
  `mirrorReprojection: "deferred-to-s2b"`, `appliedAt: null`) and preserved every safety marker
  (`noFolderDelete/noFolderPurge/noChatDelete/noBindingMutation/noTombstoneMutation: true`). Rejecting a
  stale basis with zero writes is the intended, safe behavior (the R1 native-owner-clobber mitigation).
- The live proof is BLOCKED by a live basis-hash / request-shape mismatch: the `basisOrderingHash` the
  DevTools snippet computed (via `H2O.Studio.sync.sortOrderReorder.orderingHash(snapshot.visibleOrderIds)`)
  did not equal the basis hash the handler computes internally inside `classify`
  (`folderSortorderOrderingHash(f32CurrentPayloadOrder(payloadIds, freshSnapshot))`). Attempt 2 is the
  telling case: `basisOrderingHash === requestedOrderingHash === "oh:2842e705"` (an identity, no-op
  proposal) was STILL rejected `stale-basis` — proving the mismatch is in how the basis hash is derived,
  not in the reorder itself. The most likely cause (to be confirmed by F34a, no writes): the snippet hashes
  `snapshot.visibleOrderIds` (the store's `getAll()` order, which tie-breaks equal `sort_order` by name),
  whereas `classify` hashes the payload ids sorted numerically by `sortOrderById` with no name tie-break —
  so when folders share `sort_order` values (common when the user never manually reordered), the two orders
  (and hashes) diverge and the strict basis check can never be satisfied by a snippet-built request.

## What This (Safely) Confirms

- The handler's strict basis stale-check is LIVE and load-bearing: it rejected on `stale-basis` and wrote
  nothing, exactly as designed.
- Zero canonical writes and zero mirror writes occurred (both receipts: `canonicalWriteCount: 0`,
  `mirrorReprojection: "deferred-to-s2b"`, `appliedAt: null`).
- Every destructive-safety marker held true on both attempts.

## Blocked Boundaries (reaffirmed)

- S4 controlled apply REMAINS BLOCKED (S3 live dry-run is not passed; do not run a gated apply).
- S2b mirror re-projection REMAINS design-only (not implemented; still `deferred-to-s2b`).
- S5 F11 allowed-set change REMAINS BLOCKED — `field-mismatch:sortOrder` stays in the F11 `blockedClasses`.
- `binding-mismatch` remains BLOCKED; binding receipt schema remains UNMINTED.
- `productSyncReady` remains `false`. Public/premium sync remains blocked. Real remote WebDAV remains
  deferred. `fullBundle.v3` not minted. Chat Saving WebDAV/cloud/archive CAS remains BLOCKED.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical proposers; hard
  delete blocked; folder delete preserves chats.

## Verdicts

- F34: BLOCKED (S3 live dry-run not passed; not a product failure). Two live attempts both safely rejected
  `stale-basis` with zero writes; the required `status: "dry-run"` planned receipt was not produced due to a
  live basis-hash / request-shape mismatch.
- No apply, no gate, no canonical write, no mirror write, no flip, no CAS, no source change.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED. `productSyncReady`:
  remains `false`. Chat Saving CAS: REMAINS BLOCKED. The closed Labels / Tags / Categories metadata lane is
  not modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain).

## Recommended F34a

F34a = a NO-WRITE live basis-hash alignment diagnostic (read-only; no `apply:true`; no gate; no write): on
a live dev Desktop, dump — hash-only / redacted — (1)
`H2O.Studio.sync.sortOrderReorder.orderingHash(snapshot.visibleOrderIds)`, (2) the internal
`classify`-equivalent basis = `orderingHash(payloadIds sorted by snapshot.sortOrderById)`, and (3) the raw
`sort_order` values per folder (to reveal ties), so the exact source of the basis mismatch is identified
WITHOUT any write. F34a decides whether the fix is a proposer-side hashing convention (hash the same order
the handler hashes) or a handler-side tie-break/normalization change (a small, separately-approved F32
follow-up). Keep `field-mismatch:sortOrder` gated, `binding-mismatch` blocked, `productSyncReady` false,
Chat Saving CAS blocked, and S4/S2b/S5 blocked until the basis alignment is resolved and S3 passes.
