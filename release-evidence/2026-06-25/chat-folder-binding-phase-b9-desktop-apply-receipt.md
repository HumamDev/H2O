# Chat-Folder Binding Phase B9: Desktop Apply + Receipt for Chrome-Origin Requests

## Verdict

PASS / CLOSED.

Desktop now imports the B8 Chrome-origin chat-folder binding request, isolates stale folder-delete request noise, reconciles a stale resolved binding review against the live canonical binding store, applies the Desktop-authoritative move, and writes an updated Desktop projection/receipt into `latest.json`.

B9 runtime proof is now closed end to end: Chrome remained request-only, Desktop applied the canonical binding move, Desktop exported the updated projection/receipt, and Chrome imported Desktop state with binding parity green.

## Request Under Test

B8 request present in `/Users/hobayda/H2O Studio Sync/chrome-latest.json`:

- transport lane: `chatFolderBindingRequests[]`
- requestId: `chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52`
- schema: `h2o.studio.chat-folder-binding-request.v1`
- chatId / conversationId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- expectedCurrentFolderId: `f_e301f3506938c19dbac0e304`
- targetFolderId: `f_2bb1037f88b2719dbac10c22`
- sourceSurface: `chrome-studio`
- status: `pending`
- desktopApplyRequired: `true`
- noChromeBindingAuthority: `true`

## Root Cause Closed

Two runtime issues blocked B9:

1. Old folder-delete requests with `already-tombstoned` were treated as fatal auto-apply failures, so unrelated chat-folder binding request lanes were blocked/noisy.
2. Replaying the same `chrome-latest.json` fingerprint returned `already-imported` before request lanes could rerun, so valid pending request lanes were skipped after the first ledgered import.

The fix:

- treats folder-delete `already-tombstoned` as idempotent/already-handled.
- exposes `chatFolderBindingRequestImport` and `chatFolderBindingRequestAutoApply` in the propagation result.
- replays duplicate `chrome-latest.json` imports when request lanes are present.
- verifies resolved chat-folder binding reviews against the live canonical binding store before accepting `already-applied`.
- reconciles stale resolved reviews by applying the canonical Desktop move when the live binding still matches `expectedCurrentFolderId`.

## Desktop Apply Runtime Proof

Command:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op syncNow \
  --allow-mutation \
  --payload-json '{"direction":"chrome-to-desktop","reason":"phase-b9-apply-chrome-binding-request-after-stale-resolved-reconcile"}' \
  --timeout-ms 60000
```

Result summary:

- ok: `true`
- status: `imported`
- blockers: `[]`
- folderDeleteRequestImport.found: `2`
- folderDeleteRequestAutoApply.ok: `true`
- folderDeleteRequestAutoApply.alreadyAppliedCount: `2`
- folderDeleteRequestAutoApply.failedCount: `0`
- folderDeleteRequestAutoApply.warnings: `["folder-delete-request-already-tombstoned-idempotent"]`
- chatFolderBindingRequestImport.ok: `true`
- chatFolderBindingRequestImport.found: `1`
- chatFolderBindingRequestImport.updated: `1`
- chatFolderBindingRequestAutoApply.ok: `true`
- chatFolderBindingRequestAutoApply.appliedCount: `1`
- chatFolderBindingRequestAutoApply.alreadyAppliedCount: `0`
- chatFolderBindingRequestAutoApply.failedCount: `0`
- chatFolderBindingRequestAutoApply.receiptExportReadyCount: `1`
- desktopAppliedChatFolderBindingRequestCount: `1`
- warnings included `stale-resolved-chat-folder-binding-request-reapplied`

Applied request:

- requestId: `chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52`
- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- expectedCurrentFolderId: `f_e301f3506938c19dbac0e304`
- targetFolderId: `f_2bb1037f88b2719dbac10c22`
- status: `chat-folder-binding-request-reconciled-after-stale-resolved-review`
- beforeFolderId: `f_e301f3506938c19dbac0e304`
- afterFolderId: `f_2bb1037f88b2719dbac10c22`
- resolvedCanonicalReconciled: `true`
- resolvedCanonicalVerified: `true`

Safety flags remained true:

- Chrome remains request-only.
- noChromeBindingAuthority: `true`
- noChromeDestructiveBindingApply: `true`
- noDesktopCanonicalMutationFromChrome: `true`
- noHardDelete: `true`
- noPurge: `true`
- noChatDelete: `true`
- noSnapshotDelete: `true`
- noAssetDelete: `true`
- no chat deletion.
- no snapshot deletion.
- no asset deletion.

## Desktop Canonical Binding Proof

Command:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseChatFolderBindingParity \
  --timeout-ms 60000
```

