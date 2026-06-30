# Saved Chat Archive - Phase K.3 Restore Original IDs Harness / Runtime Smoke

Status: **PHASE K.3 — RESTORE ORIGINAL IDS HARNESS / RUNTIME SMOKE - PASSED**

Lane: H2O Studio Chat Saving Architecture - Phase K restore/relink.

## Runtime Strategy

K.3 uses the permanent deterministic temp-DB harness as the runtime proof.

The harness builds a throwaway SQLite database from the committed seed schema, registers the Tauri parity `h2o_writer_identity()` stub, loads the real Studio modules, routes all package reads and SQL writes through mocked Tauri invoke calls, and never opens or mutates the live Desktop `studio-v1.db`.

This is safer than using the live Desktop database for restore because `restore-original-ids` intentionally inserts original ids.

## Harness Summary

Extended harness:

- `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`

Fixture source:

- `tools/validation/fixtures/saved-chat-archive/import-recovery/i-harness-source.h2ochat`

Real modules loaded by the harness:

- saved-chat archive diagnostics
- archive inspector
- archive importer
- archive restore
- Desktop chat/snapshot store adapters

The existing import-as-new harness assertions remain green.

## Restore Cases Covered

K.3 covers:

- `restore-ready`
  - seed DB does not contain the generated package original `chatId` or `snapshotId`
  - `dryRunRestorePackage` returns `restore-ready`
  - `restoreVerifiedPackage({ confirm: true })` returns `restored`
  - original `chatId` exists after restore
  - original `snapshotId` exists after restore
  - `snapshot_turns` are inserted
  - provenance metadata is recorded
  - DB delta is exactly `+1 chats`, `+1 snapshots`, `+N snapshot_turns`
  - restore write log contains no `UPDATE`

- confirm gate
  - `restoreVerifiedPackage({ confirm: false })` returns `rejected`
  - zero writes

- `already-present`
  - second restore of the restored package returns `already-present`
  - zero writes

- `conflict-snapshot-id`
  - existing snapshot id with conflicting digest returns `conflict-snapshot-id` on dry-run
  - restore returns `conflict`
  - zero restore writes

- `conflict-chat-id`
  - existing original chat id without original snapshot returns `conflict-chat-id`
  - restore returns `conflict`
  - zero restore writes

- `tombstoned`
  - active `sync_tombstones` row for original chat id returns `tombstoned`
  - restore returns `tombstoned`
  - zero restore writes
  - tombstone row remains unchanged

## No-Overwrite Proof

The harness records SQL write verbs routed through the mocked Tauri SQL execute path.

For the successful restore:

- inserts into `chats`
- inserts into `snapshots`
- inserts into `snapshot_turns`
- no `UPDATE`
- no overwrite primitive

For confirm-gate, already-present, conflict, and tombstoned cases:

- zero restore writes

## Boundary Proof

K.3 preserves:

- no relink implementation
- no tombstone override/un-delete
- no Restore UI
- no Chrome package authority
- no scanner/materializer changes
- no package writer changes
- no importer/inspector/exporter behavior changes
- no `libraryIndex` write
- no `saved_chat_archive_requests` write
- no sync/WebDAV/cloud propagation
- live Desktop DB untouched

## Validation Results

Passed:

- `node --check src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js`
- `node --check tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node --check tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `git diff --check`
- `git diff --cached --check`

## Files Changed

- `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `release-evidence/2026-06-24/saved-chat-archive-phase-k3-restore-runtime-smoke.md`

## Deferred

Still deferred:

- relink existing LibraryItem/chat
- tombstone override/un-delete
- Restore UI
- zip round-trip
- cloud/WebDAV/sync propagation
- Chrome package-body authority
