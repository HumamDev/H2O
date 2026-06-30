# PHASE K.4.1 — RELINK VALIDATOR - NOT IMPLEMENTED

## Status

K.4.1 adds static validation only for the K.4 relink contract.

relink still not implemented.

## Validator summary

Added:

- `tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`

The validator asserts:

- K.4 contract evidence exists.
- K.4 is marked not implemented.
- relink inserts a fresh recovered snapshot under an existing target chat.
- relink updates only target chat pointer/metadata.
- typed confirmation is required.
- undo provenance is required.
- no overwrite.
- no snapshot re-parenting.
- no package original snapshotId as new snapshot id.
- no `libraryIndex` write.
- no `sync_tombstones` clear/delete/supersede.
- no `saved_chat_archive_requests` write.
- no Chrome package authority.
- no production relink module exists yet.
- no `H2O.Studio.archiveRelink` registration exists yet.
- no `dryRunRelinkPackage` / `relinkVerifiedPackage` runtime exists yet.
- no Relink UI card exists yet.

## Recovery-validator flip summary

recovery-validator flip: complete.

Updated:

- `tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`

The recovery/import/export validator now pre-authorizes the future relink module path only:

- `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`

Allowed future relink names are scoped only to that module:

- `H2O.Studio.archiveRelink`
- `dryRunRelinkPackage`
- `relinkVerifiedPackage`

Relink names remain forbidden everywhere else.

## Preserved invariants

- restore remains insert-only.
- `archiveRestore` does not perform pointer-update relink behavior.
- importer remains import-as-new only.
- tombstone override still deferred.
- tombstone clear/delete/supersede remains forbidden.
- no runtime relink implementation.
- no Relink UI card.
- no capability changes.
- no Chrome runtime/service-worker changes.
- no runtime/capability/Chrome changes.
- no scanner/materializer/writer/importer/inspector/exporter behavior changes.
- no `libraryIndex` behavior changes.

## Files changed

- `tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `release-evidence/2026-06-24/saved-chat-archive-phase-k4-1-relink-validator.md`

## Validation results

Passed:

- `node --check tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node --check tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `git diff --check`
- `git diff --cached --check`

## Deferred

- K.4.2 relink implementation.
- K.4.3 deterministic relink harness.
- tombstone override / un-delete.
- `sync_tombstones` clear/delete/supersede.
- Chrome package authority.
