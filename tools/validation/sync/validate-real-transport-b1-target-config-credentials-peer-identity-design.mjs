#!/usr/bin/env node
//
// Real-transport B1 - target config + credentials + peer identity design validator.
//
// Proves the B1 design: it respects the B8+B7 design (26e6241b) and the gap review (d2bea4c0); B1 is design-only (no B1
// target config / credential handling / failure codes are implemented in product source); no real target config or
// credential handling is introduced; NO raw endpoint / credential / path value appears in the design (hash-only /
// redacted references only); the local mock target is not treated as a real target; real transport remains blocked;
// productSyncReady:false and transportReady:false remain; fullBundle.v3 remains deferred/not-started; Chat Saving CAS
// remains blocked/deferred; and no cleanup/a950 mutation authority is introduced. Evidence/validator-only; no product
// source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const designPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
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
// (1) Design content anchors: verdict, 8 areas, refs, failure modes, B2-B6, next lane.
// ---------------------------------------------------------------------------
for (const token of [
  'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED (DESIGN /',
  'design/specification evidence + validator slice only',
  '26e6241b', 'd2bea4c0', '15a33852', '40f52a5f', 'edb30677',
  // 1. target identity
  '## 1. Real WebDAV Target Identity',
  'endpointRefHash',
  'remoteRootRefHash',
  'peerIdentityBindingHash',
  'localClientIdentityHash',
  // 2. credential handling (redacted)
  'credentialRefHash',
  'rawCredentialLogged: false',
  'rawEndpointLogged: false',
  'rawRemotePathLogged: false',
  'privacyHashOnly: true',
  // 3. failure modes / validation
  'real-transport-b1-target-ambiguous',
  'real-transport-b1-peer-binding-missing',
  'real-transport-b1-remote-root-missing',
  'real-transport-b1-credential-ref-missing',
  'real-transport-b1-endpoint-ref-missing',
  'real-transport-b1-raw-input-rejected',
  'real-transport-b1-raw-endpoint-logged',
  'real-transport-b1-raw-credential-logged',
  'real-transport-b1-peer-mismatch',
  'real-transport-b1-remote-root-mismatch',
  'real-transport-b1-local-mock-target-not-real',
  // 4. local mock boundary
  '**Local mock target is not real target**',
  'Local mock idempotency target hashes are not real WebDAV identity',
  // 5. B8 relationship
  'B8 real-transport approval MUST reference the B1 target hashes',
  'cannot be accepted without B1 closure',
  // 6. B7 relationship
  '**B1 alone does not flip `transportReady`.**',
  // 7. CAS
  'casKeysExposed: false',
  'touchChatSavingCas: false',
  // remaining + next + start-now
  '## Remaining Blockers (B2-B6 still open)',
  'B2 - real kill-switch lifecycle',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

for (const blocker of [
  '**B2** kill-switch-real-lifecycle-missing',
  '**B3** durable-idempotency-store-missing',
  '**B4** real-enqueue-boundary-undesigned',
  '**B5** real-conflict-partial-write-handling-missing',
  '**B6** real-sequence-export-id-semantics-undesigned',
]) {
  assertIncludes(flat, blocker, `B2-B6 open blocker ${blocker}`);
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
// (2) NO raw endpoint / credential / path values anywhere in the design (hash-only / redacted).
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
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (4) DESIGN-ONLY: no B1 target config / failure codes implemented in source; source invariants unmutated.
// ---------------------------------------------------------------------------
assertNotIncludes(transportGates, 'real-transport-b1-', 'B1 failure codes must not be implemented in source (design-only)');
assertNotIncludes(transportGates, 'peerIdentityBindingHash', 'B1 peer identity binding must not be implemented in source (design-only)');
assertNotIncludes(transportGates, 'credentialRefHash', 'B1 credential handling must not be implemented in source (design-only)');
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
  schema: 'h2o.studio.transport.real-transport-b1-target-config-credentials-peer-identity-design.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b1-target-config-credentials-peer-identity-design',
  evidence: designPath,
  verdict: 'B1_DESIGNED_DESIGN_ONLY_REAL_TRANSPORT_STILL_BLOCKED',
  b8b7DesignRespected: '26e6241b',
  gapReviewRespected: 'd2bea4c0',
  designOnly: true,
  realTargetConfigImplemented: false,
  credentialHandlingImplemented: false,
  rawEndpointCredentialPathPresent: false,
  localMockTargetTreatedAsRealTarget: false,
  realTransportApprovalAccepted: false,
  realWebDAVTransportAvailable: false,
  transportReady: false,
  productSyncReady: false,
  remainingBlockers: ['B2', 'B3', 'B4', 'B5', 'B6'],
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  realTransportWriteAuthorizationIntroduced: false,
  recommendedNextLane: 'B2-real-kill-switch-lifecycle-design-only',
}, null, 2));
console.log('PASS validate-real-transport-b1-target-config-credentials-peer-identity-design');
