// tools/paths.mjs
//
// Central path registry for the Cockpit Pro repository.
//
// ─────────────────────────────────────────────────────────────────────────────
//  STATUS:  PHASE 0A (foundation only). This file is dead code from the
//           perspective of existing tools — nothing imports it yet. Existing
//           tools continue to compute paths via their own `path.resolve(...)`
//           literals. Phase 0B+ will migrate tools to import from here, one
//           tool at a time, with per-tool validation soak.
//
//  INTENT:  Provide a single source of truth for all repo-level paths so that
//           future folder moves (e.g. flattening h2o-source, absorbing
//           h2o-dev-server, restructuring apps/) become one-line edits in
//           this file instead of dozens of edits scattered across tools/.
//
//  RULES:   1. This file MUST NOT have side effects at import time. No
//              console.log, no filesystem reads, no fs.mkdirSync. Pure
//              constants and pure helper functions only.
//           2. Default path resolution MUST match the current behavior of
//              existing tools exactly. New consumers must observe byte-
//              identical paths after migration.
//           3. Env var overrides are the migration handle. Every tool that
//              currently honors an H2O_* env var continues to honor it; this
//              file just centralizes the defaulting.
//           4. No imports beyond node built-ins. This file must be importable
//              from every tool without dragging in dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─── Repository root ─────────────────────────────────────────────────────────
//
// This file lives at `<repo>/tools/paths.mjs`, so the repo root is one level
// up from HERE. Env override: H2O_SRC_DIR.
//
// Matches the default in: tools/loader/make-aliases.mjs (TOOL_DIR is
// `<repo>/tools/loader`, SRC_DEFAULT is `path.resolve(TOOL_DIR, "..", "..")`).
// From the loader subdir that's two dotdots; from here (one level shallower)
// it's one dotdot. Final resolved path is identical.

const REPO_ROOT_DEFAULT = path.resolve(HERE, "..");
export const REPO_ROOT = process.env.H2O_SRC_DIR || REPO_ROOT_DEFAULT;

// ─── Dev-server root ─────────────────────────────────────────────────────────
//
// Phase 5B (2026-05-17) absorbed the previously-sibling `cockpit-pro/h2o-dev-server`
// directory into `h2o-source/apps/dev-server/`. The directory now lives under
// git tracking (for the source: serve.py) with generated content
// (alias/, dev_output/) gitignored. The HTTP serving endpoint
// (http://127.0.0.1:5500) and the URL paths (/alias/..., /dev_output/...)
// are unchanged: serve.py still serves the current working directory and
// runs on port 5500 by default.
//
// H2O_SERVER_DIR env override is preserved for setups that want to point the
// server root elsewhere (e.g. external CI, alternate working trees).

const SERVER_ROOT_DEFAULT = path.join(REPO_ROOT, "apps", "dev-server");
export const SERVER_ROOT = process.env.H2O_SERVER_DIR || SERVER_ROOT_DEFAULT;

// ─── Top-level source directories ────────────────────────────────────────────

export const TOOLS_DIR     = path.join(REPO_ROOT, "tools");
export const SCRIPTS_DIR   = path.join(REPO_ROOT, "scripts");
export const SURFACES_DIR  = path.join(REPO_ROOT, "surfaces");
export const PACKAGES_DIR  = path.join(REPO_ROOT, "packages");
export const APPS_DIR      = path.join(REPO_ROOT, "apps");
export const CONFIG_DIR    = path.join(REPO_ROOT, "config");
export const BUILD_DIR     = path.join(REPO_ROOT, "build");
export const META_DIR      = path.join(REPO_ROOT, "meta");
export const DOCS_DIR      = path.join(REPO_ROOT, "docs");
export const SUPABASE_DIR  = path.join(REPO_ROOT, "supabase");
export const SHARED_DIR    = path.join(REPO_ROOT, "shared");
export const ASSETS_DIR    = path.join(REPO_ROOT, "assets");
export const CHANGELOGS_DIR = path.join(REPO_ROOT, "changelogs");

