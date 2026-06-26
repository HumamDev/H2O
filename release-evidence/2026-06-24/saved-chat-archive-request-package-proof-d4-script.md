# Saved Chat Archive Request Package Proof D.4 Script

Date: 2026-06-24

Status: D.4.0 SCRIPTED - NOT EXECUTED

Lane: Chat Saving Architecture (D.4 minimal runtime package proof). This is a
docs/evidence-only run-script note. It adds no runtime code, no validators, no
capability changes, no Chrome runtime/service-worker changes, no Desktop runtime
changes, no sync work, no package writer/projector changes, no materializer
changes, no CAS changes, no store adapter changes, no Archive Health UI work,
and no import/recovery behavior.

## Goal

D.4 proves the full package path using already-shipped APIs:

```text
Chrome-delivered metadata-only request
  -> Desktop inbox single-file intake
  -> D.2B queue validated
  -> Chrome receipt read-back
  -> D.2C materializer
  -> package written
  -> package/archive diagnostics OK
```

Use the milestone name **D.4 minimal runtime package proof**. Do not call this
phase D.3D; D.3D was an older alias and is not used for this lane.

## 1. Preconditions

- D.3C is closed at:
  `1aedeac docs(studio): close archive request delivery milestone`
- Chrome folder delivery is connected to:
  `$HOME/H2O Studio Archive Requests`
- Desktop Studio is running the current build.
- Chrome extension is rebuilt/reloaded.
- Chrome remains intent-only.
- Desktop remains authoritative.

## 2. Fixture Selection - Desktop DevTools

Prefer selecting an existing saved chat with an existing snapshot. This should
be read-only fixture selection:

```js
const chats = await H2O.Studio.store.chats.listChats({ limit: 50 });
const candidate = chats.find((chat) => chat?.chatId);
const chatId = candidate.chatId;
const snaps = await H2O.Studio.store.snapshots.listByChat(chatId);
const snapshotId = snaps[0].snapshotId;
console.log("[d4-fixture]", { chatId, snapshotId, title: candidate.title });
```

If no saved snapshot exists, stop and report. Do not silently create fixture
data in D.4.0.

## 3. Chrome Delivery - Chrome Studio DevTools

Deliver a metadata-only request using real Desktop resolution IDs:

```js
const result = await H2O.Studio.ingestion.deliverSavedChatArchiveRequestV1({
  confirmDelivery: true,
  builderOptions: {
    source: {
      surface: "chrome-studio",
      title: "D.4 package proof",
      href: location.href,
      capturedAt: new Date().toISOString(),
      messageCount: 0,
    },
    intent: {
      kind: "save-to-folder",
      target: {
        folderIdAtRequest: null,
        categoryIdAtRequest: null,
        projectIdAtRequest: null,
        labelIdsAtRequest: [],
        tagIdsAtRequest: [],
      },
    },
    desktopResolution: {
      studioChatId: "<CHAT_ID_FROM_DESKTOP>",
      snapshotId: "<SNAPSHOT_ID_FROM_DESKTOP>",
      requireExistingDesktopSnapshot: true,
    },
  },
});

console.log("[d4-chrome-delivery]", result);
```

Expected:

- `result.status === "delivered"`
- `result.requestId` exists
- `result.dedupeKey` starts with `sha256-`
- `result.fileName === "<requestId>.request.json"`

## 4. Desktop Single-File Intake - Desktop DevTools

Use single-file processing to avoid old D.3B.2 negative fixtures:

```js
const intake = await H2O.Studio.ingestion.processSavedChatArchiveRequestInboxFileV1({
  requestId: "<REQUEST_ID_FROM_CHROME>",
  writeReceipt: true,
});

const queue = await H2O.Studio.ingestion.getSavedChatArchiveRequestStatusV1({
  requestId: "<REQUEST_ID_FROM_CHROME>",
});

console.log("[d4-desktop-intake]", { intake, queue });
```

Expected:

- `intake.status === "validated"`
- `queue.status === "validated"`
- queue Desktop resolution `snapshotId` matches selected `snapshotId`
- receipt is written
- no materialization is triggered at this stage

## 5. Chrome Receipt Read-Back - Chrome Studio

Manually check the Desktop receipt:

```js
const receipt = await H2O.Studio.ingestion.readSavedChatArchiveRequestReceiptV1({
  requestId: "<REQUEST_ID_FROM_CHROME>",
});

console.log("[d4-chrome-receipt]", receipt);
```

Expected:

