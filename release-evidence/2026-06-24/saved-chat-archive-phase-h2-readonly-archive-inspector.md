# Saved Chat Archive — Phase H.2 Read-Only Archive Inspector

Date: 2026-06-29

Status: **H.2 READ-ONLY ARCHIVE INSPECTOR — PASSED**

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection
of `.h2ochat` packages).

This slice implements the H.0/H.1 **inspector-first** decision: a Desktop-only,
**read-only** Archive Inspector module/card, mounted adjacent to the read-only
Archive Health diagnostics card. It verifies and previews one already-written
`.h2ochat` package; it never imports, writes, or overwrites anything.

## Baseline

```text
e8e2ca1  docs(studio): define archive recovery import export contract   (H.0)
8445820  test(studio): validate archive recovery import export contract (H.1)
```

## Implementation summary

New focused module `saved-chat-archive-inspector.studio.js`
(`H2O.Studio.archiveInspector`, `0.1.0-phase-h-2`):

- **Desktop-only** — `detectTauri()` + presence of the diagnostics validation API;
  on Chrome the card renders a disabled "Desktop Studio only" message.
- **Reuses the read-only diagnostics validation** — calls the existing
  `H2O.Studio.ingestion.validateSavedChatPackageV1({ packagePath })` for the
  authoritative manifest / required-file / hash / asset checks, and
  `listSavedChatArchivePackagesV1()` for the package inventory. It does **not**
  re-implement hash logic.
- **Scoped, no arbitrary paths** — only inspects packages already inside
  `archive/packages` (a `packagePathIsScoped` guard requires the path to be under
  `archive/packages/` and end in `.h2ochat`); the operator selects from the
  inventory, never types a free path. No new capability — it reads package files
  through the existing bounded archive fs scope (`plugin:fs|read_file`,
  `baseDir: AppLocalData`).
- **Read-only** — it reads `manifest.json` (identity) and `chat.md` (title + a
  short ESCAPED text preview). It **never** reads `chat.html`, never executes
  package HTML, never writes a store snapshot, never overwrites a package.
- **Pure status mapping** — `mapInspectStatus(diag, readError)` maps the validator
  diagnostic into a granular, most-specific status.

The inspector is mounted as a **sibling** beneath the read-only Archive Health card
via a one-block delegation added to `archive-health-ui.studio.js` (the same
read-only-preserving pattern F.2/G.2 used for the operator card). The health card
performs no mutation; it only delegates a `mountArchiveInspectorCard(container)`
call.

## Files changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js`
  (new — read-only inspector module).
- `src-surfaces-base/studio/ingestion/archive-health-ui.studio.js`
  (one read-only-preserving delegation block; mounts the inspector as a sibling).
