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
// Today: `cockpit-pro/h2o-dev-server` is a SIBLING of `cockpit-pro/h2o-source`.
// Default resolution preserves this sibling layout. Env override:
// H2O_SERVER_DIR.
//
// AFTER PHASE 7 (absorb h2o-dev-server into the tree): the migration will
// either (a) update the default to a new in-tree path, or (b) require
// H2O_SERVER_DIR to be set explicitly. Until then, keep this default exactly
// as the existing tools compute it.

const SERVER_ROOT_DEFAULT = path.resolve(REPO_ROOT, "..", "h2o-dev-server");
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

export const ARCHIVE_DIR   = path.join(REPO_ROOT, "archive");
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
// The 6 chrome extension variants live under BUILD_DIR by convention:
//   - prod
//   - dev-controls
//   - dev-controls-oauth-google
//   - dev-lean (built on-demand by VS Code task)
//   - ops-panel
//   - studio-launcher
//   - desk
//
// Phase 4B-2 adds an OPT-IN alternate root via H2O_EXT_BUILD_ROOT. The
// default (unset) behavior is unchanged from Phase 0A-4B-1b: paths resolve
// to <BUILD_DIR>/chrome-ext-<variant>. When H2O_EXT_BUILD_ROOT is set, paths
// resolve to <H2O_EXT_BUILD_ROOT>/<variant> (no "chrome-ext-" prefix; bare
// variant directory directly under the custom root). Intended to support
// a future Phase 4C default flip to apps/extensions/chatgpt/chrome/, but
// not used by any default path or any built-in tool today. Highest-precedence
// override H2O_EXT_OUT_DIR continues to be honored by the build-context
// layer (chrome-live-build-context.mjs), which checks it BEFORE calling
// extensionBuildDir().

/**
 * Returns the on-disk path for a chrome extension build variant.
 *
 * Default (H2O_EXT_BUILD_ROOT unset):
 *   extensionBuildDir("prod") → "<repo>/build/chrome-ext-prod"
 *
 * Opt-in (H2O_EXT_BUILD_ROOT=/some/root):
 *   extensionBuildDir("prod") → "/some/root/prod"
 *
 * The env var is read at call time so callers can set/unset dynamically.
 * The "chrome-ext-" basename prefix is intentionally OMITTED in the opt-in
 * form — the new root is expected to be a chatgpt-extension-specific
 * subtree (e.g. apps/extensions/chatgpt/chrome/) where the prefix is
 * redundant.
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
  return path.join(BUILD_DIR, `chrome-ext-${variant}`);
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
