# Phase 4 Design — Safe Folder Delete / Tombstone Lifecycle

Date: 2026-06-22
Status: **DESIGN ONLY — no code changed.** Phase 4 of the folder-sync program (Phases 1–3 closed; Folder Sync Health shipped in `fefc0de`/`72d528a`). Governed by [ADR-0007](../../docs/decisions/ADR-0007-studio-canonical-organization-state-and-transport-adapters.md) (Studio owns organization state) and [ADR-0008](../../docs/decisions/ADR-0008-chrome-companion-and-desktop-workspace-contract.md) (Chrome companion / Desktop authority).
Scope guard: folder delete/tombstone only. No WebDAV, no release packaging/signing, no Billing/Identity/onboarding, no s-file moves, no destructive hard delete in the first implementation.

---

## Existing substrate (reuse, don't reinvent)

Most of the tombstone machinery already exists **inert** — Phase 4 is wiring + policy, per ADR-0007's "selectively reuse F10.8 after core lifecycle is stable."

- **Desktop tombstone store:** `store/tombstones.tauri.js` (`H2O.Studio.store.tombstones`, schema `h2o.studio.tombstone.v1`), backing the **`sync_tombstones` SQLite table — Migration v6** in `apps/studio/desktop/src-tauri/src/lib.rs`. Deliberately inert: existing delete/remove/unbind paths do **not** call it yet; tombstones are written only by direct API calls to `createTombstone()`.
- **`sync_tombstones` columns (already designed):** `tombstone_id`, `schema`, `record_kind` (`'folder'`), `record_id` (the `folderId`), `deleted_at`, `deleted_by_sync_peer_id`, `delete_reason`, `prior_digest`, `prior_updated_at`, `meta_json` (carries `recoverySnapshot`), `created_at`, `updated_at`. Audit trail in `sync_maintenance_log`.
- **Chrome review store:** `store/tombstone-reviews.mv3.js` (IndexedDB `h2o.studio.tombstone-reviews.mv3`) — *"never applies remote tombstones, deletes Library records, or mutates entity stores"*; F5F.4d adds **gated** bundle tombstone ingestion. Desktop counterpart: `store/tombstone-reviews.tauri.js`. **This is exactly the Chrome-requests / Desktop-applies asymmetry ADR-0008 wants — already built into the store split.**
- **Delete pipeline (inert):** `sync/delete-apply-event.tauri.js`, `delete-reviewed-apply.tauri.js`, `delete-convergence-preflight.tauri.js` (has `tombstoneCapable`, `f5-tombstone-path-unavailable`), plus `sync/snapshot/snapshot-tombstone-*` and `sync/kernel/tombstone-reader.tauri.js`.
- **Delete UI (today):** `S0Z1g` `requestCanonicalFolderDeletePreview/Apply` — typed confirmation `DELETE EMPTY FOLDER`, **empty-only** (`delete-non-empty-folder-blocked`), currently **mv3-gated** (Desktop sidebar delete is effectively unavailable).
- **Protected sets (today):** `PROTECTED_CANONICAL_FOLDER_NAME_KEYS = {study, case, dev, code, tech, english}`; `RESERVED_FOLDER_METADATA_NAME_KEYS = {all, archive, archived, link(s), linked, recent(s), saved, unfiled}`; `isDesktopRenameSafeFolder`/`isDesktopColorSafeFolder`; blocker `protected-folder`; `unfiled` / `FOLDER_FILTER_NONE` special-cased.
- **Sync Health (today):** `H2O.Studio.sync.folder.health.diagnose()` → `h2o.studio.sync.folder-health.v1`, with `deferred.deleteTombstone: "deferred"` ready to flip into a real section.

---

## A. Executive Verdict

- **Recommended delete model: soft tombstone with a recovery window — never hard delete in Phase 4.** A folder delete writes a `sync_tombstones` row, hides the folder from the canonical display, and **unbinds its chats to Unfiled (chats are never destroyed)**. The folder + its bindings are recoverable from `meta_json.recoverySnapshot` for the retention window. Hard purge is deferred to Phase 6 (operator/Desktop only).
- **Chrome cannot delete directly — it requests.** Chrome writes a tombstone *request* into `tombstone-reviews.mv3` (IndexedDB) and optimistically hides the row; it never applies a tombstone or deletes a Library record. **Desktop is the apply authority** (matches the existing store split and ADR-0008).
- **Should deletes auto-propagate yet? Partially — and only the safe, reversible part.** Tombstone *metadata* propagates so the peer **hides** the folder (reversible, no data loss). The *authoritative soft-apply* runs on Desktop. **Hard purge never auto-propagates.** Start empty-only; enable non-empty-with-unfile in a 4.x step once the soft path is proven.

