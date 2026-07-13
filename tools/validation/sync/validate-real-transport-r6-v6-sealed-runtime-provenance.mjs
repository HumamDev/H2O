#!/usr/bin/env node
// R6-V6 point-in-time validator for the exact sealed S2 runtime provenance proof.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = '1bff833675fab8e88652697a895555a595bc2a3b';
const evidencePath = 'release-evidence/2026-07-13/real-transport-r6-v6-sealed-runtime-provenance.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-r6-v6-sealed-runtime-provenance.mjs';
const allowedPaths = [evidencePath, validatorPath].sort();
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const a6PrimePath = 'release-evidence/2026-07-13/real-transport-r6-a6-prime-approval.md';
const e6Path = 'release-evidence/2026-07-13/real-transport-w3-5d-r2-authenticated-read-only-propfind-207.md';
const freshTarget = '/private/tmp/h2o-v6-target-20260713T183528Z';
const desktopPath = `${freshTarget}/debug/h2o-studio-desktop`;
const probePath = `${freshTarget}/debug/h2o-rt-write-grade-read-only-probe`;
const retainedCapturePath = '/private/tmp/h2o-v6-provenance-20260713T183528Z.json';

const expected = {
  a6PrimeCommit: 'b2de60b88aa750897948e504e6458d943bf83f3b',
  a6PrimeHash: 'sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13',
  a6PrimeMintUtc: '2026-07-13T17:10:31Z',
  a6PrimeExpiryUtc: '2026-07-15T17:10:31Z',
  historicalA6Commit: '892d88769c7897a9efe23e63aa2fb5a091ecaa64',
  historicalA6Hash: 'sha256:ead9927bcb249c2efcdff267c922aaa5b2deb1b6e4b6bb717e5524d34669095e',
  e6Commit: '6cb091c75c49191f2e8e751847c347d11b3fa0a6',
  e6EvidenceHash: '049f19915ea16c6bee606813de59cfc14ee6396f6ade4c35d802be52ae44a134',
  e6RuntimeHash: '181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6',
  desktopSize: 57424512,
  desktopHash: '1675ce96ec1902bdce753ab3e53361ec2ec7fc8982d437edc79a23cfed885d8b',
  probeSize: 15643808,
  probeHash: '8e2e5be03d5a260d91f41e00700651656f28247a2c248114e80e59f02a25db7f',
  staleHash: '4d0cac4cf0fbe918c0ee3d44e27598dda1d67aafb85b9a6acb56fa7d3064dbbc',
  provenanceSize: 1283,
  provenanceHash: 'sha256:6e94ae5c520e2c3c1e751073908db9a3b240369b1736c710763f0842bd2766a5',
};

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function read(rel) {
  const absolute = path.join(root, rel);
  assert.ok(fs.existsSync(absolute), `missing ${rel}`);
  return fs.readFileSync(absolute);
}

function gitLines(args) {
  return git(args).trim().split('\n').filter(Boolean).sort();
}

function statusPaths() {
  return git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      assert.equal(/[RC]/.test(entry.slice(0, 2)), false, 'rename/copy outside V6 scope');
      return entry.slice(3);
    })
    .sort();
}

function count(source, token) {
  return source.split(token).length - 1;
}

function extractDelimitedBytes(bytes, beginToken, endToken, label) {
  const beginMarker = Buffer.from(`${beginToken}\n`, 'utf8');
  const endMarker = Buffer.from(endToken, 'utf8');
  assert.equal(count(bytes.toString('utf8'), beginToken), 1, `${label}: one begin marker`);
  assert.equal(count(bytes.toString('utf8'), endToken), 1, `${label}: one end marker`);
  const begin = bytes.indexOf(beginMarker);
  assert.ok(begin >= 0, `${label}: begin marker`);
  const start = begin + beginMarker.length;
  const end = bytes.indexOf(endMarker, start);
  assert.ok(end > start, `${label}: end marker after begin`);
  return bytes.subarray(start, end);
}

function exactSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: missing start marker`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: missing end marker`);
  return source.slice(start, end);
}

// Candidate, staged, and committed scope.
const head = git(['rev-parse', 'HEAD']).trim();
git(['cat-file', '-e', `${baseCommit}^{commit}`], { stdio: 'ignore' });
const committedPaths = head === baseCommit ? [] : gitLines(['diff', '--name-only', `${baseCommit}..${head}`]);
const workingPaths = statusPaths();
const stagedPaths = gitLines(['diff', '--cached', '--name-only']);
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'V6 changes exactly its evidence and validator');

