#!/usr/bin/env node
// R6-S2 point-in-time validator for the exact replacement A6' three-constant seal.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = 'b2de60b88aa750897948e504e6458d943bf83f3b';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const evidencePath = 'release-evidence/2026-07-13/real-transport-r6-s2-a6-prime-approval-gate-seal.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-r6-s2-a6-prime-approval-gate-seal.mjs';
const a6PrimePath = 'release-evidence/2026-07-13/real-transport-r6-a6-prime-approval.md';
const allowedPaths = [rustPath, evidencePath, validatorPath].sort();

const expected = {
  approvalCommit: baseCommit,
  approvalHash: 'sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13',
  historicalApprovalCommit: '892d88769c7897a9efe23e63aa2fb5a091ecaa64',
  historicalApprovalHash: 'sha256:ead9927bcb249c2efcdff267c922aaa5b2deb1b6e4b6bb717e5524d34669095e',
  schemaVersion: 'h2o.r6.approval.v1',
  artifactIdentifier: 'h2o.real-transport.r6.a6-prime.approval.20260713T171031Z',
  descriptor: 'h2o.r6.constrained-descendant-authorization.v1',
  ceremony: 'h2o.r6.sacrificial-webdav-four-step.v1',
  e6Commit: '6cb091c75c49191f2e8e751847c347d11b3fa0a6',
  mintUtc: '2026-07-13T17:10:31Z',
  expiryUtc: '2026-07-15T17:10:31Z',
  clockSkewSeconds: 120,
  canonicalBytes: 412,
  r4Hash: 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183',
  r5Hash: 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57',
};

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function read(rel) {
  const absolute = path.join(root, rel);
  assert.ok(fs.existsSync(absolute), `missing ${rel}`);
  return fs.readFileSync(absolute, 'utf8');
}

function gitLines(args) {
  return git(args).trim().split('\n').filter(Boolean).sort();
}

function statusPaths() {
  return git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      assert.equal(/[RC]/.test(entry.slice(0, 2)), false, 'rename/copy outside S2 scope');
      return entry.slice(3);
    })
    .sort();
}

function count(source, token) {
  return source.split(token).length - 1;
}

function exactSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: missing start marker`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: missing end marker`);
  return source.slice(start, end);
}

function oneSpan(source, regex, label) {
  const matches = [...source.matchAll(regex)];
  assert.equal(matches.length, 1, `${label}: expected exactly one declaration`);
  return { start: matches[0].index, end: matches[0].index + matches[0][0].length, text: matches[0][0] };
}

function replaceSpans(source, candidateSpans, replacementSpans) {
  let rebuilt = source;
  const indexes = candidateSpans.map((_, index) => index)
    .sort((left, right) => candidateSpans[right].start - candidateSpans[left].start);
  for (const index of indexes) {
    const span = candidateSpans[index];
    rebuilt = rebuilt.slice(0, span.start) + replacementSpans[index].text + rebuilt.slice(span.end);
  }
  return rebuilt;
}

function includes(source, token, label = token) {
  assert.ok(source.includes(token), `missing ${label}`);
}

// Candidate, staged, and committed point-in-time modes.
const head = git(['rev-parse', 'HEAD']).trim();
git(['cat-file', '-e', `${baseCommit}^{commit}`], { stdio: 'ignore' });
const committedPaths = head === baseCommit ? [] : gitLines(['diff', '--name-only', `${baseCommit}..${head}`]);
const workingPaths = statusPaths();
const stagedPaths = gitLines(['diff', '--cached', '--name-only']);
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'S2 path set must be exactly the three approved paths');

let mode = 'candidate';
let parentCommit = baseCommit;
if (head !== baseCommit) {
  mode = 'committed';
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  assert.equal(parents.length, 2, 'S2 must have exactly one parent');
  parentCommit = parents[1];
  assert.equal(parentCommit, baseCommit, "S2 parent must be replacement A6'");
  assert.deepEqual(committedPaths, allowedPaths, 'committed S2 path set');
  assert.deepEqual(workingPaths, [], 'committed S2 worktree must be clean');
  assert.deepEqual(stagedPaths, [], 'committed S2 index must be empty');
} else if (stagedPaths.length > 0) {
  mode = 'staged';
  assert.deepEqual(stagedPaths, allowedPaths, 'staged S2 path set');
  assert.deepEqual(gitLines(['diff', '--name-only']), [], 'staged S2 may not retain unstaged tracked changes');
} else {
  assert.deepEqual(stagedPaths, [], 'candidate S2 index must be empty');
}

