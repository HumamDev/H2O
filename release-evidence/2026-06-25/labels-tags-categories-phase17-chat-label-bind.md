# Labels / Tags / Categories / Classification Sync - Phase 17 chat-label-bind

Date: 2026-06-30

## Scope

Phase 17 implements exactly one additional safe metadata request type:

- `chat-label-bind`

This phase does not implement `chat-label-clear`, `chat-label-remove`, `chat-label-unbind`, tag actions, category catalog actions, label catalog create/rename/delete, classification expansion, WebDAV/cloud/relay transport, or broad product metadata sync completion.

Product metadata sync: NOT READY globally.

## Files Changed

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-labels-tags-categories-phase17-chat-label-bind.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase15-readiness-audit.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase16-next-request-type-design-audit.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase17-chat-label-bind.md`

The Phase 14G/15/16 validator changes are compatibility updates so older gates recognize the new safe applied type after Phase 17. They do not change product behavior.

## Implementation Summary

Chrome request/export support already existed for `chat-label-bind`:

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- action spec: `chat-label-bind`
- metadata kind: `label`
- subject kind: `chat-label-binding`
- operation: `bind`
- requires chat ID: true
- requires label ID: true

Desktop apply support was added in `src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS` now includes only:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
- `validateLibraryMetadataMutationRequestForDesktopApply` now validates `chat-label-bind` requires `chatId` and `labelId`.
- `applyChatLabelBindLibraryMetadataRequest` applies through:
  - `H2O.Studio.store.labels.bindChat(labelId, chatId)`
- Post-write verification uses:
  - `H2O.Studio.store.labels.listForChat(chatId)`
- Applied receipt is emitted only after:
  - target chat exists,
  - target label exists,
  - canonical label binding exists after apply,
  - Desktop canonical projection `chatLabelBindingCount` increments by one,
  - Desktop canonical projection hash changes.

## Request Contract

Request type: `chat-label-bind`

Payload:

- `chatId`
- `conversationId`
- `entityId`
- `labelId`
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
- exact request type `chat-label-bind`,
- target chat exists,
- target label exists,
- expected basis hash where available.

Desktop applies only through:

- `H2O.Studio.store.labels.bindChat(labelId, chatId)`

Desktop does not call:

- `labels.unbindChat`
- `labels.remove`
- `labels.delete`
- `categories.clearChat`
- tag store mutation APIs
- catalog create/rename/delete APIs

## Receipt Behavior

Receipts remain separate from `desktopCanonicalLibraryMetadata`.

Receipt statuses:

- `applied` after verified canonical label binding and projection count/hash change.
- `skipped_duplicate` when current canonical state already contains the chat/label binding.
- `rejected` for missing chat, missing label, failed bind, or post-write/projection mismatch.
- `deferred`, `stale_basis`, or `invalid` through the existing validation lane.

Duplicate detection uses current canonical state through `labels.listForChat(chatId)`, not receipt ledger alone.

## Privacy

The request envelope carries operational IDs required for Desktop apply:

- `chatId`
- `labelId`

Receipts and diagnostics remain redacted/hash-oriented:

- no raw chat titles,
- no raw chat content,
- no raw label names,
- no raw category names,
- no raw tag names,
- no raw colors,
- no account-linked metadata.

The Phase 17 validator explicitly probes private sentinel strings and confirms they do not appear in the pending mirror or applied receipt.

## Safety And Negative Gates

The destructive carve-out remains exact:

- `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])`

Phase 17 does not add a broader clear/remove/unbind carve-out.

The following remain blocked/deferred:

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
- tag actions
- category catalog actions
- label catalog create/rename/delete
- classification expansion
- WebDAV/cloud/relay transport

No delete, purge, hard-delete, chat delete, snapshot delete, asset delete, label delete, tag delete, category delete, or metadata delete behavior was added.

## Validator / Proof Output

New validator:

- `tools/validation/sync/validate-labels-tags-categories-phase17-chat-label-bind.mjs`

The validator proves:

- Chrome can create a request-only `chat-label-bind`.
- Chrome pending export mirror contains one valid `chat-label-bind` request.
- Chrome destructive-shaped requests are rejected and do not add pending rows.
- Desktop allowlist is exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
- Desktop applies through `labels.bindChat(labelId, chatId)`.
- Desktop does not call category assign/clear for label bind.
- Desktop verifies canonical label binding through `labels.listForChat(chatId)`.
- Desktop projection `chatLabelBindingCount` increments from 0 to 1.
- Desktop projection hash and `hashes.chatLabelBindings` change.
- Desktop emits an applied receipt only after verified post-write state.
- Chrome imports the Desktop receipt/projection read-only and resolves the request.
- Replay yields `skipped_duplicate` without calling `bindChat` again.
- No Chrome canonical mutation.
- No delete/purge/destructive behavior.
- Product metadata sync remains NOT READY globally.

## What Was Intentionally Not Implemented

Not implemented:

- live Desktop/Chrome manual runtime proof,
- `chat-label-clear`,
- `chat-label-remove`,
- `chat-label-unbind`,
- tag bind/clear/remove/unbind,
- label/tag/category catalog create/rename/delete,
- classification mutation expansion,
- WebDAV/cloud/relay transport,
- broad product metadata sync completion.

## Phase 17 Verdict

Phase 17 implementation/proof verdict: PASS for in-process deterministic proof of `chat-label-bind`.

Live runtime proof: still required before closing the live loop for this request type.

Product metadata sync verdict: NOT READY globally.

## Recommended Next Slice

Recommended next slice: Phase 18 live runtime proof for `chat-label-bind`.

The live proof should use one existing Desktop chat and one existing Desktop label, then prove:

- Chrome request export,
- Desktop import/apply/receipt,
- Desktop projection count/hash increment,
- Chrome receipt import/resolution,
- Chrome projection refresh,
- replay/idempotency,
- no delete/purge,
- no Chrome canonical mutation,
- no raw private content in evidence.