Net: **soft, recoverable, Desktop-authoritative, Chrome-request-only, no destructive auto-delete.**

---

## B. Tombstone Lifecycle

### States
| State | Meaning | Set by |
|---|---|---|
| `requested` | Chrome (or queued Desktop) asked to delete; not yet applied | Chrome request / Desktop queue |
| `active` | Soft-deleted: folder hidden, chats unfiled, fully recoverable | Desktop apply |
| `restored` | Undo: folder + bindings recovered from snapshot; tombstone closed | Desktop/Chrome restore |
| `conflicted` | Delete vs a newer concurrent edit; awaiting approval | Conflict classifier |
| `purgeable` | Retention elapsed; eligible for hard purge (Phase 6) | Retention sweep (later) |
| `purged` | Hard-removed (Phase 6, out of Phase 4 scope) | Operator purge |

### Schema (reuse `sync_tombstones`; additive only)
Reuse all existing columns. Carry lifecycle in `meta_json` to avoid a forced migration (or add additive Migration v7 with `state` + `retention_until` if a column is preferred):
- `record_kind: 'folder'`, `record_id: <folderId>` — **identity is `folderId`, never name.**
- `deleted_at`, `deleted_by_sync_peer_id`, `delete_reason: 'folder-soft-delete'`.
- `prior_digest` / `prior_updated_at` — staleness/conflict guards (reuse existing hashing).
- `meta_json.state`, `meta_json.retention_until`, `meta_json.restore_token`.
- `meta_json.recoverySnapshot = { folderRow:{folderId,name,normalizedName,color,iconColor,order,sourceKind}, bindings:[chatId…], memberCount }` — exact restore payload.

### Retention
- Default **30 days** `active → purgeable` (configurable; Desktop-owned). **No auto-purge in Phase 4** — purge is Phase 6, operator/Desktop only.

### Recovery
- Restore reads `recoverySnapshot`: re-create the folder row (same `folderId`), re-bind chats that are *still present and still Unfiled* (skip + warn for chats re-bound elsewhere during the window). Immediate "Undo" affordance after delete + a "Recently deleted" restore list within retention.

### Purge policy
- Deferred (Phase 6). Hard purge only when `purgeable`, no pending restore, no unresolved conflict, and Desktop-authority/operator-initiated. Never from Chrome; never auto-propagated.

---

## C. Folder Delete Behavior

| | Desktop (authority) | Chrome (companion) | Synced |
|---|---|---|---|
| Action | `actions.folders.remove` → `store.tombstones.createTombstone(...)` + unbind chats → Unfiled + hide from display. **Do not hard-delete the SQLite folders row in Phase 4** (or move to a graveyard flag). | Write a `tombstone-reviews.mv3` **request**; optimistically hide row with `deletion pending`; never applies. | Tombstone travels in the bundle (`export-bundle.tauri.js` already has tombstone hooks). |
| Empty vs non-empty | Phase 4a: empty-only (reuse `delete-non-empty-folder-blocked`). Phase 4b: non-empty allowed with typed confirmation showing `N chats → Unfiled`. | Same gating; request-only. | Receiver applies authoritative soft-tombstone (Desktop) or ingests-to-hide (Chrome, gated F5F.4d). |
| Confirmation | Reuse typed confirmation; for non-empty: `DELETE FOLDER · N chats move to Unfiled`. | Same copy; result is a *request*, surfaced as pending. | Restore propagates as `state: restored`. |
| Wire | Enable Desktop sidebar delete (today mv3-gated); schedule export via `autoExport.schedule('folder-metadata:delete')`. | `scheduleChromeToDesktopExport` carries the request. | Loop-safe/no-op-aware refresh (reuse Phase 3 smoothing). |

---

## D. Chat Binding Behavior

- **Chats in a deleted folder are unbound to Unfiled — never deleted.** Drop the `folder_bindings` row; the chat record is untouched. (Today `store.folders.remove` cascade-deletes binding rows; Phase 4 keeps the unbind but records the bindings in `recoverySnapshot` first.)
- **Unfiled fallback:** chats immediately appear under Unfiled (`FOLDER_FILTER_NONE`).
- **Restore:** re-create the folder (same `folderId`) and re-bind the snapshot's chats that are still Unfiled. A chat re-filed elsewhere during the window stays put (logged as `restore-binding-skipped`). **No chat is ever lost or duplicated.**

---

## E. Conflict Matrix

Identity is `folderId`. Delete is a **structural** op; safe-field edits (color) auto-resolve, structural collisions request approval. Reuse Phase 3's safe-field auto-merge + `conflict-approval-required`.

