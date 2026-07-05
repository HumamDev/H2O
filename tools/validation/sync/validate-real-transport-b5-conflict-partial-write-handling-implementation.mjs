#!/usr/bin/env node
//
// Real-transport B5 - conflict / partial-write handling implementation validator.
//
// Proves the B5 substrate (src-surfaces-base/studio/sync/real-transport-conflict-recovery.js): it respects the B5
// design (e60e00f0), the B4 implementation (1117f976), B3 (804b6d67), B2 (de4aa12d), B1 (93eb9065), and the B1-B8
// rollup (36e46513); a valid hash-only conflict/recovery evaluation passes; remote-same-payload is a no-op;
// remote-newer blocks overwrite; checksum mismatch and partial/uncertain write enter explicit recovery; blind retry
// after uncertain write blocks; verified remote write can model ledger-pending but never writes the ledger; B6 handoff
// remains required; raw/CAS inputs block and are not echoed; no real recovery/retry/remote write occurs; no outbox/ledger
// write occurs; real transport remains unavailable and real approval remains false; productSyncReady:false and
// transportReady:false remain; fullBundle.v3 stays deferred; Chat Saving CAS stays blocked; and no cleanup/a950 mutation
// authority is introduced. It re-executes the REAL module in a vm sandbox.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-conflict-recovery.js';
const b4ModulePath = 'src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js';
const b3ModulePath = 'src-surfaces-base/studio/sync/real-transport-idempotency.js';
const b2ModulePath = 'src-surfaces-base/studio/sync/real-transport-kill-switch.js';
const b1ModulePath = 'src-surfaces-base/studio/sync/real-transport-target-config.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-implementation.md';
const b5DesignPath = 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-design.md';
const b4ImplPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-implementation.md';
const b4DesignPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md';
const b3ImplPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-implementation.md';
const b3DesignPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md';
const b2ImplPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md';
const b2DesignPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md';
const b1ImplPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
const rollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalMockRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const w1bEvidencePath = 'release-evidence/2026-07-05/real-transport-w1b-loader-registration.md';
const w1bValidatorPath = 'tools/validation/sync/validate-real-transport-w1b-loader-registration.mjs';
const w1Modules = [
  'sync/real-transport-target-config.js',
  'sync/real-transport-kill-switch.js',
  'sync/real-transport-idempotency.js',
  'sync/real-transport-enqueue-boundary.js',
  'sync/real-transport-conflict-recovery.js',
  'sync/real-transport-sequence-export.js',
  'sync/real-transport-approval.js',
  'sync/real-transport-readiness.js',
  'sync/real-transport-dry-run.js',
  'sync/real-transport-console.js',
];
const w1ForbiddenTokens = [
  'fetch(',
  'XMLHttpRequest',
  'localStorage.setItem',
  'sqlExecute',
  'writeFile',
  'invoke(',
  'enqueuesRelay:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'productSyncReady:true',
  'transportReady:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
];

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }
function countOccurrences(haystack, needle) { return String(haystack).split(needle).length - 1; }
function scriptLiteral(rel) { return `<script src="./${rel}"></script>`; }
function packLiteral(rel) { return `"${rel}"`; }
function hasForbiddenToken(src, token) {
  const source = String(src);
  if (token === 'writeFile') return /(^|[^\w$])writeFile([^\w$]|$)/.test(source);
  return source.includes(token);
}
function assertW1bAwareWiring(rel, label) {
  const w1bPresent =
    studioHtml.includes(scriptLiteral('sync/real-transport-dry-run.js')) ||
    studioHtml.includes(scriptLiteral('sync/real-transport-console.js')) ||
    packStudio.includes(packLiteral('sync/real-transport-dry-run.js')) ||
    packStudio.includes(packLiteral('sync/real-transport-console.js'));
  if (!w1bPresent) {
    assertNotIncludes(studioHtml, path.basename(rel), `${label} pre-W1b not wired into studio.html`);
    assertNotIncludes(packStudio, path.basename(rel), `${label} pre-W1b not wired into pack-studio`);
    return;
  }
  read(w1bEvidencePath);
  read(w1bValidatorPath);
  assert.equal(countOccurrences(studioHtml, scriptLiteral(rel)), 1, `${label} W1b studio.html script`);
  assert.equal(countOccurrences(packStudio, packLiteral(rel)), 2, `${label} W1b pack-studio entries`);
  assert.equal(countOccurrences(studioHtml, scriptLiteral('sync/real-transport-console.js')), 1,
    `${label} W1b console studio.html script`);
  assert.equal(countOccurrences(packStudio, packLiteral('sync/real-transport-console.js')), 2,
    `${label} W1b console pack-studio entries`);
  for (const w1Rel of w1Modules) {
    const source = read(`src-surfaces-base/studio/${w1Rel}`);
    for (const forbidden of w1ForbiddenTokens) {
      assert.ok(!hasForbiddenToken(source, forbidden), `${label} ${w1Rel}: forbidden ${forbidden}`);
    }
  }
}

