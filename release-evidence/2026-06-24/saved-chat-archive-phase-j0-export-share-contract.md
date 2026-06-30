# Saved Chat Archive — Phase J.0 Export / Share Contract

Date: 2026-06-30

Status: **PHASE J.0 CONTRACT — NOT IMPLEMENTED**

Lane: Chat Saving Architecture (Phase J — safe `.h2ochat` export / share).

This is a **contract only**. It defines how Desktop will export / share one verified
`.h2ochat` package before any export code is written. No runtime, validator, capability,
or UI change is made here.

## Baseline

```text
f5b8b4e  docs(studio): close saved chat archive phase h   (inspection + import recovery)
d1544e0  docs(studio): close saved chat archive phase i   (permanent import-recovery harness)
```

Already proven: Chrome delivers archive requests (intent/read-back only); Desktop
materializes + batch-materializes real `.h2ochat` packages, inspects them read-only, and
imports/recovers a verified package with no overwrite; the permanent `node:sqlite` import
harness re-proves the loop. Desktop owns the writer, inspector, importer, DB, and Archive
Health.

## Investigation summary

- **Package directory layout** — a `.h2ochat` package is a *folder* named `<chatId>.h2ochat`
  containing `manifest.json` + `snapshot.json` + `chat.md` + `chat.html` (+ an optional
  `assets/sha256-<hash>.<ext>` set). `manifest.contentHash` = `sha256(snapshot.json)` (v1
  asset-free); per-file `sha256` + `byteLength` are in `manifest.files`. Export must copy
  the whole folder **byte-for-byte** so the copy re-inspects as `verified`.
- **Writer fs primitives** (`saved-chat-package-v1.tauri.js`) — `plugin:fs|exists`,
  `mkdir`, `remove`, `write_file`, `read_file`. Export's copy primitives are therefore
  `read_file` (source, archive scope) + `mkdir` + `write_file` (destination scope).
- **Inspector / diagnostics** — `inspectPackage` (reuses `validateSavedChatPackageV1`,
  fs/hash-only) is the verification gate; Archive Health lists packages by `packagePath`.
  Both are read-only and Desktop-only.
- **Import harness** — `validate-saved-chat-archive-import-recovery-harness-v1.mjs` will be
  the regression check that an exported package is still a valid import source.
- **Full-bundle export is a DIFFERENT artifact.** `export-bundle.tauri.js` writes the
  Chrome-compatible **`h2o.studio.fullBundle.v2`** (the whole library:
  `exportFullBundle` / `exportLatestSyncBundle`). Phase J is **single-`.h2ochat`-package**
  export — a distinct artifact, distinct code, distinct lane. They must not be conflated
  or share entry points. (The recovery validator already asserts `export-bundle` does not
  touch `.h2ochat`.)
- **Filesystem capability is the central J.2 prerequisite.** Current grants:
  - `archive-cas.json` — read/write/mkdir/exists scoped to `$APPLOCALDATA/archive/**`
    (the *source* scope).
  - `default.json` — **read** is broad (`$HOME/**`, `$DOWNLOAD/**`); **write / mkdir /
    rename are NOT** — they are scoped to `$APPLOCALDATA/archive` and `$HOME/H2O Studio
    Sync/...` only. `dialog:allow-open` exists (a folder/file picker).
  So writing a copy to an arbitrary operator-picked destination is **not currently
  permitted**. J.2 must make an explicit, minimal capability decision (below). **J.0
  changes no capability.**

## Recommended decision

- **Start with Desktop-only folder-copy export of an already-verified `.h2ochat`
  directory** — copy the package folder byte-for-byte to an explicit destination. This
  preserves manifest/hash integrity trivially (the copy re-inspects `verified`) and needs
  no new format or dependency.
- **Do not implement zip first** (deferred to J.4, optional).
- **Do not implement cloud / WebDAV / share-sheet integration first** (out of scope for
  J.0–J.3).
- **Do not implement restore / relink in Phase J** (separate, still deferred).
- **Capability recommendation for J.2:** prefer a **bounded export root** over a broad
  grant — e.g. a dedicated `$HOME/H2O Studio Exports/` (mirroring how `$HOME/H2O Studio
  Sync` is scoped) or `$DOWNLOAD/**`, with the operator choosing a name/subfolder within
  it via `dialog:allow-open`. Avoid granting broad `$HOME/**` write. The exact grant is a
  J.2 decision; J.1 may lock the *shape* (bounded, explicit, no overwrite).

## 1. Product goal

- Let Desktop **export / share one verified `.h2ochat` package** to an
  operator-selected destination.
- Keep the package **portable** — a self-contained folder.
- **Preserve manifest / hash integrity** — the copy is byte-identical.
- **Allow re-import / inspection elsewhere** — the copy verifies + imports like the source.

## 2. Export modes

- **Primary (J.2): copy the existing `.h2ochat` package folder** to a selected destination
  (no transformation).
