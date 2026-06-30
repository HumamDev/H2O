# OPERATIONAL.2 LABEL/TAG UNBIND IMPLEMENTATION - IMPLEMENTED

## Scope

Operational.2 implements the two missing single-canonical request types required by Operational.0/Operational.1:

- `chat-label-unbind`
- `chat-tag-unbind`

This is runtime implementation plus static validation/evidence. Runtime harness proof remains deferred to Operational.3.

## Implementation Summary

The request/receipt/apply path now recognizes and applies the six-request Operational readiness set:

1. `chat-category-assign`
2. `chat-category-clear`
3. `chat-label-bind`
4. `chat-tag-bind`
5. `chat-label-unbind`
6. `chat-tag-unbind`

Desktop canonical apply remains in `src-surfaces-base/studio/sync/folder-sync.tauri.js`.

The Chrome/mirror request-only shapers in:

- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`

now accept `chat-label-unbind` and `chat-tag-unbind` as request-only metadata operations. Chrome remains non-authoritative and does not mutate canonical metadata.

## APPLIED_TYPES Change

The applied metadata request set grows from four to six.

The WebDAV dry-run gate report in `src-surfaces-base/studio/sync/webdav-transport-gates.js` reports the same six applied request types while keeping WebDAV disabled/deferred and `productSyncReady:false`.

## Canonical Apply Behavior

### `chat-label-unbind`

- validates chat exists
- validates label exists
- checks whether the `label_bindings(chat_id, label_id)` row exists
- if present, removes only that binding row via `H2O.Studio.store.labels.unbindChat(labelId, chatId)`
- if already absent, returns `noop` with `library-metadata-mutation-request-already-unbound-canonical`
- never deletes the label entity
- never mutates catalog tables

### `chat-tag-unbind`

- validates chat exists
- validates tag exists
- checks whether the `tag_bindings(chat_id, tag_id)` row exists
- if present, removes only that binding row via `H2O.Studio.store.tags.unbindChat(tagId, chatId)`
- if already absent, returns `noop` with `library-metadata-mutation-request-already-unbound-canonical`
- never deletes the tag entity
- never mutates catalog tables

## Receipt / Status Behavior

Operational.2 uses the existing append-only request/receipt pattern:

- request id required
- validated before apply
- idempotent canonical apply
- duplicate/current-state detection
- append-only receipt creation

Receipt statuses now include:

- `applied`
- `noop`
- `rejected`
- existing `skipped_duplicate` for already-bound / already-cleared cases
- `deferred` where Desktop store support is unavailable

Already-unbound unbind requests return `noop`, not conflict.

## Basis Behavior

Basis remains reserved/diagnostic-only under v1 single-canonical authority.

Operational.2 does not reject or defer solely because `expectedCurrentBasisHash` is missing or mismatched. Canonical Desktop applies request/receipt order; mirrors reconcile from receipts plus the canonical projection.

## Diagnostics

`chat-label-unbind` and `chat-tag-unbind` are no longer classified as deferred destructive shapes.

Catalog CRUD and destructive metadata lifecycle operations remain deferred.

## Boundaries Preserved

- `productSyncReady` remains `false`
- `fullBundle.v3` is not minted
- WebDAV apply is not implemented
- multi-writer is not implemented
- catalog CRUD is not implemented
- hard-delete / un-delete is not implemented
- tags.updated_at migration is not touched
- f17 migration drift is not touched
- capabilities are unchanged
- Chrome runtime remains request-only / non-authoritative
- archive package CAS is untouched

## Files Changed

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/webdav-transport-gates.js`
- `src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs`
- `tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs`
- `tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`
- `tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs`
- `release-evidence/2026-06-30/sync-operational-2-label-tag-unbind-implementation.md`

## Validation Results

Validation executed for Operational.2:

- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/webdav-transport-gates.js`
- `node --check src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `node --check tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs`
- `node tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs`
- `git diff --check`
- `git diff --cached --check`
- `git diff --cached --name-only`

## Runtime Harness

Full deterministic bind/unbind runtime harness proof is deferred to Operational.3.

Operational.3 should prove:

- label bind then unbind removes only the `label_bindings` row
- tag bind then unbind removes only the `tag_bindings` row
- already-unbound returns `noop` with zero writes
- invalid chat/entity returns `rejected` with zero writes
- catalog tables remain untouched
- canonical projection and payload hash reflect the removed binding
