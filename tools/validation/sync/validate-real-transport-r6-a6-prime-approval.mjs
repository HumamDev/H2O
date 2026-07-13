#!/usr/bin/env node
//
// Real-transport R6-A6' - replacement fresh bounded approval artifact validator.
//
// Point-in-time validator for the A6' evidence-only artifact. Fails closed unless: parent is exactly
// TC; A6' changes exactly its two paths and no Rust/runtime source; the canonical block is a single
// marker pair with exactly seven sorted compact ASCII fields matching the committed Rust type/
// constants; the domain-separated approval-core hash recomputes exactly; the identifier follows the
// mint-derived rule; mint/expiry are strict UTC with validity == 172800s and <= the 259200s ceiling
// and skew == 120s; E6/S1/S1.1/S1.2/A6/TC bindings are exact; the historical A6 supersession is
// explicit and its commit/hash are marked prohibited from S2; the constrained-descendant manifest
// (exactly three S2 constants, no test change, no other Rust byte) and the four-request ceremony
// with every prohibition are present; the artifact is not the operator's live approval; no receipt/
// token/private material appears; the gate stays unsealed; readiness stays false; no network ran.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = '8ae6aade5d56d2b012c40e5a35b5183cb331430d'; // TC

const evidencePath = 'release-evidence/2026-07-13/real-transport-r6-a6-prime-approval.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-r6-a6-prime-approval.mjs';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const allowedPaths = [evidencePath, validatorPath].sort();

const APPROVAL_HASH_DOMAIN = 'h2o.r6.approval-core.v1\n';
const EXPECTED = {
  schemaVersion: 'h2o.r6.approval.v1',
  descriptor: 'h2o.r6.constrained-descendant-authorization.v1',
  ceremony: 'h2o.r6.sacrificial-webdav-four-step.v1',
  e6Commit: '6cb091c75c49191f2e8e751847c347d11b3fa0a6',
  e6Parent: 'cab9bbecaf9612208af6ab33afe446407b7b58d3',
  e6Evidence: '049f19915ea16c6bee606813de59cfc14ee6396f6ade4c35d802be52ae44a134',
  e6Stdout: '181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6',
  s1: '6031034427194ef4b0f77b72e0632ab88aa645bb',
  s11: 'd892be30ea91034f6ff4e0db7004c591d4e2f330',
  s12: 'b3584b3597f45fdfbf816bea98cff7ff5227ef6d',
  historicalA6: '892d88769c7897a9efe23e63aa2fb5a091ecaa64',
  historicalA6Hash: 'sha256:ead9927bcb249c2efcdff267c922aaa5b2deb1b6e4b6bb717e5524d34669095e',
  tc: '8ae6aade5d56d2b012c40e5a35b5183cb331430d',
  validitySeconds: 172800,
  ceilingSeconds: 259200,
  skewSeconds: 120,
  approvalCoreHash: 'sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13',
};

function git(args, opts = {}) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts }); }
function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function inc(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function ninc(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }
function count(hay, needle) { return hay.split(needle).length - 1; }

function statusPaths() {
  const entries = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0').filter(Boolean);
  const paths = [];
  for (const entry of entries) {
    const state = entry.slice(0, 2);
    assert.ok(!/[RC]/.test(state), 'renames and copies are outside A6prime scope');
    paths.push(entry.slice(3));
  }
  return paths.sort();
}

// ---------------------------------------------------------------------------
// (1) Parent / candidate scope; zero runtime delta (rust file absent from change set).
// ---------------------------------------------------------------------------
const head = git(['rev-parse', 'HEAD']).trim();
git(['cat-file', '-e', `${baseCommit}^{commit}`], { stdio: 'ignore' });

const committedPaths = head === baseCommit
  ? []
  : git(['diff', '--name-only', `${baseCommit}..${head}`]).trim().split('\n').filter(Boolean).sort();
const workingPaths = statusPaths();
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'A6prime candidate path set must be exactly the two approved paths');
assert.ok(!candidatePaths.includes(rustPath), 'A6prime must not change the Rust/runtime source');

