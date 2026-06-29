# Saved Chat Archive — Phase H.1 Recovery / Import / Export Validator

Date: 2026-06-29

Status: **H.1 RECOVERY IMPORT EXPORT VALIDATOR — PASSED**

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection
of `.h2ochat` packages).

This slice adds a **static contract validator only** — no runtime implementation.
It locks the H.0 contract (`e8e2ca1`) and asserts the current runtime is still
pre-implementation, so any future H.2/H.4 inspector/importer must consciously
update this validator.

## Baseline

```text
78e2492  docs(studio): close saved chat archive phase g
e8e2ca1  docs(studio): define archive recovery import export contract   (H.0)
```

## Validator purpose

`tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
asserts, statically (reads source/doc text; no runtime, DB, or network):

1. The H.0 contract exists, is **NOT IMPLEMENTED**, and encodes the policy:
   inspector-first; product goals; the Desktop-owns-import authority model;
   recovery modes; the verification gate; conflict handling; the UX boundary; and
   the safety boundaries.
2. The **current** runtime matches the pre-implementation state — no `.h2ochat`
   reader/importer/inspector exists (only the writer + read-only diagnostics
   reference `.h2ochat`), Chrome has no package/CAS/SQLite authority,
   scanner/materializer/writer are unchanged, the diagnostics stay read-only, the
   writer stays a projection writer (not an importer), and the full-bundle
   import/export helpers are a different artifact.

It is the H.1→H.2 gate (same pattern as F.1→F.2, F.4.1, and G.1→G.2).

## H.0 contract summary (locked by this validator)

- **Inspector first** — ship a read-only package inspector (H.2/H.3) before any
  import/write recovery (H.4/H.5).
- **Goals** — inspect / verify integrity / open-read / import-if-safe / export.
- **Authority** — Desktop owns import; Chrome does not import or read the
  package/CAS body; the package is a **projection**, the DB stays the source of
  truth.
- **Recovery modes** — read-only inspector / import-as-new recovered / restore-
  relink to existing / reject corrupted.
- **Verification gate** — `manifest.json` + `snapshot.json` + `chat.md` + `chat.html`
  required; every file's sha256 must match the manifest; `contentHash =
  sha256(snapshot.json)`; v1/v2 schema/payload compatibility; assets checked if
  present; **no silent partial import**.
- **Conflict handling** — existing `chatId` / `snapshotId` / `contentHash`,
  title/name collision, foreign machine/profile.
- **UX** — Desktop-only, Archive Health / Archive Inspector area, explicit operator
  action, no global floating button, clear `verified/corrupted/already-exists/
  imported/rejected` states.
- **Safety** — no Chrome package authority, no scanner/materializer/watcher change,
  no sync/WebDAV/cloud propagation, no `S0F0j`/`S0F1j` edits, **no overwrite by
  default**.

## Recommended product assumptions (for H.2)

- **Dedicated Archive Inspector module/card adjacent to Archive Health** — H.2
  should build a *separate* inspector surface (its own module/card mounted beside
  the read-only health card), not mutate Archive Health directly — mirroring how
  the F.2/G.2 operator card was a sibling of the read-only health card.
- **Export stays in the H contract; runtime export can come later** — the contract
  keeps export/share as a goal, but the first runtime slices (H.2/H.3) are
  inspect + verify only.
- **Inspection/verification before import/write recovery** — H.2/H.3 (read-only)
  precede H.4/H.5 (import).
- **Chrome gets no package read/write authority** — unchanged across all of H.

## Invariants asserted (17 checks: 11 `[H.1]` + 6 `[INVARIANT]`)

**Contract (`[H.1]`):** H.0 exists; NOT IMPLEMENTED; states no reader/importer/
inspector exists yet; recommends inspector-first; defines goals; preserves the
authority model; defines recovery modes; defines the verification gate; defines
conflict handling; defines the UX boundary; defines the safety boundaries.

**Current runtime boundaries (`[INVARIANT]`):**
- **No `.h2ochat` reader/importer/inspector exists** — a directory walk
  (comment-stripped) confirms `.h2ochat` is referenced **only** by the writer
  (`saved-chat-package-v1.tauri.js`) and the read-only diagnostics
  (`saved-chat-archive-diagnostics.tauri.js`); no importer/inspector entry-point
  name (`importSavedChatPackage`, `inspectSavedChatPackage`, `recoverSavedChat`, …)
  exists anywhere.
- Chrome (mv3 reader) has no package/CAS body or SQLite authority.
- Scanner stays enqueue-only (no materializer call); materializer stays
  Desktop/Tauri-gated; writer still defines the package writer.
- Diagnostics still validates `REQUIRED_FILES` + sha256, read-only (no fs-write,
  no sql-execute, no materializer, no snapshot create/upsert).
- Package writer still emits `projectionOnly` projection packages and is **not** an
  importer (no importer name, no `snapshots.create`/`upsert`).
- `import-bundle` / `export-bundle` reference `h2o.studio.fullBundle` and **never**
  `.h2ochat` (a different artifact).

## Current runtime status

- **No package inspector/importer implemented yet** — only the writer + read-only
  diagnostics touch `.h2ochat`.
- **Diagnostics are read-only** — `diagnoseSavedChatArchiveV1` validates required
  files + hashes/assets and mutates nothing.
- **Chrome has no package authority** — the mv3 reader touches no package/CAS body
  or SQLite; it stays receipt-files-only.

## Validation results

```text
node --check (new validator)                                  syntax OK
validate-saved-chat-archive-recovery-import-export-v1.mjs     PASS 17 checks
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs     PASS 15 checks
validate-studio-archive-health-ui.mjs                         all 19 checks passed
git diff --check / --cached --check                           clean
```

## Boundaries preserved

- **Validator/evidence only** — no package inspector/importer/exporter, no
  scanner/materializer/writer change, no Chrome/capability change.
- Chrome remains intent / read-back (no package authority); Desktop remains
  authoritative; diagnostics stay read-only; the writer stays a projection writer.
- No watcher/poller/daemon, no sync/WebDAV/cloud propagation.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged (the concurrently-staged WebDAV/cloud relay memo was left
  untouched — see commit note).

## Verdict

**H.1 RECOVERY IMPORT EXPORT VALIDATOR — PASSED.** The H.0 contract is statically
locked and the current runtime provably matches the pre-implementation state: no
`.h2ochat` reader/importer/inspector exists, the diagnostics stay read-only, the
writer stays a projection writer, and Chrome retains no package authority.

## Recommended next step after H.1

Proceed to **H.2** — the Desktop **read-only Archive Inspector** (a dedicated
module/card adjacent to Archive Health): select/inspect one `.h2ochat` package,
verify integrity by reusing/extending `diagnoseSavedChatArchiveV1` (manifest +
required-files + sha256 + asset checks → `verified`/`corrupted`), and render its
identity/contents read-only — **no store write**. When H.2/H.4 ship, this validator
must be updated in lock-step (flip the "no inspector/importer implemented"
invariants to assert the bounded read-only inspector, then the verification-gated
no-overwrite importer), mirroring the F.1→F.2 and G.1→G.2 gate flips.
