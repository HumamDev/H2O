# Local Folder Sync Smoke Runner

Date: 2026-06-23

## Purpose

Implement Slice 4A of the dev-only packaged/local Chrome <-> Desktop folder sync RC smoke bridge: an external Chrome CDP helper for read-only Chrome Studio smoke commands.

This slice adds external test tooling only. It does not modify the in-app smoke registry, Desktop file-command queue, production behavior, or any runtime sync semantics.

## Files Changed

- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `release-evidence/2026-06-23/local-folder-sync-smoke-runner.md`

## Helper Summary

Chrome helper:

```text
tools/smoke/chrome-cdp-studio.mjs
```

Default behavior:

- default CDP port: `9224`
- default smoke profile: `/private/tmp/h2o-folder-sync-smoke-chrome-profile`
- Chrome Dev smoke example port: `9225`
- Chrome Dev smoke example profile: `/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile`
- Chrome Dev binary example: `/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev`
- default Studio Launcher extension ID: `bpobkkppdlldlkccaehmpfclmkhiemhg`
- default unpacked extension path for launch mode: `apps/extensions/chatgpt/chrome/studio-launcher`
- supported aliases:
  - `--user-data-dir` / `--profile-dir` for the smoke profile
  - `--extension-path` for the unpacked extension path
- supported modes:
  - `attach`
  - `launch`

The helper opens or locates:

```text
chrome-extension://<extensionId>/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved
```

It sets:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc')
```

Then it calls only:

```js
H2O.Studio.devSmoke.folderSync.run(op, payload)
```

through a fixed CDP function wrapper:

```js
function(op, payload) { return this.run(op, payload); }
```

`op` and `payload` are passed as structured CDP arguments.

## Slice 4A Supported Ops

Slice 4A is read-only. The helper only allows:

- `diagnoseHealth`
- `getFolderModel`

All other ops return:

```text
op-not-read-only
```

No create, rename, color, delete request, Desktop apply, tombstone, purge, raw SQL, chat mutation, or snapshot mutation command is available in this slice.

## CLI Usage

Attach to an already-running Chrome CDP instance:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9224 --op diagnoseHealth
```

Read the Chrome folder display model:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9224 --op getFolderModel
```

Launch Chrome with the default smoke profile and remote debugging port:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode launch --port 9224 --op diagnoseHealth
```

Launch with an explicit Chrome binary:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9224 \
  --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --op diagnoseHealth
```

Launch with an explicit unpacked extension path:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9224 \
  --load-extension apps/extensions/chatgpt/chrome/studio-launcher \
  --op getFolderModel
```

## Chrome Dev Smoke Setup

Follow-up date: 2026-06-23

Runtime setup issue:

- Normal Google Chrome was reachable on CDP port `9224`.
- The Studio Launcher extension was loaded in Google Chrome Dev, not normal Google Chrome.
- Starting Chrome Dev with `--remote-debugging-port=9224` while an existing Chrome Dev session was already open printed `Opening in existing browser session.`
- That existing Chrome Dev session did not expose CDP, so the helper could attach to the wrong browser or fail to find the Studio extension target.

Fix / guidance:

- Use a separate Chrome Dev smoke profile so Chrome Dev starts a distinct CDP-enabled process.
- Use a distinct port, recommended `9225`, to avoid attaching to normal Chrome on `9224`.
- Load the Studio Launcher extension explicitly from the repo bundle.
- The helper now supports the exact aliases used by the smoke command:
  - `--user-data-dir`
  - `--profile-dir`
  - `--extension-path`

Launch Chrome Dev smoke profile with Studio Launcher:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9225 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile" \
  --op diagnoseHealth
```

Attach to the same Chrome Dev smoke profile:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9225 \
  --op getFolderModel
```

Expected success diagnostics include:

- `browser.browser`
- `port:9225`
- `studioTargetFound:true`
- `targetUrl` containing `/surfaces/studio/studio.html`
- `smokeUrlFlagPresent:true`
- `registryGatesEnabled:true`

Improved failure statuses:

- `chrome-cdp-port-in-use`: launch mode found an existing CDP browser on the requested port before launching.
- `chrome-cdp-unavailable`: no CDP endpoint was reachable.
- `chrome-extension-not-loaded`: the requested extension target or smoke registry was not available.
- `chrome-cdp-attached-to-wrong-browser`: attach mode likely connected to a browser/profile that does not have the Studio Launcher extension loaded.
- `chrome-studio-target-missing`: extension appears available but the Studio target could not be found/opened.

