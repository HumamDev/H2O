# Sync — Operational.1 Request/Mutation Readiness Validator

Date: 2026-07-01

Status: **OPERATIONAL.1 REQUEST READINESS VALIDATOR — NOT IMPLEMENTED**

Lane: H2O Studio Sync — request/mutation readiness (single-canonical v1).

Operational.1 adds **static validation only**. It locks the Operational.0 readiness
contract and asserts the current **NOT-IMPLEMENTED** runtime state: the applied request
allowlist is still the four proven types, the two unbind types
(`chat-label-unbind`, `chat-tag-unbind`) are **planned/deferred** (not yet applied),
catalog CRUD stays deferred, the B8/B9 basis stays reserved/diagnostic-only, and
`productSyncReady` stays `false`. The unbind runtime arrives in Operational.2.

## Baseline

```text
eb338ae  docs(sync): decide single canonical authority model        (authority: single-canonical)
2aec2ec  docs(sync): close metadata envelope pre-freeze projection stack (A8)
48c5994  docs(sync): define operational request readiness            (Operational.0 contract)
```

## Validator summary

New static validator
`tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs`
(17 checks; static — no runtime, no `node:sqlite`, no DB, no module loads; implements
no request type):

- **[O.0]** the Operational.0 contract exists and is the single-canonical /
  `productSyncReady:false` / `fullBundle.v3`-not-minted contract; it names the **six**
  applied request types (4 proven + 2 unbind), requires bind/unbind **symmetry** via
  `chat-label-unbind` + `chat-tag-unbind`, reuses the **B8/B9** request/receipt pattern
  (`requestId`, idempotent, append-only, dedup), **defers** catalog CRUD + hard-delete /
  un-delete, pins the single-canonical conflict model (no multi-writer; basis
  reserved/diagnostic-only; `noop`), defines the receipt status vocabulary
  (`pending`/`applied`/`noop`/`rejected`/`superseded`), and keeps the gate honest
  (`productSyncReady` flips only after the six-type set + harness proof).
- **[RUNTIME]** the applied allowlist (`webdav-transport-gates.js` `APPLIED_TYPES`) is
  **exactly the four** proven types; the two unbind types are **not** in it (tracked as
  deferred in `library-metadata-diagnostics.js` `DEFERRED_DESTRUCTIVE_SHAPES`);
  `productSyncReady` is **false** with no `true` flip; **no** catalog-CRUD type is an
  applied request type.
- **[TARGET]** the readiness target = four proven + two unbind; catalog CRUD +
  hard-delete are **not** readiness-closed.
- **[INVARIANT]** the contract documents the future unbind apply invariants
  (idempotent `noop` / invalid → `rejected` / basis reserved+inert / canonical-order
  apply / mirrors request-only).
- **[BOUNDARY]** no WebDAV apply, no multi-writer, no `tags.updated_at` migration, no
  `fullBundle.v3` mint claimed by this slice.
- **[STATIC]** the validator loads no runtime module / DB driver.

## Operational.0 contract locked

The validator pins the Operational.0 decisions: single-canonical v1; readiness =
bind/unbind symmetry; the **six-type** applied allowlist
(`chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind`,
`chat-label-unbind`, `chat-tag-unbind`); B8/B9 request/receipt reuse; catalog CRUD +
deletion deferred; single-canonical conflict model (no multi-writer; basis
reserved/diagnostic-only; idempotent `noop`); receipt status vocabulary.

## Current implementation status

- **Applied allowlist: four proven types** — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` (frozen `APPLIED_TYPES`).
- **`chat-label-unbind` / `chat-tag-unbind`: NOT IMPLEMENTED (planned)** — absent from
  the applied allowlist; tracked as deferred destructive shapes in diagnostics. This
  slice **does not** implement them.
- **`productSyncReady`: false** — unchanged; flips only after the six-type set is
  implemented + harness-proven.
- **`fullBundle.v3`: reserved, not minted.** WebDAV apply deferred. Multi-writer
  deferred. Basis reserved/diagnostic-only (inert in v1).

## Six-type readiness target

```text
proven (applied today):   chat-category-assign · chat-category-clear · chat-label-bind · chat-tag-bind
required additions (O.2):  chat-label-unbind · chat-tag-unbind
=> readiness allowlist:    exactly six (bind/unbind symmetry across category/label/tag)
```

## Deferrals preserved

- **Catalog CRUD** (`label/tag/category-create`, rename, recolor, soft-delete,
  restore) — Desktop-managed in v1; additive-minor after v3 mint; **not** a readiness
  gate.
- **Hard-delete / un-delete** — the deletion/sync lane's domain; not readiness-closed.
- **Basis (B8/B9)** — reserved + diagnostic-only; the v1 apply must not branch on it
  (single-canonical).
- No runtime allowlist change, no `productSyncReady` flip, no `fullBundle.v3` mint, no
  WebDAV apply, no multi-writer, no `tags.updated_at` migration, no f17 drift change, no
  capability / Chrome / archive-CAS / sync-appearance-ribbon change in this slice.

## Files changed

- `tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs` (new).
- `release-evidence/2026-06-30/sync-operational-1-request-readiness-validator.md`
  (this note).

## Validation results

```text
node --check validate-sync-operational-request-readiness-v1.mjs          OK
validate-sync-operational-request-readiness-v1.mjs                       PASS 17 checks
validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs                 (run — green)
validate-sync-metadata-v3-projection-field-contract-v1.mjs               (run — green)
git diff --check / --cached --check                                      clean
```

## Recommended next step after Operational.1

Proceed to **Operational.2** — implement `chat-label-unbind` + `chat-tag-unbind`
(request/receipt + canonical apply) under single-canonical: reuse the B8/B9 pattern
(`requestId`, append-only receipt, dedup), idempotent `noop` for already-unbound,
`rejected` for invalid chat/entity, basis carried-but-inert, canonical Desktop applies
in receipt order, mirrors request-only. Then flip this validator to assert the six-type
implementation and add the deterministic unbind harness. `productSyncReady` flips only
after that harness proof. Catalog CRUD, multi-writer, `tags.updated_at`, WebDAV apply,
and `fullBundle.v3` mint remain deferred.
