#!/usr/bin/env node
// A5 - Sync metadata projection closure guard.
//
// Static/pre-freeze only. This validator checks the A4 projection closure plan
// against the current schema/store/export sources and keeps v3/productSyncReady
// frozen off.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const A4_PLAN_REL = 'release-evidence/2026-06-30/sync-metadata-envelope-a4-projection-closure-plan.md';
const A3_GUARD_REL = 'tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs';
const ARCHIVE_CLOUD_GUARD_REL = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const IDENTITY_GUARD_REL = 'tools/validation/studio/validate-sync-identity-key-e2e-boundary-v1.mjs';

const LIB_RS_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const EXPORT_BUNDLE_REL = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const FOLDER_SYNC_REL = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const FOLDER_IMPORT_REL = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const WEBDAV_RELAY_REL = 'src-surfaces-base/studio/sync/webdav-relay.tauri.js';

const STORE_RELS = [
  'src-surfaces-base/studio/store/categories.tauri.js',
  'src-surfaces-base/studio/store/labels.tauri.js',
  'src-surfaces-base/studio/store/tags.tauri.js',
  'src-surfaces-base/studio/store/folders.tauri.js',
  'src-surfaces-base/studio/store/chats.tauri.js',
  'src-surfaces-base/studio/store/tombstones.tauri.js',
];

const SCANNED_RELS = [
  A4_PLAN_REL,
  LIB_RS_REL,
  EXPORT_BUNDLE_REL,
  FOLDER_SYNC_REL,
  FOLDER_IMPORT_REL,
  WEBDAV_RELAY_REL,
].concat(STORE_RELS);

const EXPECTED_APPLIED_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
];

const REQUIRED_A4_PATTERNS = [
  /pre-freeze/i,
  /productSyncReady:false/i,
  /v3 not minted/i,
  /read projection/i,
  /full-snapshot/i,
  /content-hash(?:ed)?/i,
  /last-writer-wins(?: by authority|-by-authority)/i,
  /two-gate model/i,
  /projection closure[\s\S]*productSyncReady/i,
  /parent_id/i,
  /labels\.color|`color`/i,
  /auto_derived/i,
  /`folders`\s+catalog read-model|folders catalog fields/i,
  /label_bindings/i,
  /tag_bindings/i,
  /chats\.category_id/i,
  /folder_bindings/i,
  /soft-delete\/tombstone state represent/i,
  /additive-minor/i,
  /package bodies remain excluded/i,
];

const TABLE_FIELD_EXPECTATIONS = {
  categories: ['id', 'name', 'parent_id', 'source', 'created_at', 'updated_at', 'meta_json'],
  labels: ['id', 'name', 'color', 'source', 'created_at', 'updated_at', 'meta_json'],
  tags: ['id', 'name', 'auto_derived', 'created_at', 'meta_json'],
  folders: ['id', 'name', 'parent_id', 'color', 'sort_order', 'source', 'created_at', 'updated_at', 'meta_json'],
  folder_bindings: ['chat_id', 'folder_id', 'assigned_at'],
  label_bindings: ['chat_id', 'label_id', 'assigned_at'],
  tag_bindings: ['chat_id', 'tag_id', 'assigned_at'],
};

const STORE_FIELD_EXPECTATIONS = {
  'src-surfaces-base/studio/store/categories.tauri.js': ['parent_id', 'source', 'created_at', 'updated_at', 'meta_json'],
  'src-surfaces-base/studio/store/labels.tauri.js': ['color', 'source', 'created_at', 'updated_at', 'meta_json'],
  'src-surfaces-base/studio/store/tags.tauri.js': ['auto_derived', 'created_at', 'meta_json'],
  'src-surfaces-base/studio/store/folders.tauri.js': ['parent_id', 'color', 'sort_order', 'source', 'created_at', 'updated_at', 'meta_json'],
  'src-surfaces-base/studio/store/chats.tauri.js': ['category_id', 'is_deleted'],
  'src-surfaces-base/studio/store/tombstones.tauri.js': ['sync_tombstones'],
};

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

const V3_PATTERNS = [
  /h2o\.studio\.fullBundle\.v3/i,
  /FULL_BUNDLE_SCHEMA\s*=\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
  /schema\s*:\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
];

