# Phase 6B.4 - Runtime Proof Recovery

## Verdict

Phase 6B.4 runtime proof recovery was attempted on June 25, 2026.

The full Chrome-to-Desktop soft-delete proof did not complete because runtime access is still blocked by local gate/permission state, not by a product-code validation failure.

Recovered:

- Chrome CDP on port `9247` is available.
- Chrome smoke registry is enabled.
- Chrome can create a folder through the smoke helper.
- Chrome can create a request-only folder delete request.
- Desktop sync-folder smoke path no longer fails with filesystem `EPERM` after running the queue client with filesystem access and clearing the stale command.

Still blocked:

- Chrome export to `chrome-latest.json` is blocked because the active Chrome profile has no stored sync folder handle.
- Desktop queue command processing still times out because Desktop Studio is not processing the smoke queue; the queue gate/page state must be enabled inside Desktop WebView.

## Implementation Under Test

Implementation commit:

- `9af5cba` - `fix(sync): apply chrome soft delete on desktop`

The implementation statically validates that Desktop auto-applies safe Chrome folder soft-delete requests through the existing guarded Desktop apply path.

## Runtime Blocker Recovery

### Desktop Queue EPERM

The previous Desktop queue failure was:

- `EPERM: operation not permitted, open '/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json'`

Inspection showed the sync folder and smoke directory are user-owned:

- `/Users/hobayda/H2O Studio Sync`
- `/Users/hobayda/H2O Studio Sync/.h2o-smoke`
- `/Users/hobayda/H2O Studio Sync/.h2o-smoke/results`

Recovery commands run:

```bash
mkdir -p "/Users/hobayda/H2O Studio Sync/.h2o-smoke/results"
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
chmod u+rwX "/Users/hobayda/H2O Studio Sync" "/Users/hobayda/H2O Studio Sync/.h2o-smoke" "/Users/hobayda/H2O Studio Sync/.h2o-smoke/results"
```

Result:

- The `EPERM` condition was resolved when the queue client was run with filesystem access.
- Subsequent Desktop queue calls reached the queue protocol and timed out waiting for Desktop Studio to process commands.

### Desktop Queue Gate

Command:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`
- next action from helper:
  - open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`
  - set `localStorage h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`
  - confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

Desktop runtime process state:

- `npm run tauri:dev` was running.
- `target/debug/h2o-studio-desktop` was running.
- local dev server was listening on `127.0.0.1:1430`.

Attempted packaged app open:

```bash
open -na "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source/apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app" --args "http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders"
```

Follow-up queue check still timed out, so the remaining Desktop queue blocker is Desktop WebView gate/page state, not filesystem permissions.

## Chrome CDP Recovery

Command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op getFolderModel --timeout-ms 30000
```

Result:

- `ok:true`
- `status:"folder-model-read"`
- `registryGatesEnabled:true`
- `rowCount:5`
- `canonicalRowCount:5`

Active CDP process:

- `/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev`
- `--remote-debugging-port=9247`
- `--user-data-dir=/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9247`

## Partial Chrome Soft Delete Proof

Created folder:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op createFolder --allow-mutation --payload-json '{"name":"chrome desktop delete bridge test","reason":"phase6b4-runtime-proof-create"}' --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"folder-created"`
- `folderId:"fold_smoke_chrome-desktop-delete-bridge-test_mqtfutxi_7d27e45103d3"`
- `name:"chrome desktop delete bridge test"`
- `blockers:[]`

Requested Chrome delete:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op requestFolderDelete --allow-mutation --payload-json '{"folderId":"fold_smoke_chrome-desktop-delete-bridge-test_mqtfutxi_7d27e45103d3","folderName":"chrome desktop delete bridge test","reason":"phase6b4-runtime-proof-delete"}' --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"pending-created"`
- `requestId:"folder-delete-request:815c4102-a68a-43b5-806c-a5b53a58ec6a"`
- `reviewId:"folder-delete-request:815c4102-a68a-43b5-806c-a5b53a58ec6a"`
- `folderId:"fold_smoke_chrome-desktop-delete-bridge-test_mqtfutxi_7d27e45103d3"`
- `blockers:[]`

## Chrome Export Blocker

Command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"phase6b4-runtime-proof-export"}' --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"chrome-to-desktop-export-failed"`
- `blockers:["chrome-to-desktop-export-failed"]`
- sync folder diagnostic:
  - `connected:false`
  - `permission:"unknown"`
  - `permissionRequired:true`
  - `noFolderHandle:true`
  - `chromeToDesktopPermission:"granted"`

Interpretation:

The active Chrome profile can run the Studio smoke registry and create/delete-request folder rows, but it cannot export `chrome-latest.json` until the user reconnects the sync folder through Chrome Studio's Connect Folder flow.

## Chrome Companion Diagnostic

Command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChromeRecentlyDeletedCompanion --payload-json '{"probeName":"chrome desktop delete bridge test"}' --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"chrome-recently-deleted-companion-diagnosed"`
- `chromeNormalVisibleFolderCount:6`
- `chromeRecentlyDeletedCount:7`
- `pendingDeleteHiddenCount:0`
- `desktopReceiptHiddenCount:7`
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`
- `noTombstoneCreateOnChrome:true`
- `noAssetDelete:true`
- `blockers:[]`

Note: this command was run through the smoke registry `requestFolderDelete` op, not the live UI button click path, so it did not prove immediate UI hide for the target folder. That UI behavior was covered by the previous 6B.3/6B.3a same-profile manual proof.

## Remaining Recovery Steps

To complete the 6B.4 end-to-end runtime proof:

1. In Chrome Studio on the `9247` profile, reconnect the sync folder via the UI Connect Folder flow so diagnostics show:
   - `connected:true`
   - `permission:"granted"`
   - `noFolderHandle:false`
2. In Desktop Studio DevTools, enable and verify the queue:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc')
const u = new URL(location.href)
u.searchParams.set('h2oSmokeBridge', 'folder-sync-rc')
location.href = u.toString()
```

Then verify:

```js
H2O.Studio.devSmoke.folderSyncQueue.diagnose()
```

Expected:

- `enabled:true`
- `started:true`
- `blockers:[]`
- `registryBlockers:[]`

3. Rerun:
   - Chrome export `syncNow chrome-to-desktop`
   - Desktop import/apply `syncNow chrome-to-desktop`
   - Desktop export receipt `syncNow desktop-to-chrome`
   - Chrome import receipt `syncNow desktop-to-chrome`
   - Chrome companion diagnostic

## Safety Invariants

Preserved during this recovery attempt:

- no Chrome permanent delete
- no Chrome purge authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay

## Final Status

Runtime proof recovery is partially complete:

- Chrome CDP recovered.
- Desktop filesystem `EPERM` recovered.
- Chrome request creation and request-only delete creation passed.

Full 6B.4 Chrome-to-Desktop soft-delete propagation proof remains blocked by runtime setup:

- Chrome sync folder handle missing in the active CDP profile.
- Desktop WebView smoke queue gate not processing commands.
