import { spawnSync } from "node:child_process";
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

function runNodeStep(label, scriptPath, extraEnv = {}) {
  const { srcDir, orderFile, serverDir } = resolveEnvDefaults();
  const env = {
    ...process.env,
    H2O_SRC_DIR: srcDir,
    H2O_ORDER_FILE: orderFile,
    H2O_SERVER_DIR: serverDir,
    ...extraEnv,
  };

  console.log(`\n[dev:all] ${label}`);
  console.log(`[dev:all]   H2O_SRC_DIR=${env.H2O_SRC_DIR}`);
  console.log(`[dev:all]   H2O_ORDER_FILE=${env.H2O_ORDER_FILE}`);
  console.log(`[dev:all]   H2O_SERVER_DIR=${env.H2O_SERVER_DIR}`);
  if (env.H2O_EXT_OUT_DIR) {
    console.log(`[dev:all]   H2O_EXT_OUT_DIR=${env.H2O_EXT_OUT_DIR}`);
  }
  if (env.H2O_EXT_DEV_VARIANT) {
    console.log(`[dev:all]   H2O_EXT_DEV_VARIANT=${env.H2O_EXT_DEV_VARIANT}`);
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    console.error(`[dev:all] Step "${label}" terminated by signal ${result.signal}`);
    process.exit(1);
  }
}

function main() {
  const { srcDir } = resolveEnvDefaults();
  const controlsOutDir = path.join(srcDir, "build", "chrome-ext-dev-controls");
  const leanOutDir = path.join(srcDir, "build", "chrome-ext-dev-lean");

  runNodeStep("1/3 Rebuild scripts + aliases + EXT proxy (dev:rebuild)", "tools/dev-rebuild.mjs");

  runNodeStep("2/3 Build Controls extension (unpacked)", "tools/ext/make-chrome-live-extension.mjs", {
    H2O_EXT_DEV_VARIANT: "controls",
    H2O_EXT_OUT_DIR: controlsOutDir,
  });

  runNodeStep("3/3 Build Lean extension (unpacked)", "tools/ext/make-chrome-live-extension.mjs", {
    H2O_EXT_DEV_VARIANT: "lean",
    H2O_EXT_OUT_DIR: leanOutDir,
  });

  console.log("\n[dev:all] done");
  console.log("[dev:all] Outputs:");
  console.log(`[dev:all]   Controls EXT OUT_DIR: ${controlsOutDir}`);
  console.log(`[dev:all]   Lean     EXT OUT_DIR: ${leanOutDir}`);
  console.log(
    "[dev:all] Reminder: Open chrome://extensions and reload the extension that was loaded from the folder you are testing.",
  );
  console.log(
    "Now go to chrome://extensions and reload the extension you’re testing (Controls or Lean), then refresh the page.",
  );
}

main();
