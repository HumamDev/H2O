# Saved Chat Archive — Phase I.0 Import Harness Contract

Date: 2026-06-29

Status: **PHASE I.0 CONTRACT — NOT IMPLEMENTED**

Lane: Chat Saving Architecture (Phase I — permanent import-recovery test harness,
then deferred restore/relink + export).

This is a **contract only**. It defines how to promote the one-off H.5 `node:sqlite`
runtime harness into a **permanent, repeatable repo validator/test** before any
restore/relink/export feature work begins. No harness, runtime code, or validator is
changed here.

## Baseline

```text
f5b8b4e  docs(studio): close saved chat archive phase h   (Phase H closed)
```

## Investigation summary

- Phase H proved the `.h2ochat` read-back + recovery loop end-to-end. H.5 drove the
  **real** diagnostics + inspector + importer + store adapters over a `node:sqlite`
  temp copy of `studio-v1.db`, and that high-fidelity harness **caught a real bug**
  (store snapshot rows expose `snapshotId`, not `id`) that the H.4 mocked-store harness
  had masked. That proof currently lives only in scratchpad + the H.5 evidence note —
  it is **not** a repeatable repo test.
- Repo test layout (today): validators are self-contained `check()`-style scripts under
  `tools/validation/studio/` (≈30; ≈10 `saved-chat-archive-*`), each run via
  `node tools/validation/studio/<name>.mjs`; a few release/f17 validators are wired into
  `package.json` scripts (`validate:build`, `validate:migration`, `audit:secrets`).
  There is **no dedicated `tests/` or fixtures directory**, and `node:sqlite` is
  available in the repo node (v25.2.1).
- **Key constraint the promotion must solve:** the H.5 harness used the developer's
  **live** `studio-v1.db` and a **live** archive package under AppLocalData. A permanent
  / CI test must NOT depend on user runtime data (absent in CI, non-deterministic). So
  the permanent harness must be **self-contained and deterministic** (see §2).

## 1. Purpose

- **Preserve the H.5 import-as-new proof as a repeatable test** — the import-recovery
  loop (verify → dry-run → import-as-new) is re-validated on every run, not just once.
- **Catch store-adapter shape regressions** like `snapshotId` vs `id` — i.e. the class
  of bug a mocked store hides but a real-adapter + real-SQLite run surfaces.
- **Prove no-overwrite import behavior** — INSERT-only writes; no `UPDATE`; existing
  rows + package files unchanged.
- **Protect future restore/relink/export work** — this harness is the regression gate
  that those higher-risk features (Phase I.>4 / later) must keep green.

## 2. Harness scope

- Exercises the **real** modules (no re-implementation): `store/index.js`,
  `store/snapshots.tauri.js`, `store/chats.tauri.js`,
  `ingestion/saved-chat-archive-diagnostics.tauri.js`,
  `ingestion/saved-chat-archive-inspector.studio.js`,
  `ingestion/saved-chat-archive-importer.studio.js` — loaded so they self-register on a
  Node `globalThis.H2O`.
- Uses **`node:sqlite`** (`DatabaseSync`) with a mocked
  `globalThis.__TAURI_INTERNALS__.invoke` that routes `plugin:sql|select/execute` to the
  SQLite handle and `plugin:fs|read_file/exists/read_dir` to the fixture files, and
  `globalThis.crypto = node:crypto.webcrypto` for the diagnostics SHA-256.
- **Deterministic fixture DB (preferred for the permanent test):** build a small
  **seed SQLite DB** from a committed schema (the `chats` / `snapshots` /
  `snapshot_turns` tables + the f15 protection triggers + a couple of seed rows,
  including one row that mirrors the fixture's "source" so the existing-package
  `already-imported` assertion has a target). The seed schema must be **derived from /
  pinned against** the real Desktop migrations (`src-tauri/.../studio_migrations()`),
  with a **drift check** so the test fails clearly if the real schema/triggers change
  (see §4).
  - *Dev-only fallback mode* (NOT the CI path): a temp **copy** of a live `studio-v1.db`
    (as H.5 used). The permanent test must default to the deterministic seed DB so it
    runs anywhere; the live-copy mode may remain a documented opt-in for local
    high-fidelity runs.
- **Never mutates the live Desktop DB** — only an in-memory / temp seed DB (or a temp
  *copy* in dev mode). The real `studio-v1.db` is never opened writable.
- **Generates a controlled `.h2ochat` fixture package** at run time from a committed,
  minimal source package, with a **DB-absent `chatId` and `snapshotId`** (fresh,
  collision-checked against the seed DB).
- **Recomputes manifest file hashes + `contentHash`** for the fixture
  (`sha256` of the raw `snapshot.json` bytes; for an asset-free v1 package
  `contentHash = files.snapshot.sha256`) so `inspectPackage` returns `verified`.
- Committed fixture inputs (small, reviewable) live under the harness's own area
  (e.g. a sibling `fixtures/` next to the validator); generated artifacts go to a temp
  dir and are cleaned up.

## 3. Required assertions

The harness PASSES only if ALL hold:

1. the generated fixture package **verifies** (`inspectPackage` → `status: verified`,
   `contentHashOk: true`, `hashMismatchCount: 0`, `blockers: []`);
