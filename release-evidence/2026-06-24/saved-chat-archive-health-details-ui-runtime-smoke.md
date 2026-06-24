# Saved Chat Archive Health Details UI Runtime Smoke - Phase C6.4

Date: 2026-06-24

Status: EXECUTED - PASSED

Execution note: this evidence records a real Desktop Studio DevTools runtime
smoke for the C6.4 Saved Chat Archive Health package details UI. The smoke ran
against the rebuilt and relaunched Desktop dev app after:

- `17b7918 feat(studio): add archive health panel shell`
- `63a887e feat(studio): add archive health summary counts`
- `1a5fefb fix(studio): mount archive health diagnostics card`
- `2ca7c26 docs(studio): record archive health ui runtime smoke`
- `f544582 feat(studio): add archive health package details`

Final runtime line:

```text
[c6.4-archive-health-details-ui-smoke] ALL PASS
```

## Scope

This is evidence only. It does not add runtime code, validators, UI behavior,
Sync, Chrome, import/recovery, WebDAV/cloud behavior, user-folder export/save
dialogs, repair, restore, delete, overwrite, or new C6 implementation.

C6.4 proves that the C6.3 read-only package details section renders from the
already-loaded archive diagnostics result, starts collapsed, expands/collapses
through its local toggle, preserves the C6.1/C6.2 summary behavior, and exposes
no package action surface.

## Runtime Outputs

Observed runtime status:

- `uiState: ready-with-details`
- `archiveStatus: ok`

Observed archive counts:

```json
{
  "packagesTotal": 13,
  "packagesOk": 13,
  "packagesWarning": 0,
  "packagesBlocked": 0
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

## Details Observations

The runtime smoke verified:

- The package details section starts collapsed.
- The toggle expands with `Hide package details`.
- The toggle collapses back to `Show package details`.
- Row cap text displayed `13 of 13 packages`.
- Visible row cap respects the maximum of 50 rows.
- Package paths are rendered as selectable, read-only text.
- DB summary fields render.
- Asset summary fields render.
- No open, repair, fix, import, recovery, delete, overwrite, restore, rebuild,
  or sync action appears.

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
- summary still rendered before details
- details section exists but is collapsed
- package details table/list not visibly expanded before toggle
- Show package details button exists
- Hide package details button appears after expand
- Showing N of M packages appears
- package path is visible/selectable text
- schema/status fields visible
- chat and snapshot fields visible
- blocker and warning counts visible
- DB summary visible
- asset summary visible
- no forbidden actions visible in expanded details
- details row cap text parseable
- details row cap respects max 50
- details collapse back to Show package details
- summary remains after collapse
- diagnostics API still returns result
- diagnostics API packages array exists
- diagnostics API exposes counts

## Evidence Conclusion

C6.4 Archive Health Details UI passed in real Desktop/Tauri runtime. The runtime
proved that the package details UI is read-only, collapsed by default, locally
toggleable, capped, and populated from the same diagnostics result that powers
the summary cards. It also confirmed that the C6.1/C6.2 status, summary, and
diagnostics behavior remained intact after C6.3.

## Next Step

Future work can plan any post-C6 archive-health operator improvements, but
package open/preview, repair, import/recovery, delete, overwrite, Sync, Chrome,
and user-folder export/save-dialog behavior remain out of scope for this
evidence.