Next actions by failure:

- For `chrome-cdp-port-in-use`, choose a free port such as `9225` or use `--mode attach` if the existing browser is intentional.
- For `chrome-extension-not-loaded`, rerun launch mode with `--extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher"` and a separate `--user-data-dir`.
- For `chrome-studio-target-missing`, verify the extension ID and Studio Launcher bundle are correct.

Expected unavailable status if Chrome is not reachable:

```text
chrome-cdp-unavailable
```

Expected missing target status if the extension page cannot be opened or found:

```text
chrome-studio-target-missing
```

## Slice 4A Target Control Hardening

Follow-up date: 2026-06-23

Runtime setup issue:

- Chrome Dev smoke launch on port `9226` reached Chrome Dev and found the Studio target.
- The helper failed with `cdp-websocket-not-open` while trying to control the target.
- The visible Chrome page showed `ERR_BLOCKED_BY_CLIENT` for the Studio extension URL.
- `/json/version` still returned a valid browser WebSocket URL, so browser-level CDP was available.

Root cause:

- The helper assumed the Studio page target WebSocket was the only control channel.
- It did not fall back to browser-level `Target.attachToTarget` when target-level WebSocket control failed or was unavailable.
- It also did not inspect the loaded page state before invoking the registry, so a blocked extension page surfaced as a generic WebSocket/control failure.

Fix:

- The helper now returns Studio targets even when `webSocketDebuggerUrl` is missing.
- It first attempts target-level WebSocket control, then falls back to the browser WebSocket plus `Target.attachToTarget` with a flattened session.
- It runs a fixed page-status check after navigation and reports blocked extension pages as `chrome-extension-page-blocked`.
- It reports specific control statuses:
  - `cdp-browser-websocket-open-failed`
  - `cdp-target-websocket-missing`
  - `cdp-target-attach-failed`
  - `chrome-extension-page-blocked`
  - `smoke-registry-missing`
  - `smoke-registry-disabled`

Retest command:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9226 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9226" \
  --op diagnoseHealth
```

## Slice 4A Extension Discovery Hardening

Follow-up date: 2026-06-23

Runtime setup issue:

- Chrome Dev and CDP were reachable on port `9226`.
- The helper found a Studio target at the default extension ID.
- The page still showed `ERR_BLOCKED_BY_CLIENT` / `<extension id> is blocked`.
- This proved the helper could still open a stale or unusable extension URL without first verifying that the Studio Launcher extension was actually loaded in the smoke profile.

Root cause:

- The helper built the Studio URL from the default extension ID before checking the unpacked extension path or discovering the extension loaded by the smoke profile.
- Launch mode also passed the extension URL as the initial page, so a stale ID could be opened before the extension service worker/background target was ready.

Fix:

- Launch mode validates `--extension-path` and requires `manifest.json`.
- Launch mode passes both `--disable-extensions-except=<launcher path>` and `--load-extension=<launcher path>` so the smoke profile is scoped to the Studio Launcher extension.
- The helper launches Chrome Dev on `about:blank`, then discovers loaded extension IDs through CDP targets before constructing the Studio URL.
- Discovery uses browser-level `Target.getTargets` plus `/json/list` target summaries.
- Discovery separates all `discoveredExtensionIds` from usable `loadedExtensionIds` so a stale blocked extension error page is not treated as a loaded Studio Launcher.
- The helper opens Studio with the discovered extension ID instead of blindly relying on the default ID.
- If the launcher extension is not discoverable, the helper returns `studio-launcher-extension-not-loaded`.
- If the extension path or manifest is wrong, the helper returns:
  - `studio-launcher-extension-path-missing`
  - `studio-launcher-manifest-missing`
  - `studio-launcher-manifest-invalid`
- If Studio still opens to a blocked Chrome error page, the helper returns `chrome-extension-page-blocked` with:
  - `attemptedExtensionId`
  - `discoveredExtensionIds`
  - `extensionPath`
  - `extensionDiscovery`
  - target diagnostics

The Studio Launcher manifest includes a `key`, so its extension ID should be stable when the extension loads correctly. The helper still treats runtime CDP discovery as authoritative for the smoke profile.

Retest command:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9226 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9226" \
  --op diagnoseHealth
```

