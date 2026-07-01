# Folder Sync — Phase F34a: No-Write Live Basis-Hash Alignment Diagnostic

Date: 2026-07-01

## Status

DIAGNOSTIC / EVIDENCE ONLY. A read-only live Desktop diagnostic (`readOnly: true`, `calledApply: false`,
`passedGate: false`, `mutated: false`). No `apply:true`, no F32 apply gate, no canonical write, no mirror
write, no `productSyncReady` flip, no Chat Saving / WebDAV / archive CAS work. No product source was
modified. F34a EXPLAINS F34 Attempt 2 and NARROWS F34 Attempt 1 to a hypothesis; it is **NOT** a pass of the
S3 live dry-run (no planned `status:"dry-run"` receipt was produced, so S3 remains blocked).

## Context

- F34 blocked closeout committed: `4915d2a`.
- F34a ran the F34-recommended no-write basis-hash alignment diagnostic on a live dev Desktop Studio via
  `H2O.Studio.sync.sortOrderReorder.snapshot()` + `orderingHash(...)`. It called **no** apply, passed **no**
  gate, and mutated **nothing** (`readOnly: true`, `calledApply: false`, `passedGate: false`,
  `mutated: false`).
- The two F34 live attempts recorded: Attempt 1 — basis `oh:d526bd90`, requested `oh:7b510f16`; Attempt 2 —
  basis === requested === `oh:2842e705`. Both were rejected `stale-basis` with zero writes.

## Cross-Surface Requirement (carried)

Desktop SQLite canonical; Chrome / native extension and mobile remain non-canonical proposers. No
multi-device / mobile / remote-WebDAV / CAS work here.

## Recorded Diagnostic Output (redacted / hash-only)

```json
{
  "tag": "folder-sync-f34a-basis-diagnostic",
  "readOnly": true,
  "calledApply": false,
  "passedGate": false,
  "mutated": false,
  "visibleFolderCount": 6,
  "sortOrderValues": [0, 0, 0, 0, 0, 0],
  "tieGroupCount": 1,
  "nonMonotonicInversionCount": 0,
  "getAllOrderEqualsSortOrderSorted": true,
  "hash1_visibleOrder": "oh:d526bd90",
  "hash2_structuredObjects": "oh:2842e705",
  "hash3_classifySorted": "oh:d526bd90",
  "hash1EqualsHash3": true,
  "liveMatchesF34": {
    "hash1MatchesAttempt1Basis": true,
    "hash2MatchesAnyRecorded": true
  }
}
```

Redacted per-folder tokens (one-way 8-hex FNV of each id) were shown live; only the aggregate / redacted
fields are recorded here. `sortOrderValues` is the six visible folders' canonical `sort_order`, **all 0** — a
single tie group of six (`tieGroupCount: 1`), with **no** non-monotonic inversions
(`nonMonotonicInversionCount: 0`), so `getAllOrderEqualsSortOrderSorted: true`.

## Interpretation

### Attempt 2 — EXPLAINED (proposer-side structured-object hashing bug)

`hash2_structuredObjects: "oh:2842e705"` matches the Attempt-2 recorded basis/requested hash exactly
(`hash2MatchesAnyRecorded: true`). The handler's `orderingHash` stringifies each element via
`cleanString` (`String(value).trim()`), so passing an array of structured objects —
`orderingHash([{ folderId, position }, ...])` — collapses every element to `'[object Object]'` and yields a
**count-only constant** (`oh:2842e705` for six elements) instead of the real id-order hash. Attempt 2 set
`basisOrderingHash === requestedOrderingHash === "oh:2842e705"`, i.e. it hashed structured objects for BOTH
sides; the handler's `classify` computed the real id-order hash `oh:d526bd90`; since
`oh:2842e705 !== oh:d526bd90`, classify returned `stale-basis`. **Attempt 2's `stale-basis` is a proposer-side
structured-object hashing bug, not a handler fault.**

### Attempt 1 — UNRESOLVED (needs F34b classifier introspection)

Attempt 1's basis `oh:d526bd90` **equals** the current classify-equivalent hash
(`hash1MatchesAttempt1Basis: true`; `hash1_visibleOrder === hash3_classifySorted === "oh:d526bd90"`,
`hash1EqualsHash3: true`), i.e. Attempt 1's basis WAS computed correctly as the real id-order hash — yet F34
Attempt 1 was still rejected `stale-basis`. So Attempt 1 is **not** explained by the structured-object bug and
remains **UNRESOLVED**.

