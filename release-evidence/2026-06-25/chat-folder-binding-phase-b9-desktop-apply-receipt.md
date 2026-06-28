# Chat-Folder Binding Phase B9: Desktop Apply + Receipt for Chrome-Origin Requests

## Verdict

PARTIAL PASS: the B9 Desktop apply runtime blocker is fixed.

Desktop now imports the B8 Chrome-origin chat-folder binding request, isolates stale folder-delete request noise, reconciles a stale resolved binding review against the live canonical binding store, applies the Desktop-authoritative move, and writes an updated Desktop projection/receipt into `latest.json`.

Remaining runtime proof blocker: Chrome CDP import could not be completed in the available profiles. Port `9224` did not expose the Studio Launcher extension, and port `9247` exposed Studio but had no granted sync-folder handle (`sync-folder-missing` / `noFolderHandle:true`). This is an operator/profile permission blocker, not a Desktop apply blocker.

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

## Chrome Import Runtime Blocker

Chrome import could not be completed in the available runtime profiles:

- Port `9224` returned `chrome-load-extension-ignored` / `studio-launcher-extension-not-loaded`.
- Port `9247` found the Studio Launcher extension and Studio target, but `syncNow` returned:
  - status: `sync-folder-not-connected`
  - blockers: `["sync-folder-missing"]`
  - connected: `false`
  - permission: `unknown`
  - permissionRequired: `true`
  - noFolderHandle: `true`

Next runtime action for full Chrome proof: reconnect the `9247` Chrome Dev smoke profile to `/Users/hobayda/H2O Studio Sync`, then run Desktop-to-Chrome import and `diagnoseChatFolderBindingParity`.

## Validation

Passed after the B9 blocker fix:

- `node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`

Full regression validator run is recorded with the final commit output.

## Remaining Work

- Reconnect Chrome CDP profile sync-folder access and rerun the Chrome import/parity proof.
- Investigate the explicit Desktop-to-Chrome queue export command returning `latest-sync-bundle-write-failed` despite `latest.json` being written by auto-export.

These are runtime/operator follow-ups. The B9 stale folder-delete blocker and stale resolved review apply path are fixed.
