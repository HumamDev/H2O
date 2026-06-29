# Saved Chat Archive — Phase I.2 Import Harness Runtime

Date: 2026-06-29

Status: **I.2 IMPORT RECOVERY HARNESS — PASSED**

Lane: Chat Saving Architecture (Phase I — permanent import-recovery test harness).

I.2 turns the I.1 scaffold into the real permanent harness: the same validator file
now builds a deterministic seed `node:sqlite` DB, registers the Tauri
`h2o_writer_identity()` stub, loads the **real** diagnostics / inspector / importer /
store adapters, and proves the import-as-new recovery loop end-to-end — without
depending on or mutating the developer's live `studio-v1.db`.

## Baseline

```text
030db29  docs(studio): define archive import harness contract        (I.0)
c073ee3  test(studio): scaffold archive import recovery harness      (I.1)
```

## Seed DB / schema strategy

Deterministic by default — **no live-DB dependency**. The harness builds a throwaway
seed DB in a temp dir from an inline `SEED_SCHEMA` string (no committed binary DB):

- the three tables the importer touches — `chats`, `snapshots`, `snapshot_turns` —
  mirrored from the real Tauri schema, plus the two f15 `chats.category_id` protection
  triggers (`BEFORE INSERT` / `BEFORE UPDATE OF category_id`) that reference
  `h2o_writer_identity()`. Because `validateSavedChatPackageV1` is fs/hash-only (no
  store query), no other tables are needed.
- two **seed rows** (a chat + a snapshot under the source fixture's identity, with the
  source `metadata.digest`) so the **already-imported** case has a real target.
- a **schema/trigger drift guard**: before building, the harness asserts the real
  source still declares the three tables (`lib.rs studio_migrations()`), the
  `h2o_writer_identity` scalar (`sqlite_writer_identity.rs`), and the f15 chats
  `category_id` protection (`lib.rs`). If any drift, it throws
  `SCHEMA/TRIGGER DRIFT — update the I.2 seed schema: …` and the run fails clearly.
- a temp **copy** of a live `studio-v1.db` remains a documented dev-only option; it is
  **not** the path taken here.

## h2o_writer_identity stub behavior

`h2o_writer_identity()` is registered on the `node:sqlite` handle as
`db.function('h2o_writer_identity', () => '')` — **before** any `chats` INSERT. The real
Tauri runtime registers this scalar via a Rust auto-extension
(`sqlite_writer_identity.rs`); the f15 `BEFORE INSERT ON chats` trigger references it, so
SQLite must resolve the function at statement-compile time for *any* `chats` INSERT
(even when `category_id` is empty and the trigger body is skipped). Without the stub the
import throws `no such function: h2o_writer_identity` — exactly the H.5 finding. The
empty-string identity models a normal, non-f15-protected write (the import sets no
`category_id`, so the protection never aborts).

## Fixture identity

```text
source (already-imported target, committed):
  dir/chatId:  i-harness-source.h2ochat / i-harness-source
  snapshotId:  snap_i_harness_source     (seeded into the DB → dry-runs already-imported)
import-ready (generated in-harness from the source, fresh DB-absent identity):
  dir/chatId:  i-harness-import-ready-chat.h2ochat / i-harness-import-ready-chat
  snapshotId:  snap_i_harness_import_ready
  (manifest hashes + contentHash recomputed; 2 messages)
```

(The diagnostics require the package folder basename to equal `chatId + '.h2ochat'`, so
both fixtures are named after their chatId — now asserted statically too.)

## Runtime proof (real modules over the seed DB)

**inspect** — `inspectPackage(import-ready)`:

```text
status: verified   ok: true   contentHashOk: true   blockers: []
```

**dry-run** — `dryRunImportPackage(import-ready)`:

```text
decision: import-ready   sql writes during dry-run: 0
```

**import** — `importVerifiedPackage(import-ready, mode: import-as-new)`:

```text
status: imported
newChatId:        recovered_4444b890-f033-4aea-846b-0f5958d1c746   (fresh; != package chatId)
newSnapshotId:    snap_7f726a6b-9c9f-45c8-8872-28e3c93a8ce6        (fresh; store-generated)
originalChatId:   i-harness-import-ready-chat                      (provenance)
originalSnapshotId: snap_i_harness_import_ready                    (provenance)
new chat title:   "Recovered: I-Harness Import Recovery Fixture"
```

