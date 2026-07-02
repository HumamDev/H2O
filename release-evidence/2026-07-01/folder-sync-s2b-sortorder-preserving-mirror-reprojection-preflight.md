# Folder Sync - S2b Preflight: sortOrder-Preserving Mirror Re-Projection (Design-Only Gate)

Status: S2B PREFLIGHT GO-WITH-CONDITIONS.

This is a DESIGN-ONLY preflight gate. No product source was edited. S2b is NOT implemented in this slice. It
specifies the safe contract for the sortOrder-preserving render/mirror re-projection that must run AFTER a
successful canonical Desktop SQLite `sortOrder` apply, and gates that implementation behind explicit
conditions. It does not run live Desktop, does not call apply, does not pass any gate, does not change the F11
allowed/blocked set, does not flip `productSyncReady`, and does not touch binding/WebDAV/cloud/archive
CAS/Chat Saving/Reader Notes.

## References

- F32c tied-sortOrder basis normalization implementation: `8293156`.
- S3 live dry-run retry evidence: `d0e330cb`.
- S4 controlled apply evidence: `c5553526`.
- Post-S4 readback / idempotency evidence: `a47742d5`.

## Current State (carried)

- Canonical readback persisted to `oh:d91ad328` (post-S4): `readbackVisibleOrderHash:"oh:d91ad328"`,
  `readbackCanonicalSortedHash:"oh:d91ad328"`; `sortOrder` no longer tied (`distinctSortOrderValueCount:6`,
  min 0, max 5); the F32b consumed-operation ledger holds the applied record.
- Mirror remains `deferred-to-s2b`. Full S2 remains OPEN only because mirror re-projection is still deferred.
- S5 / F11 allowed-set flip remains blocked; `productSyncReady` remains `false`; Chat Saving
  WebDAV/cloud/archive CAS remains blocked.

## Why S2b Cannot Reuse the F11 Rebuild Helper

The existing F11 render-mirror rebuild helper `rebuildRenderMirrorFromSqlite`
(`src-surfaces-base/studio/store/folders.tauri.js`) **strips ordering**: it executes
`delete next.sortOrder;` and `delete next.sort_order;` on each projected folder row. Reusing it would
therefore erase the very `sortOrder` that S4 just wrote and that post-S4 confirmed persisted. **S2b must NOT
reuse `rebuildRenderMirrorFromSqlite`.** S2b requires a NEW, sortOrder-preserving projection that carries
each folder's canonical `sortOrder` into the render/mirror surface.

## Required S2b Contract (design-only; to be implemented + proven in a later slice)

Ordering / preconditions — the mirror re-projection may run ONLY after, in strict order:

1. request validation passes,
2. the canonical Desktop SQLite `sortOrder` write succeeds,
3. the post-apply canonical ordering hash equals the requested ordering hash.

Projection requirements — after those three preconditions hold:

- Project the canonical Desktop SQLite folder ordering into the render/mirror surface.
- Preserve folder `sortOrder` (a sortOrder-preserving derived projection of canonical state).
- Preserve existing safe visual metadata behavior (no regression to current render fields).
- Keep `mirrorReprojection` evidence explicit in the receipt (e.g. an applied-mirror marker rather than the
  current `deferred-to-s2b`), so the re-projection is observable.

Hard invariants — the mirror re-projection MUST:

- Never lead canonical state — the mirror is strictly derived and always trails the canonical write; there is
  no mirror-only order repair and no mirror-first path.
- Be idempotent — re-running the projection over unchanged canonical state produces the same mirror and no
  additional writes.
- Be bounded and explicit — the write counter is limited to the canonical `sort_order` write plus the single
  mirror projection; no unbounded fan-out.
- NOT mutate bindings.
- NOT mutate tombstones.
- NOT delete folders.
- NOT delete chats.
- NOT touch WebDAV / cloud / relay / archive CAS / any transport.
- NOT flip `productSyncReady`.
- NOT change the F11 allowed/blocked set in the S2b implementation slice (the S5/F11 flip is a later,
  separate slice).

## Gate Conditions (GO-WITH-CONDITIONS)

- S2b is required BEFORE the S5 / F11 allowed-set flip.
- S2b is required BEFORE `productSyncReady` can become `true`.
- S2b is required BEFORE any WebDAV / cloud / relay / CAS work.
- S2b implementation must be dry-run / proof FIRST (a bounded projection proof) before any wider allowed-set
  flip is even considered.
- Until S2b implementation + proof lands: the S5 / F11 allowed-set flip stays blocked, `productSyncReady`
  stays `false`, `binding-mismatch` stays blocked, the binding receipt schema stays unminted, and Chat Saving
  WebDAV/cloud/archive CAS stays blocked.

## Boundaries (reaffirmed)

- Mirror remains `deferred-to-s2b` in the current handler; this preflight does not change it.
- S5 / F11 allowed-set flip remains BLOCKED (`field-mismatch:sortOrder` and `binding-mismatch` stay in the
  F11 `blockedClasses`).
- `productSyncReady` remains `false`; public/premium remains blocked; no `fullBundle.v3`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked; binding receipt schema remains unminted.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical proposers; hard delete
  blocked; folder delete preserves chats.
- No product source change is part of this preflight slice.

## Verdict

S2B PREFLIGHT GO-WITH-CONDITIONS. The sortOrder-preserving mirror re-projection contract is specified
design-only: it runs strictly after canonical write success + post-apply hash verification, preserves
`sortOrder`, never leads canonical state, is idempotent/bounded, and performs no binding/tombstone/chat/delete
mutation and no WebDAV/cloud/archive CAS. It must NOT reuse `rebuildRenderMirrorFromSqlite` (that F11 helper
strips `sortOrder`/`sort_order`). S2b is NOT implemented here; it is required before S5/F11, before
`productSyncReady`, and before any WebDAV/cloud/relay/CAS work. No apply, no gate, no canonical write, no
mirror write, no flip, no CAS, no source change.

## Recommended Next Slice

After this preflight is committed: **S2b implementation / proof** (the bounded, dry-run-first
sortOrder-preserving mirror projection with a validator) — NOT the S5 / F11 allowed-set flip, NOT
`productSyncReady`, NOT WebDAV/cloud/archive CAS. Keep `field-mismatch:sortOrder` gated, `binding-mismatch`
blocked, `productSyncReady` false, and Chat Saving CAS blocked until S2b implementation + proof lands and is
separately approved.
