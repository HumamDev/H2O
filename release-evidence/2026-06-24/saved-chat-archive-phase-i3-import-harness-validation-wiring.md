# Saved Chat Archive — Phase I.3 Import Harness Validation Wiring

Date: 2026-06-29

Status: **I.3 IMPORT RECOVERY HARNESS VALIDATION WIRING — PASSED**

Lane: Chat Saving Architecture (Phase I — permanent import-recovery test harness).

I.3 makes the I.2 harness durable and easy to run in the validation flow, and records
the canonical command. The decision below is **evidence-only** (no `package.json`
change) because that matches the repo's established convention.

## Baseline

```text
030db29  docs(studio): define archive import harness contract        (I.0)
c073ee3  test(studio): scaffold archive import recovery harness      (I.1)
0cdbc86  test(studio): add archive import recovery harness           (I.2 live harness)
```

## Investigation summary

- **`package.json` scripts are release / lane gates only.** The validation-related
  scripts are `gate:library` (`tools/validation/sync/run-f16-production-release-gate.mjs`),
  `audit:secrets`, `validate:build`, `validate:migration`
  (`tools/validation/release/validate-f17-*.mjs`), and `evidence:bundle`. They are
  production gates, not individual feature validators.
- **No studio validator is scripted.** There are **18** `validate-saved-chat-archive-*.mjs`
  validators under `tools/validation/studio/`, and **0** of them appear in `package.json`
  or in any aggregate runner. (`pack-studio.mjs` mentions the archive modules, but it is
  the build packer, not a validator runner.)
- **No studio/archive aggregate gate exists** (there is a `run-f16-…-gate.mjs` for the
  sync/library lane, but no studio equivalent), so there is no existing grouping to add
  this harness to.
- `node:sqlite` is available in the repo node (v25.2.1); the harness runs standalone.

## package.json decision

**Left intentionally unchanged.** Adding this harness as a `package.json` script would
make it the *first* studio validator scripted — out of step with the convention where the
18 archive validators (and the rest of the ~30 studio validators) are run individually
via `node tools/validation/studio/<name>.mjs`, and only release/lane **gates** are
scripted. Forcing a one-off script here would be inconsistent and misleading (it would
imply a grouping that does not exist). Per the I.3 guidance, the canonical command is
documented instead. (If a studio/archive aggregate gate is introduced later — e.g. a
`run-archive-…-gate.mjs` mirroring the f16 library gate — this harness should be added to
*that* grouping at that time; that is an I.4/closure or later consideration, not a
convention break now.)

## Canonical command

```bash
node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs
```

Self-contained and deterministic: it builds a throwaway temp seed `node:sqlite` DB, runs
the real diagnostics / inspector / importer / store adapters, and exits non-zero on any
failure (it calls `process.exit`). No arguments, no setup, no network.

## Validation output

```text
node --check validate-saved-chat-archive-import-recovery-harness-v1.mjs   OK
validate-saved-chat-archive-import-recovery-harness-v1.mjs                PASS 25 checks
validate-saved-chat-archive-recovery-import-export-v1.mjs                 PASS 34 checks
git diff --check / --cached --check                                       clean
live studio-v1.db after running the harness:  29 snapshots / 41 chats (untouched)
```

The 25 checks are: `[I.0]` contract (4) + `[SCAFFOLD]` artifacts/fixture well-formedness
(5) + `[LESSON]` H.5 lessons (4) + `[I.2]` live run (10) + evidence/deferral (2).

## Why this protects H.5 / H.4

- It is the **permanent regression gate** for the import-recovery loop H.4 implemented
  and H.5 first proved. Every run re-verifies, against the **real** importer + store
  adapters over real SQLite, that: `inspectPackage` → `verified`,
  `dryRunImportPackage` → `import-ready`, `importVerifiedPackage` → `imported`, with
  `chats +1` / `snapshots +1` / `snapshot_turns +N`, fresh recovered ids, recorded
  provenance, **no `UPDATE`** (no overwrite), an `already-imported` no-op, and the live DB
  untouched.
- It **locks the exact bug class H.5 caught** — the store maps the `snapshots.id` column
  to the JS key `snapshotId`, not `.id`. The `[LESSON]` checks assert the importer's
  `snapshotRowId()` fix statically, and the live `[I.2]` run would fail (empty
  `newSnapshotId`; real package mis-decided as `conflict-chat-id`) if it regressed — a
  failure a mocked-store test cannot surface.
- The **schema/trigger drift guard** + the `h2o_writer_identity()` parity stub mean a
  future change to the real Tauri schema or the f15 protection triggers fails the harness
  clearly instead of silently diverging from production behavior.

## Confirmation: no live DB dependency

The harness builds its seed DB from an inline SQL string in a temp directory; all
`plugin:sql` is routed there and the live `studio-v1.db` is **never opened** (let alone
mutated). The live DB is only `stat`-ed as an optional untouched-witness, fully guarded by
`existsSync`, so the harness runs identically in CI where no live DB exists. Confirmed:
`studio-v1.db` stayed at 29/41 across repeated runs.

## Confirmation: restore/relink and export remain deferred

I.3 changes no runtime code and adds no features. The importer still implements only
import-as-new (with the `already-imported` no-op); `restore` / relink and package
export / share remain **deferred** until Phase I closes, and the recovery validator
(`PASS 34`) still forbids a `.h2ochat` export entry point.

## Files changed

- `release-evidence/2026-06-24/saved-chat-archive-phase-i3-import-harness-validation-wiring.md`
  (this note). **No `package.json` change** (intentional, above). No runtime / validator /
  fixture change.

## Verdict

**I.3 IMPORT RECOVERY HARNESS VALIDATION WIRING — PASSED.** The harness is durable and
trivially runnable via a single documented command; `package.json` is intentionally left
unchanged to respect the release/lane-gate-only scripting convention. The harness is the
permanent regression gate protecting H.4/H.5 (including the `snapshotId`-vs-`id` bug
class), with no live-DB dependency, and restore/relink + export stay deferred.

## Recommended next step after I.3

Proceed to **I.4** — close Phase I (harness): summarize I.0–I.3 and mark the import
harness phase complete. At closure, optionally propose a studio/archive aggregate gate
(mirroring `gate:library`) that would include this harness if/when the studio lane adopts
one. Then restore/relink and export can be taken up as their own post-I phases. Out of
lane, the pre-existing **f17 migration-drift (v13 gap)** still awaits the Desktop/sync
lane.
