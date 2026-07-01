# Folder Sync — Phase F20: Lane Status Rollup / Consolidated Readiness Ledger (design-only)

Date: 2026-07-01

## Status

DESIGN / READINESS LEDGER ONLY. No runtime behavior was changed. No sortOrder request/receipt schema was
minted. No sortOrder request loop was implemented. `field-mismatch:sortOrder` was NOT added to the F11
allowed rebuild set. No binding repair, no product SQLite write, no product mirror write, no tombstone
write, no folder delete/purge. `productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. No
WebDAV/cloud/archive CAS. No Chat Saving / archive package code was touched. No product source was
modified. This slice consolidates the full folder-sync lane into a single readiness ledger.

## Context (lane commit lineage)

- F19 sortOrder implementation-readiness gate: `44ace94`.
- F18 negative-path apply harness: `62c62b3`. F17 accepted apply harness: `c3b24ba`.
- F16 conflict-matrix harness: `0a80b99`. F15 absorption/request-receipt spec: `cc0bda9`.
- F14 sortOrder authority decision: `58781a0`. F13 sustained parity/idempotence proof: `37ad6c7`.
- F12B controlled apply proof: `e2b4281`. F12A dry-run proof: `0a16f5a`. F11 render-only mirror rebuild
  helper: `1776e17`.
- F10 mirror write-through/rebuild spec: `bc1a67e`. F9 productSyncReady readiness gate: `157d66a`.
  F8 Chrome/Desktop folder parity proof: `0f03357`.

## Cross-Surface Requirement (carried, not implemented in F20)

The lane is designed for future parity across Desktop Studio, Chrome / native extension Studio across
MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface render
projection, hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving CAS are
NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Lane Consolidation

- Source-of-truth split AUDIT (reopened): SQLite `folders` canonical vs `FOLDER_STATE_DATA_KEY` render
  mirror; Chrome/native owner non-canonical. Diagnosed and probed read-only (F1–F8).
- Desktop SQLite canonical DECISION: SQLite is the canonical owner of folder name/color/sort_order/
  tombstone/binding; the mirror is a derived render projection.
- Render mirror rebuild (F10–F13): specced (F10), implemented render-only for the two safe classes (F11),
  dry-run proven (F12A), controlled-apply proven (F12B), sustained-parity/idempotent (F13).
- sortOrder ownership + absorption (F14–F19): ownership decided (F14), loop specified (F15),
  envelope/conflict contract proven (F16), accepted apply proven in temp SQLite (F17), rejected/skipped
  write-nothing proven (F18), implementation-readiness gated (F19).

## 2. Drift-Class Posture

| Drift class | Posture |
| --- | --- |
| `missing-mirror-folder` | HANDLED — render-only rebuild applied + idempotent (F11/F12B/F13) |
| `field-mismatch:color` | HANDLED — render-only rebuild applied + idempotent (F11/F12B/F13) |
| `field-mismatch:sortOrder` | Desktop SQLite CANONICAL; design + in-process proofs complete (F14–F18); product runtime implementation NOT started; still GATED (blocked in F11) |
| `binding-mismatch` | BLOCKED — separate reviewed binding-repair / request-loop phase required |

- `missing-mirror-folder`: handled, applied, idempotent.
- `field-mismatch:color`: handled, applied, idempotent.
- `field-mismatch:sortOrder`: Desktop SQLite canonical; design + in-process proofs complete; product
  implementation not started; still gated/unimplemented in product runtime.
- `binding-mismatch`: blocked, separate reviewed repair/request-loop phase required.

## 3. What Is Proven

- F8: Chrome/Desktop folder parity (`PASSED_CHROME_DESKTOP_FOLDER_PARITY`).
- F9: productSyncReady local readiness gate — verdict NOT READY.
- F10: mirror write-through/rebuild specification.
- F11: render-only safe mirror rebuild for `missing-mirror-folder` + `field-mismatch:color` ONLY.
- F12A: dry-run proof (no write). F12B: controlled live apply proof (mirror-only write).
- F13: sustained parity / idempotence proof (no-op on re-run; drift stays cleared).
- F14: sortOrder authority decision (Desktop SQLite canonical).
- F15: sortOrder request/receipt absorption loop specification.
- F16: envelope + 8-case conflict matrix contract (synthetic fixtures).
- F17: accepted apply in temp `node:sqlite` (`field-mismatch:sortOrder` 4 → 0 after re-projection).
- F18: rejected/skipped write-nothing harness (8 negative cases; zero canonical/mirror/forbidden writes).
- F19: implementation-readiness gate (partially ready for scoped planning; still gated).

## 4. What Remains Before productSyncReady Can Be Reviewed

- product runtime sortOrder request/receipt implementation (schemas + Desktop validate/apply handler +
  receipt + mirror write-through) — NOT started.
- live Desktop dry-run proof (real Desktop, dev-gated).
- live Desktop controlled apply proof (single gated apply).
- Chrome / native / mobile reorder-request submission proof (proposers).
- multi-device import / read-only proof (a second device consuming projection + receipt).
- F11 allowed-set update: add `field-mismatch:sortOrder` behind the absorption gate.
- `binding-mismatch` repair / request-loop design + proof (separate lane).
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

- F20: PASS (design/readiness ledger only). The lane consolidation, the four-class drift posture, the
  proven-prerequisites list, the remaining-before-flip list, and the reaffirmed blocked boundaries are
  recorded. No runtime change; no schema minting; no sortOrder allowed-set expansion; no flip; no source
  change.
- Overall folder-sync readiness: NOT READY. The two safe render-only classes are handled + idempotent;
  `field-mismatch:sortOrder` is designed + in-process-proven but unimplemented and gated;
  `binding-mismatch` is blocked. `productSyncReady` stays `false`.
- `field-mismatch:sortOrder` in the product allowed rebuild set: NOT NOW — the committed F11 helper still
  blocks it (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `binding-mismatch`: REMAINS BLOCKED, separate.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F21

F21 = a DESIGN-ONLY `binding-mismatch` repair readiness audit (no runtime, no writes, no flip): open the
still-blocked `binding-mismatch` class the way F14 opened sortOrder — audit the real chat-folder binding
read/write paths, confirm the existing `chat-folder-binding-request.v1` request/receipt loop as the only
sanctioned repair channel, classify safe vs dangerous binding drift, and specify the ownership/gate that
must exist BEFORE any binding repair — keeping `binding-mismatch` blocked, `field-mismatch:sortOrder`
gated, `productSyncReady` false, and Chat Saving CAS blocked. F21 modifies no product source and performs
no write.
