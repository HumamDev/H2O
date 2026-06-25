# Phase 6B.4b - Runtime Permission Recovery

## Verdict

Phase 6B.4b runtime permission recovery was attempted on June 25, 2026.

No product code changes were made. The full Chrome-to-Desktop soft-delete loop remains blocked by local runtime permission/gate state:

- Chrome CDP profile on port `9247` is reachable, but its sync folder handle is not granted.
- Desktop smoke queue filesystem access is available, but Desktop Studio WebView is not processing queue commands.

This is a runtime/operator setup blocker, not a product-code change request.

## Implementation Under Test

Phase 6B.4 implementation:

- `9af5cba` - `fix(sync): apply chrome soft delete on desktop`

Prior Phase 6B.4 runtime recovery evidence:

- `7c2a0ae` - `docs(sync): record chrome desktop soft delete runtime proof`

Previously proven in the same 6B.4 recovery chain:

- Chrome CDP `getFolderModel` passed.
- Chrome folder creation passed.
- Chrome request-only delete passed.
- Request ID: `folder-delete-request:815c4102-a68a-43b5-806c-a5b53a58ec6a`

## Chrome Permission Recovery Probe

Command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"blocked"`
- target URL:
  - `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders`
- `registryGatesEnabled:true`
- `syncFolderDiagnose.connected:false`
- `syncFolderDiagnose.permission:"unknown"`
- `syncFolderDiagnose.folderName:"H2O Studio Sync"`
- `syncFolderDiagnose.fileSystemAccessAvailable:true`
- `syncFolderDiagnose.chromeWritesSyncFolder:false`
- `syncFolderDiagnose.chromeToDesktopPermission:"granted"`
- `syncFolderDiagnose.permissionRequired:true`
- `syncFolderDiagnose.noFolderHandle:true`
- blockers:
  - `permission-required`
  - `no-folder-handle`
  - `chrome-to-desktop-export-failed`
- last Chrome export error:
  - `sync folder not connected - use Connect Folder first`

Interpretation:

The Chrome Studio CDP profile is loaded, the Studio Launcher extension is present, and the smoke registry is enabled. Chrome cannot export `chrome-latest.json` until the same profile is granted File System Access to:

```text
/Users/hobayda/H2O Studio Sync
```

The `9247` profile uses:

```text
/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9247
```

If another normal Chrome Dev profile already has the folder handle, it does not satisfy this CDP profile. The handle must be granted in the same profile used for the proof, or the proof must be run against the already-granted profile.

## Desktop Queue Permission Recovery Probe

Commands:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
ls -la "/Users/hobayda/H2O Studio Sync/.h2o-smoke"
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000
```

Filesystem result:

- `/Users/hobayda/H2O Studio Sync/.h2o-smoke` exists.
- `desktop-command.json` was cleared.
- `results/` exists.
- No filesystem `EPERM` occurred during this recovery pass.

Desktop queue result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `commandPath:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"`
- `resultsDir:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/results"`
- `resultPath:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/desktop-diagnoseHealth-mqtgdcy6.json"`
- blockers:
  - `desktop-queue-timeout`
- helper next action:
  - open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`
  - set `localStorage h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`
  - confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

Interpretation:

The remaining Desktop blocker is not the smoke folder permission. It is Desktop WebView gate/runtime state: the WebView is not currently processing smoke queue commands.

## Required Operator Recovery

### Chrome

In the exact Chrome profile used for the runtime proof, open Chrome Studio and use the Connect Folder flow to grant:

```text
/Users/hobayda/H2O Studio Sync
```

Then verify:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 60000
```

Expected:

- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`

### Desktop

Open Desktop Studio at:

```text
http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders
```

In Desktop DevTools:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc')
const u = new URL(location.href)
u.searchParams.set('h2oSmokeBridge', 'folder-sync-rc')
location.href = u.toString()
```

After reload:

```js
H2O.Studio.devSmoke.folderSyncQueue.diagnose()
```

Expected:

- `enabled:true`
- `started:true`
- `blockers:[]`
- `registryBlockers:[]`

## 6B.4 Loop Status

The full 6B.4 runtime loop was not rerun because both required runtime gates are still blocked:

- Chrome export cannot proceed without a granted sync folder handle in the active proof profile.
- Desktop import/apply cannot proceed until Desktop Studio processes the smoke queue.

Once both gates are recovered, rerun:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"phase6b4b-runtime-export"}' --timeout-ms 60000
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"phase6b4b-runtime-import-apply"}' --timeout-ms 60000
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase6b4b-runtime-receipt-export"}' --timeout-ms 60000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase6b4b-runtime-receipt-import"}' --timeout-ms 60000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChromeRecentlyDeletedCompanion --timeout-ms 60000
```

## Safety Invariants

Preserved during this recovery pass:

- no Chrome permanent delete
- no Chrome restore authority
- no Chrome purge authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay

## Final Status

Phase 6B.4b did not require a product code change.

Remaining blockers:

- Chrome `9247` profile needs sync folder handle grant.
- Desktop WebView must be opened/reloaded with the folder-sync RC smoke bridge gate enabled and queue processing started.

After those operator gates are recovered, the full 6B.4 Chrome-to-Desktop soft-delete propagation proof can be rerun.
