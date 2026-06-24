# Saved Chat Archive Health UI Runtime Smoke - Phase C6.2

Date: 2026-06-24

Status: EXECUTED - PASSED

Execution note: this evidence records a real Desktop Studio DevTools runtime
smoke for the C6.2 Saved Chat Archive Health UI summary panel. The smoke ran
against the rebuilt and relaunched Desktop dev app after:

- `17b7918 feat(studio): add archive health panel shell`
- `63a887e feat(studio): add archive health summary counts`
- `1a5fefb fix(studio): mount archive health diagnostics card`

Initial C6.2 smoke execution was blocked because the Archive Health card was not
mounted in the active Settings route. The helper module and diagnostics API were
loaded, but `#wbSettingsArchiveHealthBox` was absent from the rendered
Diagnostics DOM. The root cause was fixed by commit `1a5fefb`; after rebuilding
and relaunching the Desktop dev app, the route check and UI smoke both passed.

Final runtime line:

```text
[c6.2-archive-health-ui-smoke] ALL PASS
```

## Scope

This is evidence only. It does not add runtime code, validators, UI behavior,
Sync, Chrome, import/recovery, WebDAV/cloud behavior, user-folder export/save
dialogs, repair, restore, delete, overwrite, or C6.3 package details.

C6.2 proves that the read-only Archive Health UI panel mounts in the active
Desktop Settings Diagnostics route and renders summary counts from:

```js
H2O.Studio.ingestion.diagnoseSavedChatArchiveV1({
  includeCasChecks: true,
  includeRendererChecks: true,
  includeDbChecks: true,
  limit: 500
})
```

## Route Check

Observed route check results:

- `#/settings/diagnostics`
  - `archiveHealthBox: true`
  - `pageHasTitle: true`
  - `archiveHealthUi: true`
  - `diagnoseSavedChatArchiveV1: function`
- `#/settings/diagnostics/storage`
  - `archiveHealthBox: true`
  - `pageHasTitle: true`
  - `archiveHealthUi: true`
  - `diagnoseSavedChatArchiveV1: function`
- `#/settings/diagnostics/folder-parity`
  - `archiveHealthBox: false`
  - `pageHasTitle: false`
  - acceptable because Folder Parity owns that route

## Runtime Outputs

Observed UI status:

- `uiState: ready`
- `archiveStatus: ok`

Observed archive counts:

```json
{
  "packagesTotal": 13,
  "packagesOk": 13,
  "packagesWarning": 0,
  "packagesBlocked": 0,
  "v1": 3,
  "v2": 10,
  "missingLiveCasAssets": 0,
  "missingDbChats": 0,
  "missingDbSnapshots": 0,
  "orphanedPackages": 0,
  "stalePackages": 0,
  "storeAssetMismatches": 0,
  "brokenPackageAssets": 0,
  "assetRefMismatches": 0,
  "dataImageResidue": 0
}
```

Observed DB checks summary:

```json
{
  "passed": 13,
  "warnings": 0,
  "failed": 0
}
```

## PASS Rows

The Desktop DevTools console table reported PASS for:

- H2O namespace available
- `archiveHealthUi` available
- `diagnoseSavedChatArchiveV1` available
- Saved Chat Archive Health box exists
- Saved Chat Archive Health title visible
- Run diagnostics button exists
- diagnostics did not render error state
- diagnostics completed or empty state rendered
- Archive health summary rendered
- Integrity summary rendered
- Drift summary rendered
- DB checks summary rendered
- Archive package counts visible
- Integrity counts visible
- Drift counts visible
- DB check counts visible
- warning wording is non-destructive
- Copy report JSON button exists after run
- no package details table added yet
- no repair/import/delete buttons visible
- Copy report JSON gives success or graceful failure message
- diagnostics API still returns result
- diagnostics API exposes counts

## Evidence Conclusion

C6.2 Archive Health UI passed in real Desktop/Tauri runtime after the active
Settings Diagnostics mount fix. The runtime proved that:

- The card appears on `#/settings/diagnostics` and `#/settings/diagnostics/storage`.
- The card intentionally does not appear on `#/settings/diagnostics/folder-parity`,
  where Folder Parity owns the diagnostics route.
- The UI reaches `ready` state with `archiveStatus: ok`.
- Archive, integrity, drift, and DB-check summary sections render their counts.
- Warning copy remains non-destructive and does not present drift as package
  corruption.
- The Copy report JSON control is available after a diagnostics run and reports
  either success or a graceful failure message.
- No C6.3 package details table and no repair/import/delete action buttons are
  visible.

## Next Step

C6.3 package details remains future work and is out of scope for this evidence.
