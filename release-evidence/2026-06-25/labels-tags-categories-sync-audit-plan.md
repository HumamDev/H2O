# Labels / Tags / Categories Sync Audit Plan

Date: 2026-06-29
Repo: `/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source`
Source closeout: `release-evidence/2026-06-25/chat-folder-binding-sync-closeout.md`
Closeout baseline: `416b556690b933f0f0d76beced3becb383279873`

## Verdict

NOT READY for product sync implementation.

The repo is ready for the first read-only diagnostics slice, but not for labels/tags/categories product synchronization yet. F15 created local Desktop catalog and binding canonical lanes, writer identity, cutover shims, and proof validators. F19 Chrome/Desktop propagation still explicitly defers labels, tags, projects, and unsupported storage. Categories have partial export/import handling, but category assignment is split between canonical `library.binding` intent and the `chats.category_id` materialized cache. A metadata-specific Desktop projection, Chrome display mirror, request/receipt lane, and runtime proof set still need to be added before sync writes are safe.

## Scope

- Audit labels, tags, categories, classification, saved-chat organization metadata, library facets, filters, and sync projection fields.
- Identify Desktop authoritative or semi-authoritative stores.
- Identify Chrome mirrors, UI-only fields, inert/deferred fields, and request-only lanes.
- Identify existing export/import support, diagnostics, validators, and runtime proof gaps.
- Propose a phased implementation sequence that preserves the current sync boundary.

## Non-scope

- No product sync logic changes in this task.
- No reopening of chat-folder binding sync B1-B9 unless a metadata phase directly reuses its request/receipt APIs.
- No Chrome direct canonical metadata mutation.
- No hard delete, purge, chat delete, snapshot delete, or asset delete behavior.
- No project metadata implementation. Project fields appear in the audit because they share library facets and deferred warnings, but they should remain a separate or explicitly deferred lane.

## Files Inspected

Evidence and contracts:

- `release-evidence/2026-06-25/chat-folder-binding-sync-closeout.md`
- `docs/systems/cross-platform/f15.0.0-labels-categories-tags-canonical-object-model.md`
- `docs/systems/cross-platform/f15.0.2-materialized-category-cache-contract.md`
- `docs/systems/cross-platform/f15.0.3-store-layer-deprecation-plan.md`
- `docs/systems/cross-platform/f19.2-chrome-desktop-automatic-propagation-contract.md`
- `docs/systems/cross-platform/f19.4-chrome-desktop-sync-hardening-contract.md`

Schema and Desktop stores:

- `apps/studio/desktop/src-tauri/src/lib.rs`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/store/labels.tauri.js`
- `src-surfaces-base/studio/store/tags.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`

Shared library model cores:

- `shared/library/library-index-core.js`
- `shared/library/label-provider-core.js`
- `shared/library/tag-provider-core.js`
- `shared/library/category-provider-core.js`
- `shared/library/project-provider-core.js`

F15 and F19 sync runtime:

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/library/library-catalog-canonicalizer.tauri.js`
- `src-surfaces-base/studio/sync/library/library-binding-canonicalizer.tauri.js`
- `src-surfaces-base/studio/sync/library/library-catalog-diagnostics.tauri.js`
- `src-surfaces-base/studio/sync/library/library-binding-diagnostics.tauri.js`
- `src-surfaces-base/studio/sync/library/library-store-cutover-shims.tauri.js`
- `src-surfaces-base/studio/sync/library/sqlite-writer-identity-sentinel.tauri.js`
- `src-surfaces-base/studio/sync/library/library-bulk-migration.tauri.js`
- `src-surfaces-base/studio/sync/library/library-chrome-desktop-parity-diagnostic.js`
- `src-surfaces-base/studio/sync/execute/adapters/library-catalog-execute-adapter.tauri.js`
- `src-surfaces-base/studio/sync/execute/adapters/library-binding-execute-adapter.tauri.js`

Validators and diagnostics:

- `tools/validation/library/validate-label-provider-core.mjs`
- `tools/validation/library/validate-tag-provider-core.mjs`
- `tools/validation/library/validate-category-provider-core.mjs`
- `tools/validation/library/validate-project-provider-core.mjs`
- `tools/validation/sync/validate-f15-cutover.mjs`
- `tools/validation/sync/validate-f15-bulk-migration.mjs`
- `tools/validation/sync/validate-f15-library-sync-proof.mjs`
- `tools/validation/sync/validate-f15-library-closure.mjs`
- `tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`
- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `tools/validation/sync/validate-f19-live-parity-proof.mjs`
- `tools/validation/sync/validate-f19-sync-hardening.mjs`

## Current Data Model Map

