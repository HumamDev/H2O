# Phase 4D.4 Delete / Restore Lifecycle Smoke Runner

Date: 2026-06-24

## Scope

Phase 4D.4 adds a local smoke runner for the completed delete/restore lifecycle:

Chrome delete request -> Chrome export -> Desktop import/review -> Desktop soft delete apply -> Desktop delete receipt export -> Chrome receipt import/visible hide -> Desktop restore -> Desktop restore receipt export -> Chrome receipt import/visible re-show.

This is a smoke harness only. It does not add production UI, WebDAV/cloud/relay, purge, hard delete, raw SQL access, chat deletion, snapshot deletion, or Chrome tombstone apply/create behavior.

## Files

- `tools/smoke/local-folder-delete-restore-smoke-runner.mjs`
- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/smoke/desktop-folder-sync-queue-client.mjs`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- existing helper validators updated for the new bounded lifecycle smoke allowlists

## Runner Behavior

Command:

```bash
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 30000
```

The runner generates a unique folder name:

```text
zz-4d4-delete-restore-${timestamp}
```

It executes the following required sequence:

1. Chrome creates a safe smoke folder.
2. Chrome exports the folder to Desktop.
3. Desktop imports and verifies the folder visible.
4. Chrome requests folder delete.
5. Chrome exports the delete request.
6. Desktop imports and lists the pending request.
7. Desktop applies the request through the existing reviewed soft-delete path.
8. Desktop verifies the folder hidden.
9. Desktop lists Recently Deleted and captures the active tombstone.
10. Desktop exports the status-only delete receipt.
11. Chrome imports the delete receipt and hides the folder in visible state only.
12. Desktop restores the folder through the existing tombstone restore path.
13. Desktop verifies the restored folder visible.
14. Desktop exports the status-only restore receipt.
15. Chrome imports the restore receipt and re-shows the folder in visible state only.
16. Chrome and Desktop chat/snapshot counts are compared before and after.

The runner is fail-fast for required lifecycle steps and uses bounded retries for propagation-sensitive visibility/list checks.

## Implementation Notes

The smoke bridge now exposes a Desktop-only `restoreFolder` operation. It delegates to the existing `H2O.Studio.store.folders.restoreTombstonedFolder` / `restoreFolder` path and remains unavailable on Chrome.

The Chrome helper allowlist now permits `requestFolderDelete` only behind `--allow-mutation`. It does not permit Desktop apply/restore operations.

The Desktop queue client now permits the read-only review/tombstone/list/count operations and the explicit mutation-gated Desktop authority operations `applyFolderDeleteRequest` and `restoreFolder`. It does not permit Chrome-originated `requestFolderDelete`.

Chrome restore receipt re-show preserves the removed visible-mirror row metadata when the delete receipt hides the folder and rebuilds restored rows with the same display hints used by Chrome-created mirror rows. The smoke registry visibility verifier also has a read-only fallback to inspect the Chrome folder-state mirror when `FolderParity` has not refreshed yet.

Follow-up export fix: a live Phase 4D.4 run created a Chrome pending folder delete request, but the next Chrome export wrote `chrome-latest.json` without that request. The request existed in Chrome runtime, but Desktop could not review/apply a request that was absent from the transport file. The MV3 review store now writes a pending, status-only export mirror at request creation time and prunes it when a Desktop delete receipt resolves the request. The Chrome export collector merges the IndexedDB review rows with this mirror, dedupes by request/folder identity, and skips mirror entries when the review store says the request is no longer pending. The runner now treats a zero `folderDeleteRequestExport.requestCount` during the delete-request export step as a hard blocker.

Follow-up Desktop hidden verification fix: after the export fix, the runner reached Desktop soft-delete apply and tombstone creation, but `desktop-verify-hidden` failed with `empty-json-stdout` / timeout. A direct Desktop queue command proved `verifyFolderHidden` itself was correct and returned `ok:true`, `status:"folder-hidden-or-missing"`, `visible:false`, and `row:null`. The runner was the problem: retried steps capped each helper attempt at 10 seconds, even when the runner was invoked with a longer timeout, and the Desktop queue client therefore killed the verification before it could return. The runner now gives Desktop hidden verification a minimum 60 second timeout, passes that timeout through to the Desktop queue client, and treats both `folder-hidden` and `folder-hidden-or-missing` as valid hidden states. It does not require a row after Desktop soft delete; `row:null` is valid for hidden/missing.

Follow-up count diagnostics fix: a later full lifecycle run completed the main delete/restore path but ended with `chat-count-changed` and `noChatDelete:false` without enough count evidence to tell whether a chat was actually deleted. The runner now always exposes same-surface count fields and deltas:

- `baselineChromeChatCount`
- `baselineDesktopChatCount`
- `finalChromeChatCount`
- `finalDesktopChatCount`
- `baselineChromeSnapshotCount`
- `baselineDesktopSnapshotCount`
- `finalChromeSnapshotCount`
- `finalDesktopSnapshotCount`
- `chromeChatCountDelta`
- `desktopChatCountDelta`
- `chromeSnapshotCountDelta`
- `desktopSnapshotCountDelta`

The no-chat/no-snapshot guards now compare Chrome baseline only to Chrome final, and Desktop baseline only to Desktop final. Count increases do not fail the safety guard; they are reported as warnings at most. Only a same-surface count decrease blocks as possible deletion. The runner also exposes `steps` as an alias of `stepResults` so count read steps can be extracted by key: `chrome-baseline-counts`, `desktop-baseline-counts`, `chrome-final-counts`, and `desktop-final-counts`.

Follow-up request handoff fix: the runner previously trusted generic Chrome export and Desktop import success, then failed later with `matching-delete-request-missing` when Desktop did not list the exact pending request. The runner now keeps the exact `requestId`, `reviewId`, and `folderId` from `requestFolderDelete`; after Chrome export it reads `/Users/hobayda/H2O Studio Sync/chrome-latest.json` and verifies the exact request is present before Desktop import continues. After Desktop import, it verifies the exact request by request id first, then folder id, and only allows `status:"pending"` before the apply step. The runner now reports precise handoff diagnostics:

- `chromeLatestHasRequest`
- `chromeLatestRequestPath`
- `chromeLatestRequestCount`
- `chromeLatestRequestDiagnostics`
- `desktopDeleteRequestImported`
- `desktopDeleteRequestStatus`
- `desktopDeleteRequestDecision`
- `desktopDeleteRequestDiagnostics`

Precise handoff blockers are now:

- `chrome-delete-request-not-exported`
- `desktop-delete-request-not-imported`
- `desktop-delete-request-wrong-status`

## Safety

The runner and bridge enforce:

- `--allow-mutation` is required.
- Chrome may call `requestFolderDelete` but cannot apply delete or restore.
- Desktop may call `applyFolderDeleteRequest` and `restoreFolder`.
- Desktop restore delegates only to the existing `store.folders.restoreTombstonedFolder` / `restoreFolder` API.
- No hard delete; the proof should show `noHardDelete:true`.
- No purge; the proof should show `noPurge:true`.
- No raw SQL.
- No chat deletion.
- No snapshot deletion.
- No Chrome tombstone apply/create.
- No broad filesystem access beyond the existing smoke queue paths.

## Expected Result Shape

The final JSON summary includes:

- `ok`
- `status`
- `folderId`
- `createdOrSelectedFolderName`
- `deleteRequestCreated`
- `desktopDeleteApplied`
- `chromeHidden`
- `desktopRestoreApplied`
- `restoreReceiptExported`
- `chromeReShown`
- `finalChromeVisible`
- `finalDesktopVisible`
- `folderIdMatch`
- `noHardDelete`
- `noPurge`
- `noChatDelete`
- `noSnapshotDelete`
- `noTombstoneApplyOnChrome`
- same-surface chat/snapshot baseline/final counts and deltas
- exact delete-request export/import handoff diagnostics
- `blockers`
- `warnings`

## Validation

Passed:

- `node --check tools/smoke/local-folder-delete-restore-smoke-runner.mjs`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `node --check src-surfaces-base/studio/sync/auto-import.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check tools/smoke/chrome-cdp-studio.mjs`
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs`
- `node --check tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `node --check tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs`
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `node tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs`
- `node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs`
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs`
- `npm run dev:all`
- `node apps/studio/desktop/build-tools/prepare-dist.mjs`

