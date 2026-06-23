# Local Folder Sync CreateFolder Live Fix

Date: 2026-06-23

## Purpose

Continue Slice 5B debugging after the source smoke registry was updated to write the Chrome folder-state mirror, but the live Chrome smoke profile still returned:

- `ok:false`
- `status:"folder-create-failed"`
- `reason:"not-ok"`
- `rawStatus:"not-ok"`

## Root Cause

The live Chrome smoke profile was loading the stale Studio Launcher template path:

- `apps/extensions/chatgpt/chrome/studio-launcher`

That directory contained an old copied `surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js` that still called the generic `actions.folders.create` / metadata-operation path. It did not contain the newer Chrome folder-state mirror create path.

The current dev build output is:

- `build/chrome-ext-studio-launcher`

So rebuilding with `node tools/dev/dev-all.mjs` updates the build output, not necessarily the stale template directory previously passed to `--extension-path`.

## Fix

The Chrome CDP smoke helper now:

- defaults launch mode to `build/chrome-ext-studio-launcher`
- still records the legacy template path for diagnostics
- overlays the current source smoke registry from `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` into the temporary smoke extension copy
- reports whether the copied registry was missing or stale through:
  - `smokeRegistryOverlayApplied`
  - `smokeRegistryOverlayStatus`
  - `smokeRegistryWasStale`
  - `smokeRegistryWasMissing`

This prevents a stale unpacked extension copy from silently running an old smoke registry after the source registry has been fixed.

## Files Changed

- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `release-evidence/2026-06-23/local-folder-sync-createfolder-live-fix.md`

## Safety

No runtime Studio behavior changed. The patch only affects external smoke tooling and the temporary extension copy used by launch mode.

Still preserved:

- no delete/tombstone ops
- no raw SQL
- no hard delete
- no purge
- no chat delete
- no snapshot delete
- no tombstone propagation apply
- no broad filesystem access
- no arbitrary eval

## Validation

Run:

- `node --check tools/smoke/chrome-cdp-studio.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs`
- `git diff --check`
- `git diff --cached --check`

## Rebuild / Relaunch Requirement

The already-running Chrome smoke profile on port `9247` has the stale extension code loaded. Relaunch is required.

Recommended sequence:

```bash
node tools/dev/dev-all.mjs

node tools/smoke/chrome-cdp-studio.mjs \
  --mode launch \
  --port 9247 \
  --chrome-path "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev" \
  --extension-path "$PWD/build/chrome-ext-studio-launcher" \
  --user-data-dir "/private/tmp/h2o-folder-sync-smoke-chrome-dev-profile-9247" \
  --op getFolderModel \
  --timeout-ms 30000
```

Then retest create:

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op createFolder \
  --allow-mutation \
  --payload-json '{"name":"zz-5a-chrome-create","color":"#FF4C4C"}' \
  --timeout-ms 30000
```

Expected:

- `ok:true`
- `status:"folder-created"` or `status:"folder-created-or-existing"`
- `result.ok:true`
- `result.folderId` or `result.id` present
- `result.name:"zz-5a-chrome-create"`
- `result.color:"#FF4C4C"`
- `result.blockers:[]`
