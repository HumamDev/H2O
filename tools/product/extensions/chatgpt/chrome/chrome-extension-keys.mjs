// @version 1.0.0  (Phase 8A-1)
//
// Per-variant Chrome extension manifest "key" registry. Reads
// config/extension-keys.json and returns the base64-encoded public key
// associated with a given variant, so manifest.json can include the
// "key" field and Chrome derives a path-agnostic, stable extension ID.
//
// Phase 8A-1 (2026-05-19): introduced this module + config so a future
// h2o-source folder rename does not rotate any extension IDs. See
// docs/migration/MIGRATION.md §1 (Phase 8A-1 row) for the OAuth-Google
// ID rotation rationale + the Supabase Auth Redirect URL action.
//
// Usage:
//   import { getExtensionKey, deriveVariantFromOutDir } from "./chrome-extension-keys.mjs";
//   const variant = deriveVariantFromOutDir(OUT_DIR);
//   const EXTENSION_KEY = getExtensionKey(variant);
//
// The helper returns null when the variant is not registered (defensive:
// callers that pass null to makeChromeLiveManifest cause the "key" field
// to be omitted, preserving the pre-Phase-8A-1 path-derived-ID behavior).

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../../../../paths.mjs";

const KEYS_FILE = path.join(REPO_ROOT, "config", "extension-keys.json");

let _cached = null;

function loadKeys() {
  if (_cached) return _cached;
  const raw = fs.readFileSync(KEYS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  _cached = parsed.variants || {};
  return _cached;
}

export function getExtensionKey(variant) {
  const variants = loadKeys();
  const entry = variants[variant];
  return entry && entry.key ? entry.key : null;
}

export function getExtensionId(variant) {
  const variants = loadKeys();
  const entry = variants[variant];
  return entry && entry.id ? entry.id : null;
}

// Derives the canonical variant name from an OUT_DIR path. Handles both
// the legacy `build/chrome-ext-<variant>` form and the post-Phase-4C-B
// `apps/extensions/chatgpt/chrome/<variant>` form. Strips the
// `chrome-ext-` prefix when present.
export function deriveVariantFromOutDir(outDir) {
  if (!outDir) return null;
  const base = path.basename(String(outDir));
  return base.replace(/^chrome-ext-/, "");
}
