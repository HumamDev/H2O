# Phase 5A Closeout - Chrome/Desktop Visible Folder Parity

## Verdict

Phase 5A is functionally closed for local RC visible folder parity.

Chrome and Desktop normal folder lists are now aligned around one canonical visible folder projection. Desktop remains authoritative, and Chrome remains a light companion that follows the imported Desktop visible set without gaining delete, restore, purge, hard-delete, or tombstone authority.

## Original Problem

Manual visual QA found that Desktop and Chrome folder lists diverged:

- Chrome showed stale test folders, including old `zz-4d4-delete-restore...` rows.
- After initial Chrome-side hide/filter/adoption fixes, Chrome then matched the exported Desktop visible set while Desktop UI still under-showed compared with `latest.json`.
- The root issue was split source precedence: Desktop UI could still prefer a stale `folder-state` mirror, while Desktop export and Chrome followed the Desktop visible export path.

## Completed Chain

- `177619b` - Phase 5A.0 visible folder parity diagnostics.
- `fe4268c` - Phase 5A.1 Desktop visible set storage in Chrome.
- `6d5a564` - Phase 5A.2 Chrome visible-state hide overlay.
- `8bdd437` - Phase 5A.3 Chrome display filtering.
- `bc7d1ff` - Phase 5A.4 Chrome Desktop-visible adoption.
- `4e0ec28` - Phase 5A.4 runtime closeout evidence.
- `4ddf2f2` - Desktop queue timeout recovery documentation.
- `d2fb0d5` - Phase 5A.5 canonical visible set alignment.

## Final Architecture

Canonical normal folder visibility is:

```text
Desktop authoritative visible folder store
  -> Desktop UI normal folder projection
  -> Desktop latest.json visible folder export
  -> Chrome stored Desktop visible set
  -> Chrome normal folder projection
```

Desktop canonical visible source:

- `H2O.Studio.store.folders.list()`
- active tombstone / hidden-state safety filters applied
- system rows such as Unfiled handled separately where needed
- duplicate semantic names are not collapsed by name; different folder IDs remain distinct unless hidden/tombstoned/review-only

Fallback mirror policy:

- Stored `folder-state` mirror can fill metadata/bindings.
- Stored `folder-state` mirror is not visible-row authority on Desktop.
- Fallback-only mirror rows are not exported as normal visible folders.

Chrome policy:

- Chrome stores the imported Desktop visible set.
- Chrome hides stale Chrome-only rows from normal display by visible-state overlay only.
- Chrome adopts Desktop-visible rows for display only.
- Chrome does not delete, restore, create/apply tombstones, purge, or mutate chats/snapshots.

## Final Runtime Result

After Phase 5A.5 and Chrome Studio reload on CDP port `9247`:

`diagnoseCanonicalVisibleFolderSet`:

- `ok:true`
- `status:"canonical-visible-folder-set-diagnosed"`
- `desktopUiDisplayCount:14`
- `chromeDisplayCount:14`
- `chromeStoredDesktopVisibleSetCount:14`
- `desktopUiOnly:[]`
- `desktopExportOnly:[]`
- `chromeOnly:[]`
- `latestOnly:[]`
- `hiddenButExported:[]`
- `visibleButNotExported:[]`

`diagnoseVisibleFolderParity`:

- `ok:true`
- `desktopVisibleFolderCount:14`
- `chromeVisibleFolderCount:14`
- `chromeOnlyVisibleFolderCount:0`
- `desktopOnlyVisibleFolderCount:0`
- `candidateStaleFolderCount:0`
- stale delete/restore rows remained hidden from the normal model

`getFolderModel`:

- `ok:true`
- `status:"folder-model-read"`
- `rowCount:14`
- `canonicalRowCount:14`
- `displayModelAvailable:true`

## Safety Invariants

Phase 5A preserved:

- no Chrome delete authority
- no Chrome restore authority
- no tombstone apply/create on Chrome
- no hard delete
- no purge
- no chat mutation
- no snapshot mutation
- no WebDAV/cloud/relay implementation

Runtime safety flags remained true:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Caveat

The latest fresh Desktop queue export attempt timed out:

- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`

This is documented as a runtime/operator gate-state issue, not a product parity code issue. The Chrome proof used the latest available Desktop `latest.json` and stored Desktop visible-set state, and the prepared Desktop/Studio Launcher assets contained the Phase 5A.5 markers.

Operator recovery remains:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

Then open/reload Desktop Studio with:

```text
?h2oSmokeBridge=folder-sync-rc
```

and set:

```js
localStorage.setItem("h2o:studio:smoke-bridge:enabled:v1", "folder-sync-rc");
```

Confirm:

```js
H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true
```

## Evidence Inventory

- `release-evidence/2026-06-24/folder-visible-parity-phase5a0-diagnostics.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a1-desktop-visible-set.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a2-visible-hide.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a3-display-filter.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a4-desktop-visible-adoption.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a4-runtime-closeout.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a4-desktop-queue-timeout-followup.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a5-canonical-visible-set.md`

## Recommendation

Next phase should be:

1. Manual visual QA evidence for Desktop and Chrome folder list parity.
2. Local sync RC checkpoint refresh after visual QA is accepted.

Do not move to WebDAV/cloud/relay, purge/hard delete, public signing, or notarization until manual QA accepts the current local sync milestone.
