#!/usr/bin/env node
//
// W3.1 live read-only remote-root probe closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-live-readonly-remote-root-probe-closeout.md';
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
const productionCommand = command.split('#[cfg(test)]')[0] || command;
const lib = read(libPath);
const cargo = read(cargoPath);
const csp = JSON.parse(read(tauriConfPath))?.app?.security?.csp || '';
const rustCommandSurface = `${command}\n${lib}`;

for (const token of [
  '6a5e8bbe5f68148c8eb28456d9922ec8f666a10e',
  '095783dd0b677e800bc8d1552dbfb116736b4390',
  'f670a18c509dc79d8d651da1e9e9aea06969a2cc',
  '979e8a5ba3584d50ab18ae848645e1163d008eae',
  'd1ef09955c3a8208226674341c68a761bf080e2b',
  '5dd884aea2d4e554ea7bd1282df7369ac4060ab8',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Verdict: LIVE READ-ONLY REMOTE-ROOT PROBE RETRY BLOCKED.',
  '`h2o_rt_capability_probe` exists: true',
  '`h2o_rt_first_write` absent: true',
  'write command absent: true',
  'descriptorRegistryRefHash: `sha256:c3bc34cccd01ef6a3cfd234a066fc76fdf9f6de501d8e0d542a6790f54460050`',
  'descriptorRegistryRefHash matched expected value: true',
  'live read-only probe performed: false',
  'networkAttempted:false',
  'expected registry hash matches a resolver-readiness-only registry',
  'endpoint live descriptor private field present: false',
  'remote-root live descriptor private field present: false',
  'credential live descriptor private field present: false',
  'redacted/hash-only probe receipt produced: false',
  'read-only methods used: none; blocked before network',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
  'W3.2 remains next/pending',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'OPTIONS performed: false',
  'PROPFIND Depth 0 performed: false',
  'PROPFIND Depth 1 performed: false',
  'HEAD root performed: false',
  'GET root performed: false',
  'HEAD deterministic nonexistent child performed: false',
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
  'redirect followed: false',
  'credential forwarding to redirect target: false',
]) {
  assertIncludes(flatEvidence, token, `method boundary ${token}`);
}

assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'probe command source');
assertIncludes(command, 'LIVE_READONLY_PROBE_GATE', 'live read-only gate source');
assertIncludes(command, 'real-transport-w3-readonly-remote-root-probe', 'live read-only gate literal');
assertIncludes(command, 'ReqwestReadOnlyProbeClient', 'network path client');
assertIncludes(command, 'redirect(reqwest::redirect::Policy::none())', 'redirect refusal');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registration');
assertNotIncludes(rustCommandSurface, 'h2o_rt_first_write', 'first write command');
assertNotIncludes(rustCommandSurface, 'first_write', 'write command family');
assertIncludes(cargo, 'reqwest = { version = "0.13.3", default-features = false, features = ["blocking", "rustls"] }', 'reqwest rustls dependency');
assertNotIncludes(cargo, 'tauri-plugin-http', 'tauri-plugin-http dependency');
assertNotIncludes(csp, 'connect-src *', 'CSP wildcard connect-src');
assertNotIncludes(csp, 'webdav', 'CSP WebDAV widening');
assertNotIncludes(csp, 'https:', 'CSP remote https connect');

for (const forbidden of ['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'POST']) {
  assertNotIncludes(productionCommand, `"${forbidden}"`, `forbidden method executable path ${forbidden}`);
}

for (const token of [
  'transport-level evidence only',
  'does not define a Desktop-only sync protocol',
  'Desktop-only remote path layout',
  'Desktop-only receipt semantics',
  'Desktop-only resolver semantics',
  'browser/native extension WebDAV sync',
  'mobile app sync',
]) {
  assertIncludes(flatEvidence, token, `cross-client token ${token}`);
}

for (const forbidden of [
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'productSyncReady:true',
  'transportReady:true',
  'networkAttempted:true',
  'live read-only probe performed: true',
  'Desktop-only remote semantics were introduced',
  'W3.2 is unblocked',
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

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-live-readonly-remote-root-probe-closeout',
  liveReadOnlyProbePerformed: false,
  blocked: true,
  descriptorRegistryRefHash: 'sha256:c3bc34cccd01ef6a3cfd234a066fc76fdf9f6de501d8e0d542a6790f54460050',
  firstWriteCommandExists: false,
  writeCommandExists: false,
  forbiddenMethodUsed: false,
  crossClientCompatibilityRecorded: true,
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
