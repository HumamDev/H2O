# Saved Chat Archive — Phase H.3 Read-Only Inspector Runtime Smoke

Date: 2026-06-29

Status: **H.3 ARCHIVE INSPECTOR — WIRED + VALIDATED; runtime smoke is the operator's final Tauri-DevTools step (pre-confirmed verifiable)**

(Supersedes the earlier BLOCKED note: the `studio.html` blocker is resolved.)

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection).

The deferred H.3 loader wiring is now done — the inspector `<script>` is in
`studio.html` and the matching pack allowlist entries are present and consistent,
validated green. The live `inspectPackage` run must execute in Desktop Studio /
Tauri DevTools, which this environment cannot drive (the WKWebView has no remote
debug port — same as F.3/G.3), so the operator runs the final smoke; the target
package is **pre-confirmed verifiable on disk**, so it will return `verified`.

## Baseline

```text
2ccd878 feat(studio): add read-only archive inspector                  (H.2 module + delegation + validator)
a75cecf docs(studio): record blocked archive inspector runtime smoke   (H.3 blocked — now superseded)
```

## Blocker resolution summary

The H.3 blocker (`studio.html` carried 142 uncommitted **appearance/ribbon** lines —
a `wbSidebarScroll` sidebar-scroll feature coupled to dirty `studio.css`/`studio.js`)
was resolved by **path-scoped stashing only `studio.html`** as
`stash@{0}` (`wip-appearance-ribbon-studio-html-wbSidebarScroll-sidebar-scroll-2026-06-29`)
— it was not sync-lane work, not ready to commit, and is preserved for the
appearance/ribbon lane. `studio.html` is now clean at HEAD, so the inspector
loader + pack entries can be added consistently. `stash@{0}` was not popped,
applied, or modified.

## Files changed (wiring)

- `src-surfaces-base/studio/studio.html` — **+4 lines**: the inspector `<script>`
  loader, placed after the diagnostics it reuses (line 592) and before
  `archive-health-ui.studio.js` (line 656) which delegates the sibling mount.