const moduleSource = read(modulePath);
const b4ModuleSource = read(b4ModulePath);
const b3ModuleSource = read(b3ModulePath);
const b2ModuleSource = read(b2ModulePath);
const b1ModuleSource = read(b1ModulePath);
const evidence = read(evidencePath);
const flat = compact(evidence);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function H(d) { return `sha256:${String(d).repeat(64).slice(0, 64)}`; } // d must be hex 0-9a-f
const PH = H('a');
const KEY = H('b');
const valid = {
  conflictClass: 'local-payload-stale',
  partialWriteState: 'no-remote-write-attempted',
  candidatePayloadHash: PH,
  candidateBundleHash: PH,
  fullBundleV2EnvelopeHash: PH,
  endpointRefHash: H('1'),
  remoteRootRefHash: H('2'),
  peerIdentityBindingHash: H('3'),
  credentialRefHash: H('4'),
  idempotencyKeyHash: KEY,
  outboxRecordHash: H('5'),
  b8ApprovalRefHash: H('6'),
  killSwitchEnableTokenHash: H('7'),
  sequenceExportConstraintRefHash: H('8'),
  b3IdempotencyStatePresent: true,
  b3IdempotencyState: 'apply-intent-recorded',
  b4OutboxStatePresent: true,
  b4OutboxState: 'queued',
  b2KillSwitchEnabled: true,
  b8ApprovalValid: true,
  b6SequenceExportConstraintsPresent: true,
  productSyncReady: false,
  transportReady: false,
};

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportConflictRecovery;
}

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  'e60e00f0', '1117f976', '0b6ed75e', '804b6d67', 'de4aa12d', '93eb9065', '36e46513',
  'src-surfaces-base/studio/sync/real-transport-conflict-recovery.js',
  'H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery(request)',
  'intentionally standalone and non-activating',
  '`remote-same-payload-hash` resolves to `duplicate-replay-noop`',
  '`remote-newer` blocks local overwrite',
  'checksum mismatches enter `explicit-recovery-required`',
  'blind retry after uncertain or partial write is blocked',
  '`ledgerWriteAllowed:true` may appear only as a modeled boundary decision',
  '`b6SequenceExportFinalizationRequired:true`',
  'No outbox row or publication ledger row was created',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'real transport is authorized',
  'ledger row was written',
  'outbox row was created',
  'recovery was executed',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim: ${forbidden}`);
}
assert.doesNotMatch(evidence, /https?:\/\//i, 'evidence must contain no raw endpoint URL');

assertIncludes(read(b5DesignPath), 'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING IS DESIGNED', 'B5 design respected');
assertIncludes(read(b4ImplPath), 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY SUBSTRATE IMPLEMENTED',
  'B4 implementation respected');
assertIncludes(read(b4DesignPath), 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY IS DESIGNED',
  'B4 design respected');
assertIncludes(read(b3ImplPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE SUBSTRATE IMPLEMENTED',
  'B3 implementation respected');
assertIncludes(read(b3DesignPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE IS DESIGNED', 'B3 design respected');
assertIncludes(read(b2ImplPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED',
  'B2 implementation respected');
assertIncludes(read(b2DesignPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED', 'B2 design respected');
assertIncludes(read(b1ImplPath), 'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED',
  'B1 implementation respected');
assertIncludes(read(b1DesignPath), 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED',
  'B1 design respected');
assertIncludes(read(rollupPath), 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED',
  'B1-B8 rollup respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalMockRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'controlled local mock final rollup respected');

// ---------------------------------------------------------------------------
// (2) Source anchors: exposed API, standalone, non-writing, non-activating.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource,
  'H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery =',
  'module exposes B5 evaluate API');
assertIncludes(moduleSource, "SCHEMA = 'h2o.studio.sync.real-transport-b5-conflict-recovery.v1'", 'B5 schema marker');
for (const klass of [
  'local-payload-stale',
  'remote-same-payload-hash',
  'remote-newer',
  'remote-untrusted',
  'checksum-mismatch-before-write',
  'checksum-mismatch-after-observed-write',
  'peer-target-mismatch',
  'credential-permission-failure',
  'network-timeout-uncertain-write',
  'partial-upload-interrupted-write',
]) {
  assertIncludes(moduleSource, `'${klass}'`, `conflict class ${klass}`);
}
for (const state of [
  'no-remote-write-attempted',
  'remote-write-attempted-unconfirmed',
  'remote-write-observed-checksum-unverified',
  'remote-write-observed-checksum-verified',
  'ledger-pending',
  'completed',
  'explicit-recovery-required',
]) {
  assertIncludes(moduleSource, `'${state}'`, `partial-write state ${state}`);
}
for (const token of [
  'realWebDAVTransportAvailable: false',
  'realTransportApprovalAccepted: false',
  'realRecoveryExecuted: false',
  'retryDispatched: false',
  'remoteWriteAttempted: false',
  'remoteOverwriteAllowed: false',
  'outboxWriteAllowed: false',
  'publicationLedgerTouched: false',
  'relayOutboxTouched: false',
  'productSyncReady: false',
  'transportReady: false',
  'chatSavingCasBlocked: true',
  'fullBundleV3Started: false',
  'noCleanupAuthority: true',
]) {
  assertIncludes(moduleSource, token, `module invariant ${token}`);
}
for (const forbidden of [
  'realRecoveryExecuted: true',
  'retryDispatched: true',
  'remoteWriteAttempted: true',
  'remoteOverwriteAllowed: true',
  'publicationLedgerTouched: true',
  'relayOutboxTouched: true',
  'realWebDAVTransportAvailable: true',
  'realTransportApprovalAccepted: true',
  'transportReady: true',
  'productSyncReady: true',
]) {
  assertNotIncludes(moduleSource, forbidden, `source must not contain ${forbidden}`);
}
assertW1bAwareWiring('sync/real-transport-conflict-recovery.js', 'B5 module');
assert.doesNotMatch(moduleSource, /https?:\/\//i, 'module must contain no raw endpoint URL literal');
for (const banned of ['sqlExecute', 'localStorage.setItem', 'fetch(', 'XMLHttpRequest', 'writeFile', 'invoke(']) {
  assertNotIncludes(moduleSource, banned, `module must be non-writing (${banned})`);
}

// ---------------------------------------------------------------------------
// (3) Behavioral VM execution.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportConflictRecovery, 'function', 'B5 API installed');

const base = api.evaluateRealTransportConflictRecovery(valid);
assert.equal(base.ok, true, 'valid hash-only B5 evaluation passes');
assert.equal(base.realConflictRecoveryReady, true, 'valid model readiness true');
assert.equal(base.retryAllowedBeforeRemoteWriteOnly, true, 'safe retry only before write');
assert.equal(base.realRecoveryExecuted, false, 'no real recovery');
assert.equal(base.retryDispatched, false, 'no retry dispatch');
assert.equal(base.remoteWriteAttempted, false, 'no remote write');
assert.equal(base.publicationLedgerTouched, false, 'ledger untouched');
assert.equal(base.relayOutboxTouched, false, 'outbox untouched');
assert.equal(base.b6SequenceExportFinalizationRequired, true, 'B6 remains required');
assert.equal(base.productSyncReady, false, 'productSyncReady false');
assert.equal(base.transportReady, false, 'transportReady false');
assert.equal(base.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(base.chatSavingCasBlocked, true, 'CAS blocked');
assert.equal(base.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(base.blockers.length, 0, 'valid request no blockers');

const samePayload = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, {
  conflictClass: 'remote-same-payload-hash',
  b3IdempotencyState: 'completed',
  partialWriteState: 'completed',
}));
assert.equal(samePayload.ok, true, 'remote same payload is ok');
assert.equal(samePayload.duplicateReplayNoop, true, 'remote same payload -> duplicate no-op');
assert.equal(samePayload.resolvedState, 'duplicate-replay-noop', 'same payload resolved no-op');
assert.equal(samePayload.remoteWriteAttempted, false, 'same payload no remote write');

function block(patch, code, extra = {}) {
  const r = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, patch));
  assert.equal(r.ok, false, `expected block for ${code}`);
  assert.ok(r.blockers.includes(code), `expected ${code}; got ${r.blockers.join(',')}`);
  assert.equal(r.realRecoveryExecuted, false, `${code}: no real recovery`);
  assert.equal(r.remoteWriteAttempted, false, `${code}: no remote write`);
  assert.equal(r.publicationLedgerTouched, false, `${code}: no ledger touch`);
  for (const [key, value] of Object.entries(extra)) assert.equal(r[key], value, `${code}: ${key}`);
  return r;
}

block({ conflictClass: 'remote-newer' }, 'real-transport-b5-remote-newer-overwrite-blocked', {
  explicitRecoveryRequired: true,
  remoteOverwriteAllowed: false,
  noLocalCanonicalMutationOnConflict: true,
});
block({ conflictClass: 'checksum-mismatch-before-write', candidateBundleHash: H('9') },
  'real-transport-b5-checksum-mismatch-explicit-recovery-required', {
    explicitRecoveryRequired: true,
    ledgerWriteAllowed: false,
  });
block({
  conflictClass: 'network-timeout-uncertain-write',
  partialWriteState: 'remote-write-attempted-unconfirmed',
  retryRequested: true,
}, 'real-transport-b5-blind-retry-after-uncertain-write-blocked', {
  explicitRecoveryRequired: true,
  retryDispatched: false,
});
const partialUnverified = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, {
  conflictClass: 'partial-upload-interrupted-write',
  partialWriteState: 'remote-write-observed-checksum-unverified',
}));
assert.equal(partialUnverified.ok, true, 'partial/unverified write can be classified without blind retry');
assert.equal(partialUnverified.explicitRecoveryRequired, true, 'partial/unverified write enters explicit recovery');
assert.equal(partialUnverified.resolvedState, 'explicit-recovery-required', 'partial/unverified resolved explicit recovery');
assert.equal(partialUnverified.remoteWriteAttempted, false, 'partial/unverified still executes no write');
block({ conflictClass: 'remote-untrusted' }, 'real-transport-b5-remote-untrusted-review-required', {
  explicitRecoveryRequired: true,
});
block({ conflictClass: 'peer-target-mismatch' }, 'real-transport-b5-peer-target-mismatch');
block({ conflictClass: 'credential-permission-failure' }, 'real-transport-b5-credential-permission-failure');
block({ b3IdempotencyStatePresent: false, b3IdempotencyState: '', idempotencyKeyHash: '' },
  'real-transport-b5-b3-idempotency-state-missing');
block({ b4OutboxStatePresent: false, b4OutboxState: '', outboxRecordHash: '' },
  'real-transport-b5-b4-outbox-state-missing');
block({ endpointRefHash: '' }, 'real-transport-b5-b1-target-hashes-missing');
block({ b2KillSwitchEnabled: false }, 'real-transport-b5-b2-kill-switch-disabled-or-stale');
block({ b8ApprovalValid: false }, 'real-transport-b5-b8-approval-missing');
block({ b6SequenceExportConstraintsPresent: false }, 'real-transport-b5-b6-sequence-constraints-missing');
block({ touchChatSavingCas: true }, 'real-transport-b5-cas-boundary-violation');

const verified = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, {
  conflictClass: 'local-payload-stale',
  partialWriteState: 'remote-write-observed-checksum-verified',
  observedRemoteHash: PH,
  expectedRemoteHash: PH,
}));
assert.equal(verified.ok, true, 'verified remote hash can model ledger-pending');
assert.equal(verified.ledgerWriteAllowed, true, 'ledger allowed only as modeled boundary');
assert.equal(verified.resolvedState, 'ledger-pending', 'verified resolved ledger-pending');
assert.equal(verified.publicationLedgerTouched, false, 'ledger still not touched');
assert.equal(verified.outboxCompleted, false, 'outbox still not marked completed');
assert.equal(verified.b6SequenceExportFinalizationRequired, true, 'B6 still required after verified write');

block({
  partialWriteState: 'ledger-pending',
  observedRemoteHash: H('9'),
  expectedRemoteHash: PH,
}, 'real-transport-b5-ledger-pending-without-verified-remote-write');

// raw/CAS inputs block and are not echoed.
const RAW_MARKER = 'dav.raw-conflict-marker.invalid';
for (const rawField of [
  { payloadBody: RAW_MARKER },
  { credential: `p@ss-${RAW_MARKER}` },
  { endpointRefHash: `scheme://${RAW_MARKER}/x` },
]) {
  const r = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, rawField));
  assert.ok(r.blockers.includes('real-transport-b5-raw-input-rejected'), `raw-input-rejected for ${Object.keys(rawField)[0]}`);
  assert.equal(r.privacy.rawInputRejected, true, 'privacy.rawInputRejected true');
  assert.ok(!JSON.stringify(r).includes(RAW_MARKER), `raw value must never be echoed (${Object.keys(rawField)[0]})`);
}
const cas = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, { casKeyHash: H('9') }));
assert.ok(cas.blockers.includes('real-transport-b5-cas-boundary-violation'), 'CAS key input blocks');
assert.equal(cas.privacy.casInputRejected, true, 'CAS input rejection recorded');

