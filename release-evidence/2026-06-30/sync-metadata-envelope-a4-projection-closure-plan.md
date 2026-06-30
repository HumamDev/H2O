# Sync Metadata Envelope A4 Projection Closure Plan

Status: A4 PROJECTION CLOSURE PLAN — pre-freeze; productSyncReady:false; v3 not minted

Date: 2026-06-30

## Scope

A4 defines the projection/model closure plan needed before any metadata-envelope freeze.

A4 is docs/evidence only.

A4 does not freeze metadata envelope, mint `h2o.studio.fullBundle.v3`, flip `productSyncReady`, implement validators, implement WebDAV transport, or add new request implementations.

## Core principle

Future `h2o.studio.fullBundle.v3` is expected to represent a complete canonical read projection.

A2 still governs that this remains pre-freeze.

The target projection model is:

- full-snapshot read-model
- content-hashed
- last-writer-wins by authority
- Desktop canonical

Request/mutation changes remain incremental under the A2 policy:

- reject-unknown-major
- tolerate-unknown-minor

A4 closes only projection/model planning and does not make a product gate flip.

`v3` mint requires projection closure, not the existence of every request/mutation type.

## Two-gate model

A4 separates freeze gates explicitly:

1. `v3-mint gate`
2. `productSyncReady gate`

`v3-mint gate` requires:

- projection closure
- enough metadata read projection completeness to support read-only transport
- no package-body transport mutation
- WebDAV remains deferred

`productSyncReady flip gate` requires:

- operational coherence
- request/mutation type readiness proved
- identity/key/E2E runtime and multi-Desktop authority decisions in place

A4 closes only the projection model plan.

A4 does not flip `productSyncReady`.

## Must-close projection/model surfaces before v3 mint

These read-projection fields must be complete before minting a frozen transport major:

1. `categories` projection

- `id`
- `name`
- `parent_id` hierarchy
- `source`
- `created_at`
- `updated_at`
- `meta_json`

2. `labels` projection

- `id`
- `name`
- `color`
- `source`
- `created_at`
- `updated_at`
- `meta_json`

3. `tags` projection

- `id`
- `name`
- `auto_derived`
- `created_at`
- `updated_at`
- `meta_json`

4. `folders` catalog read-model

- catalog entity fields (not only bindings)
- include enough metadata to render classification, hierarchy, and mutability metadata

5. binding read-model

- `label_bindings`
- `tag_bindings`
- `chats.category_id`
- `folder_bindings`
- binding existence/removal semantics

6. delete/tombstone state representation

- all catalog entities should carry soft-delete/tombstone representation
- include unbind state where relevant

7. projection semantics

- full snapshot emission
- per-snapshot content hash
- last-writer-wins-by-authority across mutation source
- immutable read projection for transport consumers

## Request-type plan

A4 ratifies four request types as the stable request-core candidate:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

This is the request-core baseline for planned projection closure.

These are not the full transport-envelope freeze.

Notes:

- category has assign/clear symmetry
- label/tag currently expose bind only (no unbind yet)
- catalog CRUD is part of a broader convergence model but is not part of the applied allowlist now

## Safely deferred surfaces

Deferred until later additive-minor phases:

- `chat-label-unbind`
- `chat-tag-unbind`
- label create/rename/recolor
- tag create/rename/delete
- category create/rename/recolor/delete
- soft-delete request/apply runtime for catalog entities
- catalog CRUD request types
- multi-Desktop authority resolution
- identity/key/E2E runtime
- hard-delete and undelete, delegated to deletion/sync authority lane

Deferred mutation types can be introduced later as additive-minor extensions.

These deferred surfaces block `productSyncReady`, but they do not block v3 projection mint when projection can represent their future effect states.

## Closure checklist before v3 projection mint

- [ ] `categories.parent_id` included and representable
- [ ] `labels.color` included and representable
- [ ] `tags.auto_derived` included and representable
- [ ] folders catalog fields included beyond binding projection
- [ ] all binding kinds included (`label_bindings`, `tag_bindings`, `chats.category_id`, `folder_bindings`)
- [ ] soft-delete/tombstone state represented for catalog entities and unbind state
- [ ] full-snapshot + content hash emission defined
- [ ] last-writer-wins-by-authority semantics defined
- [ ] request registry remains four-core and additive-minor extension policy defined
- [ ] package bodies excluded from metadata snapshot payload
- [ ] projection/runtime schema-drift guard plan documented
- [ ] `productSyncReady` remains false in A4
- [ ] `h2o.studio.fullBundle.v3` not minted by this phase

## Required (not implemented here)

A4 records the following required validators for next slices:

- `projection-schema-completeness-guard`
- `projection-drift-guard` against runtime schema and migrations
- `request-extensibility-guard`
- `projection-closure-harness`
- `no-premature-mint-guard`

A4 is planning only; these validators are not implemented in A4.

## Cross-cutting boundaries

- package bodies remain excluded from metadata envelopes
- archive CAS remains deferred and boundary-locked (no archive package body transport)
- WebDAV remains deferred
- identity/key/E2E remains design-only and runtime-absent in this phase
- multi-Desktop authority remains an open gate
- no transport-origin direct `libraryIndex` writes
- no transport auto-apply

## Boundaries respected

- docs/evidence only
- no metadata envelope freeze
- no `h2o.studio.fullBundle.v3` mint
- no `productSyncReady:true`
- no WebDAV implementation
- no request/mutation runtime changes
- no applied allowlist expansion
- no schema/runtime mutation
- no capability changes
- no Chrome runtime/service-worker changes
- no archive package CAS, restore, relink, importer, or inspector changes
- no sync/appearance/ribbon runtime changes
- no stash restore or f17 migration drift modifications

## Investigation summary

A4 identifies projection completeness as the immediate pre-freeze blocker and formalizes a staged model where projection closure enables a future read transport plan without committing transport freeze gates.

## Recommended next step

After A4, define and execute A5 to operationalize projection closure checks and close the model validation slice needed to gate `v3` mint, before resuming `productSyncReady` proof work.
