#!/usr/bin/env node
//
// W3.1.7-R5 exact read-only status code diagnostic validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-status-code-diagnostic.md';
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
  '6c09741cdc324550986c4d1f542b19fc51274305',
  '54a193a952f20ae8cac2f52b3a6010ed2b66d2e0',
  '39206f4f505c198218570ded66a7da05270fa58c',
  '2ec8a465a4393c31d75536d9cea974d76ff528cf',
  '6a5e8bbe5f68148c8eb28456d9922ec8f666a10e',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Verdict: DIAGNOSIS COMPLETE; REMOTE-ROOT READINESS STILL NOT PROVEN.',
  'descriptorRegistryRefHash: `sha256:ee7ca9946f0a04baa8d13a3b3d2909b8205de7854b8434badd5c000e322706c5`',
  'endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`',
  'remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`',
  'credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`',
  'OPTIONS statusCode: `401`',
  'OPTIONS statusFamily: `4xx`',
  'PROPFIND Depth 0 statusCode: `429`',
  'PROPFIND Depth 0 statusFamily: `4xx`',
  'HEAD root statusCode: `429`',
  'HEAD root statusFamily: `4xx`',
  'HEAD deterministic nonexistent child statusCode: `429`',
  'HEAD deterministic nonexistent child statusFamily: `4xx`',
  'targetShape: `endpoint-plus-folder`',
  'doubleSlash: false',
  'authHeaderPresent: true',
  'OPTIONS trailingSlash:false',
  'PROPFIND Depth 0 trailingSlash:false',
  'PROPFIND Depth 0 propfindDepthHeaderPresent:true',
  'PROPFIND Depth 0 propfindBodyPresent:false',
  'folder URL builder emits a folder target with a trailing slash',
  'PROPFIND body is present',
  'auth scheme class is Basic',
  'trailingSlash:false for the tested targets',
  'PROPFIND body present:false',
  'auth/scope failure or missing accepted auth',
  'provider throttling or request-rate limiting',
  'Request-shape mismatch is also suspected',
  'not a full remote-root readiness pass',
  '`h2o_rt_first_write` absent: true',
  'write command absent: true',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
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

assertIncludes(command, 'pub struct ReadOnlyRequestShape', 'request-shape schema');
assertIncludes(command, 'pub status_code: u16', 'exact status code field');
assertIncludes(command, 'pub request_shape: ReadOnlyRequestShape', 'method request-shape field');
assertIncludes(command, 'propfind_body_present: false', 'no PROPFIND body diagnostic');
assertIncludes(command, 'operation.redacted_label()', 'redacted method label');
assertIncludes(command, 'pub fn h2o_rt_capability_probe', 'probe command source');
assertIncludes(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registration');
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
  'remoteRootReachable:true',
  'rootExists:true',
  'child404Ok:true',
  'W3.2 is unblocked',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden claim ${forbidden}`);
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
  validator: 'validate-real-transport-w3-1-readonly-status-code-diagnostic',
  statusCodes: {
    OPTIONS: 401,
    PROPFIND_DEPTH_0: 429,
    HEAD_ROOT: 429,
    HEAD_DETERMINISTIC_NONEXISTENT_CHILD: 429,
  },
  authOrTokenSuspected: true,
  endpointOrFolderNormalizationSuspected: true,
  providerMethodBehaviorSuspected: true,
  writeMethodUsed: false,
  firstWriteCommandExists: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
