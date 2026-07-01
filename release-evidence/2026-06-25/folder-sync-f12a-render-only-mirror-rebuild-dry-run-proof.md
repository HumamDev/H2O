# Folder Sync — Phase F12A: Render-Only Mirror Rebuild LIVE DRY-RUN Proof

Date: 2026-07-01

## Status

LIVE DESKTOP DRY-RUN PROOF ONLY. The F11 render-only mirror rebuild helper
(`H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite`) was run manually in the Desktop Studio
(Tauri WebView) DevTools console in DRY-RUN mode. `apply:true` was NOT passed. No mirror write
occurred. No SQLite / binding / tombstone / transport / WebDAV / CAS write occurred. No product
runtime source was modified in this phase. `productSyncReady` was NOT flipped. No `fullBundle.v3` was
minted. No Chat Saving / archive package code was touched. This slice records the successful live
dry-run evidence only; the F12B apply run is NOT run and requires explicit approval.

## Context

- F11 render-only mirror rebuild gate committed: `1776e17`.
- F10 mirror write-through / rebuild spec committed: `bc1a67e`.
- F9 productSyncReady readiness verdict: `productSyncReady` is NOT READY TO FLIP.
- Helper: `H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite(options)`.
- Required dev gate: `folder-sync-f11-render-only-mirror-rebuild`.
- Helper defaults to dry-run unless `apply:true` is passed. The only apply-phase write target is
  `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`).
- F11 handles ONLY `missing-mirror-folder` and `field-mismatch:color`.
- F11 explicitly blocks/skips `field-mismatch:sortOrder` and `binding-mismatch`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Cross-Surface Requirement (carried, not implemented in F12A)

The render mirror rebuild must preserve future parity across Desktop Studio, Chrome / native extension
Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite stays canonical, the mirror stays a
derived per-surface render projection, diagnostics stay hash-only / redacted, and no surface other than
Desktop mutates canonical folder state. Mobile, remote WebDAV, and Chat Saving CAS are NOT implemented
here. Chrome / native extension and mobile remain non-canonical future participants.

## Live Desktop DevTools Dry-Run Command

Run in the Desktop Studio (Tauri WebView) DevTools console with the dev diagnostic gate enabled:

```js
// F12A — Folder Sync render-only mirror rebuild DRY-RUN (no apply, no write)
await H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite({
  gate: "folder-sync-f11-render-only-mirror-rebuild"
});
// apply:true was NOT passed. Dry-run is the default when apply is omitted.
```

## Live Desktop Dry-Run Output (recorded)

```json
{
  "schema": "h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1",
  "ok": true,
  "status": "dry-run-render-mirror-rebuild-ready",
  "gate": "folder-sync-f11-render-only-mirror-rebuild",
  "gateSatisfied": true,
  "applyRequested": false,
  "dryRun": true,
  "source": "desktop-sqlite-folders",
  "target": "FOLDER_STATE_DATA_KEY",
  "targetKey": "h2o:prm:cgx:fldrs:state:data:v1",
  "renderMirrorOnly": true,
  "desktopSQLiteCanonical": true,
  "allowedClasses": ["missing-mirror-folder", "field-mismatch:color"],
  "blockedClasses": ["field-mismatch:sortOrder", "binding-mismatch"],
  "handledClasses": ["field-mismatch:color", "missing-mirror-folder"],
  "rebuiltMissingMirrorFolderCount": 1,
  "rebuiltColorMismatchCount": 1,
  "skippedSortOrderRebuildCount": 1,
  "skippedBindingRepairCount": 1,
  "diagnosticCount": 2,
  "mirrorWriteAttempted": false,
  "mirrorWriteOk": false,
  "noSQLiteWrite": true,
  "noBindingWrite": true,
  "noTombstoneWrite": true,
  "noFolderDelete": true,
  "noFolderPurge": true,
  "noSortOrderOverwrite": true,
  "noBindingRepair": true,
  "noChromeCanonicalMutation": true,
  "noTransportWrite": true,
  "noWebdavWrite": true,
  "noChatSavingCas": true,
  "productSyncReady": false,
  "privacy": { "redacted": true, "hashOnly": true },
  "diagnostics": [
    { "class": "field-mismatch:color", "folderToken": "sha256:fadec7fe1c3fdf28" },
    { "class": "missing-mirror-folder", "folderToken": "sha256:c149ef99393a3c63" }
  ]
}
```

