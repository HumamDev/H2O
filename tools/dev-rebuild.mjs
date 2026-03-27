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

function runStep(label, scriptPath, extraEnv = {}) {
  const { srcDir, orderFile, serverDir } = resolveEnvDefaults();
  const env = {
    ...process.env,
    H2O_SRC_DIR: srcDir,
    H2O_ORDER_FILE: orderFile,
    H2O_SERVER_DIR: serverDir,
    ...extraEnv,
  };

  console.log(`\n[dev:rebuild] ${label}`);
  console.log(`[dev:rebuild]   H2O_SRC_DIR=${env.H2O_SRC_DIR}`);
  console.log(`[dev:rebuild]   H2O_ORDER_FILE=${env.H2O_ORDER_FILE}`);
  console.log(`[dev:rebuild]   H2O_SERVER_DIR=${env.H2O_SERVER_DIR}`);
  if (env.H2O_ALIAS_MODE) {
    console.log(`[dev:rebuild]   H2O_ALIAS_MODE=${env.H2O_ALIAS_MODE}`);
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
        reject(new Error(`[dev:rebuild] Step "${label}" terminated by signal ${signal}`));
        return;
      }
      if (typeof code === "number" && code !== 0) {
        const err = new Error(`[dev:rebuild] Step "${label}" exited with code ${code}`);
        err.exitCode = code;
        reject(err);
        return;
      }
      console.log(`[dev:rebuild]   completed in ${formatDurationMs(Date.now() - startedAt)}`);
      resolve();
    });
  });
}

async function main() {
  await runStep("1/4 sync-dev-order", "tools/common/sync-dev-order.mjs");
  await runStep("2/4 make-aliases", "tools/common/make-aliases.mjs", { H2O_ALIAS_MODE: "symlink" });
  await runStep("3/4 make-ext-proxy-pack", "tools/ext/make-ext-proxy-pack.mjs");
  await runStep("4/4 validate-loader-order", "tools/common/validate-loader-order.mjs");
  console.log("\n[dev:rebuild] done");
}

main().catch((error) => {
  if (typeof error?.exitCode === "number") {
    process.exit(error.exitCode);
  }
  throw error;
});
