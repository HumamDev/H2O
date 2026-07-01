# Folder Sync — Phase F26: Binding Repair Implementation-Readiness Gate (design-only)

Date: 2026-07-01

## Status

DESIGN / READINESS GATE ONLY. No runtime behavior was implemented. No binding receipt schema was minted
in runtime source. No binding repair was implemented. `binding-mismatch` was NOT added to the F11 allowed
rebuild set. No product SQLite write, no product mirror write, no tombstone write, no bind/unbind/move in
product runtime, no folder delete/purge, no chat content touched. `productSyncReady` was NOT flipped. No
`fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat Saving / archive package code was
touched. No product source was modified. This slice is the binding analog of the F19 sortOrder readiness
gate: it enumerates exactly what a FUTURE product implementation of the binding repair loop would change,
separates the prerequisites already proven (F21–F25) from the still-open blockers, and records the
explicit readiness verdict.

Naming note: all F26 artifacts use the `folder-sync-f26-*` prefix to avoid collision with any other lane.

## Context

- F25 binding negative-path apply harness committed: `358837c` (10 rejected/skipped cases write nothing;
  canonical `folder_bindings` + mocked mirror unchanged; `canonicalBindingWriteCount:0`,
  `mirrorProjectionWriteCount:0`, `forbiddenTotal:0`; one-folder-per-chat preserved; no chat lost).
- F24 binding accepted apply proof committed: `6447b57` (accepted bind/move applied to temp canonical
  `folder_bindings`; `binding-mismatch` 2 → 0 after mirror re-projection).
- F23 binding conflict-matrix harness committed: `84318d8`. F22 binding request/receipt spec committed:
  `5c3dd88`. F21 binding readiness audit committed: `35e11ae`. F19 sortOrder readiness gate precedent:
  `44ace94`.
- Canonical binding substrate: SQLite `folder_bindings` (`chat_id` PK → one-folder-per-chat);
  `bindChat` = `INSERT OR REPLACE`, `unbindChat` = `DELETE`. Mirror = `FOLDER_STATE_DATA_KEY.items`
  derived projection. Proposed receipt schema `h2o.studio.chat-folder-binding-receipt.v1` is design-only,
  NOT minted.
- `binding-mismatch` remains blocked; `field-mismatch:sortOrder` remains gated; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F26)

Any future implementation must preserve parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface
render projection, hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Future Implementation Change List (NOT done in F26)

A future implementation slice (each behind its own proof gate) would need to:

- mint the proposed receipt schema `h2o.studio.chat-folder-binding-receipt.v1` in runtime source.
- add a Desktop binding-request VALIDATE/APPLY/RECEIPT handler over `folder_bindings`, reusing the
  existing `chat-folder-binding-request.v1` request family.
- APPLY an approved `bind` / `unbind` / `move` to canonical SQLite `folder_bindings` ONLY (Desktop-only
  write via the existing store path; one-folder-per-chat via `chat_id` PRIMARY KEY).
- EMIT the receipt (`applied` / `skipped` / `rejected`, `canonicalAuthority: desktop-sqlite`,
  `noChatDelete` / `noFolderDelete` / `noFolderPurge` / `noTombstoneMutation`).
- RE-PROJECT `FOLDER_STATE_DATA_KEY.items` from canonical `folder_bindings` AFTER the apply (write-through
  projection).
- ONLY THEN, and only behind the reviewed repair gate, allow `binding-mismatch` into a repair path — still
  never an ad-hoc mirror-only binding repair.

## 2. Proven Prerequisites vs Open Blockers

Proven prerequisites (already landed in this lane):

- F21: binding ownership / readiness audit (Desktop SQLite `folder_bindings` canonical; mirror derived;
  Chrome/native/mobile non-canonical proposers; sanctioned `chat-folder-binding-request.v1` channel).
- F22: binding repair request/receipt loop SPECIFIED.
- F23: request/receipt envelope + conflict matrix PROVEN with synthetic fixtures (one-folder-per-chat).
- F24: accepted apply path PROVEN in temp `node:sqlite` (`binding-mismatch` 2 → 0 after re-projection;
  bounded writes; read-only probe).
- F25: rejected/skipped paths PROVEN to write nothing (10 negative cases; zero canonical/mirror/forbidden
  writes).

Open blockers (still required before/at implementation):

- product runtime implementation of the handler + receipt + mirror write-through (NONE built).
- receipt schema source minting (`h2o.studio.chat-folder-binding-receipt.v1` NOT minted).
- Desktop binding-request handler implementation.
- live Desktop dry-run proof (real Desktop, dev-gated).
- live Desktop controlled apply proof (single gated apply).
- Chrome / native / mobile binding-request SUBMISSION proof (proposers).
- multi-device import / read-only proof (a second device consuming the projection + receipt).
- F11 blocked-set change: allow `binding-mismatch` into the reviewed repair path — NOT done; F11 still
  blocks it.

## 3. Readiness Verdict

- implementation-readiness: PARTIALLY READY FOR SCOPED IMPLEMENTATION PLANNING — the audit + spec +
  contract + in-process accepted/negative apply proofs (F21–F25) are complete, so a scoped implementation
  could be planned; but implementation itself is NOT started and remains gated.
- `binding-mismatch` cannot join the F11 allowed set now.
- `productSyncReady`: NOT READY (remains `false`).
- public/premium sync: BLOCKED.
- Chat Saving WebDAV/cloud/archive CAS: BLOCKED.

## 4. Hard Preconditions Before Implementation

- no live profile mutation without a dedicated live-proof phase.
- no schema minting without validator coverage (a receipt-schema source validator must land with the
  schema).
- no `binding-mismatch` allowed-set change until the request/receipt apply path exists and is proven on
  real Desktop.
- one-folder-per-chat invariant PRESERVED (`folder_bindings.PRIMARY KEY (chat_id)`).
- no chat delete; no folder delete / purge; no tombstone mutation unless a separately scoped phase
  authorizes it.
- no Chrome / native / mobile canonical mutation (proposers never write `folder_bindings`).

## 5. Future Validation Requirements

- a receipt-schema source validator (once the schema is minted).
- a Desktop handler validator (validate/apply/receipt/idempotency/redaction/one-folder-per-chat).
- the temp `node:sqlite` positive (F24) + negative (F25) harnesses RETAINED and kept green.
- a live Desktop DRY-RUN proof (no write).
- a live Desktop CONTROLLED APPLY proof (single gated apply).
- a post-apply read-only F5/F6 drift probe proving `binding-mismatch` reconverges, `writeCallCount:0`.
- a Chrome / native / mobile binding-request SUBMISSION proof (proposers).
- a multi-device IMPORT read-only proof.

## 6. Preserved Postures

- `binding-mismatch` remains BLOCKED (the committed F11 helper still lists it in `blockedClasses`).
- `field-mismatch:sortOrder` remains GATED.
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F26: PASS (design/readiness gate only). The future implementation change list, the proven-vs-open
  split, the readiness verdict, the hard preconditions, and the future validation requirements are
  specified. No runtime implementation; no schema minting; no `binding-mismatch` allowed-set change; no
  flip; no source change.
- implementation-readiness: PARTIALLY READY FOR SCOPED IMPLEMENTATION PLANNING (audit + spec + in-process
  proofs complete; product implementation NOT started, gated).
- `binding-mismatch` in the F11 allowed rebuild set: NOT NOW — the committed F11 helper still blocks it
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `field-mismatch:sortOrder`: REMAINS GATED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F27

F27 = a DESIGN-ONLY folder-sync lane STATUS ROLLUP v2 / consolidated readiness ledger (updating F20 with
the binding sub-lane; no runtime, no writes, no flip): consolidate the full folder-sync lane (source-of-
truth split → render-mirror rebuild F10–F13 → sortOrder ownership+absorption design/proof F14–F19 →
binding repair audit+spec+harness design/proof F21–F26), record the current posture of every drift class
(`missing-mirror-folder` and `field-mismatch:color` handled + idempotent; `field-mismatch:sortOrder`
designed + in-process-proven but gated/unimplemented; `binding-mismatch` designed + in-process-proven but
blocked/unimplemented), list exactly what remains before a `productSyncReady` flip could be reviewed, and
reaffirm `productSyncReady` false + Chat Saving CAS blocked. F27 modifies no product source and performs
no write.