| Conflict | Resolution |
|---|---|
| **delete vs rename** | Compare `deleted_at` vs rename `updatedAt`. Delete newer → delete wins (folder gone). Rename newer → tombstone `conflicted` → review (`delete-conflict-approval-required`). Never silent — folder is recoverable. |
| **delete vs color** | Color is a safe field on a soon-gone folder → **delete supersedes color** (color discarded; recoverable via snapshot). Flag only if color strictly newer than delete by > guard window. |
| **delete vs create same name** | Different `folderId` = different entity → **no conflict**; new folder lives. Guard: a stale tombstone for the old id must not delete the new id (match on `record_id`, not normalizedName). |
| **delete vs binding change** | Binding added concurrently → that chat also unbinds to Unfiled on apply (added to snapshot). If binding strictly newer than delete → `conflicted` → review (user actively filing into it). |
| **simultaneous delete (both sides)** | Idempotent: both produce a tombstone for the same `record_id`; merge to one (LWW on `deleted_at`); no error. Restore from either side propagates `state: restored`. |

---

## F. Protected Folders (cannot be deleted)

Block with precise codes (never `folder-not-found`):
- **Unfiled** (`unfiled` / `FOLDER_FILTER_NONE`) — system bucket → `unfiled-not-deletable`.
- **Reserved system names** (`RESERVED_FOLDER_METADATA_NAME_KEYS`) → `reserved-folder-name`.
- **Protected canonical names** (`PROTECTED_CANONICAL_FOLDER_NAME_KEYS` = study/case/dev/code/tech/english) → `protected-canonical-folder`.
- **Local-only review rows** (`localReviewRows` / F5D review) → `local-review-folder-not-editable`.
- **Imported/native-only rows not Studio-owned** → Chrome may only *request*; Phase 4 treats deletion as a Studio-local tombstone (per ADR-0007 Studio owns org state), not a native ChatGPT delete.
- **Any row failing `isDesktop*SafeFolder`** (no id, unfiled, protected) → `folder-not-mutable`.

---

## G. Folder Sync Health Additions

Extend `h2o.studio.sync.folder-health.v1`: replace `deferred.deleteTombstone: "deferred"` with a real `tombstone` block.

```
tombstone: {
  pending,                 // requested, not yet applied
  active,                  // soft-deleted, recoverable
  restoreAvailable,        // restorable within retention
  purgeBlocked,            // purgeable but blocked (restore/conflict) — Phase 6
  conflictApprovalRequired // delete-conflict awaiting review
}
```
New status codes: `tombstone-pending`, `tombstone-applied`, `restore-available`, `purge-blocked`, `delete-conflict-approval-required`, `tombstone-ingest-gated` (Chrome).
Verdict mapping: any `pending`/`conflictApprovalRequired` → `warning`; clean → unchanged. Keep redacted (counts + hashes only, no folder names/ids).

---

## H. Implementation Phases

1. **Design / schema / evidence only** (this doc). Confirm `sync_tombstones` v1 covers the lifecycle; choose `meta_json` lifecycle vs additive Migration v7.
2. **Local Desktop tombstone (smallest first):** wire `actions.folders.remove` → `createTombstone` (+ `recoverySnapshot`) → hide from display → unbind chats to Unfiled → Restore affordance. **Empty-only**, no sync, no purge. Confirm-before-toast.
3. **Local Chrome tombstone/request:** Chrome delete → `tombstone-reviews.mv3` request; optimistic hide + reconcile on import; never applies.
4. **Sync tombstone metadata:** carry tombstones in the bundle; Desktop applies authoritative soft-tombstone; Chrome ingests (gated) to hide; restore propagation. Then enable non-empty-with-unfile.
5. **Restore / undo:** immediate undo + cross-surface "Recently deleted" restore; conflict approval surfacing.
6. **Purge / retention (later, Phase 6):** Desktop/operator hard purge after window; never auto, never from Chrome, never auto-propagated.

---

## I. Exact Files Likely Involved

