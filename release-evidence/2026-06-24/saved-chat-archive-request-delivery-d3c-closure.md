# Saved Chat Archive Request Delivery — D.3C Milestone Closure

Date: 2026-06-24

Status: D.3C CLOSED

Lane: Chat Saving Architecture (Phase D.3C — Chrome delivery + receipt
read-back). This is a docs/evidence-only closure note. It adds no runtime code,
no validators, and no Chrome/Desktop/capability changes.

## Closed D.3C Chain

| Subphase | Commit |
|---|---|
| D.3C.0 delivery contract | `84dcbfc docs(studio): define archive request delivery contract` |
| D.3C.1 Chrome delivery module | `d99a5a9 feat(studio): add chrome archive request delivery` |
| D.3C.1 evidence | `f786b8f docs(studio): record archive request delivery evidence` |
| D.3C.2 manual Settings UI | `92f66d7 feat(studio): add archive request delivery settings control` |
| D.3C.2 evidence | `c4a994f docs(studio): record archive request delivery ui evidence` |
| D.3C.3 receipt read-back | `91158e7 feat(studio): add archive request receipt readback` |
| D.3C.3 evidence | `56a6196 docs(studio): record archive request receipt readback evidence` |
| D.3C.4 runtime smoke evidence | `7580b2b docs(studio): record archive request delivery runtime smoke` |

## What D.3C Now Proves

- Chrome Studio can connect to the dedicated folder `$HOME/H2O Studio Archive Requests`.
- Chrome can write a metadata-only request file to `inbox/<requestId>.request.json`.
- Chrome uses the File System Access API under an explicit user gesture.
- Chrome uses a dedicated IndexedDB handle (`h2o.studio.archive-requests.folder.mv3`
  / `handles` / `archive-requests-folder`) separate from the Sync handle.
- Chrome creates/uses `inbox/` only.
- Chrome does not create or write `receipts/`.
- Desktop scanner reads the inbox.
- Desktop enqueues/resolves the request through the D.2B queue path.
- Desktop writes a receipt.
- Chrome manually reads the Desktop receipt.
- Receipt read-back is informational only.
- The Desktop queue remains authoritative.
- Runtime smoke proved the full loop:
  Chrome -> Desktop inbox -> Desktop scanner -> Desktop receipt -> Chrome read-back.

## D.3C.4 Runtime Observed Result

Chrome (Settings -> Diagnostics -> Archive Request Delivery), manual read-back:

- Chrome UI showed: **Needs a Desktop snapshot first**
- requestId: `323be131-ae1d-4f53-962e-58bf35755da2`
- receipt.status: `needs-desktop-snapshot`
- enqueueStatus: `needs-desktop-snapshot`
- dedupeKey: `sha256-6b6231ac6cccae6c2a5beca8abf3853b826d1e311c025f6b18837dce4f5f1255`

Desktop scanner (`scanSavedChatArchiveRequestInboxV1`):

- scanned: 17
- processed: 11
- receiptsWritten: 11
- needsDesktopSnapshot: 1
- duplicates: 4
- rejected: 6
- validated: 0
- materializeTriggered: false
- packageWriteDeferred: true
- status: `completed-with-blockers`

## Interpretation Of `completed-with-blockers`

The `completed-with-blockers` scan status was expected. The inbox still contained
the intentional older D.3B.2 negative fixture files:

- malformed JSON
- filename / requestId mismatch
- oversized files over 128 KB

These fixture blockers account for the `rejected: 6` count and the
`completed-with-blockers` status. They do not invalidate D.3C: the D.3C proof
target was the Chrome delivery / read-back path. The Chrome-delivered request was
processed by Desktop (a receipt was written) and read back by Chrome, mapping to
`needs-desktop-snapshot` because no Desktop snapshot exists yet for that
conversation.

## Locked Boundaries

- Chrome remains intent-only.
- Desktop remains authoritative.
- No Chrome package writer.
- No Chrome CAS writer.
- No Chrome SQLite write.
- No Chrome `contentHash` computation.
- No transcript / messages / html / assets / package content in the Chrome request.
- No auto-materialization.
- No polling.
- No watcher.
- No background write/read.
- No native messaging.
- No localhost relay.
- No sync/WebDAV/cloud transport.
- No Archive Health UI mutation.
- No import/recovery.
- No user-folder export/save-dialog.
- No main save-to-folder integration yet.

## Deferred Work

- Optional stronger proof with an existing Desktop snapshot so the receipt status
  becomes `validated` instead of `needs-desktop-snapshot`.
- Optional full package proof:
  Chrome request -> Desktop inbox -> queue `validated` -> D.2C materializer ->
  package written -> archive diagnostics OK.
- Main Chrome save-to-folder / archive action integration.
- Native messaging or a production transport alternative, if later needed.
- Retry / overwrite / delete / repair / stale-`writing` policy.
- Import / export / recovery phase.
- Saved-package sync / WebDAV / cloud phase.
- Cleanup or isolation note for the old D.3B.2 negative fixture files if future
  scans should avoid `completed-with-blockers`.

## Validation

```text
git diff --check
git diff --cached --check
```

Results:

- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint script exists in `package.json` (confirmed); none was run.

## Outcome

D.3C is CLOSED. The Chrome delivery + receipt read-back lane is contract-locked
(D.3C.0), implemented (D.3C.1 delivery module, D.3C.2 manual Settings UI, D.3C.3
read-back), and proven end-to-end on a real Chrome + Desktop setup (D.3C.4),
with all metadata-only / intent-only / Desktop-authoritative boundaries intact.
