# Operational.5 - localExportableSyncReady Implementation

Verdict: **OPERATIONAL.5 LOCAL EXPORTABLE SYNC READY IMPLEMENTED - READ-ONLY DIAGNOSTIC; `productSyncReady:false` REMAINS**.

This slice implements a minimal read-only source-level diagnostic/readiness flag. It does not mutate
product state, does not clean or mutate `row:a950a44b859f`, does not delete or mutate folders, chats,
bindings, tombstones, ledgers, import/export state, or the render mirror, does not flip
`productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving
WebDAV/cloud/archive CAS.

## Source Change

Source file changed:

- `src-surfaces-base/studio/store/folders.tauri.js`

New read-only API:

- `H2O.Studio.store.folders.operational5LocalExportableSyncReadiness(opts)`

Result schema:

- `h2o.studio.operational5.local-exportable-sync-ready.v1`

The diagnostic reads:

- Desktop canonical folders via existing store reads.
- Desktop canonical `folder_bindings` via existing store reads.
- `fullBundle.v2` binding projection via
  `H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()` when available.

It writes nothing and reports explicit non-authority fields:

- `writesData:false`
- `writesCanonicalState:false`
- `noCleanupAuthority:true`
- `noBindingMutation:true`
- `noFolderMutation:true`
- `noChatMutation:true`
- `noTombstoneMutation:true`
- `noLedgerMutation:true`
- `noImportExportMutation:true`
- `noRenderMirrorWrite:true`

## Implemented Semantics

`localExportableSyncReady` may become true only when:

1. `exportableCanonicalBindingCount === fullBundleV2BindingProjectionCount`.
2. `exportableDanglingBindingCount === 0`.
3. every remaining raw dangling row is documented debt.
4. raw canonical debt remains visible in the result.
5. `productSyncReady:false`.
6. `transportReady:false`.
7. `webdavCloudRelayBlocked:true`.
8. `chatSavingCasBlocked:true`.

The current intended state is represented as:

- `productSyncReady:false`
- `localExportableSyncReady:true`
- `rawCanonicalBindingCount:13`
- `exportableCanonicalBindingCount:12`
- `fullBundleV2BindingProjectionCount:12`
- `documentedDebtRowTokens:["row:a950a44b859f"]`
- `remainingRawCanonicalDebtCount:1`
- `transportReady:false`
- `webdavCloudRelayBlocked:true`
- `chatSavingCasBlocked:true`

## Boundaries

This flag is not a transport gate and does not authorize:

- cleanup,
- `productSyncReady` flip,
- WebDAV/cloud/relay,
- `fullBundle.v3`,
- Chat Saving CAS,
- folder/chat/binding/tombstone/ledger/import/export/render-mirror mutation.

`row:a950a44b859f` remains documented debt. The diagnostic recognizes it only by the committed
redacted/hash token contract:

- row token: `row:a950a44b859f`
- chat token: `r:650c3cb39924`
- folder token: `r:0226fecaed5b`

Any unknown dangling row keeps `localExportableSyncReady:false`.

Strict tombstone cleanup rules remain unchanged:

- no broad text matching;
- no cleanup authorization from this flag;
- no weakening of exact folder/folderBinding tombstone verification.

## Negative Cases

The validator proves:

- `localExportableSyncReady:false` when exportable canonical count does not match `fullBundle.v2`.
- `localExportableSyncReady:false` when dangling debt is undocumented.
- `localExportableSyncReady:false` when the `fullBundle.v2` read-only projection is unavailable.
- `localExportableSyncReady:true` still leaves `productSyncReady:false`, `transportReady:false`,
  WebDAV/cloud/relay blocked, and Chat Saving CAS blocked.

## Next Step

Recommended next slice: operator may run the read-only diagnostic in Desktop Studio if live confirmation
is desired. Global `productSyncReady` remains blocked by the a950 documented-debt policy unless a later
reviewed global readiness policy explicitly changes the global definition.
