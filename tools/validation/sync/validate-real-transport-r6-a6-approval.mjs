#!/usr/bin/env node
//
// Real-transport R6-A6 - fresh bounded approval artifact validator.
//
// Point-in-time validator for the A6 evidence-only artifact. Proves: base parent is exactly S1.2;
// A6 changes exactly its own two paths; no runtime source changed; the committed canonical
// seven-field approval-core JSON is sorted/compact/null-free/float-free/duplicate-free/
// unknown-field-free and matches the committed S1.2 Rust constants; the domain-separated
// approval-core hash recomputes exactly; mint/expiry are strict UTC with validity == 172800s and
// <= the 259200s ceiling, clock skew == 120s; E6/S1/S1.1/S1.2 bindings are exact; the
// constrained-descendant manifest is exact and lists only the three permitted S2 assignments;
// the R4/R5 denylist and all ten protected regions remain byte-identical to S1.2; the exact
// four-request ceremony and every prohibited method/write class are represented; the artifact
// states it is not the operator's live approval; no receipt/token/private-material appears; the
// approval gate remains unsealed; readiness flags remain false; and no network request occurred.
// It does not modify the E6, S1, or S1.2 point-in-time validators.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = 'b3584b3597f45fdfbf816bea98cff7ff5227ef6d'; // S1.2

const evidencePath = 'release-evidence/2026-07-13/real-transport-r6-a6-approval.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-r6-a6-approval.mjs';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const allowedPaths = [evidencePath, validatorPath].sort();

const APPROVAL_HASH_DOMAIN = 'h2o.r6.approval-core.v1\n';
const EXPECTED_SCHEMA_VERSION = 'h2o.r6.approval.v1';
const EXPECTED_DESCENDANT_DESCRIPTOR = 'h2o.r6.constrained-descendant-authorization.v1';
const EXPECTED_CEREMONY_POLICY_ID = 'h2o.r6.sacrificial-webdav-four-step.v1';
const EXPECTED_E6_COMMIT = '6cb091c75c49191f2e8e751847c347d11b3fa0a6';
const EXPECTED_E6_PARENT = 'cab9bbecaf9612208af6ab33afe446407b7b58d3';
const EXPECTED_E6_EVIDENCE_SHA256 = '049f19915ea16c6bee606813de59cfc14ee6396f6ade4c35d802be52ae44a134';
const EXPECTED_E6_STDOUT_SHA256 = '181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6';
const EXPECTED_S1_COMMIT = '6031034427194ef4b0f77b72e0632ab88aa645bb';
const EXPECTED_S11_COMMIT = 'd892be30ea91034f6ff4e0db7004c591d4e2f330';
const EXPECTED_S12_COMMIT = baseCommit;
const EXPECTED_VALIDITY_SECONDS = 172800;
const EXPECTED_CEILING_SECONDS = 259200;
const EXPECTED_SKEW_SECONDS = 120;
const EXPECTED_APPROVAL_CORE_HASH =
  'sha256:ead9927bcb249c2efcdff267c922aaa5b2deb1b6e4b6bb717e5524d34669095e';

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts });
}

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function exactSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: missing start marker`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: missing end marker`);
  return source.slice(start + startMarker.length, end);
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}
function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function statusPaths() {
  const entries = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0').filter(Boolean);
  const paths = [];
  for (const entry of entries) {
    const state = entry.slice(0, 2);
    assert.ok(!/[RC]/.test(state), 'renames and copies are outside A6 scope');
    paths.push(entry.slice(3));
  }
  return paths.sort();
}

// ---------------------------------------------------------------------------
// (1) Base parent / candidate scope.
// ---------------------------------------------------------------------------
const head = git(['rev-parse', 'HEAD']).trim();
git(['cat-file', '-e', `${baseCommit}^{commit}`], { stdio: 'ignore' });

const committedPaths = head === baseCommit
  ? []
  : git(['diff', '--name-only', `${baseCommit}..${head}`]).trim().split('\n').filter(Boolean).sort();
const workingPaths = statusPaths();
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'A6 candidate path set');