let mode = 'candidate';
let parentCommit = baseCommit;
if (head !== baseCommit) {
  mode = 'committed';
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  assert.equal(parents.length, 2, 'V6 must have one parent');
  parentCommit = parents[1];
  assert.equal(parentCommit, baseCommit, 'V6 parent must be exact S2');
  assert.deepEqual(committedPaths, allowedPaths, 'committed V6 path set');
  assert.deepEqual(workingPaths, [], 'committed V6 worktree must be clean');
  assert.deepEqual(stagedPaths, [], 'committed V6 index must be empty');
} else if (stagedPaths.length > 0) {
  mode = 'staged';
  assert.deepEqual(stagedPaths, allowedPaths, 'staged V6 path set');
  assert.deepEqual(gitLines(['diff', '--name-only']), [], 'staged V6 has no unstaged tracked change');
} else {
  assert.deepEqual(stagedPaths, [], 'candidate V6 index must be empty');
}

for (const changedPath of candidatePaths) {
  assert.equal(changedPath.startsWith('apps/'), false, `runtime application path changed: ${changedPath}`);
  assert.equal(changedPath.startsWith('src-runtime-base/'), false, `runtime path changed: ${changedPath}`);
  assert.equal(changedPath.startsWith('src-surfaces-base/'), false, `UI path changed: ${changedPath}`);
}

const evidenceBytes = read(evidencePath);
const evidence = evidenceBytes.toString('utf8');

// Structured manifest.
const manifestPrefix = '<!-- r6-v6-manifest-begin -->\n```json\n';
const manifestSuffix = '\n```\n<!-- r6-v6-manifest-end -->';
assert.equal(count(evidence, '<!-- r6-v6-manifest-begin -->'), 1, 'one manifest begin marker');
assert.equal(count(evidence, '<!-- r6-v6-manifest-end -->'), 1, 'one manifest end marker');
const manifestStart = evidence.indexOf(manifestPrefix);
const manifestEnd = evidence.indexOf(manifestSuffix, manifestStart + manifestPrefix.length);
assert.ok(manifestStart >= 0 && manifestEnd > manifestStart, 'structured manifest markers');
const manifestText = evidence.slice(manifestStart + manifestPrefix.length, manifestEnd);
assert.equal(manifestText.includes('\n'), false, 'manifest is one canonical line');
const manifest = JSON.parse(manifestText);
assert.equal(manifest.schema, 'h2o.studio.transport.r6-v6-sealed-runtime-provenance.v1');
assert.equal(manifest.runtimeTarget, baseCommit);
assert.equal(manifest.evidenceParent, baseCommit);
assert.equal(manifest.v6EvidenceCommitIsExecutableTarget, false);
assert.deepEqual(manifest.executables.desktop, { size: expected.desktopSize, sha256: expected.desktopHash });
assert.deepEqual(manifest.executables.probe, { size: expected.probeSize, sha256: expected.probeHash });
assert.equal(manifest.provenance.blockSize, expected.provenanceSize);
assert.equal(manifest.provenance.blockSha256, expected.provenanceHash);
assert.equal(manifest.provenance.buildGitSha, baseCommit);
assert.equal(manifest.provenance.buildDirty, false);
assert.equal(manifest.provenance.buildProfile, 'debug');
assert.equal(manifest.provenance.parentPropfindFixPresent, true);
assert.equal(manifest.provenance.r5aBindingFixPresent, true);
assert.equal(manifest.provenance.stopReason, 'real-transport-w3-write-grade-registry-missing');
assert.deepEqual(manifest.provenance.methodAttempts,
  { DELETE: 0, GET: 0, OPTIONS: 0, PROPFIND: 0, PUT: 0, other: 0 });
assert.equal(manifest.provenance.networkAttempted, false);

