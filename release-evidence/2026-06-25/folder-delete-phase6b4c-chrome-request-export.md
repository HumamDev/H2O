# Phase 6B.4c - Chrome Folder Delete Request Export

## Verdict

Phase 6B.4c fixes the Chrome Delete request/export path so a Chrome folder Delete cannot remain only as local pending-hide state.

Chrome remains request-only. Desktop remains authoritative for canonical soft delete, tombstones, Recently Deleted, restore, and permanent delete.

## Root Cause

Runtime proof showed Chrome export succeeded but exported zero Phase 4C folder delete requests:

- `status:"chrome-to-desktop-exported"`
- `folderDeleteRequestExport.requestCount:0`
- `reviewRequestCount:0`
- `mirrorRequestCount:0`

Desktop import/apply then had no work:

- `folderDeleteRequestImport.status:"no-folder-delete-requests"`
- `found:0`
- `folderDeleteRequestAutoApply.status:"no-folder-delete-requests"`
- `appliedCount:0`

The Chrome UX hid the row locally and showed it in Chrome Recently Deleted, but the export path could still see no exportable `folderDeleteRequests[]` row. Local pending-hide state is useful for immediate UX, but it cannot replace the Phase 4C request row that Desktop imports and applies.

## Fix

Chrome export now performs a bounded repair preflight before writing `chrome-latest.json`:

1. Read Chrome-local pending-delete hidden rows from the folder-state mirror.
2. Read pending Phase 4C request rows from the tombstone review store.
3. For each pending-hide row without an exportable pending request, call the existing request writer:
   - `H2O.Studio.store.tombstoneReviews.requestFolderDelete(...)`
4. Continue through the normal export collector, which serializes the repaired request into `bundle.folderDeleteRequests`.

This keeps the source of truth for Desktop handoff as the existing Phase 4C request schema and writer. It does not treat the local hidden overlay as canonical delete state.

## Diagnostics

Chrome export now surfaces:

- `folderDeleteRequestExport.pendingDeleteHiddenCount`
- `folderDeleteRequestExport.hiddenWithoutExportableRequestCount`
- `folderDeleteRequestExport.repairedHiddenRequestCount`
- `folderDeleteRequestExport.pendingHiddenRepair`

Chrome Recently Deleted companion diagnostics now surface:

- `pendingDeleteHiddenCount`
- `pendingDeleteRequestCount`
- `exportableFolderDeleteRequestCount`
- `requestStoreRows`
- `hiddenWithoutExportableRequestCount`
- `hiddenWithoutExportableRequestRows`
- blocker/warning `pending-hide-without-exportable-delete-request` when a hidden pending row lacks an exportable request

## Expected Runtime Proof

After clicking Delete in Chrome and running Chrome export:

- `ok:true`
- `status:"chrome-to-desktop-exported"`
- `folderDeleteRequestExport.requestCount >= 1`
- `folderDeleteRequestExport.reviewRequestCount >= 1` or `folderDeleteRequestExport.mirrorRequestCount >= 1`
- `folderDeleteRequestExport.repairedHiddenRequestCount >= 0`

Then Desktop import/apply should receive the request:

- `folderDeleteRequestImport.found >= 1`
- `folderDeleteRequestAutoApply.appliedCount >= 1` or `alreadyAppliedCount >= 1`

Desktop receipt export and Chrome receipt import should then confirm the hidden state.

## Runtime Proof Status

Runtime proof was attempted against Chrome CDP port `9247`:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"chrome-load-extension-ignored"`
- blockers:
  - `chrome-load-extension-ignored`
  - `studio-launcher-extension-not-loaded`
- discovered/loaded extension IDs: `[]`

The Phase 6B.4c export proof could not run because the active Chrome process on port `9247` did not expose the Studio Launcher extension target. This is a runtime launch/profile blocker, not a product-code blocker.

To complete runtime proof, relaunch Chrome Dev with the unpacked Studio Launcher extension loaded, grant the sync folder handle for `/Users/hobayda/H2O Studio Sync`, then rerun Chrome Delete, Chrome export, Desktop import/apply, Desktop receipt export, and Chrome receipt import.

## Safety

Preserved:

- Chrome remains request-only
- Desktop remains authoritative
- no Chrome permanent delete
- no Chrome restore authority
- no Chrome purge authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay

## Validation

Target validator:

```bash
node tools/validation/sync/validate-folder-delete-phase6b4c-chrome-request-export.mjs
```

Existing related validators remain part of the Phase 6B.4c validation set.
