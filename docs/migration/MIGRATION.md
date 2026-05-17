# Cockpit Pro — Migration Operations Document

> **Purpose**: This document is the operational source of truth for the Cockpit Pro
> repository restructuring migration. It is read by anyone performing or reviewing
> migration work, and it records the current state, the forbidden operations, and
> the rollback rules.
>
> **This document does not replace the migration plan** (see the planning thread for
> the staged 23-section architecture report and the independent safety audit). It
> records what has been **done**, what is **in-flight**, what is **forbidden**, and
> what is **known dangerous**.

---

## 1. Current Phase Status

> **STRUCTURAL CHANGES TO DATE**: exactly **one** — Phase 1B deleted the dead outer `cockpit-pro/apps/` directory (entirely outside the git repo, contained only 4 `.DS_Store` files + empty `studio-mobile/src/components/cockpit/` leaf; zero source code, zero references from any tool/build/manifest). Everything inside the `h2o-source/` git tree is unchanged from the pre-Phase-0A state: runtime, scripts/, manifests, build output locations, supabase/, workspaces, and Studio runtime files have all been left exactly as they were. **No structural changes have been made to anything inside the git repo.**

| Phase | Status | Tag | Commit | Description |
|---|---|---|---|---|
| Pre-Phase investigation | **complete** | — | — | See §3 for findings |
| **0A** — foundation registries | ✅ complete | `migration-phase-0A-complete` | `b8aed9f` | Created `tools/paths.mjs` + `tools/script-registry.mjs` + this `docs/migration/MIGRATION.md`. Additive, no consumers yet. |
| **0B** — boot-timing baseline | ✅ complete | `migration-phase-0B-complete` | `3336ff6` | Created `docs/migration/baseline-boot-timing.md` with methodology, paste-able harness, and 3 captured live samples (Sample 1 V3-OFF + Samples 2/3 V3-ON). |
| **0C** — loader alias/proxy tools | ✅ complete | `migration-phase-0C-complete` | `8d3a05d` | `tools/loader/make-aliases.mjs` + `tools/loader/make-ext-proxy-pack.mjs` now import paths from `tools/paths.mjs`. Byte-identical alias farm + proxy pack proven via shasum with locked `H2O_BUILD_TS`. |
| **0D** — sync/validate loader tools | ✅ complete | `migration-phase-0D-complete` | `00a7bff` | `tools/loader/sync-dev-order.mjs` + `tools/loader/validate-loader-order.mjs` now import paths from `tools/paths.mjs`. 6 sync-dev-order generated files + validate-loader-order stdout proven byte-identical. |
| **0E-1** — versioning dashboard | ✅ complete | `migration-phase-0E-1-complete` | `8ae4ac9` | `tools/versioning/versions-dashboard.mjs` + `tools/versioning/dashboard-watch.mjs` migrated. Outputs byte-identical modulo `Generated:` ISO timestamp line. |
| **0E-2** — release tools | ✅ complete | `migration-phase-0E-2-complete` | `13c68bc` | `tools/release/release.mjs` + `ship-commit.mjs` + `release-commit-helper.mjs` migrated. All 4 `--dry-run` / clean-tree-early-exit outputs byte-identical. Pre-existing `rebuildDashboard()` bug preserved verbatim (fixed in 0F). |
| **0E-3** — archive-one + archive-snapshot decision | ✅ complete | `migration-phase-0E-3-complete` | `a336541` | `tools/archive/archive-one.mjs` migrated. `tools/archive/archive-snapshot.mjs` EVALUATED and intentionally deferred (uses `process.argv[2]`-based SRC, has subtly different `stripEmojiAndInvisibles` regex — not safely refactorable without behavior change). |
| **0F** — release dashboard rebuild bug fix | ✅ complete | `migration-phase-0F-complete` | `6712f2f` | One-word path correction in `release.mjs`'s `rebuildDashboard()`: `"release"` → `"versioning"`. The post-release dashboard rebuild step (silently no-op'd since this code was written) now actually runs. |
| **0G-1** — Studio desktop prepare-dist | ✅ complete | `migration-phase-0G-1-complete` | `e174603` | `apps/studio-desktop/scripts/prepare-dist.mjs` migrated. First paths.mjs consumer outside `tools/` (3-level relative import). `dist/` output byte-identical across 4 runs. |
| **0G-2** — extension build context | ✅ complete | `migration-phase-0G-2-complete` | `c3d76d4` | `tools/product/extension/chrome-live-build-context.mjs` (primary) + `tools/product/extension/build-chrome-live-extension.mjs` (light, icons dirs only) migrated. 22 of 24 chrome-ext-dev-controls build outputs byte-identical; only `README.txt` (OUT_DIR literal embed) and `loader.js` (`LOADER_BUILD_TS = Date.now()`) varied. |
| **0H** — deterministic loader timestamp | ✅ complete | `migration-phase-0H-complete` | `89e371e` | `tools/product/extension/chrome-live-loader.mjs` now honors `H2O_BUILD_TS` env override for `LOADER_BUILD_TS` / `LOADER_BUILD_ISO`. Reduces extension build's residual nondeterminism from 2 files to 1 (only `README.txt` remains). |
| **0I** — migration documentation update | ✅ complete | `migration-phase-0I-complete` | `c375b15` | `docs/migration/MIGRATION.md` rewritten to record all completed phases with tag + commit cross-references, document what is stabilized / deferred / forbidden, and recommend next phases. |
| **0J** — README.txt determinism | ✅ complete | `migration-phase-0J-complete` | `93cf846` | `tools/product/extension/chrome-live-readme.mjs` no longer embeds the absolute `OUT_DIR` path. **Full extension build is now byte-identical** across builds into any OUT_DIR with locked `H2O_BUILD_TS` (0 files differ — down from 2 at the 0G-2 baseline). |
| **1A** — architecture contracts lock-in | ✅ complete | `migration-phase-1A-complete` | `446c39e` | Locked in the 6 post-stabilization contracts (§9.1) and recorded all 0A–0J phases in §1. Doc-only update; zero code changes. |
| **1B** — outer `cockpit-pro/apps/` deletion | ✅ complete | `migration-phase-1B-complete` (pre: `migration-phase-1B-pre`) | `d0c71a2` | **FIRST structural change.** Deleted the dead outer `cockpit-pro/apps/` directory (4 `.DS_Store` files + 1 empty `studio-mobile/src/components/cockpit/` leaf, 32 KB total). Outside git tree → no `git revert` path; **off-disk backup at** `~/h2o-migration-backups/phase-1B-outer-cockpit-pro-apps-2026-05-17.tar.gz` (1.5 KB) + mirror dir alongside. Zero functional references found via repo-wide grep prior to deletion. |
| **1C** — local-scratch/reference folders audit | ✅ complete | `migration-phase-1C-complete` | `9504179` | **AUDIT-ONLY phase (no deletions).** Inventoried `tmp/` (488 KB, labels-v1.0.2 release-artifact snapshot) and `references/` (52 MB documented evidence library). `s-files/` is intentionally KEPT per operator policy — NOT inspected. Zero code references found. See §13 for classification. |
| **2A** — npm workspace graph audit | ✅ complete | `migration-phase-2A-complete` | `9504179` | **AUDIT-ONLY.** Determined that root `package.json` had no `workspaces` field yet, and that adding one was safe (no `workspace:*` cross-deps, no path collisions). Identified `apps/studio-desktop`, `apps/studio-mobile`, `cockpit-pro-site`, `packages/*` as workspace candidates. No code changes. |
| **2B** — add npm workspaces + hoist deps | ✅ complete | `migration-phase-2B-complete` (pre: `migration-phase-2B-pre`) | `00e2d73` | Added `"workspaces"` field to root `package.json` listing 4 paths. Single root `package-lock.json` regenerated; deps correctly hoisted. Identity-core symlink moved from `apps/studio-mobile/node_modules/@h2o/identity-core` to root `node_modules/@h2o/identity-core`. Deterministic extension build byte-identical to Phase 0J baseline. |
| **2C** — per-app lockfile audit | ✅ complete | `migration-phase-2C-complete` | `00e2d73` | **AUDIT-ONLY** (same SHA as 2B). Inventoried 3 per-app lockfiles (`apps/studio-desktop`, `apps/studio-mobile`, `cockpit-pro-site`) and confirmed all 3 predate the Phase 2B commit → all 3 stale, safe to delete in 2D. |
| **2D** — delete stale per-app lockfiles | ✅ complete | `migration-phase-2D-complete` (pre: `migration-phase-2D-pre`) | `ca01e3a` | Deleted 3 per-app lockfiles (561 KB total) that became canonical-irrelevant after Phase 2B added the root workspaces field. All workspace builds clean (studio-desktop prepare-dist, studio-mobile tsc, cockpit-pro-site vite build). Deterministic extension build byte-identical to baseline. |
| **3A** — `cockpit-pro-site` → `apps/site` audit | ✅ complete | — (audit-only, no commit) | `ca01e3a` | **AUDIT-ONLY.** Inventoried site folder (14 tracked files); searched repo for `cockpit-pro-site` references (1 root package.json, 4 package-lock.json, 4 MIGRATION.md, 1 identity doc, 1 site README; zero in `tools/`, `config/`, `meta/`, `surfaces/`, `scripts/`, `supabase/`). Confirmed `apps/site/` does not pre-exist. Identified Cloudflare Pages dashboard "Root directory" as out-of-band coupling. |
| **3B** — `cockpit-pro-site` → `apps/site` move | ✅ complete | `migration-phase-3B-complete` (pre: `migration-phase-3B-pre`) | — | **STRUCTURAL MOVE inside git tree.** `git mv cockpit-pro-site apps/site` (14 tracked files; directory rename carried untracked `dist/`, `node_modules/`, `.DS_Store` along). Off-disk backup at `~/h2o-migration-backups/phase-3B-pre-20260517-195026/`. Root `package.json` workspaces entry `"cockpit-pro-site"` → `"apps/site"`. Root `package-lock.json` regenerated by `npm install`. `apps/site/README.md` Cloudflare instruction updated. **Package name `cockpit-pro-site` unchanged** per operator constraint — `npm -w cockpit-pro-site` selector still works. Deterministic extension build byte-identical to Phase 0J/2B/2D baseline. **OUT-OF-BAND ACTION REQUIRED**: Cloudflare Pages dashboard "Root directory" must be changed from `cockpit-pro-site` to `apps/site` before the next deploy. |

