# Folder Sync Readiness / Design Audit

Date: 2026-06-29

## Status

DESIGN / READINESS AUDIT ONLY. No folder sync was implemented. No real remote WebDAV was implemented.
No public/premium sync was enabled. No runtime behavior changed. No source modules were modified. This
is a separate lane from the Labels / Tags / Categories metadata sync lane (closed for maintainer review
at Phase 40, commit `7a3a226`). It audits the existing folder sync substrate and recommends the safe
next step.

## Lane Separation

Folder sync is a SEPARATE FUTURE LANE from the Labels / Tags / Categories metadata lane. The metadata
lane's four applied request types (`chat-category-assign`, `chat-category-clear`, `chat-label-bind`,
`chat-tag-bind`) and its closed local/dev-only WebDAV proof ladder are out of scope here and are not
changed by this audit. Label/tag/category expansion remains deferred and is not worked on in this lane.

## Hard Boundaries (carried into any later folder sync work)

- No hard delete. The folders store already blocks it (`hardDeleteBlocked: true`,
  `hardDeletedFolderRowCount: 0`).
- Folder delete must be soft / tombstone / recoverable.
- Chats must not be deleted by folder delete.
- Chrome must not become canonical authority unless a later design explicitly approves it.
- Desktop remains canonical authority by default.
- WebDAV / cloud / relay remains transport only, not authority.
- Product sync remains NOT READY.
- Public/premium sync remains blocked until folder + remote transport readiness pass.

## 1. Existing Folder Data Model and Store APIs

`src-surfaces-base/studio/store/folders.tauri.js` is a mature SQLite-backed folders store
(`folders` + bindings tables). Public API (`H2O.Studio.store.folders`):

- CRUD / metadata: `create`, `upsert`, `patch`, `get`, `getAll`, `list`, `count` — names, colors,
  rename, and ordering (`sortOrder` / `sort_order` column) all flow through `create`/`upsert`/`patch`.
- bindings: `bindChat`, `unbindChat`, `listChats`, `listForChat`, `listCanonicalChatFolderBindings`,
  `getCanonicalChatFolderBindingForChat`, `moveCanonicalChatFolderBinding`.
- soft delete: `softDeleteEmptyFolder` (aliased `softDeleteFolder` / `remove` / `delete`). It is
  chats-aware: it distinguishes `desktop-local-empty-folder-soft-delete` vs
  `desktop-local-folder-with-chats-soft-delete`, captures a binding recovery snapshot, and never
  hard-deletes chats.
- restore: `restoreTombstonedFolder` (aliased `restoreFolder`).
- tombstones / recovery: `listRecentlyDeletedFolders`, `diagnosePhase4aTombstones`,
  `diagnosePurgedFolderResurrectionCandidates`, `previewPurgedFolderResurrectionRepair`,
  `repairPurgedFolderResurrections`, `previewRecentlyDeletedFolderPurge`, `purgeRecentlyDeletedFolders`
  (purges TOMBSTONES only — never chats), `clearRecentlyDeletedRestoredHistory`.

## 2. Current Folder Sync / Tombstone / Recovery Substrate

