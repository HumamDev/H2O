# Folder Sync — Phase F32: EXECUTE S2 — sortOrder Desktop validate/apply/receipt handler

Date: 2026-07-01

## Status

S2 EXECUTION — REAL PRODUCT-SOURCE HANDLER ADDITION (the second product-source change in the folder-sync
lane; the first real handler). F32 adds a Desktop sortOrder validate → conflict-classify → apply → receipt
handler to `src-surfaces-base/studio/sync/folder-sync.tauri.js`, scoped to canonical SQLite `sort_order`
apply ONLY, dry-run-by-default, gated apply, basis-gated, idempotent (atomic-on-retry). It clones the
existing metadata-mutation Desktop-apply idiom. Mirror re-projection is **DEFERRED to a separate S2b
slice** (see §5). No F11 allowed/blocked-set change; no binding work; no `folder_bindings`; no
`DELETE FROM folders`; no tombstone mutation; no chat mutation; no folder delete/purge; no
`productSyncReady` flip; no `fullBundle.v3`; no WebDAV/cloud/archive CAS; no Chat Saving/archive code. The
binding receipt schema stays unminted. The handler is NOT auto-wired into any import loop — it is invoked
explicitly and is dry-run unless gated.

## Context

- F31 S2 pre-flight gate committed: `6d6da48`. F30 S1 schema mint committed: `01b05cb`. Architecture
  review verdict: GO-WITH-CONDITIONS.
- F30 minted the two constants inertly; F32 now consumes them:
  - `FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1'`
  - `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1'`

## Cross-Surface Requirement (carried)

Desktop SQLite is canonical; Chrome / native extension and mobile remain non-canonical proposers.
Multi-device parity, mobile, remote WebDAV, and Chat Saving CAS are NOT implemented here.

## 1. Handler Shape (cloned from the metadata-mutation Desktop-apply idiom)

Added to `folder-sync.tauri.js` (module scope), exposed on `H2O.Studio.sync.sortOrderReorder`:

- `validateFolderSortorderReorderRequestForDesktopApply(request)` — mirrors
  `validateLibraryMetadataMutationRequestForDesktopApply`: asserts schema, intent, requestId,
  sourcePeerId/deviceId, surfaceKind, orderPayload, basisOrderingHash, requestedOrderingHash, createdAt,
  idempotencyKey, apply-flags (`desktopApplyRequired`/`noLocalApply`), mutation-flag
  (`noChromeCanonicalMutation`), the safety-flag battery (`noHardDelete`/`noPurge`/`noChatDelete`/
  `noFolderDelete`/`noBindingMutation`/`noTombstoneMutation`), privacy flags, and no raw
  name/title/content keys.
- `classifyFolderSortorderReorderConflict(request, snapshot, ctx)` — pure conflict oracle.
- `folderSortorderCanonicalSnapshot()` — reads canonical order via `H2O.Studio.store.folders.getAll()`
  (+ `listRecentlyDeletedFolders` for tombstones); builds present/tomb/known/visible sets + a
  `sortOrderById` map.
- `folderSortorderOrderingHash(orderedIds)` — deterministic ordering hash (`oh:` + FNV-1a) over an id
  order.
- `buildFolderSortorderReorderReceipt(request, status, reason, extra)` — mirrors
  `libraryMetadataMutationReceiptFromRequest`.
- `applyFolderSortorderReorderRequest(request, options)` — the orchestrator (validate → snapshot →
  classify → dry-run/gate → apply → verify → receipt).

## 2. Apply Path — canonical `sort_order` ONLY

The accepted apply loops the FULL requested order and, for each folder id, calls
`H2O.Studio.store.folders.patch(folderId, { sortOrder: index })`. That store path is
`patchOne → upsertCore → 'UPDATE folders SET sort_order = ? WHERE id = ?' + recordWrite('upsert.update')`.
So every canonical write is a `sort_order` UPDATE routed through `recordWrite`. The handler body contains
NO `folder_bindings` write, NO `DELETE FROM folders`, NO tombstone write, NO chat mutation, NO folder
delete/purge, NO `FOLDER_STATE_DATA_KEY`/`chromeStorageSet` (mirror) write. (`tombSet`/`tombstoned-folder`
in the body are a READ + a conflict-reason string, not writes.)

## 3. Idempotency / Atomic-on-Retry + Strict Basis Stale-Check

