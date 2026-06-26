# Phase 6B.6 — Chrome purge resurrection parity

## Scope

Phase 6B.6 removes the Chrome sidebar Recently Deleted row and prevents Chrome Studio from rehydrating permanently deleted folder rows from older local receipt or pending-delete state after Desktop purge.

Desktop remains the authority for restore and permanent delete. Chrome remains a read-only companion for Recently Deleted status.

Chrome reload must not resurrect purged rows once Desktop has exported purge suppression.

## Root Cause

Phase 6B.5 made Chrome render Desktop canonical active Recently Deleted rows, but Desktop permanent delete/purge removes active tombstones and permanently suppresses the underlying folder rows. The Desktop export did not include that purge suppression projection, so Chrome could still reload older local receipt or pending-delete rows for folders Desktop had already purged.

The observed resurfaced rows were older Chrome-origin entries:

- `fold_chrome_chrome-companion-final_mqtejp72_2ea65b5de3`
- `fold_chrome_chrome-delete-ux-test_mqtczouz_9c0337cca0`

## Fix

- Desktop `latest.json` now exports a safe Desktop purge suppression projection:
  - `desktopPurgedFolderSuppression`
  - `desktopPurgedFolderSuppressions`
  - `desktopPurgedFolderSuppressionCount`
- The projection contains folder IDs and minimal status metadata for rows marked `phase6aPermanentlyPurged`.
- Chrome imports and persists that suppression snapshot.
- Chrome import clears matching local `hiddenByDesktopReceipt`, `hiddenByChromePendingDelete`, cached folder rows, folder items, and stale canonical Recently Deleted rows.
- Chrome Recently Deleted companion filters any remaining local receipt/pending rows against the Desktop purge suppression set.
- Chrome diagnostics now expose:
  - `desktopPurgedFolderSuppressionCount`
  - `purgedSuppressedFolderIds`
  - `resurrectedAfterPurgeCount`
  - `staleReceiptRowCount`
  - `stalePendingDeleteRowCount`
  - `extraChromeRows`
  - `missingChromeRows`
  - `desktopChromeRecentlyDeletedParityOk`
- Chrome sidebar no longer renders the `Recently Deleted · N` row. Recently Deleted remains only in the main Folders page panel.
- The Chrome `Recently Deleted sidebar row` is intentionally removed.

## Safety Invariants

- no Chrome purge authority
- no Chrome permanent delete authority
- no Chrome restore authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay change

## Validation

Validation run:

- `npm run dev:all` passed.
- `node apps/studio/desktop/build-tools/prepare-dist.mjs` passed.
- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js` passed.
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js` passed.
- `node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"` passed.
- `node --check tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs` passed.
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs` passed.
- Existing Phase 6B validators passed:
  - `validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
  - `validate-folder-delete-phase6b4e-chrome-receipt-import.mjs`
  - `validate-folder-delete-phase6b4d-chrome-export-gate.mjs`
  - `validate-folder-delete-phase6b4c-chrome-request-export.mjs`
  - `validate-folder-delete-phase6b4-chrome-to-desktop-soft-delete.mjs`
  - `validate-folder-delete-phase6b3a-companion-state.mjs`
  - `validate-folder-delete-phase6b3-chrome-recently-deleted-ux.mjs`
  - `validate-folder-delete-phase6b2-chrome-delete-ux.mjs`
  - `validate-folder-delete-phase6b1-chrome-soft-delete-ui.mjs`

## Runtime Proof

Runtime proof attempted:

1. Start from Desktop and Chrome synced.
2. Permanently delete active Recently Deleted rows from Desktop.
3. Export Desktop-to-Chrome.
4. Import in Chrome.
5. Reload Chrome Studio.
6. Confirm:
   - Chrome Recently Deleted count matches Desktop.
   - purged rows do not return.
   - sidebar has no Recently Deleted row.
   - `resurrectedAfterPurgeCount:0`
   - `extraChromeRows:[]`
   - `missingChromeRows:[]`
   - `desktopChromeRecentlyDeletedParityOk:true`
   - safety flags remain true.

Runtime result:

- Chrome CDP health passed on port `9247`.
- Chrome sync folder state was healthy:
  - `connected:true`
  - `permission:"granted"`
  - `noFolderHandle:false`
  - `chromeWritesSyncFolder:true`
  - `blockers:[]`
- Desktop queue recovery attempted:
  - cleared stale `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`
  - launched packaged Desktop app
  - retried `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000`
- Desktop queue remained blocked:
  - `ok:false`
  - `status:"desktop-queue-timeout"`
  - `blockers:["desktop-queue-timeout"]`

Fresh Desktop-to-Chrome export/import/reload proof could not be completed in this run because the Desktop WebView did not process the smoke queue. This is an operator/runtime gate-state blocker. Product code changes are static-validated and scoped, and Chrome CDP access was healthy.
