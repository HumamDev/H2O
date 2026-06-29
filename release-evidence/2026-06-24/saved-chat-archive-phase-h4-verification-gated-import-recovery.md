# Saved Chat Archive — Phase H.4 Verification-Gated Import / Recovery

Date: 2026-06-29

Status: **H.4 VERIFICATION-GATED IMPORT RECOVERY ACTION — PASSED**

(Implementation complete + static + behavioral proof. The live Tauri **dry-run**
smoke is the operator step, with a pre-confirmed expectation below; the
import-as-new **write** runtime is deferred to H.5 — no conflict-free foreign
package exists on disk, see "Runtime smoke status".)

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection
of `.h2ochat` packages).

## Baseline

```text
e8e2ca1  docs(studio): define archive recovery import export contract   (H.0)
8445820  test(studio): validate archive recovery import export contract (H.1)
2ccd878  feat(studio): add read-only archive inspector                  (H.2)
a4ceade  docs(studio): record archive inspector runtime smoke           (H.3 wiring)
5a05e54  docs(studio): mark archive inspector runtime smoke passed       (H.3 PASS)
```

## Investigation summary (is a safe no-overwrite import even possible?)

The H.4 instruction is explicit: if the Desktop store APIs cannot import without
overwriting existing state, **stop and mark blocked**. They can — but only via a
specific primitive:

- `store/snapshots.tauri.js` — `upsert(input)` routes an **existing** snapshotId
  to `UPDATE snapshots …` (overwrite — unsafe). `create(input)` only *generates*
  a snapshotId when the patch omits one ([snapshots.tauri.js:442](src-surfaces-base/studio/store/snapshots.tauri.js)),
  so calling **`create` with NO snapshotId → fresh id → `INSERT`** is
  collision-impossible (never an update). That is the safe no-overwrite primitive.
- `store/chats.tauri.js` — `upsert(patch)` with an **existing** chatId UPDATEs;
  with a **fresh** chatId INSERTs. So a recovered chat written under a freshly
  generated id is INSERT-only.
- Schema FKs are **soft** (column convention only; "No SQL FOREIGN KEY",
  [lib.rs:282/366/464](apps/studio/desktop/src-tauri/src/lib.rs)), so a snapshot
  insert never fails on a missing chat row.
- The `.h2ochat` `snapshot.json` carries a **portable** message model
  (`role` / `contentText` / `turnIndex` / `content` parts / `author` / ids) — NOT
  the store's rich `outerHtml`. The existing legacy importer's
  `buildTurnsFromSnapshot` ([import-bundle.tauri.js:548](src-surfaces-base/studio/ingestion/import-bundle.tauri.js))
  confirms the `store.snapshots.create({turns:[]})` shape. Recovery therefore
  preserves text + role + order faithfully and keeps the content parts in turn
  meta, with `outerHtml` left empty — a **documented, lossy-but-safe** text
  recovery (the original rendered HTML is simply not in the package).

Conclusion: **NOT blocked.** A no-overwrite import-as-new is structurally possible
(fresh-id `create` + fresh-id chat `upsert`), so H.4 implements it.

## Implementation summary

New focused, Desktop-only **sibling** module
`saved-chat-archive-importer.studio.js` (`H2O.Studio.archiveImporter`,
`0.1.0-phase-h-4`). It is a **separate** module from the read-only inspector on
purpose: the inspector stays read-only (its validator still forbids any write),
and this module owns the single, verification-gated write.

Two-step, no silent overwrite:

1. **`dryRunImportPackage({ packagePath })`** — NON-MUTATING. Reuses the read-only
   inspector (`archiveInspector.inspectPackage`) for verification, then reads
   existing store state (`snapshots.get` by the package snapshotId; `chats.get` /
   `snapshots.listByChat` by the package chatId) and returns one decision:
   `import-ready` / `already-imported` / `conflict-chat-id` /
   `conflict-snapshot-id` / `corrupted` / `unsupported-version` / `rejected`.
   It performs only reads — it never writes.

