# Saved Chat Archive Asset Diagnostics Runtime Smoke - Phase C5.3

Date: 2026-06-24

Status: EXECUTED - PASSED

Execution note: this evidence records a real Desktop Studio DevTools runtime
smoke for the C5.3 saved-chat archive asset diagnostics layer. The smoke ran
against the Desktop/Tauri runtime after:

- `e5c6aa3 feat(studio): add saved chat archive diagnostics`
- `2f0b5dc feat(studio): add saved chat archive asset diagnostics`

Final runtime line:

```text
[c5.3-archive-asset-diagnostics-smoke] ALL PASS
```

## Scope

This is evidence only. It does not add runtime code, validators, UI, Sync,
Chrome, import/recovery, WebDAV/cloud behavior, user-folder export/save dialogs,
repair, restore, delete, overwrite, or C5.4 DB/package reconciliation.

C5.3 proves read-only package asset diagnostics:

- package asset descriptor validation
- package asset file existence/hash/byte-length validation
- snapshot `assetRefs` validation against `manifest.assets[]`
- renderer `data:image` residue checks
- package-relative renderer asset reference checks
- read-only live CAS presence comparison

## Runtime Outputs

Fresh packages created by the smoke:

- v2 package:
  `archive/packages/c5_3_asset_diag_v2_1782306749077.h2ochat`
- v1 package:
  `archive/packages/c5_3_asset_diag_v1_1782306749077.h2ochat`

Observed statuses:

- v2 package status: `ok`
- v1 package status: `ok`
- archive status: `ok`

Observed archive counts:

```json
{
  "packagesTotal": 11,
  "packagesOk": 11,
  "packagesWarning": 0,
  "packagesBlocked": 0,
  "v1": 2,
  "v2": 9,
  "missingLiveCasAssets": 0,
  "brokenPackageAssets": 0,
  "assetRefMismatches": 0,
  "dataImageResidue": 0
}
```

## PASS Rows

The Desktop DevTools console table reported PASS for:

- H2O namespace available
- `diagnoseSavedChatArchiveCapabilitiesV1` available
- `listSavedChatArchivePackagesV1` available
- `validateSavedChatPackageV1` available
- `diagnoseSavedChatArchiveV1` available
- fresh v2 package created
- fresh v1 package created
- capabilities diagnostic runs
- inventory diagnostic runs
- inventory sees fresh v2 package
- inventory sees fresh v1 package
- v2 package diagnostic has no blockers
- v1 package diagnostic has no blockers
- v2 `assetChecks` present
- v2 manifest asset count is 1
- v2 package asset validation has no missing/hash/byte/ref failures
- v2 renderer has no `data:image` residue
- v2 live CAS check executed
- v1 `assetChecks` present
- v1 package has no asset blockers
- aggregate archive diagnostic runs
- aggregate archive diagnostic sees fresh packages

## Evidence Conclusion

C5.3 archive asset diagnostics passed in real Desktop/Tauri runtime. The runtime
proved that a fresh v2 asset-bearing package and a fresh v1 asset-less package
both validate cleanly through the archive diagnostics APIs, and that aggregate
archive health reports no package asset, asset reference, renderer residue, or
live CAS consistency failures.
