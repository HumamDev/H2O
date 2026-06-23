# Chrome Smoke Studio Page Open Fix

Date: 2026-06-23

## Purpose

Fix the fresh Chrome Dev smoke profile failure where the Studio Launcher extension loaded, but the Studio page opened as:

```text
chrome-error://chromewebdata/
ERR_BLOCKED_BY_CLIENT
```

This blocked the local folder sync RC smoke runner before folder permission or sync behavior could be tested.

## Root Cause

The helper had two unreliable fresh-profile open paths:

1. Direct CDP `/json/new` navigation to `chrome-extension://.../surfaces/studio/studio.html...`.
   - In a fresh Chrome Dev profile this could produce `ERR_BLOCKED_BY_CLIENT` because the Studio page was not web-accessible to an external CDP-created navigation.
2. Service-worker open through `globalThis.__h2oSmokeOpenStudio()`.
   - The copied background file contained the wrapper, but the active service-worker CDP execution context did not expose it reliably.
   - Runtime injection initially used `chrome.runtime.getURL(...)`, but the CDP service-worker evaluation context exposed no usable `chrome.runtime`.
   - A follow-up runtime wrapper proved `chrome.tabs` was also unavailable from CDP service-worker evaluation, so the helper could not depend on CDP-evaluated service-worker `tabs.create`.

## Fix

The helper now keeps the production extension untouched and patches only the temporary smoke extension copy:

- `surfaces/studio/*` is added to `web_accessible_resources` in the copied smoke manifest.
- Direct CDP Studio target opening is allowed only when this smoke-copy manifest patch is present.
- Service-worker diagnostics were improved:
  - `wrapperInstalled`
  - `wrapperType`
  - `openMethod`
  - `exceptionDetails`
  - `smoke-chrome-tabs-api-unavailable`
- The service-worker wrapper remains fixed, allowlisted helper code. There is no arbitrary JS input.

This makes a fresh CDP-launched smoke profile able to open a renderable Studio page without changing production Studio or production extension behavior.

## Files Changed

- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `release-evidence/2026-06-23/chrome-smoke-studio-page-open-fix.md`

## Live Proof

Command:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9250 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9250" \
  --op getFolderModel \
  --timeout-ms 30000
```

Result summary:

- `ok:true`
- `status:"folder-model-read"`
- `browser:"Chrome/151.0.7896.2"`
- `studioTargetFound:true`
- `targetUrl:"chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved"`
- `pageStatus.href` was the Studio `chrome-extension://.../studio.html...` URL, not `chrome-error://chromewebdata/`
- `pageStatus.title:"H2O Studio vNext"`
- `registryGatesEnabled:true`
- `extensionManifest.studioWebAccessiblePatched:true`
- `extensionManifest.webAccessibleResourceCount:1`
- `extensionServiceWorkerOpen.ok:true`
- `extensionServiceWorkerOpen.result.status:"smoke-studio-tab-created"`
- `extensionServiceWorkerOpen.openMethod:"service-worker-tabs-create"`
- `result.ok:true`
- `result.status:"folder-model-read"`
- `result.rowCount:6`
- `result.canonicalRowCount:6`
- `result.displayModelAvailable:true`

The fresh profile did not have a sync folder handle yet, so `syncFolderDiagnose.permission:"unknown"` and `noFolderHandle:true` were expected in the target probe. That is separate from page rendering and registry reachability.

## Safety

- No production listener.
- No arbitrary JavaScript CLI input.
- No raw SQL.
- No hard delete.
- No purge.
- No tombstone propagation apply.
- No chat delete.
- No snapshot delete.
- Manifest web-accessibility change is applied only to the temporary smoke extension copy under `/private/tmp/h2o-folder-sync-smoke-extension-copies/`.

## Validation

Commands run:

- `node --check tools/smoke/chrome-cdp-studio.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- All commands passed.

## Next Command

Use a fresh profile/port, or close the stale blocked `9246` profile before reusing it:

```sh
node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9246 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/apps/extensions/chatgpt/chrome/studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9246" \
  --op getFolderModel \
  --timeout-ms 30000
```

Expected:

- not `chrome-extension-page-blocked`
- `studioTargetFound:true`
- `pageStatus.href` is a Studio `chrome-extension://.../studio.html...` URL
- `registryGatesEnabled:true`
- `getFolderModel` returns `ok:true`
