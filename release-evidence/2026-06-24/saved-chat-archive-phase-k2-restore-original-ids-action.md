# Saved Chat Archive - Phase K.2 Restore Original IDs Action

Status: **PHASE K.2 — RESTORE ORIGINAL IDS ACTION - IMPLEMENTED**

Lane: H2O Studio Chat Saving Architecture - Phase K restore/relink.

## Implementation Summary

K.2 implements the first restore mode only:

- `restore-original-ids`

The action restores a verified `.h2ochat` package under its original `chatId` and original `snapshotId` only when both ids are absent from the Desktop store and the original chat is not tombstoned.

Implemented module:

- `src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js`

Registered API:

- `H2O.Studio.archiveRestore`

APIs:

- `isDesktopCapable()`
- `dryRunRestorePackage({ packagePath })`
- `restoreVerifiedPackage({ packagePath, mode = "restore-original-ids", confirm = false })`

Loader/pack wiring:

- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`

## Safety Guarantees

K.2 is:

- Desktop-only
- verification-gated by `archiveInspector.inspectPackage`
- absent-only
- non-destructive
- explicit-confirm gated
- no-overwrite
- no relink
- no tombstone override/un-delete

The restore module reuses:

- `H2O.Studio.archiveInspector.inspectPackage`
- `H2O.Studio.archiveImporter.buildTurnsFromPackageSnapshot`

Writes are limited to insert-only rows in:

- `chats`
- `snapshots`
- `snapshot_turns`
- provenance metadata on inserted rows

The restore module does not write:

- `libraryIndex`
- request queue/status rows
- tombstones
- folder/category/label bindings
- scanner/materializer state
- Chrome runtime/service-worker state

## Dry-Run Statuses

`dryRunRestorePackage` returns:

- `restore-ready`
- `already-present`
- `conflict-snapshot-id`
- `conflict-chat-id`
- `tombstoned`
- `corrupted`
- `unsupported-version`
- `rejected`
- `read-error`

Dry-run is non-mutating. It verifies the package and reads store/tombstone state only.

## Restore Statuses

`restoreVerifiedPackage` returns:

- `restored`
- `already-present`
- `conflict`
- `tombstoned`
- `rejected`
- `read-error`
- `write-error`

Restore requires:

- `mode === "restore-original-ids"`
- `confirm === true`
- current dry-run decision `restore-ready`
- package still verifies immediately before write
- original snapshot still absent immediately before insert

## UI Decision

K.2 is API-only.

The Desktop Restore card is deferred because the active UI files currently contain unrelated dirty work. Adding a card in this slice would risk mixing unrelated UI hunks into the restore commit. The K.2 API is loaded and packaged; a later UI slice can mount a Restore card as a sibling to Archive Inspector / Import Recovery with explicit wording:

- restore original identity
- not import-as-new
- no overwrite

## Deferred Work

Still deferred:

- relink existing LibraryItem/chat
- restore into existing chat as a new snapshot
- tombstone override/un-delete
- zip round-trip
- OS share sheet
- cloud/WebDAV/sync propagation
- Chrome package-body authority
- runtime smoke, deferred to K.3

## Files Changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `release-evidence/2026-06-24/saved-chat-archive-phase-k2-restore-original-ids-action.md`

## Validation Results

Passed:

- `node --check src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js`
- `node --check tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `git diff --check`
- `git diff --cached --check`

## Boundary Confirmation

Preserved in K.2:

- no Chrome package authority
- no zip
- no cloud/WebDAV/sync propagation
- no scanner/materializer changes
- no destructive overwrite
- no broad capability expansion
- no `S0F0j` / `S0F1j` changes
- no f17 migration drift changes
- no sync/appearance/ribbon dirty files touched
- `stash@{0}` untouched
