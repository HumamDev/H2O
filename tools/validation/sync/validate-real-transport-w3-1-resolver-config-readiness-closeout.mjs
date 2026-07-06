#!/usr/bin/env node
//
// W3.1 resolver config readiness closeout validator.
//
// Validates evidence that a Rust-only, out-of-repo descriptor registry can be
// hash-bound for resolver readiness without live network probing or writes.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-resolver-config-readiness-closeout.md';
const commandPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const cargoPath = 'apps/studio/desktop/src-tauri/Cargo.toml';
const tauriConfPath = 'apps/studio/desktop/src-tauri/tauri.conf.json';

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

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const command = read(commandPath);
const lib = read(libPath);
const cargo = read(cargoPath);
const tauriConf = read(tauriConfPath);
const csp = JSON.parse(tauriConf)?.app?.security?.csp || '';

for (const token of [
  '979e8a5ba3584d50ab18ae848645e1163d008eae',
  'd1ef09955c3a8208226674341c68a761bf080e2b',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'descriptorRegistryRefHash: `sha256:c3bc34cccd01ef6a3cfd234a066fc76fdf9f6de501d8e0d542a6790f54460050`',
  'missing registry fail-closed: PASS',
  'missing registry blocker: `real-transport-w3-resolver-config-missing`',
  'wrong descriptorRegistryRefHash fail-closed: PASS',
  'wrong registry hash blocker: `real-transport-w3-resolver-registry-hash-mismatch`',
  'descriptor mismatch fail-closed: PASS',
  'descriptor mismatch blocker: `real-transport-w3-descriptor-hash-mismatch`',
  'valid resolver readiness PASS: PASS',
  'networkAttempted:false',
  'live remote probe performed: false',
  '`h2o_rt_first_write` absent',
  'no write command exists',
  'productSyncReady:false',
  'transportReady:false',
  'W3.1 live read-only remote-root probe remains pending',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

assert.match(
  flatEvidence,
  /descriptorRegistryRefHash: `sha256:[0-9a-f]{64}`/,
  'descriptorRegistryRefHash must be sha256:<64hex>',
);

for (const token of [
  'pub fn h2o_rt_capability_probe',
  'H2O_RT_DESCRIPTOR_REGISTRY_FILE',
  'resolver_check',
  'descriptor_registry_ref_hash',
  'real-transport-w3-resolver-config-missing',
  'real-transport-w3-resolver-registry-hash-mismatch',
  'real-transport-w3-descriptor-hash-mismatch',
  'resolver_ready_response_is_hash_only_and_no_network',
]) {
  assertIncludes(command, token, `resolver source token ${token}`);
}

assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe registration');
assertNotIncludes(`${command}\n${lib}`, 'h2o_rt_first_write', 'first write command');
assertNotIncludes(`${command}\n${lib}`, 'first_write', 'write command family');
assertNotIncludes(cargo, 'tauri-plugin-http', 'tauri-plugin-http dependency');
assertNotIncludes(csp, 'connect-src *', 'CSP wildcard connect-src');
assertNotIncludes(csp, 'webdav', 'CSP WebDAV widening');
assertNotIncludes(csp, 'https:', 'CSP remote https connect');

for (const forbidden of [
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'productSyncReady:true',
  'transportReady:true',
  'live remote probe PASS',
  'W3.2 is unblocked',
  'W3.3 is unblocked',
  'W3.4 is unblocked',
  'W3.5 is unblocked',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden evidence claim ${forbidden}`);
}

for (const [source, label] of [[evidence, 'evidence'], [command, 'command source']]) {
  for (const [pattern, patternLabel] of [
    [/https?:\/\//i, 'raw URL literal'],
    [/\bpassword\s*[:=]/i, 'password value literal'],
    [/\bsecret\s*[:=]/i, 'secret value literal'],
    [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
    [/\brawCredential\s*[:=]/i, 'raw credential value literal'],
    [/\brawEndpoint\s*[:=]/i, 'raw endpoint value literal'],
    [/\brawRemotePath\s*[:=]/i, 'raw remote path value literal'],
    [/\brawListing\s*[:=]/i, 'raw listing value literal'],
    [/\bpayloadBody\s*[:=]/i, 'payload body value literal'],
    [/\bcasKey\s*[:=]/i, 'CAS key value literal'],
  ]) {
    assert.ok(!pattern.test(source), `${label}: ${patternLabel} found`);
  }
}

assert.ok(
  !fs.existsSync(path.join(root, 'h2o-real-transport-w3-descriptor-registry.json')),
  'private descriptor registry must not be committed at repo root',
);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-resolver-config-readiness-closeout',
  resolverReadiness: 'PASS',
  descriptorRegistryRefHash: 'sha256:c3bc34cccd01ef6a3cfd234a066fc76fdf9f6de501d8e0d542a6790f54460050',
  liveRemoteProbePerformed: false,
  networkAttempted: false,
  firstWriteCommandExists: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