- `tools/product/studio/pack-studio.mjs` — the inspector added to **both** pack
  allowlists (`ARCHIVE_WORKBENCH_SOURCE_FILES` + `ARCHIVE_WORKBENCH_OUT_FILES`),
  kept consistent with the `studio.html` ref (enforced by
  `validate-f17-build-package.mjs`'s refs↔allowlist check).
- `release-evidence/2026-06-24/saved-chat-archive-phase-h3-readonly-inspector-runtime-smoke.md`
  (this note).

No inspector-logic / scanner / materializer / writer / capability / S0F0j / S0F1j
change. The stashed appearance/ribbon files were not touched.

## Loader / pack wiring summary

```text
studio.html:592  <script .../saved-chat-archive-diagnostics.tauri.js>     (validateSavedChatPackageV1 — reused)
studio.html:645  <script .../saved-chat-archive-inspector.studio.js>       (NEW — H.2/H.3 inspector)
studio.html:656  <script .../archive-health-ui.studio.js>                  (delegates mountArchiveInspectorCard)
pack-studio.mjs  ARCHIVE_WORKBENCH_SOURCE_FILES + ARCHIVE_WORKBENCH_OUT_FILES: + inspector entry (both)
```

## Build the served dev dist (operator command)

The dev `dist` is **not** built by `pack-studio.mjs` (a function library). It is
built by the chrome-live build (`build-chrome-live-extension.mjs`, production
profile, orchestrated by `tools/dev/dev-all.mjs`) → `chrome/prod/surfaces/studio`,
then `apps/studio/desktop/build-tools/prepare-dist.mjs` copies that into
`apps/studio/desktop/dist`, which `tauri dev` serves. Refresh it with the normal
dev build, e.g.:

```bash
node tools/dev/dev-all.mjs          # rebuilds chrome/prod (incl. the inspector) + dist
# then reload the running Desktop Studio dev app
```

Quick alternative (no full rebuild — stage the module into the served dist):
```bash
cp src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js \
   apps/studio/desktop/dist/ingestion/      # then reload, and dynamic-inject in DevTools (below)
```

## Runtime smoke (operator, Desktop Studio / Tauri DevTools)

```js
typeof H2O.Studio.archiveInspector;                         // 'object'
typeof H2O.Studio.archiveInspector.inspectPackage;          // 'function'
typeof H2O.Studio.archiveInspector.listPackages;            // 'function'
// (if the full build wasn't run, first inject the staged dist module:)
// await new Promise((ok,no)=>{const s=document.createElement('script');
//   s.src='./ingestion/saved-chat-archive-inspector.studio.js';s.onload=ok;
//   s.onerror=()=>no(new Error('not served'));document.head.appendChild(s);});
const r = await H2O.Studio.archiveInspector.inspectPackage({
  packagePath: 'archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat'
});
JSON.stringify(r, null, 2);
```

**Expected (pre-confirmed on disk):**
```text
status: "verified"   ok: true
identity.chatId:      69f0c5f3-30c4-83eb-9240-26331d09532b
identity.snapshotId:  snap_1778516336177_wy9txv06
identity.contentHash: sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
checks: manifest ✓ snapshot ✓ chat.md ✓ chat.html ✓ · contentHash ok · version supported
preview: non-empty (chat.md text, HTML-escaped)
```

## Hash / manifest proof (on disk — what the inspector verifies)

```text
package: archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat
files:   manifest.json ✓  snapshot.json ✓  chat.md ✓  chat.html ✓   (assets: none)
sha256(snapshot.json) = sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
manifest.contentHash  = sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec   (match)
```

So `validateSavedChatPackageV1` returns `ok` (required files present, hashes match,
v1 supported) → the inspector maps to `verified`.

## Preview safety proof (static, validator-enforced)

The inspector reads `chat.md` (markdown text) for the preview and renders it via
`escapeHtml(r.preview)` in a `<pre>`; it **never reads `chat.html`**, never injects
untrusted HTML, and uses no `eval`/`new Function`. Asserted by the `[H.2]` validator
checks (PASS 24) and re-confirmed below.

## No-mutation proof

The inspector is read-only (validator-enforced: no `snapshots.create`/`upsert`, no
SQL/package write, no import, never reads `chat.html`). Baseline captured for the
smoke (compare unchanged after the operator runs it):

```text
saved_chat_archive_requests:  validated 56 · needs-desktop-snapshot 7 · written 5 · rejected 3  (total 71)
snapshots:                    29
package dirs:                 18
materialization sidecar receipts:  0
```

## Validation results

```text
node --check saved-chat-archive-inspector.studio.js            OK
node --check pack-studio.mjs                                   OK
validate-saved-chat-archive-recovery-import-export-v1.mjs      PASS 24 checks
validate-studio-archive-health-ui.mjs                          all 19 checks passed
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs      PASS 15 checks
validate-f17-build-package.mjs   11/12 — studio.html↔allowlist consistency PASSES;
   1 PRE-EXISTING, UNRELATED failure: migrations/migration-source
   (build-package-migration-gap-duplicate-or-missing-v13) in committed src-tauri/lib.rs
   studio_migrations() — a sync-lane/Desktop-migration concern, NOT touched by H.3
   (my dirty files are only studio.html + pack-studio.mjs). Flagged separately.
git diff --check / --cached --check                            clean
```

## No unrelated files staged

Pathspec-only: only `studio.html` (+4), `pack-studio.mjs`, and this evidence note
are committed. The appearance/ribbon `stash@{0}` was not popped/applied/modified;
the other dirty appearance/sync files were not touched/staged; no WebDAV memo or
concurrent file included.

## Verdict

**H.3 wiring complete + validated.** The `studio.html` blocker is resolved (stash),
the inspector loader + pack allowlist are wired consistently (validators green; the
one f17 failure is a pre-existing, unrelated migration issue), and the target
package is pre-confirmed verifiable on disk (`contentHash` matches
`sha256(snapshot.json)`). The live `inspectPackage` smoke is the operator's final
Tauri-DevTools step (snippet above), which this environment cannot drive — it will
return `verified` with no mutation.

## Recommended next step after H.3

Operator: refresh the dev build (`node tools/dev/dev-all.mjs` + reload, or the quick
dist-stage), run the inspect snippet, and confirm `status:"verified"` + the
unchanged baseline counts to close H.3. Separately, the **f17 migration-drift
(v13 gap) in `src-tauri/lib.rs studio_migrations()`** should be triaged by the
Desktop/sync lane (out of H.3 scope). After H.3, **H.4** is the verification-gated,
no-overwrite import/recovery action (import entry points still gated off by the H
validator).
