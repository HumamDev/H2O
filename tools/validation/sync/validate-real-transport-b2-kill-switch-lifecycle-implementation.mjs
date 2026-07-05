#!/usr/bin/env node
//
// Real-transport B2 - controlled-write kill-switch lifecycle implementation validator.
//
// Proves the B2 substrate (src-surfaces-base/studio/sync/real-transport-kill-switch.js): it respects the B2 design
// (09bf7701), the B1 implementation (93eb9065), the B1 design (b2e10531), and the B1-B8 rollup (36e46513); a valid
// hash-only kill-switch lifecycle evaluation passes; missing / disabled / wrong-scope / stale-token states block;
// mid-flight disable enters fail-closed or explicit-recovery-required; local mock kill switch / approval is rejected;
// raw endpoint/credential/path input blocks and is never echoed; the module is non-writing and coercion-resistant;
// real transport stays unavailable and real approval stays false even when the request tries to set them;
// productSyncReady:false and transportReady:false remain; fullBundle.v3 stays deferred; Chat Saving CAS stays blocked;
// and no cleanup/a950 mutation authority is introduced. It re-executes the REAL module in a vm sandbox.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-kill-switch.js';
const b1ModulePath = 'src-surfaces-base/studio/sync/real-transport-target-config.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md';
const b2DesignPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md';
const b1ImplPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
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
const b1ModuleSource = read(b1ModulePath);
const evidence = read(evidencePath);
const flat = compact(evidence);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function H(ch) { return 'sha256:' + String(ch).repeat(64).slice(0, 64); }
const validEnable = {
  operation: 'enable', reviewedKillSwitchEnableApproved: true,
  killSwitchScope: 'real-webdav-cloud-relay-controlled-write', killSwitchExists: true,
  endpointRefHash: H('a'), remoteRootRefHash: H('b'), credentialRefHash: H('c'),
  peerIdentityBindingHash: H('d'), localClientIdentityHash: H('e'), killSwitchEnableTokenHash: H('f'),
  b8ApprovalRefHash: H('1'), b7ReadinessPolicyRefHash: H('2'), productSyncReady: false, transportReady: false,
};

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportKillSwitch;
}

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  '09bf7701', '93eb9065', 'b2e10531', '36e46513',
  'src-surfaces-base/studio/sync/real-transport-kill-switch.js',
  'H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch(request)',
  'intentionally standalone (non-activating)',
  '`status:"real-transport-b2-kill-switch-lifecycle-ready"`',
  '`realKillSwitchLifecycleReady:true`',
  "killSwitchMidFlightRecoveryState:'explicit-recovery-required'",
  'real-transport-b2-kill-switch-local-mock-not-accepted',
  'real-transport-b2-kill-switch-raw-input-rejected',
  'B3 implementation - durable idempotency store',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'real transport is authorized',
  'real WebDAV is enabled',
  'authorizes real transport',
  'kill switch is now enabled',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim: ${forbidden}`);
}
assert.doesNotMatch(evidence, /https?:\/\//i, 'evidence must contain no raw endpoint URL');

assertIncludes(read(b2DesignPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED', 'B2 design respected');
assertIncludes(read(b1ImplPath), 'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED', 'B1 implementation respected');
assertIncludes(read(b1DesignPath), 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED', 'B1 design respected');
assertIncludes(read(rollupPath), 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED', 'B1-B8 rollup respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT', 'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (2) REAL MODULE: exposes API; non-activation hardcoded; non-writing; no raw URL literal.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch = evaluateRealTransportKillSwitch',
  'module exposes the B2 evaluate API');
for (const token of [
  'realWebDAVTransportAvailable: false', 'realTransportApprovalAccepted: false', 'productSyncReady: false',
  'transportReady: false', 'writesWebDAV: false', 'enqueuesRelay: false', 'writesCAS: false',
  'chatSavingCasBlocked: true', 'fullBundleV3Started: false', 'noCleanupAuthority: true',
  'noSilentRetry: true', 'noAutoResumeIntoWrite: true',
]) {
  assertIncludes(moduleSource, token, `module invariant ${token}`);
}
assertNotIncludes(moduleSource, 'realWebDAVTransportAvailable: true', 'module must not make real WebDAV available');
assertNotIncludes(moduleSource, 'realTransportApprovalAccepted: true', 'module must not accept real approval');
assertNotIncludes(moduleSource, 'productSyncReady: true', 'module must not flip productSyncReady');
assertNotIncludes(moduleSource, 'transportReady: true', 'module must not flip transportReady');
assert.doesNotMatch(moduleSource, /https?:\/\//i, 'module must contain no raw endpoint URL literal');
for (const banned of ['sqlExecute', 'localStorage', 'fetch(', 'XMLHttpRequest', 'writeFile', 'invoke(', 'enqueueRelay(']) {
  assertNotIncludes(moduleSource, banned, `module must be non-writing (${banned})`);
}

// ---------------------------------------------------------------------------
// (3) Behavioral re-execution of the real module.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportKillSwitch, 'function', 'B2 API installed');

// valid enable -> ready + non-activation flags correct
const v = api.evaluateRealTransportKillSwitch(validEnable);
assert.equal(v.ok, true, 'valid enable ok');
assert.equal(v.status, 'real-transport-b2-kill-switch-lifecycle-ready', 'valid enable status');
assert.equal(v.realKillSwitchLifecycleReady, true, 'valid enable lifecycle ready');
assert.equal(v.realWebDAVTransportAvailable, false, 'real WebDAV unavailable');
assert.equal(v.realTransportApprovalAccepted, false, 'real approval false');
assert.equal(v.productSyncReady, false, 'productSyncReady false');
assert.equal(v.transportReady, false, 'transportReady false');
assert.equal(v.chatSavingCasBlocked, true, 'CAS blocked');
assert.equal(v.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(v.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(v.blockers.length, 0, 'valid enable no blockers');

// coercion resistance
const coerce = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, {
  realWebDAVTransportAvailable: true, realTransportApprovalAccepted: true, writesWebDAV: true, enqueuesRelay: true,
  writesCAS: true, mintExportId: true, burnSequence: true, startFullBundleV3: true, cleanupAuthority: true,
}));
assert.equal(coerce.realWebDAVTransportAvailable, false, 'coerce: real WebDAV stays unavailable');
assert.equal(coerce.realTransportApprovalAccepted, false, 'coerce: approval stays false');
assert.equal(coerce.writesWebDAV, false, 'coerce: no WebDAV write');
assert.equal(coerce.enqueuesRelay, false, 'coerce: no relay enqueue');
assert.equal(coerce.writesCAS, false, 'coerce: no CAS write');
assert.equal(coerce.mintsExportId, false, 'coerce: no export id mint');
assert.equal(coerce.fullBundleV3Started, false, 'coerce: no fullBundle.v3 start');
assert.equal(coerce.noCleanupAuthority, true, 'coerce: no cleanup authority');
// a hidden readiness claim is also blocked
const hidden = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, { transportReady: true }));
assert.equal(hidden.transportReady, false, 'hidden readiness: transportReady stays false');
assert.ok(hidden.blockers.includes('real-transport-b2-kill-switch-readiness-mismatch-hidden'), 'hidden readiness blocked');

// enable-path block cases
function block(patch, code) {
  const r = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, patch));
  assert.equal(r.ok, false, `expected block for ${code}`);
  assert.ok(r.blockers.includes(code), `expected ${code}; got ${r.blockers.join(',')}`);
}
block({ killSwitchScope: 'wrong' }, 'real-transport-b2-kill-switch-scope-invalid');
block({ reviewedKillSwitchEnableApproved: false }, 'real-transport-b2-kill-switch-enable-review-missing');
block({ endpointRefHash: undefined }, 'real-transport-b2-kill-switch-target-hashes-missing');
block({ b8ApprovalRefHash: undefined }, 'real-transport-b2-kill-switch-approval-missing');
block({ b7ReadinessPolicyRefHash: undefined }, 'real-transport-b2-kill-switch-policy-missing');
block({ killSwitchEnableTokenHash: undefined }, 'real-transport-b2-kill-switch-enable-token-missing');
block({ enableTokenStale: true }, 'real-transport-b2-kill-switch-enable-token-stale');
block({ expectedPeerIdentityBindingHash: H('9') }, 'real-transport-b2-kill-switch-target-mismatch');
block({ killSwitchExists: false }, 'real-transport-b2-kill-switch-missing');
block({ localMockApproval: true }, 'real-transport-b2-kill-switch-local-mock-not-accepted');

// disabled kill switch (apply op)
const applyDisabled = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, { operation: 'apply', killSwitchEnabled: false }));
assert.equal(applyDisabled.ok, false, 'apply with disabled kill switch blocks');
assert.ok(applyDisabled.blockers.includes('real-transport-b2-kill-switch-disabled'), 'disabled kill switch blocker');

// mid-flight: before write -> fail closed; after write before ledger -> explicit recovery
const mfBefore = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, { operation: 'mid-flight', midFlightDisabledBeforeRemoteWrite: true }));
assert.equal(mfBefore.failClosed, true, 'mid-flight before write is fail-closed');
assert.equal(mfBefore.explicitRecoveryRequired, false, 'mid-flight before write no recovery');
assert.equal(mfBefore.writesWebDAV, false, 'mid-flight before write: no write');
const mfAfter = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, { operation: 'mid-flight', midFlightDisabledAfterRemoteWriteBeforeLedger: true }));
assert.equal(mfAfter.explicitRecoveryRequired, true, 'mid-flight after write enters explicit recovery');
assert.equal(mfAfter.killSwitchMidFlightRecoveryState, 'explicit-recovery-required', 'mid-flight recovery state');
assert.ok(mfAfter.blockers.includes('real-transport-b2-kill-switch-mid-flight-disabled'), 'mid-flight disabled blocker');

// disable op
const dis = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, { operation: 'disable', disableBeforeWrite: true }));
assert.equal(dis.failClosed, true, 'disable is fail-closed');
assert.ok(dis.blockers.includes('real-transport-b2-kill-switch-disabled-before-write'), 'disabled-before-write blocker');

// raw input blocks and is never echoed
const RAW_MARKER = 'dav.raw-cred-marker.invalid';
for (const rawField of [{ credential: 'p@ss-' + RAW_MARKER }, { endpointUrl: 'https://' + RAW_MARKER + '/x' },
  { killSwitchEnableTokenHash: 'https://' + RAW_MARKER + '/tok' }]) {
  const r = api.evaluateRealTransportKillSwitch(Object.assign({}, validEnable, rawField));
  assert.equal(r.ok, false, `raw input (${Object.keys(rawField)[0]}) blocks`);
  assert.ok(r.blockers.includes('real-transport-b2-kill-switch-raw-input-rejected'), `raw-input-rejected for ${Object.keys(rawField)[0]}`);
  assert.equal(r.privacy.rawInputRejected, true, 'privacy.rawInputRejected true');
  assert.ok(!JSON.stringify(r).includes(RAW_MARKER), `raw value must never be echoed (${Object.keys(rawField)[0]})`);
}

// diagnose is non-activating
const d = api.diagnose();
assert.equal(d.realWebDAVTransportAvailable, false, 'diagnose: real WebDAV unavailable');
assert.equal(d.transportReady, false, 'diagnose: transportReady false');
assert.equal(d.evaluateOnly, true, 'diagnose: evaluate only');

// ---------------------------------------------------------------------------
// (4) B1 module + control plane unchanged; source invariants intact.
// ---------------------------------------------------------------------------
assertIncludes(b1ModuleSource, 'realWebDAVTransportAvailable: false', 'B1 module still real WebDAV unavailable');
assertIncludes(transportGates, 'realWebDAVTransportAvailable: false', 'control plane still real WebDAV unavailable');
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'control plane must not enable real WebDAV');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'control plane must not flip productSyncReady');
assert.doesNotMatch(`${transportGates}\n${folderSync}\n${moduleSource}\n${b1ModuleSource}`,
  /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b2-kill-switch-lifecycle-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b2-kill-switch-lifecycle-implementation',
  evidence: evidencePath,
  module: modulePath,
  verdict: 'B2_SUBSTRATE_IMPLEMENTED_NON_WRITING_REAL_TRANSPORT_STILL_BLOCKED',
  b2DesignRespected: '09bf7701',
  b1ImplRespected: '93eb9065',
  rollupRespected: '36e46513',
  apiExposed: 'H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch',
  wiredIntoLoader: false,
  validEnableEvaluatesReady: true,
  missingDisabledScopeStaleBlock: true,
  midFlightFailClosedOrExplicitRecovery: true,
  localMockRejected: true,
  rawInputBlockedAndNotEchoed: true,
  coercionResistant: true,
  realWebDAVTransportAvailable: false,
  realTransportApprovalAccepted: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B3-durable-idempotency-store-implementation-after-explicit-go-ahead',
}, null, 2));
console.log('PASS validate-real-transport-b2-kill-switch-lifecycle-implementation');
