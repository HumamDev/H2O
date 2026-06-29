# Labels / Tags / Categories Phase 6 Chrome Request Export

Date: 2026-06-29

## Scope

Phase 6 implements Chrome-origin metadata mutation request export only.

Chrome can now create request-only metadata intent envelopes and export them in
`chrome-latest.json`. Chrome still does not mutate canonical metadata, Desktop
does not apply these requests in this phase, and product metadata sync remains
NOT READY.

## Context Commits

- Audit: `d94f796402ef6421f2b239659c8d6ab644e52a99`
- Phase 1 diagnostics implementation: `f93c7233b614b5926ea3aafa6bea78c0985ef5f4`
- Phase 1 runtime proof: `f89e1a583f2e64350a6c6ee70caf4c60d0dff721`
- Phase 2 Desktop canonical metadata export: `02dbf4ef609cfe3d03cc3d6521040c76d72d8c35`
- Phase 3 Chrome import/display source: `60d3c7404fd9a7f574d65dd770f26e0d72ff9e45`
- Phase 4 Desktop-origin convergence proof: `d8120e5b1d0cb9dad365de1966f0462c16e0fcba`
- Phase 5 display parity model: `93d07f3`
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Files Inspected

- `release-evidence/2026-06-25/chat-folder-binding-phase-b8-chrome-request-export.md`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `tools/validation/sync/validate-chat-folder-binding-phase-b8-chrome-request-export.mjs`
- `src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js`
- `src-surfaces-base/studio/S0F1n. 🎬 Library Batch Toolbar - Studio.js`
- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase6-chrome-request-export.md`

## Existing Chrome Edit / Mutation Paths Found

- `S0F1j. 🎬 Library Actions - Studio.js` exposes `setCategory`, but it gates
  real mutation to Tauri/Desktop and returns native-context-required outside
  Desktop.
- `S0F1n. 🎬 Library Batch Toolbar - Studio.js` has a Set Category batch action
  routed through the same Desktop-gated action surface.
- `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` contains legacy label
  rename/delete hooks through `H2O.Labels.renameLabel` and
  `H2O.Labels.deleteLabel`, but these were not safe to wire into Chrome sync
  request export in this phase.

Decision: no UI integration was added. Phase 6 adds only an explicit
request/outbox/export API.

## Request Schema / Field Map

Request schema:
`h2o.studio.library-metadata-mutation-request.v1`

Version:
`0.1.0-phase6`

Top-level Chrome transport section:
`libraryMetadataMutationRequests[]`

Export summary:
`libraryMetadataMutationRequestExport`

Chrome public APIs:

- `H2O.Studio.sync.folder.requestLibraryMetadataMutation(input, options)`
- `H2O.Studio.sync.folder.listLibraryMetadataMutationRequests(options)`
- `H2O.Studio.sync.folder.diagnoseLibraryMetadataMutationRequests(options)`

Each request envelope includes:

- `schema`
- `version`
- `phase`
- `requestId`
- `reviewId`
- `idempotencyKey`
- `intent: "library-metadata-mutation-request"`
- `classification: "metadata-request"`
- `requestType`
- `action`
- `operation`
- `metadataKind`
- `subjectKind`
- `status: "pending"`
- `createdAt`
- `requestedAt`
- `requestedBy`
- `source`
- `sourceSurface: "chrome-studio"`
- `sourcePeerId`
- `expectedCurrentBasisHash`
- `expectedCurrentBasis`
- `payload`
- `privacy`
- safety and authority flags

Supported Phase 6 request actions:

- `label-create`
- `tag-create`
- `category-create`
- `label-rename`
- `tag-rename`
- `category-rename`
- `chat-label-bind`
- `chat-tag-bind`
- `chat-category-assign`
- `classification-set`

Explicitly deferred and blocked in Phase 6:

- label/tag/category delete requests
- chat label/tag unbind requests
- chat category clear requests
- purge or hard-delete-shaped metadata requests

## Export Storage / Envelope Location

Pending request mirror key:
`h2o:studio:library-metadata-mutation-requests:pending-export:v1`

Pending request mirror schema:
`h2o.studio.library-metadata-mutation-request.pending-export-mirror.v1`

The mirror is request/outbox/export storage only. It is separate from:

- `desktopCanonicalLibraryMetadata`
- `h2o:prm:cgx:fldrs:state:data:v1.desktopCanonicalLibraryMetadata`

`auto-import.mv3.js` reads the mirror and writes sanitized requests to
`chrome-latest.json` under `libraryMetadataMutationRequests[]`.

## Privacy / Sanitization

The request lane does not include raw chat content, raw chat titles, or
account-linked metadata.

IDs needed for future Desktop review/apply can be included:

- `chatId` / `conversationId`
- `labelId`
- `tagId`
- `categoryId`
- `classificationId`

Display names are included only for create/rename requests and only as explicit
user-entered metadata required for Desktop to review/apply the intended
catalog edit later. Display names are trimmed, control characters are stripped,
`<` and `>` are removed, and values are capped at 160 characters.

Colors, unrelated metadata, chat titles, transcript content, and account-linked
metadata are not exported by this lane.

## Idempotency / Request ID Behavior

Request IDs use the prefix:
`library-metadata-mutation-request:`

Chrome uses `crypto.randomUUID()` where available and falls back to a timestamp
plus random suffix.

The idempotency key is built from:

- request lane name
- action
- metadata kind
- chat ID when applicable
- target entity ID when applicable
- display name when applicable
- expected current basis hash when available

Duplicate pending requests with the same idempotency key return
`pending-existing` and reuse the outbox mirror row instead of adding duplicate
requests.

## Safety / No-Delete Proof

All request envelopes include:

- `requestOnly: true`
- `desktopApplyRequired: true`
- `desktopApply: false`
- `noLocalApply: true`
- `noChromeCanonicalMutation: true`
- `noDesktopCanonicalMutation: true`
- `chromeAuthority: false`
- `desktopAuthority: true`
- `separateFromDesktopCanonicalLibraryMetadata: true`
- `noHardDelete: true`
- `noPurge: true`
- `noChatDelete: true`
- `noSnapshotDelete: true`
- `noAssetDelete: true`
- `noLabelDelete: true`
- `noTagDelete: true`
- `noCategoryDelete: true`
- `noMetadataDelete: true`

The Phase 6 validator proves destructive-shaped requests such as
`category-delete` are rejected with
`library-metadata-mutation-request-destructive-action-deferred`.

## No Desktop Apply Proof

No Desktop/Tauri files were changed.

No Desktop request importer or apply function was added. The request lane
exports only Chrome-origin pending envelopes for later Desktop review/apply.

## No Chrome Canonical Mutation Proof

Chrome writes only to the pending export mirror key. It does not write
`desktopCanonicalLibraryMetadata`, label/tag/category canonical stores, chat
category state, or any Desktop canonical metadata.

The request API returns request/outbox results only and does not call import,
apply, syncNow, canonical mutation, delete, purge, chat delete, snapshot delete,
or asset delete functions.

## Validators Run

Passed:

- `git diff --check`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs`
  - `PASS validate-labels-tags-categories-phase6-chrome-request-export`
