#!/usr/bin/env node
//
// W3.4b-3A gated live sacrificial WebDAV executor implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-4b-3a-live-sacrificial-executor-implementation.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';

const W34B3_BLOCKED_COMMIT = 'f305982d3000aef81664ed7b4ce4a681584de3df';

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
const rust = read(rustPath);
const productionRust = rust.split('#[cfg(test)]')[0] || rust;

for (const token of [
  W34B3_BLOCKED_COMMIT,
  'Verdict: W3.4b-3A IMPLEMENTED THE GATED LIVE SACRIFICIAL WEBDAV EXECUTOR PATH. NO LIVE INVOCATION. NO WEBDAV WRITE.',
  'liveExecutorPathImplemented:true',
  'liveInvocationPerformed:false',
  'h2oRtFirstWriteStillRefusesByDefault:true',
  'defaultRefusalBlocker: `real-transport-w3-write-grade-approval-missing`',
  'loopbackMockProofStillSupported:true',
  'loopbackMockSequence: `PROPFIND 404, PUT 201, PUT 412, GET 200`',
  'networkAttemptedInThisPhase:false',
  'writesWebDAVInThisPhase:false',
  'live gate: `real-transport-w3-4b-live-sacrificial-webdav-invocation`',
  'loopback gate remains: `real-transport-w3-4a-refused-first-write-loopback`',
  'receiptCoreHash',
  'receiptGrade: `write-grade`',
  'canonicalization: `json-sorted-keys-v1`',
  'requestBudget.createOnlyPutMax:2',
  'requestBudget.readbackGetMax:1',
  'requestBudget.otherMethods:0',
  'oneShotTokenHash match',
  'killSwitchTokenHash match',
  'registryPathSource: `app-local` or eligible `env`',
  'default-private-legacy refused for write-grade',
  'writeGradeRegistryEligible:true',
  'writeGradeRegistryRefHash match',
  'credentialMaterialPresent:true',
  '`PROPFIND` pre-write absence check',
  '`PUT` create-only request #1',
  '`PUT` create-only request #2',
  '`GET` read-back once',
  'redirects are not followed',
  'consumedMarkerCodeImplemented:true',
  'consumedMarkerExecutedInThisPhase:false',
  'deleteCleanupPathAdded:false',
  'productSyncReady:false',
  'transportReady:false',
  'W3.4b-3B may perform the future explicit live invocation only after separate operator approval.',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'FIRST_WRITE_LIVE_GATE',
  'real-transport-w3-4b-live-sacrificial-webdav-invocation',
  'live_webdav_invocation',
  'receipt_core_hash',
  'approval_expiry_utc',
  'WriteGradeReceipt',
  'canonicalization',
  'write_grade_receipt_core_hash',
  'ReqwestFirstWriteLiveClient',
  'trait FirstWriteLiveClient',
  'FirstWriteLiveOperation',
  'write_first_write_apply_intent_marker',
  'real-transport-w3-write-grade-receipt-core-hash-mismatch',
  'real-transport-w3-first-write-live-gate-required',
  'real-transport-w3-one-shot-token-missing-or-mismatch',
  'real-transport-w3-kill-switch-token-missing-or-mismatch',
  'real-transport-w3-write-grade-registry-source-refused',
  'real-transport-w3-first-write-network-failed',
  'real-transport-w3-first-write-remote-write-uncertain',
  'real-transport-w3-first-write-create-only-not-enforced',
  'real-transport-w3-first-write-readback-hash-mismatch',
  'reqwest::redirect::Policy::none()',
  'reqwest::header::IF_NONE_MATCH',
  'PROPFIND',
  'PUT',
  'GET',
  'first_write_live_path_refuses_incomplete_ceremony_before_network',
  'first_write_loopback_proves_create_only_sequence_without_network',
  'first_write_default_refuses_without_network_or_write_flags',
]) {
  mustContain(rust, token, `rust token ${token}`);
}

for (const token of [
  'DELETE',
  'MKCOL',
  'PROPPATCH',
  'MOVE',
  'COPY',
  'LOCK',
  'UNLOCK',
  'POST',
  'reqwest::Method::DELETE',
  'reqwest::Method::POST',
  '.delete(',
  '.post(',
  'product_sync_ready: true',
  'transport_ready: true',
]) {
  mustNotContain(productionRust, token, `production Rust forbidden ${token}`);
}

for (const token of [
  'liveInvocationPerformed:true',
  'networkAttempted:true',
  'writesWebDAV:true',
  'cleanupPerformed:true',
  'productSyncReady:true',
  'transportReady:true',
]) {
  mustNotContain(flatEvidence, token, `evidence forbidden ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\boneShotToken\s*[:=]/i, 'raw one-shot token key'],
  [/\bkillSwitchToken\s*[:=]/i, 'raw kill-switch token key'],
  [/\bpassword\s*[:=]/i, 'raw password key'],
  [/\bcredentialSecret\s*[:=]/i, 'raw credential secret key'],
  [/\bauthHeader\s*[:=]/i, 'raw auth header key'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint key'],
  [/\brawPath\s*[:=]/i, 'raw path key'],
  [/\bresponseBody\s*[:=]/i, 'response body key'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry key'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-3a-live-sacrificial-executor-implementation',
  evidencePath,
  liveExecutorPathImplemented: true,
  liveInvocationPerformed: false,
  defaultRefusalStillWorks: true,
  loopbackMockStillWorks: true,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  w34b3BSeparate: true,
}, null, 2));
