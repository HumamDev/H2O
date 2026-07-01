# Folder Sync — Phase F23: Binding Repair Envelope + Conflict-Matrix Validator Harness (design-only)

Date: 2026-07-01

## Status

DESIGN / VALIDATOR HARNESS ONLY — SYNTHETIC FIXTURES. No runtime behavior was changed. No binding repair
was implemented. No chat was bound, unbound, or moved in product runtime. No product SQLite write, no
mirror write, no tombstone write, no folder delete/purge, no chat content touched. `productSyncReady` was
NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat Saving / archive package
code was touched. No product source was modified. This slice adds a fixture-backed meta-validator that
exercises the F22 binding repair request/receipt contract and conflict matrix against SYNTHETIC data
only, proving the contract BEFORE any runtime implementation. The proposed receipt schema remains
design-only and is NOT minted in runtime source.

## Context

- F22 binding-repair request/receipt spec committed: `5c3dd88`.
- F21 binding-mismatch repair readiness audit committed: `35e11ae`.
- F16 sortOrder envelope/conflict harness precedent committed: `0a80b99`.
- request schema ALREADY in source (reused): `h2o.studio.chat-folder-binding-request.v1`.
- proposed receipt schema (DESIGN-ONLY, NOT minted): `h2o.studio.chat-folder-binding-receipt.v1`.
- `binding-mismatch` remains blocked; `field-mismatch:sortOrder` remains gated; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F23)

The harness validates a contract that must preserve future parity across Desktop Studio, Chrome / native
extension Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a
derived per-surface render projection, hash-only / redacted identity + diagnostics. Mobile, remote
WebDAV, and Chat Saving CAS are NOT implemented here. Chrome / native extension and mobile remain
non-canonical proposers.

## 1. Harness Model (fixture-backed, synthetic only)

The harness is embedded directly in the F23 validator (no separate fixture file needed). It defines a
pure, synthetic canonical binding snapshot (tokenized chat/folder ids only — no raw names/titles/content),
a pure request-envelope checker, a pure receipt-envelope checker, and a pure
`decideBindingRepair(request, canonical, ctx)` oracle modeling Desktop's validation. It exercises the F22
§3/§4 envelopes and the §5 conflict matrix and asserts each fixture yields the specified receipt. No
runtime module is loaded; no write occurs; the decision function is a specification oracle, not product
code.

## 2. Request Envelope Checks (`h2o.studio.chat-folder-binding-request.v1`)

Required and validated: `schema` (must equal the request schema), `requestId`, `sourcePeerId` or
`deviceId` (hash-only), `surfaceKind` (`chrome-extension` | `native-extension` | `mobile`), `intent`
(`bind` | `unbind` | `move`), `chatId` (hashed), `targetFolderId` (hashed), `previousFolderId` (hashed;
required for `move`, optional for `unbind`), `basisBindingHash`, `requestedBindingHash`, `createdAt`,
`idempotencyKey`. Redaction: chat/folder ids are `sha256:`-prefixed tokens; NO raw `name` / `title` /
`content` keys may appear.

## 3. Receipt Envelope Checks (`h2o.studio.chat-folder-binding-receipt.v1`, design-only)

Required and validated: `schema` (must equal the proposed receipt schema), `requestId`, `status`
(`applied` | `skipped` | `rejected`), `reason`, `resultingBindingHash`, `canonicalAuthority` (must equal
`desktop-sqlite`), `noChatDelete` (`true`), `noFolderDelete` (`true`), `noFolderPurge` (`true`),
`noTombstoneMutation` (`true`), `appliedAt` or `decidedAt`. No raw name/title/content keys may appear.

## 4. Conflict / Mismatch Matrix Fixtures (synthetic)

| Fixture | Expected status | Expected reason |
| --- | --- | --- |
| accepted bind | applied | applied |
| accepted move | applied | applied |
| missing-mirror-item | applied | reproject-mirror |
| extra-mirror-item | applied | reproject-mirror-drop-extra |
| orphan-folder-binding | rejected | orphan-folder-binding |
| orphan-chat-binding | rejected | orphan-chat-binding |
| tombstoned-folder-binding | rejected | tombstoned-folder-binding |
| duplicate-binding | applied | duplicate-binding-resolved-primary-key |
| stale-basis | rejected | stale-basis |
| duplicate-request | skipped | duplicate |
| privacy-redaction-violation | rejected | privacy-redaction-violation |
| multi-device-concurrent-move | rejected | superseded-concurrent |

