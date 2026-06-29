# Saved Chat Archive — Phase H.5 Import Recovery Runtime Smoke

Date: 2026-06-29

Status: **H.5 IMPORT RECOVERY RUNTIME SMOKE — PASSED**

(A minimal importer fix was required and is included — see "Runtime fix". The
import-as-new write was proven end-to-end against a temp **copy** of the real
`studio-v1.db` using the real importer + real store adapters + real diagnostics +
real inspector; the live DB was never mutated.)

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection).

## Baseline

```text
9084ccc  feat(studio): add verification-gated archive import recovery   (H.4)
```

## Investigation: is any real package conflict-free? (No)

Enumerated all 18 `.h2ochat` packages under
`~/Library/Application Support/org.h2o.studio.desktop/archive/packages` and
cross-checked each manifest `chatId`/`snapshotId` against `studio-v1.db`:

```text
packages on disk: 18   snapshots: 29   chats: 41   snapshot_turns: 72
every package: snapshotId present in store = Y, chatId present in store = Y
```

So **no conflict-free package exists** — every real package's snapshot is already
in the store (they were materialized FROM it), so each dry-runs to
`already-imported`. Per the H.5 instruction this requires a **controlled fixture**
(strategy B).

## Selected import target — controlled fixture (not user data)

A controlled, conflict-free fixture was generated from one known-good v1 source
package (`69f0c5f3-…`) with a **fresh, DB-absent identity** and fully recomputed
hashes:

```text
fixture path:    archive/packages/h5-import-smoke-fixture-7f956711.h2ochat
fixture chatId:  h5-import-smoke-fixture-7f956711        (verified absent from chats)
fixture snapId:  snap_h5fixture_1782736379008_cfd600     (verified absent from snapshots)
contentHash:     sha256-3c7becdb2cd7de4cccfcb04000a1e6133dc7ef0904f155067f8327859fefdce7
files:           manifest.json + snapshot.json + chat.md + chat.html (no assets)
provenance:      manifest.provenance.h5ImportSmokeFixture = true; snapshot.h5Fixture = {…}
```

Generator (full identity rewrite + recompute, source untouched, real DB opened
read-only only to check id-absence):

```js
// new ids verified absent from chats/snapshots; rewrite oldChatId/oldSnapshotId ->
// new across snapshot.json + chat.md + chat.html; inject h5Fixture provenance;
const snapSha = 'sha256-' + sha256(snapshotBytes);
manifest.chatId = newChatId; manifest.snapshotId = newSnapshotId;
manifest.files.snapshot.sha256 = snapSha;        manifest.files.snapshot.byteLength = snapBytes.length;
manifest.files.markdown.sha256 = sha256(md);     manifest.files.html.sha256 = sha256(html); // + byteLengths
manifest.contentHash = snapSha;                  // v1 asset-free: contentHash = snapshot sha
manifest.provenance.h5ImportSmokeFixture = true;
```

This matches the diagnostics validator's contract exactly: `snapshotShaOk` compares
`manifest.files.snapshot.sha256` to sha256 of the **raw** `snapshot.json` bytes, and
for an asset-free v1 package `expectedContentHash = files.snapshot.sha256`
([saved-chat-archive-diagnostics.tauri.js](src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js) lines 1031–1050).

## Runtime harness (high fidelity, real DB untouched)

The Desktop WKWebView exposes no remote debug port (F.3/G.3/H.3/H.4), so instead of
a manual operator click-through, the **real** code paths were driven in Node against
a **temp copy** of the production DB:

- real modules loaded + self-registered: `store/index.js`, `store/snapshots.tauri.js`,
  `store/chats.tauri.js`, `saved-chat-archive-diagnostics.tauri.js`,
  `saved-chat-archive-inspector.studio.js`, `saved-chat-archive-importer.studio.js`;
- `__TAURI_INTERNALS__.invoke` mocked to route `plugin:fs|read_file/exists/read_dir`
  to the real fixture/package files and `plugin:sql|select/execute` to a
  `node:sqlite` (Node 25) handle on a **copy** of `studio-v1.db`;