| Domain | Existing storage or projection | Canonical role | Current sync status |
| --- | --- | --- | --- |
| Label catalog | SQLite `labels.id`, `name`, `color`, `source`, `created_at`, `updated_at`, `meta_json`; provider fields include `labelId`, `name`, `type`, `color`, `icon`, `sortOrder`, `status`, `replacementLabelId`, `aliases` | F15 `library.catalog` with `catalogKind: label` | Explicitly deferred in F19 propagation paths |
| Chat-label binding | SQLite `label_bindings.chat_id`, `label_id`, `assigned_at`; provider derives from `labelIds`, `labels`, `labelNames`, `organization.labelIds`, `snapshotMeta.labelIds`, `meta.labelIds`, and `labelSummary` | F15 `library.binding` with `bindingKind: chat-label` | Explicitly deferred in F19 propagation paths |
| Tag catalog | SQLite `tags.id`, `name`, `auto_derived`, `created_at`, `meta_json`; provider fields include `tagId`, `name`, `source`, `status`, `categoryIds`, `usageCount`, `score`, `confidence`, `metadata` | F15 `library.catalog` with `catalogKind: tag` | Explicitly deferred in F19 propagation paths |
| Chat-tag binding | SQLite `tag_bindings.chat_id`, `tag_id`, `assigned_at`; provider derives from `tagIds`, `tags`, `tagNames`, `organization.tagIds`, `snapshotMeta.tags`, and `meta.tags` | F15 `library.binding` with `bindingKind: chat-tag` | Explicitly deferred in F19 propagation paths |
| Category catalog | SQLite `categories.id`, `name`, `parent_id`, `source`, `created_at`, `updated_at`, `meta_json`; provider fields include `categoryId`, `name`, `description`, `color`, `sortOrder`, `status`, `replacementCategoryId`, `aliases`, `metadata` | F15 `library.catalog` with `catalogKind: category` | Partially carried through existing bundle category support |
| Chat-category assignment | SQLite `chats.category_id`; `store/chats.tauri.js` maps this to `categoryId`; `store/categories.tauri.js` has `assignChat`, `clearChat`, and `getForChat` | F15 `library.binding` with `bindingKind: chat-category`; `chats.category_id` is a materialized read cache, not canonical authority | Partially supported, but cache-vs-binding proof is incomplete |
| Tag-category relation | `tag-provider-core` supports `categoryIds`; F15 binding canonicalizer accepts `bindingKind: tag-category` | F15 `library.binding` with `bindingKind: tag-category` | No concrete legacy table/API found in the inspected Desktop stores |
| Project metadata | `chats.project_id`, project provider catalog/cache/binding projections, library facets | Not part of the F15 labels/tags/categories catalog lane in the inspected contracts | Explicitly deferred with `library-propagation-projects-deferred` |
| Library facets | `LibraryIndexCore` builds facets for folders, categories, projects, labels, and tags; headline counts cover active folders, labels, categories, and projects | Display/read-model projection, not authority | Useful for parity diagnostics, but not sufficient as a sync source |
| Classification | `category-provider-core` classifies records from title, preview, tags, labels, and overrides; importer code also carries row classification concepts | Classification should resolve to category catalog/binding state or read-only diagnostics | No independent canonical `classification` sync lane found |
| Saved-chat organization metadata | Import/export code observes `organization.labels`, `organization.labelIds`, `organization.tags`, `organization.tagIds`, `organization.categoryId`, and project-like fields | Input/projection shape only; must not override Desktop canonical authority | Labels/tags/projects warn as deferred; category is partly consumed |

## Desktop Authority Assessment

Desktop remains the canonical authority for metadata mutations.

Existing Desktop storage is rich enough to represent labels, tags, categories, and chat bindings, but not all of it is currently safe as a cross-surface authority surface:

- `labels.tauri.js`, `tags.tauri.js`, and `categories.tauri.js` still expose legacy create/upsert/patch/delete/bind/unbind/assign APIs.
- `chats.tauri.js` can patch or upsert `categoryId`, which maps to `chats.category_id`.
- F15 cutover shims route those legacy writes through settlement behavior when loaded.
- SQLite writer-identity triggers protect labels, tags, categories, label bindings, tag bindings, and `chats.category_id`.
- Allowed writer identities include `f15.execute-settlement-writer`, `f15.bulk-migration`, debug bypass, emergency repair, and specific legacy folder fallback identities.

The important safety distinction is that the stores are not sufficient evidence by themselves. Product sync implementation needs runtime proof that the actual Desktop runtime has the shims loaded, writer identity installed, and triggers active for the user DB being tested.

## Chrome Mirror / Request Assessment

Chrome currently has mirror and display behavior, not canonical authority for labels/tags/categories.

Findings:

