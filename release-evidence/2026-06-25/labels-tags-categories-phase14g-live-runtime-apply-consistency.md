# Labels / Tags / Categories / Classification Sync — Phase 14G Live Runtime Apply Consistency

Date: 2026-06-30

## Verdict

- Phase 14G diagnosis: BLOCKED pending live runtime provenance check
- Product code semantics changed: NO
- Diagnostic marker added: YES, read-only only
- Phase 14C should restart with a fresh request after Desktop rebuild/reload: YES
- Product metadata sync: NOT READY

## Scope

Phase 14G investigates why the Phase 14F Desktop apply-state verification fix passed validators but
the live Desktop runtime still emitted an `applied` receipt for `chat-category-clear` while the
current canonical store and projection remained unchanged.

This phase does not change `chat-category-clear` semantics, does not broaden applied metadata
request types, and does not add destructive behavior or transport.

## Context

- Phase 14E request export sanitizer fix: `3075014af6ee13971791616db542dc24170ad0d6`
- Phase 14F clear apply-state verification fix: `189ccd9e4574e2aac7c5d48d748a9d6e684db128`
- Current live contradiction came from a fresh Phase 14C rerun after Phase 14F.

## Fresh Live Inputs

Desktop baseline:

```json
{
  "chatId": "d3b2_inbox_chat_1782391840992",
  "startingCategoryId": "cat_general_misc",
  "startingProjectionAssignmentCount": 28,
  "startingProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07"
}
```

Chrome request:

```json
{
  "requestId": "library-metadata-mutation-request:2ea960b2-1fd6-4ff3-a5de-02f52ae12251",
  "action": "chat-category-clear",
  "requestType": "chat-category-clear",
  "status": "pending",
  "chatId": "d3b2_inbox_chat_1782391840992",
  "expectedCurrentBasisHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "noChromeCanonicalMutation": true,
  "noHardDelete": true,
  "noPurge": true,
  "noChatDelete": true,
  "noCategoryDelete": true,
  "noMetadataDelete": true
}
```

Manual Desktop import/apply output:

```text
importResult.ok: true
importResult.status: imported
sourceSummary.libraryMetadataMutationRequestCount: 0
libraryMetadataMutationRequestImport.status: no-library-metadata-mutation-requests
libraryMetadataMutationRequestImport.requestCount: 0
libraryMetadataMutationRequestAutoApply.status: no-library-metadata-mutation-requests
libraryMetadataMutationRequestAutoApply.requestCount: 0
```

Matching receipt observed separately:

```json
{
  "receiptId": "library-metadata-mutation-receipt:library-metadata-mutation-request:2ea960b2-1fd6-4ff3-a5de-02f52ae12251:applied",
  "status": "applied",
  "code": "library-metadata-mutation-request-applied",
  "appliedAt": "2026-06-30T10:05:42.909Z",
  "beforeProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "resultingCanonicalHash": "8dc4e3cf94b3f150f872b72ccb4f085116dd5dc7acfc2c8dcfdc38f6e7671498",
  "counts": {
    "chatCategoryAssignmentCount": 27,
    "classificationSignalCount": 27
  }
}
```

Actual current Desktop state after that receipt:

```json
{
  "beforeCategoryId": "cat_general_misc",
  "afterCategoryId": "cat_general_misc",
  "afterCategoryForChatCategoryId": "cat_general_misc",
  "beforeProjectionAssignmentCount": 28,
  "afterProjectionAssignmentCount": 28,
  "beforeProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "afterProjectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "categoryCleared": false,
  "countDecrementedByOne": false,
  "projectionHashChanged": false
}
```

## Files Inspected

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `apps/studio/desktop/dist/sync/folder-sync.tauri.js`
- `apps/extensions/chatgpt/chrome/prod/surfaces/studio/sync/folder-sync.tauri.js`
- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `apps/studio/desktop/package.json`
- `apps/studio/desktop/build-tools/prepare-dist.mjs`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs`

## Static Findings

The current source and packed repo copies of `sync/folder-sync.tauri.js` contain the Phase 14F
verification markers:

- `library-metadata-mutation-request-category-clear-not-reflected`
- `library-metadata-mutation-request-category-clear-projection-not-reflected`
- `canonicalLibraryMetadataMutationDuplicateReceiptData`
- `library-metadata-mutation-request-applied-receipt-canonical-mismatch`

The checked copies have the same SHA-256:

```text
1f1e14d7c63ac80199097eb39e204b1d8577c9c57f75d66df21c3c7edde3b594
```

Covered paths:

- source: `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- Desktop dist: `apps/studio/desktop/dist/sync/folder-sync.tauri.js`
- Chrome prod Studio copy: `apps/extensions/chatgpt/chrome/prod/surfaces/studio/sync/folder-sync.tauri.js`
- Chrome launcher Studio copy: `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/sync/folder-sync.tauri.js`

The committed Phase 14F apply path should reject a `chat-category-clear` if, after
`H2O.Studio.store.categories.clearChat(chatId)`, `H2O.Studio.store.chats.get(chatId)` still returns a
category or the Desktop canonical projection does not decrement/change hash.

The manual Desktop import output reported `requestCount: 0`, so that manual import call cannot be
the same operation that produced the observed `applied` receipt. The applied receipt must have been
created by an earlier/background import, a stale running Desktop WebView, or another live operation
not captured in the manual import result.

## Root Cause Assessment

The repo state does not reproduce a source-level Phase 14F guard failure.

Most likely root cause:

- the live Desktop runtime was stale or unreloaded and did not execute the Phase 14F guarded apply
  code; or
- the applied receipt came from a background/event apply invocation before the later manual import
  read a `chrome-latest.json` with no `libraryMetadataMutationRequests[]`.

