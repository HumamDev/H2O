# Folder Sync — Phase F1: Source-of-Truth Reconciliation Diagnostic / Design

Date: 2026-07-01

## Status

DIAGNOSTIC / DESIGN ONLY. No folder sync change was implemented. No runtime behavior changed. No
product source was modified. No public/premium sync was enabled. No real remote WebDAV was
implemented. This slice locates the folder state sources and mutation paths, identifies the
render-vs-canonical divergence, defines a reconciliation model, and recommends the next F2 slice.

## Context

- Folder sync readiness/design audit committed: `3f92386` (verdict:
  `not-ready-reopened-source-of-truth-split`; first recommended slice:
  `folder-canonical-source-of-truth-reconciliation-diagnostic`).
- Product sync remains NOT READY. Public/premium sync remains blocked. Real remote WebDAV should wait
  until local folder readiness improves. The closed Labels / Tags / Categories metadata lane remains
  untouched (applied allowlist still exactly four: `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind`).

## 1. Folder State Sources (located)

- SQLite `folders` (+ bindings/tombstone tables) — Desktop canonical storage, in
  `src-surfaces-base/studio/store/folders.tauri.js`.
- `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`) — a chrome.storage RENDER MIRROR holding
  `{ folders: [...], items: { folderId: [...] } }`, read/written in `folders.tauri.js`.
- folder tombstones — the tombstone store (`getActiveFolderTombstone`, `folderTombstoneRecordId`) +
  recently-deleted (`listRecentlyDeletedFolders`).
- folder bindings — SQLite bindings + canonical binding APIs
  (`listCanonicalChatFolderBindings`, `moveCanonicalChatFolderBinding`); mirror `items{}` projection.
- recently deleted folders — `listRecentlyDeletedFolders` + `desktopCanonicalRecentlyDeleted` import.
- Desktop export/import surfaces — `folder-sync.tauri.js` (`importChromeLatestBundle`, latest.json
  export of folder state + receipts).
- Chrome mirror/import/export surfaces — `folder-import.mv3.js` (imports `desktopVisibleFolderSet`,
  `desktopCanonicalChatFolderBindings`, `desktopCanonicalRecentlyDeleted`,
  `desktopPurgedFolderSuppression`, folder metadata).

## 2. Folder Mutation Paths (located)

- Desktop `folders.tauri.js`: canonical SQLite writes via `create` / `upsert` / `patch`
  (names/colors/`sortOrder`), `bindChat` / `unbindChat` / `moveCanonicalChatFolderBinding`,
  `softDeleteEmptyFolder` (soft, chats-preserved), `restoreTombstonedFolder`, purge-of-tombstones.
- Desktop render-mirror writes (SEPARATE from SQLite): `removeFolderFromStateMirror` and
  `restoreFolderToStateMirror` mutate `FOLDER_STATE_DATA_KEY` directly and stamp
  `syncPropagation: 'deferred'` (`phase4aLastLocalSoftDelete` / `phase4aLastLocalRestore`).
- Chrome native-owner folder actions: Chrome mutates folders through the native ChatGPT folder owner,
  not an H2O request loop; H2O reconciles those mutations into Desktop via request loops.
- H2O folder request loops (Chrome → Desktop → Chrome): `h2o.studio.folder-delete-request.v1`,
  `h2o.studio.folder-restore-request.v1`, `h2o.studio.chat-folder-binding-request.v1` (+ receipts).

## 3. Render-vs-Canonical Divergence (identified)

The divergence is real and concrete: the render mirror (`FOLDER_STATE_DATA_KEY`) is written by
DEDICATED code paths (`removeFolderFromStateMirror`, `restoreFolderToStateMirror`, and the
create/patch mirror projections) that are SEPARATE from the SQLite `folders` writes. Those mirror
writes carry `syncPropagation: 'deferred'`, so the mirror is updated locally while SQLite↔mirror
reconciliation and Desktop→Chrome propagation are deferred. Divergence can therefore occur when:

- a SQLite write succeeds but the mirror projection is not updated (or vice versa);
- a mirror row claims `source: 'desktop-sqlite'` / `stateSource: 'stored-folder-state'` but no longer
  matches the canonical SQLite row (name/color/`sortOrder`/tombstone/binding drift);
- Chrome's native-owner mutation changes folder state that Desktop SQLite has not yet absorbed.

This is the reopened root cause: the mirror is treated as an independent write target rather than a
strictly derived projection of canonical SQLite.

## 4. Authoritative State Per Field (decision)

| Field | Authoritative owner | Mirror role |
| --- | --- | --- |
| folder name | SQLite `folders` (Desktop canonical) | derived projection |
| folder color | SQLite `folders` (Desktop canonical) | derived projection |
| folder sort/order | SQLite `sort_order` / `sortOrder` (Desktop canonical) | derived projection |
| deleted/tombstoned state | SQLite + tombstone store (Desktop canonical) | reflected via `removeFolderFromStateMirror` |
| chat-folder bindings | SQLite bindings / canonical binding APIs (Desktop canonical) | mirror `items{}` projection |
| restore/rebind | SQLite restore + recovery snapshot (Desktop canonical) | reflected via `restoreFolderToStateMirror` |

Desktop SQLite is canonical for every folder field. Chrome is NOT canonical for any of them.

## 5. Reconciliation Model (design)

- Preferred canonical owner: SQLite `folders` (+ bindings/tombstone tables) on Desktop. The mirror is
  NEVER an independent source.
- Allowed mirror behavior: the mirror may be written ONLY as a derived write-through projection AFTER a
  successful SQLite write; reads for render may use the mirror but it must stay consistent with SQLite
  (and be rebuilt from SQLite on divergence). No mirror-only mutations.
- Import/export direction: Desktop EXPORTS folder state from canonical SQLite (not from the mirror);
  Chrome IMPORTS read-only. Chrome native-owner mutations are reconciled INTO Desktop SQLite via the
  existing H2O request loops; Chrome does not become canonical.
- Conflict handling: on SQLite-vs-mirror divergence, SQLite wins and the mirror is rebuilt from SQLite;
  on Chrome-native vs Desktop divergence, Desktop canonical wins and Chrome re-imports.
- Repair/resurrection behavior: keep the existing tombstone recovery snapshot + purged-folder
  resurrection repair as the recoverable record; reconciliation must keep mirror restore strictly
  mirroring SQLite restore.

## 6. What Must Be Proven Before Implementation

- no hard delete (the store already enforces `hardDeleteBlocked` / `hardDeletedFolderRowCount: 0`).
- folder delete preserves chats (soft-delete snapshots bindings; chats are never deleted).
- tombstone/restore remains recoverable (recovery snapshot + restore reflect canonical state).
- Chrome does not become canonical without explicit later design approval.
- Desktop remains canonical by default.
- public/premium remains blocked.

## 7. Recommended Next Phase

Recommend **F2 = a validator-only drift detector** (diagnostic-only; no source change, no write-path
change, no mutation): given a canonical SQLite folder snapshot and the `FOLDER_STATE_DATA_KEY` mirror,
deterministically detect divergence — folders present in one but not the other; name/color/`sortOrder`/
tombstone/binding mismatches — and report it as a redacted diagnostic. Making the divergence observable
and gateable is the safest next step before any reconciliation write-path change (the subsequent
F2/F3 design-hardening step would make the mirror a strict write-through projection of SQLite). Do not
implement a reconciliation write path, real remote WebDAV, or public/premium sync now.

## Verdicts

- Folder sync readiness: NOT READY (the source-of-truth split is identified but not yet reconciled).
- Real remote WebDAV: SHOULD WAIT until local folder readiness improves.
- Public/premium sync: REMAINS BLOCKED until folder local readiness AND remote transport readiness pass.
- Product metadata sync: NOT READY globally; `productSyncReady` stays `false`.
- Desktop remains canonical authority; Chrome stays non-canonical; no hard delete; folder delete
  preserves chats. The closed Labels / Tags / Categories metadata lane remains untouched.
