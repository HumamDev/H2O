# Folder Sync — Phase F28: Combined Product-Runtime Implementation Sequencing Plan (design-only)

Date: 2026-07-01

## Status

DESIGN / SEQUENCING PLAN ONLY. Nothing was implemented. No schema was minted. No F11 allowed/blocked set
was changed. No `productSyncReady` flip happened. No product SQLite write, no product mirror write, no
tombstone write, no bind/unbind/move in product runtime, no folder delete/purge, no chat content touched.
No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat Saving / archive package code was
touched. No product source was modified. This slice specifies the exact ordered, individually-gated
implementation steps (each step = its own future phase with its own proof gate) that would take sortOrder
+ binding from "design + in-process-proven" to a reviewable `productSyncReady` flip. It is a plan, not an
implementation.

Naming note: all F28 artifacts use the `folder-sync-f28-*` prefix to avoid collision with any other lane.

## Context

- F27 lane status readiness ledger v2 committed: `8af5bea` (consolidated F8–F26; overall readiness NOT
  READY).
- F20 ledger v1: `aa4958e`. F9 readiness gate: `157d66a`. F8 parity proof: `0f03357`.
- sortOrder sub-lane design + in-process-proven (F14–F19); binding sub-lane design + in-process-proven
  (F21–F26). Both product runtimes unimplemented and gated/blocked.
- Proposed schemas design-only, NOT minted: `h2o.studio.folder-sortorder-reorder-request.v1`,
  `h2o.studio.folder-sortorder-reorder-receipt.v1`, `h2o.studio.chat-folder-binding-receipt.v1`. Real
  request schema present: `h2o.studio.chat-folder-binding-request.v1`.
- F11 still blocks `field-mismatch:sortOrder` + `binding-mismatch`. `productSyncReady` false;
  public/premium blocked; real remote WebDAV deferred; `fullBundle.v3` not minted; Chat Saving
  WebDAV/cloud/archive CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F28)

The plan preserves future parity across Desktop Studio, Chrome / native extension Studio across MULTIPLE
DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface render projection,
hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving CAS are NOT
implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## Required Invariants (every step must preserve)

- Desktop SQLite remains CANONICAL.
- Chrome / native / mobile remain NON-CANONICAL PROPOSERS.
- one-folder-per-chat preserved (`folder_bindings.PRIMARY KEY (chat_id)`).
- no chat delete.
- no folder delete / purge.
- no tombstone mutation unless a separately scoped phase authorizes it.
- no Chrome / native / mobile canonical mutation.
- mirror remains a DERIVED PROJECTION (never an independent authority).
- request/receipt payloads remain REDACTED / HASH-ONLY.
- WebDAV / cloud remains TRANSPORT-ONLY until separately proven.
- Chat Saving CAS remains BLOCKED.

## Ordered, Individually-Gated Implementation Steps

Each step is a future phase with its own entry criteria, exit criteria, required validators/proofs,
preserved invariants, and explicit blocked boundaries. No step is executed in F28.

### S1 — sortOrder schema mint + source validator
- entry criteria: F14–F19 committed; F28 plan approved.
- exit criteria: `folder-sortorder-reorder-request.v1` + `...receipt.v1` minted in source; a source
  validator asserts they are well-formed and wired.
- validators/proofs: sortOrder receipt/request source validator.
- invariants preserved: mirror derived; redacted/hash-only; Desktop canonical.
- blocked boundaries: no handler yet; `field-mismatch:sortOrder` stays gated in F11; no flip.

### S2 — sortOrder Desktop validate/apply/receipt handler + handler validator
- entry criteria: S1 done.
- exit criteria: Desktop handler validates a reorder request, applies to canonical `sort_order`, emits a
  receipt; a handler validator covers validate/apply/receipt/idempotency/redaction.
- validators/proofs: sortOrder handler validator; retained F16/F17/F18 harnesses stay green.
- invariants preserved: Desktop canonical; no chat/folder delete; redacted.
- blocked boundaries: no live write yet; `field-mismatch:sortOrder` stays gated; no flip.

### S3 — sortOrder live Desktop dry-run proof
- entry criteria: S2 done.
- exit criteria: a live Desktop dry-run (no write) proof captured; `writeCallCount:0`.
- validators/proofs: live dry-run evidence + validator.
- invariants preserved: no write; Desktop canonical; redacted.
- blocked boundaries: no apply; no flip.

### S4 — sortOrder live controlled apply + post-apply drift probe
- entry criteria: S3 done.
- exit criteria: a single gated live apply writes only `sort_order`; a post-apply read-only F5/F6 drift
  probe shows `field-mismatch:sortOrder` reconverges, `writeCallCount:0` on the probe.
- validators/proofs: controlled apply evidence + post-apply drift probe.
- invariants preserved: canonical write bounded to `sort_order`; mirror re-projected; no chat/folder
  delete.
- blocked boundaries: not yet in the F11 allowed set; no flip.

### S5 — add `field-mismatch:sortOrder` to the F11 allowed set behind the absorption gate
- entry criteria: S4 done; no-lost-folder-order invariant enforced.
- exit criteria: F11 allows `field-mismatch:sortOrder` render-only rebuild ONLY behind the absorption
  gate; the F11 validator updated to reflect the gated allowance; never while a native reorder is pending
  absorption.
