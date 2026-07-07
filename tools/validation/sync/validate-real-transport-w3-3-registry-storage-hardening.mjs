#!/usr/bin/env node
//
// W3.3B registry storage hardening validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-3-registry-storage-hardening.md';
const w33aEvidencePath = 'release-evidence/2026-07-07/real-transport-w3-3-write-grade-receipt-approval-gate-design.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const uiPath = 'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js';

const W33A_COMMIT = '671fdc1c855b345185e5ea257b206c0a07cdab36';
const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const W32_MOCK_COMMIT = '649849e7e48c7e5bc5924bc811d857f2435866ae';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function mustContain(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function mustNotContain(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const w33aEvidence = read(w33aEvidencePath);
const rust = read(rustPath);
const lib = read(libPath);
const ui = read(uiPath);
const productionRust = rust.split('#[cfg(test)]')[0] || rust;
const sourceSurface = `${productionRust}\n${lib}\n${ui}`;

for (const token of [
  W33A_COMMIT,
  W31_CLOSEOUT_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W32_MOCK_COMMIT,
]) {
  mustContain(evidence, token, `evidence anchor ${token}`);
}
mustContain(w33aEvidence, 'F1 - Current live descriptor registry is not write-grade safe', 'W3.3A F1 anchor');

for (const token of [
  'APP_LOCAL_DESCRIPTOR_REGISTRY_FILE_NAME',
  'app_local_descriptor_registry_file',
  'env_descriptor_registry_path_info',
  'legacy_default_descriptor_registry_file',
  'descriptor_registry_path_for_setup_write',
  'descriptor_registry_path_for_setup_status',
  'descriptor_registry_path_for_probe',
  '"app-local"',
  '"env"',
  '"default-private-legacy"',
  '"invalid"',
  'write_grade_registry_eligible',
  'registry_file_owner_current_user',
  'registry_file_private_permissions',
  'registry_parent_owner_current_user',
  'registry_parent_private_permissions',
  'write_grade_registry_source_candidate',
  'owner_is_current_user',
  'file_has_private_permissions',
  'parent_has_private_permissions',
  'current_effective_user_id',
  '0o600',
  '0o700',
  '0o077',
  '0o022',
  'real-transport-webdav-registry-legacy-not-write-grade',
  'previous_auth_header_private_for_setup',
]) {
  mustContain(rust, token, `rust storage token ${token}`);
}

for (const token of [
  'write-grade registry eligible',
  'registry file owner',
  'registry file private',
  'registry parent owner',
  'registry parent private',
  'result && result.writeGradeRegistryEligible',
  'result && result.registryFileOwnerCurrentUser',
  'result && result.registryFilePrivatePermissions',
  'result && result.registryParentOwnerCurrentUser',
  'result && result.registryParentPrivatePermissions',
]) {
  mustContain(ui, token, `UI redacted storage token ${token}`);
}

for (const token of [
  'Verdict: W3.3B IMPLEMENTS LOCAL REGISTRY STORAGE HARDENING ONLY. NO WRITE AUTHORIZATION.',
  'W3.3A recorded F1',
  'under `/private/tmp` is not acceptable',
  '`app-local`',
  '`env`',
  '`default-private-legacy`',
  '`invalid`',
  '`default-private-legacy` is not write-grade eligible',
  '`invalid` is not write-grade eligible',
  'Write-grade eligibility rule',
  '`app-local` may be eligible only when owner and permission checks pass',
  '`env` may be eligible only when explicitly approved as invocation-local',
  'owner and permission checks pass',
  'writeGradeRegistryEligible',
  'registryFileOwnerCurrentUser',
  'registryFilePrivatePermissions',
  'registryParentOwnerCurrentUser',
  'registryParentPrivatePermissions',
  'owner-only read/write permissions',
  'must not be silently inherited into any future write-grade execution',
  'W3.3C canonical hash split',
  'W3.3B does not authorize writes',
  'no live WebDAV probe was performed in this phase',
  'no WebDAV/cloud/relay/CAS/file write occurred',
  'no forbidden WebDAV method was used',
  'no write-grade receipt was minted',
  '`h2o_rt_first_write` remains absent / not implemented in this phase',
  'no write command was added',
  '`productSyncReady:false`',
  '`transportReady:false`',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'h2o_rt_first_write',
  'first_write',
]) {
  mustNotContain(sourceSurface, token, `source command ${token}`);
}

for (const token of [
  'pub fn h2o_rt_first_write',
  'tauri::command] pub fn first_write',
  'product_sync_ready: true',
  'transport_ready: true',
  'writes_webdav: true',
  'enqueues_relay: true',
  'full_bundle_v3_started: true',
  'mints_export_id: true',
  'burns_sequence: true',
  'reqwest::Method::PUT',
  'reqwest::Method::DELETE',
  'reqwest::Method::POST',
  'reqwest::Method::from_bytes(b"PUT")',
]) {
  mustNotContain(productionRust, token, `production Rust forbidden ${token}`);
}

for (const token of [
  'productSyncReady:true',
  'transportReady:true',
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
]) {
  mustNotContain(ui, token, `UI forbidden ${token}`);
  mustNotContain(evidence, token, `evidence forbidden ${token}`);
}

assert.ok(
  /source:\s*"default-private-legacy"[\s\S]*?write_grade_registry_eligible\s*=\s*write_grade_registry_source_candidate/.test(rust),
  'rust: legacy source must feed write-grade eligibility calculation',
);
assert.ok(
  /matches!\(source,\s*"app-local"\s*\|\s*"env"\)/.test(rust),
  'rust: only app-local and env can be write-grade source candidates',
);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-3-registry-storage-hardening',
  w33aCommit: W33A_COMMIT,
  pathSources: ['app-local', 'env', 'default-private-legacy', 'invalid'],
  legacyPrivateTmpWriteGradeEligible: false,
  ownerPermissionChecksRepresented: true,
  firstWriteCommandExists: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