const PRODUCT_READY_TRUE_PATTERNS = [
  /productSyncReady\s*:\s*true\b/i,
  /productSyncReady\s*=\s*true\b/i,
];

const IDENTITY_RUNTIME_PATTERNS = [
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
    console.log(`  PASS ${label}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
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

function tableBlock(schema, tableName) {
  const re = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+${tableName}\\s*\\(([\\s\\S]*?)\\);`, 'i');
  const match = re.exec(schema);
  return match ? match[1] : '';
}

function assertTableFields(schema, tableName, fields) {
  const block = tableBlock(schema, tableName);
  assert.ok(block, `missing CREATE TABLE block for ${tableName}`);
  for (const field of fields) {
    assert.match(block, new RegExp(`\\b${field}\\b`), `${tableName} missing ${field}`);
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

function normalizeText(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9_]+/g, ' ');
}

function assertProjectionPlanCoversField(planText, tableName, fieldName) {
  const haystack = normalizeText(planText);
  const field = normalizeText(fieldName).trim();
  const table = normalizeText(tableName).trim();
  if (['label_bindings', 'tag_bindings', 'folder_bindings'].includes(tableName)) {
    assert.ok(haystack.includes(table), `A4 projection checklist missing ${tableName}`);
    return;
  }
  if (tableName === 'folders') {
    assert.match(planText, /folders catalog (?:read-model|fields)/i, `A4 missing grouped folder catalog coverage for ${fieldName}`);
    return;
  }
  assert.ok(haystack.includes(field), `A4 projection checklist missing ${tableName}.${fieldName}`);
}

const a4 = exists(A4_PLAN_REL) ? readRepo(A4_PLAN_REL) : '';

console.log('[sync-metadata-projection-closure] A5 static projection guard checks');

check('[A4] projection closure plan exists', () => {
  assert.ok(exists(A4_PLAN_REL), 'missing A4 projection closure plan');
  assert.match(a4, /A4 PROJECTION CLOSURE PLAN[\s\S]*pre-freeze[\s\S]*productSyncReady:false[\s\S]*v3 not minted/i);
});

check('[A4] required projection/model decisions are present', () => {
  for (const pattern of REQUIRED_A4_PATTERNS) {
    assert.match(a4, pattern, `A4 plan missing ${pattern}`);
  }
});

check('[SCHEMA] catalog, binding, chat category, and tombstone tables expose expected fields', () => {
  const schema = readRepo(LIB_RS_REL);
  for (const [tableName, fields] of Object.entries(TABLE_FIELD_EXPECTATIONS)) {
    assertTableFields(schema, tableName, fields);
  }
  const chats = tableBlock(schema, 'chats');
  assert.match(chats, /\bcategory_id\b/, 'chats missing category_id');
  assert.match(chats, /\bis_deleted\b/, 'chats missing is_deleted');
  assert.match(schema, /CREATE TABLE(?: IF NOT EXISTS)? sync_tombstones/i, 'sync_tombstones table missing');
});

check('[STORE] store projectors expose projection-relevant fields', () => {
  for (const [rel, fields] of Object.entries(STORE_FIELD_EXPECTATIONS)) {
    assert.ok(exists(rel), `missing store source ${rel}`);
    const code = codeOf(rel);
    for (const field of fields) {
      assert.match(code, new RegExp(`\\b${field}\\b`), `${rel} missing ${field}`);
    }
  }
});

check('[DRIFT] A4 projection checklist covers current renderable schema/store surfaces', () => {
  for (const [tableName, fields] of Object.entries(TABLE_FIELD_EXPECTATIONS)) {
    for (const field of fields) {
      assertProjectionPlanCoversField(a4, tableName, field);
    }
  }
  ['chats.category_id', 'soft-delete/tombstone', 'unbind state'].forEach((needle) => {
    assert.match(a4, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `A4 missing ${needle}`);
  });
});

check('[EXPORT] current metadata projection path carries canonical metadata and hashes', () => {
  const exportCode = codeOf(EXPORT_BUNDLE_REL);
  assertIncludes(exportCode, 'desktopCanonicalLibraryMetadata');
  assertIncludes(exportCode, 'hashes');
  assertIncludes(exportCode, 'projection');
  assertIncludes(exportCode, 'libraryMetadataMutationReceipts');
  assertIncludes(exportCode, 'catalogs: { labels: [], tags: [], categories: [] }');
  assertIncludes(codeOf(FOLDER_SYNC_REL), 'libraryMetadataMutationRequests');
  assertIncludes(codeOf(FOLDER_IMPORT_REL), 'libraryMetadataMutationRequests');
});

