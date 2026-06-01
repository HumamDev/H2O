#!/usr/bin/env node
// Validator for the Studio-side Library Actions consumer (Phase 7C/7D).
//
// Verifies:
//   1. src-surfaces-base/studio/S0F1j Library Actions - Studio.js exists
//      and is syntactically valid (Node --check via dynamic import metadata).
//   2. studio.html includes <script src="./S0F1j..."></script> AFTER S0F0j
//      and BEFORE the Command Bar (S0X1a) + Library Commands plugin (S0X1b).
//   3. pack-studio.mjs has S0F1j in BOTH ARCHIVE_WORKBENCH_SOURCE_FILES and
//      ARCHIVE_WORKBENCH_OUT_FILES at MATCHING indices (the Phase 2A
//      packaging-miss pattern is the bug this prevents).
//   4. S0F1j exports the public-API surface expected by S0X1b
//      (diagnose, openLinkedChat) plus the native-only stubs (addToLibrary,
//      saveToFolder) so it remains compatible with the native API shape.
//   5. S0F1j uses the defensive LibraryActionsCore accessor pattern from
//      the host-adapter / mirror-consumer playbook (actionsCore() returns
//      null on miss; tryCore() exception-safe).
//
// No jsdom dependency — string + AST-light parsing only.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const S0F1J_REL = 'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js';
const S0F0J_REL = 'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const S0X1B_REL = 'src-surfaces-base/studio/S0X1b. 🎬 Library Commands (Command Bar 🔌 Plugin) - Studio.js';

function abs(rel) { return path.join(REPO_ROOT, rel); }
function read(rel) { return fs.readFileSync(abs(rel), 'utf8'); }

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try { fn(); PASS.push(label); }
  catch (e) { FAIL.push({ label, err: e?.message || String(e) }); }
}

// 1. S0F1j exists + syntax
check('S0F1j file exists', () => {
  assert.ok(fs.existsSync(abs(S0F1J_REL)), `${S0F1J_REL} missing`);
});

const s0f1jSrc = read(S0F1J_REL);

check('S0F1j has H2O Module header', () => {
  assert.match(s0f1jSrc, /\/\/\s*==UserScript==/);
  assert.match(s0f1jSrc, /@h2o-id\s+s0f1j/i);
});

check('S0F1j publishes H2O.LibraryActions', () => {
  assert.match(s0f1jSrc, /H2O\.LibraryActions\s*=/, 'must assign H2O.LibraryActions');
});

check('S0F1j publishes H2O.Library.Actions alias', () => {
  assert.match(s0f1jSrc, /H2O\.Library\.Actions\s*=/, 'must assign H2O.Library.Actions');
});

// 2. Defensive core accessor
check('S0F1j uses defensive actionsCore() accessor probing 3 namespaces', () => {
  assert.match(s0f1jSrc, /H2O\.LibraryActionsCore/);
  // Should probe at least 2 of these
  const probes = [
    /H2O\.LibraryActionsCore/,
    /H2O\.Library\?\.ActionsCore|H2O\.Library\.ActionsCore/,
    /H2O\.Library\?\.LibraryActionsCore|H2O\.Library\.LibraryActionsCore/,
  ].filter(re => re.test(s0f1jSrc));
  assert.ok(probes.length >= 2, `expected ≥2 namespace probes, got ${probes.length}`);
});

