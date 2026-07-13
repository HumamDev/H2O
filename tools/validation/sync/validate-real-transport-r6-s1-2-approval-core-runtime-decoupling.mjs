#!/usr/bin/env node
// R6-S1.2 point-in-time approval-core/runtime decoupling validator.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = 'd892be30ea91034f6ff4e0db7004c591d4e2f330';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const evidencePath = 'release-evidence/2026-07-13/real-transport-r6-s1-2-approval-core-runtime-decoupling.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-r6-s1-2-approval-core-runtime-decoupling.mjs';
const allowedPaths = [rustPath, evidencePath, validatorPath].sort();
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

function statusPaths() {
  return git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      assert.equal(/[RC]/.test(entry.slice(0, 2)), false, 'rename/copy outside S1.2 scope');
      return entry.slice(3);
    })
    .sort();
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
assert.deepEqual(candidatePaths, allowedPaths, 'S1.2 candidate path set');

let mode = 'candidate';
let parentCommit = baseCommit;
if (head !== baseCommit) {
  mode = 'committed';
  parentCommit = git(['rev-parse', 'HEAD^']).trim();
  assert.equal(parentCommit, baseCommit, 'S1.2 must be a direct child of S1.1');
  assert.deepEqual(committedPaths, allowedPaths, 'committed S1.2 path set');
  assert.deepEqual(workingPaths, [], 'committed S1.2 worktree must be clean');
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

for (const protectedPath of [
  'apps/studio/desktop/src-tauri/Cargo.toml',
  'apps/studio/desktop/src-tauri/tauri.conf.json',
  'apps/studio/desktop/src-tauri/build.rs',
  'apps/studio/desktop/src-tauri/src/lib.rs',
  'apps/studio/desktop/src-tauri/src/bin/h2o-rt-write-grade-read-only-probe.rs',
  'apps/studio/desktop/src-tauri/capabilities',
  'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js',
]) execFileSync('git', ['diff', '--quiet', baseCommit, '--', protectedPath], { cwd: root });

const approvalCore = exactSlice(
  rust,
  '#[serde(rename_all = "camelCase", deny_unknown_fields)]\npub struct R6ApprovalCore',
  '#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]\n#[serde(rename_all = "camelCase", deny_unknown_fields)]\npub struct R6PrivateMaterialCommitments',
  'R6 approval core',
);
mustContain(approvalCore, 'deny_unknown_fields');
const approvalFields = [...approvalCore.matchAll(/pub ([a-z0-9_]+): String,/g)].map((match) => match[1]);
assert.deepEqual(approvalFields, [
  'schema_version',
  'approval_artifact_identifier',
  'mint_utc',
  'expiry_utc',
  'constrained_descendant_authorization_descriptor',
  'ceremony_policy_identifier',
  'e6_commit',
], 'corrected seven-field approval core');
assert.equal(approvalCore.includes('approved_final_runtime_commit'), false,
  'approval core must not bind future runtime commit');
assert.equal(approvalCore.includes('Option<'), false, 'approval core fields must be required');

const runtimeBinding = exactSlice(
  rust,
  'pub struct R6RuntimeBinding',
  '#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]\n#[serde(rename_all = "camelCase", deny_unknown_fields)]\npub struct R6ImplementationCommitments',
  'R6 runtime binding',
);
mustContain(runtimeBinding, 'pub approved_final_runtime_commit: String,');
assert.equal(runtimeBinding.includes('Option<'), false, 'runtime commit must remain required');

const approvalReconstruction = exactSlice(
  rust,
  'fn r6_approval_core_from_receipt',
  'fn is_sha256_ref_str',
  'approval-core reconstruction',
);
assert.equal(approvalReconstruction.includes('approved_final_runtime_commit'), false,
  'approval reconstruction must not add future runtime commit');
mustContain(approvalReconstruction, 'e6_commit: receipt.runtime.e6_commit.clone()');

const receiptHash = exactSlice(rust, 'fn r6_receipt_core_hash', 'fn r6_approval_core_hash', 'receipt hash');
mustContain(receiptHash, 'canonical_typed_json_bytes(receipt)');
mustContain(rust, 'pub runtime: R6RuntimeBinding,');

const runtimeValidation = exactSlice(
  rust,
  'fn validate_r6_runtime_and_lineage',
  'fn validate_r6_private_commitments',
  'runtime validation',
);
for (const token of [
  'runtime.approved_final_runtime_commit != context.approved_runtime_commit',
  'runtime.required_embedded_build_git_sha != context.embedded_build_git_sha',
  'runtime.required_embedded_build_git_sha != runtime.approved_final_runtime_commit',
  '!is_commit_sha(&runtime.approved_final_runtime_commit)',
]) mustContain(runtimeValidation, token);

const approvalGate = exactSlice(rust, 'fn validate_r6_approval_gate', 'fn validate_r6_runtime_and_lineage', 'approval gate');
mustContain(approvalGate, 'R6_DESCENDANT_AUTHORIZATION_DESCRIPTOR');
mustContain(approvalGate, 'r6_approval_core_from_receipt');

for (const token of [
  'b"h2o.r6.write-grade-receipt-core.v1\\n"',
  'b"h2o.r6.approval-core.v1\\n"',
  'const R6_APPROVAL_GATE_SEALED: bool = false;',
  'const R6_APPROVAL_COMMIT: &str = "";',
  'const R6_APPROVAL_ARTIFACT_HASH: &str = "";',
  r4Hash,
  r5Hash,
  'struct DuplicateRejectingJson',
  'floating-point JSON values are refused',
  'duplicate JSON object key refused',
  'fn parse_r6_approval_core',
  'r6_s1_2_approval_core_is_seven_field_strict_order_independent_and_hash_sensitive',
  'r6_s1_2_runtime_commit_is_decoupled_from_approval_hash_but_bound_by_receipt_and_runtime',
  'r6_s1_unsealed_gate_rejects_before_any_post_preflight_callback',
  'r6_burned_r4_and_r5_hashes_are_denied_before_schema_or_callback',
  'r6_historical_and_downgrade_receipts_are_refused',
]) mustContain(rust, token);

const parseReceipt = exactSlice(rust, 'fn parse_r6_receipt_for_execution', 'fn parse_r6_approval_core', 'receipt parser');
assert.ok(
  parseReceipt.indexOf('R6_BURNED_RECEIPT_CORE_HASHES.contains')
    < parseReceipt.indexOf('parse_duplicate_safe_json'),
  'burned receipt denial must remain before parsing',
);
const liveStateMachine = exactSlice(rust, 'fn evaluate_first_write_live_with_client', 'fn evaluate_first_write(', 'live state machine');
assert.ok(
  liveStateMachine.indexOf('write_first_write_apply_intent_marker')
    < liveStateMachine.indexOf('client.propfind_absence'),
  'consumed marker must remain before first network call',
);

for (const token of [
  `parentS11: \`${baseCommit}\``,
  'architectureVerdict: `C — REQUIRE S1.2 SCHEMA CORRECTION BEFORE A6`',
  'approvalCoreFieldCount:7',
  'approvedFinalRuntimeCommitInApprovalCore:false',
  'approvedFinalRuntimeCommitInRuntimeBinding:true',
  'runtimeCommitBoundByCompleteReceiptHash:true',
  'protectedRegionsCompared:10',
  'protectedRegionsByteIdentical:true',
  'R6_APPROVAL_GATE_SEALED:false',
  'r4BurnedDenialActive:true',
  'r5BurnedDenialActive:true',
  'networkRequestPerformed:false',
  'a6Created:false',
  'receiptMinted:false',
  'tokenGenerated:false',
  'consumedMarkerCreated:false',
  'productSyncReady:false',
  'transportReady:false',
  'S1.2 authorizes nothing',
]) mustContain(evidence, token, `evidence ${token}`);

const rustDiff = git(['diff', '--unified=0', baseCommit, '--', rustPath]);
const addedRust = rustDiff.split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n');
const changedText = [addedRust, evidence].join('\n');
for (const [pattern, label] of [
  [/https?:\/\//i, 'raw endpoint'],
  [/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/i, 'authorization material'],
  [/endpointUrlPrivate|remoteRootPathPrivate|authHeaderPrivate/i, 'private registry field'],
  [/\b(?:password|credentialSecret)\s*[:=]/i, 'credential material'],
  [/privateRegistryContents|responseBody|remoteListing/i, 'private content field'],
]) assert.equal(pattern.test(changedText), false, `S1.2 files contain ${label}`);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-r6-s1-2-approval-core-runtime-decoupling',
  mode,
  head,
  parentCommit,
  candidatePaths,
  approvalCoreFieldCount: approvalFields.length,
  approvalCoreIncludesRuntimeCommit: false,
  runtimeBindingIncludesRuntimeCommit: true,
  receiptCoreIncludesRuntimeBinding: true,
  approvalGateSealed: false,
  burnedReceiptCoreHashes: [r4Hash, r5Hash],
  protectedRegionsCompared: protectedRegions.length,
  protectedRegionsByteIdentical: true,
  markerBeforeFirstNetworkCall: true,
  networkRequestPerformed: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