2. **`importVerifiedPackage({ packagePath, mode })`** — EXPLICIT operator action.
   Allowed only when the dry-run is `import-ready` (writes) or `already-imported`
   (a documented NO-OP). Default mode `import-as-new` recovers the package as a
   **brand-new** chat + snapshot:
   - allocates a **fresh** recovered chatId (`generateRecoveredChatId`, collision-
     checked) — never the package's original id;
   - writes the recovered chat via `chats.upsert` (fresh id → INSERT);
   - writes the recovered snapshot via `snapshots.create` with **no snapshotId**
     in the patch (store generates a fresh id → INSERT);
   - records provenance (`recovered: { originalChatId, originalSnapshotId,
     contentHash, digest, packagePath, recoveredAt, … }`);
   - re-verifies `verified` at write time and refuses an empty/partial payload.
   `mode: 'restore'` / `'relink'` (re-linking onto the original ids) is **deferred**
   (returns `rejected` / `restore-relink-deferred`) — too risky for H.4.

UI: an **adjacent recovery card** (eyebrow "Import / recovery · Desktop only ·
verification-gated"), mounted as a sibling beneath the read-only Archive Health /
Inspector cards via a one-block delegation in `archive-health-ui.studio.js` (the
same read-only-preserving pattern F.2/H.2 used). Controls: Load packages → select
→ **Dry-run** → decision pill; **Import (recover as new)** is **disabled until a
dry-run returns import-ready** (explicit, gated). No global floating button. Clear
states: `verified` / `import-ready` / `already-imported` / `conflict` /
`corrupted` / `imported` / `rejected`.

## Files changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js`
  (**new** — the importer/recovery module + card).
- `src-surfaces-base/studio/ingestion/archive-health-ui.studio.js` (one
  read-only-preserving delegation block; mounts the importer card as a sibling).
- `src-surfaces-base/studio/studio.html` (+1 `<script>` loader for the importer,
  after the inspector at line 645).
- `tools/product/studio/pack-studio.mjs` (importer added to **both** pack
  allowlists, kept consistent with the `studio.html` ref — enforced by
  `validate-f17-build-package.mjs`'s refs↔allowlist check).
- `tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
  (H.2 → H.4 flip; see "Validator changes").
- `tools/validation/studio/validate-studio-archive-health-ui.mjs` (lock-step:
  the importer delegation legitimately names `archiveImporter` /
  `mountArchiveImporterCard`, so the read-only/no-action-label scans now run on a
  copy with the *sibling-delegation identifiers neutralized* — any real
  `import`/`recover`/`restore`/`upsert` token still trips; verified by a negative
  test).
- `release-evidence/2026-06-24/saved-chat-archive-phase-h4-verification-gated-import-recovery.md`
  (this note).

No scanner / materializer / writer / projector / CAS change. No Chrome runtime /
service-worker / capability change. No watcher/poller/daemon. No `S0F0j` /
`S0F1j` edits. No `.h2ochat` export runtime. The appearance/ribbon/sync dirty
files and `stash@{0}` were not touched.

## Dry-run behavior (decision table)

| store state (for a `verified` package)                | decision               | writes |
|-------------------------------------------------------|------------------------|--------|
| snapshotId present, content digest matches            | `already-imported`     | none   |
| snapshotId present, content digest differs            | `conflict-snapshot-id` | none   |
| snapshotId absent, chatId present                     | `conflict-chat-id`     | none   |
| snapshotId absent, chatId absent (foreign)            | `import-ready`         | none   |
| inspector `corrupted` / `missing-files` / `hash-mismatch` | `corrupted`        | none   |
| inspector `unsupported-version`                       | `unsupported-version`  | none   |
| read-error / not desktop / unscoped                   | `rejected`             | none   |

## Import behavior

| dry-run decision        | mode           | result                       | writes                              |
|-------------------------|----------------|------------------------------|-------------------------------------|
| `already-imported`      | import-as-new  | `already-imported` (no-op)   | **none**                            |
| `import-ready`          | import-as-new  | `imported`                   | 1 chat INSERT + 1 snapshot INSERT (fresh ids) |
| `conflict-*`            | import-as-new  | `conflict`                   | **none**                            |
| `corrupted`/`unsupported`/`rejected` | import-as-new | `rejected`        | **none**                            |
| any                     | `restore`/`relink` | `rejected` (`restore-relink-deferred`) | **none**          |

## Conflict policy (per H.0)

- **existing snapshotId, same content digest** → `already-imported` (no-op).
- **existing snapshotId, different digest** → `conflict-snapshot-id`; the existing
  snapshot is **never overwritten**.
- **existing chatId** (snapshot absent) → `conflict-chat-id`; the existing chat is
  **never modified silently**. (Import-as-new under a *fresh* recovered chat for
  this case is intentionally deferred — H.4 only auto-imports `import-ready`.)
- **title/name collision** is not a hard conflict — the recovered chat is titled
  `"Recovered: <title>"`.
- **foreign machine/profile package** imports only as a *recovered* new chat +
  snapshot, with provenance.

## No-overwrite proof

By construction, an import can only ever **INSERT new rows**:

- the recovered chat is written under a **freshly generated** id
  (`generateRecoveredChatId`, collision-checked) — `chats.upsert` on a non-existent
  id INSERTs, never UPDATEs;
- the recovered snapshot is written via `snapshots.create` with **no `snapshotId`
  in the patch** → the store generates a fresh id → INSERT;
- the snapshot **overwrite-by-id** primitive is **never called**;
- the package's original chatId/snapshotId are written only into provenance
  metadata; a runtime guard refuses to reuse an original id for a write.

Behaviorally verified by loading the real IIFE in Node with mocked Tauri fs +
inspector + stores, exercising every path against the **real** package
`snapshot.json` and the **real** DB-confirmed state of the target:

```text
[pure]  buildTurnsFromPackageSnapshot: 10 messages -> 10 turns; turnIdx 0..9 monotonic;
        outerHtml all "" (lossy-text recovery); meta keeps content parts + author + ids
[dry]   snap exists + digest match    -> already-imported
[dry]   snap exists + digest differs  -> conflict-snapshot-id
[dry]   snap absent + chat exists     -> conflict-chat-id
[dry]   snap absent + chat absent     -> import-ready
[dry]   inspector corrupted           -> corrupted
[dry]   inspector unsupported-version -> unsupported-version
[import] already-imported  -> status already-imported,  0 writes (NO-OP)
[import] import-ready      -> status imported; chats.upsert chatId != original;
         snapshots.create has NO snapshotId in patch; chatId == fresh chat;
         provenance.originalSnapshotId preserved; turns 10;
         snapshots overwrite-by-id NEVER called
[import] mode=restore      -> rejected (restore-relink-deferred), 0 writes
[import] conflict-chat-id  -> conflict, 0 writes
```

## Validator changes

`validate-saved-chat-archive-recovery-import-export-v1.mjs` (H.2 → H.4):

- `ALLOWED_H2OCHAT` now includes the importer (it legitimately references
  `.h2ochat`).
- The "no import/write entry point" invariant is **repurposed**: the real entry
  points (`dryRunImportPackage` / `importVerifiedPackage`) may exist **only** in
  the importer module — never leaked into writer/diagnostics/inspector/scanner/
  materializer/Chrome reader. The legacy placeholder names remain forbidden
  everywhere.
- New **9-check `[H.4]` section**: importer exists + registers `archiveImporter`
  (+ health-UI delegates the mount); Desktop-only + store-gated; reuses the
  read-only inspector for verification; **dry-run non-mutating** (no
  create/upsert/SQL/fs-write inside `dryRunImportPackage`); **verification-gated**
  (requires `import-ready`, re-verifies, refuses empty/partial); **no-overwrite**
  (`snapshots.create` fresh id, overwrite-by-id primitive never used, no
  `snapshotId` in the create patch, original ids never reused); writes **only**
  through the store adapters (no raw SQL); restore/relink deferred + provenance +
  full decision vocabulary; no package-HTML execution / no watcher/scanner/Chrome/
  sync coupling.
- New `[INVARIANT]`: **no `.h2ochat` EXPORT / share runtime** exists yet (deferred).
- The H.2 read-only inspector checks are unchanged — the inspector **stays
  read-only**.

`validate-studio-archive-health-ui.mjs` (lock-step): the health card's read-only /
no-action-label scans now run on `helperLogic` (the comment-stripped code with the
three sibling-mount delegation identifiers — operator-action / inspector / importer
— neutralized), so a module *named* `archiveImporter` no longer false-positives
while a real `importSnapshot(`/`recover`/`restore`/`upsert` in the helper still
fails. Verified by an inline negative test.

## Validation results

```text
node --check (importer, health-ui, pack-studio, recovery validator)   all OK
validate-saved-chat-archive-recovery-import-export-v1.mjs   PASS 34 (11 H.1 + 7 INVARIANT + 7 H.2 + 9 H.4)
validate-studio-archive-health-ui.mjs                       all 19 checks passed
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs   PASS 15 checks
behavioral harness (Node, mocked Tauri/inspector/stores)    all paths correct; no-overwrite proven
git diff --check / --cached --check                         clean
```

`validate-f17-build-package.mjs`: the `studio.html` ↔ pack allowlist consistency
for the new importer `<script>` is satisfied (the importer is in both allowlists).
The one pre-existing, UNRELATED `migrations/migration-source` failure
(`build-package-migration-gap-duplicate-or-missing-v13` in committed
`src-tauri/lib.rs studio_migrations()`) is a Desktop-migration concern not touched
by H.4 — flagged separately as a background task.

## Runtime smoke status

- **Live Tauri dry-run (operator step):** I cannot drive the Desktop WKWebView
  (no remote debug port — same constraint as F.3 / G.3 / H.3). After the normal
  dev rebuild (`node tools/dev/dev-all.mjs` → chrome/prod → `prepare-dist` → dist)
  + reload, the operator runs ONE real dry-run:

  ```js
  const imp = H2O.Studio.archiveImporter;
  imp.isDesktopCapable();                                   // expect true
  JSON.stringify(await imp.dryRunImportPackage({
    packagePath: 'archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat'
  }), null, 2);
  ```

  **Expected (pre-confirmed from the live store, `studio-v1.db`):** the target's
  snapshot `snap_1778516336177_wy9txv06` is present with digest
  `929078217d53ea73…`, which **matches** the package's `metadata.digest` →
  decision **`already-imported`**, `mutated:false`, **no write**. (The Node
  behavioral harness already exercised this exact path on the real package +
  real state.)

- **Import-as-new WRITE runtime — DEFERRED to H.5.** A real import-as-new write
  needs a **verified, conflict-free** package whose snapshot is *not* already in
  the store. All 18 packages on disk are projections of snapshots that already
  exist in the store, so every one dry-runs to `already-imported` — there is no
  safe target to exercise a real INSERT without contriving one. Per the H.4
  instruction ("if no safe package exists, defer write runtime to H.5"), the
  live import-as-new write is deferred to **H.5**, where a foreign/recovered
  package (e.g. from an export round-trip or a copied package with store rows
  removed) provides a conflict-free target. The write path itself is implemented,
  validator-gated, and behaviorally proven no-overwrite above.

## Boundaries preserved

- Verification-gated, no-overwrite, no partial import, explicit two-step
  (dry-run → import), Desktop-only.
- Inspector stays read-only (separate module; its validator checks unchanged).
- Writes only through the Desktop store adapters; no raw SQL, no package
  write/overwrite, no fs write, never reads/executes `chat.html`.
- No Chrome package read/write/import authority; no scanner/materializer/writer
  change; no capability change; no watcher/daemon; no sync/WebDAV/cloud/native.
- No `.h2ochat` export runtime; restore/relink deferred.

## Verdict

**H.4 VERIFICATION-GATED IMPORT RECOVERY ACTION — PASSED.** A Desktop-only,
two-step (dry-run → explicit import), **no-overwrite** import/recovery action for
`.h2ochat` packages: it reuses the read-only inspector as the verification gate,
decides safely (`import-ready` / `already-imported` / conflict / corrupted /
unsupported / rejected), and — only for `import-ready` — recovers the package as a
**new** chat + snapshot via fresh-id INSERTs with provenance, structurally
incapable of overwriting existing rows (the overwrite-by-id primitive is never
called). Static (34 checks) + behavioral (every path, no-overwrite proven on real
data) validation is green; the live Tauri **dry-run** is the operator step with a
DB-confirmed `already-imported` expectation, and the import-as-new **write**
runtime is deferred to H.5 for lack of a conflict-free foreign package.

## Recommended next step after H.4

**H.5** — exercise the import-as-new **write** on a real conflict-free package:
construct/obtain a foreign or recovered `.h2ochat` package whose snapshot is not
in the store (an export round-trip, or a copied package with its store rows
absent), dry-run it to `import-ready`, then run `importVerifiedPackage` and prove:
a NEW recovered chat + snapshot appear, with provenance, and **no existing row is
modified** (before/after counts on every other chat/snapshot identical). H.5 may
also add the deferred **`restore` / relink** mode (verification-gated re-link onto
original ids) and/or the deferred **package export/share** runtime, each in its
own slice. Separately and out of lane, the **f17 migration-drift (v13 gap) in
`src-tauri/lib.rs studio_migrations()`** still awaits the Desktop/sync lane (a
pre-existing committed-state issue, flagged as a background task).
