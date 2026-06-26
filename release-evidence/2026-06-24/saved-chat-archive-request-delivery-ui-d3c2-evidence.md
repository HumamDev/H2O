# Saved Chat Archive Request Delivery UI D.3C.2 Evidence

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.3C.2). This is a docs/evidence-only
note. It adds no runtime code, no validators, no Chrome service-worker
transport, and no Desktop request queue/materializer/package writer/CAS/store/
sync/import/recovery/capability changes.

## Scope

D.3C.2 added a minimal manual Settings -> Diagnostics card:

```text
Archive Request Delivery
```

The card provides the explicit user gesture for the D.3C.1 low-level delivery
module. It is clearly separated from the read-only Archive Health card and is
mounted only into its own box; it never repaints Settings or touches the Archive
Health UI.

Primary UI module:

```text
src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery-ui.studio.js
```

Implementation commit:

```text
92f66d7c0639b39561a5bc48de4acc8e3893576f feat(studio): add archive request delivery settings control
```

## APIs Used (H2O.Studio.ingestion)

- `diagnoseSavedChatArchiveRequestDeliveryV1`
- `connectSavedChatArchiveRequestFolderV1`
- `disconnectSavedChatArchiveRequestFolderV1`
- `deliverSavedChatArchiveRequestV1`

## Proven UI Behavior

D.3C.2 proves the card:

- renders diagnose/status output from `diagnoseSavedChatArchiveRequestDeliveryV1`.
- shows File System Access availability, folder connection, folder name,
  permission, and the automatic-delivery disabled state.
- exposes a "Connect archive request folder" button that calls
  `connectSavedChatArchiveRequestFolderV1`.
- exposes a "Disconnect folder" button that calls
  `disconnectSavedChatArchiveRequestFolderV1`.
- exposes a "Send test archive request" button that calls
  `deliverSavedChatArchiveRequestV1` with `confirmDelivery: true`.
- invokes the Send action inside the click handler so File System Access
  permission/write is bound to the user gesture.
- builds the test request through the existing builder path and keeps it
  metadata-only (no transcript / messages / html / assets / contentHash /
  package content).
- marks the test request as a D.3C.2 manual test archive request
  (`source.title = "D.3C.2 manual test archive request"`).
- writes only `inbox/<requestId>.request.json` through the D.3C.1 delivery
  module (never the Desktop-owned receipts folder).
- displays the delivery result status, `requestId`, `dedupeKey`, `fileName`,
  blockers, and warnings.
- degrades cleanly on Desktop / non-Chrome where the delivery APIs are absent,
  showing an "available in Chrome Studio only" message instead of crashing.

The delivery statuses surfaced by the card include `delivered`,
`delivery-disabled`, `file-system-access-unavailable`,
`archive-request-folder-not-connected`,
`archive-request-folder-permission-denied`,
`archive-request-folder-name-mismatch`, `builder-failed`, `unsafe-envelope`,
`envelope-too-large`, and `inbox-write-failed`.

## Explicit Non-Goals Preserved

D.3C.2 intentionally adds none of the following:

- no receipt read-back.
- no polling.
- no watcher.
- no automatic background write.
- no main save-to-folder integration.
- no Chrome service-worker transport.
- no native messaging.
- no localhost relay.
- no sync/WebDAV/cloud.
- no `enqueueSavedChatArchiveRequestV1` call from the UI.
- no `materializeSavedChatArchiveRequestV1` call.
- no package writer call.
- no CAS/store writes.
- no Desktop runtime changes.
- no capabilities changes.
- no Archive Health UI changes.
- no import/recovery.
- no user-folder export/save-dialog.

The following remain deferred:

- D.3C.3 receipt read-back.
- D.3C.4 runtime smoke / evidence (real Chrome + Desktop).
- D.3C.5 closure.

## Files Changed (Implementation Commit)

- `src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery-ui.studio.js`
- `tools/validation/studio/validate-saved-chat-archive-request-delivery-ui-v1.mjs`
- `src-surfaces-base/studio/studio.html`
- `src-surfaces-base/studio/studio.js`
- `tools/product/studio/pack-studio.mjs`

## Validation

All commands executed and passed:

```text
node --check src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery-ui.studio.js
node --check tools/validation/studio/validate-saved-chat-archive-request-delivery-ui-v1.mjs
node --check src-surfaces-base/studio/studio.js
node --check tools/product/studio/pack-studio.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-ui-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-builder-v1.mjs
git diff --check
git diff --cached --check
```

Results:

- UI validator (`validate-saved-chat-archive-request-delivery-ui-v1`):
  PASS 15 checks (12 static + 3 VM behavior).
- D.3C.1 runtime validator
  (`validate-saved-chat-archive-request-delivery-runtime-v1`): PASS 20 checks.
- D.3C.0 contract validator (`validate-saved-chat-archive-request-delivery-v1`):
  all 22 checks passed.
- D.3A builder validator (`validate-saved-chat-archive-request-builder-v1`):
  PASS 18 checks.
- `node --check` of the UI module, UI validator, `studio.js`, and
  `pack-studio.mjs`: OK.
- `git diff --check` and `git diff --cached --check`: clean.

VM behavior checks proved that `buildTestRequestOptions()` is gesture-confirmed
(`confirmDelivery: true`) and carries no forbidden authoritative fields, that
`formatDeliveryResult` maps the `delivered` and `unsafe-envelope` outcomes to
the correct display tones, and that `renderArchiveRequestDeliveryCard` degrades
to a "Chrome Studio only" message when the delivery APIs are absent.

No docs/markdown lint script exists in `package.json` (confirmed); none was run.

## Boundary Confirmation

D.3C.2 keeps the card a thin, manual, gesture-bound utility:

- The card only calls the D.3C.1 delivery APIs; it never calls the Desktop
  queue, materializer, package writer, CAS, or store.
- The Send action writes only a metadata-only request file into `inbox/`.
- The Archive Health card and its mount remain intact and untouched.
- Desktop remains the owner of validation, queue/status persistence, package
  materialization, CAS, archive diagnostics, and durable archive state.
