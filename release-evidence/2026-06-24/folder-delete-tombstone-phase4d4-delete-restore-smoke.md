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
- `blockers`
- `warnings`

## Validation

Passed:

- `node --check tools/smoke/local-folder-delete-restore-smoke-runner.mjs`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
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

Current runtime status:

- Implementation and static validation are complete.
- Live proof is blocked by Desktop smoke queue enablement, not by the runner code.
- Re-run after Desktop queue is enabled:

```bash
node tools/smoke/local-folder-delete-restore-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 30000
```

Expected green result:

- `ok:true`
- `blockers:[]`
- `chromeHidden:true`
- `chromeReShown:true`
- `finalChromeVisible:true`
- `finalDesktopVisible:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noTombstoneApplyOnChrome:true`

## Verdict

Phase 4D.4 implementation adds the local lifecycle smoke harness and keeps delete/restore authority on Desktop. Static validation is green. Runtime proof is pending a re-enabled Desktop smoke queue; the latest live run was blocked before Desktop import with `desktop-queue-timeout`.
