# Sync Metadata Envelope A6 V3 Projection Field Contract

Status: A6 V3 PROJECTION FIELD CONTRACT — pre-freeze; v3 reserved not minted; productSyncReady:false

Date: 2026-06-30

## Scope

A6 defines the field-level contract for the future `h2o.studio.fullBundle.v3`
metadata projection.

A6 remains pre-freeze. It does not mint `h2o.studio.fullBundle.v3`, flip
`productSyncReady`, implement WebDAV, implement identity/key runtime, change the
applied request allowlist, or mutate runtime schema/migrations.

## Investigation Summary

A2 established the pre-freeze major/minor policy. A4 separated projection
closure from operational product readiness. A5 confirmed the current schema and
store projection surfaces for categories, labels, tags, folders, bindings,
chat category state, and tombstones.

A6 turns that plan into a concrete future v3 field contract.

## Top-Level Future V3 Blocks

Future `h2o.studio.fullBundle.v3` should contain six top-level blocks.

### `version`

- `schema`: `h2o.studio.fullBundle.v3`
- `schemaVersion`: `3`
- `minorVersion`: `0`
- `exportId`
- `sequenceNumber`
- `sourcePeer`

### `safety`

- `noHardDelete`
- `noPurge`
- `noChatDelete`
- `noSnapshotDelete`
- `noAssetDelete`

### `envelope`

- `envelopeId`: `null`
- `producerDeviceId`: `null`
- `logicalClock`: `null`
- `producedAt`
- `payloadHash`
- `signature`: `null`

### `authority`

- `canonicalRole`: `desktop`
- `authorityEpoch`: `0`
- `productSyncReady`: `false`

### `projection`

- `categories`
- `labels`
- `tags`
- `folders`
- `chats`
- `bindings`
- `tombstones`

### `requestTypes`