## Slice 4A Chrome Dev Extension Load Fix

Follow-up date: 2026-06-23

Runtime setup issue:

- Chrome Dev started successfully with CDP on port `9226`.
- Launch arguments included `--load-extension=<studio-launcher>` and `--disable-extensions-except=<studio-launcher>`.
- CDP target discovery still reported:
  - `status: studio-launcher-extension-not-loaded`
  - `discoveredExtensionIds: []`
  - `extensionTargetFound:false`
  - `studioTargetFound:false`
- The manifest was valid and included a stable key:
  - `manifestName: H2O Studio Launcher (Unpacked)`
  - `manifestVersion: 1.3.0`
  - `manifestHasKey:true`

Root cause:

- Current Chrome Dev can ignore command-line unpacked extension loading unless the command-line load switch is explicitly allowed for the smoke process.
- The helper also did not compute the manifest-key-derived expected extension ID or expose Chrome launch stderr/stdout tail diagnostics, so a load failure had insufficient attribution.

Fix:

- Launch mode now adds:
  - `--enable-unsafe-extension-debugging`
  - `--disable-features=DisableLoadExtensionCommandLineSwitch`
  - `--disable-extensions-except=<launcher path>`
  - `--load-extension=<launcher path>`
- Extension validation now checks:
  - extension directory exists
  - `manifest.json` exists and parses
  - `surfaces/studio/studio.html` exists
  - manifest `background.service_worker` exists
  - manifest icon files exist
- The helper derives `expectedExtensionId` from the manifest `key`.
- Extension discovery reports:
  - `attemptedExtensionId`
  - `expectedExtensionId`
  - `expectedPageProbe`
  - `discoveredExtensionIds`
  - `loadedExtensionIds`
  - `blockedExtensionTargetCount`
  - `extensionPath`
  - `extensionManifest`
  - Chrome `stdoutTail` / `stderrTail`
- If Chrome still exposes no loaded extension target after launch, the helper now reports `chrome-load-extension-ignored` with `studio-launcher-extension-not-loaded` as a blocker.
- If Chrome exposes only blocked extension targets, the helper reports `chrome-extension-policy-blocked`.
- Because MV3 service workers may not expose a CDP target until activated, the helper probes the manifest-key-derived Studio URL once before the final discovery verdict.

Follow-up live investigation:

- A fresh Chrome Dev smoke run on port `9231` proved the extension did load.
- The helper reported:
  - `expectedExtensionId: bpobkkppdlldlkccaehmpfclmkhiemhg`
  - `discoveredExtensionId: bpobkkppdlldlkccaehmpfclmkhiemhg`
  - `loadedExtensionIds` included `bpobkkppdlldlkccaehmpfclmkhiemhg`
  - the Studio target existed at the expected `chrome-extension://.../surfaces/studio/studio.html?...` URL.
- The actual remaining blocker was `Page.navigate` inside the helper's `prepareTarget()` path:
  - `navigationStage: initial`
  - `navigationErrorText: net::ERR_BLOCKED_BY_CLIENT`

Second fix:

- The helper now opens the Studio extension page through `/json/new` and reuses that target.
- It no longer calls CDP `Page.navigate` for the Studio extension URL before invoking the smoke registry.
- Target selection now requires the existing/opened Studio page to already include `h2oSmokeBridge=folder-sync-rc`.
- If the selected page is not a smoke-flagged Studio page, the helper reports `chrome-studio-target-url-mismatch`.
- Page blocked detection remains in place through the fixed page-status probe.

Retest command:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9226 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9226" \
  --op diagnoseHealth
