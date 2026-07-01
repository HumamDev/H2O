# Folder Sync — Phase F24: Binding Repair APPLY Proof Harness (in-process, fixture-backed)

Date: 2026-07-01

## Status

IN-PROCESS / FIXTURE-BACKED BINDING REPAIR APPLY PROOF HARNESS ONLY — SYNTHETIC DATA. No product runtime
behavior was implemented. No live Desktop write occurred. No DevTools / live-profile mutation. No runtime
schema minting. No product SQLite write, no product mirror write, no tombstone write, no bind/unbind/move
in product runtime, no folder delete/purge, no chat content touched. `productSyncReady` was NOT flipped.
No `fullBundle.v3` was minted. No WebDAV/cloud/archive CAS. No Chat Saving / archive package code was
touched. No product source was modified. This slice proves — on a disposable in-process canonical
`folder_bindings` table + a mocked `FOLDER_STATE_DATA_KEY.items` mirror — that ACCEPTED synthetic
bind/move requests, applied only to canonical `folder_bindings` and then re-projected into the mirror,
make `binding-mismatch` reconverge, with the write counter bounded to the temp canonical `folder_bindings`
and the mocked mirror projection only, and one-folder-per-chat preserved.

## Harness Substrate

The harness uses a REAL in-process SQLite database via Node's built-in `node:sqlite`
(`DatabaseSync(':memory:')`, Node v25) as the disposable canonical `folder_bindings` table (`chat_id`
PRIMARY KEY, `folder_id`, `assigned_at`), mirroring the product V1 `chat_id`-PK one-folder-per-chat
constraint. If `node:sqlite` is unavailable in a given runtime, the harness falls back to an equivalent
in-memory `chat_id`-keyed model and records `sqliteMode` in its output. The store is disposable and
synthetic — never a product store, never a live Desktop DB. The render mirror is a plain in-memory object
standing in for `FOLDER_STATE_DATA_KEY.items`.

## Context

- F23 binding envelope + conflict-matrix harness committed: `84318d8`.
- F22 binding-repair request/receipt spec committed: `5c3dd88`. F17 sortOrder apply proof precedent:
  `c3b24ba`.
- Canonical binding store (product): SQLite `folder_bindings` (`chat_id` PK → one-folder-per-chat);
  `bindChat` = `INSERT OR REPLACE`, `unbindChat` = `DELETE`. Mirror = `FOLDER_STATE_DATA_KEY.items`
  derived projection.
- Proposed receipt schema `h2o.studio.chat-folder-binding-receipt.v1` is design-only, NOT minted.
- `binding-mismatch` remains blocked; `field-mismatch:sortOrder` remains gated; `productSyncReady`
  remains false; public/premium blocked; real remote WebDAV deferred; Chat Saving WebDAV/cloud/archive
  CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F24)

The apply proof preserves the future model across Desktop Studio, Chrome / native extension Studio across
MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface render
projection, hash-only / redacted diagnostics. Mobile, remote WebDAV, and Chat Saving CAS are NOT
implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## Harness Steps (synthetic)

1. seed a temp canonical `folder_bindings` table with synthetic tokenized bindings
   (chat_a→folder_x, chat_b→folder_y).
2. project a mocked mirror `items` that is STALE/out-of-sync (e.g. chat_a still shown under folder_x
   while a pending accepted move sends it to folder_y; chat_c missing) — this is the drift to clear.
3. build ACCEPTED synthetic requests in the F22/F23 envelope shape: an accepted `bind`
   (chat_c→folder_x) and an accepted `move` (chat_a: folder_x→folder_y).
4. APPLY the accepted requests ONLY to canonical `folder_bindings` (`INSERT OR REPLACE` for bind/move),
   counting canonical binding writes; the `chat_id` PRIMARY KEY guarantees one-folder-per-chat.
5. read-only DRIFT PROBE #1 (BEFORE re-projection): expect `binding-mismatch` present (canonical moved,
   mirror stale).
6. RE-PROJECT the mocked mirror `items` from canonical `folder_bindings` (mocked mirror write only).
7. read-only DRIFT PROBE #2 (AFTER re-projection): expect `binding-mismatch` = 0, and no
   `missing-mirror-folder`, `field-mismatch:color`, or `field-mismatch:sortOrder` regression.
8. assert the write counter is bounded to canonical `folder_bindings` (temp) + mocked mirror projection;
   all forbidden write counters (chat-delete / folder-delete / folder-purge / tombstone / WebDAV / CAS /
   runtime-source / product-sqlite / product-mirror) are 0.

