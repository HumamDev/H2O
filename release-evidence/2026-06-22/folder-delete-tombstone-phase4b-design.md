# Phase 4B Design — Soft-Delete a Folder That Has Chats (with safe Unfiled fallback + binding restore)

Date: 2026-06-22
Status: **DESIGN ONLY — no code changed, nothing staged/committed.** Phase 4B of the folder-sync delete lifecycle. Phase 4A (empty-folder soft delete + restore) is closed (`9487922`, `e051526`). Governed by [ADR-0007](../../docs/decisions/ADR-0007-studio-canonical-organization-state-transport-adapters.md) and [ADR-0008](../../docs/decisions/ADR-0008-chrome-companion-desktop-professional-workspace-contract.md).
Scope guard: Desktop-local folder-with-chats soft delete + restore only. No Chrome destructive apply, no tombstone sync, no hard purge, no WebDAV, no release packaging, no Billing/Identity/onboarding/unrelated UI. No chat row deleted. No s-file moves.

---

## What Phase 4A already gives us (verified in repo)

The 4B surface is narrow because 4A built almost all the scaffolding (`store/folders.tauri.js`):

- **Soft delete:** `softDeleteEmptyFolder(folderId)` → reads `bindingCount = countBindingRows(id)` (`folder_bindings`) and `knownRowCount = countKnownRowsForFolder(id)` (Library Index), and **hard-blocks with `folder-not-empty` if either > 0** (line ~1318). Builds `recoverySnapshot`, writes a `recordKind:'folder'` tombstone (`createTombstone`), and `removeFolderFromStateMirror(id)`. Public `remove`/`delete`/`actions.folders.delete` route here.
- **Recovery snapshot** schema `h2o.studio.folder-recovery-snapshot.v1`: `folder{ id,name,normalizedName,parentId,color,iconColor,icon,sortOrder,source,sourceKind,createdAt,updatedAt,meta }`, `counts{ bindingCount, knownRowCount }`, `restorePolicy{ localOnly, crossPlatformSync:'deferred', purgeBlocked:true }`. **No `bindings[]` array today.**
- **Restore:** `restoreTombstonedFolder(idOrTombstoneId)` → `folderPatchFromRecoverySnapshot` → `upsertCore(patch)` recreates the folder, `markRestored`, `restoreFolderToStateMirror`. **Does not re-attach any bindings.** Idempotent: already-restored + visible row → `ok:true` (`already-restored`).
- **Binding-tombstone helpers already exist but are unused by 4A** (because empty-only): `readFolderBindingsForRemoveSafely(folderId)` (`SELECT chat_id, assigned_at FROM folder_bindings WHERE folder_id=?`), `buildFolderBindingTombstone(folderId, chatId, opts)` (`recordKind:'folderBinding'`, `recordId:'folderBinding:<chatId>:<folderId>'`, reason `folder-delete-cascade`), `writeFolderRemoveTombstonesSafely(...)` (folder tombstone + per-binding cascade tombstones, gated by `F5D_FOLDER_REMOVE_TOMBSTONES`/`F5D_FOLDER_BINDING_TOMBSTONES`).
- **Safe binding-write path exists:** `bindChat`/`unbindChat` go through the **F15 delegation pipeline** (`delegateF15FolderBindingWrite`) with **F16.4 trigger protection** on `folder_bindings`. `folder_bindings` PK is `chat_id` (one-folder-per-chat), so "unbind to Unfiled" = drop the chat's binding row; "re-bind" = INSERT OR REPLACE.
- **Protected gating:** `folderPhase4aBlockers` already emits `protected-folder`/`system-folder`/`unfiled-folder`/`local-review-folder-not-editable`; `already-tombstoned` guard via `getActiveFolderTombstone`.
- **Sync Health:** `tombstoneLocalDelete` block already present (`activeTombstoneCount`, `restoreAvailableCount`, `purgeBlocked`, `hardDeleteBlocked`, `chatDeleteBlocked`, `chromeDeleteSync:'deferred'`, `tombstoneSync:'deferred'`).

**So 4B = relax the empty-only gate, snapshot bindings, unbind to Unfiled via the safe path, and re-bind eligible chats on restore.** No new store, no new table.

---

## A. Executive Verdict

