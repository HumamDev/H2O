# PHASE K.4 CONTRACT — RELINK - NOT IMPLEMENTED

## Scope and status

- K.4 is the next phase after K.3 harness proof.
- Current status marker: **NOT IMPLEMENTED**.
- K.4 scope is contract only.

## Core decision

- Implement relink in K.4.
- Do not combine relink and tombstone override/undeletion.
- Do not alter K.2 restore behavior.
- Relink is self-contained and bounded.
- Tombstone override is deferred to K.5.

## Relink definition

Relink attaches a verified `.h2ochat` package’s content to an existing operator-selected LibraryItem/chat.

Relink operation:

- inspects/verifies package
- inserts a fresh recovered snapshot under the target chatId
- inserts recovered turns for that new snapshot
- updates the target chat’s current snapshot pointer/metadata

Relink must be additive in data, pointer-moving only for the target chat.

## Contrast with existing modes

- import-as-new: creates a new recovered chat with fresh ids.
- restore-original-ids: inserts original chatId/snapshotId only when absent.
- relink: uses an existing target chat, inserts a fresh snapshot, then repoints it.
- overwrite: never allowed.

## Allowed target chat updates

- `last_snapshot_id`
- `current_leaf_id`
- `last_captured_at`
- `snapshot_count`
- `updated_at`
- merged `meta_json` provenance only

## Forbidden updates in K.4

- existing snapshot body
- existing snapshot turns
- old snapshot deletion
- snapshot re-parenting
- package original snapshotId as the new snapshot id
- `is_saved`
- `is_linked`
- `link_source_href`
- `href`
- `normalized_href`
- folder/category/label bindings
- `libraryIndex`
- `sync_tombstones`
- `saved_chat_archive_requests`

## Safety boundaries

- Desktop-only.
- `inspectPackage` gated.
- reuse `archiveImporter.buildTurnsFromPackageSnapshot`.
- typed confirmation required (stricter than the K.2 boolean).
- target chat must exist.
- target chat must not be deleted.
- target chat must not be tombstoned.
- deleted/tombstoned target returns rejected/tombstoned with zero writes.
- no overwrite.
- no relink to an existing snapshot id in this phase.
- no pure mode that only repoints to an existing snapshot.
- no tombstone clear/delete/supersede in this phase.

## Undo/provenance capture

Before pointer update, capture provenance metadata:

- `previousSnapshotId`
- `previousCurrentLeafId`
- `previousLastCapturedAt`
- `newSnapshotId`
- package `chatId`
- package `snapshotId`
- `contentHash`
- `packagePath`
- `packageDirName`
- `relinkedAt`
- confirm token / confirmation mode
- mode: `relink`

Notes:

- old snapshot and turns remain untouched.
- undo can be a future pure pointer revert.
- undo implementation is intentionally out of K.4 scope.

## Status vocabulary

Dry-run statuses:

- `relink-ready`
- `already-relinked`
- `target-chat-missing`
- `target-chat-deleted`
- `tombstoned`
- `snapshot-belongs-to-other-chat`
- `snapshot-missing`
- `conflict`
- `corrupted`
- `unsupported-version`
- `rejected`
- `read-error`

Action statuses:

- `relinked`
- `already-relinked`
- `conflict`
- `target-chat-missing`
- `target-chat-deleted`
- `tombstoned`
- `rejected`
- `read-error`
- `write-error`

## Proposed API surface (contract only)

- module: `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`
- namespace: `H2O.Studio.archiveRelink`
- APIs:
  - `isDesktopCapable()`
  - `dryRunRelinkPackage({ packagePath, targetChatId })`
  - `relinkVerifiedPackage({ packagePath, targetChatId, confirm })`

`archiveRestore` remains insert-only and does not become relink.

## Runtime/harness sequencing

- K.4.1: contract validator `validate-saved-chat-archive-relink-v1.mjs`.
- K.4.2: Desktop relink action implementation.
- K.4.3: deterministic temp-DB harness extension.

## K.4.3 expected harness assertions

1. target chat + old snapshot seeded
2. relink inserts +1 snapshot and +N turns
3. exactly one chat pointer update
4. old snapshot and turns unchanged
5. target title/folder/category/membership unchanged
6. provenance `previousSnapshotId` recorded
7. no `libraryIndex` writes
8. no `sync_tombstones` writes
9. missing/deleted/tombstoned/conflict/already-relinked/no-confirm are zero-write

Runtime proof direction:

- deterministic temp-DB proof first.
- optional live smoke only on disposable throwaway chat.
- never relink real user chats in proof.

## Deferred to K.5

- tombstone override
- un-delete
- clear/supersede `sync_tombstones`
- cross-device deletion resurrection semantics

## Explicit boundaries for K.4

- no Chrome package authority
- no capability changes
- no scanner/materializer/writer/importer/inspector/exporter behavior changes
- no zip
- no cloud/WebDAV/sync propagation
- no `S0F0j`/`S0F1j` changes
- no f17 migration drift
- no sync/appearance/ribbon dirty-file edits
- no `saved_chat_archive_requests` mutation
- no relink implementation in this phase

## Evidence provenance and closure point

- This note is contract only.
- Actual relink action and runtime/harness proof are deferred to later K.4 slices.
