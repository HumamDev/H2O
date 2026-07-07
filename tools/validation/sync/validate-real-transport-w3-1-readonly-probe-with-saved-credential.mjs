#!/usr/bin/env node
//
// W3.1.7-R9 controlled read-only probe with saved credential validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-probe-with-saved-credential.md';
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

function mustContain(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function mustNotContain(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const command = read(commandPath);
const productionCommand = command.split('#[cfg(test)]')[0] || command;
const lib = read(libPath);
const rustCommandSurface = `${productionCommand}\n${lib}`;

for (const token of [
  '4ee8e6a7196a4706bc58ae43a94e5a5e38b6674c',
  '7caff3f9e7b961c7a16768dcf39913bbc9c7fcbb',
  'f74fde2d8f70ddb167a2f27aaa31d79d8747e508',
  '4b275b0b66434aee9202a7ac1c19e47a994df61f',
  '6a5e8bbe5f68148c8eb28456d9922ec8f666a10e',
]) {
  mustContain(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Verdict: CONTROLLED READ-ONLY PROBE COMPLETED; REMOTE-ROOT READINESS STILL NOT PROVEN.',
  'registryPathSource: default-private',
  'descriptorRegistryRefHash: `sha256:b08bf32a3b41f019c7a7474a1588510b80a0a7e8b40891c3b43d758784312094`',
  'endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`',
  'remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`',
  'credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`',
  'credentialMaterialPresent:true',
  'JSON parses:true',
  'private fields:true',
  'endpoint ready:true',
  'reachable candidate:true',
  'networkAttempted:true',
  'remoteRootReachable:false',
  'rootExists:false',
  'rootEmpty:false',
  'child404Ok:true',
  'listingHash: `sha256:0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5`',
  '| OPTIONS | `200` | `2xx` |',
  '| PROPFIND Depth 0 | `404` | `4xx` |',
  '| HEAD root | `404` | `4xx` |',
  '| HEAD deterministic nonexistent child | `404` | `4xx` |',
  'targetShape: `endpoint-plus-folder`',
  'trailingSlash:false',
  'doubleSlash:false',
  'authHeaderPresent:true',
  'propfindBodyPresent:false',
  'PROPFIND Depth 0 propfindDepthHeaderPresent:true',
  'endpoint-level OPTIONS call to return `200`',
  'request/path shape parity',
  'trailing slash and a minimal XML PROPFIND body',
  'not a full remote-root readiness pass',
  '`h2o_rt_first_write` absent: true',
  'write command absent: true',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
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
  'request body mutation sent: false',
  'relay enqueue performed: false',
  'outbox/ledger/store mutation performed: false',
  'fullBundleV3Started:false',
  'mintsExportId:false',
  'burnsSequence:false',
]) {
  mustContain(flatEvidence, token, `boundary token ${token}`);
}

mustContain(command, 'pub fn h2o_rt_capability_probe', 'probe command source');
mustContain(command, 'ReadOnlyProbeOperation::Options', 'OPTIONS read-only operation');
mustContain(command, 'ReadOnlyProbeOperation::PropfindDepth0', 'PROPFIND read-only operation');
mustContain(command, 'ReadOnlyProbeOperation::HeadRoot', 'HEAD root read-only operation');
mustContain(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registration');
mustNotContain(rustCommandSurface, 'h2o_rt_first_write', 'first write command');
mustNotContain(rustCommandSurface, 'first_write', 'write command family');

for (const forbidden of ['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'POST']) {
  mustNotContain(productionCommand, `"${forbidden}"`, `forbidden method executable path ${forbidden}`);
}

for (const forbidden of [
  'REMOTE-ROOT READINESS PROVEN',
  'remoteRootReachable:true',
  'rootExists:true',
  'W3.2 is unblocked',
  'writesWebDAV:true',
  'productSyncReady:true',
  'transportReady:true',
]) {
  mustNotContain(flatEvidence, forbidden, `forbidden claim ${forbidden}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\brawCredential\s*[:=]/i, 'raw credential literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw remote path literal'],
  [/\brawListing\s*[:=]/i, 'raw listing literal'],
  [/\bpayloadBody\s*[:=]/i, 'payload body literal'],
  [/\bcasKey\s*[:=]/i, 'CAS key literal'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-readonly-probe-with-saved-credential',
  probeResult: 'fail',
  networkAttempted: true,
  statusCodes: {
    OPTIONS: 200,
    PROPFIND_DEPTH_0: 404,
    HEAD_ROOT: 404,
    HEAD_DETERMINISTIC_NONEXISTENT_CHILD: 404,
  },
  remoteRootReachable: false,
  rootExists: false,
  child404Ok: true,
  requestPathShapeParitySuspected: true,
  writeMethodUsed: false,
  firstWriteCommandExists: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