```

## Slice 4A Chrome Dev Extension Load Repair

Follow-up date: 2026-06-23

Runtime issue:

- Fresh Chrome Dev smoke profiles still did not reliably expose the unpacked Studio Launcher through command-line `--load-extension`.
- The helper could reach Chrome Dev CDP, but target discovery showed only unrelated built-in extension targets.
- Direct external opening of the Studio extension page through `/json/new` or CDP navigation could produce `ERR_BLOCKED_BY_CLIENT`.
- `Extensions.triggerAction` initially failed because Chrome's default `Target.getTargets` filter excludes `tab` targets.
- Calling `openOrFocusStudio('/saved')` from the service worker failed until the temporary smoke copy exposed a fixed wrapper on `globalThis`.

Root cause:

- Chrome Dev 151's command-line extension load path was not sufficient for a clean smoke profile in this environment.
- The Studio Launcher source intentionally has `STUDIO_AUTO_RESTORE_ENABLED = false`, so loading the extension does not open Studio by itself.
- The helper was relying on externally navigating to an internal extension URL. Chrome can block that path, while the extension can open its own page safely through its service-worker/tab APIs.

Fix:

- Launch mode now prepares a temporary smoke-only copy under:
  - `/private/tmp/h2o-folder-sync-smoke-extension-copies/<extensionId>`
- The temporary copy is patched only outside the repo:
  - `STUDIO_AUTO_RESTORE_ENABLED = true`
  - Studio URLs include `?h2oSmokeBridge=folder-sync-rc`
  - `globalThis.__h2oSmokeOpenStudio()` calls the existing `openOrFocusStudio("/saved")`
- The helper no longer depends on command-line `--load-extension` for the smoke copy.
- It launches Chrome Dev with CDP and loads the unpacked smoke copy through:
  - `Extensions.loadUnpacked`
- It opens Studio through extension-owned paths:
  - `Extensions.triggerAction`
  - fixed service-worker fallback: `globalThis.__h2oSmokeOpenStudio()`
- It requests `tab` targets explicitly for `Extensions.triggerAction`.
- It still calls only the allowlisted Studio registry for smoke ops:
  - `H2O.Studio.devSmoke.folderSync.run(op, payload)`

Live retest proof:

- Command:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9243 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9243" \
  --op diagnoseHealth \
  --timeout-ms 30000
```

- Result:
  - helper `ok:true`
  - `studioTargetFound:true`
  - `smokeUrlFlagPresent:true`
  - `registryGatesEnabled:true`
  - `extensionLoad.status: chrome-extension-loaded-via-cdp`
  - `extensionAction.status: chrome-extension-action-triggered`
  - `extensionServiceWorkerOpen.status: chrome-extension-service-worker-open-studio-called`
  - Studio target URL:
    - `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved`
  - Registry result returned `ok:true`.
  - Registry health verdict was `blocked` only because the fresh smoke profile had no sync-folder File System Access handle:
    - `permission-required`
    - `no-folder-handle`

Attach-mode proof:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9243 \
  --op getFolderModel \
  --timeout-ms 15000
```

- Result:
  - helper `ok:true`
  - `status: folder-model-read`
  - `studioTargetFound:true`
  - `registryGatesEnabled:true`
  - `rowCount: 6`
  - `canonicalRowCount: 6`
  - `displayModelAvailable:true`

## Slice 4A Live Proof

Proof date: 2026-06-23

Relevant implementation/fix commits:

- `42734ddf77dd3f36f4b7c8df1fcea202fbe08ed9` - Slice 4A helper implementation
- `a54bee8c4968d4ec0bee4e5b60dc0a67f9745f57` - Chrome Dev smoke launch/documentation fix
- `a3482ddd05da1a8c24347e36d5c536ed6b839116` - CDP target-control hardening
- `c6984de1afa788b2750b1f470e95ca15a02fed40` - extension target discovery fix
- `d518e795f08e3910a761eb2a1a15749287af89d5` - Chrome smoke profile extension loading fix
- `9cde16f58f7d0fd58e47b264e35a662fff8b85a4` - latest helper success path, loading/reaching Studio extension and registry

Launch/attach context:

- Chrome Dev smoke CDP port: `9243`
- Chrome browser: `Chrome/151.0.7896.2`
- Smoke Studio URL:
  - `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved`
- Extension ID discovered/loaded:
  - `bpobkkppdlldlkccaehmpfclmkhiemhg`
- CDP target transport:
  - `target-websocket`
- Registry path:
  - `H2O.Studio.devSmoke.folderSync.run`
- Registry call:
  - `fixed-registry-wrapper`
- Registry gates:
  - `enabled:true`
  - `surface: chrome-studio`
  - `adapter: mv3`
  - `blockers: []`

`diagnoseHealth` proof:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9243 \
  --op diagnoseHealth \
  --timeout-ms 30000
```

- Helper reached the Chrome Studio target and registry.
- Top-level helper returned `ok:true` for the command execution path.
- Registry result:
  - `result.ok:true`
  - `result.op: diagnoseHealth`
  - `result.surface: chrome-studio`
  - `result.adapter: mv3`
  - `result.status: blocked`
  - `result.verdict: blocked`
  - `result.blockers: ["permission-required", "no-folder-handle"]`
