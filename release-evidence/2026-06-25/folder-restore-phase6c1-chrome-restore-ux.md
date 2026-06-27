# Phase 6C.1 — Chrome Restore request-only UX

## Scope

Phase 6C.1 adds Chrome-side Restore request UX only. Chrome remains request-only and does not restore canonical folder tombstones locally.

Desktop remains the restore authority. Desktop import/apply, restore request export, restore receipt correlation, and end-to-end restore parity are deferred to later 6C slices.

## UX Gap

Phase 6B closed Chrome soft delete and Recently Deleted parity, but Chrome Recently Deleted still showed Restore as a Desktop-only blocked action. Phase 6C needs restore parity, but a safe Chrome restore request writer/export contract does not exist yet.

## Implementation

- Chrome Recently Deleted companion now labels the restore affordance as `Request Restore`.
- The action remains disabled/read-only in 6C.1.
- The row shows the explicit deferred message:
  - `Restore request export will be added in 6C.2.`
- Diagnostics expose the deferred request bridge:
  - `chromeRestoreRequestUxAvailable`
  - `chromeRestoreRequestExportDeferred`
  - `chromeRestoreRequestBlocker`
  - `chromeRestoreRequestPendingCount`
  - `pendingRestoreCount`
  - `chromeRestoreDirectApplyBlocked:true`
  - `noChromeRestoreAuthority:true`
- The documented blocker for this phase is:
  - `chrome-restore-request-export-deferred-phase6c2`

## Current Restore Request Store Finding

The current Chrome review store has the Phase 6B delete request path:

- `requestFolderDelete`
- `listFolderDeleteRequests`
- `diagnoseFolderDeleteRequests`

No safe Chrome `requestFolderRestore` / `listFolderRestoreRequests` export contract is present yet. Phase 6C.1 therefore does not create restore requests and does not pretend the row was restored.

## Safety Invariants

- no Chrome restore authority
- no Chrome tombstone apply/create
- no Chrome permanent delete
- no Chrome purge authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains canonical restore authority
- Chrome Recently Deleted remains a companion/status surface

## Runtime Proof Expectation

In Chrome Studio Recently Deleted:

- Restore appears as `Request Restore`.
- The button is disabled/read-only until the 6C.2 request export contract exists.
- The visible note says `Restore request export will be added in 6C.2.`
- The row remains in Recently Deleted.
- The folder is not reinserted into the normal folder list.
- Permanent Delete remains Desktop-only/read-only.

Diagnostics should show either no rows, or the documented 6C.2 blocker only:

- `chromeRestoreDirectApplyBlocked:true`
- `noChromeRestoreAuthority:true`
- `noChromeTombstoneApply:true`
- `noHardDelete:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noAssetDelete:true`

## Validation

- `node --check src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `node --check tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
- `git diff --check`
- `git diff --cached --check`
