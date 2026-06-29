# Labels / Tags / Categories / Classification Metadata Sync

## Phase 7 Desktop Apply + Receipts

Date: 2026-06-29

## Context

- Audit: `d94f796402ef6421f2b239659c8d6ab644e52a99`
- Phase 1 diagnostics implementation: `f93c7233b614b5926ea3aafa6bea78c0985ef5f4`
- Phase 1 runtime proof: `f89e1a583f2e64350a6c6ee70caf4c60d0dff721`
- Phase 2 Desktop canonical metadata export: `02dbf4ef609cfe3d03cc3d6521040c76d72d8c35`
- Phase 3 Chrome import/display source: `60d3c7404fd9a7f574d65dd770f26e0d72ff9e45`
- Phase 4 Desktop-origin convergence proof: `d8120e5b1d0cb9dad365de1966f0462c16e0fcba`
- Phase 5 display parity model: `93d07f3`
- Phase 6 Chrome request export: `91e1c95`

## Scope

Phase 7 implements the Desktop-side request review/apply lane for Chrome-origin `libraryMetadataMutationRequests[]` and exports Desktop receipts for later Chrome import.

This phase does not implement Chrome receipt import, Chrome canonical mutation, Desktop broad UI, WebDAV/cloud/relay transport, destructive metadata actions, or a full product metadata sync closeout.

## Files Inspected

- `release-evidence/2026-06-25/labels-tags-categories-phase6-chrome-request-export.md`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`

## Files Changed

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase7-desktop-apply-receipts.md`

## Phase 6 Request Schema Reviewed

- Request section: `libraryMetadataMutationRequests[]`
- Request schema: `h2o.studio.library-metadata-mutation-request.v1`
- Chrome pending export mirror: `h2o:studio:library-metadata-mutation-requests:pending-export:v1`
- Request posture: Chrome request-only, `desktopApplyRequired: true`, `desktopApply: false`, `noLocalApply: true`, `chromeAuthority: false`, `desktopAuthority: true`

Phase 6 request types:

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

Destructive-shaped requests remain blocked/deferred:

- label/tag/category delete
- chat label/tag unbind
- chat category clear
- purge / hard delete
- chat / snapshot / asset delete

## Allowed Request Types Implemented

Phase 7 applies only:

- `chat-category-assign`

Reason:

- Desktop already has a canonical Desktop-only category assignment API: `H2O.Studio.store.categories.assignChat(categoryId, chatId)`.
- The API updates `chats.category_id` only for an existing chat row and does not create a ghost chat.
- The request payload is privacy-safe: `chatId` and `categoryId` are used only inside Desktop apply; receipts export hashes/status, not raw IDs or names.

## Deferred Request Types

These valid Phase 6 request types receive a `deferred` receipt with code `library-metadata-mutation-request-action-deferred-phase7`:

- `label-create`
- `tag-create`
- `category-create`
- `label-rename`
- `tag-rename`
- `category-rename`
- `chat-label-bind`
- `chat-tag-bind`
- `classification-set`

Reason:

- Catalog create/rename needs a reviewed display-name policy and collision semantics.
- Label/tag binding needs a reviewed Desktop canonical binding apply policy.
- Classification-set needs a reviewed canonical classification model beyond category assignment.

## Desktop Canonical Stores Used

- `H2O.Studio.store.chats.get(chatId)`
- `H2O.Studio.store.categories.get(categoryId)`
- `H2O.Studio.store.categories.assignChat(categoryId, chatId)`
- `H2O.Studio.sync.libraryMetadataExportProjection.buildDesktopCanonicalMetadataExport(options)` for read-only basis/current hash checks and resulting canonical hash evidence.

## Request Validation Rules

Desktop validates:

- schema equals `h2o.studio.library-metadata-mutation-request.v1`
- intent equals `library-metadata-mutation-request`
- status equals `pending`
- request ID / review ID is present and shaped safely
- idempotency key is present
- source surface is `chrome-studio`
- action is known and non-destructive
- Phase 7 allowlist is `chat-category-assign` only
- `chatId` and `categoryId` are present for assignment
- `desktopApplyRequired: true`
- `noLocalApply: true`
- `noChromeCanonicalMutation: true`
- `noDesktopCanonicalMutation: true`
- delete/purge/chat/snapshot/asset/label/tag/category/metadata delete flags are blocked
- privacy flags reject raw chat content, raw chat titles, and account-linked metadata
- `expectedCurrentBasisHash` is compared with the current Desktop canonical metadata projection hash when available

Stale basis handling:

- If a request provides `expectedCurrentBasisHash` and Desktop can compute a current projection hash, a mismatch receives status `stale_basis`.
- If the request provides a basis hash but Desktop cannot compute the current projection hash, the request is deferred as `library-metadata-mutation-request-basis-unavailable`.

## Idempotency Behavior

Desktop reads existing `libraryMetadataMutationReceipts[]` mirror rows before applying.

