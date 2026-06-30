# Labels / Tags / Categories / Classification Sync - Phase 16 Next Request Type Design Audit

Date: 2026-06-30

## Executive Verdict

Recommended next single request type: `chat-label-bind`.

`chat-label-bind` is the existing request schema name for a non-destructive chat-label assignment. It is the safest next candidate after the live-proven chat-category loop because it is additive, table-backed, already represented in the Desktop canonical projection, already known by the Chrome request schema, and can be proven against one chat plus one existing label without catalog creation, catalog rename, label deletion, label unbinding, or Chrome canonical mutation.

Phase 16 is design-only. It made no product behavior changes.

Product metadata sync verdict: NOT READY globally.

## Current Live-Proven Baseline

The currently live-proven applied request types remain:

- `chat-category-assign`
- `chat-category-clear`

Phase 15 readiness audit commit: `ac49df1d872a8a76f1665d4b98247d6c6be5bb1b`

The next implementation phase must not broaden the applied allowlist beyond the selected single type until its own implementation, validators, and live proof are reviewed.

## Candidate Comparison

| Candidate | Store/provider support | Canonical projection | Request payload privacy | Post-write verification | Replay/idempotency | Stale Chrome override risk | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `chat-label-bind` | Supported by `H2O.Studio.store.labels.bindChat(labelId, chatId)` and `listForChat(chatId)` | `chatLabelBindingCount`, `hashes.chatLabelBindings`, `bindings.chatLabels` | Transport needs raw `chatId` and `labelId` for Desktop apply; no chat content/title or label name required. Receipts/diagnostics can remain hash-only. | Verify `labels.listForChat(chatId)` contains `labelId` and projection binding count/hash changes. | `bindChat` is `INSERT OR IGNORE`; replay can produce `skipped_duplicate` when canonical binding already exists. | Low. Existing Chrome import binding behavior is additive; stale Chrome absence should not remove Desktop label bindings. | RECOMMENDED |
| `chat-tag-bind` | Supported by `H2O.Studio.store.tags.bindChat(tagId, chatId)` and `listForChat(chatId)` | `chatTagBindingCount`, `hashes.chatTagBindings`, `bindings.chatTags` | Same shape as label bind; no tag name required if using an existing tag. | Same verification pattern as label bind. | Same `INSERT OR IGNORE` semantics. | Low, but current proven runtime data has had zero tag catalog rows, making live proof harder without first creating/choosing a tag. | DEFER after label bind |
| `chat-category-reassign` | Already covered by `chat-category-assign` if assigning a different category. | Already covered by category assignment projection. | Existing proven category request payload. | Already within the proven assign path. | Already proven. | Existing Phase 14H guard covers stale clear rehydration. | Not a new request type |
| `chat-label-clear` / `chat-label-remove` | `labels.unbindChat(labelId, chatId)` exists, but it deletes a binding row. | Label binding projection exists. | Needs raw IDs for apply. | Can be verified, but it is destructive-shaped and must remain blocked. | Needs extra delete-shaped audit. | Stale Chrome may re-add absent/present binding questions; removal semantics need a guard similar to Phase 14H. | BLOCKED/DEFERRED |
| `chat-tag-clear` / `chat-tag-remove` | `tags.unbindChat(tagId, chatId)` exists, but it deletes a binding row. | Tag binding projection exists. | Needs raw IDs for apply. | Can be verified, but it is destructive-shaped and must remain blocked. | Needs extra delete-shaped audit. | Same removal/rehydration risk as labels. | BLOCKED/DEFERRED |
| label catalog create/rename | `labels.create`, `labels.patch`, and `labels.upsert` exist. | Label catalog projection exists. | Requires explicit user-entered label name; not hash-only in request. | Verify catalog row exists/renamed and hashes changed. | Idempotency needs name/id collision and duplicate-name policy. | Chrome-origin names need careful review; catalog mutations affect global library state. | DEFER |
| tag catalog create/rename | `tags.create`, `tags.patch`, and `tags.upsert` exist. | Tag catalog projection exists. | Requires explicit user-entered tag name; not hash-only in request. | Verify catalog row exists/renamed and hashes changed. | Needs name/id collision policy. | Current tag catalog is not live-proven; catalog mutation is broader than binding an existing label. | DEFER |
| category catalog create/rename | `categories.create`, `categories.patch`, and `categories.upsert` exist. | Category catalog projection exists. | Requires explicit user-entered category name. | Verify catalog row exists/renamed and hashes changed. | Needs collision policy and hierarchy/parent checks. | Broader global catalog mutation; category assignment/clear loop should remain the only category applied loop for now. | DEFER |
| `classification-signal-update` / `classification-set` | Request schema has `classification-set`, but no dedicated Desktop canonical classification store has been live-proven beyond category-derived classification signals. | `classificationSignalCount` currently derives from chat-category assignments. | Requires classification id/value policy not yet audited. | No independent canonical store/post-write read path is proven. | Not enough idempotency semantics. | Could conflict with category-derived classification projection. | BLOCKED |

