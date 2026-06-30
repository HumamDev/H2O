# Labels / Tags / Categories / Classification Sync - Phase 15 Readiness Audit

Date: 2026-06-30

## Scope

This Phase 15 audit covers the currently live-proven safe applied chat-category metadata request loop only:

- `chat-category-assign`
- `chat-category-clear`

This is an evidence/readiness audit. It does not change product behavior, add metadata actions, broaden applied request types, add destructive behavior, allow Chrome canonical mutation, or add WebDAV/cloud/relay transport.

## Context Commits

- Phase 9 end-to-end runtime proof for `chat-category-assign`: `ede1f66`
- Phase 13 `chat-category-clear` implementation: `e463a884997f9b63057be7545d2c40bccbadbbc6`
- Phase 14E request export sanitizer fix: `3075014af6ee13971791616db542dc24170ad0d6`
- Phase 14F clear apply-state verification fix: `189ccd9e4574e2aac7c5d48d748a9d6e684db128`
- Phase 14G live runtime marker diagnostic: `103623809d0a93a5f2b05f80a12b2d8e8abf9d18`
- Phase 14H stale category rehydration guard: `8fc2f2f6b036b30b034a89b3ee4251330d4b045d`
- Phase 14C after-14H live proof: `b9ef22be12fdce2073a5015ac68ae8b679218435`

## Live-Proven Applied Type Status

### chat-category-assign

Status: READY FOR REVIEW as a safe applied chat-category request type.

Phase 9 proved the end-to-end loop for `chat-category-assign`:

- Chrome exports the mutation as an intent/request envelope.
- Chrome remains request-only and does not mutate canonical metadata.
- Desktop imports and validates the request.
- Desktop applies through the Desktop-authoritative store path.
- Desktop emits `libraryMetadataMutationReceipts[]`.
- Desktop exports the canonical metadata projection.
- Chrome imports the receipt/projection read-only and resolves the pending request.
- Replay/idempotency behavior prevents duplicate application.
- No delete, purge, or Chrome canonical mutation behavior is introduced.

### chat-category-clear

Status: READY FOR REVIEW as a safe applied chat-category request type.

Phase 13 implemented the exact-match non-destructive clear carve-out for `chat-category-clear`. Phase 14E fixed request envelope export sanitization, Phase 14F added post-apply canonical verification, Phase 14G proved the live Desktop runtime loaded the verification markers, Phase 14H guarded against stale category rehydration, and the Phase 14C after-14H live proof passed.

The live Phase 14C after-14H proof showed:

- Chrome created/exported a `chat-category-clear` request with `noChromeCanonicalMutation`, no-delete, and no-purge safety flags.
- Desktop imported one request and reviewed it through the Desktop apply lane.
- The applied receipt for the request recorded a transition from projection hash `3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07` to `a349b709834e64a5c48ac404a1d872c6fea7cced238574fe375846a195484b7c`.
- The canonical assignment count was 27 after clear.
- Chrome imported the Desktop receipt read-only and resolved the request.
- Follow-up import kept the category cleared, kept `getForChat` null, kept assignment count at 27, kept the cleared projection hash, and observed `suppressionWarningSeen: true`.

## Chrome Role

Chrome remains request-only for metadata mutations.

- Chrome exports metadata intent envelopes through `libraryMetadataMutationRequests[]`.
- Chrome keeps `desktopCanonicalLibraryMetadata` as a read-only projection.
- Chrome imports `libraryMetadataMutationReceipts[]` read-only for request resolution.
- Chrome does not write Desktop canonical metadata.
- Chrome does not mutate Chrome canonical metadata.
- Chrome does not apply requests locally.
- Chrome does not delete chats, snapshots, assets, labels, tags, categories, folders, or metadata.

Relevant source anchors:

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])`
- `productSyncReady: false`
- `markLibraryMetadataMutationRequestsResolvedByReceipts`

## Desktop Role

Desktop remains canonical authority.

- Desktop validates Chrome-origin request envelopes.
- Desktop applies only the reviewed allowlist: `chat-category-assign` and `chat-category-clear`.
- Desktop rejects, defers, or skips unsupported, unsafe, stale, duplicate, destructive-shaped, or malformed requests.
- Desktop emits receipts for reviewed requests.
- Desktop exports canonical metadata projection from Desktop state.
- Desktop Phase 14H import guard prevents stale Chrome category binding data from rehydrating a chat category after an applied `chat-category-clear` receipt.

Relevant source anchors:

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS`
- `chat-category-assign`
- `chat-category-clear`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `appliedChatCategoryClearReceiptChatHashes`
- `sha256Hex('chat:' + id)`
- `library-metadata-category-rehydration-suppressed-after-clear`

## Safety Guarantees

The proven applied loop preserves these boundaries:

- `noHardDelete`
- `noPurge`
- `noChatDelete`
- `noSnapshotDelete`
- `noAssetDelete`
- `noLabelDelete`
- `noTagDelete`
- `noCategoryDelete`
- `noMetadataDelete`

`chat-category-clear` clears only the chat category assignment. It does not delete the chat, category catalog row, labels, tags, metadata rows, snapshots, assets, folders, or anything else.

Generic destructive-shaped actions remain blocked/deferred, including:

- `delete`
- `remove`
- `unbind`
- `purge`
- `hard-delete`
- category-wide clear/delete
- generic metadata clear/delete/remove/unbind/purge/hard-delete
- any non-allowlisted `*-clear` or `*-delete` action

## Privacy Guarantees

The proven loop preserves the privacy posture established in earlier phases:

- Redacted/hash-only evidence and diagnostics.
- No raw chat content.
- No raw chat titles.
- No raw chat IDs in guard output where hash matching is required.
- No raw category names in guard output.
- No raw label names in guard output.
- No raw tag names in guard output.
- No raw colors in guard output.
- No account-linked metadata.

Phase 14H specifically matches protected chats by `sha256("chat:" + chatId)` only and does not emit raw chat IDs, titles, content, category names, label names, tag names, colors, or account-linked metadata from the guard.

## Phase 14H Guard Status

Status: ACTIVE and live-proven.

The Phase 14H stale category rehydration guard prevents stale Chrome category metadata from rehydrating a category after an applied `chat-category-clear` receipt.

Guard behavior:

- Finds applied `chat-category-clear` receipts.
- Computes protected chat hashes with `sha256("chat:" + chatId)`.
- Suppresses stale category binding import when the incoming chat binding matches an applied clear receipt by hash.
- Emits `library-metadata-category-rehydration-suppressed-after-clear` without raw chat identifiers.
- Does not delete or purge any row.

The Phase 14C after-14H follow-up import proof recorded:

- `categoryStayedCleared: true`
- `getForChatStayedNull: true`
- `assignmentCountStayed27: true`
- `projectionHashStayedCleared: true`
- `suppressionWarningSeen: true`

## Idempotency And Replay

The safe loop is idempotent for the proven applied types.

For `chat-category-clear`:

- Applied clear followed by replay yields `skipped_duplicate`.
- Duplicate detection uses current canonical state, not receipt ledger alone.
- Phase 14G marker confirms `duplicateDetectionUsesCurrentCanonicalState: true`.
- Phase 14F/14G markers confirm applied receipts require canonical post-write verification.
- A stale applied receipt cannot mask a current canonical category that is still present.

For `chat-category-assign`:

- Phase 9 proved the safe request/apply/receipt/resolution loop and replay/idempotency behavior for the assign path.

## Deferred And Not-Ready Areas

The following remain deferred and not ready:

- label create/rename/delete
- tag create/rename/delete
- category create/rename/delete
- label binding/unbinding
- tag binding/unbinding
- category-wide clear/delete
- generic metadata clear/delete/remove/unbind/purge/hard-delete
- classification expansion beyond the proven chat-category loop
- WebDAV/cloud/relay transport
- broad product metadata sync closeout

These deferred areas must not be treated as implemented by this readiness audit.

## Validator Coverage

Phase 15 adds:

- `tools/validation/sync/validate-labels-tags-categories-phase15-readiness-audit.mjs`

The validator checks:

- this evidence file exists and names both live-proven applied types,
- broader product metadata sync remains `NOT READY`,
- deferred destructive and broader metadata actions are listed,
- Chrome request-only and Desktop authority boundaries are preserved,
- Phase 14H guard and Phase 14C after-14H live proof are referenced,
- source allowlists still expose exactly `chat-category-assign` and `chat-category-clear` as applied request types,
- the exact-match `chat-category-clear` carve-out remains narrow,
- the Phase 14H guard still uses `sha256("chat:" + chatId)` matching,
- read-only Chrome receipt resolution and `productSyncReady: false` anchors remain present.

## Final Verdict

Safe applied chat-category request loop: READY FOR REVIEW for `chat-category-assign` and `chat-category-clear` only.

Product metadata sync: NOT READY globally.

The live-proven safe loop is intentionally narrow. Broader labels, tags, categories, classification, destructive-shaped actions, catalog mutations, binding/unbinding, category-wide clear/delete, and WebDAV/cloud/relay transport remain deferred.

## Recommended Next Slice

Recommended next slice: Phase 15 closeout review/commit, then a Phase 16 design audit for the next single metadata request type if one is selected.

Do not start broader metadata mutation support without a separate design/evidence phase that preserves Chrome request-only behavior, Desktop authority, privacy redaction, idempotency, receipts, and no-delete/no-purge boundaries.