- `node tools/validation/sync/validate-labels-tags-categories-phase5-display-parity.mjs`
  - `PASS validate-labels-tags-categories-phase5-display-parity`
- `node tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs`
  - `PASS validate-labels-tags-categories-phase3-chrome-import-display`
- `node tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs`
  - `PASS validate-labels-tags-categories-phase2-desktop-export`
- `node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs`
  - `Labels/tags/categories Phase 1 diagnostics validation passed`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`
  - `[f19-sync-hardening] PASS`
- `node tools/validation/sync/validate-f15-cutover.mjs`
  - `F15 cutover validation passed`
- `git diff --cached --check`
  - Passed

## What Remains Deferred

- Chrome UI integration for metadata edit requests.
- Label/tag/category delete request export.
- Chat label/tag unbind request export.
- Chat category clear request export.
- Desktop metadata request import/apply.
- Desktop receipt export.
- Chrome receipt import and convergence proof.
- Product metadata sync completion.

## Verdict

Phase 6 Chrome metadata request export: PASS.

Product metadata sync implementation: NOT READY.

## Recommended Phase 7 Slice

Phase 7 should implement Desktop metadata request apply plus receipt handling,
but only after reviewing the Phase 6 request schema. Desktop must remain the
canonical authority, validate every request against the current
`desktopCanonicalLibraryMetadata`/SQLite basis, and export receipts without
allowing Chrome canonical mutation.
