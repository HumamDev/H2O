# Local Folder Sync Smoke createFolder Registry Fix

## Purpose

Slice 5B manual proof found that the external Chrome CDP helper mutation plumbing worked, but the in-page gated smoke registry `createFolder` operation threw before it could create a stable smoke result.

Command under test:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9246 --op createFolder --allow-mutation --payload-json '{"name":"zz-5a-chrome-create","color":"#FF4C4C"}' --timeout-ms 30000
```

Observed failure:

- Helper mutation fields were correct: `allowMutation:true`, `payloadAccepted:true`, `mutationAllowed:true`.
- Chrome sync folder was connected and writable.
- Registry result returned `status:"op-threw"`.
- Error reason: `Cannot read properties of null (reading 'folderId')`.

## Root Cause

On Chrome, `H2O.Studio.actions.folders.create` was not the active registry path, so the registry fell back to `buildMetadataOperation('create-folder', null, payload)`.

`buildMetadataOperation` read `row.folderId` before the create branch removed `op.folderId`. For create operations, `row` is intentionally `null`, so the fallback path threw before it could request/create folder metadata.

The registry also assumed create operations would return a row/id. Some local create paths may mutate visible folder state while returning a partial or null result, so the smoke registry needed a post-create folder-model confirmation step.

## Files Changed

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `release-evidence/2026-06-23/local-folder-sync-createfolder-op-fix.md`

## Fix

- Made `buildMetadataOperation` null-safe by reading folder ids through `safeObject(row)`.
- Added `summarizeCreateFolderResult(result, payload)`.
- If a create result has no `folderId`, the registry now reads the fresh folder display model and finds the created folder by requested name.
- Successful create returns a stable shape:
  - `ok:true`
  - `status:"folder-created"`
  - `folderId`
  - `id`
  - `name`
  - `color`
  - `source`
- Unconfirmed create failures now return a structured failure instead of throwing:
  - `ok:false`
  - `status:"folder-create-failed"`
  - `blockers:["folder-create-failed"]`
  - `reason`

## Safety

This fix does not add delete, tombstone, purge, raw SQL, chat delete, or snapshot delete operations.

Preserved safety flags:

- `noArbitraryEval:true`
- `noRawSql:true`
- `noHardDelete:true`
- `noPurge:true`
- `noTombstonePropagationApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noBroadFilesystemAccess:true`

## Validation Results

Recorded during implementation:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` - passed
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - passed
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - passed
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs` - passed
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` - passed
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs` - passed
- `git diff --check` - passed
- `git diff --cached --check` - passed after staging only the focused registry, validator, and evidence files

## Manual Retest Command

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9246 --op createFolder --allow-mutation --payload-json '{"name":"zz-5a-chrome-create","color":"#FF4C4C"}' --timeout-ms 30000
```

Expected:

- `ok:true`
- `status:"folder-created"`
- `result.ok:true`
- `result.folderId` or `result.id` present
- `result.name:"zz-5a-chrome-create"`
- `result.color:"#FF4C4C"`

## Deferred

- Combined mutation runner.
- Full create/rename/color roundtrip smoke.
- Delete/tombstone mutation smoke.
