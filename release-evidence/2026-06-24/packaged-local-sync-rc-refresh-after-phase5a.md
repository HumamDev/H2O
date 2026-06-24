# Packaged/Local Sync RC Refresh After Phase 5A

## Verdict

The post-Phase 5A packaged/local RC refresh is partially runtime-proven.

Chrome CDP Studio remained healthy and the visible folder parity checks stayed green against the latest available Desktop `latest.json` / stored Desktop visible-set state:

- Desktop visible folder count: `14`
- Chrome visible folder count: `14`
- Chrome-only visible folders: `0`
- Desktop-only visible folders: `0`
- stale candidates: `0`
- `getFolderModel rowCount:14`
- `canonicalRowCount:14`

The packaged/Desktop smoke queue health probe timed out during this refresh, so a fresh packaged Desktop queue export was not produced in this run. This matches the known runtime/gate-state caveat documented in `4ddf2f2` and is recorded here as an operator/runtime setup blocker, not a product parity-code blocker.

## Baseline

Checkpoint being refreshed:

- `8f295adca25aee668fd937255911a5caabc1f810` - `docs(sync): refresh local sync rc after phase 5a`

Packaged app path checked:

- `apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app`

Result:

- packaged app bundle present

## Commands Run

Static validators:

```bash
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
```

Runtime queue / CDP checks:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"

node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"packaged-rc-refresh-after-phase5a-import-latest-available"}' --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseCanonicalVisibleFolderSet --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op getFolderModel --timeout-ms 60000
```

Diff checks:

```bash
git diff --check
git diff --cached --check
```

## Validation Results

All static validators listed above passed.

Notable validator results:

- Phase 5A.5 validator: `ok:true`
- Desktop visible authority: `H2O.Studio.store.folders.list`
- fallback visible authority: `false`
- destructive mutation: `false`
- Phase 4E retention validator: `retentionDays:30`, `retentionEnforcement:"deferred"`, `purgeEligibleCount:0`
- Recently Deleted UI validator passed
- Folder Sync Health dashboard validator passed

## Packaged Desktop Queue Result

Desktop queue health command:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`
- `commandPathScoped:true`
- `resultPathScoped:true`
- safety flags remained true:
  - `noArbitraryEval:true`
  - `noProductionListener:true`
  - `noRawSql:true`
  - `noHardDelete:true`
  - `noPurge:true`
  - `noTombstonePropagationApply:true`
  - `noChatDelete:true`
  - `noSnapshotDelete:true`
  - `noBroadFilesystemAccess:true`

Operator recovery from the client output:

- Open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`
- set `localStorage h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`
- confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

Because queue health timed out, this refresh did not produce a fresh packaged Desktop `latest.json` export.

## Chrome CDP Health

Chrome command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"healthy"`
- browser: `Chrome/151.0.7896.2`
- Studio target found: `true`
- smoke URL flag present: `true`
- registry gates enabled: `true`
- selected target connected/granted:
  - `selectedTargetSyncConnected:true`
  - `selectedTargetSyncPermission:"granted"`
  - `selectedTargetChromeWritesSyncFolder:true`
- sync folder diagnose:
  - `connected:true`
  - `permission:"granted"`
  - `folderName:"H2O Studio Sync"`
  - `chromeWritesSyncFolder:true`
  - `permissionRequired:false`
  - `noFolderHandle:false`
- result blockers: `[]`

## Chrome Import Against Latest Available Desktop Bundle

Chrome command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"packaged-rc-refresh-after-phase5a-import-latest-available"}' --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"sync-folder-imported"`
- `direction:"desktop-to-chrome"`
- `exportedAt:"2026-06-24T18:57:51.058Z"`
- blockers: `[]`
- deferred warnings were non-blocking for labels, tombstones, apply events, tags, and chat-folder bindings.

## Visible Folder Parity Result

Canonical visible-set diagnostic:

- `ok:true`
- `status:"canonical-visible-folder-set-diagnosed"`
- `desktopUiDisplayCount:14`
- `chromeDisplayCount:14`
- `chromeStoredDesktopVisibleSetCount:14`
- `desktopUiOnly:[]`
- `desktopExportOnly:[]`
- `chromeOnly:[]`
- `latestOnly:[]`
- `hiddenButExported:[]`
- `visibleButNotExported:[]`
- `duplicateNamesDifferentIds` reported the expected distinct `English` folder IDs; Phase 5A policy does not collapse distinct IDs by name.

Visible folder parity diagnostic:

- `ok:true`
- `status:"visible-folder-parity-diagnosed"`
- `desktopVisibleSetStored:true`
- `desktopVisibleFolderCount:14`
- `chromeVisibleFolderCount:14`
- `chromeOnlyVisibleFolderCount:0`
- `desktopOnlyVisibleFolderCount:0`
- `candidateStaleFolderCount:0`
- `importedDesktopVisibleFolderCount:10`
- `pendingChromeCreatedCount:0`
- `protectedFolderCount:0`
- blockers: `[]`

Chrome folder model:

- `ok:true`
- `status:"folder-model-read"`
- `rowCount:14`
- `canonicalRowCount:14`
- `displayModelAvailable:true`

## Safety Flags

The refresh preserved:

- no Chrome tombstone apply/create
- no Chrome delete authority
- no Chrome restore authority
- no hard delete
- no purge
- no chat delete
- no snapshot delete
- no raw SQL
- no broad filesystem access

Runtime flags remained true where reported:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Blockers / Caveats

Runtime blocker:

- `desktop-queue-timeout` for the packaged/Desktop queue health check.

Interpretation:

- This prevented a fresh packaged Desktop export in this run.
- Chrome CDP health, import from the latest available Desktop bundle, visible parity diagnostics, and folder model checks were green.
- The timeout is consistent with the documented Desktop queue runtime/gate-state caveat and should be recovered by reloading/opening Desktop Studio with the smoke URL flag and localStorage opt-in, then confirming queue `started:true`.

Deferred scope remains unchanged:

- WebDAV/cloud/relay
- purge / hard delete
- public signing / notarization
- labels / tags / categories sync
- full chat-folder binding sync

## Recommendation

Keep the Phase 5A parity closure intact.

Before declaring a fresh packaged export refresh fully green, rerun the Desktop queue health/export after confirming the packaged Desktop app is open with `?h2oSmokeBridge=folder-sync-rc` and `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`.
