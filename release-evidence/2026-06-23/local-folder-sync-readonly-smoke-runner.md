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

## Live Proof

Implementation commit:

- `894f5086edc8544ddb29eaf8b93b2615ae8c1daf` - `feat(sync): add local folder sync readonly smoke runner`

Runtime command:

```sh
node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000
```

The combined runner executed:

1. Chrome `diagnoseHealth`
2. Chrome `getFolderModel`
3. Desktop `diagnoseHealth`
4. Desktop `getFolderModel`

Combined result:

- `blockers: []`
- `warnings: ["chrome-health-permission-required", "row-count-differs"]`

This is an expected Slice 4C pass. Chrome File System Access permission is not required for read-only model access, and row-count difference is informational at this stage.

### Chrome Proof

- Studio target found: `studioTargetFound:true`
- Smoke URL flag present: `smokeUrlFlagPresent:true`
- Extension ID discovered/loaded: `bpobkkppdlldlkccaehmpfclmkhiemhg`
- Registry gates:
  - `registryGatesEnabled:true`
  - `surface: chrome-studio`
  - `adapter: mv3`
  - `blockers:[]`
- CDP transport: `target-websocket`

Chrome `diagnoseHealth`:

- Helper reachable.
- Registry result: `ok:true`
- `status: blocked`
- `verdict: blocked`
- Blockers:
  - `permission-required`
  - `no-folder-handle`

Interpretation: this is an expected warning for a fresh Chrome smoke profile without File System Access permission.

Chrome `getFolderModel`:

- `ok:true`
- `status: folder-model-read`
- `rowCount:6`
- `canonicalRowCount:6`
- `displayModelAvailable:true`

### Desktop Proof

Desktop `diagnoseHealth`:

- `helperReachable:true`
- `helperOk:true`
- `status: healthy`
- `registryOk:true`
- `registryStatus: healthy`
- `registryVerdict: healthy`
- `registryGatesEnabled:true`
- `blockers:[]`
- `warnings:[]`

Desktop `getFolderModel`:

- `helperReachable:true`
- `helperOk:true`
- `status: folder-model-read`
- `registryOk:true`
- `registryStatus: folder-model-read`
- `registryGatesEnabled:true`
- `rowCount:17`
- `canonicalRowCount:17`
- `displayModelAvailable:true`

### Comparison Proof

- `chromeRowCount:6`
- `desktopRowCount:17`
- `rowCountMatch:false`
- `commonFolderCount:6`
- `chromeOnlyCount:0`
- `desktopOnlyCount:11`
- `comparisonIsInformational:true`

Interpretation:

- Row-count difference is a warning only in Slice 4C.
- Full convergence/parity belongs to the later full RC smoke/mutation stage, not this read-only communication proof.

### Safety Proof

- `readOnly:true`
- `noArbitraryEval:true`
- `noRawSql:true`
- `noHardDelete:true`
- `noPurge:true`
- `noTombstonePropagationApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noBroadFilesystemAccess:true`

No mutation operations were executed. The live proof did not create, rename, recolor, delete, request, or apply folder changes.

### Live Verdict

Slice 4C combined read-only smoke runner is live-proven.

- Chrome CDP helper and Desktop queue client can now be driven together by one command.
- The combined runner produces one redacted report with no blockers.
- Remaining warnings are expected:
  - Chrome fresh profile lacks File System Access permission.
  - Chrome/Desktop row counts differ before full convergence smoke.

Next phase should prepare for full local RC smoke by either granting the Chrome smoke profile access to `/Users/hobayda/H2O Studio Sync`, or adding an explicit operator step/check for Chrome File System Access permission before mutation smoke.

## Deferred

- Full mutation smoke runner for create/rename/color.
- Delete request / receipt / hide loop smoke automation.
- File System Access permission automation.
- Packaged/local RC smoke rerun and evidence capture.
- Restore receipts / Chrome re-show.
- Real tombstone propagation.
- Retention/purge.
- WebDAV/cloud/relay transport adapters.
