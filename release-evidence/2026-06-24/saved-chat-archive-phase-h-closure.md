# Saved Chat Archive — Phase H Closure

Date: 2026-06-29

Status: **PHASE H CLOSED — ARCHIVE INSPECTION AND IMPORT RECOVERY PROVEN**

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection
of `.h2ochat` packages).

## H chain (commits)

```text
e8e2ca1  docs(studio): define archive recovery import export contract   (H.0 contract)
8445820  test(studio): validate archive recovery import export contract (H.1 validator)
2ccd878  feat(studio): add read-only archive inspector                  (H.2 inspector)
a4ceade  docs(studio): record archive inspector runtime smoke           (H.3 wiring)
5a05e54  docs(studio): mark archive inspector runtime smoke passed       (H.3 runtime PASS)
9084ccc  feat(studio): add verification-gated archive import recovery    (H.4 importer)
115f8d4  docs(studio): record archive import recovery runtime smoke      (H.5 runtime smoke + importer fix)
```

## What Phase H proves

Before Phase H there was **no `.h2ochat` reader or importer** — packages were
write-only projections (the F/G phases wrote them; nothing read them back). Phase H
built and proved the read-back + recovery path, inspector-first and write-last:

- **H.0/H.1** — defined and locked the recovery/import/export contract
  (inspector-first; Desktop owns import; Chrome no package authority; no overwrite;
  no partial import).
- **H.2** — added a Desktop-only, **read-only Archive Inspector** module
  (`H2O.Studio.archiveInspector`) reusing the read-only diagnostics validation; a
  granular status vocabulary; an HTML-escaped `chat.md`-only preview; no store/package
  mutation; mounted as a sibling beneath the read-only Archive Health card.
- **H.3** — wired the inspector (`studio.html` `<script>` + pack allowlists) and
  proved **live `inspectPackage` runtime** in Desktop Studio / Tauri DevTools on a real
  package, `archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`:

  ```text
  status: verified
  identity: chatId 69f0c5f3-30c4-83eb-9240-26331d09532b
            snapshotId snap_1778516336177_wy9txv06
            contentHash sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
  required files present (manifest/snapshot/chat.md/chat.html)
  contentHashOk: true   hashMismatchCount: 0   blockers: []
  no DB / store / package mutation
  ```

- **H.4** — added the first **verification-gated importer**
  (`H2O.Studio.archiveImporter`): `dryRunImportPackage({ packagePath })` (non-mutating;
  reuses the inspector to verify, reads store state → import-ready / already-imported /
  conflict-chat-id / conflict-snapshot-id / corrupted / unsupported-version / rejected)
  and `importVerifiedPackage({ packagePath, mode })` (explicit; import-as-new only on
  import-ready, or already-imported no-op; fresh ids; provenance; restore/relink and
  export deferred). No-overwrite by construction; static + behavioral validation.
- **H.5** — proved **import-as-new at runtime** against a controlled, conflict-free
  fixture (no real package is conflict-free — all 18 already exist in the store), using
  the **real importer + real store adapters + real diagnostics/inspector** driven over
  a `node:sqlite` temp **copy** of `studio-v1.db`:

  ```text
  dry-run:  import-ready
  import:   imported  (fresh recovered chatId + fresh snapshotId; provenance recorded)
  snapshots: 29 → 30        chats: 41 → 42        snapshot_turns: 72 → 82
  recovered snapshot meta.recovered.originalChatId / originalSnapshotId recorded
  write SQL: INSERT chats + INSERT snapshots + INSERT snapshot_turns
             (+ a 0-row DELETE of the new snapshot's own turns) — NO UPDATE
  existing chat/snapshot rows: byte-identical (no overwrite)
  fixture package files: unchanged   no plugin:fs|write (no package mutation)
  live studio-v1.db: never mutated (29/41/72 throughout; harness used temp copies)
  ```

- **H.5 fix** — the real-DB harness caught a store-identity mapping bug the H.4
  mocked-store harness had masked: the snapshots store maps the SQLite `id` column to
  the JS key **`snapshotId`**, so a store snapshot row exposes `.snapshotId`, not `.id`.
  The importer read `.snapshot.id`. Fixed with a `snapshotRowId()` helper (`snapshotId`
  with `.id` fallback) at the dry-run reads + the post-create read — correcting the
  already-imported detection (real package `69f0c5f3…` now dry-runs `already-imported`,
  not `conflict-chat-id`) and the returned `newSnapshotId`. No change to the
  no-overwrite logic.

## Boundaries preserved

