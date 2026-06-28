# Chat-Folder Binding Sync B8 - Chrome Request Export

Date: 2026-06-28

## Verdict

PARTIAL / IMPLEMENTED. B8 adds Chrome-origin chat-folder binding request creation and export. Chrome can request a binding change, but Chrome still does not mutate Desktop canonical binding state.

Desktop apply/receipt for Chrome binding requests is deferred to B9.

## Context

- Desktop-authoritative binding closeout: `817f360da185c183be46b147b6fcb5602a80ffdc`
- B7 restore rebind: `0867f7f75ab8ac409f9954c6624c54eb1a082ba9`

## Implementation

Chrome/MV3 request schema:

- `h2o.studio.chat-folder-binding-request.v1`
- top-level Chrome transport field: `chatFolderBindingRequests[]`
- export summary: `chatFolderBindingRequestExport`
- pending export mirror key: `h2o:studio:chat-folder-binding-requests:pending-export:v1`

Chrome store APIs:

- `requestChatFolderBinding`
- `findPendingChatFolderBindingRequest`
- `listChatFolderBindingRequests`
- `diagnoseChatFolderBindingRequests`

Smoke bridge / CDP:

- `requestChatFolderBinding`
- `listChatFolderBindingRequests`
- `diagnoseChatFolderBindingParity` now reports pending request counts:
  - `chatFolderBindingRequestPendingCount`
  - `chromePendingBindingRequestCount`
  - `chatFolderBindingRequestTotalCount`
  - `chromeBindingRequestsAreRequestOnly:true`

## Request Shape

Each request includes:

- `requestId`
- `reviewId`
- `chatId`
- `conversationId`
- `expectedCurrentFolderId`
- `targetFolderId` for folder moves
- `targetKind:"folder"` or `targetKind:"unfiled"`
- `targetUnfiled`
- `sourceSurface:"chrome-studio"`
- `reason`
- `createdAt`
- `requestedAt`
- `desktopApplyRequired:true`
- `noLocalApply:true`
- `noChromeBindingAuthority:true`
- `noChromeDestructiveBindingApply:true`
- `noDesktopCanonicalMutation:true`
- safety flags for no hard delete, purge, chat deletion, snapshot deletion, and asset deletion

Duplicate pending requests for the same chat and target return `pending-existing` rather than creating duplicate rows.

## Safety Boundaries

- Chrome request is request-only.
- no Chrome destructive binding authority
- Chrome display parity still reads Desktop canonical projection.
- no direct canonical binding write
- Chrome does not directly write Desktop canonical bindings.
- Chrome does not call Desktop binding apply.
- Chrome does not apply tombstones.
- No hard delete.
- No purge.
- No chat deletion.
- no chat deletion
- No snapshot deletion.
- no snapshot deletion
- No asset deletion.
- no asset deletion

## Runtime Proof

PARTIAL / BLOCKED BY STALE LIVE CHROME ASSETS.

Runtime was attempted against the existing Chrome Dev CDP profile on port `9247`.

Chrome health was green:

- `ok:true`
- `status:"healthy"`
- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:[]`

The CDP helper loaded from source exposed the B8 operation in its mutation allowlist:

- `requestChatFolderBinding`
- `listChatFolderBindingRequests`

A safe no-op binding request target was selected from the current Desktop canonical projection:

- `chatId:"69f0a945-8640-83eb-a5e4-9c433fedee5b"`
- `conversationId:"69f0a945-8640-83eb-a5e4-9c433fedee5b"`
- `expectedCurrentFolderId:"f_3bf15f43b835d19dbac0fb13"`
- `targetFolderId:"f_3bf15f43b835d19dbac0fb13"`
- reason:`"phase-b8-chrome-binding-request-export-proof"`

The runtime request was blocked before any request row was created:

- `ok:false`
- `status:"op-not-allowlisted"`
- `blockers:["op-not-allowlisted"]`

Root cause: the active Chrome page registry is stale and does not yet include the B8 bridge operation in its in-page allowlist. The helper's source-side allowlist includes the op, but the loaded page allowlist ended at pre-B8 operations:

- `getFolderModel`
- `createFolder`
- `renameFolder`
- `setFolderColor`
- `syncNow`
- `diagnoseHealth`
- `diagnoseVisibleFolderParity`
- `diagnoseCanonicalVisibleFolderSet`
- `diagnoseChromeRecentlyDeletedCompanion`
- `diagnoseChatFolderBindingParity`
- `requestFolderDelete`
- `listFolderDeleteRequests`
- `requestFolderRestore`
- `listFolderRestoreRequests`
- `applyFolderDeleteRequest`
- `applyFolderRestoreRequest`
- `listFolderDeleteReceipts`
- `listActiveFolderTombstones`
- `listRecentlyDeletedFolders`
- `diagnosePurgedFolderResurrectionCandidates`
- `restoreFolder`
- `countChatsSnapshots`
- `verifyFolderVisible`
- `verifyFolderHidden`

Interpretation:

- B8 source implementation is present and statically validated.
- The active runtime profile needs rebuilt/reloaded Studio Launcher assets before the B8 request/export proof can run end to end.
- No Desktop canonical binding mutation occurred.
- No Chrome destructive binding authority was added or exercised.
- No chat, snapshot, asset, folder hard-delete, or purge operation occurred.

## Validation

Static validator:

- `tools/validation/sync/validate-chat-folder-binding-phase-b8-chrome-request-export.mjs`

Required validator chain:

- B8 Chrome request export
- B7 restore rebind
- B6 delete fallback
- B5 Desktop-origin convergence
- B4 Chrome display parity
- B3 Chrome import/read parity
- B2 Desktop export
- B1 diagnostics

## Remaining Work

B9 should implement Desktop import/apply/receipt for Chrome-origin chat-folder binding requests. Full bidirectional binding lifecycle closeout should wait until B9 runtime proof is green.
