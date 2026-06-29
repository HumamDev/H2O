# Labels / Tags / Categories / Classification Metadata Sync

## Phase 9 End-to-End Runtime Proof (chat-category-assign only)

Date: 2026-06-29

## Context

- Audit: `d94f796402ef6421f2b239659c8d6ab644e52a99`
- Phase 1 diagnostics implementation: `f93c7233b614b5926ea3aafa6bea78c0985ef5f4`
- Phase 1 runtime proof: `f89e1a583f2e64350a6c6ee70caf4c60d0dff721`
- Phase 2 Desktop canonical metadata export: `02dbf4ef609cfe3d03cc3d6521040c76d72d8c35`
- Phase 3 Chrome import/display source: `60d3c7404fd9a7f574d65dd770f26e0d72ff9e45`
- Phase 4 Desktop-origin convergence proof: `d8120e5b1d0cb9dad365de1966f0462c16e0fcba`
- Phase 5 display parity model: `93d07f3`
- Phase 6 Chrome request export: `91e1c95`
- Phase 7 Desktop apply + receipts: `8addf3a`
- Phase 8 Chrome receipt import/display: `2b6116f`
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Scope

Phase 9 proves the full safe metadata sync loop end to end, limited strictly to the
`chat-category-assign` request type. It does not broaden product behavior, does not broaden the
Phase 7 applied request types, does not add destructive metadata actions, does not add
WebDAV/cloud/relay transport, and does not declare broader product sync complete.

## Runtime Surfaces Tested

The proof drives the loop in-process through the REAL production modules on both surfaces, bridged
by the real bundle shapes (`chrome-latest.json` request transport and `latest.json` receipt +
canonical transport, serialized as JSON between surfaces):

- Chrome surface: `src-surfaces-base/studio/sync/folder-import.mv3.js`
  (request create/export, receipt import, request resolution, canonical projection import/display).
- Desktop surface: `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  (`importChromeLatestBundle` → request import + validate + apply + receipt emit).
- Desktop projection: `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
  (canonical `desktopCanonicalLibraryMetadata` before/after the apply).

No live Chrome/Desktop surfaces are required; the proof is deterministic and CI-runnable.

### Why in-process rather than live CDP

