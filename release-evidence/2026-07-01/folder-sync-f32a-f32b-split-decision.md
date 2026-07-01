# Folder Sync — F32a / F32b Split Decision (S2 remains OPEN)

Date: 2026-07-01

Baseline commit (the landed handler):

```txt
abe4ca0 feat(sync): add folder sortorder reorder handler
```

This decision supersedes any reading of `release-evidence/2026-06-25/folder-sync-f32-s2-sortorder-handler.md`
(and the `abe4ca0` commit message) as an S2 closeout. It is a decision/evidence record only. No source,
runtime, validator, store, or gate file was modified.

## Verdict

- **`abe4ca0` is ACCEPTED as F32a — a handler-only slice with an honest mirror deferral. It is NOT a full
  S2 closeout.**
- **Full S2 remains OPEN.** The S2 contract's mirror-after-write requirement is not met, idempotency is not
  persistent, and the F32 validator is static (no behavioral apply proof).
- The folder-sync S2 step is formally split into **F32a (landed)**, **F32b (next)**, and a **later S2b/S5
  mirror-after-write decision**.

## What F32a is (landed at `abe4ca0`)

- Handler exposed as `H2O.Studio.sync.sortOrderReorder` = `{ applyGate, validate, classify, orderingHash,
  buildReceipt, snapshot, apply }`, backed by `validateFolderSortorderReorderRequestForDesktopApply`,
  `classifyFolderSortorderReorderConflict`, `buildFolderSortorderReorderReceipt`,
  `applyFolderSortorderReorderRequest`, `folderSortorderCanonicalSnapshot` in
  `src-surfaces-base/studio/sync/folder-sync.tauri.js`.
- Covers, at source level: request validation, all 7 conflict classifications (duplicate → skipped;
  unknown-folder, tombstoned-folder, missing-folder, folder-not-in-catalog, stale-basis,
  superseded-concurrent → rejected, each `canonicalWriteCount: 0`), dry-run by default
  (`opts.apply !== true`), gated apply (`FOLDER_SORTORDER_REORDER_APPLY_GATE`), canonical `sort_order`
  write via `store.folders.patch(id, { sortOrder })`, a post-apply ordering-hash gate, and a receipt with
  `canonicalAuthority: 'desktop-sqlite'`, all `no*` destructive-mutation flags true, and
  `mirrorReprojection: 'deferred-to-s2b'`.
- Boundary-clean and honest: it does not falsely claim mirror-after-write; the receipt and evidence doc
  record the deferral explicitly.

## Why full S2 is NOT closed (blockers, with source evidence)

### 1. Mirror-after-write is BLOCKED by the F11 sortOrder gate

The S2 contract requires re-projecting the `FOLDER_STATE_DATA_KEY` mirror from canonical after the
`sort_order` write. There is **no existing, safe, exposed canonical→mirror path that preserves
`sort_order`** while F11 still blocks `field-mismatch:sortOrder`:

- **`store.folders.patch` writes canonical SQLite ONLY.** `patch` → `patchOne`
  (`store/folders.tauri.js:1419`) → `upsertCore` (`:1361`) issues `UPDATE folders SET … WHERE id = ?` +
  `recordWrite('upsert.update')`; it does **not** write `FOLDER_STATE_DATA_KEY`.
- **`rebuildRenderMirrorFromSqlite` strips/blocks sortOrder.** It is the only exposed canonical→mirror
  rebuild (`store/folders.tauri.js:709`, exposed at `:3748`), but it is F11-gated and render-only:
  `blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`
  (`:726`), `skippedSortOrderRebuildCount` (`:801`), and it drops the field (`delete next.sortOrder;`,
  `:688`). Gate constant: `F11_RENDER_MIRROR_REBUILD_GATE = 'folder-sync-f11-render-only-mirror-rebuild'`
  (`:88`).
- The other mirror writers (`removeFolderFromStateMirror` `:537`, `restoreFolderToStateMirror` `:576`) are
  per-folder soft-delete / restore, not a reorder reprojection.
- `studio.js`'s canonical readers that include `sort_order` (`settingsFolderDesktop*`) are module-internal,
  unexposed, and `studio.js` is out of scope.
- An exhaustive scan of `store/folders.tauri.js` + `sync/*.js` found **zero** `FOLDER_STATE_DATA_KEY`
  writers that reproject `sort_order`/reorder from canonical.

**Root cause:** sortOrder→mirror reprojection is precisely what F11 gates until **S5**. Satisfying
mirror-after-write at S2 would require either changing the F11 allowed set (that is S5 — forbidden here) or
building a new mirror substrate that bypasses the F11 gate (out of S2 scope). Hence the deferral is
correct, and S2-as-a-single-step is internally inconsistent with the plan's own sequencing.

### 2. Idempotency is non-persistent (caller-context-only)

`classifyFolderSortorderReorderConflict` detects duplicates via `ctx.appliedKeys[idempotencyKey]` supplied
by the caller. The apply is atomic-on-retry (it writes the FULL requested order, so re-application
converges), but a genuine cross-call replay no-op is not self-contained. A persistent path exists and is
unused: `H2O.Desktop.Sync.recordConsumedOperation` + `listConsumedOperations`
(`sync/consumed-operation-ledger.tauri.js`, ledger key `h2o:sync:consumed-operation-ledger:v1`). This must
be wired and proven in F32b.

