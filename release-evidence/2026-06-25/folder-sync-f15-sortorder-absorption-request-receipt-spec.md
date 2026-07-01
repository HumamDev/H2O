# Folder Sync — Phase F15: sortOrder Absorption / Request-Receipt Loop Specification (design-only)

Date: 2026-07-01

## Status

DESIGN / SPECIFICATION ONLY. No runtime behavior was implemented. No sortOrder request loop was
implemented. No sortOrder rebuild was implemented. No sortOrder writes were added. No mirror write, no
SQLite write, no tombstone write, no binding repair. `productSyncReady` was NOT flipped. No
`fullBundle.v3` was minted. No WebDAV/cloud/archive CAS was implemented. No Chat Saving / archive package
code was touched. No product source was modified. This slice specifies the safe native-reorder →
Desktop-apply → receipt absorption loop that MUST exist and be proven BEFORE `field-mismatch:sortOrder`
could ever be added to the allowed mirror rebuild set. The schema names below are PROPOSED for a future
implementation slice and are NOT minted in source by F15.

Naming note: this folder-sync F15 is separate from the pre-existing `validate-f15-cutover.mjs` in another
sync lane; all F15 artifacts use the `folder-sync-f15-*` prefix to avoid collision.

## Context

- F14 sortOrder ownership decision committed: `58781a0` (Desktop SQLite canonical for `sortOrder`;
  `FOLDER_STATE_DATA_KEY` a derived render projection; Chrome/native/mobile non-canonical proposers;
  native reorder reconciles back into SQLite via a reviewed request → Desktop-apply → receipt loop;
  `field-mismatch:sortOrder` may join the allowed rebuild set only after that loop is designed,
  implemented, and proven; `binding-mismatch` stays blocked for a separate reviewed binding-repair loop).
- F13 sustained parity / idempotence proof committed: `37ad6c7`.
- F12B render-only mirror rebuild apply proof committed: `e2b4281`.
- `productSyncReady` remains false; public/premium sync blocked; real remote WebDAV deferred; Chat Saving
  WebDAV/cloud/archive CAS blocked.

## Precedent (real source — pattern to follow, not modified by F15)

The absorption loop reuses the EXISTING request/receipt pattern already in
`src-surfaces-base/studio/sync/folder-sync.tauri.js` — it does not invent a new transport:

- `FOLDER_DELETE_REQUEST_SCHEMA = 'h2o.studio.folder-delete-request.v1'`
- `FOLDER_RESTORE_REQUEST_SCHEMA = 'h2o.studio.folder-restore-request.v1'`
- `CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'`
- `LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1'`
- `LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1'`

These already carry `requestId` / `reviewId` / `receiptId` envelopes and a Desktop-applies-then-receipts
shape. F15 proposes a sortOrder reorder request/receipt pair in the SAME family (proposed, not minted):

- proposed request schema: `h2o.studio.folder-sortorder-reorder-request.v1`
- proposed receipt schema: `h2o.studio.folder-sortorder-reorder-receipt.v1`

## Cross-Surface Requirement (carried, not implemented in F15)

The absorption loop must preserve future parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app: Desktop SQLite stays canonical, the mirror stays a derived
per-surface render projection, diagnostics/identity stay hash-only / redacted (per-peer / per-device),
and no surface other than Desktop mutates canonical folder order. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical future
participants (proposers only).

## 1. Native / Chrome / Mobile Folder Reorder Proposal Model

A non-canonical surface (Chrome / native extension / mobile) that reorders folders locally does NOT write
canonical order. It emits a PROPOSAL: a `folder-sortorder-reorder-request.v1` describing the desired
order, keyed to the basis order it observed. The proposal is advisory until Desktop absorbs it. Local
render may optimistically reflect the proposed order, but canonical truth is only what Desktop writes to
SQLite `sort_order`. A proposal is never authoritative and never promotes the proposer to canonical.

## 2. Desktop-Canonical Absorption Path

1. a non-canonical surface emits a reorder REQUEST (`folder-sortorder-reorder-request.v1`).
2. Desktop VALIDATES the request (schema, basis hash vs current canonical, folder existence, tombstone
   state, catalog visibility, idempotency).
