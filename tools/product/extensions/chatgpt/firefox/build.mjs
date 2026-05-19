#!/usr/bin/env node
// @version 1.0.0  (Phase 8G-6: minimal chatgpt+firefox dev stub builder)
//
// Builds the H2O ChatGPT Firefox dev variant.
//
// Reads:
//   src/extensions/chatgpt/firefox/config/manifest.dev.json  (MV3 manifest template)
//   src/extensions/chatgpt/firefox/scripts/content.js        (content script)
//   config/extensions/chatgpt/firefox/keys.json              (Firefox gecko_id)
//
// Writes:
//   apps/extensions/chatgpt/firefox/dev/manifest.json
//   apps/extensions/chatgpt/firefox/dev/content.js
//   apps/extensions/chatgpt/firefox/dev/README.txt
//
// Differences from the chatgpt+chrome and claude+chrome builders:
//   - Firefox uses `browser_specific_settings.gecko.id` (string) for the
//     extension ID, NOT a base64 SPKI public key as Chrome does.
//   - Firefox MV3 requires strict_min_version >= "109.0".
//   - Loaded via about:debugging as a "Temporary Add-on", not chrome://extensions.
//
// Deliberately self-contained: imports only node built-ins + tools/paths.mjs.
// Does NOT depend on the chatgpt+chrome legacy pipeline or the claude builder.

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../../../../paths.mjs";

const HOST = "chatgpt";
const BROWSER = "firefox";
const DEFAULT_VARIANT = "dev";

const variant =
  String(process.env.H2O_EXT_DEV_VARIANT || DEFAULT_VARIANT).trim().toLowerCase();

const SRC_ROOT = path.join(REPO_ROOT, "src", "extensions", HOST, BROWSER);
const MANIFEST_TEMPLATE = path.join(SRC_ROOT, "config", `manifest.${variant}.json`);
const CONTENT_SCRIPT = path.join(SRC_ROOT, "scripts", "content.js");
const KEYS_FILE = path.join(REPO_ROOT, "config", "extensions", HOST, BROWSER, "keys.json");

const OUT_DIR =
  process.env.H2O_EXT_OUT_DIR ||
  path.join(REPO_ROOT, "apps", "extensions", HOST, BROWSER, variant);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileAtomic(file, contents) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, contents);
}

function loadFirefoxIdentity() {
  if (!fs.existsSync(KEYS_FILE)) {
    return { gecko_id: null, strict_min_version: null };
  }
  const keys = readJson(KEYS_FILE);
  const entry = keys.variants && keys.variants[variant];
  if (!entry) {
    return { gecko_id: null, strict_min_version: null };
  }
  return {
    gecko_id: entry.gecko_id || null,
    strict_min_version: entry.strict_min_version || null,
  };
}

function buildManifest() {
  if (!fs.existsSync(MANIFEST_TEMPLATE)) {
    throw new Error(`Manifest template not found: ${MANIFEST_TEMPLATE}`);
  }
  const tpl = readJson(MANIFEST_TEMPLATE);
  const { gecko_id, strict_min_version } = loadFirefoxIdentity();

  // Build browser_specific_settings.gecko block (Firefox-only).
  let geckoBlock = null;
  if (gecko_id) {
    geckoBlock = { id: gecko_id };
    if (strict_min_version) {
      geckoBlock.strict_min_version = strict_min_version;
    }
  }

  // Compose manifest in a stable key order for deterministic output.
  const out = {
    manifest_version: tpl.manifest_version,
    name: tpl.name,
    version: tpl.version,
    description: tpl.description,
    ...(geckoBlock ? { browser_specific_settings: { gecko: geckoBlock } } : {}),
    ...(tpl.permissions ? { permissions: tpl.permissions } : {}),
    ...(tpl.host_permissions ? { host_permissions: tpl.host_permissions } : {}),
    ...(tpl.content_scripts ? { content_scripts: tpl.content_scripts } : {}),
    ...(tpl.action ? { action: tpl.action } : {}),
    ...(tpl.background ? { background: tpl.background } : {}),
    ...(tpl.web_accessible_resources
      ? { web_accessible_resources: tpl.web_accessible_resources }
      : {}),
  };
  return { manifest: out, gecko_id };
}

function buildReadme(gecko_id) {
  return [
    "H2O ChatGPT Firefox dev stub",
    "",
    "Built by: tools/product/extensions/chatgpt/firefox/build.mjs",
    "Variant : " + variant,
    "Host    : " + HOST,
    "Browser : " + BROWSER,
    gecko_id
      ? "Firefox gecko_id: " + gecko_id
      : "Firefox gecko_id: (no keys.json entry; Firefox will assign a random ID per session)",
    "",
    "This is a Phase 8G-6 proof-of-chain stub. The content script logs to",
    "console + sets document.documentElement.dataset.h2oChatgptFirefoxDev='loaded'",
    "on chatgpt.com. The chatgpt+chrome legacy at scripts/+surfaces/+config/ is",
    "NOT reused here; the Firefox port grows fresh.",
    "",
    "Source: src/extensions/chatgpt/firefox/",
    "Docs  : docs/architecture/PRODUCTS.md",
    "        docs/architecture/MULTI_HOST_ARCHITECTURE.md",
    "",
    "Load (manual):",
    "  about:debugging#/runtime/this-firefox",
    "  → 'Load Temporary Add-on...' → select manifest.json",
    "",
  ].join("\n");
}

function main() {
  if (!fs.existsSync(MANIFEST_TEMPLATE)) {
    throw new Error("Missing manifest template: " + MANIFEST_TEMPLATE);
  }
  if (!fs.existsSync(CONTENT_SCRIPT)) {
    throw new Error("Missing content script: " + CONTENT_SCRIPT);
  }

  // Clear + recreate OUT_DIR. Safe — gitignored; never holds tracked content.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  const { manifest, gecko_id } = buildManifest();
  writeFileAtomic(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  fs.copyFileSync(CONTENT_SCRIPT, path.join(OUT_DIR, "content.js"));
  writeFileAtomic(path.join(OUT_DIR, "README.txt"), buildReadme(gecko_id));

  console.log("[H2O chatgpt/firefox] built:", variant);
  console.log("[H2O chatgpt/firefox] out:   ", OUT_DIR);
  if (gecko_id) console.log("[H2O chatgpt/firefox] gecko_id:", gecko_id);
}

main();
