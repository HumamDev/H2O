# OPERATIONAL.3 LABEL/TAG UNBIND HARNESS - PASSED

## Summary

Operational.3 adds a deterministic, in-memory SQLite harness for the six-type
single-canonical binding request set, focused on the two Operational.2 unbind
types:

- `chat-label-unbind`
- `chat-tag-unbind`

The harness is:

- deterministic fixture data only
- temp/in-memory DB only
- append-only receipt modeled
- request-id dedupe modeled
- no live Desktop DB access
- no runtime transport execution
- no WebDAV apply
- no `fullBundle.v3` mint
- no `productSyncReady` flip

## Cases Covered

The harness proves bind/unbind symmetry:

- label bind creates or confirms a `label_bindings` row
- label unbind removes that exact row
- tag bind creates or confirms a `tag_bindings` row
- tag unbind removes that exact row
- post-unbind projection no longer lists the removed label/tag binding

## DB Delta Proof

For present bindings:

- label unbind deletes exactly one `label_bindings` row
- tag unbind deletes exactly one `tag_bindings` row
- chat rows are not deleted
- label/tag catalog entities are not deleted
- category/folder/label/tag catalog signatures remain unchanged

For bind requests:

- label bind inserts exactly one `label_bindings` row when absent
- tag bind inserts exactly one `tag_bindings` row when absent

## Noop / Dedupe Proof

The harness proves:

- already-unbound label returns `noop`
- already-unbound tag returns `noop`
- noop returns zero writes
- repeated `requestId` returns the existing receipt as a deduped result
- repeated `requestId` performs zero writes and does not append another receipt

## Rejection Proof

The harness proves zero-write rejection for:

- missing chat on label request
- missing label
- missing chat on tag request
- missing tag

All rejection cases preserve binding counts and catalog signatures.

## Ordering Proof

The harness proves canonical receipt-order behavior:

1. `chat-label-bind`
2. `chat-label-unbind`
3. `chat-label-bind`

The final state is bound because the last canonical request wins. No
multi-writer conflict path is invoked.

## Basis Behavior

Requests may carry `expectedCurrentBasisHash`, but under v1 single-canonical
authority it remains diagnostic and inert:

- stale/mismatched basis is observed
- stale/mismatched basis is not rejected
- apply order is determined by the canonical receipt path

## Projection / Hash Parity

The harness builds a deterministic metadata projection over:

- category catalog
- label catalog
- tag catalog
- folder catalog
- chat metadata
- label bindings
- tag bindings
- folder bindings

It proves:

- unbind changes the projection hash when a binding is removed
- the same logical post-unbind state hashes identically across fresh fixture DBs
- removed bindings do not remain in the projected binding arrays

## Boundaries Preserved

Operational.3 preserves:

- catalog CRUD remains deferred
- hard-delete/un-delete remains deferred
- `productSyncReady` remains `false`
- `fullBundle.v3` is not minted
- WebDAV apply remains absent
- multi-writer / lease / election remains absent
- `tags.updated_at` migration remains deferred
- Chrome remains request-only
- archive package CAS remains untouched

## Files Changed

- `tools/validation/studio/validate-sync-operational-label-tag-unbind-harness-v1.mjs`
- `tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs`
- `release-evidence/2026-06-30/sync-operational-3-label-tag-unbind-harness.md`

## Validation Results

Executed:

- `node --check tools/validation/studio/validate-sync-operational-label-tag-unbind-harness-v1.mjs` — passed
- `node --check tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-operational-label-tag-unbind-harness-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs` — passed
- `node tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-identity-key-e2e-boundary-v1.mjs` — passed
- `node tools/validation/sync/validate-labels-tags-categories-phase40-final-readiness-closeout.mjs` — passed
- `git diff --check` — passed
- `git diff --cached --check` — passed
- `git diff --cached --name-only` — confirmed only Operational.3 paths were staged
