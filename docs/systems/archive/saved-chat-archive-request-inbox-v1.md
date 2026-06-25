# Saved Chat Archive Request Inbox v1

Status: D.3B.0 docs-lock

Lane: H2O Studio Chat Saving Architecture

## Objective

D.3B defines a Desktop-owned archive request inbox boundary. External delivery
may place Chrome-built `h2o.savedChatArchiveRequest.v1` envelope files in the
inbox, but Desktop treats those files as untrusted metadata and later passes
each parsed envelope to:

```text
H2O.Studio.ingestion.enqueueSavedChatArchiveRequestV1(envelope)
```

D.3B is enqueue-only. It does not materialize packages, write archive package
files, write CAS, or make Chrome authoritative.

## Dedicated Path

The intended request handoff root is:

```text
$HOME/H2O Studio Archive Requests/
```

Subfolders:

```text
$HOME/H2O Studio Archive Requests/inbox/
$HOME/H2O Studio Archive Requests/receipts/
```

Request file pattern:

```text
$HOME/H2O Studio Archive Requests/inbox/<requestId>.request.json
```

Receipt file pattern:

```text
$HOME/H2O Studio Archive Requests/receipts/<requestId>.receipt.json
```

Malformed files without a usable `requestId` should use:

```text
$HOME/H2O Studio Archive Requests/receipts/malformed-sha256-<fileHash>.receipt.json
```

## Separation Boundary

The archive request inbox is deliberately separate from:

- `$HOME/H2O Studio Sync`
- `.h2o-smoke`
- `$APPLOCALDATA/archive`
- `archive/packages`
- sync `latest.json`
- Chrome/Sync RC bridge infrastructure

The inbox is not the Sync lane, not a smoke bridge, not package storage, and not
the saved-chat archive root.

## Request File Format

The inbox uses one request per file.

Each request file must contain only the D.1/D.3A request envelope with schema:

```text
h2o.savedChatArchiveRequest.v1
```

Allowed top-level fields:

- `schema`
- `requestId`
- `dedupeKey`
- `createdAt`
- `source`
- `desktopResolution`
- `intent`
- `payloadPolicy`

Required payload policy:

```text
payloadPolicy.containsSnapshotContent = false
payloadPolicy.containsAssets = false
```

The request file must not contain authoritative package content, including:

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

## Torn-Write Convention

Future delivery should avoid torn reads by writing a temporary file first:

```text
<requestId>.request.json.tmp
```

After the write is complete, delivery should atomically rename or move it to:

```text
<requestId>.request.json
```

Desktop must ignore `.tmp` files.

## Receipt Schema

Receipt files use schema:

```text
h2o.savedChatArchiveRequestReceipt.v1
```

Receipt fields:

- `schema`
- `requestId`
- `dedupeKey`
- `receivedAt`
- `processedAt`
- `sourceFile`
- `requestFileSha256`
- `status`
- `enqueueStatus`
- `persisted`
- `duplicateOf`
- `packageWriteDeferred`
- `materializeTriggered`
- `blockers`
- `warnings`

Required receipt boundaries:

```text
materializeTriggered = false
packageWriteDeferred = true
```

The receipt records Desktop intake/enqueue outcome only. It is not a package,
not an import report, and not archive health evidence.

## Desktop Intake Lifecycle

Future D.3B.1 Desktop runtime should:

1. list `inbox/*.request.json`
2. ignore `.tmp`, hidden files, directories, and non-matching names
3. enforce a size cap, recommended 128 KB
4. parse JSON
5. pass the envelope to `enqueueSavedChatArchiveRequestV1(envelope)`
6. write a receipt
7. return a scan summary
8. do not delete, move, overwrite, or repair request files

Recommended future APIs:

```text
H2O.Studio.ingestion.diagnoseSavedChatArchiveRequestInboxV1()
H2O.Studio.ingestion.scanSavedChatArchiveRequestInboxV1(options)
H2O.Studio.ingestion.processSavedChatArchiveRequestInboxFileV1(options)
```

Trigger model:

- manual scan first
- later optional focus/visibility import only
- opt-in
- debounce
- no watcher
- no polling

## Security And Trust Boundaries

Inbox files are untrusted transport input.

Chrome request metadata is not package content. D.3B must not:

- compute package hashes
- build `manifest.json`
- build `snapshot.json`
- build `chat.md`
- build `chat.html`
- build `assets`
- call `materializeSavedChatArchiveRequestV1`
- call `writeSavedChatPackageV1`
- write archive packages
- write CAS

In the future runtime slice, D.3B writes only receipts and D.2B queue rows.

## Failure Handling

Expected outcomes:

| Condition | Outcome |
|---|---|
| Malformed JSON | receipt `rejected`; no enqueue if no valid envelope |
| Oversized file | receipt `rejected`; no enqueue |
| Unsupported schema | `rejected` |
| Forbidden payload fields | `rejected` through D.2B validation/intake |
| Duplicate request | `duplicate` via D.2B `dedupeKey` |
| Missing Desktop snapshot | `needs-desktop-snapshot` |
| DB unavailable | `db-unavailable` |
| Receipt write failure | scan warning; no package action |
| Replay/out-of-order delivery | handled by durable `dedupeKey` |

## Capability And Security Review

Capability changes are not part of D.3B.0. They must be a later separate
security-reviewed slice.

Future minimal capability shape:

- read-dir:
  `$HOME/H2O Studio Archive Requests/inbox`
- read-file/read-text-file:
  `$HOME/H2O Studio Archive Requests/inbox/*.request.json`
- mkdir:
  `$HOME/H2O Studio Archive Requests/receipts`
- write-file/write-text-file:
  `$HOME/H2O Studio Archive Requests/receipts/*.receipt.json`

Avoid:

- `$HOME/**` as the contract
- `$HOME/H2O Studio Sync/**`
- remove/rename/delete
- archive package write permissions in this module

## Explicit Non-Goals

D.3B.0 does not implement:

- runtime scanner
- Chrome delivery
- File System Access API
- native messaging
- localhost relay
- sync/WebDAV/cloud
- deep links
- auto-materialization
- package writing
- CAS writing
- Archive Health UI
- import/recovery
- user-folder export/save dialog
- retry/overwrite/delete/repair policy
- DB migration
- capability changes

## Roadmap

| Subphase | Scope |
|---|---|
| D.3B.0 docs-lock | This contract and static validator. |
| D.3B.1 Desktop inbox scanner / enqueue-only | Read request files, call D.2B enqueue, write receipts, no materialization. |
| D.3B.2 runtime smoke / evidence | Prove valid, duplicate, malformed, and forbidden-payload request files produce queue/receipt results. |
| D.3C Chrome delivery + receipt read-back later | Chrome writes request files and optionally reads receipts through a future delivery surface. |
