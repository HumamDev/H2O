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
  // Only files OUTSIDE the SOURCE_ROOTS descriptor scans need to be
  // listed here. `.vscode/tasks.json` is currently the sole such case:
  // it's not under `tools/`, `surfaces/`, or `scripts/`, but is
  // tracked operator-facing source that should be archived alongside
  // the rest.
  ".vscode/tasks.json",
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
  ".git",
  "artifacts",
  "build",
  "cache",
  "node_modules",
  "tmp",
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
//                   Walks scripts/ if it exists and contains userscript-
//                   named files (S0A1a.* etc.), otherwise SRC itself.
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
// logic, in the same order, so the resulting candidate set was byte-
// equivalent. Phase 8I-4 swapped the second descriptor from `top-level
// surfaces/studio` to `recursive surfaces` to capture previously-missed
// source under surfaces/studio/{platform,store,ingestion}/ +
// surfaces/identity/ + the full surfaces/desk/ tree. Phase 8I-5 will
// extend this list further to add multi-host source roots
// (src/extensions/, packages/, apps/studio/mobile/src/, etc.) without
// changing the descriptor schema.

export const SOURCE_ROOTS = [
  { kind: "userscripts" },
  { kind: "recursive", root: SURFACES_REL },
  { kind: "recursive", root: TOOLS_REL },
  { kind: "explicit", files: ADDITIONAL_TRACKED_FILES },
];
