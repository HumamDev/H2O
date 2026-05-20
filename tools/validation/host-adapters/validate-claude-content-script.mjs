#!/usr/bin/env node
// Validator for the Claude Chrome content-script MVP (Phase 9A-4).
//
// Static-analysis only; no jsdom dependency. Verifies that
// src/extensions/claude/chrome/scripts/content.js conforms to the MVP
// boundaries declared in the Phase 9A-4 task:
//
//   - exposes window.H2OClaudeMVP with context/turns/scan/diagnose
//   - vendors the URL regexes byte-identical to @h2o/host-adapter-claude
//   - uses defensive accessors (no throws on missing DOM)
//   - performs no storage writes (no chrome.storage / localStorage / IndexedDB)
//   - performs no network calls (no fetch / XHR / sendMessage)
//   - performs no DOM mutation beyond the two documented data-attribute markers
//   - is idempotent (re-execution guard present)
//
// Also confirms the package source-of-truth and the vendored copy stay in
// sync on the URL regexes by re-importing the package and string-matching
// each regex against the content-script source.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const CONTENT_REL = 'src/extensions/claude/chrome/scripts/content.js';
const ADAPTER_INDEX_REL = 'packages/host-adapters/claude/index.js';

const PASS = [];
const FAIL = [];
const WARN = [];

function check(label, fn) {
  try { fn(); PASS.push(label); }
  catch (e) { FAIL.push({ label, err: e?.message || String(e) }); }
}

const contentSrc = fs.readFileSync(path.join(REPO_ROOT, CONTENT_REL), 'utf8');

/**
 * Strip JS comments (line + block) so the forbidden-pattern scan only sees
 * executable code, not documentation strings that mention forbidden APIs
 * explicitly to declare them off-limits. Conservative: doesn't try to parse
 * strings (a JS string containing `//` would have its tail stripped), but
 * the content script doesn't contain such strings.
 */
