#!/usr/bin/env node
// R6-S1 strict receipt schema and protected-runtime validator.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = '6cb091c75c49191f2e8e751847c347d11b3fa0a6';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const evidencePath = 'release-evidence/2026-07-13/real-transport-r6-s1-versioned-receipt-schema.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-r6-s1-versioned-receipt-schema.mjs';
const allowedPaths = [rustPath, evidencePath, validatorPath].sort();

const r4CorePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r4-write-grade-receipt-core.json';
const r5CorePath = 'release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt-core.json';
const r4Hash = 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183';
const r5Hash = 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57';

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function read(rel) {
  const absolute = path.join(root, rel);
  assert.ok(fs.existsSync(absolute), `missing ${rel}`);
  return fs.readFileSync(absolute, 'utf8');
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function sha256Ref(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function statusPaths() {
  const entries = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const state = entry.slice(0, 2);
    assert.ok(!/[RC]/.test(state), 'renames and copies are outside S1 scope');
    paths.push(entry.slice(3));
  }
  return paths.sort();
}

function exactSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: missing start marker`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: missing end marker`);
  return source.slice(start, end);
}

function mustContain(source, value, label = value) {
  assert.ok(source.includes(value), `missing ${label}`);
}

const head = git(['rev-parse', 'HEAD']).trim();
git(['cat-file', '-e', `${baseCommit}^{commit}`], { stdio: 'ignore' });
const committedPaths = head === baseCommit
  ? []
  : git(['diff', '--name-only', `${baseCommit}..${head}`]).trim().split('\n').filter(Boolean).sort();
const workingPaths = statusPaths();
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'S1 candidate path set');

let mode = 'candidate';
let parentCommit = baseCommit;
if (head !== baseCommit) {
  mode = 'committed';
  parentCommit = git(['rev-parse', 'HEAD^']).trim();
  assert.equal(parentCommit, baseCommit, 'S1 must be a direct child of E6');
  assert.deepEqual(committedPaths, allowedPaths, 'committed S1 path set');
  assert.deepEqual(workingPaths, [], 'committed S1 worktree must be clean');
}

const rust = read(rustPath);
const baselineRust = git(['show', `${baseCommit}:${rustPath}`]);
const evidence = read(evidencePath);

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
  assert.equal(
    exactSlice(rust, start, end, label),
    exactSlice(baselineRust, start, end, `${label} baseline`),
    `protected region changed: ${label}`,
  );
}

const protectedExternalPaths = [
  'apps/studio/desktop/src-tauri/Cargo.toml',
  'apps/studio/desktop/src-tauri/tauri.conf.json',
  'apps/studio/desktop/src-tauri/build.rs',
  'apps/studio/desktop/src-tauri/src/lib.rs',
  'apps/studio/desktop/src-tauri/src/bin/h2o-rt-write-grade-read-only-probe.rs',
  'apps/studio/desktop/src-tauri/capabilities',
  'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js',
];
for (const protectedPath of protectedExternalPaths) {
  execFileSync('git', ['diff', '--quiet', baseCommit, '--', protectedPath], { cwd: root });
}