- Interpretation:
  - This is expected for a fresh smoke Chrome profile without File System Access permission to `/Users/hobayda/H2O Studio Sync`.
  - This is not a CDP/helper failure.
  - Future full smoke requires granting the sync folder handle in the smoke Chrome profile.

`getFolderModel` proof:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9243 \
  --op getFolderModel \
  --timeout-ms 30000
```

- Helper result:
  - `ok:true`
  - `status: folder-model-read`
  - `studioTargetFound:true`
  - `smokeUrlFlagPresent:true`
  - `registryGatesEnabled:true`
  - `cdpControlDiagnostics.cdpTransport: target-websocket`
  - `pageStatus.readyState: complete`
- Registry result:
  - `result.ok:true`
  - `result.status: folder-model-read`
  - `rowCount: 6`
  - `canonicalRowCount: 6`
  - `displayModelAvailable:true`
  - `surface: chrome-studio`
  - `adapter: mv3`
  - `allowed:true`
  - `disabled:false`

Safety proof:

- Safety flags remained true:
  - `noArbitraryJsInput`
  - `noProductionListener`
  - `noRawSql`
  - `noHardDelete`
  - `noPurge`
  - `noTombstonePropagationApply`
  - `noChatDelete`
  - `noSnapshotDelete`
- Helper remains Slice 4A read-only:
  - `diagnoseHealth`
  - `getFolderModel`
- No create, rename, color, delete, request, or apply operations were executed.

Verdict:

- Slice 4A Chrome CDP helper is live-proven for read-only registry commands.
- It can reach Chrome Studio through CDP, enable smoke gates, call the fixed allowlisted registry wrapper, and return redacted JSON evidence.
- The only remaining Chrome blocker is expected File System Access permission for the fresh smoke profile.
- Next slice should be the Desktop queue client helper / combined read-only smoke runner.
- Before full mutation smoke, the smoke Chrome profile must be granted access to `/Users/hobayda/H2O Studio Sync`.

## Safety Guarantees

- External helper only; no in-app runtime behavior changed.
- No production listener.
- No arbitrary JavaScript snippet CLI.
- No arbitrary eval helper.
- CDP call is restricted to a fixed wrapper around `H2O.Studio.devSmoke.folderSync.run(op, payload)`.
- `op` is restricted to `diagnoseHealth` and `getFolderModel`.
- Results are JSON to stdout and rely on the registry's redacted output.
- No hard delete.
- No purge.
- No raw SQL.
- No chat deletion.
- No snapshot deletion.
- No tombstone propagation apply.
- File System Access permission state is reported by the registry result as-is; the helper does not fake pass/fail.

## Chrome Permission Target Selection Fix

Follow-up issue:

- Chrome console `H2O.Studio.sync.folder.diagnose()` could report the sync folder connected and permission granted.
- The read-only smoke path could still return `permission-required` / `no-folder-handle` through `H2O.Studio.devSmoke.folderSync.run("diagnoseHealth", ...)`.

Root cause:

- The Chrome helper selected the first smoke Studio target with the URL flag.
- If multiple matching extension pages existed, it did not check which target had the live File System Access folder handle.

Fix:

- Added a fixed CDP sync-diagnose wrapper that reads only `H2O.Studio.sync.folder.diagnose()` from candidate Studio targets.
- The helper now scores matching smoke targets and prefers a target with:
  - `registryGatesEnabled:true`
  - `syncFolderDiagnose.connected:true`
  - `syncFolderDiagnose.permission:"granted"`
  - `syncFolderDiagnose.noFolderHandle:false`
- Helper output now includes `targetProbe` and `targetProbeSummary` so future smoke evidence can show which target was selected and why.

Safety:

- This remains read-only.
- No arbitrary JavaScript CLI was added.
- The helper still calls only the fixed registry wrapper for allowed operations.
- Slice 4A allowed ops remain `diagnoseHealth` and `getFolderModel`.

Rerun command:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9243 --op diagnoseHealth --timeout-ms 30000
```

Live follow-up on port `9243`:

- The helper probed the CDP target set and found one Studio target:
  - `selectedTargetId: C665FF003C8F3B09E5B5D366630ACCFE`
  - `selectedTargetScore: 55`
  - `selectedTargetSyncPermission: "unknown"`
  - `selectedTargetSyncConnected: false`
  - `selectedTargetChromeWritesSyncFolder: false`
