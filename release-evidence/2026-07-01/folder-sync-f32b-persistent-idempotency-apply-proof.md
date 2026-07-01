# Folder Sync — F32b: Persistent Idempotency + Behavioral Apply-Path Proof

Date: 2026-07-01

Baseline commits:

```txt
e405ba0 docs(sync): formalize folder sortorder F32a/F32b split
fbfd6d8 test(sync): reprove folder sortorder handler decision path
```

## Status

**F32b implemented.** This slice closes the two F32a/F32b-split obligations that were still open on the
committed sortOrder handler: (1) **persistent replay/idempotency** using the existing consumed-operation
ledger, and (2) a **behavioral apply-path proof** that loads and exercises the REAL handler against a
node:sqlite temp DB. **F32b does NOT close full S2**: mirror-after-write remains deferred to S2b, and S3
(live Desktop dry-run) is not started.

## What F32b changed (product source: `folder-sync.tauri.js` only)

Added, inside the existing F32 handler block, hash-only persistent idempotency that reuses the existing
`H2O.Desktop.Sync.recordConsumedOperation` / `listConsumedOperations` ledger (no new substrate):

- `f32ConsumedLedger()` — resolves the ledger APIs if present; returns `null` otherwise (graceful).
- `f32ReorderDedupeKey(request)` / `f32ReorderEventDigest(request)` — SHA-256 (via the module's existing
  `sha256Hex`) of the `idempotencyKey` (+ schema/basis/requested hashes) into ledger `dedupeKey` /
  `eventDigest`. **Hash-only; no raw folder ids/names are stored.**
- `f32ReorderAlreadyConsumed(request)` — lists consumed operations and reports whether this request's
  `dedupeKey` (scoped to `operationKind: 'folder-sortorder-reorder'`) is already recorded.
- `f32RecordReorderConsumed(request)` — records a redacted `consumed` row (`envelopeKind: 'applyEvent'`).

Wired into `applyFolderSortorderReorderRequest`:

- **Before classify:** if the idempotencyKey is already consumed (per the ledger), it classifies as
  `duplicate` → **skipped, zero-write** — even across a separate call with a fresh caller context.
- **On accepted apply success only:** records the consumed operation; the receipt carries
  `idempotencyPersisted: true`.
- **Dry-run and rejected conflicts do NOT record** (no consume), and remain zero-write.

The receipt now also exposes `idempotencyPersisted`. Every asserted F30/F31/F32/F33 anchor
(`var dryRun = opts.apply !== true`, the apply gate, `folders.patch(order[i], { sortOrder: i })`,
`canonicalWriteCount: 0`, `mirrorReprojection: 'deferred-to-s2b'`, the no-mirror/no-binding/no-delete
handler-body bans) is preserved, so those validators stay green with no edits.

## Behavioral apply-path proof (validator)

`tools/validation/sync/validate-folder-sync-f32b-persistent-idempotency-apply-proof.mjs` LOADS the real
`consumed-operation-ledger.tauri.js` and the real `folder-sync.tauri.js` into a node harness and exercises
the real `H2O.Studio.sync.sortOrderReorder.apply(...)` against:

- a disposable canonical `folders` table via **node:sqlite `DatabaseSync`** reached through a `store.folders`
  stub whose only write path is `UPDATE folders SET sort_order` (so any canonical write is necessarily a
  sort_order write), and
- the **real** consumed-operation ledger backed by an in-memory `chrome.storage.local` mock.

If `node:sqlite` / `DatabaseSync` is unavailable, the validator STOPS and reports the blocker — it does not
fake the proof.

Proven:

- **Dry-run default:** writes 0 rows; receipt `status: 'dry-run'`, `canonicalWriteCount: 0`; does **not**
  consume the idempotency key.
- **Gated apply (accepted):** writes exactly `sort_order` (3 writes for a 3-folder reorder), reorders the
  canonical table `fa,fb,fc → fc,fb,fa`, receipt `status: 'applied'`, `canonicalAuthority: 'desktop-sqlite'`,
  all `no*` destructive flags true, `idempotencyPersisted: true`; records exactly one consumed row.
