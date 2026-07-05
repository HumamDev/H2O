#!/usr/bin/env node
//
// W2b real transport first-write preflight loader registration validator.
//
// Proves W2a is registered after the W1 real transport evaluator chain in
// studio.html and both pack-studio explicit lists, without changing evaluator
// bodies or introducing write-authorizing tokens.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-05/real-transport-w2b-loader-registration.md';
const w2aSourcePath = 'src-surfaces-base/studio/sync/real-transport-first-write-preflight.js';
const w2aImplementationValidator =
  'tools/validation/sync/validate-real-transport-w2-first-write-preflight-implementation.mjs';
const w1cValidator = 'tools/validation/sync/validate-real-transport-w1c-webview-proof.mjs';
const w1bValidator = 'tools/validation/sync/validate-real-transport-w1b-loader-registration.mjs';
const w1aValidator = 'tools/validation/sync/validate-real-transport-w1-console-implementation.mjs';

const expectedW1 = [
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

const w2aEntry = 'sync/real-transport-first-write-preflight.js';
const expectedAll = [...expectedW1, w2aEntry];
const realModulePaths = expectedAll.map((rel) => `src-surfaces-base/studio/${rel}`);

const forbiddenTokens = [
  'fetch(',
  'XMLHttpRequest',
  'localStorage.setItem',
  'sqlExecute',
  'writeFile',
  'invoke(',
  'crypto',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'enqueuesRelay:true',
  'productSyncReady:true',
  'transportReady:true',
  'transportReadyFlipAuthorized:true',
  'realWebDAVTransportAvailable:true',
  'realTransportApprovalAccepted:true',
  'oneShotTokenMinted:true',
  'standingAuthority:true',
  'realWriteExecuted:true',
  'durableStoreCreated:true',
  'bootResumeDispatch:true',
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
  return String(value).replace(/\s+/g, '');
}

function countOccurrences(haystack, needle) {
  return String(haystack).split(needle).length - 1;
}

function scriptLiteral(rel) {
  return `<script src="./${rel}"></script>`;
}

function packLiteral(rel) {
  return `"${rel}"`;
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertOrdered(indexes, names, label) {
  for (let i = 1; i < indexes.length; i += 1) {
    assert.ok(indexes[i - 1] < indexes[i], `${label}: order mismatch at ${names[i]}`);
  }
}

function gitClean(rel) {
  const unstaged = execFileSync('git', ['diff', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(unstaged, '', `${rel}: unstaged changes present`);
  assert.equal(staged, '', `${rel}: staged changes present`);
}

function realTransportScriptsFromHtml(html) {
  return [...html.matchAll(/<script\s+src="\.\/(sync\/real-transport-[^"]+\.js)"><\/script>/g)].map((m) => m[1]);
}

function packSections(packStudio) {
  const webdavMatches = [...packStudio.matchAll(/"sync\/webdav-transport-gates\.js"/g)].map((m) => m.index);
  assert.equal(webdavMatches.length, 2, 'pack-studio has two explicit WebDAV gate entries');
  return [
    packStudio.slice(0, webdavMatches[1]),
    packStudio.slice(webdavMatches[1]),
  ];
}

function realTransportEntriesFromPackSection(section) {
  return [...section.matchAll(/"sync\/real-transport-[^"]+\.js"/g)].map((m) => m[0].slice(1, -1));
}

function assertPackSection(section, label) {
  const entries = realTransportEntriesFromPackSection(section);
  assert.deepEqual(entries, expectedAll, `${label}: real-transport census/order`);
  for (const rel of expectedAll) {
    assert.equal(countOccurrences(section, packLiteral(rel)), 1, `${label}: duplicate check ${rel}`);
  }
  const webdav = section.indexOf(packLiteral('sync/webdav-transport-gates.js'));
  const relay = section.indexOf(packLiteral('sync/relay-idempotency-restart-proof-harness.js'));
  const indexes = expectedAll.map((rel) => section.indexOf(packLiteral(rel)));
  assert.ok(webdav >= 0, `${label}: WebDAV gate entry exists`);
  assert.ok(relay > webdav, `${label}: relay proof follows WebDAV gate`);
  assert.ok(indexes[0] > relay, `${label}: W1 entries follow transport/WebDAV gate area`);
  assert.ok(indexes[expectedAll.length - 1] > indexes[expectedAll.length - 2], `${label}: W2a follows W1 console`);
  assertOrdered(indexes, expectedAll, `${label}: W1/W2 ordering`);
}

const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);
const evidence = read(evidencePath);

for (const token of [
  'W2b loader registration is complete and remains non-writing',
  'b08bb910791bdfd89c8a823da8987154787fd0d2',
  'sync/real-transport-first-write-preflight.js',
  'W1b validator was minimally amended',
  'productSyncReady:false',
  'transportReady:false',
  'no token mint',
  'W2c live webview closeout was NOT performed',
  'No operator artifact exists yet',
]) {
  assertIncludes(evidence, token, `evidence ${token}`);
}

// studio.html checks.
assert.equal(countOccurrences(studioHtml, scriptLiteral(w2aEntry)), 1, 'studio.html W2a appears exactly once');
for (const rel of expectedW1) {
  assert.equal(countOccurrences(studioHtml, scriptLiteral(rel)), 1, `studio.html W1 remains once ${rel}`);
}
const htmlEntries = realTransportScriptsFromHtml(studioHtml);
assert.deepEqual(htmlEntries, expectedAll, 'studio.html full real-transport script census/order');
const htmlIndexes = expectedAll.map((rel) => studioHtml.indexOf(scriptLiteral(rel)));
assertOrdered(htmlIndexes, expectedAll, 'studio.html W1/W2 ordering');
assert.ok(studioHtml.indexOf(scriptLiteral(w2aEntry)) > studioHtml.indexOf(scriptLiteral('sync/real-transport-console.js')),
  'studio.html W2a follows W1 console');
assertIncludes(studioHtml, 'W2a: real transport first-write preflight substrate', 'studio.html W2a comment');

// pack-studio checks.
assert.equal(countOccurrences(packStudio, packLiteral(w2aEntry)), 2, 'pack-studio W2a appears once per list');
for (const rel of expectedW1) {
  assert.equal(countOccurrences(packStudio, packLiteral(rel)), 2, `pack-studio W1 remains in both lists ${rel}`);
}
for (const [index, section] of packSections(packStudio).entries()) {
  assertPackSection(section, `pack-studio explicit list ${index + 1}`);
}

// W2a source remains evaluate-only/non-writing. Whitespace is normalized so
// compact and spaced flag forms are both caught.
const w2aSource = read(w2aSourcePath);
const compactSource = compact(w2aSource);
for (const token of forbiddenTokens) {
  assert.ok(!compactSource.includes(compact(token)), `W2a source forbidden token ${token}`);
}

// Harness paths are not loader script entries.
assert.ok(!studioHtml.includes('tools/validation/sync/run-real-transport-first-write-preflight.mjs'),
  'studio.html must not register W2a harness');
assert.ok(!studioHtml.includes('tools/'), 'studio.html must not register tools path');
assert.ok(!packStudio.includes('tools/validation/sync/run-real-transport-first-write-preflight.mjs'),
  'pack-studio must not register W2a harness');

// W2c/W3 are intentionally absent in this slice.
assert.ok(!fs.existsSync(path.join(root, 'release-evidence/2026-07-05/real-transport-w2c-webview-proof.md')),
  'W2c evidence must not exist');
assert.equal(execFileSync('git', ['ls-files', 'src-surfaces-base/studio/sync'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((p) => /real-transport-w3|first-real-write|real-write-apply/.test(p)).length, 0,
  'W3 module/file must not exist');

gitClean(webdavGatesPath);
for (const rel of realModulePaths) gitClean(rel);

execFileSync('node', [w2aImplementationValidator], { cwd: root, stdio: 'inherit' });
execFileSync('node', [w1cValidator], { cwd: root, stdio: 'inherit' });
execFileSync('node', [w1bValidator], { cwd: root, stdio: 'inherit' });
execFileSync('node', [w1aValidator], { cwd: root, stdio: 'inherit' });

console.log('[real-transport-w2b] loader registration validator passed');
