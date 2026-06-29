# Labels / Tags / Categories / Classification Metadata Sync

## Phase 8 Chrome Read-Only Receipt Import / Display

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
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Scope

Phase 8 implements the Chrome-side, read-only import and display of Desktop-issued
`libraryMetadataMutationReceipts[]`, matched back to the pending Chrome requests created in
Phase 6.

This phase does not add Chrome canonical mutation, does not add Desktop apply behavior beyond
Phase 7, does not broaden the Phase 7 applied request types, does not add destructive metadata
actions, and does not implement WebDAV / cloud / relay transport. It does not declare full product
metadata sync complete.

## Files Inspected

- `release-evidence/2026-06-25/labels-tags-categories-phase7-desktop-apply-receipts.md`
- `release-evidence/2026-06-25/folder-delete-phase6b4e-chrome-receipt-import.md` (Chrome receipt-import precedent)
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `tools/validation/sync/validate-labels-tags-categories-phase6-chrome-request-export.mjs`

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `tools/validation/sync/validate-labels-tags-categories-phase8-chrome-receipt-import.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase8-chrome-receipt-import.md`

## Receipt Schema Reviewed (Phase 7)

- Receipt section in the Desktop bundle: `libraryMetadataMutationReceipts[]`
- Receipt schema: `h2o.studio.library-metadata-mutation-receipt.v1`
- Desktop receipt export mirror key: `h2o:studio:library-metadata-mutation-receipts:export:v1`
- Desktop receipt export mirror schema: `h2o.studio.library-metadata-mutation-receipt.export-mirror.v1`

Phase 7 receipt status taxonomy (followed exactly, unchanged):

- `applied`
- `rejected`
- `deferred`
- `skipped_duplicate`
- `stale_basis`
- `invalid`

Receipts are status / hash / count evidence only. The Desktop export projection
(`buildLibraryMetadataMutationReceiptPayloadSafely`) already requires `privacy.redacted === true`,
`privacy.hashOnly === true`, `safety.desktopAuthority === true`, `safety.chromeAuthority === false`,
`separateFromDesktopCanonicalLibraryMetadata === true`, `productSyncReady === false`, and all
no-delete flags before a receipt reaches the bundle.

## Chrome Receipt Import / Storage Path

New Chrome read-only constants in `folder-import.mv3.js`:

- Chrome import mirror key: `h2o:studio:library-metadata-mutation-receipts:chrome-imported:v1`
- Chrome import mirror schema: `h2o.studio.library-metadata-mutation-receipt.chrome-imported-mirror.v1`
- Receipt schema reused: `h2o.studio.library-metadata-mutation-receipt.v1`

Import entry point: `importLibraryMetadataMutationReceiptsFromDesktopBundle(bundle)`.

It is wired into the existing desktop-to-chrome import path next to
`importChatFolderBindingReceiptsFromDesktopBundle`, in both the fresh-import branch
(`bundleInput`) and the already-imported / duplicate-suppressed branch (`bundle`). A non-zero
blocker count contributes `library-metadata-mutation-receipt-import-blocked`.

Per-receipt handling:

1. Read `bundle.libraryMetadataMutationReceipts[]`.
2. `sanitizeImportedLibraryMetadataMutationReceipt` enforces the Desktop trust contract:
   schema, safe `receiptId`, safe `requestId`, known status, `separateFromDesktopCanonicalLibraryMetadata === true`,
   `productSyncReady === false`, `privacy.redacted/hashOnly === true` (and no raw flags), and the full
   `safety` block (`desktopAuthority === true`, `chromeAuthority === false`, `noChromeCanonicalMutation === true`,
   and all no-delete flags). A receipt failing any check is skipped with a reason code and never stored.
3. Trusted receipts are re-projected to a hash/status/count-only Chrome row (hashed target refs only)
   and upserted by `receiptId` into the Chrome import mirror (separate KV key, capped at 1000 rows).

The Chrome import mirror is kept strictly separate from `desktopCanonicalLibraryMetadata`.

## Request-to-Receipt Matching Behavior

`markLibraryMetadataMutationRequestsResolvedByReceipts(receipts)` reads the existing Phase 6
pending-export mirror (`h2o:studio:library-metadata-mutation-requests:pending-export:v1`) and matches
each imported receipt to request rows by `requestId` (or `reviewId`) OR by `idempotencyKey`.

For a matched row currently `status === 'pending'`:

- Terminal receipt (`applied`, `rejected`, `invalid`, `skipped_duplicate`, `stale_basis`):
  the row is flipped to `status: 'resolved'` and annotated with `resolvedByReceiptId`,
  `resolvedReceiptStatus`, `resolvedAt`, and `resolutionSource = 'desktop-receipt-import'`.
- `deferred` receipt: the row stays `pending` (so a future Desktop phase can still apply it) and is
  annotated with `observedByReceiptId` / `observedReceiptStatus` / `observedAt` only.

This reuses the existing request storage pattern safely. The Chrome-to-Desktop export sanitizer
(`sanitizeLibraryMetadataMutationRequestForExport`) already requires `status === 'pending'`, so a
`resolved` row is naturally excluded from re-export — Chrome stops re-sending a request Desktop has
already concluded, without any deletion. The Phase 6 duplicate guard also keys on `status === 'pending'`,
so a later explicit user re-request still works.

## Idempotency Behavior

