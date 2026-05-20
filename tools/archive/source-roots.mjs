// tools/archive/source-roots.mjs
//
// Archive source-roots registry — single source of truth for what
// tools/archive/archive-snapshot.mjs scans when building daily snapshots.
//
// Phase 8I-3 (2026-05-19): extracted from archive-snapshot.mjs as a
// configuration module. Behavior is byte-equivalent to the pre-8I-3
// inlined definitions. The descriptor schema is intentionally minimal
// so that Phase 8I-5 (multi-host source roots — src/extensions/*,
// packages/*, apps/studio/{mobile,desktop}/*, config/, docs/) can extend
// it by appending descriptors to SOURCE_ROOTS without breaking 8I-3's
// contract.
//
// Phase 8I-4 (2026-05-19): the surfaces descriptor expanded from
// top-level-only `surfaces/studio/` to recursive `surfaces/`. This
// captures previously-missed source under surfaces/studio/{platform,
// store,ingestion}/ + surfaces/identity/* + the full surfaces/desk/*
// rather than just the 4 hardcoded entries. The 7 explicit
// surfaces/studio/* and surfaces/desk/* entries that used to live in
// ADDITIONAL_TRACKED_FILES were removed — they are now covered (and
// transparently deduped by uniqueSorted in archive-snapshot.mjs)
// through the recursive walk. The exclusion sets/patterns/dir-names
// from 8I-3 still apply, so generated `apps/extensions/*/<variant>/`
// trees, node_modules/, build/, etc. continue to be skipped even when
// they appear nested under any new root.
//
// Phase 8I-5 (2026-05-19): first true multi-platform archive-all
// coverage phase. Added recursive descriptors for every real
// source tree across the multi-host/multi-app system that 8G-2..8G-10
// established plus the Studio Mobile + Studio Desktop apps:
//   - src/extensions/             (multi-host extension source)
//   - packages/                   (shared workspace packages)
//   - apps/studio/mobile/{src,assets,__tests__,docs,scripts,ios,android}
//   - apps/studio/desktop/{src-tauri,build-tools,mac,windows}
//   - apps/dev-server/
//   - apps/site/{src,public}
// EXCLUDED_ARCHIVE_DIRS was extended with 10 new basenames that match
// generated/cache trees nested under those roots (Pods, .expo,
// .gradle, dist, target, WixTools, xcuserdata, alias, dev_output,
// schemas). Each new basename was verified to have ZERO tracked
// content in the repo (`git ls-files | grep "/<name>/"` returned 0)
// before being added, so the basename match is safe.
//
// Phase 8I-6 (2026-05-19): completed archive source coverage with
// project-wide config + docs + root tracked files:
//   - config/                     (recursive; loader-deps/loader-tiers
//                                  /dev-order.tsv + extension-keys.json
//                                  + config/extensions/<host>/<browser>/keys.json)
//   - docs/                       (recursive; architecture/decisions/
//                                  identity/migration/systems/validation MDs)
//   - root tracked files          (.gitignore, package.json,
//                                  package-lock.json — added to the
//                                  explicit descriptor alongside the
//                                  existing .vscode/tasks.json)
// EXCLUDED_ARCHIVE_DIRS gained one basename (`local`, for config/local/
// — verified zero tracked content). EXCLUDED_ARCHIVE_PATTERNS gained
// one pattern (`/^__codex-/` for config/__codex-*.json scratch files;
// gitignored at root .gitignore line 70).
//
// The chatgpt+chrome generated extension outputs under
// apps/extensions/<host>/<browser>/<variant>/ remain uncovered by any
// SOURCE_ROOTS descriptor and continue to be reproducible-only
// (Phase 8I-7 will add a hard-refusal guard against that path prefix
// specifically).
//
// This module is pure data + no side effects. Importing it does not read
// the filesystem or write anything. The collection functions
// (collectUserScripts, collectTopLevelFiles, collectRecursiveFiles) live
// in archive-snapshot.mjs and consume these constants as inputs.

// ─── Hardcoded explicit files ──────────────────────────────────────────────
//
// One-off files that don't fit any directory-scan pattern (different
// extension, different parent, etc.). Always considered candidates
// regardless of which scan rules apply. Preserved verbatim from the
// pre-8I-3 inlined ADDITIONAL_TRACKED_FILES literal.

