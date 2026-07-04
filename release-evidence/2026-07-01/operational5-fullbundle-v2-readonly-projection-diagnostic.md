# Operational.5 - fullBundle.v2 Read-Only Projection Diagnostic

Verdict: **OPERATIONAL.5 FULLBUNDLE.V2 READ-ONLY PROJECTION DIAGNOSTIC IMPLEMENTED**.

This slice resolves the only not-exposed surface from the live Operational.5 diagnostic after
commit `0291e55d75542a482a7ff3538e4d1733c4b0ec87`: `fullBundleV2Projection.status:"not-exposed"`.

The fix is a minimal diagnostic/read-only product source exposure. It does not run a real export and
does not mutate product state.

## Source Change

Changed:

- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`

Added:

- `H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()`

The new method builds the `fullBundle.v2` folder and chat-folder binding projection in memory using
existing read-only projection helpers, then returns only counts, hashes, diagnostics, and safety
flags. It does not call `exportFullBundle()` or `exportLatestSyncBundle()`.

## Exposed Fields

The diagnostic returns schema:

`h2o.studio.fullBundle.v2.readonly-projection-diagnostic.v1`

It includes:

- `fullBundleSchema:"h2o.studio.fullBundle.v2"`
- `readOnlyProjection:true`
- `writesData:false`
- `writesFiles:false`
- `writesTransport:false`
- `mutatesExportState:false`
- `noExportFullBundleCall:true`
- `noExportLatestSyncBundleCall:true`
- `folderProjection.count`
- `folderProjection.hash`
- `folderStateBindingProjection.count`
- `folderStateBindingProjection.hash`
- `canonicalChatFolderBindingProjection.count`
- `canonicalChatFolderBindingProjection.hash`
- `canonicalChatFolderBindingProjection.activeCount`
- `canonicalChatFolderBindingProjection.activeHash`
- `chatFolderBindingReceiptProjection.count`
- `chatFolderBindingReceiptProjection.hash`

## Operational.5 Live Diagnostic Update

The live DevTools diagnostic in:

`release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md`

now calls `H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()` when present and compares
the read-only `fullBundle.v2` projection counts/hashes against current Desktop canonical folder,
binding, and receipt summaries.

If the method is missing or returns `ok:false`, the surface remains `not-exposed`; the snippet still
does not call a real export.

## Boundaries

- No real bundle export was run.
- No sync latest file was written.
- No export sequence/exportId/contentSha mutation was introduced.
- No transport enqueue happened.
- No WebDAV/cloud/relay/`fullBundle.v3` started.
- No Chat Saving WebDAV/cloud/archive CAS was touched.
- No canonical folders, `folder_bindings`, tombstones, ledgers, receipts, render mirror, import
  state, or restart convergence records were mutated.
- `productSyncReady` remains `false`.

## Next Step

Rerun the Desktop Studio Operational.5 live read-only DevTools diagnostic from
`operational5-live-readonly-canonical-count-parity-diagnostic.md`. The previous
`fullBundle.v2` not-exposed blocker should now become observable as
`fullBundle.v2-readonly-projection-diagnostic`.