const rust = read(rustPath);
const parentRust = git(['show', `${baseCommit}:${rustPath}`]);
const evidence = read(evidencePath);
const validator = read(validatorPath);

// Robust exact-three-span proof: restore the parent declarations into the candidate and require
// byte-for-byte equality of the complete Rust file.
const declarations = [
  {
    label: 'gate sealed',
    regex: /const R6_APPROVAL_GATE_SEALED: bool = (?:true|false);/g,
    parent: 'const R6_APPROVAL_GATE_SEALED: bool = false;',
    candidate: 'const R6_APPROVAL_GATE_SEALED: bool = true;',
  },
  {
    label: 'approval commit',
    regex: /const R6_APPROVAL_COMMIT: &str =\s*"[^"]*";/g,
    parent: 'const R6_APPROVAL_COMMIT: &str = "";',
    candidate: `const R6_APPROVAL_COMMIT: &str = "${expected.approvalCommit}";`,
  },
  {
    label: 'approval artifact hash',
    regex: /const R6_APPROVAL_ARTIFACT_HASH: &str =\s*"[^"]*";/g,
    parent: 'const R6_APPROVAL_ARTIFACT_HASH: &str = "";',
    candidate: `const R6_APPROVAL_ARTIFACT_HASH: &str =\n    "${expected.approvalHash}";`,
  },
];
const parentSpans = declarations.map((item) => oneSpan(parentRust, item.regex, `${item.label} parent`));
const candidateSpans = declarations.map((item) => oneSpan(rust, item.regex, `${item.label} candidate`));
for (let index = 0; index < declarations.length; index += 1) {
  assert.equal(parentSpans[index].text, declarations[index].parent, `${declarations[index].label} parent value`);
  assert.equal(candidateSpans[index].text, declarations[index].candidate, `${declarations[index].label} candidate value`);
  assert.notEqual(candidateSpans[index].text, parentSpans[index].text, `${declarations[index].label} must change`);
}
assert.equal(replaceSpans(rust, candidateSpans, parentSpans), parentRust,
  'every Rust byte outside the three constant declarations must equal replacement A6 prime');

const compiledTrustConstants = candidateSpans.map((span) => span.text).join('\n');
assert.equal(compiledTrustConstants.includes(expected.historicalApprovalCommit), false,
  'historical A6 commit forbidden from trust constants');
assert.equal(compiledTrustConstants.includes(expected.historicalApprovalHash), false,
  'historical A6 hash forbidden from trust constants');

// Replacement A6' canonical bytes are read from the immutable parent commit, not the working tree.
const a6Prime = git(['show', `${baseCommit}:${a6PrimePath}`]);
const beginToken = '<!-- r6-a6-prime-approval-core-begin -->';
const endToken = '<!-- r6-a6-prime-approval-core-end -->';
assert.equal(count(a6Prime, beginToken), 1, "A6' begin marker count");
assert.equal(count(a6Prime, endToken), 1, "A6' end marker count");
const beginMarker = `${beginToken}\n\`\`\`json\n`;
const endMarker = `\n\`\`\`\n${endToken}`;
const begin = a6Prime.indexOf(beginMarker);
const end = a6Prime.indexOf(endMarker, begin + beginMarker.length);
assert.ok(begin >= 0 && end > begin, "A6' canonical marker ordering");
const canonicalText = a6Prime.slice(begin + beginMarker.length, end);
assert.equal(canonicalText.includes('\n'), false, "A6' canonical JSON is one line");
const core = JSON.parse(canonicalText);
assert.deepEqual(core, {
  approvalArtifactIdentifier: expected.artifactIdentifier,
  ceremonyPolicyIdentifier: expected.ceremony,
  constrainedDescendantAuthorizationDescriptor: expected.descriptor,
  e6Commit: expected.e6Commit,
  expiryUtc: expected.expiryUtc,
  mintUtc: expected.mintUtc,
  schemaVersion: expected.schemaVersion,
}, "A6' exact seven-field canonical core");
assert.equal(Buffer.byteLength(canonicalText, 'utf8'), expected.canonicalBytes, "A6' canonical byte length");
const recomputedHash = 'sha256:' + createHash('sha256')
  .update(Buffer.from('h2o.r6.approval-core.v1\n', 'utf8'))
  .update(Buffer.from(canonicalText, 'utf8'))
  .digest('hex');
assert.equal(recomputedHash, expected.approvalHash, "A6' independent approval-core hash");
assert.ok(Date.now() + expected.clockSkewSeconds * 1000 < Date.parse(expected.expiryUtc),
  "A6' must remain unexpired under 120-second skew");

