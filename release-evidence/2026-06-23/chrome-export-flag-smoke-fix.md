# Chrome Export Flag Smoke Fix

Date: 2026-06-23

## Purpose

Fix the local folder sync smoke blocker where Chrome Studio had a connected File System Access folder with `permission:"granted"`, but Chrome-to-Desktop export still returned `chrome-to-desktop-export-flag-off`.

## Root Cause

`H2O.Studio.sync.folder.exportChromeToSyncFolder(...)` delegates to `H2O.Studio.sync.autoImport.exportNow(...)`.

`exportNow(...)` checks the legacy master flag before it checks the connected folder handle. The disabled flag was:

```text
sync.chromeAutoImport
```

That flag name is historical: in this code path it gates Chrome-to-Desktop `chrome-latest.json` writes, not Desktop-to-Chrome import. The normal folder mutation auto-sync path can bypass the broad manual flag with `folderAutoSync`, but manual smoke preflight calls such as `syncNow({ direction:"chrome-to-desktop" })` could not.

## Fix

Added an explicit smoke-only Chrome export opt-in:

```text
h2o:studio:smoke-bridge:chrome-export-enabled:v1 = folder-sync-rc
```

The smoke opt-in only enables Chrome export when all of these are true:

- Chrome extension surface is detected.
- Public release flags are not active.
- Existing smoke bridge opt-in is set:
  `h2o:studio:smoke-bridge:enabled:v1 = folder-sync-rc`
- The new Chrome export opt-in is set:
  `h2o:studio:smoke-bridge:chrome-export-enabled:v1 = folder-sync-rc`

Normal `H2O.flags.set("sync.chromeAutoImport", true)` behavior remains supported. Production/public release behavior remains blocked by default.

## Files Changed

- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `release-evidence/2026-06-23/chrome-export-flag-smoke-fix.md`

## Diagnostic Behavior

`H2O.Studio.sync.autoImport.diagnose()` now reports:

- `chromeExportWriteGate.flagKey`
- `chromeExportWriteGate.flagEnabled`
- `chromeExportWriteGate.effectiveFlagEnabled`
- `chromeExportWriteGate.smokeChromeExportOptInKey`
- `chromeExportWriteGate.smokeChromeExportEnabled`
- `chromeExportWriteGate.enableForSmokeSnippet`

`H2O.Studio.sync.folder.diagnose()` now exposes the same write gate through:

- `chromeDesktopExport.exportWriteGate`
- `chromeToDesktop.exportWriteGate`
- `chromeAutoImport.chromeExportWriteGate`

The dev smoke registry redacted `syncFolderDiagnose` summary now includes:

- `chromeExportFlagKey`
- `chromeExportFlagEnabled`
- `chromeExportSmokeEnabled`
- `chromeExportSmokeOptInKey`

## Manual Retest Snippet

Run this in the connected Chrome Studio smoke page:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc');
localStorage.setItem('h2o:studio:smoke-bridge:chrome-export-enabled:v1', 'folder-sync-rc');

const r = await H2O.Studio.sync.folder.syncNow({
  direction: 'chrome-to-desktop',
  reason: 'manual-smoke-syncnow-enable-check'
});

const d = await H2O.Studio.sync.folder.diagnose();

({
  exportOk: r.ok,
  exportStatus: r.status,
  connected: d.connected,
  permission: d.permission,
  chromeWritesSyncFolder: d.chromeWritesSyncFolder,
  lastExportStatus: d.chromeToDesktop?.lastExportStatus,
  lastExportPermission: d.chromeToDesktop?.permission,
  lastExportFile: d.chromeToDesktop?.lastExportFile,
  exportFlagEnabled: d.chromeToDesktop?.exportFlagEnabled,
  smokeExportEnabled: d.chromeToDesktop?.exportWriteGate?.smokeChromeExportEnabled,
  permissionRequired: d.blockers?.permissionRequired,
  noFolderHandle: d.blockers?.noFolderHandle
})
```

Expected after the folder is connected and permission is granted:

- `exportOk:true`
- `exportStatus:"chrome-to-desktop-exported"`
- `connected:true`
- `permission:"granted"`
- `lastExportStatus:"chrome-to-desktop-exported"`
- `lastExportPermission:"granted"`
- `lastExportFile:"chrome-latest.json"`
- `exportFlagEnabled:true`
- `smokeExportEnabled:true`
- `permissionRequired:false`
- `noFolderHandle:false`

Read-only runner verification after enabling:

```sh
node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000
```

The read-only runner should be able to verify the effective export gate state without itself performing a Chrome export.

## Validation

Commands run:

- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`

Results:

- All commands passed.

## Deferred

- Full mutation smoke runner.
- File System Access permission automation.
- Restore receipts / Chrome re-show.
- Real tombstone propagation.
- Retention/purge.
- WebDAV/cloud/relay transport adapters.