- the Rust-registered SQLite scalar `h2o_writer_identity()` (used by F15 store-
  protection triggers; [sqlite_writer_identity.rs](apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs))
  was registered as a faithful stub (`() => ''`, the default non-protected identity).

Only the Tauri JS↔Rust marshalling is substituted; the importer logic, store-adapter
SQL, schema, triggers, and hashing are all the real production code. The real
`studio-v1.db` was copied (never opened writable) and stayed at 29/41/72 throughout.

## Runtime proof

**1. inspectPackage(fixture)** → `verified`:

```text
status: verified   ok: true   blockers: []   contentHashOk: true
chatId: h5-import-smoke-fixture-7f956711   snapshotId: snap_h5fixture_1782736379008_cfd600
```

**2. dryRunImportPackage(fixture)** → `import-ready`, no mutation:

```text
decision: import-ready   mutated: false   sqlWritesDuringDry: 0
store: { snapshotExists:false, chatExists:false, digestMatches:false }
```

**3. importVerifiedPackage(fixture, import-as-new)** → `imported`:

```text
status: imported
newChatId:        recovered_ce980311-c1c5-43ed-bd8d-de4188035dc0   (fresh; != fixture chatId)
newSnapshotId:    snap_d956847d-e683-4299-9057-62e625f5b4fe        (fresh; store-generated)
originalChatId:   h5-import-smoke-fixture-7f956711                 (provenance)
originalSnapshotId: snap_h5fixture_1782736379008_cfd600            (provenance)
```

**4. DB proof (temp copy):**

```text
                 before   after   delta
snapshots         29       30      +1
chats             41       42      +1
snapshot_turns    72       82      +10
new snapshot row present: true     new chat row present: true     new turns: 10
new chat title:  "Recovered: ☎️ Investment in AI Tools"
recovered snapshot meta.recovered.originalChatId:   h5-import-smoke-fixture-7f956711
recovered snapshot meta.recovered.originalSnapshotId: snap_h5fixture_1782736379008_cfd600
```

**5. No-overwrite proof — the four write statements during import:**

```text
INSERT chats          (1 row)
INSERT snapshots      (1 row)
DELETE snapshot_turns (0 rows)   <- the fresh snapshot's own turns; none exist, so nothing deleted
INSERT snapshot_turns (10 rows)
any UPDATE? NO        -> no existing row overwritten
```

- source chat row (`69f0c5f3…`) sha — unchanged before/after.
- source snapshot row (`snap_1778516336177…`) sha — unchanged before/after.
- fixture package files (manifest/snapshot/chat.md/chat.html) — unchanged before/after.
- no `plugin:fs|write` was ever invoked (the mock has none; import succeeded) → no
  package write/overwrite, no sidecar/receipt.

**6. Re-run dry-run on the same fixture** → `import-ready` (by design, not a bug):
import-as-new writes a *fresh* recovered chat/snapshot and never writes the package's
original ids, so the package itself never becomes "already-imported" — re-importing
would create another independent recovered copy. (The `already-imported` no-op path
is exercised by the real packages below.)

**7. No Chrome / scanner / materializer / sidecar / watcher:** the import path touched
only `store.chats` + `store.snapshots` (the 4 SQL writes above) via the Desktop store
adapters. No scanner/materializer API was called, no package was written, no Chrome
runtime exists in the path (Desktop-only module), no timer/watcher was started.

## Runtime fix (minimal, required)

The real-DB harness caught a real bug the H.4 mocked-store harness had masked (the
H.4 mock keyed snapshots by `.id`, agreeing with the bug). The store maps the
`snapshots.id` column to the JS key **`snapshotId`**
([store/snapshots.tauri.js](src-surfaces-base/studio/store/snapshots.tauri.js) column
map, `id: 'snapshotId'`), but the importer read `.snapshot.id`. Two manifestations:

- `importVerifiedPackage` returned an **empty `newSnapshotId`** (the snapshot WAS
  created — delta +1 — but the returned id was blank);