export const ADDITIONAL_TRACKED_FILES = [
  // Phase 8I-4 (2026-05-19): the surfaces/studio/* and surfaces/desk/*
  // entries previously enumerated here were removed because they are
  // now covered by the recursive `surfaces/` descriptor in
  // SOURCE_ROOTS below. uniqueSorted() in archive-snapshot.mjs dedupes
  // the combined candidate list, so duplicates would have been
  // harmless — removing them keeps the registry honest about which
  // path is the canonical source of inclusion.
  //
  // Files listed here must be OUTSIDE the SOURCE_ROOTS descriptor scans.
  //
  // Phase 8I-6 (2026-05-19): added the 3 currently-tracked root files
  // (.gitignore, package.json, package-lock.json) alongside the existing
  // .vscode/tasks.json. README.md / eslint.config.js / tsconfig*.json
  // are NOT included because none exist at the repo root today (verified
  // via `git ls-files --error-unmatch`); add them here when/if they get
  // created.
  ".vscode/tasks.json",
  ".gitignore",
  "package.json",
  "package-lock.json",
];

// ─── Exclusion sets (basename-matched) ─────────────────────────────────────
//
// File names that are NEVER archived, regardless of which root they
// appear under.

export const EXCLUDED_ARCHIVE_NAMES = new Set([
  ".DS_Store",
]);

// Directory names that are NEVER recursed into. Match by basename, so
// e.g. ANY directory named "node_modules" anywhere in the tree is
// skipped along with its entire contents.

export const EXCLUDED_ARCHIVE_DIRS = new Set([
  // Phase 8I-3 baseline — VCS + cache + tooling output dirs
  ".git",
  "artifacts",
  "build",
  "cache",
  "node_modules",
  "tmp",
  // Phase 8I-5 additions — generated/cache trees nested under the
  // multi-platform source roots added in this phase. All verified to
  // have ZERO tracked content via `git ls-files | grep "/<name>/"`.
  ".expo",       // Expo CLI cache (apps/studio/mobile/.expo)
  ".gradle",     // Gradle daemon cache (apps/studio/mobile/android/.gradle)
  "Pods",        // CocoaPods install (apps/studio/mobile/ios/Pods)
  "alias",       // Dev-server generated symlink farm (apps/dev-server/alias)
  "dev_output",  // Dev-server generated proxy pack (apps/dev-server/dev_output)
  "dist",        // Generic frontend bundler output (apps/site/dist, apps/studio/desktop/dist, etc.)
  "schemas",     // Tauri capability schema codegen (apps/studio/desktop/src-tauri/gen/schemas)
  "target",      // Cargo build output (apps/studio/desktop/src-tauri/target)
  "WixTools",    // Windows installer toolchain downloads
  "xcuserdata",  // Xcode per-user state (apps/studio/mobile/ios/**/xcuserdata)
  // Phase 8I-6 addition — operator-only local config, gitignored.
  // Verified zero tracked content (`git ls-files | grep '/local/'`
  // returned 0). The basename match also defensively skips any other
  // future `local/` folder that operators might create.
  "local",       // Operator-local config (config/local/identity-provider.local.json)
  // Phase 8I-FINAL addition — Kotlin build cache (used by future
  // android/ prebuild). Already listed in apps/studio/mobile/.gitignore
  // line 13; verified zero tracked content.
  ".kotlin",
]);

// ─── Exclusion patterns (regex-matched against basename) ───────────────────
//
// Recursive scans skip any file whose basename matches any of these
// patterns. Preserved verbatim from the pre-8I-3 inline checks in
// collectRecursiveFiles:
//
//   if (entry.name.endsWith(".local.json") || /\.local\./i.test(entry.name)) continue;
//   if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;
//
// The four patterns below produce a byte-equivalent boolean result for
// every basename input.

