// @version 1.0.1  (Phase 4B-1: extension build dirs sourced from paths.extensionBuildDir)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveWorkbenchSourceDir,
  compareArchiveWorkbenchToSource,
  getArchiveWorkbenchSourcePresence,
  getArchiveWorkbenchPresence,
  ARCHIVE_WORKBENCH_SOURCE_FILES,
} from "../product/studio/pack-studio.mjs";
import { extensionBuildDir } from "../paths.mjs";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");

function resolveEnvDefaults() {
  const srcDir = path.resolve(process.env.H2O_SRC_DIR || REPO_ROOT);
  const orderFile = path.resolve(process.env.H2O_ORDER_FILE || path.join(srcDir, "config", "dev-order.tsv"));
  // Phase 5B (2026-05-17): default moved from `../h2o-dev-server` (sibling)
  // to `apps/dev-server` (in-tree). H2O_SERVER_DIR override preserved.
  const serverDir = path.resolve(process.env.H2O_SERVER_DIR || path.join(srcDir, "apps", "dev-server"));
  return { srcDir, orderFile, serverDir };
}

function isUserScriptName(name) {
  return /(\.user)?\.js$/i.test(String(name || ""));
}

function listTopLevelUserScripts(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && isUserScriptName(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

function pickUserScriptDir(srcDir) {
  const scriptsDir = path.join(srcDir, "scripts");
  let scriptsCount = 0;
  let scriptsDirExists = false;

  try {
    scriptsDirExists = fs.existsSync(scriptsDir) && fs.statSync(scriptsDir).isDirectory();
    if (scriptsDirExists) {
      scriptsCount = listTopLevelUserScripts(scriptsDir).length;
    }
  } catch {
    scriptsDirExists = false;
    scriptsCount = 0;
  }

  return {
    scriptsDir,
    scriptsDirExists,
    scriptsCount,
    chosenDir: scriptsCount > 0 ? scriptsDir : srcDir,
  };
}

function checkReadable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function inspectAliasDir(aliasDir) {
  if (!fs.existsSync(aliasDir) || !fs.statSync(aliasDir).isDirectory()) {
    return {
      exists: false,
      aliasCount: 0,
      symlinkCount: 0,
      brokenSymlinks: [],
    };
  }

  const brokenSymlinks = [];
  let aliasCount = 0;
  let symlinkCount = 0;

  for (const entry of fs.readdirSync(aliasDir, { withFileTypes: true })) {
    if (!(entry.isFile() || entry.isSymbolicLink())) continue;
    if (!isUserScriptName(entry.name)) continue;

    aliasCount++;
    if (!entry.isSymbolicLink()) continue;

    symlinkCount++;
    const aliasPath = path.join(aliasDir, entry.name);
    try {
      const rawTarget = fs.readlinkSync(aliasPath);
      const resolvedTarget = path.resolve(aliasDir, rawTarget);
      if (!fs.existsSync(resolvedTarget)) {
        brokenSymlinks.push({
          alias: entry.name,
          rawTarget,
          resolvedTarget,
        });
      }
    } catch (error) {
      brokenSymlinks.push({
        alias: entry.name,
        rawTarget: `<readlink failed: ${error?.message || "unknown error"}>`,
        resolvedTarget: "",
      });
    }
  }

  return {
    exists: true,
    aliasCount,
    symlinkCount,
    brokenSymlinks,
  };
}

function printBrokenExamples(brokenSymlinks) {
  if (brokenSymlinks.length === 0) return;
  console.log(`[dev:check] alias broken symlink samples (up to 5):`);
  for (const item of brokenSymlinks.slice(0, 5)) {
    console.log(`[dev:check]   ${item.alias} -> ${item.rawTarget}`);
    if (item.resolvedTarget) {
      console.log(`[dev:check]      resolved: ${item.resolvedTarget}`);
    }
  }
}

function printArchiveWorkbenchChecks(srcDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcDir);
  // Phase 4B-1: variant out-dirs now resolve via paths.extensionBuildDir(...),
  // which composes paths.BUILD_DIR with the canonical "chrome-ext-<variant>"
  // basename. Resolved paths are byte-identical to the legacy
  // path.join(srcDir, "build", "chrome-ext-<variant>") form because
  // paths.REPO_ROOT and the local srcDir honor the same H2O_SRC_DIR env var
  // with the same default. srcDir is kept in scope because it is still used
  // by archiveWorkbenchSourceDir(srcDir) above.
  const devControlsOutDir = extensionBuildDir("dev-controls");
  const opsPanelOutDir = extensionBuildDir("ops-panel");
  const leanOutDir = extensionBuildDir("dev-lean");
  const devControlsCheck = compareArchiveWorkbenchToSource(srcDir, devControlsOutDir);
  const opsPanelPresence = getArchiveWorkbenchPresence(opsPanelOutDir);
  const leanPresence = getArchiveWorkbenchPresence(leanOutDir);
  const sourcePresence = getArchiveWorkbenchSourcePresence(srcDir);

  console.log(`[dev:check] archiveWorkbench.sourceDir=${sourceDir}`);
  console.log(`[dev:check] archiveWorkbench.sourceFiles=${sourcePresence.length}`);
  console.log(`[dev:check] archiveWorkbench.devControlsMatches=${devControlsCheck.matches}`);
  console.log(`[dev:check] archiveWorkbench.opsPanelFiles=${opsPanelPresence.length}`);
  console.log(`[dev:check] archiveWorkbench.devLeanFiles=${leanPresence.length}`);

  // Validate against the current allowlist length rather than a stale
  // hardcoded count. The earlier `!== 3` baseline pre-dated the Studio
  // surface growth and tripped on every run regardless of repo health.
  // Report the missing files (not the present ones) so the failure is
  // actionable.
  if (sourcePresence.length !== ARCHIVE_WORKBENCH_SOURCE_FILES.length) {
    const missing = ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => !sourcePresence.includes(name));
    console.log(
      `[dev:check] archiveWorkbench source incomplete (${missing.length} missing of ${ARCHIVE_WORKBENCH_SOURCE_FILES.length}): ${missing.join(", ")}`,
    );
    process.exitCode = 1;
  }

  const drift = devControlsCheck.files.filter((item) => !(item.sourceExists && item.outExists && item.equal));
  if (drift.length) {
    for (const item of drift) {
      console.log(
        `[dev:check] archiveWorkbench drift ${item.name}: source=${item.sourceExists} out=${item.outExists} equal=${item.equal}`,
      );
    }
    process.exitCode = 1;
  }

  if (opsPanelPresence.length) {
    console.log(`[dev:check] archiveWorkbench unexpected ops-panel host files: ${opsPanelPresence.join(", ")}`);
    process.exitCode = 1;
  }

  if (leanPresence.length) {
    console.log(`[dev:check] archiveWorkbench unexpected dev-lean host files: ${leanPresence.join(", ")}`);
    process.exitCode = 1;
  }
}

