#!/usr/bin/env node
//
// Real-transport B2 - real kill-switch lifecycle design validator.
//
// Proves the B2 design: it respects the B1 design (b2e10531), the B8+B7 design (26e6241b), and the gap review
// (d2bea4c0); B2 is design-only (no real kill-switch lifecycle / failure codes are implemented in product source); no
// real transport authorization is introduced; the local mock kill switch is not real kill-switch approval; NO raw
// endpoint / credential / path value appears in the design; productSyncReady:false and transportReady:false remain;
// fullBundle.v3 remains deferred/not-started; Chat Saving CAS remains blocked/deferred; and no cleanup/a950 mutation
// authority is introduced. Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const designPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
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

const design = read(designPath);
const flat = compact(design);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Design content anchors: verdict, 9 areas, lifecycle semantics, failure modes, B3-B6, next lane.
// ---------------------------------------------------------------------------
for (const token of [
  'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED (DESIGN / SPECIFICATION ONLY)',
  'design/specification evidence + validator slice only',
  'b2e10531', '26e6241b', 'd2bea4c0', '15a33852', 'edb30677',
  // 1. enable
  '## 1. Explicit Enable Path',
  'reviewedKillSwitchEnableApproved: true',
  "killSwitchScope: 'real-webdav-cloud-relay-controlled-write'",
  'b8ApprovalRef',
  'b7ReadinessPolicyRef',
  'killSwitchEnableTokenHash',
  'enableTokenExpiresAtIso',
  // 2. disable
  '## 2. Explicit Disable Path',
  'killSwitchEmergencyDisable: true',
  'killSwitchNormalDisable: true',
  'real-transport-b2-kill-switch-disabled-before-write',
  'real-transport-b2-kill-switch-disabled-after-preflight',
  // 3. mid-flight
  '## 3. Mid-Flight Disable Behavior',
  "killSwitchMidFlightRecoveryState: 'explicit-recovery-required'",
  'noSilentRetry: true',
  'noAutoResumeIntoWrite: true',
  // 4. missing/invalid
  'real-transport-b2-kill-switch-missing',
  'real-transport-b2-kill-switch-disabled',
  'real-transport-b2-kill-switch-scope-invalid',
  'real-transport-b2-kill-switch-enable-token-stale',
  'real-transport-b2-kill-switch-target-mismatch',
  // 5. mock boundary
  '**local mock kill switch is not real kill-switch approval**',
  '**local mock target mode cannot enable real transport**',
  // 6. B8
  '**real approval cannot override a disabled kill switch**',
  'an enabled kill switch cannot replace approval',
  '**both are required**',
  // 7. B7
  '**kill switch alone does not flip `transportReady`**',
  // 8. audit
  'killSwitchEvidenceHashOnly: true',
  'casKeysExposed: false',
  'touchChatSavingCas: false',
  // 9. failure modes
  'real-transport-b2-kill-switch-target-hashes-missing',
  'real-transport-b2-kill-switch-approval-missing',
  'real-transport-b2-kill-switch-readiness-mismatch-hidden',
  'real-transport-b2-kill-switch-mid-flight-disabled',
  'real-transport-b2-kill-switch-local-mock-not-accepted',
  // remaining + next + start-now
  '## Remaining Blockers (B3-B6 still open)',
  'B3 - durable idempotency store',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

for (const blocker of [
  '**B3** durable-idempotency-store-missing',
  '**B4** real-enqueue-boundary-undesigned',
  '**B5** real-conflict-partial-write-handling-missing',
  '**B6** real-sequence-export-id-semantics-undesigned',
]) {
  assertIncludes(flat, blocker, `B3-B6 open blocker ${blocker}`);
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
// (2) NO raw endpoint / credential / path values anywhere in the design.
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
assertIncludes(read(b1DesignPath), 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED',
  'B1 design respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (4) DESIGN-ONLY: no B2 lifecycle codes implemented in source; source invariants unmutated.
// ---------------------------------------------------------------------------
assertNotIncludes(transportGates, 'real-transport-b2-', 'B2 lifecycle codes must not be implemented in source (design-only)');
assertNotIncludes(transportGates, 'killSwitchEnableTokenHash', 'B2 enable token must not be implemented in source (design-only)');
assertNotIncludes(transportGates, 'killSwitchMidFlightRecoveryState', 'B2 mid-flight recovery must not be implemented in source (design-only)');
// the existing dry-run/mock kill switch gate is still present (this design builds on it)
assertIncludes(transportGates, "CONTROLLED_WRITE_KILL_SWITCH_GATE = 'webdav-controlled-write-kill-switch-evaluate'",
  'existing mock kill-switch gate remains');
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
  schema: 'h2o.studio.transport.real-transport-b2-kill-switch-lifecycle-design.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b2-kill-switch-lifecycle-design',
  evidence: designPath,
  verdict: 'B2_DESIGNED_DESIGN_ONLY_REAL_TRANSPORT_STILL_BLOCKED',
  b1DesignRespected: 'b2e10531',
  b8b7DesignRespected: '26e6241b',
  gapReviewRespected: 'd2bea4c0',
  designOnly: true,
  realKillSwitchLifecycleImplemented: false,
  realTransportAuthorizationIntroduced: false,
  localMockKillSwitchIsRealKillSwitchApproval: false,
  rawEndpointCredentialPathPresent: false,
  realTransportApprovalAccepted: false,
  transportReady: false,
  productSyncReady: false,
  remainingBlockers: ['B3', 'B4', 'B5', 'B6'],
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B3-durable-idempotency-store-design-only',
}, null, 2));
console.log('PASS validate-real-transport-b2-kill-switch-lifecycle-design');