**Latest stabilized checkpoint**: `migration-phase-3B-complete` (this phase). All inside-git work through Phase 2D plus the first structural inside-git move (Phase 3B: site folder relocated to `apps/site/`) is in place. paths.mjs centralization across `tools/` (loader, release, archive, versioning, extension-build) + first cross-folder consumer (`apps/studio-desktop/scripts/prepare-dist.mjs`) + **full extension-build determinism** (0 files differ across builds with locked env) + locked-in architecture contracts + npm workspaces + single root lockfile all remain in place.

---

## 2. Repo Topology (as of 2026-05-17, post Phase 3B)

```
/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/   ← NOT a git repo
├── h2o-dev-server/                                       ← NOT a git repo
│   ├── alias/        (151 entries; default mode = COPY)
│   ├── dev_output/proxy/_paste-pack.ext.txt
│   └── serve.py      (CORS + no-cache @ 127.0.0.1:5500)
└── h2o-source/                                           ← THE git repo
    ├── .git/                                             ← git toplevel
    ├── apps/
    │   ├── site/         standalone Vite/TS marketing site (pkg name `cockpit-pro-site`)
    │   ├── studio-desktop/  Tauri V2 desktop shell
    │   └── studio-mobile/   Expo SDK 55 React Native app
    ├── archive/      55+ daily snapshots  (gitignored; local only)
    ├── artifacts/    (gitignored; local only)
    ├── assets/       icons + PNGs  (gitignored; local only — surprising)
    ├── build/        6 chrome extensions  (gitignored; local only)
    ├── changelogs/   per-script CHANGELOG.md
    ├── config/       dev-order.tsv, loader-deps.json, loader-tiers.json (+ generated views)
    ├── docs/         architecture/, decisions/, identity/, systems/, validation/, migration/
    ├── meta/         ledger/, reports/, notes/  (most gitignored)
    ├── packages/     identity-core, studio-core, studio-types, studio-ui (4 TS-source packages)
    ├── plans/        (gitignored; local only)
    ├── references/   (gitignored; local only)
    ├── s-files/      (gitignored; local only)
    ├── scripts/      149 emoji-named runtime userscripts
    ├── shared/library/  7 .js files (shared between scripts/ and surfaces/studio/)
    ├── supabase/     functions/, migrations/, .temp/  (.temp gitignored)
    ├── surfaces/     desk/, identity/, studio/ (60 S-prefix Studio files)
    ├── tmp/          (gitignored)
    ├── tools/        90 tool scripts in 10 subdirs
    ├── package.json  + package-lock.json (workspaces: apps/site, apps/studio-desktop, apps/studio-mobile, packages/*)
    └── versions.csv  append-only release log
```

