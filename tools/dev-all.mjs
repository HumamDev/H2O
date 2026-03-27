// @version 1.0.0
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");

function formatDurationMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

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

  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: REPO_ROOT,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`[dev:all] Step "${label}" terminated by signal ${signal}`));
        return;
      }
      if (typeof code === "number" && code !== 0) {
        const err = new Error(`[dev:all] Step "${label}" exited with code ${code}`);
        err.exitCode = code;
        reject(err);
        return;
      }
      console.log(`[dev:all]   completed in ${formatDurationMs(Date.now() - startedAt)}`);
      resolve();
    });
  });
}

async function main() {
  const { srcDir } = resolveEnvDefaults();
  const controlsOutDir = path.join(srcDir, "build", "chrome-ext-dev-controls");
  const leanOutDir = path.join(srcDir, "build", "chrome-ext-dev-lean");

  await runNodeStep("1/3 Rebuild scripts + aliases + EXT proxy (dev:rebuild)", "tools/dev-rebuild.mjs");

  await runNodeStep("2/3 Build Controls extension (unpacked)", "tools/ext/build-chrome-live-extension.mjs", {
    H2O_EXT_DEV_VARIANT: "controls",
    H2O_EXT_OUT_DIR: controlsOutDir,
  });

  await runNodeStep("3/3 Build Lean extension (unpacked)", "tools/ext/build-chrome-live-extension.mjs", {
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

main().catch((error) => {
  if (typeof error?.exitCode === "number") {
    process.exit(error.exitCode);
  }
  throw error;
});
