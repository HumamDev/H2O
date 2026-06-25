# Phase 6B.3a - Chrome Recently Deleted Companion State Alignment

## Verdict

Phase 6B.3a fixes the Chrome Recently Deleted companion state source so rows deleted in the same Chrome Studio profile are discoverable immediately by the companion view.

Chrome remains request-only for folder delete. Desktop remains authoritative for canonical tombstones, restore, and permanent delete.

## Root Cause

The Phase 6B.3 companion read the Chrome folder-state mirror from a single preferred storage source. In Chrome runtime, that can diverge:

- `chrome.storage.local` is the normal extension storage namespace.
- page `localStorage` can be used as the same-profile fallback when the injected page context cannot write through `chrome.storage.local`.

If `chrome.storage.local` existed but the pending-delete marker was written to page `localStorage`, the companion could miss the just-deleted folder even though the request was created.

The CDP smoke profile mismatch is separate: normal Chrome Dev and `chrome-cdp-studio` can use different user-data-dir/profile storage. A Recently Deleted row created in one profile is not expected to appear in the other unless they are launched against the same Chrome profile/user-data-dir.

Operator note: separate profiles have separate companion state.

## Fix

Chrome folder-state reads now merge same-profile state from:

- `chrome.storage.local`
- page `localStorage`

When both are present, diagnostics report the merged source as `chrome.storage.local+localStorage`.

The merge preserves overlay bags:

- `hiddenByChromePendingDelete`
- `hiddenByDesktopReceipt`
- `hiddenByDesktopVisibleSet`

The Delete action now writes the visible-state-only pending-delete marker to both storage namespaces when available.

The companion also reads the pending delete request store as a fallback. If a pending request exists but the overlay marker is stale/missing, the folder can still appear in the Chrome Recently Deleted companion as `Delete pending`.

## Diagnostic Additions

`diagnoseChromeRecentlyDeletedCompanion` now reports:

- `chromeProfileSource`
- `extensionId`
- `locationOrigin`
- `locationHref`
- `storageNamespaceSource`
- `chromeStorageAvailable`
- `chromeStorageSource`
- `localStorageSource`
- `chromeNormalVisibleFolderCount`
- `hiddenByChromePendingDeleteCount`
- `pendingDeleteRequestCount`
- `chromeRecentlyDeletedCount`
- `desktopReceiptHiddenCount`
- companion rows with `folderId`, `folderName`, `status`, and `source`
- probe result for `chrome delete companion test` or caller-provided `probeName`
- `storageDiagnostics`

Probe locations include:

- normal rows
- hidden pending rows
- request store
- companion rows

## Native Owner Timeout Note

`chrome-cdp-studio` create-folder can fail with `native-owner-timeout` when the smoke profile lacks the native owner/bridge readiness needed for creation. That is a smoke runtime/profile readiness condition and does not block 6B.3a if the normal Chrome Dev profile can create/delete manually.

For runtime proof, the diagnostic must be run in the same Chrome profile where the folder was created/deleted. Separate profiles are expected to have different folder and Recently Deleted storage.

## Manual Runtime Proof Plan

In the same normal Chrome Dev Chrome Studio profile:

1. Create folder `chrome delete companion state test`.
2. Click folder menu -> Delete.
3. Confirm:
   - no browser confirmation popup
   - folder disappears from normal Chrome folder list
   - Chrome Recently Deleted companion shows the folder as pending/deleted
   - Permanent Delete is blocked with `Permanent delete is only available from Desktop Studio.`
   - Restore remains Desktop-deferred unless a future safe request-restore phase is added
4. Run:

```js
await H2O.Studio.diagnoseChromeRecentlyDeletedCompanion({ probeName: 'chrome delete companion state test' })
```

Expected:

- normal rows do not include the folder
- hidden pending rows or request store includes the folder
- companion rows include the folder
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `noChromeTombstoneApply:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`

## Runtime Attempt

Read-only CDP diagnostic attempted on June 25, 2026:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChromeRecentlyDeletedCompanion --payload-json '{"probeName":"chrome delete companion state test"}' --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"chrome-cdp-unavailable"`
- `payloadAccepted:true`
- `blockers:["chrome-cdp-unavailable"]`
- `allowedReadOnlyOps` included `diagnoseChromeRecentlyDeletedCompanion`

Conclusion: this run could not prove the live UI because the local Chrome CDP endpoint was unavailable. This matches the current operator caveat that CDP smoke and normal Chrome Dev can use different runtime/profile state unless launched against the same user-data-dir.

## Safety

Preserved:

- no Chrome permanent delete
- no Chrome purge authority
- no Chrome restore authority
- no tombstone apply/create on Chrome
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains authoritative