- Receipt rows are upserted by `receiptId`; re-importing the same receipt replaces the row in place and
  never grows the mirror. `firstObservedAt` is preserved; `lastObservedAt` is refreshed.
- A request already `resolved` by the same `receiptId` is reported as `alreadyResolvedRequestCount` and
  is never re-resolved (no double-resolve).
- A `deferred` request already observed by the same `receiptId` is not rewritten.
- VM proof: importing the same bundle twice yields `newReceiptCount: 0`,
  `duplicateReceiptCount: 2`, `resolvedPendingRequestCount: 0`, `alreadyResolvedRequestCount: 1`,
  a stable 2-row receipt mirror, and exactly one resolved request row.

## Public Read / Diagnostic APIs Added

On `H2O.Studio.sync.folder`:

- `importLibraryMetadataMutationReceiptsFromDesktopBundle(bundle)` — read-only import entry point.
- `listLibraryMetadataMutationReceipts({ status, requestId, limit })` — list imported receipts.
- `diagnoseLibraryMetadataMutationReceipts({ includeRows })` — receipt read-model diagnostic:
  `receiptCount`, `statusCounts`, `appliedCount`, `rejectedCount`, `deferredCount`,
  `skippedDuplicateCount`, `staleBasisCount`, `invalidCount`, `pendingRequestCount`,
  `resolvedRequestCount`, plus all read-only / no-mutation / no-delete flags.
- `libraryMetadataMutationReceiptSchema`, `libraryMetadataMutationReceiptImportKey` — surface descriptors.

The last receipt import result is also surfaced in the propagation projection and the
desktop-to-chrome diagnose snapshots as `libraryMetadataMutationReceiptImport`. No new Studio UI was
added (diagnostics/read APIs first, per the phase plan).

## Privacy / Sanitization

The Chrome import row stores status, codes, timestamps, hashed target references
(`target.chatIdHash`, `target.entityIdHash`), basis/result hashes, sanitized counts, and the
read-only flags. It stores no raw chat IDs, chat titles, chat content, label/tag/category names,
colors, or account-linked metadata. Receipts whose privacy flags are not redacted/hash-only are
rejected before storage. VM proof confirms a receipt carrying a raw chat title is rejected and the
raw string never appears in any KV mirror.

## Safety / No-Delete Proof

The receipt import and resolution paths perform no deletes. Imported rows and the import result carry:

- `noHardDelete: true`
- `noPurge: true`
- `noChatDelete: true`
- `noSnapshotDelete: true`
- `noAssetDelete: true`
- `noLabelDelete: true`
- `noTagDelete: true`
- `noCategoryDelete: true`
- `noMetadataDelete: true`

Resolution-marking only flips a request row's status and adds annotation fields; no request row is
ever removed (`reqMirror.requests.length` is invariant across imports in the VM proof). The validator
also statically asserts the import/sanitize/resolve/list/diagnose bodies contain no
`deleteChat(` / `deleteSnapshot(` / `hardDelete` / `purgeRecentlyDeleted` calls.

## No Chrome Canonical Mutation Proof

Chrome remains request-only and read-only over canonical metadata. The new code never calls a
canonical store mutation (`assignChat`, etc.), never sets `chromeAuthority: true`,
`desktopApply: true`, or `noChromeCanonicalMutation: false`. The validator statically forbids those
strings in the new function bodies, and the VM proof runs with no `H2O.Studio.store` present yet still
imports, matches, and resolves successfully — proving the lane depends on no canonical mutation.

## No Desktop Apply Broadening Proof

Phase 8 changes only Chrome-side import/display code plus a validator and this evidence file. It does
not touch `folder-sync.tauri.js` apply logic or `export-bundle.tauri.js` receipt projection. The
Phase 7 applied request type remains limited to `chat-category-assign`; broader catalog / binding /
classification actions remain deferred and destructive-shaped requests remain blocked/deferred.

## Validators Run

```bash
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check tools/validation/sync/validate-labels-tags-categories-phase8-chrome-receipt-import.mjs
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

Observed result for the Phase 8 validator:

- `PASS validate-labels-tags-categories-phase8-chrome-receipt-import`

All prior-phase validators (1, 2, 3, 5, 6, 7), F19 sync hardening, and F15 cutover remain green.

## Product Metadata Sync Verdict

Phase 8 implementation verdict: READY FOR REVIEW.

Product metadata sync: NOT READY.

The request → apply → receipt → receipt-import loop is now wired end to end at the code level for the
safe `chat-category-assign` subset: Chrome requests (Phase 6), Desktop applies and receipts (Phase 7),
and Chrome now imports/displays those receipts read-only and resolves the matching pending requests
(Phase 8). Broader metadata mutation types remain deferred and destructive actions remain blocked.
A live Desktop ↔ Chrome runtime proof of the full loop is still outstanding.

## Recommended Phase 9

End-to-end runtime proof, still limited to the safe `chat-category-assign` request type:

1. Chrome creates a `chat-category-assign` request and exports it (Phase 6).
2. Desktop imports, applies, and writes the receipt (Phase 7).
3. Chrome imports the Desktop receipt, displays it, and marks the pending request resolved (Phase 8).
4. Desktop canonical metadata export reflects the assignment (Phase 2).
5. Chrome projection refresh shows the new canonical assignment (Phase 3 / Phase 5 parity).

Phase 9 must remain read-only on Chrome canonical metadata, must not broaden Phase 7 applied request
types, and must not add destructive metadata actions or WebDAV / cloud / relay transport.
