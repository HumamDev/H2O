# Saved Chat Archive — Phase I.1 Import Harness Scaffold

Date: 2026-06-29

Status: **I.1 IMPORT RECOVERY HARNESS SCAFFOLD — PASSED**

Lane: Chat Saving Architecture (Phase I — permanent import-recovery test harness).

This slice implements the I.0 decision as a **static scaffold**: a new scaffold
validator, a deterministic repo-committed `.h2ochat` fixture, and a fixture README that
locks the seed-DB / Tauri-parity / drift-guard strategy — **without** running the live
import harness (that is I.2).

## Baseline

```text
f5b8b4e  docs(studio): close saved chat archive phase h           (Phase H closed)
030db29  docs(studio): define archive import harness contract     (I.0 contract)
```

## Investigation summary

- Repo test layout: validators are self-contained `check()`-style scripts under
  `tools/validation/studio/`, run via `node tools/validation/studio/<name>.mjs`; the
  f17/release validators are wired into `package.json` (`validate:build`,
  `validate:migration`, `audit:secrets`). The studio archive validators are not yet
  scripted — I.2 may add one.
- There is **no existing validation-fixtures convention** (only an unrelated
  `packages/host-adapters/claude/fixtures`), so I created
  `tools/validation/fixtures/saved-chat-archive/import-recovery/` per the I.0 suggestion.
- `node:sqlite` is available in the repo node (v25.2.1) — confirmed for the I.2 live
  harness, but **not used** in I.1 (this scaffold stays static).
- The f17 migration-drift (v13 gap) caveat persists and is **not** touched here.

## Scaffold summary

1. **Static scaffold validator**
   `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
   (17 checks: `[I.0]` contract, `[SCAFFOLD]` artifacts + fixture well-formedness,
   `[LESSON]` H.5 lessons, `[BOUNDARY]` boundaries + static-only). It reads docs/source
   and **recomputes the fixture file hashes** (pure file ops via `node:crypto`); it does
   **not** load `node:sqlite`, the Tauri runtime, or the store/importer modules, and runs
   no import — a self-check asserts exactly that, locking the I.1↔I.2 boundary.

2. **Deterministic fixture**
   `tools/validation/fixtures/saved-chat-archive/import-recovery/i-harness-source.h2ochat/`
   — a minimal, fully self-consistent v1 `.h2ochat` **source** package (no assets; two
   messages: one user + one assistant), with fixed ids
   (`i-harness-fixture-src-chat` / `snap_i_harness_fixture_src`), fixed timestamps, and
   stable 2-space JSON, so its hashes never drift:

   ```text
   files:        manifest.json + snapshot.json + chat.md + chat.html
   snapshot sha: sha256-ee831ea2f67358ba1f0875bc580aa4d4d633f5605b6feb1e5999f3526c0fbb0d
   contentHash:  = files.snapshot.sha256 (v1 asset-free rule)
   messages:     2   schemaVersion: 1   assets: []
   provenance:   isImportHarnessFixture: true (marked test data, not user data)
   ```

3. **Fixture README**
   `tools/validation/fixtures/saved-chat-archive/import-recovery/README.md` — documents
   that these are test fixtures (not user data), how I.2 will generate a conflict-free
   fixture from this source (fresh DB-absent ids + recomputed hashes), the **seed-DB
   strategy** (deterministic seed preferred; live `studio-v1.db` **copy** is a dev-only
   opt-in, never the CI path; live DB never opened writable), the **Tauri parity** stub
   (`h2o_writer_identity()` registered on the `node:sqlite` handle, with rationale), and
   the **schema/trigger drift guard** requirement.

## What the scaffold validator asserts (17 checks)

- **[I.0]** the contract exists + is `NOT IMPLEMENTED`; documents the deterministic seed
  strategy (preferred seed / dev-only live-copy / drift guard / no live mutation); the
  harness coverage (`import-ready`, `imported`, `already-imported`, `chats +1`,
  `snapshots +1`, `turns +N`, provenance, no `UPDATE`, live DB untouched); and Tauri
  parity + the restore/relink + export deferrals.
- **[SCAFFOLD]** the validator, fixture dir, `*.h2ochat` package, and README all exist;
  the README documents seed/parity/drift/deferrals; the fixture has all four required
  files; **its hashes recompute and match the manifest**; it is a verifiable v1
  asset-free package (`contentHash = sha256(snapshot.json)`, `schemaVersion 1`, no
  assets); identity is consistent and `snapshot.messages[]` is non-empty.
- **[LESSON]** locked against the real importer + documented: store rows expose
  `snapshotId` not `id` (`snapshotRowId()` present); import-as-new uses a fresh id,
  `snapshots.create` with **no `snapshotId` in the patch**, and never the overwrite-by-id
  primitive; **no raw `UPDATE` SQL**; the `h2o_writer_identity()` stub requirement is
  documented (I.0 + README).
- **[BOUNDARY]** the importer has no Chrome/scanner/materializer/watcher/sync coupling
  (regression lock); **I.1 stays static** (the scaffold validator loads no DB driver /
  Tauri runtime / store-importer module and runs no import); the I.1 evidence defers
  restore/relink/export until Phase I closes.

## Boundaries preserved

- Static validator / fixture / evidence only — **no live harness run** (deferred to I.2).
- No live DB mutation (the scaffold never opens a DB). No runtime importer / inspector /
  store-adapter change. No Chrome runtime/service-worker; no scanner/materializer/writer;
  no capability change. No watcher/daemon; no sync/WebDAV/cloud/native. No `S0F0j` /
  `S0F1j`. f17 migration-drift untouched. No sync/appearance/ribbon dirty files touched;
  `stash@{0}` untouched; concurrently staged sync-lane files left untouched (pathspec-only
  commit).
- **`restore` / relink and export / share remain deferred** until Phase I (the harness)
  closes.

## Validation results

```text
node --check validate-saved-chat-archive-import-recovery-harness-v1.mjs   OK
validate-saved-chat-archive-import-recovery-harness-v1.mjs                PASS 17 checks
validate-saved-chat-archive-recovery-import-export-v1.mjs                 PASS 34 checks
validate-studio-archive-health-ui.mjs                                     all 19 checks passed
git diff --check / --cached --check                                       clean
```

## Verdict

**I.1 IMPORT RECOVERY HARNESS SCAFFOLD — PASSED.** The permanent harness now has a
static scaffold: a deterministic, hash-verified `.h2ochat` source fixture; a README that
pins the seed-DB / Tauri-parity / drift-guard strategy; and a scaffold validator that
locks the I.0 contract and the H.5 lessons against the real importer while asserting it
runs no live import itself. restore/relink and export stay deferred until Phase I closes.

## Recommended next step after I.1

Proceed to **I.2** — implement the permanent live harness: build the deterministic seed
`node:sqlite` DB (schema/triggers pinned to `studio_migrations()` with the drift guard),
register the `h2o_writer_identity()` stub, generate a conflict-free fixture from
`i-harness-source.h2ochat`, run the real diagnostics/inspector/importer/store adapters,
and enforce all the §3 assertions (verify → import-ready → imported, +1/+1/+N,
provenance, no `UPDATE`, already-imported, live DB untouched); then wire it into the
`package.json` validate scripts. Keep restore/relink + export deferred until I closes.
Out of lane, the pre-existing **f17 migration-drift (v13 gap)** still awaits the
Desktop/sync lane.
