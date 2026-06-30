#!/usr/bin/env node
// Static validator for Studio Reader & Notes MVP-A1.1:
// the flag-guarded, read-only captured_chat LibraryItem typed view.
//
// This script reads source text and runs static assertions. It imports no
// runtime modules from the Studio surface and writes no files. The only
// child process it spawns is the MVP-A0 contract validator (check 12),
// which is itself read-only.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/reader-notes/library-item-view.studio.js';
const A0_VALIDATOR_REL = 'tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

// A1.1 footprint markers — they must appear only in allowed files.
const MARKERS = ['readerNotes.libraryItems', 'library-item-view', 'libraryItemView'];

// Forbidden single files: must not carry any A1.1 marker.
const FORBIDDEN_FILES = [
  'src-surfaces-base/studio/studio.js',
  'src-surfaces-base/studio/store/highlights.js',
  'src-surfaces-base/studio/store/notes.js',
  'src-surfaces-base/studio/store/bookmarks.js',
];
// Forbidden dirs: recursively must not carry any A1.1 marker.
const FORBIDDEN_DIRS = [
  'src-surfaces-base/studio/sync',
  'src-surfaces-base/studio/ingestion',
];

const pass = [];
const fail = [];

function readIfExists(rel) {
  const full = path.join(REPO_ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}
function read(rel) {
  const text = readIfExists(rel);
  assert.ok(text != null, `${rel} must exist`);
  return text;
}
function check(label, fn) {
  try { fn(); pass.push(label); console.log(`[ok] ${label}`); }
  catch (error) {
    const message = error && error.message ? error.message : String(error);
    fail.push({ label, message });
    console.log(`[fail] ${label}`);
    console.log(`       ${message}`);
  }
}
function has(text, needle, label) {
  assert.ok(text.includes(needle), `${label}: missing "${needle}"`);
}
function hasNot(text, needle, label) {
  assert.ok(!text.includes(needle), `${label}: must NOT contain "${needle}"`);
}
function listFilesRecursive(absDir, acc) {
  let entries = [];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return acc; }
  for (const ent of entries) {
    const p = path.join(absDir, ent.name);
    if (ent.isDirectory()) listFilesRecursive(p, acc);
    else acc.push(p);
  }
  return acc;
}

const moduleText = read(MODULE_REL);

// 1. Module exists.
check('A1.1 module file exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)), `${MODULE_REL} must exist`);
});

// 2. API exposes exactly the five read-only methods (+ readonly/version/flagKey, frozen).
check('module exposes only the read-only API methods', () => {
  for (const m of ['isEnabled', 'get', 'list', 'selfCheck', 'diagnose']) {
    has(moduleText, `${m}:`, `read method ${m}`);
  }
  has(moduleText, 'H2O.Studio.readerNotes.libraryItems', 'namespace');
  has(moduleText, 'readonly: true', 'readonly flag');
  has(moduleText, 'flagKey: FLAG_KEY', 'flagKey property');
  has(moduleText, 'Object.freeze(', 'frozen api surface');
});

