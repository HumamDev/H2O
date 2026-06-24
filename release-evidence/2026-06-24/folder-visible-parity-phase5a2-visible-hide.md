# Phase 5A.2 - Chrome Visible-State-Only Hide Overlay

## Purpose

Phase 5A.2 makes Chrome's normal folder list visually follow Desktop's stored visible folder set after a successful Desktop-to-Chrome sync.

The manual visual QA problem was:

- Desktop normal Folders page showed fewer folders than Chrome.
- Chrome still displayed stale `zz-4d4-delete-restore...` folders.
- Phase 5A.0 diagnostics showed many Chrome-only visible rows.
- Phase 5A.1 stored Desktop's visible folder set in Chrome.

Phase 5A.2 applies only a Chrome-local visible-state-only hide overlay for Chrome rows missing from the stored Desktop visible set.

## Design

After Desktop-to-Chrome import, Chrome compares:

- stored `desktopVisibleFolderSet`
- Chrome's local folder-state mirror rows

Rows missing from Desktop's visible set are marked with:

- `hidden:true`
- `hiddenByDesktopVisibleSet:true`
- `desktopVisibleSetMissing:true`
- `visibleStateOnlyHide:true`

The underlying row remains in Chrome storage. It is not deleted. No tombstone is created or applied.

If a later Desktop visible set includes the folder again, the overlay is cleared and the row can reappear.

## Exclusions

The overlay skips:

- protected/system folders
- Unfiled or equivalent system rows
- pending Chrome-created rows newer than the Desktop visible set export

## Diagnostic Surfacing

`diagnoseVisibleFolderParity` now reports:

- `desktopVisibleSetStored`
- `desktopVisibleSetImportedAt`
- `desktopVisibleFolderCount`
- `chromeVisibleFolderCount`
- `chromeOnlyVisibleFolders`
- `desktopOnlyVisibleFolders`
- `candidateStaleFolderCount`
- `pendingChromeCreatedCount`
- `hiddenByDesktopVisibleSetCount`
- `hiddenByDesktopVisibleSetRows`

## Safety

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- No real delete.
- No tombstone create/apply.
- No Chrome delete authority.
- No Chrome restore authority.
- No purge.
- No hard delete.
- No chat/snapshot mutation.
- No WebDAV/cloud/relay behavior.

## Validation Results

Passed:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check "src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js"
node --check tools/validation/sync/validate-folder-visible-parity-phase5a2.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a2.mjs
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
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a2-desktop-visible-set-export"}' --timeout-ms 60000
```

Import Desktop latest into Chrome and apply visible-state overlay:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a2-apply-visible-set-hide"}' --timeout-ms 60000
```

Run diagnostic:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

Expected:

- `ok:true`
- `desktopVisibleSetStored:true`
- `hiddenByDesktopVisibleSetCount > 0` if stale rows exist
- `chromeVisibleFolderCount` moves closer to `desktopVisibleFolderCount`
- `chromeOnlyVisibleFolderCount` reduced
- `candidateStaleFolderCount` reduced or rows are listed as hidden
- safety flags true
- `blockers:[]`

## Runtime Attempt During Implementation

Desktop export command:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a2-desktop-visible-set-export"}' --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- blocker: `desktop-queue-timeout`
- next action: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set `h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`, and confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

Chrome diagnostic command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"chrome-cdp-unavailable"`
- blocker: `chrome-cdp-unavailable`
- error: `fetch failed`

Runtime proof should be rerun once Desktop smoke queue and Chrome CDP Studio are active.

## Deferred

This phase intentionally does not add Chrome Recently Deleted UI, delete/restore controls, purge, WebDAV/cloud/relay transport, or chat-folder binding reconciliation.
