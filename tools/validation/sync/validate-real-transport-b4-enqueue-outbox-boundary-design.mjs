#!/usr/bin/env node
//
// Real-transport B4 - real enqueue / outbox boundary design validator.
//
// Proves the B4 design: it respects the B3 (e1618571), B2 (09bf7701), B1 (b2e10531), and B8+B7 (26e6241b) designs and
// the gap review (d2bea4c0); B4 is design-only (no real enqueue / outbox / publication-ledger write / failure codes are
// implemented in product source); no real transport authorization is introduced; NO raw endpoint / credential / path /
// payload-body value appears in the design; productSyncReady:false and transportReady:false remain; fullBundle.v3
// remains deferred/not-started; Chat Saving CAS remains blocked/deferred; and no cleanup/a950 mutation authority is
// introduced. Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const designPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md';
const b3DesignPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md';
const b2DesignPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayOutboxPath = 'src-surfaces-base/studio/sync/relay-outbox.tauri.js';
const publicationLedgerPath = 'src-surfaces-base/studio/sync/publication-ledger.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const design = read(designPath);
const flat = compact(design);
const transportGates = read(transportGatesPath);
const relayOutbox = read(relayOutboxPath);
const publicationLedger = read(publicationLedgerPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Design content anchors: verdict, 9 areas, boundary + retry semantics, failure modes, B5-B6, next lane.
// ---------------------------------------------------------------------------
for (const token of [
  'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY IS DESIGNED (DESIGN / SPECIFICATION ONLY)',
  'design/specification evidence + validator slice only',
  'e1618571', '09bf7701', 'b2e10531', '26e6241b', 'd2bea4c0', '15a33852',
  // 1. ownership
  '## 1. Ownership and Source of Truth',
  'Desktop authority for real transport enqueue/outbox',
  "the existing durable relay\noutbox store (`h2o:sync:relay-outbox:v1`)".replace(/\n\s*/g, ' '),
  '`h2o:sync:publication-ledger:v1`',
  'chromeOwnsRealEnqueue: false',
  // 2. enqueue boundary
  '## 2. Enqueue Boundary',
  'at `apply-intent-recorded` -> `queued`',
  'B8 real approval accepted',
  'localExportableSyncReadyIsAuthorization:\nfalse'.replace(/\n\s*/g, ' '),
  'never creates a real-transport outbox row',
  // 3. outbox row semantics
  '## 3. Outbox Row Semantics',
  'idempotencyKeyHash',
  'b8ApprovalRefHash',
  'killSwitchEnableTokenHash',
  'sequenceExportConstraintRef',
  '`queued` -> `dispatching` -> `remote-write-observed` -> `ledger-pending` -> `completed`',
  // 4. ledger semantics
  '## 4. Publication Ledger Semantics',
  'a publication-ledger entry may be written ONLY after `remote-write-observed`',
  'ledgerNeverPrecedesRemoteWrite: true',
  'ledgerHashOnly: true',
  // 5. retry/resume
  '## 5. Retry / Resume Semantics',
  'bootResumeDispatch: false',
  'duplicate-replay-noop',
  'explicit-recovery-required',
  'noBlindRetryAfterPartialWrite: true',
  // 6. failure modes
  'real-transport-b4-idempotency-record-missing',
  'real-transport-b4-duplicate-changed-payload-target',
  'real-transport-b4-kill-switch-token-stale',
  'real-transport-b4-approval-missing',
  'real-transport-b4-target-hashes-missing',
  'real-transport-b4-sequence-constraint-mismatch',
  'real-transport-b4-peer-ambiguous',
  'real-transport-b4-cas-boundary-violation',
  'real-transport-b4-local-mock-target-not-real',
  // 7. privacy
  'rawPayloadBodyStored: false',
  'casKeysExposed: false',
  'touchChatSavingCas: false',
  'outboxRowHashOnly: true',
  // 8. B5/B6 handoff
  'B4 must NOT finalize conflict/partial-write (B5) or sequence/export-id (B6) semantics',
  'the outbox `explicit-recovery-required` state is the\n  B5 recovery entry point'.replace(/\n\s*/g, ' '),
  // 9. a950
  'noCleanupAuthority: true',
  'noA950Mutation: true',
  'a950 never enters the exportable payload',
  // remaining + next + start-now
  '## Remaining Blockers (B5-B6 still open)',
  'B5 - real conflict + partial-write handling',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

for (const blocker of [
  '**B5** real-conflict-partial-write-handling-missing',
  '**B6** real-sequence-export-id-semantics-undesigned',
]) {
  assertIncludes(flat, blocker, `B5-B6 open blocker ${blocker}`);
}

for (const forbidden of [
  'realTransportApprovalAccepted: true',
  'realWebDAVTransportAvailable: true',
  'transportReady:true` remains',
  'productSyncReady:true` remains',
  'authorizes real transport',
  'real transport may start now',
  'row:a950a44b859f` was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `design must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) NO raw endpoint / credential / path / payload-body values anywhere in the design.
// ---------------------------------------------------------------------------
assert.doesNotMatch(design, /https?:\/\//i, 'design must contain no raw endpoint URL');
assert.doesNotMatch(design, /\b(?:ftp|webdav|dav|smb|s3):\/\//i, 'design must contain no raw remote scheme URL');
assert.doesNotMatch(design, /\b(?:password|passwd|secret|apikey|api_key|access[_-]?key|token)\s*[:=]\s*\S/i,
  'design must contain no raw credential assignment');
assert.doesNotMatch(design, /\bBearer\s+[A-Za-z0-9._-]{6,}|\bBasic\s+[A-Za-z0-9+/=]{6,}/,
  'design must contain no raw auth header value');

// ---------------------------------------------------------------------------
// (3) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(read(b3DesignPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE IS DESIGNED', 'B3 design respected');
assertIncludes(read(b2DesignPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED', 'B2 design respected');
assertIncludes(read(b1DesignPath), 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED',
  'B1 design respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (4) DESIGN-ONLY: no B4 enqueue/outbox codes implemented in source; existing stores unchanged; invariants intact.
// ---------------------------------------------------------------------------
assertNotIncludes(transportGates, 'real-transport-b4-', 'B4 failure codes must not be implemented in source (design-only)');
assertNotIncludes(relayOutbox, 'real-transport-b4-', 'B4 codes must not be minted into the relay outbox (design-only)');
assertNotIncludes(relayOutbox, 'real-transport-idempotency', 'B3/B4 real-transport enqueue must not be minted into relay outbox (design-only)');
assertNotIncludes(publicationLedger, 'real-transport-b4-', 'B4 codes must not be minted into the publication ledger (design-only)');
// existing durable stores this design reuses remain present + unchanged in shape
assertIncludes(relayOutbox, "OUTBOX_KEY = 'h2o:sync:relay-outbox:v1'", 'existing relay outbox store present');
assertIncludes(publicationLedger, "LEDGER_KEY = 'h2o:sync:publication-ledger:v1'", 'existing publication ledger store present');
for (const token of [
  'realTransportApprovalAccepted: false',
  'realWebDAVTransportAvailable: false',
  'transportReady: false',
  'realWebDAVWrite: false',
]) {
  assertIncludes(transportGates, token, `source invariant ${token}`);
}
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'source must not make real WebDAV available');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'source must not flip productSyncReady true');
assert.doesNotMatch(`${transportGates}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b4-enqueue-outbox-boundary-design.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b4-enqueue-outbox-boundary-design',
  evidence: designPath,
  verdict: 'B4_DESIGNED_DESIGN_ONLY_REAL_TRANSPORT_STILL_BLOCKED',
  b3DesignRespected: 'e1618571',
  b2DesignRespected: '09bf7701',
  b1DesignRespected: 'b2e10531',
  b8b7DesignRespected: '26e6241b',
  gapReviewRespected: 'd2bea4c0',
  designOnly: true,
  realEnqueueOutboxImplemented: false,
  publicationLedgerWriteImplemented: false,
  realTransportAuthorizationIntroduced: false,
  rawEndpointCredentialPathPayloadPresent: false,
  realTransportApprovalAccepted: false,
  transportReady: false,
  productSyncReady: false,
  remainingBlockers: ['B5', 'B6'],
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B5-real-conflict-partial-write-handling-design-only',
}, null, 2));
console.log('PASS validate-real-transport-b4-enqueue-outbox-boundary-design');
