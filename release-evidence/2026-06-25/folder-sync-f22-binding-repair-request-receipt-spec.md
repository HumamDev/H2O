# Folder Sync — Phase F22: Binding Repair Request/Receipt Loop Specification (design-only)

Date: 2026-07-01

## Status

DESIGN / SPECIFICATION ONLY. No runtime behavior was changed. No binding repair was implemented. No chat
was bound, unbound, or moved. No product SQLite write, no mirror write, no tombstone write, no folder
delete/purge, no chat content touched. `productSyncReady` was NOT flipped. No `fullBundle.v3` was minted.
No WebDAV/cloud/archive CAS. No Chat Saving / archive package code was touched. No product source was
modified. This slice specifies the safe binding repair request → Desktop-apply → receipt loop (the
binding analog of the F15 sortOrder absorption spec) that MUST exist and be proven BEFORE
`binding-mismatch` could ever be repaired. The proposed receipt schema below is design-only and is NOT
minted in source by F22; the request schema already exists in source and is reused, not modified.

## Context

- F21 binding-mismatch repair readiness audit committed: `35e11ae` (Desktop SQLite `folder_bindings`
  canonical; `FOLDER_STATE_DATA_KEY.items` derived projection; Chrome/native/mobile non-canonical
  proposers; sanctioned channel = `h2o.studio.chat-folder-binding-request.v1` family; direct mirror-only
  repair blocked; Chrome/native/mobile canonical mutation blocked).
- F20 readiness ledger committed: `aa4958e`.
- `binding-mismatch` remains blocked; `field-mismatch:sortOrder` remains gated; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; `fullBundle.v3` not minted; Chat
  Saving WebDAV/cloud/archive CAS blocked.

## Precedent (real source — reused, not modified by F22)

- request schema ALREADY in source: `CHAT_FOLDER_BINDING_REQUEST_SCHEMA =
  'h2o.studio.chat-folder-binding-request.v1'` (intent `chat-folder-binding-request`), with derived
  transport/apply variants `...request.v1.transport-ingest.v1` and `...request.v1.desktop-auto-apply.v1`.
- proposed receipt schema (DESIGN-ONLY, NOT minted by F22): `h2o.studio.chat-folder-binding-receipt.v1`.
- canonical binding store: SQLite `folder_bindings` (`chat_id` PRIMARY KEY → one-folder-per-chat);
  `bindChat` = `INSERT OR REPLACE`, `unbindChat` = `DELETE`.

## Cross-Surface Requirement (carried, not implemented in F22)

The loop must preserve parity across Desktop Studio, Chrome / native extension Studio across MULTIPLE
DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface render
projection, hash-only / redacted identity + diagnostics (per-peer / per-device). Mobile, remote WebDAV,
and Chat Saving CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical
proposers.

## 1. Binding Repair Request/Receipt Loop

1. a non-canonical proposer emits a `h2o.studio.chat-folder-binding-request.v1` request.
2. Desktop VALIDATES the request (schema, chat/folder existence, tombstone state, one-folder-per-chat,
   basis hash vs canonical, idempotency, redaction).
3. Desktop APPLIES only the approved binding change to canonical SQLite `folder_bindings` (bind / unbind
   / move via the existing store path; Desktop-only write).
4. Desktop emits a RECEIPT (`h2o.studio.chat-folder-binding-receipt.v1`, design-only) with status +
   resulting binding hash.
5. Desktop RE-PROJECTS `FOLDER_STATE_DATA_KEY.items` from canonical `folder_bindings` (write-through;
   mirror never leads).
6. Chrome / native / mobile IMPORT the read-only projection + receipt (consume, never write canonical).

Only step 3 writes canonical state, and only on Desktop.

## 2. Allowed Binding Intents

- `bind` — bind a chat to a folder.
- `unbind` — unbind a chat from a folder.
- `move` — move a chat from one folder to another (unbind+bind honoring one-folder-per-chat).
- NO chat delete. NO folder delete / purge. (These are never valid binding-repair intents.)

## 3. Request Envelope Fields (`h2o.studio.chat-folder-binding-request.v1`)

- `schema`: `h2o.studio.chat-folder-binding-request.v1`.
- `requestId` (also `reviewId` per existing pattern).
- `sourcePeerId` / `deviceId`: hash-only per-peer / per-device identity.
- `surfaceKind`: `chrome-extension` | `native-extension` | `mobile`.
- `intent`: `bind` | `unbind` | `move`.
- `chatId`: hashed / redacted chat reference (no raw chat id/title/content).
- `targetFolderId`: hashed / redacted target folder reference.
- `previousFolderId`: hashed / redacted prior folder reference (where relevant, e.g. `move`/`unbind`).
- `basisBindingHash`: hash of the binding state the proposer observed as its basis (stale detection).
- `requestedBindingHash`: hash of the requested resulting binding state.
- `createdAt`: ISO timestamp.
- `idempotencyKey`: stable key so a duplicate/retried request is absorbed at-most-once.
- redaction requirements: chat/folder ids hashed/tokenized; NO raw chat titles/content, folder names,
  account/user data, or raw device identifiers. Diagnostics hash-only / redacted.