- `folder-import.mv3.js` recognizes label, tag, project, category, folder binding, tombstone, apply event, and unsupported-storage shapes.
- Labels, tags, projects, and unsupported storage are intentionally warned as deferred.
- Category catalogs are cloned into the import-side catalog shape; label catalogs are currently forced to an empty array in the inspected path.
- Active-row category mismatches are handled as non-blocking/deferred in existing parity logic.
- No dangerous Chrome direct canonical metadata mutation path was found in the inspected metadata paths.
- The existing chat-folder request/receipt model provides the closest reusable shape for future Chrome-origin metadata requests.

Future Chrome metadata behavior should remain request-only: Chrome may export metadata mutation requests, but Desktop must validate, apply, and receipt them.

## Existing Sync Envelope / Export / Import Assessment

Desktop-to-Chrome and Chrome-to-Desktop propagation currently include explicit deferred warnings for the metadata lane.

Observed warning codes and lanes:

- `library-propagation-labels-deferred`
- `library-propagation-tags-deferred`
- `library-propagation-projects-deferred`
- `library-propagation-folder-bindings-deferred`
- `library-propagation-tombstones-deferred`
- `library-propagation-apply-events-deferred`
- `library-propagation-unsupported-storage-deferred`

Current support:

- Categories have partial bundle support through `chatArchive.catalogs.categories` and chat organization/category shapes.
- Labels and tags are detected, warned, and deferred rather than propagated.
- Library KV label storage is treated as unsupported/deferred.
- Project catalogs/workspace projects are detected, warned, and deferred.
- F15 bulk migration can apply local catalog and binding records with authorized writer identity, but it is not the F19 cross-surface propagation pipeline.
- F15 canonicalizers can produce privacy-preserving `library.catalog` and `library.binding` objects, but an F19 Desktop canonical metadata export envelope is not currently wired for labels/tags/categories.

## Existing Validators / Diagnostics Assessment

Useful existing coverage:

- Provider-core validators cover pure label, tag, category, and project normalization and derivation.
- F15 validators cover cutover shims, writer identity, bulk migration, local library sync proof, and closure proof.
- F19 validators assert the current deferred warnings for labels, tags, projects, and unsupported storage.
- The Chrome/Desktop library parity diagnostic is read-only and compares sanitized row/catalog/facet state.
- `LibraryIndexCore.canonicalHeadlineCounts(rows)` is already the shared headline count contract for folders, labels, categories, and projects.

Coverage gaps:

- No dedicated labels/tags/categories cross-surface metadata diagnostic currently proves Desktop store state, Desktop canonical projection state, Chrome mirror state, deferred warning state, and F15 trigger/shim state in one artifact.
- Tags are not part of the headline count contract, so tag parity must be proved through explicit tag facet/catalog hashes and counts.
- Existing F15 validators prove local canonical behavior, not a full F19 Desktop-to-Chrome-to-Desktop metadata propagation loop.
- Existing F19 propagation validators intentionally protect the deferred state rather than proving label/tag sync.

## Dangerous Direct Mutation Path Review

Chrome:

- No direct Chrome canonical label/tag/category mutation path was found in the inspected files.
- Chrome import writes/mirrors archive data, but labels/tags/projects are deferred and should stay non-authoritative.

Desktop:

- `categories.tauri.js` can directly update `chats.category_id` through legacy APIs.
- `chats.tauri.js` can write `categoryId` through generic patch/upsert paths.
- `labels.tauri.js` and `tags.tauri.js` can directly mutate catalog and binding tables through legacy APIs.
- These paths are acceptable only when the F15 cutover shims and SQLite writer-identity triggers are active and proved in runtime.

The first implementation slice should include diagnostics that make these protections observable before any propagation write path is added.

## Naming Mismatches

- Labels and tags exist as catalog rows, binding rows, library-index row arrays, organization metadata, snapshot metadata, and deferred sync fields.
- Categories exist as catalog rows, `chat-category` binding intent, `chats.category_id` materialized cache, library-index category facets, and classification outputs.
- Projects share facets and warning paths with metadata but are not the same canonical lane as labels/tags/categories.
- Tags have both chat-tag bindings and tag-category relationships in provider/canonical concepts, but no inspected legacy tag-category table/API.
- Classification should be treated as category derivation or diagnostics unless a later design creates a separate canonical lane.

## Migration / Schema Gaps

- Existing DB migrations define labels, label bindings, tags, tag bindings, categories, and `chats.category_id`.
- Existing later migrations install writer-identity triggers and category trigger repairs.
- No inspected migration defines a `category_bindings` table because chat-category intent materializes through `chats.category_id`.
- No inspected migration defines a tag-category relation table.
- Runtime proof is still needed for installed databases, because static migration code does not prove that every active user DB has the expected triggers and shim behavior at test time.

