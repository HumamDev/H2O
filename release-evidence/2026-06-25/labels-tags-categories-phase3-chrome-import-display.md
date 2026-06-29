# Labels / Tags / Categories Phase 3 Chrome Import / Display Evidence

Date: 2026-06-29

## Scope

Phase 3 implements Chrome import/display-read support for the Desktop-exported
`desktopCanonicalLibraryMetadata` projection.

Desktop remains the canonical authority. Chrome treats the projection as a
read-only mirror/display source only.

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js`
- `tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase3-chrome-import-display.md`

No loader changes were required. Phase 3 extends modules already loaded by
Studio.

## Imported Projection

- Section: `desktopCanonicalLibraryMetadata`
- Schema: `h2o.studio.library-metadata.desktop-canonical.v1`
- Version source: Phase 2 Desktop export, currently `0.1.0-phase2`
- Chrome mirror/display source name: `desktopCanonicalLibraryMetadata`
- Chrome display mode: `hash-count-read-model`

Chrome now recognizes the Phase 2 projection as a supported Desktop-to-Chrome
field:

- `desktop-canonical-library-metadata`

## Chrome Read-Only Mirror / Display Behavior

`folder-import.mv3.js` now:

- normalizes `desktopCanonicalLibraryMetadata` from incoming Desktop
  `latest.json` bundles.
- stores the sanitized projection in the existing Chrome mirror state:
  `h2o:prm:cgx:fldrs:state:data:v1.desktopCanonicalLibraryMetadata`.
- persists the same snapshot in the sync-folder import state.
- exposes the snapshot through:
  - `H2O.Studio.sync.folder.getDesktopCanonicalLibraryMetadata()`
  - `H2O.Studio.sync.folder.diagnoseDesktopCanonicalLibraryMetadata()`
- includes compact import/readiness summaries in `status()`, `diagnose()`, and
  import results.

Direct label/category display names remain deferred because the Phase 2
Desktop projection is intentionally hash-only. The Chrome read model can show
and compare projection presence, counts, hashes, and readiness safely, but it
does not have raw names/colors to render as user-facing facet labels.

## Diagnostics Updates

`library-metadata-diagnostics.js` now summarizes the Desktop canonical metadata
projection:

- On Chrome, from `H2O.Studio.sync.folder` imported mirror APIs.
- On Desktop, from the Phase 2 read-only export projection builder when
  available.

Snapshots now include:

- `desktopCanonicalLibraryMetadata`
- `counts.desktopCanonicalMetadataLabelCount`
- `counts.desktopCanonicalMetadataTagCount`
- `counts.desktopCanonicalMetadataCategoryCount`
- `counts.desktopCanonicalMetadataChatCategoryAssignmentCount`
- `hashes.desktopCanonicalLibraryMetadataProjection`

Snapshot comparison now reports:

- `library-metadata-diagnostics-desktop-canonical-projection-mismatch`

This allows Phase 3 diagnostics to prove that Chrome has imported the same
Desktop canonical metadata projection by comparing sanitized counts and hashes.

## Privacy / Sanitization Behavior

Chrome accepts only the hash/count projection shape:

- catalog rows keep `subjectHash`, `nameHash`, `colorHash`, `sourceHash`, and
  `parentHash`.
- binding rows keep `subjectHash`, `leftSubjectHash`, and `rightSubjectHash`.
- unknown/raw fields from the incoming projection are dropped.

Chrome does not expose:

- raw chat IDs
- raw chat titles
- raw chat content
- raw label names
- raw tag names
- raw category names
- raw colors
- account-linked metadata

## No-Side-Effect Guarantees

Phase 3 does not add:

- Chrome request export.
- Desktop apply behavior.
- Chrome canonical mutation.
- Desktop canonical metadata mutation.
- WebDAV/cloud/relay transport.
- hard delete, purge, chat delete, snapshot delete, asset delete, label delete,
  tag delete, category delete, or metadata delete behavior.

The only write is the existing Chrome import mirror/cache pattern used for
Desktop-to-Chrome imported read models. The projection is flagged as:

- `desktopAuthority: true`
- `chromeAuthority: false`
- `readOnlyProjection: true`
- `chromeRequestExport: false`
- `desktopApply: false`
- `canonicalMutation: false`

## Intentionally Not Implemented

- Chrome-origin metadata request export.
- Desktop metadata request apply behavior.
- Desktop metadata apply receipts.
- Raw display-name export or rendering.
- WebDAV/cloud/relay transport.
- Any canonical metadata mutation from Chrome.

## Validator / Proof Output

Commands run:

```text
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js
node --check tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs
node tools/validation/sync/validate-labels-tags-categories-phase3-chrome-import-display.mjs
node tools/validation/sync/validate-labels-tags-categories-phase2-desktop-export.mjs
node tools/validation/sync/validate-labels-tags-categories-phase1-diagnostics.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/sync/validate-f15-cutover.mjs
```

Results:

```text
PASS validate-labels-tags-categories-phase3-chrome-import-display
PASS validate-labels-tags-categories-phase2-desktop-export
Labels/tags/categories Phase 1 diagnostics validation passed
[f19-sync-hardening] PASS
F15 cutover validation passed
```

The Phase 3 validator proves:

- Chrome recognizes `desktopCanonicalLibraryMetadata`.
- `importLatestBundle()` imports it through the existing Chrome import path.
- The projection is stored in the Chrome mirror state as read-only.
- The public getter and diagnostic APIs expose counts/hashes only.
- Metadata diagnostics see the imported projection as a Chrome source.
- Raw secret names/IDs injected into the fixture are dropped.
- Chrome request export remains absent.
- Desktop apply behavior remains absent.
- Chrome canonical mutation remains absent.
- no delete/purge boundaries remain asserted.

## Remaining Gaps

- Runtime proof against a real Desktop `latest.json` and Chrome Studio import
  is still needed.
- User-facing label/category names are not rendered because the exported
  projection intentionally does not include raw names/colors.
- Chrome-origin metadata request export remains unimplemented.
- Desktop metadata apply and receipt behavior remain unimplemented.

## Phase 3 Verdict

Phase 3 Chrome import/display-read parity: READY FOR REVIEW.

Product metadata sync implementation: NOT READY.

## Recommended Phase 4

Run Desktop-origin convergence/runtime proof for the Phase 2/Phase 3 path:

1. Desktop exports `desktopCanonicalLibraryMetadata` to `latest.json`.
2. Chrome imports it through the existing sync-folder import path.
3. Chrome diagnostics confirm projection presence, matching counts, matching
   projection hash, and read-only/no-mutation guarantees.

Still do not add Chrome request export or Desktop apply behavior in Phase 4.
