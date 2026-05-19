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
  "surfaces/studio/studio.css",
  "surfaces/studio/studio.html",
  "surfaces/studio/studio.js",

  "surfaces/desk/desk.css",
  "surfaces/desk/desk.html",
  "surfaces/desk/desk.js",
  "surfaces/desk/page-bridge.js",

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
];

// ─── Root path constants ───────────────────────────────────────────────────
//
// Repo-relative paths to specific scan roots. Kept as named constants so
// future migrations that relocate them are one-line edits here.

export const TOOLS_REL = "tools";
export const STUDIO_SURFACES_REL = "surfaces/studio";

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
// Phase 8I-3 preserves the exact 4 descriptors from the inlined pre-8I-3
// logic, in the same order, so the resulting candidate set is byte-
// equivalent. Phase 8I-5 will extend this list to add multi-host
// source roots (src/extensions/, packages/, apps/studio/mobile/src/, etc.)
// without changing the descriptor schema.

export const SOURCE_ROOTS = [
  { kind: "userscripts" },
  { kind: "top-level", root: STUDIO_SURFACES_REL },
  { kind: "recursive", root: TOOLS_REL },
  { kind: "explicit", files: ADDITIONAL_TRACKED_FILES },
];
