#!/usr/bin/env node
//
// W2a real-transport first-write preflight implementation validator.
//
// Re-executes the standalone W2a module in VM sandboxes with side-effect
// canaries, proves deterministic receipt-core generation, exercises every
// required blocker, and confirms the W1 console chain still passes when W2a is
// loaded alongside it.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const modulePath = 'src-surfaces-base/studio/sync/real-transport-first-write-preflight.js';
const evidencePath = 'release-evidence/2026-07-05/real-transport-w2a-first-write-preflight-implementation.md';
const w1HarnessPath = 'tools/validation/sync/run-real-transport-console-dry-run.mjs';

const w1Modules = [
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  'src-surfaces-base/studio/sync/real-transport-target-config.js',
  'src-surfaces-base/studio/sync/real-transport-kill-switch.js',
  'src-surfaces-base/studio/sync/real-transport-idempotency.js',
  'src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js',
  'src-surfaces-base/studio/sync/real-transport-conflict-recovery.js',
  'src-surfaces-base/studio/sync/real-transport-sequence-export.js',
  'src-surfaces-base/studio/sync/real-transport-approval.js',
  'src-surfaces-base/studio/sync/real-transport-readiness.js',
  'src-surfaces-base/studio/sync/real-transport-dry-run.js',
  'src-surfaces-base/studio/sync/real-transport-console.js',
];

const protectedPaths = [
  'src-surfaces-base/studio/studio.html',
  'tools/product/studio/pack-studio.mjs',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  ...w1Modules.filter((p) => /real-transport-.*\.js$/.test(p)),
].filter((p) => p !== modulePath);

const hardFalseFlags = [
  'standingAuthority',
  'oneShotTokenMinted',
  'realWriteExecuted',
  'realWebDAVTransportAvailable',
  'realTransportApprovalAccepted',
  'transportReady',
  'transportReadyFlipAuthorized',
  'productSyncReady',
  'realOutboxRowCreated',
  'relayOutboxTouched',
  'publicationLedgerTouched',
  'durableStoreCreated',
  'enqueuesRelay',
  'writesWebDAV',
  'writesCloud',
  'writesRelay',
  'writesCAS',
  'writesFiles',
  'writesKv',
  'writesSqlite',
  'writesLocalStorage',
  'mintsExportId',
  'burnsSequence',
  'fullBundleV3Started',
  'bootResumeDispatch',
  'mutatesExportState',
];

const w1FalseFlags = [
  'realWebDAVTransportAvailable',
  'realTransportWrite',
  'transportReady',
  'transportReadyFlipAuthorized',
  'productSyncReady',
  'writesWebDAV',
  'writesCloud',
  'writesRelay',
  'writesCAS',
  'writesFiles',
  'enqueuesRelay',
  'realOutboxRowCreated',
  'relayOutboxTouched',
  'publicationLedgerTouched',
  'durableStoreCreated',
  'mintsExportId',
  'burnsSequence',
  'mutatesExportState',
  'fullBundleV3Started',
];