> **Phase 1B note**: the outer `cockpit-pro/apps/` cruft directory (`.DS_Store` files only) was deleted in Phase 1B. The outer `cockpit-pro/` now contains only `h2o-dev-server/` and `h2o-source/`.

**Critical facts:**

- `.git` is **inside** `h2o-source/`, not at outer `cockpit-pro/`. Outer is just a directory wrapper.
- `h2o-dev-server/` has **no git history**. Absorbing it into the repo means starting its git history fresh.
- The actual runtime URL is `http://127.0.0.1:5500/alias/{aliasId}?v={ts}` — this is hardcoded by `tools/loader/make-ext-proxy-pack.mjs` into the proxy pack, which the extension loader fetches at boot.
- Supabase is linked to project `kjwrrkqqtxyxtuigianr` ("Cockpit Pro", org `ffsvbxmzbiwnhrdiffzt`) via `supabase/.temp/linked-project.json` (gitignored).
- Working tree is **clean** as of pre-phase capture; branch `main` is **114 commits ahead of origin/main**. Push regularly during migration to avoid disk-loss exposure.

---

## 3. Pre-Phase Investigation Findings

### 3.1 The `pre-outer-reorg` tag — what it actually is

Initial migration-planning analysis flagged `pre-outer-reorg` as evidence of a prior, possibly-failed reorg attempt.

**Investigation result: the tag name is misleading.**

- Tag points at commit `ffab306` (2026-05-03), titled `chore(surfaces/studio): add parked Studio archive engine companion`.
- The 20 commits immediately **before** the tag include: cockpit-pro-site addition, shared Studio packages creation, Studio v2.5 modular refactor, mobile app source addition, identity-core foundation.
- **171 commits** and **+124,229 / -15,601 lines** have landed **after** the tag, including: studio-desktop (Tauri) creation, ChatRegistry canonical migration, Library Index + Canonical Services build-out, SQLite-backed Studio Desktop import flows.
- HEAD remains on `main`. The work is active and successful.

**Interpretation:** the tag was a safety checkpoint placed **before** introducing significant runtime+structural changes (Tauri app + ChatRegistry migration). It was not a failed reorg. **No "previous attempt" lessons exist to mine.**

This is good news. But the tag name should not be confused with a real migration checkpoint. A new convention is recommended: tag migration phase boundaries with `migration-phase-NX-pre` / `migration-phase-NX-complete`.

### 3.2 Git boundaries

| Location | Is git repo? |
|---|---|
| `cockpit-pro/` (outer) | **No** |
| `cockpit-pro/h2o-dev-server/` | **No** |
| `cockpit-pro/h2o-source/` | **Yes** (this is the only one) |

Implication: any future "flatten" phase that intends to move repo-root to outer `cockpit-pro/` requires explicit `.git` relocation. This is **not** reversible by `git revert`. It must be planned, signed off, and pre-tagged.

### 3.3 Supabase linkage

```
supabase/.temp/linked-project.json = {
  "ref": "kjwrrkqqtxyxtuigianr",
  "name": "Cockpit Pro",
  "organization_id": "ffsvbxmzbiwnhrdiffzt",
  "organization_slug": "ffsvbxmzbiwnhrdiffzt"
}
```

This file is **gitignored**. It is local-only state. If lost or moved, `supabase` CLI commands like `db push`, `functions deploy`, `migration up` will not target the right project. Worst case: silent deploy to wrong project.

### 3.4 Chrome extension manifest snapshot

