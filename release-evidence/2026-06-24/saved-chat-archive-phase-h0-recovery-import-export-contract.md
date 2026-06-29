# Saved Chat Archive — Phase H.0 Recovery / Import / Export Contract

Date: 2026-06-29

Status: **PHASE H.0 CONTRACT — NOT IMPLEMENTED**

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection
of `.h2ochat` packages).

This is a **docs-only contract**. No runtime code, validators, capabilities,
Chrome/Desktop runtime, scanner, materializer, or writer were changed. It defines
the next product phase: how a `.h2ochat` package is **inspected, verified, opened,
imported, and exported** — and decides to ship a **read-only inspector first**
before any write/recovery.

## Baseline

```text
5f267bd  docs(studio): close saved chat archive phase e   (capture -> delivery -> receipt -> read-back)
14aba6e  docs(studio): close saved chat archive phase f   (Desktop package materialization proven)
78e2492  docs(studio): close saved chat archive phase g    (bounded operator auto-materialization proven)
```

What is already proven: Chrome delivers archive requests; Desktop scanner
validates/enqueues; Chrome reads Desktop receipts; Desktop writes real `.h2ochat`
packages and batch-materializes validated requests (runtime-proven); Chrome stays
intent/read-back only; Desktop owns the DB / materializer / package writer /
Archive Health.

## Investigation summary (what exists, what does not)

- **The package format is fixed and projection-only.** A package is a directory
  `archive/packages/<chatId>.h2ochat/` containing `manifest.json`, `snapshot.json`,
  `chat.md`, `chat.html`, and (v2 only) `assets/`. `manifest.json` is
  `schema: h2o.savedChatPackage`, `schemaVersion: 1`, with `files.{snapshot,
  markdown,html}.sha256`, `assets[]`, `contentHash` (= `sha256(snapshot.json)`),
  and `provenance.{sourceOfTruth: desktop-sqlite-store, projectionOnly: true}`.
  So a package is a **projection** of the Desktop SQLite store, not a primary
  source of truth.
- **No `.h2ochat` reader / importer / inspector exists yet.** Only the **writer**
  (`saved-chat-package-v1.tauri.js`) and the **read-only diagnostics**
  (`saved-chat-archive-diagnostics.tauri.js`) reference `.h2ochat`. There is no
  API that parses a package back into objects, renders it, or imports it. H.2/H.4
  must build these.
- **Package verification already exists (read-only).**
  `diagnoseSavedChatArchiveV1` validates packages: `REQUIRED_FILES =
  [manifest.json, snapshot.json, chat.md, chat.html]`, recomputes `sha256` and
  compares to the manifest (hash mismatch → blocker), checks assets + live-CAS
  presence, and rolls up to `ok` / `warning` / `blocked`. The H.2 inspector should
  **reuse/extend** this per-package verification rather than reinvent it.
- **The Desktop snapshot store can create and look up snapshots.**
  `H2O.Studio.store.snapshots` exposes `create`, `upsert` (`upsert` requires a
  `chatId` for a new snapshot), `get` (combined snapshot + turns), and
  `listByChat`. Import-as-new uses `create`/`upsert`; restore/relink checks
  `get(snapshotId)` / `listByChat(chatId)` first.
- **A safe import precedent exists (different artifact).**
  `import-bundle.tauri.js` imports the Studio **full bundle**
  (`h2o.studio.fullBundle.v2`, the Library↔Chrome sync shape) — NOT a `.h2ochat`
  package — but it establishes the model H should adopt: a **dry-run READ-ONLY
  parse + compare-against-stores** step, then an explicit **merge** step. The
  matching `export-bundle.tauri.js` "reads through public store adapters only…
  never writes SQLite, chrome.storage, or archive data."
- **Two package payload versions exist.** v1 (text-only: no `payloadVersion` key,
  `assets:[]`, no `assets/` dir) and v2 (asset-bearing: `payloadVersion`, populated
  `assets[]`, `snapshot.schemaVersion: 2`). Import must support both and reject
  unknown/future versions.

## Recommended decision