// All test bytes, including the state-independent TC test, remain identical.
const testStart = '#[cfg(test)]';
assert.equal(rust.slice(rust.indexOf(testStart)), parentRust.slice(parentRust.indexOf(testStart)),
  'all cfg(test) bytes must remain identical');
const tcStart = '    fn r6_synthetic_unsealed_gate_rejects_before_any_callback() {';
const tcEnd = '    #[test]\n    fn r6_historical_and_arbitrary_approvals_cannot_satisfy_gate() {';
const tcFunction = exactSlice(rust, tcStart, tcEnd, 'TC state-independent test');
assert.equal(tcFunction, exactSlice(parentRust, tcStart, tcEnd, 'parent TC state-independent test'),
  'TC test must remain byte-identical');
for (const token of [
  'dispatch_r6_execution_preflight_with_gate',
  'sealed: false',
  'Err("real-transport-r6-approval-gate-unsealed")',
  'assert_eq!(calls.get(), 0)',
]) includes(tcFunction, token, `TC test ${token}`);
for (const token of ['R6_APPROVAL_GATE_SEALED', 'R6_APPROVAL_COMMIT', 'R6_APPROVAL_ARTIFACT_HASH']) {
  assert.equal(tcFunction.includes(token), false, `TC test must not depend on compiled ${token}`);
}

const protectedRegions = [
  ['setup registry path selection', 'fn descriptor_registry_path_for_setup_status', 'fn descriptor_registry_path_source_for_setup'],
  ['write-grade registry source policy', 'fn write_grade_registry_source_candidate', 'fn write_grade_registry_ref_hash'],
  ['readiness result implementation', 'impl RtFirstWriteResult', '#[derive(Debug, Serialize, PartialEq, Eq)]\n#[serde(rename_all = "camelCase")]\npub struct RtWriteGradeReadOnlyProbeResult'],
  ['HTTP client and URL/request construction', 'impl ReqwestFirstWriteLiveClient', 'impl WriteGradeReadOnlyPropfindClient for ReqwestFirstWriteLiveClient'],
  ['live method adapter', 'impl FirstWriteLiveClient for ReqwestFirstWriteLiveClient', '#[derive(Default)]\nstruct DefaultFirstWriteLoopbackClient'],
  ['historical receipt validation', 'fn validate_write_grade_receipt', 'fn evaluate_first_write_with_client'],
  ['write-grade registry resolution', 'fn resolve_write_grade_live_registry', 'struct WriteGradeReadOnlyRegistryParity'],
  ['consumed marker implementation', 'fn first_write_consumed_marker_path', 'fn evaluate_first_write_with_client'],
  ['live four-request state machine', 'fn evaluate_first_write_live_with_client', 'fn evaluate_first_write('],
  ['Tauri command surface', '#[tauri::command]\npub fn h2o_rt_capability_probe', '#[cfg(test)]'],
];
for (const [label, start, endMarkerValue] of protectedRegions) {
  assert.equal(exactSlice(rust, start, endMarkerValue, label),
    exactSlice(parentRust, start, endMarkerValue, `${label} parent`), `protected region changed: ${label}`);
}

const denylist = exactSlice(rust, 'const R6_R4_BURNED_RECEIPT_CORE_HASH', 'const R6_MAX_VALIDITY_SECONDS', 'R4/R5 denylist');
assert.equal(denylist, exactSlice(parentRust, 'const R6_R4_BURNED_RECEIPT_CORE_HASH', 'const R6_MAX_VALIDITY_SECONDS', 'parent R4/R5 denylist'),
  'R4/R5 denylist bytes and ordering');
for (const hash of [expected.r4Hash, expected.r5Hash]) includes(denylist, hash, `burned hash ${hash}`);
assert.ok(denylist.indexOf(expected.r4Hash) < denylist.indexOf(expected.r5Hash), 'R4/R5 denylist ordering');

const parser = exactSlice(rust, 'fn parse_r6_receipt_for_execution', 'fn parse_r6_approval_core', 'R6 execution parser');
assert.ok(parser.indexOf('R6_BURNED_RECEIPT_CORE_HASHES.contains') < parser.indexOf('parse_duplicate_safe_json'),
  'burned denial remains before parsing');
const stateMachine = exactSlice(rust, 'fn evaluate_first_write_live_with_client', 'fn evaluate_first_write(', 'live state machine');
assert.ok(stateMachine.indexOf('write_first_write_apply_intent_marker') < stateMachine.indexOf('client.propfind_absence'),
  'consumed marker remains before first network call');

