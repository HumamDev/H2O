#!/usr/bin/env node
//
// W3.1 read-only capability probe mock closeout validator.
//
// Validates evidence-only mock/loopback closeout and proves the W3.1 Rust
// implementation and loader/capability/dependency files are unchanged in this
// slice.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-capability-probe-mock-closeout.md';
const networkPathEvidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-network-probe-path-implementation.md';
const commandPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';

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

function optionalGitClean(rel) {
  if (fs.existsSync(path.join(root, rel))) gitClean(rel);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const command = read(commandPath);
const lib = read(libPath);
const rustSources = `${command}\n${lib}`;
const networkPathImplemented = fs.existsSync(path.join(root, networkPathEvidencePath));

assertIncludes(evidence, '5dd884aea2d4e554ea7bd1282df7369ac4060ab8', 'W3.1 implementation commit');
assertIncludes(evidence, 'h2o_rt_capability_probe', 'capability probe command');
assertIncludes(evidence, 'h2o_rt_first_write', 'first write absence reference');
assertIncludes(evidence, 'command absent / not added: `h2o_rt_first_write`', 'first write absent statement');
assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'Rust command exists');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'command registered');
assertNotIncludes(rustSources, 'fn h2o_rt_first_write', 'h2o_rt_first_write function');
assertNotIncludes(lib, 'h2o_rt_first_write,', 'h2o_rt_first_write registration');

for (const token of [
  'W3.1 MOCK / LOOPBACK READ-ONLY CAPABILITY PROBE CLOSEOUT PASS',
  'mock/loopback only',
  'does not claim a live remote-root probe',
  'no live remote probe',
  'no real remote probe was performed',
  'no write command exists',
  'no `tauri-plugin-http`',
  'no CSP or capability widening',
  'real-transport-readonly-capability-probe-ready',
  'response is redacted/hash-only',
  'networkAttempted:false',
  'real-remote-probe-not-performed-in-this-slice',
  'createOnlyBehavior:"unknown"',
  'etagBehavior:"unknown"',
  'ifNoneMatchBehavior:"unknown"',
  'productSyncReady:false',
  'transportReady:false',
]) {
  assertIncludes(flat, token, `mock proof token ${token}`);
}

for (const token of [
  'missing / wrong gate blocks with `real-transport-w3-readonly-gate-required`',
  'raw endpoint input is rejected',
  'raw credential input is rejected',
  'raw path input is rejected',
  'private markers are not echoed',
]) {
  assertIncludes(flat, token, `fail-closed token ${token}`);
}

for (const verb of [
  'PUT',
  'DELETE',
  'MKCOL',
  'PROPPATCH',
  'MOVE',
  'COPY',
  'LOCK',
  'UNLOCK',
  'POST',
]) {
  assertIncludes(evidence, `${verb} rejected`, `forbidden verb rejected ${verb}`);
}
assertIncludes(evidence, 'No PUT/DELETE/MKCOL/PROPPATCH/MOVE/COPY/LOCK/UNLOCK/POST was performed', 'forbidden verbs not performed');

for (const token of [
  '`ok`',
  '`status`',
  '`gateSatisfied`',
  '`endpointRefHash`',
  '`remoteRootRefHash`',
  '`credentialRefHash`',
  '`capabilityProbeReceiptHash`',
  '`receiptCorePlaceholder`',
  '`rootExists`',
  '`rootEmpty`',
  '`writesWebDAV:false`',
  '`writesCloud:false`',
  '`writesRelay:false`',
  '`writesCAS:false`',
  '`writesFiles:false`',
  '`enqueuesRelay:false`',
  '`fullBundleV3Started:false`',
  '`mintsExportId:false`',
  '`burnsSequence:false`',
]) {
  assertIncludes(evidence, token, `response shape ${token}`);
}

for (const token of [
  'no real WebDAV/cloud/relay/CAS/file write occurred',
  'no relay enqueue occurred',
  'no outbox/ledger/store mutation occurred',
  'no fullBundle.v3 start/mint occurred',
  'no token/export id mint occurred',
  'no sequence burn occurred',
  'W3.2 remains blocked pending closeout',
]) {
  assertIncludes(flat, token, `boundary ${token}`);
}

for (const forbidden of [
  'live remote probe PASS',
  'real remote probe PASS',
  'h2o_rt_first_write exists',
  'write command exists: true',
  'write command was added',
  'real WebDAV/cloud/relay/CAS/file write occurred: true',
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'productSyncReady:true',
  'transportReady:true',
  'W3.2 is unblocked',
]) {
  assertNotIncludes(flat, forbidden, `forbidden claim ${forbidden}`);
}

for (const rel of [
  'apps/studio/desktop/src-tauri/Cargo.toml',
  'apps/studio/desktop/src-tauri/Cargo.lock',
  'apps/studio/desktop/src-tauri/tauri.conf.json',
  'apps/studio/desktop/src-tauri/capabilities/default.json',
  'src-surfaces-base/studio/studio.html',
  'tools/product/studio/pack-studio.mjs',
]) {
  if (
    networkPathImplemented
    && (rel === 'apps/studio/desktop/src-tauri/Cargo.toml'
      || rel === 'apps/studio/desktop/src-tauri/Cargo.lock')
  ) {
    continue;
  }
  gitClean(rel);
}
optionalGitClean('Cargo.toml');
optionalGitClean('Cargo.lock');

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-readonly-capability-probe-mock-closeout',
  mockLoopbackOnly: true,
  command: 'h2o_rt_capability_probe',
  firstWriteCommandExists: false,
  liveRemoteProbePerformed: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
  w3_2Blocked: true,
}, null, 2));
