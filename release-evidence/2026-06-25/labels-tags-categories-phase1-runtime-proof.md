# Labels / Tags / Categories Phase 1 Runtime Proof

Date: 2026-06-29
Repo: `/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source`

Reference commits:

- Audit: `d94f796402ef6421f2b239659c8d6ab644e52a99`
- Phase 1 diagnostics implementation: `f93c7233b614b5926ea3aafa6bea78c0985ef5f4`
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Verdict

Phase 1 diagnostics runtime proof: PASS.

Product metadata sync implementation: NOT READY.

The runtime proof confirms that `H2O.Studio.sync.libraryMetadataDiagnostics` is available in both Desktop Studio and Chrome Studio MV3, captures sanitized snapshots without throwing, and can compare Desktop/Chrome metadata state without side effects. The comparison intentionally reports mismatch because Desktop canonical metadata export and Chrome import/display parity are not implemented yet. That mismatch is useful evidence: the Phase 1 diagnostics can safely detect Desktop/Chrome metadata divergence without adding product sync writes.

## Runtime Surfaces Tested

Desktop Studio:

- `surface`: `desktop-studio`
- `platformAdapter`: `tauri`
- `isTauri`: `true`
- `isChromeRuntime`: `false`
- Snapshot captured successfully.

Chrome Studio MV3:

- `surface`: `chrome-studio`
- `platformAdapter`: `mv3`
- `isTauri`: `false`
- `isChromeRuntime`: `true`
- Snapshot captured successfully.

Runtime APIs proved on both surfaces:

- `H2O.Studio.sync.libraryMetadataDiagnostics.captureSnapshot`
- `H2O.Studio.sync.libraryMetadataDiagnostics.runDiagnostic`

## Commands Used

Desktop Studio DevTools, run once:

```js
(async () => {
  const api = H2O?.Studio?.sync?.libraryMetadataDiagnostics;
  if (!api) return { ok: false, error: 'libraryMetadataDiagnostics missing' };
  const snapshot = await api.captureSnapshot();
  console.log(JSON.stringify({ surface: 'desktop', snapshot }, null, 2));
  return snapshot;
})()
```

Chrome Studio DevTools, run once:

```js
(async () => {
  const api = H2O?.Studio?.sync?.libraryMetadataDiagnostics;
  if (!api) return { ok: false, error: 'libraryMetadataDiagnostics missing' };
  const snapshot = await api.captureSnapshot();
  console.log(JSON.stringify({ surface: 'chrome', snapshot }, null, 2));
  return snapshot;
})()
```

Comparison, run once in a Studio DevTools surface after pasting both captured snapshots:

```js
(async () => {
  const api = H2O?.Studio?.sync?.libraryMetadataDiagnostics;
  const desktopSnapshot = /* pasted Desktop snapshot object */;
  const chromeSnapshot = /* pasted Chrome snapshot object */;
  const result = await api.runDiagnostic({ desktopSnapshot, chromeSnapshot });
  console.log(JSON.stringify({ comparison: result }, null, 2));
  return result;
})()
```

## Desktop Snapshot Summary

Counts:

| Field | Value |
| --- | ---: |
| `libraryIndexRows` | 41 |
| `libraryIndexActiveRows` | 0 |
| `rowsWithLabels` | 0 |
| `rowsWithTags` | 0 |
| `rowsWithCategories` | 0 |
| `rowsWithClassificationSignals` | 0 |
| `rowsWithProjectSignals` | 0 |
| `labelFacetCount` | 0 |
| `tagFacetCount` | 0 |
| `categoryFacetCount` | 0 |
| `classificationFacetCount` | 0 |
| `labelStoreRows` | 16 |
| `tagStoreRows` | 0 |
| `categoryStoreRows` | 12 |
| `chatStoreRows` | 41 |
| `chatCategoryAssignments` | 28 |

Interpretation:

- Desktop metadata stores are visible to the diagnostic.
- Label and category store counts are visible as sanitized counts.
- Category assignments are visible through sanitized chat category-cache counts.
- No private chat content is required or emitted.

## Chrome Snapshot Summary

Counts:

| Field | Value |
| --- | ---: |
| `libraryIndexRows` | 38 |
| `libraryIndexActiveRows` | 38 |
| `rowsWithLabels` | 0 |
| `rowsWithTags` | 0 |
| `rowsWithCategories` | 28 |
| `rowsWithClassificationSignals` | 28 |
| `rowsWithProjectSignals` | 0 |
| `labelFacetCount` | 0 |
| `tagFacetCount` | 0 |
| `categoryFacetCount` | 4 |
| `classificationFacetCount` | 4 |
| `labelStoreRows` | 0 |
| `tagStoreRows` | 0 |
| `categoryStoreRows` | 0 |
| `chatStoreRows` | 0 |
| `chatCategoryAssignments` | 0 |

