# Saved Chat Archive Request Delivery D.3C.4 Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.3C.4). This is a docs/evidence-only
note recording a real Chrome + Desktop runtime pass. It adds no runtime code,
no validators, and no Chrome/Desktop/capability changes.

## Smoke Target

D.3C.4 proves the end-to-end Chrome delivery + Desktop scanner + Chrome receipt
read-back path:

```text
Chrome delivery -> Desktop-owned inbox -> Desktop scanner (D.2B enqueue) ->
Desktop receipt -> Chrome manual read-back
```

Relevant implementation commits:

```text
d99a5a9 feat(studio): add chrome archive request delivery        (D.3C.1 delivery module)
92f66d7 feat(studio): add archive request delivery settings control (D.3C.2 manual UI)
91158e7 feat(studio): add archive request receipt readback        (D.3C.3 read-back)
56a6196 docs(studio): record archive request receipt readback evidence (D.3C.3 evidence)
```

## Chrome Runtime (Settings -> Diagnostics -> Archive Request Delivery)

The Archive Request Delivery card was driven manually under explicit user
gestures.

Observed Chrome diagnostics state:

- File System Access: available
- Folder connected: yes
- Folder name: `H2O Studio Archive Requests`
- Permission: granted
- Automatic delivery: disabled

Observed receipt read-back result (manual "Check receipt"):

- Chrome UI displayed: **Needs a Desktop snapshot first**
- requestId: `323be131-ae1d-4f53-962e-58bf35755da2`
- receipt.status: `needs-desktop-snapshot`
- enqueueStatus: `needs-desktop-snapshot`
- dedupeKey: `sha256-6b6231ac6cccae6c2a5beca8abf3853b826d1e311c025f6b18837dce4f5f1255`

## Desktop Scanner

Command executed in Desktop Studio DevTools:

```js
(async () => {
  const scan = await H2O.Studio.ingestion.scanSavedChatArchiveRequestInboxV1({
    limit: 50,
    writeReceipts: true,
  });

  console.log("[d3c4-desktop-inbox-scan]", scan);
})();
```

Observed scan result:

- schema: `h2o.savedChatArchiveRequestInboxScan.v1`
- rootPath: `$HOME/H2O Studio Archive Requests`
- inboxPath: `$HOME/H2O Studio Archive Requests/inbox`
- receiptsPath: `$HOME/H2O Studio Archive Requests/receipts`
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

The scan status `completed-with-blockers` was expected. The inbox still contained
the intentional older D.3B.2 negative fixture files:

- malformed JSON
- filename / requestId mismatch
- oversized files over 128 KB

Those fixtures account for the `rejected: 6` count and the
`completed-with-blockers` status. They do not invalidate D.3C.4: the D.3C.4 proof
target is the Chrome delivery and read-back path. The Chrome-delivered request
was processed by Desktop, a Desktop receipt was written, and Chrome read that
receipt successfully (`needs-desktop-snapshot`, because no Desktop snapshot
exists yet for that conversation).

## Proven End-To-End Path

- Chrome connected to the dedicated `H2O Studio Archive Requests` folder.
- Chrome delivery wrote a metadata-only request file into the Desktop-owned inbox.
- Desktop scanner read the inbox.
- Desktop enqueued/resolved the request through the D.2B queue path.
- Desktop wrote a receipt.
- Chrome manually read the receipt.
- Chrome mapped the receipt to `needs-desktop-snapshot`.
- No package materialization was triggered (`materializeTriggered: false`).
- No package write occurred (`packageWriteDeferred: true`).
- No CAS write occurred.
- No sync/WebDAV/cloud transport was used.
- No native messaging was used.
- No localhost relay was used.
- Automatic delivery stayed disabled.
- Receipt read-back remained manual and informational.

## Preserved Boundaries

- Chrome remained intent-only.
- Desktop remained authoritative.
- The receipt remained informational only.
- No auto-materialization.
- No polling.
- No watcher.
- No background write/read.
- No main save-to-folder integration.
- No Archive Health UI changes.
- No import/recovery.
- No user-folder export/save-dialog.

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

D.3C.4 runtime smoke: EXECUTED - PASSED. The Chrome delivery + Desktop scanner +
Chrome receipt read-back loop works end-to-end on a real Chrome + Desktop setup,
with all metadata-only / intent-only / Desktop-authoritative boundaries intact.
D.3C.5 (milestone closure) remains the only open D.3C subphase.