const blockerMatrix = [
  ['wrong-gate', (r) => { r.gate = 'wrong'; }],
  ['apply-requested', (r) => { r.apply = true; }],
  ['w1c-proof-missing', (r) => { delete r.w1cProofReceiptHash; }],
  ['b8-artifact-missing', (r) => { delete r.b8ApprovalArtifactHash; }],
  ['approval-missing', (r) => { r.b8ApprovalAccepted = false; }],
  ['local-mock-approval-rejected', (r) => { r.targetMode = 'local-mock-webdav'; }],
  ['local-exportable-not-authorization', (r) => { r.localExportableSyncReadyIsAuthorization = true; }],
  ['target-evidence-missing', (r) => { delete r.endpointRefHash; }],
  ['kill-switch-missing-or-stale', (r) => { r.killSwitchStale = true; }],
  ['rollback-rehearsal-missing', (r) => { delete r.rollbackRehearsalReceiptHash; }],
  ['remote-root-state-missing', (r) => { delete r.remoteRootInitialStateHash; }],
  ['recovery-plan-missing', (r) => { delete r.recoveryPlanHash; }],
  ['chain-evidence-missing', (r) => { r.b4EnqueueOutboxBoundaryReady = false; }],
  ['payload-envelope-mismatch', (r) => { r.candidateBundleHash = H('b'); }],
  ['scope-not-single-payload', (r) => { r.targetScope.payloadCount = 2; }],
  ['invocation-scope-invalid', (r) => { r.w3InvocationScope.maxInvocations = 2; }],
  ['transport-ready-claim-rejected', (r) => { r.transportReady = true; }],
  ['product-sync-ready-claim-rejected', (r) => { r.productSyncReady = true; }],
  ['sequence-constraint-mismatch', (r) => { r.sequenceExportConstraintRefHash = H('e'); }],
  ['peer-ambiguous', (r) => { r.peerAmbiguous = true; }],
  ['raw-input-rejected', (r) => { r.rawEndpoint = 'RAW_ENDPOINT_MARKER_W2A_SHOULD_NOT_ECHO'; }],
  ['cas-input-rejected', (r) => { r.casKey = 'RAW_CAS_MARKER_W2A_SHOULD_NOT_ECHO'; }],
  ['fullbundle-v3-rejected', (r) => { r.startFullBundleV3 = true; }],
];

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function H(d) {
  return `sha256:${String(d).repeat(64).slice(0, 64)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function receiptHash(receiptCore) {
  return `sha256:${createHash('sha256').update(String(receiptCore), 'utf8').digest('hex')}`;
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function loadW2Sandbox() {
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
  return { sandbox, calls };
}

function apiFrom(sandbox) {
  return sandbox.H2O?.Studio?.sync?.realTransportFirstWritePreflight;
}

function validRequest() {
  const payload = H('a');
  return {
    gate: 'real-webdav-cloud-relay-transport-first-write-preflight-evaluate',
    operation: 'preflight',
    apply: false,
    b1TargetConfigReady: true,
    b1TargetConfigRefHash: H('1'),
    endpointRefHash: H('2'),
    remoteRootRefHash: H('3'),
    credentialRefHash: H('4'),
    peerIdentityBindingHash: H('5'),
    localClientIdentityHash: H('6'),
    b2KillSwitchLifecycleReady: true,
    b2KillSwitchRefHash: H('7'),
    b3DurableIdempotencyReady: true,
    b3IdempotencyRefHash: H('8'),
    b4EnqueueOutboxBoundaryReady: true,
    b4OutboxBoundaryRefHash: H('9'),
    b5ConflictPartialWriteReady: true,
    b5ConflictPolicyRefHash: H('b'),
    b6SequenceExportReady: true,
    b6SequenceExportRefHash: H('c'),
    sequenceExportConstraintRefHash: H('c'),
    b8ApprovalAccepted: true,
    realTransportApprovalAccepted: true,
    b8ApprovalRefHash: H('d'),
    b7ReadinessCandidate: true,
    transportReadyCandidate: true,
    b7ReadinessPolicyRefHash: H('e'),
    transportReadinessReviewRefHash: H('f'),
    candidatePayloadHash: payload,
    candidateBundleHash: payload,
    fullBundleV2EnvelopeHash: payload,
    payloadSchema: 'h2o.studio.fullBundle.v2',
    localExportableSyncReady: true,
    localExportableSyncReadyIsAuthorization: false,
    transportEligibilityFromLocalExportableReady: true,
    transportEligibilityIsAuthorization: false,
    productSyncReady: false,
    transportReady: false,
    transportReadyFlipAuthorized: false,
    noFullBundleV3: true,
    chatSavingCasBlocked: true,
    noCleanupAuthority: true,
    noA950Mutation: true,
    w1cProofReceiptHash: H('0'),
    b8ApprovalArtifactHash: H('1'),
    rollbackRehearsalReceiptHash: H('2'),
    remoteRootInitialStateHash: H('3'),
    recoveryPlanHash: H('4'),
    targetScope: {
      payloadKind: 'single-fullbundle-v2-envelope',
      payloadCount: 1,
      targetRefHash: H('5'),
    },
    w3InvocationScope: {
      operationKind: 'first-controlled-real-write',
      maxInvocations: 1,
      expiryUtc: '2026-07-06T00:00:00.000Z',
    },
  };
}

function assertNoWrites(result, label, flags = hardFalseFlags, requireSafety = true) {
  for (const key of flags) {
    assert.equal(result[key], false, `${label}: ${key}`);
  }
  if (!requireSafety) return;
  assert.equal(result.chatSavingCasBlocked, true, `${label}: chatSavingCasBlocked`);
  assert.equal(result.noCleanupAuthority, true, `${label}: noCleanupAuthority`);
  assert.equal(result.noA950Mutation, true, `${label}: noA950Mutation`);
}

function gitClean(rel) {
  const unstaged = execFileSync('git', ['diff', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(unstaged, '', `${rel}: unstaged changes present`);
  assert.equal(staged, '', `${rel}: staged changes present`);
}

function buildW1RequestFromHarness() {
  const harness = read(w1HarnessPath);
  const hSrc = harness.match(/function H\(d\) \{[\s\S]*?\n\}/)?.[0];
  const buildSrc = harness.match(/function buildRequest\(\) \{[\s\S]*?\n\}\n\nconst sandbox/)?.[0]
    .replace(/\n\nconst sandbox$/, '');
  assert.ok(hSrc && buildSrc, 'W1 harness request builder extracted');
  return vm.runInNewContext(`${hSrc}\n${buildSrc}\nbuildRequest();`, {});
}

// Evidence anchors.
const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
for (const token of [
  'W2a real-transport first-write preflight substrate implemented',
  'eebbb874',
  '6cb1c6ba',
  '826c4153',
  'ba5844f7',
  'f93350d4',
  '34356fa6',
  'a4777528',
  '10e1ee6c',
  'H2O.Studio.sync.realTransportFirstWritePreflight.evaluateRealTransportFirstWritePreflight(request)',
  'H2O.Studio.sync.realTransportFirstWritePreflight.buildReceiptCore(result)',
  'W2b loader registration deferred',
  'W2c live closeout deferred',
]) {
  assertIncludes(flatEvidence, token, `evidence ${token}`);
}

for (const token of [
  'candidate-only',
  'never standing authority',
  'single-invocation scoped',
  'expiring',
  'no token minted',
  'no real write authority',
  'B8 approval document',
  'rollback rehearsal receipt',
  'remote-root initial-state statement',
  'partial-write recovery plan',
]) {
  assertIncludes(flatEvidence, token, `evidence semantics ${token}`);
}

// Source scan and protected-file checks.
const source = read(modulePath);
for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'localStorage.setItem',
  'sqlExecute',
  'writeFile',
  'invoke(',
  'crypto',
  '://',
]) {
  assertNotIncludes(source, forbidden, `module source token ${forbidden}`);
}
for (const rel of protectedPaths) gitClean(rel);

// Load-time inertness and API exposure.
const loaded = loadW2Sandbox();
assert.deepEqual(loaded.calls, [], 'load-time canaries did not fire');
const api = apiFrom(loaded.sandbox);
assert.equal(typeof api?.evaluateRealTransportFirstWritePreflight, 'function', 'evaluate API exposed');
assert.equal(typeof api?.buildReceiptCore, 'function', 'buildReceiptCore API exposed');
assert.equal(typeof api?.diagnose, 'function', 'diagnose API exposed');
assert.equal(api.SCHEMA, 'h2o.studio.sync.real-transport-w2-first-write-preflight.v1', 'SCHEMA exposed');
assert.equal(api.REQUEST_SCHEMA, 'h2o.studio.transport.real-transport-w2-first-write-preflight-request.v1',
  'REQUEST_SCHEMA exposed');
assert.equal(api.RECEIPT_SCHEMA, 'h2o.studio.transport.first-write-authorization-candidate-receipt-core.v1',
  'RECEIPT_SCHEMA exposed');
assert.equal(api.PREFLIGHT_GATE, 'real-webdav-cloud-relay-transport-first-write-preflight-evaluate',
  'PREFLIGHT_GATE exposed');

const diag = api.diagnose();
assert.equal(diag.installed, true, 'diagnose installed');
assertNoWrites(diag, 'diagnose');

// Valid fixture.
const valid = api.evaluateRealTransportFirstWritePreflight(validRequest());
assert.equal(valid.ok, true, 'valid preflight ok');
assert.equal(valid.status, 'real-transport-w2-first-write-preflight-ready', 'valid status');
assert.equal(valid.firstWriteAuthorizationCandidate, true, 'candidate true');
assert.equal(valid.receiptKind, 'first-write-authorization-candidate', 'receipt kind');
assert.equal(valid.receiptCoreCanonicalization, 'json-sorted-keys-v1', 'canonicalization');
assert.ok(valid.receiptCore.includes('"canonicalization":"json-sorted-keys-v1"'), 'receipt core canonicalization included');
assert.equal(api.buildReceiptCore(valid), valid.receiptCore, 'buildReceiptCore matches result');
assert.match(receiptHash(valid.receiptCore), /^sha256:[0-9a-f]{64}$/, 'external receipt hash shape');
assertNoWrites(valid, 'valid preflight');

// Determinism: repeated evaluation and fresh VM sandboxes.
const validAgain = api.evaluateRealTransportFirstWritePreflight(validRequest());
assert.equal(validAgain.receiptCore, valid.receiptCore, 'same sandbox repeated receipt core');
assert.equal(receiptHash(validAgain.receiptCore), receiptHash(valid.receiptCore), 'same sandbox receipt hash');
const freshA = apiFrom(loadW2Sandbox().sandbox).evaluateRealTransportFirstWritePreflight(validRequest());
const freshB = apiFrom(loadW2Sandbox().sandbox).evaluateRealTransportFirstWritePreflight(validRequest());
assert.equal(freshA.receiptCore, valid.receiptCore, 'fresh sandbox A receipt core');
assert.equal(freshB.receiptCore, valid.receiptCore, 'fresh sandbox B receipt core');

// Blocker matrix.
for (const [name, mutate] of blockerMatrix) {
  const req = validRequest();
  mutate(req);
  const result = api.evaluateRealTransportFirstWritePreflight(req);
  assert.equal(result.ok, false, `${name}: blocks`);
  assert.ok(result.blockers.includes(`real-transport-w2-${name}`), `${name}: expected blocker`);
  assert.equal(result.receiptCore, '', `${name}: no receipt core`);
  assertNoWrites(result, `${name}: no writes`);
}

// Coercion resistance.
const coerced = validRequest();
for (const key of hardFalseFlags) coerced[key] = true;
const coercedResult = api.evaluateRealTransportFirstWritePreflight(coerced);
assert.equal(coercedResult.ok, false, 'coerced request blocks');
assertNoWrites(coercedResult, 'coerced request');

// Raw/CAS markers are not echoed anywhere.
for (const [key, marker] of [
  ['rawEndpoint', 'RAW_ENDPOINT_MARKER_W2A_SHOULD_NOT_ECHO'],
  ['casKey', 'RAW_CAS_MARKER_W2A_SHOULD_NOT_ECHO'],
]) {
  const req = validRequest();
  req[key] = marker;
  const result = api.evaluateRealTransportFirstWritePreflight(req);
  assert.equal(result.ok, false, `${key}: blocks`);
  assert.ok(!JSON.stringify(result).includes(marker), `${key}: marker not echoed in result`);
  assert.ok(!String(result.receiptCore).includes(marker), `${key}: marker not echoed in receipt core`);
}

// W1 console still passes with W2 loaded alongside.
const w1Sandbox = { console };
w1Sandbox.globalThis = w1Sandbox;
for (const rel of [...w1Modules, modulePath]) {
  vm.runInNewContext(read(rel), w1Sandbox, { filename: rel });
}
const w1Api = w1Sandbox.H2O?.Studio?.sync?.realTransportConsole;
assert.equal(typeof w1Api?.diagnose, 'function', 'W1 diagnose available');
assert.equal(typeof w1Api?.runChainedDryRun, 'function', 'W1 run available');
const w1Diag = w1Api.diagnose();
assert.equal(w1Diag.ok, true, 'W1 diagnose still ok');
const w1Result = w1Api.runChainedDryRun(buildW1RequestFromHarness());
assert.equal(w1Result.ok, true, 'W1 chained dry-run still ok');
assert.equal(w1Result.status, 'real-transport-console-chained-dry-run-ready', 'W1 chained status');
assertNoWrites(w1Result, 'W1 chained dry-run with W2 loaded', w1FalseFlags, false);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w2-first-write-preflight-implementation',
  validStatus: valid.status,
  receiptHash: receiptHash(valid.receiptCore),
  blockersExercised: blockerMatrix.length,
  deterministicReceiptCore: true,
  w1ConsoleStillPasses: true,
  realWebDAVTransportAvailable: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
}, null, 2));