let parentCommit = baseCommit;
if (head !== baseCommit) {
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  assert.equal(parents.length, 2, 'A6prime must have exactly one parent');
  parentCommit = parents[1];
  assert.equal(parentCommit, baseCommit, 'A6prime parent must be exactly TC');
  assert.deepEqual(committedPaths, allowedPaths, 'committed A6prime path set');
}

const evidence = read(evidencePath);

// ---------------------------------------------------------------------------
// (2) Exactly one canonical marker pair; extract and structurally validate it.
// ---------------------------------------------------------------------------
assert.equal(count(evidence, '<!-- r6-a6-prime-approval-core-begin -->'), 1, 'exactly one begin marker');
assert.equal(count(evidence, '<!-- r6-a6-prime-approval-core-end -->'), 1, 'exactly one end marker');
const beginMarker = '<!-- r6-a6-prime-approval-core-begin -->\n```json\n';
const endMarker = '\n```\n<!-- r6-a6-prime-approval-core-end -->';
const start = evidence.indexOf(beginMarker);
const end = evidence.indexOf(endMarker);
assert.ok(start >= 0 && end > start, 'begin marker precedes end marker with fenced json');
const block = evidence.slice(start + beginMarker.length, end);
assert.ok(!block.includes('\n'), 'canonical block must be a single physical line');
assert.equal(block, block.trim(), 'canonical block must have no leading/trailing whitespace');

const core = JSON.parse(block);
const expectedKeys = [
  'approvalArtifactIdentifier', 'ceremonyPolicyIdentifier', 'constrainedDescendantAuthorizationDescriptor',
  'e6Commit', 'expiryUtc', 'mintUtc', 'schemaVersion',
];
assert.deepEqual(Object.keys(core), expectedKeys, 'canonical block keys must be exactly the seven sorted fields');
for (const [k, v] of Object.entries(core)) {
  assert.equal(typeof v, 'string', `field ${k} must be a string (no null/float/object/array)`);
  assert.ok(v.length > 0, `field ${k} must be non-empty`);
}

assert.equal(core.schemaVersion, EXPECTED.schemaVersion, 'schemaVersion matches committed constant');
assert.equal(core.constrainedDescendantAuthorizationDescriptor, EXPECTED.descriptor, 'descriptor matches committed constant');
assert.equal(core.ceremonyPolicyIdentifier, EXPECTED.ceremony, 'ceremony policy matches committed constant');
assert.equal(core.e6Commit, EXPECTED.e6Commit, 'e6Commit matches committed constant');

// mint-derived identifier rule
const utc = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const mMint = core.mintUtc.match(utc);
assert.ok(mMint, 'mintUtc strict UTC');
assert.ok(utc.test(core.expiryUtc), 'expiryUtc strict UTC');
const stamp = `${mMint[1]}${mMint[2]}${mMint[3]}T${mMint[4]}${mMint[5]}${mMint[6]}Z`;
assert.equal(core.approvalArtifactIdentifier, `h2o.real-transport.r6.a6-prime.approval.${stamp}`, 'identifier follows the mint-derived rule');
assert.notEqual(core.approvalArtifactIdentifier, 'h2o.real-transport.r6.a6.approval.2026-07-13', 'identifier must not reuse the historical A6 identifier');

// recompute canonical bytes exactly as committed Rust (sorted keys, compact, no null)
const sorted = {};
for (const k of Object.keys(core).sort()) sorted[k] = core[k];
const canonicalBytes = Buffer.from(JSON.stringify(sorted), 'utf8');
assert.equal(canonicalBytes.toString('utf8'), block, 'recomputed canonical bytes equal the committed block');
const recomputedHash = 'sha256:' + createHash('sha256')
  .update(Buffer.from(APPROVAL_HASH_DOMAIN, 'utf8')).update(canonicalBytes).digest('hex');
assert.equal(recomputedHash, EXPECTED.approvalCoreHash, 'approval-core hash recomputes exactly');
inc(evidence, EXPECTED.approvalCoreHash, 'evidence records the recomputed hash');

