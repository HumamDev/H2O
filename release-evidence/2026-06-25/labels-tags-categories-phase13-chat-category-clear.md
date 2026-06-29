# Labels / Tags / Categories / Classification Metadata Sync

## Phase 13: Guarded `chat-category-clear`

Date: 2026-06-29

## Scope

Phase 13 implements `chat-category-clear` as the second safe applied metadata request type, alongside
`chat-category-assign`.

`chat-category-clear` means clearing a chat's category assignment only. It is a non-destructive
reassignment-to-none: Desktop sets the target chat category to none/NULL. It never deletes a chat,
category, label, tag, metadata row, snapshot, asset, folder, or any other record.

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase13-chat-category-clear.md`

Compatibility validators updated for the new two-type safe loop:

- `tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase9-end-to-end-runtime-proof.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase10-status-display.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs`

## Exact Carve-Out Implementation

The destructive guard remains regex-based, but now includes an exact allowlist:

```js
var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);

function isDestructive(action) {
  var normalized = cleanString(action);
  return /(delete|remove|unbind|clear|purge|hard-delete)/i.test(normalized) &&
    !NON_DESTRUCTIVE_CLEAR_ALLOWLIST.has(normalized);
}
```

The allowlist is present on both surfaces:

- Chrome request/export surface: `folder-import.mv3.js` and `auto-import.mv3.js`
- Desktop import/apply surface: `folder-sync.tauri.js`

The carve-out allows exactly:

- `chat-category-clear`

It does not allow:

- `chat-label-clear`
- `chat-tag-clear`
- `category-clear`
- `metadata-clear`
- `chat-category-delete`
- `delete`
- `remove`
- `unbind`
- `purge`
- `hard-delete`
- any other `*-clear` or `*-delete` action

## Request Schema / Action Details

Request schema remains:

- `h2o.studio.library-metadata-mutation-request.v1`

New action spec:

```js
'chat-category-clear': {
  metadataKind: 'category',
  subjectKind: 'chat-category-assignment',
  operation: 'clear',
  requiresChatId: true,
  requiresId: false
}
```

Request payload:

```json
{
  "chatId": "<chat-id>",
  "conversationId": "<chat-id>",
  "entityId": null,
  "categoryId": null,
  "displayName": null
}
```

Idempotency key shape uses an empty target slot:

```text
library-metadata-mutation-request:chat-category-clear:category:<chatId>:-:-:<expectedCurrentBasisHash>
```

Chrome remains request-only:

- `desktopApplyRequired: true`
- `desktopApply: false`
- `noLocalApply: true`
- `noChromeCanonicalMutation: true`
- `chromeAuthority: false`
- `desktopAuthority: true`

## Desktop Apply Contract

Desktop applies only:

- `chat-category-assign`
- `chat-category-clear`

All other metadata request types remain deferred or rejected.

`chat-category-clear` validation:

- requires safe `chatId`
- does not require category/entity ID
- honors `expectedCurrentBasisHash`
- rejects missing chat
- preserves all no-delete/no-purge safety flags

Apply path:

```js
H2O.Studio.store.categories.clearChat(chatId)
```

The existing Desktop store path updates the chat row category assignment to none/NULL. It does not
delete the chat or the category.

Receipt statuses:

- `applied`
- `skipped_duplicate`
- `stale_basis`
- `rejected`
- `deferred`
- `invalid`

Replay behavior:

- If an applied receipt already exists for the request ID or idempotency key, replay emits
  `skipped_duplicate`.
- If the chat is already uncategorized, Desktop emits `skipped_duplicate` with
  `library-metadata-mutation-request-already-cleared-canonical`.

## Receipt Behavior

Receipt section remains:

- `libraryMetadataMutationReceipts[]`

Receipt schema remains:

- `h2o.studio.library-metadata-mutation-receipt.v1`

Receipts remain hash/status/count only. They do not include raw chat IDs, chat titles, chat content,
category names, label names, tag names, colors, or account-linked metadata.

Chrome Phase 8 receipt import resolves `chat-category-clear` receipts read-only by request ID /
idempotency key. No Chrome canonical mutation is added.

## Projection Decrement Proof

Projection decrement proof is covered by the Phase 13 validator.

The Phase 13 validator proves the full in-process loop:

1. Desktop canonical projection starts with one chat-category assignment.
2. Chrome creates a `chat-category-clear` request.
3. Desktop imports and applies it through `categories.clearChat(chatId)`.
4. Desktop projection after clear has:
   - `chatCategoryAssignmentCount: 0`
   - `classificationSignalCount: 0`
   - a changed projection hash
5. Chrome imports the Desktop projection and receipt.
6. Chrome reports projection counts/hash matching Desktop.
7. Replaying the request emits `skipped_duplicate` and does not call `clearChat` again.

## Runtime Proof Summary

Runtime proof is implemented as deterministic in-process validator coverage:

- Chrome request API: `H2O.Studio.sync.folder.requestLibraryMetadataMutation`
- Desktop import/apply API: `H2O.Studio.sync.folder.importChromeLatestBundle`
- Desktop projection API:
  `H2O.Studio.sync.libraryMetadataExportProjection.buildDesktopCanonicalMetadataExport`
- Chrome receipt import/projection API:
  `H2O.Studio.sync.folder.importLatestBundle`
- Chrome diagnostics/status API:
  `H2O.Studio.sync.libraryMetadataDiagnostics.captureMetadataSyncStatus`

No live DevTools proof was required for this implementation slice.

## Exact-Match Carve-Out Negative Tests

The Phase 13 validator checks that all of these remain blocked:

- `chat-label-clear`
- `chat-tag-clear`
- `category-clear`
- `metadata-clear`
- `chat-category-delete`
- `category-delete`
- `delete`
- `remove`
- `unbind`
- `purge`
- `hard-delete`

Only `chat-category-clear` is allowed through the `clear` substring guard.

## Privacy / No Raw Content

The request and receipt proof injects private sentinel strings and verifies they do not appear in:

- Chrome pending request mirror
- Desktop receipt
- Chrome status/projection proof output

Private data not exported:

- raw chat IDs in receipts/status
- raw chat titles
- raw chat content
- raw category names
- raw label/tag names
- account-linked metadata

## No-Delete / No-Purge Proof

Phase 13 does not add any delete, purge, hard-delete, unbind, snapshot delete, asset delete, folder
delete, or category delete behavior.

Preserved safety flags:

- `noHardDelete: true`
- `noPurge: true`
- `noChatDelete: true`
- `noSnapshotDelete: true`
- `noAssetDelete: true`
- `noLabelDelete: true`
- `noTagDelete: true`
- `noCategoryDelete: true`
- `noMetadataDelete: true`

## Status Surface

`captureMetadataSyncStatus()` now reports:

- applied/proven types:
  - `chat-category-assign`
  - `chat-category-clear`
- broader deferred request types:
  - catalog create/rename
  - label/tag binding
  - classification-set
- broader destructive shapes still deferred:
  - `chat-label-clear`
  - `chat-tag-clear`
  - `category-clear`
  - `metadata-clear`
  - delete/remove/unbind/purge/hard-delete variants

`chat-category-clear` is no longer listed as a deferred destructive shape.

## Validation Output

Commands to run:

```bash
git diff --check
git diff --cached --check
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check src-surfaces-base/studio/sync/auto-import.mv3.js
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js
node --check tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs
node --check tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs
node --check tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs
node --check tools/validation/sync/validate-labels-tags-categories-phase10-status-display.mjs
node --check tools/validation/sync/validate-labels-tags-categories-phase9-end-to-end-runtime-proof.mjs
node --check tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs
node tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs
node tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs
node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs
node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs --run-suite
node tools/validation/sync/validate-labels-tags-categories-phase10-status-display.mjs
node tools/validation/sync/validate-labels-tags-categories-phase9-end-to-end-runtime-proof.mjs
node tools/validation/sync/validate-labels-tags-categories-phase8-chrome-receipt-import.mjs
node tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs
node tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs
node tools/validation/sync/validate-labels-tags-categories-phase5-display-parity.mjs
node tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs
node tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs
node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/sync/validate-f15-cutover.mjs
```

Observed result:

- `git diff --check`: PASS
- `git diff --cached --check`: PASS after staging the scoped Phase 13 files.
- All changed JS/MJS `node --check` commands listed above: PASS.
- `validate-labels-tags-categories-phase13-chat-category-clear.mjs`: PASS.
  - `desktopAppliedCount: 1`
  - `desktopReplaySkippedDuplicateCount: 1`
  - `beforeChatCategoryAssignmentCount: 1`
  - `afterChatCategoryAssignmentCount: 0`
  - `chromeProjectionHashMatchesDesktop: true`
  - `chromeReceiptResolvedRequestCount: 1`
  - `exactMatchNegativeActionsChecked: 11`
- Phase 12 validator: PASS, now recognizes Phase 13 implementation evidence.
- Phase 11 validator: PASS.
- Phase 11 `--run-suite`: PASS.
- Phase 10 validator: PASS, reports runtime proven applied types
  `chat-category-assign, chat-category-clear`.
- Phase 9 validator: PASS with the current reviewed assign/clear allowlist.
- Phase 8, Phase 7, Phase 6, Phase 5, Phase 3, Phase 2, Phase 1 validators: PASS.
- F19 sync hardening validator: PASS.
- F15 cutover validator: PASS.

## Product Sync Verdict

Product metadata sync: NOT READY.

Phase 13 expands the safe applied metadata request set to category assignment and category clearing
only. Catalog create/rename, label/tag binding, classification-set, destructive metadata actions,
and broad product sync closeout remain deferred.

## Phase 13 Verdict

READY FOR REVIEW.

## Recommended Phase 14

Run live Desktop + Chrome runtime proof for `chat-category-clear`:

- Chrome create/export clear request
- Desktop import/apply/receipt
- Desktop latest export with decremented canonical projection
- Chrome receipt import/resolution
- Chrome projection refresh parity
- Replay idempotency
- no-delete/no-purge/no-canonical-Chrome-mutation proof
