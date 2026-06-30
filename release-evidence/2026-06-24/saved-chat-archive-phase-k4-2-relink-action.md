# PHASE K.4.2 — RELINK ACTION - IMPLEMENTED

## Status

K.4.2 implements a separate Desktop-only archive relink runtime module.

relink is implemented.

Relink is implemented as an API-only action. No Relink UI card was added in this slice.

## Implementation summary

Created:

- `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`

Registered:

- `H2O.Studio.archiveRelink`

Public APIs:

- `isDesktopCapable()`
- `dryRunRelinkPackage({ packagePath, targetChatId })`
- `relinkVerifiedPackage({ packagePath, targetChatId, confirm })`

Loader/pack wiring:

- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`

## Relink behavior

Relink:

- verifies the `.h2ochat` package through `archiveInspector.inspectPackage`
- reads package `snapshot.json`
- reuses `archiveImporter.buildTurnsFromPackageSnapshot`
- targets an existing Desktop chat by `targetChatId`
- inserts a fresh recovered snapshot under `targetChatId`
- inserts recovered turns for that fresh snapshot
- updates only target chat pointer metadata

Relink does not:

- overwrite existing snapshots or turns
- re-parent existing snapshots
- use the package original snapshotId as the new snapshot id
- update folder/category/label bindings
- write `libraryIndex`
- write `saved_chat_archive_requests`
- clear/delete/supersede `sync_tombstones`

## Typed confirmation token design

typed confirmation token: deterministic target-chat token.

Relink requires a typed string token:

- `RELINK:<targetChatId>`

`confirm: true` is rejected. Boolean confirmation is intentionally not accepted for relink because relink mutates an existing LibraryItem/chat pointer.

## Dry-run statuses

Supported dry-run decisions:

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

## Action statuses

Supported action statuses:

- `relinked`
- `already-relinked`
- `conflict`
- `target-chat-missing`
- `target-chat-deleted`
- `tombstoned`
- `rejected`
- `read-error`
- `write-error`

## Safety guarantees

- Desktop-only.
- Verification-gated by `inspectPackage`.
- Typed-confirm gated.
- Fresh snapshot id generated with `snap_relinked_` prefix.
- Package original snapshotId is never reused as the new snapshot id.
- Old snapshots and turns are not deleted, updated, or re-parented.
- Target chat update is limited to:
  - `last_snapshot_id`
  - `current_leaf_id`
  - `last_captured_at`
  - `snapshot_count`
  - `updated_at`
  - merged `meta_json` provenance
- Existing `meta_json` is merged, not replaced.
- Tombstone override still deferred.
- tombstone override still deferred.
- Relink reads `sync_tombstones` only as a gate.

## UI decision

UI deferred.

K.4.2 is API-only to keep the first relink runtime isolated and harnessable. A Relink UI card can be considered after K.4.3 deterministic proof.

## Files changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `release-evidence/2026-06-24/saved-chat-archive-phase-k4-2-relink-action.md`

## Validation results

Passed:

- `node --check src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`
- `node --check tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `node --check tools/product/studio/pack-studio.mjs`
- `git diff --check`
- `git diff --cached --check`

## Deferred

- runtime smoke deferred to K.4.3.
- K.4.3 deterministic temp-DB relink harness.
- Relink UI card.
- tombstone override / un-delete.
- `sync_tombstones` clear/delete/supersede.
- zip.
- sync/cloud/WebDAV propagation.
- Chrome package authority.
