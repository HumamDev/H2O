# Folder Sync — Phase F19: sortOrder Absorption Implementation-Readiness Gate (design-only)

Date: 2026-07-01

## Status

DESIGN / READINESS GATE ONLY. No runtime behavior was implemented. No request/receipt schema was minted
in runtime source. No sortOrder request loop was implemented. `field-mismatch:sortOrder` was NOT added to
the F11 allowed rebuild set. No product runtime behavior changed. No live Desktop write. No binding
repair, no product SQLite write, no product mirror write, no tombstone write, no folder delete/purge.
`productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat
Saving / archive package code was touched. No product source was modified. This slice is a readiness
gate: it enumerates exactly what a FUTURE product implementation of the sortOrder absorption loop would
change, separates the prerequisites already proven (F14–F18) from the still-open blockers, and records
the explicit readiness verdict.

Naming note: this folder-sync F19 is distinct from the pre-existing
`tools/validation/sync/validate-f19-sync-hardening.mjs` in another sync lane; all F19 artifacts use the
`folder-sync-f19-*` prefix to avoid collision.

## Context

- F18 negative-path apply proof committed: `62c62b3` (8 rejected/skipped cases write nothing;
  `canonicalSortOrderWriteCount:0`, `mirrorProjectionWriteCount:0`, `forbiddenTotal:0`,
  `probeWriteCallCount:0`).
- F17 accepted apply proof committed: `c3b24ba` (accepted synthetic reorder applied to temp canonical
  `sort_order`; mirror re-projection cleared `field-mismatch:sortOrder` 4 → 0).
- F16 conflict-matrix harness committed: `0a80b99`. F15 absorption/request-receipt spec committed:
  `cc0bda9`. F14 sortOrder authority decision committed: `58781a0`.
- Proposed (design-only, not minted) schemas: `h2o.studio.folder-sortorder-reorder-request.v1`,
  `h2o.studio.folder-sortorder-reorder-receipt.v1`.
- `field-mismatch:sortOrder` remains gated; `binding-mismatch` remains blocked; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F19)

Any future implementation must preserve parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface
render projection, hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Future Implementation Change List (NOT done in F19)

A future implementation slice (each behind its own proof gate) would need to:

- mint the proposed request schema `h2o.studio.folder-sortorder-reorder-request.v1` in runtime source.
- mint the proposed receipt schema `h2o.studio.folder-sortorder-reorder-receipt.v1` in runtime source.
- add a Desktop reorder-request VALIDATE/APPLY handler (schema + basis + folder existence + tombstone +
  catalog visibility + idempotency), reusing the existing request/receipt family in
  `folder-sync.tauri.js`.
- APPLY an accepted reorder to canonical SQLite `sort_order` (Desktop-only write via the folder store
  path).
- EMIT the receipt (`applied` / `skipped` / `rejected`, `canonicalAuthority: desktop-sqlite`,
  `noDestructiveMutation: true`).
- RE-PROJECT the `FOLDER_STATE_DATA_KEY` mirror from canonical SQLite AFTER the `sort_order` write
  (write-through projection).
- ONLY THEN, and only behind the absorption gate, allow `field-mismatch:sortOrder` into the F11 allowed
  render-only rebuild set (still render-only; never while a native reorder is pending absorption).

## 2. Proven Prerequisites vs Open Blockers

Proven prerequisites (already landed in this lane):

- F14: sortOrder ownership DECIDED (Desktop SQLite canonical; mirror derived; Chrome/native/mobile
  non-canonical proposers).
- F15: absorption request → Desktop-apply → receipt → read-only projection loop SPECIFIED.
- F16: request/receipt envelope + 8-case conflict contract PROVEN with synthetic fixtures.
- F17: accepted apply path PROVEN in temp `node:sqlite` (`field-mismatch:sortOrder` 4 → 0 after
  re-projection; bounded writes; read-only probe).
- F18: rejected/skipped paths PROVEN to write nothing (8 negative cases; zero canonical/mirror/forbidden
  writes).

Open blockers (still required before/at implementation):

- product runtime implementation of the schemas + Desktop validate/apply handler + receipt + mirror
  write-through (NONE minted yet).
- live Desktop dry-run proof and a controlled live Desktop apply proof (on real Desktop, dev-gated).
- Chrome / native / mobile reorder-request SUBMISSION path (proposers) — not built.
- multi-device import read-only proof (a second device consuming the projection + receipt).
- product mirror rebuild gate update: add `field-mismatch:sortOrder` to the F11 allowed set behind the
  absorption gate — NOT done; F11 still blocks it.

## 3. Readiness Verdict

- implementation-readiness: PARTIALLY READY FOR SCOPED IMPLEMENTATION PLANNING — the design + contract +
  in-process apply/negative proofs (F14–F18) are complete, so a scoped implementation could be planned;
  but implementation itself is NOT started and remains gated.
- `productSyncReady`: NOT READY (remains `false`).
- public/premium sync: BLOCKED.
- Chat Saving WebDAV/cloud/archive CAS: BLOCKED.

## 4. Hard Preconditions Before Implementation

- no live profile mutation without a dedicated live-proof phase.
- no schema minting without validator coverage (a source validator must land with the schemas).
- no sortOrder allowed-set expansion until the request/receipt apply path exists and is proven on real
  Desktop.
- a "no lost folder order" invariant must be enforced and checked.
- no Chrome / native / mobile canonical mutation (proposers never write canonical order).

## 5. Validation Requirements for Future Implementation

- a source validator asserting the two schemas are well-formed and wired (once minted).
- a handler validator (validate/apply/receipt/idempotency/redaction).
- the temp `node:sqlite` positive (F17) + negative (F18) harnesses RETAINED and kept green.
- a live Desktop DRY-RUN proof (no write).
- a live Desktop CONTROLLED APPLY proof (single gated apply).
- a post-apply read-only F5/F6 drift probe proving `field-mismatch:sortOrder` reconverges,
  `writeCallCount:0`.
- a Chrome / native / mobile IMPORT read-only proof (consume projection + receipt, no canonical write).

## 6. `binding-mismatch` Stays Blocked (out of scope)

`binding-mismatch` remains BLOCKED and out of scope for the sortOrder lane. Binding repair is a separate
reviewed binding-repair loop (via the existing `chat-folder-binding-request.v1`), never folded into
sortOrder absorption.

## 7–10. Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F19: PASS (design/readiness gate only). The future implementation change list, the proven-vs-open
  split, the readiness verdict, the hard preconditions, and the future validation requirements are
  specified. No runtime implementation; no schema minting; no sortOrder allowed-set expansion; no flip;
  no source change.
- implementation-readiness: PARTIALLY READY FOR SCOPED IMPLEMENTATION PLANNING (design + in-process
  proofs complete; product implementation NOT started, gated).
- `field-mismatch:sortOrder` in the product allowed rebuild set: NOT NOW — the committed F11 helper still
  blocks it (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `binding-mismatch`: REMAINS BLOCKED, separate.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F20

F20 = a DESIGN-ONLY folder-sync lane STATUS ROLLUP / consolidated readiness ledger (no runtime, no
writes, no flip): a single audit that consolidates the whole folder-sync lane (source-of-truth split →
render-mirror rebuild F11–F13 → sortOrder ownership + absorption design/proof F14–F19), records the
current posture of every drift class (`missing-mirror-folder` and `field-mismatch:color` handled +
idempotent; `field-mismatch:sortOrder` designed + in-process-proven but gated/unimplemented;
`binding-mismatch` blocked), lists exactly what remains before a `productSyncReady` flip could be
reviewed, and reaffirms `productSyncReady` false + Chat Saving CAS blocked. F20 modifies no product
source and performs no write.