## Recommended Next Single Request Type

Recommended next type: `chat-label-bind`.

Exact Phase 17 scope should be:

- Add `chat-label-bind` to the Desktop applied request allowlist only.
- Do not add label unbind, label clear, label remove, label delete, label create, label rename, tag actions, category catalog actions, or classification actions.
- Use existing Chrome request shaping for `chat-label-bind`.
- Use Desktop authoritative store path `H2O.Studio.store.labels.bindChat(labelId, chatId)`.
- Require target chat to exist.
- Require target label to exist.
- Treat an already-bound chat/label pair as `skipped_duplicate` based on current canonical state.
- Emit receipts separate from `desktopCanonicalLibraryMetadata`.
- Keep Chrome receipt import/resolution read-only.
- Refresh Desktop canonical projection and Chrome read-only projection after receipt/import.

## Why `chat-label-bind` Is Safer Than Alternatives

`chat-label-bind` is safer because:

- It is additive and non-destructive.
- It does not clear or delete any binding, catalog row, chat, snapshot, asset, folder, or metadata.
- It does not require raw label names, tag names, category names, colors, chat titles, or chat content.
- It uses an existing Desktop SQLite-backed store and composite primary key binding table.
- `labels.bindChat` is idempotent through `INSERT OR IGNORE`.
- `labels.listForChat(chatId)` can verify canonical post-write state.
- The Desktop canonical projection already represents label catalog records and chat-label bindings as redacted hashes/counts.
- The Chrome request schema and export sanitizer already recognize `chat-label-bind` as a non-destructive bind action.
- It is easier to live-prove than `chat-tag-bind` because prior runtime evidence showed label catalog rows existed while tag rows were zero.

## Existing Support Map

Desktop store/provider support:

- `src-surfaces-base/studio/store/labels.tauri.js`
- `bindChat(labelId, chatId, opts)`
- `listForChat(chatId)`
- `listChats(labelId)`
- `get(labelId)`
- `count()`

Desktop canonical projection support:

- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `counts.chatLabelBindingCount`
- `hashes.chatLabelBindings`
- `bindings.chatLabels`

Chrome request/export support:

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `libraryMetadataMutationActionSpec('chat-label-bind')`
- `sanitizeLibraryMetadataMutationRequestExportPayload`
- `libraryMetadataMutationRequests[]`

Desktop import/apply support to add in the next phase:

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- Add only `chat-label-bind` to `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS`.
- Add a verified `applyChatLabelBindLibraryMetadataRequest` path.

## Required Phase 17 Validators And Proofs

The next implementation phase must prove:

- Chrome can export a valid `chat-label-bind` request.
- Desktop sanitizer accepts only safe `chat-label-bind` requests with required safety/privacy flags.
- Desktop applies through `H2O.Studio.store.labels.bindChat(labelId, chatId)` only.
- Desktop rejects missing chat.
- Desktop rejects missing label.
- Desktop emits `applied` only after `labels.listForChat(chatId)` confirms the label binding exists.
- Desktop projection `chatLabelBindingCount` increments by one and `hashes.chatLabelBindings` changes on a fresh binding.
- Replay after actual binding yields `skipped_duplicate`, based on current canonical state, not receipt ledger alone.
- Receipt payload uses target hashes and does not expose raw chat title/content or label names.
- Chrome imports and resolves the receipt read-only.
- Chrome does not mutate canonical metadata.
- Existing `chat-category-assign` and `chat-category-clear` behavior remains unchanged.

