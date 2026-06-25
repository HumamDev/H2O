# Phase 6A.2 - Recently Deleted purge UI visual QA closeout

## Implementation Commits

- `f9b4ddb3a9a766bf835fafd4a1f2129c7494afdd` - `feat(sync): add recently deleted purge button`
- `894ddf60f5dd011c30570881ee195c72f018b585` - `fix(sync): polish recently deleted purge layout`
- `8a30e3dd00ef7c10ac63f7ac01939f12f323cb99` - `fix(sync): redesign recently deleted purge layout`

## Manual Visual QA Result

Desktop Folders -> Recently Deleted panel:

- Shows `RECENTLY DELETED · 11`.
- Permanent Delete block is contained inside the panel.
- `Delete permanently (0)` is visible, disabled, and styled as a distinct destructive/danger action.
- Helper text `No purge-eligible deleted folders.` is separate and readable.
- No text/button overlap remains.

Stats grid:

- `Active 0`
- `Restored 11`
- `Purge blocked 11`
- `Expired 0`
- `Purge eligible 0`
- `Retention 30d`

Status chips:

- `Purge deferred`
- `Hard delete blocked`
- `Retention enforcement deferred`

Rows:

- Restored row cards are clean.
- `Already restored` appears as a clear non-action pill.
- Restore action is not active for restored rows.

Chrome:

- Chrome Studio has no purge button.
- Chrome has no purge authority.

## Safety Invariants

- No Chrome purge UI.
- No Chrome delete/restore authority.
- No chat deletion.
- No snapshot deletion.
- No asset deletion.
- No hard folder-row deletion.
- No receipt deletion.

## Verdict

Phase 6A.2 Recently Deleted purge UI is visually accepted for the current local/Desktop scope. The current runtime state has no purge-eligible active deleted folder tombstones, so the destructive action is visible but disabled.
