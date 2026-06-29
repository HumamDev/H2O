# Saved Chat Archive — Phase H.3 Read-Only Inspector Runtime Smoke

Date: 2026-06-29

Status: **H.3 READ-ONLY ARCHIVE INSPECTOR RUNTIME SMOKE — BLOCKED (exact blocker below)**

Lane: Chat Saving Architecture (Phase H — recovery / import / export / inspection).

H.3 was to finish the deferred H.2 loader/pack wiring and runtime-smoke the
read-only Archive Inspector. The inspector module, its health-UI mount delegation,
and the validator are committed (H.2 `2ccd878`) and statically green (PASS 24), and
the target package is pre-confirmed verifiable on disk — but the **loader wiring is
blocked** by a sync-lane-dirty `studio.html`, so the live DevTools smoke could not
be run on a wired build. No runtime code changed in H.3.

## Baseline

```text
e8e2ca1  docs(studio): define archive recovery import export contract   (H.0)
8445820  test(studio): validate archive recovery import export contract (H.1)
2ccd878  feat(studio): add read-only archive inspector                  (H.2: module + delegation + validator)
```

## Exact blocker

The inspector's **runtime loader wiring cannot be applied** under the H.3
constraints:

1. **`studio.html` is sync-lane-dirty** — 142 uncommitted lines (72 ins / 70 del)
   across ~10 hunks spanning the whole file, owned by the concurrent sync lane
   (HEAD advanced `2ccd878 → 60d3c74` during this task). The constraints forbid
   touching sync-dirty files, and **pathspec-only staging cannot isolate** a
   one-line `<script>` add from that unrelated churn (`git add` stages the whole
   file).
2. **The loader tag and the pack allowlist must change together.** The dev `dist`
   is not built by running `pack-studio.mjs` (that file is a *library of exported
   functions* — `ARCHIVE_WORKBENCH_SOURCE_FILES`/`OUT_FILES`,
   `parseStudioHtmlScriptRefs`, `studioHtmlMissingFromAllowlist`; running it does
   nothing). `prepare-dist.mjs` copies the chrome/prod build into
   `apps/studio/desktop/dist/`, driven by **`studio.html`'s `<script>` refs**, and
   the `studio.html`-refs ↔ pack-allowlist consistency is **enforced** by
   `tools/validation/release/validate-f17-build-package.mjs` (and
   `validate-studio-library-actions.mjs`). So the `studio.html` `<script>` tag and
   the two `pack-studio.mjs` allowlist entries are inseparable — adding the pack
   entries alone (with `studio.html` un-wired at HEAD) would fail that consistency
   validator.

Because `studio.html` cannot be touched/isolated, **neither the loader tag nor the
(consistency-coupled) pack entries can be committed**, and the inspector module is
therefore not served by the dev build, so the wired runtime smoke is blocked. My
attempted `pack-studio.mjs` edits were **reverted** to leave a clean, consistent
working tree.

## Files changed

- `release-evidence/2026-06-24/saved-chat-archive-phase-h3-readonly-inspector-runtime-smoke.md`
  (this note). **No runtime/wiring/validator change committed** — the pack-studio
  edits were reverted; `studio.html` was not touched.

## Loader/pack wiring summary (attempted, blocked — apply when `studio.html` is clean)

When `studio.html` is committed/clean by the sync lane, wire the inspector with
**both** of these together (then rebuild + `prepare-dist`):

```html
<!-- studio.html: add before ./ingestion/archive-health-ui.studio.js -->
<script src="./ingestion/saved-chat-archive-inspector.studio.js"></script>
```
```js
// pack-studio.mjs: add to BOTH allowlists (ARCHIVE_WORKBENCH_SOURCE_FILES and
// ARCHIVE_WORKBENCH_OUT_FILES), next to saved-chat-archive-materializer-action.studio.js
"ingestion/saved-chat-archive-inspector.studio.js",
```

## Inspector pre-confirmation (static + on-disk — the smoke would PASS once wired)

