# Saved Chat Archive — Phase K.1 Restore / Relink Validator

Date: 2026-06-30

Status: **PHASE K.1 — RESTORE / RELINK VALIDATOR - NOT IMPLEMENTED**

Lane: H2O Studio Chat Saving Architecture — Phase K restore/relink.

K.1 adds **static validation only**. It locks the K.0 restore/relink contract and
asserts that **no restore/relink runtime exists yet** — the restore module, its
`H2O.Studio.archiveRestore` registration, its API, and its UI card are all still
absent, and relink + tombstone-override/un-delete stay deferred. The runtime arrives
in K.2.

## Baseline

```text
207a54f  docs(studio): close archive export share phase          (Phase J closed)
647e9a4  docs(studio): define archive restore relink contract    (K.0 contract)
```

## Validator checks added

New static validator
`tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs`
(14 checks; static — no runtime, no `node:sqlite`, no DB, no module loads):

- **[K.0]** the K.0 contract exists + is marked `NOT IMPLEMENTED`; states the K core
  decisions (`restore-original-ids`, absent-only, non-destructive, Desktop-only,
  verification-gated by `inspectPackage`); forbids overwrite and records the
  no-overwrite safety rules (`already-present` / `conflict-snapshot-id` /
  `conflict-chat-id` / `restore-ready`, re-check immediately before insert); defers
  relink and tombstone-override/un-delete; scopes the writes to
  `chats`/`snapshots`/`snapshot_turns`/provenance and forbids `libraryIndex` /
  `saved_chat_archive_requests` / Chrome; names the future reuse seams
  (`inspectPackage` + `buildTurnsFromPackageSnapshot`) + explicit `confirm`.
- **[NOT-IMPL]** the restore module (`saved-chat-archive-restore.studio.js`) does not
  exist; no restore runtime markers (`H2O.Studio.archiveRestore`,
  `dryRunRestorePackage`, `restoreVerifiedPackage`, `mountArchiveRestoreCard`,
  `renderArchiveRestoreCard`) appear anywhere in the studio tree.
- **[DEFERRED]** no relink runtime markers (`archiveRelink`, `dryRunRelinkPackage`,
  `relinkVerifiedPackage`) anywhere; no archive recovery code introduces a relink
  pointer UPDATE or a `sync_tombstones` clear/supersede (the importer — the only
  existing recovery write — touches no tombstones).
- **[INVARIANT]** the importer is still import-as-new only (defers restore/relink,
  never sets a package snapshotId in `snapshots.create`, never calls the
  overwrite-by-id primitive, still generates a fresh recovered chat id); the
  recovery/import/export validator now recognizes the restore module (planning
  allowance) without enabling relink/overwrite; the K.1 validator stays static.

(The restore markers are namespace-qualified — `H2O.Studio.archiveRestore` — so the
bare `archiveRestore` substring does not false-positive against unrelated sync-lane
identifiers such as `archiveRestoreInstalled`.)

## Recovery-validator flip

`tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
— minimal restore-planning allowance only:

- Added `RESTORE_REL` (the future restore module) to `ALLOWED_H2OCHAT`, so the K.2
  restore module will not trip the "`.h2ochat` referenced only by …" invariant.
- Added `RESTORE_ENTRY_NAMES` (`H2O.Studio.archiveRestore` / `dryRunRestorePackage` /
  `restoreVerifiedPackage`) confined to the restore module (leaking them elsewhere
  fails), mirroring the H.4 importer / J.2 exporter confinement.
- Added `RELINK_FORBIDDEN_NAMES` (`archiveRelink` / `dryRunRelinkPackage` /
  `relinkVerifiedPackage`) forbidden **everywhere** — relink stays deferred.
- Header comment updated to record the K.1 planning allowance.

**The importer invariant is preserved:** the importer must still be import-as-new
only — it must not write a package's original `snapshotId` and must not overwrite
existing rows (the `[H.4]` no-overwrite checks remain green at `PASS 34`).

## What is NOT in K.1

- **No runtime restore implementation** — no `saved-chat-archive-restore.studio.js`,
  no `H2O.Studio.archiveRestore`, no dry-run/restore API, no store writes.
- **No Restore UI card.**
- **Relink still deferred** — no relink API, no existing-chat pointer
  (`last_snapshot_id` / `current_leaf_id`) UPDATE introduced by this slice.
- **Tombstone override / un-delete still deferred** — no code clears/deletes/
  supersedes `sync_tombstones`; no undelete behavior.
- **No runtime / capability / Chrome / scanner / materializer / writer / inspector /
  exporter behavior change** — the only runtime-adjacent edit is the recovery-validator
  planning allowance above. No `S0F0j` / `S0F1j`. f17 migration-drift untouched. No
  sync/appearance/ribbon dirty files touched; `stash@{0}` untouched; concurrently
  staged sync-lane files left untouched (pathspec-only commit).

## Validation results

```text
node --check validate-saved-chat-archive-restore-relink-v1.mjs           OK
node --check validate-saved-chat-archive-recovery-import-export-v1.mjs    OK
validate-saved-chat-archive-restore-relink-v1.mjs                        PASS 14 checks
validate-saved-chat-archive-recovery-import-export-v1.mjs                PASS 34 checks
validate-saved-chat-archive-import-recovery-harness-v1.mjs               PASS 25 checks
git diff --check / --cached --check                                      clean
```

## Verdict

**PHASE K.1 — RESTORE / RELINK VALIDATOR - NOT IMPLEMENTED.** The K.0 contract is
locked statically and the absence of any restore/relink runtime is asserted; the
recovery validator now recognizes the planned restore module without enabling relink
or overwrite, and the importer stays import-as-new only. No runtime, capability, or
Chrome change.

## Recommended next step after K.1

Proceed to **K.2** — the Desktop-only `restore-original-ids` action: a new
`saved-chat-archive-restore.studio.js` (`H2O.Studio.archiveRestore`) with
`dryRunRestorePackage` + `restoreVerifiedPackage` (absent-only, no-overwrite,
verification-gated via `inspectPackage`, reusing
`archiveImporter.buildTurnsFromPackageSnapshot`, explicit `confirm`, tombstoned →
deferred), plus a Restore card and the K.1 validators flipped to assert the
implementation. Keep relink + tombstone-override deferred. Out of lane, the
pre-existing **f17 migration-drift (v13 gap)** still awaits the Desktop/sync lane.
