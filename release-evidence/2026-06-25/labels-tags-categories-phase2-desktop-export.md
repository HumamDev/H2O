# Labels / Tags / Categories Phase 2 Desktop Export Evidence

Date: 2026-06-29

## Scope

Phase 2 implements Desktop canonical metadata export only for labels, tags,
categories, chat-category assignments, and classification signals already
represented by Desktop stores.

Desktop remains the canonical authority. This phase does not implement Chrome
import/display parity, Chrome request export, Desktop apply behavior, Chrome
canonical mutation, WebDAV/cloud/relay transport, or any destructive behavior.

## Files Changed

- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase2-desktop-export.md`

## Export Schema / Field Map

New sync bundle section:

- Section: `desktopCanonicalLibraryMetadata`
- Schema: `h2o.studio.library-metadata.desktop-canonical.v1`
- Version: `0.1.0-phase2`
- Phase: `phase2-desktop-canonical-export`
- Source authority: `desktop`
- Surface: `desktop-studio`
- Platform adapter: `tauri`

Projection fields:

- `privacy`: redacted/hash-only flags.
- `sideEffectSummary`: read-only/no-write/no-apply/no-request-export flags.
- `counts`: catalog and binding counts for labels, tags, categories,
  chat-category assignments, and classification signals.
- `hashes`: redacted hashes for label catalogs, tag catalogs, category
  catalogs, chat-label bindings, chat-tag bindings, chat-category assignments,
  and the total projection.
- `catalogs`: redacted catalog records for labels, tags, and categories.
- `bindings`: redacted binding records for chat-label, chat-tag, and
  chat-category relationships.
- `diagnostics`: Phase 2 readiness and intentional NOT READY flags for product
  sync.
- `safety`: no hard delete / no purge / no chat delete / no snapshot delete /
  no asset delete / no label delete / no tag delete / no category delete /
  no metadata delete.

`exportLatestSyncBundle()` also reports a compact result summary under:

- `libraryMetadataExport`

## Desktop Sources Read

The projection reads only public Desktop store APIs:

- `H2O.Studio.store.labels.getAll()`
- `H2O.Studio.store.labels.listChats(labelId)`
- `H2O.Studio.store.tags.getAll()`
- `H2O.Studio.store.tags.listChats(tagId)`
- `H2O.Studio.store.categories.getAll()`
- `H2O.Studio.store.chats.getAll()`

Category/classification assignment is derived from existing `chats.categoryId`
state. No store mutator is called.

## Privacy / Sanitization Behavior

The exported payload is hash/count based. It does not expose:

- raw chat IDs
- raw chat titles
- raw chat content
- raw label names
- raw tag names
- raw category names
- raw colors
- account-linked metadata

Catalog records include booleans such as `hasName`, `hasColor`, `hasParent`,
`autoDerived`, and `hasMetadata`, plus hashes. Binding records include hashed
left/right subject references only.

## No-Side-Effect Guarantees

The projection declares and validator-checks:

- read-only behavior
- no storage writes
- no SQLite writes
- no Chrome storage writes
- no import invoked
- no export invoked by the projection module
- no `syncNow` invoked
- no apply executed
- no Desktop apply
- no Chrome request export
- no canonical mutation
- no deletes

The bundle exporter invokes the projection as part of existing Desktop export
assembly. The projection itself does not trigger export, apply, import, sync, or
mutation behavior.

## Relationship To Phase 1

Phase 1 diagnostics proved the runtime API could capture sanitized
Desktop/Chrome metadata snapshots and detect divergence. Phase 2 adds the first
Desktop-origin canonical metadata envelope that Phase 3 can later import for
Chrome display parity.

Phase 2 keeps product sync NOT READY because Chrome import/display parity,
Chrome request export, and Desktop apply/receipt behavior are intentionally
absent.

## Intentionally Not Implemented

- Chrome import/display parity for the new section.
- Chrome request export.
- Desktop apply behavior.
- Desktop apply receipts for metadata requests.
- Chrome canonical mutation.
- Raw label/tag/category name export for UI parity.
- WebDAV/cloud/relay transport.
- Any delete/purge behavior.

## Validator / Proof Output

Commands run:

```text
node --check src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js
node --check tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs
node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js
node --check tools/product/studio/pack-studio.mjs
node tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs
node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/sync/validate-f15-cutover.mjs
```

Results:

```text
PASS validate-labels-tags-categories-phase2-desktop-export
Labels/tags/categories Phase 1 diagnostics validation passed
[f19-sync-hardening] PASS
F15 cutover validation passed
```

The Phase 2 validator proved:

- API installs on a Tauri-like runtime.
- `buildDesktopCanonicalMetadataExport()` returns the expected schema/version.
- Mock labels/tags/categories/chats are counted.
- Chat-label, chat-tag, and chat-category/classification bindings are hashed.
- Raw secret IDs, names, titles, content, and colors do not appear in the JSON.
- Export bundle includes `desktopCanonicalLibraryMetadata`.
- Latest export result includes `libraryMetadataExport`.
- Loader/pack entries include the new module.
- Forbidden mutator calls are absent from the projection module.

## Remaining Gaps

- Chrome does not yet import or display `desktopCanonicalLibraryMetadata`.
- Chrome still has no metadata request export lane.
- Desktop still has no metadata request apply/receipt lane.
- Raw display-name parity remains unresolved. The current payload intentionally
  avoids raw names/colors until the schema/privacy decision is documented.
- Runtime proof against a real `latest.json` export is still needed after review
  if Phase 2 is accepted.

## Phase 2 Verdict

Phase 2 Desktop canonical metadata export: READY FOR REVIEW.

Product metadata sync implementation: NOT READY.

## Recommended Phase 3

Implement Chrome import/display parity for `desktopCanonicalLibraryMetadata`
only. Phase 3 should consume the Desktop canonical projection as a read-only
mirror/display source and must still avoid Chrome request export, Desktop apply
behavior, and Chrome canonical mutation.
