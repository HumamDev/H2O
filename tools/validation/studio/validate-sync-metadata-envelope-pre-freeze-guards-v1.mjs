#!/usr/bin/env node
// A3 - Sync metadata envelope pre-freeze guard scaffold.
//
// Static guard only. It verifies the A2 pre-freeze contract, confirms v2
// remains the current local wire, keeps v3 unminted in runtime, locks the
// four-type request core, and preserves package/WebDAV/identity boundaries.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const A2_CONTRACT_REL = 'release-evidence/2026-06-30/sync-metadata-envelope-a2-pre-freeze-contract.md';
const IDENTITY_CLOSURE_REL = 'release-evidence/2026-06-30/sync-identity-key-e2e-closure.md';
const ARCHIVE_CLOUD_CONTRACT_REL = 'release-evidence/2026-06-30/saved-chat-archive-phase-l0-package-cloud-sync-contract.md';
const ARCHIVE_CLOUD_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const IDENTITY_VALIDATOR_REL = 'tools/validation/studio/validate-sync-identity-key-e2e-boundary-v1.mjs';

const EXPORT_BUNDLE_REL = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const FOLDER_SYNC_REL = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const FOLDER_IMPORT_REL = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const WEBDAV_RELAY_REL = 'src-surfaces-base/studio/sync/webdav-relay.tauri.js';
const RELAY_INBOX_REL = 'src-surfaces-base/studio/sync/relay-inbox.tauri.js';

const RUNTIME_RELS = [
  EXPORT_BUNDLE_REL,
  FOLDER_SYNC_REL,
  FOLDER_IMPORT_REL,
  WEBDAV_RELAY_REL,
  RELAY_INBOX_REL,
];

const METADATA_WIRE_RELS = [
  EXPORT_BUNDLE_REL,
  FOLDER_SYNC_REL,
  FOLDER_IMPORT_REL,
];

const EXPECTED_APPLIED_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
];
const OPERATIONAL_RUNTIME_TYPES = EXPECTED_APPLIED_TYPES.concat([
  'chat-label-unbind',
  'chat-tag-unbind',
]);

const REQUIRED_A2_PATTERNS = [
  /PRE-FREEZE/i,
  /NOT A FREEZE/i,
  /productSyncReady:false/i,
  /WebDAV deferred/i,
  /h2o\.studio\.fullBundle\.v3/i,
  /does not mint v3/i,
  /reject and quarantine major versions greater than supported/i,
  /unknown additive minor fields are ignored/i,
  /Package bodies remain excluded/i,
  /Freeze Gate/i,
  /Required-Before-Freeze Validators/i,
  /envelope-schema-guard/i,
  /freeze-gate-readiness-guard/i,
  /package-body-exclusion-guard/i,
  /envelope-drift-guard/i,
  /no-new-applied-type-guard/i,
];

const PACKAGE_BODY_PATTERNS = [
  /\.h2ochat\b/i,
  /\.h2ochat\.enc\b/i,
  /\bsnapshot\.json\b/i,
  /\bchat\.md\b/i,
  /\bchat\.html\b/i,
  /\bpackageBody\b/i,
  /\bpackageBytes\b/i,
  /\bbase64Package\b/i,
  /\bpackageBase64\b/i,
  /\bassetBody\b/i,
  /\bsnapshotBody\b/i,
];

const V3_RUNTIME_PATTERNS = [
  /h2o\.studio\.fullBundle\.v3/i,
  /FULL_BUNDLE_SCHEMA\s*=\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
  /schema\s*:\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
];

const PRODUCT_READY_TRUE_PATTERNS = [
  /productSyncReady\s*:\s*true\b/i,
  /productSyncReady\s*=\s*true\b/i,
];

const FORBIDDEN_WEBDAV_APPLY_PATTERNS = [
  /\bautoApply.*WebDAV\b/i,
  /\bapply.*WebDAV\b/i,
  /\bWebDAV.*autoApply\b/i,
  /\bWebDAV.*productSyncReady\s*:\s*true\b/i,
  /\bmaterialize.*WebDAV\b/i,
];

