# Sync Metadata Envelope A5 Projection Closure Validator

Status: A5 METADATA PROJECTION CLOSURE VALIDATOR - PRE-FREEZE PASSED

Date: 2026-06-30

## Scope

A5 implements the projection schema completeness and drift guard scaffold described by A4.

A5 remains pre-freeze:

- no `h2o.studio.fullBundle.v3` mint
- no `productSyncReady` flip
- no WebDAV implementation
- no identity/key/E2E runtime
- no archive package CAS transport
- no runtime schema or migration change

## Validator Summary

New validator:

- `tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs`

The validator checks:

- A4 projection closure plan exists and contains required pre-freeze decisions
- current schema/store sources expose projection-relevant catalog and binding fields
- A4 projection checklist covers current renderable catalog/binding surfaces
- the four applied request-core types remain locked
- deferred request types remain deferred from product readiness
- no premature `fullBundle.v3`, `productSyncReady:true`, WebDAV product transport, identity/key runtime, or archive package body transport appears

## Scanned Files

- `release-evidence/2026-06-30/sync-metadata-envelope-a4-projection-closure-plan.md`
- `apps/studio/desktop/src-tauri/src/lib.rs`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/webdav-relay.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`
- `src-surfaces-base/studio/store/labels.tauri.js`
- `src-surfaces-base/studio/store/tags.tauri.js`
- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/store/tombstones.tauri.js`

## Projection Completeness Findings

The guard confirms current schema/store sources expose the surfaces A4 requires before a future projection freeze:

- `categories`: `id`, `name`, `parent_id`, `source`, timestamps, `meta_json`
- `labels`: `id`, `name`, `color`, `source`, timestamps, `meta_json`
- `tags`: `id`, `name`, `auto_derived`, `created_at`, `meta_json`
- `folders`: catalog fields including `id`, `name`, `parent_id`, `color`, `sort_order`, `source`, timestamps, `meta_json`
- bindings: `folder_bindings`, `label_bindings`, `tag_bindings`, and `chats.category_id`
- tombstone/delete representation: `chats.is_deleted` and `sync_tombstones`

## Drift Guard Findings

A5 compares the runtime schema/store fields against the A4 projection closure checklist.

Findings:

- no missing A4 coverage for category `parent_id`
- no missing A4 coverage for label `color`
- no missing A4 coverage for tag `auto_derived`
- folder catalog coverage is represented as a grouped catalog surface in A4
- all current binding kinds are included in the A4 closure checklist
- soft-delete/tombstone and unbind state are explicitly represented as required future projection surfaces

## Request Core Guard

The applied request-core allowlist remains exactly:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

Deferred surfaces remain deferred:

- `chat-label-unbind`
- `chat-tag-unbind`
- catalog CRUD request types
- broader mutation/product readiness work

These can land later as additive-minor request extensions. They are not treated as already closed in A5.

## Pre-Freeze Boundary

A5 confirms:

- no `h2o.studio.fullBundle.v3` runtime emission or consumption
- `productSyncReady:false` remains in the metadata wire path
- WebDAV remains deferred
- identity/key/E2E runtime remains absent
- archive package bodies remain excluded from metadata envelopes

## Validation

Commands:

```sh
node --check tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs
node tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs
node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs
node tools/validation/studio/validate-sync-identity-key-e2e-boundary-v1.mjs
git diff --check
git diff --cached --check
git diff --cached --name-only
```

Result:

- passed

## Files Changed

- `tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs`
- `release-evidence/2026-06-30/sync-metadata-envelope-a5-projection-closure-validator.md`

## Recommended Next Step

Use A5 as the static projection guard baseline, then create a follow-up projection closure harness or contract slice that decides whether grouped folder catalog coverage should be expanded into an explicit field-level v3 projection contract before any future v3 mint.
