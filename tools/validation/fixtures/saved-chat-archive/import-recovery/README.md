# Saved Chat Archive — Import Recovery Harness Fixtures (Phase I)

Deterministic, repo-committed fixtures for the permanent archive **import-recovery**
test harness (Phase I, contract: `release-evidence/2026-06-24/saved-chat-archive-phase-i0-import-harness-contract.md`).

**These are test fixtures, not user data.**

## `i-harness-source.h2ochat/`

A minimal, fully self-consistent `.h2ochat` **source** package (v1, no assets, two
messages: one user + one assistant). It is deterministic — fixed ids
(`i-harness-fixture-src-chat` / `snap_i_harness_fixture_src`), fixed timestamps, stable
2-space JSON serialization — so its file hashes never drift. The
`validate-saved-chat-archive-import-recovery-harness-v1.mjs` scaffold validator
recomputes `sha256` of `snapshot.json` / `chat.md` / `chat.html` and asserts they match
`manifest.files.*.sha256`, that `manifest.contentHash === files.snapshot.sha256` (the
v1 asset-free rule), `schemaVersion: 1`, `assets: []`, and that `snapshot.json` carries a
non-empty `messages[]`.

## How the future harness (I.2) will use this

The permanent harness will NOT depend on the developer's live `studio-v1.db` or live
archive packages. It will:

1. **Generate a conflict-free fixture** from this source — rewrite the identity to a
   fresh `chatId` + `snapshotId` that are verified **absent** from the seed DB, and
   recompute the manifest hashes + `contentHash` (exactly as H.5 did).
2. **Seed DB strategy** — deterministic seed preferred: build an in-memory / temp
   `node:sqlite` DB from a schema **pinned to / derived from** the real Desktop
   migrations (`src-tauri/.../studio_migrations()`), including the f15 protection
   triggers and a couple of seed rows (one mirroring an "already-imported" package so
   the already-imported assertion has a target). A **schema/trigger drift guard** must
   fail clearly if the real schema/triggers change. A temp **copy** of a live
   `studio-v1.db` remains a documented **dev-only opt-in** (never the CI path), and the
   live DB is never opened writable.
3. **Tauri parity** — register a stub `h2o_writer_identity()` on the `node:sqlite`
   handle (`db.function('h2o_writer_identity', () => '')`); the real Tauri runtime
   registers this scalar via a Rust auto-extension (`src-tauri/src/sqlite_writer_identity.rs`)
   to back the f15 triggers, and without the stub a trigger-firing INSERT throws
   `no such function: h2o_writer_identity`.
4. **Run the real modules** (`store/index.js`, `store/snapshots.tauri.js`,
   `store/chats.tauri.js`, diagnostics, inspector, importer) over the seed DB and assert
   the H.5 proof: verify → dry-run `import-ready` → `imported`, fresh ids, provenance,
   `chats +1` / `snapshots +1` / `snapshot_turns +N`, **no `UPDATE`** SQL, source
   rows/files unchanged, an existing package dry-runs `already-imported`, and the live DB
   is untouched.

Restore/relink and export are deferred until Phase I (this harness) closes.
