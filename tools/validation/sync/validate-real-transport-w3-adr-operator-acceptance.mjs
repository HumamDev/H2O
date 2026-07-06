#!/usr/bin/env node
//
// W3 ADR operator acceptance validator.
//
// Validates evidence-only operator acceptance of the W3.0 design ADR and
// proves no protected source, loader, capability, dependency, or transport
// files are modified by this slice.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-adr-operator-acceptance.md';
const designEvidencePath = 'release-evidence/2026-07-06/real-transport-w3-design-adr.md';
const receiptHash = 'sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function gitClean(rel) {
  const unstaged = execFileSync('git', ['diff', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(unstaged, '', `${rel}: unstaged changes present`);
  assert.equal(staged, '', `${rel}: staged changes present`);
}

function realTransportModules() {
  const dir = path.join(root, 'src-surfaces-base/studio/sync');
  return fs.readdirSync(dir)
    .filter((name) => /^real-transport-.*\.js$/.test(name))
    .sort()
    .map((name) => `src-surfaces-base/studio/sync/${name}`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);

assertIncludes(evidence, 'af886b2fb20d86e9f010ac702cc572b64403dbb3', 'W3.0 design commit');
assertIncludes(evidence, designEvidencePath, 'W3 design evidence path');

for (const token of [
  'W3.0 OPERATOR ADR ACCEPTANCE RECORDED',
  'Accepted ADR-RT-1',
  'dedicated Rust Tauri command path only',
  '`h2o_rt_capability_probe`',
  '`h2o_rt_first_write`',
  'no webview fetch',
  'no `tauri-plugin-http`',
  'no local helper process',
  'CSP remains unchanged',
  '`shell:allow-open` residual risk is accepted',
  'not part of sync transport',
]) {
  assertIncludes(flat, token, `ADR-RT-1 acceptance ${token}`);
}

for (const token of [
  'Accepted ADR-RT-2',
  '`credentialRefHash` is a descriptor hash',
  'not a secret hash',
  'credential material resolves in Rust only',
  'no secrets in JS, DevTools, repo, logs, or evidence',
  'no credential material in IPC responses',
  'zeroize resolved credential material',
]) {
  assertIncludes(flat, token, `ADR-RT-2 acceptance ${token}`);
}

for (const token of [
  'W3.1: read-only probe first',
  'W3.2: mock executor proof',
  'W3.3: gate-refused write command / loopback tests',
  'W3.4: sacrificial probe-object write',
  'W3.5: separately-approved payload write',
  'No later W3 phase is authorized by this acceptance',
]) {
  assertIncludes(evidence, token, `phase acceptance ${token}`);
}

for (const token of [
  'Accepted W3-F1',
  receiptHash,
  '2099-07-06T00:00:00.000Z',
  'fixture/mock-grade only',
  'must never authorize W3.4 or W3.5 real writes',
  'write-grade receipts require `expiryUtc <= 7 days from mint`',
]) {
  assertIncludes(flat, token, `W3-F1 acceptance ${token}`);
}

for (const token of [
  'no real write authorized',
  'no automatic sync',
  'no productSyncReady:true',
  'no transportReady:true',
  'no global realWebDAVTransportAvailable:true',
  'no fullBundle.v3',
  'no Chat Saving CAS',
  'no a950 cleanup',
  'W2 receipt alone never authorizes',
  'no blind retry',
  'no WebDAV/cloud/relay/CAS/file write',
  'no relay enqueue',
  'no outbox/ledger/store mutation',
  'no fullBundle.v3 start/mint',
  'no token/export id mint',
  'no sequence burn',
  'productSyncReady:false',
  'transportReady:false',
]) {
  assertIncludes(flat, token, `boundary ${token}`);
}

for (const forbidden of [
  'real write is now authorized',
  'transport is now available',
  'write command is enabled',
  'productSyncReady is true',
  'transportReady is true',
]) {
  assertNotIncludes(flat, forbidden, `forbidden claim ${forbidden}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\brawCredential\s*[:=]/i, 'raw credential value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint value literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw remote path value literal'],
  [/\bpayloadBody\s*[:=]/i, 'payload body value literal'],
  [/\bcasKey\s*[:=]/i, 'CAS key value literal'],
]) {
  assert.ok(!pattern.test(evidence), `${label} found`);
}

for (const rel of [
  'Cargo.toml',
  'apps/studio/desktop/src-tauri/tauri.conf.json',
  'apps/studio/desktop/src-tauri/capabilities/default.json',
  'src-surfaces-base/studio/studio.html',
  'tools/product/studio/pack-studio.mjs',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  ...realTransportModules(),
]) {
  gitClean(rel);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-adr-operator-acceptance',
  evidenceOnly: true,
  designCommit: 'af886b2f',
  receiptClassificationAccepted: 'fixture/mock-grade-only',
  receiptHash,
  expiryUtc: '2099-07-06T00:00:00.000Z',
  rustCommandImplemented: false,
  dependencyAdded: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
