# Saved Chat Archive Request Delivery v1

Status: D.3C.0 docs-lock

Lane: H2O Studio Chat Saving Architecture

## Objective

D.3C defines the Chrome-side **delivery** and **receipt read-back** contract for
metadata-only `h2o.savedChatArchiveRequest.v1` envelopes. Chrome writes request
files into the Desktop-owned inbox and later reads Desktop-written receipts. It
is the transport companion to the D.3B Desktop inbox scanner; it adds no Desktop
authority.

Chrome writes request files into the Desktop-owned inbox:

```text
$HOME/H2O Studio Archive Requests/inbox/<requestId>.request.json
```

Chrome later reads Desktop-written receipts from:

```text
$HOME/H2O Studio Archive Requests/receipts/<requestId>.receipt.json
```

Desktop remains authoritative. Delivery is enqueue-intent only: Desktop parses,
validates, enqueues through `enqueueSavedChatArchiveRequestV1`, and writes the
receipt. Chrome never enqueues, materializes, or writes packages.

## Delivery Approach

The planned first delivery method is the browser **File System Access API**.

- acquire a directory handle with `showDirectoryPicker({ mode: "readwrite" })`
- persist the handle in a dedicated IndexedDB store
- request/check `readwrite` permission per write
- write only under an explicit user gesture
- no watcher
- no polling
- flag OFF by default

There is no background daemon, no automatic write on boot, and no silent
background write. The feature flag defaults OFF in production; the flag-off path
is a no-op with a clear status.

## Dedicated Directory Handle

The archive-requests directory handle must be persisted under a dedicated
IndexedDB identity, separate from the Sync folder handle:

```text
DB:    h2o.studio.archive-requests.folder.mv3
store: handles
key:   archive-requests-folder
```

This must be separate from the Sync folder handle
(`h2o.studio.sync.folder.mv3` / `sync-folder`). Delivery must never reuse,
read, or write the Sync folder handle, and must never resolve the
archive-requests root from the Sync handle.

## Folder Boundary

The user-selected root should be:

```text
$HOME/H2O Studio Archive Requests
```

Chrome may create/ensure only the inbox subfolder:

```text
inbox/
```

Chrome may create inbox only. Chrome must not create/write the receipts
subfolder:

```text
receipts/
```

The receipt folder is Desktop-owned. If `receipts/` is missing, Chrome reports a
pending status:

```text
delivered-awaiting-desktop
```

## Request Write Lifecycle

1. Build the envelope using
   `H2O.Studio.ingestion.buildSavedChatArchiveRequestV1(options)`.
2. Verify the built envelope is metadata-only before writing. The required
   payload policy is:

   ```text
   payloadPolicy.containsSnapshotContent=false
   payloadPolicy.containsAssets=false
   ```

3. Write the staging file first:

   ```text
   inbox/<requestId>.request.json.tmp
   ```

4. Finalize to:

   ```text
   inbox/<requestId>.request.json
   ```

5. Prefer `FileSystemFileHandle.move(finalName)` for the rename. This is the
   `move()` path.
6. Fallback when `move()` is unavailable: write the final file, then remove the
   `.tmp` file. This is the `move()` plus fallback strategy.
7. Desktop ignores `.tmp` files, so an interrupted write leaves a `.tmp` that
   Desktop will not read.
8. Repeated delivery of the same envelope is safe because Desktop dedupes by
   `dedupeKey`. Chrome does not implement retry/overwrite/delete/repair.
9. No silent background write — every write is gated by an explicit user gesture
   and a per-write `readwrite` permission check.

Chrome removing its own staging `.tmp` in the fallback path is part of the
writer role; Chrome still never deletes, moves, renames, or repairs a finalized
Desktop request file or any receipt file.

## Receipt Read-Back Lifecycle

Receipt read-back is manual read only.

- the user manually triggers a "check receipt" / refresh action
- Chrome reads `receipts/<requestId>.receipt.json`
- no polling
- no watcher
- no background daemon
- the receipt is informational only
- the Desktop queue remains the source of truth; Desktop queue remains
  authoritative

Receipt schema:

```text
h2o.savedChatArchiveRequestReceipt.v1
```

Chrome reads receipts read-only and never writes, edits, or deletes them.
Receipts are informational only and never override the Desktop queue.

### Status Mapping

