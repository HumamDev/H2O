# Labels / Tags / Categories / Classification Metadata Sync

## Phase 10 Read-Only Chrome Studio Status / Display Surface

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
- Phase 9 end-to-end runtime proof: `ede1f66`
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Scope

Phase 10 promotes the runtime-proven safe `chat-category-assign` metadata sync loop to a
product-surfaced, **read-only** status/display model. It surfaces request/receipt status, authority,
and privacy/safety posture. It is status/diagnostics oriented, not a mutation workflow. It does not
broaden sync behavior, does not add new request-creation UI, does not broaden the Phase 7 applied
request types, does not add destructive actions, and does not add WebDAV/cloud/relay transport.

## Path Chosen: Pure Status Model (no visible UI widget)

A pure read-only status/display **model** was added to the existing cross-surface diagnostics module
`src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
(`H2O.Studio.sync.libraryMetadataDiagnostics`), rather than a visible UI widget or edits to large
Studio files.

Rationale per the placement guidance ("prefer an existing diagnostics/status area or a focused
model/API surface over broad UI edits; do not bloat large Studio files"; "since this is
status/diagnostics, prefer the diagnostics/status surface, not a normal mutation panel"):

- `library-metadata-diagnostics.js` is the dedicated, already read-only metadata diagnostics module
  and is already registered in `studio.html` and the pack manifest, so the addition ships with **no
  loader change** and **no shared-file (studio.html / pack-studio.mjs) edits**.
- The model returns a `display.rows[]` array (label/value pairs) that a read-only status panel can
  render later without any mutation affordance — keeping this phase model-only.

## Files Inspected

- `src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js` (Phase 6 request + Phase 8 receipt APIs)
- `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js`
- `src-surfaces-base/studio/studio.html` and `tools/product/studio/pack-studio.mjs` (loader registration check)
- `tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs`

## Files Changed

- `src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `tools/validation/sync/validate-labels-tags-categories-phase10-status-display.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase10-status-display.md`

## Display / Status Surface Name

- Surface model name: `libraryMetadataSyncStatus`
- Status schema: `h2o.studio.sync.library-metadata-sync-status.v1` (version `0.1.0-phase10`)
- Public API:
  - `H2O.Studio.sync.libraryMetadataDiagnostics.captureMetadataSyncStatus(options)`
  - `H2O.Studio.sync.captureLibraryMetadataSyncStatus(options)` (convenience alias)

## APIs Used (read-only only)

The status model calls only the existing read-only Phase 6/8 APIs on `H2O.Studio.sync.folder`:

- `diagnoseLibraryMetadataMutationRequests({ includeRows: false })`
- `listLibraryMetadataMutationRequests({})`
- `diagnoseLibraryMetadataMutationReceipts({ includeRows: false })`
- `listLibraryMetadataMutationReceipts({})`

Each call is wrapped in a presence check + try/catch, so the model degrades gracefully (with warning
codes) on any surface where an API is absent, and never throws.

## Fields Displayed

- Request counts: `pending`, `resolved`, `total`.
- Receipt status counts: `applied`, `rejected`, `deferred`, `skipped_duplicate`, `stale_basis`,
  `invalid`, `total`.
- Cross-check counts: `resolvedRequestCount`, `pendingRequestCount`.
- `onlyRuntimeProvenAppliedType: 'chat-category-assign'` and `appliedRequestTypes: ['chat-category-assign']`.
- `deferredRequestTypes` (catalog create/rename, label/tag binding, classification-set) and
  `deferredDestructiveShapes` (delete/unbind/clear/purge/hard-delete), plus a `deferredNote`.
- Authority: `desktopAuthority: true`, `chromeAuthority: false`, `chromeCanonicalMutation: false`,
  `desktopCanonicalAuthority: true`, `chromeReadOnlyCanonical: true`.
- Privacy (`privacySummary`): no raw IDs/titles/content/names/colors/account-linked metadata; hash-only.
- Safety: `noHardDelete`, `noPurge`, `noChatDelete`, `noSnapshotDelete`, `noAssetDelete`,
  `noLabelDelete`, `noTagDelete`, `noCategoryDelete`, `noMetadataDelete`, `destructiveMetadataActionsDeferred`.