- **Persistent replay:** a **separate** call with the same `idempotencyKey` (fresh options, no caller
  context) → receipt `status: 'skipped'`, `reason: 'duplicate'`, **0 writes**, canonical order unchanged,
  no double-record. This proves persistence is **ledger-sourced, not caller-context**.
- **Conflict rejects (all reachable classes — `duplicate`, `stale-basis`, `unknown-folder`,
  `tombstoned-folder`, `superseded-concurrent`) and ungated apply:** 0 writes; do **not** consume; every
  receipt keeps `mirrorReprojection: 'deferred-to-s2b'`.
- **No destructive/mirror writes:** folder row count unchanged (no insert/delete/purge), tombstone set
  unchanged, no non-sort_order store write, **no `FOLDER_STATE_DATA_KEY` mirror write**; only the ledger key
  is written to the mock store.

**Conflict-class coverage.** F32b behaviorally exercises all **five reachable** conflict classes through the
real apply path: `duplicate`, `stale-basis`, `unknown-folder`, `tombstoned-folder`, and
`superseded-concurrent` (the last two added: `tombstoned-folder` via the seeded tombstoned folder,
`superseded-concurrent` via `ctx.priorAppliedInBatch` + a stale basis). The remaining two classes —
`missing-folder` and `folder-not-in-catalog` — are **unreachable through the real
`folderSortorderCanonicalSnapshot`** (the F32a snapshot shape sets `visibleSet === presentSet` and
`knownSet = present ∪ tomb`, so any known non-tombstoned id is necessarily present). They are therefore
**dead defensive branches** covered only by **F33's synthetic decision-path proof** (`fbfd6d8`), and are
deliberately **not** forced into fabricated behavioral tests. F32b does **not** claim all seven conflict
classes are behaviorally reachable. This dead-branch shape originates in F32a (`abe4ca0`) and is recorded
here for the owner; it is not modified by F32b.

## Mirror boundary (unchanged)

- `mirrorReprojection: 'deferred-to-s2b'` on every receipt.
- No `FOLDER_STATE_DATA_KEY` write; no `rebuildRenderMirrorFromSqlite` call; no S5/F11 change.
- **Full S2 remains OPEN** — mirror-after-write for sortOrder is still gated by the F11
  `field-mismatch:sortOrder` block and remains the later **S2b/S5** decision.

## Preserved postures

- F11 allowed/blocked set unchanged (still blocks `field-mismatch:sortOrder` + `binding-mismatch`).
- `productSyncReady` remains `false`.
- Binding receipt schema unminted; no binding handler work.
- WebDAV `deferred`; no cloud / archive CAS; no Chat Saving / archive-package work; no `fullBundle.v3`.
- Desktop SQLite canonical; Chrome / native / mobile remain non-canonical proposers.

## Supersession

This supersedes F33's "Recommended F34 = S3 live dry-run" as the immediate next step: **F32b lands first.**
S3 (live Desktop dry-run) is **not** started here and should proceed only if a strict review accepts F32b,
under separate explicit approval. F33 (`fbfd6d8`) remains valid as the decision-path reprove + S2b design
gate; it is not F32b.

## Non-authorization

- No live Desktop dry-run / S3.
- No mirror-after-write / S2b implementation; no S5 / F11 allowed-set change.
- No `productSyncReady` flip; no binding receipt mint; no WebDAV / cloud / archive CAS; no Chat Saving.
- No live cross-surface parity claim.

## Next

- Strict review of F32b. If accepted: S3 live Desktop dry-run (separate explicit approval).
- Later: S2b/S5 mirror-after-write decision (bring S5 forward, or an owner-approved sortOrder-preserving
  canonical→mirror projection).

## Scope

- One product-source file edited (`folder-sync.tauri.js`, handler block only) + one new validator + this
  evidence doc. No store/F11/mirror/productSyncReady/binding/WebDAV/cloud/archive/Chat-Saving/cosmetic
  files were modified. Nothing staged or committed.
