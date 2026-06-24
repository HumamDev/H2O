# Phase 4D.2 - Chrome Folder Restore Receipt Import

## Purpose

Phase 4D.2 imports Desktop status-only folder restore receipts on Chrome and re-shows matching folders in the Chrome visible folder mirror. This completes the local restore receipt direction needed after Desktop restores a tombstoned folder.

## Design Summary

- Chrome reads top-level `folderRestoreReceipts[]` from Desktop `latest.json`.
- Each receipt is validated before any mirror update.
- Chrome re-shows only visible-state mirror rows that were previously hidden by a Desktop delete receipt marker.
- Chrome does not apply tombstones, create tombstones, restore bindings, or mutate chats/snapshots.
- Repeated import is idempotent: already visible folders count as `alreadyVisibleCount`.

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d2-restore-receipt-import.md`

## Receipt Validation

Chrome accepts only receipts with:

- `schema: "h2o.studio.folder-restore-receipt.v1"`
- `status: "restored"`
- `decision: "desktop-folder-restored"`
- `statusOnly: true`
- `noTombstoneApply: true`
- `noHardDelete: true`
- `noChatDelete: true`
- `folderId` present

Malformed receipts are skipped with warnings. Missing hidden mirror markers are skipped with warnings; Chrome does not create new folders from restore receipts unless a prior hidden marker exists.

## Re-show Semantics

If the folder is already visible, Chrome reports `alreadyVisibleCount` and performs no write.

If the folder is hidden by a prior Desktop delete receipt marker, Chrome:

- builds a visible mirror row for the same `folderId`
- uses `folderName` from the receipt when available
- preserves color only if supplied by the receipt or prior marker
- clears the hidden marker for that folder
- records a `restoredByDesktopReceipt` marker

This is a local visible-state mirror update only.

## Diagnostics

The import result exposes:

- `attempted`
- `found`
- `receiptCount`
- `reShownCount`
- `alreadyVisibleCount`
- `skippedCount`
- `malformedCount`
- `blockerCount`
- `warningCount`
- `visibleStateOnlyReShow: true`
- `noTombstoneApply: true`
- `noTombstoneCreate: true`
- `noHardDelete: true`
- `noChatDelete: true`
- `noBindingMutation: true`
- `noChatMutation: true`
- `noSnapshotMutation: true`
- `tombstonePropagation: "deferred"`

## Diagnostics Surfacing Fix

Runtime proof after the initial 4D.2 implementation showed `syncNow({ direction:"desktop-to-chrome" })` succeeding but omitting `folderRestoreReceiptImport` from the Chrome smoke result and health diagnostics. The root cause was diagnostic routing, not restore receipt logic:

- Normal Desktop-to-Chrome import processed restore receipts, but the duplicate/idempotent import branch replayed delete receipt diagnostics only.
- The smoke registry `syncNow` wrapper surfaced `folderDeleteReceiptImport` but did not include `folderRestoreReceiptImport`.
- Chrome health diagnostics did not expose `state.lastFolderRestoreReceiptImport` at the top level or under `desktopToChrome`.

The fix keeps behavior status-only and non-destructive:

- Duplicate/idempotent imports now call `importFolderRestoreReceiptsFromDesktopBundle(bundle)` and return `folderRestoreReceiptImport` in the propagation result.
- Chrome health diagnostics expose `folderRestoreReceiptImport` / `lastFolderRestoreReceiptImport`.
- The dev smoke registry returns `folderRestoreReceiptImport` from `syncNow` and `diagnoseHealth`.
- The Phase 4D validator now asserts the duplicate replay and smoke diagnostic paths.

## Safety Guarantees

- No Chrome tombstone apply.
- No Chrome tombstone create.
- No hard delete or purge.
- No folder destructive mutation.
- No chat mutation or deletion.
- No binding restore on Chrome.
- No snapshot mutation or deletion.
- No WebDAV/cloud/relay behavior.

## Validation

Commands:

```bash
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs
node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs
git diff --check
git diff --cached --check
```

Results:

- `npm run dev:all` passed.
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js` passed.
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` passed.
- `node --check tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs` passed.
- `node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs` passed.
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs` passed.
- `git diff --check` passed.
- `git diff --cached --check` passed.

## Runtime Proof Command

Use an existing Desktop `latest.json` containing `folderRestoreReceipts[]`:

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op syncNow \
  --allow-mutation \
  --payload-json '{"direction":"desktop-to-chrome","reason":"phase4d2-restore-receipt-import"}' \
  --timeout-ms 30000
```

Expected import result:

- `folderRestoreReceiptImport.attempted === true`
- `folderRestoreReceiptImport.receiptCount >= 1`
- `folderRestoreReceiptImport.blockers` / `blockerCount` empty
- `folderRestoreReceiptImport.noTombstoneApply === true`
- `folderRestoreReceiptImport.noHardDelete === true`
- `folderRestoreReceiptImport.noChatDelete === true`
- `folderRestoreReceiptImport.visibleStateOnlyReShow === true`

Runtime proof:

- `npm run dev:all` rebuilt the Studio Launcher extension.
- The first attach attempt against port `9247` was blocked by sandboxed localhost CDP access and returned `chrome-cdp-unavailable`.
- After rerunning the helper with local CDP access and reloading the Studio target so the rebuilt scripts were active, the import proof passed.

Command:

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op syncNow \
  --allow-mutation \
  --payload-json '{"direction":"desktop-to-chrome","reason":"phase4d2-restore-receipt-import"}' \
  --timeout-ms 30000
```

Result summary:

- top-level `ok:true`
- top-level `status:"sync-folder-imported"`
- top-level/result `blockers:[]`
- Chrome target connected to `/Users/hobayda/H2O Studio Sync`
- `folderRestoreReceiptImport.schema:"h2o.studio.folder-restore-receipt.v1.chrome-import"`
- `folderRestoreReceiptImport.phase:"phase4d.2"`
- `folderRestoreReceiptImport.attempted:true`
- `folderRestoreReceiptImport.ok:true`
- `folderRestoreReceiptImport.found:5`
- `folderRestoreReceiptImport.receiptCount:5`
- `folderRestoreReceiptImport.reShownCount:0`
- `folderRestoreReceiptImport.alreadyVisibleCount:3`
- `folderRestoreReceiptImport.skippedCount:2`
- `folderRestoreReceiptImport.malformedCount:0`
- `folderRestoreReceiptImport.blockerCount:0`
- `folderRestoreReceiptImport.warningCount:1`
- `folderRestoreReceiptImport.visibleStateOnlyReShow:true`
- `folderRestoreReceiptImport.noTombstoneApply:true`
- `folderRestoreReceiptImport.noTombstoneCreate:true`
- `folderRestoreReceiptImport.noHardDelete:true`
- `folderRestoreReceiptImport.noChatDelete:true`
- `folderRestoreReceiptImport.noBindingMutation:true`
- `folderRestoreReceiptImport.noChatMutation:true`
- `folderRestoreReceiptImport.noSnapshotMutation:true`
- `folderRestoreReceiptImport.tombstonePropagation:"deferred"`
- warning was `folder-restore-receipt-hidden-row-missing` for two receipts without matching hidden Chrome rows; this is non-blocking because Chrome must not create folders from restore receipts in 4D.2.

## Deferred

- Real tombstone propagation.
- Chrome binding restore.
- Retention and purge.
- WebDAV/cloud/relay transport adapters.
