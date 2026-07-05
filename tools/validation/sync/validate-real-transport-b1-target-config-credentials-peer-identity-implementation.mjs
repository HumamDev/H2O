#!/usr/bin/env node
//
// Real-transport B1 - target config + credentials + peer identity implementation validator.
//
// Proves the B1 substrate (src-surfaces-base/studio/sync/real-transport-target-config.js): it respects the B1 design
// (b2e10531) and the B1-B8 rollup (36e46513); a valid hash-only target config evaluates ready; local mock target is
// rejected as a real target; missing endpoint/credential/root/peer refs block; raw endpoint/credential/path input
// blocks and is never echoed; real transport stays unavailable and real approval stays false even when the request
// tries to set them; productSyncReady:false and transportReady:false remain; fullBundle.v3 stays deferred; Chat Saving
// CAS stays blocked; and no cleanup/a950 mutation authority is introduced. It re-executes the REAL module in a vm
// sandbox. Evidence + one new non-writing module; no transport is enabled.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-target-config.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
const rollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
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
const evidence = read(evidencePath);
const flat = compact(evidence);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function H(ch) { return 'sha256:' + String(ch).repeat(64).slice(0, 64); }
const validRequest = {
  targetMode: 'real-webdav',
  endpointRefHash: H('a'),
  remoteRootRefHash: H('b'),
  credentialRefHash: H('c'),
  peerIdentityBindingHash: H('d'),
  localClientIdentityHash: H('e'),
};

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportTargetConfig;
}

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  'b2e10531', '36e46513', '26e6241b', 'd2bea4c0', '15a33852',
  'src-surfaces-base/studio/sync/real-transport-target-config.js',
  'H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig(request)',
  'Deliberately NOT wired into the app loader (non-activating)',
  '`status:"real-transport-b1-target-config-ready"`',
  '`realTargetConfigReady:true`',
  '`credentialReferenceOnly:true`',
  'Raw input is rejected and never echoed',
  'Local mock target is not a real target',
  'real-transport-b1-raw-input-rejected',
  'B2 implementation - real kill-switch lifecycle',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'real transport is authorized',
  'real WebDAV is enabled',
  'authorizes real transport',
  'approval is accepted',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim: ${forbidden}`);
}
assert.doesNotMatch(evidence, /https?:\/\//i, 'evidence must contain no raw endpoint URL');

assertIncludes(read(b1DesignPath), 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED',
  'B1 design respected');
assertIncludes(read(rollupPath), 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED', 'B1-B8 rollup respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED', 'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (2) REAL MODULE: exposes the API; non-activation flags hardcoded; no raw endpoint URL literal.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig = evaluateRealTransportTargetConfig',
  'module exposes the B1 evaluate API');
for (const token of [
  'realWebDAVTransportAvailable: false',
  'realTransportApprovalAccepted: false',
  'productSyncReady: false',
  'transportReady: false',
  'writesWebDAV: false',
  'enqueuesRelay: false',
  'writesCAS: false',
  'touchChatSavingCas: false',
  'chatSavingCasBlocked: true',
  'fullBundleV3Started: false',
  'noCleanupAuthority: true',
  'credentialReferenceOnly: true',
]) {
  assertIncludes(moduleSource, token, `module invariant ${token}`);
}
assertNotIncludes(moduleSource, 'realWebDAVTransportAvailable: true', 'module must not make real WebDAV available');
assertNotIncludes(moduleSource, 'realTransportApprovalAccepted: true', 'module must not accept real transport approval');
assertNotIncludes(moduleSource, 'productSyncReady: true', 'module must not flip productSyncReady');
assertNotIncludes(moduleSource, 'transportReady: true', 'module must not flip transportReady');
assert.doesNotMatch(moduleSource, /https?:\/\//i, 'module must contain no raw endpoint URL literal');
// no real write / persistence / transport call in the module
for (const banned of ['sqlExecute', 'localStorage', 'fetch(', 'XMLHttpRequest', 'writeFile', 'invoke(', 'enqueueRelay(']) {
  assertNotIncludes(moduleSource, banned, `module must be non-writing (${banned})`);
}

// ---------------------------------------------------------------------------
// (3) Behavioral re-execution of the real module.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportTargetConfig, 'function', 'B1 API installed');

// valid hash-only config -> ready, all non-activation flags correct
const v = api.evaluateRealTransportTargetConfig(validRequest);
assert.equal(v.ok, true, 'valid config ok');
assert.equal(v.status, 'real-transport-b1-target-config-ready', 'valid config status ready');
assert.equal(v.realTargetConfigReady, true, 'valid config realTargetConfigReady');
assert.equal(v.realWebDAVTransportAvailable, false, 'real WebDAV not available');
assert.equal(v.realTransportApprovalAccepted, false, 'real transport approval not accepted');
assert.equal(v.productSyncReady, false, 'productSyncReady false');
assert.equal(v.transportReady, false, 'transportReady false');
assert.equal(v.rawEndpointLogged, false, 'raw endpoint not logged');
assert.equal(v.rawCredentialLogged, false, 'raw credential not logged');
assert.equal(v.rawRemotePathLogged, false, 'raw remote path not logged');
assert.equal(v.credentialReferenceOnly, true, 'credential reference only');
assert.equal(v.chatSavingCasBlocked, true, 'Chat Saving CAS blocked');
assert.equal(v.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(v.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(v.blockers.length, 0, 'valid config has no blockers');
// hash-only refs recorded
assert.equal(v.endpointRefHash, validRequest.endpointRefHash, 'endpoint ref recorded');
assert.equal(v.peerIdentityBindingHash, validRequest.peerIdentityBindingHash, 'peer binding recorded');

// coercion resistance: a request trying to enable/flip is ignored
const coerce = api.evaluateRealTransportTargetConfig(Object.assign({}, validRequest, {
  realWebDAVTransportAvailable: true, realTransportApprovalAccepted: true, productSyncReady: true,
  transportReady: true, writesWebDAV: true, enqueuesRelay: true, writesCAS: true, mintExportId: true,
  burnSequence: true, startFullBundleV3: true, cleanupAuthority: true, mutateA950: true,
}));
assert.equal(coerce.realWebDAVTransportAvailable, false, 'coerce: real WebDAV stays unavailable');
assert.equal(coerce.realTransportApprovalAccepted, false, 'coerce: approval stays false');
assert.equal(coerce.productSyncReady, false, 'coerce: productSyncReady stays false');
assert.equal(coerce.transportReady, false, 'coerce: transportReady stays false');
assert.equal(coerce.writesWebDAV, false, 'coerce: no WebDAV write');
assert.equal(coerce.enqueuesRelay, false, 'coerce: no relay enqueue');
assert.equal(coerce.writesCAS, false, 'coerce: no CAS write');
assert.equal(coerce.mintsExportId, false, 'coerce: no export id mint');
assert.equal(coerce.burnsSequence, false, 'coerce: no sequence burn');
assert.equal(coerce.fullBundleV3Started, false, 'coerce: no fullBundle.v3 start');
assert.equal(coerce.noCleanupAuthority, true, 'coerce: no cleanup authority');
assert.equal(coerce.noA950Mutation, true, 'coerce: no a950 mutation');

// local mock target is rejected as a real target
const mock = api.evaluateRealTransportTargetConfig(Object.assign({}, validRequest, { targetMode: 'local-mock-webdav' }));
assert.equal(mock.ok, false, 'local mock target blocked');
assert.ok(mock.blockers.includes('real-transport-b1-local-mock-target-not-real'), 'local-mock-target-not-real blocker');

// missing each required ref blocks
function missing(field, code) {
  const req = Object.assign({}, validRequest); delete req[field];
  const r = api.evaluateRealTransportTargetConfig(req);
  assert.equal(r.ok, false, `${field} missing blocks`);
  assert.ok(r.blockers.includes(code), `${field} missing -> ${code}; got ${r.blockers.join(',')}`);
}
missing('endpointRefHash', 'real-transport-b1-endpoint-ref-missing');
missing('remoteRootRefHash', 'real-transport-b1-remote-root-missing');
missing('credentialRefHash', 'real-transport-b1-credential-ref-missing');
missing('peerIdentityBindingHash', 'real-transport-b1-peer-binding-missing');

// raw endpoint/credential/path input blocks and is NEVER echoed
const RAW_MARKER = 'dav.raw-endpoint-marker.invalid';
for (const rawField of [{ endpointUrl: 'https://' + RAW_MARKER + '/root' }, { credential: 'p@ss-' + RAW_MARKER },
  { remotePath: '/' + RAW_MARKER + '/x' }, { endpointRefHash: 'https://' + RAW_MARKER + '/y' }]) {
  const r = api.evaluateRealTransportTargetConfig(Object.assign({}, validRequest, rawField));
  assert.equal(r.ok, false, `raw input (${Object.keys(rawField)[0]}) blocks`);
  assert.ok(r.blockers.includes('real-transport-b1-raw-input-rejected'), `raw-input-rejected for ${Object.keys(rawField)[0]}`);
  assert.equal(r.privacy.rawInputRejected, true, 'privacy.rawInputRejected true');
  assert.ok(!JSON.stringify(r).includes(RAW_MARKER), `raw value must never be echoed (${Object.keys(rawField)[0]})`);
}

// ambiguous / mismatch
assert.ok(api.evaluateRealTransportTargetConfig(Object.assign({}, validRequest, { target: { ambiguous: true } }))
  .blockers.includes('real-transport-b1-target-ambiguous'), 'ambiguous target blocks');
assert.ok(api.evaluateRealTransportTargetConfig(Object.assign({}, validRequest, { expectedPeerIdentityBindingHash: H('f') }))
  .blockers.includes('real-transport-b1-peer-mismatch'), 'peer mismatch blocks');

// diagnose is non-activating
const d = api.diagnose();
assert.equal(d.realWebDAVTransportAvailable, false, 'diagnose: real WebDAV unavailable');
assert.equal(d.transportReady, false, 'diagnose: transportReady false');
assert.equal(d.evaluateOnly, true, 'diagnose: evaluate only');

// ---------------------------------------------------------------------------
// (4) Existing control plane unchanged; source invariants intact.
// ---------------------------------------------------------------------------
assertIncludes(transportGates, 'realWebDAVTransportAvailable: false', 'existing control plane still real WebDAV unavailable');
assertIncludes(transportGates, 'realTransportApprovalAccepted: false', 'existing control plane still no approval');
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'control plane must not enable real WebDAV');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'control plane must not flip productSyncReady');
assert.doesNotMatch(`${transportGates}\n${folderSync}\n${moduleSource}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b1-target-config-credentials-peer-identity-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b1-target-config-credentials-peer-identity-implementation',
  evidence: evidencePath,
  module: modulePath,
  verdict: 'B1_SUBSTRATE_IMPLEMENTED_NON_WRITING_REAL_TRANSPORT_STILL_BLOCKED',
  b1DesignRespected: 'b2e10531',
  rollupRespected: '36e46513',
  apiExposed: 'H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig',
  validConfigEvaluatesReady: true,
  localMockRejectedAsRealTarget: true,
  missingRefsBlock: true,
  rawInputBlockedAndNotEchoed: true,
  coercionResistant: true,
  realWebDAVTransportAvailable: false,
  realTransportApprovalAccepted: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B2-real-kill-switch-lifecycle-implementation-after-explicit-go-ahead',
}, null, 2));
console.log('PASS validate-real-transport-b1-target-config-credentials-peer-identity-implementation');
