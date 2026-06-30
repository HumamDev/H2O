# Labels / Tags / Categories / Classification Metadata Sync

## Phase 20 Closure / Release-Gate Audit (scope lock for the three live-proven types)

Date: 2026-06-29

## Scope

Audit/gating only. This phase defines explicit end-of-iteration closure criteria, release gating, and
release-risk categories, and locks the scope to exactly three applied request types before any next
implementation phase. It does not implement product logic, add request types, change runtime
behavior, add UI, or add WebDAV/cloud/relay transport.

## Iteration Scope (locked)

The three live-proven applied request types — and only these three — are in scope for this iteration:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`

The applied-type allowlist remains exactly these three types, enforced as an exact set in
`src-surfaces-base/studio/sync/folder-sync.tauri.js` —
`APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS` with `'chat-category-assign': true`,
`'chat-category-clear': true`, `'chat-label-bind': true`, gated by
`APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true`. No fourth applied type exists.

## Context

- Phase 19 readiness audit committed: `d32be86`
  (`release-evidence/2026-06-25/labels-tags-categories-phase19-readiness-audit.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase19-readiness-audit.mjs`).
- Phase 19 verified the safe metadata request loop for exactly three applied types and kept broader
  product metadata sync globally NOT READY.

## 1. Closure Criteria for This Iteration

This iteration is considered CLOSED (ready-for-review) when all of the following hold — all currently
satisfied:

- The applied-type allowlist is exactly the three types above (no broader applied type).
- Each applied type has request export, Desktop validate/apply, receipt, Chrome receipt
  import/resolution, canonical export, projection refresh, and the read-only status surface, proven by
  a validator.
- Each applied type has a live runtime proof (Phase 14G/14H for the category loop, Phase 18 for the
  label-bind loop).
- All boundary invariants hold and are enforced in real source (Phase 19 audit, commit `d32be86`).
- No destructive metadata action is reachable; all no-delete flags remain `true`.
- Product metadata sync remains globally NOT READY (intentional; the iteration ships a safe subset
  only).
- The full prior-validator suite is green (Phase 19 `--run-suite` gate; Phase 11 `--run-suite` gate).

## 2. "Ready for Review" Definition (the three live-proven types)

A request type is "ready for review" only when ALL of:

- It is on the exact applied allowlist and reachable through the apply gate.
- It is non-destructive (or, for assign, a pure reassignment): it never deletes a chat, snapshot,
  asset, label, tag, category, folder, or metadata row.
- Its Desktop apply maps to an explicit Desktop-authoritative store path:
  `categories.assignChat` / `categories.clearChat` / `labels.bindChat`.
- It has a request+apply+receipt validator and a live runtime proof.
- Chrome stays request-only and read-only over canonical metadata for it (no Chrome canonical
  mutation).

All three types meet this bar → safe-for-review.

## 3. What Is Still Blocked Before Broader Product Metadata Sync Is Ready

Broader product metadata sync cannot be called ready until every one of these is designed,
implemented, validated, and live-proven under the same boundary invariants:

- label clear/remove/unbind
- tag bind/clear/remove/unbind
- label/tag/category catalog create/rename/delete
- classification expansion (`classification-set`)
- a reviewed policy for any destructive-shaped action (currently all blocked/deferred)
- WebDAV/cloud/relay transport (currently a deferred architecture memo only)

Until then, product metadata sync stays globally NOT READY.

## 4. No New Unsafe Request Types Enabled

Confirmed: the applied allowlist contains exactly the three safe types and nothing else. Known but
non-applied actions (`label-create`, `tag-create`, `category-create`, renames, `chat-tag-bind`,
`classification-set`) remain deferred — they are recognized by the request-spec table but are not in
`APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS`, so the Desktop apply gate defers them. The
exact-match `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])` carve-out has not
been widened; every other `*-clear`/`*-delete`/`unbind`/`purge`/`hard-delete` stays blocked by the
destructive guard.

## 5. Applied Allowlist Confirmation

Exactly:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`

## 6. Deferred Surface (remains blocked)

- label clear/remove/unbind
- tag bind/clear/remove/unbind
- label/tag/category catalog create/rename/delete
- classification expansion
- destructive actions
- WebDAV/cloud/relay transport

## 7. Implementation-Entry Gate (before adding ANY new request type)

A future implementation phase must NOT begin enabling a new applied request type until all three
gates are satisfied, in order:

### Gate A — Design evidence

- A design-only evidence doc exists for the new type that: names the exact canonical action; defines
  the request schema/payload/idempotency/basis handling; defines the Desktop validate + apply contract
  and the exact non-destructive Desktop-authoritative store path; enumerates the receipt taxonomy
  (applied / skipped_duplicate / stale_basis / rejected / deferred / invalid); and proves it is
  non-destructive (adds/sets only, never deletes).

### Gate B — Validators exist

- A request+apply+receipt validator for the new type, plus a guard test proving the exact-match
  carve-out (if any) does not unblock any other `*-clear`/`*-delete`/`unbind` action; and the prior
  readiness validator updated to expect the new applied type once implemented.

### Gate C — Live proof captured

- An end-to-end live/in-process runtime proof for the new type (request → apply → receipt →
  resolution → canonical export change → projection refresh), including replay idempotency, before the
  type is moved from deferred to applied in the status surface and the readiness audit.

No new type is "ready" until Gate C is green and the boundary invariants still hold.

## 8. Release-Risk Categories

- **safe-for-review**: `chat-category-assign`, `chat-category-clear`, `chat-label-bind` — implemented,
  validated, live-proven, non-destructive, behind the exact allowlist.
- **internal-only**: the read-only `libraryMetadataSyncStatus` diagnostics/status surface and the
  in-process runtime proofs — useful for review/inspection, not a shipped end-user mutation workflow.
- **blocked**: any destructive-shaped action (delete/remove/unbind/clear other than the exact
  `chat-category-clear` carve-out, purge, hard-delete) — guarded and unreachable.
- **deferred**: label clear/remove/unbind, tag bind/clear/remove/unbind, catalog create/rename/delete,
  classification expansion, WebDAV/cloud/relay transport, broader product metadata sync closeout —
  out of scope until they pass the implementation-entry gate.

## 9. Product Metadata Sync Verdict

Product metadata sync remains globally NOT READY. Only the three applied types are runtime-proven and
applied; the deferred surface above is out of scope for this iteration.

## 10. Recommended Next Phase

Recommend **Phase 21 design-only audit for `chat-tag-bind`** (the natural next safe, non-destructive
type — a mirror of `chat-label-bind` that adds a chat↔tag binding only via a non-destructive
`tags.bindChat` insert, with no tag-catalog mutation). It is the lowest-risk next step and satisfies
Gate A without enabling anything. A stabilization pass is not required: the suite is green and the
scope is locked. If, however, live-CDP capture against real Chrome + Desktop surfaces is desired
before expanding scope, do that first as an evidence-only step. Either way, do not enable a fourth
applied type until Gates A–C are satisfied.

## Closure Verdict

Iteration closure: READY FOR REVIEW for the three live-proven applied types, with explicit gates,
locked scope, and product metadata sync globally NOT READY. No new unsafe type is enabled; the
deferred surface remains blocked.
