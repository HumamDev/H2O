# Saved Chat Archive Request Intake Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.2A). This is a docs/evidence-only
runtime smoke note. It adds no runtime code, no validators, no Chrome runtime,
no sync work, no package writer/projector changes, no CAS changes, no store
adapter changes, no Archive Health UI work, and no import/recovery behavior.

## Scope

D.2A validates Chrome intent envelopes and resolves them through Desktop
read-only store state.

This smoke proves:

- D.2A validates `h2o.savedChatArchiveRequest.v1` envelopes.
- D.2A resolves only through Desktop read-only store state.
- D.2A does not create a durable queue.
- D.2A does not persist request status.
- D.2A does not call `writeSavedChatPackageV1`.
- D.2A rejects Chrome-provided authoritative snapshot, asset, and package-like
  payloads.
- D.2A keeps package writing deferred to a later phase.

## Runtime Environment

Executed manually in Desktop Studio DevTools after D.2A landed:

- D.1 request contract: `c0dec18 docs(studio): define saved chat archive request contract`
- D.2A request intake: `adceba8 feat(studio): add saved chat archive request intake`

Final runtime line:

```text
[d2a-archive-request-intake-smoke] ALL PASS
```

## Runtime Fixture

```text
chatId: d2a_request_intake_chat_1782326136543
snapshotId: snap_d2a_request_intake_chat_1782326136543
```

## Runtime Results

```text
validatedStatus: validated
missingSnapshotStatus: needs-desktop-snapshot
noSnapshotStatus: needs-desktop-snapshot
contentRejectedStatus: rejected
assetsRejectedStatus: rejected
packagePayloadRejectedStatus: rejected
packageWriterCalled: false
```

## PASS Rows

- H2O namespace available.
- `validateSavedChatArchiveRequestV1` available.
- `resolveSavedChatArchiveRequestV1` available.
- `diagnoseSavedChatArchiveRequestIntakeV1` available.
- `store.chats.get` available.
- `store.snapshots.get` available.
- intake diagnostic runs.
- intake diagnostic reports read-only / deferred write boundary.
- valid envelope validates.
- validated envelope preserves `requestId` / `dedupeKey`.
- valid envelope resolves to `validated`.
- validated resolution sees Desktop chat/snapshot.
- validated resolution keeps queue/package write deferred.
- missing snapshot resolves to `needs-desktop-snapshot`.
- missing `snapshotId` resolves to `needs-desktop-snapshot`.
- snapshot content payload is rejected.
- asset payload is rejected.
- missing `requestId` is rejected.
- package-like authoritative payload is rejected.
- D.2A did not call package writer.

## Boundary Confirmation

D.2A remains a Desktop-only intake boundary:

- No durable queue was created.
- No request status was persisted.
- No package materialization was triggered.
- No package writer/projector behavior changed.
- No CAS writer behavior changed.
- No Desktop store adapter behavior changed.
- No Chrome runtime/service-worker/background behavior changed.
- No sync transport behavior changed.
- No import/recovery behavior changed.
- No Archive Health UI behavior changed.

Package writing remains deferred to a later Phase D slice.