## Runtime Proof

Live command used:

```bash
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 30000
```

Runtime attempt 1 reached the full lifecycle path but failed final Chrome visible-model verification:

- Chrome create succeeded.
- Chrome delete request was created.
- Desktop soft-delete apply succeeded.
- Chrome visible hide succeeded.
- Desktop restore succeeded.
- Desktop restore receipt export succeeded.
- Chrome restore receipt import reported `reShownCount:1`.
- Final Chrome `verifyFolderVisible` returned `folder-hidden-or-missing`.

Root cause found from the attempt: the restore receipt re-show path wrote a mirror row but did not preserve the same display hints used by Chrome-created rows, and the smoke visibility verifier only read `FolderParity`. The implementation now preserves removed row metadata during hide, rebuilds restored rows with `sourceKind`, `stateSource`, `materializedUserFolder`, `trustedFolderDisplay`, and `shownInNormalMode`, and lets the smoke verifier fall back to the Chrome folder-state mirror.

Runtime attempt 2 after the re-show-row fix still used the already-loaded Chrome page and reproduced the same final visible-model failure, which is consistent with the active Chrome target not yet having reloaded the generated `folder-import.mv3.js`.

Runtime attempt 3 after rebuilding and adding the smoke verifier mirror fallback did not reach delete/restore. It was blocked by the Desktop queue environment:

