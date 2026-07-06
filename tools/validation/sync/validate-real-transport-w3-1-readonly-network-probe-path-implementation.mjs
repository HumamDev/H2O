#!/usr/bin/env node
//
// W3.1 read-only network probe path implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-network-probe-path-implementation.md';
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
const productionCommand = command.split('#[cfg(test)]')[0] || command;
const lib = read(libPath);
const cargo = read(cargoPath);
const tauriConf = JSON.parse(read(tauriConfPath));
const csp = tauriConf?.app?.security?.csp || '';
const capabilities = JSON.parse(read(capabilityPath));
const rustCommandSurface = `${command}\n${lib}`;

for (const token of [
  '095783dd0b677e800bc8d1552dbfb116736b4390',
  'f670a18c509dc79d8d651da1e9e9aea06969a2cc',
  '979e8a5ba3584d50ab18ae848645e1163d008eae',
  'd1ef09955c3a8208226674341c68a761bf080e2b',
  '5dd884aea2d4e554ea7bd1282df7369ac4060ab8',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'probe command exists');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registered');
assertNotIncludes(rustCommandSurface, 'fn h2o_rt_first_write', 'first write command');
assertNotIncludes(lib, 'h2o_rt_first_write,', 'first write registration');
assertNotIncludes(rustCommandSurface, 'pub fn h2o_rt_first_write', 'public first write command');

for (const token of [
  'LIVE_READONLY_PROBE_GATE',
  'real-transport-w3-readonly-remote-root-probe',
  'live_read_only_probe',
  'live_probe_requested',
  'resolver_check',
  'resolve_descriptor_registry',
  'run_live_readonly_probe',
  'ReqwestReadOnlyProbeClient',
  'redirect(reqwest::redirect::Policy::none())',
  'timeout(Duration::from_secs(READONLY_TIMEOUT_SECONDS))',
  'MAX_READONLY_RESPONSE_BYTES',
  'listing_hash',
  'child_404_ok',
  'dav_class_summary_hash',
  'allowed_methods_summary_hash',
]) {
  assertIncludes(command, token, `command token ${token}`);
}

assertIncludes(cargo, 'reqwest = { version = "0.13.3", default-features = false, features = ["blocking", "rustls"] }', 'reqwest rustls dependency');
assertNotIncludes(cargo, 'tauri-plugin-http', 'tauri-plugin-http dependency');
assertNotIncludes(csp, 'connect-src *', 'CSP wildcard connect-src');
assertNotIncludes(csp, 'webdav', 'CSP WebDAV widening');
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
  'Self::Options => "OPTIONS"',
  'Self::PropfindDepth0 | Self::PropfindDepth1 => "PROPFIND"',
  'Self::HeadRoot | Self::HeadDeterministicNonexistentChild => "HEAD"',
  'Self::GetRoot => "GET"',
]) {
  assertIncludes(productionCommand, token, `allowed method mapping ${token}`);
}

for (const forbidden of ['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'POST']) {
  assertNotIncludes(productionCommand, `"${forbidden}"`, `forbidden method executable path ${forbidden}`);
}

for (const forbidden of ['.body(', '.json(', '.form(', 'multipart(']) {
  assertNotIncludes(productionCommand, forbidden, `request body path ${forbidden}`);
}

for (const token of [
  'live read-only network path added',
  'resolver-only mode preserved: true',
  'resolver-only mode result: `networkAttempted:false`',
  'No live remote probe was performed in this implementation slice',
  'redirect policy: none',
  'timeout configured: true',
  'response size ceiling configured: true',
  'no `tauri-plugin-http`',
  'no CSP widening',
  'no webview fetch transport',
  'no local helper process',
  'no general-purpose HTTP command',
  'redacted/hash-only',
  'no write command exists',
  'productSyncReady:false',
  'transportReady:false',
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
  'live remote probe performed: true',
  'W3.2 is unblocked',
  'W3.3 is unblocked',
  'W3.4 is unblocked',
  'W3.5 is unblocked',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden evidence claim ${forbidden}`);
}

for (const [source, label] of [[evidence, 'evidence'], [productionCommand, 'production command source']]) {
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

const realTransportJsDir = path.join(root, 'src-surfaces-base/studio/sync');
for (const name of fs.readdirSync(realTransportJsDir).filter((n) => /^real-transport-.*\.js$/.test(n))) {
  const source = read(`src-surfaces-base/studio/sync/${name}`);
  assertNotIncludes(source, 'shell:allow-open', `${name} shell allow-open`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-readonly-network-probe-path-implementation',
  command: 'h2o_rt_capability_probe',
  reqwestChanged: true,
  reqwestRustls: true,
  firstWriteCommandExists: false,
  writeCommandExists: false,
  liveRemoteProbePerformed: false,
  forbiddenMethodsExecutable: false,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
