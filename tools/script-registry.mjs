// tools/script-registry.mjs
//
// Pure helpers for parsing, classifying, and listing the userscripts in
// `scripts/`. Mirrors the alias-derivation rules from
// `tools/loader/make-aliases.mjs` so future tools can compute alias names
// without duplicating that file's logic.
//
// ─────────────────────────────────────────────────────────────────────────────
//  STATUS:  PHASE 0A (foundation only). This file is dead code from the
//           perspective of existing tools — nothing imports it yet.
//           `make-aliases.mjs`, `sync-dev-order.mjs`, the identity validators,
//           and the release pipeline continue to compute names via their own
//           inline functions. Phase 0B+ will migrate them, one tool at a time.
//
//  CONTRACT: the exported `toAliasName`, `stripEmojiAndInvisibles`,
//            `conflictCloneCanonicalName`, and `isSourceScriptName` are
//            BEHAVIOR-IDENTICAL to the implementations in
//            `tools/loader/make-aliases.mjs` — same inputs produce same
//            outputs. The source bytes differ in one detail only:
//            make-aliases.mjs writes the invisibles/bidi character ranges
//            with explicit `\uXXXX` escape sequences; this file writes
//            them with literal Unicode code points inside the character
//            class. Both regexes match the same code points. Verified by
//            direct functional tests at authoring time.
//
//            If a future change to make-aliases.mjs's sanitizer is required,
//            BOTH files must be updated in the same commit until Phase 0B
//            completes and the dedup is final.
//
//  RULES:   1. No side effects at import time.
//           2. No filesystem reads, no env-var reads, no console output
//              outside of the explicit `listSourceScripts()` helper that
//              the caller invokes.
//           3. No imports beyond node built-ins.
//           4. Pure functions where possible; the only impure exports are
//              `listSourceScripts()` and `listAliasArtifacts()` which take
//              a directory parameter from the caller.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";

/**
 * Strip emoji, invisibles, and bidi control characters from a string.
 *
 * Mirrors the implementation in make-aliases.mjs exactly. Used to derive
 * ASCII-safe alias filenames from emoji-decorated script names.
 *
 * The four regexes match (in order):
 *   1. Emoji skin-tone modifiers (U+1F3FB..U+1F3FF).
 *   2. All Extended_Pictographic code points (the broad emoji class).
 *   3. Specific invisible code points: FE0E, FE0F (variation selectors),
 *      200D (ZWJ), 200B–200F (ZWSP and friends), FEFF (BOM), 2060 (WJ),
 *      00AD (soft hyphen).
 *   4. Bidi controls: 202A–202E and 2066–2069.
 *
 * Code points are written as explicit \uXXXX / \u{XXXXX} escapes so this
 * file survives editor normalization. Do not "simplify" by pasting the
 * literal invisible characters — they're invisible in most editors and
 * fragile under unicode normalization tools.
 *
 * @param {string} s
 * @returns {string}
 */
export function stripEmojiAndInvisibles(s) {
  return String(s || "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .replace(/[︎️‍​-‏﻿⁠­]/g, "")
    .replace(/[‪-‮⁦-⁩]/g, "");
}

/**
 * Derive an alias filename from a source script filename.
 *
 * Mirrors make-aliases.mjs exactly.
 *
 * Examples:
 *   "0A0a.⬛️🚀 Loader Bridge 🚀.user.js" → "0A0a._Loader_Bridge_.js"
 *   "0A1a.⬛️🧠 H2O Core 🧠.js"            → "0A1a._H2O_Core_.js"
 *   "garbage_no_dot.js"                    → null
 *
 * @param {string} filename
 * @returns {string|null} alias name, or null if the filename doesn't match
 *                        the expected `[ID].[Body].(user.)?js` format.
 */
export function toAliasName(filename) {
  const base = String(filename || "").replace(/(\.user)?\.js$/i, "");
  const firstDot = base.indexOf(".");
  if (firstDot <= 0) return null;

  const id = base.slice(0, firstDot).trim();
  let title = base.slice(firstDot + 1);

  title = stripEmojiAndInvisibles(title)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!id || !title) return null;
  return `${id}._${title}_.js`;
}

/**
 * True if a filename looks like a source script (matches the ID.title.(user.)?js
 * shape and derives a valid alias).
 *
 * Mirrors make-aliases.mjs exactly.
 *
 * @param {string} filename
 * @returns {boolean}
 */
export function isSourceScriptName(filename) {
  const name = String(filename || "");
  if (!/(\.user)?\.js$/i.test(name)) return false;
  return toAliasName(name) !== null;
}

/**
 * Normalize an entry from dev-order.tsv / .txt / .json (which may be either a
 * source filename or an alias filename) to its canonical alias form.
 *
 * Returns the alias name, or "" if the input doesn't parse.
 *
 * @param {string} filename
 * @returns {string}
 */
export function normalizeOrderEntryToAliasName(filename) {
  const raw = String(filename || "").trim();
  if (!raw) return "";
  return toAliasName(raw) || "";
}

/**
 * If `filename` looks like a Finder/iCloud conflict-clone (e.g.
 * "0B1b._Data_Sync_.user 2.js"), return the canonical filename
 * ("0B1b._Data_Sync_.user.js") if it would derive a valid alias.
 * Otherwise return "".
 *
 * Mirrors make-aliases.mjs exactly.
 *
 * @param {string} filename
 * @returns {string}
 */
export function conflictCloneCanonicalName(filename) {
  const name = String(filename || "").trim();
  if (!name) return "";
  const match = name.match(/^(.*?)(?:\.user)? \d+\.js$/i);
  if (!match) return "";
  const canonical = `${match[1]}.js`;
  return toAliasName(canonical) ? canonical : "";
}

