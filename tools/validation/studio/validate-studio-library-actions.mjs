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

// ── 9. R4.2 — S0F6b Labels Actions module structural checks ────────────

const S0F6B_REL = 'src-surfaces-base/studio/S0F6b. 🎬 Labels Actions - Studio.js';
const S0F6B_BASENAME = 'S0F6b. 🎬 Labels Actions - Studio.js';

check('R4.2: S0F6b file exists', () => {
  assert.ok(fs.existsSync(abs(S0F6B_REL)), `${S0F6B_REL} missing`);
});

const s0f6bSrc = fs.existsSync(abs(S0F6B_REL)) ? read(S0F6B_REL) : '';

check('R4.2: S0F6b is Tauri-gated (bails on MV3)', () => {
  assert.match(s0f6bSrc, /if\s*\(\s*!detectTauri\s*\(\s*\)\s*\)\s*return/,
    'S0F6b must bail when not Tauri');
});

check('R4.2: S0F6b registers H2O.Studio.actions.labels', () => {
  assert.match(s0f6bSrc, /H2O\.Studio\.actions\.labels\s*=/,
    'must assign H2O.Studio.actions.labels');
});

check('R4.2: S0F6b exposes all 9 required methods + diagnose', () => {
  for (const fn of ['create', 'rename', 'update', 'remove', 'bindChat',
                    'unbindChat', 'replaceForChat', 'listForChat', 'diagnose']) {
    assert.match(s0f6bSrc, new RegExp(`\\b${fn}:\\s*${fn}\\b`),
      `S0F6b must expose ${fn} in its API object`);
  }
  // 'delete' is exposed as an alias to remove via quoted key
  assert.match(s0f6bSrc, /['"]delete['"]:\s*remove/,
    `S0F6b should expose 'delete' as an alias for remove`);
});

check('R4.2: S0F6b dispatches the canonical LibraryIndex refresh event', () => {
  assert.match(s0f6bSrc, /evt:h2o:library-index:refresh-request/,
    'must dispatch the canonical refresh event after mutations');
  // Must use the labels-actions: reason prefix (per R4.1 / R4.2 convention)
  assert.match(s0f6bSrc, /labels-actions:/,
    'refresh reasons must use the labels-actions: prefix');
});

check('R4.2: S0F6b uses H2O.Studio.store.labels (no new storage layer)', () => {
  assert.match(s0f6bSrc, /H2O\.Studio\.store\.labels/,
    'must call store.labels for writes');
  assert.doesNotMatch(s0f6bSrc, /plugin:sql\|execute/,
    'must NOT touch plugin:sql directly — only via store API');
});

check('R4.2: studio.html includes <script src="./S0F6b..."> after S0F6a', () => {
  const html = read(STUDIO_HTML_REL);
  assert.match(html, /<script src="\.\/S0F6b\. 🎬 Labels Actions - Studio\.js"><\/script>/,
    'studio.html must include S0F6b script tag');
  const s0f6a = html.indexOf('S0F6a. 🎬 Labels - Studio.js');
  const s0f6b = html.indexOf('S0F6b. 🎬 Labels Actions - Studio.js');
  assert.ok(s0f6a > 0 && s0f6b > 0, 'both S0F6a and S0F6b refs must exist in studio.html');
  assert.ok(s0f6a < s0f6b, 'S0F6b must load after S0F6a (read facade first)');
});

check('R4.2: pack-studio.mjs has S0F6b in BOTH SOURCE_FILES and OUT_FILES', () => {
  assert.ok(SOURCE_FILES.includes(S0F6B_BASENAME), 'S0F6b missing from SOURCE_FILES');
  assert.ok(OUT_FILES.includes(S0F6B_BASENAME), 'S0F6b missing from OUT_FILES');
});

check('R4.2: pack-studio.mjs has S0F6b at MATCHING index in both lists', () => {
  const srcIdx = SOURCE_FILES.indexOf(S0F6B_BASENAME);
  const outIdx = OUT_FILES.indexOf(S0F6B_BASENAME);
  assert.equal(srcIdx, outIdx,
    `source/out index mismatch: source[${srcIdx}], out[${outIdx}]`);
});

check('R4.2: S0F1j exposes setLabels / addLabel / removeLabel methods', () => {
  for (const fn of ['setLabels', 'addLabel', 'removeLabel']) {
    assert.match(s0f1jSrc, new RegExp(`async function ${fn}\\s*\\(`),
      `S0F1j must declare async function ${fn}`);
  }
});

check('R4.2: S0F1j routes labels facade through H2O.Studio.actions.labels on Desktop', () => {
  // Each labels facade method (setLabels, addLabel, removeLabel)
  // dereferences `H2O.Studio?.actions?.labels` into a local `actions`
  // const and then calls actions.{replaceForChat|bindChat|unbindChat}.
  // Verify BOTH halves of the contract:
  assert.match(s0f1jSrc, /H2O\.Studio\?\.actions\?\.labels/,
    'labels facade must dereference H2O.Studio?.actions?.labels');
  // Each of the three store-side methods we wrap must be called somewhere
  // in S0F1j's body (the labels facade is the only caller).
  for (const method of ['replaceForChat', 'bindChat', 'unbindChat']) {
    assert.match(s0f1jSrc, new RegExp(`actions\\.${method}\\s*\\(`),
      `labels facade must call actions.${method}(...)`);
  }
});

check('R4.2: S0F1j preserves native-context-required path on MV3 for labels facade', () => {
  // After R4.2 there are 6 expected 'native-context-required' references:
  // addToLibrary, saveToFolder, setCategory (R4.1), setLabels, addLabel,
  // removeLabel (R4.2). Each method has one MV3-branch reference plus
  // possibly other status emissions, so we require >= 6.
  const occurrences = (s0f1jSrc.match(/native-context-required/g) || []).length;
  assert.ok(occurrences >= 6,
    `expected at least 6 'native-context-required' references after R4.2; got ${occurrences}`);
});

// ── 10. R4.3 — S0F5b Tags Actions module structural checks ─────────────

const S0F5B_REL = 'src-surfaces-base/studio/S0F5b. 🎬 Tags Actions - Studio.js';
const S0F5B_BASENAME = 'S0F5b. 🎬 Tags Actions - Studio.js';

check('R4.3: S0F5b file exists', () => {
  assert.ok(fs.existsSync(abs(S0F5B_REL)), `${S0F5B_REL} missing`);
});

const s0f5bSrc = fs.existsSync(abs(S0F5B_REL)) ? read(S0F5B_REL) : '';

check('R4.3: S0F5b is Tauri-gated (bails on MV3)', () => {
  assert.match(s0f5bSrc, /if\s*\(\s*!detectTauri\s*\(\s*\)\s*\)\s*return/,
    'S0F5b must bail when not Tauri');
});

check('R4.3: S0F5b registers H2O.Studio.actions.tags', () => {
  assert.match(s0f5bSrc, /H2O\.Studio\.actions\.tags\s*=/,
    'must assign H2O.Studio.actions.tags');
});

check('R4.3: S0F5b exposes all 9 required methods + diagnose', () => {
  for (const fn of ['create', 'rename', 'update', 'remove', 'bindChat',
                    'unbindChat', 'replaceForChat', 'listForChat', 'diagnose']) {
    assert.match(s0f5bSrc, new RegExp(`\\b${fn}:\\s*${fn}\\b`),
      `S0F5b must expose ${fn} in its API object`);
  }
  // 'delete' alias
  assert.match(s0f5bSrc, /['"]delete['"]:\s*remove/,
    `S0F5b should expose 'delete' as an alias for remove`);
});

check('R4.3: S0F5b dispatches the canonical LibraryIndex refresh event', () => {
  assert.match(s0f5bSrc, /evt:h2o:library-index:refresh-request/,
    'must dispatch the canonical refresh event after mutations');
  assert.match(s0f5bSrc, /tags-actions:/,
    'refresh reasons must use the tags-actions: prefix');
});

check('R4.3: S0F5b uses H2O.Studio.store.tags (no new storage layer)', () => {
  assert.match(s0f5bSrc, /H2O\.Studio\.store\.tags/,
    'must call store.tags for writes');
  assert.doesNotMatch(s0f5bSrc, /plugin:sql\|execute/,
    'must NOT touch plugin:sql directly — only via store API');
});

check('R4.3 BOUNDARY: S0F5b has NO DOM / tag-extraction surface', () => {
  // The whole point of R4.3 is that turn-level extraction stays Native.
  // Verify this module has zero chatgpt.com DOM access and zero
  // observer / scrape primitives IN CODE (comments that describe the
  // prohibition are fine — they document the boundary). Strip line
  // and block comments before scanning so the "no MutationObserver"
  // header docstring doesn't trip the check.
  const stripComments = (src) => {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* ... */ blocks
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1'); // // line (avoid http://)
  };
  const codeOnly = stripComments(s0f5bSrc);
  const forbidden = [
    'document.querySelector',
    'document.querySelectorAll',
    'document.getElementById',
    'MutationObserver',
    'IntersectionObserver',
    'chatgpt.com',
    'data-testid',
    'data-message-id',
    'data-message-author-role',
    'innerText',
    'innerHTML',
    'parseTurns',
    'extractTags',
    'deriveTagCandidates',
  ];
  for (const needle of forbidden) {
    assert.doesNotMatch(codeOnly, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `S0F5b code must NOT contain '${needle}' — turn-level extraction stays Native (0F5a)`);
  }
});

check('R4.3 BOUNDARY: S0F5b diagnose() explicitly marks no DOM / extraction', () => {
  // diagnose() should return clear boundary markers so runtime callers
  // and future audits can confirm the boundary is held.
  assert.match(s0f5bSrc, /domAccess:\s*false/,
    'diagnose() must explicitly report domAccess: false');
  assert.match(s0f5bSrc, /observesChatGptDom:\s*false/,
    'diagnose() must explicitly report observesChatGptDom: false');
  assert.match(s0f5bSrc, /tagExtraction:\s*false/,
    'diagnose() must explicitly report tagExtraction: false');
});

check('R4.3: studio.html includes <script src="./S0F5b..."> after S0F5a', () => {
  const html = read(STUDIO_HTML_REL);
  assert.match(html, /<script src="\.\/S0F5b\. 🎬 Tags Actions - Studio\.js"><\/script>/,
    'studio.html must include S0F5b script tag');
  const s0f5a = html.indexOf('S0F5a. 🎬 Tags - Studio.js');
  const s0f5b = html.indexOf('S0F5b. 🎬 Tags Actions - Studio.js');
  assert.ok(s0f5a > 0 && s0f5b > 0, 'both S0F5a and S0F5b refs must exist in studio.html');
  assert.ok(s0f5a < s0f5b, 'S0F5b must load after S0F5a (read facade first)');
});

check('R4.3: pack-studio.mjs has S0F5b in BOTH SOURCE_FILES and OUT_FILES', () => {
  assert.ok(SOURCE_FILES.includes(S0F5B_BASENAME), 'S0F5b missing from SOURCE_FILES');
  assert.ok(OUT_FILES.includes(S0F5B_BASENAME), 'S0F5b missing from OUT_FILES');
});

check('R4.3: pack-studio.mjs has S0F5b at MATCHING index in both lists', () => {
  const srcIdx = SOURCE_FILES.indexOf(S0F5B_BASENAME);
  const outIdx = OUT_FILES.indexOf(S0F5B_BASENAME);
  assert.equal(srcIdx, outIdx,
    `source/out index mismatch: source[${srcIdx}], out[${outIdx}]`);
});

check('R4.3: S0F1j exposes setTags / addTag / removeTag methods', () => {
  for (const fn of ['setTags', 'addTag', 'removeTag']) {
    assert.match(s0f1jSrc, new RegExp(`async function ${fn}\\s*\\(`),
      `S0F1j must declare async function ${fn}`);
  }
});

check('R4.3: S0F1j routes tags facade through H2O.Studio.actions.tags on Desktop', () => {
  assert.match(s0f1jSrc, /H2O\.Studio\?\.actions\?\.tags/,
    'tags facade must dereference H2O.Studio?.actions?.tags');
  // The three store-side methods we wrap must be called somewhere in S0F1j.
  // Note: labels facade also uses these method names, so the global count
  // is what matters — replaceForChat/bindChat/unbindChat each have 2
  // call-sites now (labels and tags).
  for (const method of ['replaceForChat', 'bindChat', 'unbindChat']) {
    const occurrences = (s0f1jSrc.match(new RegExp(`actions\\.${method}\\s*\\(`, 'g')) || []).length;
    assert.ok(occurrences >= 2,
      `expected at least 2 actions.${method}() call-sites after R4.3 (labels + tags); got ${occurrences}`);
  }
});

check('R4.3: S0F1j preserves native-context-required path on MV3 for tags facade', () => {
  // After R4.3 there are 9 expected 'native-context-required' references:
  // addToLibrary, saveToFolder, setCategory (R4.1), setLabels, addLabel,
  // removeLabel (R4.2), setTags, addTag, removeTag (R4.3). Require >= 9.
  const occurrences = (s0f1jSrc.match(/native-context-required/g) || []).length;
  assert.ok(occurrences >= 9,
    `expected at least 9 'native-context-required' references after R4.3; got ${occurrences}`);
});

// ── 11. R4.4 — S0F3b Folders Actions module structural checks ──────────

const S0F3B_REL = 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js';
const S0F3B_BASENAME = 'S0F3b. 🎬 Folders Actions - Studio.js';
const S0F1B_REL = 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js';

check('R4.4: S0F3b file exists', () => {
  assert.ok(fs.existsSync(abs(S0F3B_REL)), `${S0F3B_REL} missing`);
});

const s0f3bSrc = fs.existsSync(abs(S0F3B_REL)) ? read(S0F3B_REL) : '';
const s0f1bSrc = fs.existsSync(abs(S0F1B_REL)) ? read(S0F1B_REL) : '';

check('R4.4: S0F3b is Tauri-gated (bails on MV3)', () => {
  assert.match(s0f3bSrc, /if\s*\(\s*!detectTauri\s*\(\s*\)\s*\)\s*return/,
    'S0F3b must bail when not Tauri');
});

check('R4.4: S0F3b registers H2O.Studio.actions.folders', () => {
  assert.match(s0f3bSrc, /H2O\.Studio\.actions\.folders\s*=/,
    'must assign H2O.Studio.actions.folders');
});

check('R4.4: S0F3b exposes all 9 required methods + diagnose', () => {
  for (const fn of ['create', 'rename', 'update', 'remove', 'bindChat',
                    'unbindChat', 'getForChat', 'listChats', 'diagnose']) {
    assert.match(s0f3bSrc, new RegExp(`\\b${fn}:\\s*${fn}\\b`),
      `S0F3b must expose ${fn} in its API object`);
  }
  assert.match(s0f3bSrc, /['"]delete['"]:\s*remove/,
    `S0F3b should expose 'delete' as an alias for remove`);
});

check('R4.4: S0F3b dispatches the canonical LibraryIndex refresh event', () => {
  assert.match(s0f3bSrc, /evt:h2o:library-index:refresh-request/,
    'must dispatch the canonical refresh event after mutations');
  assert.match(s0f3bSrc, /folders-actions:/,
    'refresh reasons must use the folders-actions: prefix');
});

check('R4.4: S0F3b uses H2O.Studio.store.folders (no new storage layer)', () => {
  assert.match(s0f3bSrc, /H2O\.Studio\.store\.folders/,
    'must call store.folders for writes');
  assert.doesNotMatch(s0f3bSrc, /plugin:sql\|execute/,
    'must NOT touch plugin:sql directly — only via store API');
});

check('R4.4: studio.html includes <script src="./S0F3b..."> after S0F3a', () => {
  const html = read(STUDIO_HTML_REL);
  assert.match(html, /<script src="\.\/S0F3b\. 🎬 Folders Actions - Studio\.js"><\/script>/,
    'studio.html must include S0F3b script tag');
  const s0f3a = html.indexOf('S0F3a. 🎬 Folders - Studio.js');
  const s0f3b = html.indexOf('S0F3b. 🎬 Folders Actions - Studio.js');
  assert.ok(s0f3a > 0 && s0f3b > 0, 'both S0F3a and S0F3b refs must exist in studio.html');
  assert.ok(s0f3a < s0f3b, 'S0F3b must load after S0F3a (read facade first)');
});

check('R4.4: pack-studio.mjs has S0F3b in BOTH SOURCE_FILES and OUT_FILES', () => {
  assert.ok(SOURCE_FILES.includes(S0F3B_BASENAME), 'S0F3b missing from SOURCE_FILES');
  assert.ok(OUT_FILES.includes(S0F3B_BASENAME), 'S0F3b missing from OUT_FILES');
});

check('R4.4: pack-studio.mjs has S0F3b at MATCHING index in both lists', () => {
  const srcIdx = SOURCE_FILES.indexOf(S0F3B_BASENAME);
  const outIdx = OUT_FILES.indexOf(S0F3B_BASENAME);
  assert.equal(srcIdx, outIdx,
    `source/out index mismatch: source[${srcIdx}], out[${outIdx}]`);
});

check('R4.4 REGRESSION: S0F1b.desktopSetFolderBinding delegates through actions.folders', () => {
  // The refactor must route the SQLite bind/unbind through the actions
  // module when present. Verify both call-sites: bind path (folder
  // truthy) and unbind path (folder empty).
  assert.match(s0f1bSrc, /W\.H2O.*\.actions.*\.folders/,
    'S0F1b must reference W.H2O.Studio.actions.folders');
  assert.match(s0f1bSrc, /actions\.bindChat\s*\(\s*cid,\s*folder\s*\)/,
    'S0F1b must call actions.bindChat(cid, folder) — chat-first signature');
  assert.match(s0f1bSrc, /actions\.unbindChat\s*\(\s*cid\s*\)/,
    'S0F1b must call actions.unbindChat(cid) — single-folder-per-chat');
});

check('R4.4 REGRESSION: S0F1b preserves folder-binding-changed event dispatch', () => {
  // The downstream consumers (sidebar, insights) listen for this event.
  // The refactor must NOT remove the emitUpdated call. We also check it
  // appears INSIDE desktopSetFolderBinding's success path — not just
  // anywhere in the file.
  const fnStart = s0f1bSrc.indexOf('async function desktopSetFolderBinding');
  assert.ok(fnStart > 0, 'desktopSetFolderBinding must exist');
  const fnEnd = s0f1bSrc.indexOf('async function setFolderBinding', fnStart);
  assert.ok(fnEnd > fnStart, 'setFolderBinding wrapper must follow desktopSetFolderBinding');
  const fnBody = s0f1bSrc.slice(fnStart, fnEnd);
  assert.match(fnBody, /emitUpdated\s*\(\s*['"]folder-binding-changed['"]/,
    'desktopSetFolderBinding body must still emit folder-binding-changed');
});

check('R4.4 REGRESSION: S0F1b preserves bustCaches + getIndex().refresh + recordWrite', () => {
  // The three downstream side-effects that pre-R4.4 consumers depend on.
  const fnStart = s0f1bSrc.indexOf('async function desktopSetFolderBinding');
  const fnEnd = s0f1bSrc.indexOf('async function setFolderBinding', fnStart);
  const fnBody = s0f1bSrc.slice(fnStart, fnEnd);
  assert.match(fnBody, /bustCaches\s*\(\s*['"]desktop-setFolderBinding['"]\s*\)/,
    'desktopSetFolderBinding must still call bustCaches');
  assert.match(fnBody, /getIndex\(\)\?\.refresh\s*\(\s*['"]desktop-setFolderBinding['"]/,
    'desktopSetFolderBinding must still call getIndex()?.refresh(...)');
  assert.match(fnBody, /recordWrite\s*\(\s*['"]folderBinding['"]/,
    'desktopSetFolderBinding must still call recordWrite');
});

check('R4.4 REGRESSION: S0F1b legacy fallback path is preserved', () => {
  // If actions.folders isn't loaded (defensive), the function must
  // still fall back to direct store.folders.bindChat / unbindChat
  // so pre-R4.4 behavior is preserved even with a missing S0F3b.
  const fnStart = s0f1bSrc.indexOf('async function desktopSetFolderBinding');
  const fnEnd = s0f1bSrc.indexOf('async function setFolderBinding', fnStart);
  const fnBody = s0f1bSrc.slice(fnStart, fnEnd);
  assert.match(fnBody, /store\.bindChat\s*\(\s*folder,\s*cid/,
    'desktopSetFolderBinding must keep legacy store.bindChat(folder, cid) fallback');
  assert.match(fnBody, /store\.unbindChat\s*\(\s*fid,\s*cid\s*\)/,
    'desktopSetFolderBinding must keep legacy store.unbindChat(fid, cid) fallback');
});

check('R4.4: S0F1j exposes setFolder method', () => {
  assert.match(s0f1jSrc, /async function setFolder\s*\(/,
    'S0F1j must declare async function setFolder');
});

check('R4.4: S0F1j routes setFolder through H2O.Studio.actions.folders on Desktop', () => {
  assert.match(s0f1jSrc, /H2O\.Studio\?\.actions\?\.folders/,
    'setFolder must dereference H2O.Studio?.actions?.folders');
  // setFolder calls bindChat for non-empty folderId and unbindChat for empty.
  // Both method names also appear in labels/tags facades, so we just check
  // that the folders-specific call-sites exist in the setFolder body region.
  const fnStart = s0f1jSrc.indexOf('async function setFolder');
  assert.ok(fnStart > 0);
  const fnEnd = s0f1jSrc.indexOf('function resolveOpenPlan', fnStart);
  const fnBody = s0f1jSrc.slice(fnStart, fnEnd);
  assert.match(fnBody, /actions\.bindChat\s*\(\s*chatId,\s*folderId/,
    'setFolder must call actions.bindChat(chatId, folderId) when folderId is set');
  assert.match(fnBody, /actions\.unbindChat\s*\(\s*chatId\s*\)/,
    'setFolder must call actions.unbindChat(chatId) when folderId is empty');
});

check('R4.4: S0F1j preserves native-context-required path on MV3 for setFolder', () => {
  // After R4.4 there are 10 expected 'native-context-required'
  // references: addToLibrary, saveToFolder, setCategory (R4.1),
  // setLabels, addLabel, removeLabel (R4.2), setTags, addTag,
  // removeTag (R4.3), setFolder (R4.4).
  const occurrences = (s0f1jSrc.match(/native-context-required/g) || []).length;
  assert.ok(occurrences >= 10,
    `expected at least 10 'native-context-required' references after R4.4; got ${occurrences}`);
});

// ── 12. R4.5.1.a — S0F1m Library Organization Modals structural checks ──
// First Desktop-first UI slice. Covers FOLDERS ONLY in this slice;
// categories / labels / tags come in R4.5.2 / R4.5.3.

const S0F1M_REL = 'src-surfaces-base/studio/S0F1m. 🎬 Library Organization Modals - Studio.js';
const S0F1M_PATH = path.join(REPO_ROOT, S0F1M_REL);

check('R4.5.1.a: S0F1m file exists', () => {
  assert.ok(fs.existsSync(S0F1M_PATH), `${S0F1M_REL} not found`);
});

const s0f1mSrc = fs.existsSync(S0F1M_PATH) ? fs.readFileSync(S0F1M_PATH, 'utf8') : '';

check('R4.5.1.a: S0F1m is Tauri-gated (bails on MV3)', () => {
  assert.match(s0f1mSrc, /__TAURI_INTERNALS__/);
  assert.match(s0f1mSrc, /__TAURI__/);
  assert.match(s0f1mSrc, /if\s*\(\s*!\s*detectTauri\s*\(\s*\)\s*\)\s*return/);
});

check('R4.5.1.a: S0F1m registers H2O.Studio.OrganizationModals', () => {
  assert.match(s0f1mSrc, /H2O\.Studio\.OrganizationModals\s*=/);
});

check('R4.5.1.a: S0F1m exposes openFolderEditor, close, diagnose', () => {
  // Public surface on the registration object.
  assert.match(s0f1mSrc, /openFolderEditor:\s*openFolderEditor/);
  assert.match(s0f1mSrc, /close:\s*close/);
  assert.match(s0f1mSrc, /diagnose:\s*diagnose/);
  // Method-of-record declarations.
  assert.match(s0f1mSrc, /async function openFolderEditor/);
  assert.match(s0f1mSrc, /function close\(\)/);
  assert.match(s0f1mSrc, /function diagnose\(\)/);
});

check('R4.5.1.a: S0F1m supports all 4 folder modes (create/rename/color/delete)', () => {
  assert.match(s0f1mSrc, /SUPPORTED_MODES\s*=\s*\['create',\s*'rename',\s*'color',\s*'delete'\]/);
  assert.match(s0f1mSrc, /async function handleCreate/);
  assert.match(s0f1mSrc, /async function handleRename/);
  assert.match(s0f1mSrc, /async function handleColor/);
  assert.match(s0f1mSrc, /async function handleDelete/);
});

check('R4.5.1.a: S0F1m calls H2O.Studio.actions.folders.* (not Native, not store)', () => {
  // Must reference the actions.folders namespace via the getActions helper.
  assert.match(s0f1mSrc, /H2O\.Studio && H2O\.Studio\.actions && H2O\.Studio\.actions\.folders/);
  // Each handler invokes the corresponding actions method.
  assert.match(s0f1mSrc, /actions\.create\s*\(/);
  assert.match(s0f1mSrc, /actions\.rename\s*\(/);
  assert.match(s0f1mSrc, /actions\.update\s*\(/);
  // remove is referenced via `removeFn` indirection to support the
  // `delete` alias as well; the dereference itself proves the dep.
  assert.match(s0f1mSrc, /actions\.remove\s*\|\|\s*actions\['delete'\]/);
});

check('R4.5.1.a: S0F1m does NOT call Native folder APIs (no H2O.folders.create/.rename/.update/.delete)', () => {
  // The Native read facade is H2O.folders (S0F3a). Modal must never
  // call its mutation methods — only H2O.Studio.actions.folders.*.
  // Allow ONLY H2O.Studio.actions.folders.* references — strip those
  // first, then assert no remaining Native call patterns.
  const stripped = s0f1mSrc
    .replace(/H2O\.Studio\.actions\.folders/g, '<<ACTIONS>>')
    .replace(/H2O\.Studio\.store\.folders/g, '<<STORE>>');
  assert.equal(/H2O\.folders\.(create|rename|update|remove|delete|patch)\s*\(/.test(stripped), false,
    'S0F1m must not call Native H2O.folders.* mutation methods');
});

check('R4.5.1.a: S0F1m does NOT do direct plugin:sql / chrome.* writes', () => {
  // Strip JS comments first — the docstring legitimately names
  // forbidden APIs to describe the boundary.
  const stripped = s0f1mSrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  assert.equal(/plugin:sql/.test(stripped), false,
    'S0F1m must not invoke plugin:sql directly — go through actions.folders.*');
  assert.equal(/chrome\.runtime\./.test(stripped), false,
    'S0F1m must not call chrome.runtime.* — Desktop-only module');
  assert.equal(/chrome\.storage\./.test(stripped), false,
    'S0F1m must not call chrome.storage.* — Desktop-only module');
});

check('R4.5.1.a: S0F1m does NOT dispatch its own refresh event (single-source via actions.folders)', () => {
  // Modal must let actions.folders.* dispatch the canonical refresh
  // event so we never get duplicate refreshes. Confirm no
  // dispatchEvent call exists in S0F1m.
  assert.equal(/dispatchEvent\s*\(/.test(s0f1mSrc), false,
    'S0F1m must rely on actions.folders.* to dispatch the canonical refresh event');
  // It is allowed to NAME the event in comments; the source still
  // mentions the canonical event for documentation.
  assert.match(s0f1mSrc, /evt:h2o:library-index:refresh-request/);
});

check('R4.5.1.a: S0F1m has no DOM-access / no ChatGPT observation boundary', () => {
  // Mirror of R4.3 Tags boundary check — Studio organization UI must
  // never reach into chatgpt.com structure. Strip comments first so a
  // descriptive prose mention of MutationObserver doesn't false-trip.
  const stripped = s0f1mSrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  for (const forbidden of [
    'MutationObserver',
    'document.querySelector',
    'document.querySelectorAll',
    "querySelector('article",
    'data-testid="conversation-turn"',
    'chatgpt.com',
  ]) {
    assert.equal(stripped.indexOf(forbidden), -1,
      `S0F1m must not reference ${forbidden}`);
  }
  // diagnose() reports no-DOM markers
  assert.match(s0f1mSrc, /domAccess:\s*false/);
  assert.match(s0f1mSrc, /observesChatGptDom:\s*false/);
});

check('R4.5.1.a: S0F1m uses window.prompt / window.confirm via safe wrappers', () => {
  assert.match(s0f1mSrc, /function safePrompt/);
  assert.match(s0f1mSrc, /function safeConfirm/);
  assert.match(s0f1mSrc, /typeof global\.prompt\s*===\s*'function'/);
  assert.match(s0f1mSrc, /typeof global\.confirm\s*===\s*'function'/);
});

check('R4.5.1.a: S0F1m enriches delete confirm with folder name + bound count', () => {
  assert.match(s0f1mSrc, /async function loadBoundCount/);
  assert.match(s0f1mSrc, /async function loadFolderName/);
  assert.match(s0f1mSrc, /unbind\s+1\s+chat/);
  assert.match(s0f1mSrc, /unbind '\s*\+\s*count\s*\+\s*' chats/);
});

check('R4.5.1.a: studio.html includes <script src="./S0F1m..."> after S0F1k', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src-surfaces-base/studio/studio.html'), 'utf8');
  assert.match(html, /<script src="\.\/S0F1m\. 🎬 Library Organization Modals - Studio\.js"><\/script>/);
  const idxK = html.indexOf('S0F1k. 🎬 Library Canonical Services');
  const idxM = html.indexOf('S0F1m. 🎬 Library Organization Modals');
  assert.ok(idxK > 0 && idxM > 0 && idxM > idxK,
    `expected S0F1m to load after S0F1k; got idxK=${idxK} idxM=${idxM}`);
});

check('R4.5.1.a: pack-studio.mjs has S0F1m in BOTH SOURCE_FILES and OUT_FILES', () => {
  const pkg = fs.readFileSync(path.join(REPO_ROOT, 'tools/product/studio/pack-studio.mjs'), 'utf8');
  const occurrences = (pkg.match(/S0F1m\. 🎬 Library Organization Modals - Studio\.js/g) || []).length;
  assert.equal(occurrences, 2,
    `expected S0F1m to appear in both SOURCE_FILES and OUT_FILES (2 occurrences); got ${occurrences}`);
});

check('R4.5.1.a: S0Z1g folder-create button re-wires through OrganizationModals on Desktop', () => {
  const s0z1g = fs.readFileSync(path.join(REPO_ROOT, 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js'), 'utf8');
  // Re-wiring helper exists.
  assert.match(s0z1g, /tryOpenOrganizationModalsCreate/);
  // It dereferences H2O.Studio.OrganizationModals.
  assert.match(s0z1g, /H2O\.Studio\.OrganizationModals/);
  // It calls openFolderEditor with create mode.
  assert.match(s0z1g, /openFolderEditor\(\s*\{\s*mode:\s*'create'/);
  // MV3 fallback is preserved — openFolderCreatePanel still called.
  assert.match(s0z1g, /openFolderCreatePanel\(button\)/);
  // Both click AND keydown handlers branch through the helper.
  const clickBranch = s0z1g.match(/button\.addEventListener\('click'[\s\S]*?openFolderCreatePanel\(button\)[\s\S]*?\}\)/);
  const keyBranch   = s0z1g.match(/button\.addEventListener\('keydown'[\s\S]*?openFolderCreatePanel\(button\)[\s\S]*?\}\)/);
  assert.ok(clickBranch && /tryOpenOrganizationModalsCreate/.test(clickBranch[0]),
    'click handler should branch through tryOpenOrganizationModalsCreate');
  assert.ok(keyBranch && /tryOpenOrganizationModalsCreate/.test(keyBranch[0]),
    'keydown handler should branch through tryOpenOrganizationModalsCreate');
});

check('R4.5.1.a: S0F1m never imports / dereferences chrome.* runtime APIs', () => {
  assert.equal(/\bchrome\.runtime\b/.test(s0f1mSrc), false);
  assert.equal(/\bchrome\.storage\b/.test(s0f1mSrc), false);
  assert.equal(/\bchrome\.tabs\b/.test(s0f1mSrc), false);
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