The repo CDP harness (`tools/smoke/chrome-cdp-studio.mjs`) and the local smoke runners require a
live Chrome Studio profile (CDP port 9247) AND a live Desktop Studio with a connected sync folder +
SQLite. A Chrome devtools endpoint was reachable on 9247, but a fully provisioned live Desktop apply
peer cannot be stood up deterministically here. Per the phase plan ("if no suitable harness exists,
create the smallest focused Phase 9 runtime validator/proof script that drives or validates the loop
using existing APIs"), the proof drives the real modules in-process. The live CDP reproduction is
documented below as an optional manual repro.

### Boundary mock (single, documented)

The only Desktop dependency that is mocked is `H2O.Studio.ingestion.importBundle` → `{ ok: true }`.
It stands in for the chat-archive import so the REAL metadata apply branch inside
`importChromeLatestBundle` runs. The metadata apply itself is real: it calls the real
`autoApplyLibraryMetadataMutationRequestsFromChromeBundle`, the real
`validateLibraryMetadataMutationRequestForDesktopApply`, and the real
`applyChatCategoryAssignLibraryMetadataRequest`. The in-memory canonical store matches the real
`categories.tauri.js` `assignChat` contract (resolves `true` only when a chat row is updated) and the
projection's `chat.category_id` read contract, so a real `assignChat` genuinely changes the
projection hash.

## Exact Commands / Scripts Used

```bash
node tools/validation/sync/validate-labels-tags-categories-phase9-end-to-end-runtime-proof.mjs
```

The proof script boots both surfaces with `node:vm`, runs the 8-step loop plus idempotency, privacy,
no-delete, and no-Chrome-canonical-mutation checks, and prints a machine-readable
`h2o.studio.library-metadata.phase9-end-to-end-runtime-proof.v1` summary followed by
`PASS validate-labels-tags-categories-phase9-end-to-end-runtime-proof`.

## Loop Steps Proven (21 assertions, all green)

`desktop-modules-boot`, `desktop-projection-p0`, `chrome-module-boot`, `chrome-imports-p0-basis`,
`chrome-request-create-export`, `chrome-request-export-mirror`, `desktop-import-apply`,
`desktop-store-mutated`, `desktop-apply-safety-flags`, `desktop-emits-receipt`,
`desktop-projection-p1-reflects-assignment`, `chrome-receipt-import-resolve`,
`chrome-request-resolved-readmodel`, `chrome-resolution-non-destructive`,
`chrome-projection-refresh-parity`, `desktop-apply-idempotent`, `desktop-receipt-store-stable`,
`chrome-receipt-import-idempotent`, `privacy-no-raw-leak`, `no-destructive-behavior`,
`no-chrome-canonical-mutation`.

## Chrome Request Creation / Export Summary

- Chrome first imports Desktop canonical projection P0; Chrome read-model projection hash equals the
  Desktop P0 projection hash (basis is shared across surfaces).
- `requestLibraryMetadataMutation({ action: 'chat-category-assign', chatId, categoryId,
  expectedCurrentBasisHash: P0 })` → `status: pending-created`, `requestType: chat-category-assign`,
  `requestOnly: true`, `desktopApply: false`, `noChromeCanonicalMutation: true`.
- The pending request lands in the Chrome `libraryMetadataMutationRequests[]` export mirror
  (`h2o:studio:library-metadata-mutation-requests:pending-export:v1`), count = 1, status `pending`.

## Desktop Import / Apply / Receipt Summary

- `importChromeLatestBundle(chromeToDesktopBundle)` → `status: imported`.
- Real apply: `appliedCount: 1`, `rejectedCount: 0`, `deferredCount: 0`, `staleBasisCount: 0`.
  The P0 request basis matched the Desktop pre-apply projection, so the request applied.
- Desktop canonical store mutated by the real `assignChat`: `chat-1.category_id = cat-work`.
- Apply safety flags: `desktopAuthority: true`, `chromeAuthority: false`,
  `noChromeCanonicalMutation: true`, all no-delete flags `true`, `productSyncReady: false`.
- Desktop emits one receipt in `libraryMetadataMutationReceipts[]`
  (`h2o.studio.library-metadata-mutation-receipt.v1`): `status: applied`, matching `requestId` and
  `idempotencyKey`.

## Chrome Receipt Import / Resolution Summary

- `importLibraryMetadataMutationReceiptsFromDesktopBundle(desktopToChromeBundle)` →
  `importedReceiptCount: 1`, `statusCounts.applied: 1`, `matchedPendingRequestCount: 1`,
  `resolvedPendingRequestCount: 1`, `chromeReadOnly: true`, `noChromeCanonicalMutation: true`.
- `diagnoseLibraryMetadataMutationReceipts()` → `resolvedRequestCount: 1`, `pendingRequestCount: 0`,
  `appliedCount: 1`.
- Resolution is read-model/outbox-diagnostic only: the matching request row is annotated
  `status: resolved` + `resolvedByReceiptId`; it is not deleted (request mirror length invariant = 1).

## Desktop Canonical Export Summary (Step 7)

The real projection reflects the assignment after apply:

- `chatCategoryAssignmentCount`: `0` → `1`
- `classificationSignalCount`: `0` → `1`
- `projection` hash changes:
  - before `44e8ec1b95dc2b7460e5d809328cf3aae00a7eded01940e9c93dcd140b036030`
  - after  `444c49edbe2e92ae29790ff881f2d42974c820e0bc2ea61d8b9cf4356ae8be3f`

## Chrome Projection Refresh Summary (Step 8)

Chrome imports the post-apply `desktopCanonicalLibraryMetadata` (P1) and displays matching sanitized
counts/hash via `diagnoseDesktopCanonicalLibraryMetadata()`:

- Chrome displayed `projectionHash` = `444c49edbe2e92ae29790ff881f2d42974c820e0bc2ea61d8b9cf4356ae8be3f`
  (== Desktop P1 projection hash).
- Chrome `chatCategoryAssignmentCount` = `1` (== Desktop), `categoryCatalogCount` = `1` (== Desktop),
  `classificationSignalCount` = `1` (== Desktop).

## Sanitized Count / Hash Comparison

| field | Desktop P1 | Chrome displayed |
| --- | --- | --- |
| projectionHash | `444c49ed…ae8be3f` | `444c49ed…ae8be3f` |
| chatCategoryAssignmentCount | 1 | 1 |
| categoryCatalogCount | 1 | 1 |
| classificationSignalCount | 1 | 1 |

## Idempotency Behavior

- Desktop replay of the same pending request bundle: `appliedCount: 0`, `skippedDuplicateCount: 1`
  (the real Desktop dedup recognizes the existing `applied` receipt and emits `skipped_duplicate`);
  the receipt store keeps exactly one `applied` receipt for the request.
- Chrome replay of the same Desktop receipt bundle: `resolvedPendingRequestCount: 0`,
  `alreadyResolvedRequestCount: 1`, `duplicateReceiptCount: 1` — no double-resolve, no duplicate
  receipt rows.

## Privacy / No-Raw-Content Proof

The Desktop canonical store row carries a private chat title and a private category name
(`PRIVATE-CHAT-TITLE-NOLEAK`, `PRIVATE-CATEGORY-NAME-NOLEAK`). Neither string appears anywhere in the
serialized Desktop→Chrome bundle, the Chrome imported-receipt mirror, the Chrome canonical display
diagnostic, or the Desktop receipt export mirror. Receipts are hash-only (`chatIdHash`,
`entityIdHash`); the canonical projection is hash/count only.

## No Destructive Behavior Proof

The store still holds the chat (1) and category (1) after the full loop; nothing is deleted. The
applied receipt's `safety` block preserves `noHardDelete`, `noPurge`, `noChatDelete`,
`noSnapshotDelete`, `noAssetDelete`, `noLabelDelete`, `noTagDelete`, `noCategoryDelete`,
`noMetadataDelete` (all `true`). The static guard confirms the Desktop apply remains limited to
`chat-category-assign` (`if (action !== 'chat-category-assign')` → `…-action-deferred-phase7`).

## No Chrome Canonical Mutation Proof

The only canonical store mutation in the entire loop is the Desktop apply (`assignChat`). The Chrome
surface never writes the Desktop store. The Chrome receipt import reports
`noChromeCanonicalMutation: true` and `noDesktopCanonicalMutationFromChrome: true`; the Chrome
canonical display reports `canonicalMutation: false`, `chromeAuthority: false`,
`desktopAuthority: true`.

## Validators Run

```bash
node --check tools/validation/sync/validate-labels-tags-categories-phase9-end-to-end-runtime-proof.mjs
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
git diff --check
```

Observed: `PASS validate-labels-tags-categories-phase9-end-to-end-runtime-proof`, and all prior-phase
validators (1, 2, 3, 5, 6, 7, 8), F19 sync hardening, and F15 cutover remain green.

## Optional Live CDP Reproduction (manual, not required for this proof)

With a live Chrome Studio profile (CDP 9247) connected to a sync folder and a live Desktop Studio
peer, the same loop can be exercised against real surfaces:

```bash
# Chrome: create + export a chat-category-assign request (request-only)
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow \
  --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"phase9-metadata-request"}'

# Desktop: import chrome-latest.json, apply, export latest.json (Desktop authority)
# Chrome: import latest.json (receipts read-only + canonical projection refresh)
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow \
  --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase9-receipt-import"}'
```

This live path is optional; the committed deterministic in-process proof is the Phase 9 evidence of
record.

## Final Phase 9 Verdict

Phase 9 verdict: PASS. The full safe metadata sync loop (Chrome request → Desktop apply + receipt →
Chrome receipt import + resolution → Desktop canonical export → Chrome projection refresh/parity) is
proven end to end through real production code, limited to `chat-category-assign`, with idempotency,
privacy, no-delete, and no-Chrome-canonical-mutation guarantees intact.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY for broad product use. The proven loop is intentionally limited to
the safe `chat-category-assign` subset. Catalog create/rename, label/tag binding, and
classification-set remain deferred; destructive metadata actions remain blocked; WebDAV/cloud/relay
transport is not implemented. The safe loop is now runtime-proven; the broader product surface is not.

## Recommended Phase 10

Promote the safe loop from runtime-proven to product-surfaced for `chat-category-assign`, without
broadening apply types:

1. Chrome Studio UI affordance to view pending metadata requests and Desktop receipt status
   (applied/resolved) for category assignment, read-only, using the Phase 8 diagnose APIs.
2. A live CDP runtime capture of the loop committed as runtime evidence (promote the optional repro
   above into an executed proof).
3. Begin the next safe apply type design review (e.g. `chat-category-clear` as a guarded,
   non-destructive reassignment) — design only, still deferred for apply, to keep destructive and
   broader catalog/binding/classification actions out of scope.

Phase 10 must remain read-only on Chrome canonical metadata, must not broaden the Desktop applied
request types beyond `chat-category-assign`, and must not add destructive actions or WebDAV/cloud/
relay transport.
