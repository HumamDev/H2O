# Phase 5A.3 - Chrome Display Filter for Desktop Hidden Folders

## Purpose

Phase 5A.3 makes Chrome's normal folder display model respect the Chrome-local hide overlay created in Phase 5A.2.

The prior runtime diagnostic showed:

- `hiddenByDesktopVisibleSetCount:36`
- `chromeVisibleFolderCount:39`
- many stale `zz-4d4-delete-restore...` rows still visible in the normal Chrome folder list

That meant Desktop visible-set hide markers were stored, but `FolderParity.getDisplayModel()` and the normal Chrome folder UI still admitted hidden materialized rows.

## Design

This phase is display/filtering only.

The Chrome folder workspace model now treats these markers as hidden for normal display:

- `hidden:true`
- `hiddenByDesktopVisibleSet:true`
- `desktopVisibleSetMissing:true`
- `hiddenByDesktopReceipt:true`
- `deletedByDesktopReceipt:true`

The hidden markers are preserved through row normalization and are checked before rows become canonical or materialized display rows.

The display model also consumes the `hiddenByDesktopVisibleSet` marker bag stored beside the folder rows. This covers older overlay writes where the marker bag exists but individual display rows do not carry row-level hidden fields.

Rows remain in storage. No storage pruning or destructive mutation is performed.

## Expected Runtime Effect

After Desktop exports a fresh `latest.json` and Chrome imports it:

- `hiddenByDesktopVisibleSetCount` remains greater than zero if stale rows exist.
- `getFolderModel` row count drops from the previous 39/41 range toward Desktop's visible count.
- stale `zz-4d4-delete-restore...` folders no longer appear in Chrome's normal folder list.
- protected/system folders remain visible when they are valid display rows.
- pending Chrome-created rows remain visible while awaiting Desktop adoption.

## Safety

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- No storage deletion.
- No tombstone create/apply.
- No Chrome delete authority.
- No Chrome restore authority.
- No purge.
- No hard delete.
- No chat/snapshot mutation.
- No WebDAV/cloud/relay behavior.

## Files

- `src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js`
- `tools/validation/sync/validate-folder-visible-parity-phase5a2.mjs`
- `tools/validation/sync/validate-folder-visible-parity-phase5a3.mjs`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a3-display-filter.md`

## Validation Results

Passed:

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
node --check "src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js"
node --check tools/validation/sync/validate-folder-visible-parity-phase5a2.mjs
node --check tools/validation/sync/validate-folder-visible-parity-phase5a3.mjs
node tools/validation/sync/validate-folder-visible-parity-phase5a3.mjs
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

## Runtime Proof Commands

Export fresh Desktop latest:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a3-desktop-visible-set-export"}' --timeout-ms 60000
```

Import Desktop latest into Chrome:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a3-apply-display-filter"}' --timeout-ms 60000
```

Run parity diagnostic:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
```

Run folder model check:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op getFolderModel --timeout-ms 60000
```

Expected:

- `ok:true`
- `blockers:[]`
- `hiddenByDesktopVisibleSetCount > 0` if stale rows exist
- `getFolderModel` row count reduced significantly from the pre-filter 39/41 range
- safety flags true

## Runtime Proof

Desktop export attempt:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a3-desktop-visible-set-export"}' --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- blocker: `desktop-queue-timeout`
- next action reported by helper: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set `h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`, and confirm the queue is started.

Chrome runtime was then validated against the existing stored Desktop visible set after reloading the unpacked Studio Launcher extension through CDP:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseVisibleFolderParity --timeout-ms 60000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op getFolderModel --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"visible-folder-parity-diagnosed"`
- `desktopVisibleSetStored:true`
- `desktopVisibleFolderCount:14`
- `hiddenByDesktopVisibleSetCount:36`
- `chromeVisibleFolderCount:5`
- `chromeOnlyVisibleFolderCount:0`
- `candidateStaleFolderCount:0`
- `blockers:[]`
- `getFolderModel.status:"folder-model-read"`
- `getFolderModel.rowCount:5`
- `getFolderModel.canonicalRowCount:5`
- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Deferred

This phase intentionally does not add Chrome Recently Deleted UI, delete/restore controls, purge, WebDAV/cloud/relay transport, or chat-folder binding reconciliation.
