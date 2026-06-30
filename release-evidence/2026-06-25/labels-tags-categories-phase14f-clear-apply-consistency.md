# Labels / Tags / Categories / Classification Sync — Phase 14F Clear Apply Consistency

Date: 2026-06-30

## Scope

Phase 14F diagnoses and narrowly fixes the Desktop-side `chat-category-clear` apply/receipt
consistency issue exposed during the Phase 14C live rerun.

This phase does not change Chrome request semantics, does not broaden applied metadata request
types, and does not add transport or destructive behavior.

## Context

- Phase 13 `chat-category-clear` implementation: `e463a884997f9b63057be7545d2c40bccbadbbc6`
- Phase 14B export-lock fix: `ecb0d279532398ba1a033c3827da9d41d279e0e6`
- Phase 14D blocked export evidence: `a3e106b3002da89ae5c83d590a08c53bace57b6b`
- Phase 14E request export sanitizer fix: `3075014af6ee13971791616db542dc24170ad0d6`

## Live Finding

Phase 14C progressed past Chrome export after Phase 14E:

- `libraryMetadataMutationRequestExport.requestCount: 1`
- `pendingRequestCount: 1`
- `skippedCount: 0`
- `invalidCount: 0`
- request action: `chat-category-clear`

Desktop then imported the request and emitted receipts, including an applied receipt, but the current
Desktop canonical store and projection still showed the chat assigned to:

```text
cat_software_development
```

The contradiction was:

- receipt ledger said `applied`
- later replay said `skipped_duplicate`
- current canonical row still had the old category
- current projection still had the original assignment count and projection hash

## Files Inspected

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs`

## Root Cause

Two Desktop-side consistency gaps could produce the live contradiction.

First, `autoApplyLibraryMetadataMutationRequestsFromChromeBundle()` checked the existing receipt
ledger for an `applied` receipt before checking current canonical state. If an earlier applied
receipt existed for the request ID or idempotency key, replay produced `skipped_duplicate` even when
the current `chats.category_id` still showed the category assignment.

Second, `applyChatCategoryClearLibraryMetadataRequest()` trusted `categories.clearChat(chatId)` once
it returned `true`. It captured the post-apply projection and emitted `applied` without re-reading
the canonical chat row to prove `category_id` was actually clear. That allowed a reported-success
no-op, identifier mismatch, stale store write, or wrong-store write to become an applied receipt.

## Fix

The Desktop apply path now uses current canonical state as the source of truth for duplicate and
applied decisions.

Changes in `folder-sync.tauri.js`:

- Added `canonicalLibraryMetadataMutationDuplicateReceiptData()`.
- Replay now produces `skipped_duplicate` only when the current canonical chat row already reflects
  the requested target:
  - `chat-category-clear`: current category is already empty.
  - `chat-category-assign`: current category already equals the requested category.
- Existing applied receipts no longer mask uncleared canonical state. If an applied receipt exists
  but the canonical target is not reached, Desktop adds warning:
  `library-metadata-mutation-request-applied-receipt-canonical-mismatch`
  and continues to validate/apply against the current store.
- `chat-category-clear` now re-reads `chats.get(chatId)` after `categories.clearChat(chatId)`.
- `chat-category-clear` now rejects with
  `library-metadata-mutation-request-category-clear-not-reflected` if the canonical chat row still
  has a category.
- `chat-category-clear` now rejects with
  `library-metadata-mutation-request-category-clear-projection-not-reflected` if the post-clear
  projection does not show the assignment-count decrement and projection hash change.
- Apply result accounting now treats an apply-path `stale_basis` result as stale, not rejected.

## Receipt Contract

Desktop should emit `applied` only when all of these are true:

- request validation passes
- current basis is not stale unless the current canonical target is already reached
- `categories.clearChat(chatId)` returns success
- `chats.get(chatId)` returns no category after the clear
- Desktop canonical projection decrements `chatCategoryAssignmentCount`
- Desktop canonical projection hash changes

If any post-write verification fails, the receipt is `rejected`, not `applied`.

Replay/idempotency is based on current canonical state, not receipt-ledger presence alone.

## Safety Boundaries

Preserved:

- Applied request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- `chat-category-clear` only clears the chat category assignment.
- No chat delete.
- No category delete.
- No label/tag delete.
- No metadata row delete.
- No snapshot or asset delete.
- No purge or hard delete.
- No Chrome canonical mutation.
- No WebDAV/cloud/relay transport.

## Validator

Added:

```text
tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs
```

The validator proves:

- A successful clear emits an applied receipt only after canonical row and projection reflect clear.
- Assignment count decrements and projection hash changes.
- Replay after actual clear yields `skipped_duplicate` without calling `clearChat()` again.
- A `clearChat()` reported-success no-op is rejected with
  `library-metadata-mutation-request-category-clear-not-reflected`.
- An older applied receipt cannot mask an uncleared canonical row.
- No delete/purge/destructive behavior is introduced.
- Product metadata sync remains not ready.

## Validation

Planned validation:

- `git diff --check`
- `git diff --cached --check`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs --run-suite`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`
- `node tools/validation/sync/validate-f15-cutover.mjs`

## Phase 14F Verdict

Phase 14F implementation verdict: READY FOR REVIEW after validator pass.

Product metadata sync: NOT READY.

## Recommended Next Slice

Rerun Phase 14C from the Desktop import/apply step using the same exported `chrome-latest.json` if
the request basis still matches current Desktop canonical state. If the basis is stale, create a new
Chrome `chat-category-clear` request from the current Desktop projection and rerun the live loop.
