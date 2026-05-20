// @version 1.4.0  (Phase 8L-5: surface source folder renamed to src-surfaces-base/)
import fs from "node:fs";
import path from "node:path";

// Phase 8K-5: the identity-core constant is used in TWO different contexts:
// (a) reading from SOURCE — `identityCoreScriptSrc(srcRoot)` — must resolve
//     under the legacy runtime base folder, which the 8K-5 rename moved
//     from `scripts/` to `src-runtime-base/`. Uses RUNTIME_BASE_REL.
// (b) writing to OUTPUT BUNDLE — `identityCoreScriptOut(outDir)` — must
//     resolve under the bundle's `scripts/` subdir, because the
//     packaged extension's `surfaces/identity/identity.html` references
//     `../../scripts/0D4a...` (Chrome extension layout convention,
//     decoupled from the source-folder rename).
// Pre-8K-4 both paths happened to share the same literal "scripts" so a
// single constant sufficed; post-8K-5 they diverge.
//
// Phase 8L-4: SURFACES_BASE_REL extends the same split to the identity
// surface (identity.html/css/js). Source-side reads route through
// SURFACES_BASE_REL; bundle-output writes and web_accessible_resources
// keep the literal "surfaces/identity" (Chrome extension layout +
// chrome.runtime.getURL contract).
import { RUNTIME_BASE_REL, SURFACES_BASE_REL } from "../../paths.mjs";

// Identity-core script basename — load-bearing constant referenced by name
// across the identity validator suite.
const IDENTITY_CORE_SCRIPT_BASENAME = "0D4a.⬛️🔐 Identity Core 🔐.js";

// Phase 8L-5: source-side surface path. Post-rename resolves to
// "src-surfaces-base/identity". The bundle output path stays literal
// "surfaces/identity" via identitySurfaceOutDir() below (Chrome extension
// layout + chrome.runtime.getURL contract).
export const IDENTITY_SURFACE_SOURCE_REL = path.join(SURFACES_BASE_REL, "identity");

// IDENTITY_CORE_SCRIPT_REL retains its pre-8K-5 value ("scripts/<basename>")
// because its primary external use is as the BUNDLE OUTPUT relative path
// (the packaged extension's scripts/ subdir). Source-side consumers use
// `identityCoreScriptSrc()` which routes through RUNTIME_BASE_REL.
export const IDENTITY_CORE_SCRIPT_REL = path.join("scripts", IDENTITY_CORE_SCRIPT_BASENAME);

const IDENTITY_SURFACE_FILES = Object.freeze([
  "identity.html",
  "identity.css",
  "identity.js",
]);

// Web-accessible entry for window.open('chrome-extension://…/surfaces/identity/identity.html')
// from the chatgpt.com content script context.
export const IDENTITY_WEB_ACCESSIBLE_ENTRY = Object.freeze({
  resources: ["surfaces/identity/identity.html"],
  matches: ["https://chatgpt.com/*"],
});

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function removeFileIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}

function tryRemoveEmptyDir(dirPath) {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    if ((fs.readdirSync(dirPath) || []).length > 0) return false;
    fs.rmdirSync(dirPath);
    return true;
  } catch {
    return false;
  }
}

export function identitySurfaceSourceDir(srcRoot) {
  return path.join(String(srcRoot || ""), IDENTITY_SURFACE_SOURCE_REL);
}

export function identitySurfaceOutDir(outDir) {
  return path.join(String(outDir || ""), "surfaces", "identity");
}

export function identityCoreScriptSrc(srcRoot) {
  // Phase 8K-5: source path uses RUNTIME_BASE_REL (post-rename
  // "src-runtime-base/"); diverges from IDENTITY_CORE_SCRIPT_REL which is
  // bundle-output-relative ("scripts/").
  return path.join(String(srcRoot || ""), RUNTIME_BASE_REL, IDENTITY_CORE_SCRIPT_BASENAME);
}

export function identityCoreScriptOut(outDir) {
  return path.join(String(outDir || ""), IDENTITY_CORE_SCRIPT_REL);
}

export function getIdentitySurfaceSourcePresence(srcRoot) {
  const dir = identitySurfaceSourceDir(srcRoot);
  return IDENTITY_SURFACE_FILES.filter((name) => fileExists(path.join(dir, name)));
}

/**
 * Copy identity surface files and the Identity Core script into the extension build output.
 * Called unconditionally for both lean and controls builds.
 *
 * Final layout:
 *   {outDir}/surfaces/identity/identity.html
 *   {outDir}/surfaces/identity/identity.css
 *   {outDir}/surfaces/identity/identity.js
 *   {outDir}/scripts/0D4a.⬛️🔐 Identity Core 🔐.js
 *
 * The ../../scripts/… reference in identity.html resolves correctly with this layout.
 */
export function syncIdentitySurfaceToOut(srcRoot, outDir) {
  const srcSurfaceDir = identitySurfaceSourceDir(srcRoot);
  const outSurfaceDir = identitySurfaceOutDir(outDir);

  const missingSurface = IDENTITY_SURFACE_FILES.filter((name) => !fileExists(path.join(srcSurfaceDir, name)));
  if (missingSurface.length) {
    throw new Error(`[H2O Identity] identity surface source missing: ${missingSurface.join(", ")}`);
  }

  const srcScript = identityCoreScriptSrc(srcRoot);
  if (!fileExists(srcScript)) {
    throw new Error(`[H2O Identity] identity core script missing: ${srcScript}`);
  }

  ensureDir(outSurfaceDir);
  for (const name of IDENTITY_SURFACE_FILES) {
    fs.copyFileSync(path.join(srcSurfaceDir, name), path.join(outSurfaceDir, name));
  }

  // The script goes into {outDir}/scripts/ so that identity.html's ../../scripts/… ref resolves.
  const outScriptsDir = path.join(outDir, "scripts");
  ensureDir(outScriptsDir);
  fs.copyFileSync(srcScript, identityCoreScriptOut(outDir));

  return {
    outSurfaceDir,
    outScriptsDir,
    files: IDENTITY_SURFACE_FILES.slice(),
  };
}

export function removeIdentitySurfaceFromOut(outDir) {
  const outSurfaceDir = identitySurfaceOutDir(outDir);
  const removed = [];
  for (const name of IDENTITY_SURFACE_FILES) {
    if (removeFileIfPresent(path.join(outSurfaceDir, name))) removed.push(name);
  }
  tryRemoveEmptyDir(outSurfaceDir);
  tryRemoveEmptyDir(path.dirname(outSurfaceDir));
  removeFileIfPresent(identityCoreScriptOut(outDir));
  return { outSurfaceDir, removed };
}
