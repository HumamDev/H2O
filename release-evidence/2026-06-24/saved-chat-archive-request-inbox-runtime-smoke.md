# Saved Chat Archive Request Inbox Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.3B.2). This is a docs/evidence-only
runtime smoke note. It adds no runtime code, no validators, no capability
changes, no Chrome delivery, no sync work, no package writer/projector changes,
no materializer changes, no CAS changes, no store adapter changes, no Archive
Health UI work, and no import/recovery behavior.

## Scope

D.3B.2 runtime-proves the Desktop-owned archive request inbox scanner added by:

```text
c84a53f feat(studio): add archive request inbox intake
```

The inbox scanner reads externally delivered
`h2o.savedChatArchiveRequest.v1` request files from the dedicated Desktop inbox,
passes valid envelopes to the D.2B queue through
`enqueueSavedChatArchiveRequestV1(envelope)`, writes receipts, and remains
enqueue-only.

Final runtime line:

```text
[d3b2-archive-request-inbox-smoke] ALL PASS
```

## Runtime Fixture

```text
suffix: 1782391840992
chatId: d3b2_inbox_chat_1782391840992
snapshotId: snap_d3b2_inbox_chat_1782391840992
valid request: d3b2_valid_1782391840992
missing snapshot request: d3b2_missing_snapshot_1782391840992
malformed request: d3b2_malformed_1782391840992
oversized request: d3b2_oversized_1782391840992
mismatch file request: d3b2_mismatch_file_1782391840992
mismatch payload request: d3b2_mismatch_payload_1782391840992
tmp ignored request: d3b2_tmp_ignored_1782391840992
hidden ignored request: d3b2_hidden_ignored_1782391840992
non-matching ignored request: d3b2_nonmatch_ignored_1782391840992
```

## Dedicated Paths

The runtime diagnostic output referenced the locked D.3B inbox paths:

```text
$HOME/H2O Studio Archive Requests/
$HOME/H2O Studio Archive Requests/inbox/
$HOME/H2O Studio Archive Requests/receipts/
```

Requests used the locked `inbox/<requestId>.request.json` file shape. Receipts
used the locked `receipts/<requestId>.receipt.json` shape, with rejected
malformed cases writing rejected receipts rather than enqueueing.

## Proof Summary

- `diagnoseSavedChatArchiveRequestInboxV1` loaded and returned a result.
- `scanSavedChatArchiveRequestInboxV1` loaded.
- `processSavedChatArchiveRequestInboxFileV1` loaded.
- `getSavedChatArchiveRequestStatusV1` loaded.
- diagnose output referenced `H2O Studio Archive Requests`, `inbox`, and
  `receipts`.
- valid request file processed as `validated`.
- valid request persisted in queue as `validated`.
- duplicate request processed as `duplicate`.
- missing snapshot request processed and persisted as `needs-desktop-snapshot`.
- malformed JSON was rejected and not enqueued.
- oversized file over 128 KB was rejected and not enqueued.
- filename/requestId mismatch was rejected and not enqueued.
- `.tmp` file was ignored by the scanner.
- hidden file was ignored by the scanner.
- non-matching file was ignored by the scanner.
- materializer call count stayed `0`.
- package write remained deferred.
- materialization was not triggered.

The scan summary may report `ok: false` / `completed-with-blockers` because the
scan intentionally included rejected test fixtures: malformed JSON, oversized
file, and filename/requestId mismatch. That is expected and does not indicate a
runtime smoke failure. All assertions passed and the final line was
`[d3b2-archive-request-inbox-smoke] ALL PASS`.

## Receipt Boundary

Receipts used schema:

```text
h2o.savedChatArchiveRequestReceipt.v1
```

The runtime receipts confirmed:

- `packageWriteDeferred: true`
- `materializeTriggered: false`
- queue status was recorded in `status` / `enqueueStatus`
- rejected transport/input cases did not enqueue
- duplicate delivery remained idempotent through the D.2B queue

## Boundary Confirmation

D.3B.2 preserved the locked inbox architecture:

- no Chrome delivery.
- no File System Access API.
- no native messaging.
- no localhost relay.
- no sync/WebDAV/cloud.
- no package materialization.
- no package writer call.
- no CAS writer call.
- no Archive Health UI change.
- no import/recovery.
- no user-folder export/save dialog.
- no request delete/move/rename/repair behavior.

The inbox remains a Desktop-owned enqueue-only transport intake boundary.
