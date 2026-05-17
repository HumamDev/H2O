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

| Phase | Status | Date | Notes |
|---|---|---|---|
| Pre-Phase investigation | **complete** | 2026-05-17 | See §3 for findings |
| Phase 0A — foundation registries | **in progress** | 2026-05-17 | `tools/paths.mjs` and `tools/script-registry.mjs` created as additive, unused foundation files |
| Phase 0B — migrate loader tools | not started | — | Will be next micro-phase |
| Phase 0C+ | not started | — | — |

Latest checkpoint tag: _(none yet for this migration; pre-existing `pre-outer-reorg` is unrelated — see §3.1)_

---

## 2. Repo Topology (as of 2026-05-17)

```
/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/   ← NOT a git repo
├── apps/                                                 ← outer; mostly empty
│   └── studio-mobile/.DS_Store                           ← cruft only
├── h2o-dev-server/                                       ← NOT a git repo
│   ├── alias/        (151 entries; default mode = COPY)
│   ├── dev_output/proxy/_paste-pack.ext.txt
│   └── serve.py      (CORS + no-cache @ 127.0.0.1:5500)
└── h2o-source/                                           ← THE git repo
    ├── .git/                                             ← git toplevel
    ├── apps/         studio-desktop (Tauri V2), studio-mobile (Expo SDK 55)
    ├── archive/      55+ daily snapshots  (gitignored; local only)
    ├── artifacts/    (gitignored; local only)
    ├── assets/       icons + PNGs  (gitignored; local only — surprising)
    ├── build/        6 chrome extensions  (gitignored; local only)
    ├── changelogs/   per-script CHANGELOG.md
    ├── cockpit-pro-site/   standalone Vite/TS marketing site
    ├── config/       dev-order.tsv, loader-deps.json, loader-tiers.json (+ generated views)
    ├── docs/         architecture/, decisions/, identity/, systems/, validation/, migration/ (new)
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
    ├── package.json  + package-lock.json (no `workspaces` field)
    └── versions.csv  append-only release log
```

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

## 9. Architecture Contracts (adopt before Phase 1)

These are the rules new code must follow during and after migration:

1. No tool computes a top-level path via raw `path.resolve(__dirname, '..', …)` literals. All paths come from `tools/paths.mjs`.
2. No script filename literal in tools/. Scripts are referenced by ID via `tools/script-registry.mjs`.
3. No new package created without a real consumer. Empty seed packages are forbidden.
4. No deep cross-folder relative import in `apps/*`. Cross-package access goes through workspace-resolved scope names (`@h2o/*`, `@h2o-studio/*`).
5. `scripts/` does not import from `packages/`. The runtime userscripts remain self-contained.
6. `surfaces/` and `scripts/` remain parallel implementations until adapter extraction (deferred indefinitely). Neither imports the other at runtime.
7. All chrome extension manifest URL changes require a manifest rebuild. `H2O_EXT_PROXY_PACK_URL` is the only embedded URL; treat it as a stable contract.
8. Filenames in `scripts/` are append-only. Adding scripts requires a new ID; renaming requires a deprecation cycle.

---

## 10. Phase 0A — What Was Done

**Files created** (additive, no consumers, no runtime behavior change):

- `tools/paths.mjs` — central path constants with env-var overrides. Mirrors current default-resolution behavior of existing tools exactly. Not yet imported by any other tool.
- `tools/script-registry.mjs` — pure helpers for parsing script IDs, deriving alias names, listing scripts, detecting Finder-duplicate clones. Mirrors `make-aliases.mjs` sanitization rules exactly. Not yet imported by any other tool.
- `docs/migration/MIGRATION.md` (this file).

**Files modified:** none.

**Runtime behavior change:** none. The two new files are dead code from the perspective of existing tools.

**Validation performed:**

- `node --check tools/paths.mjs` and `node --check tools/script-registry.mjs` passed.
- `npm run dev:check` and `node tools/loader/validate-loader-order.mjs` confirm pre-phase parity with pre-Phase-0A state.
- Working tree contains exactly 3 new files; 0 modified files.

---

## 11. Recommended Next Micro-Phase (Phase 0B)

After Phase 0A is committed:

- **Phase 0B (½ day):** Establish boot-timing baseline. Enable `H2O_LOADER_V3_DIAG=1` in a dev profile and record per-script, per-tier, and total-budget timings for `chrome-ext-dev-controls-oauth-google`. Commit results to `docs/migration/baseline-boot-timing.md`. This is the regression detector all subsequent phases will measure against.

After 0B:

- **Phase 0C (½ day):** Migrate `tools/loader/make-aliases.mjs` and `tools/loader/make-ext-proxy-pack.mjs` to import paths from `tools/paths.mjs`. Validate boot timing has not regressed by more than 5%. Validate alias generation is byte-equivalent.

After 0C:

- **Phase 0D (1 day):** Migrate remaining loader tools, then validators. Per-tool soak.

**Do not proceed to Phase 1 until all Phase 0X micro-phases are complete and validated.**

---

_Last updated: 2026-05-17 (Phase 0A in progress)._