| Receipt condition | Chrome status |
|---|---|
| Missing receipt or missing `receipts/` folder | `delivered-awaiting-desktop` |
| `validated` | queued on Desktop |
| `duplicate` | already queued / duplicate |
| `rejected` | rejected by Desktop |
| `needs-desktop-snapshot` | Desktop snapshot missing |
| `db-unavailable` | Desktop database unavailable |
| Malformed receipt | unusable receipt / pending manual review |

## Metadata-Only Trust Boundary

Chrome delivery must not include or write any authoritative package content,
including:

- transcript
- messages
- HTML
- outerHTML
- markdown
- assets
- images
- blobs
- CAS paths
- package paths
- manifest
- snapshot.json
- chat.md
- chat.html
- contentHash
- package content

Chrome must not:

- compute package `contentHash`
- call `enqueueSavedChatArchiveRequestV1` (no `enqueueSavedChatArchiveRequestV1`
  call from Chrome)
- call `materializeSavedChatArchiveRequestV1`
- call `writeSavedChatPackageV1`
- call `buildSavedChatPackageV1`
- write Desktop SQLite
- write `archive/packages`
- write CAS
- write receipts
- delete/move/repair Desktop request files

Chrome request metadata is untrusted transport input. Desktop re-validates every
inbox file through the D.2B intake path before enqueueing.

## Separation Boundary

D.3C delivery must stay separate from:

- `$HOME/H2O Studio Sync`
- `.h2o-smoke`
- sync `latest.json`
- WebDAV/cloud/sync transport
- `$APPLOCALDATA/archive`
- `archive/packages`
- Archive Health UI

Delivery is not the Sync lane, not a smoke bridge, not package storage, not the
saved-chat archive root, and not the Archive Health diagnostics surface.

## Failure Handling

| Condition | Outcome |
|---|---|
| File System Access API unavailable | clear status; no write |
| No folder handle connected | prompt to pick folder; no write |
| Permission denied | error status; no write |
| Selected folder name mismatch | warn; user reconfirms folder |
| Inbox creation/write failure | error status; no Desktop mutation |
| `.tmp` write failure | error status; no final file |
| `move()` unsupported | fallback write-final + remove `.tmp` |
| Final write failure | error status; `.tmp` ignored by Desktop |
| Receipt folder missing | `delivered-awaiting-desktop` |
| Receipt file missing | `delivered-awaiting-desktop` |
| Receipt JSON malformed | unusable receipt / pending manual review |
| Receipt schema mismatch | unusable receipt / pending manual review |
| Receipt `requestId` mismatch | unusable receipt / pending manual review |
| Desktop closed / not yet scanned | `delivered-awaiting-desktop` |
| Duplicate delivery | `duplicate` via Desktop `dedupeKey` |
| Rejected request | rejected by Desktop |

## Security And Trust Boundaries

Chrome writes only the metadata-only request envelope produced by
`buildSavedChatArchiveRequestV1`. Delivery re-asserts the metadata-only
invariant immediately before writing and refuses to write if any forbidden
payload field reappears. Chrome never computes package hashes, never writes
packages, CAS, SQLite, or receipts, and never deletes or repairs Desktop files.
The Desktop queue remains authoritative; the receipt is informational only.

## Roadmap

| Subphase | Scope |
|---|---|
| D.3C.0 docs-lock | This contract and static validator. |
| D.3C.1 Chrome delivery module only, no UI | Handle pick/persist/permission + atomic write API; flag-gated; no UI. Deferred. |
| D.3C.2 minimal manual UI / settings control | Small Studio Settings control to pick folder and send a request. Deferred. |
| D.3C.3 receipt read-back | Manual read-only receipt fetch and status mapping. Deferred. |
| D.3C.4 runtime smoke / evidence | Prove delivery, dedupe, and receipt read-back on real Chrome + Desktop. Deferred. |
| D.3C.5 closure | Milestone closure note. |

D.3C.1, D.3C.2, D.3C.3, and D.3C.4 are deferred. This docs-lock implements none
of them.

## Explicit Non-Goals

D.3C.0 does not implement:

- runtime delivery module
- UI
- receipt reader
- Chrome service-worker transport
- native messaging
- localhost relay
- sync/WebDAV/cloud
- auto-materialization
- package writing
- CAS writing
- Desktop scanner changes
- Desktop queue changes
- capability changes
- Archive Health UI changes
- import/recovery
- user-folder export/save dialog
- retry/overwrite/delete/repair policy