| Extension build | `manifest.json` version | host_permissions | Service worker |
|---|---|---|---|
| chrome-ext-prod | 1.3.0 | `https://chatgpt.com/*` | `bg.js` (483 KB) |
| chrome-ext-dev-controls | 1.3.0 | `http://127.0.0.1:5500/*`, `*://*/*` | `bg.js` |

Extension IDs (assigned by Chrome on first load) are not captured here — they cannot be discovered without running Chrome. **Before Phase 6**, run `chrome://extensions` in each developer's browser and screenshot extension IDs to allow ID drift detection.

### 3.5 Loader baseline assumptions (uncovered during investigation)

- `build/chrome-ext-prod/loader.js` has **time-budget fallback** (line 605–682). Per-tier and total budget timeouts trigger silent fallback when exceeded. **No baseline measurement exists yet.** Phase 0A defines no measurement, but Phase 0B should establish baseline boot timings via `H2O_LOADER_V3_DIAG=1` before refactoring loader-adjacent tools.
- Default `H2O_ALIAS_MODE` is **`copy`**, not symlink. Symlink is only used when explicitly requested via env var (and gets force-downgraded to copy if `H2O_SERVER_DIR` is inside iCloud Drive).
- Alias symlinks (when present) use **relative paths** `../../h2o-source/scripts/…`. Any structural move that changes this relative-path depth must be paired with a `make-aliases.mjs` rerun.
- `LEGACY_ALIAS_COMPAT` (in `make-aliases.mjs`) preserves 5 historic alias renames. Treat this map as part of the migration's invariant data.

### 3.6 Pre-commit hook

`.git/hooks/pre-commit` runs `tools/versioning/rev-stamp.mjs` on every commit that touches `scripts/*.user.js`. The hook auto-stamps `@revision` and re-stages.

**Bypass:** set `H2O_SKIP_REV_STAMP=1` in the environment before `git commit`. The hook honors this and exits 0 without stamping.

**Migration policy:** all migration commits that touch scripts/ MUST set `H2O_SKIP_REV_STAMP=1` to avoid polluting diffs with revision bumps unrelated to the migration's intent. See §6.

---

## 4. Forbidden Operations During Migration

These operations are **forbidden** until the migration's later phases (or, in some cases, forever in this migration window). Anyone proposing to do them MUST update this document with explicit justification and sign-off.

### Forever-forbidden during this migration

1. Renaming any file in `scripts/` (filenames are tied to load order, validators, archive history, release tags).
2. Renaming any script's `@h2o-id`.
3. Moving `supabase/` (link-state risk, see §3.3; zero structural benefit during this migration).
4. Changing the **extension-runtime** path of `surfaces/identity/identity.html` (hardcoded in `0D4a Identity Core` via `chrome.runtime.getURL`; affects auth onboarding for installed extensions).
5. Renaming any directory under `supabase/functions/*/` (deployed function names are addressed by Stripe webhook configuration; rename = silent webhook breakage = revenue impact).
6. Modifying `versions.csv` outside of the release pipeline.
7. Modifying `config/loader-deps.json` runtime-order entries (e.g. MiniMap 1A1e-before-1A1b) — these encode boot-order invariants.
8. Force-pushing to `main`.
9. Editing built `loader.js` files in `build/` by hand (always rebuild via tools).
10. Disabling the pre-commit hook permanently (use `H2O_SKIP_REV_STAMP=1` per-commit, not by removing the hook).

### Forbidden until Phase 7 (h2o-dev-server absorption)

11. Moving `h2o-dev-server/`.
12. Changing `127.0.0.1:5500` to a different port or host without coordinated rebuild of all dev extension variants.
13. Removing the `H2O_SERVER_DIR` env var support from any tool.

### Forbidden until Phase 8 (h2o-source flatten)

14. Moving `.git`.
15. Renaming `h2o-source/` directory.
16. Any operation that would require `cockpit-pro/` to become the git toplevel without a documented `.git` strategy.

### Forbidden until Phase 6 (extensions relocation)

17. Renaming any `build/chrome-ext-*` directory.
18. Changing the `H2O_EXT_PROXY_PACK_URL` value embedded into manifests.
19. Changing the structure of `surfaces/identity/identity.html`'s path relative to the **built extension** root (must remain `surfaces/identity/identity.html` inside the extension forever, even if source-tree path changes).

### Operations requiring explicit phase entry

