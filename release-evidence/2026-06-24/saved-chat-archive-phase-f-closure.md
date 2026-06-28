# Saved Chat Archive — Phase F Closure

Date: 2026-06-28

Status: **PHASE F CLOSED — PACKAGE MATERIALIZATION PROVEN**

Lane: Chat Saving Architecture (Phase F — package materialization trigger + status).

This is a docs/evidence-only note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes. It closes Phase F by recording what the
F.0–F.4.1 chain proved and what was deliberately deferred.

## Scope

Phase F took the existing D.2C materializer from "writer exists but nothing calls
it" to a **proven, bounded, Desktop-only materialization path**: a real
`validated` saved-chat archive request was driven to a real `.h2ochat` package on
disk and back-verified end to end, and the question of surfacing that
"package-written" state to Chrome was answered with a contract + validator (kept
deferred for implementation).

## Closed Chain

```text
046089a  docs(studio): define archive materializer trigger contract      F.0  contract
b8660f2  test(studio): validate archive materializer trigger boundary     F.1  trigger validator
a2a3cb7  feat(studio): add desktop archive materializer action            F.2  Desktop operator action
464d512  fix(studio): allow desktop dev archive materializer capabilities F.3  runtime smoke (+ dev ACL fix)
06ea40a  docs(studio): define archive package-written status contract     F.4  status contract
08af3f3  test(studio): validate archive package-written status contract   F.4.1 status validator
```

Evidence notes (all under `release-evidence/2026-06-24/`):
`…phase-f-materializer-trigger-contract.md`, `…phase-f1-trigger-validator.md`,
`…phase-f2-desktop-materializer-action.md`, `…phase-f3-materializer-runtime-smoke.md`,
`…phase-f4-status-contract.md`, `…phase-f41-package-written-status-validator.md`,
and this closure.

## What Phase F Proves

- **The D.2C materializer already existed and remained the writer boundary.**
  `materializeSavedChatArchiveRequestV1` (Desktop/Tauri-only) is the sole trigger;
  `writeSavedChatPackageV1({ snapshotId, overwrite:false })` remains the sole
  package writer. Phase F added the *trigger*, never a second writer.
- **F.2 added a Desktop-only operator action.** A separate
  `H2O.Studio.archiveMaterializerAction` module, mounted as a sibling beneath the
  read-only Archive Health card, invokes the materializer for one explicit
  `requestId` — no global button, no automatic/scanner/watcher trigger, read-only
  diagnostics preserved.
- **F.3 proved real runtime materialization** in Desktop Studio / Tauri DevTools:
  - first run: `validated → written` (`ok:true`, `previousStatus: validated`);
  - second run: `written → already-written` (idempotent, no writer call, no
    duplicate package).
  - Real package path:
    `archive/packages/69de12dc-b7dc-838c-a553-916422265e5a.h2ochat`
  - Real content hash:
    `sha256-b47d293837a5804df3b200cb9feff8b373ca2703ffff855e3152790b598cb634`
- **Disk, manifest, DB, and diagnostics semantics were verified.** All four
  package files present (`manifest.json`, `snapshot.json`, `chat.md`, `chat.html`;
  no `assets/` — text-only chat); independently recomputed `sha256` of every file
  matched the manifest descriptors; `contentHash` = `sha256(snapshot.json)` (the
  authoritative snapshot payload) and matched the materializer result; the DB row
  was `written` with a complete `meta_json.materialization`
  (packagePath/contentHash/snapshotId/writtenAt, `overwrite:false`); status
  distribution moved by exactly one (`validated 58→57`, `written 3→4`) with no
  `failed`/`db-unavailable` residue; the on-disk equivalents of Archive Health's
  C5.1/C5.2/C5.3 checks passed (`packagesOk`).
- **A Tauri dev-origin capability gap was found and fixed minimally.** The dev
  WebView runs from a remote origin (`http://127.0.0.1:1430`), which no capability
  covered, so all `plugin:sql|*` (and the package-write `plugin:fs|*`) were
  ACL-denied. Fixed by adding a dev-only `remote.urls` scope to the two Desktop
  capabilities:
  - `http://127.0.0.1:1430/*`
  - `http://localhost:1430/*`

  (in `default.json` for SQL and `archive-cas.json` for the package-write fs).
  No new permissions were added; the scope is inert in production (`tauri://`
  local).
