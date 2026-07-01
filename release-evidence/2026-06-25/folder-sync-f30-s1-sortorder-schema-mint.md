# Folder Sync — Phase F30: EXECUTE S1 — sortOrder Schema Mint (first product-source change)

Date: 2026-07-01

## Status

S1 EXECUTION — FIRST PRODUCT-SOURCE SCHEMA MINT. This is the FIRST slice in the entire folder-sync lane
(F8–F29 were all evidence/validator-only) that edits product runtime source. F30 mints exactly two INERT
sortOrder schema string constants into `src-surfaces-base/studio/sync/folder-sync.tauri.js`, adds the S1
source validator, and updates the minimal source-anchor assertions in the retained validators from
"absent" to "present". NOTHING ELSE. No apply/validate/receipt handler was added. No request loop,
transport, or import/export wiring was added. No F11 allowed/blocked-set change. No product SQLite write,
no product mirror write, no tombstone write, no bind/unbind/move, no folder delete/purge, no chat content
touched. `productSyncReady` was NOT flipped. No `fullBundle.v3`. No WebDAV/cloud/archive CAS. No Chat
Saving / archive package code touched. The proposed binding receipt schema was NOT minted.

## Context

- F29 S1 pre-flight gate committed: `436a59a` (gated this exact mint). F28 sequencing plan: `64dd692`.
- Before F30: product source had ZERO `folder-sortorder-reorder` occurrences.
- Proposed constants (from F29): `FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA =
  'h2o.studio.folder-sortorder-reorder-request.v1'`, `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA =
  'h2o.studio.folder-sortorder-reorder-receipt.v1'`.

## Cross-Surface Requirement (carried, not implemented in F30)

The minted schemas are inert constants only; they preserve future parity across Desktop Studio, Chrome /
native extension Studio across MULTIPLE DEVICES, and the mobile app, with Desktop SQLite canonical, the
mirror a derived per-surface render projection, and hash-only / redacted payloads — none of which is
wired up yet. Mobile, remote WebDAV, and Chat Saving CAS are NOT implemented. Chrome / native extension
and mobile remain non-canonical proposers.

## 1. Exact Product-Source Diff (folder-sync.tauri.js)

Added, in the request/receipt schema-constants region (immediately after
`CHAT_FOLDER_BINDING_REQUEST_SCHEMA`):

```js
  /* F30 (folder-sync S1): inert sortOrder reorder request/receipt schema constants. Declared only —
     NOT wired into any validate/apply/receipt handler, request loop, or transport/import/export path.
     field-mismatch:sortOrder remains gated (blocked in the F11 render-only rebuild helper). */
  var FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
  var FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
```

Nothing else in `folder-sync.tauri.js` changed. `node --check` passes.

## 2. Inertness

Each new constant is referenced EXACTLY ONCE in the file — its own declaration. Neither is read by any
function, handler, request loop, transport, import, or export. They are dead-but-declared string
constants, exactly as F29 specified. No `sort_order` validate/apply function was added; no request-loop
or transport/import/export wiring was added.

## 3. F11 Allowed/Blocked Set Unchanged

The F11 render-only rebuild helper still blocks both classes:
`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`. `field-mismatch:sortOrder`
was NOT added to the allowed set. `binding-mismatch` was NOT moved into any repair path.

## 4. Binding Receipt Schema Unminted

`h2o.studio.chat-folder-binding-receipt.v1` is NOT minted (that is a later step, S6). The real binding
request schema `h2o.studio.chat-folder-binding-request.v1` remains present and unchanged.

## 5. Entry Criteria (from F29) — Met

- F28 committed and passing. ✔ (F29 gate committed at `436a59a`, on the ancestry of current HEAD.)
- proposed sortOrder schemas ABSENT from source before S1. ✔ (0 occurrences pre-edit.)
- F11 still blocks `field-mismatch:sortOrder`. ✔
- `productSyncReady` false. ✔
- all retained validators green before the edit. ✔

## 6. Exit Criteria — Met

- request + receipt schema constants minted EXACTLY as specified. ✔
- an S1 source validator added and passing
  (`validate-folder-sync-f30-s1-sortorder-schema-mint.mjs`). ✔
- NO apply handler added. ✔
- NO F11 allowed/blocked-set change. ✔
- NO runtime writes. ✔
- the retained validators still green (after the minimal absent→present anchor flip). ✔

