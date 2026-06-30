# Labels / Tags / Categories / Classification Metadata Sync

## Phase 21 Design-Only Audit: `chat-tag-bind` (next safe request type)

Date: 2026-06-29

## Status

DESIGN/AUDIT ONLY. Phase 21 made no product behavior changes. No source modules were modified, no
request type was enabled, the applied allowlist was not changed, and runtime behavior is unchanged.
`chat-tag-bind` is NOT added to the applied allowlist in this phase.

## Phase 21 Verdict

`chat-tag-bind`: **READY for later Phase 22 implementation.** It satisfies Phase 20 Gate A (design
evidence): the canonical store path, the projection support, and the request shape already exist in
source, and the action is additive/non-destructive — a direct mirror of the already-live-proven
`chat-label-bind`.

## Current Applied / Live-Proven Request Types

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`

The applied allowlist remains exactly these three
(`APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS` in
`src-surfaces-base/studio/sync/folder-sync.tauri.js`). `chat-tag-bind` is NOT in it.

## Context

- Phase 20 closure gate committed: `7f5746b`
  (`release-evidence/2026-06-25/labels-tags-categories-phase20-closure-gate-audit.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase20-closure-gate-audit.mjs`).
- Phase 20 locked the applied allowlist to exactly three types and defined Gates A/B/C. Product
  metadata sync remains globally NOT READY.

## Feasibility Audit (grounded in real source)

### 1. Existing store / provider support

- `tags.bindChat(tagId, chatId)` exists: `src-surfaces-base/studio/store/tags.tauri.js` —
  `INSERT OR IGNORE INTO tag_bindings (chat_id, tag_id, assigned_at) VALUES (?, ?, ?)`, resolves
  `true` on success (exact contract mirror of the proven `labels.bindChat`).
- `tags.listChats(tagId)` exists — `SELECT chat_id FROM tag_bindings WHERE tag_id = ?` — for binding
  enumeration / idempotency.
- `tags.getForChat(chatId)` exists — `SELECT tag_id FROM tag_bindings WHERE chat_id = ?` — to read a
  chat's current tag bindings from canonical state.
- `tags.get` (getById) exists for tag existence checks.

### 2. Projection support

- `chatTagBindingCount: tagBindings.length` is represented in
  `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`.
- `hashes.chatTagBindings: await hashValue(tagBindings)` is represented.
- `tagBindings` is built by `listCatalogChatBindings(stores.tags, tags, 'tag', warnings)`, which reads
  `tags.listChats`. A new binding therefore increments `chatTagBindingCount` and changes both
  `hashes.chatTagBindings` and `hashes.projection` — so projection count + hash can prove one new
  binding, exactly as for `chat-label-bind`.

### 3. Request shape

- `chat-tag-bind` is already in the request-spec table on BOTH surfaces:
  `{ metadataKind: 'tag', subjectKind: 'chat-tag-binding', operation: 'bind', requiresChatId: true, requiresId: true }`.
- Chrome can already shape/export it request-only (`requestOnly: true`, `desktopApply: false`,
  `noLocalApply: true`); the payload stays redacted/hash-safe (chatId + tagId opaque store IDs, no raw
  titles/content/names), identical to the label-bind request. The Desktop apply gate simply defers it
  today because it is not on the applied allowlist.

### 4. Desktop apply feasibility

- Validate chat exists: `H2O.Studio.store.chats.get(chatId)`.
- Validate tag exists: `H2O.Studio.store.tags.get(tagId)`.
- Apply only through canonical store: `H2O.Studio.store.tags.bindChat(tagId, chatId)`.
- Verify post-write state: re-read `tags.getForChat(chatId)` (or `tags.listChats(tagId)`) and/or
  recompute the projection basis to confirm the binding is present and the `chatTagBindingCount`/hash
  advanced — mirror of `applyChatLabelBindLibraryMetadataRequest`.

### 5. Idempotency

- `INSERT OR IGNORE` is naturally idempotent at the store level.
- Replay must detect already-bound from CURRENT canonical state, not the receipt ledger alone:
  `tags.getForChat(chatId)` includes `tagId` → emit `skipped_duplicate`
  (`library-metadata-mutation-request-already-bound-canonical`) without a redundant write. The receipt
  ledger check stays as a secondary guard.

### 6. Safety

- No tag deletion (no `DELETE FROM tags`).
- No tag catalog mutation (no insert/update/delete on the `tags` table; only a `tag_bindings` row is
  added).
- No chat / snapshot / asset / category / label / metadata deletion.
- No destructive carve-out needed: `chat-tag-bind` does not match
  `/(delete|remove|unbind|clear|purge|hard-delete)/i`, so the destructive guard is untouched and the
  `NON_DESTRUCTIVE_CLEAR_ALLOWLIST` set stays exactly `['chat-category-clear']`.

### 7. Chrome authority

- Chrome remains request-only and read-only over canonical metadata.
- No Chrome canonical mutation; `noChromeCanonicalMutation: true` throughout the request/receipt path.

### 8. Rehydration / conflict risk

- Desktop remains canonical authority; Chrome imports the projection read-only. Because bind is
  additive and applied via `INSERT OR IGNORE`, stale Chrome metadata cannot delete or downgrade a
  Desktop binding. A Phase 14H-style post-apply canonical-consistency guard should still be designed:
  the receipt's `resultingCanonicalHash` must equal the recomputed post-apply projection hash, and the
  request's `expectedCurrentBasisHash` drives the `stale_basis` path — preventing a stale request from
  being treated as fresh. No new rehydration suppression beyond the existing Phase 14H pattern is
  anticipated.

### 9. Validator / proof requirements

- Required deterministic validator (Phase 22): a request + Desktop validate/apply + receipt validator,
  mirror of `validate-labels-tags-categories-phase17-chat-label-bind.mjs`, proving apply via
  `tags.bindChat`, the full receipt taxonomy, and projection `chatTagBindingCount` increment + hash
  change; plus a guard test that the destructive carve-out is unchanged and no destructive `*-unbind`/
  `*-clear`/`*-delete` is unblocked.
- Required live runtime proof (Phase 23 or equivalent): an end-to-end live/in-process proof, mirror of
  `validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs`, covering request → apply →
  receipt → Chrome resolution → canonical export (binding count increment) → projection refresh, with
  replay idempotency (`skipped_duplicate`).
- Required negative gates: the applied allowlist must move from exactly three to exactly four
  `{chat-category-assign, chat-category-clear, chat-label-bind, chat-tag-bind}` and NO further; every
  `*-unbind`/`*-remove`/`*-clear` (other than the existing `chat-category-clear` carve-out), catalog
  create/rename/delete, and classification expansion must stay blocked/deferred.

### 10. Candidate Comparison

| Candidate | Store path | Projection support | Destructive? | Catalog mutation? | Gate A | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `chat-tag-bind` | `tags.bindChat` (INSERT OR IGNORE) exists | `chatTagBindingCount` + `hashes.chatTagBindings` exist | No (additive) | No | satisfied | **RECOMMENDED next** |
| `chat-label-unbind` | `labels.unbindChat` (DELETE) | binding count decrement | Yes (removal) | No | not satisfied | deferred (destructive) |
| `chat-label-clear` | bulk unbind (DELETE) | binding count to zero | Yes (removal) | No | not satisfied | deferred (destructive) |
| catalog create/rename | needs `tags`/`labels`/`categories` insert/update | catalog count/hash | No, but mutates catalog | Yes | not satisfied | deferred (catalog mutation + naming/collision policy) |
| classification expansion | new classification model | new projection surface | No | n/a | not satisfied | deferred (new canonical model) |

## Recommendation

Approve exactly one next request type: **`chat-tag-bind`**. It is the lowest-risk additive,
non-destructive type with full existing store + projection + request-shape support and a proven
sibling (`chat-label-bind`). All alternatives are destructive (unbind/clear), require catalog
mutation, or introduce a new canonical model, and remain deferred.

## Required Implementation Scope (Phase 22, if approved)

1. Add `'chat-tag-bind': true` to `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS` (Desktop) —
   moving the allowlist to exactly four types.
2. Add `applyChatTagBindLibraryMetadataRequest` using `tags.get` + `tags.bindChat` + post-write
   verification; wire it into the apply dispatch alongside the existing three.
3. Receipt taxonomy unchanged: applied / skipped_duplicate / stale_basis / rejected / deferred /
   invalid; hashed target refs (chatIdHash, tagIdHash), before/after assignment + projection hashes.
4. Chrome receipt import/resolution needs no change (matches by requestId/idempotencyKey regardless of
   requestType); add coverage anyway.
5. Status surface (Phase 10): add `chat-tag-bind` to `appliedRequestTypes` only after it is implemented
   and live-proven.
6. Phase 22 deterministic validator + Phase 23 live proof + negative guard test (per §9).

## Negative Gates (must remain blocked)

- `chat-label-unbind`, `chat-label-clear`, `chat-label-remove`
- `chat-tag-unbind`, `chat-tag-clear`, `chat-tag-remove`
- label/tag/category catalog create/rename/delete
- classification expansion
- generic delete/remove/unbind/clear/purge/hard-delete (no widened carve-out)
- WebDAV/cloud/relay transport

## Privacy / Safety / Idempotency Requirements

- Privacy: request/receipt stay hash/status/count only; no raw chat content/titles, no raw tag names,
  no account-linked metadata; `chatId`/`tagId` are opaque store IDs, never raw content.
- Safety: bind adds a `tag_bindings` row only; never deletes; never mutates the tag catalog; all
  no-delete flags (`noHardDelete`/`noPurge`/`noChatDelete`/`noSnapshotDelete`/`noAssetDelete`/
  `noLabelDelete`/`noTagDelete`/`noCategoryDelete`/`noMetadataDelete`) remain `true`.
- Idempotency: replay detects already-bound from current canonical state (`tags.getForChat`), not the
  receipt ledger alone; `INSERT OR IGNORE` guarantees no duplicate binding row.

## Product Metadata Sync Verdict

Product metadata sync remains globally NOT READY. `productSyncReady` stays `false`. Only the three
existing applied types are live-proven; `chat-tag-bind` is design-ready but not enabled.

## Phase 21 No-Change Statement

Phase 21 made no product behavior changes. It added only this design-audit evidence (and an optional
meta-validator). The applied allowlist, the destructive guard, the carve-out set, and all runtime
behavior are unchanged.

## Recommended Next Slice

Phase 22: implement `chat-tag-bind` per the Required Implementation Scope above (Gate B), behind the
exact four-type allowlist, followed by a Phase 23 live runtime proof (Gate C). Do not enable a fifth
applied type, add destructive actions, or add WebDAV/cloud/relay transport.