- `dryRunImportPackage`'s already-imported detection read `existingSnap.id` → empty,
  so a **real already-imported package mis-decided as `conflict-chat-id`**
  (confirmed on `69f0c5f3…`: `conflict-chat-id`, `snapshotExists:false`).

Minimal fix: one helper `snapshotRowId(snap)` = `snapshotId` with `.id` fallback,
used in the two dry-run reads and the post-create id read. No change to the
no-overwrite logic (still fresh-id `create`, original ids never written).

Post-fix re-run:
- fixture import returns a proper fresh `newSnapshotId` (above);
- real package `69f0c5f3…` dry-run → **`already-imported`** (`snapshotExists:true,
  digestMatches:true`); `importVerifiedPackage` → `already-imported` no-op (0 writes).

## Validation results

```text
node --check saved-chat-archive-importer.studio.js          OK
validate-saved-chat-archive-recovery-import-export-v1.mjs    PASS 34 checks
validate-studio-archive-health-ui.mjs                        all 19 checks passed
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs    PASS 15 checks
git diff --check / --cached --check                          clean
real studio-v1.db after all runs: 29 / 41 / 72 (untouched; harness used temp copies)
```

## Files changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js`
  (minimal fix: `snapshotRowId` helper + 3 call sites read the store's `snapshotId`
  key instead of `.id`).
- `release-evidence/2026-06-24/saved-chat-archive-phase-h5-import-recovery-runtime-smoke.md`
  (this note).

No scanner / materializer / writer / Chrome / capability / store-adapter change. No
`S0F0j` / `S0F1j`. f15/f17 untouched. The fixture lives in the runtime archive dir
(AppLocalData, outside the repo) and is not committed.

## Optional live confirmation (operator, Desktop Studio / Tauri DevTools)

The fixture is on disk for an independent live check (rebuild dev dist + reload first
so the H.5 importer fix is served):

```js
const imp = H2O.Studio.archiveImporter;
await imp.dryRunImportPackage({ packagePath: 'archive/packages/h5-import-smoke-fixture-7f956711.h2ochat' });
// expect decision: import-ready
await imp.importVerifiedPackage({ packagePath: 'archive/packages/h5-import-smoke-fixture-7f956711.h2ochat', mode: 'import-as-new' });
// expect status: imported; recovered.newChatId 'recovered_…'; fresh newSnapshotId
// then a NEW "Recovered: …" chat + snapshot appear; existing rows untouched.
```

Cleanup (optional, after the live check): remove the fixture dir
`archive/packages/h5-import-smoke-fixture-7f956711.h2ochat`. It is clearly marked as
a test fixture (manifest/snapshot provenance) and is not user data.

## Verdict

**H.5 IMPORT RECOVERY RUNTIME SMOKE — PASSED.** With no conflict-free real package
available, a controlled, verified fixture was used to prove the full import-as-new
path end-to-end against the real importer + real store adapters + a temp copy of the
production DB: `verified` → `import-ready` → `imported`, creating a NEW recovered chat
+ snapshot (fresh ids, provenance) with **+1 snapshot / +1 chat / +10 turns**, while
every existing chat/snapshot row and the fixture package files stayed byte-identical
and the only writes were INSERTs (plus a 0-row DELETE of the new snapshot's own
turns) — **no UPDATE, no overwrite**. A required minimal importer fix (read the
store's `snapshotId` key) corrected an empty-`newSnapshotId` return and the
already-imported detection (now verified on real packages). All static validators
green; the real DB was never mutated.

## Recommended next step after H.5

Phase H's core recovery loop is proven (H.2 inspect → H.4 gate/dry-run/import →
H.5 runtime). Remaining deferred slices, each on its own: the **`restore` / relink**
mode (verification-gated re-link onto original ids — higher risk, needs its own
no-clobber design + smoke), and the **package export / share** runtime (currently
validator-forbidden). A small follow-up could also add a tiny **unit fixture +
node:sqlite harness** into the repo's test suite so this import smoke runs in CI (it
already caught a real bug). Out of lane, the pre-existing **f17 migration-drift (v13
gap)** in `src-tauri/lib.rs studio_migrations()` still awaits the Desktop/sync lane.
```