(The recovered ids are freshly generated per run; the values above are one example.)

## DB delta proof (seed DB)

```text
                  delta   new row present
chats              +1     yes
snapshots          +1     yes
snapshot_turns     +2     yes (= the fixture's 2 messages)
recovered snapshot meta.recovered.originalChatId   = i-harness-import-ready-chat
recovered snapshot meta.recovered.originalSnapshotId = snap_i_harness_import_ready
```

## No-UPDATE proof (write verbs during import)

```text
INSERT chats          (1 row)
INSERT snapshots      (1 row)
DELETE snapshot_turns (0 rows)   <- the fresh snapshot's own turns; none exist, nothing deleted
INSERT snapshot_turns (2 rows)
any UPDATE? NO        -> no existing row overwritten
```

Source rows byte-identical before/after (`srcChatRow` + `srcSnapRow` unchanged), and the
import-ready fixture files unchanged.

## Already-imported proof

`dryRunImportPackage(source)` (its snapshot + digest are seeded) → `already-imported`;
`importVerifiedPackage(source)` → `already-imported` **no-op** with **0** SQL writes.

## Live DB untouched proof

The seed DB is a temp file (`seedIsTemp: true`); the harness routes all `plugin:sql`
to it and never opens `studio-v1.db`. As an optional witness, the live DB's mtime/size
were captured before/after and are unchanged (`untouched: true`; in CI where the live DB
is absent this is trivially satisfied). The harness never opened the live DB writable.

## Implementation summary

- Extended `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`:
  the I.1 static checks remain, the "stays static" self-check is replaced by the live
  run, and an async `runHarness()` builds the seed DB + drift guard + stub, loads the
  real modules via `createRequire`, mocks `__TAURI_INTERNALS__.invoke`
  (`plugin:fs` → temp fixtures, `plugin:sql` → seed DB), and runs inspect → dry-run →
  import (+ the already-imported case), returning a captured proof object asserted by the
  `[I.2]` checks. The validator `process.exit`s explicitly (the store adapters schedule a
  background init timer).
- Regenerated the committed source fixture so its `chatId` (`i-harness-source`) equals its
  folder basename (diagnostics requirement); added a static dir-basename assertion.

## Validation results

```text
node --check validate-saved-chat-archive-import-recovery-harness-v1.mjs   OK
validate-saved-chat-archive-import-recovery-harness-v1.mjs                PASS 25 checks
validate-saved-chat-archive-recovery-import-export-v1.mjs                 PASS 34 checks
validate-studio-archive-health-ui.mjs                                     all 19 checks passed
git diff --check / --cached --check                                       clean
live studio-v1.db after the run: untouched (seed DB was a temp copy-free build)
```

## Boundaries preserved

- No live-DB dependency or mutation (deterministic temp seed DB; live DB only stat'd as
  an optional untouched-witness). No runtime importer / inspector / store-adapter change
  (the harness loads them read-as-is). No Chrome runtime/service-worker; no
  scanner/materializer/writer; no capability change. No watcher/daemon; no
  sync/WebDAV/cloud/native. No `S0F0j` / `S0F1j`. f17 migration-drift untouched. No
  sync/appearance/ribbon dirty files touched; `stash@{0}` untouched; concurrently staged
  sync-lane files left untouched (pathspec-only commit).
- **`restore` / relink and export / share remain deferred** until Phase I closes.

## Verdict

**I.2 IMPORT RECOVERY HARNESS — PASSED.** The permanent harness runs the real
diagnostics / inspector / importer / store adapters over a deterministic seed
`node:sqlite` DB (with the Tauri `h2o_writer_identity()` parity stub and a schema/trigger
drift guard) and re-proves the import-as-new recovery loop on every run: verified →
import-ready → imported, fresh ids, provenance, `chats +1` / `snapshots +1` /
`snapshot_turns +2`, **no `UPDATE`** (INSERT-only), already-imported no-op, and the live
Desktop DB untouched. This is the regression gate the I.0 contract called for.

## Recommended next step after I.2

Proceed to **I.3** — capture this as durable runtime-validation evidence and (optionally)
wire the harness into the `package.json` validate scripts so it runs in CI, then **I.4**
to close Phase I. Keep restore/relink + export deferred until I closes. Out of lane, the
pre-existing **f17 migration-drift (v13 gap)** still awaits the Desktop/sync lane.
