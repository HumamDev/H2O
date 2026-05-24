# Studio Edit Overlay

Phase 2a is a passive foundation for non-destructive Studio reader overlays.

The overlay system exists so future ribbon/formatting actions can store render-time operations without changing saved snapshot content. This phase does not add visible UI and does not apply any transformations.

## Files

- `overlay-keys.js` publishes frozen `H2O.Studio.OverlayKeys`, `OverlayEvents`, `OverlayOpTypes`, and `OverlayTargets`.
- `overlay-applier.studio.js` publishes `H2O.Studio.overlay` with `computeBaseDigest`, `createEmpty`, `applyOverlay`, and `selfCheck`.
- `../store/editOverlay.js` publishes `H2O.Studio.store.editOverlay` for per-snapshot overlay records.

## Phase 2a behavior

- No visible UI is added.
- `applyOverlay` is a no-op unless future phases add operation dispatch.
- The reader hook may call `applyOverlay`, but reader output remains unchanged.
- Saved snapshots and `snap.messages` are never mutated.
- Overlay records are Studio-local under `h2o:studio:edit-overlay:v1:`.
- Digest drift causes the applier to skip safely and report a benign outcome.

Future phases may add real operations, ribbon actions, and review UI while preserving the no-snapshot-mutation invariant in `STUDIO_OVERLAY_CONTRACT.md`.

## Phase 2d — undo / redo

Undo / redo is now wired via the **reducer-filter active-set model**: `overlay.ops` stays append-only, `overlay.undoStack` is the ordered active op-id set, and renderers iterate `overlay.ops` in original order while skipping ids that are not in the active set. See the "Phase 2d — undo / redo model" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full model including the required legacy-migration rule (`undoStack` missing → all-active; `undoStack` present and empty → none-active).
