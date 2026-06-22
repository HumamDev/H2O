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

## Phase 3 Repair

### Live Failure Summary

Runtime testing after `02a1e7a` showed automatic folder sync was still not release-grade:

- Desktop color -> Chrome failed because Desktop local folder color mutation did not update `autoExport.lastChange`, `lastScheduledAt`, or `lastExportStatus`.
- Chrome color -> Desktop failed on the Desktop side because `chrome-latest.json` auto-import was effectively disabled by persisted `mode: "manual"` watcher config.
- Chrome could see a newer Desktop `latest.json`, but Desktop -> Chrome auto-import blocked on `library-propagation-simultaneous-update-conflict` without distinguishing safe folder metadata field updates from true same-field conflicts.

### Repair Root Cause

- The Desktop sidebar path calls `OrganizationModals.openFolderEditor()`, which routes through folder actions, but the auto-export proof relied too much on broad store subscribers and lower action hooks. The user-visible sidebar mutation path needed its own explicit post-success schedule call, and `auto-export.tauri.js` needed to treat `folder-metadata:*` schedules as real `lastChange` events.
- `folder-sync.tauri.js` had a new default `mode: "auto"`, but existing persisted `mode: "manual"` config won at runtime. A legacy manual config from pre-Phase-3 disabled the watcher unless the user manually changed settings.
- Chrome Desktop-import conflict policy was transport-level only. A mismatched `previousExportId` blocked before checking whether the incoming update was a safe folder metadata field merge.

### Repair Files Changed

- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js`
- `src-surfaces-base/studio/sync/auto-export.tauri.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `release-evidence/2026-06-22/folder-auto-sync-triggers.md`

### Repair Implementation Notes

- Desktop sidebar create/rename/color now explicitly schedules `H2O.Studio.sync.autoExport.schedule("folder-metadata:desktop-sidebar-*")` after a confirmed `OrganizationModals.openFolderEditor()` success.
- Desktop metadata bridge apply paths also schedule Desktop -> Chrome export after confirmed rename/color writes.
- `auto-export.tauri.js` records explicit `folder-metadata:*` schedules as `lastChange` with source `folder-metadata-operation`, and exposes `lastExportError`.
- Desktop auto-import config now has `PHASE3_AUTO_IMPORT_CONFIG_VERSION`. Legacy persisted `mode: "manual"` configs without that marker migrate to effective `mode: "auto"` with the default `H2O Studio Sync` folder. Explicit future `manual` or `off` choices keep the marker and are not repeatedly migrated.
- Desktop diagnostics now expose effective auto-import state, watcher mode/running state, and Chrome export import status/timestamps.
- Chrome Desktop-import now analyzes folder metadata rows when auto-sync hits a simultaneous transport conflict. Safe create/name/color folder metadata field updates are auto-approved through the existing approved-merge path. Same-field newer local folder metadata remains blocked as `conflict-approval-required`.
- Chrome diagnostics now expose `simultaneousConflictStatus`, `simultaneousConflictDecision`, `simultaneousConflictReason`, and blocker booleans for permission, disabled auto-import, missing folder handle, scheduler-not-fired, and simultaneous conflict.

### Repair Validation

Passed:

- `node --check src-surfaces-base/studio/sync/auto-export.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check "src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js"`
- `node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"`
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

### Repair Manual Runtime Retest Matrix

1. Rebuild/reload assets:
   - `npm run dev:all`
   - `node apps/studio/desktop/build-tools/prepare-dist.mjs`
2. Desktop color change -> wait 10-30s -> Chrome updates without console sync commands.
3. Chrome color change -> wait 10-30s -> Desktop updates without console sync commands.
4. Check Desktop diagnostic shows last auto export status/timestamp after Desktop mutation:
   - `H2O.Studio.sync.autoExport.diagnose().desktopToChrome`
5. Check Chrome diagnostic shows last auto import status/timestamp after Desktop mutation:
   - `H2O.Studio.sync.folder.diagnose().desktopToChrome`
   - Expected conflict-safe case: `simultaneousConflictStatus` is empty or `auto-approved-folder-metadata`.
6. Check Chrome diagnostic shows last auto export status/timestamp after Chrome mutation:
   - `H2O.Studio.sync.folder.diagnose().chromeToDesktop`
7. Check Desktop diagnostic shows last auto import status/timestamp after Chrome mutation:
   - `H2O.Studio.sync.folder.diagnose().desktopAutoImport`
8. Desktop create folder -> wait 10-30s -> Chrome shows folder.
9. Chrome create folder -> wait 10-30s -> Desktop shows folder.
10. Desktop rename folder -> wait 10-30s -> Chrome shows rename.
11. Chrome rename folder -> wait 10-30s -> Desktop shows rename.
12. Confirm no repeated export/import loop:
    - Desktop `lastScheduledAt` and `lastExportedAt` advance once per local mutation burst.
    - Chrome `chromeToDesktop.lastExportedAt` advances once per local mutation burst.
    - Re-imports report idempotent/already-applied status instead of repeated writes.
13. Confirm a true simultaneous same-field conflict reports `conflict-approval-required`, not silent failure.
14. Confirm Chrome permission-required state is clear if folder handle/write grant is missing:
    - Expected diagnostic status: `permission-required`.
    - Expected marker: `chromeWritesSyncFolder:false`.

### Repair Remaining Limitations

- Live manual runtime retest still needs to be run after rebuilding/reloading assets.
- Delete/tombstone lifecycle remains deferred to Phase 4. This repair does not propagate destructive folder deletes.
- Chrome automatic export still cannot request File System Access permission without a user gesture; it reports permission-required until a connected folder handle has read/write permission.