- **Model:** Soft-delete the folder; **unbind its chats to Unfiled immediately** (drop the `folder_bindings` rows via the safe F15 path — never raw SQL, never delete a chat). Capture the removed bindings in `recoverySnapshot.bindings[]`. Restore recreates the folder and **re-binds only chats still Unfiled**; chats re-filed elsewhere are skipped with a warning. Identity is `folderId`, never name.
- **Desktop-only?** **Yes.** 4B is Desktop-local only. Auto-export continues to ignore soft-delete/restore events (4A invariant) — no propagation.
- **Chrome delete requests?** **Stay deferred** (a later step, after the local round-trip is proven). Chrome keeps a stale view until tombstone sync ships; it cannot apply destructive deletes.
- **Chats → Unfiled immediately?** **Yes** — the moment the folder is moved to Recently Deleted, its chats are Unfiled. No chat is deleted, hidden, or orphaned.
- **Smallest safe increment couples delete + restore-rebind.** Shipping unbind without restore-rebind would make restore lossy (soft-delete a 50-chat folder, restore, lose 50 bindings) — that is a data-integrity regression, so the two land together.

---

## B. Data Model

### `recoverySnapshot` additions (additive; keep schema `…v1`, no Migration v7)
Add a `bindings[]` array and richer counts to the existing snapshot:
```
recoverySnapshot: {
  schema: 'h2o.studio.folder-recovery-snapshot.v1',
  folder: { …unchanged… },
  counts: { bindingCount: N, knownRowCount: M },
  bindings: [ { chatId, assignedAt } … ],     // NEW — captured pre-unbind, ordered
  bindingCaptureOk: true,                      // NEW — false if pre-read failed (then block)
  restorePolicy: { localOnly: true, crossPlatformSync: 'deferred', purgeBlocked: true }
}
```
- `bindings[]` is the **authoritative restore source** (not the per-binding tombstones).
- `priorDigest` continues to hash the whole snapshot (now includes bindings) for staleness/idempotency.

### Binding tombstones — optional, audit-only in 4B
Reuse the existing `writeFolderRemoveTombstonesSafely` to write `recordKind:'folderBinding'` cascade tombstones (reason `folder-delete-cascade`) **for audit / future Chrome sync** — but restore reads `recoverySnapshot.bindings[]`, not these. Keep them behind the existing `F5D_*` flags; they are not required for the local round-trip and can stay off in 4B's first cut.

### Lifecycle state
Continue storing lifecycle in `meta_json` (`lifecycleState:'tombstoned'|'restored'`, `bindingCount:N`). **Defer Migration v7** (queryable `state`/`retention_until` columns) until the retention/purge sweep (Phase 6) actually needs indexed queries.

---

## C. Delete Behavior

| Aspect | Behavior |
|---|---|
| **Desktop** | New path (or relaxed `softDeleteEmptyFolder` → `softDeleteFolder`): read bindings via `readFolderBindingsForRemoveSafely(id)`; if `bindingCaptureOk===false` → block `binding-capture-failed` (never delete blind). Build snapshot with `bindings[]`. Unbind each chat via the **safe F15 `unbindChat`/delegation path** (respect F16.4 trigger protection). Create the folder tombstone (`bindingCount:N`). `removeFolderFromStateMirror`. |
| **Order of operations** | (1) capture bindings → (2) create tombstone with snapshot → (3) unbind chats → (4) remove from mirror → (5) notify. Tombstone-before-unbind so a mid-operation failure still has the recovery record. |
| **Empty + non-empty unified** | Empty stays valid (bindings=[]); non-empty now allowed. The `folder-not-empty` blocker is **removed** for the delete path (kept only where a caller explicitly requests empty-only). |
| **UI** | The Desktop `Move to Recently Deleted` menu becomes **enabled for folders with chats**, with a confirmation showing `N chats will move to Unfiled (no chats are deleted)`. |
| **Folder visibility** | Folder hidden from normal list/sidebar/counts (4A mechanism). |
| **Chat binding** | `folder_bindings` rows dropped → chats Unfiled. **No chat row touched.** |
| **Unfiled fallback** | Chats appear under Unfiled (`FOLDER_FILTER_NONE`) immediately; index/`knownRowCount` reconciles on refresh. |
| **Audit** | Folder tombstone (`recordKind:'folder'`) always; per-binding cascade tombstones optional (audit). `sync_maintenance_log` as today. |

## D. Restore Behavior

| Aspect | Behavior |
|---|---|
| **Restore folder** | Unchanged 4A path: recreate from `recoverySnapshot.folder` (same `folderId`), `markRestored`, restore mirror. |
| **Restore bindings** | For each `recoverySnapshot.bindings[]` entry, re-bind via the **safe path** only if the chat is currently **Unfiled** (no active binding). |
| **Skip/rebind policy** | Chat now bound to another folder → **skip** (do not steal it back). Chat no longer exists → skip. INSERT OR REPLACE makes re-bind idempotent. |
| **Warnings/reporting** | Return `restoredBindingCount`, `skippedBindingCount`, and `warnings[]` with codes `restore-binding-skipped-rebound`, `restore-binding-skipped-chat-missing`, and `restore-duplicate-name` (if a live folder now shares the normalizedName). |
| **Idempotency** | Re-running restore: folder upsert is a no-op; re-bind of already-bound (to this folder) chats is a no-op; already-restored tombstone short-circuits to `ok:true`. Safe to retry. |

