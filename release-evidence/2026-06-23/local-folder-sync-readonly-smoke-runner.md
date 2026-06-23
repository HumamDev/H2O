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

## Chrome Permission-State Alignment Fix

Follow-up issue:

- Chrome Dev smoke window console showed `H2O.Studio.sync.folder.diagnose()` with:
  - `connected:true`
  - `permission:"granted"`
  - `folderName:"H2O Studio Sync"`
  - `chromeWritesSyncFolder:true`
  - `blockers.permissionRequired:false`
  - `blockers.noFolderHandle:false`
- The combined runner still reported `chrome-health-permission-required` because the smoke registry `diagnoseHealth` path returned:
  - `permission-required`
  - `no-folder-handle`
  - `desktopToChrome.permission:"unknown"`
  - `chromeToDesktop.permission:"unknown"`

Root cause:

- The dev smoke registry used the folder health projection as its only source for `diagnoseHealth`.
- It did not reconcile that projection with the live `H2O.Studio.sync.folder.diagnose()` result that owns the current Chrome File System Access folder handle.
- The Chrome CDP helper also selected the first matching smoke Studio target by URL alone. If multiple smoke tabs existed, it did not prefer the target whose live sync diagnose reported `connected:true` and `permission:"granted"`.

Fix:

- `H2O.Studio.devSmoke.folderSync.run("diagnoseHealth", ...)` now reads `H2O.Studio.sync.folder.diagnose()` in the same target.
- On Chrome only, if the live sync diagnose reports `connected:true`, `permission:"granted"`, `permissionRequired:false`, and `noFolderHandle:false`, the registry removes stale permission blockers from the health projection and reports the reconciled permission state.
- The Chrome CDP helper now probes matching Studio targets with a fixed read-only sync-diagnose wrapper and prefers the target with a connected/granted folder handle.
- The combined read-only runner now only downgrades Chrome permission blockers to `chrome-health-permission-required` when the registry's live `syncFolderDiagnose` confirms the folder handle or permission is actually missing. If the live sync diagnose is granted, no permission warning is emitted.

Corrected expected behavior:

- When Chrome console `H2O.Studio.sync.folder.diagnose()` reports `connected:true` and `permission:"granted"`, the combined runner should not emit `chrome-health-permission-required`.
- `row-count-differs` can remain as a Slice 4C informational warning until the later full convergence/mutation smoke stage.

