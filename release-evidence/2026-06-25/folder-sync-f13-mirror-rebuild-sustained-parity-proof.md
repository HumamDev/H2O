# Folder Sync — Phase F13: Render-Only Mirror Rebuild SUSTAINED PARITY / IDEMPOTENCE Proof

Date: 2026-07-01

## Status

SUSTAINED PARITY / IDEMPOTENCE PROOF ONLY. After the F12B controlled apply, the F11 render-only mirror
rebuild helper (`H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite`) was re-run in Desktop Studio
(Tauri WebView) DevTools as a NO-OP dry-run, followed by a read-only F5-style drift re-probe. No write
occurred: the helper returned a no-op because the two allowed render-only classes are already converged.
The optional gated no-op apply (step 2) was intentionally SKIPPED (not needed for F13). No product
runtime source was modified. No repair was implemented; `sortOrder` was not handled; bindings were not
repaired. `productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS
was implemented. No Chat Saving / archive package code was touched. This slice records the idempotence +
sustained-parity evidence only.

## Context

- F12B controlled apply proof committed: `e2b4281`.
- F12A dry-run proof committed: `0a16f5a`.
- F11 render-only mirror rebuild gate committed: `1776e17`.
- F10 mirror write-through / rebuild spec committed: `bc1a67e`.
- F9 productSyncReady readiness verdict: `productSyncReady` is NOT READY TO FLIP.
- Helper: `H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite(options)`.
- Required dev gate: `folder-sync-f11-render-only-mirror-rebuild`.
- Only apply-phase write target (not exercised in F13): `FOLDER_STATE_DATA_KEY`
  (`h2o:prm:cgx:fldrs:state:data:v1`).
- F11 handles ONLY `missing-mirror-folder` and `field-mismatch:color`; it blocks/skips
  `field-mismatch:sortOrder` and `binding-mismatch`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Idempotence Guarantee (source-grounded)

The helper's no-op branch (`if (!diagnostics.length) { status = 'no-op-render-mirror-already-converged'
}`) returns BEFORE both the dry-run branch and the apply write path. Therefore once the two allowed
render-only classes are converged, neither a dry-run nor a gated `apply:true` call can write — the
rebuild is idempotent by construction.

## Cross-Surface Requirement (carried, not implemented in F13)

The render mirror rebuild preserves future parity across Desktop Studio, Chrome / native extension
Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite stays canonical, the mirror stays a
derived per-surface render projection, diagnostics stay hash-only / redacted, and no surface other than
Desktop mutates canonical folder state. Mobile, remote WebDAV, and Chat Saving CAS are NOT implemented
here. Chrome / native extension and mobile remain non-canonical future participants.

## Step 1 — Post-F12B No-Op Idempotence Dry-Run

```js
await H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite({
  gate: "folder-sync-f11-render-only-mirror-rebuild",
  classes: ["missing-mirror-folder", "field-mismatch:color", "field-mismatch:sortOrder", "binding-mismatch"]
});
```

Recorded result:

```json
{
  "schema": "h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1",
  "ok": true,
  "status": "no-op-render-mirror-already-converged",
  "gate": "folder-sync-f11-render-only-mirror-rebuild",
  "gateSatisfied": true,
  "applyRequested": false,
  "dryRun": true,
  "target": "FOLDER_STATE_DATA_KEY",
  "targetKey": "h2o:prm:cgx:fldrs:state:data:v1",
  "allowedClasses": ["missing-mirror-folder", "field-mismatch:color"],
  "blockedClasses": ["field-mismatch:sortOrder", "binding-mismatch"],
  "handledClasses": [],
  "rebuiltMissingMirrorFolderCount": 0,
  "rebuiltColorMismatchCount": 0,
  "skippedSortOrderRebuildCount": 1,
  "skippedBindingRepairCount": 1,
  "mirrorWriteAttempted": false,
  "mirrorWriteOk": false,
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
  "diagnostics": [],
  "diagnosticCount": 0
}
```

## Step 2 — Optional Gated No-Op Apply (INTENTIONALLY SKIPPED)

The optional gated `apply:true` call was intentionally SKIPPED. It is not needed for F13: step 1 already
proves `diagnosticCount:0` for the two allowed classes, and the helper's no-op branch precedes the apply
write path, so an apply could only no-op without writing. No further apply is needed for F13.

## Step 3 — Post-Check Read-Only Drift Re-Probe (F5-style)

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

- IDEMPOTENCE: the re-run helper is a no-op — `status: no-op-render-mirror-already-converged`,
  `diagnosticCount: 0`, `handledClasses: []`, `rebuiltMissingMirrorFolderCount: 0`,
  `rebuiltColorMismatchCount: 0`. No additional mirror rebuild write was needed after F12B.
- NO WRITE: `mirrorWriteAttempted: false`, `mirrorWriteOk: false`; every no-write flag true —
  `noSQLiteWrite`, `noBindingWrite`, `noTombstoneWrite`, `noTransportWrite`, `noWebdavWrite`,
  `noChatSavingCas`, `noChromeCanonicalMutation`, `noFolderDelete`, `noFolderPurge`,
  `noSortOrderOverwrite`, `noBindingRepair`.
- SUSTAINED PARITY: the post-check read-only re-probe shows `missing-mirror-folder` and
  `field-mismatch:color` remain ABSENT from `driftClasses` — the two classes cleared in F12B stay
  converged.
- REMAINING DRIFT IS ONLY THE BLOCKED/GATED CLASSES: post-check `driftClasses` contains solely
  `binding-mismatch` (×5) and `field-mismatch:sortOrder` (×2); `diagnosticCount: 7` — unchanged from
  F12B, confirming F13 touched nothing. `binding-mismatch` stays blocked; `field-mismatch:sortOrder`
  stays gated on the canonical ownership decision.
- READ-ONLY: `writeCallCount: 0`; `readOnly: true`; `mode: manual-devtools-read-only`;
  `safety.noSqliteMutation / noChromeStorageMutation / noTombstoneMutation / noBindingMutation /
  noTransportWrite / noWebdavWrite: true`; `safety.folderSyncReady: false`.
- Diagnostics are redacted / hash-only across both recorded steps (step 1 `diagnostics: []`; the probe
  emits hash-only class summaries, no raw names/titles/ids/content).
- `productSyncReady: false` throughout; `publicPremiumBlocked: true`; `realRemoteWebdavDeferred: true`.

## Sustained-Parity Summary

- F12B apply cleared: `missing-mirror-folder` (1) + `field-mismatch:color` (1).
- F13 re-run: `diagnosticCount: 0` for the two allowed classes — no new rebuild candidates, no write.
- F13 post-probe drift: `missing-mirror-folder` = 0, `field-mismatch:color` = 0 (STILL CLEARED);
  `binding-mismatch` = 5, `field-mismatch:sortOrder` = 2 (unchanged, blocked/gated); total 7.

## Verdicts

- F13: PASS (sustained parity / idempotence proof). The re-run render-only rebuild is a no-op after
  F12B, wrote nothing, and the two approved classes stay converged in a read-only re-probe while the
  blocked/gated classes remain untouched.
- Idempotence proof passed: YES. Any write occurred: NO (`mirrorWriteAttempted: false`; all no-write
  flags true; probe `writeCallCount: 0`).
- Cleared classes (stay cleared): `missing-mirror-folder`, `field-mismatch:color`.
- Remaining blocked/gated classes: `binding-mismatch` (blocked), `field-mismatch:sortOrder` (gated on
  canonical ownership decision).
- Post-probe `diagnosticCount`: 7. `writeCallCount`: 0.
- `productSyncReady`: remains `false` / NOT READY TO FLIP.
- Public/premium sync: REMAINS BLOCKED. Real remote WebDAV: deferred. Chat Saving WebDAV/cloud/archive
  CAS: REMAINS BLOCKED (no `fullBundle.v3`, no CAS, no archive code touched).
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants; hard delete blocked; folder delete preserves chats. The closed Labels /
  Tags / Categories metadata lane is not modified by this folder-sync lane (its four core applied
  types — `chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain;
  any label/tag Operational unbind extension is a separate out-of-scope lane).

## Recommended F14

F14 = the `field-mismatch:sortOrder` CANONICAL-OWNERSHIP DECISION (design-only, no writes): decide
Desktop-SQLite-canonical vs native-owner reorder and specify how a native reorder reconciles back into
SQLite, as the prerequisite that must land BEFORE `sortOrder` may ever be added to the allowed rebuild
set. Keep `sortOrder` out of the allowed rebuild set until then; keep `binding-mismatch` blocked (its
reviewed repair loop is a separate later slice); keep `productSyncReady` false and Chat Saving CAS
blocked. F14 writes nothing and flips nothing.
