# Folder Sync — Phase F14: sortOrder Canonical-Ownership Decision (design-only)

Date: 2026-07-01

## Status

DESIGN / AUDIT / DECISION ONLY. No runtime behavior was implemented. No sortOrder repair was performed.
No mirror write, no SQLite write, no tombstone write, no binding repair. `productSyncReady` was NOT
flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS was implemented. No Chat Saving /
archive package code was touched. No product source was modified. This slice decides the canonical
ownership model for folder `sortOrder` and the gate that must pass BEFORE `field-mismatch:sortOrder`
could ever join the allowed mirror rebuild set. It is a specification, not an implementation.

## Context

- F13 sustained parity / idempotence proof committed: `37ad6c7` (no-op
  `no-op-render-mirror-already-converged`, `mirrorWriteAttempted:false`, post-probe `writeCallCount:0`,
  `missing-mirror-folder` + `field-mismatch:color` remain cleared, remaining drift only
  `binding-mismatch` + `field-mismatch:sortOrder`).
- F12B controlled apply proof committed: `e2b4281`.
- F11 render-only mirror rebuild helper committed: `1776e17` (handles only `missing-mirror-folder` +
  `field-mismatch:color`; blocks/skips `field-mismatch:sortOrder` + `binding-mismatch`).
- F10 spec: `field-mismatch:sortOrder` requires a canonical ownership review BEFORE any rebuild;
  `binding-mismatch` stays blocked for a dedicated reviewed binding-repair / request-loop phase.
- Folder sync is improved but NOT ready to flip `productSyncReady`. The safe mirror rebuild classes are
  handled and idempotent. The remaining mirror-lane decision blocker is sortOrder ownership. Binding
  repair remains separate and blocked. Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Cross-Surface Requirement (carried, not implemented in F14)

The sortOrder ownership model must preserve future parity across Desktop Studio, Chrome / native
extension Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite stays canonical, the mirror
stays a derived per-surface render projection, diagnostics stay hash-only / redacted, and no surface
other than Desktop mutates canonical folder order unless a future gate explicitly redesigns that. Mobile,
remote WebDAV, and Chat Saving CAS are NOT implemented here. Chrome / native extension and mobile remain
non-canonical future participants.

## 1. sortOrder Read/Write Path Audit (grounded in real source)

- SQLite canonical ordering (READ): `store/folders.tauri.js` `listFolders()` orders by the `sort_order`
  column ASC (`var sortCol = 'sort_order'`), tie-broken by name for determinism. SQLite `sort_order` is
  the canonical order source.
- SQLite field/column mapping: `FIELD_TO_COL` maps `sort_order: 'sortOrder'` — the canonical column
  `sort_order` surfaces as the `sortOrder` field.
- SQLite canonical ordering (WRITE): folder ordering is written to SQLite only through the existing
  folder store patch/upsert path (`patch.sortOrder = sortOrder` when finite). This is Desktop-only,
  canonical.
- Render mirror ordering (PROJECTION): the `FOLDER_STATE_DATA_KEY` mirror row carries
  `sortOrder: Number(folder.sortOrder) || 0` — a DERIVED projection of the canonical value, used for
  rendering/export. The mirror is not an independent order authority.
- F11 render-only rebuild EXPLICITLY does NOT touch ordering: `f11BuildRenderMirrorFolderRow` deletes
  `sortOrder` and `sort_order` from any row it materializes (`delete next.sortOrder;
  delete next.sort_order;`), and the rebuild helper always lists `field-mismatch:sortOrder` in
  `blockedClasses` and reports `skippedSortOrderRebuildCount`. So the committed rebuild path can neither
  create nor overwrite mirror ordering.
- Drift detection (READ-ONLY): the F5/F6 probe compares canonical vs mirror `sortOrder` and emits a
  `field-mismatch:sortOrder` diagnostic (hash-only) when they differ. Detection only; no write.
- Chrome / native folder owner ordering: the native ChatGPT surface owns its own sidebar order; the
  Chrome extension is read-only / non-canonical for folder order in this lane. Native reorder is an
  external event that is NOT yet absorbed into SQLite.
- Export/import projection ordering: export projects canonical order; import is merge-only and does not
  redefine canonical order. No cross-surface order write path exists today.

## 2. Canonical Ownership Decision

DECISION: **Desktop SQLite is CANONICAL for folder `sortOrder`.** The `FOLDER_STATE_DATA_KEY` mirror is
a DERIVED render projection of the canonical order and is never an independent order authority. Chrome /
native extension and mobile remain NON-CANONICAL for folder order. A native/Chrome/mobile reorder is a
proposed change that must be ABSORBED back into canonical SQLite through a reviewed request/receipt
loop — it does not make Chrome or mobile canonical.

Options considered and why rejected/deferred:

- Desktop SQLite canonical (CHOSEN): consistent with the F1/F9/F10 model; the render mirror already
  projects canonical `sortOrder`; no new authority is introduced; safest for "no lost folder order".
- Chrome / native-owner canonical (REJECTED for now): would make a non-canonical, multi-device surface
  the order authority and risk clobbering Desktop order across devices; violates the standing
  Desktop-canonical boundary.
