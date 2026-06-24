# Phase 4F Packaged Delete / Restore Lifecycle Smoke

Date: 2026-06-24

## Purpose

Phase 4F verifies the closed Phase 4C-4E local delete/restore lifecycle against the packaged local Desktop app path, not only the dev Desktop runtime.

This is verification/evidence only. It does not add purge, hard delete, WebDAV/cloud/relay, a Recently Deleted UI panel, or any product behavior change.

## Artifact Paths

Packaged Desktop app:

```text
/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source/apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app
```

Local sync folder:

```text
/Users/hobayda/H2O Studio Sync
```

Desktop smoke command queue:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json
```

Desktop smoke results:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/results
```

Chrome CDP port:

```text
9247
```

## Build / Package Commands

Commands run:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
cd apps/studio/desktop
npm run tauri:build -- --bundles app
```

Results:

- `npm run dev:all` passed.
- `prepare-dist` copied `282` files into `apps/studio/desktop/dist/`.
- `prepare-dist` sanitized `56` filenames and rewrote `56` `src=` references.
- Tauri release build passed.
- Packaged app bundled successfully at the app path above.

The packaged app was opened with:

```bash
open -na "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source/apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app"
```

## Desktop Packaged Smoke Gate

Before proof, stale command file was cleared:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

Command:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"healthy"`
- `surface:"desktop-studio"`
- `adapter:"tauri"`
- `registryGatesEnabled:true`
- `commandPathScoped:true`
- `resultPathScoped:true`
- `tauriFsRootScoped:true`
- `blockers:[]`
- `noArbitraryEval:true`
- `noRawSql:true`
- `noHardDelete:true`
- `noPurge:true`
- `noTombstonePropagationApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noBroadFilesystemAccess:true`

## Chrome CDP Smoke Gate

Chrome CDP was verified on port `9247`.

Direct CDP `/json/version` was reachable and reported:

- `Browser:"Chrome/151.0.7896.2"`

Command:

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op diagnoseHealth \
  --timeout-ms 30000
```

Result:

- `ok:true`
- `status:"healthy"`
- `studioTargetFound:true`
- `smokeUrlFlagPresent:true`
- `registryGatesEnabled:true`
- `surface:"chrome-studio"`
- `adapter:"mv3"`
- `targetProbeSummary.connectedGrantedTargetCount:1`
- `selectedTargetSyncPermission:"granted"`
- `selectedTargetSyncConnected:true`
- `selectedTargetChromeWritesSyncFolder:true`
- `syncFolderDiagnose.connected:true`
- `syncFolderDiagnose.permission:"granted"`
- `syncFolderDiagnose.folderName:"H2O Studio Sync"`
- `syncFolderDiagnose.chromeWritesSyncFolder:true`
- `permissionRequired:false`
- `noFolderHandle:false`
- `blockers:[]`

Operational note: local CDP helper access requires local HTTP/WebSocket access to `127.0.0.1:9247`.

## Packaged 4D.4 Delete / Restore Smoke

Command:

```bash
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 120000
```

Result:

- `ok:true`
- `status:"delete-restore-smoke-passed"`
- `folderId:"fold_smoke_zz-4d4-delete-restore-mqs39rdz_mqs39rmd_3fa4ab0bfb80"`
- `createdOrSelectedFolderName:"zz-4d4-delete-restore-mqs39rdz"`
- `requestId:"folder-delete-request:182d0d06-eb68-4918-9086-d8e482f1f79e"`
- `reviewId:"folder-delete-request:182d0d06-eb68-4918-9086-d8e482f1f79e"`
- `tombstoneId:"tombstone:9dbffc6e-d9a0-467b-8898-58c8415e2a48"`
- `blockers:[]`

Lifecycle assertions:

- `deleteRequestCreated:true`
- `chromeLatestHasRequest:true`
- `chromeLatestRequestPath:"folderDeleteRequests[0]"`
- `chromeLatestRequestCount:5`
- `desktopDeleteRequestImported:true`
- `desktopDeleteRequestStatus:"pending"`
- `desktopDeleteApplied:true`
- `chromeHidden:true`
- `desktopRestoreApplied:true`
- `restoreReceiptExported:true`
- `chromeReShown:true`
- `finalChromeVisible:true`
- `finalDesktopVisible:true`
- `folderIdMatch:true`

Safety assertions:

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noTombstoneApplyOnChrome:true`
- `noRawSql:true`
- `noBroadFilesystemAccess:true`

