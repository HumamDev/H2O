# Saved Chat Archive Request Intake / Queue - D.2 Milestone Closure

Date: 2026-06-24

Status: D.2 CURRENT REQUEST INTAKE / QUEUE MILESTONE CLOSED

Lane: Chat Saving Architecture (Phase D). This is a docs/evidence-only closure
note. It adds no runtime code, no validators, no Chrome runtime, no sync work,
no package writer/projector changes, no CAS changes, no store adapter changes,
no Archive Health UI work, and no import/recovery behavior.

## Closed D.2 chain

| Slice | Scope | Commit |
|---|---|---|
| D.1 | Chrome-to-Desktop saved-chat archive request contract | `c0dec18 docs(studio): define saved chat archive request contract` |
| D.2A | Desktop request intake / resolver | `adceba8 feat(studio): add saved chat archive request intake` |
| D.2A evidence | Request intake runtime smoke (PASSED) | `3f70a1c docs(studio): record saved chat archive request intake smoke` |
| D.2B | Desktop durable request queue/status model | `b52c878 feat(studio): add saved chat archive request queue` |
| D.2B evidence | Request queue runtime smoke (PASSED) | `749b3d0 docs(studio): record saved chat archive request queue smoke` |

## What is now proven

The Desktop side of Phase D now has a safe receiving layer for future Chrome
handoff requests.

The current D.2 milestone proves:

- Chrome-style saved-chat archive request contract exists.
- Chrome remains intent-only.
- Desktop owns validation, store resolution, package materialization, CAS,
  diagnostics, and durable archive state.
- D.2A validates request envelopes.
- D.2A resolves requests through read-only Desktop store state.
- D.2A returns `validated`, `needs-desktop-snapshot`, `rejected`, and
  `db-unavailable`.
- D.2A rejects authoritative Chrome snapshot/assets/package-like payloads.
- D.2B persists request/status rows in a Desktop-owned queue.
- D.2B dedupes by `dedupeKey`.
- D.2B supports enqueue/get/list/diagnose queue APIs.
- D.2B runtime smoke proved valid, duplicate, missing snapshot, and rejected
  payload cases.
- D.2B did not call package writer.

## Runtime evidence referenced

- D.2A request intake runtime smoke passed: `3f70a1c`.

  ```text
  [d2a-archive-request-intake-smoke] ALL PASS
  ```

- D.2B request queue runtime smoke passed: `749b3d0`.

  ```text
  [d2b-archive-request-queue-smoke] ALL PASS
  ```

Important D.2B runtime values:

```text
chatId: d2b_request_queue_chat_1782326983172
snapshotId: snap_d2b_request_queue_chat_1782326983172
validatedRequestId: d2b_valid_e9277cd7-61fa-47ce-b5d6-02b019e59e4e
```

Queue counts:

```text
total: 4
validated: 1
needsDesktopSnapshot: 1
rejected: 2
dbUnavailable: 0
duplicate: 0
```

Package writer call result:

```text
packageWriterCalled: false
```

## Architectural conclusions

- D.2 creates the safe Desktop-side receiving layer for future Chrome handoff.
- D.2 does not create a Chrome runtime transport yet.
- D.2 does not trigger package writes yet.
- D.2 does not mutate packages, CAS, sync, Chrome, Archive Health UI, or
  import/recovery.
- Queue/status persistence is Desktop-owned and separate from package
  materialization.
- Dedupe is durable via `dedupeKey`.
- Package materialization remains explicitly deferred.

## Explicitly not added

- No D.2C package-write trigger.
- No `writeSavedChatPackageV1` call.
- No `buildSavedChatPackageV1` call.
- No Chrome runtime/service-worker/background changes.
- No sync transport.
- No import/recovery.
- No repair/delete/overwrite.
- No user-folder export/save dialog.
- No CAS write-back.
- No Archive Health UI changes.
- No package mutation.

## Explicitly deferred

- D.2C package-write trigger from validated queue request.
- Chrome runtime / service-worker handoff.
- Status transport back to Chrome.
- Minimal end-to-end Chrome-to-Desktop runtime proof.
- Import/recovery flow.
- Sync/WebDAV/cloud transport integration.
- User-folder export/save dialog.
- Repair/delete/overwrite policy.

## Closure verdict

D.1 request contract: Closed
D.2A request intake / resolver: Closed
D.2A runtime evidence: Closed
D.2B durable request queue/status model: Closed
D.2B runtime evidence: Closed
D.2 current request intake / queue milestone: CLOSED
