# Local Folder Sync Read-Only Smoke Runner

Date: 2026-06-23

## Purpose

Implement Slice 4C of the dev-only packaged/local Chrome <-> Desktop folder sync RC smoke bridge: one external read-only runner that executes the proven Chrome CDP helper and Desktop queue client, then emits a single redacted JSON summary.

This slice does not implement mutation smoke. It does not create, rename, recolor, delete, request, apply, purge, or propagate tombstones.

## Inputs

Default Chrome settings:

- Chrome helper: `tools/smoke/chrome-cdp-studio.mjs`
- Desktop helper: `tools/smoke/desktop-folder-sync-queue-client.mjs`
- Chrome mode: `attach`
- Chrome port: `9243`
- Timeout: `30000`

Runner command:

```sh
node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000
```

## Read-Only Commands

The runner executes four helper commands sequentially:

```text
Chrome diagnoseHealth
Chrome getFolderModel
Desktop diagnoseHealth
Desktop getFolderModel
```

The concrete helper invocations are:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9243 --op diagnoseHealth --timeout-ms 30000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9243 --op getFolderModel --timeout-ms 30000
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 30000
node tools/smoke/desktop-folder-sync-queue-client.mjs --op getFolderModel --timeout-ms 30000
```

## Result Schema

The runner emits:

```text
h2o.studio.local-folder-sync-readonly-smoke.result.v1
```

The output includes:

- `ok`
- `status`
- `observedAt`
- `phase`
- `chrome` summary
- `desktop` summary
- `comparison` summary
- `blockers`
- `warnings`
- safety flags

## Verdict Logic

`ok:true` requires:

- Chrome helper/registry is reachable.
- Chrome `getFolderModel` returns `ok:true`.
- Desktop `diagnoseHealth` returns `ok:true`.
- Desktop `getFolderModel` returns `ok:true`.

Chrome `diagnoseHealth` may return `status:"blocked"` with only:

- `permission-required`
- `no-folder-handle`

That is treated as a warning, not a full runner failure, when Chrome `getFolderModel` succeeds. This accounts for a fresh Chrome smoke profile that can read the local visible model but has not yet been granted File System Access permission for `/Users/hobayda/H2O Studio Sync`.

Hard blockers:

- helper crash
- invalid JSON from a helper
- Desktop queue timeout
- missing registry gates
- Chrome folder model unavailable
- Desktop health unavailable
- Desktop folder model unavailable

Comparison is informational in Slice 4C:

- `chromeRowCount`
- `desktopRowCount`
- `rowCountMatch`
- `commonFolderCount`
- `chromeOnlyCount`
- `desktopOnlyCount`

`row-count-differs` is a warning, not a Slice 4C failure. Exact convergence belongs to the full mutation/RC smoke runner.

## Safety Constraints

- `readOnly:true`
- `noArbitraryEval:true`
- `noRawSql:true`
- `noHardDelete:true`
- `noPurge:true`
- `noTombstonePropagationApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noBroadFilesystemAccess:true`

The runner does not execute:

- create folder
- rename folder
- set folder color
- request folder delete
- apply folder delete request
- hard delete
- purge
- raw SQL
- chat deletion
- snapshot deletion

## Validation

Commands run:

- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
  - Validator result: `ok:true`.
  - Allowed runner operations: `diagnoseHealth`, `getFolderModel`.
  - Confirmed row-count mismatch is warning-only for Slice 4C.
  - Confirmed Chrome `permission-required` / `no-folder-handle` health blockers are warning-only when Chrome folder model reads successfully.
- `git diff --check`: passed.
- `git diff --cached --check`: passed.

## Deferred

- Full mutation smoke runner for create/rename/color.
- Delete request / receipt / hide loop smoke automation.
- File System Access permission automation.
- Packaged/local RC smoke rerun and evidence capture.
- Restore receipts / Chrome re-show.
- Real tombstone propagation.
- Retention/purge.
- WebDAV/cloud/relay transport adapters.