- No connected/granted Studio target was present in the CDP target list on that port:
  - `probedTargetCount: 1`
  - `connectedGrantedTargetCount: 0`
- Interpretation:
  - The helper now reports the precise targeting condition.
  - If manual console shows a connected/granted Studio page, that page must be in a different Chrome Dev session/port/profile or not currently exposed through the queried CDP target set.
  - The next operator action is to attach the runner to the Chrome Dev port that owns the connected/granted visible Studio page, or restart the smoke Chrome Dev profile and grant `/Users/hobayda/H2O Studio Sync` permission in that same CDP-controlled page.

## Chrome Folder-Handle Preservation During Attach

Follow-up issue:

- After the operator selected `/Users/hobayda/H2O Studio Sync` through `H2O.Studio.sync.folder.connectFolder()` in the visible Chrome Dev smoke page, manual console diagnose reported:
  - `connected:true`
  - `permission:"granted"`
  - `folderName:"H2O Studio Sync"`
  - `chromeWritesSyncFolder:true`
  - `permissionRequired:false`
  - `noFolderHandle:false`
- The helper could still report the same target as `permission:"unknown"` and `noFolderHandle:true`.

Root cause / audit result:

- The helper already avoided `Page.navigate` when the selected target was at the exact smoke Studio URL with the URL flag.
- However, the attach-mode setup still had a reload-capable path for an already-open Studio page missing only the smoke URL flag.
- The target probe and prepare path also read the sync-folder diagnose once, which could race the page's async File System Access handle restoration from IndexedDB.

Fix:

- Existing Studio targets are no longer reloaded just to add `h2oSmokeBridge=folder-sync-rc`.
- If the target is already a Studio page but lacks the smoke URL flag, the helper now:
  - sets the localStorage opt-in only if needed
  - updates the URL with `history.replaceState`
  - preserves the current page runtime and IndexedDB-backed folder handle state
- The helper now waits briefly and boundedly for `H2O.Studio.sync.folder.diagnose()` to report the restored handle before scoring a target or running the registry command.
- The helper includes a `Runtime.evaluate` fallback for the sync diagnose probe if `Runtime.callFunctionOn` returns no by-value object.
- Output now includes `prepareDiagnostics`:
  - `navigation`
  - `beforeNavigateSyncDiagnose`
  - `afterNavigateSyncDiagnose`
  - `finalSyncDiagnose`
  - diagnose attempt/wait counters
  - `boundedWaitForFolderHandle:true`
- If a future same-page setup path ever sees granted permission before URL setup and unknown permission after setup, the helper reports `chrome-cdp-navigation-lost-folder-handle`.

Validation:

- `node --check tools/smoke/chrome-cdp-studio.mjs`: passed.
- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.

Retest command:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9243 --op diagnoseHealth --timeout-ms 30000
```

Expected after the folder is connected in the same CDP-controlled page:

- `targetProbeSummary.connectedGrantedTargetCount >= 1`
- `selectedTargetSyncPermission:"granted"`
- `selectedTargetSyncConnected:true`
- `prepareDiagnostics.finalSyncDiagnose.permission:"granted"`
- `result.blockers:[]`

## Chrome Attach Without Smoke Query Preservation

Follow-up issue:

- The visible connected Chrome Studio page had:
  - `href: chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html#/saved`
  - `connected:true`
  - `permission:"granted"`
  - `folderName:"H2O Studio Sync"`
- The helper selected/probed:
  - `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved`
- That query-flag target did not have the folder handle.

Root cause:

- Attach mode treated the smoke query URL as the required runnable Studio URL.
- The in-page smoke registry also required the URL flag, so the helper had to mutate or select a query-flag URL target before the registry could run.
- For an already-connected Studio page, the URL query difference can mean the helper is not using the page/runtime that owns the File System Access handle.

Fix:

- Attach mode now discovers and probes all Studio targets regardless of `h2oSmokeBridge=folder-sync-rc`.
- The helper probes each candidate before changing URL state.
- A connected/granted target without the smoke query is now valid in attach mode.
- For attach mode, the helper does not navigate, reload, or `history.replaceState` an existing Studio page that lacks the smoke query.
- The in-page dev-smoke gate now allows Chrome attach mode when all of these are true:
  - localStorage opt-in is `folder-sync-rc`
  - surface is `chrome-studio`
  - known local/dev surface gate passes
  - public release is blocked
