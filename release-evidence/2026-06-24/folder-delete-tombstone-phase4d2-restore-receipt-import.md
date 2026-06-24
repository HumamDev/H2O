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

Runtime attempt:

- The requested Chrome command was attempted against CDP port `9247`.
- Result: `ok:false`, `status:"chrome-cdp-unavailable"`, blocker `chrome-cdp-unavailable`.
- Port scan of `9240..9250` found no reachable CDP endpoint.
- A live proof still requires reopening/reloading Chrome Dev with remote debugging and the rebuilt Studio extension assets.

## Deferred

- Real tombstone propagation.
- Chrome binding restore.
- Retention and purge.
- WebDAV/cloud/relay transport adapters.