- **Optional later (J.4): zip / single-file** package (a format decision; deferred).
- **Export the currently selected package from the Archive Inspector** (the inspector
  already holds a verified selection).
- **Export by `packagePath` from Archive Health / Diagnostics** (the same packagePath the
  inspector/health use).

## 3. Validation gate

- The package must **inspect as `verified`** (via `inspectPackage`) **before** export.
- `manifest.json` present; required files present (`manifest`/`snapshot`/`chat.md`/`chat.html`);
  file hashes match the manifest; `contentHash` matches `sha256(snapshot.json)`; assets
  checked if present.
- **No corrupted / unverified package is exported by default** (corrupted →
  `corrupted`/`rejected`).

## 4. Destination rules

- **Explicit operator-selected destination** (via the picker); never a silent/implicit path.
- **No silent overwrite.** If the destination package folder already exists → return
  `destination-exists` and **reject**, requiring an explicit different name/location.
- **No automatic cloud / WebDAV / sync propagation** in J.0 / J.1 (and none in J.2/J.3).

## 5. Authority model

- **Desktop-only.** Chrome **cannot** export / share a package body and **cannot** read
  the package / CAS body (no Tauri runtime, no fs/CAS access) — unchanged.
- **Desktop filesystem writes are limited to the explicit export destination** — the
  source package (under `$APPLOCALDATA/archive`) is read-only during export; the only write
  is the copy into the chosen destination scope.

## 6. Safety

- **No mutation of the source package** (read-only copy source).
- **No DB / store mutation** (export touches no SQLite).
- **No scanner / materializer / importer mutation** (export is a separate read+copy action).
- **No watcher / daemon.**
- **No package overwrite** (destination-exists → reject).
- **No sync / WebDAV / cloud / native messaging.**
- **No `S0F0j` / `S0F1j` edits.**

## 7. UX

- A Desktop **export / share card** in the Archive Inspector area (or an adjacent sibling
  card, like the inspector/importer siblings) — Desktop-only, no global floating button.
- An **explicit operator button** ("Export package…") that opens the destination picker.
- **Clear statuses:** `verified` · `export-ready` · `exported` · `destination-exists` ·
  `corrupted` · `rejected` · `read-error` · `write-error`.

## 8. Relationship to import / recovery

- The **exported package must still pass `inspectPackage`** (byte-identical copy → same
  hashes → `verified`).
- The exported package **should be accepted by the import harness as an import source**
  (J.3 may re-point the harness's fixture at an exported copy to prove round-trip).
- **Export does not prove `restore` / relink** — it only copies a package; it never writes
  the store. `restore` / relink remains **deferred**.

## 9. Proposed phases

- **J.1** — export / share **contract validator** (static): lock this contract + the
  export entry-point shape; flip the recovery validator's `.h2ochat`-export forbiddance to
  "export allowed only in a Desktop-only, verification-gated, no-overwrite exporter
  module" (lock-step, mirroring the H.4 importer flip).
- **J.2** — Desktop **read-only export / share action**: a focused module/card that
  verifies via `inspectPackage`, then folder-copies the package to an operator-selected
  destination (no overwrite); makes the minimal, bounded capability decision for the
  destination write scope.
- **J.3** — **runtime smoke**: a verified package is exported / copied and the copy
  re-inspects `verified` (and is accepted by the import harness); no source/DB mutation.
- **J.4** — **optional zip-format decision** (single-file package), if wanted.
- **J.5** — **closure.**

`restore` / relink remains deferred throughout Phase J.

## Boundaries preserved (this contract)

Docs/evidence only. No runtime / validator / capability / UI change. No
scanner/materializer/writer/importer/inspector change; no Chrome runtime/service-worker; no
`S0F0j` / `S0F1j`. f17 migration-drift untouched. No sync/appearance/ribbon dirty files
touched; no `stash@{0}` change; concurrently staged sync-lane files left untouched
(pathspec-only commit).

## Validation results

```text
git diff --check / --cached --check    clean
```

## Verdict

**PHASE J.0 CONTRACT — NOT IMPLEMENTED.** Phase J will add a Desktop-only,
verification-gated, **no-overwrite folder-copy export** of one `.h2ochat` package to an
operator-selected destination — distinct from the full-bundle exporter, with Chrome having
no package-body authority, the source package never mutated, and the central open question
(the destination write **capability**) deferred to a minimal, bounded J.2 decision. Zip,
cloud/share, and restore/relink remain deferred.

## Recommended next step after J.0

Proceed to **J.1**: add the static export/share **contract validator** and flip the
recovery validator's `.h2ochat`-export forbiddance to the verification-gated, no-overwrite
exporter shape (lock-step) — without implementing the export action yet. Keep zip, cloud,
and restore/relink deferred. Out of lane, the pre-existing **f17 migration-drift (v13 gap)**
still awaits the Desktop/sync lane.
