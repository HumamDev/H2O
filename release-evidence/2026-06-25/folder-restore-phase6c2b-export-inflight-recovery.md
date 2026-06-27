# Phase 6C.2b - Chrome restore export in-flight recovery

## Verdict

Phase 6C.2b fixes a Chrome export reliability blocker where `syncNow({ direction:"chrome-to-desktop" })` could report `chrome-to-desktop-export-in-flight` even though persisted folder-sync state showed no in-flight export.

## Root Cause

Chrome folder sync has two export layers:

- `folder-import.mv3.js` facade state for sync folder scheduling.
- `auto-import.mv3.js` exporter state for the actual `chrome-latest.json` write.

The runtime blocker was consistent with the underlying exporter module retaining an in-memory `state.inFlight` lock while the facade/persisted state had already cleared `chromeExportInFlight:false`. That caused `syncNow` to return `chrome-to-desktop-export-in-flight` without enough lock diagnostics and blocked Phase 6C.2/6C.3 restore runtime proof.

## Implemented Recovery

- Added timestamped exporter in-flight state:
  - `inFlightStartedAt`
  - `inFlightReason`
  - `inFlightOwner`
- Added stale-lock recovery in `auto-import.mv3.js`:
  - locks older than `CHROME_EXPORT_IN_FLIGHT_STALE_MS` are cleared before blocking a new export.
  - actual overlapping exports remain blocked.
  - `finally` clears the in-memory lock after success, failure, or throw.
- Added matching facade lock diagnostics/recovery in `folder-import.mv3.js`.
- Export failures now return explicit blockers instead of relying on wrapper inference.
- Smoke bridge now surfaces:
  - `chromeExportInFlightPersisted`
  - `chromeExportInFlightMemory`
  - `chromeExportInFlightAgeMs`
  - `chromeExportInFlightStaleMs`
  - `chromeExportStaleLockCleared`
  - `chromeExportLockOwner`
  - `chromeExportLockReason`
- Restore request export remains included in `chrome-latest.json`.

## Expected Runtime Result

For the current pending restore request:

- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `requestId:"folder-restore-request:9a732e99-d63c-413f-aeae-274db6f2b25e"`

Expected Chrome export:

- `ok:true`
- `status:"chrome-to-desktop-exported"`
- `bytes > 0`
- `folderRestoreRequestExport.requestCount >= 1`
- `blockers:[]`

Expected Desktop 6C.3 follow-up:

- `folderRestoreRequestImport.found >= 1`
- `folderRestoreRequestAutoApply.appliedCount >= 1` or `alreadyAppliedCount >= 1`
- `blockers:[]`

## Runtime Proof Status

Runtime Chrome export proof was not completed in this pass because the local Chrome CDP runtime was unavailable on port `9247`.

Runtime attach attempt:

- Command: `node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 10000`
- Result: `ok:false`
- Status: `chrome-cdp-unavailable`
- Blockers: `["chrome-cdp-unavailable"]`
- Error: `chrome-cdp-unavailable: fetch failed`

The implementation is ready for the next Chrome/CDP rerun against the current pending restore request once Chrome Studio is running with the smoke bridge on port `9247`.

## Safety Invariants

- no Chrome restore authority
- no Chrome tombstone apply/create
- no Chrome purge authority
- no Chrome permanent delete
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no Desktop restore semantic expansion

## Validation

- `node --check` on changed JS/MJS files.
- `node tools/validation/sync/validate-folder-restore-phase6c2b-export-inflight-recovery.mjs`
- Existing validators:
  - `node tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
  - `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`
- Runtime attach check: `node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 10000` returned `chrome-cdp-unavailable`.
