# Folder Sync — Phase F33: In-Process Re-Prove of the Real F32 Handler + S2b Mirror Re-Projection Design

Date: 2026-07-01

## Status

VALIDATOR / EVIDENCE + DESIGN ONLY. No live Desktop write. No controlled apply. No product runtime change
(product source was read-only; the re-prove uses a sandboxed `node:vm` evaluation of the REAL committed
handler source — Option B — so NO export shim / NO product-source edit was needed). No F11 allowed/blocked
set change. No `productSyncReady` flip. No `fullBundle.v3`. No WebDAV/cloud/archive CAS. No Chat Saving /
archive package code. No binding work; no binding receipt schema mint. This slice re-proves the real F32
sortOrder handler's PURE decision path against synthetic fixtures and specifies (design-only) the S2b
sortOrder-preserving mirror re-projection.

## Context

- F32 S2 sortOrder handler committed: `abe4ca0` (validate/classify/apply/receipt on
  `H2O.Studio.sync.sortOrderReorder`; canonical `sort_order` apply only via `store.folders.patch`;
  dry-run-by-default; gated apply via `folder-sync-f32-sortorder-apply`; strict basis stale-check;
  post-apply ordering-hash verification; receipt via `FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA`; mirror
  re-projection DEFERRED to S2b).
- F31 gate: `6d6da48`. F30 mint: `01b05cb`. F16/F17/F18 synthetic harnesses remain the contract oracle.

## Cross-Surface Requirement (carried)

Desktop SQLite canonical; Chrome / native extension and mobile remain non-canonical proposers. Multi-device
parity, mobile, remote WebDAV, and Chat Saving CAS are NOT implemented here.

## 1. Re-Prove Approach — Option B (sandboxed VM, no product-source edit)

The F32 handler lives in a browser IIFE that expects `H2O.Studio`. Rather than add an export shim
(Option A, which would edit product source), F33 uses **Option B**: the F33 validator reads the committed
`folder-sync.tauri.js`, extracts the REAL handler function source (from `var
FOLDER_SORTORDER_REORDER_APPLY_GATE` to the `end F32 S2 sortOrder reorder handler` marker), and evaluates
it verbatim in a `node:vm` context with only minimal helper stubs (`cleanString`, `safeObject`) and the two
F30 schema constants. The real `validateFolderSortorderReorderRequestForDesktopApply`,
`classifyFolderSortorderReorderConflict`, `folderSortorderOrderingHash`, and
`buildFolderSortorderReorderReceipt` are then invoked with synthetic fixtures. No `H2O.Studio.store` is
touched (the pure decision path is store-free); no live write; no product change.

## 2. In-Process Matrix (real handler decision path vs the F16/F17/F18 oracle)

Synthetic canonical snapshot (tokenized ids only): present+visible `fa,fb,fc` (sortOrder 0/1/2), tombstoned
`fd`, known-but-missing `fe`, present-but-not-in-catalog `fh`. Each fixture asserts the REAL function's
result:

| Fixture | Real result | Expected |
| --- | --- | --- |
| accepted reorder (`fa,fb,fc`, basis = current-order hash) | `validate.ok` + `classify → null` | accepted |
| duplicate (idempotencyKey seen) | `classify → 'duplicate'` | duplicate (skipped) |
| unknown-folder (`fzzz`) | `classify → 'unknown-folder'` | rejected |
| tombstoned-folder (`fd`) | `classify → 'tombstoned-folder'` | rejected |
| missing-folder (`fe`) | `classify → 'missing-folder'` | rejected |
| folder-not-in-catalog (`fh`) | `classify → 'folder-not-in-catalog'` | rejected |
| stale-basis (wrong basis) | `classify → 'stale-basis'` | rejected |
| superseded-concurrent (wrong basis + priorAppliedInBatch) | `classify → 'superseded-concurrent'` | rejected |
| redaction-violation (raw `title` key) | `validate` blockers include `...redaction-violation` | rejected |

The accepted case additionally proves the receipt builder emits `canonicalAuthority: 'desktop-sqlite'`,
`noDestructiveMutation/noFolderDelete/noFolderPurge/noChatDelete/noBindingMutation/noTombstoneMutation:
true`, and `mirrorReprojection: 'deferred-to-s2b'`. These outcomes match the F16/F17/F18 synthetic oracle's
conflict semantics — the REAL handler and the proven contract agree.

## 3. Structural Re-Assertions on the Real Handler (source)

- dry-run by default (`var dryRun = opts.apply !== true`); apply gate required
  (`cleanString(opts.gate) === FOLDER_SORTORDER_REORDER_APPLY_GATE`).
