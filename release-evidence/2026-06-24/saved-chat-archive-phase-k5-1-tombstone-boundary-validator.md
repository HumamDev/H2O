# Phase K.5.1 Tombstone / Un-Delete Boundary Validator

Status: PHASE K.5.1 — TOMBSTONE / UN-DELETE BOUNDARY VALIDATOR - PASSED

## Summary

K.5.1 adds a static boundary-lock validator for the archive tombstone / un-delete decision recorded in K.5.0.

The validator confirms that archive restore/relink can read tombstone/deleted state to fail closed, but archive modules do not own tombstone override, un-delete, tombstone superseding, or live-chat deletion flips.

## Validator

Added:

- `tools/validation/studio/validate-saved-chat-archive-tombstone-boundary-v1.mjs`

The validator checks:

- K.5.0 contract evidence exists.
- K.5.0 defers un-delete to the Sync Architecture / deletion lane.
- Archive modules must not write `sync_tombstones`.
- Archive modules must not flip `chats.is_deleted`.
- Restore/relink tombstoned outcomes remain zero-write.
- Tombstones are future sync-lane superseded records, never archive-deleted rows.
- `UNDELETE:<chatId>` belongs to the future sync-lane undelete flow.
- No archive undelete runtime exists.
- No `H2O.Studio.archiveUndelete` or `H2O.Studio.archiveTombstoneRestore` runtime exists.
- No `dryRunUndeleteChat` or `undeleteChat` archive runtime exists.
- Restore/relink harness coverage still locks tombstoned zero-write behavior.

## Boundary Locked

Archive modules remain forbidden from:

- writing `sync_tombstones`
- clearing/deleting/superseding tombstone rows
- writing `restored_at` / `restored_by_sync_peer_id`
- flipping `chats.is_deleted`
- mutating deletion timestamps
- implementing archive un-delete runtime entry points

Allowed archive behavior remains:

- read tombstone/deleted state for gating
- return `tombstoned`
- perform zero writes for tombstoned restore/relink cases

## Restore / Relink Status

Restore-original-ids remains tombstone-gated:

- tombstoned original chat returns `tombstoned`
- zero writes
- no tombstone clearing/deletion/superseding
- no `chats.is_deleted` flip

Relink remains tombstone-gated:

- tombstoned target chat returns `tombstoned`
- zero writes
- no tombstone clearing/deletion/superseding
- no `chats.is_deleted` flip

## Deferred Ownership

Future un-delete remains Sync Architecture / deletion lane work.

Future sync-lane flow should own:

- `dryRunUndeleteChat({ chatId })`
- `undeleteChat({ chatId, confirm: "UNDELETE:<chatId>" })`
- tombstone superseding
- deletion attribution preservation
- restore attribution
- cross-device sequencing
- sync event propagation

## Runtime / Capability Status

- Runtime archive code unchanged.
- Sync runtime code unchanged.
- Capabilities unchanged.
- Chrome runtime unchanged.
- No Archive UI added.
- No un-delete implementation added.

## Validation

Passed:

- `node --check tools/validation/studio/validate-saved-chat-archive-tombstone-boundary-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-tombstone-boundary-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `git diff --check`
- `git diff --cached --check`

## Files Changed

- `tools/validation/studio/validate-saved-chat-archive-tombstone-boundary-v1.mjs`
- `release-evidence/2026-06-24/saved-chat-archive-phase-k5-1-tombstone-boundary-validator.md`
