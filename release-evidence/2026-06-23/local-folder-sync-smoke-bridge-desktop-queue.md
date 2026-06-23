# Local Folder Sync Smoke Bridge Desktop Queue

Date: 2026-06-23

## Purpose

Implement Slice 3 of the dev-only packaged/local Chrome <-> Desktop folder sync RC smoke bridge: a Desktop/Tauri file-command queue that lets an external smoke runner send allowlisted folder-sync smoke commands to Desktop Studio.

This slice does not add the Chrome CDP helper, full RC smoke runner, production behavior, arbitrary JS execution, HTTP server, raw SQL, hard delete, purge, chat deletion, snapshot deletion, or tombstone propagation apply.

## Files Changed

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-desktop-queue.tauri.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-desktop-queue.mjs`
- `release-evidence/2026-06-23/local-folder-sync-smoke-bridge-desktop-queue.md`

## Queue Paths

The Desktop queue reads only:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json
```

It writes result files only under:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/
```

Each successful command result is written as:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/<commandId>.json
```

Malformed command files are written as:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/malformed-<hash>.json
```

## Gates

The queue is installed only as a Desktop/Tauri-safe module and does not read the command file unless the shared Slice 2 smoke registry gates are enabled.

Required gates:

- URL flag: `?h2oSmokeBridge=folder-sync-rc`
- localStorage opt-in: `h2o:studio:smoke-bridge:enabled:v1 === "folder-sync-rc"`
- Desktop Studio surface
- Tauri adapter
- known local/dev surface, enforced by the shared registry
- no public-release flag, enforced by the shared registry

The queue dispatches only through:

```js
H2O.Studio.devSmoke.folderSync.run(op, payload)
```

The shared registry continues to enforce the operation allowlist and surface-specific guards.

## Command Schema

`desktop-command.json` must be a JSON object:

```json
{
  "commandId": "manual-diagnose-health-001",
  "op": "diagnoseHealth",
  "createdAt": "2026-06-23T00:00:00.000Z",
  "surface": "desktop-studio",
  "payload": {}
}
```

Rules:

- `commandId` is required and must be a safe short identifier.
- `op` is required and must be a safe short identifier.
- `createdAt` is required and must parse as a date.
- `surface` is optional, but if present must be `desktop-studio`, `desktop`, or `tauri`.
- `payload` is optional, but if present must be an object.
- malformed JSON or schema violations are rejected cleanly and produce redacted error result files.

## Result Schema

Result files include:

- `schema:"h2o.studio.dev-smoke.folder-sync.desktop-queue-result.v1"`
- `phase:"folder-sync-rc-smoke-desktop-queue"`
- `commandId`
- `op`
- `ok`
- `status`
- `surface:"desktop-studio"`
- `adapter:"tauri"`
- `observedAt`
- `result` from the shared registry, redacted by that registry
- safety flags

Result privacy:

- folder IDs/names/colors may appear for smoke evidence
- no raw chat content
- no full snapshot payloads
- no secrets or tokens

## Idempotency

The queue tracks processed `commandId` values in memory for the running Desktop Studio session.

Repeated command IDs return:

- `status:"duplicate-command-id"`
- `duplicate:true`
- `noCommandExecuted:true`
- `originalResultPath`

The duplicate path does not call the shared registry again and therefore does not repeat destructive-capable smoke operations such as Desktop review/apply.

## Safety Guarantees

The queue does not expose:

- arbitrary JS/eval
- raw SQL
- hard delete
- purge
- tombstone propagation apply
- chat deletion
- snapshot deletion
- broad filesystem access
- HTTP server

Delete-related operations remain constrained by the shared registry:

- `requestFolderDelete` is Chrome-only and is not executable through the Desktop queue.
- `applyFolderDeleteRequest` is Desktop-only and routes through the existing Desktop review/apply API.
- `listActiveFolderTombstones` filters active tombstones by `!restoredAt` / `!restored_at`.

## Manual Desktop Test Commands

1. Enable the shared registry gates in Desktop Studio:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc');
const u = new URL(location.href);
u.searchParams.set('h2oSmokeBridge', 'folder-sync-rc');
location.href = u.toString();
```

2. After reload, confirm the queue gates:

```js
H2O.Studio.devSmoke.folderSyncQueue.diagnose()
```

Expected:

- `enabled:true`
- `surface:"desktop-studio"`
- `adapter:"tauri"`
- `commandPath:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"`
- `resultsDir:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/results"`

3. Write a `diagnoseHealth` command:

```sh
mkdir -p "/Users/hobayda/H2O Studio Sync/.h2o-smoke/results"
cat > "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json" <<'JSON'
{
  "commandId": "manual-diagnose-health-001",
  "op": "diagnoseHealth",
  "createdAt": "2026-06-23T00:00:00.000Z",
  "surface": "desktop-studio",
  "payload": {}
}
JSON
```

4. Wait for the interval poll, or trigger one manually in Desktop Studio:

```js
await H2O.Studio.devSmoke.folderSyncQueue.pollOnce({ reason: 'manual-desktop-queue-proof' })
```

5. Read the result:

```sh
cat "/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/manual-diagnose-health-001.json"
```

Expected:

- `ok:true`
- `status:"healthy"` or the current health status from `diagnoseHealth`
- `surface:"desktop-studio"`
- `adapter:"tauri"`
- safety flags true:
  - `noArbitraryEval`
  - `noBroadFilesystemAccess`
  - `noHardDelete`
  - `noPurge`
  - `noRawSql`
  - `noChatDelete`
  - `noSnapshotDelete`
  - `noTombstonePropagationApply`

6. Repeat the same `commandId` and poll again:

```js
await H2O.Studio.devSmoke.folderSyncQueue.pollOnce({ reason: 'manual-desktop-queue-duplicate-proof' })
```

Expected:

- `status:"duplicate-command-id"`
- `duplicate:true`
- `noCommandExecuted:true`
- original result file remains the authoritative command result
- no duplicate destructive-capable operation is run

## Validation

Commands run:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-desktop-queue.tauri.js`
- `node --check tools/product/studio/pack-studio.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-queue.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-queue.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-desktop-queue.tauri.js` - pass
- `node --check tools/product/studio/pack-studio.mjs` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-queue.mjs` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-queue.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass
- `git diff --check` - pass
- `git diff --cached --check` - pass

## Deferred

- Chrome CDP helper
- full RC smoke runner
- packaged/local RC smoke rerun and evidence capture
- restore receipts / Chrome re-show
- real tombstone propagation
- retention/purge
- WebDAV/cloud/relay transport adapters