3. Desktop APPLIES the accepted order to canonical SQLite `sort_order` (Desktop-only write, via the
   existing folder store path; ordering stays SQLite-canonical).
4. Desktop emits a RECEIPT (`folder-sortorder-reorder-receipt.v1`) with status + resulting ordering hash.
5. the render mirror (`FOLDER_STATE_DATA_KEY`) is PROJECTED FROM SQLite after the canonical write
   (write-through projection; mirror never leads).
6. Chrome / native / mobile IMPORT the read-only projection (and the receipt) — they consume, they do not
   write canonical order.

Only step 3 writes canonical state, and only on Desktop. Steps 1/6 are non-canonical.

## 3. Reorder Request Envelope Fields (`folder-sortorder-reorder-request.v1`)

- `schema`: `h2o.studio.folder-sortorder-reorder-request.v1`.
- `requestId`: unique request id (also serves as `reviewId`, per existing pattern).
- `sourcePeerId` / `deviceId`: hash-only per-peer / per-device identity of the proposing surface.
- `surfaceKind`: `chrome-extension` | `native-extension` | `mobile` (non-canonical proposer kind).
- `orderPayload`: the proposed folder order — a list of `{ folderId, position }` (folder ids only; no
  names/titles/content).
- `basisOrderingHash`: hash of the ordering the proposer observed as its basis (for stale detection).
- `requestedOrderingHash`: hash of the proposed resulting ordering.
- `createdAt`: ISO timestamp.
- `idempotencyKey`: stable key so a duplicate/retried request is absorbed at-most-once.
- redaction requirements: folder ids may be hashed/tokenized; NO raw folder names, chat titles/content,
  account/user data, or raw device identifiers. Diagnostics are hash-only / redacted.

## 4. Reorder Receipt Fields (`folder-sortorder-reorder-receipt.v1`)

- `schema`: `h2o.studio.folder-sortorder-reorder-receipt.v1`.
- `requestId`: the request this receipt answers.
- `status`: `applied` | `skipped` | `rejected`.
- `reason`: applied/skipped/rejected reason code (e.g. `stale-basis`, `duplicate`, `missing-folder`,
  `tombstoned-folder`, `unknown-folder`, `folder-not-in-catalog`, `superseded-concurrent`).
- `resultingOrderingHash`: hash of the canonical ordering AFTER Desktop apply (or unchanged hash on
  skip/reject).
- `canonicalAuthority`: `desktop-sqlite` (canonical authority marker — the receipt asserts Desktop is the
  authority).
- `noDestructiveMutation`: `true` (marker: absorption performed no delete/purge/tombstone/binding/chat
  mutation).
- `appliedAt`: ISO timestamp.

## 5. Conflict Behavior

- stale basis: `basisOrderingHash` ≠ current canonical hash → `rejected: stale-basis` (proposer must
  re-fetch canonical order and re-propose; never blind-overwrite).
- duplicate request: same `idempotencyKey`/`requestId` already absorbed → `skipped: duplicate`
  (at-most-once; no re-apply).
- missing folder: a payload folder id no longer exists canonically → `rejected: missing-folder`.
- tombstoned folder: a payload folder is soft-deleted/tombstoned → `rejected: tombstoned-folder` (do not
  resurrect via reorder).
- unknown folder id: a payload folder id is not recognized → `rejected: unknown-folder`.
- reorder containing folders not visible in catalog: payload includes folders outside the visible catalog
  → `rejected: folder-not-in-catalog` (do not leak/act on hidden rows).
- multi-device concurrent reorder: two devices propose against the same basis → first valid apply wins;
  the later one fails stale-basis (`superseded-concurrent`) and must re-propose against the new canonical
  basis (last-writer-wins is mediated through Desktop, not the proposers).

## 6. Safety Invariants

- no hard delete.
- no folder delete / purge.
- no chat delete.
- no binding repair (bindings are untouched by sortOrder absorption).
- no Chrome / mobile canonical mutation (proposers never write canonical order).
- Desktop remains canonical (only Desktop writes SQLite `sort_order`).
- WebDAV / cloud / relay transport remains TRANSPORT ONLY and disabled-by-default / dev-only — it may
  only move request/receipt/projection payloads; it never becomes an authority and is not enabled here.