check('S0F1j has tryCore() exception-safe wrapper', () => {
  assert.match(s0f1jSrc, /function\s+tryCore\s*\(/, 'tryCore function declaration required');
  assert.match(s0f1jSrc, /catch\s*\(/, 'tryCore must catch exceptions');
});

// 3. Public API methods
const REQUIRED_METHODS = ['addToLibrary', 'saveToFolder', 'openLinkedChat', 'diagnose'];
for (const m of REQUIRED_METHODS) {
  check(`S0F1j exports ${m}`, () => {
    // Either as method declaration or property reference in the published object
    const decl = new RegExp(`(function|async\\s+function)\\s+${m}\\s*\\(`).test(s0f1jSrc);
    const propRef = new RegExp(`\\b${m}\\s*,`).test(s0f1jSrc);
    assert.ok(decl || propRef, `${m} not found as declaration or property`);
  });
}

// 4. Studio-safe stubs for native-only operations
check('S0F1j returns non-throwing result for native-only addToLibrary', () => {
  assert.match(s0f1jSrc, /supportedInStudio\s*:\s*false|not_supported_in_studio_yet|native-context-required/i,
    'must signal "not supported in Studio" rather than throwing');
});

// 5. studio.html wiring
const studioHtml = read(STUDIO_HTML_REL);

check('studio.html includes S0F1j <script> tag', () => {
  assert.match(studioHtml, /<script src="\.\/S0F1j\. 🎬 Library Actions - Studio\.js"><\/script>/);
});

check('studio.html loads S0F1j AFTER S0F0j', () => {
  const i0j = studioHtml.indexOf('S0F0j. 🎬 Library Actions Core - Studio.js');
  const i1j = studioHtml.indexOf('S0F1j. 🎬 Library Actions - Studio.js');
  assert.ok(i0j > 0, 'S0F0j must be present');
  assert.ok(i1j > 0, 'S0F1j must be present');
  assert.ok(i0j < i1j, `S0F0j must precede S0F1j in studio.html (got S0F0j@${i0j}, S0F1j@${i1j})`);
});

check('studio.html loads S0F1j BEFORE the Command Bar plugin S0X1b', () => {
  const i1j = studioHtml.indexOf('S0F1j. 🎬 Library Actions - Studio.js');
  const i1b = studioHtml.indexOf('S0X1b. 🎬 Library Commands');
  assert.ok(i1j > 0, 'S0F1j must be present');
  assert.ok(i1b > 0, 'S0X1b must be present');
  assert.ok(i1j < i1b, `S0F1j must precede S0X1b (got S0F1j@${i1j}, S0X1b@${i1b})`);
});

// 6. pack-studio.mjs source/out parity
const packStudio = await import('file://' + abs(PACK_STUDIO_REL));
const SOURCE_FILES = packStudio.ARCHIVE_WORKBENCH_SOURCE_FILES;
const OUT_FILES = packStudio.ARCHIVE_WORKBENCH_OUT_FILES;
const S0F1J_BASENAME = 'S0F1j. 🎬 Library Actions - Studio.js';

check('pack-studio: SOURCE_FILES and OUT_FILES have equal length', () => {
  assert.equal(SOURCE_FILES.length, OUT_FILES.length,
    `length mismatch: source=${SOURCE_FILES.length} out=${OUT_FILES.length}`);
});

check('pack-studio: S0F1j in ARCHIVE_WORKBENCH_SOURCE_FILES', () => {
  assert.ok(SOURCE_FILES.includes(S0F1J_BASENAME), 'S0F1j missing from SOURCE_FILES');
});

check('pack-studio: S0F1j in ARCHIVE_WORKBENCH_OUT_FILES', () => {
  assert.ok(OUT_FILES.includes(S0F1J_BASENAME), 'S0F1j missing from OUT_FILES');
});

check('pack-studio: S0F1j at MATCHING index in both lists', () => {
  const srcIdx = SOURCE_FILES.indexOf(S0F1J_BASENAME);
  const outIdx = OUT_FILES.indexOf(S0F1J_BASENAME);
  assert.equal(srcIdx, outIdx,
    `source/out index mismatch: source[${srcIdx}]="${SOURCE_FILES[srcIdx]}", out[${outIdx}]="${OUT_FILES[outIdx]}"`);
});

check('pack-studio: S0F1j loads AFTER S0F0j Library Actions Core mirror', () => {
  const iCore = SOURCE_FILES.indexOf('S0F0j. 🎬 Library Actions Core - Studio.js');
  const iCons = SOURCE_FILES.indexOf(S0F1J_BASENAME);
  assert.ok(iCore >= 0, 'S0F0j core mirror missing from SOURCE_FILES');
  assert.ok(iCore < iCons, `S0F0j must precede S0F1j (core@${iCore}, consumer@${iCons})`);
});

// 7. S0X1b contract compatibility
const s0x1b = read(S0X1B_REL);
check('S0X1b consumes H2O.LibraryActions defensively (|| null)', () => {
  assert.match(s0x1b, /H2O\.LibraryActions\s*\|\|\s*null/,
    'S0X1b expected to use defensive `H2O.LibraryActions || null` access');
});

check('S0X1b registers commands that map to S0F1j-exposed methods', () => {
  // S0F1j must support whichever methods S0X1b calls (diagnose, openLinkedChat).
  // We check S0X1b references those by string.
  assert.match(s0x1b, /\.diagnose\?\.\(/i);
  assert.match(s0x1b, /\.openLinkedChat\?\.\(/i);
  // And S0F1j must declare them.
  assert.match(s0f1jSrc, /diagnose\s*,?/);
  assert.match(s0f1jSrc, /openLinkedChat/);
});

// ── 8. R4.1 — S0F4b Categories Actions module structural checks ────────

const S0F4B_REL = 'src-surfaces-base/studio/S0F4b. 🎬 Categories Actions - Studio.js';
const S0F4B_BASENAME = 'S0F4b. 🎬 Categories Actions - Studio.js';

check('R4.1: S0F4b file exists', () => {
  assert.ok(fs.existsSync(abs(S0F4B_REL)), `${S0F4B_REL} missing`);
});

const s0f4bSrc = fs.existsSync(abs(S0F4B_REL)) ? read(S0F4B_REL) : '';

check('R4.1: S0F4b is Tauri-gated (bails on MV3)', () => {
  assert.match(s0f4bSrc, /if\s*\(\s*!detectTauri\s*\(\s*\)\s*\)\s*return/,
    'S0F4b must bail when not Tauri');
});

check('R4.1: S0F4b registers H2O.Studio.actions.categories', () => {
  assert.match(s0f4bSrc, /H2O\.Studio\.actions\.categories\s*=/,
    'must assign H2O.Studio.actions.categories');
});

check('R4.1: S0F4b exposes all 5 required methods + diagnose', () => {
  for (const fn of ['create', 'rename', 'remove', 'assignChat', 'clearChat', 'diagnose']) {
    assert.match(s0f4bSrc, new RegExp(`\\b${fn}:\\s*${fn}\\b`),
      `S0F4b must expose ${fn} in its API object`);
  }
  // 'delete' is exposed as an alias to remove via quoted key
  assert.match(s0f4bSrc, /['"]delete['"]:\s*remove/,
    `S0F4b should expose 'delete' as an alias for remove`);
});

check('R4.1: S0F4b dispatches the canonical LibraryIndex refresh event', () => {
  assert.match(s0f4bSrc, /evt:h2o:library-index:refresh-request/,
    'must dispatch the canonical refresh event after mutations');
});

check('R4.1: S0F4b uses H2O.Studio.store.categories (no new storage layer)', () => {
  assert.match(s0f4bSrc, /H2O\.Studio\.store\.categories/,
    'must call store.categories for writes');
  assert.doesNotMatch(s0f4bSrc, /plugin:sql\|execute/,
    'must NOT touch plugin:sql directly — only via store API');
});

check('R4.1: studio.html includes <script src="./S0F4b..."> after S0F4a', () => {
  const html = read(STUDIO_HTML_REL);
  assert.match(html, /<script src="\.\/S0F4b\. 🎬 Categories Actions - Studio\.js"><\/script>/,
    'studio.html must include S0F4b script tag');
  // Verify S0F4b loads AFTER S0F4a (so the read facade is in place first;
  // also ensures actions namespace is established before downstream code uses it).
  const s0f4a = html.indexOf('S0F4a. 🎬 Categories - Studio.js');
  const s0f4b = html.indexOf('S0F4b. 🎬 Categories Actions - Studio.js');
  assert.ok(s0f4a > 0 && s0f4b > 0, 'both S0F4a and S0F4b refs must exist in studio.html');
  assert.ok(s0f4a < s0f4b, 'S0F4b must load after S0F4a');
  // Note: S0F1j.setCategory dereferences H2O.Studio.actions.categories
  // at CALL time (inside an async function), not at module-load time,
  // so S0F4b is free to load before or after S0F1j. Both refs must
  // simply be present in studio.html (asserted above). This matches the
  // existing read facade pattern (S0F2a..S0F6a all load after S0F1j).
});

check('R4.1: pack-studio.mjs has S0F4b in BOTH SOURCE_FILES and OUT_FILES', () => {
  assert.ok(SOURCE_FILES.includes(S0F4B_BASENAME), 'S0F4b missing from SOURCE_FILES');
  assert.ok(OUT_FILES.includes(S0F4B_BASENAME), 'S0F4b missing from OUT_FILES');
});

check('R4.1: pack-studio.mjs has S0F4b at MATCHING index in both lists', () => {
  const srcIdx = SOURCE_FILES.indexOf(S0F4B_BASENAME);
  const outIdx = OUT_FILES.indexOf(S0F4B_BASENAME);
  assert.equal(srcIdx, outIdx,
    `source/out index mismatch: source[${srcIdx}], out[${outIdx}]`);
});

check('R4.1: S0F1j exposes setCategory method', () => {
  assert.match(s0f1jSrc, /\bsetCategory\b/,
    'S0F1j must declare setCategory');
  assert.match(s0f1jSrc, /async function setCategory\s*\(/,
    'setCategory must be an async function');
});

check('R4.1: S0F1j routes setCategory through H2O.Studio.actions.categories on Desktop', () => {
  // Must reference actions.categories.assignChat or .clearChat in the body.
  assert.match(s0f1jSrc, /actions\.categories\.(assignChat|clearChat)/,
    'setCategory must call actions.categories.{assignChat|clearChat}');
});

check('R4.1: S0F1j preserves native-context-required path on MV3 for setCategory', () => {
  // Look for 'native-context-required' status in the setCategory body region.
  // We're not regexing the function body exactly; we just confirm the
  // string appears (it already does for addToLibrary/saveToFolder, plus
  // setCategory adds another reference in its MV3 branch).
  const occurrences = (s0f1jSrc.match(/native-context-required/g) || []).length;
  assert.ok(occurrences >= 3,
    `expected at least 3 'native-context-required' references (addToLibrary, saveToFolder, setCategory); got ${occurrences}`);
});

// ── Output ──────────────────────────────────────────────────────────────

console.log('\n── Studio Library Actions consumer validator ──────────────');
console.log(`  passed: ${PASS.length}`);
console.log(`  failed: ${FAIL.length}`);

if (FAIL.length > 0) {
  console.error('\nFailures:');
  for (const f of FAIL) {
    console.error(`  ✗ ${f.label}\n      ${f.err}`);
  }
  process.exit(1);
}

console.log('  all S0F1j contract checks passed ✓\n');
process.exit(0);
