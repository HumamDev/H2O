#!/usr/bin/env node
//
// W3.1 read-only capability probe implementation validator.
//
// Validates the Rust/Tauri command substrate, evidence boundaries, and absence
// of W3 write command or remote transport activation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-capability-probe-implementation.md';
const networkPathEvidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-network-probe-path-implementation.md';
const cargoPath = 'apps/studio/desktop/src-tauri/Cargo.toml';
const tauriConfPath = 'apps/studio/desktop/src-tauri/tauri.conf.json';
const capabilityPath = 'apps/studio/desktop/src-tauri/capabilities/default.json';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const commandPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
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

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const cargo = read(cargoPath);
const tauriConf = read(tauriConfPath);
const tauriConfJson = JSON.parse(tauriConf);
const csp = tauriConfJson?.app?.security?.csp || '';
const capabilities = read(capabilityPath);
const capabilitiesJson = JSON.parse(capabilities);
const lib = read(libPath);
const command = read(commandPath);
const rustSources = [lib, command].join('\n');
const productionCommand = command.split('#[cfg(test)]')[0] || command;
const networkPathImplemented = fs.existsSync(path.join(root, networkPathEvidencePath));

for (const token of [
  '89b6ec476a0bf0ff7cff38a0d652f36469acb36e',
  'af886b2fb20d86e9f010ac702cc572b64403dbb3',
  '678c7b95a188c9faa3133316e06a5196bf7c988e',
  '7e431b16c9f0665514eecd31dd0e0273972daed6',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

assertIncludes(command, '#[tauri::command]', 'Tauri command macro');
assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'h2o_rt_capability_probe function');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'invoke handler registration');
assertNotIncludes(rustSources, 'fn h2o_rt_first_write', 'h2o_rt_first_write command function');
assertNotIncludes(lib, 'h2o_rt_first_write,', 'h2o_rt_first_write invoke handler registration');
assertIncludes(evidence, 'Not implemented: `h2o_rt_first_write`', 'write command not implemented evidence');

for (const token of [
  'READONLY_PROBE_GATE',
  'real-webdav-cloud-relay-transport-readonly-capability-probe-evaluate',
  'diagnostic_only',
  'read_only',
  'dry_run',
  'network_attempted: false',
  'real-remote-probe-not-performed-in-this-slice',
  'endpoint_ref_hash',
  'remote_root_ref_hash',
  'credential_ref_hash',
  'capability_probe_receipt_hash',
  'create_only_behavior: "unknown"',
  'etag_behavior: "unknown"',
  'if_none_match_behavior: "unknown"',
]) {
  assertIncludes(command, token, `command token ${token}`);
}

for (const token of [
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
  'real_webdav_transport_available: false',
]) {
  assertIncludes(command, token, `false flag ${token}`);
}

for (const token of [
  'options',
  'propfind-depth-0',
  'propfind-depth-1',
  'head-root',
  'get-root',
  'head-deterministic-nonexistent-child',
]) {
  assertIncludes(command, token, `allowed read-only operation ${token}`);
}

for (const forbidden of [
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
  if (networkPathImplemented) {
    assertNotIncludes(productionCommand, `"${forbidden}"`, `forbidden verb executable path ${forbidden}`);
  } else {
    assertNotIncludes(command, forbidden, `forbidden verb in command path ${forbidden}`);
  }
}

assertNotIncludes(cargo, 'tauri-plugin-http', 'tauri-plugin-http dependency');
assertNotIncludes(cargo, 'keyring', 'keyring dependency');
if (networkPathImplemented) {
  assertIncludes(cargo, 'reqwest = { version = "0.13.3", default-features = false, features = ["blocking", "rustls"] }', 'W3.1 network path reqwest dependency');
} else {
  assertNotIncludes(cargo, 'reqwest', 'reqwest dependency');
}
assertNotIncludes(csp, 'webdav', 'CSP WebDAV widening');
assertNotIncludes(csp, 'cloud', 'CSP cloud widening');
assertNotIncludes(csp, 'connect-src *', 'CSP wildcard connect-src');
assertNotIncludes(csp, 'https:', 'CSP remote https connect');
assertIncludes(csp, 'http://ipc.localhost', 'existing ipc localhost CSP');
const capabilityPermissions = capabilitiesJson.permissions || [];
assert.ok(
  !capabilityPermissions.some((permission) => {
    const identifier = typeof permission === 'string' ? permission : permission?.identifier;
    return typeof identifier === 'string' && identifier.startsWith('http');
  }),
  'HTTP plugin capability permission must not be present',
);

for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'tauri-plugin-http',
  'local helper process',
]) {
  assertNotIncludes(command, forbidden, `forbidden transport helper ${forbidden}`);
}

const realTransportJsDir = path.join(root, 'src-surfaces-base/studio/sync');
for (const name of fs.readdirSync(realTransportJsDir).filter((n) => /^real-transport-.*\.js$/.test(n))) {
  const source = read(`src-surfaces-base/studio/sync/${name}`);
  assertNotIncludes(source, 'shell:allow-open', `${name} shell allow-open`);
}

for (const token of [
  'W3.1 READ-ONLY CAPABILITY PROBE SUBSTRATE IMPLEMENTED',
  'h2o_rt_capability_probe',
  'no real remote probe closeout is claimed in this slice',
  'no `h2o_rt_first_write`',
  'no write command',
  'no `tauri-plugin-http`',
  'no CSP widening',
  'no webview fetch transport',
  'no local helper process',
  'no real secret retrieval',
  'no keyring dependency',
  'no `reqwest` dependency added in this slice',
  'credentialRefHash` remains descriptor-hash semantics',
  receiptHash,
  'fixture-grade / mock-grade only',
  'must never authorize W3.4 or W3.5 real writes',
  'expiryUtc <= 7 days from mint',
  'W3.2 mock executor proof remains blocked',
  'W3.3 gate-refused write command / loopback tests remain blocked',
  'W3.4 sacrificial probe-object write remains blocked',
  'W3.5 separately-approved payload write remains blocked',
  'productSyncReady:false',
  'transportReady:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'enqueuesRelay:false',
  'fullBundleV3Started:false',
  'mintsExportId:false',
  'burnsSequence:false',
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
  'realWebDAVTransportAvailable:true',
  'real remote probe closeout PASS',
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

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-readonly-capability-probe-implementation',
  command: 'h2o_rt_capability_probe',
  firstWriteCommandAdded: false,
  reqwestAdded: networkPathImplemented,
  tauriPluginHttpAdded: false,
  realRemoteProbePerformed: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
