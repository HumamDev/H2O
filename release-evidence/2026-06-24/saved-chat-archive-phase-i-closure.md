# Saved Chat Archive — Phase I Closure

Date: 2026-06-29

Status: **PHASE I CLOSED — IMPORT RECOVERY HARNESS PROVEN**

Lane: Chat Saving Architecture (Phase I — permanent import-recovery test harness).

## I chain (commits)

```text
030db29  docs(studio): define archive import harness contract        (I.0 contract)
c073ee3  test(studio): scaffold archive import recovery harness      (I.1 scaffold)
0cdbc86  test(studio): add archive import recovery harness           (I.2 permanent harness)
3e15417  docs(studio): record archive import harness validation      (I.3 validation wiring)
```

## What Phase I proves

Phase H built and proved the `.h2ochat` recovery loop, but its H.5 runtime proof was a
**one-off** `node:sqlite` harness in scratchpad — not repeatable. Phase I promoted that
proof into a **permanent, deterministic repo validator** that re-runs the whole loop on
demand and guards it against regression:

- The H.5 one-off import proof is now a permanent validator,
  `tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`.
- It uses a **deterministic committed fixture + an inline seed DB**, never the live
  developer `studio-v1.db` (and no committed binary DB).
- It runs the **real** diagnostics, inspector, importer, and chats/snapshots **store
  adapters** over `node:sqlite` (only the Tauri JS↔Rust bridge is mocked).
- It **stubs `h2o_writer_identity()`** to match Tauri trigger behavior — the f15
  `BEFORE INSERT ON chats` protection trigger references it, so SQLite must resolve the
  function at compile time for any `chats` INSERT (the exact H.5 finding).
- It has a **schema/trigger drift guard** that fails clearly if the real Tauri schema
  (`lib.rs studio_migrations()`) or the f15 chats protection / `h2o_writer_identity`
  scalar (`sqlite_writer_identity.rs`) drift from the seed's assumptions.
- It proves, on every run (harness `PASS 25`):

  ```text
  inspectPackage            -> verified (contentHashOk, blockers [])
  dryRunImportPackage       -> import-ready (0 writes)
  importVerifiedPackage     -> imported
  recovered chatId          -> fresh (!= package chatId; e.g. recovered_<uuid>)
  recovered snapshotId      -> fresh (store-generated)
  provenance                -> meta.recovered.original{Chat,Snapshot}Id = the package ids
  DB deltas                 -> chats +1, snapshots +1, snapshot_turns +N (N = fixture messages)
  write verbs               -> INSERT chats + INSERT snapshots + INSERT snapshot_turns
                               (+ a 0-row DELETE of the new snapshot's own turns) — NO UPDATE
  source rows / fixture files-> byte-identical before/after (no overwrite)
  already-imported package  -> already-imported (dry-run) + no-op import (0 writes)
  live Desktop DB           -> never opened/mutated (seed DB is a temp file)
  ```

- **I.3 decided `package.json` remains unchanged**, because saved-chat archive validators
  are not currently package-scripted (0 of 18 are; package.json scripts are release/lane
  gates only). The canonical command is documented instead:

  ```bash
  node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs
  ```

## Why this matters (regression protection)

The harness is the permanent gate over the H.4 importer and the H.5 proof. It catches the
exact bug class the live-DB harness first surfaced — the store maps the `snapshots.id`
column to the JS key `snapshotId`, not `.id` — which a mocked-store test cannot see: the
`[LESSON]` checks lock the importer's `snapshotRowId()` fix statically, and the live run
would fail (empty `newSnapshotId`; a real package mis-decided as `conflict-chat-id`) if it
regressed.

## Boundaries preserved

- **No live DB mutation** — deterministic temp seed DB; the live `studio-v1.db` is only
  `stat`-ed as an optional untouched-witness (guarded by `existsSync`, CI-safe).
- **No Chrome runtime / service-worker** change.
- **No scanner / materializer / writer** change.
- **No `restore` / relink implementation.**
- **No export / share implementation.**
- **No sync / WebDAV / cloud / native messaging.**
- **No watcher / daemon.**
- **No capability change.**
- **`stash@{0}` untouched** (the appearance/ribbon WIP stash).
- **f17 migration-drift untouched.**
- Every Phase I commit was pathspec-only; the concurrent sync lane committed repeatedly on
  shared `main` throughout and was never disturbed.

## Deferred work

- **`restore` / relink** mode remains **deferred** (verification-gated re-link onto the
  original ids — higher risk; its own no-clobber design + harness assertion).
- **Package export / share** runtime remains **deferred** (still validator-forbidden).
- A **studio / archive aggregate validation gate** (mirroring `gate:library`) could be
  introduced later; this harness should join it if/when the studio lane adopts one.
- **f17 migration-drift (v13 gap)** in `src-tauri/lib.rs studio_migrations()` remains a
  separate Desktop/sync-lane task.
- The **appearance/ribbon `stash@{0}`** remains a separate lane's WIP.

## Phase I evidence trail

```text
release-evidence/2026-06-24/saved-chat-archive-phase-i0-import-harness-contract.md
release-evidence/2026-06-24/saved-chat-archive-phase-i1-import-harness-scaffold.md
release-evidence/2026-06-24/saved-chat-archive-phase-i2-import-harness-runtime.md
release-evidence/2026-06-24/saved-chat-archive-phase-i3-import-harness-validation-wiring.md
release-evidence/2026-06-24/saved-chat-archive-phase-i-closure.md   (this note)
```

## Validation results

```text
validate-saved-chat-archive-import-recovery-harness-v1.mjs   PASS 25 checks
validate-saved-chat-archive-recovery-import-export-v1.mjs    PASS 34 checks
git diff --check / --cached --check                          clean
```

## Verdict

**PHASE I CLOSED — IMPORT RECOVERY HARNESS PROVEN.** The H.5 one-off import proof is now a
permanent, deterministic `node:sqlite` validator that runs the real diagnostics / inspector
/ importer / store adapters over a seed DB (with the `h2o_writer_identity()` parity stub
and a schema/trigger drift guard), re-proving the import-as-new loop — verify →
import-ready → imported, +1 chat / +1 snapshot / +N turns, fresh ids, provenance, no
`UPDATE`, already-imported no-op, live DB untouched — on every run. It is the regression
gate protecting H.4/H.5. restore/relink and export remain deferred.

## Recommended next milestone

**Phase J — deferred recovery modes + export**, each on its own slice and each gated by the
Phase I harness: (1) the verification-gated **`restore` / relink** import mode (re-link a
verified package onto its original ids with explicit no-clobber handling + a new harness
assertion), and (2) the **package export / share** runtime (lift the current validator
forbiddance behind an explicit, Desktop-only path). A studio/archive **aggregate gate**
could be introduced alongside. Out of lane, the pre-existing **f17 migration-drift (v13
gap)** still awaits the Desktop/sync lane.