## E. Conflict Matrix

All conflicts here are **local Desktop races / stale view** (no sync in 4B). Future cross-surface rules inherit from the Phase 4 design.

| Conflict | Resolution |
|---|---|
| **delete vs bind** | `bindChat` must reject binding into a folder with an active tombstone → blocker `folder-tombstoned` (the folder is gone). A bind that lands just before delete is captured by the pre-read or, if missed, the chat simply stays Unfiled (never lost). |
| **delete vs rename/color** | Mutating a tombstoned folder is rejected (`folder-tombstoned`); the folder is hidden. On restore it returns with the snapshot's pre-delete name/color. No silent loss (recoverable). |
| **restore vs chat moved elsewhere** | Skip that binding + warn `restore-binding-skipped-rebound`. The user's newer choice wins; never overwrite a current binding. |
| **restore vs folder name reused** | Identity is `folderId`, so the restored folder and any new same-named folder **coexist**; emit `restore-duplicate-name` warning, do not merge or block. |
| **simultaneous delete** | `already-tombstoned` guard makes the second delete a no-op success; one tombstone per `record_id`. |
| **stale Chrome view** | Expected in 4B — Chrome still shows the folder and cannot delete it (deferred). When tombstone sync ships, Chrome ingests-to-hide. Auto-export ignores 4B tombstone events (4A invariant), so nothing propagates prematurely. |

## F. Sync Health Additions

Extend the existing `tombstoneLocalDelete` block (no new top-level schema):
- `activeTombstoneCount` (existing)
- `affectedChatCount` — sum of `recoverySnapshot.counts.bindingCount` across active folder tombstones
- `restoreAvailableCount` (existing)
- `lastRestoreRestoredBindingCount`, `lastRestoreSkippedBindingCount`, `lastRestoreWarningCount` — from the most recent restore
- `purgeBlocked: true`, `hardDeleteBlocked: true`, `chatDeleteBlocked: true` (existing)
- `chromeDeleteSync: 'deferred'`, `tombstoneSync: 'deferred'` (existing)
Keep redacted (counts only, no chat ids / folder names). Verdict unaffected when idle.

## G. UI/UX Rules

- **Action label:** keep `Move to Recently Deleted` (no "Delete"/"Remove"/"Trash" wording for the destructive-sounding path).
- **Folder-with-chats confirmation:** `Move "<Folder>" to Recently Deleted? Its N chats move to Unfiled. No chats are deleted. You can restore this folder later.`
- **Restore feedback:** `Restored "<Folder>" · re-attached X chats` and, when relevant, `· Y chats kept their newer folder` (maps to skipped-rebound).
- **No scary wording:** never "permanently delete", "destroy", or "this cannot be undone" in 4B (everything is reversible within retention).
- **Explicit safety line:** the confirmation must literally say **"No chats are deleted."**
- **Confirm-before-toast:** only toast success after the fresh display model confirms the folder is gone (delete) / present (restore), per Phases 1–2.

## H. Implementation Phases (safest rollout)

1. **4B-1 — Desktop folder-with-chats soft delete + unbind to Unfiled**, snapshotting `bindings[]` (couples with 4B-2 below to stay non-lossy).
2. **4B-2 — Desktop restore folder + re-attach eligible bindings** (skip/warn for rebound/missing). *Ship 4B-1 and 4B-2 together — restore-rebind is a correctness requirement, not a follow-up.*
3. **4B-3 — Recently Deleted / restore list UI** (surface affected-chat counts + restore with warnings).
4. **4C — Chrome delete request/review** (request-only; Desktop applies). *Deferred.*
5. **4D — Tombstone metadata sync** (Desktop→Chrome hide; restore propagation). *Deferred.*
6. **Phase 6 — Retention/purge** (operator/Desktop, never auto, never from Chrome). *Deferred.*

## I. Exact Likely Files

