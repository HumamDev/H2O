#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const J0_CONTRACT = 'release-evidence/2026-06-24/saved-chat-archive-phase-j0-export-share-contract.md';
const EXPORT_BUNDLE = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const RECOVERY_VALIDATOR = 'tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs';
const IMPORT_HARNESS = 'tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs';
const STUDIO_ROOT = 'src-surfaces-base/studio';
const CAPABILITY_FILES = [
  'apps/studio/desktop/src-tauri/capabilities/default.json',
  'apps/studio/desktop/src-tauri/capabilities/archive-cas.json',
];

const REQUIRED_STATUS_WORDS = [
  'verified',
  'export-ready',
  'exported',
  'destination-exists',
  'corrupted',
  'rejected',
  'read-error',
  'write-error',
];

const FORBIDDEN_EXPORT_RUNTIME_TOKENS = [
  'exportSavedChatPackage',
  'shareSavedChatPackage',
  'exportSavedChatArchivePackage',
  'archivePackageExporter',
  'savedChatPackageExporter',
  'copySavedChatPackageToExport',
];

const FORBIDDEN_CHROME_PACKAGE_BODY_TOKENS = [
  '.h2ochat',
  'archive/packages',
  'archive/assets',
  'writeSavedChatPackageV1',
  'buildSavedChatPackageV1',
  'materializeSavedChatArchiveRequestV1',
  'assetCas',
  'plugin:fs',
  'plugin:sql',
  'exportSavedChatPackage',
  'shareSavedChatPackage',
];

function repoPath(relPath) {
  return path.join(repoRoot, relPath);
}

function readRepo(relPath) {
  return fs.readFileSync(repoPath(relPath), 'utf8');
}

function existsRepo(relPath) {
  return fs.existsSync(repoPath(relPath));
}

function assertIncludes(haystack, needle, label = needle) {
  assert.ok(haystack.includes(needle), `missing required text: ${label}`);
}

function assertMatches(haystack, pattern, label = String(pattern)) {
  assert.ok(pattern.test(haystack), `missing required pattern: ${label}`);
}

