// @version 1.0.0  (Phase 8G-10: shared helper for minimal extension stub builders)
//
// Helper used by every per-host/per-browser builder under
// tools/product/extensions/<host>/<browser>/build.mjs. Each builder becomes
// a thin wrapper:
//
//   import { buildExtensionStub } from "../../_shared/build-extension-stub.mjs";
//   buildExtensionStub({ host: "claude", browser: "chrome" });
//
// Supports two identity schemes:
//   Chrome  — manifest.key (SHA256(SPKI) → ID), from `key` field in keys.json
//   Firefox — browser_specific_settings.gecko.{id, strict_min_version},
//             from `gecko_id` + `strict_min_version` fields in keys.json
//
// Reads source from src/extensions/<host>/<browser>/{config,scripts}/.
// Writes deterministic output to apps/extensions/<host>/<browser>/<variant>/.
// Output is gitignored.
//
// Environment variable overrides (same across all stubs):
//   H2O_EXT_DEV_VARIANT  — default "dev"; selects manifest.<variant>.json
//   H2O_EXT_OUT_DIR      — custom output directory (rare; for byte-equivalence
//                           testing or sandboxed builds)

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../../../paths.mjs";

const HOST_DOMAINS = Object.freeze({
  chatgpt: "chatgpt.com",
  claude: "claude.ai",
  gemini: "gemini.google.com",
});

