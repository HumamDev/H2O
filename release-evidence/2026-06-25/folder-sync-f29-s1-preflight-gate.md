# Folder Sync — Phase F29: S1 Pre-Flight Gate (sortOrder schema mint) — design-only

Date: 2026-07-01

## Status

DESIGN / PRE-FLIGHT GATE ONLY. Nothing was minted. No schema was added to product source. No runtime
behavior was implemented. No F11 allowed/blocked set was changed. No `productSyncReady` flip happened. No
product SQLite write, no product mirror write, no tombstone write, no bind/unbind/move in product runtime,
no folder delete/purge, no chat content touched. No `fullBundle.v3` was minted. No WebDAV/cloud/archive
CAS. No Chat Saving / archive package code was touched. No product source was modified. This slice is the
ENTRY GATE for the FIRST implementation step of the F28 plan (S1 = sortOrder schema mint + source
validator): it specifies the EXACT schema shapes S1 would mint, the source-validator assertions that must
accompany that mint, the retained validator set, and S1's entry/exit criteria + rollback — WITHOUT
minting anything.

Naming note: all F29 artifacts use the `folder-sync-f29-*` prefix to avoid collision with any other lane.
The schema names below appear as SPECIFICATION TEXT in this evidence doc only; they are NOT added to
product source by F29.

## Context

- F28 combined implementation sequencing plan committed: `64dd692` (S1 = sortOrder schema mint + source
  validator, the first gated step). F27 lane status readiness ledger v2: `8af5bea`.
- Proposed sortOrder schemas design-only, NOT minted: `h2o.studio.folder-sortorder-reorder-request.v1`,
  `h2o.studio.folder-sortorder-reorder-receipt.v1`. Proposed binding receipt schema
  `h2o.studio.chat-folder-binding-receipt.v1` also NOT minted. Real binding request schema present:
  `h2o.studio.chat-folder-binding-request.v1`.
- F11 still blocks `field-mismatch:sortOrder` + `binding-mismatch`. `productSyncReady` false;
  public/premium blocked; real remote WebDAV deferred; `fullBundle.v3` not minted; Chat Saving
  WebDAV/cloud/archive CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F29)

The schema shapes must preserve future parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface
render projection, hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Exact sortOrder Request Schema Shape (S1 would mint; NOT added to source in F29)

Proposed constant: `FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1'`.

Fields:
- `schema`: `h2o.studio.folder-sortorder-reorder-request.v1`.
- `requestId`: unique request id (also serves as `reviewId`, per the existing request/receipt family).
- `sourcePeerId` / `deviceId`: hash-only per-peer / per-device identity of the proposing surface.
- `surfaceKind`: `chrome-extension` | `native-extension` | `mobile`.
- `orderPayload`: list of `{ folderId, position }` (folder ids tokenized/hashed only).
- `basisOrderingHash`: hash of the ordering the proposer observed as its basis (stale detection).
- `requestedOrderingHash`: hash of the proposed resulting ordering.
- `createdAt`: ISO timestamp.
- `idempotencyKey`: stable key so a duplicate/retried request is absorbed at-most-once.
- redaction: folder ids tokenized/hashed; NO raw folder names/titles/content, account/user data, or raw
  device identifiers; diagnostics hash-only / redacted.

## 2. Exact sortOrder Receipt Schema Shape (S1 would mint; NOT added to source in F29)

Proposed constant: `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1'`.

Fields:
- `schema`: `h2o.studio.folder-sortorder-reorder-receipt.v1`.
- `requestId`: the request this receipt answers.
- `status`: `applied` | `skipped` | `rejected`.
- `reason`: applied/skipped/rejected reason code.
- `resultingOrderingHash`: hash of the canonical ordering AFTER apply (or unchanged on skip/reject).
- `canonicalAuthority`: `desktop-sqlite`.
- `noDestructiveMutation`: `true`.
- `noFolderDelete`: `true`.
- `noFolderPurge`: `true`.
- `noChatDelete`: `true`.
- `appliedAt` / `decidedAt`: ISO timestamp.

