// @version 1.0.0
import fs from "node:fs";
import path from "node:path";

// Surface source and output paths (relative to repo root / build root)
export const IDENTITY_SURFACE_SOURCE_REL = path.join("surfaces", "identity");
export const IDENTITY_CORE_SCRIPT_REL = path.join("scripts", "0D4a.⬛️🔐 Identity Core 🔐.js");

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
  return path.join(String(srcRoot || ""), IDENTITY_CORE_SCRIPT_REL);
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
