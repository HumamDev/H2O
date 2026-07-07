#!/usr/bin/env node
//
// W3.2 mock WebDAV executor proof validator.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const modulePath = 'src-surfaces-base/studio/sync/real-transport-w3-mock-executor-proof.js';
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-2-mock-webdav-executor-proof.md';
const w31CloseoutPath = 'release-evidence/2026-07-06/real-transport-w3-1-live-readonly-webdav-probe-closeout.md';
const r10EvidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-probe-request-shape-alignment.md';
const rustProbePath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const w2PreflightPath = 'src-surfaces-base/studio/sync/real-transport-first-write-preflight.js';

const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const R10_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const DESCRIPTOR_REGISTRY_HASH = 'sha256:b08bf32a3b41f019c7a7474a1588510b80a0a7e8b40891c3b43d758784312094';
const ENDPOINT_HASH = 'sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100';
const REMOTE_ROOT_HASH = 'sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca';
const CREDENTIAL_HASH = 'sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function hash(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadMockExecutor() {
  const calls = [];
  const sandbox = {
    console,
    localStorage: {
      getItem() { calls.push('localStorage.getItem'); throw new Error('canary localStorage.getItem'); },
      setItem() { calls.push('localStorage.setItem'); throw new Error('canary localStorage.setItem'); },
      removeItem() { calls.push('localStorage.removeItem'); throw new Error('canary localStorage.removeItem'); },
    },
    fetch() { calls.push('fetch'); throw new Error('canary fetch'); },
    XMLHttpRequest() { calls.push('XMLHttpRequest'); throw new Error('canary XMLHttpRequest'); },
    invoke() { calls.push('invoke'); throw new Error('canary invoke'); },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read(modulePath), sandbox, { filename: modulePath });
  const api = sandbox.H2O?.Studio?.sync?.realTransportW3MockExecutorProof;
  assert.ok(api, 'mock executor API missing');
  return { api, calls };
}

function validRequest() {
  return {
    gate: 'real-webdav-cloud-relay-transport-w3-mock-executor-proof-evaluate',
    operation: 'mock-executor-proof',
    mockOnly: true,
    evidence: {
      w31CloseoutCommit: W31_CLOSEOUT_COMMIT,
      w31CloseoutEvidencePresent: true,
      w31ReadOnlyRemoteRootReadinessPassed: true,
      remoteRootReachable: true,
      rootExists: true,
      child404Ok: true,
    },
    registry: {
      descriptorRegistryRefHash: DESCRIPTOR_REGISTRY_HASH,
      expectedDescriptorRegistryRefHash: DESCRIPTOR_REGISTRY_HASH,
      endpointRefHash: ENDPOINT_HASH,
      remoteRootRefHash: REMOTE_ROOT_HASH,
      credentialRefHash: CREDENTIAL_HASH,
    },
    receipt: {
      fixtureOrMockGradeReceipt: true,
      writeGradeReceiptPresent: false,
      expiryUtc: '2099-07-06T00:00:00.000Z',
    },
    approval: {
      explicitWriteApprovalPresent: false,
    },
    execution: {
      executeAttempted: false,
      selectedMethod: 'none',
      networkAttempted: false,
    },
    safety: {
      h2oRtFirstWriteAbsent: true,
      productSyncReady: false,
      transportReady: false,
    },
  };
}