## 7. When `field-mismatch:sortOrder` May Join the Allowed Mirror Rebuild Set

`field-mismatch:sortOrder` may be added to the allowed render-only rebuild set ONLY after ALL hold:
this F15 loop is implemented and proven; a pending native reorder is always absorbed into SQLite BEFORE
any mirror re-projection (so a not-yet-absorbed reorder is never clobbered); and the §8 validators + §9
live proof pass. When gated in, the allowed action is render-only re-projection of canonical SQLite order
into the mirror — and ONLY for the "stale mirror drift" / "true canonical mismatch" cases from F14, never
while a native reorder is pending absorption. Until then it stays blocked (the committed F11 helper keeps
`field-mismatch:sortOrder` in `blockedClasses`).

## 8. Validators Needed Before Implementation

- a request-envelope validator: schema/fields/idempotency/redaction well-formedness; rejects raw
  names/titles/content/device ids.
- a receipt-envelope validator: schema/status/reason/authority markers; `noDestructiveMutation:true`.
- an absorption-apply unit validator: an accepted request updates ONLY canonical SQLite `sort_order`,
  then the mirror is re-projected; no binding/tombstone/chat/delete mutation; Desktop-only write.
- a conflict-matrix validator: each §5 case yields the specified receipt status/reason; stale/duplicate
  never double-apply; concurrent reorders resolve last-writer-wins-via-Desktop.
- a no-canonical-promotion guard: proposers never write canonical order; only Desktop writes SQLite.
- a redaction guard: request/receipt/projection diagnostics stay hash-only / redacted.

## 9. Live Proof Requirements Before productSyncReady Review

- a live Desktop absorption proof (dev-gated): emit a reorder request, Desktop applies to SQLite,
  receipt `applied`, mirror re-projected, re-run the F5/F6 read-only drift probe → `field-mismatch:sortOrder`
  clears, `writeCallCount:0` on the probe, canonical write limited to `sort_order`, no folder order lost.
- a stale/duplicate/concurrent live proof: rejected/skipped receipts with no canonical change.
- sustained parity (re-run) showing the absorbed order stays converged.
- redacted / hash-only output throughout; `productSyncReady` stays false until its own separate flip gate.

## 10. `binding-mismatch` Stays Separate and Blocked

`binding-mismatch` repair remains BLOCKED and out of scope. It is a separate reviewed binding-repair loop
(via the existing `chat-folder-binding-request.v1`), never folded into sortOrder absorption.

## 11–13. Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F15: PASS (design/spec only). The native-reorder proposal model, the Desktop-canonical absorption path,
  the request + receipt envelopes, the conflict matrix, the safety invariants, the gate for adding
  `field-mismatch:sortOrder` to the rebuild set, and the validator + live-proof requirements are
  specified. No implementation; no sortOrder writes; no flip; no source change.
- sortOrder absorption model: non-canonical surfaces PROPOSE; Desktop VALIDATES → APPLIES to SQLite
  `sort_order` → emits RECEIPT → projects the mirror; Chrome/native/mobile import read-only.
- request/receipt model: `folder-sortorder-reorder-request.v1` (proposed) → Desktop apply →
  `folder-sortorder-reorder-receipt.v1` (proposed), reusing the existing request/receipt family.
- `field-mismatch:sortOrder` in the allowed rebuild set: NOT NOW; conditionally later only after this
  loop is implemented + proven and the §8/§9 gates pass.
- `binding-mismatch`: REMAINS BLOCKED, separate.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F16

F16 = a DESIGN-ONLY sortOrder absorption request/receipt ENVELOPE + CONFLICT-MATRIX validator harness
(no runtime, no writes): a fixture-backed meta-validator that exercises the §3/§4 envelopes and the §5
conflict matrix against synthetic requests/receipts (well-formedness, idempotency, redaction, each
conflict reason), proving the contract BEFORE any runtime implementation — keeping `binding-mismatch`
blocked, `productSyncReady` false, and Chat Saving CAS blocked. F16 writes nothing and flips nothing.
