# Folder Sync — Phase F12B: Render-Only Mirror Rebuild LIVE APPLY Proof

Date: 2026-07-01

## Status

CONTROLLED LIVE DESKTOP APPLY PROOF ONLY. The F11 render-only mirror rebuild helper
(`H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite`) was run manually in the Desktop Studio
(Tauri WebView) DevTools console as a SINGLE controlled apply, followed by a read-only F5-style drift
re-probe. The apply wrote ONLY the render mirror (`FOLDER_STATE_DATA_KEY`). No SQLite / binding /
tombstone / transport / WebDAV / Chat Saving / archive-CAS write occurred. No product runtime source
was modified in this phase. No new product behavior, no automatic rebuild, no background repair was
added. `productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. `sortOrder` was not handled;
bindings were not repaired. The controlled apply MUST NOT be repeated in this phase. This slice records
the apply + re-probe evidence only.

## Context

- F12A dry-run proof committed: `0a16f5a`.
- F11 render-only mirror rebuild gate committed: `1776e17`.
- F10 mirror write-through / rebuild spec committed: `bc1a67e`.
- F9 productSyncReady readiness verdict: `productSyncReady` is NOT READY TO FLIP.
- Helper: `H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite(options)`.
- Required dev gate: `folder-sync-f11-render-only-mirror-rebuild`.
- Only apply-phase write target: `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`).
- F11 handles ONLY `missing-mirror-folder` and `field-mismatch:color`; it blocks/skips
  `field-mismatch:sortOrder` and `binding-mismatch`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Cross-Surface Requirement (carried, not implemented in F12B)

The render mirror rebuild preserves future parity across Desktop Studio, Chrome / native extension
Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite stays canonical, the mirror stays a
derived per-surface render projection, diagnostics stay hash-only / redacted, and no surface other than
Desktop mutates canonical folder state. Mobile, remote WebDAV, and Chat Saving CAS are NOT implemented
here. Chrome / native extension and mobile remain non-canonical future participants.

## Step 1 — Pre-Apply Confirmation Dry-Run (no write)

```js
await H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite({
  gate: "folder-sync-f11-render-only-mirror-rebuild",
  classes: ["missing-mirror-folder", "field-mismatch:color", "field-mismatch:sortOrder", "binding-mismatch"]
});
```

Recorded result:

```json
{
  "ok": true,
  "gateSatisfied": true,
  "dryRun": true,
  "applyRequested": false,
  "mirrorWriteAttempted": false,
  "mirrorWriteOk": false,
  "status": "dry-run-render-mirror-rebuild-ready",
  "diagnosticCount": 2,
  "rebuiltColorMismatchCount": 1,
  "rebuiltMissingMirrorFolderCount": 1,
  "skippedSortOrderRebuildCount": 1,
  "skippedBindingRepairCount": 1,
  "productSyncReady": false
}
```

## Step 2 — Gated Apply (single controlled mirror-only write)

```js
await H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite({
  gate: "folder-sync-f11-render-only-mirror-rebuild",
  apply: true,
  classes: ["missing-mirror-folder", "field-mismatch:color", "field-mismatch:sortOrder", "binding-mismatch"]
});
```

Recorded result:

```json
{
  "schema": "h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1",
  "ok": true,
  "gateSatisfied": true,
  "dryRun": false,
  "applyRequested": true,
  "mirrorWriteAttempted": true,
  "mirrorWriteOk": true,
  "status": "render-only-mirror-rebuilt",
  "target": "FOLDER_STATE_DATA_KEY",
  "targetKey": "h2o:prm:cgx:fldrs:state:data:v1",
  "handledClasses": ["field-mismatch:color", "missing-mirror-folder"],
  "blockedClasses": ["field-mismatch:sortOrder", "binding-mismatch"],
  "rebuiltColorMismatchCount": 1,
  "rebuiltMissingMirrorFolderCount": 1,
  "skippedSortOrderRebuildCount": 1,
  "skippedBindingRepairCount": 1,
  "noSQLiteWrite": true,
  "noBindingWrite": true,
  "noTombstoneWrite": true,
  "noTransportWrite": true,
  "noWebdavWrite": true,
  "noChatSavingCas": true,
  "noChromeCanonicalMutation": true,
  "noFolderDelete": true,
  "noFolderPurge": true,
  "noSortOrderOverwrite": true,
  "noBindingRepair": true,
  "productSyncReady": false,
  "privacy": { "redacted": true, "hashOnly": true }
}
```

## Step 3 — Post-Apply Read-Only Drift Re-Probe (F5-style)

Generated from the committed F5 probe
(`node tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs --print-devtools-snippet`),
pasted into Desktop Studio DevTools. Recorded result:

```json
{
  "schema": "h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1",
  "surface": "desktop-studio",
  "mode": "manual-devtools-read-only",
  "readOnly": true,
  "mirrorKey": "h2o:prm:cgx:fldrs:state:data:v1",
  "diagnosticCount": 7,
  "writeCallCount": 0,
  "driftClasses": [
    "binding-mismatch",
    "binding-mismatch",
    "binding-mismatch",
    "binding-mismatch",
    "binding-mismatch",
    "field-mismatch:sortOrder",
    "field-mismatch:sortOrder"
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
  }
}
```

## What This Proves

- The apply was GATED: `gateSatisfied: true` for `folder-sync-f11-render-only-mirror-rebuild`.
- The apply WROTE ONLY THE RENDER MIRROR: `target: FOLDER_STATE_DATA_KEY`,
  `targetKey: h2o:prm:cgx:fldrs:state:data:v1`, `mirrorWriteAttempted: true`, `mirrorWriteOk: true`,
  `status: render-only-mirror-rebuilt`. Every non-mirror write flag is true: `noSQLiteWrite`,
  `noBindingWrite`, `noTombstoneWrite`, `noTransportWrite`, `noWebdavWrite`, `noChatSavingCas`,
  `noChromeCanonicalMutation`, `noFolderDelete`, `noFolderPurge`, `noSortOrderOverwrite`,
  `noBindingRepair`.
- ONLY the two allowed render-only classes were handled: `handledClasses` =
  `field-mismatch:color` + `missing-mirror-folder` (`rebuiltColorMismatchCount: 1`,
  `rebuiltMissingMirrorFolderCount: 1`).
- The two blocked classes stayed blocked/skipped: `blockedClasses` includes `field-mismatch:sortOrder`
  and `binding-mismatch`; `skippedSortOrderRebuildCount: 1`; `skippedBindingRepairCount: 1`.
- RECONVERGENCE (post-apply read-only re-probe): `missing-mirror-folder` no longer appears and
  `field-mismatch:color` no longer appears in `driftClasses` — the two approved classes CLEARED.
- REMAINING DRIFT IS ONLY THE BLOCKED/GATED CLASSES: the post-apply `driftClasses` contains solely
  `binding-mismatch` (×5) and `field-mismatch:sortOrder` (×2); `diagnosticCount: 7`. These are exactly
  the classes F11 does not touch — `binding-mismatch` stays blocked, `field-mismatch:sortOrder` stays
  gated on the canonical ownership decision. Neither was modified by the apply.
- The re-probe was READ-ONLY: `writeCallCount: 0`; `readOnly: true`;
  `safety.noSqliteMutation / noChromeStorageMutation / noTombstoneMutation / noBindingMutation /
  noTransportWrite / noWebdavWrite: true`; `safety.folderSyncReady: false`.
- Diagnostics are redacted / hash-only across all three steps (`privacy.redacted: true`,
  `privacy.hashOnly: true`; the probe emits hash-only class summaries, no raw names/titles/ids/content).
- `productSyncReady: false` throughout.

## Reconvergence Summary

- Pre-apply drift plan: `missing-mirror-folder` (1) + `field-mismatch:color` (1) = 2 rebuildable.
- Apply: rebuilt both (mirror-only), skipped `field-mismatch:sortOrder` + `binding-mismatch`.
- Post-apply drift: `missing-mirror-folder` = 0, `field-mismatch:color` = 0 (CLEARED);
  `binding-mismatch` = 5, `field-mismatch:sortOrder` = 2 (unchanged, blocked/gated); total 7.

## Verdicts

- F12B: PASS (controlled live Desktop apply proof). A single gated apply rebuilt only the two allowed
  render-only classes into the mirror, wrote nothing but `FOLDER_STATE_DATA_KEY`, and the two approved
  classes reconverged in a read-only re-probe while the blocked/gated classes stayed untouched.
- Only `FOLDER_STATE_DATA_KEY` written: YES. No SQLite / binding / tombstone / transport / WebDAV /
  Chat Saving / CAS write occurred.
- Cleared classes: `missing-mirror-folder`, `field-mismatch:color`.
- Remaining blocked/gated classes: `binding-mismatch` (blocked), `field-mismatch:sortOrder` (gated on
  canonical ownership decision).
- Post-apply `diagnosticCount`: 7. `writeCallCount`: 0.
- `productSyncReady`: remains `false` / NOT READY TO FLIP.
- Public/premium sync: REMAINS BLOCKED. Real remote WebDAV: deferred. Chat Saving WebDAV/cloud/archive
  CAS: REMAINS BLOCKED (no `fullBundle.v3`, no CAS, no archive code touched).
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants; hard delete blocked; folder delete preserves chats. The closed Labels /
  Tags / Categories metadata lane is not modified by this folder-sync lane (its four core applied
  types — `chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain;
  any label/tag Operational unbind extension is a separate out-of-scope lane).

## Recommended F13

F13 = a SUSTAINED-PARITY / IDEMPOTENCE re-probe (NOT a `productSyncReady` flip): re-run the gated apply
and confirm an immediate no-op (`no-op-render-mirror-already-converged`, `mirrorWriteAttempted:false`),
then re-run the read-only F5-style drift probe across multiple cycles proving `missing-mirror-folder`
and `field-mismatch:color` stay converged, `writeCallCount` stays `0` on probes, and
`field-mismatch:sortOrder` + `binding-mismatch` remain untouched. Keep SQLite canonical, `sortOrder`
gated, `binding-mismatch` blocked, `productSyncReady` false, and Chat Saving CAS blocked. The
`sortOrder` ownership decision and the reviewed binding-repair loop remain separate later slices.
