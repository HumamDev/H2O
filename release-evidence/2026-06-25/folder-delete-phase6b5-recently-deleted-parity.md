# Phase 6B.5 - Recently Deleted Canonical Parity

## Verdict

Phase 6B.5 aligns Chrome Studio and Desktop Studio Recently Deleted around one Desktop-authoritative active deleted folder projection.

Desktop remains authoritative for canonical tombstones, restore, permanent delete, and purge. Chrome remains a read-only companion for Recently Deleted state.

## Problem

After the 6B.4e receipt flow was proven, normal folders were aligned at 5 / 5, but Recently Deleted was not:

- Desktop Studio Recently Deleted showed 3 active rows / purge eligible 3.
- Chrome Studio Recently Deleted companion showed 13 rows.

Chrome was counting historical Desktop receipt markers and pending local companion state as active Recently Deleted rows. Desktop was showing its active tombstone / purge set.

## Root Cause

Desktop Recently Deleted is backed by the Desktop tombstone store and filters active folder tombstones for the current operator list.

Chrome Recently Deleted companion was backed by Chrome-local receipt markers plus pending delete request state. That was useful for 6B.3 and 6B.4 receipt confirmation, but it was not canonical: old receipts could remain after Desktop no longer treated those rows as active deleted folders.

## Design

Desktop `latest.json` now exports the Desktop canonical Recently Deleted active folder projection:

- `desktopCanonicalRecentlyDeletedFolders[]`
- `desktopCanonicalRecentlyDeleted`

The projection includes active folder tombstones only:

- `folderId`
- `folderName`
- `deletedAt`
- `deleteReason`
- `requestId` / `reviewId` when available
- `source:"desktop-canonical-recently-deleted"`
- `status:"deleted"`
- `restoreEligible:true`
- `purgeEligible:true`

Chrome imports this projection into its local folder-state mirror as `desktopCanonicalRecentlyDeleted`.

When this canonical snapshot is present, Chrome Recently Deleted companion renders that Desktop canonical projection as the confirmed Recently Deleted list. Historical receipt rows remain diagnostic only and are counted as stale when absent from the Desktop canonical set.

Chrome no longer counts historical receipt rows as active Recently Deleted.

Pending Chrome-local deletes remain visible-state metadata for immediate UX and diagnostics, but they are not counted as Desktop-confirmed Recently Deleted rows once the Desktop canonical projection is available.

## 6B.5b Runtime Follow-up

Initial runtime proof after the 6B.5 commit still failed:

- Desktop export wrote `latest.json` successfully.
- Chrome import completed without blockers.
- Chrome diagnostic reported:
  - `desktopCanonicalRecentlyDeletedCount:0`
  - `chromeCanonicalRecentlyDeletedCount:0`
  - `chromeCompanionRecentlyDeletedCount:13`
  - `desktopChromeRecentlyDeletedParityOk:false`

Inspection of `/Users/hobayda/H2O Studio Sync/latest.json` showed the Desktop export was correct:

- `summary.desktopCanonicalRecentlyDeletedCount:3`
- `desktopCanonicalRecentlyDeleted.count:3`
- `desktopCanonicalRecentlyDeletedFolders.length:3`
- active folder tombstones: `3`

The remaining bug was Chrome-side:

1. The Chrome import path read the canonical Recently Deleted projection from the normalized Desktop-to-Chrome bundle, but that normalizer intentionally strips unsupported tombstone-derived fields.
2. The Chrome companion only looked for the canonical projection in the folder-state mirror. If the projection was only present in sync import state, the companion fell back to historical receipt rows.
3. Diagnostics did not expose that fallback clearly: `chromeCompanionRecentlyDeletedCount:13` with canonical count `0` produced empty `extraChromeRows` and `staleReceiptRowCount:0`.

6B.5b fixes those runtime gaps:

- Chrome import now reads `desktopCanonicalRecentlyDeleted` from the raw `latest.json` payload before falling back to the normalized bundle.
- Chrome companion state reads canonical Recently Deleted from both the folder-state mirror and the sync import state.
- Diagnostics now report `desktopCanonicalRecentlyDeletedProjectionPresent` and `desktopCanonicalRecentlyDeletedSource`.
- If canonical Desktop state is absent while Chrome renders old companion rows, diagnostics report those rows as `extraChromeRows` / stale receipt rows instead of appearing internally green.

## Chrome Authority

Chrome no longer presents active restore or permanent-delete authority in the companion.

Chrome shows Desktop-only messaging:

- `Restore is available from Desktop Studio.`
- `Permanent delete is only available from Desktop Studio.`

Chrome does not call restore, purge, permanent delete, tombstone apply, hard delete, chat delete, snapshot delete, or asset delete APIs.

## Diagnostics

Chrome companion diagnostics now expose:

- `desktopCanonicalRecentlyDeletedCount`
- `chromeCanonicalRecentlyDeletedCount`
- `chromeCompanionRecentlyDeletedCount`
- `desktopCanonicalRecentlyDeletedProjectionPresent`
- `desktopCanonicalRecentlyDeletedSource`
- `staleReceiptRowCount`
- `pendingLocalDeleteCount`
- `desktopChromeRecentlyDeletedParityOk`
- `mismatchedFolderIds`
- `extraChromeRows`
- `missingChromeRows`

Expected synced state:

- Desktop Recently Deleted count equals Chrome companion Recently Deleted count.
- `desktopChromeRecentlyDeletedParityOk:true`
- `extraChromeRows:[]`
- `missingChromeRows:[]`
- stale historical receipt rows are not rendered as active Recently Deleted rows.

## Safety Invariants

- no Chrome restore authority
- no Chrome permanent delete
- no Chrome purge authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay work

## Validation

Static validation passed:

- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"`
- `node --check tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4e-chrome-receipt-import.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4d-chrome-export-gate.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4c-chrome-request-export.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b4-chrome-to-desktop-soft-delete.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b3a-companion-state.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b3-chrome-recently-deleted-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b2-chrome-delete-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b1-chrome-soft-delete-ui.mjs`
- `git diff --check`
- `git diff --cached --check`

## Runtime Proof Status

6B.5b runtime proof passed after rebuilding Studio Launcher assets with `npm run dev:all`.

Commands/results:

1. Desktop queue health:
   - `ok:true`
   - `status:"healthy"`
   - `queueBlockers:[]`

2. Chrome health:
   - `ok:true`
   - `status:"healthy"`
   - `connected:true`
   - `permission:"granted"`
   - `noFolderHandle:false`
   - `chromeWritesSyncFolder:true`
   - `blockers:[]`

3. Desktop export:
   - `ok:true`
   - `status:"latest-sync-bundle-written"`
   - `direction:"desktop-to-chrome"`
   - `transport:"latest.json"`
   - `bytes:556690`
   - `blockers:[]`
   - `warnings:[]`

4. `latest.json` inspection:
   - `summary.desktopCanonicalRecentlyDeletedCount:3`
   - `desktopCanonicalRecentlyDeleted.count:3`
   - `desktopCanonicalRecentlyDeletedFolders.length:3`
   - active folder tombstones: `3`

5. Chrome import:
   - `ok:true`
   - `status:"sync-folder-imported"`
   - `direction:"desktop-to-chrome"`
   - `blockers:[]`
   - warnings were deferred metadata/tombstone/apply-events warnings only.

6. Chrome Recently Deleted companion diagnostic:
   - `ok:true`
   - `status:"chrome-recently-deleted-companion-diagnosed"`
   - `chromeNormalVisibleFolderCount:5`
   - `desktopCanonicalRecentlyDeletedCount:3`
   - `chromeCanonicalRecentlyDeletedCount:3`
   - `chromeCompanionRecentlyDeletedCount:3`
   - `desktopChromeRecentlyDeletedParityOk:true`
   - `extraChromeRows:[]`
   - `missingChromeRows:[]`
   - `staleReceiptRowCount:10`
   - `pendingLocalDeleteCount:0`
   - `blockers:[]`
   - `warnings:[]`

7. Desktop Recently Deleted list:
   - `ok:true`
   - `status:"recently-deleted-folders-listed"`
   - `activeTombstoneCount:3`
   - `folderTombstoneCount:3`
   - `activeRetentionCount:3`
   - `restoredTombstoneCount:0`
   - `purgeBlockedCount:3`
   - `hardDeleteBlockedCount:3`
   - `blockers:[]`

Runtime verdict:

- Desktop Studio Recently Deleted active count and Chrome Studio Recently Deleted companion count are both `3`.
- The same three active deleted folder IDs appear in Desktop export, Desktop Recently Deleted, and Chrome companion diagnostics.
- Chrome no longer renders the 10 old historical receipt rows as active Recently Deleted; they are diagnostic-only stale receipts.
- Chrome keeps no restore/permanent-delete authority.
- Safety flags remain true: no Chrome purge authority, no Chrome tombstone apply/create, no hard delete, no chat deletion, no snapshot deletion, and no asset deletion.
