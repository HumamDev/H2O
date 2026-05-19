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

> **STRUCTURAL CHANGES TO DATE**: many — inside the git repo: `cockpit-pro-site/` → `apps/site/` (3B); 8 chrome-ext outputs → `apps/extensions/chatgpt/chrome/` (4C-B); `../h2o-dev-server/` → `apps/dev-server/` (5B); `apps/studio-desktop/` → `apps/studio/desktop/` (6B); `apps/studio-mobile/` → `apps/studio/mobile/` (6C-3); 16 future-structure placeholder READMEs added (7D); stable manifest `"key"` injection across all 8 chrome variants (8A-1). Outside the git tree (within outer `cockpit-pro/`): Phase 1B deleted dead `cockpit-pro/apps/`; Phase 7F moved `references/` (52 MB) out; Phase 7G-1 moved `{tmp,plans,s-files}/` out + consolidated `AGENTS.md`+`CLAUDE.md`+`tasks-manual-*.md` into `cockpit-pro/operator-notes/`; deleted root-level stale `identity-provider.local.json` and recurring `.DS_Store`; Phase 8C moved `archive/` (1.8 GB) out behind `H2O_ARCHIVE_DIR` env var. **Phase 8B renamed the git-toplevel folder itself**: `cockpit-pro/h2o-source/` → `cockpit-pro/h2o-cp-source/`. `.git/` moved with the folder; `.git` has NOT been relocated; outer `cockpit-pro/` is NOT a git repo. Outer `cockpit-pro/` is the **outer-workspace-shell** (§2.1) — a non-git host directory containing `.claude/` + `archive/` + `operator-notes/` + `plans/` + `references/` + `s-files/` + `tmp/` + `h2o-cp-source/`.

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
| **3B** — `cockpit-pro-site` → `apps/site` move | ✅ complete | `migration-phase-3B-complete` (pre: `migration-phase-3B-pre`) | `9694557` | **STRUCTURAL MOVE inside git tree.** `git mv cockpit-pro-site apps/site` (14 tracked files; directory rename carried untracked `dist/`, `node_modules/`, `.DS_Store` along). Off-disk backup at `~/h2o-migration-backups/phase-3B-pre-20260517-195026/`. The commit ended up containing only the 14 renames; 4 supporting edits (root `package.json` workspaces, root `package-lock.json`, `apps/site/README.md`, this MIGRATION.md) were prepared in the working tree but did not get staged into `9694557` — landed separately in Phase 3D (`31f2964`). **Package name `cockpit-pro-site` unchanged** per operator constraint. Deterministic extension build byte-identical to Phase 0J/2B/2D baseline. |
| **3C** — Phase 3B post-push verification | ✅ complete | — (verification-only) | `9694557` | **VERIFICATION-ONLY**, no commit. Detected the partial-commit condition (renames pushed; supporting edits uncommitted). All local validators passed against the corrected working tree; extension hash matched baseline. Reported the inconsistency on `origin/main` and recommended a Phase 3D follow-through commit. |
| **3D** — Phase 3B follow-through commit | ✅ complete | `migration-phase-3D-complete` | `31f2964` | Landed the 4 supporting edits that were prepared during 3B but omitted from `9694557`: root `package.json` workspaces `"cockpit-pro-site"` → `"apps/site"`; root `package-lock.json` regenerated (1104 → 954 audited packages after dedupe); `apps/site/README.md` Cloudflare "Root directory" instruction; this MIGRATION.md phase table + repo-tree updates. `origin/main` is now self-consistent. Deterministic extension build still byte-identical to baseline. |
| **3E** — Phase 3 closeout verification | ✅ complete | `migration-phase-3E-complete` | `cfd6d84` | **VERIFICATION + DOC-ONLY closeout.** All 8 structural checks pass at HEAD: `cockpit-pro-site/` gone, `apps/site/` present with 14 tracked files, root workspaces lists `apps/site`, site package name still `cockpit-pro-site`, `package-lock.json:6753` resolves `cockpit-pro-site` workspace to `apps/site`, `node_modules/cockpit-pro-site → ../apps/site`. Full validation suite passes. Extension hash matches Phase 0J/2B/2D/3B/3D baseline `edf2baa…7af772`. **OUT-OF-BAND ACTION STATUS**: Cloudflare Pages dashboard "Root directory" change to `apps/site` cannot be programmatically verified — remains as the only operator-side confirmation outstanding. |
| **4B-1** — migrate build-side ext-path consumers to `extensionBuildDir()` | ✅ complete | `migration-phase-4B-1-complete` | `8c9e382` | Pure refactor. 7 build-side files now import `extensionBuildDir` from `tools/paths.mjs` and use it for OUT_DIR / `--check` path computations. ~36 hardcoded `chrome-ext-*` string literals removed. Output paths unchanged; deterministic build byte-identical to baseline. |
| **4B-1b** — migrate identity validators to `extensionBuildDir()` | ✅ complete | `migration-phase-4B-1b-complete` | `9e0cfb5` | 10 identity validators refactored using local `extBuildRel(variant, ...)` helper; preserved 5 intentional content-check literals; `background-bundle` deferred (variant-as-folder-basename semantics too coupled). Fixed Phase 4B-1 regression in 3.9B/3.9C by restoring literal substrings via documentation comment in `run-identity-release-gate.mjs`. |
| **4B-2** — opt-in `H2O_EXT_BUILD_ROOT` support | ✅ complete | `migration-phase-4B-2-complete` | `6d98f88` | Single-file change in `tools/paths.mjs`. `extensionBuildDir()` now honors `H2O_EXT_BUILD_ROOT` env var as an opt-in alternate root; default unchanged. Precedence layer: `H2O_EXT_OUT_DIR` > `H2O_EXT_BUILD_ROOT` > legacy default. |
| **4B-3** — manifest-key audit | ✅ complete | — (audit-only) | `6d98f88` | **AUDIT-ONLY.** 0/8 manifests have a `"key"` field; all extension IDs are folder-path-derived. OAuth-Google variant has a hard external coupling (`amjponmninhldimbkdkfhcmclmjfbibi` registered in Supabase Auth Redirect URLs). Recommended Option C (symlink bridge) over Option A (add keys) given the pre-production state. |
| **4C-A** — symlink-bridge feasibility audit | ✅ complete | — (audit-only) | `6d98f88` | **AUDIT-ONLY.** Mapped 18 files referencing `build/chrome-ext-*`; identified `pack-desk.mjs` as the only symlink-FRAGILE writer (its `removeDir(buildDir) → ensureDir(buildDir)` pattern destroys symlinks). Conclusion: bridge + default-flip MUST be atomic to avoid breakage. Recommended Phase 4C-B as a single atomic move+symlink+flip. |
| **4C-A2** — empirical Chrome symlink ID test | ✅ complete | — (operator manual test) | `6d98f88` | **OPERATOR TEST.** Verified: before-swap ID = `bfbnnjcdpfgfalnehjmkjiopegoehjaa`, after-symlink-swap ID = same. Chrome hashes the load PATH STRING (the symlink path), not the resolved target. Symlink bridge confirmed safe for Chrome ID continuity. |
| **4C-B** — atomic move + symlink + default flip | ✅ complete | `migration-phase-4C-B-complete` (pre: `migration-phase-4C-B-pre`) | `4d32d24` | **STRUCTURAL MOVE.** 8 chrome extension variant build outputs moved from `build/chrome-ext-<variant>` to `apps/extensions/chatgpt/chrome/<variant>`. Legacy paths retained as gitignored relative symlinks (`build/chrome-ext-<variant> -> ../apps/extensions/chatgpt/chrome/<variant>`) so Chrome's load-path-derived extension IDs remain stable. `tools/paths.mjs::extensionBuildDir()` default flipped from `<BUILD_DIR>/chrome-ext-<variant>` to `<REPO_ROOT>/apps/extensions/chatgpt/chrome/<variant>`. `H2O_EXT_BUILD_ROOT` override still honored above the new default. `.gitignore` now covers both `build/**` and `apps/extensions/chatgpt/chrome/**`. Off-disk backup at `~/h2o-migration-backups/phase-4C-B-pre-20260517-211536/build-snapshot/` (19 MB, all 8 variants). Deterministic extension build byte-identical to Phase 0J/2B/2D/3B/3D/3E/4B-1/4B-1b/4B-2 baseline `edf2baa…7af772`. **Operator manual step**: reload each unpacked extension in `chrome://extensions` from the legacy `build/chrome-ext-*` paths to refresh Chrome's manifest cache (no ID change expected). |
| **4C-C** — Phase 4C-B closeout verification | ✅ complete | `migration-phase-4C-C-complete` | `f272bf4` | **VERIFICATION + DOC-ONLY closeout.** Confirmed: 4C-B commit `4d32d24` pushed; `extensionBuildDir()` default returns `apps/extensions/chatgpt/chrome/<variant>` for all 8 variants; opt-in `H2O_EXT_BUILD_ROOT` still works; all 8 legacy `build/chrome-ext-*` paths are symlinks with correct relative targets; every symlink resolves to an existing real directory under `apps/extensions/chatgpt/chrome/`; 0 build artifacts tracked under either root; deterministic ext build hash matches the Phase 0J baseline `edf2baa…7af772` (11 consecutive phase boundaries stable); `dev:check`, `validate-loader-order`, `npm -w cockpit-pro-site run build`, `cd apps/site && npm run build`, `apps/studio-desktop prepare-dist`, `apps/studio-mobile tsc --noEmit --skipLibCheck` — all pass. **Operator manual step (carried)**: reload H2O unpacked extensions in `chrome://extensions` from legacy `build/chrome-ext-*` symlink paths; Chrome IDs should remain stable per Phase 4C-A2 empirical test. |
| **5A** — `h2o-dev-server/` absorption audit | ✅ complete | — (audit-only) | `f272bf4` | **AUDIT-ONLY.** Inventoried sibling `../h2o-dev-server/` (8.2 MB, 1 source file `serve.py` + regenerated `alias/` + `dev_output/`; not a git repo). Identified 10 code files + 13 URL-string consumers + 3 IDE-tasks references. Confirmed the URL contract (`http://127.0.0.1:5500/...`) is independent of filesystem location and must remain stable per §9.2 contract #12. Recommended Option B: absorb into `apps/dev-server/` with gitignored generated content. |
| **5B** — `h2o-dev-server/` → `apps/dev-server/` | ✅ complete | `migration-phase-5B-complete` (pre: `migration-phase-5B-pre`) | `8d7734d` | **STRUCTURAL ABSORPTION.** `../h2o-dev-server/serve.py` moved to `apps/dev-server/serve.py` (now git-tracked); `alias/` and `dev_output/` subtrees moved to `apps/dev-server/{alias,dev_output}/` (gitignored). Outer sibling `../h2o-dev-server/` removed (was empty after move plus stale `.DS_Store`). `tools/paths.mjs::SERVER_ROOT_DEFAULT` flipped from `path.resolve(REPO_ROOT, "..", "h2o-dev-server")` to `path.join(REPO_ROOT, "apps", "dev-server")`. `H2O_SERVER_DIR` env override preserved. Inline fallbacks in `tools/dev/{dev-all,dev-check,dev-rebuild}.mjs` (3 files) + 3 `.vscode/tasks.json` H2O_SERVER_DIR sites updated. `.gitignore` adds `apps/dev-server/{alias,dev_output}/**`. **URL contract preserved**: `H2O_EXT_PROXY_PACK_URL` = `http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt` unchanged; manifests unchanged; no extension reinstall required. Off-disk backup at `~/h2o-migration-backups/phase-5B-pre-20260517-213651/h2o-dev-server-snapshot/` (7.8 MB). Deterministic extension build byte-identical to baseline `edf2baa…7af772`. **Operator manual step**: stop the legacy `python3 -m http.server 5500` (or any other server bound to port 5500) running from the old sibling path, then restart `serve.py` from `apps/dev-server/`: `cd apps/dev-server && python3 serve.py 5500`. |
| **5C** — Phase 5B closeout verification | ✅ complete | `migration-phase-5C-complete` | `2b9cca3` | **VERIFICATION + DOC-ONLY closeout.** Confirmed: 5B commit `8d7734d` pushed; `../h2o-dev-server` no longer exists (outer `cockpit-pro/` contains only `h2o-source/`); `apps/dev-server/serve.py` git-tracked; `apps/dev-server/alias/` (151 entries) + `apps/dev-server/dev_output/proxy/_paste-pack.ext.txt` exist but are gitignored (`git ls-files` returns 0). Operator cutover verified: `serve.py` is now running on port 5500 (PID 29204, cwd = `apps/dev-server`, `Server: SimpleHTTP/0.6 Python/3.11.9`); HTTP 200 + CORS-allow-all + no-cache headers preserved on `http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt`. `npm run dev:check` reports `aliasDir=apps/dev-server/alias`, alias=151, brokenSymlinks=0. `validate-loader-order` OK. Deterministic ext build hash matches Phase 0J baseline `edf2baa…7af772` (13 consecutive phase boundaries stable). All workspace builds pass (studio-desktop prepare-dist, npm -w cockpit-pro-site, cd apps/site, studio-mobile tsc). |
| **6A** — Studio folder reorganization audit | ✅ complete | — (audit-only) | `2b9cca3` | **AUDIT-ONLY.** Mapped 13 refs to `apps/studio-desktop` (8 are doc-comments in `surfaces/studio/**`, not load-bearing) + ~30 refs to `apps/studio-mobile` (9 identity validators contain 89 hardcoded path strings). Identified Tauri / Metro / Expo / iOS coupling. Classified: Phase 6B (desktop move) SAFE; Phase 6C (mobile move) RISKY — recommend splitting into 6C-1 validator pre-refactor + 6C-2 folder move. Phase 6D (web scaffold) deferred. |
| **6B** — `apps/studio-desktop` → `apps/studio/desktop` | ✅ complete | `migration-phase-6B-complete` (pre: `migration-phase-6B-pre`) | `b50f019` | **STRUCTURAL MOVE.** Desktop Studio relocated from `apps/studio-desktop` to `apps/studio/desktop` to establish the `apps/studio/<platform>/` layout convention. Move was atomic via `git mv` (17 tracked files + carried untracked `node_modules/`, `dist/`, `src-tauri/target/` via single-inode rename). Root `package.json` workspaces entry `"apps/studio-desktop"` → `"apps/studio/desktop"`. `npm install` regenerated lockfile path-keys + `node_modules/@h2o/studio-desktop` workspace symlink (now resolves to `../../apps/studio/desktop`). Package name `@h2o/studio-desktop` UNCHANGED per operator constraint. 8 doc-comment references in `surfaces/studio/{studio.html, S0F1c…, store/{categories,chats,folders,labels,snapshots,tags}.tauri.js}` updated for consistency (load-bearing references: none). One required code fix: `apps/studio/desktop/scripts/prepare-dist.mjs` import path adjusted from `'../../../tools/paths.mjs'` (3 levels) to `'../../../../tools/paths.mjs'` (4 levels) to account for the extra nesting under `apps/studio/`. Off-disk backup at `~/h2o-migration-backups/phase-6B-pre-20260517-220021/studio-desktop-snapshot/` (5.1 GB including gitignored Cargo `target/`). Deterministic extension build byte-identical to Phase 0J/2B/2D/3B/3D/3E/4B-1/4B-1b/4B-2/4C-B/4C-C/5B/5C baseline `edf2baa…7af772` (14 consecutive phase boundaries stable). prepare-dist + workspace builds (site -w + cd + studio-mobile tsc) all pass from new location. |
| **6B-C** — Phase 6B closeout verification | ✅ complete | `migration-phase-6B-C-complete` | `9a8d255` | **VERIFICATION + DOC-ONLY closeout.** Confirmed all 11 structural checks: 6B commit `b50f019` pushed; `apps/studio-desktop` no longer exists; `apps/studio/desktop` exists with 17 tracked files; package name `@h2o/studio-desktop` unchanged; root `package.json` workspaces lists `apps/studio/desktop`; `package-lock.json` resolves `@h2o/studio-desktop` → `apps/studio/desktop`; `node_modules/@h2o/studio-desktop → ../../apps/studio/desktop`; prepare-dist import path is `'../../../../tools/paths.mjs'` (4 levels, correct for new depth); 0 build artifacts tracked under `apps/studio/desktop/{dist,node_modules,src-tauri/target}`. All 9 validators pass: `node --check`, `dev:check`, `validate-loader-order`, deterministic ext build hash matches Phase 0J baseline `edf2baa…7af772` (**15 consecutive phase boundaries stable**), `prepare-dist` succeeds from `cd apps/studio/desktop` AND from `npm --workspace @h2o/studio-desktop`, site builds (`-w` + `cd`) deterministic, `studio-mobile tsc --noEmit --skipLibCheck` exit 0. **Carried operator items unchanged** (Chrome unpacked-extension reload, Cloudflare dashboard). |
| **6C-1** — single-source Studio Mobile validator paths | ✅ complete | `migration-phase-6C-1-complete` | `31678f9` | **PURE REFACTOR** (pre-mobile-move). 9 identity/mobile validators refactored to use a local `const MOBILE_APP_REL = "apps/studio-mobile";` constant; all literal `"apps/studio-mobile/..."` references replaced with `` `${MOBILE_APP_REL}/...` `` template literals (~89 hardcoded refs collapsed to 1 constant per file). String values byte-identical to pre-refactor. Reduces Phase 6C-3 validator coupling to a 9-line edit. |
| **6C-2** — Studio Mobile move audit | ✅ complete | — (audit-only) | `31678f9` | **AUDIT-ONLY.** Inventoried `apps/studio-mobile` (211 tracked files; 1 GB total incl. gitignored Pods/build/.expo/node_modules). Exhaustively enumerated 4 depth-coded files requiring updates post-move: `metro.config.js`, `tsconfig.json`, `package.json` (file: dep), `src/features/categories/index.ts`. Confirmed iOS xcodeproj has 0 absolute paths; Podfile uses `__dir__` + dynamic `require.resolve` (path-resilient); bundle IDs/slug/scheme are identifier text not paths. Concluded 6C-3 is safe as a single atomic phase. |
| **6C-3** — `apps/studio-mobile` → `apps/studio/mobile` | ✅ complete | `migration-phase-6C-3-complete` (pre: `migration-phase-6C-3-pre`) | `4810dd7` | **STRUCTURAL MOVE.** Mobile Studio relocated from `apps/studio-mobile` to `apps/studio/mobile`. Atomic `git mv` (211 tracked files; gitignored `node_modules/`, `.expo/`, `ios/Pods/`, `ios/build/` carried via single-inode rename). 4 depth-math fixes applied: `metro.config.js` workspaceRoot `'../..'` → `'../../..'`; `tsconfig.json` paths alias adds one `../`; `package.json` `file:` dep adds one `../`; `src/features/categories/index.ts` import adds one `../`. Root `package.json` workspaces `"apps/studio-mobile"` → `"apps/studio/mobile"`. 9 validator `MOBILE_APP_REL` constants updated (1-line each, per Phase 6C-1 pre-refactor). `npm install` regenerated lockfile + `node_modules/studio-mobile → ../apps/studio/mobile`. **iOS Pods regenerated** at new location: `LANG=en_US.UTF-8 pod install` (34 s; 110 pods installed; H2OStudio.xcodeproj integrated). Package name `studio-mobile`, bundle ID `com.anonymous.studio-mobile`, Expo slug `studio-mobile`, URL scheme `studiomobile` all UNCHANGED. Off-disk backup at `~/h2o-migration-backups/phase-6C-3-pre-20260517-223948/studio-mobile-snapshot/` (1.0 GB). |
| **6C-4** — Phase 6C-3 closeout verification | ✅ complete | `migration-phase-6C-4-complete` | `e104c74` | **VERIFICATION + DOC-ONLY closeout.** All 15 structural checks pass at HEAD: 6C-3 commit `4810dd7` pushed; `apps/studio-mobile` does NOT exist; `apps/studio/mobile` exists with 211 tracked files; package name `studio-mobile` unchanged; bundle ID `com.anonymous.studio-mobile`, Expo slug `studio-mobile`, scheme `studiomobile` all preserved; root `package.json` workspaces lists `apps/studio/mobile`; `package-lock.json` resolves `studio-mobile` → `apps/studio/mobile`; `node_modules/studio-mobile → ../apps/studio/mobile`; all 4 depth-fixes verified at correct depths; all 9 validator `MOBILE_APP_REL` constants point at `apps/studio/mobile`; 0 build artifacts tracked under `apps/studio/mobile/{node_modules,.expo,ios/Pods,ios/build}`. All 10 validators pass: `node --check`, `dev:check`, `validate-loader-order`, deterministic ext build hash matches Phase 0J baseline `edf2baa…7af772` (**18 consecutive phase boundaries stable**), mobile `tsc --noEmit --skipLibCheck` exit 0, mobile workspace selector via `npm --workspace studio-mobile` works correctly, studio-desktop prepare-dist via `-w @h2o/studio-desktop`, site builds (`-w` + `cd`), and a second `pod install` confirms iOS integration is stable (15 s, 110 pods, no tracked-file diff). Phase 6C is fully closed. |
| **6Z** — `apps/` consolidation stable checkpoint | ✅ complete | `migration-phase-6Z-complete` | `9c344d9` | **VERIFICATION + DOC-ONLY CHECKPOINT.** Marks the end of the `apps/` consolidation arc that began with Phase 3B. Final `apps/` topology verified: `apps/site` (14 tracked), `apps/extensions/chatgpt/chrome` (0 tracked; all 8 variant build outputs gitignored), `apps/dev-server` (1 tracked: serve.py), `apps/studio/desktop` (17 tracked), `apps/studio/mobile` (211 tracked). Total tracked under `apps/` = 243. All 4 legacy paths absent: `apps/studio-mobile`, `apps/studio-desktop`, `../h2o-dev-server`, `cockpit-pro-site` at root. Outer `cockpit-pro/` contains only `h2o-source/`. All 6 chrome-ext symlinks intact and resolve correctly. Full validation: dev:check, validate-loader-order, deterministic ext build hash `edf2baa…7af772` (**19 consecutive phase boundaries stable**: 0J→2B→2D→3B→3D→3E→4B-1→4B-1b→4B-2→4C-B→4C-C→5B→5C→6B→6B-C→6C-1→6C-3→6C-4→6Z), studio-desktop prepare-dist via package-name selector, studio-mobile tsc + workspace-selector + script enumeration, site builds via both `-w` and `cd`. 0 tracked build artifacts under any of the 13 inspected build/cache paths. The migration is at its most cohesive state. |
| **7A** — post-migration hygiene audit | ✅ complete | — (audit-only) | `9c344d9` | **AUDIT-ONLY.** Scanned ~50 files for 5 stale-path patterns. Classified into 8 categories (A through H). Identified 4 Category-A "must-fix" files with 9 operator-facing line edits where `cd apps/studio-desktop` etc. would fail when copy-pasted. Confirmed 40+ remaining refs are intentionally kept (validator content-check literals, symlink-bridge users, Phase-N historical doc-comments, frozen 5.0X identity docs, MIGRATION narrative, intentional package-name divergences). Recommended Phase 7B scoped to Category A only. |
| **7B** — docs cleanup (Category A) | ✅ complete | `migration-phase-7B-complete` | `65d6e70` | **DOCS-ONLY.** Fixed the 9 stale operator-facing path refs across 4 files: `apps/studio/desktop/README.md` (6 sites), `apps/studio/mobile/README.md` (1 site: `cd apps/studio-mobile` → `cd apps/studio/mobile`), `apps/studio/desktop/src-tauri/icons/README.md` (1 site), `apps/studio/desktop/scripts/prepare-dist.mjs` (1 JSDoc-header site at line 7; the Phase 6B historical doc-comment at line 53 was intentionally KEPT — describes the migration history). Categories B/C/D/E/F/G/H untouched. Deterministic ext build hash unchanged. |
| **7C** — Phase 7B closeout verification | ✅ complete | `migration-phase-7C-complete` | `86b58c9` | **VERIFICATION + DOC-ONLY closeout.** Confirmed: 7B commit `65d6e70` pushed; 4 Category-A files have zero operator-facing stale paths (the one remaining `apps/studio-desktop` ref in `prepare-dist.mjs:53` is the Phase 6B historical doc-comment, intentionally preserved). Total repo-wide stale ref counts dropped: `apps/studio-desktop` 4→2, `apps/studio-mobile` 23→22. All remaining refs (40+) are in safe-to-leave categories (validator content checks, symlink-bridge users, historical Phase 5.0X docs, MIGRATION narrative, intentional package-name divergences). 5 canonical paths active. All validators pass: dev:check, validate-loader-order, deterministic ext build hash matches Phase 0J baseline `edf2baa…7af772` (**21 consecutive phase boundaries stable**), studio-desktop prepare-dist, studio-mobile tsc + workspace-selector, site builds (`-w` + `cd`). 0 tracked build/cache artifacts under any of the 13 inspected paths. **Migration is paused safely at this checkpoint.** |
| **7D** — future-structure placeholder folders | ✅ complete | `migration-phase-7D-complete` | `79528e4` | **DOCS-ONLY scaffold.** Added 16 `README.md` placeholders documenting future-structure intent at 16 paths: 5 future host/browser extension variants (`apps/extensions/chatgpt/firefox/`, `apps/extensions/{claude,gemini}/{chrome,firefox}/`); 3 Studio-platform placeholders (`apps/studio/{mac,windows,web}/`); 2 future workspace packages (`packages/{core,extension-core}/`); 3 host-adapter packages (`packages/host-adapters/{chatgpt,claude,gemini}/`); 2 browser-adapter packages (`packages/browser-adapters/{chrome,firefox}/`); 1 staging dir (`artifacts/`). Each README explicitly states "FUTURE PLACEHOLDER" or "FUTURE-USE PLACEHOLDER" intent. The `apps/studio/{mac,windows}/README.md` files explicitly note "NOT the active app root" — the active desktop entry point is `apps/studio/desktop/`. `.gitignore` updated with `/artifacts/*` + `!/artifacts/README.md` exception. No code/manifest/build changes. Deterministic ext build hash matches Phase 0J baseline `edf2baa…7af772`. |
| **7E** — Studio desktop folder audit | ✅ complete | — (audit-only) | `79528e4` | **AUDIT-ONLY.** Verified that the Phase 6B desktop move + Phase 7D placeholders are coherent: `apps/studio/desktop/` is the canonical active root (Tauri V2 shell, 17 tracked files, package name `@h2o/studio-desktop`); `apps/studio/{mac,windows}/README.md` correctly denote future native platform-specific bundlers (not the current app root); `apps/studio/web/README.md` denotes a deferred web entry. No file moves performed. No code changes. |
| **7E2** — outer workspace separation audit | ✅ complete | — (audit-only) | `79528e4` | **AUDIT-ONLY.** Inventoried `cockpit-pro/` (outer, not a git repo) contents and identified candidates for the outer-workspace-shell layout: (a) `references/` (52 MB local-only evidence library) is a natural fit to move outside the git tree because it has zero tooling/config consumers and is gitignored already; (b) 5 junk items at `h2o-source/` root (`.DS_Store`, `.bump/`, `git-status.txt`, `staged.txt`, `unstaged.txt`) are safe to delete (all untracked, all gitignored or sweep-targets, all empty/transient). h2o-source/ remains the git toplevel; no `.git` relocation considered. Recommended Phase 7F as a single doc+filesystem cleanup. |
| **7F** — outer workspace hygiene | ✅ complete | `migration-phase-7F-complete` | `c316721` | **STRUCTURAL: outside git tree.** `references/` (52 MB, 144 files, 0 tracked) moved from `h2o-source/references/` to outer `cockpit-pro/references/` — relocates the operator-only documentation evidence library out of the git workspace shell. 5 junk items deleted from `h2o-source/` root: `.DS_Store`, `.bump/` (empty), `git-status.txt`, `staged.txt`, `unstaged.txt` (all untracked, all gitignored or matching gitignore patterns). Zero tooling consumers (`grep -rn "references" tools/ config/ package.json` returns nothing); zero working-tree diff for the references/ move (was fully gitignored). **h2o-source/ remains the git toplevel** — `.git` not moved. The outer `cockpit-pro/` directory now formalizes the **outer-workspace-shell** concept (see §2.1): a non-git host directory that bookends the git repo with workspace-but-not-source artifacts (`references/`, `.claude/`-style per-host metadata). Off-disk backup NOT created — all changes either gitignored (references/) or untracked-junk (5 items); recoverable from filesystem mtimes if needed. Deterministic extension build hash byte-identical to baseline (relative-path NUL-safe form `c4db3bdb…6f14`, excluding macOS-Finder `.DS_Store` artifacts that appear in any local temp OUT_DIR; **22 consecutive phase boundaries stable** under this canonical form). Validators pass: dev:check (exit 1 — pre-existing archiveWorkbench drift between source surfaces/studio/* and chrome-ext-prod/surfaces/studio/*, identical state at HEAD pre-edit; confirmed via `git stash` round-trip; unrelated to Phase 7F), validate-loader-order (exit 0). |
| **7G** — externalize ignored local-state folders audit | ✅ complete | — (audit-only) | `c316721` | **AUDIT-ONLY.** Re-evaluated 19 ignored/non-git local-state items at `h2o-source/` root with the priority: `h2o-source/` for source/runtime/tracked content, outer `cockpit-pro/` for local/operator-only artifacts. Classified into 5 categories: (a) **Move now, no refactor**: `tmp/`, `plans/`, `s-files/`, `AGENTS.md`, `CLAUDE.md`, `tasks-manual-*.md` → Phase 7G-1. (b) **Move after env-var refactor**: `archive/` (needs `H2O_ARCHIVE_DIR` in paths.mjs + archive-snapshot.mjs) → Phase 7G-2; `meta/` (needs `H2O_META_DIR` in paths.mjs + commit-auto.mjs default-message path) → Phase 7G-3. (c) **Must stay inside h2o-source/**: `node_modules/` (npm convention), `build/` (4C-B symlink bridge), `assets/` (BUILD-CRITICAL icon packs), `artifacts/` (Phase 7D README-only placeholder), `.bump/` (release-pipeline working dir; auto-recreated), `scripts/`, `supabase/`. (d) **Delete-only junk**: `identity-provider.local.json` at root (stale duplicate of canonical `config/local/identity-provider.local.json`), `.DS_Store` (recurring Finder cache). (e) **Operator-permission-required**: inner `.claude/` (21 MB, contains worktrees/). Open question flagged: `archive/.state/lastVersions.json` may be a tracked git sentinel that affects how 7G-2 proceeds. |
| **7G-1** — immediate outer workspace hygiene | ✅ complete | `migration-phase-7G-1-complete` | `8c27bc1` | **STRUCTURAL: outside git tree.** Moved 3 folders + 4 files outside `h2o-source/`, deleted 2 junk items. Folders moved (0 tracked, all gitignored): `tmp/` (488 KB) → `cockpit-pro/tmp/`; `plans/` (164 KB) → `cockpit-pro/plans/`; `s-files/` (199 MB) → `cockpit-pro/s-files/`. Operator notes consolidated into new outer `cockpit-pro/operator-notes/`: `AGENTS.md`, `CLAUDE.md`, `tasks-manual-1.md`, `tasks-manual-2.md`. Deleted: `identity-provider.local.json` at root (stale duplicate; canonical is `config/local/identity-provider.local.json`); `.DS_Store` at root (recurring Finder cache, gitignored). **h2o-source/ remains the git toplevel** — `.git` not moved. **Zero tracked-file diff** for the moves/deletes (all 8 items were untracked + gitignored). **Zero tooling impact**: no env-var changes; no path constant changes; no package.json changes; no `.gitignore` changes (existing rules continue to cover any future re-creation at the old paths). Deterministic ext build hash byte-identical: `c4db3bdb…6f14` (NUL-safe relative-path form; 23 consecutive phase boundaries stable). Validators: validate-loader-order exit 0; dev:check exit 1 (pre-existing archiveWorkbench drift, unchanged from 7F). Pre-existing unrelated working-tree diff in `apps/studio/mobile/ios/H2OStudio/H2OStudio.entitlements` was present before this phase started and was NOT touched (likely from a prior Xcode regeneration). |
| **8A** — h2o-source rename audit | ✅ complete | — (audit-only) | `7b3b00a` | **AUDIT-ONLY.** Evaluated safety of renaming `cockpit-pro/h2o-source` → `cockpit-pro/h2o-cp-source`. Findings: (a) **All 8 tracked-file h2o-source references are doc/comment/cosmetic** (package.json:2 workspace name; tools/paths.mjs:13,51 doc comments; tools/archive/archive-snapshot.mjs:6 comment; apps/studio/desktop/scripts/prepare-dist.mjs:5,7,10,78,136 + README.md doc text; .vscode/tasks.json:299 display text; docs/migration/MIGRATION.md 30 historical references). NO functional path uses literal "h2o-source". `tools/paths.mjs:46` computes REPO_ROOT via `path.resolve(HERE, "..")` — name-agnostic. (b) **All symlinks (build/chrome-ext-* bridge + alias farm + npm workspace links) use relative paths** — survive rename automatically. (c) **Generated caches with absolute paths**: Cargo target/ (435 files, 2.3 GB; `cargo clean` regenerates), iOS Pods/ (6 files; `pod install` regenerates), .expo/. (d) **CRITICAL RISK: Chrome extension IDs would change** because Chrome hashes the load-path string (per Phase 4C-A2 empirical test). All 8 unpacked IDs rotate, the OAuth-Google ID `amjponmninhldimbkdkfhcmclmjfbibi` registered in Supabase Auth would be invalidated, and 2 hardcoded validators (3_9c + 3_5b) would fail. Recommended Phase 8A-1 (manifest "key" hardening) BEFORE Phase 8B (the actual rename) to make IDs path-agnostic. |
| **8A-1** — Chrome manifest key hardening | ✅ complete | `migration-phase-8A-1-complete` | `c8db2ca` | **TOOLING + CONFIG.** Generated 8 RSA-2048 key pairs in-memory; retained only public keys (SubjectPublicKeyInfo DER, base64-encoded); discarded private keys. Wrote new tracked file `config/extension-keys.json` with public keys + computed Chrome IDs per variant (`prod`, `dev-controls`, `dev-controls-armed`, `dev-controls-oauth-google`, `dev-lean`, `ops-panel`, `studio-launcher`, `desk`). Added new module `tools/product/extension/chrome-extension-keys.mjs` with `getExtensionKey(variant)` + `deriveVariantFromOutDir(OUT_DIR)` helpers. Wired 3 manifest builders to inject `"key"` into manifest.json: `chrome-live-manifest.mjs` (6 variants via env-var combinations to `build-chrome-live-extension.mjs`); `make-chrome-ops-panel-extension.mjs` (ops-panel); `pack-desk.mjs` (desk). All 8 manifest.json files now contain stable, path-agnostic `"key"` fields. **OAuth-Google ID rotated**: old path-derived `amjponmninhldimbkdkfhcmclmjfbibi` → new key-derived `ogcjkeaiicglflamhjaaimdhphjlgkbb`. Updated 2 hardcoded validators (`validate-identity-phase3_9c-google-oauth-release-gate.mjs`, `validate-identity-phase3_5b-release-gate.mjs`) + 3 doc references in `docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md` with the new ID. **NEW deterministic ext build hash baseline** (under a properly-named OUT_DIR ending in `chrome-ext-<variant>`): `77bd47cf904c6e4b2b9062a90d8e2faaa62393d79eebfe2f105a217a64a46e8a` (dev-controls variant; supersedes pre-8A-1 baseline `c4db3bdb…6f14` due to the intentional manifest.key addition). Validators: validate-loader-order exit 0; validate-identity-phase3_9c-google-oauth-release-gate exit 0 (NOW PASSING — was failing pre-8A-1 due to the OAuth-Google manifest missing identity permission, which required correct env vars during build). validate-identity-phase3_5b-release-gate still exit 1 (PRE-EXISTING failure unrelated to 8A-1: docs expect new-path build command literal; confirmed identical via `git stash` round-trip — separate doc-update task). dev:check exit 1 (pre-existing archiveWorkbench drift, unchanged). **OPERATOR ACTION REQUIRED for Phase 8B safety**: update Supabase Auth Redirect URL from the old chromiumapp URL to `https://ogcjkeaiicglflamhjaaimdhphjlgkbb.chromiumapp.org/identity/oauth/google`. After that, Phase 8B (h2o-source rename) is SAFE — all 8 Chrome IDs are now key-derived and will survive the rename. |

| **8B** — `h2o-source` → `h2o-cp-source` rename | ✅ complete | `migration-phase-8B-complete` | `0051cbc` | **STRUCTURAL: filesystem rename of the repo root folder.** Plain `mv cockpit-pro/h2o-source cockpit-pro/h2o-cp-source` (atomic, single-inode). `.git/` moved with the folder; the renamed directory remains the git toplevel — `.git` is NOT relocated and outer `cockpit-pro/` is NOT a git repo. Operator pre-action satisfied: Supabase Auth Redirect URL updated to `https://ogcjkeaiicglflamhjaaimdhphjlgkbb.chromiumapp.org/identity/oauth/google` (the new key-derived OAuth-Google ID from Phase 8A-1). **Tracked diff**: `package.json:2` `"name": "h2o-source"` → `"h2o-cp-source"`; `package-lock.json` regenerated via `npm install` (workspace symlinks rewired automatically — all 4 are relative paths, so they survive the rename intrinsically; npm just refreshes the lockfile name field); `apps/studio/mobile/ios/Podfile.lock` regenerated by `pod install`. **Caches regenerated**: `apps/studio/desktop/src-tauri/target/` (2.3 GB) cleared and will be rebuilt on next `tauri:dev` / `cargo build`; `apps/studio/mobile/ios/Pods/` (1.0 GB) reinstalled via `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` (110 pods, exit 0). **Deterministic ext build hash UNCHANGED** at `77bd47cf904c6e4b2b9062a90d8e2faaa62393d79eebfe2f105a217a64a46e8a` (dev-controls variant) — `tools/paths.mjs::REPO_ROOT` derives via `path.resolve(HERE, "..")` at runtime (completely name-agnostic); manifest.json contents depend only on `config/extension-keys.json` + scripts content, not the absolute path. **Chrome extension IDs UNCHANGED** (all 8 IDs are now key-derived per Phase 8A-1 and survive the rename — exactly the point of that hardening phase). Validators: validate-loader-order exit 0; identity-phase3_9c-google-oauth-release-gate exit 0; studio-desktop prepare-dist exit 0 (65 files copied at new path); cockpit-pro-site Vite build exit 0; studio-mobile `tsc --noEmit --skipLibCheck` exit 0 (via npx; the workspace has no "tsc" npm script). dev:check exit 1 (pre-existing archiveWorkbench drift, unchanged). **Optional doc-comment cleanups deferred** (Phase 8A audit flagged these as "optional, non-functional"): 5 tracked files still contain "h2o-source" in doc comments or display strings (`tools/paths.mjs:13,51`; `tools/archive/archive-snapshot.mjs:6`; `apps/studio/desktop/scripts/prepare-dist.mjs` 5 sites; `apps/studio/desktop/README.md` 5 sites; `.vscode/tasks.json:299`) — separate cosmetic follow-up phase. MIGRATION.md historical narrative refs intentionally preserved. **Carried operator items**: (1) **reload all 8 H2O unpacked extensions in `chrome://extensions` from the new paths** under `cockpit-pro/h2o-cp-source/build/chrome-ext-*` (or `apps/extensions/chatgpt/chrome/*`) — IDs will match the Phase 8A-1 key-derived values; (2) confirm Cloudflare Pages dashboard "Root directory" still resolves correctly (path string is project-relative); (3) **if VS Code is open at the old path**, close and reopen at `cockpit-pro/h2o-cp-source/` so `${workspaceFolder}` re-resolves correctly for all tasks. |

| **8C** — externalize `archive/` to outer `cockpit-pro/` | ✅ complete | `migration-phase-8C-complete` | `b6b9f2a` | **STRUCTURAL: outside git tree + env-var refactor.** `archive/` (1.8 GB, 51 daily-snapshot dirs, 0 tracked files) moved from `h2o-cp-source/archive/` to outer `cockpit-pro/archive/`. Resolves the Phase 7G open question: `archive/.state/lastVersions.json` was **NOT tracked** (`git ls-files archive/` returned 0) — moving the dir orphans nothing. Tracked code changes (2 files): `tools/paths.mjs:85` — `ARCHIVE_DIR` now uses `process.env.H2O_ARCHIVE_DIR \|\| path.join(REPO_ROOT, "archive")`; `tools/archive/archive-snapshot.mjs:14` — `ARCHIVE_ROOT` now uses `process.env.H2O_ARCHIVE_DIR \|\| path.join(SRC, "archive")` (mirrors paths.mjs precedence; SRC-based default preserves CLI behavior when env absent). `tools/archive/archive-one.mjs` requires NO edits because it already imports `ARCHIVE_DIR` from paths.mjs — auto-picks up env override. `tools/git/commit-auto.mjs` archive-related literals at lines 17, 98, 111, 119 LEFT UNCHANGED — they operate on git-staged path strings and become inert when `archive/` is outside the repo (no in-repo "archive/..." paths to match); preserving the literals keeps the helper functional if `archive/` is ever moved back inside. **NO tracked placeholder** at `h2o-cp-source/archive/README.md` per operator preference (gitignore already covers `archive/**` if anything is accidentally created there). **Real archive operation verified**: `H2O_ARCHIVE_DIR=cockpit-pro/archive npm run archive:snap` ran successfully, wrote 41 newly-archivable .mjs files (recent changes from Phases 6C-1, 7G, 7G-1, 8A-1, 8B) to the new outer location, and updated `cockpit-pro/archive/.state/lastVersions.json` (36905 → 37221 bytes). **Deterministic ext build hash UNCHANGED**: `77bd47cf904c6e4b2b9062a90d8e2faaa62393d79eebfe2f105a217a64a46e8a` (REPO_ROOT path resolution is independent of archive location; env-var-gated). Validators: validate-loader-order exit 0; identity-phase3_9c exit 0; dev:check exit 1 (pre-existing archiveWorkbench drift, unchanged). **Operator setup**: set `H2O_ARCHIVE_DIR=/Users/.../cockpit-pro/archive` in shell env (`~/.zshrc` or per-task in `.vscode/tasks.json` env block). Without the env var, archive tools recreate `archive/` inside `h2o-cp-source/` on next invocation; `.gitignore` continues to exclude it. |

| **8E** — build boundary cleanup audit | ✅ complete | — (audit-only) | `b6b9f2a` | **AUDIT-ONLY.** Analyzed the `build/chrome-ext-*` symlink bridge vs `apps/extensions/chatgpt/chrome/*` canonical layout. Classified 21 tracked consumers of `build/chrome-ext-*` into 5 categories (A — must update; B — safe to leave; C — historical doc; D — validator content-check anchor; E — Chrome/operator-only). Verified: all 8 `build/chrome-ext-*` symlinks point at the canonical paths and resolve; manifest keys (Phase 8A-1) make Chrome IDs key-derived and path-independent → the bridge is no longer needed for ID preservation. Recommended Phase 8E-2 (update functional + operator-facing refs to `apps/extensions/chatgpt/chrome/*`) followed by Phase 8E-3 (remove the bridge). 4 architectural options compared (1 status quo; 2 move back to `build/`; 3 keep apps/extensions + remove bridge; 4 introduce `generated/`). Selected Option 3 as cleanest minimal-cost path. |
| **8E-2** — update build bridge references | ✅ complete | `migration-phase-8E-2-complete` | `d0a313f` | **DOCS + CONFIG.** Updated 5 tracked files: `.vscode/tasks.json` (9 sites: 3 functional `H2O_EXT_OUT_DIR`/`H2O_PANEL_OUT_DIR` values + 6 display strings); `docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md` (27 sites across sections 15.14, 15.16, 15.27 — including the 19 `node --check` syntax-check lines that section 15.16 expects); `apps/studio/desktop/README.md` (3 sites); `apps/studio/desktop/scripts/prepare-dist.mjs` (6 sites, including operator-facing `console.error` at line 132); `apps/studio/web/README.md` (1 site, dropped the "symlinked to..." parenthetical). **3_5b validator NOW PASSES** — the long-standing pre-existing failure (carried since Phase 4C-B) is finally resolved by aligning docs section 15.16 with the new path that `extBuildRel()` computes. Build hash UNCHANGED at `77bd47cf...6e8a`. Refs intentionally left: docs Section 15.28 (Phase 3.9C OAuth Release Gate) `build/chrome-ext-dev-controls-oauth-google` literals (3_9c validator REQUIRES these); `run-identity-release-gate.mjs` doc-comment literals (content-check anchors for 3_9b/3_9c); 10 identity validator "Byte-identical to legacy" doc comments; scripts/0Z1n... line 29 (scripts/ frozen); historical narrative refs in MIGRATION.md + sections 3.0E/G/J/T. |
| **8E-3** — remove legacy build bridge | ✅ complete | `migration-phase-8E-3-complete` | `d81d235` | **STRUCTURAL: filesystem cleanup.** Removed 8 `build/chrome-ext-*` symlinks + `build/.DS_Store` + `rmdir build/`. Updated `.gitignore` lines 11-18: replaced the obsolete Phase 4C-B bridge comment block with a concise Phase 8E-3 note; **kept both `build/**` (safety net) and `apps/extensions/chatgpt/chrome/**` rules**. Tracked diff: `.gitignore` only (+6/-6 lines). Build hash UNCHANGED `77bd47cf...6e8a`. All identity validators pass (3_5b/3_9b/3_9c exit 0). validate-loader-order exit 0. **Carried operator items**: (1) reload all 8 H2O unpacked extensions in `chrome://extensions` from the new canonical paths under `cockpit-pro/h2o-cp-source/apps/extensions/chatgpt/chrome/<variant>/` — IDs preserved (key-derived since 8A-1); (2) any external scripts/automation referencing the old `build/chrome-ext-*` paths must be updated. Architectural outcome: `apps/extensions/<host>/<browser>/<variant>/` is now the sole, unambiguous location for built unpacked extensions; no legacy bridge exists. |
| **8F-1** — PRODUCTS.md architecture map | ✅ complete | `migration-phase-8F-1-complete` | (this commit) | **DOCS-ONLY.** Created tracked file `docs/architecture/PRODUCTS.md` (a single-page operator index of "what produces what"). Documents: (a) conceptual 4-quadrant layout (runtime source / build tooling / generated products / reusable libs) — "platform" treated as conceptual grouping only, NO physical folder; (b) master product table covering 12 runnable/generated products (8 chrome extension variants + Studio Desktop + Studio Mobile + Marketing site + Dev server) with builder/source-inputs/env-vars/output/extension-ID/validation per product; (c) 7 embedded sub-products shipped INSIDE extensions (identity bundle, identity surfaces, studio surfaces, billing bundle, popup, folder-bridge, pilot-observer, icons); (d) ASCII flow diagram (platform → tools → apps); (e) operator quick-reference command table; (f) 6 architectural rules; (g) "Do not move yet" section anchoring each forbidden move to its specific coupling; (h) 5 future cleanup candidates (none authorized). NO filesystem moves; NO source code changes; NO package.json changes. Build hash UNCHANGED `77bd47cf...6e8a`. Validators: validate-loader-order exit 0; identity-3_5b/3_9b/3_9c exit 0; dev:check exit 1 (pre-existing archiveWorkbench drift). |

**Latest stabilized checkpoint**: `migration-phase-8F-1-complete` (this phase). The repo now has an operator-facing architecture map at [docs/architecture/PRODUCTS.md](../architecture/PRODUCTS.md) documenting every product + its full build chain. The legacy `build/chrome-ext-*` symlink bridge has been fully removed (Phase 8E-3) — `apps/extensions/<host>/<browser>/<variant>/` is the canonical and only location for generated unpacked extensions. Three of the largest gitignored local-state trees live outside the git repo: `references/` (52 MB, Phase 7F), `s-files/` (199 MB, Phase 7G-1), `archive/` (1.8 GB, Phase 8C). The repo-root folder is `cockpit-pro/h2o-cp-source/` (Phase 8B). Chrome extension IDs are key-derived (Phase 8A-1) and survive folder renames. Future structural work — Phase 7G-3 (`H2O_META_DIR` + `meta/` outer-shell move), Phase 8F-2 (`tools/dev-controls/ops-panel/` → `tools/product/ops-panel/`; documented in PRODUCTS.md §7.1), Phase 8F-3 (`tools/product/extension/` → `tools/product/extensions/chatgpt/chrome/`; §7.2), Studio web scaffold, packages/shared-library extraction, optional doc-comment cleanups, h2o-source flatten — all remain deferred until explicit operator authorization.

---

## 2. Repo Topology (as of 2026-05-19, post Phase 8C)

```
/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/   ← NOT a git repo (outer workspace shell)
├── .claude/                                              ← per-host assistant metadata (outside git)
├── archive/                                              ← 1.8 GB daily snapshots, gated by H2O_ARCHIVE_DIR (post 8C)
├── operator-notes/                                       ← AGENTS.md + CLAUDE.md + tasks-manual-*.md (post 7G-1)
├── plans/                                                ← planning markdown docs (post 7G-1)
├── references/                                           ← 52 MB local-only evidence library (post 7F)
├── s-files/                                              ← 199 MB operator personal scratch (post 7G-1)
├── tmp/                                                  ← release-artifact snapshots, scratch (post 7G-1)
└── h2o-cp-source/                                        ← THE git repo (renamed from h2o-source/ in Phase 8B)
    ├── .git/                                             ← git toplevel
    ├── apps/
    │   ├── dev-server/   serve.py (CORS + no-cache @ 127.0.0.1:5500); alias/ + dev_output/ gitignored
    │   ├── extensions/
    │   │   ├── chatgpt/
    │   │   │   ├── chrome/  8 chrome extension variant outputs (gitignored)
    │   │   │   │           prod, dev-controls, dev-controls-armed,
    │   │   │   │           dev-controls-oauth-google, dev-lean,
    │   │   │   │           ops-panel, studio-launcher, desk
    │   │   │   └── firefox/  README placeholder (future)
    │   │   ├── claude/{chrome,firefox}/  README placeholders (future)
    │   │   └── gemini/{chrome,firefox}/  README placeholders (future)
    │   ├── site/             standalone Vite/TS marketing site (pkg name `cockpit-pro-site`)
    │   └── studio/
    │       ├── desktop/      Tauri V2 desktop shell (pkg name `@h2o/studio-desktop`) — active root
    │       ├── mobile/       Expo SDK 55 React Native app (pkg name `studio-mobile`)
    │       ├── mac/          README placeholder (future native bundler — NOT the active app root)
    │       ├── windows/      README placeholder (future native bundler — NOT the active app root)
    │       └── web/          README placeholder (future web entry)
    │                                                  (no in-repo archive/ after 8C;
    │                                                   re-created if H2O_ARCHIVE_DIR unset)
    ├── artifacts/    README.md tracked; everything else gitignored (post 7D)
    ├── assets/       BUILD-CRITICAL icon packs read by extension build (gitignored; KEEP inside)
    ├── build/        only chrome-ext-* symlinks → apps/extensions/chatgpt/chrome/* (gitignored)
    ├── changelogs/   per-script CHANGELOG.md
    ├── config/       dev-order.tsv, loader-deps.json, loader-tiers.json (+ generated views)
    ├── docs/         architecture/, decisions/, identity/, systems/, validation/, migration/
    ├── meta/         ledger/, reports/, notes/  (gitignored; deferred to 7G-3 outer-shell move)
    ├── packages/     identity-core, studio-core, studio-types, studio-ui (4 active TS-source packages)
    │                 + core/, extension-core/, host-adapters/{chatgpt,claude,gemini}/,
    │                   browser-adapters/{chrome,firefox}/  README placeholders (future)
    ├── scripts/      149 emoji-named runtime userscripts
    ├── shared/library/  7 .js files (shared between scripts/ and surfaces/studio/)
    ├── supabase/     functions/, migrations/, .temp/  (.temp gitignored)
    ├── surfaces/     desk/, identity/, studio/ (60 S-prefix Studio files)
    ├── tools/        90 tool scripts in 10 subdirs
    ├── package.json  + package-lock.json (workspaces: apps/site, apps/studio/desktop, apps/studio/mobile, packages/*)
    └── versions.csv  append-only release log
```

> **Phase 1B note**: the outer `cockpit-pro/apps/` cruft directory (`.DS_Store` files only) was deleted in Phase 1B.
>
> **Phase 5B note**: the outer-sibling `cockpit-pro/h2o-dev-server/` was absorbed into `h2o-source/apps/dev-server/`.
>
> **Phase 7F note**: `references/` (52 MB local-only evidence library) was moved OUT of `h2o-source/` into outer `cockpit-pro/references/`. The outer `cockpit-pro/` directory is now formalized as the **outer-workspace-shell** (see §2.1).
>
> **Phase 7G-1 note**: 3 additional gitignored folders (`tmp/`, `plans/`, `s-files/`) and 4 operator notes (`AGENTS.md`, `CLAUDE.md`, `tasks-manual-1.md`, `tasks-manual-2.md` — consolidated into `cockpit-pro/operator-notes/`) were moved out of the repo root. Stale duplicate `identity-provider.local.json` at root deleted (canonical is `config/local/identity-provider.local.json`). Zero tooling changes; zero tracked-file diff (all moved/deleted items were untracked + gitignored).
>
> **Phase 8A-1 note**: 8 Chrome unpacked-extension manifests now include a stable `"key"` field (from `config/extension-keys.json`). Chrome extension IDs are now derived from the manifest public key, not from the load-path string. This unblocked Phase 8B by making IDs path-agnostic. OAuth-Google ID rotated to `ogcjkeaiicglflamhjaaimdhphjlgkbb`.
>
> **Phase 8B note**: the repo-root folder was renamed from `h2o-source/` to `h2o-cp-source/`. `.git/` moved with the folder (single-inode atomic `mv`); the renamed folder remains the git toplevel. `package.json` `name` field updated to `h2o-cp-source`; `package-lock.json` regenerated by `npm install`; iOS Pods reinstalled at new path; Cargo `target/` cleared (regenerable). Chrome extension IDs survived the rename (key-derived since 8A-1). Deterministic ext build hash unchanged.
>
> **Phase 8C note**: `archive/` (1.8 GB) was moved out of the git repo to outer `cockpit-pro/archive/`. The move was gated by a new `H2O_ARCHIVE_DIR` env var honored in `tools/paths.mjs::ARCHIVE_DIR` and `tools/archive/archive-snapshot.mjs::ARCHIVE_ROOT`. `archive-one.mjs` auto-picked-up the override via its existing `ARCHIVE_DIR` import. `tools/git/commit-auto.mjs` archive-related literals were left UNCHANGED — they're inert when archive/ is outside the repo (no in-repo paths to match) but remain functional if archive/ ever moves back. `archive/.state/lastVersions.json` (untracked, gitignored) carried along with the move. **Operator setup**: set `H2O_ARCHIVE_DIR=<path>/cockpit-pro/archive` in shell env or per-task `env` blocks in `.vscode/tasks.json`. Without the env var, archive tools recreate `archive/` inside h2o-cp-source on next invocation (still gitignored).

### 2.1 Outer-workspace-shell concept (formalized 7F, expanded 7G-1, renamed 8B, archive externalized 8C)

The outer `cockpit-pro/` directory is **not** a git repository. It is a non-git host directory that "wraps" the git repo (`h2o-cp-source/`, renamed from `h2o-source/` in Phase 8B) with workspace-but-not-source artifacts. As of Phase 8C it contains:

```
cockpit-pro/                ← outer workspace shell (NOT a git repo)
├── .claude/                  per-host assistant/agent metadata (outside the project's git history)
├── archive/                  1.8 GB daily snapshots (Phase 8C); env-gated by H2O_ARCHIVE_DIR
├── operator-notes/           AGENTS.md, CLAUDE.md, tasks-manual-*.md (operator-only context)
├── plans/                    planning markdown docs (164 KB)
├── references/               operator-only evidence library (HARs, DOM snapshots; 52 MB)
├── s-files/                  operator personal scratch / downloaded scripts (199 MB)
├── tmp/                      release-artifact snapshots, scratch (488 KB)
└── h2o-cp-source/            THE git repo (.git is HERE, NOT at cockpit-pro/)
```

**Rules of the outer-workspace-shell:**

1. **The repo root folder (currently `h2o-cp-source/`, renamed from `h2o-source/` in Phase 8B) remains the git toplevel.** The `.git` directory is inside the repo folder, not at `cockpit-pro/`. Any future "flatten" phase that wants to promote `cockpit-pro/` to the git root requires explicit `.git` relocation (see §3.2 and §4 Phase-8 forbidden list). The Phase 8B rename was a folder-name change only, NOT a flatten: `.git/` moved with the folder via single-inode atomic `mv`.
2. **Outer-shell artifacts have ZERO tooling/config consumers inside `h2o-cp-source/` (UNLESS gated by an `H2O_*_DIR` env var).** Phase 7F (references/) + Phase 7G-1 (tmp/, plans/, s-files/, operator notes) all satisfy the strict zero-consumer constraint. Phase 8C introduced the env-var-gated variant for `archive/` (`H2O_ARCHIVE_DIR`): tooling consumers (`tools/archive/archive-one.mjs` via `ARCHIVE_DIR` import from `tools/paths.mjs`; `tools/archive/archive-snapshot.mjs` honors `H2O_ARCHIVE_DIR` independently because its SRC comes from `process.argv[2]`) resolve their target through the env override. A future Phase 7G-3 will apply the same pattern to `meta/` (`H2O_META_DIR`).
3. **Outer-shell artifacts are NOT backed up by the migration's off-disk-snapshot rule.** Because they live outside any git tree, they are not protected by `git revert` or any in-repo recovery. Operators are responsible for their own retention strategy for outer-shell content.
4. **Outer-shell additions do NOT require a `migration-phase-<id>-pre` tag.** Phase 7F is the convention-setting precedent: a phase that only moves content outside `h2o-source/` (and that has zero tracked-file diff) does not need a pre-tag, but it MUST still update §1 (phase table) and this §2 with the new outer-shell entry. Phase 7G-1 follows the same pattern (zero tracked-file diff except MIGRATION.md).
5. **Future outer-shell candidates** under active planning: `meta/` (Phase 7G-3 — `H2O_META_DIR` paths.mjs/commit-auto.mjs refactor). Resolved: `archive/` moved in Phase 8C (the `archive/.state/lastVersions.json` sentinel turned out to be untracked, so the move was clean). **Must stay inside** h2o-cp-source/: `node_modules/` (npm convention), `build/` (Phase 4C-B symlink bridge), `assets/` (build-critical icon packs), `artifacts/` (Phase 7D README-only placeholder), `.bump/` (release pipeline working dir; auto-recreated), `scripts/`, `supabase/`.

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

_Last updated: 2026-05-19 (Phase 8C complete — `archive/` (1.8 GB) moved out of the git repo into outer `cockpit-pro/archive/`, gated by new `H2O_ARCHIVE_DIR` env var. Tracked diff (2 files): `tools/paths.mjs::ARCHIVE_DIR` + `tools/archive/archive-snapshot.mjs::ARCHIVE_ROOT` now honor the env var (default unchanged when env absent). `tools/archive/archive-one.mjs` auto-picks up via its existing import. `tools/git/commit-auto.mjs` literals UNCHANGED (inert when archive is outside the repo). `archive/.state/lastVersions.json` was untracked + gitignored, so the move orphaned nothing. Real archive operation verified: `H2O_ARCHIVE_DIR=… npm run archive:snap` wrote 41 new snapshot files to outer location + updated lastVersions.json. Deterministic ext build hash `77bd47cf904c6e4b2b9062a90d8e2faaa62393d79eebfe2f105a217a64a46e8a` UNCHANGED. Validators: validate-loader-order exit 0; identity-3_9c exit 0; dev:check exit 1 (pre-existing archiveWorkbench drift, unchanged). **Operator setup**: add `export H2O_ARCHIVE_DIR=/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/archive` to shell rc, and propagate to `.vscode/tasks.json` task env blocks where `archive:*`/`ship*`/`release*` tasks run. Without the env var, archive tools recreate `archive/` inside h2o-cp-source on next invocation (still gitignored). **Carried operator items** (non-blocking, mostly unchanged from 8B): (1) reload all 8 H2O unpacked extensions in `chrome://extensions` from new paths `cockpit-pro/h2o-cp-source/build/chrome-ext-*` (IDs are key-derived since 8A-1 and unchanged); (2) confirm Cloudflare Pages dashboard "Root directory" still resolves; (3) if VS Code is open at the old path, reopen at `cockpit-pro/h2o-cp-source/`; (4) **NEW**: set `H2O_ARCHIVE_DIR` env (above). Future structural work — Phase 7G-3 (`H2O_META_DIR` + `meta/`), Studio web scaffold, packages/shared-library extraction, doc-comment cleanups (8B carry-over), 3_5b docs drift fix, h2o-source flatten — remain deferred.)._