// Exact retained stdout bytes: marker count, byte identity, hash, and typed fields.
const provenanceBytes = extractDelimitedBytes(
  evidenceBytes,
  '<!-- r6-v6-provenance-output-begin -->',
  '<!-- r6-v6-provenance-output-end -->',
  'V6 provenance output',
);
const retainedBytes = fs.readFileSync(retainedCapturePath);
assert.equal((fs.statSync(retainedCapturePath).mode & 0o777), 0o600, 'retained capture mode 0600');
assert.deepEqual(provenanceBytes, retainedBytes, 'embedded provenance bytes equal retained capture exactly');
assert.equal(provenanceBytes.length, expected.provenanceSize, 'provenance byte length');
assert.equal(`sha256:${sha256(provenanceBytes)}`, expected.provenanceHash, 'provenance byte hash');
const provenance = JSON.parse(provenanceBytes.toString('utf8'));
assert.equal(provenance.buildGitSha, baseCommit);
assert.equal(provenance.buildDirty, false);
assert.equal(provenance.buildProfile, 'debug');
assert.equal(provenance.parentPropfindFixPresent, true);
assert.equal(provenance.r5aBindingFixPresent, true);
assert.equal(provenance.reason, 'real-transport-w3-write-grade-registry-missing');
assert.deepEqual(provenance.methodStatuses, []);
assert.equal(provenance.networkAttempted, false);
for (const field of [
  'receiptConsumed', 'consumedMarkerCreated', 'writesWebdav', 'writesCloud', 'writesRelay',
  'writesCas', 'writesFiles', 'productSyncReady', 'transportReady', 'rawPrivateFieldsLogged',
]) assert.equal(provenance[field], false, field);

// Retained build artifacts.
const targetStat = fs.statSync(freshTarget);
assert.equal(targetStat.isDirectory(), true, 'fresh target exists');
assert.equal(targetStat.mode & 0o777, 0o700, 'fresh target mode 0700');
if (process.getuid) assert.equal(targetStat.uid, process.getuid(), 'fresh target current-user ownership');
for (const [file, size, hash, label] of [
  [desktopPath, expected.desktopSize, expected.desktopHash, 'Desktop'],
  [probePath, expected.probeSize, expected.probeHash, 'probe'],
]) {
  const stat = fs.statSync(file);
  assert.equal(stat.isFile(), true, `${label} executable exists`);
  assert.equal(stat.size, size, `${label} executable size`);
  const digest = sha256(fs.readFileSync(file));
  assert.equal(digest, hash, `${label} executable hash`);
  assert.notEqual(digest, expected.staleHash, `${label} is not rejected stale executable`);
}
assert.equal(manifest.staleBuild.sha256, expected.staleHash);
assert.equal(manifest.staleBuild.embeddedGitSha, expected.e6Commit);
assert.equal(manifest.staleBuild.buildDirty, true);
assert.equal(manifest.staleBuild.permanentlyRejected, true);

// Exact sealed A6' trust and independent canonical hash.
const s2Rust = git(['show', `${baseCommit}:${rustPath}`]);
for (const token of [
  'const R6_APPROVAL_GATE_SEALED: bool = true;',
  `const R6_APPROVAL_COMMIT: &str = "${expected.a6PrimeCommit}";`,
  expected.a6PrimeHash,
]) assert.ok(s2Rust.includes(token), `sealed trust constant ${token}`);
const trustBlock = exactSlice(s2Rust, 'const R6_APPROVAL_GATE_SEALED', 'const R6_R4_BURNED_RECEIPT_CORE_HASH', 'trust constants');
assert.equal(trustBlock.includes(expected.historicalA6Commit), false, 'historical A6 commit absent from trust constants');
assert.equal(trustBlock.includes(expected.historicalA6Hash), false, 'historical A6 hash absent from trust constants');

const a6Prime = git(['show', `${expected.a6PrimeCommit}:${a6PrimePath}`]);
const a6Prefix = '<!-- r6-a6-prime-approval-core-begin -->\n```json\n';
const a6Suffix = '\n```\n<!-- r6-a6-prime-approval-core-end -->';
const a6Start = a6Prime.indexOf(a6Prefix);
const a6End = a6Prime.indexOf(a6Suffix, a6Start + a6Prefix.length);
assert.ok(a6Start >= 0 && a6End > a6Start, "A6' canonical block");
const a6Bytes = Buffer.from(a6Prime.slice(a6Start + a6Prefix.length, a6End), 'utf8');
const a6Hash = `sha256:${sha256(Buffer.concat([Buffer.from('h2o.r6.approval-core.v1\n'), a6Bytes]))}`;
assert.equal(a6Hash, expected.a6PrimeHash, "A6' approval-core hash");
const a6Core = JSON.parse(a6Bytes.toString('utf8'));
assert.equal(a6Core.mintUtc, expected.a6PrimeMintUtc);
assert.equal(a6Core.expiryUtc, expected.a6PrimeExpiryUtc);
assert.ok(Date.now() + 120000 < Date.parse(expected.a6PrimeExpiryUtc), "A6' unexpired under skew");