- Chrome create succeeded.
- Chrome baseline count succeeded.
- Chrome export succeeded.
- Desktop `diagnoseHealth` and runner Desktop steps timed out through the queue client.
- Queue client returned `desktop-queue-timeout`.
- Next action from the helper: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set `localStorage` key `h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`, and confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`.

Runtime attempt 4 after Desktop queue was re-enabled reached Chrome request/export and Desktop import, but failed when Desktop listed pending requests:

- Chrome `requestFolderDelete` returned `ok:true` and `status:"pending-created"`.
- Chrome `syncNow({ direction:"chrome-to-desktop" })` returned `ok:true` and `status:"chrome-to-desktop-exported"`.
- Desktop import returned `ok:true` and `status:"imported"`.
- Desktop `listFolderDeleteRequests` did not include the new folder request.
- Direct inspection of `/Users/hobayda/H2O Studio Sync/chrome-latest.json` showed `matchCount:0` for the runner-created `folderId`.

Root cause: Chrome request creation and Chrome export were not guaranteed to serialize the same pending request source into `chrome-latest.json`. The export path depended on live review-store enumeration only, and the smoke runner did not assert `folderDeleteRequestExport.requestCount` before Desktop import. The fix adds the pending export mirror and export-count gate described above.

Runtime attempt 5 after rebuilding and relaunching the Chrome smoke profile verified the export fix:

- Chrome smoke helper relaunched on port `9247` with current smoke registry source hash.
- Chrome `diagnoseHealth` returned `ok:true`, `status:"healthy"`, `connected:true`, `permission:"granted"`, and `chromeWritesSyncFolder:true`.
- Chrome created a safe smoke folder:
  - `folderId:"fold_smoke_zz-4d4-delete-restore-mqrzfy35_mqrzfy7l_86963c8c53fd"`
  - `name:"zz-4d4-delete-restore-mqrzfy35"`
  - `color:"#38BDF8"`
- Chrome export before the delete request reported:
  - `status:"chrome-to-desktop-exported"`
  - `folderDeleteRequestExport.requestCount:3`
  - `folderDeleteRequestExport.reviewRequestCount:3`
  - `folderDeleteRequestExport.mirrorRequestCount:0`
  - `folderDeleteRequestExport.staleMirrorSkippedCount:0`
  - `folderDeleteRequestExport.desktopApplyRequired:true`
  - `preExportFolderModel.status:"folder-model-read"`
  - `preExportFolderModel.rowCount:33`
- This proves the Chrome export path now surfaces pending folder delete request export diagnostics and no longer writes a silent zero-request export.

The full lifecycle runner did not proceed beyond the first Desktop import/verify step in attempt 5 because the Desktop smoke queue stopped consuming commands:

- Desktop `syncNow({ direction:"chrome-to-desktop" })` returned through the queue client as `status:"desktop-queue-timeout"`.
- A direct Desktop queue `diagnoseHealth` command also returned `status:"desktop-queue-timeout"`.
- The running Desktop app had the smoke URL flag, but the queue was not processing `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`.
- This is a live Desktop smoke-gate/queue enablement blocker, not a Chrome delete-request export blocker.

Runtime attempt 6 after the Desktop hidden-verification hardening was invoked with:

```bash
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 60000
```

The run confirmed the earlier Chrome side remained healthy but again did not reach `desktop-verify-hidden` because the Desktop queue was not consuming commands:

- Chrome created `folderId:"fold_smoke_zz-4d4-delete-restore-mqs0gfkf_mqs0gfra_851cb38a2b02"`.
- Chrome export returned `status:"chrome-to-desktop-exported"`.
- Chrome export diagnostics included `folderDeleteRequestExport.requestCount:3`, `reviewRequestCount:3`, `mirrorRequestCount:0`, and `desktopApplyRequired:true`.
- Desktop `syncNow({ direction:"chrome-to-desktop" })` returned through the queue client as `status:"desktop-queue-timeout"` with a 60000ms timeout.
- The first failed step was `desktop-verify-created-visible`, also due to Desktop queue timeout / empty stdout.

This attempt did not disprove the hidden-verification fix. It shows the live Desktop queue was unavailable before the runner could reach the hidden-verification step. A separate direct Desktop proof supplied for the failing folder showed `verifyFolderHidden` returns `ok:true`, `status:"folder-hidden-or-missing"`, `visible:false`, `row:null`, and the no-delete/no-purge/no-chat/no-snapshot flags.

Runtime attempt 7 after the count diagnostics fix was invoked with:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 120000 > /tmp/h2o-4d4-runner-final.json
```

