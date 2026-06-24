# Phase 5A.4 Desktop Queue Timeout Follow-Up

Date: 2026-06-24

## Verdict

No Phase 5A.4 product code fix was required. The fresh Desktop export was blocked because the active Desktop runtime did not process the scoped smoke command file within the queue timeout. The Desktop smoke queue source, scoped filesystem paths, Tauri capability validation, and Chrome visible parity behavior remain valid.

This is an operator/runtime recovery issue: the Desktop WebView must be opened or reloaded with the folder-sync smoke gate enabled so `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true` and the registry gates report `desktop-studio` / `tauri`.

## Runtime Findings

Desktop queue client command:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000
```

Result:

```json
{
  "ok": false,
  "status": "desktop-queue-timeout",
  "blockers": ["desktop-queue-timeout"],
  "commandPath": "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
}
```

Follow-up filesystem check:

```json
{
  "commandFileAfterClear": "missing",
  "resultsDirPresent": true,
  "priorDesktopQueueResultsPresent": true
}
```

Process check showed a dev Desktop process was still present:

```text
npm run tauri:dev
tauri dev
target/debug/h2o-studio-desktop
```

But port `1430` was not listening, so the requested `http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders` route was not available in this runtime. The likely state is an already-open Tauri WebView that was not currently loaded with the smoke URL flag and/or localStorage opt-in, so the queue did not start or was disabled by registry gates.

## Source Validation

The Desktop queue implementation remains scoped and gate-protected:

```sh
node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-queue.mjs
```

Result:

```json
{
  "ok": true,
  "validator": "validate-folder-sync-rc-smoke-desktop-queue",
  "queuePathScoped": true,
  "tauriFsScope": "$HOME/H2O Studio Sync/.h2o-smoke",
  "dispatcher": "H2O.Studio.devSmoke.folderSync.run"
}
```

Syntax checks:

```sh
node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-desktop-queue.tauri.js
node --check tools/smoke/desktop-folder-sync-queue-client.mjs
```

Result: passed.

## Chrome Phase 5A.4 Proof Still Green

Chrome was rerun against the latest available Desktop visible-set state:

```json
{
  "import": {
    "ok": true,
    "status": "sync-folder-imported",
    "blockers": []
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

## Operator Recovery

Use these steps before the next fresh Desktop export:

1. Open or reload Desktop Studio with the smoke URL flag:

```text
tauri://localhost/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders
```

For a dev-server-backed runtime, use the equivalent route:

```text
http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders
```

2. In Desktop DevTools, enable the local smoke opt-in and reload:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc');
const u = new URL(location.href);
u.searchParams.set('h2oSmokeBridge', 'folder-sync-rc');
location.href = u.toString();
```

3. Confirm the queue is running:

```js
H2O.Studio.devSmoke.folderSyncQueue.diagnose()
```

Expected:

```json
{
  "enabled": true,
  "started": true,
  "inFlight": false,
  "gates": {
    "enabled": true,
    "surface": "desktop-studio",
    "adapter": "tauri",
    "blockers": []
  }
}
```

4. Clear any stale command file:

```sh
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

5. Re-run queue health and export:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseHealth --timeout-ms 60000
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"queue-timeout-recovery-export"}' --timeout-ms 60000
```

Expected:

```json
{
  "ok": true,
  "status": "latest-sync-bundle-written",
  "blockers": []
}
```

## Safety

The follow-up did not change product sync behavior and did not add any destructive capability.

Preserved invariants:

- `noTombstoneApplyOnChrome:true`
- `noTombstoneCreateOnChrome:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- no WebDAV/cloud/relay changes
- no Chrome delete/restore authority changes