- `productSyncReady: false`.
- `display.rows[]`: 21 label/value rows for a read-only status panel, including explicit
  "Raw chat content: none", "Raw chat titles: none", "Account-linked metadata: none",
  "Delete / purge behavior: none", "Broader metadata types: deferred", and
  "Product metadata sync: not ready (chat-category-assign only)".

## Privacy / No-Raw-Content Proof

The model emits counts, booleans, codes, and fixed notes only — never request/receipt row payloads.
The VM proof seeds a request whose payload carries opaque IDs `PRIVATE-CHAT-ID-NOLEAK` /
`PRIVATE-CATEGORY-ID-NOLEAK` and asserts neither string appears anywhere in the serialized status
model. The `privacy` block reports `rawContentReturned: false`, `rawTitlesReturned: false`,
`rawIdsReturned: false`, `accountLinkedMetadataReturned: false`, `hashOnly: true`.

## Read-Only / No-Side-Effect Proof

- Static: the `captureMetadataSyncStatus` body contains none of `requestLibraryMetadataMutation(`,
  `importLibraryMetadataMutationReceiptsFromDesktopBundle(`, `importLatestBundle(`,
  `exportChromeToSyncFolder(`, `syncNow(`, `assignChat(`, `writeKv(`, `storage.set`,
  `chromeAuthority: true`, or `desktopApply: true`.
- Runtime: `chrome.storage.local` is byte-for-byte identical before and after the status call (and
  after a second call). The model's `sideEffectSummary` reports `applyExecuted: false`,
  `chromeRequestExported: false`, `canonicalMutationAttempted: false`, `deleteExecuted: false`, etc.

## No Chrome Canonical Mutation Proof

The model only reads diagnostics. It reports `authority.chromeCanonicalMutation: false`,
`authority.chromeAuthority: false`, `authority.chromeReadOnlyCanonical: true`, and never invokes any
canonical mutation path. Storage is unchanged across calls.

## No Desktop Apply Broadening Proof

Phase 10 touches only the Chrome/cross-surface diagnostics module plus a validator and this evidence
file. It does not modify `folder-sync.tauri.js` or `export-bundle.tauri.js`. The model reports
`onlyRuntimeProvenAppliedType: 'chat-category-assign'` and lists all broader types as deferred; the
Phase 7 applied request type set is unchanged.

## Live-CDP Capture Status

Deferred. A live Chrome devtools endpoint was reachable on port 9247, but a fully provisioned live
Desktop apply peer with a connected sync folder could not be deterministically stood up in this
environment. Phase 10 is a read-only status surface and does not require a live loop; the in-process
proof against the real Phase 6/8 APIs is the evidence of record. Promoting the optional Phase 9
live-CDP repro into executed evidence remains a candidate for a later phase.

## Validators Run

```bash
node --check src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js
node --check tools/validation/sync/validate-labels-tags-categories-phase10-status-display.mjs
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
git diff --check
```

Observed: `PASS validate-labels-tags-categories-phase10-status-display`, and all prior-phase
validators (1, 2, 3, 5, 6, 7, 8, 9), F19 sync hardening, and F15 cutover remain green.

## Final Phase 10 Verdict

Phase 10 verdict: PASS / READY FOR REVIEW. The safe `chat-category-assign` metadata sync loop is now
surfaced as a read-only `libraryMetadataSyncStatus` model that reports request/receipt status,
authority, and privacy/safety posture with no side effects, no Chrome canonical mutation, and no
Desktop apply broadening.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY for broad product use. The status surface explicitly reports that
only `chat-category-assign` is runtime-proven/applied and that broader catalog/binding/classification
request and apply types remain deferred while destructive actions remain blocked.

## Recommended Phase 11

A closeout / readiness audit for the safe `chat-category-assign` loop (Phases 1–10): consolidate the
request → apply → receipt → resolution → projection-refresh → status-surface chain into a single
readiness checklist + audit doc, confirm the boundary invariants hold across all phases, and record
the remaining deferred surface. Alternatively, a design-only review of the next safe metadata request
type (e.g. a guarded, non-destructive `chat-category-clear` reassignment) — design only, still
deferred for apply. Do not jump to destructive or broad metadata actions, and do not add
WebDAV/cloud/relay transport.