function assertNoWriteFlags(result, label) {
  for (const key of [
    'networkAttempted',
    'realWriteEligible',
    'explicitWriteApprovalConsumed',
    'writesWebDAV',
    'writesCloud',
    'writesRelay',
    'writesCAS',
    'writesFiles',
    'enqueuesRelay',
    'mintsExportId',
    'burnsSequence',
    'fullBundleV3Started',
    'productSyncReady',
    'transportReady',
  ]) {
    assert.equal(result[key], false, `${label}: ${key}`);
  }
  assert.equal(result.mockOnly, true, `${label}: mockOnly`);
  assert.equal(result.noRealApprovalConsumed, true, `${label}: noRealApprovalConsumed`);
  assert.equal(result.noRealTokenMinted, true, `${label}: noRealTokenMinted`);
  assert.equal(result.noRealTokenConsumed, true, `${label}: noRealTokenConsumed`);
  assert.equal(result.noExportIdMinted, true, `${label}: noExportIdMinted`);
  assert.equal(result.noSequenceBurn, true, `${label}: noSequenceBurn`);
  assert.equal(result.noRelayOutboxLedgerStoreMutation, true, `${label}: noRelayOutboxLedgerStoreMutation`);
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const w31Closeout = read(w31CloseoutPath);
const r10Evidence = read(r10EvidencePath);
const moduleSource = read(modulePath);
const rustProbe = read(rustProbePath);
const lib = read(libPath);
const w2Preflight = read(w2PreflightPath);
const productionRust = rustProbe.split('#[cfg(test)]')[0] || rustProbe;
const rustSurface = `${productionRust}\n${lib}`;

for (const token of [
  'Verdict: W3.2 MOCK EXECUTOR PROOF PASSED; REAL WRITE REMAINS BLOCKED.',
  `W3.1 live read-only closeout commit: \`${W31_CLOSEOUT_COMMIT}\``,
  `W3.1 request-shape alignment commit: \`${R10_COMMIT}\``,
  'W3.1 read-only remote-root readiness: passed',
  'W3.2 mock executor ran: true',
  'mockOnly:true',
  'networkAttempted:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
  'readOnlyPrerequisitePassed:true',
  'w31CloseoutEvidencePresent:true',
  'descriptor registry hash present:true',
  'registryHashMatched:true',
  'h2o_rt_first_write absent:true',
  'explicitWriteApprovalPresent:false',
  'writeGradeReceiptPresent:false',
  'fixtureOrMockGradeReceipt:true',
  'realWriteEligible:false',
  'failClosed:true',
  'mock receipt produced:true',
  'mock receipt schema: `h2o.studio.transport.w3-mock-executor-proof-receipt.v1`',
  'missing W3.1 closeout evidence',
  'prepared registry hash mismatch',
  'expired receipt',
  'execute/write request attempted',
  'forbidden write method selected',
  'networkAttempted claim',
  'productSyncReady:true claim',
  'transportReady:true claim',
  'raw private input',
  'explicit write approval is absent',
  'write-grade receipt is absent',
  'fixture/mock-grade receipt material is rejected for real write',
  'no real approval was consumed',
  'no real token was minted or consumed',
  'no export-id was minted',
  'no sequence was burned',
  'no relay/outbox/ledger/store mutation occurred',
  'no fullBundle.v3 start or mint occurred',
  '`h2o_rt_first_write` absent:true',
  'write command absent:true',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  `R10 commit: \`${R10_COMMIT}\``,
  'W3.1 LIVE READ-ONLY REMOTE-ROOT READINESS PASSED.',
  'W3.2 mock executor proof can begin next.',
  'This closeout does not authorize writes.',
]) {
  assertIncludes(w31Closeout, token, `W3.1 closeout token ${token}`);
}

for (const token of [
  'PROPFIND Depth 0 | `207`',
  'remoteRootReachable:true',
  'rootExists:true',
  'child404Ok:true',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
]) {
  assertIncludes(r10Evidence, token, `R10 evidence token ${token}`);
}

for (const token of [
  'realTransportW3MockExecutorProof',
  'evaluateW3MockExecutorProof',
  'networkAttempted: false',
  'writesWebDAV: false',
  'productSyncReady: false',
  'transportReady: false',
  'explicit-write-approval-absent',
  'write-grade-receipt-absent',
  'fixture-or-mock-grade-receipt-rejected-for-real-write',
  'real-transport-w3-mock-executor-execute-requested',
  'real-transport-w3-mock-executor-real-write-method-selected',
  'real-transport-w3-mock-executor-registry-hash-mismatch',
  'real-transport-w3-mock-executor-receipt-expired',
]) {
  assertIncludes(moduleSource, token, `module token ${token}`);
}

for (const forbidden of [
  'fetch(',
  'XMLHttpRequest(',
  'localStorage.',
  'invoke(',
  'navigator.sendBeacon',
  'WebSocket',
  'EventSource',
]) {
  assertNotIncludes(moduleSource, forbidden, `mock module side effect ${forbidden}`);
}

assertIncludes(w2Preflight, 'first-write-authorization-candidate', 'W2 receipt substrate inspected');
assertIncludes(w2Preflight, 'candidateOnly: true', 'W2 receipt remains candidate only');
assertIncludes(w2Preflight, 'oneShotTokenMinted: false', 'W2 no token mint');
assertNotIncludes(rustSurface, 'h2o_rt_first_write', 'first write command');
assertNotIncludes(rustSurface, 'first_write', 'write command family');

const { api, calls } = loadMockExecutor();
const result = api.evaluateW3MockExecutorProof(validRequest());
assert.equal(result.ok, true, 'baseline mock proof should pass');
assert.equal(result.status, 'real-transport-w3-mock-executor-proof-completed-real-write-blocked');
assert.equal(result.readOnlyPrerequisitePassed, true, 'read-only prerequisite passed');
assert.equal(result.registryHashMatched, true, 'registry hash matched');
assert.equal(result.firstWriteCommandAbsent, true, 'first-write command absent');
assert.equal(result.explicitWriteApprovalPresent, false, 'approval absent');
assert.equal(result.writeGradeReceiptPresent, false, 'write-grade receipt absent');
assert.equal(result.fixtureOrMockGradeReceipt, true, 'fixture/mock grade receipt classified');
assert.equal(result.failClosed, true, 'baseline real execution fail-closed');
assert.deepEqual(Array.from(result.failClosedReasons), [
  'explicit-write-approval-absent',
  'write-grade-receipt-absent',
  'fixture-or-mock-grade-receipt-rejected-for-real-write',
]);
assert.ok(result.mockReceipt, 'mock receipt produced');
assert.equal(result.mockReceipt.mockOnly, true, 'mock receipt mockOnly');
assert.equal(calls.length, 0, 'mock evaluator must not touch canary side effects');
assertNoWriteFlags(result, 'baseline');
const mockReceiptHash = hash(result.mockReceiptCore);
assert.match(mockReceiptHash, /^sha256:[0-9a-f]{64}$/, 'mock receipt hash shape');

const blockers = [
  ['missing-closeout', (r) => { r.evidence.w31CloseoutEvidencePresent = false; },
    'real-transport-w3-mock-executor-readonly-closeout-missing'],
  ['hash-mismatch', (r) => { r.registry.expectedDescriptorRegistryRefHash = `sha256:${'f'.repeat(64)}`; },
    'real-transport-w3-mock-executor-registry-hash-mismatch'],
  ['expired-receipt', (r) => { r.receipt.expiryUtc = '2000-01-01T00:00:00.000Z'; },
    'real-transport-w3-mock-executor-receipt-expired'],
  ['execute-requested', (r) => { r.execution.executeAttempted = true; },
    'real-transport-w3-mock-executor-execute-requested'],
  ['forbidden-method', (r) => { r.execution.selectedMethod = 'PUT'; },
    'real-transport-w3-mock-executor-real-write-method-selected'],
  ['network-claim', (r) => { r.execution.networkAttempted = true; },
    'real-transport-w3-mock-executor-network-attempted-claim-rejected'],
  ['product-ready-claim', (r) => { r.safety.productSyncReady = true; },
    'real-transport-w3-mock-executor-product-sync-ready-claim-rejected'],
  ['transport-ready-claim', (r) => { r.safety.transportReady = true; },
    'real-transport-w3-mock-executor-transport-ready-claim-rejected'],
  ['raw-input', (r) => { r.rawEndpoint = 'RAW_ENDPOINT_MARKER_SHOULD_NOT_ECHO'; },
    'real-transport-w3-mock-executor-raw-input-rejected'],
];

for (const [name, mutate, expectedBlocker] of blockers) {
  const request = clone(validRequest());
  mutate(request);
  const blocked = api.evaluateW3MockExecutorProof(request);
  assert.equal(blocked.ok, false, `${name}: blocked`);
  assert.ok(blocked.blockers.includes(expectedBlocker), `${name}: includes ${expectedBlocker}`);
  assertNoWriteFlags(blocked, name);
  assert.equal(calls.length, 0, `${name}: no canary side effects`);
  const serialized = JSON.stringify(blocked);
  assert.ok(!serialized.includes('RAW_ENDPOINT_MARKER_SHOULD_NOT_ECHO'), `${name}: raw marker not echoed`);
}

for (const forbidden of [
  'writesWebDAV:true',
  'networkAttempted:true',
  'realWriteEligible:true',
  'h2o_rt_first_write was added',
  'W3.4 is authorized',
  'W3.5 is authorized',
]) {
  assertNotIncludes(flatEvidence, forbidden, `forbidden evidence claim ${forbidden}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw remote path literal'],
  [/\brawListing\s*[:=]/i, 'raw listing literal'],
  [/\bpayloadBody\s*[:=]/i, 'payload body literal'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-2-mock-webdav-executor-proof',
  mockOnly: true,
  mockReceiptHash,
  readOnlyPrerequisitePassed: true,
  networkAttempted: false,
  writesWebDAV: false,
  firstWriteCommandExists: false,
  realWriteEligible: false,
  noRealApprovalConsumed: true,
  noRealTokenMintedOrConsumed: true,
  noExportIdMinted: true,
  noSequenceBurn: true,
  noRelayOutboxLedgerStoreMutation: true,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