Because the current live state has all six `sort_order` values tied at 0 (`tieGroupCount: 1`,
`nonMonotonicInversionCount: 0`, `getAllOrderEqualsSortOrderSorted: true`), the **leading hypothesis** (to be
confirmed by F34b, no writes) is that the classifier's basis re-derivation
`orderingHash(f32CurrentPayloadOrder(payloadIds, snapshot))` is **order-blind under fully-tied `sort_order`**:
sorting the requested new-order payload by an all-equal `sort_order` key is a stable no-op that returns the
payload in its requested order, so classify's internal current-hash equals the *requested* hash
(`oh:7b510f16`) rather than the *basis* hash (`oh:d526bd90`) — making the basis check unsatisfiable for any
genuine reorder while `sort_order` is degenerate. This is a HYPOTHESIS only; F34a does not directly observe
the classifier's inputs/return, so Attempt 1 stays formally UNRESOLVED pending the F34b live
classifier-introspection diagnostic.

## What F34a (Safely) Confirms

- The diagnostic was fully read-only (`readOnly: true`, `calledApply: false`, `passedGate: false`,
  `mutated: false`): it called only `snapshot()` (reads `folders.getAll()` + recently-deleted) and the pure
  `orderingHash(...)`. Zero canonical writes, zero mirror writes.
- Attempt 2's `stale-basis` is a proposer-side structured-object hashing bug.
- Attempt 1's basis was well-formed (`oh:d526bd90` = the real current-order hash), so its rejection points at
  the handler's basis re-derivation under tied `sort_order` — to be introspected by F34b, no writes.
- F34a is **DIAGNOSTIC ONLY** and is **not** a pass of the S3 live dry-run: no planned `status:"dry-run"`
  receipt was produced; S3 remains blocked.

## Blocked Boundaries (reaffirmed)

- S4 controlled apply REMAINS BLOCKED (S3 live dry-run is not passed; no gated apply).
- S2b mirror re-projection REMAINS design-only (not implemented; still `deferred-to-s2b`).
- S5 F11 allowed-set change REMAINS BLOCKED — `field-mismatch:sortOrder` stays in the F11 `blockedClasses`.
- `binding-mismatch` remains BLOCKED; binding receipt schema remains UNMINTED.
- `productSyncReady` remains `false`. Public/premium sync remains blocked. Real remote WebDAV remains
  deferred. `fullBundle.v3` not minted. Chat Saving WebDAV/cloud/archive CAS remains BLOCKED.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical proposers; hard delete
  blocked; folder delete preserves chats.

## Verdicts

- F34a: DIAGNOSTIC-PASS (no-write). Explains F34 Attempt 2 (proposer-side structured-object hashing) and
  narrows F34 Attempt 1 to a tied-`sort_order` classifier-derivation hypothesis, marking Attempt 1 UNRESOLVED
  pending F34b. F34a is diagnostic only and is not a pass of the S3 dry-run. No apply, no gate, no
  canonical write, no mirror write, no flip, no CAS, no source change.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED. `productSyncReady`: remains
  `false`. Chat Saving CAS: REMAINS BLOCKED. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain).

## Recommended F34b

F34b = a NO-WRITE live classifier-introspection diagnostic (read-only; no `apply:true`; no gate; no write).
On a live dev Desktop, reconstruct (a) an identity request and (b) a genuine-reorder request, then call the
EXPOSED pure `H2O.Studio.sync.sortOrderReorder.classify(request, snapshot, ctx)` directly, and dump —
hash-only / redacted — the classifier's derived current order (`f32CurrentPayloadOrder`-equivalent = payload
sorted by `snapshot.sortOrderById`), its `currentHash = orderingHash(...)`, the request's basis/requested
hashes, and the returned conflict reason. This directly observes why a correctly-based reorder is rejected
`stale-basis` under fully-tied `sort_order`, and confirms or refutes the F34a hypothesis WITHOUT any write.
F34b decides whether the fix is proposer-side (hash string ids, and/or seed non-degenerate `sort_order`) or a
handler-side basis-derivation / tie-break normalization (a small, separately-approved F32 follow-up). Keep
`field-mismatch:sortOrder` gated, `binding-mismatch` blocked, `productSyncReady` false, Chat Saving CAS
blocked, and S4/S2b/S5 blocked until the basis derivation is resolved and S3 passes.
