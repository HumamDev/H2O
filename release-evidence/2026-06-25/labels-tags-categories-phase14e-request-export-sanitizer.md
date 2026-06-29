# Labels / Tags / Categories / Classification Sync — Phase 14E Request Export Sanitizer

Date: 2026-06-29

## Scope

Phase 14E diagnoses and narrowly fixes the Chrome `libraryMetadataMutationRequests[]` export sanitizer after Phase 14C/14D showed a valid pending `chat-category-clear` request in the Chrome mirror but `chrome-latest.json` exported zero metadata mutation requests.

This phase is limited to Chrome export validation and diagnostics. It does not change `chat-category-clear` semantics, Desktop apply behavior, Chrome canonical authority, transport, or applied request type policy.

## Context

- Phase 13 chat-category-clear implementation: `e463a884997f9b63057be7545d2c40bccbadbbc6`
- Phase 14B export-lock fix: `ecb0d279532398ba1a033c3827da9d41d279e0e6`
- Phase 14D export-lock follow-up evidence: `a3e106b3002da89ae5c83d590a08c53bace57b6b`

Phase 14C/14D live runtime showed:

- Chrome export succeeded.
- Pending mirror was available and healthy.
- Mirror contained one `chat-category-clear` request.
- Export summary reported `requestCount: 0`, `skippedCount: 1`, and `invalidCount: 1`.

## Files Inspected

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase14d-export-lock-followup.md`

## Root Cause

The Chrome request creator in `folder-import.mv3.js` correctly shaped `chat-category-clear` as an exact-match non-destructive clear request with:

- `action: chat-category-clear`
- `metadataKind: category`
- `subjectKind: chat-category-assignment`
- `operation: clear`
- `payload.chatId`
- `payload.categoryId: null`
- request-only and no-delete safety flags

The export collector in `auto-import.mv3.js` then re-sanitized mirror rows before writing `libraryMetadataMutationRequests[]`. Its parser chose `row.payload` before the full request row. For a valid mirror row, `row.payload` is the nested domain payload, not the request envelope. That nested request payload contains `chatId` and `categoryId: null`, but it does not contain the request envelope fields such as `schema`, `intent`, `status`, safety flags, or authority flags.

The result was a false invalid skip: the exporter validated the nested request payload as if it were the request envelope.

## Fix

Changed `parseLibraryMetadataMutationRequestPayload()` in `auto-import.mv3.js` to prefer the full request row when it already carries:

- `schema: h2o.studio.library-metadata-mutation-request.v1`

Only if the row is not already a full request envelope does the parser fall back to `row.payload`, tombstone JSON, or the row object.

This preserves compatibility with older/raw row shapes while making pending mirror rows export correctly.

## Invalid Reason Diagnostics

The export sanitizer now accepts an optional diagnostics object and records explicit invalid reason codes instead of silently returning `null`.

The collector now reports:

- `invalidReasons[]`
- `invalidReasonCounts{}`

Example reason codes include:

- `library-metadata-mutation-request-export-schema-invalid`
- `library-metadata-mutation-request-export-intent-invalid`
- `library-metadata-mutation-request-export-status-not-pending`
- `library-metadata-mutation-request-export-destructive-action-deferred`
- `library-metadata-mutation-request-export-action-unsupported`
- `library-metadata-mutation-request-export-chat-id-required`
- `library-metadata-mutation-request-export-identity-invalid`

This makes future live export skips diagnosable without weakening validation.

## Request Shape Proven

The Phase 14E validator uses the live Phase 14C/14D request shape:

- `schema: h2o.studio.library-metadata-mutation-request.v1`
- `version: 0.1.0-phase6`
- `action: chat-category-clear`
- `requestType: chat-category-clear`
- `status: pending`
- `metadataKind: category`
- `subjectKind: chat-category-assignment`
- `operation: clear`
- `chatId: writer_identity_debug_1782300179966`
- `payload.chatId: writer_identity_debug_1782300179966`
- `payload.conversationId: writer_identity_debug_1782300179966`
- `payload.categoryId: null`
- `expectedCurrentBasisHash: 3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07`

The validator proves this full row is accepted by the real `auto-import.mv3.js` sanitizer and exported with:

- `payload.categoryId: null`
- `payload.entityId: null`
- `requestOnly: true`
- `noChromeCanonicalMutation: true`
- no delete/purge safety flags preserved

## Exact-Match Carve-Out

The exact-match non-destructive carve-out remains:

```js
NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])
```

The validator proves the following actions remain blocked or unsupported:

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

No other `*-clear`, `*-delete`, delete, remove, unbind, purge, or hard-delete action is enabled.

## Safety Boundaries

Phase 14E preserves:

- Chrome remains request-only.
- Desktop remains canonical authority.
- Applied request types remain exactly `chat-category-assign` and `chat-category-clear`.
- No Chrome canonical mutation.
- No Desktop apply behavior changes.
- No WebDAV/cloud/relay transport.
- No delete, purge, hard-delete, chat delete, snapshot delete, asset delete, label delete, tag delete, category delete, or metadata delete behavior.

## Privacy

The sanitizer continues to export only request metadata needed for Desktop review/apply. It does not expose raw chat content, raw chat titles, or account-linked metadata. The validator checks that representative private title/content sent through the test path do not appear in the sanitized export result.

## Validation

Planned Phase 14E validation:

- `git diff --check`
- `git diff --cached --check`
- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check tools/validation/sync/validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs --run-suite`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`
- `node tools/validation/sync/validate-f15-cutover.mjs`

## Phase 14E Verdict

Phase 14E implementation verdict: READY FOR REVIEW.

Root cause fixed: valid pending mirror request rows are no longer parsed as their nested request payload during Chrome export sanitization.

Product metadata sync: NOT READY.

## Retry Guidance

Phase 14C live proof should be retried from the Chrome export step using the existing pending `chat-category-clear` request if it is still present and still based on the same Desktop projection hash. If the request basis is stale, create a new `chat-category-clear` request against the current Desktop projection and rerun Chrome export.

Expected next live check:

1. Chrome exports `libraryMetadataMutationRequests[]` with `requestCount: 1`.
2. Desktop imports `chrome-latest.json`.
3. Desktop applies `chat-category-clear` through `H2O.Studio.store.categories.clearChat(chatId)`.
4. Desktop emits `libraryMetadataMutationReceipts[]`.
5. Chrome imports the receipt read-only and resolves the pending request.

## Recommended Next Slice

Phase 14C rerun from Chrome export step after this sanitizer fix. Keep the scope runtime proof only unless another narrow export/import blocker appears.
