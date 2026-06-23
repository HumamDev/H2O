# Folder Delete Tombstone Phase 4C Closeout

Date: 2026-06-23

## Purpose

This note closes the Phase 4C local Chrome <-> Desktop folder delete request loop. Phase 4C adds a non-destructive Chrome request path, transports that request to Desktop, applies the request only on Desktop through the existing safe soft-delete authority, exports a status-only receipt back to Chrome, resolves the Chrome request, and hides the folder from Chrome visible folder state.

The existing Phase 4C validator already asserts the completed loop structurally, so no validator code change was needed for this closeout.

## Completed Commits

- Chrome request-only implementation: `bcf47cbba572f3e60d31e8d52de645f55d6291a4`
- Chrome request runtime proof: `22e07263afc4532abcb10dbf252358615cdb4caf`
- Chrome-to-Desktop request transport: `9bfb26e1ab800d12a9f815eea74d20e726654f5a`
- Request transport runtime proof: `ae190ace398e3391439ad47b0aefdcd4658c4662`
- Desktop review/apply implementation: `5b8da7e5b0de11f28f9a47db690eadb8536788db`
- Desktop apply runtime proof: `e86b03aaa6e719918d38aa16fe5c167731f41247`
- Desktop receipt export implementation: `1849f3624492eb272ab031ed6b27f6aa583f8549`
- Receipt export runtime proof: `843836dd99b30ce0bfc5d0e9cec537f37ebcc06c`
- Chrome receipt import implementation: `80ec02ee4f484f6f49549aa477c517c8f3dffde9`
- Receipt import runtime proof: `cb95e81c2e068079ec96353370649e86fa2f30a8`
- Chrome visible hide implementation: `14049f1a3ab6937bc97a92e07d1cf477b228a1df`
- Chrome hide runtime proof: `5f3dc7efe7046d9aa91b505acd74313448ddc576`

## Final Phase 4C Loop

1. Chrome user requests folder delete.
2. Chrome stores a pending local folder-delete request/review.
3. Chrome exports pending request in the Chrome-to-Desktop sync bundle.
4. Desktop imports the request into Desktop review storage without applying it automatically.
5. Desktop operator/API explicitly approves and applies the request.
6. Desktop applies only through `H2O.Studio.store.folders.softDeleteFolder(...)`.
7. Desktop creates the local soft tombstone and hides the folder on Desktop.
8. Desktop exports a status-only `folderDeleteReceipts[]` receipt into `latest.json`.
9. Chrome imports the receipt and resolves the matching local request/review.
10. Chrome hides the folder from visible folder state using the local folder-state mirror only.

## Safety Guarantees Proven

- Chrome never directly deletes folders.
- Desktop is the only authority applying folder delete.
- Desktop apply uses the safe `softDeleteFolder` path.
- Chats are not deleted.
- Snapshots are not deleted.
- No hard delete or purge is enabled.
- Chrome request creation is request-only.
- Desktop request import is review-only and does not auto-apply.
- Desktop receipt export is status-only.
- Chrome receipt import resolves local request/review state.
- Chrome hide is visible-state/mirror-only.
- Chrome does not create or apply tombstones.
- Repeat Desktop apply is idempotently blocked after the request is resolved.
- Repeat Chrome receipt import is idempotent and reports already-resolved/already-hidden state.

## Runtime Proof Highlights

Request/receipt under test:

- requestId/reviewId: `folder-delete-request:bbcd0e2d-3b64-4957-9b52-18bb72178e9a`
- folderId: `fold_eb5a9b09-ee47-494b-b08d-92da2e8471d7`
- folder name: `zz-delete-ui-test`
- Desktop tombstone reference: `tombstone:0d5ed9cf-6a1f-4ae9-9089-6b22114a34df`

Observed proof chain:

- Chrome request proof: pending request created, duplicate request reused, folder remained visible, no folder/chat/binding mutation.
- Desktop request transport proof: Desktop listed pending `delete-request` review from `chrome-studio`, and no active delete was applied by import.
- Desktop apply proof: review moved to resolved/applied, folder became hidden on Desktop, active tombstone was created once, chat and snapshot counts stayed unchanged, repeat apply performed no writes.
- Desktop receipt export proof: `folderDeleteReceipts[]` appeared in `latest.json` with `statusOnly:true`, `noTombstoneApply:true`, `noHardDelete:true`, `noChatDelete:true`, and `tombstonePropagation:deferred`.
- Chrome receipt import proof: matching local Chrome request/review resolved or remained resolved, with no folder hide in 4C.4b.
- Chrome hide proof: validated receipt hid the folder from Chrome FolderParity visible rows, repeat import returned `alreadyHiddenCount:1`, and no Chrome tombstone apply/create occurred.

## Known Caveats

- During the Phase 4C.3a runtime proof, a manual Desktop import later returned `transport-file-missing` after auto-import had already imported or observed the request. The closeout interpretation is that the auto-import path proved the transport, while the manual import result exposed a diagnostics gap around already-consumed or unavailable transport files.
- During the Phase 4C.3b runtime proof, `tombstones.list({ includeRestored:false })` appeared to surface restored tombstones. Active tombstone proof therefore filtered by `!restoredAt`.
- During the Phase 4C.4c runtime proof, Chrome chat row counts from LibraryIndex were not used as the authoritative safety proof because the local LibraryIndex appeared to hydrate during sync. Authoritative safety proof used explicit flags: `noChatDelete:true`, `noChatMutation:true`, `noSnapshotMutation:true`, and `noBindingMutation:true`.

## Deferred Work

- Restore receipts and Chrome re-show behavior.
- Real tombstone propagation.
- Retention and purge.
- WebDAV/cloud/relay transport adapters.
- Public release signing and notarization.

## Validation

- `node --check tools/validation/sync/validate-folder-delete-request-phase4c.mjs` - passed
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs` - passed
  - `requestOnly: true`
  - `transportRequestOnly: true`
  - `desktopIngestReviewOnly: true`
  - `desktopApplyExplicitOnly: true`
  - `desktopReceiptExportStatusOnly: true`
  - `chromeReceiptImportStatusOnlyThenVisibleHide: true`
  - `chromeFolderHideVisibleStateOnly: true`
  - `chromeTombstoneApplyDeferred: true`
  - `noHardDelete: true`
  - `noChatDelete: true`
- `git diff --check` - passed
- `git diff --cached --check` - passed

## Verdict

Phase 4C main delete-request loop is closed for local Chrome <-> Desktop sync.

The release-grade delete loop remains intentionally soft-delete based and operator-approved on Desktop. Destructive purge, restore receipt propagation, and additional transport adapters remain later phases.
