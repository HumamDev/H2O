# Desktop to Chrome Sync R2D Gate

## Status

R2D records the current one-way Desktop to Chrome Studio sync gate.

Gate decision: the Desktop to Chrome sync path is proven for controlled local
use. It is not a bidirectional sync system, not a background daemon, and not a
cloud/mobile sync layer.

## Checkpoints

- R1: `ff5bd99f1e4d2d5e33ebb953285ee1278d019e2f`
- R2A-1: `4d7eaa4b72961996816f2c19775d578764d77772`
- R2A-2: `f429275be09856c19467346f245fa62d0e7e25e3`
- R2B: `2f52b8e9166a04e0353908f25e7f8505e1c22d20`
- R2C: `0959e3a2c4dcc157f226aa6b076e1f2685d137a0`

## Proven End to End

- Desktop Studio can export a Chrome-compatible `h2o.studio.fullBundle.v2`
  bundle from the Desktop SQLite-backed public Studio store adapters.
- Desktop Studio can write the current bundle to:
  `~/H2O Studio Sync/latest.json`
- The Desktop latest bundle write is atomic:
  `.latest.json.tmp` is written first and then renamed to `latest.json`.
- Desktop opt-in auto-export can update `latest.json` after Library data
  changes.
- Chrome Studio Launcher can connect to the same folder with the File System
  Access API.
- Chrome Studio stores the connected directory handle locally in IndexedDB.
- Chrome Studio can manually run `syncNow()` to read `latest.json`.
- Chrome Studio validates the full-bundle schema before import.
- Chrome Studio imports through the existing full-bundle merge import flow.
- Chrome Studio refreshes `H2O.LibraryIndex` after import.
- Chrome safe auto-sync can run only while Studio is open, visible, or focused,
  and only after explicit opt-in.
- Repeated sync attempts are throttled or skipped safely.
- Chrome does not write to the sync folder.

Runtime evidence recorded during R phases:

- Desktop latest export wrote `300174` bytes.
- Desktop bundle contained `7` chats, `4` snapshots, and `36` turns.
- Chrome rows after sync: `4`.
- Saved Chats rows were restored or remained at `4`.

## Current APIs

Desktop export APIs:

- `H2O.Studio.ingestion.exportFullBundle(options?)`
- `H2O.Studio.ingestion.exportLatestSyncBundle(options?)`

Desktop opt-in auto-export API:

- `H2O.Studio.sync.autoExport.enable()`
- `H2O.Studio.sync.autoExport.disable()`
- `H2O.Studio.sync.autoExport.isEnabled()`
- `H2O.Studio.sync.autoExport.schedule(reason)`
- `H2O.Studio.sync.autoExport.flushNow(reason)`
- `H2O.Studio.sync.autoExport.diagnose()`

Chrome sync-folder API:

- `H2O.Studio.sync.folder.connectFolder()`
- `H2O.Studio.sync.folder.disconnectFolder()`
- `H2O.Studio.sync.folder.hasFolder()`
- `H2O.Studio.sync.folder.status()`
- `H2O.Studio.sync.folder.syncNow(options?)`
- `H2O.Studio.sync.folder.enableAutoSync()`
- `H2O.Studio.sync.folder.disableAutoSync()`
- `H2O.Studio.sync.folder.isAutoSyncEnabled()`
- `H2O.Studio.sync.folder.scheduleAutoSync(reason)`
- `H2O.Studio.sync.folder.diagnose()`

## Persisted State

Desktop:

- `h2o:sync:autoexport:enabled:v1`
- `h2o:sync:autoexport:diagnostics:v1`

Chrome:

- `h2o:sync:folder-import:state:v1`

Chrome also stores the connected `FileSystemDirectoryHandle` in IndexedDB:

- DB: `h2o.studio.sync.folder.mv3`
- Store: `handles`
- Key: `sync-folder`

## Sync Boundaries

Allowed now:

- Desktop writes `~/H2O Studio Sync/latest.json`.
- Chrome reads `~/H2O Studio Sync/latest.json` after the user connects the
  folder.
- Chrome imports in merge mode only.
- Chrome safe auto-sync may run while Studio is open, visible, or focused after
  explicit opt-in.

Explicitly not allowed at this gate:

- Chrome must not write to the sync folder.
- Chrome must not mutate Desktop data.
- Desktop must not read Chrome extension storage.
- There is no bidirectional conflict resolver.
- There is no service-worker background daemon sync.
- There is no cloud, WebDAV, or mobile sync.
- The archive DB schema is unchanged.
- Chrome import logic is unchanged.

## Safe User Workflow

1. Desktop writes or auto-exports `~/H2O Studio Sync/latest.json`.
2. Chrome Studio Launcher connects the `H2O Studio Sync` folder once.
3. Chrome Studio runs `H2O.Studio.sync.folder.syncNow()`, or the user enables
   safe auto-sync and lets focus/visibility triggers schedule a sync check.
4. Chrome Studio imports through the existing merge path.
5. Saved Chats and Library views refresh from `H2O.LibraryIndex`.

## Deferred Behavior

- Bidirectional sync is deferred.
- Chrome write-back to the sync folder is deferred.
- Desktop import-from-Chrome sync is deferred.
- Background/service-worker daemon sync is deferred.
- Interval polling is deferred.
- Cloud, WebDAV, and mobile sync are deferred.
- Cross-device conflict resolution is deferred.
- A full product UI for sync setup/status is deferred.

## Risks

- The File System Access directory handle can lose permission and require
  reconnect.
- `latest.json` is a single-file handoff; if it is replaced while Chrome reads,
  Chrome relies on Desktop's atomic write discipline.
- Merge import is safe for repeated imports, but it is not a delete or conflict
  propagation mechanism.
- Linked-only chats can exist in the bundle but do not become Saved Chats unless
  they include snapshots.
- Chrome and Desktop remain separate storage origins and databases.
- The current system has no cross-device identity, version vector, or conflict
  policy beyond merge/import skipping.
- The current safe auto-sync runs only in an open Studio page; closing Studio
  stops Chrome-side sync checks.

## Guardrails

- Keep Chrome read-only with respect to the sync folder until bidirectional
  semantics are designed.
- Keep imports in merge mode until conflict handling is explicit.
- Keep Desktop auto-export opt-in.
- Keep Chrome auto-sync opt-in.
- Do not add interval polling without a separate battery/performance and
  duplicate-import design.
- Do not add cloud/mobile/WebDAV sync until the local one-way model has a
  documented conflict strategy.
- Do not change archive DB schema as part of sync-trigger work.

## Recommended Next Phase

Recommended next phase: add a small Studio Settings/status surface for the
existing sync controls.

The UI should expose only current capabilities:

- Desktop: manual latest export and opt-in auto-export status.
- Chrome: connect/disconnect folder, manual `syncNow`, opt-in safe auto-sync,
  last status, last error, and reconnect-required state.

The UI should not add new sync behavior. It should not add bidirectional sync,
Chrome folder writes, cloud/mobile sync, or polling.

Bidirectional sync should wait until a separate design defines ownership,
delete propagation, conflict resolution, and per-record version semantics.
