# Operational.5 - Orphan-Binding Provenance Search

Verdict: **OPERATIONAL.5 ORPHAN-BINDING PROVENANCE SEARCH RECORDED - STRICT TOMBSTONE EVIDENCE STILL MISSING**.

This is a read-only evidence/validator slice. No cleanup apply was run, no product source was edited,
no folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror state was mutated,
`productSyncReady` remained `false`, WebDAV/cloud/relay/`fullBundle.v3` was not started, Chat Saving
WebDAV/cloud/archive CAS remains blocked/deferred, no fallback was added, and strict tombstone
verification was not weakened.

## Context

- Cleanup command implementation: `9fdf2dab`.
- Tombstone verification fix: `221d91b6`.
- Manual-review blocker decision: `9dd82fdf`.
- Validator cleanup baseline: `3f1bd667`.
- Manual-review packet: `b344120ac4462b6e91f7ac6bfb4cff507cab0a68`.
- Current retained binding/readiness baseline before this slice: `69/69` green.

The live strict cleanup dry-run remains the source of truth for cleanup eligibility:

| Row token | Chat token | Folder token | Strict folder tombstone present | Strict folderBinding tombstone present | Status |
| --- | --- | --- | --- | --- | --- |
| `row:a950a44b859f` | `r:650c3cb39924` | `r:0226fecaed5b` | `false` | `false` | `skipped-not-fully-tombstone-verified` |
| `row:fdd2456fc8a2` | `r:2f29d39a6c4f` | `r:2d5469848470` | `false` | `true` | `skipped-not-fully-tombstone-verified` |

## Strict Evidence Requirement

Future cleanup apply remains blocked unless each row has both strict active tombstone records:

- exact active folder tombstone:
  `recordKind:"folder"` and `recordId:"folder:<encodeURIComponent(folderId)>"`
  with `restored_at IS NULL`;
- exact active folderBinding tombstone:
  `recordKind:"folderBinding"` and
  `recordId:"folderBinding:<encodeURIComponent(chatId)>:<encodeURIComponent(folderId)>"`
  with `restored_at IS NULL`.

Broad text matching, loose metadata matching, receipt substring matching, historical narrative, row-token
correlation, export filtering, or F15/ledger provenance is not accepted as cleanup proof.

## Provenance Paths Searched

The provenance search covered source and evidence paths that could explain the two dangling rows:

- `src-surfaces-base/studio/store/folders.tauri.js`
  - `operational5OrphanBindingCleanup`
  - `folderTombstoneRecordId`
  - folder tombstone writer
  - folderBinding tombstone writer
  - exact cleanup verifier
- `src-surfaces-base/studio/store/tombstones.tauri.js`
  - `getTombstone(recordKind, recordId)`
  - active-only `record_kind` + `record_id` + `restored_at IS NULL` lookup
- `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
  - reviewed tombstone request/review substrate
- `src-surfaces-base/studio/sync/delete-reviewed-apply.tauri.js`
  - reviewed folder delete tombstone writer
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  - binding request/receipt and reviewed repair source
- `src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js`
  - reviewed binding apply path and active tombstone lookup helpers
- `src-surfaces-base/studio/sync/execute/execute-journal.tauri.js`
  - execute journal substrate
- `src-surfaces-base/studio/sync/execute/execute-settlement-writer.tauri.js`
  - settlement journal writer
- `src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js`
  - library settlement extension
- `src-surfaces-base/studio/sync/library/library-binding-apply-event-receipt.tauri.js`
  - library binding apply-event receipt path
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
  - `fullBundle.v2` exportable binding projection and dangling-binding diagnostics
- current Operational.5 evidence:
  - `operational5-fullbundle-v2-binding-count-mismatch-investigation.md`
  - `operational5-dangling-raw-canonical-binding-cleanup-preflight.md`
  - `operational5-dangling-binding-row-level-diagnostic.md`
  - `operational5-dangling-binding-cleanup-design-preflight.md`
  - `operational5-orphan-binding-cleanup-implementation.md`
  - `operational5-orphan-binding-cleanup-tombstone-verification-fix.md`
  - `operational5-orphan-binding-cleanup-manual-review-blocker-decision.md`
  - `operational5-orphan-binding-manual-review-packet.md`

## Findings

Strict folder tombstone evidence was not found for either row in the active tombstone authority required
by cleanup:

- `row:a950a44b859f`: strict folder tombstone evidence **not found**; strict folderBinding tombstone
  evidence **not found**. Candidate 1 has no cleanup-eligible tombstone pair.
- `row:fdd2456fc8a2`: strict folder tombstone evidence **not found**; strict folderBinding tombstone
  evidence **found** by the live strict verifier. Candidate 2 is still not cleanup-eligible because
  the exact active folder tombstone is missing.

The export and parity diagnostics explain why both rows are filtered from `fullBundle.v2`:
`missingFolderBindingCount:2`, `fallbackUnfiledBindingCount:2`, and
`activeDanglingFolderBindingCount:2`. That explains exportability, not cleanup authority.

The F15 settlement/materialization records, binding repair receipts, execute/settlement journal rows,
request/receipt ledgers, restart convergence records, import/export projection diagnostics, and reviewed
binding/deletion paths may explain row history, but none replace the strict active folder tombstone
required by `operational5OrphanBindingCleanup`.

No legitimate strict folder tombstone evidence is currently recorded outside the active
`getTombstone("folder", "folder:<id>")` authority in a way that can be accepted as cleanup proof.

## Classification

| Row token | Strict folder tombstone | Strict folderBinding tombstone | Cleanup eligibility | Current route |
| --- | --- | --- | --- | --- |
| `row:a950a44b859f` | not found | not found | blocked | manual provenance review |
| `row:fdd2456fc8a2` | not found | found | blocked | manual provenance review |

The likely provenance remains one of the non-authoritative explanations already surfaced by earlier
Operational.5 diagnostics: folder lifecycle history, missing folder state, export filtering, reviewed
binding/deletion history, or migration/convergence history. This slice does not resolve which one is
canonical because the row ids remain redacted and the required strict folder tombstone is absent.

## Next Route

Recommended next route: **create a stronger read-only live provenance diagnostic** before any cleanup
or restore decision.

That diagnostic should run inside Desktop Studio, remain read-only, discover the two current dangling
rows from the live canonical store, keep raw ids redacted, and for each row report:

- exact active folder tombstone lookup result;
- exact active folderBinding tombstone lookup result;
- restored tombstone history if exposed;
- folder restore/recovery snapshot presence if exposed;
- reviewed delete/apply receipt references if exposed;
- F15 settlement/materialization and consumed-ledger provenance if exposed;
- whether a legitimate folder restore path exists;
- whether a separate manual-approval cleanup override design is needed.

Cleanup apply is not recommended from this search. Valid next decisions are:

1. keep documented debt and keep `productSyncReady:false`;
2. run the stronger read-only live provenance diagnostic;
3. restore a missing folder only if legitimate recovery evidence is found in a separately reviewed slice;
4. design a separate manual-approval cleanup override with a new strict evidence receipt;
5. no-op/manual reject.

## Boundaries

- No cleanup apply.
- No product source edited.
- No folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror mutation.
- No strict tombstone verification weakening.
- No broad text/meta/receipt matching accepted as cleanup proof.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary remain unchanged.