for (const protectedPath of [
  'apps/studio/desktop/src-tauri/Cargo.toml',
  'apps/studio/desktop/src-tauri/tauri.conf.json',
  'apps/studio/desktop/src-tauri/build.rs',
  'apps/studio/desktop/src-tauri/src/lib.rs',
  'apps/studio/desktop/src-tauri/src/bin/h2o-rt-write-grade-read-only-probe.rs',
  'apps/studio/desktop/src-tauri/capabilities',
  'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js',
]) execFileSync('git', ['diff', '--quiet', baseCommit, '--', protectedPath], { cwd: root });

// Evidence assertions and secret-safe changed-artifact check.
for (const token of [
  `S2 parent / replacement A6' commit: \`${baseCommit}\``,
  expected.approvalHash,
  `a6PrimeMintUtc: \`${expected.mintUtc}\``,
  `a6PrimeExpiryUtc: \`${expected.expiryUtc}\``,
  'remainingSecondsAfterSkewAtGeneration: `171374`',
  'approvalGateSealed: `true`',
  `compiledApprovalCommit: \`${expected.approvalCommit}\``,
  'rustBytesOutsideThreeAssignmentsIdentical: `true`',
  'testBytesChanged: `false`',
  'canonicalMarkerPairs: `1`',
  'canonicalFieldCount: `7`',
  'canonicalByteLength: `412`',
  'independentlyRecomputedHashMatchesCompiledHash: `true`',
  'tcTestStateIndependent: `true`',
  'tcTestByteIdenticalToA6Prime: `true`',
  'protectedRegionsCompared: `10`',
  'protectedRegionsByteIdentical: `true`',
  'r4R5DenylistByteIdentical: `true`',
  'markerBeforeFirstNetworkCall: `true`',
  'completeR6Tests: `14 passed, 0 failed`',
  'completeRealTransportTests: `44 passed, 0 failed`',
  'fullLibraryTests: `196 passed, 0 failed`',
  'networkRequestPerformed: `false`',
  'receiptMinted: `false`',
  'oneShotTokenGenerated: `false`',
  'killSwitchTokenGenerated: `false`',
  'consumedMarkerCreated: `false`',
  'invocationCommandCreated: `false`',
  'liveInvocationAuthorized: `false`',
  'productSyncReady: `false`',
  'transportReady: `false`',
  'No receipt or token may be minted until V6 exists and is',
]) includes(evidence, token, `evidence ${token}`);

const generatedMatch = evidence.match(/s2EvidenceGeneratedUtc: `([^`]+)`/);
assert.ok(generatedMatch, 'evidence generation UTC');
assert.ok(Date.parse(generatedMatch[1]) + expected.clockSkewSeconds * 1000 < Date.parse(expected.expiryUtc),
  'evidence generated before skew-adjusted expiry');
assert.equal(evidence.includes('http://'), false, 'evidence contains no raw HTTP endpoint');
assert.equal(evidence.includes('https://'), false, 'evidence contains no raw HTTPS endpoint');
for (const pattern of [
  /\bAuthorization\s*:/i,
  /\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/i,
  /\b(?:password|credentialSecret)\s*[:=]/i,
  /privateRegistryContents|responseBody|remoteListing/i,
  /oneShotTokenRaw|killSwitchTokenRaw/i,
]) assert.equal(pattern.test(evidence), false, `evidence contains prohibited private material: ${pattern}`);

// The validator itself is offline-only by import allow-list.
for (const line of validator.split('\n').filter((value) => /^\s*import\s/.test(value))) {
  const match = line.match(/from\s+'([^']+)'/);
  assert.ok(match, `unparseable import: ${line}`);
  assert.ok(['node:assert/strict', 'node:crypto', 'node:child_process', 'node:fs', 'node:path', 'node:process'].includes(match[1]),
    `non-offline import: ${match[1]}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-r6-s2-a6-prime-approval-gate-seal',
  mode,
  head,
  parentCommit,
  candidatePaths,
  approvalGateSealed: true,
  compiledApprovalCommit: expected.approvalCommit,
  compiledApprovalArtifactHash: expected.approvalHash,
  historicalA6InTrustConstants: false,
  independentlyRecomputedA6PrimeHash: recomputedHash,
  exactProductionConstantChanges: declarations.length,
  testBytesChanged: false,
  tcTestStateIndependent: true,
  protectedRegionsCompared: protectedRegions.length,
  protectedRegionsByteIdentical: true,
  r4R5DenylistByteIdentical: true,
  markerBeforeFirstNetworkCall: true,
  networkRequestPerformed: false,
  receiptMinted: false,
  tokenGenerated: false,
  consumedMarkerCreated: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
console.log('PASS validate-real-transport-r6-s2-a6-prime-approval-gate-seal');
