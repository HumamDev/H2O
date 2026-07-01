# Folder Sync — Phase F31: S2 Pre-Flight Gate (sortOrder Desktop handler) — design-only

Date: 2026-07-01

## Status

DESIGN / PRE-FLIGHT GATE ONLY. No handler was added. No validate/apply/receipt function over `sort_order`
was added. No request-loop / transport / import / export wiring was added. No F11 allowed/blocked set was
changed. No `productSyncReady` flip. No product SQLite write, no product mirror write, no tombstone write,
no bind/unbind/move, no folder delete/purge, no chat content touched. No `fullBundle.v3`. No
WebDAV/cloud/archive CAS. No Chat Saving / archive package code touched. `folder-sync.tauri.js` was read
for inspection only and NOT modified. This slice is the ENTRY GATE for the SECOND implementation step of
the F28 plan (S2 = sortOrder Desktop validate/apply/receipt handler): it specifies the exact handler
contract S2 would add, the handler-validator assertions, the retained validator set, and S2's entry/exit
criteria + rollback — WITHOUT adding any handler.

Naming note: all F31 artifacts use the `folder-sync-f31-*` prefix to avoid collision with any other lane.

## Context

- F30 S1 executed (sortOrder schema constants minted inert): `01b05cb`. F29 S1 pre-flight gate: `436a59a`.
  F28 sequencing plan (S1–S14): `64dd692`.
- Minted inert constants in `folder-sync.tauri.js`: `FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA =
  'h2o.studio.folder-sortorder-reorder-request.v1'`, `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA =
  'h2o.studio.folder-sortorder-reorder-receipt.v1'` — declared only, each referenced exactly once (inert).
- F11 still blocks `field-mismatch:sortOrder` + `binding-mismatch`. Binding receipt schema
  `h2o.studio.chat-folder-binding-receipt.v1` still NOT minted. `productSyncReady` false; public/premium
  blocked; real remote WebDAV deferred; no `fullBundle.v3`; Chat Saving WebDAV/cloud/archive CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F31)

The S2 handler contract preserves future parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface
render projection, hash-only / redacted payloads. Mobile, remote WebDAV, and Chat Saving CAS are NOT
implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Exact S2 Desktop Handler Contract (S2 would add; NOT added in F31)

A future S2 handler family (Desktop-only, dry-run-by-default, gated) would:

- VALIDATE the request: require `schema === FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA`; validate
  `basisOrderingHash` vs current canonical ordering; validate `requestedOrderingHash`; validate
  `idempotencyKey` (at-most-once); redaction/hash-only well-formedness.
- CLASSIFY the conflict cases (per F16/F18): `stale-basis`, `duplicate`, `missing-folder`,
  `tombstoned-folder`, `unknown-folder`, `folder-not-in-catalog`, `superseded-concurrent` — each producing
  a rejected/skipped receipt with no write.
- APPLY an accepted reorder ONLY to canonical SQLite `sort_order` (Desktop-only write via the existing
  folder store path). No direct mirror-only order repair.
- EMIT a receipt using `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA` with `canonicalAuthority: desktop-sqlite`,
  `noFolderDelete/noFolderPurge/noChatDelete/noDestructiveMutation: true`, and the resulting ordering hash.
- RE-PROJECT the `FOLDER_STATE_DATA_KEY` mirror FROM canonical SQLite AFTER the `sort_order` write
  (write-through projection; mirror never leads).
- DRY-RUN BY DEFAULT: no write unless an explicit gated `apply` is passed; outputs redacted / hash-only.

The handler is Desktop-side; Chrome / native / mobile remain non-canonical proposers that submit requests.

## 2. S2 Handler-Validator Assertions (must accompany the future S2 execution)

- the handler exists ONLY after S2 execution — NOT now.
- request validation is present (schema/basis/requested/idempotency/redaction).
- the apply path writes ONLY canonical `sort_order`.
- the receipt is emitted with `canonicalAuthority: desktop-sqlite`.
- the mirror re-projection happens AFTER the canonical write.
- NO direct mirror-only order repair.
- NO folder delete/purge; NO chat delete; NO tombstone mutation; NO binding mutation.
- NO F11 allowed-set change in S2 (`field-mismatch:sortOrder` stays in `blockedClasses` until S5).
- NO WebDAV / CAS / Chat Saving code touched.
- `productSyncReady` remains false.

## 3. Retained Validator / Harness Set (must stay green at S2)

- F16 sortOrder envelope/conflict harness; F17 sortOrder accepted apply proof harness; F18 sortOrder
  negative-path apply proof harness; F19 sortOrder readiness gate.
- F30 schema mint validator; F29 pre-flight validator.
- the full folder ladder F8–F30.
- Phase 40 metadata closeout.
- productsyncready-flip-gate; archive-cloud-sync-boundary; identity-key-e2e-boundary.
- F19-sync-hardening; F15-cutover.

## 4. S2 Entry Criteria

- F30 committed and passing.
- the sortOrder request/receipt constants are PRESENT and INERT (each referenced exactly once).
- no handler exists yet.
- F11 still blocks `field-mismatch:sortOrder`.
- `productSyncReady` false.
- all retained validators green.

## 5. S2 Exit Criteria (for the future execution phase)

- the Desktop handler is added.
- a handler validator is added and passing.
- accepted requests write ONLY canonical `sort_order`.
- the receipt is emitted.
- the mirror is re-projected AFTER the canonical write.
- NO F11 allowed-set change.
- NO runtime writes outside the scoped handler.
- the retained validators still green.
- `productSyncReady` remains false.

## 6. Rollback (for the future S2 execution)

Remove ONLY the handler + handler validator; keep the F30 inert schema constants (S1 rollback is a
separate, separately-approved action); verify the constants remain inert again (each referenced exactly
once); rerun the retained validators (return to green); preserve ALL evidence/ledger history (F8–F31 docs
+ validators are not reverted).

## 7. Current State (asserted in F31)

- no sortOrder handler exists yet.
- the sortOrder constants remain INERT.
- each sortOrder constant name appears EXACTLY ONCE in source.
- each sortOrder schema string appears EXACTLY ONCE in source.
- F11 still blocks `field-mismatch:sortOrder`.
- F11 still blocks `binding-mismatch`.
- the binding receipt schema remains UNMINTED.
- `productSyncReady` false.
- Chat Saving WebDAV/cloud/archive CAS BLOCKED.

## Preserved Postures

- `binding-mismatch` remains BLOCKED. `field-mismatch:sortOrder` remains GATED (still in the F11
  `blockedClasses`; S2 does NOT add it to the allowed set — that is S5).
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F31: PASS (design/pre-flight gate only). The S2 Desktop handler contract, the handler-validator
  assertions, the retained validator set, and S2's entry/exit criteria + rollback are specified. No
  handler added; no wiring; no F11 set change; no flip; no product-source change.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F32

F32 = EXECUTE S2 — add the real sortOrder Desktop validate/apply/receipt handler to product source
(consuming `FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA`, applying accepted reorders to canonical `sort_order`,
emitting `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA`, re-projecting the mirror), dry-run-by-default and
gated, plus the handler validator — with NO F11 allowed-set change (that is S5), NO binding changes, NO
runtime writes outside the scoped handler, NO flip. This is a REAL PRODUCT-SOURCE HANDLER ADDITION (larger
than the S1 inert-constant mint), so F32 MUST REQUIRE SEPARATE EXPLICIT APPROVAL before it runs. Keep
`binding-mismatch` blocked, `field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving CAS
blocked.
