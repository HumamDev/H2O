#!/usr/bin/env node
//
// W3.1.7-R2 live read-only root reachability diagnostic validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-live-readonly-root-reachability-diagnostic.md';
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

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const command = read(commandPath);
const productionCommand = command.split('#[cfg(test)]')[0] || command;
const lib = read(libPath);
const rustCommandSurface = `${productionCommand}\n${lib}`;

for (const token of [
  '39206f4f505c198218570ded66a7da05270fa58c',
  '81b5338c6319f5744ed25c9453635ec5fb91864e',
  '2ec8a465a4393c31d75536d9cea974d76ff528cf',
  '523a1978258ad4e5e844984de986a6677440bcc7',
  '6a5e8bbe5f68148c8eb28456d9922ec8f666a10e',
  '979e8a5ba3584d50ab18ae848645e1163d008eae',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Verdict: DIAGNOSIS COMPLETE, REMOTE-ROOT READINESS STILL NOT PROVEN.',
  'descriptorRegistryRefHash: `sha256:587b8681ee910bf3828413e17f949fa52b53a191db72ee4e05c87c0138525167`',
  'endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`',
  'remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`',
  'credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`',
  'command-level status: `real-transport-readonly-capability-probe-ready`',
  'command-level pass: true',
  'full remote-root readiness pass: false',
  'blockers: none',
  'networkAttempted:true',
  'remoteRootReachable:false',
  'rootExists:false',
  'rootEmpty:false',
  'child404Ok:false',
  'diagnostic listingHash: `sha256:198b8126e435419fdbbe7f0622404f6c42da0acd0c71ddb81ee1fa555df380b8`',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
  'OPTIONS statusFamily: `4xx`',
  'PROPFIND Depth 0 statusFamily: `4xx`',
  'HEAD root statusFamily: `4xx`',
  'HEAD deterministic nonexistent child statusFamily: `4xx`',
  'method names and status families',
  'folder does not exist or is not visible to the credential',
  'folder normalization mismatch',
  'endpoint root mismatch',
  'provider-specific WebDAV behavior',
  'command-level pass only',
  'not a full remote-root readiness pass',
  'native extension Folder mental model',
  'Folder `H2O`',
  'Save/Prepare again',
  '`h2o_rt_first_write` absent: true',
  'write command absent: true',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
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
  assertIncludes(flatEvidence, token, `boundary token ${token}`);
}

assertIncludes(command, 'pub struct ReadOnlyMethodStatusFamily', 'redacted status-family schema');
assertIncludes(command, 'method_status_families', 'method status family field');
assertIncludes(command, 'fn status_family(status: u16)', 'status family helper');
assertIncludes(command, 'operation.redacted_label()', 'redacted operation label');
assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'probe command source');
assertIncludes(command, 'LIVE_READONLY_PROBE_GATE', 'live read-only gate');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe registration');
assertNotIncludes(rustCommandSurface, 'h2o_rt_first_write', 'first write command');
assertNotIncludes(rustCommandSurface, 'first_write', 'write command family');

for (const forbidden of ['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'POST']) {
  assertNotIncludes(productionCommand, `"${forbidden}"`, `forbidden method executable path ${forbidden}`);
}

for (const forbidden of [
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'productSyncReady:true',
  'transportReady:true',
  'REMOTE-ROOT READINESS PROVEN',
  'full remote-root readiness pass: true',
  'W3.2 is unblocked',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden claim ${forbidden}`);
}

for (const [source, label] of [[evidence, 'evidence'], [productionCommand, 'production command source']]) {
  for (const [pattern, patternLabel] of [
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
    assert.ok(!pattern.test(source), `${label}: ${patternLabel} found`);
  }
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-1-live-readonly-root-reachability-diagnostic',
  commandLevelPassOnly: true,
  remoteRootReadinessPass: false,
  networkAttempted: true,
  statusFamilies: {
    OPTIONS: '4xx',
    PROPFIND_DEPTH_0: '4xx',
    HEAD_ROOT: '4xx',
    HEAD_DETERMINISTIC_NONEXISTENT_CHILD: '4xx',
  },
  writeMethodUsed: false,
  firstWriteCommandExists: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
