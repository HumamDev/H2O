# Phase 6B.3 - Chrome Recently Deleted Companion UX

## Verdict

Phase 6B.3 adds the Chrome companion behavior for normal folder Delete while keeping Desktop canonical authority.

Chrome Delete remains a request-only soft-delete intent:

1. Chrome creates the existing Phase 4C folder delete request.
2. Chrome immediately hides the folder from the normal Chrome folder display with a local visible-state-only marker.
3. Chrome shows the folder in a limited Recently Deleted companion section.
4. Desktop remains responsible for canonical tombstones, restore, and permanent delete.

## UX Change

Before 6B.3, Chrome kept the deleted folder visible in the normal list with a Delete pending badge/status.

After 6B.3:

- Chrome folder menu action remains `Delete`.
- No browser/native confirmation is shown.
- No long explanatory text is shown in the folder action popover.
- No `Already pending` status is shown under the Delete action.
- A successful request writes `hiddenByChromePendingDelete` into the Chrome folder-state mirror.
- The normal Chrome folder display filters rows hidden by `hiddenByChromePendingDelete`.
- The deleted folder appears in the Chrome Recently Deleted companion view as `Delete pending` or `Deleted on Desktop`.

## Chrome Recently Deleted Companion

The Chrome Recently Deleted section is a status companion only. It lists:

- Chrome-local pending deleted folders.
- Desktop-confirmed deleted folders known from imported delete receipts.

It does not expose Desktop diagnostics, purge controls, or authority controls.

Chrome Permanent Delete is blocked with:

`Permanent delete is only available from Desktop Studio.`

Chrome Restore is deferred with:

`Restore from Desktop Studio.`

## Diagnostics

Added read-only diagnostics surface:

- `chromeNormalVisibleFolderCount`
- `chromeRecentlyDeletedCount`
- `pendingDeleteHiddenCount`
- `desktopReceiptHiddenCount`
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`

The diagnostic is exposed through:

- `H2O.Studio.diagnoseChromeRecentlyDeletedCompanion`
- smoke bridge op `diagnoseChromeRecentlyDeletedCompanion`

## Safety

Preserved safety invariants:

- no Chrome purge authority
- no Chrome permanent delete authority
- no Chrome canonical restore authority
- no tombstone apply/create on Chrome
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains authoritative for delete/restore/permanent delete

## Runtime Proof Plan

Manual proof:

1. Open Chrome Studio.
2. Create folder `chrome delete ux final`.
3. Click folder menu -> Delete.
4. Confirm the folder disappears from the normal Chrome folder list.
5. Confirm no browser confirmation popup appears.
6. Confirm no long explanatory text or `Already pending` text appears in the popover.
7. Open the Chrome Recently Deleted companion section.
8. Confirm the folder appears as pending/deleted.
9. Click Permanent Delete, if present, and confirm the Desktop-only message.
10. Click Restore, if present, and confirm the Desktop-only restore message.

Smoke diagnostic command:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChromeRecentlyDeletedCompanion --timeout-ms 60000
```

Expected diagnostic:

- `ok:true`
- `chromeRecentlyDeletedCount` present
- `pendingDeleteHiddenCount` present
- `desktopReceiptHiddenCount` present
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`
- `blockers:[]`

## Runtime Attempt

Read-only diagnostic command attempted on June 25, 2026:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChromeRecentlyDeletedCompanion --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"chrome-cdp-unavailable"`
- `blockers:["chrome-cdp-unavailable"]`
- `allowedReadOnlyOps` included `diagnoseChromeRecentlyDeletedCompanion`

Conclusion: runtime proof was blocked by the local Chrome CDP runtime not being available on port 9247. The smoke helper accepted the new read-only op in its allowlist; no product/runtime blocker was proven by this attempt.

## Deferred

- Chrome restore request UX remains deferred.
- Chrome full Recently Deleted management remains deferred.
- Desktop permanent delete remains Desktop-only.
- WebDAV/cloud/relay remains deferred.