// ─── Generated / local-only directories ──────────────────────────────────────
//
// These are gitignored on disk but treated as canonical roots by the tooling.
// See .gitignore.
//
// Phase 8C (2026-05-19): ARCHIVE_DIR honors H2O_ARCHIVE_DIR env override,
// letting operators relocate the 1.8 GB daily-snapshots tree out of the git
// repo into the outer cockpit-pro/ workspace shell.
//
// Phase 8I-2 (2026-05-19): Default flipped from in-repo
// `<REPO_ROOT>/archive` to outer `<REPO_ROOT>/../archive`
// (cockpit-pro/archive/). Hard refusal added: if the resolved archive path
// lands inside REPO_ROOT, this module throws at import time so every tool
// that imports paths.mjs fails fast with a clear, actionable error. This is
// an intentional, narrowly-scoped exception to the "no side effects at
// import time" rule (see rules block at the top of this file) — throwing
// for misconfiguration is the desired behavior because it surfaces the
// problem loudly rather than silently writing to a wrong path. The throw
// fires ONLY when the resolved path is inside REPO_ROOT; in every normal
// configuration (env unset → outer default, env set to outer path) no throw
// fires and importing paths.mjs is a pure pass-through.
//
// Consumers (tools/archive/archive-one.mjs + tools/archive/archive-snapshot.mjs
// both now import ARCHIVE_DIR from here; previously archive-snapshot.mjs
// computed its own root with a different fallback, which was the root cause
// of the in-repo + outer duplicate-archive bug surfaced post-8C).

export const ARCHIVE_DIR = process.env.H2O_ARCHIVE_DIR
  || path.resolve(REPO_ROOT, "..", "archive");

{
  // Hard safety check — refuse any archive path inside the repo.
  const archiveAbs = path.resolve(ARCHIVE_DIR);
  const repoAbs = path.resolve(REPO_ROOT);
  const rel = path.relative(repoAbs, archiveAbs);
  const isInside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (isInside) {
    throw new Error(
      "[paths.mjs] Refusing to write archive inside repo.\n" +
      `  ARCHIVE_DIR = ${archiveAbs}\n` +
      `  REPO_ROOT   = ${repoAbs}\n` +
      "  Set H2O_ARCHIVE_DIR to a path OUTSIDE the repo (recommended: ../archive)."
    );
  }
}
export const ARTIFACTS_DIR = path.join(REPO_ROOT, "artifacts");
export const BUMP_DIR      = path.join(REPO_ROOT, ".bump");
export const TMP_DIR       = path.join(REPO_ROOT, "tmp");
export const PLANS_DIR     = path.join(REPO_ROOT, "plans");

// ─── Subdirectories of stable interest ───────────────────────────────────────

export const SURFACES_DESK_DIR     = path.join(SURFACES_DIR, "desk");
export const SURFACES_IDENTITY_DIR = path.join(SURFACES_DIR, "identity");
export const SURFACES_STUDIO_DIR   = path.join(SURFACES_DIR, "studio");

export const META_LEDGER_DIR   = path.join(META_DIR, "ledger");
export const META_REPORTS_DIR  = path.join(META_DIR, "reports");
export const META_NOTES_DIR    = path.join(META_DIR, "notes");

export const CONFIG_LOCAL_DIR  = path.join(CONFIG_DIR, "local");

// ─── Server-side runtime directories ─────────────────────────────────────────
//
// The dev HTTP server (h2o-dev-server/serve.py @ 127.0.0.1:5500) exposes these
// folders to the chrome-live loader at runtime. Generated by:
//   - tools/loader/make-aliases.mjs           → ALIAS_DIR
//   - tools/loader/make-ext-proxy-pack.mjs    → PROXY_PACK_FILE
//
// These paths MUST remain reachable from the dev server's static-file root.

