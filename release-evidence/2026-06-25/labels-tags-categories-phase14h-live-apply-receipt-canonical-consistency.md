# Labels / Tags / Categories / Classification Sync — Phase 14H Live Apply Receipt Canonical Consistency

Date: 2026-06-30

## Verdict

- Phase 14H diagnosis: FIX IMPLEMENTED
- Root cause: stale Chrome category metadata could rehydrate a Desktop-cleared chat category on a later import after an applied clear receipt had already been emitted.
- Product semantics changed: narrowly, import now suppresses stale category binding rehydration for chats protected by an applied Desktop `chat-category-clear` receipt.
- Applied request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- Product metadata sync: NOT READY

## Scope

Phase 14H diagnoses and fixes the remaining live contradiction after Phase 14G proved the Desktop
runtime had the Phase 14F/14G code loaded.

This phase does not change Chrome request semantics, does not broaden Desktop applied request types,
does not add destructive behavior, and does not add WebDAV/cloud/relay transport.

## Live Inputs

Phase 14G marker proof confirmed the live Desktop WebView had the expected apply verification code:

- `phase: phase14g-live-runtime-apply-consistency`
- `verifiesCanonicalChatRowAfterClear: true`
- `rejectsIfCategoryStillPresent: true`
- `rejectsIfProjectionNotDecremented: true`
- `duplicateDetectionUsesCurrentCanonicalState: true`

Fresh live proof then used:

```json
{
  "chatId": "d2c_request_materializer_chat_1782334865884",
  "startingCategoryId": "cat_general_misc",
  "startingAssignmentCount": 28,
  "startingProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "requestId": "library-metadata-mutation-request:28bd4725-f504-4ee6-971f-58b7f41b36c8",
  "action": "chat-category-clear"
}
```

Manual Desktop `syncNow({ direction: "chrome-to-desktop" })` later reported:

```text
sourceSummary.libraryMetadataMutationRequestCount: 0
libraryMetadataMutationRequestImport.status: no-library-metadata-mutation-requests
libraryMetadataMutationRequestAutoApply.status: no-library-metadata-mutation-requests
```

But the receipt mirror contained an applied receipt for the request:

```json
{
  "status": "applied",
  "code": "library-metadata-mutation-request-applied",
  "beforeProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "resultingCanonicalHash": "c3a84f9701b732654156cff9bb9e3fbde5a0fa4652fb6fdbf0e7aea2fcd16b58",
  "counts": {
    "chatCategoryAssignmentCount": 27,
    "classificationSignalCount": 27
  }
}
```

The current Desktop canonical store/projection then showed the category was restored:

```json
{
  "afterCategoryId": "cat_general_misc",
  "afterCategoryForChatCategoryId": "cat_general_misc",
  "afterAssignmentCount": 28,
  "afterProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "categoryCleared": false,
  "countDecrementedByOne": false,
  "projectionHashChanged": false
}
```

## Files Inspected

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs`

## Root Cause

The live contradiction was not caused by stale Desktop runtime and not by a separate apply function.
Phase 14G proved the live Desktop loaded the Phase 14F guard code.

The concrete issue was import ordering across multiple Chrome exports:

1. Desktop imports `chrome-latest.json`.
2. `importBundle()` merges Chrome bundle data first.
3. `autoApplyLibraryMetadataMutationRequestsFromChromeBundle()` applies metadata requests after the
   bundle merge.
4. A run containing the pending `chat-category-clear` can apply correctly and emit an applied
   receipt.
5. A later Chrome export can omit the now-resolved request while still carrying stale
   `chatIndex.organization.categoryId`.
6. A later Desktop import with `requestCount: 0` can still run the library binding import path and
   rehydrate `chats.category_id` from that stale Chrome category metadata.

That explains why the latest manual import saw zero metadata mutation requests while the receipt
mirror still contained an applied receipt and the current canonical store had the old category again.

## Fix

Added a narrow guard in `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`.

During library binding import, Desktop now reads the Desktop receipt export mirror:

```text
h2o:studio:library-metadata-mutation-receipts:export:v1
```

If an applied receipt exists for:

- `requestAction` or `requestType`: `chat-category-clear`
- `status`: `applied`
- matching `target.chatIdHash`

then incoming Chrome category metadata for that chat is treated as stale and is not passed into the
bulk `chatCategories` assignment list.

The match is hash-only:

```text
sha256("chat:" + chatId)
```

No raw chat IDs, titles, content, category names, colors, or account-linked metadata are written to
the diagnostic guard output.

## Diagnostic Output

When suppression occurs, import result includes:

```json
{
  "libraryMetadataMutationCategoryRehydrationGuard": {
    "schema": "h2o.studio.library-metadata.category-rehydration-guard.v1",
    "phase": "phase14h-live-apply-receipt-canonical-consistency",
    "suppressedCount": 1,
    "reason": "desktop-applied-chat-category-clear-receipt",
    "rawChatIdsReturned": false,
    "noDelete": true,
    "noPurge": true,
    "noChromeCanonicalMutation": true
  }
}
```

And warning:

```text
library-metadata-category-rehydration-suppressed-after-clear
```

## Safety Boundaries

Preserved:

- Applied request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- `chat-category-clear` remains a non-destructive reassignment-to-none.
- Chrome remains request-only.
- Desktop remains canonical authority.
- No Chrome canonical mutation.
- No chat delete.
- No category delete.
- No label/tag delete.
- No metadata row delete.
- No snapshot or asset delete.
- No folder delete.
- No purge or hard delete.
- No WebDAV/cloud/relay transport.

## Validator

Added:

```text
tools/validation/sync/validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs
```

The validator proves:

- The real `importBundle()` allows category binding import normally when no applied clear receipt
  protects the chat.
- The real `importBundle()` suppresses stale Chrome category rehydration when an applied
  `chat-category-clear` receipt protects the chat hash.
- Suppression emits `libraryMetadataMutationCategoryRehydrationGuard`.
- Suppression emits `library-metadata-category-rehydration-suppressed-after-clear`.
- Receipt matching is hash-only.
- Phase 14F post-clear verification remains present.
- No delete/purge/destructive behavior is introduced.
- Product metadata sync remains not ready.

## Validation

Planned validation:

- `git diff --check`
- `git diff --cached --check`
- `node --check src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `node --check tools/validation/sync/validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs --run-suite`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`
- `node tools/validation/sync/validate-f15-cutover.mjs`

## Phase 14H Verdict

Phase 14H verdict: READY FOR REVIEW after validator pass.

Product metadata sync: NOT READY.

## Exact Next Runtime Step

Rerun Phase 14C with a fresh request after rebuilding/reloading Desktop and Chrome surfaces.

Expected proof:

1. Confirm Phase 14G marker is present in Desktop.
2. Pick a currently categorized Desktop chat.
3. Create a fresh Chrome `chat-category-clear` request using the current Desktop projection hash.
4. Export Chrome `chrome-latest.json` and confirm `libraryMetadataMutationRequests[]` has the
   request.
5. Desktop import should apply the clear and emit an applied receipt.
6. A follow-up Desktop import from a Chrome export with no request must not rehydrate the old
   category. If stale Chrome category metadata is present, import should report
   `library-metadata-category-rehydration-suppressed-after-clear`.
7. Desktop canonical store and projection should remain cleared.

## Recommended Next Slice

Phase 14C live rerun again, from a fresh request, specifically checking the new rehydration guard on
the post-receipt/no-request import.