- `tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
  (H.1 → H.2: the inspector is now an allowed read-only `.h2ochat` reader; added
  7 `[H.2]` assertions; the IMPORT/WRITE entry points (H.4) still must not exist).
- `release-evidence/2026-06-24/saved-chat-archive-phase-h2-readonly-archive-inspector.md`
  (this note).

**Deferred wiring (H.3):** the `studio.html` `<script>` load and the
`pack-studio.mjs` packed-list entry for the inspector are **deferred**, because
`studio.html` and `pack-studio.mjs` currently carry **uncommitted sync-lane
changes** that the pathspec-only / do-not-stage-unrelated constraints forbid
co-staging (and a path-scoped stash is unsafe with the active concurrent
committer). The exact two lines to add when those files are clean:

```html
<!-- studio.html: before ./ingestion/archive-health-ui.studio.js -->
<script src="./ingestion/saved-chat-archive-inspector.studio.js"></script>
```
```js
// pack-studio.mjs: add to BOTH packed lists (next to the materializer-action entry)
"ingestion/saved-chat-archive-inspector.studio.js",
```

Until added, the module is not loaded at runtime, so the health-UI delegation's
`typeof inspectorApi.mountArchiveInspectorCard === 'function'` guard skips
gracefully (no error, the card simply does not appear). This wiring + the runtime
smoke are H.3.

No scanner / materializer / package-writer / projector / CAS / store / Chrome /
capability change. No `S0F0j` / `S0F1j` edits.

## Inspector UI location

Settings → Diagnostics: a dedicated **"Inspect Saved Chat Archive Package"** card
(eyebrow "Read-only inspector · Desktop only"), a **sibling** beneath the read-only
Archive Health card (and the F.2/G.2 operator card). Controls: a **"Load packages"**
button → a `<select>` of inventory packages → an **"Inspect package"** button → a
result block with a status pill, an identity table, a files/hash/version check
line, and a `chat.md` preview. No global floating button; no Chrome row mutation.

## Read-only verification behavior

Per package: required files present (`manifest.json` / `snapshot.json` / `chat.md`
/ `chat.html`), file hashes match the manifest, `contentHash` matches
`sha256(snapshot.json)` (via the validator's `hashChecks`), assets checked if
present, and `schemaVersion`/`payloadVersion` compatibility (v1/v2) reported — all
sourced from the reused read-only `validateSavedChatPackageV1`. The inspector adds
only display reads (manifest identity, `chat.md` title + preview).

## Status vocabulary

`verified` / `corrupted` / `missing-files` / `hash-mismatch` /
`unsupported-version` / `read-error` — resolved most-specific-first from the
validator diagnostic (`read-error` > `missing-files` > `hash-mismatch` >
`unsupported-version` > `corrupted` > `verified`).

## Package content preview safety

The preview is the first ~600 characters of **`chat.md`** (markdown text),
rendered **HTML-escaped** in a `<pre>` (`escapeHtml(r.preview)`). The inspector
**never reads `chat.html`**, never injects untrusted HTML, and uses no
`eval`/`new Function`. The package's own HTML is never executed.

## Why Archive Health remains read-only

The inspector is a **separate module** mounted as a sibling; the Archive Health
card is unchanged and performs no mutation — it only delegates a single
`mountArchiveInspectorCard` call (the same pattern as the F.2 operator card). The
`validate-studio-archive-health-ui.mjs` validator stays green (19 checks).

## Why no Chrome authority expanded

The inspector is Desktop-gated and reads only the Desktop archive fs (existing
`archive-cas` scope) + reuses the Desktop diagnostics validator. Chrome has no
Tauri runtime, performs no package/CAS/SQLite reads or writes, and gains no new
read-back. No capability was changed.

## Validation results

```text
node --check (inspector, health-ui, validator)               all OK
validate-saved-chat-archive-recovery-import-export-v1.mjs     PASS 24 (11 [H.1] + 6 [INVARIANT] + 7 [H.2])
validate-studio-archive-health-ui.mjs                         all 19 checks passed
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs     PASS 15 checks
validate-saved-chat-archive-materializer-trigger-v1.mjs       PASS 24 checks
git diff --check / --cached --check                           clean
```

## Runtime smoke — DEFERRED to H.3

The inspector is Tauri-gated and reads real package files in Desktop Studio /
Tauri DevTools, which this environment cannot drive programmatically (the WKWebView
exposes no remote debug port — same constraint as F.3/G.3). Additionally the
`studio.html` load + `pack-studio.mjs` entry are deferred (above), so the module is
not yet served by the dev build. The runtime smoke therefore moves to **H.3**:
add the two wiring lines, `node tools/product/studio/pack-studio.mjs` + reload the
dev build, then run (operator snippet):

```js
// Desktop Studio DevTools (Tauri), after wiring + reload:
const ins = H2O.Studio.archiveInspector;
ins.isDesktopCapable();                                   // expect true
JSON.stringify(await ins.listPackages());                 // inventory (>= 18 packages)
const r = await ins.inspectPackage({ packagePath: 'archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat' });
JSON.stringify(r, null, 2);
// expect status:"verified"; identity.chatId/snapshotId/contentHash/title present;
// checks files ✓ + contentHash ok + version supported; preview non-empty; NO store mutation.
```

Static + behavioral validation (24 checks + `node --check`) covers the inspector
logic and read-only boundaries.

## Boundaries preserved

- Read-only inspector only — no import, no `snapshots.create`/`upsert`, no DB
  insert/update, no package write/overwrite (validator-enforced).
- No package-HTML execution; preview is escaped `chat.md` text; `chat.html` is
  never read.
- Archive Health stays read-only (sibling mount, delegation only).
- No Chrome authority; no scanner/materializer/writer change; no capability change.
- No watcher/poller/daemon; no sync/WebDAV/cloud/native messaging.
- No `S0F0j` / `S0F1j` edits; no sync/appearance/ribbon dirty files touched; the
  concurrently-staged WebDAV/cloud relay memo was left untouched (pathspec-only
  commit).

## Verdict

**H.2 READ-ONLY ARCHIVE INSPECTOR — PASSED.** A Desktop-only, read-only inspector
module + sibling card verify and preview one `.h2ochat` package by reusing the
read-only diagnostics validation, with a granular status vocabulary, an
HTML-escaped `chat.md`-only preview, and no store/package mutation or Chrome
authority. The `studio.html`/`pack` load wiring and the live runtime smoke are
deferred to H.3 (sync-lane-dirty files + Tauri DevTools).

## Recommended next step after H.2

Proceed to **H.3** — add the two deferred wiring lines (when `studio.html` /
`pack-studio.mjs` are clean), re-pack + reload the dev build, and run the read-only
inspect smoke on a known package (`69f0c5f3-….h2ochat`): prove `status:"verified"`,
the file/hash checks pass, the identity + preview render, and **no DB/store
mutation** occurs. Then **H.4** is the verification-gated, no-overwrite
import/recovery action (importer entry points still gated off by this validator).
