# Phase 4D.3 - Desktop Recently Deleted Diagnostics

## Purpose

Phase 4D.3 adds a Desktop-side, read-only Recently Deleted diagnostics/list API for folder tombstones. This gives an operator/smoke runner a safe way to inspect soft-deleted and restored folder tombstones before future UI work.

## Design Note

- Desktop remains the authority for destructive folder lifecycle.
- This phase is diagnostics/list only.
- The API reads existing `sync_tombstones` data through the public tombstone store.
- No delete, restore, purge, hard delete, chat mutation, binding mutation, snapshot mutation, Chrome behavior, WebDAV, cloud, or relay behavior is added.

## Files Changed

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/smoke/desktop-folder-sync-queue-client.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d3-recently-deleted-diagnostics.md`

## API

Desktop folder store:

- `H2O.Studio.store.folders.listRecentlyDeletedFolders(opts)`
- `H2O.Studio.store.folders.diagnoseRecentlyDeletedFolders(opts)`

Desktop smoke registry:

- `H2O.Studio.devSmoke.folderSync.run("listRecentlyDeletedFolders", payload)`

Desktop queue client:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op listRecentlyDeletedFolders \
  --timeout-ms 30000
```

## Row Shape

Each folder tombstone row includes, where available:

- `tombstoneId`
- `folderId`
- `folderName`
- `recordKind:"folder"`
- `deletedAt`
- `deletedBy`
- `deletedBySurface`
- `restoredAt`
- `restoreAvailable`
- `restoreStatus`
- `affectedChatCount`
- `bindingRestoreAttemptedCount`
- `bindingRestoredCount`
- `bindingSkippedCount`
- `restoreWarnings[]`
- `purgeBlocked:true`
- `hardDeleteBlocked:true`
- `retentionDays:30`
- `retentionExpiresAt`
- `retentionCountdownStatus`

## Aggregate Shape

The result includes:

- `schema:"h2o.studio.folder-recently-deleted-diagnostics.v1"`
- `phase:"phase4d.3"`
- `activeTombstoneCount`
- `restoredTombstoneCount`
- `folderTombstoneCount`
- `restoreAvailableCount`
- `purgeBlockedCount`
- `hardDeleteBlockedCount`
- `retentionDays:30`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Safety Guarantees

- Read-only diagnostics only.
- No raw SQL delete.
- No hard delete.
- No purge.
- No folder delete behavior change.
- No folder restore behavior change.
- No Chrome behavior change.
- No chat deletion.
- No snapshot deletion.
- No tombstone propagation apply.
- Retention is diagnostic-only; expired rows remain purge-blocked in this phase.

## Validation

Commands:

```bash
node --check src-surfaces-base/studio/store/folders.tauri.js
node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js
node --check tools/smoke/desktop-folder-sync-queue-client.mjs
node --check tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs
node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs
node tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs
node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs
node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs
node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
git diff --check
git diff --cached --check
```

Results:

- `node --check src-surfaces-base/studio/store/folders.tauri.js` passed.
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` passed.
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs` passed.
- `node --check tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs` passed.
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` passed.
- `node tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs` passed.
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` passed.
- `node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs` passed.
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs` passed.
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs` passed.
- `npm run dev:all` passed.
- `node apps/studio/desktop/build-tools/prepare-dist.mjs` passed.

## Runtime Proof Attempt

Command:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op listRecentlyDeletedFolders \
  --timeout-ms 30000
```

Result before Desktop relaunch:

- The external Desktop queue client accepted `listRecentlyDeletedFolders` as read-only.
- The running Desktop Studio page still had the previous in-memory smoke registry and returned `op-not-allowlisted`.
- Root cause: the live Desktop WebView had not reloaded the rebuilt `folder-sync-rc-smoke-bridge.studio.js`; source and prepared dist did include `listRecentlyDeletedFolders`.

## Runtime Surfacing Fix

The smoke registry now returns the Recently Deleted diagnostics in a stable top-level shape:

- `recentlyDeletedDiagnostics`
- `rows`
- `items`
- `list`
- `activeTombstoneCount`
- `restoredTombstoneCount`
- `folderTombstoneCount`
- `restoreAvailableCount`
- `purgeBlockedCount`
- `hardDeleteBlockedCount`
- `retentionDays`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

The Phase 4D.3 validator now asserts:

- `listRecentlyDeletedFolders` is present in the smoke registry `ALLOWED_OPS`.
- the registry dispatch path calls the Recently Deleted diagnostics API.
- the stable diagnostics fields above are surfaced.

After `npm run dev:all` and `prepare-dist`, the packaged Desktop app was relaunched with:

```text
tauri://localhost/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders
```

Result after relaunch:

- The queue client timed out with `desktop-queue-timeout`.
- Interpretation: the relaunched Desktop app did not have the required localStorage smoke opt-in active, so `H2O.Studio.devSmoke.folderSyncQueue` did not process commands.
- This is not a product-code blocker for Phase 4D.3; it is the existing dev-only smoke bridge gate doing its job.
- A live proof requires enabling the existing Desktop smoke gate in the relaunched app:
  - `localStorage.setItem("h2o:studio:smoke-bridge:enabled:v1", "folder-sync-rc")`
  - confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`
  - rerun the queue client command above.

## Deferred

- Operator UI.
- Restore action UI.
- Chrome restore/re-show smoke runner coverage.
- Retention countdown UI.
- Purge/retention execution.
- WebDAV/cloud/relay.