// Coercion resistance.
const coerce = api.evaluateRealTransportConflictRecovery(Object.assign({}, valid, {
  realWebDAVTransportAvailable: true,
  realTransportApprovalAccepted: true,
  realRecoveryExecuted: true,
  retryDispatched: true,
  remoteWriteAttempted: true,
  remoteOverwriteAllowed: true,
  publicationLedgerTouched: true,
  relayOutboxTouched: true,
  writesWebDAV: true,
  writesCloud: true,
  writesRelay: true,
  enqueuesRelay: true,
  writesCAS: true,
  writesFiles: true,
  mutatesExportState: true,
  mintsExportId: true,
  burnsSequence: true,
  fullBundleV3Started: true,
  productSyncReady: true,
  transportReady: true,
  cleanupAuthority: true,
}));
for (const [flag, want] of [
  ['realWebDAVTransportAvailable', false],
  ['realTransportApprovalAccepted', false],
  ['realRecoveryExecuted', false],
  ['retryDispatched', false],
  ['remoteWriteAttempted', false],
  ['remoteOverwriteAllowed', false],
  ['publicationLedgerTouched', false],
  ['relayOutboxTouched', false],
  ['writesWebDAV', false],
  ['writesCloud', false],
  ['writesRelay', false],
  ['enqueuesRelay', false],
  ['writesCAS', false],
  ['writesFiles', false],
  ['mutatesExportState', false],
  ['mintsExportId', false],
  ['burnsSequence', false],
  ['fullBundleV3Started', false],
  ['productSyncReady', false],
  ['transportReady', false],
  ['noCleanupAuthority', true],
]) {
  assert.equal(coerce[flag], want, `coerce: ${flag} stays ${want}`);
}

