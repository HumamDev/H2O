# Saved Chat Archive Request Delivery D.3C.1 Evidence

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.3C.1). This is a docs/evidence-only
note. It adds no runtime code, no validators, no Chrome service-worker
transport, and no Desktop request queue/materializer/package writer/CAS/store/
sync/import/recovery/UI changes.

## Scope

D.3C.1 added a Chrome/MV3 low-level delivery module only:

```text
src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js
```

The module writes a metadata-only `h2o.savedChatArchiveRequest.v1` envelope into
the Desktop-owned inbox via the browser File System Access API. There is no UI,
no result read-back, and no automatic/background/silent delivery. Desktop's
D.3B inbox scanner and D.2B queue remain the only authority.

Implementation commit:

```text
d99a5a9c44d46aeda6a343bdb4568544caa7ffa7 feat(studio): add chrome archive request delivery
```

## APIs Added (H2O.Studio.ingestion)

- `diagnoseSavedChatArchiveRequestDeliveryV1`
- `connectSavedChatArchiveRequestFolderV1`
- `disconnectSavedChatArchiveRequestFolderV1`
- `deliverSavedChatArchiveRequestV1`

## Proven Behavior

D.3C.1 proves the delivery module:

- uses the File System Access API.
- uses `showDirectoryPicker({ mode: "readwrite" })` for folder selection.
- persists the directory handle in a dedicated IndexedDB store, deliberately
  separate from the Sync folder handle:
  - DB: `h2o.studio.archive-requests.folder.mv3`
  - store: `handles`
  - key: `archive-requests-folder`
- requires the selected folder name to be exactly `H2O Studio Archive Requests`,
  returning `archive-request-folder-name-mismatch` otherwise.
- requires explicit delivery confirmation / user gesture (`confirmDelivery: true`);
  otherwise returns `delivery-disabled` and performs no write.
- creates/ensures `inbox/` only.
- does not create or write `receipts/`.
- writes the staging file `inbox/<requestId>.request.json.tmp`.
- finalizes to `inbox/<requestId>.request.json` using
  `FileSystemFileHandle.move()` when available.
- falls back to write-final plus `removeEntry(<requestId>.request.json.tmp)`.
- re-asserts metadata-only envelope safety before writing.
- enforces `payloadPolicy.containsSnapshotContent === false`.
- enforces `payloadPolicy.containsAssets === false`.
- rejects forbidden authoritative fields such as transcript / messages / html /
  assets / `contentHash` / package content, returning `unsafe-envelope`.
- enforces a 128 KB maximum envelope size, returning `envelope-too-large`.
- uses a safe single-segment `requestId` file stem (no path traversal).
- returns a structured result:
  `{ ok, status, requestId, dedupeKey, fileName, tmpFileName, folderConnected,
  atomicMethod, warnings, blockers }`.

Delivery statuses exercised: `delivered`, `delivery-disabled`,
`file-system-access-unavailable`, `archive-request-folder-not-connected`,
`archive-request-folder-permission-denied`,
`archive-request-folder-name-mismatch`, `builder-failed`, `unsafe-envelope`,
`envelope-too-large`, `inbox-write-failed`.

## Explicit Non-Goals Preserved

D.3C.1 intentionally adds none of the following:

- no UI.
- no receipt read-back.
- no Desktop runtime changes.
- no Chrome service-worker transport.
- no native messaging.
- no localhost relay.
- no sync/WebDAV/cloud.
- no `enqueueSavedChatArchiveRequestV1` call.
- no `materializeSavedChatArchiveRequestV1` call.
- no package writer call.
- no CAS/store writes.
- no receipts writing.
- no Archive Health UI.
- no import/recovery.
- no auto-materialization.

The following remain deferred:

- D.3C.2 minimal manual UI / settings control.
- D.3C.3 receipt read-back.
- D.3C.4 runtime smoke / evidence (real Chrome + Desktop).
- D.3C.5 closure.

## Files Changed (Implementation Commit)

- `src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js`
- `tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`

## Validation

All commands executed and passed:

```text
node --check src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js
node --check tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-builder-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-inbox-contract.mjs
node --check tools/product/studio/pack-studio.mjs
git diff --check
git diff --cached --check
```

Results:

- runtime validator (`validate-saved-chat-archive-request-delivery-runtime-v1`):
  PASS 20 checks (13 static + 7 VM behavior).
- D.3C.0 contract validator (`validate-saved-chat-archive-request-delivery-v1`):
  all 22 checks passed.
- D.3A builder validator (`validate-saved-chat-archive-request-builder-v1`):
  PASS 18 checks.
- D.3B inbox contract validator
  (`validate-saved-chat-archive-request-inbox-contract`): all 20 checks passed.
- `node --check` of the module, runtime validator, and `pack-studio.mjs`: OK.
- `git diff --check` and `git diff --cached --check`: clean.

VM behavior checks proved that an unsafe envelope (`payloadPolicy` true/true)
and an envelope carrying `contentHash` are both rejected with `unsafe-envelope`
before any write, that `diagnose` returns a structured result when the File
System Access API is unavailable, and that a safe envelope without
`confirmDelivery: true` returns `delivery-disabled` (no silent write).

No docs/markdown lint script exists in `package.json` (confirmed); none was run.

## Boundary Confirmation

D.3C.1 keeps Chrome delivery a thin, metadata-only transport:

- Chrome writes only the metadata request envelope into `inbox/`.
- Desktop remains the owner of validation, queue/status persistence,
  package materialization, CAS, archive diagnostics, and durable archive state.
- Chrome does not write `receipts/`, `archive/packages`, CAS, or Desktop SQLite.
- Chrome does not call enqueue, materialize, package writer, or CAS APIs.
- The archive-requests folder handle is stored separately from the Sync handle.
