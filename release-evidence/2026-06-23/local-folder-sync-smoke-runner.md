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