- conflict/dry-run receipts carry `canonicalWriteCount: 0` (zero-write on non-applied paths).
- accepted apply writes ONLY canonical `sort_order` (`folders.patch(order[i], { sortOrder: i })`); the
  handler body contains NO `folder_bindings`, NO `DELETE FROM folders`, NO `chromeStorageSet` /
  `FOLDER_STATE_DATA_KEY` (mirror) write, NO `rebuildRenderMirrorFromSqlite`, NO tombstone/chat/binding
  mutation, NO raw `sqlExecute`.
- F32 performs NO mirror write (mirror re-projection is deferred; every receipt says
  `mirrorReprojection: 'deferred-to-s2b'`).
- no F11 allowed-set change; binding receipt schema still unminted.

## 4. S2b Mirror Re-Projection — Design-Only Specification (NOT implemented)

S2b would add the sortOrder-preserving mirror write-through re-projection that runs ONLY AFTER a successful
canonical `sort_order` write.

- Model: read the canonical folders in `sort_order` (the folders store's `getAll()`/`list()` projection,
  which carries `sortOrder: Number(folder.sortOrder) || 0`), and write the `FOLDER_STATE_DATA_KEY` render
  mirror folder rows PRESERVING each folder's `sortOrder`. It is a strict derived projection of canonical.
- HARD RULE: S2b must NOT reuse the F11 `rebuildRenderMirrorFromSqlite` helper, because that helper
  explicitly strips ordering (`delete next.sortOrder; delete next.sort_order;`) and therefore cannot carry
  sortOrder into the mirror.
- Ordering: re-projection happens strictly AFTER the canonical write and hash verification; the mirror
  never leads; no direct mirror-only order repair.
- S2b entry criteria: F32 committed and green; the sortOrder-preserving projection idiom identified; F11
  still blocks `field-mismatch:sortOrder`; `productSyncReady` false; retained validators green.
- S2b exit criteria: after a gated accepted apply, the mirror render rows reflect the new `sortOrder`; the
  write counter is bounded to canonical `sort_order` + the mocked/real mirror projection; no
  binding/tombstone/chat/delete write; a re-run drift check shows `field-mismatch:sortOrder` reconverges
  in the mirror; redacted output; still no F11 allowed-set change; `productSyncReady` false.
- S2b validator requirements: assert the projection preserves `sortOrder`, runs after the canonical write,
  does not call `rebuildRenderMirrorFromSqlite`, writes only the mirror (no canonical binding/tombstone
  mutation), and is idempotent.
- S2b rollback: remove only the re-projection call/function; the F32 canonical-apply handler remains; the
  receipt reverts to `mirrorReprojection: 'deferred-to-s2b'`; rerun retained validators.

S2b is NOT implemented in F33: the F32 handler still records `mirrorReprojection: 'deferred-to-s2b'` and
performs no mirror write.

## Preserved Postures

- `field-mismatch:sortOrder` remains GATED (still in the F11 `blockedClasses`; S5 — the allowed-set flip —
  is later). `binding-mismatch` remains BLOCKED.
- `productSyncReady` remains `false`. Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no
  `fullBundle.v3`, no CAS, no archive code). Real remote WebDAV deferred; public/premium blocked.
- Binding receipt schema `h2o.studio.chat-folder-binding-receipt.v1` remains UNMINTED.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical proposers; hard
  delete blocked; folder delete preserves chats.

## Verdicts

- F33: PASS (in-process re-prove + S2b design; Option B). The REAL F32 decision path (validate + classify +
  orderingHash + receipt) is re-proven against synthetic fixtures for the accepted case and all conflict
  reasons, matching the F16/F17/F18 oracle; the handler's dry-run/gate/zero-write/sort_order-only/no-mirror
  structure is re-asserted; and the S2b sortOrder-preserving re-projection is specified design-only (no
  F11-rebuild reuse). No live write; no flip; no F11 allowed-set change; no product-source edit.
- `field-mismatch:sortOrder`: REMAINS GATED. `binding-mismatch`: REMAINS BLOCKED. `productSyncReady`:
  remains `false`. Chat Saving CAS: REMAINS BLOCKED. The closed Labels / Tags / Categories metadata lane is
  not modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain).

## Recommended F34

F34 = S3 LIVE DESKTOP DRY-RUN PROOF of the F32 handler (no write): run
`H2O.Studio.sync.sortOrderReorder.apply(request)` (no `apply:true`) on a live dev Desktop Studio instance,
capture the planned receipt (`status: dry-run`, `canonicalWriteCount: 0`, `mirrorReprojection:
deferred-to-s2b`, redacted), and record it as evidence with a validator — proving the real handler plans a
reorder without any write. F34 is a LIVE step and requires SEPARATE EXPLICIT APPROVAL; it performs no
canonical write (the controlled apply S4 and the F11 allowed-set flip S5 remain later, separately-approved
slices). Keep `field-mismatch:sortOrder` gated, `binding-mismatch` blocked, `productSyncReady` false, and
Chat Saving CAS blocked.
