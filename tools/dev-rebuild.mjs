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
    console.error(`[dev:rebuild] Step "${label}" terminated by signal ${result.signal}`);
    process.exit(1);
  }
}

function main() {
  runStep("1/3 sync-dev-order", "tools/common/sync-dev-order.mjs");
  runStep("2/3 make-aliases", "tools/common/make-aliases.mjs", { H2O_ALIAS_MODE: "symlink" });
  runStep("3/3 make-ext-proxy-pack", "tools/ext/make-ext-proxy-pack.mjs");
  console.log("\n[dev:rebuild] done");
}

main();
