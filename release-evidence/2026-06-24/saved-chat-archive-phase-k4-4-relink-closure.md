# Phase K.4 Relink Closure

Status: PHASE K.4 — ARCHIVE RELINK CLOSURE - CLOSED

## Closure summary

- K.4 relink is complete.
- Relink is Desktop-only and API-only.
- Module: `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`
- Runtime namespace: `H2O.Studio.archiveRelink`
- Implemented APIs:
  - `isDesktopCapable()`
  - `dryRunRelinkPackage({ packagePath, targetChatId })`
  - `relinkVerifiedPackage({ packagePath, targetChatId, confirm })`
- Typed confirmation token: `RELINK:<targetChatId>`
- Boolean `confirm: true` is rejected.
- UI remains deferred.

## Proven relink behavior

- `inspectPackage`-gated before relink action.
- Reuses `archiveImporter.buildTurnsFromPackageSnapshot` for snapshot turns.
- Inserts a fresh snapshot under `targetChatId` using generated `snap_relinked_*` identifier.
- Inserts recovered turns under the fresh snapshot.
- Updates only target chat pointer/metadata fields.
- Does not overwrite snapshots/turns.
- Does not re-parent snapshots.
- Does not reuse package original snapshot id as the new snapshot id.
- Does not mutate bindings or package/source identity fields:
  - `is_saved`
  - `is_linked`
  - `link_source_href`
  - `href`
  - `normalized_href`
- Does not write `libraryIndex`.
- Does not write `saved_chat_archive_requests`.
- Does not clear/delete/supersede `sync_tombstones`.

## K.4.3 harness proof

Deterministic temp-DB harness loaded and proved real `H2O.Studio.archiveRelink` module behavior with the following cases:

- `relink-ready`
- typed-confirm rejection for `confirm: true`
- typed-confirm rejection for wrong string
- `relinked`
- `already-relinked`
- `target-chat-missing`
- `target-chat-deleted`
- `tombstoned`
- `snapshot-belongs-to-other-chat`

Success path proof (relink action):

- `+0` chats
- `+1` snapshot
- `+N` turns
- exactly one `UPDATE chats`
- new snapshot id starts with `snap_relinked_`
- new snapshot belongs to `targetChatId`
- package original snapshot id is not reused
- target pointer fields updated
- organization/membership fields unchanged
- old snapshot row unchanged
- old snapshot turns unchanged
- tombstone row unchanged
- live Desktop DB untouched

## Boundaries and non-goals

- No Relink UI card yet.
- No tombstone override/un-delete.
- No capability changes.
- No Chrome package authority.
- No scanner/materializer/writer/importer/inspector/exporter behavior changes.
- No libraryIndex behavior changes.
- No zip implementation.
- No cloud/WebDAV/sync propagation.
- No `S0F0j`/`S0F1j` changes.
- No `f17` migration drift work.

## Deferred work

- K.5 tombstone override/un-delete contract, if opened later.
- Relink UI card if product requires an operator surface.
- `undoRelink` API if explicit rollback is needed.
- Live Desktop smoke on disposable target is optional since deterministic temp-DB proof is already established.