- The URL flag remains supported for fresh launch sessions.
- Helper diagnostics now include:
  - `visibleMarkerSeen`
  - `visibleMarker`
  - `originalHref`
  - `finalHref`
  - `urlChanged`
  - `attachLocalOptInAllowed`

Live follow-up on port `9243` after the code change:

- The CDP target set currently exposed only the query-flag target:
  - `selectedTargetUrl: chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved`
  - `visibleMarkerSeen:false`
  - `connectedGrantedTargetCount:0`
  - `finalSyncDiagnose.permission:"unknown"`
- Interpretation:
  - The helper no longer needs the query flag for an attach target.
  - The current live browser session still does not expose the marked connected no-query page on port `9243`.
  - To prove the positive path, reopen or reload the connected `studio.html#/saved` page with the updated registry bundle, set the localStorage opt-in, reconnect the folder if needed, then rerun the helper.

Validation:

- `node --check tools/smoke/chrome-cdp-studio.mjs`: passed.
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`: passed.
- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`: passed.
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.

Retest command:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9243 --op diagnoseHealth --timeout-ms 30000
```

## Chrome Connected-Target Selection Repair

Follow-up issue:

- Manual console inspection in the visible Chrome Dev smoke Studio page showed `H2O.Studio.sync.folder.diagnose()` with:
  - `connected:true`
  - `permission:"granted"`
  - `folderName:"H2O Studio Sync"`
  - `chromeWritesSyncFolder:true`
  - `permissionRequired:false`
  - `noFolderHandle:false`
- The CDP helper could still select a stale or different Studio target where the same diagnose call reported:
  - `connected:false`
  - `permission:"unknown"`
  - `chromeWritesSyncFolder:false`
  - `permissionRequired:true`
  - `noFolderHandle:true`

Root cause:

- The helper originally selected from `/json/list` smoke URL matches first.
- It did not merge browser-level `Target.getTargets` results with `/json/list`.
- It deduped too aggressively for duplicate-looking Studio pages and did not normalize `id` versus `targetId`.
- The sync-folder probe wrapper called `H2O.Studio.sync.folder.diagnose()` without awaiting async results, which could make a usable target look unconnected.

Fix:

- The helper now collects candidate Studio targets from both `/json/list` and browser `Target.getTargets`.
- Target identity is normalized with `id || targetId`, and candidates are deduped only by target id instead of URL/title.
- Every Studio page candidate is probed, including pages that do not yet have the smoke URL flag.
- Candidate probes read:
  - page ready state
  - smoke URL flag
  - registry presence
  - registry gate state
  - awaited `H2O.Studio.sync.folder.diagnose()`
- Selection now prefers targets with:
  - `connected:true`
  - `permission:"granted"`
  - `chromeWritesSyncFolder:true`
- If the chosen target lacks the smoke URL flag, the helper sets the localStorage opt-in and navigates that same target to the smoke URL instead of opening a new duplicate.
- Helper output includes a redacted `targetProbeSummary` with target count, connected/granted count, selected target id, score, permission, connection state, and probe summaries.

Runner behavior:

- The combined runner now treats a permission-only Chrome health blocker as a CDP targeting problem when target probes ran but none had a connected/granted sync folder handle.
- In that case it reports `chrome-cdp-connected-target-missing` instead of `chrome-health-permission-state-unconfirmed`.

Safety:

- This remains read-only.
- No arbitrary JavaScript CLI was added.
- The helper still calls only the fixed registry wrapper for allowed operations.
- Slice 4A allowed ops remain `diagnoseHealth` and `getFolderModel`.

Rerun command:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9243 --op diagnoseHealth --timeout-ms 30000
```

## Validation

Commands run:

- `node --check tools/smoke/chrome-cdp-studio.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- `node --check tools/smoke/chrome-cdp-studio.mjs` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs` - pass, allowed ops `diagnoseHealth`, `getFolderModel`
- `git diff --check` - pass
- `git diff --cached --check` - pass

## Deferred

- Desktop queue client helper.
- Combined read-only smoke runner.
- Mutation smoke runner for create/rename/color.
- Delete request / receipt / hide loop smoke automation.
- Packaged/local RC smoke rerun and evidence capture.
- Restore receipts / Chrome re-show.
- Real tombstone propagation.
- Retention/purge.
- WebDAV/cloud/relay transport adapters.