export const EXCLUDED_ARCHIVE_PATTERNS = [
  /\.local\.json$/,    // *.local.json (preserves the original explicit endsWith check)
  /\.local\./i,        // *.local.* anywhere in name (case-insensitive)
  /^\.env$/,           // exact .env
  /^\.env\./,          // .env.local, .env.production, etc.
  // Phase 8I-4 (2026-05-19): macOS Finder Cmd+D duplicate files. These
  // are already gitignored at root (.gitignore lines 84-89: `* 2.js`,
  // `* 2.mjs`, `* 2.css`, `* 2.html`, `* 2.json`, `* 2.md`) but
  // archive-snapshot doesn't consult .gitignore. Without this pattern,
  // the recursive surfaces/ scan added in 8I-4 picked up
  // `surfaces/desk/desk 2.css` etc. as side effects of the Finder
  // duplication. The pattern below matches the same set the gitignore
  // does.
  / 2\.(js|mjs|css|html|json|md)$/,
  // Phase 8I-6 (2026-05-19): operator-scratch __codex-*.json files
  // produced by tooling experiments. Gitignored at root .gitignore
  // line 70 (`config/__codex-*.json`). The pattern matches any
  // file whose basename starts with `__codex-` so the recursive
  // config/ scan in 8I-6 skips them.
  /^__codex-/,
  // Phase 8I-6 (2026-05-19): operator-local test/scratch config files
  // gitignored at root .gitignore lines 71-75. The canonical tracked
  // counterparts are `config/dev-order.tsv` (NOT .json/.txt) and the
  // four tracked config JSONs (loader-deps.json, loader-tiers.json,
  // extension-keys.json, dev-order.tsv) — those remain archived. These
  // patterns hide ONLY the operator-local variants that were observed
  // to leak into the first 8I-6 run before this rule was added.
  /^userscript-headers\.(html|tsv)$/,    // root .gitignore lines 71-72
  /^dev-order\.(json|txt)$/,             // root .gitignore lines 73-74 (NB: dev-order.tsv stays tracked)
  /^scripts-list\.tsv$/,                 // root .gitignore line 75
  // Phase 8I-FINAL (2026-05-19): signing material and secrets. These
  // file types should never be archived no matter where they appear
  // in the tree. The same set is already gitignored under
  // apps/studio/mobile/.gitignore lines 15-19 (jks/p8/p12/key/
  // mobileprovision) + apps/studio/mobile/ios/.gitignore (keystore,
  // mobileprovision); this rule extends the guarantee globally so
  // a misplaced credential anywhere is structurally unarchivable.
  /\.keystore$/i,
  /\.jks$/i,
  /\.p8$/i,
  /\.p12$/i,
  /\.key$/i,
  /\.mobileprovision$/i,
  /\.cer$/i,
  /\.certSigningRequest$/i,
  /^GoogleService-Info\.plist$/,
];

// ─── Refused path prefixes (hard guard — last line of defense) ────────────
//
// Phase 8I-FINAL (2026-05-19): a belt-and-suspenders refusal layer that
// fires AFTER source-root collection. EXCLUDED_ARCHIVE_DIRS prevents
// recursive walks from entering generated/cache subdirs by basename;
// EXCLUDED_ARCHIVE_PATTERNS filters files by name pattern. This array
// catches a different class of error: a future SOURCE_ROOTS descriptor
// that accidentally includes one of these high-risk prefixes (e.g. a
// descriptor pointing at `apps/extensions/chatgpt/chrome/prod` would
// otherwise quietly archive 5+ MB of generated extension output).
//
// Match semantics: a relative path is refused if it equals a prefix
// (with trailing slash stripped) or starts with the prefix. The check
// is forward-slash normalized.
//
// Some entries (s-files/, operator-notes/, references/, plans/) point
// to folders that no longer exist inside h2o-cp-source/ (moved to outer
// cockpit-pro/ in Phase 7F/7G-1). Listing them anyway is defensive: if
// archive-snapshot is ever run with SRC pointing at the outer shell or
// a worktree where those folders accidentally appear, the guard fires.

