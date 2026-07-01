# Folder Sync — Phase F16: sortOrder Absorption Envelope + Conflict-Matrix Validator Harness (design-only)

Date: 2026-07-01

## Status

DESIGN / VALIDATOR HARNESS ONLY — SYNTHETIC FIXTURES. No runtime behavior was implemented. No sortOrder
request loop was implemented. No sortOrder rebuild was implemented. No sortOrder writes were added. No
mirror write, no SQLite write, no tombstone write, no binding repair. `productSyncReady` was NOT flipped.
No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS was implemented. No Chat Saving / archive
package code was touched. No product source was modified. This slice adds a fixture-backed meta-validator
that exercises the F15 request/receipt contract and conflict matrix against SYNTHETIC data only, proving
the contract BEFORE any runtime implementation. The proposed schemas remain design-only and are NOT
minted in runtime source.

## Context

- F15 sortOrder absorption / request-receipt spec committed: `cc0bda9`.
- F14 sortOrder authority decision committed: `58781a0`.
- F13 idempotence proof committed: `37ad6c7`. F12B apply proof committed: `e2b4281`.
- F15 proposed (design-only, not minted) schemas:
  - request: `h2o.studio.folder-sortorder-reorder-request.v1`
  - receipt: `h2o.studio.folder-sortorder-reorder-receipt.v1`
- `field-mismatch:sortOrder` remains gated; `binding-mismatch` remains blocked; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F16)

The harness validates a contract that must preserve future parity across Desktop Studio, Chrome / native
extension Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a
derived per-surface render projection, hash-only / redacted identity + diagnostics (per-peer /
per-device), and no non-Desktop canonical order write. Mobile, remote WebDAV, and Chat Saving CAS are NOT
implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Harness Model (fixture-backed, synthetic only)

The harness is embedded directly in the F16 validator (no separate fixture file needed). It defines a
pure, synthetic canonical snapshot (tokenized folder ids only — no real names/titles/content), a pure
request-envelope checker, a pure receipt-envelope checker, and a pure `decideReorder(request, canonical,
ctx)` decision function modeling Desktop's validation. It exercises the F15 §3/§4 envelopes and the §5
conflict matrix and asserts each fixture yields the specified receipt. No runtime module is loaded; no
write occurs; the decision function is a specification oracle, not product code.

## 2. Request Envelope Checks (`folder-sortorder-reorder-request.v1`)

Required and validated: `schema` (must equal the proposed request schema), `requestId`,
`sourcePeerId` or `deviceId` (hash-only identity), `surfaceKind`
(`chrome-extension` | `native-extension` | `mobile`), `orderPayload` (array of `{folderId, position}`),
`basisOrderingHash`, `requestedOrderingHash`, `createdAt`, `idempotencyKey`. Redaction: folder ids are
tokenized/hashed; NO raw `name` / `title` / `content` keys may appear in the payload; hashes are
`sha256:`-prefixed.

## 3. Receipt Envelope Checks (`folder-sortorder-reorder-receipt.v1`)

Required and validated: `schema` (must equal the proposed receipt schema), `requestId`, `status`
(`applied` | `skipped` | `rejected`), `reason`, `resultingOrderingHash`,
`canonicalAuthority` (must equal `desktop-sqlite`), `noDestructiveMutation` (must be `true`),
`appliedAt` or `decidedAt`. No raw name/title/content keys may appear.

## 4. Conflict Matrix Fixtures (synthetic)

| Fixture | Expected status | Expected reason |
| --- | --- | --- |
| valid apply | applied | applied |
| stale basis | rejected | stale-basis |
| duplicate request | skipped | duplicate |
| missing folder | rejected | missing-folder |
| tombstoned folder | rejected | tombstoned-folder |
| unknown folder | rejected | unknown-folder |
| folder not in visible catalog | rejected | folder-not-in-catalog |
| multi-device concurrent (later) | rejected | superseded-concurrent |

Per-folder precedence in `decideReorder`: duplicate (idempotency) → basis mismatch (stale-basis, or
superseded-concurrent when a concurrent apply advanced the basis in the same batch) → per-folder
unknown-folder → tombstoned-folder → missing-folder → folder-not-in-catalog → else applied. The
multi-device case applies request A (advancing the canonical ordering hash and recording its idempotency
key), then decides request B against the updated canonical snapshot with `priorAppliedInBatch:true`,
yielding `superseded-concurrent`. Last-writer-wins is mediated through Desktop, never between proposers.

## 5. Safety Invariants (asserted on every fixture)

- no hard delete; no folder delete / purge; no chat delete; no binding repair.
- no Chrome / mobile canonical mutation (proposers never write canonical order).
- Desktop remains canonical (only Desktop decides/applies; every receipt asserts
  `canonicalAuthority: desktop-sqlite`).
- every receipt asserts `noDestructiveMutation: true`.
- transport remains transport-only; no WebDAV/cloud/archive CAS is exercised or enabled.

## 6. Proposed Schemas Remain Design-Only

The harness asserts against REAL SOURCE that neither proposed schema
(`h2o.studio.folder-sortorder-reorder-request.v1`, `h2o.studio.folder-sortorder-reorder-receipt.v1`) is
minted in `src-surfaces-base/studio/sync/folder-sync.tauri.js` — the loop stays design-only until a
future implementation slice.

## 7. Gated / Blocked Postures (asserted against real source)

- `field-mismatch:sortOrder` remains GATED — the committed F11 helper still lists it in `blockedClasses`
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `binding-mismatch` remains BLOCKED and separate.
- SQLite `sort_order` remains the canonical order column (`var sortCol = 'sort_order'`).

## 8–12. Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F16: PASS (validator harness only, synthetic fixtures). The request + receipt envelope checks, the
  eight-case conflict matrix, the safety invariants, the design-only schema-minting guard, and the
  gated/blocked source anchors are all exercised and pass. No runtime implementation; no sortOrder
  writes; no flip; no source change.
- Fixtures: EMBEDDED in the F16 validator (synthetic only; tokenized ids; no separate fixture file).
- Request envelope: validated (schema/id/identity/surface/order payload/basis+requested hashes/createdAt/
  idempotency/redaction).
- Receipt envelope: validated (schema/id/status/reason/resulting hash/canonical authority/
  noDestructiveMutation/timestamp).
- Conflict matrix: all eight cases yield the specified receipt (applied, stale-basis, duplicate,
  missing-folder, tombstoned-folder, unknown-folder, folder-not-in-catalog, superseded-concurrent).
- `field-mismatch:sortOrder` in the allowed rebuild set: NOT NOW; conditionally later only after the
  loop is implemented + proven (F15 §7/§8/§9 gates).
- `binding-mismatch`: REMAINS BLOCKED, separate.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F17

F17 = an IN-PROCESS, FIXTURE-BACKED absorption APPLY proof harness (still no product runtime change, no
live Desktop, no flip): on a TEMP `node:sqlite` copy with a mocked mirror, take an ACCEPTED synthetic
reorder request, apply it to canonical `sort_order`, re-project the mirror, then run an F5/F6-style
read-only drift check proving `field-mismatch:sortOrder` reconverges — with the write counter bounded to
`sort_order` + mirror only, no binding/tombstone/chat/delete mutation, no Chrome/mobile canonical write,
redacted output. Keep the proposed schemas design-only in product source, keep `binding-mismatch`
blocked, keep `productSyncReady` false, and keep Chat Saving CAS blocked. F17 modifies no product source
and performs no live write.
