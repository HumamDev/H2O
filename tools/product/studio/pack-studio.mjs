// @version 2.0.0
import fs from "node:fs";
import path from "node:path";

export const ARCHIVE_WORKBENCH_SOURCE_REL = path.join("surfaces", "studio");
export const ARCHIVE_WORKBENCH_SOURCE_FILES = Object.freeze([
  "studio.html",
  "studio.css",
  "studio.js",
  "S0D3e. 🎬 Transcript Studio Host - Studio.js",

  "S0A2a. 🎬 Observer Hub - Studio.js",
  "S0A1a. 🎬 H2O Core - Studio.js",

  "S1A1a. 🎬 MiniMap Kernel - Studio.js",
  "S1A1f. 🎬 MiniMap Views - Studio.js",
  "S1A1e. 🎬 MiniMap Skin - Studio.js",
  "S1A1d. 🎬 MiniMap Shell - Studio.js",
  "S1A1b. 🎬 MiniMap Core - Studio.js",
  "S1A1c. 🎬 MiniMap Engine - Studio.js",

  "S3H1a. 🎬 Highlights Engine - Studio.js",
  "S1A3a. 🎬 Highlight Dots - Studio.js",
  "S1A2a. 🎬 Answer Wash Engine - Studio.js",
  "S1C1a. 🎬 Turn Title Bar - Studio.js",

  "S2A1a. 🎬 Question Wrapper - Studio.js",
  "S2B1a. 🎬 Quote Tracker - Studio.js",
  "S2C1a. 🎬 Question Wash Engine - Studio.js",

  "S1Z1a. 🎬 Answer Timestamp - Studio.js",
  "S2Z1a. 🎬 Question Timestamp - Studio.js",
  "S1X1a. 🎬 Answer Numbers - Studio.js",
]);
export const ARCHIVE_WORKBENCH_OUT_FILES = Object.freeze([
  "studio.html",
  "studio.css",
  "studio.js",
  "S0D3e. 🎬 Transcript Studio Host - Studio.js",

  "S0A2a. 🎬 Observer Hub - Studio.js",
  "S0A1a. 🎬 H2O Core - Studio.js",

  "S1A1a. 🎬 MiniMap Kernel - Studio.js",
  "S1A1f. 🎬 MiniMap Views - Studio.js",
  "S1A1e. 🎬 MiniMap Skin - Studio.js",
  "S1A1d. 🎬 MiniMap Shell - Studio.js",
  "S1A1b. 🎬 MiniMap Core - Studio.js",
  "S1A1c. 🎬 MiniMap Engine - Studio.js",

  "S3H1a. 🎬 Highlights Engine - Studio.js",
  "S1A3a. 🎬 Highlight Dots - Studio.js",
  "S1A2a. 🎬 Answer Wash Engine - Studio.js",
  "S1C1a. 🎬 Turn Title Bar - Studio.js",

  "S2A1a. 🎬 Question Wrapper - Studio.js",
  "S2B1a. 🎬 Quote Tracker - Studio.js",
  "S2C1a. 🎬 Question Wash Engine - Studio.js",

  "S1Z1a. 🎬 Answer Timestamp - Studio.js",
  "S2Z1a. 🎬 Question Timestamp - Studio.js",
  "S1X1a. 🎬 Answer Numbers - Studio.js",
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
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

export function archiveWorkbenchSourceDir(srcRoot) {
  return path.join(String(srcRoot || ""), ARCHIVE_WORKBENCH_SOURCE_REL);
}

export function getArchiveWorkbenchSourcePresence(srcRoot) {
  const dir = archiveWorkbenchSourceDir(srcRoot);
  return ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => fileExists(path.join(dir, name)));
}

export function archiveWorkbenchOutDir(outDir) {
  return path.join(String(outDir || ""), "surfaces", "studio");
}

export function getArchiveWorkbenchPresence(outDir) {
  const dir = archiveWorkbenchOutDir(outDir);
  return ARCHIVE_WORKBENCH_OUT_FILES.filter((name) => fileExists(path.join(dir, name)));
}

export function compareArchiveWorkbenchToSource(srcRoot, outDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcRoot);
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const files = ARCHIVE_WORKBENCH_SOURCE_FILES.map((sourceName, index) => {
    const outName = ARCHIVE_WORKBENCH_OUT_FILES[index];
    const sourcePath = path.join(sourceDir, sourceName);
    const outPath = path.join(outWorkbenchDir, outName);
    const sourceExists = fileExists(sourcePath);
    const outExists = fileExists(outPath);
    const equal = sourceExists && outExists ? readText(sourcePath) === readText(outPath) : false;
    return {
      name: outName,
      sourceName,
      outName,
      sourcePath,
      outPath,
      sourceExists,
      outExists,
      equal,
    };
  });

  return {
    sourceDir,
    outWorkbenchDir,
    files,
    matches: files.every((item) => item.sourceExists && item.outExists && item.equal),
  };
}

export function syncArchiveWorkbenchToOut(srcRoot, outDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcRoot);
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const missingSource = ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => !fileExists(path.join(sourceDir, name)));
  if (missingSource.length) {
    throw new Error(`archive workbench source missing: ${missingSource.join(", ")}`);
  }

  ensureDir(outWorkbenchDir);
  for (let index = 0; index < ARCHIVE_WORKBENCH_SOURCE_FILES.length; index += 1) {
    const sourceName = ARCHIVE_WORKBENCH_SOURCE_FILES[index];
    const outName = ARCHIVE_WORKBENCH_OUT_FILES[index];
    fs.copyFileSync(path.join(sourceDir, sourceName), path.join(outWorkbenchDir, outName));
  }

  return {
    sourceDir,
    outWorkbenchDir,
    files: ARCHIVE_WORKBENCH_OUT_FILES.slice(),
  };
}

export function removeArchiveWorkbenchFromOut(outDir) {
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const removed = [];
  for (const name of ARCHIVE_WORKBENCH_OUT_FILES) {
    if (removeFileIfPresent(path.join(outWorkbenchDir, name))) removed.push(name);
  }
  tryRemoveEmptyDir(outWorkbenchDir);
  tryRemoveEmptyDir(path.dirname(outWorkbenchDir));
  return {
    outWorkbenchDir,
    removed,
  };
}