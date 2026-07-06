#!/usr/bin/env node
//
// W3.1 resolver substrate implementation validator.
//
// Validates Rust-only out-of-repo descriptor resolver support for the read-only
// capability probe without enabling network, writes, or first-write commands.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-resolver-substrate-implementation.md';
const commandPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const cargoPath = 'apps/studio/desktop/src-tauri/Cargo.toml';
const tauriConfPath = 'apps/studio/desktop/src-tauri/tauri.conf.json';
const capabilityPath = 'apps/studio/desktop/src-tauri/capabilities/default.json';

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
const capabilities = JSON.parse(read(capabilityPath));
const rustSources = `${command}\n${lib}`;

for (const token of [
  '5dd884aea2d4e554ea7bd1282df7369ac4060ab8',
  'd1ef09955c3a8208226674341c68a761bf080e2b',
  '89b6ec476a0bf0ff7cff38a0d652f36469acb36e',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'h2o_rt_capability_probe exists');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registered');
assertNotIncludes(rustSources, 'fn h2o_rt_first_write', 'h2o_rt_first_write function');
assertNotIncludes(lib, 'h2o_rt_first_write,', 'h2o_rt_first_write registration');
assertIncludes(evidence, '`h2o_rt_first_write` absent', 'first write absent evidence');
assertIncludes(evidence, 'no write command', 'no write command evidence');

for (const token of [
  'DESCRIPTOR_REGISTRY_FILE_ENV',
  'H2O_RT_DESCRIPTOR_REGISTRY_FILE',
  'resolver_check',
  'descriptor_registry_ref_hash',
  'resolver_available',
  'endpoint_descriptor_resolved',
  'remote_root_descriptor_resolved',
  'credential_descriptor_resolved',
  'resolve_descriptors',
  'DescriptorRegistry',
  'descriptor_mode',
  'hash-only-redacted',
  'real-transport-w3-resolver-config-missing',
  'real-transport-w3-descriptor-hash-mismatch',
  'real-transport-w3-resolver-registry-hash-mismatch',
  'real-transport-w3-resolver-raw-config-rejected',
]) {
  assertIncludes(command, token, `resolver source token ${token}`);
}

for (const token of [
  'resolver_missing_registry_fails_closed',
  'resolver_descriptor_hash_mismatch_fails_closed',
  'resolver_ready_response_is_hash_only_and_no_network',
  'assert!(!result.network_attempted)',
  'assert!(!result.writes_webdav)',
  'assert!(!result.product_sync_ready)',
  'assert!(!result.transport_ready)',
]) {
  assertIncludes(command, token, `resolver test token ${token}`);
}

for (const token of [
  'network_attempted: false',
  'writes_webdav: false',
  'writes_cloud: false',
  'writes_relay: false',
  'writes_cas: false',
  'writes_files: false',
  'enqueues_relay: false',
  'full_bundle_v3_started: false',
  'mints_export_id: false',
  'burns_sequence: false',
  'product_sync_ready: false',
  'transport_ready: false',
]) {
  assertIncludes(command, token, `false source flag ${token}`);
}

assertNotIncludes(cargo, 'tauri-plugin-http', 'tauri-plugin-http dependency');
assertNotIncludes(cargo, 'keyring', 'keyring dependency');
assertNotIncludes(cargo, 'reqwest', 'reqwest dependency');
assertNotIncludes(csp, 'webdav', 'CSP WebDAV widening');
assertNotIncludes(csp, 'cloud', 'CSP cloud widening');
assertNotIncludes(csp, 'connect-src *', 'CSP wildcard connect-src');
assertNotIncludes(csp, 'https:', 'CSP remote https connect');
const capabilityPermissions = capabilities.permissions || [];
assert.ok(
  !capabilityPermissions.some((permission) => {
    const identifier = typeof permission === 'string' ? permission : permission?.identifier;
    return typeof identifier === 'string' && identifier.startsWith('http');
  }),
  'HTTP plugin capability permission must not be present',
);

for (const token of [
  'resolver is Rust-only',
  'registry/config must live outside repo',
  'JS provides only hash/ref inputs',
  'credentialRefHash` is descriptor-hash semantics',
  'missing registry/config fails closed',
  'descriptor hash mismatch fails closed',
  'registry hash mismatch fails closed',
  'redacted/hash-only status to JS',
  'networkAttempted:false',
  'live remote probe remains blocked/pending',
  'no `reqwest` dependency added',
  'no network use introduced',
  'no `tauri-plugin-http`',
  'no CSP widening',
  'no capability widening',
  'no raw endpoint',
  'no raw credential',
  'no raw remote path',
  'no raw listing',
  'no keyring access is introduced',
  'no write command',
  'productSyncReady:false',
  'transportReady:false',
  'writesWebDAV:false',
  'W3.1 live remote probe remains pending',
  'W3.2 remains blocked',
  'W3.3 remains blocked',
  'W3.4 remains blocked',
  'W3.5 remains blocked',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

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
    [/\bpayloadBody\s*[:=]/i, 'payload body value literal'],
    [/\bcasKey\s*[:=]/i, 'CAS key value literal'],
  ]) {
    assert.ok(!pattern.test(source), `${label}: ${patternLabel} found`);
  }
}

const realTransportJsDir = path.join(root, 'src-surfaces-base/studio/sync');
for (const name of fs.readdirSync(realTransportJsDir).filter((n) => /^real-transport-.*\.js$/.test(n))) {
  const source = read(`src-surfaces-base/studio/sync/${name}`);
  assertNotIncludes(source, 'shell:allow-open', `${name} shell allow-open`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-resolver-substrate-implementation',
  resolverSubstrate: true,
  firstWriteCommandExists: false,
  networkAttempted: false,
  liveRemoteProbePerformed: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