const FORBIDDEN_IDENTITY_RUNTIME_PATTERNS = [
  /\brecipientDeviceKeyId\b/i,
  /\bproducerDeviceId\b/i,
  /\bwrapCEK\b/i,
  /\bunwrapCEK\b/i,
  /\bencryptSyncEnvelope\b/i,
  /\bdecryptSyncEnvelope\b/i,
  /\bkeychainSyncKey\b/i,
];

const PASS = [];
const FAIL = [];

function repoPath(rel) {
  return path.join(REPO_ROOT, rel);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

function readRepo(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function codeOf(rel) {
  return stripComments(readRepo(rel));
}

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    FAIL.push({ label, message });
    console.log(`  ✗ ${label}`);
    console.log(`      ${message}`);
  }
}

function assertIncludes(haystack, needle, message) {
  assert.ok(String(haystack).includes(needle), message || `missing ${needle}`);
}

function assertAbsent(rel, code, patterns, label) {
  for (const pattern of patterns) {
    assert.ok(!pattern.test(code), `${label} matched ${pattern} in ${rel}`);
  }
}

function parseAppliedAllowlist(source) {
  const marker = 'APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {';
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const end = source.indexOf('}', start);
  if (end < 0) return null;
  const block = source.slice(start, end);
  const out = [];
  const re = /'([^']+)'\s*:\s*true/g;
  let match;
  while ((match = re.exec(block)) !== null) out.push(match[1]);
  return out.sort();
}

const a2 = exists(A2_CONTRACT_REL) ? readRepo(A2_CONTRACT_REL) : '';

console.log('[sync-metadata-envelope-pre-freeze] A3 guard scaffold checks');

check('[A2] pre-freeze contract exists', () => {
  assert.ok(exists(A2_CONTRACT_REL), 'missing A2 pre-freeze contract');
  assert.match(a2, /A2 METADATA ENVELOPE[\s\S]*PRE-FREEZE[\s\S]*NOT A FREEZE/i);
});

check('[A2] required pre-freeze decisions are present', () => {
  for (const pattern of REQUIRED_A2_PATTERNS) {
    assert.match(a2, pattern, `A2 contract missing ${pattern}`);
  }
});

