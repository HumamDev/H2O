#!/usr/bin/env node
// Operational.5 - productSyncReady flip-gate validator.
//
// Static guard only. This locks the decision that six-type request readiness is
// necessary but not sufficient, and that productSyncReady stays false until a
// later dedicated local-model release-grade flip slice.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const O5_EVIDENCE_REL = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const O4_CLOSURE_REL = 'release-evidence/2026-06-30/sync-operational-4-six-type-readiness-closure.md';
const O3_HARNESS_REL = 'release-evidence/2026-06-30/sync-operational-3-label-tag-unbind-harness.md';
const O2_IMPLEMENTATION_REL = 'release-evidence/2026-06-30/sync-operational-2-label-tag-unbind-implementation.md';
const AUTHORITY_DECISION_REL = 'release-evidence/2026-06-30/sync-authority-model-decision.md';
const A8_CLOSURE_REL = 'release-evidence/2026-06-30/sync-metadata-envelope-a8-pre-freeze-projection-stack-closure.md';
const ARCHIVE_CLOUD_BOUNDARY_REL = 'release-evidence/2026-06-30/saved-chat-archive-phase-l1-package-cloud-sync-boundary-validator.md';
const FOLDER_SYNC_F1_REL = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const FOLDER_SYNC_F2_REL = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';

const FOLDER_SYNC_REL = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const FOLDER_IMPORT_REL = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const AUTO_IMPORT_REL = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const WEBDAV_GATES_REL = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const DIAG_REL = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const EXPORT_PROJECTION_REL = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';

const PRODUCT_READY_SOURCE_RELS = [
  FOLDER_SYNC_REL,
  FOLDER_IMPORT_REL,
  AUTO_IMPORT_REL,
  WEBDAV_GATES_REL,
  DIAG_REL,
  EXPORT_PROJECTION_REL,
];

const SIX_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
  'chat-label-unbind',
  'chat-tag-unbind',
];

const CATALOG_CRUD_TYPES = [
  'label-create',
  'tag-create',
  'category-create',
  'label-rename',
  'tag-rename',
  'category-rename',
  'label-recolor',
  'catalog-soft-delete',
  'catalog-restore',
  'hard-delete',
  'un-delete',
];

