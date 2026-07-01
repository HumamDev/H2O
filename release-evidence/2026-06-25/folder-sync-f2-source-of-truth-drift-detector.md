# Folder Sync - Phase F2: Source-of-Truth Drift Detector

Date: 2026-07-01

## Status

VALIDATOR / DIAGNOSTIC ONLY. No product runtime source was changed. No folder sync write path was
implemented. No reconciliation write was added. The `FOLDER_STATE_DATA_KEY` mirror was not made
write-through in this slice. No real remote WebDAV was implemented. No public/premium sync was
enabled. The closed Labels / Tags / Categories metadata lane remains untouched.

## Context

- Phase F1 source-of-truth reconciliation diagnostic committed: `4039d7b`.
- Phase F1 verdict: PASS diagnostic/design only.
- Folder sync readiness remains NOT READY.
- Canonical owner: Desktop SQLite `folders` plus folder binding/tombstone state.
- Render mirror: `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`).
- Known divergence point: `removeFolderFromStateMirror` and `restoreFolderToStateMirror` mutate the
  render mirror separately from canonical SQLite writes and stamp `syncPropagation: 'deferred'`.

## F2 Scope

F2 adds a deterministic validator-only drift detector model for comparing a canonical SQLite folder
snapshot with a `FOLDER_STATE_DATA_KEY` render-mirror snapshot. The validator uses synthetic fixtures
only. It does not open a live SQLite database. It does not write to chrome.storage. It does not repair
state. It does not change Desktop or Chrome runtime behavior.

## Drift Classes Detected

The F2 detector proves the following drift classes are observable and reportable:

| Drift class | Meaning | Diagnostic privacy |
| --- | --- | --- |
| `missing-mirror-folder` | SQLite has a canonical folder missing from the render mirror | folder id hash only |
| `extra-mirror-folder` | mirror has a folder absent from SQLite canonical state | folder id hash only |
| `field-mismatch:name` | folder name differs between SQLite and mirror | value hashes only; no raw folder name |
| `field-mismatch:color` | folder color differs between SQLite and mirror | value hashes only |
| `field-mismatch:sortOrder` | SQLite `sort_order` / `sortOrder` differs from mirror `sortOrder` | value hashes only |
| `tombstone-status-mismatch` | deleted/tombstoned/recently-deleted state differs | status hashes only |
| `binding-mismatch` | chat-folder binding set differs between SQLite and mirror `items{}` | binding hash only |
| `desktop-sqlite-source-diverged` | mirror row claims `source: 'desktop-sqlite'` while diverging | folder id hash only |
| `stale-deferred-propagation` | mirror row still carries `syncPropagation: 'deferred'` and is not reconciled | folder id hash only |

## Redaction Rules

Diagnostics are hash-only:

- no raw folder names;
- no raw chat titles or chat content;
- no raw user/account data;
- no raw chat-folder binding identifiers in emitted diagnostics;
- folder and binding identity is represented by deterministic SHA-256 prefixes.

The validator intentionally uses synthetic raw folder names and synthetic chat ids internally, then
asserts those raw fixture strings do not appear in emitted diagnostics.

## Source Anchors

The validator grounds F2 against real source anchors:

- `FOLDER_STATE_DATA_KEY` in `src-surfaces-base/studio/store/folders.tauri.js`;
- literal mirror key `h2o:prm:cgx:fldrs:state:data:v1`;
- `removeFolderFromStateMirror`;
- `restoreFolderToStateMirror`;
- `syncPropagation: 'deferred'`;
- SQLite canonical markers such as `folders`, `sort_order`, `softDeleteEmptyFolder`,
  `restoreTombstonedFolder`, `hardDeleteBlocked`, and `noChatDelete: true`;
- folder request loop schemas in `src-surfaces-base/studio/sync/folder-sync.tauri.js`:
  `h2o.studio.folder-delete-request.v1`, `h2o.studio.folder-restore-request.v1`, and
  `h2o.studio.chat-folder-binding-request.v1`.

## Boundaries Preserved

- Desktop SQLite `folders` remains the canonical folder source.
- `FOLDER_STATE_DATA_KEY` remains a render mirror, not an independent canonical source.
- Chrome remains non-canonical / native-owner mutation path until a later explicit reconciliation
  design changes that.
- No hard delete behavior is added.
- Folder delete remains soft/tombstone/recoverable.
- Folder delete preserves chats.
- Public/premium sync remains blocked.
- Real remote WebDAV remains deferred until local folder readiness improves.
- Mobile app / multi-device extension sync remains a future cross-surface requirement and is not
  implemented here.
- Product sync remains globally NOT READY.

## Closed Metadata Lane Check

The Labels / Tags / Categories applied request allowlist remains exactly:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

No metadata request type was added or removed by F2.

## Validator

Path:

- `tools/validation/sync/validate-folder-sync-f2-source-of-truth-drift-detector.mjs`

The validator proves:

- the F2 evidence exists and references F1 commit `4039d7b`;
- F2 is validator-only / diagnostic-only;
- SQLite `folders` is named as canonical;
- `FOLDER_STATE_DATA_KEY` is named as render mirror;
- all listed drift classes are detected from synthetic canonical/mirror fixtures;
- emitted diagnostics are redacted/hash-only;
- stale `syncPropagation: 'deferred'` markers are detected;
- folder sync readiness remains NOT READY;
- public/premium sync remains blocked;
- real remote WebDAV remains deferred;
- no hard delete and no chat delete boundaries remain present in source;
- the closed metadata applied allowlist remains exactly the four live-proven types.

## Verdict

Phase F2 verdict: PASS for validator-only drift detection.

Folder sync readiness verdict: NOT READY. The source-of-truth split is now detectable, but not yet
repaired. The mirror is still not guaranteed to be a strict derived/write-through projection of
SQLite. Public/premium sync and real remote WebDAV remain blocked until local folder readiness passes.

Recommended F3 slice: add a diagnostic-only drift report surface or runtime-safe probe that can read
live Desktop canonical folder state and the render mirror read-only, emit the F2 redacted drift model,
and prove it without reconciliation writes.
