#!/usr/bin/env node
//
// W1b real transport loader registration validator.
//
// Proves the already-existing W1 real transport evaluator chain is registered
// in studio.html and both pack-studio explicit lists without introducing
// duplicate loader entries, write-authorizing tokens, or transport activation.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-05/real-transport-w1b-loader-registration.md';
const w1aValidator = 'tools/validation/sync/validate-real-transport-w1-console-implementation.mjs';
const dryRunCloseoutValidator =
  'tools/validation/sync/validate-real-webdav-cloud-relay-transport-dry-run-proof-closeout.mjs';

const expected = [
  'sync/real-transport-target-config.js',
  'sync/real-transport-kill-switch.js',
  'sync/real-transport-idempotency.js',
  'sync/real-transport-enqueue-boundary.js',
  'sync/real-transport-conflict-recovery.js',
  'sync/real-transport-sequence-export.js',
  'sync/real-transport-approval.js',
  'sync/real-transport-readiness.js',
  'sync/real-transport-dry-run.js',
  'sync/real-transport-console.js',
];

const w1ModulePaths = expected.map((rel) => `src-surfaces-base/studio/${rel}`);

const forbiddenTokens = [
  'fetch(',
  'XMLHttpRequest',
  'localStorage.setItem',
  'sqlExecute',
  'writeFile',
  'invoke(',
  'enqueuesRelay:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'productSyncReady:true',
  'transportReady:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
];

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

function hasForbiddenToken(source, token) {
  if (token === 'writeFile') return /(^|[^\w$])writeFile([^\w$]|$)/.test(String(source));
  return String(source).includes(token);
}

function assertOrdered(sequence, label) {
  for (let i = 1; i < sequence.length; i += 1) {
    assert.ok(sequence[i - 1] < sequence[i], `${label}: order mismatch at ${expected[i]}`);
  }
}

function assertCleanGitPath(rel) {
  const diff = execFileSync('git', ['diff', '--name-only', '--', rel], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  assert.equal(diff, '', `${rel}: unstaged changes present`);
  assert.equal(staged, '', `${rel}: staged changes present`);
}

function packLiteral(rel) {
  return `"${rel}"`;
}

function scriptLiteral(rel) {
  return `<script src="./${rel}"></script>`;
}

const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);
const evidence = read(evidencePath);
const packWebdavMatches = [...packStudio.matchAll(/"sync\/webdav-transport-gates\.js"/g)].map((m) => m.index);
assert.equal(packWebdavMatches.length, 2, 'pack-studio has two explicit WebDAV gate entries');

// ---------------------------------------------------------------------------
// Evidence and anchor checks.
// ---------------------------------------------------------------------------
for (const token of [
  'W1b loader registration is complete and remains non-writing',
  '826c4153ba944bda7c59910a35705e160d167159',
  'productSyncReady:false',
  'transportReady:false',
  'realWebDAVTransportAvailable:false',
  'no WebDAV/cloud/relay/CAS/file write',
  'no relay enqueue',
  'no export id mint',
  'no sequence burn',
]) {
  assertIncludes(evidence, token, 'evidence');
}

// ---------------------------------------------------------------------------
// studio.html registration checks.
// ---------------------------------------------------------------------------
for (const rel of expected) {
  assert.equal(countOccurrences(studioHtml, scriptLiteral(rel)), 1, `studio.html duplicate check ${rel}`);
}

const htmlWebdav = studioHtml.indexOf(scriptLiteral('sync/webdav-transport-gates.js'));
const htmlRelay = studioHtml.indexOf(scriptLiteral('sync/relay-idempotency-restart-proof-harness.js'));
const htmlIndexes = expected.map((rel) => studioHtml.indexOf(scriptLiteral(rel)));
assert.ok(htmlWebdav >= 0, 'studio.html WebDAV gate entry exists');
assert.ok(htmlRelay > htmlWebdav, 'studio.html relay proof follows WebDAV gate');
assert.ok(htmlIndexes[0] > htmlRelay, 'studio.html W1 entries follow transport/WebDAV gate area');
assertOrdered(htmlIndexes, 'studio.html W1 ordering');
assertIncludes(studioHtml, 'W1: real transport evaluator chain. Evaluate-only, non-writing, no', 'studio.html W1 comment');

// ---------------------------------------------------------------------------
// pack-studio registration checks for both explicit lists.
// ---------------------------------------------------------------------------
for (const rel of expected) {
  assert.equal(countOccurrences(packStudio, packLiteral(rel)), 2, `pack-studio duplicate/list check ${rel}`);
}

const firstPackSection = packStudio.slice(0, packWebdavMatches[1]);
const secondPackSection = packStudio.slice(packWebdavMatches[1]);

function assertPackSection(section, label) {
  const webdav = section.indexOf(packLiteral('sync/webdav-transport-gates.js'));
  const relay = section.indexOf(packLiteral('sync/relay-idempotency-restart-proof-harness.js'));
  const indexes = expected.map((rel) => section.indexOf(packLiteral(rel)));
  assert.ok(webdav >= 0, `${label}: WebDAV gate entry exists`);
  assert.ok(relay > webdav, `${label}: relay proof follows WebDAV gate`);
  assert.ok(indexes[0] > relay, `${label}: W1 entries follow transport/WebDAV gate area`);
  assertOrdered(indexes, `${label}: W1 ordering`);
}

assertPackSection(firstPackSection, 'pack-studio first explicit list');
assertPackSection(secondPackSection, 'pack-studio second explicit list');
assertIncludes(packStudio, 'W1: real transport evaluator chain. Evaluate-only dry-run/console', 'pack-studio W1 comment');

// ---------------------------------------------------------------------------
// Evaluate-only token scan and protected source checks.
// ---------------------------------------------------------------------------
for (const rel of w1ModulePaths) {
  const source = read(rel);
  for (const token of forbiddenTokens) {
    assert.ok(!hasForbiddenToken(source, token), `${rel}: forbidden token ${token}`);
  }
}

assertCleanGitPath(webdavGatesPath);

// W1b must not edit existing real-transport module bodies. The newly wired
// console module is allowed to exist from W1a but should not be dirty here.
for (const rel of w1ModulePaths) {
  assertCleanGitPath(rel);
}

// Re-run the core W1a and real dry-run proof closeout validators.
execFileSync('node', [w1aValidator], { cwd: root, stdio: 'inherit' });
execFileSync('node', [dryRunCloseoutValidator], { cwd: root, stdio: 'inherit' });

console.log('[real-transport-w1b] loader registration validator passed');
