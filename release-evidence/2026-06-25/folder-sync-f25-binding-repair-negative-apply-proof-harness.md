# Folder Sync — Phase F25: Binding Repair NEGATIVE-PATH Apply Proof Harness (in-process, fixture-backed)

Date: 2026-07-01

## Status

IN-PROCESS / FIXTURE-BACKED BINDING REPAIR NEGATIVE-PATH APPLY PROOF HARNESS ONLY — SYNTHETIC DATA. No
product runtime behavior was implemented. No live Desktop write occurred. No DevTools / live-profile
mutation. No runtime schema minting. No product SQLite write, no product mirror write, no tombstone
write, no bind/unbind/move in product runtime, no folder delete/purge, no chat content touched.
`productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat
Saving / archive package code was touched. No product source was modified. This slice extends the F24
binding apply proof to the NEGATIVE paths: it proves that every REJECTED / SKIPPED synthetic binding
request produces ZERO canonical `folder_bindings` change and ZERO mocked mirror re-projection — the
binding apply is a no-op on every conflict case.

## Harness Substrate

The harness uses a REAL in-process SQLite database via Node's built-in `node:sqlite`
(`DatabaseSync(':memory:')`, Node v25) as the disposable canonical `folder_bindings` table (`chat_id`
PRIMARY KEY, `folder_id`, `assigned_at`), with the same guarded fallback as F24 (an in-memory
`chat_id`-keyed model recorded in `sqliteMode` if `node:sqlite` is unavailable). The store is disposable
and synthetic — never a product store, never a live Desktop DB. The render mirror is a plain in-memory
object standing in for `FOLDER_STATE_DATA_KEY.items`. F24 is NOT modified; F25 reimplements the pattern
standalone.

## Context

- F24 binding-repair apply proof committed: `6447b57`.
- F23 binding conflict-matrix harness committed: `84318d8`. F18 sortOrder negative-path harness
  precedent: `62c62b3`.
- Canonical binding store (product): SQLite `folder_bindings` (`chat_id` PK → one-folder-per-chat);
  `bindChat` = `INSERT OR REPLACE`, `unbindChat` = `DELETE`. Mirror = `FOLDER_STATE_DATA_KEY.items`
  derived projection.
- Proposed receipt schema `h2o.studio.chat-folder-binding-receipt.v1` is design-only, NOT minted.
- `binding-mismatch` remains blocked; `field-mismatch:sortOrder` remains gated; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F25)

The negative-path proof preserves the future model across Desktop Studio, Chrome / native extension
Studio across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived
per-surface render projection, hash-only / redacted diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## Apply Gate

The harness applies ONLY when the decision receipt `status === 'applied'`. Every negative fixture yields
`rejected` or `skipped`, so the apply gate never fires: no canonical `folder_bindings` write, no mirror
re-projection. Write counters are captured per case.

## Negative / Conflict Matrix (synthetic)

| Fixture | Expected status | Expected reason |
| --- | --- | --- |
| orphan-folder-binding | rejected | orphan-folder-binding |
| orphan-chat-binding | rejected | orphan-chat-binding |
| tombstoned-folder-binding | rejected | tombstoned-folder-binding |
| duplicate-request | skipped | duplicate |
| stale-basis | rejected | stale-basis |
| privacy-redaction-violation | rejected | privacy-redaction-violation |
| multi-device-concurrent-move | rejected | superseded-concurrent |
| forbidden-intent: chat-delete | rejected | forbidden-intent |
| forbidden-intent: folder-delete | rejected | forbidden-intent |
| forbidden-intent: folder-purge | rejected | forbidden-intent |

The multi-device concurrent case simulates a concurrent apply by presenting an advanced canonical binding
basis to the decision oracle (`priorAppliedInBatch: true`); the later move is rejected
`superseded-concurrent` and performs no write. The privacy-redaction case fails validation (a raw `title`
key in the request) and is rejected before any apply. The forbidden-intent cases (`chat-delete` /
`folder-delete` / `folder-purge`) are rejected before any apply — only `bind` / `unbind` / `move` are
valid intents.

## What This Proves (per negative case)

- decision `status` is `rejected` or `skipped`, with the exact expected `reason`.
- canonical `folder_bindings` rows are UNCHANGED (byte-for-byte identical to the pre-case snapshot).
- the mocked mirror `items` hash is UNCHANGED (no re-projection occurred).
- `canonicalBindingWriteCount: 0` and `mirrorProjectionWriteCount: 0` for the case.
- `forbiddenTotal: 0` (chat-delete / folder-delete / folder-purge / tombstone / WebDAV / CAS /
  runtime-source / product-sqlite / product-mirror all 0).
- a read-only drift probe stays read-only (`writeCallCount: 0`).
- one-folder-per-chat still holds (`chat_id` PK; every chat maps to exactly one folder).
- no chat is lost (every seeded chat id remains present).
- an internal positive control confirms the oracle still returns `applied` for a valid request (proving
  the gate is not merely always-reject), WITHOUT applying it (the canonical store stays pristine).

## Safety Invariants (asserted)

- no chat delete; no folder delete / purge; no tombstone mutation.
- no Chrome / mobile canonical mutation; Desktop remains the canonical authority in the model.
- no live Desktop write; no DevTools/live-profile mutation; no product runtime store imported or mutated;
  no product SQLite write; no product mirror write.
- transport remains transport-only; no WebDAV/cloud/archive CAS exercised or enabled.
- proposed receipt schema remains design-only and is NOT minted in runtime source.

## Gated / Blocked Postures (asserted against real source)

- `binding-mismatch` remains BLOCKED — the committed F11 helper still lists it in `blockedClasses`
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`).
- `field-mismatch:sortOrder` remains GATED.
- canonical `folder_bindings` + `bindChat` (`INSERT OR REPLACE`) / `unbindChat` (`DELETE`) remain intact.

## Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F25: PASS (in-process binding negative-path apply proof). Every one of the ten rejected/skipped
  conflict cases writes nothing — canonical `folder_bindings` unchanged, mirror unchanged, zero
  canonical/mirror/forbidden writes, read-only probes, one-folder-per-chat preserved, no chat lost. No
  product runtime change; no live write; no flip; no source change.
- Substrate: real in-process `node:sqlite` `DatabaseSync(':memory:')` canonical `folder_bindings` table
  (with an in-memory-model fallback recorded in `sqliteMode`).
- Canonical binding rows unchanged for all negative cases; mocked mirror unchanged for all negative
  cases.
- Write counters: `canonicalBindingWriteCount: 0`, `mirrorProjectionWriteCount: 0`, `forbiddenTotal: 0`
  across every negative case; read-only probe `writeCallCount: 0`.
- `binding-mismatch`: REMAINS BLOCKED. `field-mismatch:sortOrder`: REMAINS GATED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F26

F26 = a DESIGN-ONLY binding repair IMPLEMENTATION-READINESS GATE (the binding analog of the F19 sortOrder
readiness gate; no runtime, no writes, no flip): enumerate exactly what a FUTURE product implementation of
the binding repair loop would change (mint the proposed receipt schema; add the Desktop
validate/apply/receipt handler over `folder_bindings`; make the mirror `items` write-through re-project;
only-then allow `binding-mismatch` into a reviewed repair path), separate the prerequisites proven by
F21-F25 from the open blockers (product runtime implementation, live Desktop dry-run + controlled apply
proofs, Chrome/native/mobile submission, multi-device import), and record the explicit verdict that
binding repair is STILL NOT implemented and `productSyncReady` is STILL NOT ready to flip. Keep
`binding-mismatch` blocked, `field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving
CAS blocked. F26 modifies no product source and performs no write.
