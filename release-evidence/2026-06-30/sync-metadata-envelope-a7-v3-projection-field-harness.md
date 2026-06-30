# Sync Metadata Envelope A7 V3 Projection Field Harness

Status: A7 V3 PROJECTION FIELD-CONTRACT HARNESS - PRE-FREEZE PASSED

Date: 2026-06-30

## Scope

A7 implements the field-contract drift and deterministic projection harness for
the A6 future `h2o.studio.fullBundle.v3` projection contract.

A7 remains pre-freeze:

- no `h2o.studio.fullBundle.v3` runtime mint
- no metadata envelope freeze
- no `productSyncReady` flip
- no WebDAV implementation
- no identity/key runtime
- no archive package CAS transport
- no runtime schema or migration change
- no `tags.updated_at` migration

## Harness Summary

New validator:

- `tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`

The validator:

- validates required A6 contract decisions
- checks schema/store field coverage against the A6 projection contract
- builds a deterministic in-memory v3 projection sample from fixture data
- proves canonical JSON and `payloadHash` determinism
- proves required-field checks flag missing required fields
- proves reserved identity/clock/signature fields are inert and null
- proves planned major/minor policy behavior
- proves no premature v3/product/WebDAV/E2E/package-body runtime path exists

## Scanned Schema / Runtime Files

- `release-evidence/2026-06-30/sync-metadata-envelope-a6-v3-projection-field-contract.md`
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

## Sample Projection Summary

The harness builds an in-memory projection fixture with:

- categories with hierarchy through `parentId`
- labels with `color`
- tags with `autoDerived`
- folders catalog metadata
- chats metadata with `categoryId` and `isDeleted`
- label bindings
- tag bindings
- folder bindings
- minimal tombstones
- four-core `requestTypes.appliedAllowlist`
- no-delete safety flags
- `authority.canonicalRole: desktop`
- `authority.authorityEpoch: 0`
- `authority.productSyncReady: false`
- null reserved envelope fields except `producedAt` and computed `payloadHash`

The fixture is not live DB data and does not change runtime state.

## Completeness Drift Findings

The validator confirms A6 covers current projection-relevant runtime schema:

- categories: `id`, `name`, `parent_id`, `source`, `created_at`, `updated_at`, `meta_json`
- labels: `id`, `name`, `color`, `source`, `created_at`, `updated_at`, `meta_json`
- tags: `id`, `name`, `auto_derived`, `created_at`, `meta_json`
- folders: `id`, `name`, `parent_id`, `color`, `sort_order`, `source`, `created_at`, `updated_at`, `meta_json`
- chats metadata: `id`, `title`, `category_id`, `is_deleted`, `updated_at`, `meta_json`
- bindings: `label_bindings`, `tag_bindings`, `folder_bindings`
- tombstones: `sync_tombstones` exists, while A6 keeps only minimal tombstone representation

The validator also confirms the known field gap remains explicit:

- runtime `tags` has no `updated_at`
- A6 records this as unresolved
- A7 does not migrate or fix it

## Exclusion Drift Findings

A7 confirms the A6 contract and generated sample exclude:

- chat content
- snapshots
- `snapshot_turns`
- messages
- `chat.md`
- `chat.html`
- `last_snapshot_id`
- `current_leaf_id`
- `last_captured_at`
- `.h2ochat` package bodies
- asset body / asset hash references
- full cross-device tombstone lifecycle fields
- key material / secrets
- Chrome runtime state

## Canonical Hash Determinism Proof

The validator implements an internal `canonicalJson` helper with:

- sorted object keys
- entity arrays sorted by `id`
- bindings sorted by `chatId` plus entity id
- tombstones sorted by `recordKind` plus `recordId`
- deterministic UTF-8 JSON
- no insignificant whitespace

It proves:

- shuffled object keys and shuffled arrays produce the same `payloadHash`
- changing a renderable field changes `payloadHash`
- changing excluded per-transmission fields does not change `payloadHash`

Excluded per-transmission fields:

- `envelopeId`
- `producerDeviceId`
- `producedAt`
- `logicalClock`
- `signature`
- `sequenceNumber`
- `exportId`

## Required-Field Proof

The harness flags missing required fields for:

- category `id`, `name`, `parentId`, `deleted`
- label `id`, `name`, `color`, `deleted`
- tag `id`, `name`, `autoDerived`, `deleted`
- chat `id`, `categoryId`, `isDeleted`
- binding `chatId` plus entity id
- tombstone `recordKind` plus `recordId`
- `envelope.payloadHash`
- `authority.canonicalRole`
- `requestTypes.appliedAllowlist`

## Reserved-Field Inertness Proof

Reserved fields remain null in the pre-freeze sample:

- `envelopeId`
- `producerDeviceId`
- `logicalClock`
- `signature`

## Major / Minor Policy Proof

The harness proves:

- `v3.1` with an additive optional field is accepted
- unknown `v4` is rejected/quarantined
- the applied allowlist remains exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`

## No Premature Mint / Product Gate Proof

A7 confirms:

- runtime still has no emitted or consumed `h2o.studio.fullBundle.v3`
- `productSyncReady:false` remains
- WebDAV remains deferred
- identity/key runtime remains absent
- package bodies remain excluded from metadata paths

## Validation

Commands:

```sh
node --check tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs
node tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs
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

- `tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`
- `release-evidence/2026-06-30/sync-metadata-envelope-a7-v3-projection-field-harness.md`

## Recommended Next Step

Use A7 as the deterministic field-contract proof, then open the next slice to
decide the `tags.updated_at` gap and whether the future v3 projection should
freeze tag LWW semantics with `createdAt` or require a pre-freeze schema
migration.
