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

## R3 — Chrome to Desktop Export Gate

This gate (R3) extends the existing Desktop to Chrome R2D path with a strictly one-way Chrome to Desktop export channel. R3 narrowly scopes exactly one prohibition from the original R2D Guardrails — "Chrome must not write to the sync folder" — replacing it with "Chrome must not write `latest.json`; Chrome may write only `chrome-latest.json` and `chrome-latest.json.tmp` from a user-gesture extension page." All other R2D prohibitions remain in force. The Desktop side is unchanged at the writer level and gains only a recognition rule for a new filename on the read path through the existing `importBundle` merge-only flow. No schema change, no wire-format change, no bidirectional resolver, no polling, no background daemon, and no Native UI change is introduced or implied by this gate. This amendment is policy and design only; no runtime code is being landed here.

- Scope: Chrome to Desktop export of a `h2o.studio.fullBundle.v2` payload via the existing sync folder, user-gesture initiated from the Studio Launcher extension page, merge-imported by Desktop folder-sync.
- Out of scope: bidirectional conflict resolution, background daemon writes, polling, schema or wire-format change, Native UI change, cloud, WebDAV, or mobile sync.
- Contract surface for any later implementation is already proof-pinned by `validate-studio-import-bundle.mjs` (23/23) and `validate-studio-library-actions.mjs`; this gate does not move those pins.

### 1. Filename scheme

- Desktop owns `latest.json`. Desktop continues writing `latest.json` exactly as today; nothing about Desktop's writer changes.
- Chrome owns `chrome-latest.json`. Chrome writes the full-bundle payload to `chrome-latest.json` in the same user-selected sync folder.
- Chrome stages writes through a sibling temp file `chrome-latest.json.tmp` and finalizes with a rename to `chrome-latest.json`, mirroring Desktop's existing temp-then-rename atomic-write discipline.
- Two distinct filenames give a no-collision guarantee at the filesystem level: no code path on either side ever opens the other side's file for write, so there is no shared writer, no last-writer-wins race, and no cross-process lock is required.
- Desktop never writes `chrome-latest.json` or `chrome-latest.json.tmp`. Chrome never writes `latest.json` or any temp variant of it.
- The sync folder therefore holds at most two bundle files under this gate: Desktop-owned `latest.json` and Chrome-owned `chrome-latest.json` (plus transient `chrome-latest.json.tmp` during a Chrome write).
- Filename alone is sufficient to attribute origin; the bundle itself remains an unchanged `h2o.studio.fullBundle.v2` payload.

### 2. Conflict policy

- No shared writer. Desktop is the sole writer of `latest.json`. Chrome is the sole writer of `chrome-latest.json` and `chrome-latest.json.tmp`. This is enforced by the filename scheme in section 1 and by code-review policy, not by a runtime resolver.
- Desktop must never overwrite `chrome-latest.json`. Chrome must never overwrite `latest.json`.
- Desktop merge-imports `chrome-latest.json` through the existing folder-sync `importBundle` merge-only path. No new merge logic, no new dedup pass, no new conflict-resolution code, and no new merge mode is introduced.
- Duplicate records are handled by the existing `importBundle` contract:
    - Chats, categories, labels, and snapshots use skip-if-exists semantics; a chat already present on Desktop that also appears in `chrome-latest.json` is left as-is on Desktop.
    - Folders use merge-upsert semantics by design.
- These dedup and merge points are proof-pinned by `validate-studio-import-bundle.mjs` at 23/23 and gate any future implementation. Any change to `importBundle` merge semantics is out of scope for R3 and would require its own gate.
- There is still no bidirectional conflict resolver. The export direction is merge-only into Desktop; Desktop's own state is the source of truth for `latest.json`, and Chrome's contribution is additive via `chrome-latest.json`.

### 3. Trigger model

- Allowed now:
    - Manual export button surfaced on the Studio Launcher extension page, initiated by an explicit user gesture (button click). The button is rendered in an opt-in section alongside the existing auto-sync controls, never above them and never auto-enabled.
    - Optional event-triggered export from the same extension page, but only after explicit user opt-in. Implementation of the event-triggered variant MAY be deferred to a later phase without re-opening this gate.
- Not allowed in this gate:
    - Background-only service-worker folder writes.
    - Hidden auto-write at install, startup, focus, or any non-user-gesture event.
    - Polling of any kind on either side.
    - Bidirectional sync, including any Chrome write that depends on reading `latest.json` first.
    - Any Chrome write to `latest.json`. Chrome writes `chrome-latest.json` only.

### 4. Permission flow

