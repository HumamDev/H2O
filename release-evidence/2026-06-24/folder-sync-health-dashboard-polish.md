# Folder Sync Health Dashboard Polish

Date: 2026-06-24

## Scope

Desktop Studio Settings now includes a read-only Folder Sync Health dashboard inside the existing Local Sync settings card.

This phase is UI/diagnostic polish only.

Out of scope:

- sync behavior changes
- purge
- hard delete
- WebDAV/cloud/relay implementation
- Chrome behavior changes
- chat deletion
- snapshot deletion
- broad refactor

## Design Note

The dashboard reuses the existing Settings refresh path. It does not introduce polling, forced refresh loops, or new actions.

Data sources are read-only:

- `H2O.Studio.sync.folder.diagnoseHealth()`
- `H2O.Studio.store.folders.listRecentlyDeletedFolders()`

The Chrome fallback explicitly reports that the dashboard is Desktop-only and that Chrome remains visible-state-only for delete/restore receipts.

## Implemented UI

The dashboard shows:

- local folder create/rename/color sync status
- delete/restore lifecycle status
- Desktop authoritative delete/restore status
- Chrome visible-state-only receipt status
- Recently Deleted diagnostics availability
- `retentionEnforcement:"deferred"`
- `retentionDays:30`
- `purgeEligibleCount:0`
- `purgeBlockedCount`
- `hardDeleteBlockedCount`

Safety invariant badges:

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noTombstoneApplyOnChrome:true`

Deferred items:

- purge design deferred
- WebDAV/cloud/relay deferred
- full chat-folder binding sync deferred
- cross-device retention ledger deferred

Health state labels use the existing Settings status badge system:

- healthy
- warning
- blocked
- deferred

## Files Changed

- `src-surfaces-base/studio/studio.js`
- `tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs`
- `release-evidence/2026-06-24/folder-sync-health-dashboard-polish.md`

## Safety Guarantees

- no purge action added
- no hard-delete action added
- no WebDAV/cloud/relay action added
- no Chrome lifecycle behavior changed
- no chat/snapshot deletion path added
- dashboard refresh is targeted through the existing Settings refresh action

## Validation

Passed:

- `npm run dev:all`
- `node apps/studio/desktop/build-tools/prepare-dist.mjs`
- `node --check src-surfaces-base/studio/studio.js`
- `node --check tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs`
- `node tools/validation/sync/validate-folder-sync-health-dashboard-polish.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `node tools/validation/sync/validate-folder-retention-phase4e.mjs`
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs`

`npm run dev:all` retained the existing optional loader-order warning for `7A1a._Prompt_Manager_.js`.

Prepared asset proof:

- `apps/studio/desktop/dist/studio.js` contains `wbSettingsFolderSyncHealthDashboard`, `Folder Sync Health`, `noTombstoneApplyOnChrome`, and `purge design deferred`.
- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/studio.js` contains the same dashboard markers.

Diff validation:

- `git diff --check`
- `git diff --cached --check`

## Runtime / Manual Proof

Manual Desktop Studio visual proof remains the next operator QA step:

- Folder Sync Health dashboard renders in Settings > Local Sync.
- create/rename/color sync status appears.
- delete/restore lifecycle status appears.
- retention deferred policy appears.
- purge and hard-delete blocked state appears.
- no purge, hard-delete, or WebDAV action is shown.
- no flicker, full-page shake, or forced refresh loop observed.

This evidence records implementation, static validation, and prepared-asset verification. Runtime visual QA should be performed in the Desktop app before any further UI polish decisions.
