# Phase 6A.1b - Folder purge resurrection fix

## Purpose

Phase 6A.1 added a Desktop-only Recently Deleted folder purge API. Runtime proof showed the API removed active folder tombstone/recovery records safely, but manual visual QA found that many purged folders reappeared in the normal Desktop folder list.

Examples observed after purge:

- `zz-4d4-delete-restore-*`
- `zz-5c-*`
- `F5D Test Folder`
- `F5D.1 Test Folder A/B`
- `New 9`
- `zz-delete-with-chat-test`

## Root Cause

Desktop normal folder reads hid soft-deleted folders by checking for active `sync_tombstones` records. Phase 6A.1 deleted only those active tombstone/recovery records. The underlying `folders` rows remained in SQLite, so once their tombstones were purged, the rows no longer had the active tombstone that kept them out of the normal folder projection.

## Fix Semantics

Phase 6A.1b keeps purge Desktop-only and changes the commit semantics:

1. Rebuild the guarded purge candidate plan from active folder tombstones.
2. Before deleting any tombstones, permanently suppress the exact associated folder rows with a Desktop-local metadata marker:
   - `phase6aPermanentlyPurged:true`
   - `phase6aPurgedAt`
   - `phase6aPurgeReason`
   - `phase6aPurgeSource:"desktop-recently-deleted-operator-purge"`
   - `phase6aPurgeTombstoneId`
3. Exclude those permanently suppressed rows from normal Desktop folder reads and counts.
4. Delete only the exact active tombstone IDs after folder-row suppression succeeds.

This is intentionally not a chat/snapshot/asset purge and not a Chrome authority path.

## Result Fields

The purge result now distinguishes tombstone deletion from folder-row suppression:

- `purgedTombstoneCount`
- `permanentlyHiddenFolderRowCount`
- `purgedFolderRowCount:0`
- `hardDeletedFolderRowCount:0`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `receiptDeletedCount:0`
- `purgePermanentlySuppressesFolderRows:true`
- `purgeDeletesFolderRows:false`

If folder-row suppression fails, tombstone deletion is not attempted.

## Resurrection Diagnostic

Added read-only diagnostic:

- `H2O.Studio.store.folders.diagnosePurgedFolderResurrectionCandidates()`
- Desktop smoke op: `diagnosePurgedFolderResurrectionCandidates`

The diagnostic lists visible folders that match known resurrected purge-test patterns. It does not delete or suppress anything.

## Safety Invariants

- Desktop-only.
- Chrome authority remains false.
- No Chrome rows deleted.
- No active visible folder deletion during purge candidate planning.
- No protected/system folder deletion.
- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No receipt/audit deletion.
- No raw SQL exposure.
- No WebDAV/cloud/relay behavior.

## Validation

Validation run:

- `node --check src-surfaces-base/studio/store/folders.tauri.js`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs`
- `node --check tools/validation/sync/validate-folder-purge-phase6a1b.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1b.mjs`
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `node tools/validation/sync/validate-folder-retention-phase4e.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `node tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs`
- `node tools/validation/sync/validate-folder-visible-parity-phase5a5.mjs`
- `git diff --check`

All static/source validators passed.

## Runtime Proof Plan

When Desktop Studio is running with the smoke gate enabled:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnosePurgedFolderResurrectionCandidates --timeout-ms 60000
```

For a fresh purge run, use Desktop DevTools:

```js
const preview = await H2O.Studio.store.folders.previewRecentlyDeletedFolderPurge({
  reason: 'phase6a1b-runtime-proof-preview'
});

const commit = await H2O.Studio.store.folders.purgeRecentlyDeletedFolders({
  dryRun: false,
  previewToken: preview.previewToken,
  expectedCount: preview.candidateCount,
  reason: 'phase6a1b-runtime-proof-commit'
});
```

Expected commit safety result:

- `purgedTombstoneCount >= 0`
- `permanentlyHiddenFolderRowCount >= 0`
- `purgedFolderRowCount:0`
- `hardDeletedFolderRowCount:0`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

## Current-State Note

The existing bad state was created by the earlier tombstone-only purge. Phase 6A.1b prevents the same resurrection on subsequent purges and exposes a read-only candidate diagnostic for already-resurrected rows. Any automatic repair of already-resurrected visible rows should remain separately confirmed because those rows no longer have active tombstones to prove the exact purge candidate set.

## Runtime Blocker

Attempted read-only Desktop smoke diagnostic:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnosePurgedFolderResurrectionCandidates --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`
- `nextAction:"Open Desktop Studio with ?h2oSmokeBridge=folder-sync-rc, set localStorage h2o:studio:smoke-bridge:enabled:v1 to folder-sync-rc, and confirm H2O.Studio.devSmoke.folderSyncQueue.diagnose().started is true."`

This is a runtime smoke gate/queue availability blocker, not a source validator failure.