// Anchor on a non-identifier boundary before productSyncReady so real
// property/assignment flips are caught, but longer camelCase names that merely
// end in ...ProductSyncReady (e.g. killSwitchSeparateFromProductSyncReady: true)
// are not falsely flagged.
const PRODUCT_READY_TRUE_PATTERNS = [
  /(?<![A-Za-z0-9_$])productSyncReady\s*:\s*true\b/i,
  /(?<![A-Za-z0-9_$])productSyncReady\s*=\s*true\b/i,
  /(?<![A-Za-z0-9_$])productSyncReady['"]?\s*,\s*true\b/i,
];

const V3_RUNTIME_PATTERNS = [
  /FULL_BUNDLE_SCHEMA\s*=\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
  /schema\s*:\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
  /h2o\.studio\.fullBundle\.v3/i,
];

const FORBIDDEN_WEB_DAV_APPLY_PATTERNS = [
  /\bautoApply.*WebDAV\b/i,
  /\bapply.*WebDAV.*envelope\b/i,
  /\bimportFromWebDAV\b/i,
  /\brestoreFromWebDAV\b/i,
  /\bapplyWebDAV\b/i,
];

const MULTI_WRITER_RUNTIME_PATTERNS = [
  /\bmulti-writer\b/i,
  /\bmultiWriter\b/i,
  /\bleaseElection\b/i,
  /\bauthorityLease\b/i,
  /\belectCanonical\b/i,
];

const ARCHIVE_CAS_RUNTIME_PATTERNS = [
  /\.h2ochat\.enc\b/i,
  /\barchivePackageCAS\b/i,
  /\buploadArchivePackage\b/i,
  /\bdownloadArchivePackage\b/i,
  /\bsyncArchivePackages\b/i,
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
    console.log(`  PASS ${label}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
  }
}

function assertIncludes(text, needle, label) {
  assert.ok(String(text).includes(needle), `${label || 'text'} missing ${needle}`);
}

function assertMatches(text, pattern, label) {
  assert.match(String(text), pattern, label);
}

function assertAbsent(rel, code, patterns, label) {
  for (const pattern of patterns) {
    assert.ok(!pattern.test(code), `${label} matched ${pattern} in ${rel}`);
  }
}

function parseObjectAllowlist(source) {
  const marker = 'APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'missing APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS');
  const end = source.indexOf('}', start);
  assert.ok(end > start, 'missing APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS close');
  const block = source.slice(start, end);
  const out = [];
  const re = /'([^']+)'\s*:\s*true/g;
  let match;
  while ((match = re.exec(block)) !== null) out.push(match[1]);
  return out.sort();
}

function parseArrayAllowlist(source) {
  const marker = 'var APPLIED_TYPES = Object.freeze([';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'missing APPLIED_TYPES');
  const end = source.indexOf(']);', start);
  assert.ok(end > start, 'missing APPLIED_TYPES close');
  const block = source.slice(start, end);
  const out = [];
  const re = /'([^']+)'/g;
  let match;
  while ((match = re.exec(block)) !== null) out.push(match[1]);
  return out.sort();
}

function assertSetEqual(actual, expected, label) {
  assert.deepEqual(actual.slice().sort(), expected.slice().sort(), label);
}

const o5 = exists(O5_EVIDENCE_REL) ? readRepo(O5_EVIDENCE_REL) : '';
const o4 = exists(O4_CLOSURE_REL) ? readRepo(O4_CLOSURE_REL) : '';
const o3 = exists(O3_HARNESS_REL) ? readRepo(O3_HARNESS_REL) : '';
const o2 = exists(O2_IMPLEMENTATION_REL) ? readRepo(O2_IMPLEMENTATION_REL) : '';
const authority = exists(AUTHORITY_DECISION_REL) ? readRepo(AUTHORITY_DECISION_REL) : '';
const a8 = exists(A8_CLOSURE_REL) ? readRepo(A8_CLOSURE_REL) : '';
const archiveCloud = exists(ARCHIVE_CLOUD_BOUNDARY_REL) ? readRepo(ARCHIVE_CLOUD_BOUNDARY_REL) : '';
const folderF1 = exists(FOLDER_SYNC_F1_REL) ? readRepo(FOLDER_SYNC_F1_REL) : '';
const folderF2 = exists(FOLDER_SYNC_F2_REL) ? readRepo(FOLDER_SYNC_F2_REL) : '';

console.log('[sync-productsyncready-flip-gate] Operational.5 checks');

check('[EVIDENCE] Operational.5 contract exists and explicitly does not flip productSyncReady', () => {
  assert.ok(exists(O5_EVIDENCE_REL), 'missing Operational.5 evidence');
  assertMatches(o5, /OPERATIONAL\.5 productSyncReady FLIP-GATE[\s\S]*NOT FLIPPED/i);
  assertMatches(o5, /productSyncReady stays false/i);
  assertMatches(o5, /Do not flip productSyncReady/i);
  assertMatches(o5, /Six-type request readiness is proven but not sufficient/i);
});

check('[SCOPE] productSyncReady is local v1 readiness; cloudSyncReady is separate future gate', () => {
  assertMatches(o5, /productSyncReady\s*=\s*v1 single-canonical local metadata sync model is release-grade/i);
  for (const term of ['fullBundle.v2', 'latest.json', 'chrome-latest.json', 'Chrome', 'Desktop', 'device-folder publication']) {
    assertIncludes(o5, term, 'Operational.5 local model scope');
  }
  for (const term of ['fullBundle.v3', 'WebDAV/cloud transport', 'identity/key/E2E runtime', 'archive package CAS L.2', 'cloudSyncReady']) {
    assertIncludes(o5, term, 'Operational.5 cloud exclusion scope');
  }
});

check('[GATE] checklist records folder source-of-truth, canonical count parity, rollback, UI, and no-cloud gates', () => {
  for (const pattern of [
    /six-type request readiness green/i,
    /folder-sync source-of-truth reconciled and release-grade/i,
    /A0-A8 projection coherence green/i,
    /canonical count parity proven/i,
    /single-canonical authority respected/i,
    /basis reserved\/inert/i,
    /catalog Desktop-managed accepted/i,
    /one revertible flag/i,
    /individually OFF-by-default/i,
    /confirmed canonical\/parity state/i,
    /no cloud claim/i,
  ]) {
    assertMatches(o5, pattern, `missing gate checklist pattern ${pattern}`);
  }
});

check('[NON-BLOCKERS] local productSyncReady does not require catalog CRUD, v3, WebDAV, archive CAS, multi-writer, or tags.updated_at', () => {
  for (const pattern of [
    /catalog CRUD/i,
    /fullBundle\.v3[\s\S]{0,20}mint/i,
    /WebDAV metadata transport/i,
    /archive package CAS L\.2/i,
    /multi-writer/i,
    /tags\.updated_at`? migration/i,
  ]) assertMatches(o5, pattern, `Operational.5 non-blocker list missing ${pattern}`);
});

