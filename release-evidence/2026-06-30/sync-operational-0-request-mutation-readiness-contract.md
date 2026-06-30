# OPERATIONAL.0 READINESS — single-canonical; productSyncReady:false; v3 not minted

## Scope and status

This contract defines operational request/mutation readiness in **sync phase Operational.0** under the current v1 single-canonical model.

- Single-canonical authority basis: `docs/sync-authority-model-decision.md`
- Existing projection pre-freeze baseline: `release-evidence/2026-06-30/sync-metadata-envelope-a8-pre-freeze-projection-stack-closure.md`
- Current canonical decision baseline: `eb338aef8b45186bd58271cb0a979e02979af6c5` (single-canonical)
- Current status remains pre-freeze: `productSyncReady: false`, `fullBundle.v3` not minted, WebDAV deferred.

## Must-have readiness set for Operational.0

Operational.0 requires request/mutation readiness for bind/unbind symmetry across label/tag and category bindings.

### Proven symmetry baseline

- `chat-category-assign` and `chat-category-clear` are already symmetric.

### Required additions before Operational.0 completion

- `chat-label-unbind`
- `chat-tag-unbind`

The applied allowlist required by this slice is:

1. `chat-category-assign`
2. `chat-category-clear`
3. `chat-label-bind`
4. `chat-tag-bind`
5. `chat-label-unbind`
6. `chat-tag-unbind`

### Rationale

- Category already has symmetric assign/clear behavior and can represent set/clear state transitions.
- Labels and tags are many-to-many and currently do not have explicit unbind operations; mirror request symmetry is incomplete without these two unbind request types.
- Operational.0 readiness is centered on request/mutation coherence for these six types.

## Request/receipt pattern requirement

The new unbind request types must reuse the existing B8/B9 request/receipt model:

- request carries `requestId`
- idempotent apply semantics
- append-only request receipt
- validate before apply
- deduplicate by `requestId`

No new wire shape is introduced in this phase unless strictly required by this symmetry extension.

## Deferred request types (not blocker for Operational.0)

The following catalog request families remain deferred and are explicitly not required for `productSyncReady` in Operational.0:

- `label-create`
- `tag-create`
- `category-create`
- label/tag/category rename
- recolor
- catalog soft-delete
- catalog restore/reversal
- hard-delete / un-delete

Reasoning:

- In v1, canonical Desktop already owns catalog authority.
- Non-canonical surfaces are request-only mirrors that can bind/unbind against pre-existing catalog entities.
- Catalog CRUD requestability is additive product UX and belongs to later phases.
- Deletion and un-delete belongs to deletion/sync lane decisions, not this readiness gate.

## Single-canonical conflict model for this phase

- One canonical Desktop applies request/receipt changes in canonical order.
- No multi-writer merge semantics in v1.
- No conflict basis enforcement is required for v1.
- Any basis field carried in B8/B9 docs remains **reserved + diagnostic-only**.
- Already-satisfied operations return `noop`/`already-satisfied`, not conflict.
- Mirror request-only surfaces reconcile against canonical projection + receipts.

## Receipt status vocabulary

Operational.0 uses the same status shape as proven request/receipt flow:

- `pending`
- `applied`
- `noop` / `already-satisfied`
- `rejected` with reason
- optional `superseded`

## Static validator plan (future)

A future validator should assert:

- applied allowlist is exactly six
- no catalog-CRUD request types are treated as already-closed in readiness checks
- unbind request shape reuses B8/B9 pattern and receipt behavior
- basis field remains reserved/inert in v1
- Chrome and second Desktop remain request-only under v1
- `productSyncReady` remains false until harness proof for all six
- no `fullBundle.v3` mint
- no WebDAV apply semantics
- no multi-writer merge semantics

## Deterministic harness plan (future)

Future deterministic/proof harness should include:

- bind then unbind removes `label_bindings` row
- bind then unbind removes `tag_bindings` row
- projection no longer lists removed binding
- unbind on already-unbound returns `noop` with zero writes
- bind already-bound returns `noop`
- invalid chat/entity returns `rejected` with zero write
- ordering/receipt ordering determines resulting mirror state
- catalog tables remain untouched by bind/unbind request handling
- projection parity and stable `payloadHash` behavior is preserved across unbind operations

## productSyncReady gate for v1

`productSyncReady` flips only after:

1. the six-type set is implemented
2. deterministic harness proof for symmetry and request/receipt behavior
3. v1-only single-canonical conflict model remains respected

Catalog CRUD remains intentionally deferred and is **not** a gating criterion for this first readiness gate.

## Boundaries and deferrals

- Docs/evidence only; no runtime or schema changes in this phase.
- Do not implement `chat-label-unbind` / `chat-tag-unbind` runtime behavior yet.
- Do not change runtime allowlists.
- Do not modify validators.
- Do not flip `productSyncReady`.
- Do not mint `fullBundle.v3`.
- Do not freeze metadata envelope.
- Do not implement WebDAV apply.
- Do not implement multi-writer.
- Do not touch tags.updated_at migration.
- Do not touch f17 migration drift.
- Do not touch capabilities.
- Do not modify Chrome runtime/service-worker.
- Do not touch archive package CAS lane.
- Do not touch staged phase files not requested here.