export const REFUSED_ARCHIVE_PREFIXES = [
  // Generated extension outputs — reproducible from src/extensions/* +
  // tools/product/extensions/* builders. Hard-refusing this prefix is
  // the most important rule in the whole archive system: it ensures
  // the 5 MB+ chatgpt+chrome production extension is never archived.
  "apps/extensions/",
  // The archive itself cannot be archived (would self-recurse).
  "archive/",
  // Operator state and release-notes — outer-shell concerns post-8C/
  // Phase 8J. Refusing here prevents accidental archive even if a
  // future tool re-creates them in-repo.
  "meta/",
  "changelogs/",
  // Outer-shell content trees moved out of the repo in earlier phases
  // (7F + 7G-1 + 7G — references/, s-files/, operator-notes/, plans/).
  // If any reappear in-repo, refuse.
  "s-files/",
  "operator-notes/",
  "references/",
  "plans/",
  // Scratch / cache / generated trees that should never be archived.
  "tmp/",
  "cache/",
  "artifacts/",
];

// ─── Root path constants ───────────────────────────────────────────────────
//
// Repo-relative paths to specific scan roots. Kept as named constants so
// future migrations that relocate them are one-line edits here.

export const TOOLS_REL = "tools";

// Phase 8I-4 (2026-05-19): SURFACES_REL replaced the pre-8I-4
// STUDIO_SURFACES_REL = "surfaces/studio" constant. The recursive
// descriptor now scans all of `surfaces/` (studio/, desk/, identity/,
// and any future surfaces/<name>/). `surfaces/` is tracked source —
// it is NOT a generated output; the built chatgpt+chrome production
// extension's copy at apps/extensions/chatgpt/chrome/prod/surfaces/...
// is generated and stays excluded by the apps/extensions/** root-level
// .gitignore + by the absence of an `apps/extensions/` descriptor in
// SOURCE_ROOTS below (and will be hard-refused by a future 8I-7
// path-prefix guard).
export const SURFACES_REL = "surfaces";

// ─── Source-root descriptors ───────────────────────────────────────────────
//
// Each descriptor's `kind` selects which collection helper handles it
// inside archive-snapshot.mjs:
//
//   "userscripts" → collectUserScripts(SRC)
//                   Walks src-runtime-base/ if it exists and contains
//                   userscript-named files (S0A1a.* etc.), otherwise SRC
//                   itself. (Folder renamed from `scripts/` in Phase 8K-5;
//                   resolves through RUNTIME_BASE_REL.)
//   "top-level"   → collectTopLevelFiles(SRC, root)
//                   Returns direct child files of root (no recursion).
//   "recursive"   → collectRecursiveFiles(SRC, root)
//                   Full recursive walk; applies EXCLUDED_ARCHIVE_NAMES,
//                   EXCLUDED_ARCHIVE_DIRS, EXCLUDED_ARCHIVE_PATTERNS,
//                   skips symbolic links.
//   "explicit"    → returns descriptor.files verbatim
//                   (used for ADDITIONAL_TRACKED_FILES).
//
// Phase 8I-3 preserved the exact 4 descriptors from the inlined pre-8I-3
// logic. Phase 8I-4 swapped the second descriptor from `top-level
// surfaces/studio` to `recursive surfaces`. Phase 8I-5 extended this
// list with all real source trees across the multi-host/multi-app
// system, grouped semantically and ordered so each group is easy to
// extend in future phases:
//
//   1. Legacy chatgpt+chrome source (src-runtime-base/, surfaces/)
//   2. Multi-host extension source (src/extensions/)
//   3. Shared workspace packages (packages/)
//   4. Studio Mobile (src, assets, __tests__, docs, scripts, ios, android)
//   5. Studio Desktop (src-tauri, build-tools, mac, windows)
//   6. Dev server (apps/dev-server)
//   7. Marketing site (src, public)
//   8. Build tooling (tools/)
//   9. Explicit per-file inclusions
//
// Generated outputs are excluded structurally — not by per-root
// excludeSubdirs, but by EXCLUDED_ARCHIVE_DIRS basename matches that
// fire wherever those names appear (so node_modules/, target/, dist/,
// Pods/, .expo/, etc. are skipped inside any descriptor's walk). This
// approach avoids extending the descriptor schema while still being
// safe — every name in EXCLUDED_ARCHIVE_DIRS was verified to have zero
// tracked content before being added.