## What This Proves

- BINDING APPLY: accepted bind/move applied only to canonical `folder_bindings` moves canonical binding
  state without touching chats, folders, tombstones, or ordering.
- ONE-FOLDER-PER-CHAT: the `chat_id` PRIMARY KEY (`INSERT OR REPLACE`) guarantees each chat maps to
  exactly one folder after apply; the harness asserts every chat's canonical binding count is 1.
- RECONVERGENCE: `binding-mismatch` is PRESENT after the canonical apply (BEFORE re-projection) and
  CLEARS to 0 AFTER the mirror is re-projected from canonical — the mirror is a strict derived projection
  of canonical bindings.
- NO REGRESSION: `missing-mirror-folder`, `field-mismatch:color`, and `field-mismatch:sortOrder` stay 0
  across both probes.
- NO CHAT LOST: every synthetic chat id present before apply is still present after (bind/move never
  drops a chat); no chat content is touched.
- BOUNDED WRITES: only two write channels are exercised — temp canonical `folder_bindings` and the mocked
  mirror projection. Every forbidden write counter is 0.
- READ-ONLY PROBES: each drift probe performs no write (`probeWriteCallCount: 0`).
- REDACTED: all chat/folder identifiers in the emitted evidence are hash-only (`sha256:` tokens); no raw
  names/titles/content.

## Safety Invariants (asserted)

- no chat delete; no folder delete / purge; no tombstone mutation.
- no Chrome / mobile canonical mutation (only the temp canonical table is written, standing in for
  Desktop); Desktop remains the canonical authority in the model.
- no live Desktop write; no DevTools/live-profile mutation; no product runtime store imported or mutated;
  no product SQLite write; no product mirror write.
- transport remains transport-only; no WebDAV/cloud/archive CAS exercised or enabled.
- proposed receipt schema remains design-only and is NOT minted in runtime source.

## Gated / Blocked Postures (asserted against real source)

- `binding-mismatch` remains BLOCKED — the committed F11 helper still lists it in `blockedClasses`
  (`classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])`). The reconvergence
  proved here is on the SYNTHETIC harness, not the product rebuild path; the product F11 helper still
  does not repair bindings.
- `field-mismatch:sortOrder` remains GATED.
- canonical `folder_bindings` + `bindChat` (`INSERT OR REPLACE`) / `unbindChat` (`DELETE`) remain intact.

## Preserved Postures

- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F24: PASS (in-process fixture-backed binding apply proof). Accepted synthetic bind/move applied to a
  temp canonical `folder_bindings`, then re-projected into a mocked mirror, make `binding-mismatch`
  reconverge, with bounded writes, one-folder-per-chat preserved, no chat lost, no regressions, and no
  forbidden mutation. No product runtime change; no live write; no flip; no source change.
- Substrate: real in-process `node:sqlite` `DatabaseSync(':memory:')` canonical `folder_bindings` table
  (with an in-memory-model fallback recorded in `sqliteMode`).
- Drift before re-projection: `binding-mismatch` present; after re-projection: 0. No
  missing-mirror / color / sortOrder regressions.
- Write counter: bounded to temp canonical `folder_bindings` + mocked mirror projection; forbidden writes
  0.
- `binding-mismatch` in the product allowed rebuild set: NOT NOW; conditionally later only after the full
  binding repair loop (F22 §7 validators + live proofs) is implemented + proven; the product F11 helper
  still blocks it.
- `field-mismatch:sortOrder`: REMAINS GATED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F25

F25 = an IN-PROCESS binding repair NEGATIVE-PATH apply harness (the binding analog of the F18 sortOrder
negative harness; still no product runtime change, no live write, no flip): extend F24 so REJECTED /
SKIPPED synthetic binding requests (orphan-folder-binding, orphan-chat-binding, tombstoned-folder-binding,
stale-basis, duplicate-request, privacy-redaction-violation, superseded-concurrent, forbidden-intent)
produce NO canonical `folder_bindings` change and NO mirror re-projection (write counter 0 on every
non-applied case), proving the binding apply is safe on the negative paths too — keeping the proposed
receipt schema design-only, `binding-mismatch` blocked, `field-mismatch:sortOrder` gated,
`productSyncReady` false, and Chat Saving CAS blocked. F25 modifies no product source and performs no live
write.
