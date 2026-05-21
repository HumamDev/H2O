# Multi-Peer Readiness F4.x - Peer Discovery Diagnostics

F4.x adds a Desktop-only, read-only diagnostic API for inspecting the F4 local
transport mirror layout:

```text
~/H2O Studio Sync/devices/<safePeerDir>/latest.json
~/H2O Studio Sync/devices/<safePeerDir>/latest.sha256
~/H2O Studio Sync/devices/<safePeerDir>/state.json
```

The F4 root contract is unchanged. `~/H2O Studio Sync/latest.json` remains the
R-phase canonical file, and Chrome continues to read the root `latest.json`
path. F4.x does not import, apply, write, poll, create manifests, create
history, or mutate `chrome.storage`.

## Scope

- Desktop Studio first.
- Manual developer diagnostics through `H2O.Studio.peerDiscovery`.
- Read `devices/*/state.json`.
- Read `devices/*/latest.sha256`.
- Optionally read and hash `devices/*/latest.json` for sidecar verification.
- Return metadata and integrity status only.

## Non-goals

- No bidirectional sync.
- No Chrome write-back.
- No Desktop ingestion of another peer into SQLite.
- No tombstones or delete propagation.
- No conflict resolution.
- No WebDAV or mobile transport.
- No background polling.
- No `manifest.json`.
- No `history/`.
- No change to root `latest.json` export/import behavior.

## API

```js
await H2O.Studio.peerDiscovery.scan()
await H2O.Studio.peerDiscovery.scan({ verifyLatest: true })
await H2O.Studio.peerDiscovery.scan({ verifyLatest: false })
await H2O.Studio.peerDiscovery.scan({ includeSensitive: true })
H2O.Studio.peerDiscovery.diagnose()
```

`scan()` defaults to:

```js
{ verifyLatest: true, includeSensitive: false }
```

`verifyLatest: true` reads `latest.json` only to compute its SHA-256 and compare
that value to `latest.sha256`. The bundle body is not parsed and is not returned
in the report.

## Report schema

Top-level report schema:

```js
{
  schema: 'h2o.studio.peer-discovery.report.v1',
  generatedAt,
  rootPath: '~/H2O Studio Sync',
  devicesPath: '~/H2O Studio Sync/devices',
  peerCount,
  verifyLatest,
  redacted,
  peers: [],
  summary: {
    okPeers,
    warningPeers,
    errorPeers,
    shaMismatchCount,
    missingLatestCount,
    missingStateCount,
    missingShaCount,
    malformedStateCount
  },
  errors: [],
  warnings: [],
  durationMs,
  ok
}
```

Each peer report includes:

```js
{
  peerKey,
  safePeerDirRedacted,
  syncPeerIdRedacted,
  syncPeerIdPresent,
  safePeerDirPresent,
  safePeerDirMatchesState,
  safePeerDirMatchesSyncPeerId,
  surfaceKind,
  appKind,
  storeKind,
  sequenceNumber,
  lastExportId,
  lastExportedAt,
  stateOk,
  stateSchema,
  latestExists,
  shaExists,
  shaMatches,
  stateShaMatchesSidecar,
  latestSha256,
  sidecarSha256,
  lastFileSha256,
  errors,
  warnings
}
```

When `includeSensitive: true` is passed, each peer additionally includes the
full `syncPeerId` and `safePeerDir`. This is intended for developer console
diagnostics only.

## Redaction

Default output redacts identifiers derived from install identity:

- Full `syncPeerId` is omitted.
- Full `safePeerDir` is omitted because it is `encodeURIComponent(syncPeerId)`.
- `peerKey` is a short SHA-256-derived identifier for correlation.
- `syncPeerIdRedacted` keeps only non-install facets when the standard
  `surfaceKind:appKind:storeKind:installId` shape is present.

Visible UI should use default redacted output. Full identifiers are only for
explicit developer console requests with `includeSensitive: true`.

## Capabilities

No new Tauri capability is required in the current repo state. Desktop already
has read/list permission for `$HOME/**` from the existing manual sync path:

```json
{ "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$HOME/**" }] }
{ "identifier": "fs:allow-read-dir", "allow": [{ "path": "$HOME/**" }] }
```

If these are tightened later, F4.x only needs read/list access under:

```text
$HOME/H2O Studio Sync/devices/**
```

## Validation

After a successful F4 export, run in Desktop Studio DevTools:

```js
await H2O.Studio.peerDiscovery.scan({ includeSensitive: true })
```

Expected for the current single-peer layout:

- `ok === true`.
- `peerCount === 1`.
- `summary.okPeers === 1`.
- `summary.errorPeers === 0`.
- Peer `stateSchema === 'h2o.studio.sync.peer-state.v1'`.
- Peer `stateOk === true`.
- Peer `latestExists === true`.
- Peer `shaExists === true`.
- Peer `shaMatches === true`.
- Peer `stateShaMatchesSidecar === true`.
- No bundle messages or content appear in the report.

Safety checks:

- No files are written.
- No `chrome.storage` keys are created.
- No import functions are called.
- Root `~/H2O Studio Sync/latest.json` remains unchanged.
- Chrome root sync continues to read root `latest.json`.

## Rollback

Rollback is source-only:

- Remove `src-surfaces-base/studio/sync/peer-discovery.js`.
- Remove the `studio.html` script tag.
- Remove `pack-studio.mjs` entries.
- Revert scoped read capabilities only if a future phase added them.

No data cleanup is required because F4.x is read-only.