## 4. Receipt Envelope Fields (`h2o.studio.chat-folder-binding-receipt.v1`, design-only)

- `schema`: `h2o.studio.chat-folder-binding-receipt.v1`.
- `requestId`: the request this receipt answers.
- `status`: `applied` | `skipped` | `rejected`.
- `reason`: applied/skipped/rejected reason code.
- `resultingBindingHash`: hash of the canonical binding state AFTER Desktop apply (or unchanged on
  skip/reject).
- `canonicalAuthority`: `desktop-sqlite`.
- `noChatDelete`: `true`.
- `noFolderDelete`: `true`.
- `noFolderPurge`: `true`.
- `noTombstoneMutation`: `true` unless a separately scoped phase authorizes tombstone changes.
- `appliedAt` / `decidedAt`: ISO timestamp.

## 5. Conflict / Mismatch Matrix Behavior

- missing-mirror-item: canonical binding absent from `mirror.items` → re-project mirror (render-only); no
  canonical change.
- extra-mirror-item: `mirror.items` entry with no canonical binding → drop on re-projection; never delete
  canonical.
- orphan-folder-binding: binding → folder not in catalog → `rejected: orphan-folder-binding`.
- orphan-chat-binding: binding → no live chat → `rejected: orphan-chat-binding`; never delete chat.
- tombstoned-folder-binding: binding → tombstoned folder → `rejected: tombstoned-folder-binding`; no
  resurrect.
- duplicate-binding: >1 canonical binding for a chat → Desktop apply resolves via `PRIMARY KEY (chat_id)`;
  surfaced for review.
- stale-basis: `basisBindingHash` ≠ current canonical → `rejected: stale-basis`; re-propose.
- duplicate-request: same `idempotencyKey` already absorbed → `skipped: duplicate`.
- privacy-redaction-violation: raw identifiers present → `rejected: privacy-redaction-violation`.
- multi-device-concurrent-move: two devices move the same chat against the same basis → first valid apply
  wins; the later is `rejected: superseded-concurrent` and must re-propose against the new canonical
  basis (last-writer-wins mediated through Desktop, never between proposers).

## 6. Safety Invariants

- Desktop SQLite `folder_bindings` remains CANONICAL; the mirror is a projection only.
- NO direct mirror-only repair (writing `FOLDER_STATE_DATA_KEY.items` without a canonical apply is
  forbidden).
- NO Chrome / native / mobile canonical mutation (proposers never write `folder_bindings`).
- NO chat delete; NO folder delete / purge; NO tombstone mutation unless a separately scoped phase
  authorizes it.
- one-folder-per-chat invariant PRESERVED (`folder_bindings.PRIMARY KEY (chat_id)`).
- transport remains transport-only, disabled-by-default / dev-only; it never becomes an authority.

## 7. Validators Needed Before Implementation

- a request-envelope validator (schema/fields/intent/idempotency/redaction well-formedness).
- a receipt-envelope validator (schema/status/reason/authority + no-delete markers).
- a conflict-matrix harness (each §5 case yields the specified receipt).
- an accepted-apply harness against a temp `node:sqlite` (bind/unbind/move updates ONLY canonical
  `folder_bindings`, then the mirror is re-projected; one-folder-per-chat preserved; no chat/folder
  delete).
- a rejected/skipped write-nothing harness (every non-applied case: zero canonical + zero mirror writes).
- a live Desktop dry-run proof (no write).
- a live Desktop controlled apply proof (single gated apply).
- a post-apply read-only F5/F6 drift probe proving `binding-mismatch` reconverges, `writeCallCount:0`.

## 8–13. Preserved Postures

- `binding-mismatch` remains BLOCKED after F22 (spec only; no repair).
- `field-mismatch:sortOrder` remains GATED (committed F11 helper still blocks it).
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F22: PASS (design/spec only). The binding repair request/receipt loop, the allowed intents, the request
  + receipt envelopes, the conflict/mismatch matrix, the safety invariants (incl. one-folder-per-chat),
  and the validator + live-proof requirements are specified. No implementation; no binding write; no
  flip; no source change.
- binding repair loop: proposers PROPOSE via `chat-folder-binding-request.v1`; Desktop VALIDATES →
  APPLIES to canonical `folder_bindings` → emits `chat-folder-binding-receipt.v1` (design-only) →
  re-projects `FOLDER_STATE_DATA_KEY.items`; Chrome/native/mobile import read-only.
- `binding-mismatch`: REMAINS BLOCKED. `field-mismatch:sortOrder`: REMAINS GATED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F23

F23 = a DESIGN-ONLY / fixture-backed binding repair ENVELOPE + CONFLICT-MATRIX validator harness (the
binding analog of the F16 sortOrder harness; no runtime, no writes): a fixture-backed meta-validator that
exercises the §3/§4 envelopes and the §5 conflict matrix against synthetic requests/receipts
(well-formedness, intents, idempotency, redaction, each conflict reason, one-folder-per-chat), proving the
binding contract BEFORE any runtime implementation — keeping `binding-mismatch` blocked,
`field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving CAS blocked. F23 modifies no
product source and performs no write.