check('[REQUEST CORE] four request-core types remain the only applied closed allowlist', () => {
  const applied = parseAppliedAllowlist(readRepo(FOLDER_SYNC_REL));
  assert.ok(Array.isArray(applied), 'could not parse applied metadata request allowlist');
  assert.deepEqual(applied, EXPECTED_APPLIED_TYPES.slice().sort(), 'applied request allowlist drifted');
  const syncCode = codeOf(FOLDER_SYNC_REL);
  assertIncludes(syncCode, "NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])");
  assertIncludes(syncCode, 'library-metadata-mutation-request-action-deferred-phase7');
  assert.match(a4, /chat-label-unbind/i, 'A4 should defer label unbind');
  assert.match(a4, /chat-tag-unbind/i, 'A4 should defer tag unbind');
  assert.match(a4, /catalog CRUD request types/i, 'A4 should defer catalog CRUD request types');
  assert.match(a4, /additive-minor/i, 'A4 should keep additive-minor extension plan');
});

check('[NO PREMATURE MINT] v3, productSyncReady, WebDAV, identity runtime, and package bodies remain blocked', () => {
  for (const rel of [EXPORT_BUNDLE_REL, FOLDER_SYNC_REL, FOLDER_IMPORT_REL, WEBDAV_RELAY_REL]) {
    assertAbsent(rel, codeOf(rel), V3_PATTERNS, 'v3 runtime pattern');
  }
  for (const rel of [EXPORT_BUNDLE_REL, FOLDER_SYNC_REL, FOLDER_IMPORT_REL]) {
    const code = codeOf(rel);
    assertIncludes(code, 'productSyncReady: false', `${rel} missing productSyncReady false marker`);
    assertAbsent(rel, code, PRODUCT_READY_TRUE_PATTERNS, 'productSyncReady true pattern');
    assertAbsent(rel, code, PACKAGE_BODY_PATTERNS, 'package/archive body metadata pattern');
  }
  assertIncludes(codeOf(FOLDER_SYNC_REL), "webdav: 'deferred'");
  assertIncludes(codeOf(FOLDER_IMPORT_REL), "webdav: 'deferred'");
  for (const rel of [EXPORT_BUNDLE_REL, FOLDER_SYNC_REL, FOLDER_IMPORT_REL, WEBDAV_RELAY_REL]) {
    assertAbsent(rel, codeOf(rel), IDENTITY_RUNTIME_PATTERNS, 'identity/key runtime pattern');
  }
  assert.ok(exists(A3_GUARD_REL), 'A3 pre-freeze guard missing');
  assert.ok(exists(ARCHIVE_CLOUD_GUARD_REL), 'archive cloud boundary guard missing');
  assert.ok(exists(IDENTITY_GUARD_REL), 'identity/key boundary guard missing');
});

if (FAIL.length) {
  console.error('');
  console.error('FAIL validate-sync-metadata-projection-closure-v1');
  for (const failure of FAIL) console.error(`- ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log('');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.metadata-projection-closure.v1',
  status: 'passed',
  preFreeze: true,
  fullBundleV3Minted: false,
  productSyncReady: false,
  currentWire: 'h2o.studio.fullBundle.v2',
  appliedRequestCore: EXPECTED_APPLIED_TYPES,
  scannedFiles: SCANNED_RELS,
  projectionFindings: {
    categories: TABLE_FIELD_EXPECTATIONS.categories,
    labels: TABLE_FIELD_EXPECTATIONS.labels,
    tags: TABLE_FIELD_EXPECTATIONS.tags,
    folders: TABLE_FIELD_EXPECTATIONS.folders,
    bindings: ['folder_bindings', 'label_bindings', 'tag_bindings', 'chats.category_id'],
    tombstoneState: ['chats.is_deleted', 'sync_tombstones'],
  },
  checks: PASS.length,
}, null, 2));
console.log('PASS validate-sync-metadata-projection-closure-v1');