## 7. Retained-Validator Source-Anchor Updates (absent → present)

The S1 mint made the sortOrder schema strings PRESENT in source, so the retained validators that asserted
their ABSENCE were updated minimally (only that one assertion each) from "must NOT be minted" to "now
present in source (minted inert by F30 S1)". No other checks were weakened. Files + assertions updated:

- F15 `validate-folder-sync-f15-...`: `PROPOSED_REQUEST_SCHEMA` / `PROPOSED_RECEIPT_SCHEMA` absent → present.
- F16 `validate-folder-sync-f16-...`: `REQUEST_SCHEMA` / `RECEIPT_SCHEMA` absent → present.
- F17 `validate-folder-sync-f17-...`: `REQUEST_SCHEMA` / `RECEIPT_SCHEMA` absent → present.
- F18 `validate-folder-sync-f18-...`: `REQUEST_SCHEMA` / `RECEIPT_SCHEMA` absent → present.
- F19 `validate-folder-sync-f19-...`: `REQUEST_SCHEMA` / `RECEIPT_SCHEMA` absent → present.
- F20 `validate-folder-sync-f20-...`: `REQUEST_SCHEMA` / `RECEIPT_SCHEMA` absent → present.
- F21 `validate-folder-sync-f21-...`: `SORTORDER_REQUEST_SCHEMA` + `SORTORDER_RECEIPT_SCHEMA` absent → present.
- F22 `validate-folder-sync-f22-...`: same sortOrder pair absent → present (binding receipt absence
  assertion left intact).
- F23 `validate-folder-sync-f23-...`: same sortOrder pair absent → present (binding receipt absence intact).
- F24 `validate-folder-sync-f24-...`: same sortOrder pair absent → present (binding receipt absence intact).
- F25 `validate-folder-sync-f25-...`: same sortOrder pair absent → present (binding receipt absence intact).
- F26 `validate-folder-sync-f26-...`: same sortOrder pair absent → present (binding receipt absence intact).
- F27 `validate-folder-sync-f27-...`: same sortOrder pair absent → present (binding receipt absence intact).
- F28 `validate-folder-sync-f28-...`: same sortOrder pair absent → present (binding receipt absence intact).
- F29 `validate-folder-sync-f29-...`: `SORTORDER_REQUEST_SCHEMA` + `SORTORDER_RECEIPT_SCHEMA` absent →
  present (binding receipt absence assertion left intact).

Only the sortOrder source-anchor assertions were flipped. Every binding-receipt "NOT minted" assertion,
`fullBundle.v3` check, WebDAV-deferred check, F11-blocks check, and bounded metadata guard was left
unchanged. The F30 validator independently re-asserts the mint + inertness + all standing boundaries.

## 8. Rollback

To revert S1: remove ONLY the two sortOrder schema constants (+ their comment) from
`folder-sync.tauri.js`, delete the F30 validator + this evidence, and restore the 15 retained validators'
sortOrder source-anchor assertions from "present" back to "absent". Because the constants are inert (no
handler, no apply path), rollback cannot lose data or change runtime behavior; re-running the retained
validators returns them to green against the reverted source.

## Preserved Postures

- `binding-mismatch` remains BLOCKED. `field-mismatch:sortOrder` remains GATED (still in the F11
  `blockedClasses`).
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F30: PASS (S1 executed). The two inert sortOrder schema constants are minted exactly as specified; the
  S1 source validator passes; no apply handler, no request-loop/transport/import/export wiring, no F11
  set change, no runtime writes, no flip. The binding receipt schema stays unminted.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F31

F31 = a DESIGN-ONLY S2 pre-flight gate (sortOrder Desktop validate/apply/receipt handler) — the entry
gate for the SECOND implementation step: specify the exact handler contract (validate → apply to canonical
`sort_order` → emit receipt), the handler-validator assertions, the retained validator set, and S2
entry/exit criteria + rollback — WITHOUT adding any handler. Keep `field-mismatch:sortOrder` gated
(NOT yet in the F11 allowed set — that is S5), `binding-mismatch` blocked, `productSyncReady` false, and
Chat Saving CAS blocked. Like F30, the eventual S2 EXECUTION (adding the real handler) would be a further
product-source change requiring separate explicit approval.
