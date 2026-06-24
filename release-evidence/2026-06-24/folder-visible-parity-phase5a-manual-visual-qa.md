# Phase 5A Manual Visual QA - Chrome/Desktop Visible Folder Parity

## Scope

Manual visual QA covers the normal folder list parity surfaces only:

- Desktop Studio Folders page
- Chrome Studio Folders page

This evidence follows Phase 5A closeout:

- `daa13b705acae21e8ed2d270ad77610cc5fdc0fb` - `docs(sync): close visible folder parity phase 5a`

## Expected Result

Desktop Studio and Chrome Studio should show the same normal folder list and count.

Runtime diagnostics already showed:

- Desktop UI display count: `14`
- Chrome display count: `14`
- Chrome stored Desktop visible set: `14`
- Desktop/Chrome diffs empty
- Chrome-only folders: `0`
- Desktop-only folders: `0`
- stale candidates: `0`
- `getFolderModel` rowCount: `14`
- stale delete/restore rows: `0`

Visual QA expectation:

- Desktop normal folder list and Chrome normal folder list visually match.
- No stale `zz-4d4-delete-restore...` folders are visible in the Chrome normal folder list.
- Desktop remains the authority for normal visible folder state.
- Chrome remains a light companion that follows Desktop visible state.
- Chrome has no delete, restore, purge, hard-delete, or tombstone authority.

## Desktop-Only Operator Surfaces

The following operator surfaces remain Desktop-only by design:

- Recently Deleted
- Folder Sync Health dashboard

Chrome does not gain full Recently Deleted, delete/restore lifecycle operator controls, purge controls, or health/operator dashboard authority.

## Safety

Safety invariants remain:

- no tombstone apply/create on Chrome
- no hard delete
- no purge
- no chat mutation
- no snapshot mutation
- no Chrome delete authority
- no Chrome restore authority

Runtime safety flags from the Phase 5A evidence remained true:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Caveat

The Desktop queue timeout is documented separately as a runtime setup/gate-state issue, not a visible parity failure.

Operator recovery remains:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

Then reload Desktop Studio with `?h2oSmokeBridge=folder-sync-rc` and confirm the smoke queue is started before running queue-backed Desktop smoke commands.

## Verdict

Phase 5A visual QA is recorded for local RC visible folder parity:

- Desktop and Chrome normal folder lists are expected to match at `14` visible folders.
- stale delete/restore smoke folders remain absent from the Chrome normal folder list.
- Desktop authority and Chrome companion boundaries remain intact.

Next step should be a local sync RC checkpoint refresh after operator acceptance. Do not move to WebDAV, purge, signing, or notarization until manual QA is accepted.
