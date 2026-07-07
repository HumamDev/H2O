#!/usr/bin/env node
//
// W3.1.7-R10 read-only WebDAV request-shape alignment validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-probe-request-shape-alignment.md';
const commandPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const mobileWebdavPath = 'apps/studio/mobile/src/utils/webdav.ts';
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
const mobileWebdav = read(mobileWebdavPath);
const lib = read(libPath);
const rustCommandSurface = `${productionCommand}\n${lib}`;

for (const token of [
  'e26378e70fe4f84e5e9ab413d11d8ce92b203530',
  '4ee8e6a7196a4706bc58ae43a94e5a5e38b6674c',
  'f74fde2d8f70ddb167a2f27aaa31d79d8747e508',
  '7caff3f9e7b961c7a16768dcf39913bbc9c7fcbb',
]) {
  mustContain(evidence, token, `anchor ${token}`);
}

for (const token of [
  'Verdict: CONTROLLED READ-ONLY PROBE PASSED REMOTE-ROOT READINESS AFTER REQUEST-SHAPE ALIGNMENT.',
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
  'remoteRootReachable:true',
  'rootExists:true',
  'rootEmpty:false',
  'child404Ok:true',
  'listingHash: `sha256:623e56fd3ef23e76bd9a127904745056f1933292940fae3507687d5f79a64baf`',
  '| OPTIONS | `200` | `2xx` |',
  '| PROPFIND Depth 0 | `207` | `2xx` |',
  '| HEAD root | `405` | `4xx` |',
  '| HEAD deterministic nonexistent child | `404` | `4xx` |',
  'targetShape: `endpoint-plus-folder`',
  'doubleSlash:false',
  'authHeaderPresent:true',
  '| PROPFIND Depth 0 | true | true | true | `xml` | `xml` |',
  'provider-specific',
  'W3.2/W3.4 remain separate explicit phases',
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
  'write or mutation request body sent:false',
  'relay enqueue performed: false',
  'outbox/ledger/store mutation performed: false',
  'fullBundleV3Started:false',
  'mintsExportId:false',
  'burnsSequence:false',
]) {
  mustContain(flatEvidence, token, `boundary token ${token}`);
}

mustContain(command, 'const WEBDAV_PROPFIND_BODY', 'Desktop PROPFIND body constant');
mustContain(command, 'const WEBDAV_XML_ACCEPT', 'Desktop XML accept constant');
mustContain(command, 'const WEBDAV_XML_CONTENT_TYPE', 'Desktop XML content type constant');
mustContain(command, 'segments.push("")', 'Desktop trailing-slash folder target');
mustContain(command, 'propfind_body_present: operation.sends_propfind_body()', 'redacted PROPFIND body class');
mustContain(command, 'propfind_content_type_class', 'redacted content-type class');
mustContain(command, 'accept_header_class', 'redacted accept class');
mustContain(command, 'outcome.root_exists != Some(true)', 'PROPFIND success preserved over HEAD behavior');
mustContain(mobileWebdav, 'const PROPFIND_BODY', 'mobile PROPFIND body');
mustContain(mobileWebdav, 'buildWebDAVFolderUrl', 'mobile folder URL builder');
mustContain(mobileWebdav, "Depth: '0'", 'mobile Depth header');
mustContain(mobileWebdav, "'Content-Type': 'application/xml; charset=utf-8'", 'mobile XML content type');
mustContain(mobileWebdav, "Accept: 'application/xml,text/xml,*/*'", 'mobile XML accept');
mustContain(lib, 'real_transport_capability_probe::h2o_rt_capability_probe', 'probe command registration');
mustNotContain(rustCommandSurface, 'h2o_rt_first_write', 'first write command');
mustNotContain(rustCommandSurface, 'first_write', 'write command family');

for (const forbidden of ['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'POST']) {
  mustNotContain(productionCommand, `"${forbidden}"`, `forbidden method executable path ${forbidden}`);
}

for (const forbidden of [
  'writesWebDAV:true',
  'productSyncReady:true',
  'transportReady:true',
  'W3.2 is unblocked',
  'W3.4 is unblocked',
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
  validator: 'validate-real-transport-w3-1-readonly-probe-request-shape-alignment',
  probeResult: 'pass',
  networkAttempted: true,
  statusCodes: {
    OPTIONS: 200,
    PROPFIND_DEPTH_0: 207,
    HEAD_ROOT: 405,
    HEAD_DETERMINISTIC_NONEXISTENT_CHILD: 404,
  },
  remoteRootReachable: true,
  rootExists: true,
  child404Ok: true,
  writeMethodUsed: false,
  firstWriteCommandExists: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