2. `dryRunImportPackage` → **`import-ready`** (non-mutating; zero SQL writes);
3. `importVerifiedPackage({ mode: 'import-as-new' })` → **`imported`**;
4. the recovered **`newChatId` and `newSnapshotId` are fresh** (≠ the package's original
   ids);
5. **provenance records the original package ids**
   (`meta.recovered.originalChatId` / `originalSnapshotId`);
6. **seed-DB deltas**: `chats +1`, `snapshots +1`, `snapshot_turns +N`
   (N = the fixture's turn count);
7. the **SQL write verbs contain no `UPDATE`** (only `INSERT` chats / snapshots /
   snapshot_turns, plus a 0-row `DELETE` of the new snapshot's own turns);
8. **source rows + fixture files unchanged** (sampled existing chat/snapshot rows are
   byte-identical before/after; the fixture package files are unchanged);
9. a **real existing package dry-runs `already-imported`** — i.e. the seed DB contains a
   row matching a second "already-present" fixture, and its dry-run returns
   `already-imported` (this is the exact assertion that would have failed before the H.5
   `snapshotRowId()` fix);
10. the **live Desktop DB is untouched** (the harness only ever touches the seed/temp
    DB; assert no write path resolves to the real `studio-v1.db`).

## 4. Tauri parity

- **Register a stub `h2o_writer_identity()`** in the `node:sqlite` handle
  (`db.function('h2o_writer_identity', () => '')`). The real Tauri runtime registers
  this scalar via a Rust auto-extension
  (`src-tauri/src/sqlite_writer_identity.rs`); it backs the **f15 store-protection
  triggers**. Without the stub, any INSERT that fires a protection trigger throws
  `no such function: h2o_writer_identity`. The empty-string identity models a normal,
  non-protected write (the import touches no f15-protected table/column).
- **Document why** this stub exists (above) directly in the harness so a future reader
  doesn't mistake it for test-fudging.
- **Fail clearly if schema/trigger assumptions change:** the seed schema + triggers must
  be pinned to the real migrations, with an explicit **drift guard** — e.g. assert the
  set of f15 triggers / the chats+snapshots+snapshot_turns column sets match the real
  migration source, and surface a descriptive failure ("seed schema drifted from
  studio_migrations(); update the I-harness seed") rather than a cryptic SQL error.

## 5. Safety boundaries

- **No Chrome runtime** — the harness loads only Desktop store/ingestion modules.
- **No scanner / materializer invocation** — only the inspector + importer + stores.
- **No package overwrite** — import-as-new uses fresh ids; the snapshot overwrite-by-id
  primitive is never called.
- **No live DB mutation** — seed/temp DB only; the real `studio-v1.db` is never opened
  writable.
- **No sync / WebDAV / cloud / native messaging.**
- **No watcher / poller / daemon** — the harness is a single synchronous-ish run that
  exits cleanly.

## 6. Proposed phases

- **I.1** — static validator / contract-test **scaffold**: a new
  `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
  in the existing `check()` convention that asserts the harness contract + fixture
  inputs exist and are well-formed (no live run yet); records the implementation target
  + the deterministic-fixture decision.
- **I.2** — **permanent import harness implementation**: the validator runs the real
  modules over the deterministic seed DB + generated fixture and enforces all §3
  assertions; wire it into the `package.json` validate scripts.
- **I.3** — **runtime validation evidence**: capture a green run (deltas, no-UPDATE,
  already-imported, live-DB-untouched) as the durable proof.
- **I.4** — **closure**: mark Phase I (harness) closed.
- **`restore` / relink and export / share remain deferred until Phase I closes** — the
  permanent harness is the regression gate they must satisfy.

## Boundaries preserved (this contract)

Docs/evidence only. No harness, runtime code, validator, scanner/materializer/writer,
Chrome runtime/service-worker, or capability change. No `S0F0j` / `S0F1j`. f17
migration-drift untouched. No sync/appearance/ribbon dirty files touched; no `stash@{0}`
change; concurrently staged sync-lane files left untouched (pathspec-only commit).

## Validation results

```text
git diff --check / --cached --check    clean
```

## Verdict

**PHASE I.0 CONTRACT — NOT IMPLEMENTED.** This defines a deterministic, CI-safe
promotion of the H.5 `node:sqlite` runtime harness into a permanent repo validator
that re-proves the import-as-new recovery loop (verify → import-ready → imported,
+1/+1/+N, no-overwrite, already-imported detection, live-DB-untouched) and guards the
store-adapter shape against `snapshotId`-vs-`id`–class regressions — the gate that
future restore/relink and export work must keep green.

## Recommended next step after I.0

Proceed to **I.1**: add the static validator scaffold
(`validate-saved-chat-archive-import-recovery-harness-v1.mjs`) and commit a minimal,
reviewable **deterministic fixture** (a small `.h2ochat` source package + a pinned seed
schema/DB derived from `studio_migrations()`), asserting the contract + fixture
well-formedness without yet running the live import. Keep restore/relink and export
deferred until Phase I closes. Out of lane, the pre-existing **f17 migration-drift
(v13 gap)** still awaits the Desktop/sync lane.