function main() {
  const { srcDir, orderFile, serverDir } = resolveEnvDefaults();
  const scriptPick = pickUserScriptDir(srcDir);
  const aliasDir = path.join(serverDir, "alias");
  const aliasInfo = inspectAliasDir(aliasDir);
  const orderExists = fs.existsSync(orderFile);
  const orderReadable = orderExists && checkReadable(orderFile);

  console.log(`[dev:check] repo=${REPO_ROOT}`);
  console.log(`[dev:check] scriptsDirCandidate=${scriptPick.scriptsDir}`);
  console.log(`[dev:check] scriptsDirExists=${scriptPick.scriptsDirExists} scriptsCount=${scriptPick.scriptsCount}`);
  console.log(`[dev:check] chosenScriptSource=${scriptPick.chosenDir}`);
  console.log(`[dev:check] env.H2O_SRC_DIR=${srcDir}`);
  console.log(`[dev:check] env.H2O_ORDER_FILE=${orderFile}`);
  console.log(`[dev:check] env.H2O_SERVER_DIR=${serverDir}`);
  console.log(`[dev:check] orderFile.exists=${orderExists} readable=${orderReadable}`);

  if (!aliasInfo.exists) {
    console.log(`[dev:check] aliasDir=${aliasDir}`);
    console.log("[dev:check] WARN alias dir missing (run `npm run dev:rebuild` to generate aliases)");
    return;
  }

  console.log(`[dev:check] aliasDir=${aliasDir}`);
  console.log(`[dev:check] alias entries (*.js|*.user.js)=${aliasInfo.aliasCount}`);
  console.log(`[dev:check] symlinks=${aliasInfo.symlinkCount}`);
  console.log(`[dev:check] brokenSymlinks=${aliasInfo.brokenSymlinks.length}`);
  printBrokenExamples(aliasInfo.brokenSymlinks);
  printArchiveWorkbenchChecks(srcDir);
}

main();