## 3. S1 Source-Validator Assertions (must accompany the future S1 mint)

- the request schema constant exists in source and is EXACTLY
  `h2o.studio.folder-sortorder-reorder-request.v1`.
- the receipt schema constant exists in source and is EXACTLY
  `h2o.studio.folder-sortorder-reorder-receipt.v1`.
- the schemas are wired into the request/receipt FAMILY ONLY (declared alongside the existing
  `*_REQUEST_SCHEMA` / `*_RECEIPT_SCHEMA` constants) — no apply handler, no request-loop wiring.
- redaction / hash-only guards are present (the schema fields carry tokenized ids, not raw names).
- NO runtime apply handler is added in S1 (no `validate`/`apply`/`receipt` function over `sort_order`).
- NO F11 allowed-set change is made in S1 (`field-mismatch:sortOrder` stays in `blockedClasses`).
- NO `fullBundle.v3` is minted (schema stays `h2o.studio.fullBundle.v2`).
- NO WebDAV / CAS / Chat Saving code is touched.

## 4. Retained Validator / Harness Set (must stay green at S1)

- F16 sortOrder envelope/conflict harness.
- F17 sortOrder accepted apply proof harness.
- F18 sortOrder negative-path apply proof harness.
- F19 sortOrder readiness gate.
- F27 / F28 ledgers.
- the full folder ladder F8–F28.
- Phase 40 metadata closeout.
- productsyncready flip gate.
- archive-cloud-sync-boundary.
- identity-key-e2e-boundary.
- F19 sync hardening.
- F15 cutover.

## 5. S1 Entry Criteria

- F28 committed and passing.
- the proposed sortOrder schemas are ABSENT from source before S1.
- F11 still blocks `field-mismatch:sortOrder`.
- `productSyncReady` false.
- all retained validators green.

## 6. S1 Exit Criteria

- the request + receipt schema constants are minted EXACTLY as specified above.
- an S1 source validator is added and passing.
- NO apply handler added.
- NO F11 allowed/blocked-set change.
- NO runtime writes.
- the retained validators still green.

## 7. Rollback

If S1 fails review: remove ONLY the newly minted sortOrder schema constants and the S1 source validator;
verify the proposed schemas are ABSENT from source again; rerun the retained validators (they must return
to green); preserve ALL evidence/ledger history (F8–F29 docs + validators are not reverted). Because S1
adds only inert schema constants (no handler, no apply path), rollback cannot lose data or change runtime
behavior.

## 8. Current State (asserted in F29)

- nothing is minted yet.
- no schema was added to source.
- no F11 allowed/blocked-set change.
- no `productSyncReady` flip.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED.

## Preserved Postures

- `binding-mismatch` remains BLOCKED. `field-mismatch:sortOrder` remains GATED.
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F29: PASS (design/pre-flight gate only). The exact sortOrder request + receipt schema shapes, the S1
  source-validator assertions, the retained validator set, and S1's entry/exit criteria + rollback are
  specified. Nothing minted; no schema added to source; no F11 set change; no flip; no source change.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F30

F30 = EXECUTE S1 — actually mint the two sortOrder schema constants
(`h2o.studio.folder-sortorder-reorder-request.v1`, `h2o.studio.folder-sortorder-reorder-receipt.v1`) into
`src-surfaces-base/studio/sync/folder-sync.tauri.js` alongside the existing request/receipt family, and
add the S1 source validator — with NO apply handler, NO F11 allowed-set change, NO runtime writes, NO
flip. This is the FIRST PRODUCT-SOURCE SCHEMA MINT in the entire folder-sync lane (all of F8–F29 left
product runtime source untouched), so F30 MUST REQUIRE SEPARATE EXPLICIT APPROVAL before it runs. Keep
`binding-mismatch` blocked, `field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving
CAS blocked.