The next live check must explicitly distinguish stale or unreloaded Desktop runtime from an actual
apply consistency defect.

The current evidence is insufficient to prove which live path created the receipt because the live
Desktop surface did not expose an explicit runtime marker for the Phase 14F clear verification
contract.

## Diagnostic Change

Added a read-only diagnostic marker to `H2O.Studio.sync.folder.diagnose()`:

```text
libraryMetadataMutationApplyRuntime
```

Marker schema:

```text
h2o.studio.library-metadata-mutation.apply-runtime-diagnostic.v1
```

Marker phase:

```text
phase14g-live-runtime-apply-consistency
```

The marker reports:

- applied request types are exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- non-destructive clear allowlist is exactly:
  - `chat-category-clear`
- `chat-category-clear` applies through:
  - `H2O.Studio.store.categories.clearChat(chatId)`
- clear verification flags:
  - `verifiesCanonicalChatRowAfterClear: true`
  - `rejectsIfCategoryStillPresent: true`
  - `rejectsIfProjectionNotDecremented: true`
  - `duplicateDetectionUsesCurrentCanonicalState: true`
  - `staleAppliedReceiptDoesNotMaskCanonicalState: true`
- receipt contract:
  - `appliedRequiresPostWriteCanonicalVerification: true`
  - `appliedRequiresProjectionHashChangeForClear: true`
  - `skippedDuplicateRequiresCurrentCanonicalTargetReached: true`

This marker is diagnostic-only. It does not apply requests, write storage, mutate Desktop
canonical metadata, mutate Chrome canonical metadata, or change request/receipt semantics.

## Why No Semantic Fix Was Made

Current source already contains the Phase 14F semantic fix:

- re-read canonical chat row after clear
- reject if category remains
- reject if projection count/hash does not reflect clear
- duplicate detection checks current canonical state, not receipt ledger alone

Adding another semantic fix without proving the live runtime version would be speculative. Phase 14G
therefore adds only runtime provenance diagnostics and records the rebuild/reload requirement.

## Exact Next Runtime Step

First rebuild/reload Desktop so the diagnostic marker is actually present in the running WebView.

Terminal, from the repo root:

```bash
npm run dev:rebuild
npm run dev:all
node tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs
npm --workspace apps/studio/desktop run prepare-dist
npm --workspace apps/studio/desktop run tauri:dev
```

Then run this once in Desktop Studio DevTools before creating a new clear request:

```js
copy(JSON.stringify(await (async () => {
  const folder = H2O?.Studio?.sync?.folder;
  const diag = folder?.diagnose ? folder.diagnose() : null;
  const marker = diag?.libraryMetadataMutationApplyRuntime || null;
  const scriptText = await fetch(new URL('./sync/folder-sync.tauri.js', location.href)).then((r) => r.text());
  return {
    phase: 'phase14g-runtime-marker-check',
    href: location.href,
    apiInstalled: !!folder,
    marker,
    scriptMarkers: {
      categoryClearNotReflected: scriptText.includes('library-metadata-mutation-request-category-clear-not-reflected'),
      categoryClearProjectionNotReflected: scriptText.includes('library-metadata-mutation-request-category-clear-projection-not-reflected'),
      canonicalDuplicate: scriptText.includes('canonicalLibraryMetadataMutationDuplicateReceiptData'),
      appliedReceiptCanonicalMismatch: scriptText.includes('library-metadata-mutation-request-applied-receipt-canonical-mismatch')
    }
  };
})(), null, 2));
```

Expected marker checks:

```text
marker.phase: phase14g-live-runtime-apply-consistency
marker.chatCategoryClear.verifiesCanonicalChatRowAfterClear: true
marker.chatCategoryClear.rejectsIfCategoryStillPresent: true
marker.chatCategoryClear.rejectsIfProjectionNotDecremented: true
marker.receiptContract.appliedRequiresPostWriteCanonicalVerification: true
```

If the marker is missing, the live Desktop runtime is stale or not running the current bundle. Do not
rerun Phase 14C until Desktop is rebuilt/reloaded and this marker is visible.

If the marker is present, restart Phase 14C with a fresh Chrome `chat-category-clear` request from
the current Desktop projection and capture the Desktop import/apply result immediately from the same
operation that reads the request.

## Safety Boundaries

Preserved:

- Applied request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- `chat-category-clear` remains a non-destructive reassignment-to-none only.
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
tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs
```

The validator proves:

- `diagnose()` exposes `libraryMetadataMutationApplyRuntime`.
- Applied request types remain exactly `chat-category-assign` and `chat-category-clear`.
- Exact-match `chat-category-clear` carve-out remains intact.
- Phase 14F post-clear canonical row and projection verification markers remain present.
- Stale applied receipt mismatch warning remains present.
- No delete/purge/destructive behavior is introduced.
- Product metadata sync remains not ready.

## Validation

Planned validation:

- `git diff --check`
- `git diff --cached --check`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`
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

## Phase 14G Verdict

Phase 14G verdict: READY FOR REVIEW after validator pass, but live Phase 14C remains blocked until
the Desktop runtime marker is confirmed.

Product metadata sync: NOT READY.

## Recommended Next Slice

Phase 14C rerun after Desktop rebuild/reload:

1. Confirm `libraryMetadataMutationApplyRuntime.phase === "phase14g-live-runtime-apply-consistency"`
   in Desktop Studio DevTools.
2. Create a fresh Chrome `chat-category-clear` request from the current Desktop projection hash.
3. Export Chrome request into `chrome-latest.json`.
4. Import once on Desktop and capture the same import result that sees `requestCount: 1`.
5. Verify Desktop canonical row clears, projection count decrements, projection hash changes, and
   receipt status is `applied`.
6. Replay the same request and verify `skipped_duplicate`.