export const ALIAS_DIR        = path.join(SERVER_ROOT, "alias");
export const DEV_OUTPUT_DIR   = path.join(SERVER_ROOT, "dev_output");
export const PROXY_DIR        = path.join(DEV_OUTPUT_DIR, "proxy");
export const PROXY_PACK_FILE  = path.join(PROXY_DIR, "_paste-pack.ext.txt");

// ─── Canonical config files ──────────────────────────────────────────────────

export const DEV_ORDER_TSV     = process.env.H2O_ORDER_FILE
  || path.join(CONFIG_DIR, "dev-order.tsv");
export const DEV_ORDER_JSON    = path.join(CONFIG_DIR, "dev-order.json");
export const DEV_ORDER_TXT     = path.join(CONFIG_DIR, "dev-order.txt");
export const LOADER_DEPS_JSON  = process.env.H2O_DEPS_FILE
  || path.join(CONFIG_DIR, "loader-deps.json");
export const LOADER_TIERS_JSON = process.env.H2O_TIERS_FILE
  || path.join(CONFIG_DIR, "loader-tiers.json");
export const SCRIPTS_LIST_TSV  = path.join(CONFIG_DIR, "scripts-list.tsv");
export const USERSCRIPT_HEADERS_TSV  = path.join(CONFIG_DIR, "userscript-headers.tsv");
export const USERSCRIPT_HEADERS_HTML = path.join(CONFIG_DIR, "userscript-headers.html");

// ─── Local-only state files (gitignored) ─────────────────────────────────────

export const IDENTITY_LOCAL_JSON = path.join(CONFIG_LOCAL_DIR, "identity-provider.local.json");
export const SUPABASE_LINK_JSON  = path.join(SUPABASE_DIR, ".temp", "linked-project.json");
export const SUPABASE_PROJECT_REF = path.join(SUPABASE_DIR, ".temp", "project-ref");

// ─── Release/versioning state ────────────────────────────────────────────────

export const VERSIONS_CSV       = path.join(REPO_ROOT, "versions.csv");
export const EDITS_CSV          = path.join(META_LEDGER_DIR, "edits.csv");
export const EDITS_V2_CSV       = path.join(META_LEDGER_DIR, "edits.v2.csv");
export const VERSIONS_LATEST_CSV = path.join(META_LEDGER_DIR, "versions-latest.csv");
export const VERSIONS_HTML       = path.join(META_REPORTS_DIR, "versions.html");
export const VERSIONS_MD         = path.join(META_REPORTS_DIR, "versions-latest.md");

// ─── Dev server URL ──────────────────────────────────────────────────────────
//
// CRITICAL: this URL is embedded into the chrome extension manifests'
// host_permissions and into the proxy pack's @require entries at BUILD time.
// Changing it requires a coordinated rebuild + reinstall of all dev extension
// variants. See docs/migration/MIGRATION.md §4 (#12) for the operational rule.

export const DEV_SERVER_HOST = process.env.H2O_DEV_SERVER_HOST || "127.0.0.1";
export const DEV_SERVER_PORT = Number(process.env.H2O_DEV_SERVER_PORT || 5500);
export const DEV_SERVER_URL  = process.env.H2O_DEV_SERVER_URL
  || `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`;

// Composed URLs (used by the loader and proxy-pack generator).
// PROXY_PACK_REL_PATH is the path portion only, useful when callers need
// to construct the URL against a non-default host.

export const PROXY_PACK_REL_PATH = "/dev_output/proxy/_paste-pack.ext.txt";
export const ALIAS_URL_REL_PATH  = "/alias";

export const PROXY_PACK_URL = process.env.H2O_EXT_PROXY_PACK_URL
  || `${DEV_SERVER_URL}${PROXY_PACK_REL_PATH}`;
export const ALIAS_URL_BASE = `${DEV_SERVER_URL}${ALIAS_URL_REL_PATH}`;