Required runtime proof should be bounded to:

- one existing chat,
- one existing label,
- one `chat-label-bind` request,
- one Desktop import/apply/receipt,
- one Chrome receipt import/resolution,
- one replay/idempotency check.

## Negative Gates That Must Remain Blocked

These must remain blocked/deferred:

- `chat-label-clear`
- `chat-label-remove`
- `chat-label-unbind`
- `chat-tag-clear`
- `chat-tag-remove`
- `chat-tag-unbind`
- `category-clear`
- `metadata-clear`
- `delete`
- `remove`
- `unbind`
- `purge`
- `hard-delete`
- label create/rename/delete
- tag create/rename/delete
- category create/rename/delete
- classification expansion beyond the proven chat-category loop
- WebDAV/cloud/relay transport

The non-destructive `chat-category-clear` exact-match carve-out must remain limited to `chat-category-clear`; Phase 17 must not add a broad `*-clear` carve-out.

## Privacy Requirements

`chat-label-bind` transport cannot be fully hash-only because Desktop must know which chat and label to bind. The request envelope may carry raw `chatId` and `labelId` as operational identifiers, matching the existing request model.

The phase must still preserve:

- no raw chat content,
- no raw chat titles,
- no raw label names,
- no raw tag names,
- no raw category names,
- no raw colors,
- no account-linked metadata,
- receipt target hashes for evidence and diagnostics,
- redacted/hash-only diagnostics and proof summaries wherever possible.

## Safety Requirements

The Phase 17 implementation must preserve:

- Chrome request-only behavior,
- Desktop canonical authority,
- no Chrome canonical mutation,
- no hard delete,
- no purge,
- no chat delete,
- no snapshot delete,
- no asset delete,
- no label delete,
- no tag delete,
- no category delete,
- no metadata delete,
- receipts and idempotency,
- product metadata sync globally NOT READY.

## Idempotency Requirements

`chat-label-bind` idempotency should be based on current canonical state:

- If `labels.listForChat(chatId)` already includes `labelId`, return `skipped_duplicate`.
- If an old applied receipt exists but the canonical binding is absent, do not let the receipt ledger mask current state.
- If bind succeeds but canonical re-read does not show the binding, emit a rejected/failed receipt, not `applied`.
- Receipt counts/hash must come from verified post-write canonical projection, not optimistic computation.

## Stale Chrome Metadata Risk

`chat-label-bind` has lower stale Chrome rehydration risk than clear/remove candidates because it is additive. A stale Chrome import that omits a label binding should not remove the Desktop binding.

The next phase should still add diagnostics that distinguish:

- fresh binding applied,
- already-bound duplicate,
- missing chat,
- missing label,
- stale basis,
- request invalid,
- request deferred.

If a later phase opens `chat-label-unbind` or `chat-label-clear`, it will need a separate rehydration suppression design analogous to Phase 14H.

## Design-Only Boundary

Phase 16 made no product behavior changes.

The Desktop applied request allowlist remains limited to:

- `chat-category-assign`
- `chat-category-clear`

`chat-label-bind` is recommended for the next implementation phase but is not implemented by this audit.

## Final Verdict

Phase 16 verdict: READY to design/implement exactly one next request type, `chat-label-bind`, in a later reviewed phase.

Product metadata sync verdict: NOT READY globally.

Broader labels, tags, categories, classification, catalog mutations, clear/remove/unbind/delete/purge/hard-delete actions, and WebDAV/cloud/relay transport remain deferred.

## Recommended Next Slice

Recommended next slice: Phase 17 `chat-label-bind` implementation and proof.

Keep Phase 17 scoped to one non-destructive additive request type. Do not add label clear/remove/unbind, tag actions, catalog create/rename/delete, classification updates, WebDAV/cloud/relay transport, or broad product metadata sync completion.
