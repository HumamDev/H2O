// @version 1.0.0
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createChromeLiveBuildContext() {
  const TOOL_FILE = fileURLToPath(import.meta.url);
  const TOOL_DIR = path.dirname(TOOL_FILE);
  const SRC_DEFAULT = path.resolve(TOOL_DIR, "..", "..");

  const SRC =
    process.env.H2O_SRC_DIR ||
    SRC_DEFAULT;

  const OUT_DIR =
    process.env.H2O_EXT_OUT_DIR ||
    path.join(SRC, "build", "chrome-ext-dev-controls");

  const PROXY_PACK_URL =
    process.env.H2O_EXT_PROXY_PACK_URL ||
    "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt";

  const CHAT_MATCH =
    process.env.H2O_EXT_MATCH ||
    "https://chatgpt.com/*";

  const STORAGE_KEY = "h2oExtDevToggleMapV1";
  const STORAGE_ORDER_OVERRIDES_KEY = "h2oExtDevOrderOverridesV1";
  const DEV_VARIANT = String(process.env.H2O_EXT_DEV_VARIANT || "controls").trim().toLowerCase() === "lean" ? "lean" : "controls";
  const DEV_HAS_CONTROLS = DEV_VARIANT === "controls";
  const DEV_VERSION = "1.3.0";
  const DEV_TITLE = DEV_HAS_CONTROLS ? "H2O Dev Controls" : "H2O Dev Loader (Lean)";
  const DEV_NAME = DEV_HAS_CONTROLS ? "H2O Dev Controls (Unpacked)" : "H2O Dev Loader (Lean, Unpacked)";
  const DEV_DESCRIPTION = DEV_HAS_CONTROLS
    ? "Dev-only local loader with per-script toggles for H2O scripts on chatgpt.com."
    : "Dev-only local loader for H2O scripts on chatgpt.com (lean mode, no popup toggles).";
  const DEV_TAG = DEV_HAS_CONTROLS ? "[H2O DEV CTRL]" : "[H2O DEV LEAN]";
  const DEV_ORDER_FILE = path.join(SRC, "config", "dev-order.tsv");
  const PAGE_FOLDER_BRIDGE_FILE = "folder-bridge-page.js";

  return {
    SRC,
    OUT_DIR,
    PROXY_PACK_URL,
    CHAT_MATCH,
    STORAGE_KEY,
    STORAGE_ORDER_OVERRIDES_KEY,
    DEV_VARIANT,
    DEV_HAS_CONTROLS,
    DEV_VERSION,
    DEV_TITLE,
    DEV_NAME,
    DEV_DESCRIPTION,
    DEV_TAG,
    DEV_ORDER_FILE,
    PAGE_FOLDER_BRIDGE_FILE,
  };
}