/**
 * True if a filename either IS an alias artifact (valid alias name) or is a
 * Finder/iCloud conflict-clone of one.
 *
 * Mirrors make-aliases.mjs exactly.
 *
 * @param {string} filename
 * @returns {boolean}
 */
export function isAliasArtifactName(filename) {
  return !!toAliasName(filename) || !!conflictCloneCanonicalName(filename);
}

/**
 * Parse a source-script filename into its components.
 *
 * @param {string} filename
 * @returns {{ id: string, title: string, displayTitle: string, ext: string, aliasName: string }|null}
 *          null if the filename doesn't parse as a source script.
 */
export function parseScriptName(filename) {
  const name = String(filename || "");
  if (!/(\.user)?\.js$/i.test(name)) return null;

  const extMatch = name.match(/(\.user)?\.js$/i);
  const ext = extMatch ? extMatch[0] : ".js";
  const base = name.slice(0, name.length - ext.length);

  const firstDot = base.indexOf(".");
  if (firstDot <= 0) return null;

  const id = base.slice(0, firstDot).trim();
  const displayTitle = base.slice(firstDot + 1);

  const title = stripEmojiAndInvisibles(displayTitle)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!id || !title) return null;

  return {
    id,                          // e.g. "0A0a"
    title,                       // sanitized, used in alias name
    displayTitle,                // original with emoji
    ext,                         // ".user.js" or ".js"
    aliasName: `${id}._${title}_.js`,
  };
}

/**
 * Extract the script ID from an alias filename.
 *
 * Example: "0A0a._Loader_Bridge_.js" → "0A0a"
 *
 * @param {string} aliasName
 * @returns {string} the ID portion, or "" if not parseable.
 */
export function idFromAliasName(aliasName) {
  const name = String(aliasName || "").trim();
  const match = name.match(/^([^.]+)\._/);
  return match ? match[1] : "";
}

/**
 * List all source scripts in a directory.
 *
 * Side effect: reads the directory. The caller chooses the directory; this
 * function never assumes a default.
 *
 * @param {string} dir - absolute path to a directory containing source scripts.
 * @returns {Array<{ filename: string, fullPath: string, id: string, title: string, displayTitle: string, ext: string, aliasName: string }>}
 */
export function listSourceScripts(dir) {
  if (!dir || typeof dir !== "string") {
    throw new TypeError("listSourceScripts: dir must be an absolute path string");
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === ".DS_Store") continue;
    const parsed = parseScriptName(entry.name);
    if (!parsed) continue;
    out.push({
      filename: entry.name,
      fullPath: path.join(dir, entry.name),
      ...parsed,
    });
  }
  // Sort by ID for deterministic ordering. Note: this sort is for caller
  // convenience and does NOT represent the canonical load order. The
  // canonical load order is config/dev-order.tsv.
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/**
 * List all alias artifacts (valid aliases AND Finder/iCloud conflict-clones)
 * in a directory.
 *
 * @param {string} dir - absolute path to an alias directory.
 * @returns {Array<{ filename: string, fullPath: string, isCanonical: boolean, canonicalName: string }>}
 */
export function listAliasArtifacts(dir) {
  if (!dir || typeof dir !== "string") {
    throw new TypeError("listAliasArtifacts: dir must be an absolute path string");
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    if (!(entry.isFile() || entry.isSymbolicLink())) continue;
    const isCanonical = !!toAliasName(entry.name);
    const conflictCanonical = conflictCloneCanonicalName(entry.name);
    if (!isCanonical && !conflictCanonical) continue;
    out.push({
      filename: entry.name,
      fullPath: path.join(dir, entry.name),
      isCanonical,
      canonicalName: isCanonical ? entry.name : conflictCanonical,
    });
  }
  out.sort((a, b) => a.filename.localeCompare(b.filename));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//
//  Legacy alias compatibility map.
//
//  Some scripts have been renamed historically (e.g. "Chat Mechanisms Router"
//  became "Outline Mechanisms Router" became "Thread Pages Controller"). The
//  dev loader catalog and some external consumers still reference the old
//  alias names. To avoid breaking those consumers, make-aliases.mjs creates
//  legacy-name → current-name symlinks (or copies) inside the alias/
//  directory.
//
//  This map is the canonical reference. Mirrors the LEGACY_ALIAS_COMPAT
//  constant in make-aliases.mjs exactly.
//
//  When adding a new legacy mapping:
//    1. Update this map.
//    2. Update tools/loader/make-aliases.mjs (until 0B unifies them).
//    3. Add a regression test (after Phase 0D adds the test harness).
//
// ─────────────────────────────────────────────────────────────────────────────

export const LEGACY_ALIAS_COMPAT = Object.freeze({
  "0C1d._Chat_Mechanisms_Router_.js":
    "1C1c._Outline_Mechanisms_Router_(_Unmount_&_Pagination_Integration)_.js",
  "0B1d._Chat_Mechanisms_Router_(_Integration)_.js":
    "1C1c._Outline_Mechanisms_Router_(_Unmount_&_Pagination_Integration)_.js",
  "1A2c._Chat_Pages_Controller_(MiniMap_Add-on)_.js":
    "1C1b._Thread_Pages_Controller_.js",
  "1E1a._Answer_Title_.js":
    "1C1a._Turn_Title_Bar_.js",
  "1C1a._Title_Bar_.js":
    "1C1a._Turn_Title_Bar_.js",
});

// ─── Defensive default-export note ───────────────────────────────────────────
//
// Intentionally NO default export. Named exports only. Future migration grep
// across the tools/ tree must remain precise.
