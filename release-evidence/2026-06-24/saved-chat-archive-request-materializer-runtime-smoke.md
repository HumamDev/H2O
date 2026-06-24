# Saved Chat Archive Request Materializer Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.2C). This is a docs/evidence-only runtime
smoke note. It adds no runtime code, no validators, no Chrome runtime, no sync
transport, no package writer/projector changes, no CAS writer changes, no store
adapter changes, no Archive Health UI work, no import/recovery, and no DB
migration.

Executed in real Desktop Studio DevTools after:

- `b52c878 feat(studio): add saved chat archive request queue`
- `d578702 feat(studio): materialize saved chat archive requests`

Final runtime line:

```text
[d2c-archive-request-materializer-smoke] ALL PASS
```

## Scope

D.2C is the Desktop-only package-write trigger from a persisted **validated**
queued request. It:

- materializes only a persisted **validated** Desktop queue request;
- **re-resolves** the persisted normalized request against live Desktop store
  state immediately before writing;
- calls the existing Desktop package writer
  (`writeSavedChatPackageV1({ snapshotId, overwrite: false })`) with **only the
  resolved Desktop `snapshotId`** — it never packages Chrome/request payload
  content and never builds package files or `contentHash` from the envelope;
- updates the `saved_chat_archive_requests` queue status to `written` after the
  package materializes, and persists package result metadata in
  `meta_json.materialization`;
- is **idempotent**: a repeated materialization of a `written` request returns
  `already-written` and does not write again;
- does **not** write a package for a missing-snapshot or rejected-payload
  request, and returns `not-found` for an unknown request.

## Test note (first attempt vs fixed smoke)

The first smoke attempt correctly proved the package write worked, but one smoke
assertion was too strict because `getSavedChatArchiveRequestStatusV1()` does not
expose `meta_json.materialization` directly. A focused SQL probe confirmed
`meta_json.materialization` was persisted correctly, and a second materialization
returned `already-written`. The fixed smoke then passed in full.

## Runtime values

- chatId: `d2c_request_materializer_chat_1782334865884`
- snapshotId: `snap_d2c_request_materializer_chat_1782334865884`
- requestId: `d2c_valid_fbb4299d-f9df-4930-8a64-1dc0345bc515`
- packagePath: `archive/packages/d2c_request_materializer_chat_1782334865884.h2ochat`
- contentHash: `sha256-c13bb62596c3fd896589fa18e5290953dbc5ccc9b2458b36c005d359212ccd8e`

## Runtime status results

```json
{
  "firstStatus": "written",
  "secondStatus": "already-written",
  "queueStatus": "written",
  "missingSnapshotMaterializeStatus": "not-eligible",
  "rejectedMaterializeStatus": "not-eligible",
  "notFoundStatus": "not-found"
}
```

Notes on the eligibility outcomes:

- A missing-snapshot request enqueues as `needs-desktop-snapshot`, so calling the
  materializer on it returns `not-eligible` (it is not a `validated` row) and
  writes nothing.
- A bad-payload request enqueues as `rejected`, so materialization returns
  `not-eligible` and writes nothing.
- An unknown requestId returns `not-found`.

## PASS rows

The Desktop DevTools console table reported PASS for:

- H2O namespace available
- `enqueueSavedChatArchiveRequestV1` available
- `materializeSavedChatArchiveRequestV1` available
- `getSavedChatArchiveRequestStatusV1` available
- `validateSavedChatPackageV1` available
- valid request enqueues as `validated`
- validated request materializes to `written`
- materializer result has package metadata
- written package validates with no blockers
- queue status becomes `written`
- queue row persisted materialization metadata (`meta_json.materialization`)
- second materialization is `already-written` no-op
- missing snapshot request enqueues as `needs-desktop-snapshot`
- missing snapshot request does not write a package
- bad payload request returns `rejected`
- rejected request is `not-eligible`
- missing request materialization returns `not-found`

## Evidence conclusion

D.2C materialization passed in real Desktop/Tauri runtime. The runtime proved
that a persisted **validated** Desktop queue request re-resolves against live
store state and materializes through the existing Desktop package writer using
only the resolved `snapshotId`; the produced package validates with no blockers;
the queue row transitions to `written` with package metadata persisted under
`meta_json.materialization`; a repeated call is an idempotent `already-written`
no-op; and missing-snapshot, rejected-payload, and unknown requests never write a
package (`not-eligible` / `not-found`). Chrome/request payload content was never
used as package source.

No Chrome runtime, sync transport, import/recovery, user-folder export, Archive
Health UI, CAS writer, package writer modification, or DB migration was added.

## Next step

Future work (separate, deferred slices): D.2C.0 docs recording the
`writing`/`written`/`failed` statuses + `meta_json.materialization` fields in
`docs/systems/archive/saved-chat-archive-request-v1.md`; and D.2D — an explicit
retry / stale-`writing` recovery API plus the deferred overwrite/update policy
for the chatId-keyed package collision (multiple snapshots of one chat). None are
implemented here.
