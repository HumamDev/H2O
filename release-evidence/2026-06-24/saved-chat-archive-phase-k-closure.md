PHASE K — VERIFIED ARCHIVE RESTORE / RELINK CLOSURE - CLOSED

Runtime restore/relink work in the archive lane is now closed.

Closed milestones and references:

- K.0 restore/relink contract: `647e9a4`
- K.1 restore/relink validator: `a785dab`
- K.2 restore-original-ids action: `5b4cb80`
- K.3 restore-original-ids harness proof: `2511f95`
- K.4 relink contract: `ec094b4`
- K.4.1 relink validator: `a3a6395`
- K.4.2 relink action: `76d8e8d`
- K.4.3 relink harness proof: `d32c20d`
- K.4.4 relink closure: `b9320c7`
- K.5.0 tombstone/un-delete boundary contract: `dd0a873`
- K.5.1 tombstone/un-delete boundary validator: `1529a69`

Restore-original-ids (K.2/K.3) is closed:

- Module: `src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js`
- Runtime namespace: `H2O.Studio.archiveRestore`
- APIs:
  - `isDesktopCapable()`
  - `dryRunRestorePackage({ packagePath })`
  - `restoreVerifiedPackage({ packagePath, mode = "restore-original-ids", confirm = false })`
- Runtime behavior:
  - Desktop-only
  - inspection-gated via package verifier (`inspectPackage`)
  - confirm-gated for action
  - absent-only insert semantics
  - original `chatId`/`snapshotId` reuse only when absent
  - reused `archiveImporter.buildTurnsFromPackageSnapshot`
  - re-check `snapshots.get(snapshotId)` before insert
  - no overwrite semantics
  - tombstoned case remains zero-write (`tombstoned`)
- K.3 harness proved:
  - `restore-ready`
  - confirm gate (`confirm:false` rejected)
  - `already-present`
  - `conflict-snapshot-id`
  - `conflict-chat-id`
  - `tombstoned`
  - exact DB deltas with no hidden mutation of unrelated rows
  - provenance recorded for successful restore
  - zero-write for conflict/error paths
  - no tombstone mutation

Relink (K.4.2/K.4.3) is closed:

- Module: `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`
- Runtime namespace: `H2O.Studio.archiveRelink`
- APIs:
  - `isDesktopCapable()`
  - `dryRunRelinkPackage({ packagePath, targetChatId })`
  - `relinkVerifiedPackage({ packagePath, targetChatId, confirm })`
- Confirm model:
  - typed token required: `RELINK:<targetChatId>`
  - `confirm: true` is rejected
- Runtime behavior:
  - Desktop-only
  - inspection-gated
  - inserts fresh `snap_relinked_*` snapshot under target chat
  - inserts recovered turns under the new snapshot
  - updates only target chat pointer metadata
  - old snapshot and old turns preserved
  - package original snapshot ID is not reused
  - no `libraryIndex` writes
  - no `saved_chat_archive_requests` writes
  - no `sync_tombstones` clear/delete/supersede
- K.4.3 harness proved:
  - `relink-ready`
  - typed confirm rejection for wrong string and `confirm:true`
  - `relinked`
  - `already-relinked`
  - `target-chat-missing`
  - `target-chat-deleted`
  - `tombstoned`
  - `snapshot-belongs-to-other-chat`
  - exact DB delta: `+0 chats / +1 snapshot / +N turns` where N is imported turn count
  - exactly one chat UPDATE during success
  - old snapshot/turns unchanged
  - tombstone unchanged
  - live DB untouched for harness proof

Tombstone/un-delete boundary (K.5.0/K.5.1) is locked:

- Deletion/un-delete remains in sync architecture/delete lane.
- Archive lane does not implement archive-side un-delete.
- K.5.1 validator locks archive modules to:
  - no `sync_tombstones` writes
  - no live `chats.is_deleted` flips
  - no archive undelete runtime entrypoints
- Restore/relink tombstoned outcomes remain zero-write and no mutation of tombstone rows.
- Sync-lane deletion flow remains the source of truth for:
  - `chats.is_deleted = 0`
  - tombstone supersession semantics
  - `restored_at` / `restored_by_sync_peer_id`
  - deletion metadata preservation (`deleted_at`, `deleted_by_sync_peer_id`, `delete_reason`, `source_sequence_number`)
- Future archive-deletion token model is explicit: `UNDELETE:<chatId>` belongs to sync/architecture phase, not this archive phase.

Phase boundaries confirmed for closure:

- no Chrome package-body authority
- no capability changes in archive K closure
- no scanner/materializer/writer/importer/inspector/exporter behavior changes in K
- no zip
- no cloud/WebDAV/sync transport
- no direct `libraryIndex` writes
- no `S0F0j` / `S0F1j` changes
- no f17 migration drift touched
- restore/relink UI remains deferred to API-only in this phase
- undoRelink remains deferred
- un-delete deferred to Sync Architecture / deletion lane

Recommended next phase:

- Phase K.5.2: sync-lane archive un-delete ownership (if reopened) and any future archive restore/relink user-facing operator surface, plus optional proof that `UNDELETE:<chatId>` sync flow remains sequenced and peer-attributed.
