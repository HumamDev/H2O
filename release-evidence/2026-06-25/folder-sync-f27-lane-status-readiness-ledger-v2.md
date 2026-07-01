# Folder Sync — Phase F27: Lane Status Rollup v2 / Consolidated Readiness Ledger (design-only)

Date: 2026-07-01

## Status

DESIGN / READINESS LEDGER ONLY. No runtime behavior was changed. No schema was minted. No F11
allowed/blocked set was changed. No product SQLite write, no product mirror write, no tombstone write, no
bind/unbind/move in product runtime, no folder delete/purge, no chat content touched. `productSyncReady`
was NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat Saving / archive
package code was touched. No product source was modified. This slice updates the F20 lane ledger v1 with
the completed binding sub-lane (F21–F26) and re-consolidates the full folder-sync lane into a single
readiness ledger.

Naming note: all F27 artifacts use the `folder-sync-f27-*` prefix to avoid collision with any other lane.

## Context (lane commit lineage)

- F20 lane ledger v1: `aa4958e`. F26 binding-repair implementation-readiness gate: `cc1985c`.
- Binding sub-lane: F21 audit `35e11ae`, F22 spec `5c3dd88`, F23 envelope/conflict `84318d8`, F24
  accepted apply `6447b57`, F25 negative apply `358837c`, F26 readiness gate `cc1985c`.
- sortOrder sub-lane: F14 `58781a0`, F15 `cc0bda9`, F16 `0a80b99`, F17 `c3b24ba`, F18 `62c62b3`, F19
  `44ace94`.
- render-mirror rebuild: F10 `bc1a67e`, F11 `1776e17`, F12A `0a16f5a`, F12B `e2b4281`, F13 `37ad6c7`.
- ledger/readiness anchors: F8 Chrome/Desktop parity `0f03357`, F9 readiness gate `157d66a`.

## Cross-Surface Requirement (carried, not implemented in F27)

The lane is designed for future parity across Desktop Studio, Chrome / native extension Studio across
MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface render
projection, hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving CAS are
NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Lane Consolidation

- Source-of-truth split AUDIT (reopened): SQLite `folders` + `folder_bindings` canonical vs
  `FOLDER_STATE_DATA_KEY` (folders + `items`) render mirror; Chrome/native owner non-canonical.
- Desktop SQLite canonical DECISION: SQLite is the canonical owner of folder name/color/sort_order/
  tombstone AND chat-folder bindings (`folder_bindings`, `chat_id` PK → one-folder-per-chat); the mirror
  is a derived render projection.
- Render mirror rebuild (F10–F13): specced (F10), implemented render-only for the two safe classes (F11),
  dry-run proven (F12A), controlled-apply proven (F12B), sustained-parity/idempotent (F13).
- sortOrder ownership + absorption (F14–F19): ownership decided (F14), loop specified (F15),
  envelope/conflict contract proven (F16), accepted apply proven in temp SQLite (F17), rejected/skipped
  write-nothing proven (F18), implementation-readiness gated (F19).
- Binding repair (F21–F26): readiness audit (F21), request/receipt loop specified (F22), envelope +
  conflict matrix proven (F23), accepted apply proven in temp SQLite (F24), rejected/skipped
  write-nothing proven (F25), implementation-readiness gated (F26).

## 2. Drift-Class Posture (v2)

| Drift class | Posture |
| --- | --- |
| `missing-mirror-folder` | HANDLED — render-only rebuild applied + idempotent (F11/F12B/F13) |
| `field-mismatch:color` | HANDLED — render-only rebuild applied + idempotent (F11/F12B/F13) |
| `field-mismatch:sortOrder` | Desktop SQLite CANONICAL; design + in-process accepted/negative proofs complete (F14–F19); product runtime NOT started; still GATED in F11 |
| `binding-mismatch` | Desktop SQLite `folder_bindings` CANONICAL; design + in-process accepted/negative proofs complete (F21–F26); product runtime NOT started; still BLOCKED in F11 |

- `missing-mirror-folder`: handled, applied, idempotent.
- `field-mismatch:color`: handled, applied, idempotent.
- `field-mismatch:sortOrder`: Desktop SQLite canonical; design + in-process accepted/negative proofs
  complete; product runtime not started; still gated/unimplemented in product runtime (blocked in F11).