## Gaps And Blockers

1. No F19 Desktop canonical metadata export envelope for labels, tags, category catalogs, chat-label bindings, chat-tag bindings, and chat-category bindings.
2. No Chrome metadata mirror/read-model for Desktop canonical labels/tags/categories projection.
3. No metadata-specific Chrome-origin request export lane.
4. No Desktop metadata request apply and receipt lane.
5. No runtime proof that Desktop shims, writer identity, and SQLite triggers are active before sync writes.
6. No tag parity proof in headline counts; tags need explicit catalog/facet diagnostics.
7. No clear project metadata decision; project fields should remain deferred or be handled in a later separate lane.
8. No concrete tag-category persistence path found in inspected Desktop stores.
9. Category assignment must not let `chats.category_id` become a cross-surface source of truth.
10. Raw ids, names, colors, chat titles, or account-linked metadata must not leak through any canonical sync proof or envelope.

## Proposed Phased Implementation Sequence

1. Metadata diagnostics.
   - Add a read-only labels/tags/categories diagnostic that inventories Desktop stores, F15 canonicalizer output shape, F15 shim/trigger/sentinel state, Chrome mirror/facet state, current deferred warnings, and parity hashes.
   - Include tags explicitly outside headline counts.
   - No sync writes.

2. Desktop canonical export.
   - Add a Desktop-owned metadata projection for label, tag, and category catalogs plus chat-label, chat-tag, and chat-category bindings.
   - Use F15 `library.catalog` and `library.binding` canonicalizers or their contracts.
   - Keep raw names/ids/colors out of portable proof where privacy rules require hashing.

3. Chrome import/display parity.
   - Import Desktop canonical metadata projection into a Chrome read model.
   - Drive Chrome display parity from Desktop projection.
   - Keep Chrome metadata mutation disabled.

4. Desktop-origin convergence.
   - Prove Desktop label/tag/category edits through existing stores/shims produce a new export, Chrome imports it, and parity diagnostics converge.
   - Include category cache-vs-binding checks.

5. Chrome-origin request export.
   - Add request-only metadata mutation export from Chrome, modeled after the chat-folder binding request lane.
   - Start with a narrow request set, preferably binding-only before catalog mutation, unless the implementation prompt explicitly broadens it.

6. Desktop apply and receipt.
   - Desktop validates Chrome metadata requests, applies them through F15 settlement/writer identity, exports receipts, and refreshes canonical projection.
   - Chrome consumes receipts as acknowledgement only.

7. Metadata closeout.
   - Produce static validator evidence, runtime two-surface evidence, no-raw-leak proof, safety invariant proof, and an explicit closeout verdict.

## Runtime Proof Plan

When implementation starts, collect runtime proof only with explicit commands or surfaces supplied for that run. The proof should include:

- Desktop diagnostic snapshot: store counts, binding counts, category cache counts, F15 shim loaded state, writer identity proof, trigger proof, canonical metadata hashes.
- Chrome diagnostic snapshot: imported metadata projection counts, label/tag/category facet counts, deferred warning inventory, no direct mutation capabilities.
- Desktop-to-Chrome proof: mutate Desktop metadata through approved UI/store path, export projection, import in Chrome, compare sanitized parity.
- Chrome request proof: issue a Chrome metadata request, export it, apply on Desktop, receipt it, and verify Chrome only consumes the receipt.
- Safety proof: no hard deletes, no purges, no chat deletes, no snapshot deletes, no asset deletes, no raw metadata leakage.
- Regression validators: provider-core validators, F15 cutover/bulk/closure validators, F19 parity/propagation validators updated for the new metadata lane.

## Safety Invariants

- Desktop remains canonical authority.
- Chrome stays request-only for metadata mutations.
- Chrome display parity uses Desktop canonical projection.
- No Chrome direct canonical mutation.
- No hard delete, purge, chat delete, snapshot delete, or asset delete.
- Category assignment authority is canonical `chat-category` binding state; `chats.category_id` is a materialized read cache.
- Legacy Desktop store writes are safe only through F15 shims and authorized writer identity.
- Metadata projections and proof artifacts must avoid raw private ids, names, colors, titles, and account-linked data unless the artifact is explicitly local-only and scoped.
- Existing chat-folder B1-B9 closure remains closed unless a metadata slice directly reuses the request/receipt APIs.

## Recommended First Implementation Step

Implement Phase 1 only: a read-only metadata diagnostics and validator slice.

The diagnostic should not add sync writes. It should prove what the current runtime can observe for labels, tags, categories, category cache state, Desktop shims/triggers, Chrome mirrors, deferred warnings, and sanitized parity hashes. That evidence should decide the exact Desktop canonical export shape before any product sync logic is added.