**Ship a read-only package inspector first (H.2/H.3), before any import/write
recovery (H.4/H.5).** Inspection + verification is **non-mutating** — it proves a
package is parseable, hash-consistent, and portable **without touching the Desktop
store** — and it mirrors the established `import-bundle` dry-run-first safety
model. Import (store mutation) is taken only after the inspector proves packages
are reliably verifiable. This matches the user's stated preference and keeps the
first H slices side-effect-free.

## Contract

### 1. Product goals

- **Inspect** — parse `manifest.json` + `snapshot.json` (+ render `chat.md`/
  `chat.html`) read-only; show identity (`chatId`, `snapshotId`, `title`,
  `messageCount`, `capturedAt`), file inventory + sizes, and provenance.
- **Verify integrity** — recompute each file's `sha256` vs the manifest, confirm
  `REQUIRED_FILES`, confirm `contentHash = sha256(snapshot.json)`, check assets/CAS
  if present, and check `schemaVersion`/`payloadVersion` support → a
  **verified / corrupted** verdict (reuse/extend `diagnoseSavedChatArchiveV1`).
- **Open / read** — render the package's chat content read-only, sourced from the
  package files, **without** reading or writing the Desktop store.
- **Import into Desktop store (if safe)** — reconstruct a snapshot (+ minimal chat
  scaffolding) from the package's `snapshot.json` into SQLite via the store
  adapters, **only after** verification passes and the conflict rules below allow
  it.
- **Export / share** — produce a portable form of a package (e.g. a zipped
  `.h2ochat` directory) for moving to another machine; Desktop reads the package
  files only, adds no new authority, and performs no automatic propagation.

### 2. Authority model

- **Desktop owns import / recovery** — it reads the package filesystem and writes
  the SQLite store through the public `H2O.Studio.store` adapters only.
- **Chrome does not import packages**, **does not read the package/CAS body**, and
  performs no package/CAS/SQLite writes. Chrome stays receipt-files-only (E/F/G).
- **The package is a projection, not the primary source of truth** (`provenance.
  projectionOnly: true`, `sourceOfTruth: desktop-sqlite-store`). Import
  **reconstructs** store rows from the projection; it never makes the package
  authoritative over the DB.

### 3. Recovery modes

- **(a) Read-only inspector** — parse + verify + render; **no store write**. The
  H.2/H.3 starting point.
- **(b) Import as new recovered chat/snapshot** — when the package's `chatId` /
  `snapshotId` are **absent** from the store (e.g. a package from another machine),
  create a new snapshot via `store.snapshots.create`/`upsert` (+ minimal chat
  scaffolding), tagged with **recovered/imported provenance**.
- **(c) Restore / relink to an existing chat** — when a matching `chatId` (and/or
  `snapshotId`) **exists**, do **not** duplicate; relink/confirm against the
  existing chat (or offer to attach the package's snapshot as an additional
  snapshot of that chat). **Never overwrite an existing snapshot by default.**
- **(d) Reject unsafe / corrupted package** — if verification reports any blocker
  (missing required file, hash mismatch, unsupported schema, missing asset),
  **reject with a clear reason and import nothing** (no partial import).

### 4. Validation rules (verification gate, grounded in the diagnostics checks)

- `manifest.json` **required** (missing → blocker).
- `snapshot.json` **required**.
- `chat.md` and `chat.html` **required** (`REQUIRED_FILES`).
- Every file's recomputed `sha256` **must match** its `manifest.files.*.sha256`
  descriptor (any mismatch → corrupted → blocker).
- `contentHash` **must equal** `sha256(snapshot.json)` (the authoritative payload
  hash).
- **`schemaVersion` / `payloadVersion` compatibility** — support v1 (no
  `payloadVersion`, `assets:[]`) and v2 (`payloadVersion`, populated `assets[]`,
  `snapshot.schemaVersion: 2`); **reject** unknown/future schema versions rather
  than guess.
- **Assets checked if present** — for v2, every `manifest.assets[]` entry must
  exist (package `assets/` and/or live CAS) and hash-match; v1 must have `assets:[]`
  and no `assets/` dir (consistent).
- **No silent partial import** — verification is all-or-nothing; a package failing
  any blocker is never imported.

### 5. Conflict handling

- **package `chatId` already exists** → restore/relink mode (mode c); do not create
  a duplicate chat.
