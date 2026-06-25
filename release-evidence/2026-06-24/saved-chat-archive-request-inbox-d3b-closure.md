# Saved Chat Archive Request Inbox D.3B Closure

Date: 2026-06-24

Status: D.3B CLOSED

Lane: Chat Saving Architecture (Phase D.3B). This is a docs/evidence-only
closure note. It adds no runtime code, no validators, no capability changes, no
Chrome delivery, no sync work, no package writer/projector changes, no
materializer changes, no CAS changes, no store adapter changes, no Archive
Health UI work, and no import/recovery behavior.

## Closed Chain

- D.3B.0 inbox contract:
  `fccc28b docs(studio): define archive request inbox contract`
- D.3B.1 Desktop inbox scanner / enqueue-only runtime:
  `c84a53f feat(studio): add archive request inbox intake`
- D.3B.2 runtime smoke evidence:
  `fbf59a0 docs(studio): record archive request inbox smoke`

## What Is Proven

D.3B now proves a Desktop-owned saved-chat archive request inbox boundary:

- dedicated Desktop archive request inbox:
  `$HOME/H2O Studio Archive Requests/inbox/`
- dedicated receipts path:
  `$HOME/H2O Studio Archive Requests/receipts/`
- one request per file:
  `<requestId>.request.json`
- one receipt per processed request:
  `<requestId>.receipt.json`
- malformed or unusable requests can produce
  `malformed-sha256-<fileHash>.receipt.json` receipt naming.

The Desktop scanner APIs exist under `H2O.Studio.ingestion`:

- `diagnoseSavedChatArchiveRequestInboxV1`
- `scanSavedChatArchiveRequestInboxV1`
- `processSavedChatArchiveRequestInboxFileV1`

D.3B enqueues only through:

```text
enqueueSavedChatArchiveRequestV1
```

D.3B does not call:

```text
materializeSavedChatArchiveRequestV1
```

D.3B does not write packages, does not write CAS, and does not delete, move,
rename, or repair request files.

## Runtime Evidence

D.3B.2 runtime smoke passed against the D.3B.1 implementation.

Final runtime line:

```text
[d3b2-archive-request-inbox-smoke] ALL PASS
```

Runtime proof cases:

- valid request persisted as `validated`.
- duplicate request handled as `duplicate`.
- missing snapshot persisted as `needs-desktop-snapshot`.
- malformed JSON was rejected and not enqueued.
- oversized file over 128 KB was rejected and not enqueued.
- filename/requestId mismatch was rejected and not enqueued.
- `.tmp`, hidden, and non-matching files were ignored by the scanner.
- materializer call count stayed `0`.
- package write remained deferred.
- materialization was not triggered.

The runtime scan summary could report `ok: false` /
`completed-with-blockers` because rejected fixtures were intentionally present:
malformed JSON, oversized file, and filename/requestId mismatch. That was the
expected diagnostic result for the negative cases and did not indicate smoke
failure.

## Architectural Conclusion

D.3B creates the first filesystem handoff boundary for Chrome-style saved-chat
archive request envelopes without making Chrome authoritative. Inbox files are
untrusted metadata transport input. Desktop remains responsible for request
validation, store resolution, durable queue/status persistence, future package
materialization, CAS, diagnostics, and archive state.

D.3B is enqueue-only. It does not auto-materialize packages and it does not
promote inbox files into package content.

## Deferred Boundaries

The following remain explicitly deferred:

- Chrome delivery.
- Chrome File System Access API write.
- Chrome receipt read-back.
- native messaging.
- localhost relay.
- sync/WebDAV/cloud.
- auto-materialization.
- retry/overwrite/delete/repair policy.
- Archive Health UI changes.
- import/recovery.
- user-folder export/save dialog.

## Next Phase

D.3C should be planned separately as Chrome delivery plus receipt read-back.
That phase needs browser-side permission and UX review before implementation,
especially around File System Access API prompts, request-file write safety,
receipt polling/read-back behavior, and preserving the Desktop-owned archive
authority model.
