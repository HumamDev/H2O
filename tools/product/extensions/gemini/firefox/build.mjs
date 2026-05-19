#!/usr/bin/env node
// @version 1.0.0  (Phase 8G-9: minimal gemini+firefox dev stub builder)
//
// Builds the H2O Gemini Firefox dev variant. Clone of the Phase 8G-6
// chatgpt+firefox + Phase 8G-8 claude+firefox builders with HOST="gemini".
// Final new host+browser combo in the multi-host/multi-browser scaffolding cycle.
//
// Reads:
//   src/extensions/gemini/firefox/config/manifest.dev.json
//   src/extensions/gemini/firefox/scripts/content.js
//   config/extensions/gemini/firefox/keys.json
//
// Writes:
//   apps/extensions/gemini/firefox/dev/manifest.json
//   apps/extensions/gemini/firefox/dev/content.js
//   apps/extensions/gemini/firefox/dev/README.txt
//
// Deliberately self-contained: imports only node built-ins + tools/paths.mjs.

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../../../../paths.mjs";

const HOST = "gemini";
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

  let geckoBlock = null;
  if (gecko_id) {
    geckoBlock = { id: gecko_id };
    if (strict_min_version) {
      geckoBlock.strict_min_version = strict_min_version;
    }
  }

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
    "H2O Gemini Firefox dev stub",
    "",
    "Built by: tools/product/extensions/gemini/firefox/build.mjs",
    "Variant : " + variant,
    "Host    : " + HOST,
    "Browser : " + BROWSER,
    gecko_id
      ? "Firefox gecko_id: " + gecko_id
      : "Firefox gecko_id: (no keys.json entry; Firefox will assign a random ID per session)",
    "",
    "This is a Phase 8G-9 proof-of-chain stub. The content script logs to",
    "console + sets document.documentElement.dataset.h2oGeminiFirefoxDev='loaded'",
    "on gemini.google.com. No real Gemini Firefox integration is implemented yet.",
    "",
    "Source: src/extensions/gemini/firefox/",
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

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  const { manifest, gecko_id } = buildManifest();
  writeFileAtomic(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  fs.copyFileSync(CONTENT_SCRIPT, path.join(OUT_DIR, "content.js"));
  writeFileAtomic(path.join(OUT_DIR, "README.txt"), buildReadme(gecko_id));

  console.log("[H2O gemini/firefox] built:", variant);
  console.log("[H2O gemini/firefox] out:   ", OUT_DIR);
  if (gecko_id) console.log("[H2O gemini/firefox] gecko_id:", gecko_id);
}

main();
