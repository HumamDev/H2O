# Folder Sync - Phase F6: Desktop Runtime Drift Live Evidence

Date: 2026-07-01

## Status

LIVE DESKTOP DEVTOOLS EVIDENCE CAPTURED. Evidence/validator only. No product runtime source was
changed. No reconciliation writes were implemented. The render mirror was not repaired and was not made
write-through. No folder mutation behavior changed. No public/premium sync was enabled. No real remote
WebDAV was implemented. The closed Labels / Tags / Categories metadata lane was not modified by F6.

## Context

- Phase F5 Desktop runtime drift probe contract committed:
  `1482a68f2f7f4f8c4e6f8d5b6a3f4f3c2d1a9b8c7`.
- F5 provided the Desktop DevTools snippet command:
  `node tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs --print-devtools-snippet`.
- F6 captured live Desktop Studio DevTools output from that snippet.
- Folder sync remains NOT READY.
- Public/premium sync remains blocked.
- Real remote WebDAV remains deferred.

## Capture Notes

- Surface: Desktop Studio DevTools.
- The first copy attempt using `copy(JSON.stringify(await $1, null, 2))` failed because DevTools did
  not accept the `$1` promise syntax in that context.
- The successful copy path used `$1.then(...)` and printed the full returned JSON.
- The captured output was reviewed as redacted/hash-only. The evidence records the gate fields and
  drift-class summary; no raw folder names, chat titles/content, account/user data, mobile identifiers,
  or peer/device identifiers are recorded here.

## Captured Runtime Gates

```json
{
  "schema": "h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1",
  "surface": "desktop-studio",
  "mode": "manual-devtools-read-only",
  "readOnly": true,
  "writeCallCount": 0,
  "diagnosticCount": 9,
  "driftClasses": [
    "binding-mismatch",
    "field-mismatch:color",
    "field-mismatch:sortOrder",
    "missing-mirror-folder"
  ],
  "safety": {
    "noSqliteMutation": true,
    "noChromeStorageMutation": true,
    "noTombstoneMutation": true,
    "noBindingMutation": true,
    "noTransportWrite": true,
    "noWebdavWrite": true,
    "folderSyncReady": false,
    "publicPremiumBlocked": true,
    "realRemoteWebdavDeferred": true
  },
  "diagnosticPayload": {
    "redactedHashOnly": true,
    "rawFolderNamesReturned": false,
    "rawChatTitlesReturned": false,
    "rawChatContentReturned": false,
    "rawAccountUserDataReturned": false,
    "rawMobilePeerIdentifiersReturned": false
  }
}
```

## Drift Classes Found

The live Desktop probe found 9 diagnostics across these drift classes:

- `diagnosticCount: 9`

- `binding-mismatch`
- `field-mismatch:color`
- `field-mismatch:sortOrder`
- `missing-mirror-folder`

No reconciliation was performed. The diagnostics only report current divergence between Desktop
canonical folder state and the `FOLDER_STATE_DATA_KEY` render mirror.

## Safety Verification

The live output passed every no-write gate:

- `writeCallCount: 0`
- `noSqliteMutation: true`
- `noChromeStorageMutation: true`
- `noTombstoneMutation: true`
- `noBindingMutation: true`
- `noTransportWrite: true`
- `noWebdavWrite: true`

No folder `create`, `upsert`, `patch`, `bindChat`, `unbindChat`, tombstone mutation, mirror repair,
export/write transport call, or WebDAV write occurred.

## Cross-Surface Requirement

F6 records Desktop live evidence only. Future sync compatibility still requires Desktop Studio,
Chrome/native extension Studio across multiple devices, and the mobile app. The lane must preserve
peer/device identity as redacted diagnostics, shared folder/item envelope compatibility,
Desktop-canonical default authority, and future mobile compatibility. F6 does not implement mobile
sync, extension multi-device sync, public/premium sync, remote transport, or real WebDAV.

## Readiness

- Folder sync readiness: NOT READY.
- Public/premium sync: BLOCKED.
- Real remote WebDAV: DEFERRED.
- Product sync: globally NOT READY.
- Labels / Tags / Categories metadata lane: not expanded or modified by F6.

## Validator

Path:

- `tools/validation/sync/validate-folder-sync-f6-desktop-runtime-drift-live-evidence.mjs`

The validator proves:

- this evidence exists and references F5 commit `1482a68f2f7f4f8c4e6f8d5b6a3f4f3c2d1a9b8c7`;
- live Desktop DevTools evidence was captured;
- the `$1` copy caveat and successful `$1.then(...)` path are recorded;
- schema/surface/mode/read-only gates match the live output;
- `writeCallCount` is exactly `0`;
- all no-write safety flags are true;
- `diagnosticCount` is `9`;
- the captured drift class set is `binding-mismatch`, `field-mismatch:color`,
  `field-mismatch:sortOrder`, and `missing-mirror-folder`;
- diagnostics are recorded as redacted/hash-only;
- folder sync remains NOT READY, public/premium sync remains blocked, and real remote WebDAV remains
  deferred;
- future Desktop + Chrome/native extension multi-device + mobile compatibility is preserved as a
  requirement, not implemented;
- no product runtime source changes are required.

## Verdict

Phase F6 verdict: PASS. Live Desktop Studio DevTools evidence was captured and accepted. The probe
reported current SQLite-vs-render-mirror drift without writes, with `writeCallCount: 0`, redacted
diagnostics, and no readiness over-claim.

Recommended F7 slice: analyze the 9 live drift diagnostics by class and design a read-only
reconciliation decision matrix before any repair/write-through implementation is considered.