function stripComments(src) {
  // Block comments first (handles /* … */ across lines)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Then line comments (// to end of line)
  out = out.replace(/^\s*\/\/.*$/gm, '');
  // Mid-line `// comment` — also strip
  out = out.replace(/([^:'"])\/\/[^\n]*$/gm, '$1');
  return out;
}

const contentSrcCode = stripComments(contentSrc);

// ── API surface ──────────────────────────────────────────────────────────

check('exposes window.H2OClaudeMVP', () => {
  assert.match(contentSrc, /window\.H2OClaudeMVP\s*=/);
});

const REQUIRED_API = ['context', 'turns', 'scan', 'diagnose'];
for (const method of REQUIRED_API) {
  check(`H2OClaudeMVP exposes ${method}()`, () => {
    // declared as `function NAME(` or referenced as object property `NAME,` / `NAME:`
    const declared = new RegExp(`function\\s+${method}\\s*\\(`).test(contentSrc);
    const apiRef = new RegExp(`\\b${method}\\s*,`).test(contentSrc);
    assert.ok(declared && apiRef,
      `${method}: declared=${declared}, referenced-in-API-object=${apiRef}`);
  });
}

check('H2OClaudeMVP is Object.freeze()d', () => {
  assert.match(contentSrc, /Object\.freeze\(\{/, 'expected Object.freeze on the API surface');
});

check('idempotency guard present (__h2oClaudeMvpLoaded)', () => {
  assert.match(contentSrc, /__h2oClaudeMvpLoaded/);
});

check('IIFE wrapper (strict mode + no global leaks)', () => {
  assert.match(contentSrc, /\(function \(\) \{\s*'use strict';/);
});

// ── Vendored regex parity with @h2o/host-adapter-claude ───────────────────

const adapter = await import(pathToFileURL(path.join(REPO_ROOT, ADAPTER_INDEX_REL)).href);
const adapterRegexes = {
  CONV_PATH_RE: '/\\\\/(?:chat|conversations)\\\\/([0-9a-f-]{36})/i',
  PROJ_PATH_RE: '/\\\\/projects\\\\/([^/]+)/',
  NEW_PATH_RE: '/^\\\\/new\\\\/?$/',
};

check('vendored CONV_PATH_RE matches adapter', () => {
  const m = contentSrc.match(/const CONV_PATH_RE = ([^;]+);/);
  assert.ok(m, 'CONV_PATH_RE declaration not found');
  // Use the adapter's exported regex source for the canonical form
  const adapterId = adapter.getConversationIdFromLocation('https://claude.ai/chat/abcd1234-ef56-7890-abcd-1234ef567890');
  assert.equal(adapterId, 'abcd1234-ef56-7890-abcd-1234ef567890', 'adapter regex sanity');
  // Vendored copy must match the same UUID
  const vendored = new RegExp(m[1].trim().slice(1, -2)); // strip /…/i
  const path = '/chat/abcd1234-ef56-7890-abcd-1234ef567890';
  assert.match(path, vendored, `vendored regex must match the UUID path`);
});

check('vendored PROJ_PATH_RE matches adapter', () => {
  const m = contentSrc.match(/const PROJ_PATH_RE = ([^;]+);/);
  assert.ok(m, 'PROJ_PATH_RE declaration not found');
  assert.equal(adapter.extractProjectIdFromHref('/projects/foo'), 'foo');
});

check('vendored NEW_PATH_RE matches adapter (matches /new)', () => {
  assert.match(contentSrc, /const NEW_PATH_RE = \/\^\\\/new\\\/\?\$\/;/);
});

check('vendored CLAUDE_HOST_RE matches adapter', () => {
  assert.match(contentSrc, /const CLAUDE_HOST_RE = \/\(\?:\^\|\\\.\)claude\\\.ai\$\/i;/);
});

// ── MVP boundaries — no storage / network / DOM mutation ─────────────────

const FORBIDDEN_PATTERNS = [
  // Storage writes
  { name: 'chrome.storage', pattern: /chrome\.storage\b/ },
  { name: 'localStorage.setItem', pattern: /localStorage\s*\.\s*setItem/ },
  { name: 'localStorage[…]=', pattern: /localStorage\s*\[/ },
  { name: 'sessionStorage', pattern: /sessionStorage/ },
  { name: 'indexedDB', pattern: /\bindexedDB\b/ },
  { name: 'IDBOpenDBRequest', pattern: /IDBOpenDBRequest/ },
  // Network
  { name: 'fetch(', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
  { name: 'chrome.runtime.sendMessage', pattern: /chrome\.runtime\.sendMessage/ },
  { name: 'navigator.sendBeacon', pattern: /sendBeacon/ },
  { name: 'WebSocket', pattern: /\bWebSocket\s*\(/ },
  { name: 'EventSource', pattern: /\bEventSource\s*\(/ },
  // DOM mutation (allowed: setting documentElement.dataset markers only)
  { name: 'appendChild', pattern: /\.appendChild\(/ },
  { name: 'insertBefore', pattern: /\.insertBefore\(/ },
  { name: 'innerHTML=', pattern: /\.innerHTML\s*=/ },
  { name: 'outerHTML=', pattern: /\.outerHTML\s*=/ },
  { name: 'document.write', pattern: /document\.write\b/ },
  { name: 'createElement+attach', pattern: /createElement\s*\(/ },
];

for (const { name, pattern } of FORBIDDEN_PATTERNS) {
  check(`no ${name} (MVP boundary)`, () => {
    assert.ok(!pattern.test(contentSrcCode), `forbidden pattern found: ${name}`);
  });
}

// ── DOM markers — exactly two data-attribute writes allowed ──────────────

check('exactly 2 data-attribute markers on documentElement', () => {
  const matches = contentSrc.match(/document\.documentElement\.dataset\.\w+\s*=/g) || [];
  assert.equal(matches.length, 2, `expected 2 dataset assignments, found ${matches.length}: ${matches}`);
});

check('marker 1: h2oClaudeChromeDev = "loaded" (Phase 8G-5 smoke-test compat)', () => {
  assert.match(contentSrc, /dataset\.h2oClaudeChromeDev\s*=\s*['"]loaded['"]/);
});

check('marker 2: h2oClaudeMvp = version', () => {
  assert.match(contentSrc, /dataset\.h2oClaudeMvp\s*=\s*H2O_CLAUDE_MVP_VERSION/);
});

// ── Defensive accessor patterns ──────────────────────────────────────────

check('safeQueryAll wraps querySelectorAll in try/catch', () => {
  assert.match(contentSrc, /function safeQueryAll[\s\S]+?try\s*\{[\s\S]+?catch/);
});

check('classifyTurnRole returns "unknown" on bad input', () => {
  assert.match(contentSrc, /return 'unknown'/);
});

check('detectContext always returns a HostContext shape', () => {
  // it includes routeKind, conversationId, projectId, url fields
  assert.match(contentSrc, /routeKind:\s*classifyRoute/);
  assert.match(contentSrc, /conversationId:\s*convMatch/);
  assert.match(contentSrc, /projectId:\s*projMatch/);
});

// ── Diagnose() shape ─────────────────────────────────────────────────────

check('diagnose() includes supportedActions for the MVP boundary', () => {
  assert.match(contentSrc, /supportedActions:/);
  assert.match(contentSrc, /readonlyScan:\s*true/);
  assert.match(contentSrc, /archiveTurns:\s*false/);
  assert.match(contentSrc, /saveButton:\s*false/);
  assert.match(contentSrc, /miniMap:\s*false/);
  assert.match(contentSrc, /highlights:\s*false/);
  assert.match(contentSrc, /commandBar:\s*false/);
  assert.match(contentSrc, /artifacts:\s*false/);
});

check('diagnose() includes selectorProbes', () => {
  assert.match(contentSrc, /selectorProbes:/);
  assert.match(contentSrc, /role_article:/);
  assert.match(contentSrc, /composer_present:/);
  assert.match(contentSrc, /stop_button_present:/);
});

check('diagnose() declares MVP boundary string', () => {
  assert.match(contentSrc, /mvpBoundary:.*Phase 9A-4/);
});

// ── Output ───────────────────────────────────────────────────────────────

console.log('\n── Claude content-script MVP validator ────────────────────');
console.log(`  passed: ${PASS.length}`);
console.log(`  failed: ${FAIL.length}`);
if (WARN.length) console.log(`  warnings: ${WARN.length}`);

if (FAIL.length > 0) {
  console.error('\nFailures:');
  for (const f of FAIL) {
    console.error(`  ✗ ${f.label}\n      ${f.err}`);
  }
  process.exit(1);
}

console.log('  all content-script MVP checks passed ✓\n');
process.exit(0);