Count proof:

- `baselineChromeChatCount:32`
- `baselineDesktopChatCount:32`
- `finalChromeChatCount:32`
- `finalDesktopChatCount:32`
- `chromeChatCountDelta:0`
- `desktopChatCountDelta:0`
- `baselineChromeSnapshotCount:0`
- `baselineDesktopSnapshotCount:20`
- `finalChromeSnapshotCount:0`
- `finalDesktopSnapshotCount:20`
- `chromeSnapshotCountDelta:0`
- `desktopSnapshotCountDelta:0`

Receipt import diagnostics:

- delete receipt import remained visible-state-only:
  - `visibleStateOnlyHide:true`
  - `noTombstoneApply:true`
  - `noTombstoneCreate:true`
  - `noHardDelete:true`
  - `noChatDelete:true`
- restore receipt import remained visible-state-only:
  - `visibleStateOnlyReShow:true`
  - `noTombstoneApply:true`
  - `noTombstoneCreate:true`
  - `noHardDelete:true`
  - `noChatDelete:true`

Non-blocking warnings:

- deferred label/tombstone/apply-event/tag/chat-folder-binding propagation warnings appeared.
- an older unmatched delete receipt warning appeared inside delete receipt diagnostics.
- these were non-blocking because the runner top-level `blockers` array was empty and all lifecycle/safety/final-visibility assertions passed.

## Packaged 4E Retention Diagnostics

Command:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op listRecentlyDeletedFolders \
  --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"recently-deleted-folders-listed"`
- `registryGatesEnabled:true`
- `blockers:[]`
- `retentionDays:30`
- `retentionEnforcement:"deferred"`
- `activeRetentionCount:24`
- `expiredRetentionCount:4`
- `restoredRetentionCount:11`
- `unknownRetentionCount:0`
- `purgeEligibleCount:0`
- `purgeBlockedCount:39`
- `hardDeleteBlockedCount:39`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

The new packaged smoke tombstone appeared as restored:

- `tombstoneId:"tombstone:9dbffc6e-d9a0-467b-8898-58c8415e2a48"`
- `folderId:"fold_smoke_zz-4d4-delete-restore-mqs39rdz_mqs39rmd_3fa4ab0bfb80"`
- `retentionCountdownStatus:"restored"`
- `retentionEnforcement:"deferred"`
- `purgeEligible:false`
- `purgeBlocked:true`
- `hardDeleteBlocked:true`
- `restorePolicy:"allowed-while-purge-deferred"`
- `restoreAvailableReason:"already-restored"`
- `purgeBlockedReason:"purge-phase-deferred"`

Expired tombstones remained non-purgeable:

- `retentionCountdownStatus:"expired"`
- `retentionExpired:true`
- `retentionEnforcement:"deferred"`
- `purgeEligible:false`
- `purgeBlocked:true`
- `restorePolicy:"allowed-while-purge-deferred"`
- `restoreAvailableReason:"retention-expired-but-purge-deferred"`
- `purgeBlockedReason:"purge-phase-deferred"`

## Validation

Passed:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
cd apps/studio/desktop && npm run tauri:build -- --bundles app
git diff --check
git diff --cached --check
```

No runtime code changed for Phase 4F, so targeted JS validators were not rerun.

## Verdict

Phase 4F packaged delete/restore lifecycle smoke passed.

The rebuilt packaged local Desktop app can run the dev-only Desktop smoke queue, Chrome CDP can drive Chrome Studio against the same local sync folder, and the full delete/restore lifecycle remains green in packaged-path validation:

- Chrome request/export
- Desktop import/review/apply soft delete
- Desktop delete receipt export
- Chrome visible-state hide
- Desktop restore
- Desktop restore receipt export
- Chrome visible-state re-show
- retention diagnostics with purge enforcement deferred

No purge, hard delete, chat deletion, snapshot deletion, Chrome tombstone apply/create, WebDAV/cloud/relay, or UI-heavy Recently Deleted work was introduced.