- `binding-mismatch`: Desktop SQLite `folder_bindings` canonical; design + in-process accepted/negative
  proofs complete; product runtime not started; still blocked/unimplemented in product runtime (blocked
  in F11).

## 3. Proven Lineage (F8–F26)

- F8: Chrome/Desktop folder parity (`PASSED_CHROME_DESKTOP_FOLDER_PARITY`).
- F9: productSyncReady local readiness gate — verdict NOT READY.
- F10: mirror write-through/rebuild spec. F11: render-only safe rebuild (`missing-mirror-folder` +
  `field-mismatch:color` only). F12A: dry-run proof. F12B: controlled apply proof. F13: sustained
  parity / idempotence.
- F14: sortOrder authority decision. F15: sortOrder absorption loop spec. F16: sortOrder envelope +
  conflict matrix. F17: sortOrder accepted apply in temp `node:sqlite`. F18: sortOrder rejected/skipped
  write-nothing. F19: sortOrder implementation-readiness gate.
- F21: binding readiness audit. F22: binding request/receipt loop spec. F23: binding envelope + conflict
  matrix. F24: binding accepted apply in temp `node:sqlite`. F25: binding rejected/skipped write-nothing.
  F26: binding implementation-readiness gate.

## 4. What Remains Before productSyncReady Can Be Reviewed

- sortOrder product runtime implementation (schemas + Desktop validate/apply handler + receipt + mirror
  write-through) — NOT started.
- binding product runtime implementation (receipt schema + Desktop validate/apply/receipt handler over
  `folder_bindings` + mirror `items` write-through) — NOT started.
- live Desktop dry-run proofs (sortOrder + binding).
- live Desktop controlled apply proofs (sortOrder + binding).
- Chrome / native / mobile request submission proofs (proposers).
- multi-device import / read-only proofs.
- F11 allowed/blocked-set changes behind the respective gates (add `field-mismatch:sortOrder` to the
  allowed set behind the absorption gate; move `binding-mismatch` into the reviewed repair path).
- final `productSyncReady` flip review (explicit maintainer approval).

## 5. Hard Blocked Boundaries (reaffirmed)

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- public/premium sync remains blocked.
- real remote WebDAV remains deferred.
- `fullBundle.v3` NOT minted (schema stays `h2o.studio.fullBundle.v2`).
- Chat Saving WebDAV/cloud/archive CAS remains blocked.
- hard delete blocked; folder delete preserves chats; Desktop remains canonical; Chrome / native
  extension and mobile stay non-canonical future participants.

## Verdicts

- F27: PASS (design/readiness ledger only). The lane consolidation v2, the four-class drift posture (with
  `binding-mismatch` now design + in-process-proven but still blocked), the proven F8–F26 lineage, the
  remaining-before-flip list, and the reaffirmed blocked boundaries are recorded. No runtime change; no
  schema minting; no allowed/blocked-set change; no flip; no source change.
- Overall folder-sync readiness: NOT READY. The two safe render-only classes are handled + idempotent;
  `field-mismatch:sortOrder` and `binding-mismatch` are each designed + in-process-proven (accepted +
  negative) but unimplemented and gated/blocked. `productSyncReady` stays `false`.
- `field-mismatch:sortOrder` in the product allowed rebuild set: NOT NOW. `binding-mismatch` in the
  product repair path: NOT NOW. The committed F11 helper still blocks both
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F28

F28 = a DESIGN-ONLY combined product-runtime implementation SEQUENCING PLAN (no runtime, no writes, no
flip): specify the exact ordered, individually-gated implementation steps that would take sortOrder +
binding from "design + in-process-proven" to a reviewable `productSyncReady` flip — which schema mints
come first, which Desktop handlers, which live Desktop dry-run/controlled-apply proofs, which
Chrome/native/mobile submission + multi-device import proofs, and in what order the F11 allowed/blocked-set
changes land behind their gates — with each step's entry/exit criteria and the invariants it must
preserve (one-folder-per-chat, no chat/folder delete, no Chrome/mobile canonical mutation). Keep
`binding-mismatch` blocked, `field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving
CAS blocked. F28 modifies no product source and performs no write.
