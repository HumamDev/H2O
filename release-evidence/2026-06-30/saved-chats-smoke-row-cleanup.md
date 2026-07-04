# Saved Chats Smoke Row Cleanup

Status: RUNTIME DATA CLEANUP COMPLETE

## Scope

This was runtime Desktop Studio data cleanup only. It did not revert or hide the Saved-page rendering fix from:

- `1aed1d76 fix(studio): render saved archived chats`

The cleanup removed only archive/dev/smoke/debug saved-chat rows from the active Desktop Studio SQLite database and, where proven by package manifests, moved matching smoke `.h2ochat` package folders out of the active archive package store after backup.

## Active Runtime Database

Active SQLite database:

- `/Users/hobayda/Library/Application Support/org.h2o.studio.desktop/studio-v1.db`

The database had WAL files present, so backups were created through SQLite backup operations rather than raw file copy.

## Backups

SQLite DB backups created:

- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154512.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154530.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154606.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154812.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154859.db`

The first two writes were blocked/aborted before data deletion:

- sandbox readonly DB write
- SQLite writer-identity function unavailable on CLI connection

Package backup directory:

- `/private/tmp/h2o-studio-package-backups/packages-before-smoke-cleanup-20260704-154812`

## Dry-Run Candidate Table

The guarded dry-run found 21 exact smoke/debug candidates and zero ambiguous rows:

| chatId | title |
| --- | --- |
| `c4_4_pkg_v1_smoke_1782302682904` | C4.4 package v1 runtime smoke |
| `c4_4_pkg_v2_smoke_1782299170048` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782299293116` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782299422004` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782302122075` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782302344596` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782302461020` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782302551543` | C4.4 package v2 runtime smoke |
| `c4_4_pkg_v2_smoke_1782302682904` | C4.4 package v2 runtime smoke |
| `c4_4_writer_identity_debug_1782302074463` | C4.4 writer identity debug |
| `c4_4_writer_identity_debug_1782302109750` | C4.4 writer identity debug |
| `c5_3_asset_diag_v1_1782306749077` | C5.3 asset diagnostics v1 smoke |
| `c5_3_asset_diag_v2_1782306749077` | C5.3 asset diagnostics v2 smoke |
| `c5_4_db_diag_v1_1782315023496` | C5.4 DB diagnostics v1 smoke |
| `c5_4_db_diag_v2_1782315023496` | C5.4 DB diagnostics v2 smoke |
| `d2a_request_intake_chat_1782326136543` | D.2A archive request intake smoke |
| `d2b_request_queue_chat_1782326983172` | D.2B archive request queue smoke |
| `d2c_request_materializer_chat_1782334630557` | D.2C archive request materializer smoke |
| `d2c_request_materializer_chat_1782334865884` | D.2C archive request materializer smoke |
| `d3b2_inbox_chat_1782391840992` | D.3B.2 archive request inbox smoke |
| `writer_identity_debug_1782300179966` | Writer identity debug chat / snapshot |

All matched strict dev/smoke/debug ID prefixes and known smoke/debug titles. No real user titles were candidates.

## Package Repopulation Finding

A DB-only cleanup initially succeeded, but running Tauri Desktop processes repopulated the rows from runtime/package state.

Running processes were stopped before the durable cleanup:

- installed Desktop app process
- Tauri dev process chain

Sixteen package directories were proven by manifest `chatId` and moved out of the active package store after backup:

- `c4_4_pkg_v1_smoke_1782302682904.h2ochat`
- `c4_4_pkg_v2_smoke_1782299170048.h2ochat`
- `c4_4_pkg_v2_smoke_1782299293116.h2ochat`
- `c4_4_pkg_v2_smoke_1782299422004.h2ochat`
- `c4_4_pkg_v2_smoke_1782302122075.h2ochat`
- `c4_4_pkg_v2_smoke_1782302344596.h2ochat`
- `c4_4_pkg_v2_smoke_1782302461020.h2ochat`
- `c4_4_pkg_v2_smoke_1782302551543.h2ochat`
- `c4_4_pkg_v2_smoke_1782302682904.h2ochat`
- `c5_3_asset_diag_v1_1782306749077.h2ochat`
- `c5_3_asset_diag_v2_1782306749077.h2ochat`
- `c5_4_db_diag_v1_1782315023496.h2ochat`
- `c5_4_db_diag_v2_1782315023496.h2ochat`
- `d2c_request_materializer_chat_1782334630557.h2ochat`
- `d2c_request_materializer_chat_1782334865884.h2ochat`
- `d3b2_inbox_chat_1782391840992.h2ochat`

No real package folders were removed. The active package store now contains only:

- `69de12dc-b7dc-838c-a553-916422265e5a.h2ochat`
- `69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`
- `h5-import-smoke-fixture-7f956711.h2ochat`

## Removed Counts

Final successful cleanup removed:

| Table / category | Removed |
| --- | ---: |
| `chats` | 21 |
| saved chat rows | 21 |
| saved snapshot-backed rows | 21 |
| `snapshots` | 21 |
| `snapshot_turns` | 21 |
| `snapshot_turn_assets` | 0 in final pass; 12 had been removed in the first successful DB pass |
| `folder_bindings` | 0 |
| `label_bindings` | 0 in final pass; 1 had been removed in the first successful DB pass |
| `tag_bindings` | 0 in final pass; 1 had been removed in the first successful DB pass |
| matching `saved_chat_archive_requests` | 0 in final pass; 49 had been removed in the first successful DB pass |
| `sync_tombstones` | 0 |
| `sync_tombstone_reviews` | 0 |
| `sync_conflicts` | 0 |

No folders, labels, tags, or categories were deleted.

## Before / After Counts

Before cleanup:

- chats: 41
- saved: 33
- saved with snapshot: 28
- snapshots: 29
- snapshot turns: 72

After final cleanup:

- chats: 20
- saved: 12
- saved with snapshot: 7
- snapshots: 8
- snapshot turns: 51

## Verification Queries

Final guarded verification:

- `node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --verify`
- status: `verified`
- candidate count: 0
- ambiguous count: 0

Direct table verification returned zero remaining rows for the candidate IDs:

| table | remaining |
| --- | ---: |
| `chats` | 0 |
| `snapshots` | 0 |
| `snapshot_turns` | 0 |
| `snapshot_turn_assets` | 0 |
| `folder_bindings` | 0 |
| `label_bindings` | 0 |
| `tag_bindings` | 0 |
| matching `saved_chat_archive_requests` | 0 |

Real saved chats remain, including:

- Oven Safety for Tray
- Healthy Oil Comparison
- Investment in AI Tools
- Telekom DayFlat Addon Meaning
- Half Squats and Acceleration
- Hair Conditioner Review
- Good bacteria sauerkraut?
- Rousseau on Islam

## Validation Results

Passed:

- `node --check tools/cleanup/cleanup-saved-chat-smoke-rows.mjs`
- `node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --dry-run`
- `node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --apply --backup`
- `node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --verify`
- `node tools/validation/studio/validate-saved-chats-desktop-render-v1.mjs`

Pending final repo hygiene checks before commit:

- `git diff --check`
- `git diff --cached --check`
- `git diff --cached --name-only`

## Boundaries Preserved

- No UI hiding fix.
- Saved archived chat rendering remains intact.
- No WebDAV/cloud/archive CAS transport changes.
- No `productSyncReady` flip.
- No `fullBundle.v3` mint.
- No sync metadata implementation changes.
- No appearance/ribbon/studio.html cache-bust dirty files touched.
- No archive package behavior code changed.
