# Local Folder Sync Smoke Desktop Queue Client

Date: 2026-06-23

## Purpose

Implement Slice 4B of the dev-only packaged/local Chrome <-> Desktop folder sync RC smoke bridge: a small external Node helper that writes a command into the already-proven Desktop file-command queue, waits for the queue result JSON, and prints one redacted JSON result to stdout.

This slice adds external smoke tooling only. It does not modify Desktop runtime queue behavior, Chrome CDP tooling, production behavior, or folder sync semantics.

## Files Changed

- `tools/smoke/desktop-folder-sync-queue-client.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `release-evidence/2026-06-23/local-folder-sync-smoke-desktop-client.md`

## Command And Result Paths

The client writes exactly one command file:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json
```

The client waits for the matching result file:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/<commandId>.json
```

The queue itself remains the only code that executes the operation. It dispatches only through:

```js
H2O.Studio.devSmoke.folderSync.run(op, payload)
```

## Supported Ops

Slice 4B is read-only. The client allows only:

- `diagnoseHealth`
- `getFolderModel`

All other ops return:

```text
op-not-read-only
```

## Safety Constraints

- No arbitrary JavaScript or eval.
- No raw SQL.
- No hard delete.
- No purge.
- No tombstone propagation apply.
- No chat deletion.
- No snapshot deletion.
- No broad filesystem access beyond the existing `.h2o-smoke` command and result paths.
- No create, rename, color, folder delete request, or Desktop apply operations in this slice.
- Result output is privacy-redacted and uses schema:
  - `h2o.studio.desktop-queue-smoke-client.result.v1`

## Timeout Behavior

If Desktop Studio is not open, the smoke bridge gates are not enabled, or the queue does not process the command before timeout, the client returns:

```text
desktop-queue-timeout
```

The result includes a `nextAction` telling the operator to open Desktop Studio with:

- URL flag: `?h2oSmokeBridge=folder-sync-rc`
- localStorage opt-in: `h2o:studio:smoke-bridge:enabled:v1 = folder-sync-rc`
- running queue: `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

## Manual Runtime Commands

Run a Desktop health smoke command:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 30000
```

Read the Desktop folder display model:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op getFolderModel --timeout-ms 30000
```

Expected success requires Desktop Studio to be open with the Slice 2 registry gates enabled and the Slice 3 Desktop file-command queue running.

## Validation

Commands run:

- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` - pass
  - helper exists
  - command path scoped to `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`
  - result path scoped to `/Users/hobayda/H2O Studio Sync/.h2o-smoke/results`
  - allowed ops: `diagnoseHealth`, `getFolderModel`
- `git diff --check` - pass
- `git diff --cached --check` - pass

## Deferred

- Combined read-only Chrome + Desktop runner.
- Mutation smoke runner for create/rename/color.
- Delete request / receipt / hide loop smoke automation.
- Packaged/local RC smoke rerun and evidence capture.
- Restore receipts / Chrome re-show.
- Real tombstone propagation.
- Retention/purge.
- WebDAV/cloud/relay transport adapters.