- validators/proofs: updated F11 validator; sustained parity re-probe.
- invariants preserved: mirror derived; Desktop canonical; render-only.
- blocked boundaries: `binding-mismatch` still blocked; no flip.

### S6 — binding receipt schema mint + source validator
- entry criteria: S5 done.
- exit criteria: `chat-folder-binding-receipt.v1` minted in source (request schema already present); a
  source validator asserts it is well-formed and wired.
- validators/proofs: binding receipt source validator.
- invariants preserved: redacted/hash-only; Desktop canonical.
- blocked boundaries: no handler yet; `binding-mismatch` stays blocked; no flip.

### S7 — binding Desktop validate/apply/receipt handler + handler validator
- entry criteria: S6 done.
- exit criteria: Desktop handler validates a binding request, applies bind/unbind/move to canonical
  `folder_bindings` (one-folder-per-chat), emits a receipt; a handler validator covers
  validate/apply/receipt/idempotency/redaction/one-folder-per-chat.
- validators/proofs: binding handler validator; retained F23/F24/F25 harnesses stay green.
- invariants preserved: one-folder-per-chat; no chat/folder delete; Desktop canonical.
- blocked boundaries: no live write yet; `binding-mismatch` stays blocked; no flip.

### S8 — binding live Desktop dry-run proof
- entry criteria: S7 done.
- exit criteria: a live Desktop dry-run (no write) proof captured; `writeCallCount:0`.
- validators/proofs: binding live dry-run evidence + validator.
- invariants preserved: no write; Desktop canonical; redacted.
- blocked boundaries: no apply; no flip.

### S9 — binding live controlled apply + post-apply drift probe
- entry criteria: S8 done.
- exit criteria: a single gated live apply writes only `folder_bindings`; a post-apply read-only F5/F6
  drift probe shows `binding-mismatch` reconverges, `writeCallCount:0`; no chat lost.
- validators/proofs: controlled apply evidence + post-apply drift probe.
- invariants preserved: one-folder-per-chat; canonical write bounded to `folder_bindings`; no chat/folder
  delete.
- blocked boundaries: not yet in the reviewed repair path; no flip.

### S10 — move `binding-mismatch` into the reviewed repair path
- entry criteria: S9 done.
- exit criteria: `binding-mismatch` handled ONLY via the reviewed request→apply→receipt repair path
  (never ad-hoc mirror-only repair); the F11 validator updated to reflect the reviewed-repair allowance.
- validators/proofs: updated F11 validator; sustained parity re-probe.
- invariants preserved: mirror derived; Desktop canonical; one-folder-per-chat.
- blocked boundaries: no flip until multi-surface proofs land.

### S11 — Chrome/native/mobile request submission proofs
- entry criteria: S5 + S10 done.
- exit criteria: proposers (Chrome / native / mobile) submit sortOrder + binding requests that Desktop
  absorbs; proposers never write canonical.
- validators/proofs: submission proofs per surface.
- invariants preserved: non-canonical proposers; redacted; Desktop canonical.
- blocked boundaries: no flip.

### S12 — multi-device import/read-only proofs
- entry criteria: S11 done.
- exit criteria: a second device imports the projection + receipts read-only, no canonical mutation.
- validators/proofs: multi-device import read-only proof.
- invariants preserved: read-only import; Desktop canonical.
- blocked boundaries: no flip.

### S13 — sustained multi-surface parity proof
- entry criteria: S12 done.
- exit criteria: sustained parity across Desktop + Chrome/native (multi-device) with drift
  auto-reconciled over re-runs (not a single snapshot).
- validators/proofs: sustained parity proof.
- invariants preserved: all of the above.
- blocked boundaries: no flip until S14.

### S14 — final productSyncReady flip review
- entry criteria: S1–S13 done; all invariants held; explicit maintainer approval.
- exit criteria: `productSyncReady` flip REVIEWED (the flip itself remains a separate maintainer
  decision).
- validators/proofs: the flip-gate validator + the full retained ladder.
- invariants preserved: all of the above.
- blocked boundaries: Chat Saving WebDAV/cloud/archive CAS remains a SEPARATE later track, still blocked;
  real remote WebDAV remains transport-only until separately proven.

## Plan-Only Declaration

F28 is a PLAN ONLY. Nothing in S1–S14 is implemented. No schema is minted. No F11 allowed/blocked set is
changed. No `productSyncReady` flip happens. Each step is a future, individually-gated phase.

## Preserved Postures

- `binding-mismatch` remains BLOCKED. `field-mismatch:sortOrder` remains GATED.
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F28: PASS (design/sequencing plan only). The ordered, individually-gated steps S1–S14 (schema mints,
  Desktop handlers, live dry-run + controlled apply proofs, F11 allowed/blocked-set changes behind gates,
  Chrome/native/mobile submission, multi-device import, sustained parity, final flip review), each with
  entry/exit criteria, required validators/proofs, and preserved invariants, are specified. Nothing
  implemented; no schema minted; no F11 set change; no flip; no source change.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F29

F29 = a DESIGN-ONLY S1 pre-flight gate — the entry gate for the FIRST implementation step (sortOrder
schema mint + source validator): specify the exact schema shape to be minted, the source-validator
assertions that must accompany the mint, the retained harness/validator set that must stay green, and the
entry/exit criteria + rollback for S1 — WITHOUT minting anything. Keep `binding-mismatch` blocked,
`field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving CAS blocked. F29 modifies no
product source and performs no write.