// 3. API exposes no write-like methods.
check('module exposes no write-like methods', () => {
  const re = /\b(set|save|update|remove|delete|upsert|patch|clear)\s*[:(]/;
  const m = moduleText.match(re);
  assert.ok(!m, `write-like method token found: ${m ? m[0] : ''}`);
});

// 4. Feature flag key exists and defaults off.
check('feature flag key present and defaults off', () => {
  has(moduleText, "'studio.readerNotes.libraryItemView.enabled'", 'flag key string');
  has(moduleText, 'get(FLAG_KEY, false)', 'flag default-off read (default arg false)');
  has(moduleText, '=== true', 'strict-true coercion');
});

// 5. Fails closed when disabled or dependencies missing.
check('module fails closed (disabled / missing deps)', () => {
  has(moduleText, 'if (!isEnabled()) return null;', 'disabled get → null');
  has(moduleText, 'if (!isEnabled()) return [];', 'disabled list → []');
  assert.ok(/!reg && !idx|!idx && !reg/.test(moduleText), 'missing-deps guard present');
  has(moduleText, 'if (!flags) return false;', 'no flag system → isEnabled false');
});

// 6. kind 'captured_chat' is used.
check("uses kind 'captured_chat'", () => {
  has(moduleText, "'captured_chat'", 'captured_chat kind');
});

// 7. identity authority is 'chat-registry'.
check("identity authority is 'chat-registry'", () => {
  has(moduleText, "'chat-registry'", 'chat-registry authority');
  has(moduleText, 'authority: IDENTITY_AUTHORITY', 'identity.authority field');
});

// 8. structured category/labels preserved with flattened:false; no flattening.
check('structured category/labels preserved (flattened:false)', () => {
  has(moduleText, "'category_ref'", 'category_ref');
  has(moduleText, "'label_assignments_ref'", 'label_assignments_ref');
  has(moduleText, 'flattened: false', 'flattened:false marker');
  hasNot(moduleText, '.join(', 'no string flattening via join');
});

// 9. no raw chrome.* / localStorage / sessionStorage / indexedDB.
check('no raw storage APIs', () => {
  for (const tok of ['chrome.', 'localStorage', 'sessionStorage', 'indexedDB']) {
    hasNot(moduleText, tok, 'forbidden storage API');
  }
});

// 10. no annotation/highlights/notes/bookmarks façade implemented.
check('no annotation/highlights/notes/bookmarks façade implemented', () => {
  for (const tok of ['store.highlights', 'store.notes', 'store.bookmarks',
    'annotation', 'anchor', 'sidecar', 'highlight', 'bookmark']) {
    hasNot(moduleText, tok, 'later-phase subsystem token');
  }
});

// 11. forbidden paths carry no A1.1 footprint (dirty-tree-robust marker scan).
check('forbidden paths carry no A1.1 footprint', () => {
  for (const rel of FORBIDDEN_FILES) {
    const t = readIfExists(rel);
    if (t == null) continue; // absent file cannot carry the footprint
    for (const marker of MARKERS) hasNot(t, marker, `forbidden file ${rel}`);
  }
  for (const dirRel of FORBIDDEN_DIRS) {
    const absDir = path.join(REPO_ROOT, dirRel);
    const files = listFilesRecursive(absDir, []);
    for (const f of files) {
      let t = '';
      try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const marker of MARKERS) {
        assert.ok(!t.includes(marker), `forbidden dir ${dirRel} file ${path.relative(REPO_ROOT, f)} contains "${marker}"`);
      }
    }
  }
  // The A1.1 footprint must be present in the allowed wiring files (sanity).
  const html = readIfExists(STUDIO_HTML_REL);
  const pack = readIfExists(PACK_REL);
  assert.ok(html && html.includes('reader-notes/library-item-view.studio.js'),
    'studio.html should load the A1.1 module');
  assert.ok(pack && pack.includes('reader-notes/library-item-view.studio.js'),
    'pack-studio.mjs should include the A1.1 module');
});

// 12. MVP-A0 contract validator still passes.
check('MVP-A0 contract validator still passes', () => {
  const a0 = path.join(REPO_ROOT, A0_VALIDATOR_REL);
  assert.ok(fs.existsSync(a0), 'A0 validator must exist');
  let out = '';
  try {
    out = execFileSync('node', [a0], { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (e) {
    const so = (e && (e.stdout || '')) + (e && (e.stderr || ''));
    throw new Error(`A0 validator failed (exit ${e && e.status}): ${so.slice(-400)}`);
  }
  assert.ok(/validation passed/.test(out), 'A0 validator did not report "validation passed"');
});

if (fail.length) {
  console.log(`\nReader & Notes MVP-A1.1 validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes MVP-A1.1 validation passed: ${pass.length} checks.`);
}
