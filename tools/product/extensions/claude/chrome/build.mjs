#!/usr/bin/env node
// @version 1.0.0  (Phase 8G-5: minimal claude+chrome dev stub builder)
//
// Builds the H2O Claude Chrome dev variant.
//
// Reads:
//   src/extensions/claude/chrome/config/manifest.dev.json  (MV3 manifest template)
//   src/extensions/claude/chrome/scripts/content.js        (content script)
//   config/extensions/claude/chrome/keys.json              (Chrome manifest key)
//
// Writes:
//   apps/extensions/claude/chrome/dev/manifest.json
//   apps/extensions/claude/chrome/dev/content.js
//   apps/extensions/claude/chrome/dev/README.txt
//
// All output paths are gitignored. Output is deterministic (modulo
// optional H2O_BUILD_TS env var); same inputs → same bytes.
//
// Deliberately self-contained: imports only node built-ins + tools/paths.mjs.
// Does NOT depend on the chatgpt+chrome build pipeline, on tools/loader/*,
// on scripts/, on surfaces/, or on config/dev-order.tsv.
//
// Variant selection (forward-compatible; today only "dev" is implemented):
//   const variant = process.env.H2O_EXT_DEV_VARIANT || "dev";

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../../../../paths.mjs";

const HOST = "claude";
const BROWSER = "chrome";
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

function loadKey() {
  if (!fs.existsSync(KEYS_FILE)) {
    return { key: null, id: null };
  }
  const keys = readJson(KEYS_FILE);
  const entry = keys.variants && keys.variants[variant];
  if (!entry || !entry.key) {
    return { key: null, id: null };
  }
  return { key: entry.key, id: entry.id || null };
}

function buildManifest() {
  if (!fs.existsSync(MANIFEST_TEMPLATE)) {
    throw new Error(`Manifest template not found: ${MANIFEST_TEMPLATE}`);
  }
  const tpl = readJson(MANIFEST_TEMPLATE);
  const { key, id } = loadKey();
  // Inject manifest key (path-agnostic Chrome ID per Phase 8A-1 scheme).
  // We deliberately place the key right after the description (and before
  // permissions) so the manifest reads well left-to-right.
  const out = {
    manifest_version: tpl.manifest_version,
    name: tpl.name,
    version: tpl.version,
    description: tpl.description,
    ...(key ? { key } : {}),
    ...(tpl.permissions ? { permissions: tpl.permissions } : {}),
    ...(tpl.host_permissions ? { host_permissions: tpl.host_permissions } : {}),
    ...(tpl.content_scripts ? { content_scripts: tpl.content_scripts } : {}),
    ...(tpl.action ? { action: tpl.action } : {}),
    ...(tpl.background ? { background: tpl.background } : {}),
    ...(tpl.web_accessible_resources
      ? { web_accessible_resources: tpl.web_accessible_resources }
      : {}),
  };
  return { manifest: out, id };
}

function buildReadme(id) {
  // Lightweight README.txt; explains what the operator loaded + how it was built.
  return [
    "H2O Claude Chrome dev stub",
    "",
    "Built by: tools/product/extensions/claude/chrome/build.mjs",
    "Variant : " + variant,
    "Host    : " + HOST,
    "Browser : " + BROWSER,
    id ? "Chrome ID (key-derived): " + id : "Chrome ID: (no key found; path-derived fallback active)",
    "",
    "This is a Phase 8G-5 proof-of-chain stub. The content script logs to",
    "console + sets document.documentElement.dataset.h2oClaudeChromeDev='loaded'",
    "on claude.ai. No real Claude integration is implemented yet.",
    "",
    "Source: src/extensions/claude/chrome/",
    "Docs  : docs/architecture/PRODUCTS.md",
    "        docs/architecture/MULTI_HOST_ARCHITECTURE.md",
    "",
  ].join("\n");
}

function main() {
  // Ensure inputs exist before clearing OUT_DIR so a half-built run can't leave
  // a stale dir.
  if (!fs.existsSync(MANIFEST_TEMPLATE)) {
    throw new Error("Missing manifest template: " + MANIFEST_TEMPLATE);
  }
  if (!fs.existsSync(CONTENT_SCRIPT)) {
    throw new Error("Missing content script: " + CONTENT_SCRIPT);
  }

  // Clear + recreate OUT_DIR. (Safe: gitignored; never holds tracked content.)
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  const { manifest, id } = buildManifest();
  writeFileAtomic(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  fs.copyFileSync(CONTENT_SCRIPT, path.join(OUT_DIR, "content.js"));
  writeFileAtomic(path.join(OUT_DIR, "README.txt"), buildReadme(id));

  console.log("[H2O claude/chrome] built:", variant);
  console.log("[H2O claude/chrome] out:   ", OUT_DIR);
  if (id) console.log("[H2O claude/chrome] ext ID:", id);
}

main();
