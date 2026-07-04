# Folder Sync - F28 S10: Move binding-mismatch Into The Reviewed Repair Path

Verdict: **F28 S10 DONE - `binding-mismatch` IS ROUTED TO THE REVIEWED F15-SETTLED REPAIR PATH; THE F11 RENDER MIRROR
REMAINS RENDER-ONLY (`noBindingRepair:true`)**.

This slice implements F28 S10: it declares, in source, that `binding-mismatch` is handled ONLY via the reviewed,
F15-settled request -> apply -> receipt binding repair path, while keeping the F11 render-only mirror rebuild a
render-only projector that never repairs bindings. It is a minimal, JS-only change to `folders.tauri.js` plus the
updated F11 validator and this S10 validator. No `productSyncReady` flip, no WebDAV/cloud/relay, no Chat Saving CAS, no
fallback, no live Phase A/Phase B rerun.

## Commit Chain

- F28 implementation sequencing plan (S10 is next after S9): `folder-sync-f28-implementation-sequencing-plan.md`.
- binding-mismatch / productSyncReady readiness decision (S9 complete, S10 next): `d3d3abee`.
- F15 live restart-survival closeout (Phase A + Phase B passed - proves the reviewed repair path end-to-end): `138f7e12`.
- F15 restart-survival implementation: `a28f2a5c`; restart convergence awaited/observable fix: `a6f8b978`.

## Q1 - Where `binding-mismatch` was hard-blocked

In `folders.tauri.js`, `rebuildRenderMirrorFromSqlite(...)` (the F11 render-only mirror rebuild):
- `binding-mismatch` is not in `F11_RENDER_MIRROR_REBUILD_ALLOWED_CLASSES`, so `f11CleanAllowedRenderMirrorClasses`
  places it in `blocked`;
- the result then force-adds it: `blockedClasses: classSelection.blocked.concat(['binding-mismatch'])`;
- the rebuild sets `skippedBindingRepairCount` and `noBindingRepair: true` - the render mirror never repairs bindings.

Previously this was a silent block: `binding-mismatch` was excluded with no explicit statement of where it IS handled.

## Q2 - What "move binding-mismatch into the reviewed repair path" means

The reviewed repair path already exists and is live-proven: `H2O.Studio.sync.bindingRepair` -
`h2o.studio.chat-folder-binding-request.v1` request (carrying `reviewId`) -> validate -> dry-run/gated apply (gate
`folder-sync-chat-folder-binding-repair-apply`) -> receipt, on the F15-settled canonical path (durable gate, conflict
runtime, `requireContext`, planned-unbind projection, restart convergence, duplicate zero-write). S10 does not build a
new repair mechanism; it makes the render mirror DECLARE that `binding-mismatch` is routed to that reviewed path rather
than silently dropped.

## Q3 / Q4 - The minimal source change (render-only boundary preserved)

`rebuildRenderMirrorFromSqlite` result now declares the routing explicitly, WITHOUT changing render-mirror behavior:

- `reviewedRepairPathClasses: ['binding-mismatch']`.
- `bindingMismatchRoutedToReviewedRepairPath: true`.
- `reviewedRepairRequestSchema: 'h2o.studio.chat-folder-binding-request.v1'`.
- `reviewedRepairApplyGate: 'folder-sync-chat-folder-binding-repair-apply'`.

Preserved render-only boundaries (unchanged):
- `binding-mismatch` remains in `blockedClasses` for the render mirror and is still NOT an allowed render-mirror rebuild
  class.
- `noBindingRepair: true`, `noBindingWrite: true`, `noSQLiteWrite: true` - the render mirror does not repair or write
  bindings.
- `skippedBindingRepairCount` still records that the render mirror skipped binding repair.

So the render mirror is not turned into a binding repair writer; `binding-mismatch` is handled ONLY via the reviewed
F15-settled repair path.

## Q5 - S10 proof

The reviewed request -> apply -> receipt path is already live-proven end-to-end by the F15 live restart-survival closeout
(`138f7e12`):

- reviewed request generation + dry-run: Phase A dry-run (`dry-run-binding-repair-plan-ready`, zero write).
- controlled apply + receipt: `controlledApply.status:"applied"`, `reason:"binding-repair-applied"`,
  `canonicalBindingWriteCount:1`, `idempotencyPersisted:true`.
- duplicate zero-write: `duplicateReplay.status:"skipped"`, `canonicalBindingWriteCount:0`, `duplicateReplayZeroWrite:true`.
- restart survival still proven: Phase B `postRestartSnapshotHash === requestedBindingHash`,
  `reconcileSurvivalProven:true`, convergence `journalVerifiedCount:2`, `alreadyCurrentCount:2`.
- no `productSyncReady` flip: `productSyncReady:false` throughout.

S10 adds the source routing declaration + the updated F11 validator + this S10 validator; it does not require a new live
proof (the reviewed path is already proven), and none was rerun here.

## Boundaries Held

- `productSyncReady` remains `false` (not flipped).
- No WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving WebDAV/cloud/archive CAS.
- No fallback (`allowF7Fallback` / `f15AllowF7Fallback` / `explicitF7Fallback`); no bare
  `moveCanonicalChatFolderBinding`.
- Durable gate, `post-apply-binding-hash-mismatch`, conflict runtime, `requireContext`, planned-unbind projection, and
  restart convergence unchanged.
- F11 render mirror remains render-only (`noBindingRepair:true`); `binding-mismatch` not moved into the allowed
  render-mirror rebuild set.

## Next

S10 is complete: `binding-mismatch` is routed to the reviewed F15-settled repair path with the render-only boundary
intact. The next gates are F28 S11 (Chrome/native/mobile request-submission proofs) and S12 (multi-device import/read-only
proofs); `productSyncReady` stays `false` until those multi-surface/multi-device proofs land. WebDAV/cloud/relay remains
deferred and is not next.