- `store/tombstones.tauri.js` — activate `createTombstone`/`list`/`restore` (currently inert).
- `store/tombstone-reviews.mv3.js` (Chrome request) + `store/tombstone-reviews.tauri.js` (Desktop review).
- `store/folders.tauri.js` — `remove` becomes soft-tombstone (snapshot bindings before unbind) instead of hard cascade-delete.
- `S0F3b. 🎬 Folders Actions - Studio.js` — `remove` → tombstone path; unbind→Unfiled; schedule export.
- `S0F1m. 🎬 Library Organization Modals - Studio.js` — delete flow + confirmation copy.
- `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` — enable Desktop delete; non-empty confirmation; `pending`/`restored` row states; Restore affordance.
- `S0F1h. 🎬 Library Sync - Studio.js` — tombstone resolver, protected gating, conflict classification, propagation; reuse delete blockers.
- `S0F1b. 🎬 Library Workspace - Studio.js` — `FolderParity`/`diagnoseFolderParity` hides tombstoned `record_id`s from canonical display.
- `sync/folder-import.mv3.js` — gated tombstone ingest (hide), Chrome request export, health `tombstone` block.
- `sync/folder-sync.tauri.js` — Desktop apply, watcher import of tombstones, health `tombstone` block.
- `sync/auto-export.tauri.js` — schedule on delete/restore.
- `ingestion/export-bundle.tauri.js` — serialize tombstones into `h2o.studio.fullBundle.v2`.
- Selective reuse (do not expand): `sync/delete-apply-event.tauri.js`, `delete-reviewed-apply.tauri.js`, `delete-convergence-preflight.tauri.js`, `sync/kernel/tombstone-reader.tauri.js`.
- `apps/studio/desktop/src-tauri/src/lib.rs` — only if an additive Migration v7 (`state`,`retention_until`) is chosen over `meta_json`.

## J. Validators / Tests to Add

- New `tools/validation/sync/validate-folder-tombstone-lifecycle.mjs`:
  - Desktop delete → tombstone row created with `recoverySnapshot`; folder hidden from display; **chats moved to Unfiled and not deleted**.
  - Restore → folder re-appears (same `folderId`) and bindings re-attach; re-filed chats skipped+warned.
  - Protected cases blocked with correct codes (`unfiled-not-deletable`, `protected-canonical-folder`, `reserved-folder-name`, `local-review-folder-not-editable`), **never `folder-not-found`**.
  - Non-empty delete moves N chats to Unfiled with zero chat-row deletions.
  - Idempotent simultaneous delete (one tombstone per `record_id`).
  - Conflict cases (delete-vs-rename newer, delete-vs-binding newer) → `delete-conflict-approval-required`, not silent.
  - Sync Health exposes the `tombstone` block + new status codes; idle stays clean.
- Extend `validate-f19-desktop-chrome-propagation.mjs` / `…-chrome-desktop-propagation.mjs` for two-way tombstone hide + restore.
- Hard invariant assertion: **no `chats` row is deleted by any folder delete.**
- `node --check` on every touched s-file.

## K. Smallest Safe Codex Implementation Prompt (Phase 4 step 2 only)

> In `h2o-cp-source/src-surfaces-base/studio`, implement **Desktop-only, empty-folder soft delete via tombstone** — no Chrome, no sync propagation, no purge, no non-empty, no chat changes. When a Desktop user deletes an **empty** folder from the sidebar (reuse the existing `DELETE EMPTY FOLDER` confirmation and `delete-non-empty-folder-blocked` gate): (1) write a tombstone through the existing `H2O.Studio.store.tombstones.createTombstone` (schema `h2o.studio.tombstone.v1`, `record_kind:'folder'`, `record_id:<folderId>`, `delete_reason:'folder-soft-delete'`, `meta_json.recoverySnapshot = {folderRow, bindings:[], memberCount:0}`); (2) **hide the folder from `FolderParity` canonical display instead of hard-deleting the SQLite `folders` row**; (3) add a "Restore" affordance that recreates the folder from `recoverySnapshot`; (4) gate all protected folders (`unfiled`, `RESERVED_*`, `PROTECTED_CANONICAL_*`, local-review) with their precise blocker codes — never `folder-not-found`; (5) only toast "Folder deleted" after the fresh display model confirms the folder is gone (confirm-before-toast, matching Phases 1–2). Do not touch Chrome, sync export/import, native owner, purge, or bindings (empty only). Add `tools/validation/sync/validate-folder-tombstone-lifecycle.mjs` asserting: tombstone created with recoverySnapshot; folder hidden; Restore re-shows it; protected folders blocked with correct codes; and **no hard delete of the SQLite folders row occurs**. Run `node --check` on every edited file and the new validator.

---

## Final note

Phase 4 is lower-risk than it looks: the `sync_tombstones` table, the Desktop tombstone store, the Chrome request/review store, the audit log, and the protected-name sets all already exist — they are inert. The job is to **wire the safe, reversible subset** (soft delete + Unfiled fallback + restore), keep Chrome request-only, propagate only the reversible hide, and defer hard purge. Doing step 2 first (Desktop empty-folder soft delete) proves the recovery path end-to-end before any cross-surface or non-empty risk is introduced.