- **Chrome authority did not expand.** The capability scope is localhost dev URLs
  only — no `chrome-extension://` origin; Chrome has no Tauri runtime and performs
  no SQL/CAS/package writes; the package `manifest.provenance` records
  `sourceOfTruth: desktop-sqlite-store`, `projectionOnly: true`.
- **F.4 / F.4.1 decided the Chrome package-written status remains contract-only
  for now.** "Archived" keeps meaning "Desktop durably captured/accepted the
  request" (`queued-on-desktop → archived`); the stronger `package-written →
  archived-package-written` ("Archived · package written") substate is **defined**
  as an additive immutable-scan + materialization-sidecar receipt read by Chrome
  as files only, and **statically locked** by the F.4.1 validator
  (`PASS 15 checks`), but **not implemented**.

## Boundaries Preserved

- **Chrome remains intent / read-back only** — reads receipt files via the granted
  Archive Request folder; no Desktop SQLite, no native messaging, no package/CAS
  body inspection, no package/CAS/SQLite writes.
- **Desktop owns the DB, materializer, package writer, and Archive Health** — and
  remains the sole package writer from the resolved Desktop `snapshotId`.
- **No Chrome SQL / CAS / package writes.**
- **No scanner auto-materialization** — the scanner stays enqueue-only
  (`materializeTriggered:false`); materialization is an explicit operator action.
- **No watcher / poller / daemon** — no `setInterval`/`MutationObserver`/
  background loop anywhere in the trigger or status path.
- **No `S0F0j` / `S0F1j` edits.**
- **No sync / WebDAV / cloud / native messaging / localhost relay** added for this
  path.
- **No package overwrite** — `overwrite:false` throughout; the idempotent re-run
  returned `already-written` with identical `contentHash`/`packagePath` and wrote
  nothing.

## Deferred Work

- **F.4.2 — Desktop materialization sidecar receipt + one-shot backfill/reconcile**
  (for already-`written` rows such as F.3's `f7cd514a-…`) is **deferred unless
  product confirms the Chrome-visible `package-written` state should ship.**
- **F.4.3 — Chrome read-back / status model / badge update** (additive
  `archived-package-written` substate) is **deferred** (gated on F.4.2).
- **Automatic scanner-to-materializer trigger** is **deferred** — materialization
  stays a manual operator action; any future auto-trigger needs its own contract.
- **Import / export / recovery** remains a separate concern.
- **Sync / cloud / WebDAV package propagation** remains separate (the archive/CAS
  root is deliberately distinct from the Sync lane).
- **First-run onboarding and Archive Health repair UI** remain separate.

If F.4.2/F.4.3 are taken up, the F.4.1 validator must be updated in lock-step
(flip the "no sidecar implemented" invariants to assert the bounded sidecar writer
+ the additive read-back), mirroring the F.1→F.2 gate flip.

## Validation

Docs-only; no runtime code or validators changed. Re-run at closure:

```text
validate-saved-chat-archive-package-written-status-v1.mjs   PASS 15 checks
validate-saved-chat-archive-materializer-trigger-v1.mjs     PASS 24 checks
git diff --check / --cached --check                          clean
```

## Verdict

**PHASE F CLOSED — PACKAGE MATERIALIZATION PROVEN.** A real saved-chat archive
request was materialized into a real, hash-consistent `.h2ochat` package via a
bounded, Desktop-only operator action, verified across disk/manifest/DB/diagnostics
and proven idempotent, with the dev-origin capability gap fixed minimally and no
Chrome authority expansion. The Chrome-visible "package-written" distinction is
defined and validator-locked but intentionally left unimplemented.

## Recommended Next Milestone

Hold Phase F at "materialization proven + status contract locked." The next
milestone is a **product decision**: either (1) proceed to **F.4.2/F.4.3** to make
`package-written` Chrome-visible (worthwhile mainly once materialization becomes
automatic/bulk rather than a manual operator action), or (2) keep package-written
state Desktop-only in Archive Health and instead prioritize the **automatic
scanner→materializer trigger contract** (the natural Phase G), which would make
materialization routine and give the Chrome `package-written` distinction real
day-to-day value. Recommend (2) first: decide the auto-trigger policy before
expanding Chrome's read-back surface.