Three Chrome → Desktop → Chrome folder request/receipt loops already exist in
`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- `h2o.studio.folder-delete-request.v1` (+ folder-delete-receipt) — soft-delete/tombstone loop.
- `h2o.studio.folder-restore-request.v1` (+ folder-restore-receipt) — restore loop.
- `h2o.studio.chat-folder-binding-request.v1` (+ chat-folder-binding-receipt) — binding loop.

Desktop → Chrome read-only propagation (Chrome imports via `folder-import.mv3.js`):

- folder metadata (names/colors) propagation.
- `desktopCanonicalChatFolderBindings`, `desktopVisibleFolderSet`, `desktopCanonicalRecentlyDeleted`,
  `desktopPurgedFolderSuppression`.

Known reopened risk (the root cause this audit must flag): the folder-sync RC lane was REOPENED on
2026-06-22 (`release-evidence/2026-06-22/sync-architecture-reopen-audit.md`) after live testing found
folder-mutation + auto-sync parity gaps. Root cause = a split source-of-truth on the folder surface:
Desktop writes the canonical SQLite `folders` table BUT also renders/exports from a chrome.storage
render-mirror `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`), while Chrome mutates folders
via the native ChatGPT owner rather than an H2O request loop. The SQLite-vs-render-mirror split and the
Chrome-native-owner-vs-H2O split are not fully reconciled.

## 3. Implemented vs Missing (the 12 audited surfaces)

| # | Surface | Store | Sync | Status |
| --- | --- | --- | --- | --- |
| 1 | Folder names | `create`/`patch` | Desktop→Chrome propagation; no Chrome→Desktop request loop | PARTIAL (propagation only; source-of-truth split) |
| 2 | Folder colors | `create`/`patch` | Desktop→Chrome propagation | PARTIAL (same as names) |
| 3 | Folder rename | `patch` | Desktop→Chrome propagation; no Chrome-originated rename request | PARTIAL (Desktop-canonical; no Chrome request loop) |
| 4 | Folder ordering / sidebar position | `sortOrder` / `sort_order` field exists | parity unconfirmed | PARTIAL (field present; sync parity audit-flagged) |
| 5 | Folder chat bindings | `bindChat`/`unbindChat`/`move`/canonical bindings | `chat-folder-binding-request.v1` loop | IMPLEMENTED (loop exists; needs parity hardening) |
| 6 | Folder delete | `softDeleteEmptyFolder` (soft, chats-preserved) | `folder-delete-request.v1` loop | IMPLEMENTED (soft-delete loop) |
| 7 | Folder restore | `restoreTombstonedFolder` | `folder-restore-request.v1` loop | IMPLEMENTED |
| 8 | Folder tombstones | recently-deleted / purge(of tombstones) / resurrection repair | `desktopCanonicalRecentlyDeleted` / `desktopPurgedFolderSuppression` import | IMPLEMENTED |
| 9 | Folder conflict behavior | n/a | reopened gaps | AT-RISK (reopen audit found gaps) |
| 10 | Desktop↔Chrome folder parity | n/a | propagation + receipts exist | PARTIAL / REOPENED (parity gaps) |
| 11 | Folder parity with future remote WebDAV | n/a | none | MISSING / DEFERRED (behind the metadata-lane remote design gate) |
| 12 | Folder data must never hard-delete chats | `hardDeleteBlocked: true`, soft-delete preserves chats | n/a | IMPLEMENTED / SAFE (invariant must remain) |

Summary: most folder surfaces have substrate (store + delete/restore/binding loops + Desktop→Chrome
propagation + tombstone/recovery + a no-hard-delete invariant). The GAPS are the reopened
source-of-truth split (#1–4, #9, #10), folder-ordering sync parity (#4), and remote WebDAV folder
parity (#11, deferred).

## 4. Safe Folder Sync Unit — Decision

The safe unit is NOT a new mutation surface. It is a STAGED SEQUENCE that resolves the reopened root
cause first:

- Stage 0 (recommended first slice): folder canonical source-of-truth reconciliation
  diagnostic/design — establish ONE canonical read/write path for folder names/colors/`sortOrder`
  (resolve the SQLite-vs-`FOLDER_STATE_DATA_KEY` render-mirror split and the Chrome-native-owner-vs-H2O
  split), with a parity diagnostic. Diagnostic/design only; no mutation.
- Stage 1: folder names/colors/order parity hardening (Desktop→Chrome, read-only on Chrome) — close
  the propagation gaps the reopen audit found.
- Stage 2: folder bindings parity hardening (the `chat-folder-binding` loop exists; prove parity).
- Stage 3: folder delete/restore parity hardening (the soft-delete/tombstone loops exist; prove parity;
  never hard-delete chats).
- Stage 4 (only if a later design explicitly approves Chrome authority): a Chrome-originated
  rename/color/create request loop. Until then, names/colors/rename/create stay Desktop-canonical.
- Stage 5 (final, separate, deferred): folder parity with real remote WebDAV transport, behind the
  metadata-lane remote design gate.

Rationale: names/colors-only is the smallest surface, but it is gated by the source-of-truth split, so
the first slice must be the reconciliation diagnostic — not a new write path — to avoid building on the
reopened root cause.

## 5. Required Validators Before Implementation

- a folder canonical source-of-truth reconciliation diagnostic validator (proves one canonical path;
  detects SQLite-vs-render-mirror divergence).
- a folder names/colors/order parity validator (Desktop→Chrome, read-only on Chrome).
- folder binding / delete / restore parity validators (some substrate exists via the chat-folder-binding
  and folder-delete validators; extend for parity).
- a no-hard-delete + chats-preserved guard validator (assert `hardDeleteBlocked`, soft-delete preserves
  chats and snapshots bindings).
- a Desktop-canonical / Chrome-read-only authority guard validator (Chrome is not canonical).

## 6. Required Live Proofs Before Public/Premium Sync

- Desktop↔Chrome folder parity live proof over local sync-folder JSON (names/colors/order/bindings/
  delete/restore), including the reconciliation-no-regression case.
- a soft-delete/restore live proof proving no chat is ever hard-deleted.
- (later, separate) a real remote WebDAV folder parity live proof, AFTER the metadata-lane remote
  design gate and a folder remote design gate both pass.

Public/premium sync remains BLOCKED until BOTH folder sync local readiness AND remote transport
readiness pass.

## 7. Recommendation

Recommend the first slice = **folder canonical source-of-truth reconciliation diagnostic/design**
(diagnostic/design only; no mutation, no new write path, no transport). Do NOT start a new folder
mutation surface, real remote WebDAV, or public/premium sync now.

- Real remote WebDAV SHOULD WAIT: folder sync must reach local readiness (reconcile the split + harden
  the existing loops) first, and real remote WebDAV is a separate deferred lane behind the metadata
  lane's remote design gate.
- Public/premium sync REMAINS BLOCKED until folder sync local readiness AND remote transport readiness
  both pass.

## Folder Sync Readiness Verdict

NOT READY. A mature folder substrate exists (store + three sync request/receipt loops +
Desktop→Chrome propagation + tombstone/recovery + a no-hard-delete invariant), but the lane is REOPENED
over an unresolved source-of-truth split (SQLite canonical vs `FOLDER_STATE_DATA_KEY` render-mirror;
Chrome native-owner vs H2O) that causes folder-mutation/parity gaps. No new folder sync surface should
be built until that split is reconciled. Desktop remains canonical authority; Chrome stays
non-canonical; no hard delete; soft-delete preserves chats; product sync stays NOT READY; public/premium
stays blocked.
