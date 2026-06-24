# Phase 5A.1 - Desktop Visible Folder Set Snapshot

## Purpose

Phase 5A.1 stores/imports Desktop's visible folder set during Chrome Desktop-to-Chrome sync so later visible-state parity work can compare Chrome's normal folder display against Desktop's canonical visible state.

This phase is metadata-only. It does not hide, prune, delete, restore, purge, or mutate Chrome folder rows.

## Design

During successful Desktop-to-Chrome import from `latest.json`, Chrome now derives a safe `desktopVisibleFolderSet` snapshot from the same Desktop folder metadata source used by the existing import path.

The snapshot is persisted in the existing Chrome sync import state and includes:

- `schema:"h2o.studio.folder-visible-set.desktop.v1"`
- `source:"desktop-latest-visible-set"`
- `status:"imported"`
- `importedAt`
- `sourceExportedAt`
- `sourceKind`
- `desktopVisibleFolderIds[]`
- `desktopVisibleFolderCount`
- safe row metadata:
  - `folderId`
  - `name`
  - `color`
  - `iconColor`
  - `source`
  - `sourceKind`
  - `updatedAt`
  - `hidden:false`

Duplicate/idempotent auto-imports also refresh the snapshot.

## Diagnostic Surfacing

`diagnoseVisibleFolderParity` now reports the stored visible set when present:

- `desktopVisibleSetStored`
- `desktopVisibleSetImportedAt`
- `desktopVisibleSetSource`
- `desktopVisibleSetStatus`
- `desktopVisibleSetSourceExportedAt`
- `desktopVisibleFolderCount`
- `desktopVisibleFolderIds`
- `chromeVisibleFolderCount`
- `chromeOnlyVisibleFolders`
- `desktopOnlyVisibleFolders`
- `candidateStaleFolderCount`
- `hiddenByDesktopVisibleSetCount:0`

`hiddenByDesktopVisibleSetCount` remains `0` because Phase 5A.1 intentionally does not apply hide/prune behavior.

## Safety

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- No Chrome delete authority.
- No Chrome restore authority.
- No Chrome tombstone authority.
- No hide/prune behavior.
- No WebDAV/cloud/relay behavior.

## Validation Results

Passed:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check tools/validation/sync/validate-folder-visible-parity-phase5a1.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a1.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a0.mjs
node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs
node tools/validation/sync/validate-folder-retention-phase4e.mjs
node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs
node tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs
git diff --check
git diff --cached --check
```

Existing sync validators also passed:

- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `node tools/validation/sync/validate-folder-retention-phase4e.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `node tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs`

## Runtime Proof Commands

Export fresh Desktop latest:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a1-desktop-visible-set-export"}' --timeout-ms 60000
```

Import Desktop latest into Chrome:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a1-import-desktop-visible-set"}' --timeout-ms 60000
```

Run diagnostic:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

Expected:

- `ok:true`
- `desktopVisibleSetStored:true`
- `desktopVisibleFolderCount` present
- `desktopVisibleSetImportedAt` present
- `chromeVisibleFolderCount` present
- `chromeOnlyVisibleFolders` present
- `desktopOnlyVisibleFolders` present
- `hiddenByDesktopVisibleSetCount:0`
- safety flags true
- `blockers:[]`

## Runtime Attempt During Implementation

Desktop export command first failed inside the sandbox because `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json` is outside the workspace. The same command was rerun with filesystem escalation and reached the queue client, but the Desktop queue timed out:

- `ok:false`
- `status:"desktop-queue-timeout"`
- blocker: `desktop-queue-timeout`
- next action: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set `h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`, and confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

Chrome diagnostic command also could not attach to CDP on port 9247:

- `ok:false`
- `status:"chrome-cdp-unavailable"`
- blocker: `chrome-cdp-unavailable`
- error: `fetch failed`

Runtime proof should be rerun once Desktop smoke queue and Chrome CDP Studio are active.

## Deferred

Phase 5A.2 should decide whether to apply a Chrome visible-state-only hide overlay for Chrome rows absent from the stored Desktop visible set. That must remain non-destructive and must not grant Chrome delete, restore, purge, hard delete, or tombstone authority.
