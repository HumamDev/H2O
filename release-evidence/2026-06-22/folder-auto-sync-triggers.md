# Folder Auto Sync Triggers

Date: 2026-06-22

## Bug Summary

Phase 1 and Phase 2 fixed local folder color correctness on Desktop and Chrome, but cross-platform propagation still required console/manual sync calls. Desktop folder mutations could persist and render locally without writing a fresh `latest.json`, and Chrome folder mutations could persist/render locally without writing `chrome-latest.json`. Diagnostics exposed export API presence but did not show authoritative last export/import state.

## Root Cause

- Desktop post-mutation hooks already called `H2O.Studio.sync.autoExport.schedule("folder-metadata:*")`, but `auto-export.tauri.js` returned `auto-export-disabled` unless the broad store-subscription auto-export flag was explicitly enabled.
- Chrome `folder-import.mv3.js` exposed `exportChromeToSyncFolder`, but had no debounced folder-mutation scheduler and did not persist last export status/bytes/error into folder sync diagnostics.
- Chrome `auto-import.mv3.js` required the legacy broad `sync.chromeAutoImport` flag for all exports, including confirmed folder mutations, and automatic paths could fall through to generic failures instead of `permission-required`.
- Desktop `folder-sync.tauri.js` had a watcher that queued stable candidates in `notify` mode, but `mode: "auto"` did not actually import stable `chrome-latest.json`.

## Files Changed

- `src-surfaces-base/studio/sync/auto-export.tauri.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js`
- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`

## Implementation Notes

- Desktop folder create/rename/color now use a narrow folder-mutation auto-export lane even when broad data-change auto-export remains disabled. The lane is keyed by `folder-metadata:*`, debounced, and visible in `desktopToChrome` diagnostics.
- Chrome confirmed folder create/rename/color results now schedule a debounced Chrome-to-Desktop export through `H2O.Studio.sync.folder.scheduleChromeToDesktopExport`.
- Chrome automatic folder exports bypass only the legacy broad export flag. They still require an existing connected folder handle and existing read/write permission. Missing handle or write grant reports `permission-required` and does not pretend a file was written.
- Chrome folder sync diagnostics now expose `lastExportStatus`, `lastExportedAt`, `lastExportBytes`, blockers, pending/in-flight state, and `chromeToDesktop` / `desktopToChrome` direction objects.
- Desktop folder sync defaults to `~/H2O Studio Sync` in `mode: "auto"` and the watcher now imports stable `chrome-latest.json` through the guarded Chrome-to-Desktop importer.
- Delete propagation remains deferred; no hard destructive delete/tombstone lifecycle was added.

## Validation

Passed:

- `node --check src-surfaces-base/studio/sync/auto-export.tauri.js`
- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check "src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js"`
- `node --check tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `node --check tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `node tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `node tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`
- `node tools/validation/studio/validate-studio-library-organization-ui.mjs`
- `node tools/validation/sync/validate-f19-shell-row-ux.mjs`
- `git diff --check`
- `git diff --cached --check`

Known residual validator limitation:

- `node tools/validation/studio/validate-studio-import-bundle.mjs` still fails in the Chrome autoImport round-trip group because that sandbox does not provide the live `LibraryIndex` coverage source required by the Chrome exporter, producing `chrome-export-source-coverage-unavailable`. The Desktop folder action and organization sections in the same validator passed.

## Manual Runtime Retest Matrix

1. Rebuild/reload assets:
   - `npm run dev:all`
   - `node apps/studio/desktop/build-tools/prepare-dist.mjs`
2. Desktop color change -> wait -> Chrome updates after auto-import.
3. Chrome color change -> wait -> Desktop updates after auto-import.
4. Desktop create folder -> wait -> Chrome shows folder.
5. Chrome create folder -> wait -> Desktop shows folder.
6. Desktop rename folder -> wait -> Chrome shows rename.
7. Chrome rename folder -> wait -> Desktop shows rename.
8. Confirm no infinite export/import loop:
   - Desktop diagnostics show debounced `desktopToChrome.lastExportedAt` changes once per burst.
   - Chrome diagnostics show debounced `chromeToDesktop.lastExportedAt` changes once per burst.
   - Re-imports report idempotent/already-applied status rather than repeated writes.
9. Confirm diagnostics show last export/import timestamps:
   - Desktop: `H2O.Studio.sync.autoExport.diagnose().desktopToChrome`
   - Desktop: `H2O.Studio.sync.folder.diagnose().desktopAutoImport`
   - Chrome: `H2O.Studio.sync.folder.diagnose().chromeToDesktop`
   - Chrome: `H2O.Studio.sync.folder.diagnose().chromeAutoImport`
10. Confirm Chrome permission-required state is clear if folder handle/write grant is missing:
   - Change a folder color in Chrome without a connected sync folder or read/write grant.
   - Expected diagnostic status: `permission-required`.
   - Expected write marker: `chromeWritesSyncFolder:false`.

## Remaining Limitations

- Phase 4 delete/tombstone lifecycle remains deferred. This change does not propagate hard folder deletes.
- Chrome automatic export cannot acquire File System Access write permission without a user gesture. It reports `permission-required` until the connected folder handle has read/write permission.
- The existing broad Studio import-bundle validator has an unrelated Chrome export coverage fixture gap noted above.
