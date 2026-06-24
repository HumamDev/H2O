# Saved Chat Archive Request Queue Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.2B). This is a docs/evidence-only
runtime smoke note. It adds no runtime code, no validators, no Chrome runtime,
no sync work, no package writer/projector changes, no CAS changes, no store
adapter changes, no Archive Health UI work, and no import/recovery behavior.

## Scope

D.2B adds Desktop-owned durable request queue/status persistence for
`h2o.savedChatArchiveRequest.v1` envelopes after D.2A validation/resolution.

This smoke proves:

- D.2B persists request resolution statuses.
- D.2B dedupes by `dedupeKey`.
- D.2B supports queue get/list/diagnose APIs.
- D.2B does not call `writeSavedChatPackageV1`.
- D.2B does not trigger package materialization.
- D.2B does not touch Chrome runtime, sync transport, import/recovery, CAS
  writer, package writer, or Archive Health UI.
- Package writing remains deferred to a later D.2C/D.3 slice.

## Runtime Environment

Executed manually in Desktop Studio DevTools after D.2B landed:

- D.1 request contract: `c0dec18 docs(studio): define saved chat archive request contract`
- D.2A request intake: `adceba8 feat(studio): add saved chat archive request intake`
- D.2A runtime evidence: `3f70a1c docs(studio): record saved chat archive request intake smoke`
- D.2B durable request queue: `b52c878 feat(studio): add saved chat archive request queue`

Final runtime line:

```text
[d2b-archive-request-queue-smoke] ALL PASS
```

## Runtime Fixture

```text
chatId: d2b_request_queue_chat_1782326983172
snapshotId: snap_d2b_request_queue_chat_1782326983172
validatedRequestId: d2b_valid_e9277cd7-61fa-47ce-b5d6-02b019e59e4e
```

## Runtime Result Object

```text
validatedStatus: validated
duplicateStatus: duplicate
missingSnapshotStatus: needs-desktop-snapshot
badContentStatus: rejected
badPackageStatus: rejected
statusFound: true
listedCount: 4
packageWriterCalled: false
```

## Queue Counts

```text
total: 4
validated: 1
needsDesktopSnapshot: 1
rejected: 2
dbUnavailable: 0
duplicate: 0
```

`duplicate` remains `0` in persisted queue counts because duplicate delivery is
returned as a status and does not insert a second active queue row.

## PASS Rows

- H2O namespace available.
- `validateSavedChatArchiveRequestV1` available.
- `resolveSavedChatArchiveRequestV1` available.
- `enqueueSavedChatArchiveRequestV1` available.
- `getSavedChatArchiveRequestStatusV1` available.
- `listSavedChatArchiveRequestsV1` available.
- `diagnoseSavedChatArchiveRequestQueueV1` available.
- `store.chats.get` available.
- `store.snapshots.get` available.
- queue diagnostic runs before enqueue.
- queue diagnostic reports package writing deferred.
- valid envelope enqueues as `validated`.
- validated enqueue persisted.
- same `dedupeKey` returns `duplicate`.
- duplicate did not persist second active row.
- missing snapshot persists `needs-desktop-snapshot`.
- snapshot content payload persists/returns `rejected`.
- package-like authoritative payload persists/returns `rejected`.
- get status finds validated request.
- get status includes request and resolution.
- get missing status returns not found without throwing.
- list requests returns rows.
- list includes validated request.
- list requests by validated status includes request.
- queue diagnostic runs after enqueue.
- queue diagnostic counts include queue rows.
- queue diagnostic confirms write/transport boundaries.
- D.2B did not call package writer.

## Boundary Confirmation

D.2B remains a Desktop-owned request queue/status layer only:

- Queue persistence is enabled for `saved_chat_archive_requests`.
- Request resolution statuses are persisted.
- Duplicate delivery is idempotent by `dedupeKey`.
- No package materialization was triggered.
- `writeSavedChatPackageV1` was not called.
- No package writer/projector behavior changed.
- No CAS writer behavior changed.
- No Desktop chat/snapshot/asset store adapter behavior changed.
- No Chrome runtime/service-worker/background behavior changed.
- No sync transport behavior changed.
- No import/recovery behavior changed.
- No Archive Health UI behavior changed.

Package writing remains deferred to a later D.2C/D.3 slice.