function walkFiles(dirRel) {
  const root = repoPath(dirRel);
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        stack.push(abs);
        continue;
      }
      if (entry.isFile()) {
        out.push(path.relative(repoRoot, abs));
      }
    }
  }
  return out.sort();
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function collectWriteLikeCapabilityScopes(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectWriteLikeCapabilityScopes(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;

  const permissionName = String(
    value.identifier ?? value.permission ?? value.name ?? value.id ?? '',
  );
  const writeLike = /fs:.*(?:write|mkdir|rename|remove|delete)|(?:write|mkdir|rename|remove|delete)/i.test(
    permissionName,
  );

  if (writeLike) {
    out.push(...collectStrings(value.allow));
    out.push(...collectStrings(value.scope));
    out.push(...collectStrings(value.scopes));
  }

  for (const item of Object.values(value)) {
    collectWriteLikeCapabilityScopes(item, out);
  }
  return out;
}

function scanFilesForTokens(files, tokens) {
  const hits = [];
  for (const relPath of files) {
    const text = readRepo(relPath);
    for (const token of tokens) {
      if (text.includes(token)) {
        hits.push(`${relPath}: ${token}`);
      }
    }
  }
  return hits;
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('J.0 export/share contract exists', () => {
  assert.ok(existsRepo(J0_CONTRACT), `${J0_CONTRACT} does not exist`);
});

const j0 = readRepo(J0_CONTRACT);

check('J.0 is marked contract-only and not implemented', () => {
  assertMatches(j0, /PHASE J\.0 CONTRACT\s*[—-]\s*NOT IMPLEMENTED/, 'PHASE J.0 CONTRACT - NOT IMPLEMENTED');
  assertIncludes(j0, 'No runtime, validator, capability');
});

check('J.0 recommends Desktop-only folder-copy export first', () => {
  assertIncludes(j0, 'Start with Desktop-only folder-copy export');
  assertIncludes(j0, 'already-verified `.h2ochat`');
  assertIncludes(j0, 'byte-identical copy');
});

check('J.0 defers zip format', () => {
  assertIncludes(j0, 'Do not implement zip first');
  assertIncludes(j0, 'J.4');
  assertIncludes(j0, 'zip / single-file');
});

check('J.0 defers cloud/WebDAV/sync/share integration', () => {
  assertIncludes(j0, 'Do not implement cloud / WebDAV / share-sheet integration first');
  assertIncludes(j0, 'No sync / WebDAV / cloud / native messaging');
});

check('J.0 defers restore/relink', () => {
  assertIncludes(j0, 'Do not implement restore / relink in Phase J');
  assertMatches(j0, /`restore`\s*\/ relink remains \*\*deferred\*\*/, 'restore/relink deferred wording');
});

check('J.0 requires package verification before export', () => {
  for (const text of [
    'inspectPackage',
    'verified',
    'manifest.json',
    'required files',
    'file hashes',
    'contentHash',
    'assets',
    'checked if present',
  ]) {
    assertIncludes(j0, text);
  }
});

check('J.0 defines destination safety', () => {
  for (const text of [
    'Explicit operator-selected destination',
    'No silent overwrite',
    'destination-exists',
    'bounded export root',
    '$HOME/H2O Studio Exports/',
    '$DOWNLOAD/**',
  ]) {
    assertIncludes(j0, text);
  }
});

check('J.0 preserves Desktop authority and Chrome body restrictions', () => {
  for (const text of [
    'Desktop-only',
    'Chrome **cannot** export / share a package body',
    'cannot** read',
    'the package / CAS body',
    'explicit export destination',
  ]) {
    assertIncludes(j0, text);
  }
});

check('J.0 defines export result/status vocabulary', () => {
  for (const status of REQUIRED_STATUS_WORDS) {
    assertIncludes(j0, status);
  }
});

check('J.0 distinguishes .h2ochat export from full-library bundle export', () => {
  for (const text of [
    'Full-bundle export is a DIFFERENT artifact',
    'h2o.studio.fullBundle.v2',
    'export-bundle.tauri.js',
    'single-`.h2ochat`-package',
  ]) {
    assertIncludes(j0, text);
  }
});

check('current runtime has no .h2ochat export/share action implementation', () => {
  const files = walkFiles(STUDIO_ROOT).filter((relPath) => relPath.endsWith('.js'));
  const hits = scanFilesForTokens(files, FORBIDDEN_EXPORT_RUNTIME_TOKENS);
  assert.deepEqual(hits, [], `unexpected export/share runtime tokens:\n${hits.join('\n')}`);
});

check('export-bundle.tauri.js remains full-library h2o.studio.fullBundle.v2 only', () => {
  const text = readRepo(EXPORT_BUNDLE);
  assertIncludes(text, 'h2o.studio.fullBundle.v2');
  assertIncludes(text, 'exportFullBundle');
  assertIncludes(text, 'exportLatestSyncBundle');
  assert.ok(!text.includes('.h2ochat'), 'export-bundle.tauri.js must not write .h2ochat packages');
  assert.ok(!text.includes('savedChatPackage'), 'export-bundle.tauri.js must not be treated as saved package export');
  assert.ok(!text.includes('archive/packages'), 'export-bundle.tauri.js must not target archive/packages');
});

check('Chrome/MV3 runtime has no package body export/share authority', () => {
  const chromeFiles = walkFiles(STUDIO_ROOT).filter((relPath) => (
    relPath.endsWith('.mv3.js') ||
    /service-worker|background/i.test(path.basename(relPath))
  ));
  const hits = scanFilesForTokens(chromeFiles, FORBIDDEN_CHROME_PACKAGE_BODY_TOKENS);
  assert.deepEqual(hits, [], `unexpected Chrome package-body authority tokens:\n${hits.join('\n')}`);
});

check('scanner/materializer/writer/importer behavior remains export-share unchanged', () => {
  const guardedFiles = [
    'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js',
    'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js',
    'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js',
    'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js',
  ].filter(existsRepo);
  const hits = scanFilesForTokens(guardedFiles, FORBIDDEN_EXPORT_RUNTIME_TOKENS);
  assert.deepEqual(hits, [], `unexpected export/share tokens in guarded runtime files:\n${hits.join('\n')}`);
});

check('current capabilities are not broadened for J.1 export/share', () => {
  const writeLikeScopes = [];
  for (const relPath of CAPABILITY_FILES) {
    assert.ok(existsRepo(relPath), `${relPath} does not exist`);
    const raw = readRepo(relPath);
    const json = JSON.parse(raw);
    writeLikeScopes.push(...collectWriteLikeCapabilityScopes(json).map((scope) => `${relPath}: ${scope}`));
    assert.ok(!raw.includes('H2O Studio Exports'), `${relPath} must not add export destination capability in J.1`);
  }
  const broadHomeWrites = writeLikeScopes.filter((scope) => scope.includes('$HOME/**'));
  const downloadWrites = writeLikeScopes.filter((scope) => scope.includes('$DOWNLOAD'));
  const exportRootWrites = writeLikeScopes.filter((scope) => scope.includes('H2O Studio Exports'));
  assert.deepEqual(broadHomeWrites, [], `broad HOME write-like capability found:\n${broadHomeWrites.join('\n')}`);
  assert.deepEqual(downloadWrites, [], `Downloads write-like capability found:\n${downloadWrites.join('\n')}`);
  assert.deepEqual(exportRootWrites, [], `export-root write-like capability found:\n${exportRootWrites.join('\n')}`);
});

check('J.1 remains no watcher/poller/daemon and no sync/WebDAV/cloud/native path', () => {
  for (const text of [
    'No watcher / daemon',
    'No sync / WebDAV / cloud / native messaging',
    'No `S0F0j` / `S0F1j` edits',
  ]) {
    assertIncludes(j0, text);
  }
});

check('existing recovery/import/export validator still preserves deferred export boundary', () => {
  const text = readRepo(RECOVERY_VALIDATOR);
  assertIncludes(text, 'no .h2ochat EXPORT / share runtime exists yet (deferred)');
  assertIncludes(text, 'export-bundle are full-bundle artifacts');
  assertIncludes(text, 'restore/relink deferred');
});

check('existing import recovery harness remains present for regression validation', () => {
  const text = readRepo(IMPORT_HARNESS);
  assertIncludes(text, 'saved-chat-archive-importer');
});

check('no S0F0j/S0F1j files are staged by J.1', () => {
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split(/\n+/).filter(Boolean);
  const forbidden = staged.filter((relPath) => /S0F0j|S0F1j/.test(relPath));
  assert.deepEqual(forbidden, [], `S0F0j/S0F1j files staged unexpectedly:\n${forbidden.join('\n')}`);
});

let failures = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error?.stack || String(error));
  }
}

if (failures > 0) {
  console.error(`\n${failures} saved chat archive export/share validation check(s) failed.`);
  process.exit(1);
}

console.log(`\nPASS saved chat archive export/share J.1 contract validation (${checks.length} checks)`);
