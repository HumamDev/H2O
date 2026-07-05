#!/usr/bin/env node
//
// Real-transport B3 - durable idempotency store implementation validator.
//
// Proves the B3 substrate (src-surfaces-base/studio/sync/real-transport-idempotency.js): it respects the B3 design
// (e1618571), the B2 implementation (de4aa12d), the B1 implementation (93eb9065), and the B1-B8 rollup (36e46513); a
// valid hash-only idempotency evaluation passes; a completed key produces duplicate-replay-noop / zero-write; changed
// payload/target/sequence is not a duplicate; a pending restart does not auto-write and enters explicit-recovery-required;
// missing/corrupt/mismatch/stale/raw/CAS inputs block; no durable store is created; real transport stays unavailable and
// real approval stays false even when the request tries to set them; productSyncReady:false and transportReady:false
// remain; fullBundle.v3 stays deferred; Chat Saving CAS stays blocked; and no cleanup/a950 mutation authority is
// introduced. It re-executes the REAL module in a vm sandbox.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-idempotency.js';
const b2ModulePath = 'src-surfaces-base/studio/sync/real-transport-kill-switch.js';
const b1ModulePath = 'src-surfaces-base/studio/sync/real-transport-target-config.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-implementation.md';
const b3DesignPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md';
const b2ImplPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md';
const b1ImplPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const rollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const moduleSource = read(modulePath);
const b2ModuleSource = read(b2ModulePath);
const b1ModuleSource = read(b1ModulePath);
const evidence = read(evidencePath);
const flat = compact(evidence);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function H(d) { return 'sha256:' + String(d).repeat(64).slice(0, 64); } // d must be a hex digit 0-9a-f
const KEY = H('a'); const PH = H('b'); const OTHERKEY = H('c'); const OTHERPH = H('d');
const valid = {
  attempt: { phase: 'preflight' }, idempotencyKeyHash: KEY, candidatePayloadHash: PH, candidateBundleHash: PH,
  endpointRefHash: H('e'), remoteRootRefHash: H('f'), peerIdentityBindingHash: H('0'), credentialRefHash: H('1'),
  killSwitchEnableTokenHash: H('2'), b8ApprovalRefHash: H('3'), b7ReadinessPolicyRefHash: H('4'),
  sequenceExportConstraintRefHash: H('5'), operationKind: 'real-webdav-cloud-relay-upload', activeTransport: 'real-webdav',
  productSyncReady: false, transportReady: false, existingRecord: { present: false },
};

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportIdempotency;
}

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  'e1618571', 'de4aa12d', '93eb9065', '36e46513',
  'src-surfaces-base/studio/sync/real-transport-idempotency.js',
  'H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency(request)',
  'No durable store is created',
  'intentionally standalone (non-activating)',
  '`durableStoreCreated:false`',
  '`idempotencyRecordReady:true`',
  'a duplicate replay is zero-write',
  'B4 implementation - real enqueue / outbox boundary',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'durable store created', 'real transport is now available', 'real transport is authorized',
  'real WebDAV is enabled', 'authorizes real transport',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim: ${forbidden}`);
}
assert.doesNotMatch(evidence, /https?:\/\//i, 'evidence must contain no raw endpoint URL');

assertIncludes(read(b3DesignPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE IS DESIGNED', 'B3 design respected');
assertIncludes(read(b2ImplPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED', 'B2 implementation respected');
assertIncludes(read(b1ImplPath), 'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED', 'B1 implementation respected');
assertIncludes(read(rollupPath), 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED', 'B1-B8 rollup respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT', 'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (2) REAL MODULE: exposes API; non-activation hardcoded; non-writing; lifecycle states + namespace present.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency = evaluateRealTransportIdempotency',
  'module exposes the B3 evaluate API');
assertIncludes(moduleSource, "STORE_NAMESPACE = 'h2o:sync:real-transport-idempotency:v1'", 'proposed store namespace referenced');
for (const st of ['preflight-observed', 'apply-intent-recorded', 'remote-write-pending', 'remote-write-observed',
  'ledger-pending', 'completed', 'failed', 'explicit-recovery-required', 'duplicate-replay-noop']) {
  assertIncludes(moduleSource, `'${st}'`, `lifecycle state ${st}`);
}
for (const token of [
  'durableStoreCreated: false', 'writesKv: false', 'writesSqlite: false', 'writesLocalStorage: false',
  'autoWriteOnResume: false', 'realWebDAVTransportAvailable: false', 'realTransportApprovalAccepted: false',
  'productSyncReady: false', 'transportReady: false', 'chatSavingCasBlocked: true', 'fullBundleV3Started: false',
  'noCleanupAuthority: true',
]) {
  assertIncludes(moduleSource, token, `module invariant ${token}`);
}
assertNotIncludes(moduleSource, 'durableStoreCreated: true', 'module must not create a durable store');
assertNotIncludes(moduleSource, 'realWebDAVTransportAvailable: true', 'module must not make real WebDAV available');
assertNotIncludes(moduleSource, 'productSyncReady: true', 'module must not flip productSyncReady');
assert.doesNotMatch(moduleSource, /https?:\/\//i, 'module must contain no raw endpoint URL literal');
for (const banned of ['sqlExecute', 'localStorage.setItem', 'fetch(', 'XMLHttpRequest', 'writeFile', 'invoke(']) {
  assertNotIncludes(moduleSource, banned, `module must be non-writing (${banned})`);
}

// ---------------------------------------------------------------------------
// (3) Behavioral re-execution.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportIdempotency, 'function', 'B3 API installed');

const v = api.evaluateRealTransportIdempotency(valid);
assert.equal(v.ok, true, 'valid preflight ok');
assert.equal(v.idempotencyRecordReady, true, 'valid preflight ready');
assert.equal(v.resolvedState, 'preflight-observed', 'valid preflight state');
assert.equal(v.durableStoreCreated, false, 'no durable store created');
assert.equal(v.writesKv, false, 'no KV write');
assert.equal(v.realWebDAVTransportAvailable, false, 'real WebDAV unavailable');
assert.equal(v.realTransportApprovalAccepted, false, 'real approval false');
assert.equal(v.productSyncReady, false, 'productSyncReady false');
assert.equal(v.transportReady, false, 'transportReady false');
assert.equal(v.chatSavingCasBlocked, true, 'CAS blocked');
assert.equal(v.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(v.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(v.blockers.length, 0, 'valid preflight no blockers');

// completed -> duplicate-replay-noop / zero-write
const completed = api.evaluateRealTransportIdempotency(Object.assign({}, valid, {
  existingRecord: { present: true, state: 'completed', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
}));
assert.equal(completed.duplicateReplayNoop, true, 'completed key -> duplicate-replay-noop');
assert.equal(completed.zeroWrite, true, 'duplicate replay zero-write');
assert.equal(completed.resolvedState, 'duplicate-replay-noop', 'completed resolved state');

// changed key -> not a duplicate
const changed = api.evaluateRealTransportIdempotency(Object.assign({}, valid, {
  existingRecord: { present: true, state: 'completed', idempotencyKeyHash: OTHERKEY, candidatePayloadHash: OTHERPH },
}));
assert.equal(changed.changedConstraintsAreNotDuplicate, true, 'changed constraints not a duplicate');
assert.equal(changed.duplicateReplayNoop, false, 'changed is not a duplicate no-op');
assert.equal(changed.resolvedState, 'preflight-observed', 'changed -> new preflight');

// pending restart -> explicit-recovery-required, no auto-write
const pending = api.evaluateRealTransportIdempotency(Object.assign({}, valid, {
  attempt: { phase: 'restart-resume' }, restart: { simulateRestart: true, controlledGatePresent: true, killSwitchEnabled: true },
  existingRecord: { present: true, state: 'remote-write-pending', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
}));
assert.equal(pending.explicitRecoveryRequired, true, 'pending restart enters explicit recovery');
assert.equal(pending.resolvedState, 'explicit-recovery-required', 'pending resolved state');
assert.equal(pending.autoWriteOnResume, false, 'no auto-write on resume');
assert.equal(pending.writesWebDAV, false, 'pending restart: no write');

// resume without controlled gate / with disabled kill switch blocks
function resumeBlock(patch, code) {
  const r = api.evaluateRealTransportIdempotency(Object.assign({}, valid, {
    attempt: { phase: 'restart-resume' },
    restart: Object.assign({ simulateRestart: true, controlledGatePresent: true, killSwitchEnabled: true }, patch),
    existingRecord: { present: true, state: 'remote-write-pending', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
  }));
  assert.ok(r.blockers.includes(code), `resume ${code}; got ${r.blockers.join(',')}`);
}
resumeBlock({ controlledGatePresent: false }, 'real-transport-b3-resume-missing-controlled-gate');
resumeBlock({ killSwitchEnabled: false }, 'real-transport-b3-resume-kill-switch-disabled');

// missing / corrupt / mismatch / stale / dup-changed blocks
function block(patch, code) {
  const r = api.evaluateRealTransportIdempotency(Object.assign({}, valid, patch));
  assert.equal(r.ok, false, `expected block for ${code}`);
  assert.ok(r.blockers.includes(code), `expected ${code}; got ${r.blockers.join(',')}`);
}
block({ sequenceExportConstraintRefHash: undefined }, 'real-transport-b3-key-material-missing');
block({ existingRecord: { present: true, corrupted: true, state: 'completed', idempotencyKeyHash: KEY } }, 'real-transport-b3-idempotency-record-corrupted');
block({ candidateBundleHash: H('9') }, 'real-transport-b3-payload-hash-mismatch');
block({ expectedB8ApprovalRefHash: H('9') }, 'real-transport-b3-approval-hash-mismatch');
block({ expectedSequenceExportConstraintRefHash: H('9') }, 'real-transport-b3-sequence-constraint-mismatch');
block({ expectedEndpointRefHash: H('9') }, 'real-transport-b3-target-hash-mismatch');
block({ killSwitchTokenStale: true }, 'real-transport-b3-kill-switch-token-stale');
block({ expectedKillSwitchEnableTokenHash: H('9') }, 'real-transport-b3-kill-switch-token-mismatch');
block({ existingRecord: { present: true, state: 'completed', idempotencyKeyHash: KEY, candidatePayloadHash: H('9') } }, 'real-transport-b3-duplicate-changed-payload-target');
block({ casKeyHash: H('9') }, 'real-transport-b3-cas-input-rejected');

// raw input blocks and is never echoed
const RAW_MARKER = 'dav.raw-body-marker.invalid';
for (const rawField of [{ payloadBody: RAW_MARKER }, { credential: 'p@ss-' + RAW_MARKER }, { endpointRefHash: 'https://' + RAW_MARKER + '/x' }]) {
  const r = api.evaluateRealTransportIdempotency(Object.assign({}, valid, rawField));
  assert.ok(r.blockers.includes('real-transport-b3-raw-input-rejected'), `raw-input-rejected for ${Object.keys(rawField)[0]}`);
  assert.equal(r.privacy.rawInputRejected, true, 'privacy.rawInputRejected true');
  assert.ok(!JSON.stringify(r).includes(RAW_MARKER), `raw value must never be echoed (${Object.keys(rawField)[0]})`);
}

// coercion resistance
const coerce = api.evaluateRealTransportIdempotency(Object.assign({}, valid, {
  realWebDAVTransportAvailable: true, realTransportApprovalAccepted: true, transportReady: true, productSyncReady: true,
  writesWebDAV: true, writesKv: true, durableStoreCreated: true, mintExportId: true, startFullBundleV3: true, cleanupAuthority: true,
}));
assert.equal(coerce.realWebDAVTransportAvailable, false, 'coerce: real WebDAV unavailable');
assert.equal(coerce.realTransportApprovalAccepted, false, 'coerce: approval false');
assert.equal(coerce.transportReady, false, 'coerce: transportReady false');
assert.equal(coerce.productSyncReady, false, 'coerce: productSyncReady false');
assert.equal(coerce.writesWebDAV, false, 'coerce: no WebDAV write');
assert.equal(coerce.writesKv, false, 'coerce: no KV write');
assert.equal(coerce.durableStoreCreated, false, 'coerce: no durable store');
assert.equal(coerce.mintsExportId, false, 'coerce: no export id mint');
assert.equal(coerce.fullBundleV3Started, false, 'coerce: no fullBundle.v3 start');
assert.equal(coerce.noCleanupAuthority, true, 'coerce: no cleanup authority');

// diagnose is non-activating + creates no store
const d = api.diagnose();
assert.equal(d.durableStoreCreated, false, 'diagnose: no durable store');
assert.equal(d.realWebDAVTransportAvailable, false, 'diagnose: real WebDAV unavailable');
assert.equal(d.evaluateOnly, true, 'diagnose: evaluate only');

// ---------------------------------------------------------------------------
// (4) B1/B2 modules + control plane unchanged; source invariants intact.
// ---------------------------------------------------------------------------
assertIncludes(b1ModuleSource, 'realWebDAVTransportAvailable: false', 'B1 module unchanged (real WebDAV unavailable)');
assertIncludes(b2ModuleSource, 'realWebDAVTransportAvailable: false', 'B2 module unchanged (real WebDAV unavailable)');
assertIncludes(transportGates, 'realWebDAVTransportAvailable: false', 'control plane still real WebDAV unavailable');
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'control plane must not enable real WebDAV');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'control plane must not flip productSyncReady');
assert.doesNotMatch(`${transportGates}\n${folderSync}\n${moduleSource}\n${b1ModuleSource}\n${b2ModuleSource}`,
  /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b3-durable-idempotency-store-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b3-durable-idempotency-store-implementation',
  evidence: evidencePath,
  module: modulePath,
  verdict: 'B3_SUBSTRATE_IMPLEMENTED_NON_WRITING_NO_DURABLE_STORE_REAL_TRANSPORT_STILL_BLOCKED',
  b3DesignRespected: 'e1618571',
  b2ImplRespected: 'de4aa12d',
  b1ImplRespected: '93eb9065',
  rollupRespected: '36e46513',
  apiExposed: 'H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency',
  wiredIntoLoader: false,
  durableStoreCreated: false,
  validEvaluatesReady: true,
  completedKeyDuplicateReplayNoopZeroWrite: true,
  changedConstraintsNotDuplicate: true,
  pendingRestartExplicitRecoveryNoAutoWrite: true,
  missingCorruptMismatchStaleRawCasBlock: true,
  coercionResistant: true,
  realWebDAVTransportAvailable: false,
  realTransportApprovalAccepted: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B4-real-enqueue-outbox-boundary-implementation-after-explicit-go-ahead',
}, null, 2));
console.log('PASS validate-real-transport-b3-durable-idempotency-store-implementation');