check('[REQUEST] Operational.2/3/4 six-type readiness evidence remains present', () => {
  assert.ok(exists(O2_IMPLEMENTATION_REL), 'missing Operational.2 implementation evidence');
  assert.ok(exists(O3_HARNESS_REL), 'missing Operational.3 harness evidence');
  assert.ok(exists(O4_CLOSURE_REL), 'missing Operational.4 closure evidence');
  assertMatches(o2, /OPERATIONAL\.2 LABEL\/TAG UNBIND IMPLEMENTATION - IMPLEMENTED/i);
  assertMatches(o3, /OPERATIONAL\.3 LABEL\/TAG UNBIND HARNESS - PASSED/i);
  assertMatches(o4, /OPERATIONAL\.4 SIX-TYPE REQUEST READINESS CLOSURE - CLOSED/i);
  assertMatches(o4, /productSyncReady:false/i);
});

check('[BLOCKER] folder-sync source-of-truth reconciliation remains not release-grade', () => {
  assert.ok(exists(FOLDER_SYNC_F1_REL), 'missing folder-sync F1 evidence');
  assert.ok(exists(FOLDER_SYNC_F2_REL), 'missing folder-sync F2 evidence');
  assertMatches(folderF1, /Folder sync readiness: NOT READY/i);
  assertMatches(folderF1, /source-of-truth split is identified but not yet reconciled/i);
  assertMatches(folderF2, /Folder sync readiness verdict: NOT READY/i);
  assertMatches(folderF2, /not yet\s+repaired/i);
  assertMatches(o5, /Folder-sync source-of-truth reconciliation remains outstanding/i);
});

check('[PROJECTION] A8 pre-freeze projection stack closure exists and remains pre-freeze', () => {
  assert.ok(exists(A8_CLOSURE_REL), 'missing A8 closure');
  assertMatches(a8, /A8 METADATA ENVELOPE PRE-FREEZE PROJECTION STACK - CLOSED/i);
  assertMatches(a8, /fullBundle\.v3`? is reserved, not minted/i);
  assertMatches(a8, /productSyncReady`? remains `false`/i);
});

