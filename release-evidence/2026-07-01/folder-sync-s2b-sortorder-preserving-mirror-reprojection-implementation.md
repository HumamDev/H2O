# Folder Sync - S2b Implementation/Proof: sortOrder-Preserving Mirror Re-Projection

Status: S2B IMPLEMENTATION PASSED (behavioral node:sqlite proof; no live Desktop). Full S2 remains PENDING
LIVE S2b PROOF (this slice proves the projection behaviorally; a live Desktop confirmation is a later,
separately-approved step before S2 is declared closed).

This slice implements the S2b contract committed at `aa2da1ac`: after a successful canonical Desktop SQLite
`sortOrder` write and post-apply ordering-hash verification, the F32 applied path projects the canonical order
into the render/mirror surface while PRESERVING each folder's `sortOrder`. It does NOT advance S5/F11, does NOT
flip `productSyncReady`, and does NOT touch binding/WebDAV/cloud/archive CAS/Chat Saving/Reader Notes.

## References

- S2b preflight (design-only gate): `aa2da1ac`.
- S4 controlled apply evidence: `c5553526`.
- post-S4 readback / idempotency evidence: `a47742d5`.
- F32c tied-sortOrder basis normalization: `8293156`.

## What Changed (product source, one file)

`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- A NEW projection function `s2bProjectSortOrderPreservingRenderMirror()` lives OUTSIDE the F32 handler region
  (after the `end F32 S2 sortOrder reorder handler` marker). It reads canonical folder order from the store
  (`H2O.Studio.store.folders.getAll()`), reads the render mirror (`FOLDER_STATE_DATA_KEY` via the existing
  `readKv`), sets each mirror folder row's `sortOrder`/`sort_order` to the canonical value (PRESERVING order —
  the opposite of the F11 rebuild helper, which strips it), reorders the mirror `folders` array to match
  canonical order, and writes ONLY the render mirror via the existing `writeKv`.
- The F32 applied path (inside the handler region) now, ONLY after (1) validation passed, (2) the canonical
  `sort_order` write succeeded, and (3) the post-apply ordering hash equals `requestedOrderingHash`, calls that
  projection and sets `mirrorReprojection: "applied-sortorder-preserving-s2b"` on the applied receipt (plus a
  `mirrorReprojectionResult` status). The receipt builder's default remains `mirrorReprojection: 'deferred-to-s2b'`
  for the dry-run / conflict / rejected paths.

The projection does NOT reuse the F11 render-mirror rebuild helper (which strips `sortOrder`/`sort_order`). It
never leads canonical state (reads canonical, writes only the mirror), is idempotent (no write when the mirror
already preserves the canonical order), and is bounded (a single mirror write; no new/removed rows; no
binding/`items`/tombstone/chat/delete mutation; no transport/WebDAV/CAS; no `productSyncReady` flip). When no
render mirror is present it is a safe no-op (it preserves order on an existing mirror; it does not materialize
one).

## Behavioral Proof (node:sqlite; real handler; seeded render mirror)

The S2b implementation validator loads the REAL `folder-sync.tauri.js` handler + the REAL consumed-operation
ledger over a disposable `node:sqlite` canonical `folders` table, seeds an in-memory render mirror
(`FOLDER_STATE_DATA_KEY`) with folder rows carrying name/color + a stale `sortOrder` and binding `items`, and
exercises the real `apply(...)`:

- **Dry-run**: an accepted dry-run reorder returns `status:"dry-run"`, writes 0 canonical rows, and leaves the
  seeded render mirror BYTE-FOR-BYTE UNCHANGED (no mirror write in dry-run).
- **Gated apply**: reorders canonical `fa,fb,fc -> fc,fb,fa`, returns `status:"applied"`,
  `canonicalWriteCount:3`, `idempotencyPersisted:true`, `mirrorReprojection:"applied-sortorder-preserving-s2b"`,
  `mirrorReprojectionResult:"projected"`. The render mirror rows now carry the canonical `sortOrder` (`fc:0`,
  `fb:1`, `fa:2`) — `sortOrder` PRESERVED (present, not stripped) — the mirror `folders` array is reordered to
  `fc,fb,fa`, each row's name/color is preserved, and the binding `items` map is preserved unchanged. No new or
  removed folder rows (bounded).
- **Idempotency**: a second accepted apply of the SAME current order (fresh idempotencyKey) returns
  `mirrorReprojectionResult:"no-op-mirror-already-preserves-sortorder"` and leaves the render mirror
  BYTE-FOR-BYTE UNCHANGED (idempotent; no extra mirror write over converged state).
- **Safety**: no binding/tombstone/chat/delete mutation; canonical folder row count and tombstone set
  unchanged; the consumed-operation ledger holds the applied record; F11 unchanged; `productSyncReady` false.

## Boundaries (reaffirmed)

- The F11 rebuild helper (`folders.tauri.js`) STILL strips `sortOrder`/`sort_order` (`delete next.sortOrder;` /
  `delete next.sort_order;`); S2b uses a NEW projection and does not reuse it.
- S5 / F11 allowed-set flip remains BLOCKED (`field-mismatch:sortOrder` and `binding-mismatch` stay in the F11
  `blockedClasses`).
- `productSyncReady` remains `false`; public/premium blocked; no `fullBundle.v3`; binding receipt schema
  remains unminted.
- Chat Saving WebDAV/cloud/archive CAS remains blocked; no transport/WebDAV/CAS write in the projection.
- Desktop remains canonical; the mirror never leads canonical; hard delete blocked; folder delete preserves
  chats.
- Only `folder-sync.tauri.js` changed in product source (plus the F32b behavioral validator, extended to prove
  the applied marker + no-op-on-absent, and this slice's evidence + validator).

## Verdict

S2B IMPLEMENTATION PASSED (behavioral). The sortOrder-preserving render-mirror projection runs strictly after
canonical write success + post-apply hash verification, preserves `sortOrder`, reorders the mirror to canonical
order, is idempotent and bounded, performs no binding/tombstone/chat/delete mutation and no WebDAV/cloud/archive
CAS, and does not reuse the F11 rebuild helper. Dry-run writes no mirror. The applied receipt carries
`applied-sortorder-preserving-s2b`. No F11 allowed-set change, no `productSyncReady` flip, no S5, no CAS.

## Recommended Next Slice

Full S2 is NOT yet declared closed: a LIVE Desktop S2b confirmation (read-only readback that the render mirror
reflects the S4/applied order with `sortOrder` preserved after a gated apply) is the recommended next step, as a
separately-approved slice — NOT S5/F11, NOT `productSyncReady`, NOT WebDAV/cloud/archive CAS. Keep
`field-mismatch:sortOrder` gated, `binding-mismatch` blocked, `productSyncReady` false, and Chat Saving CAS
blocked until the live S2b confirmation lands and S2 closure is separately approved.
