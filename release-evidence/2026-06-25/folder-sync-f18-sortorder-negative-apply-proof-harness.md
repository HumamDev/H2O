# Folder Sync — Phase F18: sortOrder Negative-Path Absorption Apply Proof Harness (in-process, fixture-backed)

Date: 2026-07-01

## Status

IN-PROCESS / FIXTURE-BACKED NEGATIVE-PATH APPLY PROOF HARNESS ONLY — SYNTHETIC DATA. No product runtime
behavior was implemented. No live Desktop write occurred. No DevTools / live-profile mutation. No runtime
schema minting. No binding repair, no tombstone write, no chat mutation, no folder delete/purge.
`productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat
Saving / archive package code was touched. No product source was modified. This slice extends the F17
apply proof to the NEGATIVE paths: it proves that every REJECTED / SKIPPED synthetic sortOrder reorder
request produces ZERO canonical `sort_order` change and ZERO mirror re-projection — the absorption apply
is a no-op on every conflict case.

## Harness Substrate

The harness uses a REAL in-process SQLite database via Node's built-in `node:sqlite`
(`DatabaseSync(':memory:')`, Node v25) as the disposable canonical `folders` table (columns `id`,
`name`, `color`, `sort_order`, `tombstoned`), with the same guarded fallback as F17 (an in-memory
SQLite-like table model recorded in `sqliteMode` if `node:sqlite` is unavailable). The store is
disposable and synthetic — never a product store, never a live Desktop DB. The render mirror is a plain
in-memory object standing in for `FOLDER_STATE_DATA_KEY`. F17 is NOT modified; F18 reimplements the
pattern standalone.

## Context

- F17 sortOrder absorption apply proof committed: `c3b24ba`.
- F16 conflict-matrix harness committed: `0a80b99`. F15 spec committed: `cc0bda9`.
- Proposed (design-only, not minted) schemas: `h2o.studio.folder-sortorder-reorder-request.v1`,
  `h2o.studio.folder-sortorder-reorder-receipt.v1`.
- `field-mismatch:sortOrder` remains gated; `binding-mismatch` remains blocked; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F18)

The negative-path proof preserves the future model across Desktop Studio, Chrome / native extension
Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived
per-surface render projection, hash-only / redacted diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## Apply Gate

The harness applies ONLY when the decision receipt `status === 'applied'`. Every negative fixture yields
`rejected` or `skipped`, so the apply gate never fires: no canonical `sort_order` UPDATE, no mirror
re-projection. Write counters are captured per case.

## Negative / Conflict Matrix (synthetic)

| Fixture | Expected status | Expected reason |
| --- | --- | --- |
| stale basis | rejected | stale-basis |
| duplicate request | skipped | duplicate |
| missing folder | rejected | missing-folder |
| tombstoned folder | rejected | tombstoned-folder |
| unknown folder | rejected | unknown-folder |
| folder not in visible catalog | rejected | folder-not-in-catalog |
| multi-device concurrent (later) | rejected | superseded-concurrent |
| invalid / redaction-violating request | rejected | invalid-request-envelope |

The multi-device concurrent case simulates a concurrent apply by presenting an advanced canonical basis
to the decision oracle (`priorAppliedInBatch: true`); the later request is rejected `superseded-concurrent`
and performs no write. The invalid/redaction case fails request-envelope validation (a raw `title` key in
the payload) and is rejected BEFORE any apply.

## What This Proves (per negative case)

- decision `status` is `rejected` or `skipped`, with the exact expected `reason`.
- canonical ordering hash is UNCHANGED (the temp SQLite `sort_order` rows are byte-for-byte identical to
  the pre-case snapshot).
- the mocked mirror projection hash is UNCHANGED (no re-projection occurred).
- `canonicalSortOrderWriteCount: 0` and `mirrorProjectionWriteCount: 0` for the case.
- `forbiddenTotal: 0` (binding / tombstone / chat / folder-delete / folder-purge / WebDAV / CAS /
  runtime-source all 0).
- a read-only drift probe stays read-only (`writeCallCount: 0`) and shows NO regression:
  `missing-mirror-folder` = 0, `field-mismatch:color` = 0, and — because canonical never moved and the
  mirror stayed in sync — `field-mismatch:sortOrder` = 0.
- an internal positive control confirms the oracle still returns `applied` for a valid request (proving
  the gate is not merely always-skip), WITHOUT applying it (the canonical store stays pristine).

## Safety Invariants (asserted)

- no hard delete; no folder delete / purge; no chat delete; no binding repair.
- no Chrome / mobile canonical mutation; Desktop remains the canonical authority in the model.
- no live Desktop write; no DevTools/live-profile mutation; no product runtime store imported or mutated.
- transport remains transport-only; no WebDAV/cloud/archive CAS exercised or enabled.
- proposed request/receipt schemas remain design-only and are NOT minted in runtime source.

## Gated / Blocked Postures (asserted against real source)

- `field-mismatch:sortOrder` remains GATED — the committed F11 helper still lists it in `blockedClasses`
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `binding-mismatch` remains BLOCKED and separate.
- SQLite `sort_order` remains the canonical order column (`var sortCol = 'sort_order'`).

## Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F18: PASS (in-process negative-path apply proof). Every one of the eight rejected/skipped conflict
  cases writes nothing — canonical order unchanged, mirror unchanged, zero canonical/mirror/forbidden
  writes, read-only probes, no regressions. No product runtime change; no live write; no flip; no source
  change.
- Substrate: real in-process `node:sqlite` `DatabaseSync(':memory:')` (with an in-memory-model fallback
  recorded in `sqliteMode`).
- Canonical order unchanged for all negative cases; mocked mirror unchanged for all negative cases.
- Write counters: `canonicalSortOrderWriteCount: 0`, `mirrorProjectionWriteCount: 0`, `forbiddenTotal: 0`
  across every negative case; read-only probe `writeCallCount: 0`.
- `field-mismatch:sortOrder` in the product allowed rebuild set: NOT NOW; conditionally later only after
  the full loop (F15 §7/§8/§9) is implemented + proven; the product F11 helper still blocks it.
- `binding-mismatch`: REMAINS BLOCKED, separate.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F19

F19 = a DESIGN-ONLY sortOrder absorption IMPLEMENTATION-READINESS GATE (no runtime, no writes, no flip):
an audit that enumerates exactly what a FUTURE product implementation would change (mint the two proposed
schemas; add a Desktop-side reorder-request validate+apply handler; emit the receipt; make the mirror
write-through re-project after the canonical `sort_order` write; add `field-mismatch:sortOrder` to the
F11 allowed rebuild set ONLY behind the absorption gate), lists the prerequisites proven by F15-F18 and
those still open, and records the explicit verdict that folder sortOrder absorption is STILL NOT
implemented and `productSyncReady` is STILL NOT ready to flip. This folder-sync `folder-sync-f19-*` slice
is distinct from the pre-existing `validate-f19-sync-hardening.mjs` in another lane. F19 modifies no
product source and performs no write.