// E6 ancestry, evidence bytes, runtime block, and protected region equivalence.
git(['merge-base', '--is-ancestor', expected.e6Commit, baseCommit], { stdio: 'ignore' });
const e6EvidenceBytes = git(['show', `${baseCommit}:${e6Path}`], { encoding: null });
assert.equal(sha256(e6EvidenceBytes), expected.e6EvidenceHash, 'E6 evidence hash');
const e6Begin = Buffer.from('<!-- exact-runtime-stdout-begin -->\n```json\n');
const e6End = Buffer.from('```\n<!-- exact-runtime-stdout-end -->');
const e6Start = e6EvidenceBytes.indexOf(e6Begin) + e6Begin.length;
const e6Stop = e6EvidenceBytes.indexOf(e6End, e6Start);
assert.ok(e6Start >= e6Begin.length && e6Stop > e6Start, 'E6 runtime block');
assert.equal(sha256(e6EvidenceBytes.subarray(e6Start, e6Stop)), expected.e6RuntimeHash, 'E6 runtime output hash');

const e6Rust = git(['show', `${expected.e6Commit}:${rustPath}`]);
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
for (const [label, start, end] of protectedRegions) {
  assert.equal(exactSlice(s2Rust, start, end, label), exactSlice(e6Rust, start, end, `${label} E6`),
    `E6 to S2 protected region changed: ${label}`);
}

const denylist = exactSlice(s2Rust, 'const R6_R4_BURNED_RECEIPT_CORE_HASH', 'const R6_MAX_VALIDITY_SECONDS', 'R4/R5 denylist');
const r4Hash = 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183';
const r5Hash = 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57';
assert.ok(denylist.indexOf(r4Hash) >= 0 && denylist.indexOf(r4Hash) < denylist.indexOf(r5Hash), 'R4/R5 denylist and order');
const parser = exactSlice(s2Rust, 'fn parse_r6_receipt_for_execution', 'fn parse_r6_approval_core', 'R6 parser');
assert.ok(parser.indexOf('R6_BURNED_RECEIPT_CORE_HASHES.contains') < parser.indexOf('parse_duplicate_safe_json'),
  'burned receipt denial remains before parsing');
const liveStateMachine = exactSlice(s2Rust, 'fn evaluate_first_write_live_with_client', 'fn evaluate_first_write(', 'live state machine');
assert.ok(liveStateMachine.indexOf('write_first_write_apply_intent_marker') < liveStateMachine.indexOf('client.propfind_absence'),
  'marker remains before first network call');

// Evidence-only private-material scan. Allow only the explicitly approved fresh build target path.
const scanText = evidence.replaceAll(freshTarget, '<approved-fresh-target>');
for (const [pattern, label] of [
  [/https?:\/\//i, 'endpoint URL'],
  [/\/(?:Users|private\/var\/folders)\//, 'private filesystem path'],
  [/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/i, 'authorization material'],
  [/endpointUrlPrivate|remoteRootPathPrivate|authHeaderPrivate/i, 'private registry field'],
  [/\b(?:username|password|oneShotToken|killSwitchToken)\s*[:=]/i, 'private identity/token value'],
  [/privateRegistryContents|responseBody|remoteListing/i, 'private registry/response content'],
  [/\.h2o-w3-sacrificial-probe/i, 'raw object path'],
]) assert.equal(pattern.test(scanText), false, `evidence contains ${label}`);

for (const field of [
  'networkRequestPerformed', 'receiptMinted', 'tokenGenerated', 'consumedMarkerCreated',
  'invocationCreated', 'remoteWritePerformed', 'cleanupPerformed', 'productSyncReady',
  'transportReady', 'v6AuthorizesLiveInvocation',
]) assert.equal(manifest.safety[field], false, `safety ${field}`);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-r6-v6-sealed-runtime-provenance',
  mode,
  head,
  parentCommit,
  candidatePaths,
  runtimeTarget: baseCommit,
  provenanceBytes: provenanceBytes.length,
  provenanceSha256: expected.provenanceHash,
  desktopSha256: expected.desktopHash,
  probeSha256: expected.probeHash,
  buildGitSha: provenance.buildGitSha,
  buildDirty: provenance.buildDirty,
  buildProfile: provenance.buildProfile,
  methodAttemptCount: provenance.methodStatuses.length,
  networkAttempted: provenance.networkAttempted,
  a6PrimeHash: a6Hash,
  protectedRegionsCompared: protectedRegions.length,
  protectedRegionsByteIdentical: true,
  runtimeSourceDelta: false,
  r4R5BurnedDenialUnchanged: true,
  markerBeforeFirstNetworkCall: true,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
console.log('PASS validate-real-transport-r6-v6-sealed-runtime-provenance');
