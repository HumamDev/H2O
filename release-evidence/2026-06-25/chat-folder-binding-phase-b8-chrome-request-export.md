# Chat-Folder Binding Sync B8 - Chrome Request Export

Date: 2026-06-28

## Verdict

PASS / CLOSED. B8 adds Chrome-origin chat-folder binding request creation and export. Chrome can request a binding change, but Chrome still does not mutate Desktop canonical binding state.

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

PASS / CLOSED.

Fresh Chrome runtime loaded the current B8 smoke bridge:

- `studioTargetFound:true`
- `smokeRegistryOverlayStatus:"source-current"`
- `allowedMutationOps` included `requestChatFolderBinding`
- `allowedReadOnlyOps` included `listChatFolderBindingRequests`

Chrome reconnected to the correct sync folder and health was green:

- `folderName:"H2O Studio Sync"`
- `connected:true`
- `permission:"granted"`
- `chromeWritesSyncFolder:true`
- `health.status:"healthy"`
- `blockers:[]`

Chrome request creation:

- `op:"requestChatFolderBinding"`
- `ok:true`
- `status:"pending-created"`
- `requestId:"chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52"`
- `blockers:[]`
- `warnings:[]`

Request payload:

- `chatId:"69dd285f-16ec-8390-a458-0574c6ea956e"`
- `conversationId:"69dd285f-16ec-8390-a458-0574c6ea956e"`
- `expectedCurrentFolderId:"f_e301f3506938c19dbac0e304"`
- `targetFolderId:"f_2bb1037f88b2719dbac10c22"`
- `sourceSurface:"chrome-studio"`
- `reason:"phase-b8-runtime-request-only-proof"`

Chrome request list:

- `ok:true`
- `status:"chat-folder-binding-requests-listed"`
- `count:1`
- `requestOnly:true`
- `noChromeBindingAuthority:true`
- `noDesktopCanonicalMutation:true`

Listed request:

- `requestId:"chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52"`
- `recordKind:"folderBinding"`
- `classification:"binding-request"`
- `status:"pending"`
- `remoteSyncPeerId:"chrome-studio"`
- warning:`"desktop-binding-apply-required"`

Note: the list projection showed `folderId` as the chat/conversation id. The exported canonical request payload was correct, so this is a non-blocking review-list projection quirk.

Chrome export:

- `op:"syncNow"`
- `direction:"chrome-to-desktop"`
- `ok:true`
- `status:"chrome-to-desktop-exported"`
- `blockers:[]`
- `warnings:[]`

Export safety:

- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noHardDelete:true`
- `noPurge:true`

Export file inspection:

File:

`/Users/hobayda/H2O Studio Sync/chrome-latest.json`

Confirmed top-level key:

- `chatFolderBindingRequests`

Confirmed exported request:

- `schema:"h2o.studio.chat-folder-binding-request.v1"`
- `requestId:"chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52"`
- `reviewId:"chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52"`
- `recordKind:"folderBinding"`
- `intent:"chat-folder-binding-request"`
- `classification:"binding-request"`
- `chatId:"69dd285f-16ec-8390-a458-0574c6ea956e"`
- `conversationId:"69dd285f-16ec-8390-a458-0574c6ea956e"`
- `expectedCurrentFolderId:"f_e301f3506938c19dbac0e304"`
- `targetFolderId:"f_2bb1037f88b2719dbac10c22"`
- `targetKind:"folder"`
- `targetUnfiled:false`
- `requestedAt:"2026-06-28T14:20:02.400Z"`
- `createdAt:"2026-06-28T14:20:02.400Z"`
- `requestedBy:"chrome-studio"`
- `sourceSurface:"chrome-studio"`
- `sourcePeerId:"chrome-studio"`
- `status:"pending"`
- `reason:"phase-b8-runtime-request-only-proof"`
- `desktopApplyRequired:true`
- `noLocalApply:true`
- `noChromeBindingAuthority:true`
- `noChromeDestructiveBindingApply:true`
- `noDesktopCanonicalMutation:true`
- `noTombstoneApply:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`
- `noFolderMutation:true`
- `noBindingMutation:true`
- `noChatMutation:true`
- `noSnapshotMutation:true`
- `transportedAt:"2026-06-28T15:26:46.388Z"`
- `exportSource:"review-store"`

Desktop canonical unchanged proof:

Command:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 60000
```

Result:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `canonicalSource:"desktop-store-folder-bindings"`
- `canonicalBindingReadPath:"store.folders.listCanonicalChatFolderBindings"`
- `desktopCanonicalBindingProjectionAvailable:true`
- `totalBindingCount:12`
- `desktopBindingCount:12`
- `knownChatCount:41`
- `unfiledCount:29`
- `missingFolderBindingCount:2`
- `deletedFolderBindingCount:0`
- `fallbackUnfiledBindingCount:2`
- `activeDanglingFolderBindingCount:2`
- `activeDeletedFolderBindingExportedAsActive:false`
- `deletedFolderBindingsExcludedFromActiveProjection:true`
- `restoredFolderBindingCount:2`
- `bindingRecoverySnapshotCount:1`
- `blockers:[]`
- `warnings:["chrome-binding-import-deferred","desktop-orphan-binding-scan-unavailable"]`
- `noChromeDestructiveBindingApply:true`
- `noAssetDelete:true`

Desktop folder binding counts remained unchanged:

- `f_e301f3506938c19dbac0e304:1`
- `f_2bb1037f88b2719dbac10c22:0`
- `f_d04f98de89e35819e885aef8e:6`
- `f_7050f49d3f341819dba53d547:3`
- `f_3bf15f43b835d19dbac0fb13:2`

Interpretation:

- B8 is PASS / CLOSED.
- Chrome can create and export request-only chat-folder binding requests.
- The exported request payload is correct.
- Desktop canonical binding counts remained unchanged after Chrome request/export.
- Chrome still has no canonical binding authority.
- Desktop apply/receipt is intentionally out of scope and should be B9.

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