Interpretation:

- Chrome mirror/facet/read-model metadata is visible to the diagnostic.
- Category and classification signals are represented as sanitized shape/count/hash state.
- Chrome store rows are zero because Chrome remains mirror/facet/read-model only in Phase 1.
- Chrome store unavailable warnings are expected at this phase.

## Privacy And Sanitization

Both Desktop and Chrome snapshots reported safe privacy flags:

- `redacted`: `true`
- `hashOnly`: `true`
- Raw ids returned: `false`
- Raw titles returned: `false`
- Raw content returned: `false`
- Raw label names returned: `false`
- Raw tag names returned: `false`
- Raw category names returned: `false`
- Raw colors returned: `false`
- Account-linked metadata returned: `false`

The proof output is suitable as Phase 1 evidence because it uses shape, count, hash, boolean, and warning-code summaries rather than private chat content.

## Side-Effect Safety

Both Desktop and Chrome snapshots reported side-effect flags as false:

- No storage writes.
- No SQLite writes.
- No Chrome storage writes.
- No import invoked.
- No export invoked.
- No `syncNow` invoked.
- No apply executed.
- No Desktop apply executed.
- No Chrome request exported.
- No canonical mutation attempted.
- No delete executed.
- No purge executed.
- No chat delete.
- No snapshot delete.
- No asset delete.

This proof did not add sync writes, Desktop apply behavior, Chrome request export, or Chrome canonical mutation.

## Deferred Warning Coverage

The diagnostic proof covered the relevant deferred warning taxonomy:

- `library-propagation-labels-deferred`
- `library-propagation-tags-deferred`
- `library-propagation-unsupported-storage-deferred`

The comparison also surfaced a deferred-warning mismatch, which remains visible and expected until the next sync phases define and export a Desktop canonical metadata projection.

## Comparison Result

Compact comparison summary:

```json
{
  "schema": "h2o.studio.sync.library-metadata-diagnostics-comparison.v1",
  "version": "0.1.0-phase1",
  "phase": "phase1-read-only-diagnostics",
  "ok": false,
  "status": "mismatch",
  "mismatchCount": 9,
  "warningCount": 5,
  "blockerCount": 4
}
```

Mismatch codes:

- `library-metadata-diagnostics-category-mismatch`
- `library-metadata-diagnostics-classification-mismatch`
- `library-metadata-diagnostics-category-mismatch`
- `library-metadata-diagnostics-classification-mismatch`
- `library-metadata-diagnostics-label-mismatch`
- `library-metadata-diagnostics-category-mismatch`
- `library-metadata-diagnostics-classification-mismatch`
- `library-metadata-diagnostics-classification-mismatch`
- `library-metadata-diagnostics-deferred-warning-mismatch`

Warnings:

- `library-metadata-diagnostics-product-sync-not-ready`
- `library-metadata-diagnostics-store-unavailable:categories`
- `library-metadata-diagnostics-store-unavailable:chats`
- `library-metadata-diagnostics-store-unavailable:labels`
- `library-metadata-diagnostics-store-unavailable:tags`

Blockers:

- `library-metadata-diagnostics-category-mismatch`
- `library-metadata-diagnostics-classification-mismatch`
- `library-metadata-diagnostics-deferred-warning-mismatch`
- `library-metadata-diagnostics-label-mismatch`

Interpretation:

- Runtime comparison executed successfully.
- The mismatch result is expected and useful.
- Product metadata sync remains intentionally incomplete.
- Desktop and Chrome currently expose different metadata read models.
- The diagnostic can detect category, classification, label, and deferred-warning divergence without mutating either surface.

## Risks And Notes

- Deferred warning mismatch remains visible.
- Category, classification, and label mismatches are expected until Desktop canonical metadata export plus Chrome import/display parity are implemented.
- Chrome store unavailable warnings are expected because Chrome is mirror/facet/read-model only in Phase 1.
- Product sync remains NOT READY.
- This evidence does not close Phase 2 or later work.

## Recommended Next Slice

Phase 2: Desktop canonical metadata export only.

Phase 2 should remain Desktop-authoritative and read-only for Chrome:

- Add a Desktop-owned canonical metadata export projection for labels, tags, and categories.
- Include catalog and binding shape needed for Desktop-origin metadata display parity.
- Keep Chrome request export out of scope.
- Keep Desktop apply behavior out of scope.
- Keep Chrome direct canonical mutation out of scope.
- Preserve no hard delete, no purge, no chat delete, no snapshot delete, and no asset delete boundaries.
