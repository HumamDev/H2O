# Phase 6C.3 - Desktop restore request import/apply

## Verdict

Phase 6C.3 adds the missing Desktop-side apply path for Chrome folder restore requests.

Chrome remains request-only. Desktop remains canonical restore authority.

## Root Cause

Phase 6C.2 made Chrome create and export `folderRestoreRequests[]`, but Desktop `chrome-to-desktop` import normalized and applied only `folderDeleteRequests[]`. Restore requests therefore had no Desktop ingestion/apply path.

## Implemented Scope

- Desktop `chrome-to-desktop` normalization now preserves top-level `folderRestoreRequests[]`.
- Desktop review store now supports folder restore request rows:
  - `listFolderRestoreRequests`
  - `ingestFolderRestoreRequests`
  - `applyFolderRestoreRequest`
- Desktop sync import now runs:
  - `folderRestoreRequestImport.found`
  - `folderRestoreRequestImport.inserted`
  - `folderRestoreRequestImport.updated`
  - `folderRestoreRequestImport.skipped`
  - `folderRestoreRequestImport.invalid`
  - `folderRestoreRequestImport.failed`
  - `folderRestoreRequestAutoApply.requestCount`
  - `folderRestoreRequestAutoApply.attemptedCount`
  - `folderRestoreRequestAutoApply.appliedCount`
  - `folderRestoreRequestAutoApply.alreadyAppliedCount`
  - `folderRestoreRequestAutoApply.purgedBlockedCount`
  - `folderRestoreRequestAutoApply.noActiveTombstoneBlockedCount`
  - `folderRestoreRequestAutoApply.failedCount`
- Desktop auto-apply calls `H2O.Studio.store.folders.restoreTombstonedFolder`.
- Duplicate/replayed restore requests are idempotent:
  - already resolved request rows report already applied
  - already-restored folder rows resolve as already restored when the folder exists
- Purged/permanently suppressed restore requests are blocked.
- Missing active tombstone requests are blocked as `folder-restore-request-no-active-tombstone`.
- Smoke bridge exposes `applyFolderRestoreRequest` for Desktop-only runtime proof.

## Safety Invariants

- no Chrome restore authority
- no Chrome tombstone apply/create
- no Chrome permanent delete
- no Chrome purge authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay changes
- no labels/tags/categories changes
- no full chat-folder binding sync changes

## Runtime Proof Status

Runtime Chrome -> Desktop restore proof is operator pending for this evidence pass.

Expected runtime chain:

1. Chrome exports `folderRestoreRequests[]` with `requestCount >= 1`.
2. Desktop import reports `folderRestoreRequestImport.found >= 1`.
3. Desktop auto-apply reports `folderRestoreRequestAutoApply.appliedCount >= 1` or `alreadyAppliedCount >= 1`.
4. Desktop Recently Deleted count decreases by one.
5. Desktop normal folder list includes the restored folder.
6. No hard delete / chat / snapshot / asset deletion occurs.

## Validation Plan

- `node --check` on changed JS/MJS files.
- `node tools/validation/sync/validate-folder-restore-phase6c3-desktop-restore-apply.mjs`
- Existing restore/delete validators:
  - `node tools/validation/sync/validate-folder-restore-phase6c2-chrome-request-export.mjs`
  - `node tools/validation/sync/validate-folder-restore-phase6c1-chrome-restore-ux.mjs`
  - `node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
  - `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`

## Deferred

- Desktop restore receipt/export parity to Chrome is handled by later Phase 6C slices unless covered by existing restore receipt export.
- Chrome final restored-list parity after receipt import remains Phase 6C.4/6C.5 scope.