- The apply writes the FULL requested order (each folder's `sort_order` = its index in the request), not
  incremental deltas. Re-running the same accepted request converges to the same canonical order —
  idempotent and atomic-on-retry (a partial failure is fixed by re-application; there is no `BEGIN/COMMIT`
  in tauri-plugin-sql, so full-order re-application is the atomicity model).
- After applying, the handler recomputes the canonical ordering hash over the payload folders (sorted by
  their post-apply `sort_order`) and emits `applied` ONLY if it equals `request.requestedOrderingHash`;
  otherwise it emits `rejected: post-apply-ordering-hash-mismatch`.
- STRICT basis stale-check: `classify` computes the current canonical order hash of the payload folders
  and rejects `stale-basis` (or `superseded-concurrent` when a concurrent apply advanced the basis in the
  same batch) if it differs from `request.basisOrderingHash`. This mitigates the native-owner-clobber
  risk (R1): if the native ChatGPT owner reordered since the proposer's basis, the apply is rejected.

## 4. Conflict Handling (reject/skip with ZERO writes)

`classify` precedence (existence-first, so folder-level problems surface before basis):
`duplicate` (skipped) → `unknown-folder` → `tombstoned-folder` → `missing-folder` →
`folder-not-in-catalog` → `stale-basis` / `superseded-concurrent` (rejected) → accepted. A
redaction violation is rejected at validation (`redaction-violation`). Every non-accepted path returns a
receipt with `canonicalWriteCount: 0` and performs no canonical or mirror write.

## 5. Mirror Re-Projection — DEFERRED to S2b (recorded)

Mirror re-projection is deliberately DEFERRED to a separate S2b slice, per the architecture review and
the F32 scope option. Rationale grounded in source: the F11 render-only rebuild
(`rebuildRenderMirrorFromSqlite`) explicitly strips `sortOrder` (`delete next.sortOrder;
delete next.sort_order;`), so it cannot re-project ordering; and there is no standalone
sortOrder-preserving projection safely reusable from `folder-sync.tauri.js` (the write-through projection
carrying `sortOrder` lives inside the folders store, embedded in a larger function). Therefore F32 is
**canonical-apply + receipt only**; every receipt carries `mirrorReprojection: 'deferred-to-s2b'`. S2b
will add the sortOrder-preserving write-through re-projection AFTER the canonical write, with its own proof.

## 6. Dry-Run / Gate

- Dry-run by default: `applyFolderSortorderReorderRequest(request)` with no `apply:true` returns a planned
  receipt (`status: 'dry-run'`, `canonicalWriteCount: 0`) and performs zero writes.
- Gated apply only: a write requires BOTH `options.apply === true` AND
  `options.gate === 'folder-sync-f32-sortorder-apply'`. `apply:true` without the gate returns
  `rejected: apply-gate-required` with zero writes.
- Not auto-wired: the handler is exposed on `H2O.Studio.sync.sortOrderReorder` for explicit invocation; it
  is NOT wired into `autoApply*FromChromeBundle` or any import/transport path, so it changes no runtime
  behavior on import.

## 7. F30 / F31 Retained-Validator Ripple (absent→present style)

F32 consumes the two sortOrder constants, so their occurrence count rises from 1 to >1 and a handler now
exists. The F30 and F31 validators asserted "referenced exactly once (inert)" / "no handler yet"; those
source anchors were updated minimally:

- F30 `validate-folder-sync-f30-...`: the four `countOccurrences(... ) === 1` inertness assertions →
  `>= 1` ("present; now consumed by the F32 S2 handler"). Nothing else changed (banned-token, region,
  binding-receipt-absent, fullBundle, webdav, F11, metadata checks left intact).
- F31 `validate-folder-sync-f31-...`: the four `=== 1` "still inert" assertions → `>= 1`; the "no handler
  tokens yet" loop → an assertion that the F32 handler
  (`validateFolderSortorderReorderRequestForDesktopApply` + `applyFolderSortorderReorderRequest`) is now
  present; the printed `handlerExists` field → live-source-derived. F31's doc-grep assertions (its
  as-of-F31 no-handler narrative) are unchanged.

## Preserved Postures

- `field-mismatch:sortOrder` remains GATED (still in the F11 `blockedClasses`; F32 did NOT add it to the
  allowed set — that is S5). `binding-mismatch` remains BLOCKED.
- `productSyncReady` remains `false`. Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no
  `fullBundle.v3`, no CAS, no archive code). Real remote WebDAV deferred; public/premium blocked.
- Binding receipt schema `h2o.studio.chat-folder-binding-receipt.v1` remains UNMINTED.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical proposers; hard
  delete blocked; folder delete preserves chats.

## Verdicts

- F32: PASS (S2 executed). The sortOrder validate/apply/receipt handler is added, cloned from the
  metadata-mutation idiom, writing ONLY canonical `sort_order` (via `store.folders.patch` → `recordWrite`),
  dry-run-by-default + gated, idempotent atomic-on-retry with a strict basis stale-check and a post-apply
  ordering-hash verification. Mirror re-projection deferred to S2b. No F11 allowed-set change; no binding
  work; no flip; no CAS.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED. `productSyncReady`:
  remains `false`. Chat Saving CAS: REMAINS BLOCKED. The closed Labels / Tags / Categories metadata lane
  is not modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain).

## Recommended F33

F33 = an IN-PROCESS re-prove of the REAL handler's pure decision path (validate + classify + receipt +
orderingHash), plus S2b design: extract/exercise the real `classifyFolderSortorderReorderConflict` +
`validateFolderSortorderReorderRequestForDesktopApply` against synthetic fixtures (accepted + all conflict
reasons) to re-prove parity with F16/F17/F18, and design the S2b sortOrder-preserving mirror
re-projection (no F11 rebuild reuse). No live Desktop writes; no flip. The live Desktop dry-run (S3) and
controlled apply (S4) remain separate later slices, each requiring separate approval. Keep
`field-mismatch:sortOrder` gated (S5 is the F11 allowed-set change, still later), `binding-mismatch`
blocked, `productSyncReady` false, and Chat Saving CAS blocked.
