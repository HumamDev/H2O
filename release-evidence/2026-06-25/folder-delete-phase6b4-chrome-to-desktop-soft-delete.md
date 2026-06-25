# Phase 6B.4 - Chrome To Desktop Soft Delete Propagation

## Verdict

Phase 6B.4 completes the local Chrome soft-delete bridge at the product-sync layer.

Chrome remains request-only for folder Delete. Desktop auto-applies safe Chrome soft-delete requests after importing `chrome-latest.json`, then exports the Desktop delete receipt for Chrome to import and confirm.

## Root Cause

Phase 6B.1 through 6B.3 made Chrome Delete feel correct locally:

- Chrome normal folder list hides the deleted folder immediately.
- Chrome Recently Deleted companion shows the pending deleted folder.
- Chrome Permanent Delete remains blocked.

The missing bridge was Desktop apply. The Phase 4C request loop intentionally imported Chrome `folderDeleteRequests[]` with:

- `noApply:true`
- `desktopApplyDeferred:true`

That review-deferred model was correct for the earlier smoke proof, but it no longer matched the Phase 6B product UX where Chrome Delete is a normal soft-delete action and Desktop should become canonical without a separate manual review step.

## Chosen Desktop Apply Model

Chosen model: Desktop auto-applies safe Chrome soft-delete requests.

The Desktop auto-apply helper only targets requests present in the current imported `chrome-latest.json` bundle and routes every apply through the existing guarded Desktop API:

- `H2O.Studio.store.tombstoneReviews.applyFolderDeleteRequest`

That API already enforces the Phase 4C safety model:

- request must be a folder soft-delete request
- request must require Desktop apply
- folder must exist on Desktop
- Desktop performs soft delete / tombstone creation
- no hard delete
- no chat deletion
- no snapshot deletion

## Data Flow

Expected flow after Phase 6B.4:

1. Chrome user clicks `Delete`.
2. Chrome creates a request-only `folderDeleteRequest`.
3. Chrome hides the row from the normal list via visible-state-only pending delete overlay.
4. Chrome exports pending `folderDeleteRequests[]` to `chrome-latest.json`.
5. Desktop imports the requests from `chrome-latest.json`.
6. Desktop auto-applies each safe pending request through `applyFolderDeleteRequest`.
7. Desktop creates the canonical folder tombstone / Desktop Recently Deleted row.
8. Desktop exports `folderDeleteReceipts[]` in `latest.json`.
9. Chrome imports the Desktop delete receipt.
10. Chrome Recently Deleted companion can show the deletion as Desktop-confirmed.

## Diagnostics Added

Desktop propagation result and smoke bridge now surface:

- `folderDeleteRequestImport`
- `folderDeleteRequestAutoApply`
- `desktopImportedFolderDeleteRequestCount`
- `desktopAppliedFolderDeleteRequestCount`
- `receiptExportReadyCount`

Chrome companion diagnostics include:

- `chromeRecentlyDeletedCount`
- `pendingDeleteHiddenCount`
- `desktopReceiptHiddenCount`
- `chromeReceiptImportedCount`
- `chromePendingStillWaitingCount`
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`

## Safety Invariants

Preserved:

- Chrome remains request-only
- no Chrome purge authority
- no Chrome permanent delete
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains authoritative for canonical tombstones and Recently Deleted lifecycle

Chrome Permanent Delete remains blocked with:

```text
Permanent delete is only available from Desktop Studio.
```

## Runtime Proof Plan

When Chrome CDP and Desktop queue are available:

1. In Chrome Studio, create folder `chrome desktop delete bridge test`.
2. Click folder menu -> `Delete`.
3. Confirm Chrome normal list hides it and Chrome Recently Deleted shows it pending.
4. Run Chrome export/sync:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"phase6b4-chrome-delete-export"}' --timeout-ms 60000
```

5. Run Desktop import/apply:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"phase6b4-desktop-import-auto-apply"}' --timeout-ms 60000
```

Expected Desktop sync result:

- `ok:true`
- `folderDeleteRequestImport.found >= 1`
- `folderDeleteRequestAutoApply.desktopAppliedFolderDeleteRequestCount >= 1`
- `folderDeleteRequestAutoApply.noHardDelete:true`
- `folderDeleteRequestAutoApply.noChatDelete:true`
- `folderDeleteRequestAutoApply.noSnapshotDelete:true`
- `folderDeleteRequestAutoApply.noAssetDelete:true`

6. Run Desktop export receipt:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase6b4-desktop-delete-receipt-export"}' --timeout-ms 60000
```

7. Run Chrome import receipt:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"phase6b4-chrome-delete-receipt-import"}' --timeout-ms 60000
```

8. Run Chrome companion diagnostic:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChromeRecentlyDeletedCompanion --payload-json '{"probeName":"chrome desktop delete bridge test"}' --timeout-ms 60000
```

Expected Chrome diagnostic:

- `chromeRecentlyDeletedCount` present
- `chromeReceiptImportedCount >= 1` after receipt import
- `chromePendingStillWaitingCount` reduced for the target
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`

## Runtime Status

Live end-to-end runtime proof was not run in this implementation pass. The available current proof for Phase 6B.3a was same-profile manual Chrome Dev proof; previous CDP runs showed profile/endpoint availability can differ from normal Chrome Dev.

This evidence closes the code/validator portion of Phase 6B.4 and records the exact runtime proof commands for the next available live Chrome/Desktop queue session.
