# Local Folder Sync CreateFolder Not-Ok Fix

Date: 2026-06-23

## Purpose

Fix the Slice 5B smoke blocker where the external Chrome helper reached the live Chrome Studio target and accepted the mutation payload, but the in-page smoke registry returned:

- `ok:false`
- `status:"folder-create-failed"`
- `reason:"not-ok"`
- `rawStatus:"not-ok"`

## Root Cause

The smoke registry attempted Chrome folder creation through the generic Studio folder action/native-owner metadata paths. Those paths are not a reliable Chrome-local create path for the smoke profile:

- `actions.folders.create` did not return a concrete folder row/id for this Chrome surface.
- the metadata-operation resolver supports Chrome-local rename/color application, but create falls through the native-owner/transport path and can return a non-applied `not-ok` result.

The helper plumbing and permission state were correct; the failing piece was the registry create implementation using the wrong underlying create route for a Chrome-local smoke mutation.

## Files Changed

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `release-evidence/2026-06-23/local-folder-sync-createfolder-notok-fix.md`

## Behavior Implemented

The smoke registry now uses a Chrome-only folder-state mirror create path before falling back to the older generic paths:

- writes a dev-smoke folder row into `h2o:prm:cgx:fldrs:state:data:v1`
- marks the row as `chrome-user-folder-create`
- preserves `color` and `iconColor`
- dispatches the existing targeted folder-state refresh event
- verifies the created folder by reading `H2O.Library.FolderParity.getDisplayModel({ fresh:true })`
- returns stable `folder-created` with `folderId`, `id`, `name`, and `color`
- treats duplicate names as success only when an actual matching visible folder exists, returning `folder-created-or-existing`

The result also includes redacted diagnostics:

- `createPathUsed`
- `availableCreateApis`
- `duplicateNameDetected`
- `existingFolderId`
- `folderModelCountBefore`
- `folderModelCountAfter`
- `createdFolderFoundByName`
- `rawResult`

## Safety Constraints

Still preserved:

- no delete/tombstone operation added
- no hard delete
- no purge
- no raw SQL
- no chat deletion
- no snapshot deletion
- no tombstone propagation apply
- no arbitrary eval

## Validation

Passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs`

## Manual Retest

Run from repo root after Chrome Studio smoke profile is open on port `9247` with the smoke bridge enabled:

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
