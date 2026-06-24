# Phase 5A.5 Canonical Visible Folder Set Alignment

## Verdict

Phase 5A.5 aligns the normal visible folder source across Desktop UI, Desktop `latest.json` export, and Chrome UI.

The root cause was that Desktop UI still preferred the stored `folder-state` mirror for `FolderParity.getDisplayModel()`, while Desktop export used the live Desktop folder store and then merged fallback cache rows. Desktop UI was under-showing folders while Chrome followed the latest exported set.

## Fix

- Desktop `FolderParity` now treats live `H2O.Studio.store.folders.list()` rows as the authoritative Desktop visible source.
- Desktop store visible rows are authoritative.
- Stored `folder-state` mirror rows remain fallback/metadata input only, not visible-row authority on Desktop.
- Desktop `latest.json` export keeps fallback cache as metadata/binding fill for primary Desktop rows only.
- The fallback cache metadata fill only rule prevents stale mirror-only rows from becoming normal visible export rows.
- Fallback-only rows are skipped as normal visible export rows.
- A read-only smoke diagnostic op, `diagnoseCanonicalVisibleFolderSet`, reports Desktop store, Desktop UI display, Desktop latest export, Chrome display, and Chrome stored Desktop-visible set side by side.

## Safety

- No Chrome delete/restore authority was added.
- No tombstone create/apply was added.
- No hard delete.
- No purge.
- No chat deletion.
- No snapshot deletion.
- WebDAV/cloud/relay remains deferred.

Safety flags preserved:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Validation

Validation run:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
node --check "src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js"
node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js
node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js
node --check tools/smoke/chrome-cdp-studio.mjs
node --check tools/smoke/desktop-folder-sync-queue-client.mjs
node --check tools/validation/sync/validate-folder-visible-parity-phase5a5.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a5.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a4.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a3.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a2.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a1.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a0.mjs
node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs
node tools/validation/sync/validate-folder-retention-phase4e.mjs
node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs
node tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs
git diff --check
git diff --cached --check
```

Results:

- `npm run dev:all` passed.
- `node apps/studio/desktop/build-tools/prepare-dist.mjs` passed and copied 284 files into Desktop dist.
- `node --check` passed for changed JS/MJS files.
- `node tools/validation/sync/validate-folder-visible-parity-phase5a5.mjs` passed.
- Phase 5A.0 through Phase 5A.4 validators passed.
- Existing delete/restore, retention, Recently Deleted UI, and Folder Sync Health dashboard validators passed.
- `git diff --check` passed.

## Runtime Retest Commands

Desktop canonical diagnostic:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseCanonicalVisibleFolderSet --timeout-ms 60000
```

Desktop export:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a5-canonical-visible-set-export"}' --timeout-ms 60000
```

Chrome import:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a5-canonical-visible-set-import"}' --timeout-ms 60000
```

Chrome parity:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op getFolderModel --timeout-ms 60000
```

Expected after runtime refresh:

- Desktop UI display count equals Desktop export visible count.
- Chrome visible folder count equals Desktop export visible count.
- `desktopUiOnly:[]`
- `desktopExportOnly:[]`
- `chromeOnly:[]`
- `desktopOnlyVisibleFolderCount:0`
- `chromeOnlyVisibleFolderCount:0`
- `candidateStaleFolderCount:0`
- stale `zz-4d4-delete-restore...` rows remain hidden from normal Chrome UI.

## Runtime Proof

Desktop queue note:

- Clearing `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json` succeeded.
- `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000` timed out with `status:"desktop-queue-timeout"`.
- Because the Desktop queue did not process even `diagnoseHealth`, a fresh Desktop export could not be produced in this run. Operator recovery remains: open/reload Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set `h2o:studio:smoke-bridge:enabled:v1=folder-sync-rc`, and confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`.

Prepared asset proof:

- `apps/studio/desktop/dist/S0F1b-Library-Workspace-Studio.js` contains `diagnoseCanonicalVisibleFolderSet` and `desktopStoreVisibleAuthoritative`.
- `apps/studio/desktop/dist/ingestion/export-bundle.tauri.js` contains `skippedFallbackVisibleFolderCount` and `fallbackVisibleAuthority:false`.
- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/S0F1b. 🎬 Library Workspace - Studio.js` contains `diagnoseCanonicalVisibleFolderSet`.
- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js` allowlists `diagnoseCanonicalVisibleFolderSet`.

Chrome CDP proof after reloading the Studio target on port 9247:

- `diagnoseCanonicalVisibleFolderSet` returned `ok:true`.
- `status:"canonical-visible-folder-set-diagnosed"`.
- `desktopUiDisplayCount:14`.
- `chromeDisplayCount:14`.
- `chromeStoredDesktopVisibleSetCount:14`.
- `desktopUiOnly:[]`.
- `desktopExportOnly:[]`.
- `chromeOnly:[]`.
- `latestOnly:[]`.
- `hiddenButExported:[]`.
- `visibleButNotExported:[]`.
- `noTombstoneApplyOnChrome:true`.
- `noTombstoneCreateOnChrome:true`.
- `noHardDelete:true`.
- `noPurge:true`.
- `noChatDelete:true`.
- `noSnapshotDelete:true`.

Chrome visible parity proof:

- `diagnoseVisibleFolderParity` returned `ok:true`.
- `desktopVisibleFolderCount:14`.
- `chromeVisibleFolderCount:14`.
- `chromeOnlyVisibleFolderCount:0`.
- `desktopOnlyVisibleFolderCount:0`.
- `chromeOnlyVisibleFolders:[]`.
- `desktopOnlyVisibleFolders:[]`.
- `importedDesktopVisibleFolderCount:10`.
- `candidateStaleFolderCount:0`.
- stale delete/restore rows remained hidden from the normal model.

Chrome folder model proof:

- `getFolderModel` returned `ok:true`.
- `status:"folder-model-read"`.
- `rowCount:14`.
- `canonicalRowCount:14`.
- `displayModelAvailable:true`.
