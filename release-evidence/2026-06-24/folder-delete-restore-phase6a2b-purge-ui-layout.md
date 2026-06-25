# Phase 6A.2b - Recently Deleted purge UI layout polish

## Purpose

Phase 6A.2 added a Desktop-only `Delete permanently` action to the main Recently Deleted panel. Manual visual QA found the top purge helper/button area was cramped and overlapping, and restored rows showed action/status text too tightly.

Phase 6A.2b is layout-only polish.

## Changes

- The main Recently Deleted panel keeps the section title visible as `RECENTLY DELETED · N`.
- The purge action header now uses a two-column grid:
  - left label: `Permanent delete`
  - right action: `Delete permanently (N)`
  - full-width helper/status line below the action row
- When `purgeEligibleCount:0`, the disabled button remains readable and the helper text is separate:
  - `No purge-eligible deleted folders.`
- Restored rows no longer show an active Restore action.
- Restored rows show a compact non-action pill:
  - `Already restored`
- Row status text can wrap without overlapping the action area.

## Safety

This phase does not change purge semantics.

- no Chrome purge UI
- no destructive behavior change
- no WebDAV/cloud/relay behavior
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no receipt deletion

The sidebar compact Recently Deleted entry still has no purge button.

## Manual Visual QA Expectation

Expected current state:

- Top Recently Deleted panel has no overlapping text.
- Disabled `Delete permanently (0)` is readable.
- Helper text is separate and readable.
- Restored rows show `Already restored` cleanly.
- Restore action is not active for restored rows.
- Chrome Studio has no purge button.

## Validation

Validation run:

- `node --check src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `node --check tools/validation/sync/validate-folder-purge-phase6a2b-ui-layout.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a2-ui.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a2b-ui-layout.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1c.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `git diff --check`

All source/static validators passed.

## Runtime Status

Manual visual QA was not run in this pass. The expected Desktop runtime result is a readable, non-overlapping top action area with disabled `Delete permanently (0)` and a separate `No purge-eligible deleted folders.` helper line. Restored rows should show `Already restored` as a non-action pill.