- `receipt.status === "queued-on-desktop"`
- `receipt.receipt.status` or `receipt.receipt.enqueueStatus` is `validated`
- `receipt.requestId` matches `requestId`

## 6. Desktop Materialization - Desktop DevTools

Manually call the D.2C materializer:

```js
const materialized = await H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({
  requestId: "<REQUEST_ID_FROM_CHROME>",
});

console.log("[d4-materialized]", materialized);
```

Expected:

- `materialized.status === "written"`
- `materialized.package.packagePath` exists
- `materialized.package.contentHash` starts with `sha256-`
- `materialized.package.snapshotId` matches selected `snapshotId`
- `schemaVersion` / `payloadVersion` exist

## 7. Package Validation - Desktop DevTools

Validate the written package:

```js
const packageDiag = await H2O.Studio.ingestion.validateSavedChatPackageV1({
  packagePath: materialized.package.packagePath,
  includeCasChecks: true,
  includeRendererChecks: true,
  includeDbChecks: true,
});

console.log("[d4-package-validation]", packageDiag);
```

Expected:

- `packageDiag.blockers.length === 0`
- package status is OK / valid

## 8. Archive Diagnostics - Desktop DevTools

Run an archive-wide diagnostic:

```js
const archiveDiag = await H2O.Studio.ingestion.diagnoseSavedChatArchiveV1({
  includeCasChecks: true,
  includeRendererChecks: true,
  includeDbChecks: true,
  limit: 500,
});

console.log("[d4-archive-diagnostics]", archiveDiag);
```

Expected:

- package appears in OK/valid results or archive status remains acceptable
- no blocker for the D.4 package

## 9. Idempotency - Desktop DevTools

Call the materializer a second time:

```js
const again = await H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({
  requestId: "<REQUEST_ID_FROM_CHROME>",
});

console.log("[d4-materialized-again]", again);
```

Expected:

- `again.status === "already-written"`
- same `packagePath`
- no second package write

## 10. Pass / Fail Criteria

PASS requires:

- Chrome delivery result is `delivered`.
- Desktop single-file intake returns or records `validated`.
- queue status is `validated`.
- Chrome receipt read-back maps to `queued-on-desktop`.
- Desktop materializer returns `written`.
- package metadata exists:
  - `packagePath`
  - `contentHash`
  - `schemaVersion`
  - `payloadVersion`
  - `snapshotId`
  - `writtenAt`
- package validation has zero blockers.
- archive diagnostics show no blocker for the package.
- second materialize returns `already-written`.
- no Chrome package/CAS/SQLite write happened.
- no Chrome `contentHash` computation happened.
- no package was built from Chrome transcript/content.
- no auto-materialization happened.
- no sync/WebDAV/cloud/native messaging/localhost was used.

FAIL if:

- queue status is `needs-desktop-snapshot`.
- materializer returns `not-eligible`.
- package validation has blockers.
- Chrome writes package/CAS/archive content.
- any runtime code changes are needed.

## 11. Fixture Hygiene Note

Old D.3B.2 negative fixtures may remain in:

```text
$HOME/H2O Studio Archive Requests/inbox/
```

D.4 proof uses:

```js
processSavedChatArchiveRequestInboxFileV1({ requestId })
```

so only the target file is processed.

Do not add runtime cleanup/delete/move/repair behavior. Optional manual
out-of-band cleanup can move old negative fixture files to a sibling folder, but
that is not part of D.4.0.

## 12. Preserved Boundaries

- Chrome remains intent-only.
- Desktop remains authoritative.
- No Chrome package writer.
- No Chrome CAS writer.
- No Chrome SQLite write.
- No Chrome `contentHash` computation.
- No transcript/messages/html/assets/package content in Chrome request.
- No auto-materialization.
- No polling.
- No watcher.
- No native messaging.
- No localhost relay.
- No sync/WebDAV/cloud.
- No Archive Health UI mutation.
- No import/recovery.
- No user-folder export/save-dialog.
- No main save-to-folder integration.

## 13. D.4.1 Evidence Plan

After execution, create:

```text
release-evidence/2026-06-24/saved-chat-archive-request-package-proof-d4-runtime-smoke.md
```

Mark:

```text
EXECUTED - PASSED
```

The runtime evidence should record:

- selected `chatId` / `snapshotId`
- Chrome `requestId` / `dedupeKey` / `fileName`
- intake / queue `validated` result
- Chrome receipt `queued-on-desktop` result
- materializer `written` result
- `packagePath` / `contentHash`
- package validator result
- archive diagnostics result
- `already-written` idempotency result
- preserved boundaries
