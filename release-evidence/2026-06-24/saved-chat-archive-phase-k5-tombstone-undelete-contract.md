# PHASE K.5 CONTRACT — TOMBSTONE OVERRIDE / UN-DELETE

Status: NOT IMPLEMENTED (DEFERRED TO SYNC LANE)

## Decision and boundary

Un-delete is explicitly deferred to the Sync Architecture / deletion lane and is out of the archive-lane implementation scope.

Archive-lane un-delete would need to both change local chat state and sync-tombstone state, which introduces cross-device sequencing, peer attribution, and delete cascade semantics. Those concerns belong to sync deletion flow, not archive restore/relink.

## What un-delete means

Un-delete requires both:

- `chats.is_deleted = 0`
- supersede (not delete) the corresponding `sync_tombstones` row

This requires preserving existing deletion history and writing restore history on the tombstone row.

## Tombstone superseding requirements (sync-owned)

- Preserve deletion history fields:
  - `deleted_at`
  - `deleted_by_sync_peer_id`
  - `delete_reason`
  - `source_sequence_number`
- Record restore history fields:
  - `restored_at`
  - `restored_by_sync_peer_id`
- Preserve restore chain context (`cascade_from` where applicable).
- Emit as a sync event for cross-device correctness.
- Treat as sequenced, peer-attributed behavior.

## Evidence from current archive and sync model

- `sync_tombstones` already models restore-related state in this shape:
  - `restored_at`
  - `restored_by_sync_peer_id`
  - `cascade_from`
  - `source_sequence_number`
  - `deleted_by_sync_peer_id`
- Existing sync adapter path is already present:
  - `sync/execute/adapters/snapshot-tombstone-execute-adapter.tauri.js`
- `chats.is_deleted` exists, while deletion timing is sync-tombstone-owned (`deleted_at` semantics).

## Archive phase boundaries (hard)

Archive modules must not do any of the following:

- write `sync_tombstones`
- flip `chats.is_deleted`
- delete tombstone rows

Archive behavior remains unchanged:

- restore-original-ids returns `tombstoned` with zero writes
- relink returns `tombstoned` with zero writes

Archive modules must also continue to avoid touching:

- import/export/inspector/materializer internals
- sync runtime code
- sync deletion/runtime flow
- `chrome` authority surfaces
- other deletion authorities

## Risks if archive un-delete were implemented here

- Peer re-deletion and race with sync state
- Cross-device resurrection without sequencing
- Cascade integrity and tombstone graph inconsistency
- Sync history rewrite/loss
- Conflict with sync tombstone execute adapter behavior

## Hand-off model

Model A (preferred):
- Operator un-deletes via sync/deletion UI first.
- Archive restore/relink is then applied to the now-live chat.

Model B (optional future):
- Archive publishes intent-only requests for sync un-delete.
- Sync lane retains execution authority.

## Future sync-lane API sketch

- `dryRunUndeleteChat({ chatId })`
- `undeleteChat({ chatId, confirm: "UNDELETE:<chatId>" })`

## Future sync-lane statuses

- `undelete-ready`
- `not-tombstoned`
- `cascade-tombstoned`
- `deleted-elsewhere`
- `already-restored`
- `rejected`
- `live-chat-conflict`
- `undeleted`
- `write-error`

## Safety model for future undelete

- strongest typed confirmation: `UNDELETE:<chatId>`
- distinct undelete UI from restore/relink
- UI must show tombstone metadata:
  - `deleted_at`
  - `deleted_by_sync_peer_id`
  - `delete_reason`
  - `cascade_from`
  - package identity if archive content is involved
- never reuse restore/relink statuses
- never implement undelete in archive-lane runtime

## Future sync-lane harness scope

- soft-deleted chat only
- tombstoned chat only
- soft-deleted + tombstoned combo
- stale tombstone
- cascade tombstone
- already restored
- conflicting live chat cases
- sync peer metadata propagation
- prove tombstone row is superseded (not deleted)
- prove delete attribution history is preserved
- prove restore actions do not override/delete earlier tombstone history

## K.5 archive phase plan

- K.5.0 contract: complete (this document)
- K.5.1 boundary-lock validator: verify archive modules remain tombstone-write/write-deletion forbidden
- K.5 closure: closes archive phase K after restore + relink + tombstone boundary

## Deferred behavior

- full K.5 implementation remains deferred to the sync deletion lane
- no archive runtime un-delete action in this phase
- no change to current archive restore/relink behavior
