# Multi-Peer Readiness - F4 (Per-Peer Local Transport Mirror)

## Status

F4 adds an additive, producer-side filesystem mirror for the Desktop latest
export. The R-phase canonical file remains:

```text
~/H2O Studio Sync/latest.json
```

Chrome continues to read that root `latest.json`. F4 does not add Chrome
reads or writes under `devices/`, does not add bidirectional sync, and does
not change the full-bundle schema.

## Layout

After the root export commits, Desktop mirrors the exact same file bytes into
a per-peer directory:

```text
~/H2O Studio Sync/devices/<safePeerDir>/latest.json
~/H2O Studio Sync/devices/<safePeerDir>/latest.sha256
~/H2O Studio Sync/devices/<safePeerDir>/state.json
```

`safePeerDir` is always:

```js
encodeURIComponent(syncPeerId)
```

The raw `syncPeerId` is never used as a directory name. The original value is
stored inside `state.json` for protocol diagnostics.

## Write Order

`H2O.Studio.ingestion.exportLatestSyncBundle()` preserves the R-phase root
write order:

1. Build and stamp the bundle.
2. Write `~/H2O Studio Sync/.latest.json.tmp`.
3. Rename it to `~/H2O Studio Sync/latest.json`.
4. Only after that rename succeeds, call
   `H2O.Studio.sync.peerTransport.writeLatestMirror()`.

The per-peer mirror is best-effort. A mirror failure records warning and
diagnostic metadata on the root export result, but `result.ok` continues to
represent root `latest.json` success.

## State File

`state.json` uses schema:

```text
h2o.studio.sync.peer-state.v1
```

It includes:

```jsonc
{
  "schema": "h2o.studio.sync.peer-state.v1",
  "syncPeerId": "<original unsanitized peer id>",
  "safePeerDir": "<encodeURIComponent(syncPeerId)>",
  "surfaceKind": "studio-desktop",
  "appKind": "tauri-desktop",
  "storeKind": "sqlite",
  "lastExportId": "<exportId>",
  "sequenceNumber": 1,
  "previousExportId": null,
  "lastExportedAt": "<ISO>",
  "lastContentSha256": "sha256:<bundle-content-hash>",
  "lastFileSha256": "sha256:<latest-json-file-hash>",
  "lastFileSize": 12345,
  "exporterVersion": "0.2.0-f3",
  "exportSchemaVersion": "h2o.studio.export-envelope.v1",
  "transportVersion": "h2o.studio.sync.peer-transport.v1",
  "updatedAt": "<ISO>"
}
```

It deliberately omits separate `installId`, `physicalDeviceId`, and
`displayName` fields. The transport version is:

```text
h2o.studio.sync.peer-transport.v1
```

## Integrity

`latest.json` under `devices/<safePeerDir>/` is byte-identical to the root
`latest.json` body from the same export.

`latest.sha256` contains the SHA-256 of that per-peer `latest.json` file body:

```text
sha256:<hex>
```

with one trailing newline.

`state.json.lastFileSha256` stores the same value.

## Capability Scope

F4 adds Tauri filesystem write capability only under:

```text
$HOME/H2O Studio Sync/devices/**
```

for `mkdir`, `writeTextFile`, and `rename`. The existing root latest writer
keeps its existing scoped permissions for:

```text
$HOME/H2O Studio Sync/.latest.json.tmp
$HOME/H2O Studio Sync/latest.json
```

## Non-Goals

- No Chrome reads or writes under `devices/`.
- No background polling.
- No WebDAV or mobile transport.
- No tombstones.
- No conflict resolution.
- No `manifest.json`.
- No `history/`.
- No new `chrome.storage` keys.

## Rollback

To roll back F4:

1. Remove `src-surfaces-base/studio/sync/peer-transport.js`.
2. Remove the guarded mirror call and peer transport diagnostics from
   `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`.
3. Remove the `peer-transport.js` script tag from `studio.html`.
4. Remove the two `pack-studio.mjs` entries.
5. Revert the F4 `devices/**` capability additions.
6. Delete this document.

Existing root `latest.json` files remain valid because Chrome reads the root
file only and ignores the F4 mirror.
