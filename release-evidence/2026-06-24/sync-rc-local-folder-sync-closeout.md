# Sync RC Local Folder Sync Closeout

Date: 2026-06-24

## Decision

Local Chrome <-> Desktop folder sync for create, rename, and color is RC-green.

No blockers remain for the local folder sync create/rename/color loop. Both dev-surface and packaged/local app evidence passed.

## Evidence Summary

Completed evidence:

- Dev read-only smoke: green.
- Dev manual create/rename/color mutation proof: green.
- Dev combined mutation runner: green.
- Packaged/local Desktop smoke gate: green.
- Packaged/local read-only smoke: green.
- Packaged/local mutation smoke: green.

Relevant commits:

- `22f93e6 fix(sync): harden mutation smoke runner sequencing`
- `e34851d docs(sync): record mutation smoke runner green result`
- `d007d80 docs(sync): record packaged local rc smoke`

## Current RC Status

- Chrome and Desktop read-only folder models converge in the local sync lane.
- Chrome-created folders propagate to Desktop.
- Desktop renames propagate to Chrome.
- Chrome color changes propagate to Desktop.
- Desktop color changes propagate to Chrome.
- Final Chrome/Desktop row parity matched in packaged/local RC smoke.
- Desktop packaged smoke bridge was available in the rebuilt local Tauri app.
- Chrome CDP helper drove Chrome Studio against the same local sync folder.

## Non-Blocking Warnings

Deferred/non-blocking warnings remain for:

- labels
- tags
- tombstones
- chat-folder bindings
- source metadata
- approved simultaneous conflict notes

These are not blockers for the local create/rename/color RC decision because final parity matched and the warnings map to deferred or explicitly approved surfaces.

## Out Of Scope

This closeout does not cover:

- public Developer ID signing
- notarization
- WebDAV/cloud/relay transport adapters
- delete/tombstone expansion beyond the already proven safe loop
- restore/re-show/purge lifecycle
- labels/categories sync

## Recommended Next Phases

1. Optional cleanup of accumulated smoke test folders.
2. Separate delete/restore lifecycle phase if desired.
3. Public release/signing lane only after product decision.

## Verdict

The local Chrome <-> Desktop folder sync create/rename/color loop is ready for RC classification. Remaining work is either cleanup, a separately scoped delete/restore lifecycle phase, or a public release/signing decision lane.