- `src-surfaces-base/studio/store/folders.tauri.js` — relax/replace empty-only gate; capture `bindings[]` in `buildFolderRecoverySnapshot`; unbind via safe F15 path in soft delete; re-bind in `restoreTombstonedFolder`; bump `affectedChatCount`/restore counts in `diagnosePhase4aTombstones`.
- `S0F3b. 🎬 Folders Actions - Studio.js` — `remove`/`delete` accept non-empty; pass through restore counts/warnings.
- `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` — enable `Move to Recently Deleted` for folders with chats; non-empty confirmation copy; restore feedback with skipped/rebound counts.
- `sync/folder-sync.tauri.js` (+ `folder-import.mv3.js` only for the read-only health fields) — `tombstoneLocalDelete` additions (`affectedChatCount`, restore counts).
- `store/tombstones.tauri.js` — only if `list` needs an `affectedChatCount`/bindings projection helper (otherwise unchanged).
- `bindChat` guard for tombstoned folders (in `folders.tauri.js`).
- **No Rust/migration change** (stay on `meta_json`). **No Chrome store change** (`tombstone-reviews.mv3.js` untouched — Chrome deferred).

## J. Validators / Tests to Add (extend `validate-folder-delete-tombstone-phase4a.mjs` or new `…-phase4b.mjs`)

- **No chat row deleted** when a non-empty folder is soft-deleted (hard invariant).
- **Binding snapshot captured**: `recoverySnapshot.bindings[]` length == pre-delete `bindingCount`; `bindingCaptureOk===true`.
- **Chats fall back to Unfiled**: after delete, each chat has no `folder_bindings` row.
- **Restore restores eligible bindings**: chats still Unfiled are re-bound to the restored folder.
- **Restore skips chats moved elsewhere**: a chat re-filed to folder B before restore stays in B; warning `restore-binding-skipped-rebound`; `skippedBindingCount` correct.
- **Restore skips missing chats**: deleted-chat case → `restore-binding-skipped-chat-missing`.
- **Protected folders blocked** with precise codes (never `folder-not-found`).
- **Idempotent retry**: double soft-delete → `already-tombstoned`; double restore → `already-restored`; re-bind no-op.
- **`bindChat` into tombstoned folder blocked** (`folder-tombstoned`).
- **No Chrome destructive apply**: `tombstone-reviews.mv3` untouched; no export propagation of 4B events.
- **Duplicate-name restore** coexists (`restore-duplicate-name` warning, both folders present).
- `node --check` on every edited file.

## K. Smallest Safe Codex Prompt (high level)

> In `h2o-cp-source/src-surfaces-base/studio/store/folders.tauri.js` (Desktop/Tauri only), extend Phase 4A so a **folder with chats** can be soft-deleted and restored **without deleting any chat**. On soft delete: pre-read its bindings via `readFolderBindingsForRemoveSafely`, store them as `recoverySnapshot.bindings[]` (`{chatId, assignedAt}`, with `bindingCaptureOk`), then **unbind each chat to Unfiled using the existing safe `unbindChat`/F15 delegation path (never raw SQL, respect F16.4 trigger protection)**; remove the `folder-not-empty` block from the delete path; keep all protected/system/unfiled/local-review blockers and `already-tombstoned`; create the folder tombstone (now `bindingCount:N`) before unbinding. On `restoreTombstonedFolder`: after recreating the folder, re-bind each `recoverySnapshot.bindings[]` chat **only if it is currently Unfiled** (skip + warn `restore-binding-skipped-rebound` if bound elsewhere, `restore-binding-skipped-chat-missing` if gone); return `restoredBindingCount`/`skippedBindingCount`/`warnings[]`. Guard `bindChat` to reject a tombstoned folder (`folder-tombstoned`). Keep it Desktop-local: no Chrome request/apply, no tombstone export, no purge, no Migration v7 (use `meta_json`). Update `S0Z1g` to enable `Move to Recently Deleted` for folders with chats with the confirmation "N chats move to Unfiled — no chats are deleted", and show restore re-attach/skip counts; only toast after the fresh display model confirms the change. Add a validator (`validate-folder-delete-tombstone-phase4b.mjs`) asserting: no chat row deleted, bindings snapshotted, chats Unfiled after delete, eligible bindings restored, rebound/missing chats skipped with warnings, protected folders blocked, and idempotent retry. Run `node --check` on every edited file and the validator.

---

## Final note

4B is a tightly-scoped, reversible extension of proven 4A code: the binding readers, cascade-tombstone builders, recovery-snapshot writer, and safe binding-delegation path all already exist. The only genuinely new logic is (a) putting `bindings[]` in the snapshot, (b) calling the existing safe unbind on delete, and (c) re-binding eligible chats on restore. Ship delete + restore-rebind **together** so the round-trip is never lossy, keep it Desktop-local, and the no-chat-deletion invariant stays intact.
