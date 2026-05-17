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
| **7C** — Phase 7B closeout verification | ✅ complete | `migration-phase-7C-complete` | (this commit) | **VERIFICATION + DOC-ONLY closeout.** Confirmed: 7B commit `65d6e70` pushed; 4 Category-A files have zero operator-facing stale paths (the one remaining `apps/studio-desktop` ref in `prepare-dist.mjs:53` is the Phase 6B historical doc-comment, intentionally preserved). Total repo-wide stale ref counts dropped: `apps/studio-desktop` 4→2, `apps/studio-mobile` 23→22. All remaining refs (40+) are in safe-to-leave categories (validator content checks, symlink-bridge users, historical Phase 5.0X docs, MIGRATION narrative, intentional package-name divergences). 5 canonical paths active. All validators pass: dev:check, validate-loader-order, deterministic ext build hash matches Phase 0J baseline `edf2baa…7af772` (**21 consecutive phase boundaries stable**), studio-desktop prepare-dist, studio-mobile tsc + workspace-selector, site builds (`-w` + `cd`). 0 tracked build/cache artifacts under any of the 13 inspected paths. **Migration is paused safely at this checkpoint.** |

**Latest stabilized checkpoint**: `migration-phase-7C-complete` (this phase). The `apps/` consolidation arc + the post-migration hygiene pass are both fully closed. This is the recommended long-term pause point for the migration. Future structural work (Studio web scaffold, packages/shared-library extraction, h2o-source flatten, historical identity-docs cleanup) is intentionally deferred — each can be evaluated independently against this baseline whenever operator priorities call for them.

---

## 2. Repo Topology (as of 2026-05-17, post Phase 6C-3)

```
/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/   ← NOT a git repo
└── h2o-source/                                           ← THE git repo
    ├── .git/                                             ← git toplevel
    ├── apps/
    │   ├── dev-server/   serve.py (CORS + no-cache @ 127.0.0.1:5500); alias/ + dev_output/ gitignored
    │   ├── extensions/chatgpt/chrome/  8 chrome extension variant outputs (gitignored)
    │   │                              prod, dev-controls, dev-controls-armed,
    │   │                              dev-controls-oauth-google, dev-lean,
    │   │                              ops-panel, studio-launcher, desk
    │   ├── site/             standalone Vite/TS marketing site (pkg name `cockpit-pro-site`)
    │   └── studio/
    │       ├── desktop/      Tauri V2 desktop shell (pkg name `@h2o/studio-desktop`)
    │       └── mobile/       Expo SDK 55 React Native app (pkg name `studio-mobile`)
    ├── archive/      55+ daily snapshots  (gitignored; local only)
    ├── artifacts/    (gitignored; local only)
    ├── assets/       icons + PNGs  (gitignored; local only — surprising)
    ├── build/        only chrome-ext-* symlinks → apps/extensions/chatgpt/chrome/* (gitignored)
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

> **Phase 1B note**: the outer `cockpit-pro/apps/` cruft directory (`.DS_Store` files only) was deleted in Phase 1B.
>
> **Phase 5B note**: the outer-sibling `cockpit-pro/h2o-dev-server/` was absorbed into `h2o-source/apps/dev-server/`. The outer `cockpit-pro/` now contains only `h2o-source/`.

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

_Last updated: 2026-05-17 (Phase 7C complete — migration paused safely at the post-hygiene stable checkpoint. Phase 7A audited ~50 files of stale-path references and classified into 8 categories; Phase 7B `65d6e70` fixed the 9 must-fix operator-facing line edits across 4 Category-A files; Phase 7C (this commit) verified all remaining refs are intentionally kept (validator content checks, symlink-bridge users, historical Phase 5.0X docs, MIGRATION narrative, intentional package-name divergences). Deterministic ext build hash `edf2baa…7af772` stable across **21 consecutive phase boundaries** (0J→2B→2D→3B→3D→3E→4B-1→4B-1b→4B-2→4C-B→4C-C→5B→5C→6B→6B-C→6C-1→6C-3→6C-4→6Z→7B→7C). Future structural moves (apps/studio/web, packages/shared-library, h2o-source flatten, historical identity-docs cleanup) are deferred. **Carried operator items** (non-blocking): (1) reload H2O unpacked extensions in `chrome://extensions` from legacy `build/chrome-ext-*` symlink paths; (2) confirm Cloudflare Pages dashboard "Root directory" reads `apps/site`.)._
