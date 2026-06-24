# Saved Chat Archive DB Diagnostics Runtime Smoke - Phase C5.4A

Date: 2026-06-24

Status: EXECUTED - PASSED

Execution note: this evidence records a real Desktop Studio DevTools runtime
smoke for the C5.4A read-only DB/package reconciliation layer in the saved-chat
archive diagnostics. The smoke ran against the Desktop/Tauri runtime after:

- `e5c6aa3 feat(studio): add saved chat archive diagnostics`
- `2f0b5dc feat(studio): add saved chat archive asset diagnostics`
- `85b1741 feat(studio): add saved chat archive db diagnostics`

Final runtime line:

```text
[c5.4-archive-db-diagnostics-smoke] ALL PASS
```

## Scope

This is evidence only. It does not add runtime code, validators, UI, Sync,
Chrome, import/recovery, WebDAV/cloud behavior, user-folder export/save dialogs,
repair, restore, delete, overwrite, or any C5.4B/C5.5 work.

C5.4A proves read-only, package-centric DB reconciliation that uses only the
read-only store adapters:

- `H2O.Studio.store.chats.get`
- `H2O.Studio.store.snapshots.get`
- `H2O.Studio.store.snapshots.listByChat`
- `H2O.Studio.store.assets.listBySnapshot`

DB drift is reported as warnings (never blockers); structural/asset corruption
(C5.2/C5.3) remains the only source of blockers.

## Runtime Outputs

Fresh packages created by the smoke:

- v2 package:
  `archive/packages/c5_4_db_diag_v2_1782315023496.h2ochat`
- v1 package:
  `archive/packages/c5_4_db_diag_v1_1782315023496.h2ochat`

Observed statuses:

- v2 package status: `ok`
- v1 package status: `ok`
- archive status: `ok`

Observed archive counts:

```json
{
  "packagesTotal": 13,
  "packagesOk": 13,
  "packagesWarning": 0,
  "packagesBlocked": 0,
  "v1": 3,
  "v2": 10,
  "missingDbChats": 0,
  "missingDbSnapshots": 0,
  "orphanedPackages": 0,
  "stalePackages": 0,
  "storeAssetMismatches": 0,
  "missingLiveCasAssets": 0,
  "brokenPackageAssets": 0,
  "assetRefMismatches": 0,
  "dataImageResidue": 0
}
```

Observed aggregate DB checks summary:

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
- `writeSavedChatPackageV1` available
- `validateSavedChatPackageV1` available
- `diagnoseSavedChatArchiveV1` available
- `store.chats.get` available
- `store.snapshots.get` available
- `store.snapshots.listByChat` available
- `store.assets.listBySnapshot` available
- fresh v2 package created
- fresh v1 package created
- capabilities advertise DB checks
- v2 package has no blockers
- v1 package has no blockers
- v2 `dbChecks` present and checked
- v1 `dbChecks` present and checked
- v2 DB chat and snapshot exist
- v1 DB chat and snapshot exist
- v2 package is latest DB snapshot
- v1 package is latest DB snapshot
- v2 store asset registry matches package
- v1 store asset registry matches asset-less package
- fresh v2 DB warnings are empty
- fresh v1 DB warnings are empty
- `includeDbChecks: false` skips DB checks
- aggregate archive diagnostic runs with dbChecks
- aggregate sees fresh v2 and v1 packages
- aggregate DB counts are present
- aggregate DB checks summary is present

## Evidence Conclusion

C5.4A archive DB diagnostics passed in real Desktop/Tauri runtime. The runtime
proved that:

- The read-only store adapters (`chats.get`, `snapshots.get`,
  `snapshots.listByChat`, `assets.listBySnapshot`) are reachable from the Desktop
  webview and are the only DB surface the diagnostics touch.
- A fresh v2 asset-bearing package and a fresh v1 asset-less package both
  reconcile cleanly against the DB: chat + snapshot exist, the package is the
  latest snapshot for its chat, and the store asset registry matches the package
  manifest assets (empty for v1).
- The new per-package `dbChecks` block populates and `checked === true`, while
  `includeDbChecks: false` correctly skips DB reconciliation.
- Aggregate archive health exposes the C5.4A counts
  (`missingDbChats`, `missingDbSnapshots`, `orphanedPackages`, `stalePackages`,
  `storeAssetMismatches`, all 0) and the `dbChecks` summary
  (`passed: 13, warnings: 0, failed: 0`) with overall `archiveStatus: ok`.
- DB reconciliation produced no warnings and no blockers on a healthy archive of
  13 packages (3 v1, 10 v2), confirming DB drift checks are additive and never
  make a structurally valid package invalid.

## Next step

C5.4B / C5.5 planning (e.g. full DB-snapshot inventory and
missing-package-for-DB-snapshot scanning) remains future work and is out of scope
for this evidence. A drift-case runtime smoke (e.g. a package whose DB chat row
was removed → `missing-db-chat` warning, package not blocked) can be captured
later if a controlled drift fixture is set up on Desktop.
