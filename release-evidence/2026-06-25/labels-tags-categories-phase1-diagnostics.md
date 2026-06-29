# Labels / Tags / Categories Phase 1 Diagnostics

Date: 2026-06-29
Repo: `/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source`
Audit evidence: `release-evidence/2026-06-25/labels-tags-categories-sync-audit-plan.md`
Audit commit: `d94f796402ef6421f2b239659c8d6ab644e52a99`

## Verdict

PASS for Phase 1 read-only diagnostics.

NOT READY for product sync implementation. This slice adds diagnostic visibility only. It does not add Desktop apply behavior, Chrome request export, product sync writes, import/export/sync invocation, Chrome canonical mutation, or delete behavior.

## Files Changed

- `src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase1-diagnostics.md`

## Diagnostic APIs Added

Runtime API:

- `H2O.Studio.sync.libraryMetadataDiagnostics.captureSnapshot(options)`
- `H2O.Studio.sync.libraryMetadataDiagnostics.compareSnapshots(leftSnapshot, rightSnapshot)`
- `H2O.Studio.sync.libraryMetadataDiagnostics.runDiagnostic(input)`
- `H2O.Studio.sync.libraryMetadataDiagnostics.listDeferredWarningCodes()`
- `H2O.Studio.sync.libraryMetadataDiagnostics.listMismatchCodes()`

Aliases:

- `H2O.Studio.sync.captureLibraryMetadataDiagnosticSnapshot(options)`
- `H2O.Studio.sync.compareLibraryMetadataDiagnosticSnapshots(leftSnapshot, rightSnapshot)`
- `H2O.Studio.sync.runLibraryMetadataDiagnostics(input)`

Schemas:

- Snapshot: `h2o.studio.sync.library-metadata-diagnostics-snapshot.v1`
- Comparison: `h2o.studio.sync.library-metadata-diagnostics-comparison.v1`

## What The Diagnostic Checks

Desktop and shared read models:

- Store API presence for labels, tags, categories, and chats.
- Store `diagnose()` state, sanitized to readiness, backend, schema, table names, warning count, error count, write count, and reload/write observability.
- Store row counts and aggregate row hashes for labels, tags, categories, and chat category-cache rows when read methods are available.
- LibraryIndex active metadata counts for rows with labels, tags, categories, classification signals, and project signals.
- LibraryWorkspace label/tag/category catalog counts and hashes when read methods are available.

F15 readiness:

- Catalog and binding canonicalizer API presence.
- Catalog and binding diagnostic API presence.
- Store cutover shim installed/version marker.
- SQLite writer-identity sentinel installed/version marker.
- Writer identity proof API presence.
- Allowed writer identities are counted only, not emitted.
- Trigger/runtime proof is explicitly marked required and not invoked.

Chrome mirror and sync readiness:

- Current surface detection for Desktop Studio, Chrome Studio, and unknown Studio.
- Chrome/desktop LibraryIndex metadata mirror counts and hashes.
- Folder sync diagnostic API presence.
- `syncNow`, latest import, latest export, parity diagnostic, and auto-export API availability as booleans only.
- Product sync readiness remains `false`.

Deferred warning coverage:

- `library-propagation-labels-deferred`
- `library-propagation-tags-deferred`
- `library-propagation-unsupported-storage-deferred`
- Existing related deferred codes for projects, folder bindings, tombstones, and apply events are listed for taxonomy continuity.

Sanitized parity:

- Snapshot hashes for labels, tags, categories, classification, row metadata, and chat category cache.
- Comparison mismatches for label, tag, category, classification, deferred-warning, source, schema, and F15 readiness drift.
- Local-only diagnostics return peer-required status instead of claiming cross-surface parity.

## Sanitization / Privacy Behavior

- Output is counts, booleans, code-like warnings, and hashes only.
- Raw chat ids, titles, label names, tag names, category names, colors, account-linked metadata, content, and DB URLs are not returned.
- Warning strings are filtered to code-like slugs so unexpected error text cannot leak through this diagnostic.
- Store `diagnose()` output is sanitized and does not include raw `dbUrl`, error strings, or warning strings.
- Validator fixtures intentionally include secret labels, tags, categories, chat ids, titles, and DB URLs, then assert none appear in snapshots or comparisons.

## Safety Behavior

The diagnostic side-effect summary is all false:

- No product sync writes.
- No storage, SQLite, or Chrome storage writes.
- No import, export, or `syncNow` invocation.
- No Desktop apply.
- No Chrome request export.
- No canonical mutation.
- No delete, purge, chat delete, snapshot delete, or asset delete.

The validator also statically rejects direct invocation markers such as `.syncNow(`, `.importLatestBundle(`, `.exportLatestSyncBundle(`, `.executeSettlementSqlite(`, and storage/write SQL markers in the new diagnostic module.

## Validator / Proof Output

Passed:

- `node --check src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `node --check tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs`
- `node --check tools/product/studio/pack-studio.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs`
  - `Labels/tags/categories Phase 1 diagnostics validation passed`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`
  - `[f19-sync-hardening] PASS`
- `node tools/validation/sync/validate-f15-cutover.mjs`
  - `F15 cutover validation passed`

Known validation limitation:

- `node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs` failed on an unrelated pre-existing dirty cache-bust drift:
  - `src-surfaces-base/studio/studio.html: missing Library Insights cache bust`
  - The validator expects `./S0F1d. ... Library Insights - Studio.js?v=2.5.71`.
  - The current dirty `studio.html` has `?v=2.5.73`.
  - Phase 1 did not modify that cache-bust value.

## Remaining Gaps

- No Desktop canonical metadata export envelope yet.
- No Chrome metadata display mirror imported from Desktop canonical metadata yet.
- No Chrome-origin metadata request export yet.
- No Desktop metadata request apply or receipt behavior yet.
- No runtime DevTools or Terminal proof was collected in this slice.
- Trigger proof remains a runtime requirement; Phase 1 reports API availability and installed markers only.
- Tags still need explicit tag parity because existing headline counts do not include tags.

## Recommended Phase 2

Start Desktop canonical metadata export only after reviewing Phase 1 diagnostics output in a real Desktop and Chrome runtime.

Recommended Phase 2 scope:

- Desktop-owned read-only export projection for label, tag, and category catalogs.
- Desktop-owned read-only export projection for chat-label, chat-tag, and chat-category bindings.
- No Chrome mutation.
- No Chrome request export.
- No Desktop apply.
- Preserve hash/sanitized proof behavior from Phase 1.