- Hybrid / request-loop mediated (DEFERRED as the absorption mechanism, not the authority): the reviewed
  request/receipt loop is how a native reorder is absorbed INTO canonical SQLite, but SQLite remains the
  authority. This is the future path, not a change of ownership.
- Fully deferred / do nothing (REJECTED): leaves `field-mismatch:sortOrder` permanently undecided; F14
  resolves ownership so the class has a defined disposition.

## 3. How a Native Reorder Reconciles Back Into SQLite (without accidental canonical promotion)

A native (Chrome/extension/mobile) reorder is treated as a PROPOSED order change, not an authoritative
one. The future absorption path (design intent, not implemented here) mirrors the closed metadata lane's
request → Desktop-apply → receipt loop: the non-canonical surface emits an order-change REQUEST
(hash-only, per-peer/per-device identity), Desktop VALIDATES and APPLIES it to canonical SQLite, then
emits a RECEIPT; only after the canonical SQLite write does the render mirror re-project the new order.
The non-canonical surface never writes canonical order directly and never becomes the authority; it only
proposes. This keeps Chrome/mobile non-canonical while still letting a native reorder eventually win
through Desktop.

## 4. Safe sortOrder Drift Classification

- Expected display-only drift: a mirror `sortOrder` that differs only in a render-local way while the
  canonical order is intact — benign; no action.
- Stale mirror drift: the mirror lags a canonical SQLite reorder — safe to reconcile by re-projecting
  canonical order into the mirror (render-only), IF/when sortOrder rebuild is later gated in.
- Native reorder pending absorption: a native surface reordered and the change has not yet been absorbed
  into SQLite — must go through the request/receipt absorption loop, NOT a blind mirror rebuild (a blind
  rebuild would overwrite the pending native intent with stale canonical order).
- True canonical mismatch: canonical SQLite order and mirror disagree with no pending native change —
  reconcilable by re-projection once gated.

The dangerous case is "native reorder pending absorption": it is exactly why `field-mismatch:sortOrder`
is NOT in the allowed rebuild set today — a render-only rebuild cannot distinguish a stale mirror from a
legitimate not-yet-absorbed native reorder, so it could silently drop a user's intended order.

## 5. Can `field-mismatch:sortOrder` Ever Join the Allowed Rebuild Set?

CONDITIONALLY YES — but ONLY after the gate in §6 is fully satisfied. Until then it stays OUT of the
allowed rebuild set (the committed F11 helper keeps it blocked). When gated in, the allowed action would
be render-only re-projection of canonical SQLite order into the mirror, and ONLY for the "stale mirror
drift" / "true canonical mismatch" cases, never while a native reorder is pending absorption.

## 6. Required Gate Before Any sortOrder Rebuild

ALL of the following must hold before `field-mismatch:sortOrder` may be added to the allowed rebuild set:

- the ownership decision (this doc: Desktop SQLite canonical) is approved.
- a request/receipt or absorption path exists so a native reorder is absorbed into canonical SQLite
  BEFORE any mirror re-projection (so a pending native reorder is never clobbered).
- a live proof: reproduce a sortOrder drift, absorb/reconcile it, re-run the F5/F6 read-only probe to
  show `field-mismatch:sortOrder` clears, with the write counter limited to the intended target and
  `writeCallCount:0` on the probe.
- no lost folder order: an explicit invariant + check that no folder's order is dropped or reset.
- no Chrome/mobile canonical mutation unless explicitly approved by a later design gate; Desktop remains
  canonical by default.
- redacted / hash-only diagnostics throughout; `productSyncReady` stays false until its own flip gate.

## 7. `binding-mismatch` Stays Blocked (out of scope)

`binding-mismatch` remains BLOCKED and OUT OF SCOPE for F14. Bindings determine chat placement; repair
must go through a dedicated, reviewed binding-repair / request-loop phase (the existing
`chat-folder-binding` loop), never an ad-hoc mirror rebuild and never this sortOrder decision.

## 8–10. Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants; hard delete blocked; folder delete preserves chats.

## Verdicts

- F14: PASS (design/audit/decision only). sortOrder ownership is decided (Desktop SQLite canonical, with
  a future request/receipt absorption path for native reorders); the safe-drift classification, the
  conditional path for `field-mismatch:sortOrder`, and the required gate are specified. No sortOrder
  implementation was done; no writes; no flip; no source change.
- sortOrder canonical owner: Desktop SQLite. Mirror = derived render projection. Chrome/native/mobile =
  non-canonical proposers via a future absorption loop.
- `field-mismatch:sortOrder` in the allowed rebuild set: NOT NOW; conditionally later only after the §6
  gate.
- `binding-mismatch`: REMAINS BLOCKED, out of scope.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F15

F15 = a DESIGN-ONLY sortOrder absorption / request-receipt loop specification (no writes, no flip):
specify the native-reorder → Desktop-apply → receipt absorption path defined in §3, the "no lost folder
order" invariant + validator requirements, and the live-proof requirements from §6, so that a LATER
implementation slice could add `field-mismatch:sortOrder` to the allowed rebuild set safely. Keep
`binding-mismatch` blocked (its reviewed repair loop is a separate later slice), keep `productSyncReady`
false, and keep Chat Saving CAS blocked. F15 writes nothing and flips nothing.