## What This Proves

- The helper is GATED: `gateSatisfied: true` for `folder-sync-f11-render-only-mirror-rebuild`.
- DRY-RUN mode: `dryRun: true`, `applyRequested: false`, `status: dry-run-render-mirror-rebuild-ready`.
- NO WRITE occurred: `mirrorWriteAttempted: false`, `mirrorWriteOk: false`; and every no-write safety
  flag is true — `noSQLiteWrite`, `noBindingWrite`, `noTombstoneWrite`, `noTransportWrite`,
  `noWebdavWrite`, `noChatSavingCas`, `noChromeCanonicalMutation`, `noFolderDelete`, `noFolderPurge`,
  `noSortOrderOverwrite`, `noBindingRepair`.
- Desktop SQLite is the canonical source: `source: desktop-sqlite-folders`,
  `desktopSQLiteCanonical: true`, `renderMirrorOnly: true`, `target: FOLDER_STATE_DATA_KEY`.
- Only the two allowed render-only classes are planned/handled: `allowedClasses` and `handledClasses`
  are exactly `missing-mirror-folder` + `field-mismatch:color`.
- The two blocked classes stay blocked/skipped: `blockedClasses` includes `field-mismatch:sortOrder`
  and `binding-mismatch`; `skippedSortOrderRebuildCount: 1`; `skippedBindingRepairCount: 1`.
- Drift plan counts: `diagnosticCount: 2`, `rebuiltMissingMirrorFolderCount: 1`,
  `rebuiltColorMismatchCount: 1`.
- Diagnostics are redacted / hash-only: `privacy.redacted: true`, `privacy.hashOnly: true`; each
  diagnostic carries only a `sha256:` `folderToken` (no raw folder name/title/id/content).
- `productSyncReady: false`.

## F12B Apply — NOT RUN (requires explicit approval)

The F12B apply run (`apply: true`, which would write the two rebuilt render fields into
`FOLDER_STATE_DATA_KEY` only) is NOT run in F12A and MUST NOT be run without explicit approval. F12A is
dry-run evidence only. When approved, F12B must: pass the same dev gate; write ONLY the mirror; leave
SQLite / bindings / tombstones / `sortOrder` / transport untouched; re-run the F6-style drift probe to
show the two rebuilt classes reconverge while `field-mismatch:sortOrder` and `binding-mismatch` stay
untouched; keep `productSyncReady` false; keep Chat Saving CAS blocked; and stay redacted / hash-only.

## Verdicts

- F12A: PASS (live Desktop dry-run proof). The helper is gated, dry-run-by-default, writes nothing,
  plans only the two allowed render-only classes, blocks/skips `sortOrder` + `binding`, and emits
  redacted hash-only diagnostics.
- Any write occurred: NO. `mirrorWriteAttempted: false`; all no-write flags true.
- `productSyncReady`: remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED (no `fullBundle.v3`, no CAS, no archive code
  touched).
- Real remote WebDAV: deferred. Public/premium: blocked. Desktop remains canonical; Chrome / native
  extension and mobile stay non-canonical future cross-surface participants; hard delete blocked;
  folder delete preserves chats. The closed Labels / Tags / Categories metadata lane is not modified by
  this folder-sync lane (its four core applied types — `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind extension is a separate
  out-of-scope lane).

## Recommended F12B

F12B = the dev-gated live APPLY run of the same helper (`apply: true`) behind
`folder-sync-f11-render-only-mirror-rebuild`, writing ONLY `FOLDER_STATE_DATA_KEY`, followed by an
F6-style drift re-probe proving the two rebuilt classes reconverge while `field-mismatch:sortOrder` and
`binding-mismatch` remain untouched, `writeCallCount` limited to the mirror, no chat lost, output
redacted — keeping SQLite canonical, `productSyncReady` false, and Chat Saving CAS blocked. F12B
requires explicit approval before it is run.
