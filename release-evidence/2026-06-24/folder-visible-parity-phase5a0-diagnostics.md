# Phase 5A.0 - Chrome Visible Folder Parity Diagnostics

## Purpose

Phase 5A.0 adds diagnostics only for the Chrome normal folder list parity issue found during manual visual QA:

- Desktop Studio Folders page showed 21 folders.
- Chrome Studio Folders page showed 45 folders.
- Chrome normal folder list still showed stale `zz-4d4-delete-restore...` rows.

This phase does not hide, prune, delete, restore, purge, or otherwise mutate folders. It only compares Desktop's exported visible folder set in `latest.json` with Chrome's current `FolderParity.getDisplayModel()` canonical visible rows.

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `tools/validation/sync/validate-folder-visible-parity-phase5a0.mjs`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a0-diagnostics.md`

## Diagnostic

New read-only Chrome diagnostic:

```js
H2O.Studio.devSmoke.folderSync.run('diagnoseVisibleFolderParity', {
  commandId: 'manual-visible-parity-diagnostic',
  createdAt: new Date().toISOString()
})
```

The Chrome CDP helper can call it without mutation opt-in:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

## Reported Fields

- `desktopVisibleFolderCount`
- `chromeVisibleFolderCount`
- `chromeOnlyVisibleFolders`
- `desktopOnlyVisibleFolders`
- `hiddenByDeleteReceiptCount`
- `reShownByRestoreReceiptCount`
- `hiddenByDesktopVisibleSetCount`
- `pendingChromeCreatedCount`
- `protectedFolderCount`
- `candidateStaleRows`

Protected/system rows such as Unfiled are identified separately and excluded from stale-row recommendations.

## Safety

This is diagnostics only.

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- No Chrome delete authority.
- No Chrome restore authority.
- No hide/prune behavior.
- No WebDAV/cloud/relay behavior.

## Validation Results

Passed:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js
node --check tools/smoke/chrome-cdp-studio.mjs
node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs
node --check tools/validation/sync/validate-folder-visible-parity-phase5a0.mjs
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

## Runtime Proof Command

After Desktop has a fresh `latest.json` and Chrome CDP Studio is running on port 9247:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

Expected:

- `ok:true`
- `desktopVisibleFolderCount` present
- `chromeVisibleFolderCount` present
- `chromeOnlyVisibleFolders` present
- `desktopOnlyVisibleFolders` present
- safety flags true
- no mutation performed

Runtime attempt during implementation:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"chrome-cdp-unavailable"`
- blocker: `chrome-cdp-unavailable`
- reason: `fetch failed`

The diagnostic is implemented and statically validated, but live output still requires a running Chrome CDP Studio target on port 9247.

## Deferred

The next phase should decide whether and how to apply a Chrome visible-state-only hide overlay for Chrome rows absent from Desktop's current visible export. That phase must still avoid Chrome delete/restore authority, tombstone apply/create, hard delete, purge, and chat/snapshot mutation.
