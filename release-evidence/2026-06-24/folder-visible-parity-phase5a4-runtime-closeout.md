# Phase 5A.4 Runtime Closeout - Chrome Visible Folder Parity

## Scope

Phase 5A.4 is evidence/docs closeout only for:

- Chrome normal folder display adoption of Desktop-visible folders.
- Desktop remains authoritative.
- Chrome remains a light companion.
- No Chrome delete authority.
- No Chrome restore authority.
- No tombstone create/apply on Chrome.
- No hard delete.
- No purge.
- No chat or snapshot mutation.

Implementation commit:

- `bc7d1ffe380e12bc278ae9ce9f03707a105d867e` - `fix(sync): show desktop visible folders in chrome`

## Commands Run

Confirmed current implementation HEAD:

```bash
git rev-parse --short HEAD
git log -1 --oneline
```

Cleared stale Desktop smoke command:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

Checked Desktop smoke queue health:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
```

Result:

```json
{
  "ok": false,
  "status": "desktop-queue-timeout",
  "blockers": ["desktop-queue-timeout"],
  "nextAction": "Open Desktop Studio with ?h2oSmokeBridge=folder-sync-rc, set localStorage h2o:studio:smoke-bridge:enabled:v1 to folder-sync-rc, and confirm H2O.Studio.devSmoke.folderSyncQueue.diagnose().started is true."
}
```

Because the Desktop queue was unavailable, no fresh Desktop export was queued. The timed-out command file was cleared again to avoid contaminating later manual smoke runs.

Chrome import/parity/model proof used Chrome CDP port `9247` and the latest available Desktop `latest.json` / stored Desktop visible-set state:

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op syncNow \
  --allow-mutation \
  --payload-json '{"direction":"desktop-to-chrome","reason":"phase5a4-closeout-import"}' \
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

## Runtime Result

Compact parsed result:

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

## Verdict

Phase 5A.4 remains runtime-green for Chrome display adoption against the latest available Desktop visible-set state.

Chrome normal folder display now matches Desktop visible folder count:

- Desktop visible folders: `14`
- Chrome visible folders: `14`
- Chrome-only visible folders: `0`
- Desktop-only visible folders: `0`
- Desktop-derived adopted display rows: `10`
- Candidate stale folders: `0`
- stale `zz-4d4-delete-restore...` rows in normal model: `0`

Safety invariants remain true:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Caveat

The Desktop smoke queue was unavailable during this closeout pass (`desktop-queue-timeout`), so this pass did not produce a fresh Desktop export. Chrome proof used the latest available Desktop `latest.json` and the stored Desktop visible-set snapshot. Re-run the Desktop export step when Desktop Studio is open with the smoke bridge queue enabled to refresh the Desktop export timestamp.