check('[AUTHORITY] single-canonical authority decision is the current model', () => {
  assert.ok(exists(AUTHORITY_DECISION_REL), 'missing authority decision');
  assertMatches(authority, /v1 sync authority is single-canonical/i);
  assertMatches(authority, /Exactly one canonical Desktop holds SQLite authority/i);
  assertMatches(authority, /Chrome is read-only plus request-only/i);
  assertMatches(authority, /productSyncReady`? remains `false`/i);
});

check('[RUNTIME] productSyncReady remains false in sync gate/diagnostic sources', () => {
  for (const rel of PRODUCT_READY_SOURCE_RELS) {
    const code = codeOf(rel);
    assert.ok(code.includes('productSyncReady: false'), `${rel} must retain productSyncReady:false marker`);
    assertAbsent(rel, code, PRODUCT_READY_TRUE_PATTERNS, 'productSyncReady true pattern');
  }
});

check('[RUNTIME] applied request allowlists are exactly six and catalog CRUD remains absent', () => {
  assertSetEqual(parseObjectAllowlist(readRepo(FOLDER_SYNC_REL)), SIX_TYPES, 'Desktop applied allowlist must be exactly six');
  assertSetEqual(parseArrayAllowlist(readRepo(WEBDAV_GATES_REL)), SIX_TYPES, 'WebDAV gate allowlist must be exactly six');
  const allowlistText = parseObjectAllowlist(readRepo(FOLDER_SYNC_REL)).concat(parseArrayAllowlist(readRepo(WEBDAV_GATES_REL))).join('\n');
  for (const type of CATALOG_CRUD_TYPES) {
    assert.ok(!allowlistText.includes(type), `catalog/deletion type must not be applied: ${type}`);
  }
});

check('[BOUNDARY] v3, WebDAV apply, multi-writer/lease/election, and archive CAS remain absent from runtime sources', () => {
  for (const rel of PRODUCT_READY_SOURCE_RELS) {
    const code = codeOf(rel);
    assertAbsent(rel, code, V3_RUNTIME_PATTERNS, 'fullBundle.v3 runtime pattern');
    assertAbsent(rel, code, FORBIDDEN_WEB_DAV_APPLY_PATTERNS, 'WebDAV apply runtime pattern');
    assertAbsent(rel, code, MULTI_WRITER_RUNTIME_PATTERNS, 'multi-writer runtime pattern');
    assertAbsent(rel, code, ARCHIVE_CAS_RUNTIME_PATTERNS, 'archive CAS runtime pattern');
  }
});

check('[CLOUD] cloud readiness and archive CAS are not claimed by Operational.5', () => {
  assert.ok(exists(ARCHIVE_CLOUD_BOUNDARY_REL), 'missing archive cloud boundary evidence');
  assertMatches(archiveCloud, /ARCHIVE PACKAGE CLOUD SYNC BOUNDARY VALIDATOR - PASSED/i);
  assertMatches(archiveCloud, /does not implement WebDAV\/cloud\/network package transport|no archive cloud\/WebDAV package transport capability/i);
  assertMatches(o5, /Cloud readiness is separate future `cloudSyncReady`/i);
  assertMatches(o5, /Archive package CAS remains deferred/i);
});

check('[STATIC] validator remains static with no live DB/runtime mutation', () => {
  const self = readRepo('tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs');
  const importLines = self.split(/\r?\n/).filter((line) => /^import\s/.test(line)).join('\n');
  assert.doesNotMatch(importLines, /node:sqlite|DatabaseSync/i);
  assert.doesNotMatch(importLines, /fetch|XMLHttpRequest/i);
  assert.doesNotMatch(self, /chrome\.storage\.local\.set\(|plugin:fs\|write_file/i);
});

if (FAIL.length) {
  console.error('');
  console.error('FAIL validate-sync-productsyncready-flip-gate-v1');
  for (const failure of FAIL) console.error(`- ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log('');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.product-sync-ready.flip-gate.v1',
  status: 'passed',
  phase: 'operational-5-productsyncready-flip-gate',
  productSyncReady: false,
  cloudSyncReady: false,
  localModelScope: 'fullBundle.v2 latest.json chrome-latest.json Chrome<->Desktop device-folder',
  appliedTypes: SIX_TYPES,
  blockers: [
    'folder-sync-source-of-truth-reconciliation-not-release-grade',
    'canonical-count-parity-not-yet-proven-for-flip',
  ],
  checks: PASS.length,
}, null, 2));
console.log('PASS validate-sync-productsyncready-flip-gate-v1');
