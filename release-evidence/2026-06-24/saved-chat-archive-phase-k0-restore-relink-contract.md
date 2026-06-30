# Saved Chat Archive - Phase K.0 Restore / Relink Contract

Status: **PHASE K.0 CONTRACT — VERIFIED ARCHIVE RESTORE / RELINK - NOT IMPLEMENTED**

Lane: H2O Studio Chat Saving Architecture - Phase K restore/relink.

## Baseline

Current closed archive recovery/export phases:

- Phase H import-as-new recovery closed: `f5b8b4e docs(studio): close saved chat archive phase h`
- Phase I permanent import harness closed: `d1544e0 docs(studio): close saved chat archive phase i`
- Phase J export/share closed: `207a54f docs(studio): close archive export share phase`

Phase K starts from a working import-as-new path and a working bounded export path. K.0 defines the stricter restore/relink contract before any runtime restore implementation.

## Data Model

The Desktop database/store remains the authority.

- A LibraryItem is a chat row in `chats`.
- The chat row owns the current-snapshot pointer:
  - `last_snapshot_id`
  - `current_leaf_id`
  - `last_captured_at`
- The chat row also carries:
  - `is_saved`
  - `is_linked`
  - `link_source_href`
  - `href`
  - `normalized_href`
  - folder/category/label bindings
  - `is_deleted`
- A snapshot belongs to a chat through `snapshots.chat_id`.
- Turns belong to snapshots through `snapshot_turns`.
- `libraryIndex` is a Chrome-compatible projection store, not the Desktop authority.
- Restore must not write `libraryIndex` directly.
- Deletion is soft and/or tombstone-based:
  - `is_deleted=1`
  - `sync_tombstones` with `record_kind: chat`

## Product Meanings

### Import-As-New

Import-as-new is already done.

It creates a fresh recovered `chatId` and fresh recovered `snapshotId`, preserving provenance back to the original package identity. It never overwrites existing rows.

### Restore

Restore is the Phase K core.

Restore writes the verified package under the original `chatId` and original `snapshotId` only if both are absent and the chat is not tombstoned.

### Relink

Relink updates or re-points an existing LibraryItem/chat to a recovered snapshot or restored snapshot.

Relink is deferred because it mutates existing library state.

### Overwrite

Overwrite is never allowed.

## K Core Decision

Ship only `restore-original-ids` first.

Restore-original-ids is:

- absent-only
- non-destructive
- Desktop-only
- verification-gated by `inspectPackage`
- implemented later by reusing `archiveImporter.buildTurnsFromPackageSnapshot`

Restore writes only:

- `chats`
- `snapshots`
- `snapshot_turns`
- provenance metadata

Restore reads tombstones to gate tombstoned chats.

Restore does not touch:

- folder/category/label bindings
- `libraryIndex`
- `saved_chat_archive_requests`
- scanner
- materializer
- Chrome runtime/service-worker

## Safety Model

Restore must never overwrite existing chats, snapshots, or turns.

Rules:

- If original `snapshotId` exists and digest/content matches, return `already-present` with zero writes.
- If original `snapshotId` exists and digest/content differs, return `conflict-snapshot-id` with zero writes.
- If original `chatId` exists but original `snapshotId` is absent, return `conflict-chat-id` with zero writes.
- If original `chatId` is tombstoned, return `tombstoned` with zero writes.
- Tombstone override/un-delete is deferred.
- If both original `chatId` and original `snapshotId` are absent and no tombstone exists, return `restore-ready`.
- Re-check `snapshots.get(snapshotId)` immediately before insert.
- Existing-state `UPDATE`s belong to a future relink phase only.
- Overwrite existing snapshot is permanently rejected.

## Mode Table

| Mode | Meaning | Phase |
| --- | --- | --- |
| A | import-as-new | done |
| B | restore-original-ids absent-only | K core |
| C | relink LibraryItem to recovered/restored snapshot | deferred |
| D | restore into existing chat as new snapshot | deferred |
| E | overwrite existing snapshot | never |

## Proposed API

Future Desktop-only module:

- `H2O.Studio.archiveRestore`

Potential APIs:

- `isDesktopCapable()`
- `dryRunRestorePackage({ packagePath })`
- `restoreVerifiedPackage({ packagePath, mode = "restore-original-ids", confirm = false })`
- optional card mount/render methods later

Dry-run statuses:

- `restore-ready`
- `already-present`
- `conflict-snapshot-id`
- `conflict-chat-id`
- `tombstoned`
- `corrupted`
- `unsupported-version`
- `rejected`

Action statuses:

- `restored`
- `already-present`
- `conflict`
- `tombstoned`
- `rejected`
- `read-error`
- `write-error`

## UX Contract

Future UI should be Desktop-only and explicit.

- Add a Restore card later as a sibling to the Import Recovery / Archive Inspector area.
- Require explicit operator confirmation.
- Restore label must say:
  - restore original identity
  - not import-as-new
  - no overwrite

The UI must not hide the distinction between import-as-new and restore-original-ids.

## Phase Plan

- K.0 contract
- K.1 static validator + recovery-validator flip
- K.2 restore-original-ids action
- K.3 harness extension + runtime smoke
- K.4 relink deferred modes C/D
- K.5 tombstone override/un-delete or closure, depending on product priority

## Boundaries

Phase K.0 preserves:

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

## Implementation Notes For Later Phases

K.2 should be validator-led and should prefer the existing importer/inspector primitives:

- use `archiveInspector.inspectPackage` as the verification gate
- reuse `archiveImporter.buildTurnsFromPackageSnapshot`
- write through Desktop store adapters or the already-approved importer persistence path
- perform the final absent check immediately before insert
- treat tombstones as a hard stop until the product explicitly approves un-delete behavior

Relink, restore-into-existing-chat, and tombstone override are intentionally not part of K core.