Result summary:

- ok: `true`
- status: `chat-folder-binding-parity-diagnosed`
- totalBindingCount: `12`
- desktopBindingCount: `12`
- knownChatCount: `41`
- unfiledCount: `29`
- Code `f_e301f3506938c19dbac0e304`: `0`
- English `f_2bb1037f88b2719dbac10c22`: `1`
- Tech `f_3bf15f43b835d19dbac0fb13`: `2`
- deletedFolderBindingCount: `0`
- blockers: `[]`

## Desktop Export / Receipt Transport Proof

The explicit Desktop-to-Chrome queue export command timed out and later reported `latest-sync-bundle-write-failed`, but the Desktop auto-export path wrote the updated transport file immediately after the Desktop canonical change.

Direct `/Users/hobayda/H2O Studio Sync/latest.json` inspection:

- exportedAt: `2026-06-28T18:09:48.948Z`
- bytes: `765932`
- desktopCanonicalChatFolderBindings.bindingCount: `12`
- Code count: `0`
- English count: `1`
- Tech count: `2`
- chatFolderBindingReceipts count: `1`
- target receipt requestId: `chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52`
- target receipt status: `applied`
- target receipt result: `applied-chat-folder-binding-request`
- beforeFolderId: `f_e301f3506938c19dbac0e304`
- afterFolderId: `f_2bb1037f88b2719dbac10c22`
- noChromeBindingAuthority: `true`
- noHardDelete: `true`
- noChatDelete: `true`
- noSnapshotDelete: `true`
- noAssetDelete: `true`

## Chrome Setup Runtime Proof

Final Chrome Studio target and sync folder state:

- isChromeStudio: `true`
- hasSmokeFlag: `true`
- hasFolderSync: `true`
- folderName: `H2O Studio Sync`
- connected: `true`
- permission: `granted`
- noFolderHandle: `false`
- chromeWritesSyncFolder: `true`
- desktopToChromePermission: `granted`
- health.status: `healthy`
- blockers: `[]`

## Chrome Import / Parity Final Proof

After reconnecting the Chrome Studio profile to `/Users/hobayda/H2O Studio Sync`, Chrome imported Desktop state and diagnosed binding parity:

- healthOk: `true`
- healthStatus: `healthy`
- healthBlockers: `[]`
- desktopToChromeInFlight: `false`
- lastImportStatus: `sync-folder-imported`
- lastImportedAt: `2026-06-28T18:37:06.486Z`
- parityOk: `true`
- importedCount: `12`
- chromeCount: `12`
- Code `f_e301f3506938c19dbac0e304`: `0`
- English `f_2bb1037f88b2719dbac10c22`: `1`
- Tech `f_3bf15f43b835d19dbac0fb13`: `2`
- pendingRequests: `0`
- blockers: `[]`
- warnings: `[]`

Interpretation:

- B9 is PASS / CLOSED.
- Desktop successfully imported and applied the Chrome-origin binding request through Desktop canonical authority.
- Chrome remained request-only and then consumed Desktop's updated projection/receipt.
- The chat-folder binding request lifecycle is now complete end to end.
- Earlier `sync-folder-sync-in-flight` import output was non-blocking because final health later showed `desktopToChromeInFlight:false` and `parityOk:true`.

## Validation

Passed after the B9 blocker fix:

- `node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`

Full regression validator run is recorded with the final commit output.

## Remaining Work

- None for B9.
- Later closeout can cover the full Chrome-origin binding lifecycle if needed.
