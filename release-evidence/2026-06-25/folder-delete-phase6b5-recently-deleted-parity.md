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

Runtime proof is pending a fresh Studio Launcher rebuild/reload. The current worktree has unrelated dirty generated/runtime files including `src-surfaces-base/studio/studio.js`, `studio.css`, and `studio.html`, so this scoped phase did not rebuild generated assets or reload Chrome runtime assets to avoid mixing unrelated WIP.

No runtime product behavior was changed outside the source files listed by this phase. The expected runtime proof target remains:

Runtime proof should run after rebuilding/loading fresh Studio assets:

1. Desktop exports `latest.json` with `desktopCanonicalRecentlyDeletedFolders[]`.
2. Chrome imports Desktop `latest.json`.
3. Chrome companion reports:
   - `desktopCanonicalRecentlyDeletedCount` equal to Desktop Recently Deleted active count
   - `chromeCompanionRecentlyDeletedCount` equal to Desktop Recently Deleted active count
   - `desktopChromeRecentlyDeletedParityOk:true`
   - `extraChromeRows:[]`
   - `missingChromeRows:[]`
4. Chrome Recently Deleted no longer counts historical receipt rows as active Recently Deleted.
5. Chrome shows restore/permanent delete as Desktop-only.
6. Safety flags remain true.
