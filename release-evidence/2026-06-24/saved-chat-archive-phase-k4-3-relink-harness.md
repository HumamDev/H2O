# PHASE K.4.3 — RELINK HARNESS PROOF - PASSED

## Status

K.4.3 extends the permanent deterministic temp-DB archive import/recovery harness to prove archive relink behavior.

The live Desktop DB was not used or mutated.

## Harness summary

Updated:

- `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`

The harness loads the real modules:

- archive diagnostics
- archive inspector
- archive importer
- archive restore
- archive relink
- Desktop store adapters

It builds a deterministic temp SQLite database, stages deterministic `.h2ochat` packages under temp AppLocalData, and runs relink through `H2O.Studio.archiveRelink`.

## Cases covered

- `relink-ready`
- typed-confirm rejection
- `relinked`
- `already-relinked`
- `target-chat-missing`
- `target-chat-deleted`
- `tombstoned`
- `snapshot-belongs-to-other-chat`

## Exact DB delta proof

Successful relink proves:

- chats: `+0`
- snapshots: `+1`
- snapshot_turns: `+N`
- exactly one `UPDATE chats`
- no `UPDATE snapshots`
- no `UPDATE snapshot_turns`
- no `DELETE`

## Typed confirmation proof

The harness proves:

- dry-run returns `requiredConfirmToken = RELINK:<targetChatId>`
- `confirm: true` returns `rejected`
- wrong string confirm returns `rejected`
- correct typed token returns `relinked`

## Pointer update proof

The target chat pointer fields change:

- `last_snapshot_id`
- `current_leaf_id`
- `last_captured_at`
- `snapshot_count`
- `updated_at`
- merged `meta_json` provenance

The target chat organization/membership fields remain unchanged:

- `is_saved`
- `is_linked`
- `link_source_href`
- `href`
- `normalized_href`
- `folder_id`
- `category_id`
- `project_id`
- `title`

## Old snapshot / turns unchanged proof

The harness hashes old rows before and after relink and proves:

- old snapshot row unchanged
- old snapshot turns unchanged
- old snapshot still exists
- old turns still exist
- no snapshot/turn body overwrite
- no old snapshot delete
- no old turns delete

## Provenance proof

Target chat `meta_json` contains relink provenance:

- `previousSnapshotId`
- `previousCurrentLeafId`
- `previousLastCapturedAt`
- `newSnapshotId`
- package `originalChatId`
- package `originalSnapshotId`
- package `contentHash`
- package `packagePath`
- package `packageDirName`
- `relinkedAt`
- `confirmToken`
- `confirmMode`
- mode `relink`

## Zero-write rejection proof

The harness proves zero-write outcomes for:

- boolean confirm
- wrong string confirm
- missing target chat
- deleted target chat
- tombstoned target chat
- package original snapshot already belonging to another chat
- second relink after already matching content

## Tombstone-deferred proof

The tombstoned target case returns `tombstoned`, performs zero writes, and leaves the `sync_tombstones` row unchanged.

No tombstone clear/delete/supersede behavior was added.

## Boundaries preserved

- Relink UI still deferred.
- Runtime live DB not used; deterministic temp-DB proof used.
- No Chrome package authority.
- No scanner/materializer changes.
- No writer/importer/inspector/exporter/restore behavior changes.
- No `libraryIndex` writes.
- No `saved_chat_archive_requests` writes.
- No sync/cloud/WebDAV propagation.
- No capabilities changed.

## Validation results

Passed:

- `node --check src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`
- `node --check tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node --check tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `git diff --check`
- `git diff --cached --check`

## Files changed

- `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `release-evidence/2026-06-24/saved-chat-archive-phase-k4-3-relink-harness.md`