- The directory handle for the sync folder is selected from a Window context (the Studio Launcher extension page), never from the MV3 service worker.
- The extension page requests, and re-requests on each session as required, `readwrite` permission on the user-selected sync folder with an active user gesture. If the user does not grant `readwrite`, the write is aborted, no temp file is left behind, and a user-visible error is surfaced on the extension page; no fallback write is attempted.
- The MV3 service worker cannot call `showDirectoryPicker` or `createWritable` directly and must not attempt to. It has no path to the file system in this gate.
- The MV3 service worker MAY produce the `h2o.studio.fullBundle.v2` payload (mirroring the existing producer responsibility) but MUST hand the payload to the extension page for the actual file write.
- The producer-to-writer contract is a `chrome.runtime` message between the service worker (producer) and the extension page (writer): the service worker sends the prepared bundle, the extension page resolves the directory handle, verifies `readwrite`, writes `chrome-latest.json.tmp`, and renames to `chrome-latest.json`. The extension page is the sole holder of the writable handle. The wire format is unchanged — the same `h2o.studio.fullBundle.v2` already proven by R2D's import direction.
- The Chrome-side API surface introduced by this gate mirrors the existing autoExport shape: `H2O.Studio.sync.autoImport.*` on the Chrome side parallels the Desktop-facing `autoExport.*` surface, with `autoImport.exportNow()` as the manual entry point invoked by the Studio Launcher button and `autoImport.isEnabled()` / `autoImport.enable()` reserved for the opt-in event-triggered path.

### 5. Desktop import path

- Desktop folder-sync recognizes `chrome-latest.json` as a Chrome-origin bundle alongside the existing `latest.json` recognition.
- Import is routed through the existing `importBundle` merge-only path. No new importer, no new schema branch, no new merge mode, and no new dedup pass is added.
- No archive DB schema change. No wire-format change.
- The Chrome-origin source is inferred from the filename (`chrome-latest.json`), with bundle metadata already carried in `h2o.studio.fullBundle.v2` available as a secondary signal; no new metadata field is required.
- A manual `scanNow` from Desktop is acceptable as the first user-triggered import path under this gate. No watcher and no polling is required for R3; if a watcher is added later it is a separate gate.
- Desktop never writes to `chrome-latest.json` during or after import. The file remains Chrome-owned.
- The Desktop to Chrome path via `latest.json` is unchanged; importing `chrome-latest.json` is additive and does not alter how `latest.json` is produced or consumed.

### 6. Rollback

- A feature flag gates the Chrome folder write path. When the flag is off:
    - The Studio Launcher extension page does not expose the manual export button (or it is rendered disabled with a clear off-state).
    - The extension page does not request `readwrite` on the sync folder for export purposes.
    - Chrome performs no write of `chrome-latest.json` or `chrome-latest.json.tmp` under any code path.
    - The MV3 service worker still does not write to the sync folder; that prohibition never depended on the flag.
- Fallback workflow when the flag is off:
    - User exports a bundle via the existing `#/migrate/export` flow in Studio (manual download).
    - User moves the downloaded file into the sync folder by hand, naming it as the existing manual workflow already documents.
    - Desktop folder-sync picks it up on the next manual `scanNow` through the same `importBundle` merge-only path.
- The existing Desktop to Chrome R2D path (Desktop writes `latest.json`, Chrome imports `latest.json`) is unchanged whether the flag is on or off, and is unaffected by any regression in the Chrome write path. R2D continues to ship independently; disabling R3 cannot regress R2D.
- Rollback requires no data migration; `chrome-latest.json` on disk is inert once writes stop, and any already-imported records on Desktop remain valid under the existing schema.

### 7. Validation requirements for later implementation

When the runtime implementation lands in a subsequent gate, it must satisfy all of the following before the feature flag is turned on in a release:

- The export payload is a valid `h2o.studio.fullBundle.v2` bundle, byte-identical in shape to the bundle Desktop already produces. No new wire format.
- The write uses temp-then-rename: write to `chrome-latest.json.tmp`, then rename to `chrome-latest.json`, matching Desktop's atomic-write discipline so Desktop never observes a partially written file.
- A Desktop import dry-run against the produced `chrome-latest.json` succeeds end-to-end through the existing `importBundle` merge-only path, with no schema errors, no schema migration required, and no unexpected upserts.
- `validate-studio-import-bundle.mjs` passes at 23/23, confirming the skip-if-exists and merge-upsert contract points are unchanged against bundles produced by Chrome.
- `validate-studio-library-actions.mjs` passes against the post-import Desktop state, confirming Library-level action semantics are unchanged.
- The runtime import graph remains clean: no new cross-context imports from the MV3 service worker into Window-only File System Access APIs, no new cross-surface imports between the MV3 service worker and the extension page beyond the `chrome.runtime` message contract described in section 4, and no new Desktop-side reads of Chrome extension storage.
- No prohibition listed in the original R2D Guardrails section is violated other than the narrowly scoped lift of "Chrome must not write to the sync folder," which is replaced by "Chrome must not write `latest.json`; Chrome may write only `chrome-latest.json` and `chrome-latest.json.tmp` from a user-gesture extension page."

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