const typeBlock = exactSlice(rust, 'pub struct R6WriteGradeReceipt', '#[derive(Debug, Serialize, PartialEq, Eq)]\n#[serde(rename_all = "camelCase")]\npub struct RtFirstWriteMethodStatus', 'R6 type block');
const structNames = [...typeBlock.matchAll(/pub struct (R6[A-Za-z0-9_]+)/g)].map((match) => match[1]);
const deniedStructNames = [...rust.matchAll(/#\[serde\([^\]]*deny_unknown_fields[^\]]*\)\]\npub struct (R6[A-Za-z0-9_]+)/g)]
  .map((match) => match[1]);
assert.ok(structNames.length >= 14, 'expected complete nested R6 structure set');
assert.deepEqual([...deniedStructNames].sort(), [...structNames].sort(), 'every R6 struct must deny unknown fields');
assert.equal(typeBlock.includes('Option<'), false, 'R6 security types may not contain optional fields');
assert.equal(typeBlock.includes('#[serde(default)]'), false, 'R6 security types may not default fields');

for (const token of [
  'const R6_RECEIPT_SCHEMA_VERSION: &str = "h2o.r6.write-grade-receipt.v1";',
  'b"h2o.r6.write-grade-receipt-core.v1\\n"',
  'b"h2o.r6.approval-core.v1\\n"',
  'const R6_APPROVAL_GATE_SEALED: bool = false;',
  'const R6_APPROVAL_COMMIT: &str = "";',
  'const R6_APPROVAL_ARTIFACT_HASH: &str = "";',
  r4Hash,
  r5Hash,
  'struct DuplicateRejectingJson',
  'duplicate JSON object key refused',
  'parse_r6_receipt_for_execution',
  'real-transport-r6-historical-receipt-refused',
  'real-transport-r6-burned-receipt-denied',
  'r6_duplicate_keys_are_rejected_at_top_level_and_nested_even_when_identical',
  'every_r6_required_field_is_strict_and_every_leaf_affects_hash_or_validity',
  'r6_s1_unsealed_gate_rejects_before_any_post_preflight_callback',
  'r6_burned_r4_and_r5_hashes_are_denied_before_schema_or_callback',
  'existing_consumed_marker_remains_before_first_live_network_call',
]) mustContain(rust, token);

const approvalGate = exactSlice(rust, 'fn validate_r6_approval_gate', 'fn validate_r6_runtime_and_lineage', 'R6 approval gate');
mustContain(approvalGate, 'W34B1_OPERATOR_APPROVAL_COMMIT');
mustContain(approvalGate, 'W34B1_R2_RENEWED_OPERATOR_APPROVAL_COMMIT');
mustContain(approvalGate, 'real-transport-r6-historical-approval-refused');

const dispatch = exactSlice(rust, 'fn dispatch_r6_execution_preflight_with_gate', '#[allow(dead_code)]', 'R6 dispatch');
const parseIndex = dispatch.indexOf('parse_r6_receipt_for_execution');
const approvalIndex = dispatch.indexOf('validate_r6_approval_gate');
const tokenIndex = dispatch.indexOf('validate_r6_private_commitments');
const callbackIndex = dispatch.indexOf('Ok(after_all_preflight');
assert.ok(parseIndex >= 0 && parseIndex < approvalIndex && approvalIndex < tokenIndex && tokenIndex < callbackIndex,
  'schema, approval, token, and post-preflight ordering');
for (const forbidden of [
  'write_first_write_apply_intent_marker', 'ReqwestFirstWriteLiveClient',
  'propfind_absence', 'put_create_first', 'put_create_second', 'get_readback',
]) assert.equal(dispatch.includes(forbidden), false, `R6 pre-dispatch contains ${forbidden}`);

const liveStateMachine = exactSlice(rust, 'fn evaluate_first_write_live_with_client', 'fn evaluate_first_write(', 'live state machine');
assert.ok(liveStateMachine.indexOf('write_first_write_apply_intent_marker') < liveStateMachine.indexOf('client.propfind_absence'),
  'consumed marker must remain before first network call');

const r4CanonicalBytes = Buffer.from(JSON.stringify(sorted(JSON.parse(read(r4CorePath)))), 'utf8');
const r5CanonicalBytes = Buffer.from(JSON.stringify(sorted(JSON.parse(read(r5CorePath)))), 'utf8');
assert.equal(sha256Ref(r4CanonicalBytes), r4Hash, 'R4 immutable core hash');
assert.equal(sha256Ref(r5CanonicalBytes), r5Hash, 'R5 immutable core hash');

for (const token of [
  `e6Parent: \`${baseCommit}\``,
  'schemaVersion: `h2o.r6.write-grade-receipt.v1`',
  'R6_APPROVAL_GATE_SEALED:false',
  'historicalApprovalDb4AcceptedForR6:false',
  'historicalApproval714AcceptedForR6:false',
  `r4ReceiptCoreHash: \`${r4Hash}\``,
  `r5ReceiptCoreHash: \`${r5Hash}\``,
  'protectedRegionsCompared:10',
  'protectedRegionsByteIdentical:true',
  'targetedR6RustTests:12 passed, 0 failed',
  'realTransportRustTests:42 passed, 0 failed',
  'networkRequestPerformed:false',
  'approvalArtifactCreated:false',
  'receiptMinted:false',
  'oneShotTokenGenerated:false',
  'killSwitchTokenGenerated:false',
  'consumedMarkerCreated:false',
  'productSyncReady:false',
  'transportReady:false',
  'S1 authorizes nothing',
]) mustContain(evidence, token, `evidence ${token}`);

const rustDiff = git(['diff', '--unified=0', baseCommit, '--', rustPath]);
const addedRust = rustDiff.split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1)).join('\n');
for (const [pattern, label] of [
  [/https?:\/\//i, 'raw endpoint'],
  [/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/i, 'authorization material'],
  [/endpointUrlPrivate|remoteRootPathPrivate|authHeaderPrivate/i, 'private registry field'],
  [/\b(?:password|credentialSecret)\s*[:=]/i, 'credential material'],
  [/privateRegistryContents|responseBody|remoteListing/i, 'private content field'],
]) {
  assert.equal(pattern.test(addedRust), false, `added Rust contains ${label}`);
  assert.equal(pattern.test(evidence), false, `evidence contains ${label}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-r6-s1-versioned-receipt-schema',
  mode,
  head,
  parentCommit,
  candidatePaths,
  schemaVersion: 'h2o.r6.write-grade-receipt.v1',
  r6StructCount: structNames.length,
  duplicateKeyRejection: true,
  approvalGateSealed: false,
  burnedReceiptCoreHashes: [r4Hash, r5Hash],
  protectedRegionsCompared: protectedRegions.length,
  protectedRegionsByteIdentical: true,
  markerBeforeFirstNetworkCall: true,
  networkRequestPerformed: false,
  receiptMinted: false,
  tokensGenerated: false,
  consumedMarkerCreated: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
