# Phase 6A.2c - Recently Deleted premium UI layout

## Purpose

Manual visual QA after Phase 6A.2b still found the Recently Deleted purge action area too cramped. The `Delete permanently` button could clip at the right panel boundary, the action was not visually distinct enough, and restored-row action/status content needed a more professional layout.

Phase 6A.2c is a Desktop UI/layout-only refinement.

## Layout Changes

The main Recently Deleted panel now uses a clearer structure:

- Section title remains `RECENTLY DELETED · N`.
- A contained permanent-delete action block sits inside the panel boundary.
- The action block has:
  - label: `Permanent delete`
  - helper text separated from the button
  - right-aligned danger button: `Delete permanently (N)`
- Disabled state remains readable when `purgeEligibleCount:0`.
- The helper text is:
  - `No purge-eligible deleted folders.`
- When candidates exist, helper text explains:
  - permanently removes restore records for eligible deleted folders
  - chats and snapshots are not deleted

## Stats And Chips

The aggregate area now uses a responsive stats grid:

- Active
- Restored
- Purge blocked
- Expired
- Purge eligible
- Retention

Policy chips remain visible with consistent spacing:

- Purge deferred
- Hard delete blocked
- Retention enforcement deferred

## Row Layout

Each row now uses a cleaner card layout:

- Header row:
  - folder name on the left
  - status pill on the right
- Details grid:
  - Folder ID
  - Deleted date
  - Restore available
  - Affected chats
  - Retention
  - Expires
  - Enforcement
  - Purge blocked
  - Hard delete blocked
- Action/status row is separated from details.
- Restored rows show a non-action pill:
  - `Already restored`
- Restored rows do not show an active Restore action.

Long folder IDs wrap within detail cells and do not push controls outside the panel.

## Safety

This phase has no purge semantics change.

- no Chrome purge UI
- no Chrome purge authority
- no WebDAV/cloud/relay behavior
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard delete
- no receipt deletion

## Manual Visual QA Expectation

- `Delete permanently (0)` is visible, inside the panel, right-aligned, and disabled.
- Button has distinct danger styling.
- Helper text is readable and separate from the button.
- No overlap anywhere in the Recently Deleted panel.
- Restored rows show clean `Already restored` status.
- Long folder IDs do not push controls out of frame.
- Chrome Studio has no purge button.

## Validation

Validation run:

- `node --check src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `node --check tools/validation/sync/validate-folder-purge-phase6a2c-ui-layout.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a2-ui.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a2b-ui-layout.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a2c-ui-layout.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a.mjs`
- `node tools/validation/sync/validate-folder-purge-phase6a1c.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `git diff --check`

All source/static validators passed.

## Runtime Status

Manual visual QA was not run in this pass. Expected Desktop runtime result is a contained permanent-delete action block, disabled readable `Delete permanently (0)`, separated helper text, responsive stats/detail grids, and restored rows showing a clean `Already restored` pill.