- `registryVersion`: `1`
- `appliedAllowlist`:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`

## Projection Field Contract

### `projection.categories[]`

- `id`: required
- `name`: required
- `parentId`: required, nullable
- `updatedAt`: required
- `source`: optional
- `createdAt`: optional
- `deleted`: required, default `false`
- `meta`: optional

### `projection.labels[]`

- `id`: required
- `name`: required
- `color`: required, nullable
- `updatedAt`: required
- `source`: optional
- `createdAt`: optional
- `deleted`: required, default `false`
- `meta`: optional

### `projection.tags[]`

- `id`: required
- `name`: required
- `autoDerived`: required, default `false`
- `createdAt`: optional
- `updatedAt`: optional or absent
- `deleted`: required, default `false`
- `meta`: optional

Known field-level gap: the runtime `tags` table has no `updated_at` column.
A6 does not fix or migrate this gap.

Before freeze, a later decision must choose one of:

- add a `tags.updated_at` migration before v3 mint
- freeze `tags` with `createdAt` as a weaker LWW basis

### `projection.folders[]`

- `id`: required
- `name`: required
- `color`: optional
- `parentId`: optional if hierarchical
- `updatedAt`: required
- `deleted`: required, default `false`
- `meta`: optional

### `projection.chats[]`

Metadata projection only:

- `id`: required
- `title`: optional
- `categoryId`: required, nullable
- `isDeleted`: required, default `false`
- `updatedAt`: required
- `meta`: optional metadata subset only

### `projection.bindings`

`labelBindings[]`:

- `chatId`: required
- `labelId`: required
- `assignedAt`: optional

`tagBindings[]`:

- `chatId`: required
- `tagId`: required
- `assignedAt`: optional

`folderBindings[]`:

- `chatId`: required
- `folderId`: required
- `assignedAt`: optional
- `order`: optional

Category assignment is represented through `projection.chats[].categoryId`.
There is no `categoryBindings` table in this contract.

### `projection.tombstones[]`

Minimal deletion representation only:

- `recordKind`: required
- `recordId`: required
- `deletedAt`: optional
- `restoredAt`: optional

Full cross-device tombstone lifecycle fields remain excluded from v3 projection
metadata until the Sync Architecture deletion lane owns that authority.

## Required Fields

Required in v3:

- `version`
- `safety`
- `envelope.payloadHash`
- `authority.canonicalRole`
- `requestTypes.appliedAllowlist`
- entity ids
- entity names where the entity has a name
- binding ids
- `tombstones[].recordKind`
- `tombstones[].recordId`
- inline `deleted` / `isDeleted` flags
- `updatedAt` where runtime has it

## Optional / Additive Fields

Optional or additive-minor fields:

- `source`
- `createdAt`
- `assignedAt`
- `meta`
- `title`
- reserved envelope identity/signature fields
- future minor additive fields

Unknown additive minor fields are tolerated under the A2 policy. Unknown major
versions are rejected or quarantined.

## Explicit Exclusions

Never include in v3 metadata projection:

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
- assets or asset SHA references
- `deleted_by_sync_peer_id`
- `restored_by_sync_peer_id`
- `cascade_from`
- `source_sequence_number`
- `prior_digest`
- key material or secrets
- Chrome runtime state

## Hash / Integrity Model

`payloadHash` is:

```text
sha256(canonicalJson({
  projection,
  requestTypes,
  safety,
  authority: {
    canonicalRole
  },
  schemaVersion,
  minorVersion
}))
```

Excluded from `payloadHash`:

- `envelopeId`
- `producerDeviceId`
- `producedAt`
- `logicalClock`
- `signature`
- `sequenceNumber`
- `exportId`

Canonicalization rules:

- sort object keys
- sort entity arrays by `id`
- sort bindings by `chatId` plus entity id
- sort tombstones by `recordKind` plus `recordId`
- deterministic numbers
- UTF-8
- no insignificant whitespace

`signature` remains reserved until identity/key runtime lands.

## LWW By Authority Model

The future v3 projection remains Desktop canonical:

- `authority.canonicalRole`: `desktop`
- `authority.authorityEpoch`: `0`
- current behavior is single-canonical Desktop authority
- entity LWW uses `updatedAt` where runtime has it

Future multi-Desktop authority can populate `authorityEpoch` or a lease model
later without reminting the major if the change is additive-minor and does not
change existing field semantics.

## Reserved Identity / Clock / Integrity Fields

Live now in the contract:

- `payloadHash`

Reserved and inert until identity/key runtime lands:

- `envelopeId`
- `producerDeviceId`
- `logicalClock`
- `signature`

Filling reserved identity/clock/signature fields later is additive-minor, not a
new major, as long as existing v3 field semantics do not change.

## Known Field-Level Gap

`tags` has no runtime `updated_at` column.

A6 does not fix this, does not migrate this, and does not require a schema
change in this slice.

Before v3 freeze, the sync lane must decide whether to:

- add `tags.updated_at`, or
- explicitly freeze `tags` with `createdAt` as the weaker authority timestamp

## A7 Drift / Harness Requirements

A7 should implement or define validators/harnesses for:

- completeness drift against runtime schema/migrations
- exclusion drift for content, pointers, package bodies, and full tombstone fields
- `payloadHash` determinism and `canonicalJson` stability
- required-field presence
- reserved-field inertness
- major/minor version policy:
  - tolerate unknown additive minor
  - reject unknown major
- no v3 mint
- no `productSyncReady` flip

## Boundaries

- Docs/evidence only.
- No v3 mint.
- No metadata envelope freeze.
- No `productSyncReady` flip.
- No validators implemented.
- No WebDAV implementation.
- No identity/key runtime.
- No applied allowlist change.
- No schema or migration change.
- No `tags.updated_at` migration.
- No runtime code changes.
- No capability changes.
- No Chrome runtime/service-worker changes.
- No archive package CAS changes.
- No archive restore/relink/import/export/inspector runtime changes.
- No sync/appearance/ribbon dirty-file changes.
- No `stash@{0}` changes.
- No f17 migration drift changes.

## Recommended Next Step

Use A6 as the field-level v3 projection contract, then implement A7 as a
validator/harness slice for field completeness, exclusions, hash determinism,
reserved-field inertness, and no-premature-v3/product gate checks.
