# Folder Sync — Phase F17: sortOrder Absorption APPLY Proof Harness (in-process, fixture-backed)

Date: 2026-07-01

## Status

IN-PROCESS / FIXTURE-BACKED APPLY PROOF HARNESS ONLY — SYNTHETIC DATA. No product runtime behavior was
implemented. No live Desktop write occurred. No DevTools / live-profile mutation. No runtime schema
minting. No binding repair, no tombstone write, no chat mutation, no folder delete/purge. `productSyncReady`
was NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS was implemented. No Chat
Saving / archive package code was touched. No product source was modified. This slice proves — on a
disposable in-process canonical table + a mocked render mirror — that an ACCEPTED synthetic sortOrder
reorder request, applied only to canonical `sort_order` and then re-projected into the mirror, makes
`field-mismatch:sortOrder` reconverge, with the write counter bounded to the temp canonical `sort_order`
and the mocked mirror projection only.

## Harness Substrate

The harness uses a REAL in-process SQLite database via Node's built-in `node:sqlite`
(`DatabaseSync(':memory:')`, Node v25) as the disposable canonical `folders` table (columns `id`,
`name`, `color`, `sort_order`, `tombstoned`). If `node:sqlite` is unavailable in a given runtime, the
harness falls back to an equivalent in-memory SQLite-like table model and records `sqliteMode` in its
output. Either way the canonical store is disposable and synthetic — it is NEVER a product store, never a
live Desktop DB, and is discarded at process exit. The render mirror is a plain in-memory object standing
in for `FOLDER_STATE_DATA_KEY`; it is never persisted.

## Context

- F16 conflict-matrix harness committed: `0a80b99`.
- F15 absorption / request-receipt spec committed: `cc0bda9`.
- F14 sortOrder authority decision committed: `58781a0`. F13 idempotence proof committed: `37ad6c7`.
- Proposed (design-only, not minted) schemas: `h2o.studio.folder-sortorder-reorder-request.v1`,
  `h2o.studio.folder-sortorder-reorder-receipt.v1`.
- `field-mismatch:sortOrder` remains gated; `binding-mismatch` remains blocked; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F17)

The absorption apply proof preserves the future model across Desktop Studio, Chrome / native extension
Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived
per-surface render projection, hash-only / redacted diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## Harness Steps (synthetic)

1. seed a synthetic canonical `folders` table with stable tokenized ids and `sort_order` (order O0), and
   fixed colors; no tombstoned rows in the reorder payload.
2. project a mocked mirror from canonical O0 (baseline in-sync: same colors, same order, all folders
   present).
3. build an ACCEPTED synthetic reorder request in the F15/F16 envelope shape, basis hash = hash(O0),
   requested hash = hash(O1) for a new order O1.
4. APPLY the accepted reorder ONLY to canonical `sort_order` (temp DB `UPDATE folders SET sort_order`),
   moving canonical to O1. Now canonical (O1) vs the still-old mirror (O0) diverges on order.
5. read-only DRIFT PROBE #1 (BEFORE re-projection): expect `field-mismatch:sortOrder` present, and
   `missing-mirror-folder` = 0, `field-mismatch:color` = 0.
6. RE-PROJECT the mirror from canonical order O1 (mocked mirror write only).
7. read-only DRIFT PROBE #2 (AFTER re-projection): expect `field-mismatch:sortOrder` = 0, and still
   `missing-mirror-folder` = 0, `field-mismatch:color` = 0.
8. assert the write counter is bounded to canonical `sort_order` (temp) + mocked mirror projection; all
   forbidden write counters (binding / tombstone / chat / folder-delete / folder-purge / WebDAV / CAS /
   runtime-source) are 0.

## What This Proves

- ABSORPTION APPLY: an accepted reorder applied only to canonical `sort_order` moves canonical to the new
  order without touching bindings/tombstones/chats.
- RECONVERGENCE: `field-mismatch:sortOrder` is PRESENT after the canonical apply (BEFORE re-projection)
  and CLEARS to 0 AFTER the mirror is re-projected from canonical — the mirror is a strict derived
  projection of canonical order.
- NO REGRESSION: `missing-mirror-folder` and `field-mismatch:color` stay 0 across both probes.
- BINDING OUT OF SCOPE: the probe reports binding drift read-only; `binding-mismatch` is NOT repaired and
  stays blocked (the harness performs zero binding writes).
- BOUNDED WRITES: only two write channels are exercised — temp canonical `sort_order` and the mocked
  mirror projection. Every forbidden write counter is 0.
- READ-ONLY PROBES: each drift probe performs no write (`probeWriteCallCount: 0`).
- REDACTED: all folder identifiers in the emitted evidence are hash-only (`sha256:` tokens); no raw
  names/titles/content.

## Safety Invariants (asserted)

- no hard delete; no folder delete / purge; no chat delete; no binding repair.
- no Chrome / mobile canonical mutation (only the temp canonical table is written, standing in for
  Desktop); Desktop remains the canonical authority in the model.
- no live Desktop write; no DevTools/live-profile mutation; no product runtime store imported or mutated.
- transport remains transport-only; no WebDAV/cloud/archive CAS exercised or enabled.
- proposed request/receipt schemas remain design-only and are NOT minted in runtime source.

## Gated / Blocked Postures (asserted against real source)

- `field-mismatch:sortOrder` remains GATED — the committed F11 helper still lists it in `blockedClasses`
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`). The reconvergence
  proved here is on the SYNTHETIC harness, not the product rebuild path; the product F11 helper still
  does not touch sortOrder.
- `binding-mismatch` remains BLOCKED and separate.
- SQLite `sort_order` remains the canonical order column (`var sortCol = 'sort_order'`).

## Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F17: PASS (in-process fixture-backed apply proof). An accepted synthetic reorder applied to a temp
  canonical `sort_order`, then re-projected into a mocked mirror, makes `field-mismatch:sortOrder`
  reconverge, with bounded writes, no regressions, and no forbidden mutation. No product runtime change;
  no live write; no flip; no source change.
- Substrate: real in-process `node:sqlite` `DatabaseSync(':memory:')` canonical table (with an
  in-memory-model fallback recorded in `sqliteMode`).
- Drift before re-projection: `field-mismatch:sortOrder` present; after re-projection: 0. No
  missing-mirror / color regressions.
- Write counter: bounded to temp canonical `sort_order` + mocked mirror projection; forbidden writes 0.
- `field-mismatch:sortOrder` in the product allowed rebuild set: NOT NOW; conditionally later only after
  the full loop (F15 §7/§8/§9) is implemented + proven; the product F11 helper still blocks it.
- `binding-mismatch`: REMAINS BLOCKED, separate.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F18

F18 = an IN-PROCESS conflict-path APPLY harness (still no product runtime change, no live write, no
flip): extend F17 so REJECTED / SKIPPED synthetic requests (stale-basis, duplicate, tombstoned, unknown,
not-in-catalog, superseded-concurrent) produce NO canonical `sort_order` change and NO mirror projection
change (write counter 0 on every non-applied case), proving the absorption apply is safe on the negative
paths too — keeping proposed schemas design-only, `binding-mismatch` blocked, `productSyncReady` false,
and Chat Saving CAS blocked. F18 modifies no product source and performs no live write.