// ─── Build output helpers ────────────────────────────────────────────────────
//
// The chrome extension variants live under <REPO_ROOT>/apps/extensions/chatgpt/chrome/<variant>:
//   - prod
//   - dev-controls
//   - dev-controls-oauth-google
//   - dev-controls-armed
//   - dev-lean
//   - ops-panel
//   - studio-launcher
//   - desk
//
// Phase 4C-B (2026-05-17) flipped the default from the legacy
// <BUILD_DIR>/chrome-ext-<variant> form to the new
// <REPO_ROOT>/apps/extensions/chatgpt/chrome/<variant> form. The legacy
// paths remain as gitignored symlinks pointing at the new location to
// preserve Chrome extension IDs for already-loaded unpacked extensions.
// Both roots are gitignored (build/** and apps/extensions/chatgpt/chrome/**).
//
// Precedence (highest to lowest):
//   1. H2O_EXT_OUT_DIR        — checked in chrome-live-build-context.mjs
//                               (bypasses extensionBuildDir entirely)
//   2. H2O_EXT_BUILD_ROOT     — checked below; opt-in alternate root,
//                               returns <root>/<variant> (no chrome-ext- prefix)
//   3. legacy<->new default   — new path <REPO_ROOT>/apps/extensions/chatgpt/chrome/<variant>
//                               (post-4C-B)

/**
 * Returns the on-disk path for a chrome extension build variant.
 *
 * Default (H2O_EXT_BUILD_ROOT unset):
 *   extensionBuildDir("prod") → "<repo>/apps/extensions/chatgpt/chrome/prod"
 *
 * Opt-in (H2O_EXT_BUILD_ROOT=/some/root):
 *   extensionBuildDir("prod") → "/some/root/prod"
 *
 * The env var is read at call time so callers can set/unset dynamically.
 * The "chrome-ext-" basename prefix from the pre-4C-B legacy layout is no
 * longer emitted in either branch — both the default and the opt-in branch
 * use the bare variant directory name. The legacy <BUILD_DIR>/chrome-ext-*
 * paths remain on disk as symlinks pointing at the new locations so that
 * already-loaded Chrome unpacked extensions retain their load-path-derived
 * IDs.
 *
 * @param {string} variant - bare variant name (e.g. "prod", "dev-controls").
 *                           Do NOT include the "chrome-ext-" prefix.
 * @returns {string}
 */
export function extensionBuildDir(variant) {
  if (!variant || typeof variant !== "string") {
    throw new TypeError("extensionBuildDir: variant must be a non-empty string");
  }
  if (variant.startsWith("chrome-ext-")) {
    throw new Error(
      `extensionBuildDir: pass bare variant name, not the "chrome-ext-" prefix. Got: ${variant}`,
    );
  }
  const customRoot = process.env.H2O_EXT_BUILD_ROOT;
  if (customRoot) {
    return path.join(customRoot, variant);
  }
  return path.join(REPO_ROOT, "apps", "extensions", "chatgpt", "chrome", variant);
}

/**
 * Returns the on-disk path for a script in scripts/.
 * Thin convenience wrapper; the caller is responsible for providing the
 * full filename (emoji + extension included).
 *
 * @param {string} filename - e.g. "0A0a.⬛️🚀 Loader Bridge 🚀.user.js"
 * @returns {string}
 */
export function scriptFile(filename) {
  if (!filename || typeof filename !== "string") {
    throw new TypeError("scriptFile: filename must be a non-empty string");
  }
  return path.join(SCRIPTS_DIR, filename);
}

// ─── Defensive default-export note ───────────────────────────────────────────
//
// Intentionally NO default export. Named exports only, so consumers must
// import exactly what they need and migration grep across tools stays
// precise. If you need a single object for testing, build it at the call
// site:  `import * as paths from "../paths.mjs"; const obj = { ...paths };`
