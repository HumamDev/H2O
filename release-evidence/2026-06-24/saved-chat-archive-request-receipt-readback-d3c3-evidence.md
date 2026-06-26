# Saved Chat Archive Request Receipt Read-Back D.3C.3 Evidence

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.3C.3). This is a docs/evidence-only
note. It adds no runtime code, no validators, no Chrome service-worker
transport, and no Desktop request queue/materializer/package writer/CAS/store/
sync/import/recovery/capability changes.

## Scope

D.3C.3 added read-only, manual receipt read-back to the existing Chrome delivery
module and its Settings card. Chrome reads the Desktop-written receipt on demand
and maps it to an informational status. The Desktop D.3B inbox scanner and D.2B
queue remain the only authority.

Implementation commit:

```text
91158e75b4c5efdf540c0cb7618906e3e859d181 feat(studio): add archive request receipt readback
```

## APIs Added (H2O.Studio.ingestion)

- `readSavedChatArchiveRequestReceiptV1({ requestId })`
- `refreshSavedChatArchiveRequestStatusV1({ requestId })` (manual alias)

## Files Changed (Implementation Commit)

- `src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js`
- `src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery-ui.studio.js`
- `tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs`
- `tools/validation/studio/validate-saved-chat-archive-request-delivery-ui-v1.mjs`

No loader, pack, `studio.js`, or `studio.html` change was required: the read-back
API resolves from the already-loaded delivery module and the card box is already
mounted.

## Proven Behavior

D.3C.3 proves the read-back:

- reads `receipts/<requestId>.receipt.json` using the persisted archive request
  folder handle.
- never creates `receipts/`.
- never writes `receipts/`.
- opens the receipt folder and file without `create: true`.
- enforces a 128 KB receipt size cap.
- parses JSON safely.
- validates `schema === h2o.savedChatArchiveRequestReceipt.v1`.
- validates `receipt.requestId` matches the requested `requestId`.
- treats the receipt as informational only.
- keeps the Desktop queue authoritative.
- is manual only: no polling, no watcher, no automatic background read.
- rejects an unsafe / path-traversal `requestId` before any folder access.

## Status Mapping

| Condition | Read-back status |
|---|---|
| Missing `receipts/` folder or missing receipt file | `delivered-awaiting-desktop` |
| receipt `validated` | `queued-on-desktop` |
| receipt `duplicate` | `already-queued-duplicate` |
| receipt `rejected` | `rejected-by-desktop` |
| receipt `needs-desktop-snapshot` | `needs-desktop-snapshot` |
| receipt `db-unavailable` | `db-unavailable` |
| malformed JSON / oversize | `receipt-malformed` |
| schema mismatch | `receipt-schema-mismatch` |
| `requestId` mismatch | `receipt-request-id-mismatch` |
| folder not connected | `archive-request-folder-not-connected` |
| permission denied | `archive-request-folder-permission-denied` |
| File System Access API unavailable | `file-system-access-unavailable` |

The verdict is mapped from the Desktop receipt `status` / `enqueueStatus`, which
the D.3B inbox scanner writes from the D.2B enqueue result.

## UI Behavior

D.3C.3 proves the Archive Request Delivery card:

- now has a manual "Check receipt" button (click-triggered only).
- reads the receipt for the last delivered `requestId` shown in the card.
- shows the mapped status, plus `receipt.status`, `receipt.enqueueStatus`,
  `dedupeKey`, `duplicateOf`, blockers, and warnings when present.
- asks the user to send a request first when no delivered `requestId` exists.

## Explicit Non-Goals Preserved

D.3C.3 intentionally adds none of the following:

- no receipt writing.
- no `receipts/` creation.
- no polling.
- no watcher.
- no automatic background read.
- no `enqueueSavedChatArchiveRequestV1` call.
- no `materializeSavedChatArchiveRequestV1` call.
- no package writer call.
- no CAS/store writes.
- no Desktop runtime changes.
- no capabilities changes.
- no sync/WebDAV/cloud.
- no native messaging.
- no localhost relay.
- no Archive Health UI changes.
- no main save-to-folder integration.
- no import/recovery.
- no user-folder export/save-dialog.

The following remain deferred:

- D.3C.4 runtime smoke / evidence (real Chrome + Desktop end-to-end).
- D.3C.5 closure.

## Validation

All commands executed and passed:

```text
node --check src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js
node --check src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery-ui.studio.js
node --check tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs
node --check tools/validation/studio/validate-saved-chat-archive-request-delivery-ui-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-runtime-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-ui-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-delivery-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-builder-v1.mjs
git diff --check
git diff --cached --check
```

Results:

- `node --check` on both changed modules and both validators: OK.
- runtime validator
  (`validate-saved-chat-archive-request-delivery-runtime-v1`): PASS 24 checks.
- UI validator (`validate-saved-chat-archive-request-delivery-ui-v1`):
  PASS 16 checks.
- D.3C.0 contract validator (`validate-saved-chat-archive-request-delivery-v1`):
  all 22 checks passed.
- D.3A builder validator (`validate-saved-chat-archive-request-builder-v1`):
  PASS 18 checks.
- `git diff --check` and `git diff --cached --check`: clean.

VM behavior checks proved that the read-back is registered and read-only, that a
read with no connected folder returns `archive-request-folder-not-connected`,
that an unsafe/empty `requestId` returns `receipt-request-id-mismatch`, and that
`formatReceiptResult` maps awaiting/queued/rejected outcomes to the correct
display tones.

No docs/markdown lint script exists in `package.json` (confirmed); none was run.

## Boundary Confirmation

D.3C.3 keeps read-back a thin, read-only, informational view:

- Chrome reads only the metadata receipt file; it never writes or creates
  receipts and never deletes/moves/repairs Desktop files.
- Desktop remains the owner of validation, queue/status persistence, package
  materialization, CAS, archive diagnostics, and durable archive state.
- The receipt is informational; the Desktop queue stays the source of truth.