- Adding `workspaces` to root `package.json` — only in Phase 3.
- Adding/removing files in `scripts/` — operationally allowed but every diff must pass through pre-commit hook normally (don't combine with migration commits).

---

## 5. Rollback Rules

| Phase boundary | Tag name | Rollback recipe | Realistic cost |
|---|---|---|---|
| Before Phase 0A | (none yet — pre-phase only added new files in tools/ and docs/) | `git reset --hard HEAD~1` (or per-file `git rm` of new files) | < 1 minute |
| Before any 0B–0D commit | `migration-phase-0X-pre` | `git reset --hard <tag>` | 1 minute |
| Before any 1–5 commit | `migration-phase-N-pre` | `git reset --hard <tag>` + optional `rm -rf node_modules && npm install` | 1–10 minutes |
| Before Phase 6 | `migration-phase-6-pre` | `git reset --hard <tag>` + manual re-load of Chrome unpacked extensions from old paths | 10–30 minutes |
| Before Phase 7 | `migration-phase-7-pre` | `git reset --hard <tag>` + manual move of `h2o-dev-server` back to sibling + regenerate `alias/` + restart `serve.py` | 15–30 minutes |
| Before Phase 8 | `migration-phase-8-pre` | **NOT single-revert reversible.** Must recover from off-disk archive snapshot taken pre-phase. Realistic recovery: 2–4 hours. |
| Before Phase 9 | `migration-phase-9-pre` | `git reset --hard <tag>` + cold Cargo recompile + iOS Pods reinstall | 1–2 hours |

**Mandatory before any phase:**

1. Tag the current HEAD: `git tag migration-phase-NX-pre`.
2. Snapshot to off-disk location: `npm run archive:snap` then copy the resulting archive to a **second physical disk** (the in-repo `archive/` is gitignored and would be lost in a `git clean -fdx`).
3. Capture `supabase/.temp/linked-project.json` content into the off-disk snapshot.
4. If the phase will modify extensions: capture Chrome extension IDs (`chrome://extensions` screenshot).
5. If the phase will modify `node_modules/` layout (e.g. Phase 3): record `npm ls --depth=0` output.

---

## 6. Commit Discipline During Migration

1. **`H2O_SKIP_REV_STAMP=1` for any commit that touches `scripts/*.user.js`.** The pre-commit hook will otherwise auto-stamp revisions and pollute migration diffs.
2. **Commit messages prefix with `migration(<phase>):`** for traceability. Example: `migration(0A): add tools/paths.mjs foundation registry`.
3. **One logical change per commit.** Migration commits should be cherry-pickable.
4. **Tag each phase boundary** with `migration-phase-NX-pre` (start) and `migration-phase-NX-complete` (end).
5. **Push to origin/main after every micro-phase that passes validation.** Migrations should not accumulate large unpushed local windows.

---

## 7. Validation Gate (run after every micro-phase)

Minimum gate:

1. `npm run dev:check` — verifies scripts/, alias/, extension outputs exist.
2. `node tools/loader/validate-loader-order.mjs` — confirms deps + tier + pack consistency.
3. `node --check tools/paths.mjs` and `node --check tools/script-registry.mjs` if those files were touched.
4. Working tree clean: `git status` reports no unexpected modifications.
5. No files modified under `scripts/`, `surfaces/`, `supabase/`, `build/`, `config/` (unless the phase's plan explicitly says otherwise).

Extended gate (for Phase 3+):

6. `npm run dev:rebuild && npm run dev:all` — full extension build.
7. Identity validator pack: at least the latest identity-phase validator.
8. Manual: load `build/chrome-ext-dev-controls-oauth-google/` in Chrome → open chatgpt.com → assert MiniMap renders, Dock panel opens, Identity onboarding popup loads.
9. `cd apps/studio-desktop && npm run tauri:dev` smoke test.
10. `cd apps/studio-mobile && npm start` smoke test (Metro builds).

---

## 8. Known Danger Areas (always re-check before touching these)

1. **`scripts/0D4a.⬛️🔐 Identity Core 🔐.js`** — embeds `chrome.runtime.getURL('surfaces/identity/identity.html')`. Path is shipped to all installed extensions; changes require extension-update coordination.
2. **`build/chrome-ext-prod/loader.js`** — has silent time-budget fallback (line 605–682). Any change that slows boot can trigger fallback. **Measure boot timing before/after touching anything in loader chain.**
3. **`config/loader-deps.json` runtime-order** — encodes boot-order invariants like MiniMap 1A1e-before-1A1b. Treat as immutable.
4. **`supabase/functions/stripe-webhook/`** — Stripe dashboard webhook URL is bound to this function's deployed name. Rename = revenue impact.
5. **`supabase/.temp/linked-project.json`** — gitignored, critical, easy to lose. Snapshot before any supabase/-adjacent move.
6. **`tools/git/install-hooks.mjs`** + pre-commit hook — auto-modifies staged files. Read §6 before committing.
7. **`make-aliases.mjs` iCloud detection** — `Mobile Documents/com~apple~CloudDocs` substring match. Forces copy mode. If `H2O_SERVER_DIR` moves into a different filesystem class, this check may misclassify.
8. **`* 2.*` Finder duplicate sweep** — iCloud+symlink can spawn these. Run `find . -name '* 2.*' -not -path './node_modules/*' -not -path './.git/*'` before each phase.
9. **`apps/studio-desktop/scripts/prepare-dist.mjs`** — staleness guard expects `surfaces/studio/` and `build/chrome-ext-prod/surfaces/studio/` at fixed depths. Phase 9 must update both literal paths and the depth math.
10. **The 35 identity validators in `tools/validation/identity/`** — each hardcodes specific filenames and/or specific `build/chrome-ext-*` variants. Updating during Phase 6 is non-trivial.

---

## 9. Architecture Contracts

These are the rules new code must follow during and after the migration. Rules 9.1–9.6 are the **Phase-1A-locked-in** post-stabilization contracts that became binding once Phases 0A–0J landed. Rules 9.7–9.13 are pre-existing structural rules that already applied during the migration.

### 9.1 Phase-1A-locked contracts (binding from `migration-phase-1A-complete`)

These rules codify the working pattern established by Phases 0C through 0J. They apply to **all new code AND all future refactors** of existing code.

1. **Tools MUST use `tools/paths.mjs` for top-level repo paths.** Every new or refactored tool that needs `REPO_ROOT`, `SCRIPTS_DIR`, `BUILD_DIR`, `META_LEDGER_DIR`, `ARCHIVE_DIR`, `VERSIONS_CSV`, `DEV_ORDER_TSV`, `LOADER_DEPS_JSON`, `ALIAS_DIR`, `PROXY_PACK_URL`, etc. MUST import them from `tools/paths.mjs`. No new tool may re-derive these from scratch.
2. **Do NOT compute repo root via scattered `path.resolve(__dirname, "..", "..")` (or `path.resolve(TOOL_DIR, "..", "..", ...)`) literals.** All such computations are centralized in `tools/paths.mjs`. The only acceptable pattern for repo-relative paths in new code is `import { REPO_ROOT, ... } from "<relative>/tools/paths.mjs"`. Exception: a tool that ANCHORS to its own script location for legitimate reasons (e.g. `prepare-dist.mjs`'s `here`/`desktopRoot` script-local anchoring for the dist output directory) MAY keep that compute, but only for the file-local scope, not for repo-level paths.
3. **Do NOT create new hardcoded root paths** (literal absolute paths, or new `process.cwd()`-based root assumptions). The single source of truth for repo location is `tools/paths.mjs`'s `REPO_ROOT`. If a new path constant is needed, add it to `tools/paths.mjs` first, then import it.
4. **Preserve env-var overrides when refactoring.** Every existing `H2O_*` environment variable that affects path resolution (`H2O_SRC_DIR`, `H2O_SERVER_DIR`, `H2O_ORDER_FILE`, `H2O_DEPS_FILE`, `H2O_DEV_SERVER_URL`, `H2O_EXT_OUT_DIR`, `H2O_EXT_PROXY_PACK_URL`, `H2O_EXT_DEV_VARIANT`, `H2O_BUILD_TS`, `H2O_ALIAS_MODE`, `H2O_ALIAS_SCOPE`, `H2O_ALLOW_ICLOUD_SYMLINK`, `H2O_DEV_DIR_NAME`, `H2O_DEV_ORIGIN`, `H2O_ARCHIVE_ALL`, `H2O_SKIP_REV_STAMP`, `H2O_RELEASE_DEBUG`, etc.) MUST continue to be honored after a refactor. Refactors may **add** new env-var support (additive), but MUST NOT remove or rename existing ones.
5. **Byte-equivalent proof required for tool refactors.** Any refactor of a tool under `tools/` (or of a tool's behavior anywhere — Studio prepare-dist, extension build, etc.) MUST include cryptographic byte-identical proof in the phase commit: shasums of generated output files (with locked timestamps where the tool embeds them), `diff` of stdout for read-only tools, or per-file file comparison for build artifacts. The exact methodology is established by Phases 0C through 0J — re-use those patterns. Refactors without byte-equivalent proof MUST NOT be tagged complete.
6. **No structural folder moves without a phase tag + rollback note.** Any phase that moves or renames a folder, file, or `.git` location MUST: (a) be tagged with a `migration-phase-<id>-pre` tag at HEAD BEFORE the move begins; (b) include a documented rollback procedure in the phase's commit message and in this MIGRATION.md; (c) take an off-disk archive snapshot of the affected directory tree; (d) close with a `migration-phase-<id>-complete` tag only after validation. Phase 0A–1A established the no-move-yet baseline; this rule binds the moment Phase 1B (or any successor) starts.

### 9.2 Pre-existing structural contracts

These rules predate Phase 1A but remain in force throughout the migration:

7. **No script filename literal in `tools/`.** Scripts are referenced by ID via `tools/script-registry.mjs` (canonical) or local helpers that mirror its output exactly. Tools that grep specific script filenames (e.g. some validators under `tools/validation/identity/`) are pre-existing technical debt that should migrate during their own future phase.
8. **No new package created without a real consumer.** Empty seed packages are forbidden. The 4 existing seed packages (`@h2o-studio/{core,ui,types}`, `@h2o/identity-core`) are grandfathered; do not add more until a real consumer exists.
9. **No deep cross-folder relative import in `apps/*`.** Cross-package access goes through workspace-resolved scope names (`@h2o/*`, `@h2o-studio/*`) — even though npm workspaces are not yet enabled at the root (deferred to a future structural phase), this contract applies prospectively so future imports remain clean.
10. **`scripts/` does NOT import from `packages/`.** The runtime userscripts remain self-contained. (Build-time consumption via `build-identity-provider-bundle.mjs` is the only exception and is bounded to a single bundle output, not a runtime import.)
11. **`surfaces/` and `scripts/` remain parallel implementations** until adapter extraction (deferred indefinitely). Neither imports the other at runtime.
12. **All chrome extension manifest URL changes require a manifest rebuild.** `H2O_EXT_PROXY_PACK_URL` is the only embedded URL; treat it as a stable contract — changing its default in `tools/paths.mjs` requires a coordinated rebuild + reinstall of every dev extension variant.
13. **Filenames in `scripts/` are append-only.** Adding scripts requires a new ID; renaming requires a deprecation cycle (and triggers a cascade through `config/dev-order.tsv`, `config/loader-deps.json`, validator hardcodes, archive history, and release tags).

---

## 10. What Is Now Stabilized (as of Phase 0H)

The following capabilities are now centralized, byte-equivalent-validated, and ready to be the foundation for any future structural moves:

### 10.1 Central path registry (`tools/paths.mjs`)

Single source of truth for every repo-level path constant. All consumers below import from it; future folder moves only need to update this one file. Honors every legacy env-var override (`H2O_SRC_DIR`, `H2O_SERVER_DIR`, `H2O_ORDER_FILE`, `H2O_DEPS_FILE`, `H2O_DEV_SERVER_URL`, etc.).

### 10.2 Tools migrated to `tools/paths.mjs`

| Tool | Phase | Validation method |
|---|---|---|
| `tools/loader/make-aliases.mjs` | 0C | shasum of alias farm |
| `tools/loader/make-ext-proxy-pack.mjs` | 0C | shasum of `_paste-pack.ext.txt` with locked `H2O_BUILD_TS` |
| `tools/loader/sync-dev-order.mjs` | 0D | shasum of 6 generated config files |
| `tools/loader/validate-loader-order.mjs` | 0D | byte-identical stdout |
| `tools/versioning/versions-dashboard.mjs` | 0E-1 | shasum of 3 outputs (modulo `Generated:` line) |
| `tools/versioning/dashboard-watch.mjs` | 0E-1 | inline path-constant resolution check |
| `tools/release/release.mjs` | 0E-2 + 0F | `--dry-run` byte-identical + post-release dashboard rebuild path corrected |
| `tools/release/ship-commit.mjs` | 0E-2 | `--dry-run` byte-identical |
| `tools/release/release-commit-helper.mjs` | 0E-2 | clean-tree early-exit byte-identical |
| `tools/archive/archive-one.mjs` | 0E-3 | 6 safe-output scenarios byte-identical |
| `tools/product/extension/chrome-live-build-context.mjs` | 0G-2 | 22 of 24 build outputs byte-identical |
| `tools/product/extension/build-chrome-live-extension.mjs` | 0G-2 | (same suite as above) |
| `tools/product/extension/chrome-live-loader.mjs` | 0H | `loader.js` byte-identical with locked `H2O_BUILD_TS` |
| `apps/studio-desktop/scripts/prepare-dist.mjs` | 0G-1 | `dist/` shasum byte-identical across 4 runs |

### 10.3 Quantitative regression baselines

- **Boot timing**: `docs/migration/baseline-boot-timing.md` — 3 captured samples + harness, regression thresholds defined.
- **Extension build determinism**: with locked `H2O_BUILD_TS`, the entire `chrome-ext-dev-controls` build is now byte-identical except for `README.txt` (which embeds the OUT_DIR literal).

### 10.4 Pre-existing bug fixed (in scope)

- **Phase 0F**: `release.mjs` `rebuildDashboard()` was silently no-op'ing (`tools/release/versions-dashboard.mjs` vs actual `tools/versioning/versions-dashboard.mjs`). One-word path correction restored the post-release dashboard rebuild.

---

## 11. What Remains Deferred (out of scope for Phases 0A–0H)

### 11.1 Tools intentionally NOT refactored

| Tool | Reason for deferral | Future phase |
|---|---|---|
| `tools/archive/archive-snapshot.mjs` | Uses `process.argv[2]`-based SRC (caller-driven, not `REPO_ROOT`-pattern). Local `stripEmojiAndInvisibles` is subtly different from `tools/script-registry.mjs` (missing skin-tone-modifier regex). Refactor would either change CLI contract or risk helper-behavior drift. | Could be a future helper-consolidation phase. |
| `tools/versioning/rev-stamp.mjs` | Pre-commit hook critical path; needs very careful per-step validation. | Future micro-phase (recommended only after the rest stabilizes for a release window). |
| `tools/versioning/edit-log.mjs` | Ledger writer; small surface, low priority. | Future micro-phase. |
| `tools/git/install-hooks.mjs` | Modifies `.git/hooks/`; high impact on developer workflow. | Future micro-phase. |
| `tools/git/commit-auto.mjs` | Already does not use the REPO_ROOT pattern (relies on git's cwd). No paths.mjs surface to migrate. | Not in scope; leave as-is. |
| 11 chrome-ext build helpers under `tools/product/extension/chrome-live-*.mjs` + `tools/product/{studio,identity,desk}/pack-*.mjs` + `tools/product/identity/build-identity-provider-bundle.mjs` + `tools/product/extension/write-extension-icons.mjs` | They consume `SRC`/`OUT_DIR`/etc. as parameters from the Phase-0G-2-refactored context — they receive paths.mjs-sourced values automatically. No coupling-related changes needed. | None required unless future refactors find specific issues. |

### 11.2 Tools/files NEVER to be touched in path-centralization phases

- `scripts/*.user.js` — frozen filenames + frozen contents during the migration window.
- `surfaces/identity/identity.html` extension-runtime path (hardcoded inside `0D4a Identity Core`).
- `supabase/` directory and `supabase/functions/*/` names.
- `supabase/.temp/linked-project.json` (gitignored, must not be lost).
- `config/loader-deps.json` runtime-order entries.
- `versions.csv` (except via release pipeline).

### 11.3 Structural moves NOT YET DONE

**No folder moves have happened yet.** The original Phase 1+ plan (move `cockpit-pro-site/` to `apps/site/`, promote `shared/library/` to a package, restructure `build/chrome-ext-*` to `apps/extensions/chatgpt/chrome/`, absorb `h2o-dev-server/` into the tree, flatten `h2o-source/` to repo root, etc.) is **all still pending**. The Phase 0X work was preparation: it centralizes paths so that when structural moves do happen, only `tools/paths.mjs` needs updating, not dozens of tool scripts.

---

## 12. Forbidden Operations (current — re-read before any commit)

(See §4 above for the full forbidden-operations list. The list has NOT changed during the Phase 0A–0H window — no structural moves have happened, and no operations previously forbidden have been unlocked.)

**Forever-forbidden during this migration**:
- Renaming any file in `scripts/`
- Renaming any script's `@h2o-id`
- Moving `supabase/`
- Changing the extension-runtime path of `surfaces/identity/identity.html`
- Renaming any directory under `supabase/functions/*/`
- Modifying `versions.csv` outside of the release pipeline
- Modifying `config/loader-deps.json` runtime-order entries
- Force-pushing to `main`
- Editing built `loader.js` files in `build/` by hand
- Disabling the pre-commit hook permanently (use `H2O_SKIP_REV_STAMP=1` per-commit)

**Still forbidden until later phases**:
- Phase 7+: moving `h2o-dev-server/` (still a sibling of `h2o-source/`).
- Phase 8+: moving `.git/` (still inside `h2o-source/`); renaming `h2o-source/`.
- Phase 6+: renaming any `build/chrome-ext-*` directory; changing `H2O_EXT_PROXY_PACK_URL`.

---

## 13. Recommended Next Phase

The stabilization track (0A–0J), contract lock-in (1A), and first outside-git structural cleanup (1B) are all complete. The next decision is: continue with the inside-git cleanup, or hold here and observe.

### Phase 1B execution summary (already done)

**Done at**: pre-tag `migration-phase-1B-pre` at `446c39e`.

Scope executed: removed outer `cockpit-pro/apps/` (entirely outside git). Pre-delete inspection found 4 `.DS_Store` files + 1 empty `studio-mobile/src/components/cockpit/` directory. No source code. No references found via repo-wide grep (only matches were in this MIGRATION.md itself documenting the deletion).

**Off-disk backup** (rollback path):
- `~/h2o-migration-backups/phase-1B-outer-cockpit-pro-apps-2026-05-17.tar.gz` (1.5 KB tarball)
- `~/h2o-migration-backups/phase-1B-outer-cockpit-pro-apps-2026-05-17-mirror/` (directory mirror, byte-for-byte identical to original — verified via `diff -rq`)

**Rollback procedure**: if the deletion needs to be undone, `cp -a ~/h2o-migration-backups/phase-1B-outer-cockpit-pro-apps-2026-05-17-mirror /Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/apps` restores the directory to its pre-deletion state. The tar.gz is the secondary copy.

**Validation post-deletion**: `npm run dev:check` and `node tools/loader/validate-loader-order.mjs` both passed unchanged. Working tree of h2o-source remained clean throughout (the deletion was outside git → no working-tree changes from the rm).

### Phase 1C — AUDIT-ONLY findings (no deletions performed)

Phase 1C inventoried three gitignored top-level folders inside `h2o-source/`. **No deletions, moves, or modifications were performed** — Phase 1C was scoped audit-only by operator request. The classification below is the deliverable.

| Folder | Size | Last mtime | gitignore | Functional refs in code | **Classification** | Notes |
|---|---|---|---|---|---|---|
| `tmp/` | 488 KB (10 files) | 2026-04-25 (Apr 30 for `.DS_Store`) | `/tmp/` (line 81) | **0** | **archive/move later** | Contains `labels-v1.0.2-fix.zip` (74 KB) + matching extracted `labels-v1.0.2/` directory (8 generated config/headers/scripts files) — a release-artifact snapshot from a v1.0.2 patch. Plus empty `sidebar-harness/` leaf. NOT pure cruft (has historical patch-snapshot value); NOT actively in use either. Recommend the operator decide whether to move to `archive/` or delete with off-disk backup. |
| `s-files/` | NOT INSPECTED | NOT INSPECTED | `s-files/` (line 28) | NOT SEARCHED for code refs | **keep — user-managed** | Per explicit operator policy: this is a personal holding folder for downloaded scripts from assistants. Phase 1C did NOT inspect its contents, did NOT search for references to it, and will NOT recommend any change. Treat as black-box user data. |
| `references/` | 52 MB (144 files) | 2026-04-22 / 2026-03-27 for HARs | `references/` (line 32) | **0** | **keep** | Documented evidence library with `README.md` (explicit purpose: "evidence used to adapt H2O scripts to the current ChatGPT UI without guessing live browser state") + `_manifest.json` (machine-readable inventory). Contains 2 large HAR network captures (`www.chatgpt.com.har` 26 MB + `www.instapaper.com.har` 3.8 MB) plus organized DOM snapshots by surface (sidebar, overlays, cards, composer, etc.). Project-critical reference material. **Do NOT delete or relocate.** |

**Phase 1C result**: only `tmp/` is a candidate for any future cleanup, and even that is "archive/move later" rather than "safe-delete" because of the v1.0.2 release-artifact content. The right next action is for the operator to decide whether the labels-v1.0.2 snapshot is still useful — if not, a future Phase 1D can move it to `archive/_misc/` with off-disk backup, following the 1B pattern.

### Phases beyond 1C (preview, not yet authorized)

### Phases beyond 1C (preview, not yet authorized)

- **Phase 2**: doc rewrites of stale repo guides (`AGENTS.md`, `CLAUDE.md`) — these still describe a Tampermonkey/Violentmonkey runtime that hasn't been current for months (see §3 for the actual MV3 + chrome-live runtime).
- **Phase 3+**: npm workspaces enablement, `apps/site/` promotion (move `cockpit-pro-site/` → `apps/site/`), `packages/shared-library/` extraction, `build/chrome-ext-*` relocation to `apps/extensions/chatgpt/chrome/`, h2o-dev-server absorption, h2o-source flatten. See the original architectural report in the migration planning thread for the full staged plan.

**Do NOT proceed to Phase 1C (or any subsequent structural phase) without explicit operator approval.** Each phase from here onward requires an off-disk snapshot for rollback. The git-only rollback story does not apply to anything outside the tracked tree.

---

_Last updated: 2026-05-17 (Phase 3B complete — `cockpit-pro-site/` moved to `apps/site/`; root workspaces field updated; package name `cockpit-pro-site` preserved per operator constraint; out-of-band Cloudflare Pages dashboard "Root directory" change required before next deploy)._