- **`snapshotId` already exists** → idempotent **already-imported**; import is a
  no-op and **never overwrites** the existing snapshot by default.
- **`contentHash` already exists** (same projection already present) →
  **already-present**; no duplicate write.
- **title/name collision** (different `chatId`, same title) → **not** an import
  conflict (chats are keyed by `chatId`, not title); surface the title for operator
  clarity but proceed by id.
- **package from another machine/profile** (`chatId`/`snapshotId` absent locally) →
  import-as-new (mode b) with recorded import provenance (original
  generator/source/host) so a recovered chat is distinguishable from a
  natively-captured one.

### 6. UX

- **Desktop-only** (Tauri-gated, like the F.2/G.2 operator actions).
- **Home:** the Archive Health / Diagnostics area — either an extension of the
  read-only health card or a dedicated **"Archive Inspector"** sub-surface
  (read-only inspect first; a separate explicit "Import" affordance later).
- **No global floating button.**
- **Explicit operator action** — pick/inspect a package; an explicit, separate
  "Import" gesture for any store write.
- **Clear states** — `verified` / `corrupted` / `already-exists`
  (`already-imported`) / `imported` (recovered) / `rejected`.

### 7. Safety boundaries

- **No Chrome package write/read authority** — Chrome stays receipt-files-only; it
  never reads the package/CAS body or writes packages/CAS/SQLite.
- **No scanner changes.**
- **No materializer changes.**
- **No watcher/daemon** — explicit operator action only.
- **No sync / WebDAV / cloud propagation** — export yields a portable file the
  operator moves manually; nothing auto-propagates. The archive/CAS root stays
  distinct from the Sync lane.
- **No `S0F0j` / `S0F1j` edits.**
- **No package overwrite by default** — import never overwrites an existing
  snapshot or package; it relinks/skips instead (restore/already-imported).

### 8. Proposed phases

| Phase | Deliverable |
|---|---|
| **H.0** | This contract (NOT IMPLEMENTED). |
| **H.1** | Static **validator** for the recovery/import contract: read-only inspector first; verification gate (manifest/required-files/hash/contentHash/schema/asset); Desktop-only; no Chrome package read/write; no overwrite; no scanner/materializer/watcher change. |
| **H.2** | Desktop **read-only package inspector** — parse + verify (reuse/extend `diagnoseSavedChatArchiveV1`) + render one package; **no store write**. |
| **H.3** | **Runtime smoke**: inspect one real package (e.g. the G.3 package `69f0c5f3-….h2ochat`) → verified, identity + hashes shown, no store mutation. |
| **H.4** | Desktop **import/recovery action** — import-as-new / restore-relink, verification-gated, conflict-handled, **no overwrite**; explicit operator gesture. |
| **H.5** | **Runtime smoke**: import/recover a package safely (import-as-new on an absent chat; already-imported on a present one; corrupted → rejected). |
| **H.6** | Phase H **closure**. |

## Boundaries held (this contract)

- Docs/evidence only — **no** runtime code, validators, capabilities, Chrome
  runtime/service-worker, scanner, materializer, or writer changed.
- Chrome remains intent / read-back (files-only); Desktop remains authoritative.
- No watcher/poller/daemon, no native messaging, no WebDAV/cloud/sync propagation.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged.

## Verdict

**PHASE H.0 CONTRACT — NOT IMPLEMENTED.** Recommended path: a **read-only package
inspector first** (verify integrity + render, no store mutation, reusing the
existing diagnostics verification), then a **verification-gated, no-overwrite
import/recovery** that imports-as-new or restores/relinks via the store adapters —
Desktop-only, explicit, projection-aware, with Chrome authority unchanged.

## Recommended next step after H.0

Proceed to **H.1** — author the static validator that locks this contract
(inspector-first; the manifest/required-files/hash/contentHash/schema/asset
verification gate; Desktop-only; no Chrome package read/write; no overwrite; no
scanner/materializer/watcher change) before any H.2 inspector is built. Confirm two
product points first: whether the inspector lives as an extension of the Archive
Health card or a dedicated "Archive Inspector" surface, and whether **export**
(portable `.h2ochat` sharing) is in Phase H scope or a later phase.