The H.2 inspector is statically validated (`validate-saved-chat-archive-recovery-
import-export-v1.mjs` **PASS 24**, including the `[H.2]` read-only/reuse/no-write/
no-HTML-exec checks). The target package is **pre-confirmed verifiable on disk**, so
`inspectPackage` would return `status:"verified"`:

```text
package: archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat
files:   manifest.json ✓  snapshot.json ✓  chat.md ✓  chat.html ✓   (assets: none)
sha256(snapshot.json) = sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
manifest.contentHash  = sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec   (match)
expected identity: chatId 69f0c5f3-30c4-83eb-9240-26331d09532b, snapshotId snap_1778516336177_wy9txv06
```

## Runtime smoke options (operator, Desktop Studio / Tauri DevTools)

**Preferred — after the sync lane settles `studio.html`:** add the two wiring lines
above, rebuild + `npm run prepare-dist`, reload, then:

```js
const r = await H2O.Studio.archiveInspector.inspectPackage({
  packagePath: 'archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat'
});
JSON.stringify(r, null, 2);
// expect status:"verified"; identity.contentHash sha256-fe608c13…; checks files ✓ +
// contentHash ok + version supported; preview non-empty (escaped); NO store mutation.
```

**Prove-it-now (bypass the blocked auto-wire, no studio.html edit):** stage the
module into the served dist and dynamically inject it for the smoke —

```bash
cp src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js \
   apps/studio/desktop/dist/ingestion/      # then reload the dev app
```
```js
await new Promise((ok,no)=>{const s=document.createElement('script');
  s.src='./ingestion/saved-chat-archive-inspector.studio.js';s.onload=ok;
  s.onerror=()=>no(new Error('inspector not served'));document.head.appendChild(s);});
typeof H2O.Studio.archiveInspector;          // 'object'
const r = await H2O.Studio.archiveInspector.inspectPackage({
  packagePath: 'archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat' });
JSON.stringify(r, null, 2);                  // expect status:"verified"
```

The inspector is read-only (validator-enforced: no `snapshots.create`/`upsert`, no
SQL/package write, no import, never reads/injects `chat.html`, preview escaped), so
running the smoke mutates nothing.

## No-mutation baseline (captured for the smoke; unchanged — nothing ran)

```text
saved_chat_archive_requests:  validated 56 · written 5 · needs-desktop-snapshot 7 · rejected 3  (total 71)
snapshots:                    29
package dirs:                 18
materialization sidecar receipts:  0
```

Since the inspector could not be loaded (wiring blocked), no inspect ran and nothing
mutated. When the operator runs the smoke (either path), re-checking these counts
must show them **unchanged** (read-only proof).

## Validation results

```text
validate-saved-chat-archive-recovery-import-export-v1.mjs     PASS 24 checks
validate-studio-archive-health-ui.mjs                         all 19 checks passed
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 checks
validate-saved-chat-archive-package-written-status-v1.mjs     PASS 15 checks
git diff --check / --cached --check                           clean
```

## No unrelated files staged

Pathspec-only: only this evidence note is committed. The `pack-studio.mjs` edits
were reverted (clean); `studio.html` was **not** touched, staged, or committed (it
remains sync-lane-dirty); no concurrently-staged file was included.

## Verdict

**H.3 — BLOCKED on the sync-lane-dirty `studio.html`.** The read-only inspector is
implemented, validated (PASS 24), and the target package is pre-confirmed
verifiable on disk (`contentHash` matches `sha256(snapshot.json)`), so the smoke
would pass once wired — but the loader tag + (consistency-coupled) pack allowlist
cannot be applied without touching `studio.html`, which the pathspec-only /
do-not-touch-sync-dirty constraints forbid.

## Recommended next step after H.3

Unblock by having the **sync lane commit/settle `studio.html`** (it has carried
~142 uncommitted lines across F.2→H.3). Then add the two wiring lines above,
`prepare-dist` + reload, and run the inspect smoke (expect `verified`, no
mutation) to close H.3 — or run the **prove-it-now** path above immediately to
confirm the inspector works read-only while the sync lane settles. After H.3,
**H.4** is the verification-gated, no-overwrite import/recovery action (the import
entry points remain gated off by the H validator).