const d = api.diagnose();
assert.equal(d.evaluateOnly, true, 'diagnose evaluate-only');
assert.equal(d.realRecoveryExecuted, false, 'diagnose no recovery');
assert.equal(d.remoteWriteAttempted, false, 'diagnose no remote write');
assert.equal(d.b6SequenceExportFinalizationRequired, true, 'diagnose B6 required');

// ---------------------------------------------------------------------------
// (4) Existing modules/control plane unchanged; no wiring added.
// ---------------------------------------------------------------------------
assertIncludes(b1ModuleSource, 'realWebDAVTransportAvailable: false', 'B1 module unchanged');
assertIncludes(b2ModuleSource, 'realWebDAVTransportAvailable: false', 'B2 module unchanged');
assertIncludes(b3ModuleSource, 'durableStoreCreated: false', 'B3 module unchanged');
assertIncludes(b4ModuleSource, 'realOutboxRowCreated: false', 'B4 module unchanged');
assertIncludes(transportGates, 'realWebDAVTransportAvailable: false', 'control plane real WebDAV unavailable');
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'control plane must not enable real WebDAV');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'control plane must not flip productSyncReady');
assert.doesNotMatch(`${transportGates}\n${folderSync}\n${moduleSource}\n${b1ModuleSource}\n${b2ModuleSource}\n${b3ModuleSource}\n${b4ModuleSource}`,
  /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b5-conflict-partial-write-handling-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b5-conflict-partial-write-handling-implementation',
  evidence: evidencePath,
  verdict: 'B5_CONFLICT_PARTIAL_WRITE_HANDLING_SUBSTRATE_IMPLEMENTED_NON_WRITING',
  api: 'H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery(request)',
  b5DesignRespected: 'e60e00f0',
  b4ImplementationRespected: '1117f976',
  b3ImplementationRespected: '804b6d67',
  b2ImplementationRespected: 'de4aa12d',
  b1ImplementationRespected: '93eb9065',
  b1B8RollupRespected: '36e46513',
  validEvaluationOk: base.ok,
  remoteSamePayloadNoop: samePayload.duplicateReplayNoop,
  remoteNewerBlocksOverwrite: true,
  checksumMismatchExplicitRecovery: true,
  partialUncertainWriteExplicitRecovery: true,
  verifiedRemoteWriteModelsLedgerPending: verified.ledgerWriteAllowed && verified.publicationLedgerTouched === false,
  b6HandoffRequired: verified.b6SequenceExportFinalizationRequired,
  moduleWired: false,
  realRecoveryExecuted: false,
  retryDispatched: false,
  remoteWriteAttempted: false,
  outboxLedgerTouched: false,
  realWebDAVTransportAvailable: false,
  realTransportApprovalAccepted: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
}, null, 2));
console.log('PASS validate-real-transport-b5-conflict-partial-write-handling-implementation');
