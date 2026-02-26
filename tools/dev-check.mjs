import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");

function resolveEnvDefaults() {
  const srcDir = path.resolve(process.env.H2O_SRC_DIR || REPO_ROOT);
  const orderFile = path.resolve(process.env.H2O_ORDER_FILE || path.join(srcDir, "config", "dev-order.tsv"));
  const serverDir = path.resolve(process.env.H2O_SERVER_DIR || path.join(srcDir, "..", "h2o-dev-server"));
  return { srcDir, orderFile, serverDir };
}

function isUserScriptName(name) {
  return /\.user\.js$/i.test(String(name || ""));
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
  console.log(`[dev:check] alias entries (*.user.js)=${aliasInfo.aliasCount}`);
  console.log(`[dev:check] symlinks=${aliasInfo.symlinkCount}`);
  console.log(`[dev:check] brokenSymlinks=${aliasInfo.brokenSymlinks.length}`);
  printBrokenExamples(aliasInfo.brokenSymlinks);
}

main();
