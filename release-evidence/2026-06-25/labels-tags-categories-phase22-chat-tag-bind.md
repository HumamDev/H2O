# Labels / Tags / Categories / Classification Sync - Phase 22 chat-tag-bind

Date: 2026-06-30

## Scope

Phase 22 implements exactly one additional safe metadata request type:

- `chat-tag-bind`

This phase does not implement `chat-tag-clear`, `chat-tag-remove`, `chat-tag-unbind`, label clear/remove/unbind, tag catalog create/rename/delete, label/category catalog actions, classification expansion, WebDAV/cloud/relay transport, or broad product metadata sync completion.

Product metadata sync: NOT READY globally.

## Files Changed

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-labels-tags-categories-phase22-chat-tag-bind.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase15-readiness-audit.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase16-next-request-type-design-audit.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase17-chat-label-bind.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase20-closure-gate-audit.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase21-chat-tag-bind-design-audit.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase22-chat-tag-bind.md`

The validator changes outside Phase 22 are compatibility updates so required older gates recognize that Phase 22 intentionally extends the current applied allowlist from three to exactly four safe request types. They do not change product behavior.

## Implementation Summary

Chrome request/export support already existed for `chat-tag-bind`:

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- action spec: `chat-tag-bind`
- metadata kind: `tag`
- subject kind: `chat-tag-binding`
- operation: `bind`
- requires chat ID: true
- requires tag ID: true

Desktop apply support was added in `src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS` now includes exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- `validateLibraryMetadataMutationRequestForDesktopApply` validates `chat-tag-bind` requires `chatId` and `tagId`.
- `applyChatTagBindLibraryMetadataRequest` applies through `H2O.Studio.store.tags.bindChat(tagId, chatId)`.
- Post-write verification uses `H2O.Studio.store.tags.listForChat(chatId)`.
- Applied receipt is emitted only after:
  - target chat exists,
  - target tag exists,
  - canonical tag binding exists after apply,
  - Desktop canonical projection `chatTagBindingCount` increments by one,
  - Desktop canonical projection hash changes.

## Request Contract

Request type: `chat-tag-bind`

Payload:

- `chatId`
- `conversationId`
- `entityId`
- `tagId`
- `displayName: null`

Safety flags remain required:

- `requestOnly: true`
- `desktopApplyRequired: true`
- `desktopApply: false`
- `noLocalApply: true`
- `noChromeCanonicalMutation: true`
- `noDesktopCanonicalMutation: true`
- `chromeAuthority: false`
- `desktopAuthority: true`
- `noHardDelete: true`
- `noPurge: true`
- `noChatDelete: true`
- `noSnapshotDelete: true`
- `noAssetDelete: true`
- `noLabelDelete: true`
- `noTagDelete: true`
- `noCategoryDelete: true`
- `noMetadataDelete: true`

## Desktop Apply Contract

Desktop validates:

- schema/version shape,
- pending request status,
- Chrome source surface,
- request-only flags,
- no canonical Chrome mutation flags,
- no-delete/no-purge safety flags,
- privacy flags,
- exact request type `chat-tag-bind`,
- target chat exists,
- target tag exists,
- expected basis hash where available.

Desktop applies only through:

- `H2O.Studio.store.tags.bindChat(tagId, chatId)`

Desktop does not call:

- `tags.unbindChat`
- `tags.remove`
- `tags.delete`
- `labels.unbindChat`
- `labels.remove`
- `labels.delete`
- `categories.clearChat`
- catalog create/rename/delete APIs

## Receipt Behavior

Receipts remain separate from `desktopCanonicalLibraryMetadata`.

Receipt statuses:

- `applied` after verified canonical tag binding and projection count/hash change.
- `skipped_duplicate` when current canonical state already contains the chat/tag binding.
- `rejected` for missing chat, missing tag, failed bind, or post-write/projection mismatch.
- `deferred`, `stale_basis`, or `invalid` through the existing validation lane.

Duplicate detection uses current canonical state through `tags.listForChat(chatId)`, not receipt ledger alone.

## Privacy

The request envelope carries operational IDs required for Desktop apply:

- `chatId`
- `tagId`

Receipts and diagnostics remain redacted/hash-oriented:

- no raw chat titles,
- no raw chat content,
- no raw label names,
- no raw tag names,
- no raw category names,
- no raw colors,
- no account-linked metadata.

The Phase 22 validator probes private sentinel strings and confirms they do not appear in the pending mirror or applied receipt.

## Safety And Negative Gates

The destructive carve-out remains exact:

- `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])`

Phase 22 does not add a broader clear/remove/unbind carve-out.

The following remain blocked/deferred:

- `chat-tag-clear`
- `chat-tag-remove`
- `chat-tag-unbind`
- `tag-delete`
- `tag-clear`
- `chat-label-clear`
- `chat-label-remove`
- `chat-label-unbind`
- `label-delete`
- `label-clear`
- `delete`
- `remove`
- `unbind`
- `purge`
- `hard-delete`
- label/tag/category catalog create/rename/delete
- classification expansion
- WebDAV/cloud/relay transport

No delete, purge, hard-delete, chat delete, snapshot delete, asset delete, label delete, tag delete, category delete, or metadata delete behavior was added.

## Validator / Proof Output

New validator:

- `tools/validation/sync/validate-labels-tags-categories-phase22-chat-tag-bind.mjs`

The validator proves:

- Chrome can create a request-only `chat-tag-bind`.
- Chrome pending export mirror contains one valid `chat-tag-bind` request.
- Chrome destructive-shaped requests are rejected and do not add pending rows.
- Desktop allowlist is exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- Desktop applies through `tags.bindChat(tagId, chatId)`.
- Desktop does not call category assign/clear for tag bind.
- Desktop verifies canonical tag binding through `tags.listForChat(chatId)`.
- Desktop projection `chatTagBindingCount` increments from 0 to 1.
- Desktop projection hash and `hashes.chatTagBindings` change.
- Desktop emits an applied receipt only after verified post-write state.
- Chrome imports the Desktop receipt/projection read-only and resolves the request.
- Replay yields `skipped_duplicate` without calling `bindChat` again.
- No Chrome canonical mutation.
- No delete/purge/destructive behavior.
- Product metadata sync remains NOT READY globally.

## Phase 20 Boundary Update

Phase 20 closure boundary is intentionally updated by this deterministic proof from three to four applied request types:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

This is not a global product sync closeout. It is a deterministic implementation/proof for one additive request type. Broader metadata actions remain deferred.

## What Was Intentionally Not Implemented

Not implemented:

- live Desktop/Chrome manual runtime proof,
- `chat-tag-clear`,
- `chat-tag-remove`,
- `chat-tag-unbind`,
- label clear/remove/unbind,
- tag catalog create/rename/delete,
- label/category catalog actions,
- classification mutation expansion,
- WebDAV/cloud/relay transport,
- broad product metadata sync completion.

## Phase 22 Verdict

Phase 22 implementation/proof verdict: PASS for in-process deterministic proof of `chat-tag-bind`.

Live runtime proof: still required before closing the live loop for this request type.

Product metadata sync verdict: NOT READY globally.

## Recommended Next Slice

Recommended next slice: Phase 23 live runtime proof for `chat-tag-bind`.

The live proof should use one existing Desktop chat and one existing Desktop tag that are not already bound, then prove:

- Chrome request export,
- Desktop import/apply/receipt,
- Desktop projection count/hash increment,
- Chrome receipt import/resolution,
- Chrome projection refresh,
- replay/idempotency,
- no delete/purge,
- no Chrome canonical mutation,
- no raw private content in evidence.