`missing-mirror-item` and `extra-mirror-item` resolve by mirror RE-PROJECTION (render-only; no canonical
change and no canonical delete). `duplicate-binding` is resolved by the canonical `folder_bindings
PRIMARY KEY (chat_id)` on apply. The multi-device case applies move A (advancing the canonical binding
hash + recording its idempotency key), then decides move B against the updated snapshot with
`priorAppliedInBatch:true`, yielding `superseded-concurrent`. Last-writer-wins is mediated through
Desktop.

## 5. One-Folder-Per-Chat Proof

An accepted `bind` and an accepted `move` are proven to leave the chat bound to EXACTLY ONE folder in the
synthetic canonical model (the `bind`/`move` replaces any prior binding for that chat, mirroring
`folder_bindings.PRIMARY KEY (chat_id)` / `INSERT OR REPLACE`). The harness asserts the post-apply
canonical binding count for the chat is exactly 1.

## 6. Negative Controls

- a request carrying a raw `title` (or `name`/`content`) key is REJECTED by the redaction guard.
- a receipt with `canonicalAuthority` other than `desktop-sqlite` is REJECTED by the receipt checker.
- a forbidden intent (`chat-delete` / `folder-delete` / `folder-purge`) is REJECTED before apply
  (`rejected: forbidden-intent`); only `bind` / `unbind` / `move` are accepted.

## 7. Real-Source Assertions

- `h2o.studio.chat-folder-binding-request.v1` request schema is PRESENT in
  `src-surfaces-base/studio/sync/folder-sync.tauri.js` (reused, not modified).
- the proposed receipt schema `h2o.studio.chat-folder-binding-receipt.v1` is NOT minted in source.
- the canonical `folder_bindings` substrate + `bindChat` (`INSERT OR REPLACE`) / `unbindChat` (`DELETE`)
  paths remain intact.
- the committed F11 helper STILL blocks `field-mismatch:sortOrder` + `binding-mismatch`.
- the sortOrder proposed schemas remain NOT minted; `fullBundle` stays `h2o.studio.fullBundle.v2`
  (no `fullBundle.v3`); WebDAV stays deferred.

## 8. Preserved Postures

- `binding-mismatch` remains BLOCKED after F23 (harness only; no repair).
- `field-mismatch:sortOrder` remains GATED.
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F23: PASS (validator harness only, synthetic fixtures). The request + receipt envelope checks, the
  twelve-fixture conflict/mismatch matrix (covering all ten F22 §5 classes plus accepted bind/move), the
  one-folder-per-chat proof, the redaction + authority + forbidden-intent negative controls, and the
  real-source anchors are exercised and pass. No runtime implementation; no binding write; no flip; no
  source change.
- Fixtures: EMBEDDED in the F23 validator (synthetic only; tokenized ids; no separate fixture file).
- proposed receipt schema stays DESIGN-ONLY (not minted).
- `binding-mismatch`: REMAINS BLOCKED. `field-mismatch:sortOrder`: REMAINS GATED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F24

F24 = an IN-PROCESS, FIXTURE-BACKED binding repair APPLY proof harness (the binding analog of the F17
sortOrder apply proof; still no product runtime change, no live Desktop, no flip): on a TEMP `node:sqlite`
copy with a mocked `FOLDER_STATE_DATA_KEY.items` mirror, take an ACCEPTED synthetic bind/move request,
apply it to canonical `folder_bindings`, re-project the mirror, then run an F5/F6-style read-only drift
check proving `binding-mismatch` reconverges — with the write counter bounded to `folder_bindings` +
mirror only, one-folder-per-chat preserved, no chat/folder delete, no tombstone mutation, redacted output.
Keep the proposed receipt schema design-only, keep `binding-mismatch` blocked, `field-mismatch:sortOrder`
gated, `productSyncReady` false, and Chat Saving CAS blocked. F24 modifies no product source and performs
no live write.
