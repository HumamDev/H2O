#!/usr/bin/env node
//
// W3.3C write-grade registry hash boundary validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-07/real-transport-w3-3-write-grade-registry-hash-boundary.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const libPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const uiPath = 'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js';

const W33B_COMMIT = '388a952745ab7a21ba9556531eccf5c7e0ffe1ce';
const W33A_COMMIT = '671fdc1c855b345185e5ea257b206c0a07cdab36';
const W32_COMMIT = '649849e7e48c7e5bc5924bc811d857f2435866ae';
const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function mustContain(source, needle, label) {
  assert.ok(String(source).includes(needle), `${label}: missing ${needle}`);
}

function mustNotContain(source, needle, label) {
  assert.ok(!String(source).includes(needle), `${label}: forbidden ${needle}`);
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const rust = read(rustPath);
const lib = read(libPath);
const ui = read(uiPath);
const productionRust = rust.split('#[cfg(test)]')[0] || rust;
const sourceSurface = `${productionRust}\n${lib}\n${ui}`;

for (const token of [
  W33B_COMMIT,
  W33A_COMMIT,
  W32_COMMIT,
  W31_CLOSEOUT_COMMIT,
  W31_ALIGNMENT_COMMIT,
]) {
  mustContain(evidence, token, `evidence anchor ${token}`);
}

for (const token of [
  'WRITE_GRADE_REGISTRY_REF_SCHEMA',
  'h2o.studio.transport.write-grade-registry-public-ref.v1',
  'WRITE_GRADE_REGISTRY_HASH_BOUNDARY',
  'descriptor-refs-only-excludes-private-material',
  'write_grade_registry_ref_hash',
  'write_grade_registry_hash_boundary',
  'private_content_hash_available',
  'write_grade_registry_eligible',
  'registry_owner_ok',
  'registry_permission_ok',
  'endpointRefHash',
  'remoteRootRefHash',
  'credentialRefHash',
]) {
  mustContain(rust, token, `rust hash-boundary token ${token}`);
}

for (const token of [
  'writeGradeRegistryRefHash',
  'writeGradeRegistryHashBoundary',
  'privateContentHashAvailable',
  'write-grade registry eligible',
  'registry owner ok',
  'registry permission ok',
  'shortHash(result && result.writeGradeRegistryRefHash)',
]) {
  mustContain(ui, token, `UI hash-boundary token ${token}`);
}
mustNotContain(ui, 'shortHash(result && result.descriptorRegistryRefHash)', 'UI exact private content hash display');

for (const token of [
  'Verdict: W3.3C DEFINES THE WRITE-GRADE EVIDENCE-SAFE REGISTRY HASH BOUNDARY. NO WRITE AUTHORIZATION.',
  'The existing `descriptorRegistryRefHash` is computed over the exact private registry JSON bytes',
  'not a write-grade evidence-safe hash',
  'must not be used as the committed write-grade receipt evidence hash',
  '`writeGradeRegistryRefHash`: write-grade evidence-safe public descriptor hash',
  '`writeGradeRegistryHashBoundary`',
  '`descriptor-refs-only-excludes-private-material`',
  'h2o.studio.transport.write-grade-registry-public-ref.v1',
  'Included in `writeGradeRegistryRefHash`',
  'Excluded from `writeGradeRegistryRefHash` and from committed write-grade evidence',
  'raw endpoint',
  'raw remote root or folder',
  'username or credential identifier',
  'password/token',
  'auth header',
  'private registry JSON',
  'any secret-derived fingerprint',
  'private content hash remains local-only/internal',
  '`writeGradeRegistryEligible:true`',
  '`writeGradeRegistryRefHash` matches the write-grade receipt binding',
  'The UI must not display the exact private-content `descriptorRegistryRefHash`',
  'W3.3C is no-write / evidence-validator / local-status only',
  'no live WebDAV probe was performed in this phase',
  'no WebDAV/cloud/relay/CAS/file write occurred',
  'no forbidden WebDAV method was used',
  'no write-grade receipt was minted',
  '`h2o_rt_first_write` remains absent / not implemented in this phase',
  '`productSyncReady:false`',
  '`transportReady:false`',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'h2o_rt_first_write',
  'first_write',
]) {
  mustNotContain(sourceSurface, token, `first-write source token ${token}`);
}

for (const token of [
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

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bauthHeaderPrivate\s*[:=]/i, 'auth header value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint value literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw path value literal'],
  [/\brawListing\s*[:=]/i, 'raw listing value literal'],
  [/descriptorRegistryRefHash:\s*sha256:/i, 'legacy private content hash value'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-3-write-grade-registry-hash-boundary',
  w33bCommit: W33B_COMMIT,
  writeGradeHash: 'writeGradeRegistryRefHash',
  boundary: 'descriptor-refs-only-excludes-private-material',
  evidenceSafeHashExcludesPrivateMaterial: true,
  firstWriteCommandExists: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
