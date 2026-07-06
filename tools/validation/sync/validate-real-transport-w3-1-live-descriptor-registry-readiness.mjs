#!/usr/bin/env node
//
// W3.1 live descriptor registry readiness validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-live-descriptor-registry-readiness.md';
const commandPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const cargoPath = 'apps/studio/desktop/src-tauri/Cargo.toml';

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
const rustCommandSurface = `${command}\n${lib}`;

for (const token of [
  '3df39bbcd50d44222817aaf3defdd1c13850bd42',
  '6a5e8bbe5f68148c8eb28456d9922ec8f666a10e',
  'f670a18c509dc79d8d651da1e9e9aea06969a2cc',
  '979e8a5ba3584d50ab18ae848645e1163d008eae',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

assert.match(
  flatEvidence,
  /descriptorRegistryRefHash: `sha256:[0-9a-f]{64}`/,
  'descriptorRegistryRefHash must be sha256:<64hex>',
);

for (const token of [
  'Verdict: W3.1 LIVE DESCRIPTOR REGISTRY READINESS PASS.',
  'private registry path shape: `/private/tmp/h2o-real-transport-w3-live-descriptor-registry.json`',
  'private registry is outside repo: true',
  'private registry committed to repo: false',
  'private registry copied into evidence: false',
  'private registry contents printed: false',
  'private registry JSON parsed: true',
  'endpointRefHash resolvable by Rust-only registry: true',
  'remoteRootRefHash resolvable by Rust-only registry: true',
  'credentialRefHash resolvable by Rust-only registry: true',
  'Rust-only live endpoint descriptor present: true',
  'Rust-only live remote-root descriptor present: true',
  'Rust-only live credential descriptor present: true',
  'live remote probe performed: false',
  'networkAttempted:false',
  '`h2o_rt_first_write` absent: true',
  'write command absent: true',
  'productSyncReady:false',
  'transportReady:false',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'This registry is local credential/endpoint resolution only',
  'does not define a Desktop-only remote protocol',
  'Desktop-only remote path layout',
  'Desktop-only receipt semantics',
  'Desktop-only resolver semantics',
  'browser/native extension WebDAV sync',
  'future mobile app sync',
]) {
  assertIncludes(flatEvidence, token, `cross-client token ${token}`);
}

for (const token of [
  'pub fn h2o_rt_capability_probe',
  'H2O_RT_DESCRIPTOR_REGISTRY_FILE',
  'endpoint_url_private',
  'remote_root_path_private',
  'auth_header_private',
  'LIVE_READONLY_PROBE_GATE',
  'real-transport-w3-readonly-remote-root-probe',
]) {
  assertIncludes(command, token, `command token ${token}`);
}

assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registration');
assertNotIncludes(rustCommandSurface, 'h2o_rt_first_write', 'first write command');
assertNotIncludes(rustCommandSurface, 'first_write', 'write command family');
assertNotIncludes(cargo, 'tauri-plugin-http', 'tauri-plugin-http dependency');

for (const forbidden of [
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'productSyncReady:true',
  'transportReady:true',
  'live remote probe performed: true',
  'networkAttempted:true',
  'W3.2 is unblocked',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden evidence claim ${forbidden}`);
}

for (const token of [
  'PUT performed: false',
  'DELETE performed: false',
  'MKCOL performed: false',
  'PROPPATCH performed: false',
  'MOVE performed: false',
  'COPY performed: false',
  'LOCK performed: false',
  'UNLOCK performed: false',
  'POST performed: false',
  'request body sent: false',
]) {
  assertIncludes(flatEvidence, token, `method boundary ${token}`);
}

for (const [source, label] of [[evidence, 'evidence']]) {
  for (const [pattern, patternLabel] of [
    [/https?:\/\//i, 'raw URL literal'],
    [/\bpassword\s*[:=]/i, 'password value literal'],
    [/\bsecret\s*[:=]/i, 'sensitive value literal'],
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
  !fs.existsSync(path.join(root, 'h2o-real-transport-w3-live-descriptor-registry.json')),
  'private live descriptor registry must not be committed at repo root',
);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-live-descriptor-registry-readiness',
  descriptorRegistryRefHash: flatEvidence.match(/descriptorRegistryRefHash: `([^`]+)`/)?.[1],
  privateRegistryCommitted: false,
  liveRemoteProbePerformed: false,
  networkAttempted: false,
  firstWriteCommandExists: false,
  writeCommandExists: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