export const SOURCE_ROOTS = [
  // ── 1. Legacy chatgpt+chrome source ─────────────────────────────
  { kind: "userscripts" },                                  // src-runtime-base/*.user.js
  { kind: "recursive", root: SURFACES_REL },                // surfaces/{studio,desk,identity}/**

  // ── 2. Multi-host extension source (Phase 8G stubs) ─────────────
  { kind: "recursive", root: "src/extensions" },            // src/extensions/{<host>/<browser>,_shared}/**

  // ── 3. Shared workspace packages ────────────────────────────────
  { kind: "recursive", root: "packages" },                  // packages/*/

  // ── 4. Studio Mobile ────────────────────────────────────────────
  { kind: "recursive", root: "apps/studio/mobile/src" },          // TypeScript app source
  { kind: "recursive", root: "apps/studio/mobile/assets" },       // icons, fonts, splash images
  { kind: "recursive", root: "apps/studio/mobile/__tests__" },    // tests
  { kind: "recursive", root: "apps/studio/mobile/docs" },         // per-app docs
  { kind: "recursive", root: "apps/studio/mobile/scripts" },      // helper scripts (placeholder after 8H-5)
  { kind: "recursive", root: "apps/studio/mobile/ios" },          // managed-native iOS (Pods/, build/, xcuserdata/ skipped via EXCLUDED_ARCHIVE_DIRS)
  { kind: "recursive", root: "apps/studio/mobile/android" },      // placeholder after 8H-2 (only README.md present)

  // ── 5. Studio Desktop ───────────────────────────────────────────
  { kind: "recursive", root: "apps/studio/desktop/src-tauri" },   // Rust + Tauri config (target/, gen/schemas/, WixTools/ skipped)
  { kind: "recursive", root: "apps/studio/desktop/build-tools" }, // post-8H-3 build tooling (prepare-dist.mjs)
  { kind: "recursive", root: "apps/studio/desktop/mac" },         // future-native macOS placeholder
  { kind: "recursive", root: "apps/studio/desktop/windows" },     // future-native Windows placeholder

  // ── 6. Dev server ───────────────────────────────────────────────
  { kind: "recursive", root: "apps/dev-server" },                 // serve.py + READMEs (alias/, dev_output/ skipped)

  // ── 7. Marketing site ───────────────────────────────────────────
  { kind: "recursive", root: "apps/site/src" },                   // Vite source
  { kind: "recursive", root: "apps/site/public" },                // static assets

  // ── 8. Project-wide config + docs (Phase 8I-6) ──────────────────
  // config/ — loader-deps.json, loader-tiers.json, dev-order.tsv,
  // extension-keys.json, config/extensions/<host>/<browser>/keys.json,
  // config/extensions/README.md. The recursive walk skips:
  //   - config/local/   (operator state; basename `local` in
  //                      EXCLUDED_ARCHIVE_DIRS; also `*.local.*` and
  //                      `*.local.json` in EXCLUDED_ARCHIVE_PATTERNS)
  //   - config/__codex-*.json  (tooling-scratch; `^__codex-` in
  //                              EXCLUDED_ARCHIVE_PATTERNS)
  //   - config/dev-order.{json,txt} + config/scripts-list.tsv +
  //     config/userscript-headers.{html,tsv}  (none tracked today, all
  //     gitignored at root; if any appear on disk they have no version
  //     marker so they'd be silently skipped regardless)
  { kind: "recursive", root: "config" },
  // docs/ — architecture, decisions, identity, migration, systems,
  // validation MDs. Most files lack `@version` markers and will be
  // silently skipped (the version-marker requirement is the snapshot
  // anti-flood mechanism). Files with a `"version":` JSON field
  // (none in docs today) would be archived; future MDs that gain
  // explicit `@version` headers would also flow through.
  { kind: "recursive", root: "docs" },

  // ── 9. Build tooling ────────────────────────────────────────────
  { kind: "recursive", root: TOOLS_REL },                         // tools/** (sha256 fallback enabled for this root)

  // ── 10. Explicit per-file inclusions ────────────────────────────
  // .vscode/tasks.json + root files (.gitignore, package.json,
  // package-lock.json) — none are under any other root, so they need
  // to be listed explicitly here.
  { kind: "explicit", files: ADDITIONAL_TRACKED_FILES },
];
