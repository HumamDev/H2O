# Phase 6A.1c - Purged folder resurrection repair

## Purpose

Phase 6A.1 purged 52 active folder tombstones safely, but because the original purge only removed tombstone/recovery records, several already-soft-deleted folder rows reappeared in the normal Desktop folder list. Phase 6A.1b fixed future purge semantics by permanently suppressing folder rows before deleting tombstones. Phase 6A.1c adds a guarded one-time repair path for rows already resurrected by the earlier tombstone-only purge.

## Root Cause

Desktop normal folder reads hid soft-deleted folder rows by checking for active `sync_tombstones`. The Phase 6A.1 runtime purge removed those active tombstones while leaving folder rows intact. With no tombstone left to hide them, the underlying rows became visible again.

## Repair API

Desktop store APIs added:

- `previewPurgedFolderResurrectionRepair(options)`
- `repairPurgedFolderResurrections(options)`

The preview creates a short-lived confirmation token and records the exact folder IDs selected for repair. The commit requires:

- `dryRun:false`
- valid preview token
- exact expected candidate count
- explicit reason

The repair marks exact selected rows with the same permanent suppression marker introduced in 6A.1b:

- `phase6aPermanentlyPurged:true`
- `phase6aPurgedAt`
- `phase6aPurgeReason`
- `phase6aPurgeSource:"desktop-recently-deleted-resurrection-repair"`
- `phase6aPurgeRepair:true`

No SQL folder row deletion is used.

## Candidate Scope

The repair only targets visible folder rows whose names match the known resurrected smoke/test patterns:

- `zz-4d4-delete-restore-*`
- `zz-5c-*`
- `zz-delete-*`
- `F5D Test Folder*`
- `F5D.1 Test Folder*`
- `New 9`

Normal user folders are counted as `activeRealUserSkippedCount` and are not candidates. Protected/system folders remain blocked by the existing folder purge protection guard.

## Safety Invariants

- Desktop/Tauri only.
- Chrome authority remains false.
- No Chrome row mutation.
- No tombstone creation.
- No tombstone apply on Chrome.
- No SQL hard delete of folder rows.
- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No receipt/audit deletion.
- No WebDAV/cloud/relay behavior.

Expected zero-delete result fields:

- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`

## Runtime Proof Plan

Run in Desktop Studio DevTools:

```js
const before = await H2O.Studio.store.folders.diagnosePurgedFolderResurrectionCandidates();

const preview = await H2O.Studio.store.folders.previewPurgedFolderResurrectionRepair({
  reason: 'phase6a1c-resurrection-repair-preview'
});

const commit = await H2O.Studio.store.folders.repairPurgedFolderResurrections({
  dryRun: false,
  previewToken: preview.previewToken,
  expectedCount: preview.candidateCount,
  reason: 'phase6a1c-resurrection-repair-commit'
});

const after = await H2O.Studio.store.folders.diagnosePurgedFolderResurrectionCandidates();
const recentlyDeleted = await H2O.Studio.store.folders.listRecentlyDeletedFolders();
({ before, preview, commit, after, recentlyDeleted });
```

Expected runtime result:

- before `resurrectedCandidateCount` around 30
- preview `candidateCount` equals the suspect visible count
- commit `ok:true`
- commit `status:"purged-folder-resurrections-repaired"`
- commit `repairedCount` equals expected count
- after `resurrectedCandidateCount:0`
- `recentlyDeleted.folderTombstoneCount` remains the restored/history count
- `recentlyDeleted.purgeEligibleCount:0`
- `chatDeletedCount:0`
- `snapshotDeletedCount:0`
- `assetDeletedCount:0`
- `hardDeletedFolderRowCount:0`
- `receiptDeletedCount:0`
- `blockers:[]`

## Validation

Validation run:

- `node --check src-surfaces-base/studio/store/folders.tauri.js`
- `node --check tools/validation/sync/validate-folder-purge-phase6a1c.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1b.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1c.mjs`
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `node tools/validation/sync/validate-folder-retention-phase4e.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `node tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs`
- `node tools/validation/sync/validate-folder-visible-parity-phase5a5.mjs`
- `git diff --check`

All source/static validators passed.

## Runtime Status

The repair path is intended to run from Desktop Studio DevTools after the updated source is rebuilt/reloaded into the Desktop runtime. This slice does not expose the repair commit operation through the Desktop smoke queue, so the runtime repair was not executed by the external queue client in this pass.

Runtime proof remains:

1. Load updated Desktop runtime.
2. Run `previewPurgedFolderResurrectionRepair()`.
3. Run `repairPurgedFolderResurrections()` with the preview token and exact expected count.
4. Confirm `diagnosePurgedFolderResurrectionCandidates().resurrectedCandidateCount === 0`.