function cap(s) {
  if (!s || typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

function loadIdentity({ browser, keysFile, variant }) {
  if (!fs.existsSync(keysFile)) return null;
  const keys = readJson(keysFile);
  const entry = keys.variants && keys.variants[variant];
  if (!entry) return null;
  if (browser === "chrome") {
    return entry.key
      ? { kind: "chrome", key: entry.key, id: entry.id || null }
      : null;
  }
  if (browser === "firefox") {
    if (!entry.gecko_id) return null;
    return {
      kind: "firefox",
      gecko_id: entry.gecko_id,
      strict_min_version: entry.strict_min_version || null,
    };
  }
  throw new Error("Unsupported browser: " + browser);
}

function manifestIdentityBlock(identity) {
  if (!identity) return {};
  if (identity.kind === "chrome") return { key: identity.key };
  if (identity.kind === "firefox") {
    const gecko = { id: identity.gecko_id };
    if (identity.strict_min_version) gecko.strict_min_version = identity.strict_min_version;
    return { browser_specific_settings: { gecko } };
  }
  return {};
}

function composeManifest(tpl, identityBlock) {
  // Stable key order — must match the order used by the pre-Phase-8G-10
  // per-combo builders byte-for-byte. The identity block (Chrome `key` or
  // Firefox `browser_specific_settings`) is inserted between `description`
  // and `permissions`.
  return {
    manifest_version: tpl.manifest_version,
    name: tpl.name,
    version: tpl.version,
    description: tpl.description,
    ...identityBlock,
    ...(tpl.permissions ? { permissions: tpl.permissions } : {}),
    ...(tpl.host_permissions ? { host_permissions: tpl.host_permissions } : {}),
    ...(tpl.content_scripts ? { content_scripts: tpl.content_scripts } : {}),
    ...(tpl.action ? { action: tpl.action } : {}),
    ...(tpl.background ? { background: tpl.background } : {}),
    ...(tpl.web_accessible_resources
      ? { web_accessible_resources: tpl.web_accessible_resources }
      : {}),
  };
}

function buildReadme({ host, browser, variant, identity }) {
  const datasetAttr = "h2o" + cap(host) + cap(browser) + "Dev";
  const hostDomain = HOST_DOMAINS[host] || host;

  const lines = [
    `H2O ${cap(host)} ${cap(browser)} dev stub`,
    "",
    `Built by: tools/product/extensions/${host}/${browser}/build.mjs`,
    "Variant : " + variant,
    "Host    : " + host,
    "Browser : " + browser,
  ];

  if (browser === "chrome") {
    lines.push(
      identity && identity.id
        ? "Chrome ID (key-derived): " + identity.id
        : "Chrome ID: (no key found; path-derived fallback active)",
    );
  } else if (browser === "firefox") {
    lines.push(
      identity && identity.gecko_id
        ? "Firefox gecko_id: " + identity.gecko_id
        : "Firefox gecko_id: (no keys.json entry; Firefox will assign a random ID per session)",
    );
  }

  lines.push(
    "",
    "Minimal proof-of-chain stub. The content script logs to console +",
    `sets document.documentElement.dataset.${datasetAttr}='loaded' on ${hostDomain}.`,
    "No real Cockpit Pro feature logic implemented yet.",
    "",
    `Source: src/extensions/${host}/${browser}/`,
    "Docs  : docs/architecture/PRODUCTS.md",
    "        docs/architecture/MULTI_HOST_ARCHITECTURE.md",
    "",
  );

  if (browser === "chrome") {
    lines.push(
      "Load (manual):",
      "  chrome://extensions → enable Developer mode → 'Load unpacked'",
      "  → select the output folder",
      "",
    );
  } else if (browser === "firefox") {
    lines.push(
      "Load (manual):",
      "  about:debugging#/runtime/this-firefox",
      "  → 'Load Temporary Add-on...' → select manifest.json",
      "",
    );
  }

  return lines.join("\n");
}

/**
 * Build a minimal proof-of-chain extension stub for a (host, browser) pair.
 *
 * @param {Object} options
 * @param {string} options.host             "chatgpt" | "claude" | "gemini" (or any future host folder)
 * @param {string} options.browser          "chrome" | "firefox"
 * @param {string} [options.defaultVariant] default "dev"; H2O_EXT_DEV_VARIANT env overrides
 * @returns {void}                          throws on missing inputs
 */
export function buildExtensionStub({ host, browser, defaultVariant = "dev" }) {
  if (!host || typeof host !== "string") {
    throw new TypeError("buildExtensionStub: 'host' is required (string)");
  }
  if (!browser || typeof browser !== "string") {
    throw new TypeError("buildExtensionStub: 'browser' is required (string)");
  }

  const variant = String(process.env.H2O_EXT_DEV_VARIANT || defaultVariant).trim().toLowerCase();

  const SRC_ROOT = path.join(REPO_ROOT, "src", "extensions", host, browser);
  const MANIFEST_TEMPLATE = path.join(SRC_ROOT, "config", `manifest.${variant}.json`);
  const CONTENT_SCRIPT = path.join(SRC_ROOT, "scripts", "content.js");
  const KEYS_FILE = path.join(REPO_ROOT, "config", "extensions", host, browser, "keys.json");

  const OUT_DIR =
    process.env.H2O_EXT_OUT_DIR ||
    path.join(REPO_ROOT, "apps", "extensions", host, browser, variant);

  if (!fs.existsSync(MANIFEST_TEMPLATE)) {
    throw new Error("Missing manifest template: " + MANIFEST_TEMPLATE);
  }
  if (!fs.existsSync(CONTENT_SCRIPT)) {
    throw new Error("Missing content script: " + CONTENT_SCRIPT);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  const tpl = readJson(MANIFEST_TEMPLATE);
  const identity = loadIdentity({ browser, keysFile: KEYS_FILE, variant });
  const manifest = composeManifest(tpl, manifestIdentityBlock(identity));

  writeFileAtomic(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  fs.copyFileSync(CONTENT_SCRIPT, path.join(OUT_DIR, "content.js"));
  writeFileAtomic(
    path.join(OUT_DIR, "README.txt"),
    buildReadme({ host, browser, variant, identity }),
  );

  const tag = `[H2O ${host}/${browser}]`;
  console.log(tag + " built:", variant);
  console.log(tag + " out:   ", OUT_DIR);
  if (identity) {
    if (identity.kind === "chrome" && identity.id) {
      console.log(tag + " ext ID:", identity.id);
    } else if (identity.kind === "firefox") {
      console.log(tag + " gecko_id:", identity.gecko_id);
    }
  }
}