let parentCommit = baseCommit;
if (head !== baseCommit) {
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  assert.equal(parents.length, 2, 'A6 must have exactly one parent');
  parentCommit = parents[1];
  assert.equal(parentCommit, baseCommit, 'A6 must be a direct child of S1.2');
  assert.deepEqual(committedPaths, allowedPaths, 'committed A6 path set');
}

// No runtime source changed - the executor file must not appear in the diff at all.
assert.ok(!candidatePaths.includes(rustPath), 'A6 must not change the runtime source file');

// ---------------------------------------------------------------------------
// (2) Evidence content.
// ---------------------------------------------------------------------------
const evidence = read(evidencePath);
const validatorSelfSource = read(validatorPath);

const canonicalBlock = exactSlice(
  evidence,
  '<!-- r6-a6-approval-core-begin -->\n```json\n',
  '\n```\n<!-- r6-a6-approval-core-end -->',
  'approval-core canonical block',
);
assert.ok(!canonicalBlock.includes('\n'), 'canonical block must be a single compact line');
assert.equal(canonicalBlock, canonicalBlock.trim(), 'canonical block must have no leading/trailing whitespace');

let core;
try {
  core = JSON.parse(canonicalBlock);
} catch (error) {
  assert.fail(`canonical block is not valid JSON: ${error.message}`);
}

const expectedFieldOrder = [
  'schemaVersion',
  'approvalArtifactIdentifier',
  'mintUtc',
  'expiryUtc',
  'constrainedDescendantAuthorizationDescriptor',
  'ceremonyPolicyIdentifier',
  'e6Commit',
].sort();
assert.deepEqual(Object.keys(core).sort(), expectedFieldOrder, 'approval core must contain exactly the seven required fields');
assert.deepEqual(Object.keys(JSON.parse(canonicalBlock)), Object.keys(core).sort(), 'approval core JSON keys must be sorted');

for (const [key, value] of Object.entries(core)) {
  assert.equal(typeof value, 'string', `field ${key} must be a string (no float/null/object/array)`);
  assert.ok(value.length > 0, `field ${key} must be non-empty`);
}
assertNotIncludes(canonicalBlock, 'null', 'canonical block null check');

assert.equal(core.schemaVersion, EXPECTED_SCHEMA_VERSION, 'schemaVersion must match committed S1.2 constant');
assert.equal(core.constrainedDescendantAuthorizationDescriptor, EXPECTED_DESCENDANT_DESCRIPTOR, 'descendant descriptor must match committed S1.2 constant');
assert.equal(core.ceremonyPolicyIdentifier, EXPECTED_CEREMONY_POLICY_ID, 'ceremony policy id must match committed S1.2 constant');
assert.equal(core.e6Commit, EXPECTED_E6_COMMIT, 'e6Commit must match committed S1.2 constant');

// Recompute the canonical bytes exactly as committed Rust would (sorted keys, compact, no nulls).
const sortedCore = {};
for (const key of Object.keys(core).sort()) sortedCore[key] = core[key];
const recomputedCanonicalBytes = Buffer.from(JSON.stringify(sortedCore), 'utf8');
assert.equal(recomputedCanonicalBytes.toString('utf8'), canonicalBlock, 'recomputed canonical bytes must equal committed block');

const recomputedHash = 'sha256:' + createHash('sha256')
  .update(Buffer.from(APPROVAL_HASH_DOMAIN, 'utf8'))
  .update(recomputedCanonicalBytes)
  .digest('hex');
assert.equal(recomputedHash, EXPECTED_APPROVAL_CORE_HASH, 'approval-core hash must recompute exactly');
assertIncludes(evidence, EXPECTED_APPROVAL_CORE_HASH, 'evidence must record the recomputed approval-core hash');

// ---------------------------------------------------------------------------
// (3) Mint / expiry / validity / skew.
// ---------------------------------------------------------------------------
const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
assert.ok(utcPattern.test(core.mintUtc), 'mintUtc must be strict UTC');
assert.ok(utcPattern.test(core.expiryUtc), 'expiryUtc must be strict UTC');
const mintMs = Date.parse(core.mintUtc);
const expiryMs = Date.parse(core.expiryUtc);
const validitySeconds = (expiryMs - mintMs) / 1000;
assert.equal(validitySeconds, EXPECTED_VALIDITY_SECONDS, 'expiry - mint must equal 172800 seconds');
assert.ok(validitySeconds <= EXPECTED_CEILING_SECONDS, 'validity must not exceed the 259200s ceiling');
assertIncludes(evidence, `validitySeconds: \`${EXPECTED_VALIDITY_SECONDS}\``, 'evidence validitySeconds');
assertIncludes(evidence, `maximumArchitectureCeilingSeconds: \`${EXPECTED_CEILING_SECONDS}\``, 'evidence ceiling');
assertIncludes(evidence, `clockSkewSeconds: \`${EXPECTED_SKEW_SECONDS}\``, 'evidence clock skew');