// ---------------------------------------------------------------------------
// (3) Expiry policy.
// ---------------------------------------------------------------------------
const validity = (Date.parse(core.expiryUtc) - Date.parse(core.mintUtc)) / 1000;
assert.equal(validity, EXPECTED.validitySeconds, 'expiry - mint == 172800 seconds');
assert.ok(validity <= EXPECTED.ceilingSeconds, 'validity within 259200s ceiling');
inc(evidence, `validitySeconds: \`${EXPECTED.validitySeconds}\``, 'evidence validitySeconds');
inc(evidence, `maximumValiditySeconds: \`${EXPECTED.ceilingSeconds}\``, 'evidence ceiling');
inc(evidence, `clockSkewSeconds: \`${EXPECTED.skewSeconds}\``, 'evidence clock skew');

// ---------------------------------------------------------------------------
// (4) Lineage + supersession record.
// ---------------------------------------------------------------------------
for (const token of [
  EXPECTED.e6Commit, EXPECTED.e6Parent, EXPECTED.e6Evidence, EXPECTED.e6Stdout,
  EXPECTED.s1, EXPECTED.s11, EXPECTED.s12, EXPECTED.historicalA6, EXPECTED.tc,
]) {
  inc(evidence, token, `lineage anchor ${token}`);
}
inc(evidence, 'Approved base-lineage anchor: TC', 'approved base-lineage anchor is TC');
inc(evidence, EXPECTED.historicalA6Hash, 'historical A6 hash recorded');
inc(evidence, 'unsealed, superseded, and permanently prohibited from S2 use', 'historical A6 supersession status');
inc(evidence, 'A6\' is the only candidate approval S2 may later seal', 'A6prime is sole sealable approval');
inc(evidence, 'must never be copied into the future S2 constants', 'historical A6 prohibited from S2 constants');
inc(evidence, 'valid when created and integrated', 'A6prime does not claim historical A6 was invalid when created');

// ---------------------------------------------------------------------------
// (5) Constrained-descendant manifest (structured tokens).
// ---------------------------------------------------------------------------
inc(evidence, 'A6\' -> S2 -> V6 -> R6 preparation', 'exact descendant chain');
for (const token of [
  '`R6_APPROVAL_GATE_SEALED`: `false` -> `true`',
  '`R6_APPROVAL_COMMIT`: `""` -> exact A6\' commit SHA',
  '`R6_APPROVAL_ARTIFACT_HASH`: `""` -> exact A6\' approval-core hash',
  'No test-source change in S2; no other Rust byte may change.',
  'The full test suite must remain green because TC is already integrated.',
  'use of the historical A6 commit/hash',
  'any R4/R5 denylist change',
  'byte-identical to TC',
  'Runtime source delta after S2: prohibited',
  'Runtime source delta: prohibited',
  'No arbitrary descendant or broad source-pattern exception is authorized',
]) {
  inc(evidence, token, `descendant manifest: ${token}`);
}

// ---------------------------------------------------------------------------
// (6) Ceremony policy.
// ---------------------------------------------------------------------------
for (const token of [
  '**PROPFIND**', 'expected status: `207`',
  '**PUT** — attempt ceiling: 1; create-only', 'expected status: `201` only',
  'identical path and create-only condition', 'expected status: `412` only',
  '**GET**', 'exact payload-hash match', 'accepted status: `2xx`',
  'Stop permanently', 'Total request ceiling: `4`',
]) {
  inc(evidence, token, `ceremony step: ${token}`);
}
for (const method of [
  'automatic or manual retry', '`DELETE`', 'cleanup', '`OPTIONS`', '`MKCOL`', '`PROPPATCH`', '`MOVE`',
  '`COPY`', '`LOCK`', '`UNLOCK`', '`POST`', 'redirects', 'host change', 'scheme change', 'port change',
  'archive writes', 'chat writes', 'fullBundle writes', 'fullBundle.v3 writes', 'relay writes',
  'CAS writes', 'outbox writes', 'ledger writes', 'any user-data write', 'any readiness-flag change',
]) {
  inc(evidence, method, `prohibited item: ${method}`);
}
for (const token of [
  'durable consumed marker must be persisted before the first network byte',
  'After marker creation the receipt is permanently burned',
  'ambiguous PUT outcome cannot be resolved through another invocation',
  'Final transport readiness remains a separate review',
  'This artifact is not that phrase',
]) {
  inc(evidence, token, `ceremony statement: ${token}`);
}