The Desktop queue preflight returned through the queue with `ok:true`, `registryGatesEnabled:true`, and no blockers. The full runner then emitted the new count diagnostics but did not reach final counts because it failed earlier at `desktop-list-delete-request` with `matching-delete-request-missing`:

- `folderId:"fold_smoke_zz-4d4-delete-restore-mqs1305z_mqs130eg_afebeefe6336"`
- `deleteRequestCreated:true`
- `firstFailedStep:"desktop-list-delete-request"`
- `blockers:["matching-delete-request-missing"]`
- `baselineChromeChatCount:30`
- `baselineDesktopChatCount:32`
- `finalChromeChatCount:null`
- `finalDesktopChatCount:null`
- `baselineChromeSnapshotCount:0`
- `baselineDesktopSnapshotCount:20`
- `finalChromeSnapshotCount:null`
- `finalDesktopSnapshotCount:null`
- `chromeChatCountDelta:null`
- `desktopChatCountDelta:null`
- `chromeSnapshotCountDelta:null`
- `desktopSnapshotCountDelta:null`
- `noChatDelete:true`
- `noSnapshotDelete:true`

This proves the requested count fields are now present and the no-chat/no-snapshot guards no longer compare Chrome counts against Desktop counts. Because the runner failed before final count reads, the deltas are intentionally `null` and the count guard did not create a false `chat-count-changed` blocker.

