# Phase 5A.4 - Desktop Visible Folder Adoption

## Purpose

Phase 5A.4 makes Chrome's normal folder display adopt Desktop-visible folders that are present in the stored Desktop visible-set snapshot but missing from Chrome's local display model.

This is display/adoption only. Desktop remains authoritative, and Chrome remains a light companion.

## Design

- Source of truth: stored `desktopVisibleFolderSet` imported during Desktop-to-Chrome sync.
- Display row source marker: `desktop-visible-set-display-adoption`.
- Adopted rows carry Desktop metadata only:
  - `folderId` / `id`
  - `name`
  - `color` / `iconColor`
  - `updatedAt` / imported/exported timestamps where available
- Adopted rows are marked:
  - `desktopVisibleSetImported:true`
  - `desktopDerivedDisplay:true`
  - `visibleStateOnlyAdoption:true`
  - `trustedFolderDisplay:true`
  - `shownInNormalMode:true`

## Safety

- No storage deletion.
- No tombstone create/apply.
- No Chrome delete authority.
- No Chrome restore authority.
- No hard delete.
- No purge.
- No chat mutation.
- No snapshot mutation.

Safety flags remain:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Diagnostics

`diagnoseVisibleFolderParity` now reports:

- `importedDesktopVisibleFolderCount`
- `importedDesktopVisibleFolders`
- `desktopVisibleFolderCount`
- `chromeVisibleFolderCount`
- `chromeOnlyVisibleFolderCount`
- `desktopOnlyVisibleFolderCount`
- `hiddenByDesktopVisibleSetCount`
- `candidateStaleFolderCount`

## Validation

Validation run:

- `npm run dev:all`
- `node apps/studio/desktop/build-tools/prepare-dist.mjs`
- `node --check` on changed JS/MJS files
- `node tools/validation/sync/validate-folder-visible-parity-phase5a4.mjs`
- Phase 5A.0-5A.3 visible parity validators
- Existing sync validators for delete/restore, retention, Recently Deleted UI, and Folder Sync Health
- `git diff --check`
- `git diff --cached --check`

Result: all listed static validators passed. `git diff --check` and `git diff --cached --check` passed after staging.

## Runtime Commands

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op syncNow \
  --allow-mutation \
  --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a4-desktop-visible-set-export"}' \
  --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op syncNow \
  --allow-mutation \
  --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a4-adopt-desktop-visible-folders"}' \
  --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op diagnoseVisibleFolderParity \
  --timeout-ms 60000

node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op getFolderModel \
  --timeout-ms 60000
```

## Expected Runtime Result

- `ok:true`
- `blockers:[]`
- `desktopVisibleSetStored:true`
- `importedDesktopVisibleFolderCount > 0` when Desktop-only visible folders exist
- `chromeVisibleFolderCount` moves close to `desktopVisibleFolderCount`
- `desktopOnlyVisibleFolderCount` is significantly reduced, ideally `0`
- `chromeOnlyVisibleFolderCount` remains `0` or explainable
- stale `zz-4d4-delete-restore...` folders remain absent from Chrome normal folder display

## Runtime Proof

Chrome CDP proof used port `9247`.

Desktop queue export command timed out during this run because the Desktop smoke queue was not processing. Chrome import used the latest available Desktop `latest.json` and the stored Desktop visible-set snapshot.

Compact Chrome proof after reloading the Studio Launcher extension:

```json
{
  "import": {
    "ok": true,
    "status": "sync-folder-imported",
    "blockers": [],
    "warnings": [
      "library-propagation-labels-deferred",
      "library-propagation-tombstones-deferred",
      "library-propagation-apply-events-deferred",
      "library-propagation-tags-deferred",
      "library-propagation-chat-folder-bindings-deferred",
      "deferred-field-present"
    ]
  },
  "diagnostic": {
    "ok": true,
    "status": "visible-folder-parity-diagnosed",
    "blockers": [],
    "desktopVisibleSetStored": true,
    "desktopVisibleFolderCount": 14,
    "chromeVisibleFolderCount": 14,
    "chromeOnlyVisibleFolderCount": 0,
    "desktopOnlyVisibleFolderCount": 0,
    "importedDesktopVisibleFolderCount": 10,
    "hiddenByDesktopVisibleSetCount": 36,
    "candidateStaleFolderCount": 0,
    "noTombstoneApplyOnChrome": true,
    "noTombstoneCreateOnChrome": true,
    "noHardDelete": true,
    "noPurge": true,
    "noChatDelete": true,
    "noSnapshotDelete": true
  },
  "folderModel": {
    "ok": true,
    "status": "folder-model-read",
    "rowCount": 14,
    "canonicalRowCount": 14,
    "displayModelAvailable": true,
    "desktopAdoptedRows": 10,
    "staleDeleteRestoreRows": 0
  }
}
```

Verdict: Phase 5A.4 is runtime-green for Chrome display adoption. Chrome normal folder display now matches the stored Desktop visible set without granting Chrome delete, restore, purge, hard-delete, tombstone, chat, or snapshot authority.