### 3. The F32 validator is static, not behavioral

`tools/validation/sync/validate-folder-sync-f32-s2-sortorder-handler.mjs` asserts code shape against real
source (functions exist, schemas consumed, dry-run default, gated apply, receipt markers, conflict
reasons, F11 unchanged, boundaries). It does **not execute** the handler against `node:sqlite`. A
behavioral apply proof (dry-run = 0 writes; gated apply writes only `sort_order`; 7 conflict cases write
nothing; persistent-replay no-op) is still required — F32b.

## The formal split

### F32a — LANDED (`abe4ca0`)
Handler-only: validate/classify/dry-run/gated-apply/receipt at source level, canonical `sort_order` write
via `store.folders.patch`, honest `mirrorReprojection: 'deferred-to-s2b'`. Accepted as-is.

### F32b — NEXT (unblocked; does not touch F11 or the mirror)
- Wire **persistent idempotency** using the existing consumed-operation ledger APIs
  (`recordConsumedOperation` / `listConsumedOperations`) — existing APIs only, no new broad substrate.
- Add a **behavioral node:sqlite apply proof** that loads/exercises the real handler on a temp DB (no Tauri
  webview): dry-run = `writeCallCount 0`; gated apply writes only `sort_order`; all 7 conflict cases write
  nothing; duplicate idempotencyKey is a persistent no-op; receipt authority/flags verified.
- No F11 change, no mirror write, no `productSyncReady` flip.

### S2b / S5 — LATER (blocked; owner decision required)
Mirror-after-write for sortOrder. Requires either the **S5** decision to add `field-mismatch:sortOrder` to
the F11 allowed set (so `rebuildRenderMirrorFromSqlite` can reproject it), **or** an owner-approved
dedicated sortOrder-preserving canonical→mirror projection. **Do not bring S5 forward yet.**

## Preserved postures (unchanged by this decision)

- `field-mismatch:sortOrder` remains GATED (in the F11 `blockedClasses`); `binding-mismatch` remains
  BLOCKED. The F11 allowed/blocked set **must remain unchanged until the dedicated S5 decision/gate**.
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Binding receipt schema `h2o.studio.chat-folder-binding-receipt.v1` remains UNMINTED; binding
  request schema unchanged; no binding handler work.
- WebDAV remains `'deferred'`; no cloud / archive CAS; no Chat Saving / archive-package work; no
  `fullBundle.v3`.
- Desktop SQLite remains canonical; Chrome / native / mobile remain non-canonical proposers.

## Non-authorization

This decision authorizes **no** implementation and specifically NOT:

- any F11 allowed/blocked-set change,
- any `productSyncReady` flip,
- minting the binding receipt schema or any binding work,
- any WebDAV / cloud / archive CAS / Chat Saving work,
- any live cross-surface parity claim,
- bringing S5 forward.

## Risk notes

- The committed F32a doc (`…/folder-sync-f32-s2-sortorder-handler.md`) and the `abe4ca0` commit message
  ("add folder sortorder reorder handler", framed "S2 execution") can be **misread as S2 done**. **This
  split doc supersedes that interpretation: S2 is OPEN.**
- The green F32 validators mean the **handler-as-scoped is internally consistent** (including the recorded
  deferral) — they do **not** mean full S2 is closed. Do not treat validator-green as a closeout signal.

## Rollback / maintenance

- **No revert of `abe4ca0` is recommended.** It is honest, boundary-clean, useful, and correctly scoped as
  F32a; reverting would discard valid work. The remediation is forward (F32b + the S2b/S5 decision), not a
  revert.
- No source/store/validator/gate file is changed by this decision; it is a status record only.

## Recommended next prompt (F32b)

> Implement Folder Sync F32b (does NOT close S2): (1) wire persistent idempotency into the committed
> `sortOrderReorder` handler using ONLY the existing `H2O.Desktop.Sync.recordConsumedOperation` /
> `listConsumedOperations` ledger APIs (no new substrate); (2) add
> `tools/validation/sync/validate-folder-sync-f32b-*.mjs` — a behavioral node:sqlite apply proof that
> loads and exercises the REAL handler on a temp DB (no Tauri webview): dry-run = 0 writes; gated apply
> writes only `sort_order`; all 7 conflict cases write nothing; duplicate idempotencyKey is a persistent
> no-op; receipt `canonicalAuthority:'desktop-sqlite'` + `no*` flags. Do NOT touch the F11 set, the mirror
> (`FOLDER_STATE_DATA_KEY`), `productSyncReady`, binding, WebDAV/cloud/archive, or Chat Saving. If
> `node:sqlite` is unavailable, report the blocker rather than faking the proof. Mirror-after-write stays
> deferred to the S2b/S5 decision.

## Scope

- Decision / status record only. No source, runtime, validator, store, gate, or config file was modified.
- Only this file is created: `release-evidence/2026-07-01/folder-sync-f32a-f32b-split-decision.md`.
