# Desktop To Chrome Folder Color Regression

Date: 2026-06-22

## Bug Summary

Changing a folder color in Desktop Studio could leave Chrome Studio showing the old color after refresh/import. Chrome import was succeeding, but it was reading a stale `~/H2O Studio Sync/latest.json` whose `lastAppliedExportedAt` predated the Desktop color edit.

Observed live symptom:

- Desktop folder `Sport` changed to yellow.
- Chrome imported `latest.json` successfully.
- Chrome still rendered `Sport` as gray.
- Desktop `H2O.Studio.sync.folder.syncNow({ direction: "desktop-to-chrome" })` returned a Chrome-to-Desktop import result instead of writing Desktop `latest.json`.

## Root Cause

Two Desktop export paths were incomplete for folder color changes:

- `H2O.Studio.sync.folder.syncNow` was an import-first Desktop facade. It normalized unsupported directions through a result helper that always reported `direction: "chrome-to-desktop"`, so `direction: "desktop-to-chrome"` did not force a fresh `latest.json` export.
- Desktop auto-export could permanently keep a partial store subscription set if it initialized before every store was registered. Folder metadata writes were refreshed in the UI, but a missed `folders` subscription meant an enabled auto-export did not reliably schedule a fresh export after color edits.

The folder store itself already stamped `updated_at` and emitted subscriber notifications on `patch()`, and the Desktop bundle serializer already included `color`, `iconColor`, and `updatedAt`. The stale Chrome view came from a stale export file, not from Chrome apply/freshness logic.

## Fix Summary

- Added a Desktop-to-Chrome branch to `H2O.Studio.sync.folder.syncNow`.
- `syncNow({ direction: "desktop-to-chrome" })` now invokes `H2O.Studio.ingestion.exportLatestSyncBundle()` and returns a Desktop-to-Chrome `latest.json` export result.
- Made Desktop auto-export subscription wiring retry stores that were unavailable during early initialization instead of treating the first partial wire as final.
- Added a folder actions hook so successful Desktop folder create/rename/update operations nudge `autoExport.schedule(...)` when Desktop auto-export is enabled.
- Added Desktop-to-Chrome validator coverage for the export branch, retryable auto-export wiring, and folder metadata update scheduling.

## Files Changed

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/auto-export.tauri.js`
- `src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js`
- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `release-evidence/2026-06-22/desktop-to-chrome-folder-color-regression.md`

## Validation

Passed:

- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check src-surfaces-base/studio/sync/auto-export.tauri.js`
- `node --check "src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js"`
- `node --check tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `node tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `node tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `node tools/validation/sync/validate-f19-sync-hardening.mjs`

Final diff hygiene:

- `git diff --check`
- `git diff --cached --check`

## Manual Runtime Retest

1. Rebuild/reload runtime assets as needed:

   ```js
   // Desktop console
   H2O.Studio.folderOperatorMode.setEnabled(false);
   ```

2. In Desktop Studio, change folder `Sport` to a visible test color, for example yellow.

3. Confirm Desktop has the new color locally:

   ```js
   await H2O.Library.FolderParity.diagnoseSidebar?.();
   ```

   Expected: `Sport` is in the display/render model with the new color.

4. Force a fresh Desktop-to-Chrome export:

   ```js
   await H2O.Studio.sync.folder.syncNow({
     direction: "desktop-to-chrome",
     reason: "desktop-folder-color-regression-proof"
   });
   ```

   Expected:

   - `ok:true`
   - `direction:"desktop-to-chrome"`
   - `transport:"latest.json"`
   - `status:"latest-sync-bundle-written"`
   - `bytes > 0`
   - `exportedAt` newer than the color edit

5. In Chrome Studio, import the fresh Desktop export:

   ```js
   const importResult = await H2O.Studio.sync.folder.importLatestBundle({
     reason: "desktop-folder-color-regression-proof",
     conflictDecision: "approve-merge"
   });
   const folderParity = await H2O.Library.FolderParity.diagnoseSidebar?.();
   ({ importResult, folderParity });
   ```

   Expected:

   - import succeeds with `ok:true`
   - `lastAppliedExportedAt` matches the fresh Desktop export
   - `Sport` renders with the new Desktop color in Chrome
   - `folderMetadataFreshness.skippedStale === 0` for the updated folder row

6. If Desktop auto-export is enabled, repeat a color edit without manual `syncNow` and wait for the debounce window.

   Expected:

   - `H2O.Studio.sync.autoExport.diagnose()` shows a recent folder metadata schedule/export.
   - Chrome imports a fresh `latest.json` with the new color.

## Remaining Limitations

- This note does not cover peer-watermarks, retention, destructive compaction, real-user purge, signing, notarization, public release packaging, billing, identity UI, onboarding, or unrelated Desktop UI.
- Live Chrome/Desktop runtime proof still requires reloading rebuilt assets and manually running the retest steps above.
- Existing unrelated main-worktree WIP was left untouched.