Validation for fix:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`: passed.
- `node --check tools/smoke/chrome-cdp-studio.mjs`: passed.
- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.

Rerun command:

```sh
node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000
```

## Chrome Connected-Target Selection Repair

Follow-up issue:

- After the permission-state alignment patch, manual console inspection in the visible Chrome Dev smoke Studio page showed the folder handle was connected and granted.
- The combined runner still selected or probed a CDP Studio target whose live sync diagnose reported:
  - `connected:false`
  - `permission:"unknown"`
  - `chromeWritesSyncFolder:false`
  - `permissionRequired:true`
  - `noFolderHandle:true`
- This proved the remaining mismatch was target selection, not the folder health diagnostic itself.

Root cause:

- Duplicate or stale Chrome Studio extension targets can exist in the smoke Chrome Dev profile.
- The helper previously favored the first smoke URL match and did not probe all Studio targets from both CDP discovery surfaces.
- Browser `Target.getTargets` uses `targetId`, while `/json/list` uses `id`; missing normalization made target probing and selection less reliable.
- The sync-folder diagnose probe did not await the real async diagnose call.

Fix:

- Chrome CDP helper now merges `/json/list` with browser `Target.getTargets`.
- It normalizes target ids, avoids URL/title-only dedupe, and probes every candidate Studio target.
- The probe is fixed/read-only and awaits `H2O.Studio.sync.folder.diagnose()`.
- Connected/granted targets are scored above URL-only targets.
- The selected target can be navigated to the smoke URL flag after localStorage opt-in, avoiding a new duplicate page when an already-connected Studio target exists.
- The helper and combined runner now emit `targetProbeSummary` diagnostics:
  - `probedTargetCount`
  - `connectedGrantedTargetCount`
  - `selectedTargetId`
  - `selectedTargetScore`
  - `selectedTargetSyncPermission`
  - `selectedTargetSyncConnected`
  - `selectedTargetChromeWritesSyncFolder`

Corrected behavior:

- If a connected/granted CDP Studio target exists, the helper should select it and the combined runner should not emit `chrome-health-permission-required`.
- If the CDP target set contains no connected/granted Studio page, the combined runner reports `chrome-cdp-connected-target-missing` as a precise blocker so the operator can restart or attach to the correct Chrome Dev smoke session/port.
- `row-count-differs` may still remain as an informational warning until the later full convergence/mutation smoke stage.

Validation for fix:

- `node --check tools/smoke/chrome-cdp-studio.mjs`: passed.
- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.

Rerun command:

```sh
node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000
```

Live follow-up on port `9243` after this repair:

- Combined runner result:
  - `ok:false`
  - `status:"readonly-smoke-blocked"`
  - `blockers:["chrome-cdp-connected-target-missing"]`
  - `warnings:["row-count-differs"]`
- Chrome target probe summary:
  - `probedTargetCount: 1`
  - `connectedGrantedTargetCount: 0`
  - `selectedTargetId: C665FF003C8F3B09E5B5D366630ACCFE`
  - `selectedTargetScore: 55`
  - `selectedTargetSyncPermission: "unknown"`
  - `selectedTargetSyncConnected: false`
  - `selectedTargetChromeWritesSyncFolder: false`
- Interpretation:
  - The old misleading permission warning path is fixed.
  - The runner now correctly says the CDP target set on port `9243` does not contain a connected/granted Studio target.
  - If the visible Chrome Dev smoke page has permission granted in manual console, the runner must be pointed at that page's actual CDP session/port, or the connected page must be reopened/regranted in the current CDP-controlled smoke profile.

## Chrome Folder-Handle Preservation During Attach

Follow-up issue:

- The visible Chrome Dev smoke Studio page could show a granted sync folder handle after `connectFolder()`.
- The direct helper and combined runner could still report `permission-required` / `no-folder-handle`.
- The remaining risk was that the helper either reloaded an existing page during attach setup or probed before the File System Access handle had been restored from IndexedDB.

Root cause / audit result:

- The current target URL already had `h2oSmokeBridge=folder-sync-rc`, so the specific user-reported target should not have taken the helper's `Page.navigate` branch.
- The helper still had a reload-capable branch for an existing Studio page missing only the URL flag, and that branch was unsafe for handle preservation.
- The target selection probe also performed only a single immediate diagnose read.

Fix:

- Replaced the existing-target URL-flag reload path with an in-page `history.replaceState` update.
- Kept localStorage opt-in idempotent.
- Added bounded waiting around `H2O.Studio.sync.folder.diagnose()` in both target scoring and final target preparation.
- Added a `Runtime.evaluate` fallback when `Runtime.callFunctionOn` does not return a by-value diagnose object.
- Added `prepareDiagnostics` to helper output and runner summaries:
  - `beforeNavigateSyncDiagnose`
  - `afterNavigateSyncDiagnose`
  - `finalSyncDiagnose`
  - diagnose wait/attempt counts
  - navigation mode
- Added explicit `chrome-cdp-navigation-lost-folder-handle` detection if a future setup step ever changes a granted handle to unknown.
- The combined runner now uses `prepareDiagnostics.finalSyncDiagnose` as a fallback live permission source if the registry health projection is stale.

Corrected expected behavior:

- If the same CDP-controlled Chrome Studio page has `connected:true` and `permission:"granted"`, the helper should preserve that state and the combined runner should not emit `chrome-health-permission-required`.
- The only expected Slice 4C warning after that is `row-count-differs`.

Validation for fix:

- `node --check tools/smoke/chrome-cdp-studio.mjs`: passed.
- `node --check tools/smoke/local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node --check tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`: passed.
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs`: passed.

Rerun command:

```sh
node tools/smoke/local-folder-sync-readonly-smoke-runner.mjs --chrome-port 9243 --timeout-ms 30000
```

## Deferred

- Full mutation smoke runner for create/rename/color.
- Delete request / receipt / hide loop smoke automation.
- File System Access permission automation.
- Packaged/local RC smoke rerun and evidence capture.
- Restore receipts / Chrome re-show.
- Real tombstone propagation.
- Retention/purge.
- WebDAV/cloud/relay transport adapters.