check('[RUNTIME] current local wire remains fullBundle.v2 and v3 is not minted', () => {
  for (const rel of RUNTIME_RELS) {
    assert.ok(exists(rel), `missing runtime file ${rel}`);
    assertAbsent(rel, codeOf(rel), V3_RUNTIME_PATTERNS, 'v3 runtime mint/consume pattern');
  }
  assertIncludes(readRepo(EXPORT_BUNDLE_REL), "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'Desktop export must keep v2');
  assertIncludes(readRepo(FOLDER_SYNC_REL), "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'Desktop import/apply must keep v2');
  assertIncludes(readRepo(FOLDER_IMPORT_REL), "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'Chrome import/export must keep v2');
});

check('[RUNTIME] productSyncReady is not flipped to true', () => {
  for (const rel of METADATA_WIRE_RELS) {
    const code = codeOf(rel);
    assertIncludes(code, 'productSyncReady: false', `${rel} should preserve productSyncReady false markers`);
    assertAbsent(rel, code, PRODUCT_READY_TRUE_PATTERNS, 'productSyncReady true pattern');
  }
});

check('[REQUEST CORE] four-type request core remains stable; Operational.2 runtime may apply the two unbind extensions', () => {
  const applied = parseAppliedAllowlist(readRepo(FOLDER_SYNC_REL));
  assert.ok(Array.isArray(applied), 'could not parse applied metadata request allowlist');
  assert.deepEqual(applied, OPERATIONAL_RUNTIME_TYPES.slice().sort(), 'applied request allowlist must be the four-core plus Operational.2 unbinds');
  const syncCode = codeOf(FOLDER_SYNC_REL);
  assertIncludes(syncCode, "NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear', 'chat-label-unbind', 'chat-tag-unbind'])");
  assertIncludes(syncCode, 'library-metadata-mutation-request-action-deferred-phase7');
});

check('[PACKAGE BODY] metadata wire path excludes package/archive bodies', () => {
  for (const rel of METADATA_WIRE_RELS) {
    assertAbsent(rel, codeOf(rel), PACKAGE_BODY_PATTERNS, 'package body in metadata wire path');
  }
  assert.ok(exists(ARCHIVE_CLOUD_CONTRACT_REL), 'archive cloud sync L.0 contract missing');
  assert.ok(exists(ARCHIVE_CLOUD_VALIDATOR_REL), 'archive cloud boundary validator missing');
});

check('[WEBDAV] WebDAV remains deferred/manual and does not become product metadata transport', () => {
  const folderSync = codeOf(FOLDER_SYNC_REL);
  const folderImport = codeOf(FOLDER_IMPORT_REL);
  const webdav = readRepo(WEBDAV_RELAY_REL);
  const relayInbox = readRepo(RELAY_INBOX_REL);
  assertIncludes(folderSync, "webdav: 'deferred'", 'Desktop sync diagnostic must keep WebDAV deferred');
  assertIncludes(folderImport, "webdav: 'deferred'", 'Chrome sync diagnostic must keep WebDAV deferred');
  assert.match(webdav, /Desktop\/Tauri-only manual transport for relay envelopes/i);
  assert.match(webdav, /Downloaded envelopes never mutate state/i);
  assert.match(webdav, /ingestRelayEnvelope/);
  assert.match(relayInbox, /pending-review/);
  assert.match(relayInbox, /quarantine/i);
  assertAbsent(WEBDAV_RELAY_REL, stripComments(webdav), FORBIDDEN_WEBDAV_APPLY_PATTERNS, 'WebDAV auto-apply/product-ready pattern');
});

check('[IDENTITY] identity/key/E2E is prerequisite-only and runtime remains absent', () => {
  assert.ok(exists(IDENTITY_CLOSURE_REL), 'identity/key/E2E closure missing');
  assert.ok(exists(IDENTITY_VALIDATOR_REL), 'identity/key/E2E boundary validator missing');
  for (const rel of METADATA_WIRE_RELS.concat([WEBDAV_RELAY_REL])) {
    assertAbsent(rel, codeOf(rel), FORBIDDEN_IDENTITY_RUNTIME_PATTERNS, 'identity/key runtime satisfaction pattern');
  }
});

check('[AUTHORITY] multi-Desktop authority remains an open gate in A2', () => {
  assert.match(a2, /Multi-Desktop authority\s+remains undecided/i);
  assert.match(a2, /multi-Desktop authority is decided/i);
  assert.match(a2, /Transport remains non-authoritative/i);
});

if (FAIL.length) {
  console.error('');
  console.error('FAIL validate-sync-metadata-envelope-pre-freeze-guards-v1');
  for (const failure of FAIL) console.error(`- ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log('');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.metadata-envelope.pre-freeze-guards.v1',
  status: 'passed',
  preFreeze: true,
  freeze: false,
  currentWire: 'h2o.studio.fullBundle.v2',
  reservedFutureWire: 'h2o.studio.fullBundle.v3',
  v3Minted: false,
  productSyncReady: false,
  appliedRequestCore: EXPECTED_APPLIED_TYPES,
  operationalRuntimeTypes: OPERATIONAL_RUNTIME_TYPES,
  packageBodiesExcluded: true,
  webdavDeferred: true,
  identityKeyRuntimeSatisfied: false,
  multiDesktopAuthorityGate: 'open',
  checks: PASS.length,
}, null, 2));
console.log('PASS validate-sync-metadata-envelope-pre-freeze-guards-v1');