- If an earlier `applied` receipt exists for the same `requestId` or `idempotencyKey`, the request receives a `skipped_duplicate` receipt and is not applied again.
- If the target chat already has the requested category, the request receives `skipped_duplicate` with code `library-metadata-mutation-request-already-applied-canonical`.
- Receipts are upserted by receipt ID, so repeated imports do not grow duplicate receipt rows for the same request/status.
- `duplicateChromeLatestBundleHasRequestLanes()` now includes `libraryMetadataMutationRequests[]`, so already-imported `chrome-latest.json` can still replay metadata requests idempotently for receipt generation.

## Receipt Schema / Field Map

- Receipt section: `libraryMetadataMutationReceipts[]`
- Receipt schema: `h2o.studio.library-metadata-mutation-receipt.v1`
- Receipt export mirror key: `h2o:studio:library-metadata-mutation-receipts:export:v1`
- Receipt export mirror schema: `h2o.studio.library-metadata-mutation-receipt.export-mirror.v1`

Receipt fields include:

- `receiptId`
- `requestId`
- `reviewId`
- `idempotencyKey`
- `requestAction`
- `requestType`
- `metadataKind`
- `subjectKind`
- `status`: `applied`, `rejected`, `deferred`, `skipped_duplicate`, `stale_basis`, or `invalid`
- `reason` / `code`
- `reviewedAt`
- `appliedAt` for applied receipts
- Desktop authority/source metadata
- hashed target references only
- `expectedCurrentBasisHash`
- `beforeProjectionHash`
- `resultingCanonicalHash`
- assignment before/after hashes
- sanitized counts where available
- privacy and safety flags

## Export Behavior

Desktop `latest.json` now includes:

- `libraryMetadataMutationReceipts[]`

The receipt section is separate from:

- `desktopCanonicalLibraryMetadata`
- `libraryMetadataMutationRequests[]`

`export-bundle.tauri.js` only exports receipt rows that match the Phase 7 receipt schema and safety/privacy requirements.

## Privacy / Sanitization

Receipts are status/hash/count evidence only.

They do not export:

- raw chat IDs
- raw chat titles
- raw chat content
- raw label names
- raw tag names
- raw category names
- raw colors
- account-linked metadata
- user-entered display names

If a request contained a display name, the receipt records only `displayNameReceiptRedacted: true`.

## Safety / No-Delete Proof

Phase 7 does not add destructive apply behavior.

Receipt and apply safety flags preserve:

- `noHardDelete: true`
- `noPurge: true`
- `noChatDelete: true`
- `noSnapshotDelete: true`
- `noAssetDelete: true`
- `noLabelDelete: true`
- `noTagDelete: true`
- `noCategoryDelete: true`
- `noMetadataDelete: true`

No delete, unbind, clear, purge, hard-delete, chat delete, snapshot delete, or asset delete path is implemented.

## No Chrome Canonical Mutation Proof

Chrome remains request-only.

Phase 7 changes only Desktop import/apply/export code and a validator/evidence file. It does not add Chrome receipt import and does not modify Chrome canonical metadata or Desktop canonical metadata export read-model semantics.

## Validation Output

Commands to run:

```bash
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js
node --check tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs
node tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs
node tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs
node tools/validation/sync/validate-labels-tags-categories-phase5-display-parity.mjs
node tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs
node tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs
node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/sync/validate-f15-cutover.mjs
git diff --check
git diff --cached --check
```

Observed result for the Phase 7 validator:

- `Phase 7 labels/tags/categories Desktop apply + receipt validation passed.`

Observed local validation:

- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js` passed.
- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js` passed.
- `node --check tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs` passed.
- `node tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs` passed.
- `node tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs` passed.
- `node tools/validation/sync/validate-labels-tags-categories-phase5-display-parity.mjs` passed.
- `node tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs` passed.
- `node tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs` passed.
- `node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs` passed.
- `node tools/validation/sync/validate-f19-sync-hardening.mjs` passed.
- `node tools/validation/sync/validate-f15-cutover.mjs` passed.

## What Remains Deferred

- Chrome import/display of `libraryMetadataMutationReceipts[]`.
- Chrome pending request cleanup after Desktop receipt import.
- Catalog create/rename apply policy.
- Label/tag binding apply policy.
- Classification-set canonical model.
- Delete/unbind/clear/purge/hard-delete metadata actions.
- Runtime Desktop/Chrome proof for Phase 7.

## Verdict

Phase 7 implementation verdict: READY FOR REVIEW.

Product metadata sync: NOT READY.

The request/apply/receipt lane is intentionally partial: Desktop can apply the safe `chat-category-assign` subset and exports receipts, while Chrome remains request-only and destructive or broader metadata mutation types remain deferred.

## Recommended Phase 8

Implement Chrome receipt import/display for `libraryMetadataMutationReceipts[]`.

Phase 8 should remain read-only on Chrome canonical metadata:

- import Desktop receipts
- match receipts to pending Chrome request IDs/idempotency keys
- show applied/rejected/deferred/stale/duplicate status
- optionally hide or mark satisfied pending requests
- do not add Chrome canonical mutation
- do not add destructive metadata actions