// ---------------------------------------------------------------------------
// (7) Policy flags / non-authorization.
// ---------------------------------------------------------------------------
for (const token of [
  'noRetry: `true`', 'noCleanup: `true`', 'readinessFlagsRemainFalse: `true`',
  'operatorLiveApprovalStillRequired: `true`', 'isOperatorLiveApprovalPhrase: `false`',
  'a6PrimeAuthorizesLiveInvocation: `false`', 'receiptMintingAuthorized: `false`',
  'tokensGenerated: `false`', 'consumedMarkerCreated: `false`', 'networkRequestPerformed: `false`',
  'productSyncReady: `false`', 'transportReady: `false`',
  'A6\' approves only preparation for the bounded R6 ceremony',
  'does not authorize receipt minting, token generation, consumed-marker creation, or any HTTP or',
]) {
  inc(evidence, token, `policy statement: ${token}`);
}

// ---------------------------------------------------------------------------
// (8) Gate sentinels unchanged (verified against committed TC Rust source) + R4/R5 present.
// ---------------------------------------------------------------------------
const rustSource = read(rustPath);
for (const token of [
  'const R6_APPROVAL_GATE_SEALED: bool = false;',
  'const R6_APPROVAL_COMMIT: &str = "";',
  'const R6_APPROVAL_ARTIFACT_HASH: &str = "";',
  'const R6_R4_BURNED_RECEIPT_CORE_HASH: &str =',
  'const R6_R5_BURNED_RECEIPT_CORE_HASH: &str =',
]) {
  inc(rustSource, token, `runtime sentinel/denylist ${token}`);
}
ninc(rustSource, 'R6_APPROVAL_GATE_SEALED: bool = true', 'gate must not be sealed');

// ---------------------------------------------------------------------------
// (9) No private/receipt/token material in the EVIDENCE artifact only.
// ---------------------------------------------------------------------------
assert.doesNotMatch(evidence, /https?:\/\//i, 'no raw endpoint URL in evidence');
for (const forbidden of ['Authorization:', 'password=', 'oneShotTokenRaw', 'killSwitchTokenRaw', '.h2o-w3-sacrificial-probe/']) {
  ninc(evidence, forbidden, `private/token material: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (10) This validator is network-free: import allow-list (not a self-referential token scan).
// ---------------------------------------------------------------------------
const selfSource = read(validatorPath);
for (const line of selfSource.split('\n').filter((l) => /^\s*import\s/.test(l))) {
  const m = line.match(/from\s+'([^']+)'/);
  assert.ok(m, `unparseable import: ${line}`);
  assert.ok(
    ['node:assert/strict', 'node:crypto', 'node:child_process', 'node:fs', 'node:path', 'node:process'].includes(m[1]),
    `non-allow-listed import: ${m[1]}`,
  );
}

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-r6-a6-prime-approval.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'r6-a6-prime-fresh-bounded-approval-artifact',
  head,
  parentCommit,
  candidatePaths,
  approvalCoreFieldCount: Object.keys(core).length,
  approvalCoreHash: recomputedHash,
  approvalCoreHashMatchesRecorded: recomputedHash === EXPECTED.approvalCoreHash,
  approvalArtifactIdentifier: core.approvalArtifactIdentifier,
  mintUtc: core.mintUtc,
  expiryUtc: core.expiryUtc,
  validitySeconds: validity,
  singleCanonicalMarkerPair: true,
  historicalA6Superseded: EXPECTED.historicalA6,
  runtimeSourceChanged: candidatePaths.includes(rustPath),
  approvalGateSealed: false,
  a6PrimeAuthorizesLiveInvocation: false,
  networkRequestPerformed: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
console.log('PASS validate-real-transport-r6-a6-prime-approval');
