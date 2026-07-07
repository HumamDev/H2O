#!/usr/bin/env node
//
// W3.4a refused-by-default first-write command proof validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-4a-refused-first-write-command-proof.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const w33aValidatorPath = 'tools/validation/sync/validate-real-transport-w3-3-write-grade-receipt-approval-gate-design.mjs';
const w33bValidatorPath = 'tools/validation/sync/validate-real-transport-w3-3-registry-storage-hardening.mjs';
const w33cValidatorPath = 'tools/validation/sync/validate-real-transport-w3-3-write-grade-registry-hash-boundary.mjs';

const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const W32_MOCK_PROOF_COMMIT = '649849e7e48c7e5bc5924bc811d857f2435866ae';
const W33A_DESIGN_COMMIT = '671fdc1c855b345185e5ea257b206c0a07cdab36';
const W33B_STORAGE_COMMIT = '388a952745ab7a21ba9556531eccf5c7e0ffe1ce';
const W33C_HASH_BOUNDARY_COMMIT = 'aba4c70068d95ee373d157fddea06bfb31b505b0';

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

function count(source, token) {
  return String(source).split(token).length - 1;
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const rust = read(rustPath);
const productionRust = rust.split('#[cfg(test)]')[0] || rust;
const lib = read(libPath);
const w33aValidator = read(w33aValidatorPath);
const w33bValidator = read(w33bValidatorPath);
const w33cValidator = read(w33cValidatorPath);
const productionSurface = `${productionRust}\n${lib}`;

for (const token of [
  W31_CLOSEOUT_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W32_MOCK_PROOF_COMMIT,
  W33A_DESIGN_COMMIT,
  W33B_STORAGE_COMMIT,
  W33C_HASH_BOUNDARY_COMMIT,
]) {
  mustContain(evidence, token, `evidence anchor ${token}`);
  mustContain(rust, token, `rust anchor ${token}`);
}

for (const token of [
  'pub fn h2o_rt_first_write',
  'evaluate_first_write',
  'evaluate_first_write_with_client',
  'RtFirstWriteRequest',
  'WriteGradeReceipt',
  'WriteGradeRequestBudget',
  'WriteGradeSacrificialObject',
  'WriteGradeReceiptBindings',
  'FIRST_WRITE_GATE',
  'real-transport-w3-4a-refused-first-write-loopback',
  'real-transport-w3-write-grade-approval-missing',
  'real-transport-w3-fixture-mock-grade-receipt-rejected',
  'real-transport-w3-write-grade-registry-source-refused',
  'real-transport-w3-one-shot-token-missing-or-mismatch',
  'real-transport-w3-kill-switch-token-missing-or-mismatch',
  'real-transport-w3-first-write-payload-too-large',
  'real-transport-w3-first-write-target-exists',
  'real-transport-w3-first-write-redirect-refused',
  'real-transport-w3-first-write-auth-refused',
  'real-transport-w3-first-write-remote-write-uncertain',
  'real-transport-w3-first-write-readback-hash-mismatch',
  'trait FirstWriteLoopbackClient',
  'DefaultFirstWriteLoopbackClient',
  'FIRST_WRITE_LIVE_GATE',
  'ReqwestFirstWriteLiveClient',
  'PROPFIND pre-write absence check',
  'PUT create-only #1',
  'PUT create-only #2',
  'GET read-back',
  'network_attempted: false',
  'writes_webdav: false',
  'product_sync_ready: false',
  'transport_ready: false',
]) {
  mustContain(rust, token, `rust token ${token}`);
}

assert.equal(
  count(lib, 'real_transport_capability_probe::h2o_rt_first_write'),
  2,
  'h2o_rt_first_write should be registered in both invoke-handler branches',
);

for (const token of [
  'first_write_default_refuses_without_network_or_write_flags',
  'first_write_rejects_fixture_grade_receipt',
  'first_write_rejects_legacy_registry_source',
  'first_write_rejects_token_hash_mismatch',
  'first_write_rejects_payload_too_large',
  'first_write_loopback_proves_create_only_sequence_without_network',
  'first_write_loopback_rejects_existing_target_redirect_auth_timeout_and_readback_mismatch',
  'status_code: 201',
  'status_code: 412',
]) {
  mustContain(rust, token, `rust test token ${token}`);
}

for (const token of [
  'Verdict: W3.4a IMPLEMENTS A REFUSED-BY-DEFAULT FIRST-WRITE COMMAND SUBSTRATE AND LOOPBACK TESTS ONLY. NO LIVE WRITE AUTHORIZATION.',
  '`h2o_rt_first_write`',
  'refused by default',
  'real-transport-w3-write-grade-approval-missing',
  'schema: h2o.studio.transport.first-write-request.v1',
  'gate: real-transport-w3-4a-refused-first-write-loopback',
  'mockOnly:true',
  'loopbackMock:true',
  'requestBudget.createOnlyPutMax:2',
  'requestBudget.readbackGetMax:1',
  'requestBudget.otherMethods:0',
  'payloadByteMax <= 256',
  'default-private-legacy',
  'write-grade use',
  'Loopback/mock tests simulate the future request sequence only',
  '`PROPFIND` pre-write absence check: simulated `404`',
  'create-only `PUT` #1: simulated `201`',
  'create-only `PUT` #2 to same path: simulated `412`',
  'read-back `GET`: simulated `200`',
  '`networkAttempted:false`',
  '`writesWebDAV:false`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  'no live WebDAV/cloud/relay/CAS/file write occurred',
  'no forbidden method was used against a real endpoint',
  'no real write-grade receipt was minted',
  'no real one-shot token was generated',
  'no real kill-switch token was generated',
  'no real token/export-id/sequence burn occurred',
  'no relay/outbox/ledger/store mutation occurred',
  'W3.4b live sacrificial invocation remains separate',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

mustContain(w33aValidator, 'w33aFirstWriteCommandExisted: false', 'W3.3A validator phase-scoped first-write field');
mustContain(w33bValidator, 'w33bFirstWriteCommandExisted: false', 'W3.3B validator phase-scoped first-write field');
mustContain(w33cValidator, 'w33cFirstWriteCommandExisted: false', 'W3.3C validator phase-scoped first-write field');

for (const token of [
  'reqwest::Method::PUT',
  'reqwest::Method::DELETE',
  'reqwest::Method::POST',
  'reqwest::Method::from_bytes(b"PUT")',
  'reqwest::Method::from_bytes(b"DELETE")',
  'reqwest::Method::from_bytes(b"POST")',
  '.put(',
  '.delete(',
  '.post(',
  'product_sync_ready: true',
  'transport_ready: true',
  'enqueues_relay: true',
  'full_bundle_v3_started: true',
  'mints_export_id: true',
  'burns_sequence: true',
]) {
  mustNotContain(productionRust, token, `production Rust forbidden ${token}`);
}

for (const token of [
  'productSyncReady:true',
  'transportReady:true',
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'live write performed:true',
  'W3.4b authorized:true',
]) {
  mustNotContain(flatEvidence, token, `evidence forbidden ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\brawCredential\s*[:=]/i, 'raw credential literal'],
  [/\bauthHeader\s*[:=]/i, 'auth header value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw remote path literal'],
  [/\brawListing\s*[:=]/i, 'raw listing literal'],
  [/\bresponseBody\s*[:=]/i, 'response body literal'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry literal'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

mustContain(productionSurface, 'h2o_rt_first_write', 'first-write command registration surface');

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4a-refused-first-write-command-proof',
  command: 'h2o_rt_first_write',
  defaultRefusal: 'real-transport-w3-write-grade-approval-missing',
  loopbackOnly: true,
  networkAttempted: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w34bSeparate: true,
}, null, 2));