- **Desktop owns** inspection and import; both modules are Tauri-gated.
- **Chrome has no package read/write/import authority** — no Tauri runtime, no
  package/CAS/SQLite access; validator-enforced.
- **No scanner / materializer / writer** behavior change — Phase H only reads packages
  and writes recovered rows through the existing Desktop store adapters.
- **No package overwrite** — import-as-new uses fresh ids only; the snapshot
  overwrite-by-id store primitive is never called; original ids live only in provenance.
- **No watcher / poller / daemon**; **no sync / WebDAV / cloud propagation**.
- **No `S0F0j` / `S0F1j` edits.**
- **No `stash@{0}` changes** (the appearance/ribbon WIP stash was never touched).
- **Concurrent sync-lane commits/staging were left untouched** throughout (pathspec-only
  staging/commit on every Phase H commit; the sync lane committed several times on the
  shared `main` during this work and was never disturbed).

## Caveats

- **H.5 commit subject is docs-style (`docs(studio): record archive import recovery
  runtime smoke`) although `115f8d4` also includes a real importer code fix**
  (`snapshotRowId()` in `saved-chat-archive-importer.studio.js`). It was **left
  unamended on purpose**: after `115f8d4` was committed, the sync lane committed
  `ede1f66` on top, so `115f8d4` is no longer HEAD — rewording it would require a
  rebase that rewrites the sync-lane commit's SHA, which would disturb that active
  lane. The fix is fully described in the `115f8d4` body and in the H.5 evidence note.
- **f17 migration-drift (v13 gap)** in `src-tauri/lib.rs studio_migrations()` remains a
  separate Desktop/sync-lane task (pre-existing; not touched by Phase H).
- The **appearance/ribbon `stash@{0}`** (`wip-appearance-ribbon-studio-html-…`) remains
  a separate lane's WIP; untouched.
- **`restore` / relink** mode remains **deferred** (verification-gated re-link onto the
  original ids — higher risk; needs its own no-clobber design + smoke).
- **Package export / share** runtime remains **deferred** (currently validator-forbidden).
- The **`node:sqlite` fixture harness** used for the H.5 runtime proof (real adapters
  over a temp DB copy; it caught a real bug) should be **promoted into the repo test
  suite / CI** later.

## Validation results

```text
validate-saved-chat-archive-recovery-import-export-v1.mjs       PASS 34 checks
validate-studio-archive-health-ui.mjs                           all 19 checks passed
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs       PASS 15 checks
git diff --check / --cached --check                             clean
```

## Phase H evidence trail

```text
release-evidence/2026-06-24/saved-chat-archive-phase-h0-recovery-import-export-contract.md
release-evidence/2026-06-24/saved-chat-archive-phase-h1-recovery-import-export-validator.md
release-evidence/2026-06-24/saved-chat-archive-phase-h2-readonly-archive-inspector.md
release-evidence/2026-06-24/saved-chat-archive-phase-h3-readonly-inspector-runtime-smoke.md
release-evidence/2026-06-24/saved-chat-archive-phase-h4-verification-gated-import-recovery.md
release-evidence/2026-06-24/saved-chat-archive-phase-h5-import-recovery-runtime-smoke.md
release-evidence/2026-06-24/saved-chat-archive-phase-h-closure.md   (this note)
```

## Verdict

**PHASE H CLOSED — ARCHIVE INSPECTION AND IMPORT RECOVERY PROVEN.** The `.h2ochat`
package format now has a complete, safe read-back + recovery loop: a Desktop-only
read-only inspector (live-proven, H.3), a verification-gated importer with a
non-mutating dry-run and a no-overwrite import-as-new (H.4), and a runtime smoke that
proved the import-as-new write end-to-end against real code + a real-DB copy with
+1 snapshot / +1 chat / +10 turns, provenance, and zero overwrite (H.5) — plus the
store-identity fix that the runtime proof surfaced. All boundaries hold; restore/relink
and export remain deferred to a later phase.

## Recommended next milestone

**Phase I — deferred recovery modes + export, each on its own slice:** (1) the
verification-gated **`restore` / relink** import mode (re-link a verified package onto
its original ids with explicit no-clobber handling + its own runtime smoke); (2) the
**package export / share** runtime (lift the current validator forbiddance behind an
explicit, Desktop-only path); and (3) promote the **`node:sqlite` fixture harness** into
the repo test suite so the import smoke runs in CI. Out of lane, the pre-existing **f17
migration-drift (v13 gap)** still awaits the Desktop/sync lane.