// ---------------------------------------------------------------------------
// (4) Lineage bindings.
// ---------------------------------------------------------------------------
for (const token of [
  EXPECTED_E6_COMMIT, EXPECTED_E6_PARENT, EXPECTED_E6_EVIDENCE_SHA256, EXPECTED_E6_STDOUT_SHA256,
  EXPECTED_S1_COMMIT, EXPECTED_S11_COMMIT, EXPECTED_S12_COMMIT,
]) {
  assertIncludes(evidence, token, `lineage anchor ${token}`);
}
assertIncludes(evidence, 'Approved base-lineage anchor: S1.2', 'approved base-lineage anchor statement');

// ---------------------------------------------------------------------------
// (5) Constrained-descendant manifest (machine-checkable presence + exact S2 delta).
// ---------------------------------------------------------------------------
assertIncludes(evidence, 'A6 -> S2 -> V6 -> R6 preparation', 'exact descendant chain statement');
for (const token of [
  '`R6_APPROVAL_GATE_SEALED`: `false` -> `true`',
  '`R6_APPROVAL_COMMIT`: `""` -> exact A6 commit SHA',
  '`R6_APPROVAL_ARTIFACT_HASH`: `""` -> exact A6 approval-core hash',
  'R4/R5 burned-receipt-core-hash denylist',
  'already complete as of S1',
  'byte-identical to S1.2',
  'Runtime source delta after S2: prohibited',
  'Runtime source delta: prohibited',
  'No arbitrary descendant or broad source-pattern exception is authorized',
]) {
  assertIncludes(evidence, token, `descendant manifest: ${token}`);
}
for (const forbidden of ['approved for any descendant', 'runtime source may change freely', 'broad exception granted']) {
  assertNotIncludes(evidence, forbidden, `descendant manifest must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (6) Ceremony policy - exact four-request sequence + full prohibition list.
// ---------------------------------------------------------------------------
for (const token of [
  '**PROPFIND**', 'expected status: `207`',
  '**PUT** — attempt ceiling: 1; create-only', 'expected status: `201` only',
  'identical path and create-only condition', 'expected status: `412` only',
  '**GET**', 'exact payload-hash match', 'accepted status: `2xx`',
  'Stop permanently', 'Total request ceiling: `4`',
]) {
  assertIncludes(evidence, token, `ceremony step: ${token}`);
}
for (const method of [
  'automatic or manual retry', '`DELETE`', 'cleanup', '`OPTIONS`', '`MKCOL`', '`PROPPATCH`',
  '`MOVE`', '`COPY`', '`LOCK`', '`UNLOCK`', '`POST`', 'redirects', 'host change', 'scheme change',
  'port change', 'archive writes', 'chat writes', 'fullBundle writes', 'fullBundle.v3 writes',
  'relay writes', 'CAS writes', 'outbox writes', 'ledger writes', 'any user-data write',
  'any readiness-flag change',
]) {
  assertIncludes(evidence, method, `prohibited-method/write-class representation: ${method}`);
}
for (const token of [
  'durable consumed marker must be persisted before the first network byte',
  'After marker creation the receipt is permanently burned',
  'ambiguous PUT outcome cannot be resolved through another invocation',
  'Final transport readiness remains a separate review',
  "operator's fresh, exact, live approval phrase remains mandatory",
  'This artifact is not that phrase',
]) {
  assertIncludes(evidence, token, `ceremony statement: ${token}`);
}

// ---------------------------------------------------------------------------
// (7) Non-authorization / non-live-approval / policy booleans.
// ---------------------------------------------------------------------------
for (const token of [
  'noRetry: `true`', 'noCleanup: `true`', 'readinessFlagsRemainFalse: `true`',
  'operatorLiveApprovalStillRequired: `true`', 'isOperatorLiveApprovalPhrase: `false`',
  'a6AuthorizesLiveInvocation: `false`', 'receiptMintingAuthorized: `false`',
  'tokensGenerated: `false`', 'consumedMarkerCreated: `false`', 'networkRequestPerformed: `false`',
  'productSyncReady: `false`', 'transportReady: `false`',
  'A6 approves only preparation for the bounded R6 ceremony',
  "does not constitute the operator's live approval",
  'does not authorize any HTTP/WebDAV request',
]) {
  assertIncludes(evidence, token, `policy statement: ${token}`);
}

// ---------------------------------------------------------------------------
// (8) Approval-gate sentinel state and R4/R5 preservation, verified against committed S1.2 source.
// ---------------------------------------------------------------------------
const rustSource = read(rustPath);
for (const token of [
  'const R6_APPROVAL_GATE_SEALED: bool = false;',
  'const R6_APPROVAL_COMMIT: &str = "";',
  'const R6_APPROVAL_ARTIFACT_HASH: &str = "";',
  'const R6_R4_BURNED_RECEIPT_CORE_HASH: &str =',
  'const R6_R5_BURNED_RECEIPT_CORE_HASH: &str =',
]) {
  assertIncludes(rustSource, token, `runtime sentinel/denylist ${token}`);
}
assertIncludes(evidence, 'R6_APPROVAL_GATE_SEALED = false', 'evidence gate-unsealed statement');
assertIncludes(evidence, 'R6_APPROVAL_COMMIT = ""', 'evidence approval-commit-empty statement');
assertIncludes(evidence, 'R6_APPROVAL_ARTIFACT_HASH = ""', 'evidence approval-hash-empty statement');

// ---------------------------------------------------------------------------
// (9) No private/receipt/token material anywhere in A6.
// ---------------------------------------------------------------------------
// Scoped to the evidence artifact only: the validator's own source legitimately names the
// forbidden markers below in order to check for them, so scanning validatorSelfSource against
// its own declared token list would be a self-reference false positive.
assert.doesNotMatch(evidence, /https?:\/\//i, 'no raw endpoint URL literal in evidence');
for (const forbidden of [
  'Authorization:', 'password=', 'oneShotTokenRaw', 'killSwitchTokenRaw', 'consumedMarker.json',
  '.h2o-w3-sacrificial-probe/',
]) {
  assertNotIncludes(evidence, forbidden, `private/token material check: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (10) No network-capable behavior in this validator itself: import allow-list, not a
// self-referential string scan (a banned-token declaration would always contain its own tokens).
// ---------------------------------------------------------------------------
const importLines = validatorSelfSource
  .split('\n')
  .filter((line) => /^\s*import\s/.test(line));
const allowedImportModules = new Set([
  'node:assert/strict', 'node:crypto', 'node:child_process', 'node:fs', 'node:path', 'node:process',
]);
for (const line of importLines) {
  const match = line.match(/from\s+'([^']+)'/);
  assert.ok(match, `unparseable import line: ${line}`);
  assert.ok(allowedImportModules.has(match[1]), `non-allow-listed, potentially network-capable import: ${match[1]}`);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-r6-a6-approval.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'r6-a6-fresh-bounded-approval-artifact',
  head,
  parentCommit,
  candidatePaths,
  approvalCoreFieldCount: Object.keys(core).length,
  approvalCoreHash: recomputedHash,
  approvalCoreHashMatchesRecorded: recomputedHash === EXPECTED_APPROVAL_CORE_HASH,
  schemaVersion: core.schemaVersion,
  constrainedDescendantAuthorizationDescriptor: core.constrainedDescendantAuthorizationDescriptor,
  ceremonyPolicyIdentifier: core.ceremonyPolicyIdentifier,
  mintUtc: core.mintUtc,
  expiryUtc: core.expiryUtc,
  validitySeconds,
  runtimeSourceChanged: candidatePaths.includes(rustPath),
  approvalGateSealed: false,
  a6AuthorizesLiveInvocation: false,
  networkRequestPerformed: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
console.log('PASS validate-real-transport-r6-a6-approval');