Runtime attempt 8 after the exact request handoff fix passed end to end:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 120000 > /tmp/h2o-4d4-runner-final.json
```

Preflight:

- Desktop queue `diagnoseHealth` returned `ok:true`, `status:"healthy"`, `registryGatesEnabled:true`, and no blockers.

Final runner result:

- `ok:true`
- `status:"delete-restore-smoke-passed"`
- `folderId:"fold_smoke_zz-4d4-delete-restore-mqs1gw5f_mqs1gwcx_49255746c5af"`
- `requestId:"folder-delete-request:35954499-0647-4803-8a11-d794bf733c3e"`
- `reviewId:"folder-delete-request:35954499-0647-4803-8a11-d794bf733c3e"`
- `deleteRequestCreated:true`
- `chromeLatestHasRequest:true`
- `chromeLatestRequestPath:"folderDeleteRequests[0]"`
- `chromeLatestRequestCount:5`
- `desktopDeleteRequestImported:true`
- `desktopDeleteRequestStatus:"pending"`
- `desktopDeleteApplied:true`
- `chromeHidden:true`
- `desktopRestoreApplied:true`
- `restoreReceiptExported:true`
- `chromeReShown:true`
- `finalChromeVisible:true`
- `finalDesktopVisible:true`
- `folderIdMatch:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noTombstoneApplyOnChrome:true`
- `blockers:[]`

Exact handoff diagnostics:

- Chrome request step returned `status:"pending-created"` for the exact request id above.
- Chrome export step read `/Users/hobayda/H2O Studio Sync/chrome-latest.json` and found the exact request at `folderDeleteRequests[0]`.
- Chrome export diagnostics reported `folderDeleteRequestExport.requestCount:5`, `reviewRequestCount:5`, `mirrorRequestCount:2`, `staleMirrorSkippedCount:0`, `storeAvailable:true`, `mirrorAvailable:true`, and `mirrorOk:true`.
- Desktop list step found the exact request by request id/folder id with `desktopDeleteRequestStatus:"pending"` and `listedRequestCount:1`.

Count proof:

- `baselineChromeChatCount:32`
- `baselineDesktopChatCount:32`
- `finalChromeChatCount:32`
- `finalDesktopChatCount:32`
- `chromeChatCountDelta:0`
- `desktopChatCountDelta:0`
- `baselineChromeSnapshotCount:0`
- `baselineDesktopSnapshotCount:20`
- `finalChromeSnapshotCount:0`
- `finalDesktopSnapshotCount:20`
- `chromeSnapshotCountDelta:0`
- `desktopSnapshotCountDelta:0`

Non-blocking warnings remained for deferred labels/tombstones/apply-events/tags/chat-folder-bindings/source-metadata and approved simultaneous conflict notes. They were non-blocking because `blockers:[]` and the final folder/state/safety checks passed.

Current runtime status:

- Implementation, static validation, and live runtime proof are complete.
- Chrome pending delete-request export is runtime-verified through `folderDeleteRequestExport.requestCount:3` and export diagnostics in the smoke result.
- Desktop hidden-verification handling is statically fixed to use the mutation-gated Desktop op, pass a minimum 60000ms queue timeout, and accept `folder-hidden-or-missing` / `visible:false` with `row:null`.
- Count diagnostics are now surfaced at top level and through `steps` / `stepResults`; same-surface decreases are the only chat/snapshot count blockers.
- Full end-to-end lifecycle proof passed with exact delete-request handoff diagnostics.

## Verdict

Phase 4D.4 implementation adds the local lifecycle smoke harness and keeps delete/restore authority on Desktop. Static validation is green. Runtime proof is green: Chrome request -> Chrome export -> Desktop import/list/apply -> Desktop delete receipt export -> Chrome hide -> Desktop restore -> Desktop restore receipt export -> Chrome re-show passed with exact handoff diagnostics and no destructive safety violations.
