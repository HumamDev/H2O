#!/usr/bin/env node
//
// Real-transport B4 - enqueue / outbox boundary implementation validator.
//
// Proves the B4 substrate (src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js): it respects the B4 design
// (0b6ed75e), the B3 (804b6d67), B2 (de4aa12d), and B1 (93eb9065) implementations, and the B1-B8 rollup (36e46513); a
// valid hash-only enqueue boundary evaluation passes; no real outbox row is created; the relay outbox and publication
// ledger are not touched; localExportableSyncReady alone / local mock approval / completed record / missing / stale /
// mismatch / raw / CAS inputs block; a completed record models a duplicate no-op; a remote-write-pending restart enters
// explicit-recovery-required; no durable store/row is created; real transport stays unavailable and real approval stays
// false even when the request tries to set them; productSyncReady:false and transportReady:false remain; fullBundle.v3
// stays deferred; Chat Saving CAS stays blocked; no cleanup/a950 authority is introduced. It re-executes the REAL
// module in a vm sandbox.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js';
const b3ModulePath = 'src-surfaces-base/studio/sync/real-transport-idempotency.js';
const b2ModulePath = 'src-surfaces-base/studio/sync/real-transport-kill-switch.js';
const b1ModulePath = 'src-surfaces-base/studio/sync/real-transport-target-config.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-implementation.md';
const b4DesignPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md';
const b3ImplPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-implementation.md';
const b2ImplPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md';
const b1ImplPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const rollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const relayOutboxPath = 'src-surfaces-base/studio/sync/relay-outbox.tauri.js';
const publicationLedgerPath = 'src-surfaces-base/studio/sync/publication-ledger.tauri.js';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const moduleSource = read(modulePath);
const b3ModuleSource = read(b3ModulePath);
const b2ModuleSource = read(b2ModulePath);
const b1ModuleSource = read(b1ModulePath);
const evidence = read(evidencePath);
const flat = compact(evidence);
const relayOutbox = read(relayOutboxPath);
const publicationLedger = read(publicationLedgerPath);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function H(d) { return 'sha256:' + String(d).repeat(64).slice(0, 64); } // d must be hex 0-9a-f
const KEY = H('a'); const PH = H('b');
const valid = {
  operation: 'enqueue', candidatePayloadHash: PH, candidateBundleHash: PH,
  endpointRefHash: H('e'), remoteRootRefHash: H('f'), peerIdentityBindingHash: H('0'), credentialRefHash: H('1'),
  idempotencyKeyHash: KEY, b8ApprovalRefHash: H('3'), killSwitchEnableTokenHash: H('2'), sequenceExportConstraintRefHash: H('5'),
  b8ApprovalAccepted: true, killSwitch: { enabled: true }, b7PolicyAllowsEvaluation: true, b5PolicyAvailable: true, b6PolicyAvailable: true,
  targetMode: 'real-webdav', idempotencyRecord: { present: true, state: 'apply-intent-recorded', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
  productSyncReady: false, transportReady: false,
};

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportEnqueueBoundary;
}

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  '0b6ed75e', '804b6d67', 'de4aa12d', '93eb9065', '36e46513',
  'src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js',
  'H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary(request)',
  'No outbox row / ledger is created or touched',
  'intentionally standalone (non-activating)',
  '`realOutboxRowCreated:false`',
  '`realEnqueueAuthorized:true`',
  'models `duplicate-replay-noop` / zero-write',
  'B5 implementation - real conflict / partial-write handling',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'outbox row created', 'ledger written', 'real transport is now available', 'real transport is authorized',
  'authorizes real transport',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim: ${forbidden}`);
}
assert.doesNotMatch(evidence, /https?:\/\//i, 'evidence must contain no raw endpoint URL');

assertIncludes(read(b4DesignPath), 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY IS DESIGNED', 'B4 design respected');
assertIncludes(read(b3ImplPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE SUBSTRATE IMPLEMENTED', 'B3 implementation respected');
assertIncludes(read(b2ImplPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED', 'B2 implementation respected');
assertIncludes(read(b1ImplPath), 'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED', 'B1 implementation respected');
assertIncludes(read(rollupPath), 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED', 'B1-B8 rollup respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT', 'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (2) REAL MODULE anchors: exposes API; store references only; non-activation hardcoded; non-writing.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary = evaluateRealTransportEnqueueBoundary',
  'module exposes the B4 evaluate API');
assertIncludes(moduleSource, "RELAY_OUTBOX_STORE = 'h2o:sync:relay-outbox:v1'", 'relay outbox store referenced');
assertIncludes(moduleSource, "PUBLICATION_LEDGER_STORE = 'h2o:sync:publication-ledger:v1'", 'publication ledger store referenced');
for (const st of ['queued', 'dispatching', 'remote-write-observed', 'ledger-pending', 'completed', 'failed', 'explicit-recovery-required']) {
  assertIncludes(moduleSource, `'${st}'`, `outbox lifecycle state ${st}`);
}
for (const token of [
  'realOutboxRowCreated: false', 'relayOutboxTouched: false', 'publicationLedgerTouched: false',
  'ledgerNeverPrecedesRemoteWrite: true', 'bootResumeDispatch: false', 'noBlindRetryAfterPartialWrite: true',
  'writesKv: false', 'realWebDAVTransportAvailable: false', 'realTransportApprovalAccepted: false',
  'productSyncReady: false', 'transportReady: false', 'chatSavingCasBlocked: true', 'fullBundleV3Started: false',
  'noCleanupAuthority: true',
]) {
  assertIncludes(moduleSource, token, `module invariant ${token}`);
}
assertNotIncludes(moduleSource, 'realOutboxRowCreated: true', 'module must not create an outbox row');
assertNotIncludes(moduleSource, 'relayOutboxTouched: true', 'module must not touch the relay outbox');
assertNotIncludes(moduleSource, 'publicationLedgerTouched: true', 'module must not touch the publication ledger');
assertNotIncludes(moduleSource, 'realWebDAVTransportAvailable: true', 'module must not make real WebDAV available');
assert.doesNotMatch(moduleSource, /https?:\/\//i, 'module must contain no raw endpoint URL literal');
for (const banned of ['sqlExecute', 'localStorage.setItem', 'fetch(', 'XMLHttpRequest', 'writeFile', 'invoke(', 'appendOutbox', 'appendLedger']) {
  assertNotIncludes(moduleSource, banned, `module must be non-writing (${banned})`);
}

// ---------------------------------------------------------------------------
// (3) Behavioral re-execution.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportEnqueueBoundary, 'function', 'B4 API installed');

const v = api.evaluateRealTransportEnqueueBoundary(valid);
assert.equal(v.ok, true, 'valid enqueue ok');
assert.equal(v.resolvedState, 'queued', 'valid enqueue queued');
assert.equal(v.realEnqueueAuthorized, true, 'valid enqueue authorized (boundary-model readiness)');
assert.equal(v.realOutboxRowCreated, false, 'no outbox row created');
assert.equal(v.relayOutboxTouched, false, 'relay outbox not touched');
assert.equal(v.publicationLedgerTouched, false, 'publication ledger not touched');
assert.equal(v.bootResumeDispatch, false, 'no boot resume dispatch');
assert.equal(v.realWebDAVTransportAvailable, false, 'real WebDAV unavailable');
assert.equal(v.realTransportApprovalAccepted, false, 'real approval false');
assert.equal(v.productSyncReady, false, 'productSyncReady false');
assert.equal(v.transportReady, false, 'transportReady false');
assert.equal(v.chatSavingCasBlocked, true, 'CAS blocked');
assert.equal(v.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(v.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(v.blockers.length, 0, 'valid enqueue no blockers');

// enqueue block cases
function block(patch, code) {
  const r = api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, patch));
  assert.equal(r.ok, false, `expected block for ${code}`);
  assert.ok(r.blockers.includes(code), `expected ${code}; got ${r.blockers.join(',')}`);
  assert.equal(r.realOutboxRowCreated, false, `${code}: no outbox row even when blocked`);
  assert.equal(r.publicationLedgerTouched, false, `${code}: ledger untouched even when blocked`);
}
block({ localExportableSyncReadyIsAuthorization: true }, 'real-transport-b4-enqueue-local-exportable-not-authorization');
block({ localMockApproval: true }, 'real-transport-b4-enqueue-local-mock-approval-not-accepted');
block({ targetMode: 'local-mock-webdav' }, 'real-transport-b4-enqueue-local-mock-target-not-real');
block({ idempotencyRecord: { present: false } }, 'real-transport-b4-enqueue-idempotency-record-missing');
block({ killSwitch: { enabled: true, tokenStale: true } }, 'real-transport-b4-enqueue-kill-switch-token-stale');
block({ killSwitch: { enabled: false } }, 'real-transport-b4-enqueue-kill-switch-disabled');
block({ b8ApprovalAccepted: false }, 'real-transport-b4-enqueue-approval-missing');
block({ endpointRefHash: undefined }, 'real-transport-b4-enqueue-target-hashes-missing');
block({ expectedSequenceExportConstraintRefHash: H('9') }, 'real-transport-b4-enqueue-sequence-constraint-mismatch');
block({ peerAmbiguous: true }, 'real-transport-b4-enqueue-peer-ambiguous');
block({ touchChatSavingCas: true }, 'real-transport-b4-enqueue-cas-boundary-violation');
block({ casKeyHash: H('9') }, 'real-transport-b4-cas-input-rejected');

// completed record blocks enqueue + models duplicate no-op
const completed = api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, {
  idempotencyRecord: { present: true, state: 'completed', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
}));
assert.equal(completed.ok, false, 'completed record blocks enqueue');
assert.ok(completed.blockers.includes('real-transport-b4-enqueue-completed-record-not-enqueueable'), 'completed-record-not-enqueueable');
assert.equal(completed.duplicateReplayNoop, true, 'completed record models duplicate-replay-noop');
assert.equal(completed.zeroWrite, true, 'duplicate is zero-write');

// remote-write-pending restart -> explicit-recovery-required (no boot dispatch)
const pending = api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, {
  operation: 'restart-resume', restart: { simulateRestart: true, controlledGatePresent: true, killSwitchEnabled: true },
  idempotencyRecord: { present: true, state: 'remote-write-pending', idempotencyKeyHash: KEY, candidatePayloadHash: PH },
}));
assert.equal(pending.explicitRecoveryRequired, true, 'pending restart enters explicit recovery');
assert.equal(pending.resolvedState, 'explicit-recovery-required', 'pending resolved state');
assert.equal(pending.bootResumeDispatch, false, 'no boot resume dispatch');
assert.equal(pending.writesWebDAV, false, 'pending restart: no write');

// resume without gate / disabled kill switch blocks
assert.ok(api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, {
  operation: 'restart-resume', restart: { simulateRestart: true, controlledGatePresent: false, killSwitchEnabled: true },
  idempotencyRecord: { present: true, state: 'remote-write-pending', idempotencyKeyHash: KEY },
})).blockers.includes('real-transport-b4-resume-missing-controlled-gate'), 'resume no gate blocks');
assert.ok(api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, {
  operation: 'restart-resume', restart: { simulateRestart: true, controlledGatePresent: true, killSwitchEnabled: false },
  idempotencyRecord: { present: true, state: 'remote-write-pending', idempotencyKeyHash: KEY },
})).blockers.includes('real-transport-b4-resume-kill-switch-disabled'), 'resume disabled kill switch blocks');

// ledger boundary: before verified write blocks; after verified write ok but ledger still not touched
assert.ok(api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, { operation: 'ledger', remoteWriteVerified: false }))
  .blockers.includes('real-transport-b4-ledger-precedes-remote-write'), 'ledger before verified write blocks');
const ledger = api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, { operation: 'ledger', remoteWriteVerified: true }));
assert.equal(ledger.ok, true, 'ledger after verified write ok');
assert.equal(ledger.publicationLedgerTouched, false, 'ledger still not touched (modeled)');

// raw input blocks and is never echoed
const RAW_MARKER = 'dav.raw-body-marker.invalid';
for (const rawField of [{ payloadBody: RAW_MARKER }, { credential: 'p@ss-' + RAW_MARKER }, { endpointRefHash: 'https://' + RAW_MARKER + '/x' }]) {
  const r = api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, rawField));
  assert.ok(r.blockers.includes('real-transport-b4-raw-input-rejected'), `raw-input-rejected for ${Object.keys(rawField)[0]}`);
  assert.equal(r.privacy.rawInputRejected, true, 'privacy.rawInputRejected true');
  assert.ok(!JSON.stringify(r).includes(RAW_MARKER), `raw value must never be echoed (${Object.keys(rawField)[0]})`);
}

// coercion resistance (incl. outbox/ledger flags)
const coerce = api.evaluateRealTransportEnqueueBoundary(Object.assign({}, valid, {
  realWebDAVTransportAvailable: true, realTransportApprovalAccepted: true, transportReady: true, productSyncReady: true,
  realOutboxRowCreated: true, relayOutboxTouched: true, publicationLedgerTouched: true, enqueuesRelay: true,
  writesWebDAV: true, mintExportId: true, startFullBundleV3: true, cleanupAuthority: true,
}));
for (const [flag, want] of [['realWebDAVTransportAvailable', false], ['realTransportApprovalAccepted', false],
  ['transportReady', false], ['productSyncReady', false], ['realOutboxRowCreated', false], ['relayOutboxTouched', false],
  ['publicationLedgerTouched', false], ['enqueuesRelay', false], ['writesWebDAV', false], ['mintsExportId', false],
  ['fullBundleV3Started', false], ['noCleanupAuthority', true]]) {
  assert.equal(coerce[flag], want, `coerce: ${flag} stays ${want}`);
}

// diagnose non-activating
const d = api.diagnose();
assert.equal(d.realOutboxRowCreated, false, 'diagnose: no outbox row');
assert.equal(d.publicationLedgerTouched, false, 'diagnose: ledger untouched');
assert.equal(d.realWebDAVTransportAvailable, false, 'diagnose: real WebDAV unavailable');
assert.equal(d.evaluateOnly, true, 'diagnose: evaluate only');

// ---------------------------------------------------------------------------
// (4) B1/B2/B3 + existing stores + control plane unchanged; invariants intact.
// ---------------------------------------------------------------------------
assertIncludes(b1ModuleSource, 'realWebDAVTransportAvailable: false', 'B1 module unchanged');
assertIncludes(b2ModuleSource, 'realWebDAVTransportAvailable: false', 'B2 module unchanged');
assertIncludes(b3ModuleSource, 'durableStoreCreated: false', 'B3 module unchanged');
assertIncludes(relayOutbox, "OUTBOX_KEY = 'h2o:sync:relay-outbox:v1'", 'existing relay outbox store unchanged');
assertIncludes(publicationLedger, "LEDGER_KEY = 'h2o:sync:publication-ledger:v1'", 'existing publication ledger store unchanged');
assertIncludes(transportGates, 'realWebDAVTransportAvailable: false', 'control plane still real WebDAV unavailable');
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'control plane must not enable real WebDAV');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'control plane must not flip productSyncReady');
assert.doesNotMatch(`${transportGates}\n${folderSync}\n${moduleSource}\n${b1ModuleSource}\n${b2ModuleSource}\n${b3ModuleSource}`,
  /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b4-enqueue-outbox-boundary-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b4-enqueue-outbox-boundary-implementation',
  evidence: evidencePath,
  module: modulePath,
  verdict: 'B4_SUBSTRATE_IMPLEMENTED_NON_WRITING_NO_OUTBOX_ROW_REAL_TRANSPORT_STILL_BLOCKED',
  b4DesignRespected: '0b6ed75e',
  b3ImplRespected: '804b6d67',
  b2ImplRespected: 'de4aa12d',
  b1ImplRespected: '93eb9065',
  rollupRespected: '36e46513',
  apiExposed: 'H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary',
  wiredIntoLoader: false,
  realOutboxRowCreated: false,
  relayOutboxTouched: false,
  publicationLedgerTouched: false,
  validEnqueueEvaluatesReady: true,
  completedRecordBlocksEnqueueDuplicateNoop: true,
  pendingRestartExplicitRecovery: true,
  localExportableAloneBlocks: true,
  missingStaleMismatchRawCasBlock: true,
  coercionResistant: true,
  realWebDAVTransportAvailable: false,
  realTransportApprovalAccepted: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B5-real-conflict-partial-write-handling-implementation-after-explicit-go-ahead',
}, null, 2));
console.log('PASS validate-real-transport-b4-enqueue-outbox-boundary-implementation');
