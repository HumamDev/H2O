# Saved Chats Smoke Row Cleanup

Status: RUNTIME DATA CLEANUP BLOCKED - SOURCE IDENTIFIED

## Scope

This is runtime Desktop Studio data cleanup only. It does not revert or hide the Saved-page rendering fix from:

- `1aed1d76 fix(studio): render saved archived chats`

The cleanup target remains only archive/dev/smoke/debug saved-chat rows. Real user saved chats must remain visible.

## Active Runtime Database

Active SQLite database:

- `/Users/hobayda/Library/Application Support/org.h2o.studio.desktop/studio-v1.db`

The database has WAL files, so DB backups are made through SQLite backup operations rather than raw file copy.

## Backup Paths Created

SQLite DB backups created during safe attempts:

- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154512.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154530.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154606.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154812.db`
- `/private/tmp/h2o-studio-db-backups/studio-v1-before-smoke-cleanup-20260704-154859.db`

Package backup directory from the package-removal pass:

- `/private/tmp/h2o-studio-package-backups/packages-before-smoke-cleanup-20260704-154812`

## Dry-Run Candidate Table

The guarded dry-run finds 21 exact smoke/debug candidates and zero ambiguous rows:

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

All candidates match strict dev/smoke/debug ID prefixes and known smoke/debug titles. No real user titles are candidates.

## Rehydration Source Finding

DB-only cleanup succeeded, but the rows reappeared with fresh timestamps. The recreated rows have metadata such as:

- `importedFrom: "h2o.studio.fullBundle.v2"`
- `sourceType: "desktop-sqlite-export"`

The remaining source is not active `.h2ochat` package folders. The active package store now contains only:

- `69de12dc-b7dc-838c-a553-916422265e5a.h2ochat`
- `69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`
- `h5-import-smoke-fixture-7f956711.h2ochat`

The rows are present in active local sync bundle files under `$HOME/H2O Studio Sync/`, specifically `chatArchive.chats` in:

- `$HOME/H2O Studio Sync/latest.json`
- `$HOME/H2O Studio Sync/chrome-latest.json`
- `$HOME/H2O Studio Sync/devices/studio-desktop%3Atauri-desktop%3Asqlite%3A35bf956b-8b8d-45e6-904c-5b8c92df57f0/latest.json`
- `$HOME/H2O Studio Sync/devices/studio-desktop%3Atauri-desktop%3Asqlite%3A7d38016a-55c1-48b8-81de-162bf4586b9e/latest.json`
- `$HOME/H2O Studio Sync/devices/studio-desktop%3Atauri-desktop%3Asqlite%3Ae8460bb5-eb42-4a40-aa95-7fe9bd221b66/latest.json`

The contaminated bundle area is limited to `chatArchive.chats`; folder state, `chromeStorageLocal`, and `libraryKv` did not match the smoke chat IDs in the inspected active bundle.

## Blocker

The cleanup tool was updated to back up and scrub matching `chatArchive.chats` entries from active local sync bundle files before deleting SQLite rows. It also updates device `latest.sha256` sidecars when it rewrites a device `latest.json`.

The runtime apply is currently blocked because the active sync bundle files live outside the workspace sandbox:

- `/Users/hobayda/H2O Studio Sync/latest.json`
- related active bundle files under `/Users/hobayda/H2O Studio Sync/`

The attempted apply failed with:

```text
EPERM: operation not permitted, open '/Users/hobayda/H2O Studio Sync/latest.json'
```

The environment escalation request to write those files was rejected by the approval reviewer, so the final cleanup was not completed in this run.

## Current Counts

Current DB state before final cleanup:

- chats: 41
- saved: 33
- saved with snapshot: 28
- snapshots: 29
- snapshot turns: 72

Current target dependent counts:

| Table / category | Candidate rows |
| --- | ---: |
| `chats` | 21 |
| `snapshots` | 21 |
| `snapshot_turns` | 21 |
| `snapshot_turn_assets` | 0 |
| `folder_bindings` | 0 |
| `label_bindings` | 0 |
| `tag_bindings` | 0 |
| matching `saved_chat_archive_requests` | 0 |
| `sync_tombstones` | 0 |
| `sync_tombstone_reviews` | 0 |
| `sync_conflicts` | 0 |

## Manual Completion Command

With Desktop Studio stopped, run this from the repo root in an unrestricted Terminal:

```sh
node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --dry-run
node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --apply --backup
node tools/cleanup/cleanup-saved-chat-smoke-rows.mjs --verify
```

Expected final counts after successful apply:

- chats: 20
- saved: 12
- saved with snapshot: 7
- snapshots: 8
- snapshot turns: 51
- candidate count: 0

## Boundaries Preserved

- No UI hiding fix.
- Saved archived chat rendering remains intact.
- No WebDAV/cloud/archive CAS transport changes.
- No `productSyncReady` flip.
- No `fullBundle.v3` mint.
- No sync metadata implementation changes.
- No appearance/ribbon/studio.html cache-bust dirty files touched.
- No archive package behavior code changed.
