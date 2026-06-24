# Recently Deleted Folder UI Polish

Date: 2026-06-24

## Scope

Desktop Studio now exposes an operator-facing Recently Deleted folder panel in the Folders sidebar. The panel is diagnostic-first and stays inside the already proven local delete/restore lifecycle boundaries.

Out of scope:

- purge
- hard delete
- WebDAV/cloud/relay
- Chrome behavior changes
- chat deletion
- snapshot deletion
- delete/restore lifecycle behavior changes

## Files Changed

- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-polish.md`

## UI Behavior

The Desktop-only panel appears below the Folders sidebar list when the existing Recently Deleted diagnostics API is available.

It renders aggregate diagnostics:

- `activeRetentionCount`
- `expiredRetentionCount`
- `restoredRetentionCount`
- `purgeEligibleCount`
- `purgeBlockedCount`
- `retentionDays`
- `retentionEnforcement`

It renders folder tombstone rows with:

- `folderName`
- `folderId`
- `deletedAt`
- `restoreStatus`
- `restoreAvailable`
- `affectedChatCount`
- `retentionCountdownStatus`
- `retentionExpiresAt`
- `retentionEnforcement`
- `purgeBlocked`
- `hardDeleteBlocked`

Clear operator labels are shown:

- Purge deferred
- Hard delete blocked
- Retention enforcement deferred

## Restore Action

Restore is enabled only when:

- the Desktop safe restore API already exists, and
- the tombstone row reports `restoreAvailable:true`.

The action requires explicit operator confirmation and calls the existing `restoreTombstonedFolder`/`restoreFolder` path. After restore, the panel refreshes the folder sidebar in place.

No purge or hard-delete control is rendered.

## Safety Guarantees

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- no raw SQL
- no purge button
- no hard delete button
- no Chrome-side lifecycle behavior change

## Validation

- `npm run dev:all` passed. Existing optional loader-order warning remained: optional dependency phase drift for `7A1a._Prompt_Manager_.js`.
- `node apps/studio/desktop/build-tools/prepare-dist.mjs` passed and copied 282 files into `apps/studio/desktop/dist/`.
- `node --check src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js` passed.
- `node --check tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs` passed.
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs` passed.
- `node tools/validation/sync/validate-folder-retention-phase4e.mjs` passed.
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs` passed.
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs` passed.
- `node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs` passed.
- `rg -n "Recently Deleted|data-h2o-recently-deleted-folders|Purge deferred|Hard delete blocked" apps/studio/desktop/dist apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio -g '*.js' -g '*.html'` confirmed the panel strings are present in prepared Desktop dist and Studio Launcher assets.
- `git diff --check` passed.
- `git diff --cached --check` passed before staging.

## Runtime Proof

Desktop runtime attempt:

- Debug Desktop app launched from `apps/studio/desktop/src-tauri/target/debug/h2o-studio-desktop`.
- The required Desktop smoke queue runtime command could not be completed in this environment because writing `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json` is outside the repo sandbox. The escalation request was rejected by the environment usage limit, so no live queue result is recorded in this evidence file.

Expected Desktop Studio runtime check after relaunch:

- Recently Deleted panel renders under the Folders sidebar.
- Existing tombstone rows appear from `listRecentlyDeletedFolders`.
- Aggregate retention/purge safety fields are visible.
- Restore remains gated to `restoreAvailable:true`.
- No purge or hard-delete action is available.
