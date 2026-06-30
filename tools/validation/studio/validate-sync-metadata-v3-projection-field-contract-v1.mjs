#!/usr/bin/env node
// A7 - Sync metadata v3 projection field-contract harness.
//
// Static/pre-freeze only. This validator proves the A6 field contract with an
// in-memory fixture and keeps runtime v3/product/WebDAV/E2E/package transport
// gates closed.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const A6_CONTRACT_REL = 'release-evidence/2026-06-30/sync-metadata-envelope-a6-v3-projection-field-contract.md';
const TAGS_UPDATED_AT_DECISION_REL = 'release-evidence/2026-06-30/sync-metadata-envelope-tags-updated-at-decision.md';
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
  A6_CONTRACT_REL,
  TAGS_UPDATED_AT_DECISION_REL,
  LIB_RS_REL,
  EXPORT_BUNDLE_REL,
  FOLDER_SYNC_REL,
  FOLDER_IMPORT_REL,
  WEBDAV_RELAY_REL,
].concat(STORE_RELS);

const CORE_REQUEST_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
];

const TABLE_FIELD_EXPECTATIONS = {
  categories: ['id', 'name', 'parent_id', 'source', 'created_at', 'updated_at', 'meta_json'],
  labels: ['id', 'name', 'color', 'source', 'created_at', 'updated_at', 'meta_json'],
  tags: ['id', 'name', 'auto_derived', 'created_at', 'meta_json'],
  folders: ['id', 'name', 'parent_id', 'color', 'sort_order', 'source', 'created_at', 'updated_at', 'meta_json'],
  label_bindings: ['chat_id', 'label_id', 'assigned_at'],
  tag_bindings: ['chat_id', 'tag_id', 'assigned_at'],
  folder_bindings: ['chat_id', 'folder_id', 'assigned_at'],
};

const CONTRACT_FIELD_PATTERNS = {
  categories: [/id.*required/is, /name.*required/is, /parentId.*required, nullable/is, /updatedAt.*required/is, /source.*optional/is, /createdAt.*optional/is, /deleted.*required, default `false`/is, /meta.*optional/is],
  labels: [/id.*required/is, /name.*required/is, /color.*required, nullable/is, /updatedAt.*required/is, /source.*optional/is, /createdAt.*optional/is, /deleted.*required, default `false`/is, /meta.*optional/is],
  tags: [/id.*required/is, /name.*required/is, /autoDerived.*required, default `false`/is, /createdAt.*optional/is, /updatedAt.*optional or absent/is, /deleted.*required, default `false`/is, /meta.*optional/is],
  folders: [/id.*required/is, /name.*required/is, /color.*optional/is, /parentId.*optional if hierarchical/is, /updatedAt.*required/is, /deleted.*required, default `false`/is, /meta.*optional/is],
  chats: [/id.*required/is, /title.*optional/is, /categoryId.*required, nullable/is, /isDeleted.*required, default `false`/is, /updatedAt.*required/is, /meta.*optional metadata subset only/is],
  bindings: [/labelBindings/is, /chatId.*required/is, /labelId.*required/is, /tagBindings/is, /tagId.*required/is, /folderBindings/is, /folderId.*required/is],
  tombstones: [/recordKind.*required/is, /recordId.*required/is, /deletedAt.*optional/is, /restoredAt.*optional/is],
};

const EXCLUDED_TERMS = [
  'chat content',
  'snapshots',
  'snapshot_turns',
  'messages',
  'chat.md',
  'chat.html',
  'last_snapshot_id',
  'current_leaf_id',
  'last_captured_at',
  '.h2ochat',
  'assets or asset SHA references',
  'deleted_by_sync_peer_id',
  'restored_by_sync_peer_id',
  'cascade_from',
  'source_sequence_number',
  'prior_digest',
  'key material or secrets',
  'Chrome runtime state',
];

const FORBIDDEN_SAMPLE_KEYS = [
  'content',
  'snapshots',
  'snapshot_turns',
  'messages',
  'chatMd',
  'chatHtml',
  'last_snapshot_id',
  'lastSnapshotId',
  'current_leaf_id',
  'currentLeafId',
  'last_captured_at',
  'lastCapturedAt',
  'h2ochat',
  'assets',
  'assetSha',
  'assetHash',
  'deleted_by_sync_peer_id',
  'deletedBySyncPeerId',
  'restored_by_sync_peer_id',
  'restoredBySyncPeerId',
  'cascade_from',
  'cascadeFrom',
  'source_sequence_number',
  'sourceSequenceNumber',
  'prior_digest',
  'priorDigest',
  'privateKey',
  'secretKey',
  'keyMaterial',
  'chromeRuntimeState',
];

const V3_RUNTIME_PATTERNS = [
  /FULL_BUNDLE_SCHEMA\s*=\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
  /schema\s*:\s*['"]h2o\.studio\.fullBundle\.v3['"]/i,
  /h2o\.studio\.fullBundle\.v3/i,
];

const PRODUCT_READY_TRUE_PATTERNS = [
  /productSyncReady\s*:\s*true\b/i,
  /productSyncReady\s*=\s*true\b/i,
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
  /\bassetBody\b/i,
  /\bsnapshotBody\b/i,
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

const HARD_TAG_LWW_CREATED_AT_PATTERNS = [
  /tags?[\s\S]{0,120}lww(?:Basis| basis)?[\s:=`"']+createdAt/i,
  /createdAt[\s\S]{0,120}hard tag LWW basis/i,
  /tags?[\s\S]{0,160}authoritative conflict basis[\s\S]{0,80}createdAt/i,
];

const SYNTHETIC_TAG_UPDATED_AT_PATTERNS = [
  /updatedAt\s*:\s*[^,\n]*createdAt/i,
  /updated_at\s*=\s*created_at/i,
  /set\s+updated_at\s*=\s*created_at/i,
  /tags?[\s\S]{0,120}synth(?:etic|esize|esized)[\s\S]{0,120}updatedAt/i,
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

function assertContractSection(contract, sectionName, patterns) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp('### `?' + escaped + '(?:\\[\\])?`?', 'i');
  assert.match(contract, marker, `missing contract section ${sectionName}`);
  for (const pattern of patterns) assert.match(contract, pattern, `${sectionName} missing ${pattern}`);
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

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'non-finite number is not canonical');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  throw new Error(`unsupported canonical value type ${typeof value}`);
}

function hashCanonical(value) {
  return 'sha256-' + crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function sortById(rows) {
  return rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function normalizeProjection(projection) {
  return {
    bindings: {
      folderBindings: projection.bindings.folderBindings.slice().sort((a, b) =>
        String(a.chatId + ':' + a.folderId).localeCompare(String(b.chatId + ':' + b.folderId))),
      labelBindings: projection.bindings.labelBindings.slice().sort((a, b) =>
        String(a.chatId + ':' + a.labelId).localeCompare(String(b.chatId + ':' + b.labelId))),
      tagBindings: projection.bindings.tagBindings.slice().sort((a, b) =>
        String(a.chatId + ':' + a.tagId).localeCompare(String(b.chatId + ':' + b.tagId))),
    },
    categories: sortById(projection.categories),
    chats: sortById(projection.chats),
    folders: sortById(projection.folders),
    labels: sortById(projection.labels),
    tags: sortById(projection.tags),
    tombstones: projection.tombstones.slice().sort((a, b) =>
      String(a.recordKind + ':' + a.recordId).localeCompare(String(b.recordKind + ':' + b.recordId))),
  };
}

function hashInput(bundle) {
  return {
    authority: {
      canonicalRole: bundle.authority.canonicalRole,
    },
    minorVersion: bundle.version.minorVersion,
    projection: normalizeProjection(bundle.projection),
    requestTypes: {
      appliedAllowlist: bundle.requestTypes.appliedAllowlist.slice().sort(),
      registryVersion: bundle.requestTypes.registryVersion,
    },
    safety: bundle.safety,
    schemaVersion: bundle.version.schemaVersion,
  };
}

function computePayloadHash(bundle) {
  return hashCanonical(hashInput(bundle));
}

function attachHash(bundle) {
  const next = structuredClone(bundle);
  next.envelope.payloadHash = computePayloadHash(next);
  return next;
}

function baseProjection() {
  return {
    authority: {
      authorityEpoch: 0,
      canonicalRole: 'desktop',
      productSyncReady: false,
    },
    envelope: {
      envelopeId: null,
      logicalClock: null,
      payloadHash: null,
      producedAt: '2026-06-30T00:00:00.000Z',
      producerDeviceId: null,
      signature: null,
    },
    projection: {
      bindings: {
        folderBindings: [
          { assignedAt: '2026-06-30T00:00:04.000Z', chatId: 'chat-b', folderId: 'folder-root', order: 2 },
          { assignedAt: '2026-06-30T00:00:03.000Z', chatId: 'chat-a', folderId: 'folder-root', order: 1 },
        ],
        labelBindings: [
          { assignedAt: '2026-06-30T00:00:01.000Z', chatId: 'chat-a', labelId: 'label-blue' },
          { assignedAt: '2026-06-30T00:00:02.000Z', chatId: 'chat-b', labelId: 'label-red' },
        ],
        tagBindings: [
          { assignedAt: '2026-06-30T00:00:02.000Z', chatId: 'chat-b', tagId: 'tag-derived' },
          { assignedAt: '2026-06-30T00:00:01.000Z', chatId: 'chat-a', tagId: 'tag-human' },
        ],
      },
      categories: [
        { createdAt: '2026-06-30T00:00:00.000Z', deleted: false, id: 'cat-child', meta: { rank: 2 }, name: 'Child', parentId: 'cat-root', source: 'user', updatedAt: '2026-06-30T00:00:02.000Z' },
        { createdAt: '2026-06-30T00:00:00.000Z', deleted: false, id: 'cat-root', meta: { rank: 1 }, name: 'Root', parentId: null, source: 'user', updatedAt: '2026-06-30T00:00:01.000Z' },
      ],
      chats: [
        { categoryId: 'cat-child', id: 'chat-b', isDeleted: true, meta: { projection: 'metadata-only' }, title: 'Second', updatedAt: '2026-06-30T00:00:12.000Z' },
        { categoryId: 'cat-root', id: 'chat-a', isDeleted: false, meta: { projection: 'metadata-only' }, title: 'First', updatedAt: '2026-06-30T00:00:11.000Z' },
      ],
      folders: [
        { color: '#4f9fdd', deleted: false, id: 'folder-root', meta: { sortOrder: 10 }, name: 'Inbox', parentId: null, updatedAt: '2026-06-30T00:00:05.000Z' },
      ],
      labels: [
        { color: '#ff0000', createdAt: '2026-06-30T00:00:00.000Z', deleted: false, id: 'label-red', meta: {}, name: 'Red', source: 'user', updatedAt: '2026-06-30T00:00:03.000Z' },
        { color: '#0000ff', createdAt: '2026-06-30T00:00:00.000Z', deleted: false, id: 'label-blue', meta: {}, name: 'Blue', source: 'user', updatedAt: '2026-06-30T00:00:04.000Z' },
      ],
      tags: [
        { autoDerived: false, createdAt: '2026-06-30T00:00:00.000Z', deleted: false, id: 'tag-human', meta: {}, name: 'Human' },
        { autoDerived: true, createdAt: '2026-06-30T00:00:00.000Z', deleted: false, id: 'tag-derived', meta: {}, name: 'Derived' },
      ],
      tombstones: [
        { deletedAt: '2026-06-30T00:00:20.000Z', recordId: 'label-old', recordKind: 'label', restoredAt: null },
      ],
    },
    requestTypes: {
      appliedAllowlist: CORE_REQUEST_TYPES.slice(),
      registryVersion: 1,
    },
    safety: {
      noAssetDelete: true,
      noChatDelete: true,
      noHardDelete: true,
      noPurge: true,
      noSnapshotDelete: true,
    },
    version: {
      exportId: 'export-a7-fixture',
      minorVersion: 0,
      schema: 'h2o.studio.fullBundle.v3',
      schemaVersion: 3,
      sequenceNumber: 7,
      sourcePeer: 'peer-a7-fixture',
    },
  };
}

function shuffledEquivalentProjection() {
  const b = baseProjection();
  return {
    requestTypes: { registryVersion: 1, appliedAllowlist: CORE_REQUEST_TYPES.slice().reverse() },
    projection: {
      tombstones: b.projection.tombstones.slice().reverse(),
      tags: b.projection.tags.slice().reverse(),
      labels: b.projection.labels.slice().reverse(),
      folders: b.projection.folders.slice().reverse(),
      chats: b.projection.chats.slice().reverse(),
      categories: b.projection.categories.slice().reverse(),
      bindings: {
        tagBindings: b.projection.bindings.tagBindings.slice().reverse(),
        labelBindings: b.projection.bindings.labelBindings.slice().reverse(),
        folderBindings: b.projection.bindings.folderBindings.slice().reverse(),
      },
    },
    safety: { noSnapshotDelete: true, noPurge: true, noHardDelete: true, noChatDelete: true, noAssetDelete: true },
    envelope: b.envelope,
    authority: { productSyncReady: false, canonicalRole: 'desktop', authorityEpoch: 0 },
    version: b.version,
  };
}

function walkKeys(value, seen = []) {
  if (!value || typeof value !== 'object') return seen;
  if (Array.isArray(value)) {
    value.forEach((entry) => walkKeys(entry, seen));
    return seen;
  }
  Object.keys(value).forEach((key) => {
    seen.push(key);
    walkKeys(value[key], seen);
  });
  return seen;
}

function validateRequiredFields(bundle) {
  const errors = [];
  function req(value, name) {
    if (value === null || typeof value === 'undefined' || value === '') errors.push(name);
  }
  req(bundle.envelope && bundle.envelope.payloadHash, 'envelope.payloadHash');
  req(bundle.authority && bundle.authority.canonicalRole, 'authority.canonicalRole');
  if (!Array.isArray(bundle.requestTypes && bundle.requestTypes.appliedAllowlist) ||
      bundle.requestTypes.appliedAllowlist.length !== CORE_REQUEST_TYPES.length) {
    errors.push('requestTypes.appliedAllowlist');
  }
  bundle.projection.categories.forEach((row, i) => {
    req(row.id, `categories.${i}.id`);
    req(row.name, `categories.${i}.name`);
    if (!Object.prototype.hasOwnProperty.call(row, 'parentId')) errors.push(`categories.${i}.parentId`);
    if (!Object.prototype.hasOwnProperty.call(row, 'deleted')) errors.push(`categories.${i}.deleted`);
  });
  bundle.projection.labels.forEach((row, i) => {
    req(row.id, `labels.${i}.id`);
    req(row.name, `labels.${i}.name`);
    if (!Object.prototype.hasOwnProperty.call(row, 'color')) errors.push(`labels.${i}.color`);
    if (!Object.prototype.hasOwnProperty.call(row, 'deleted')) errors.push(`labels.${i}.deleted`);
  });
  bundle.projection.tags.forEach((row, i) => {
    req(row.id, `tags.${i}.id`);
    req(row.name, `tags.${i}.name`);
    if (!Object.prototype.hasOwnProperty.call(row, 'autoDerived')) errors.push(`tags.${i}.autoDerived`);
    if (!Object.prototype.hasOwnProperty.call(row, 'deleted')) errors.push(`tags.${i}.deleted`);
  });
  bundle.projection.chats.forEach((row, i) => {
    req(row.id, `chats.${i}.id`);
    if (!Object.prototype.hasOwnProperty.call(row, 'categoryId')) errors.push(`chats.${i}.categoryId`);
    if (!Object.prototype.hasOwnProperty.call(row, 'isDeleted')) errors.push(`chats.${i}.isDeleted`);
  });
  bundle.projection.bindings.labelBindings.forEach((row, i) => {
    req(row.chatId, `labelBindings.${i}.chatId`);
    req(row.labelId, `labelBindings.${i}.labelId`);
  });
  bundle.projection.bindings.tagBindings.forEach((row, i) => {
    req(row.chatId, `tagBindings.${i}.chatId`);
    req(row.tagId, `tagBindings.${i}.tagId`);
  });
  bundle.projection.bindings.folderBindings.forEach((row, i) => {
    req(row.chatId, `folderBindings.${i}.chatId`);
    req(row.folderId, `folderBindings.${i}.folderId`);
  });
  bundle.projection.tombstones.forEach((row, i) => {
    req(row.recordKind, `tombstones.${i}.recordKind`);
    req(row.recordId, `tombstones.${i}.recordId`);
  });
  return errors;
}

function parseProjectionEnvelope(bundle) {
  if (!bundle || !bundle.version) return { ok: false, status: 'rejected' };
  if (bundle.version.schemaVersion > 3) return { ok: false, status: 'unknown-major-quarantined' };
  if (bundle.version.schemaVersion < 3) return { ok: false, status: 'unsupported-major' };
  const allowlist = bundle.requestTypes && bundle.requestTypes.appliedAllowlist;
  if (!Array.isArray(allowlist) || allowlist.slice().sort().join('|') !== CORE_REQUEST_TYPES.slice().sort().join('|')) {
    return { ok: false, status: 'request-allowlist-rejected' };
  }
  return { ok: true, status: 'accepted' };
}

const contract = exists(A6_CONTRACT_REL) ? readRepo(A6_CONTRACT_REL) : '';
const tagsUpdatedAtDecision = exists(TAGS_UPDATED_AT_DECISION_REL) ? readRepo(TAGS_UPDATED_AT_DECISION_REL) : '';

console.log('[sync-metadata-v3-projection-field-contract] A7 field-contract harness checks');

check('[A6] field-level projection contract exists', () => {
  assert.ok(exists(A6_CONTRACT_REL), 'missing A6 field contract');
  assert.match(contract, /A6 V3 PROJECTION FIELD CONTRACT[\s\S]*pre-freeze[\s\S]*v3 reserved not minted[\s\S]*productSyncReady:false/i);
});

check('[A6] required contract decisions are present', () => {
  ['version', 'safety', 'envelope', 'authority', 'projection', 'requestTypes'].forEach((block) => {
    assert.match(contract, new RegExp('### `' + block + '`', 'i'), `missing top-level block ${block}`);
  });
  assert.match(contract, /payloadHash/i);
  assert.match(contract, /envelopeId`: `null/i);
  assert.match(contract, /producerDeviceId`: `null/i);
  assert.match(contract, /logicalClock`: `null/i);
  assert.match(contract, /signature`: `null/i);
  assert.match(contract, /canonicalRole`: `desktop/i);
  assert.match(contract, /authorityEpoch`: `0/i);
  CORE_REQUEST_TYPES.forEach((type) => assert.match(contract, new RegExp(type, 'i'), `missing request type ${type}`));
  assert.match(contract, /\.h2ochat` package bodies/i);
  assert.match(contract, /runtime `tags` table has no `updated_at` column/i);
});

check('[TAGS UPDATED_AT] decision note exists and locks pre-freeze sequencing', () => {
  assert.ok(exists(TAGS_UPDATED_AT_DECISION_REL), 'missing tags.updated_at decision note');
  assert.match(tagsUpdatedAtDecision, /DEFER MIGRATION TO MULTI-WRITER/i);
  assert.match(tagsUpdatedAtDecision, /v3 single-canonical unaffected/i);
  assert.match(tagsUpdatedAtDecision, /productSyncReady:false/i);
  assert.match(tagsUpdatedAtDecision, /Do not freeze `createdAt` as the hard tag LWW basis/i);
  assert.match(tagsUpdatedAtDecision, /Do not synthesize `updatedAt`/i);
  assert.match(tagsUpdatedAtDecision, /Future v18 migration/i);
  assert.match(tagsUpdatedAtDecision, /f17 v13 migration-drift fix/i);
});

check('[CONTRACT] field-level sections cover required projection fields', () => {
  Object.entries(CONTRACT_FIELD_PATTERNS).forEach(([section, patterns]) => {
    assertContractSection(contract, `projection.${section}`, patterns);
  });
});

check('[SCHEMA] runtime schema/store fields are covered and tags.updated_at gap is explicit', () => {
  const schema = readRepo(LIB_RS_REL);
  Object.entries(TABLE_FIELD_EXPECTATIONS).forEach(([tableName, fields]) => assertTableFields(schema, tableName, fields));
  const chats = tableBlock(schema, 'chats');
  assert.match(chats, /\bid\b/);
  assert.match(chats, /\btitle\b/);
  assert.match(chats, /\bcategory_id\b/);
  assert.match(chats, /\bis_deleted\b/);
  assert.match(chats, /\bupdated_at\b/);
  assert.match(chats, /\bmeta_json\b/);
  assert.match(schema, /CREATE TABLE(?: IF NOT EXISTS)? sync_tombstones/i);
  const tags = tableBlock(schema, 'tags');
  assert.ok(!/\bupdated_at\b/.test(tags), 'tags unexpectedly has updated_at; A6 gap must be revisited');
  assert.ok(!/Migration\s+v18|v18\s+[—-]|tags\.updated_at/.test(schema), 'premature v18/tags.updated_at migration marker found');
  STORE_RELS.forEach((rel) => assert.ok(exists(rel), `missing store file ${rel}`));
});

check('[TAGS UPDATED_AT] optional/absent in sample; createdAt is not hard LWW; updatedAt is not synthesized', () => {
  const sample = attachHash(baseProjection());
  sample.projection.tags.forEach((tag) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(tag, 'updatedAt'), 'sample tag unexpectedly has updatedAt');
  });
  assert.match(contract, /updatedAt`: optional or absent/i);
  assert.match(tagsUpdatedAtDecision, /keep `tags\.updatedAt` optional/i);
  assertAbsent(A6_CONTRACT_REL, contract, HARD_TAG_LWW_CREATED_AT_PATTERNS, 'hard tag createdAt LWW basis');
  assertAbsent('A7 sample fixture', JSON.stringify(sample), SYNTHETIC_TAG_UPDATED_AT_PATTERNS, 'synthetic tag updatedAt');
  assertAbsent(A6_CONTRACT_REL, contract, SYNTHETIC_TAG_UPDATED_AT_PATTERNS, 'synthetic tag updatedAt');
  const tagsStore = codeOf('src-surfaces-base/studio/store/tags.tauri.js');
  assert.ok(!/\bupdated_at\b/.test(tagsStore), 'tags store unexpectedly writes updated_at before v18');
});

check('[EXCLUSION] contract and sample exclude content, pointers, package bodies, full tombstone fields, secrets, and Chrome state', () => {
  EXCLUDED_TERMS.forEach((term) => assert.match(contract, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `A6 missing exclusion ${term}`));
  const sample = attachHash(baseProjection());
  const keys = walkKeys(sample);
  FORBIDDEN_SAMPLE_KEYS.forEach((key) => {
    assert.ok(!keys.includes(key), `sample projection includes forbidden key ${key}`);
  });
});

check('[HASH] canonical payloadHash is deterministic and excludes transmission fields', () => {
  const sample = attachHash(baseProjection());
  const shuffled = attachHash(shuffledEquivalentProjection());
  assert.equal(sample.envelope.payloadHash, shuffled.envelope.payloadHash, 'shuffled logical projection changed payloadHash');

  const changedRenderable = structuredClone(sample);
  changedRenderable.projection.labels[0].name = 'Changed Label';
  assert.notEqual(computePayloadHash(sample), computePayloadHash(changedRenderable), 'renderable field did not change payloadHash');

  const changedTransmission = structuredClone(sample);
  changedTransmission.envelope.envelopeId = 'env-different';
  changedTransmission.envelope.producerDeviceId = 'device-different';
  changedTransmission.envelope.producedAt = '2030-01-01T00:00:00.000Z';
  changedTransmission.envelope.logicalClock = 'clock-different';
  changedTransmission.envelope.signature = 'signature-different';
  changedTransmission.version.sequenceNumber = 999;
  changedTransmission.version.exportId = 'export-different';
  assert.equal(computePayloadHash(sample), computePayloadHash(changedTransmission), 'excluded transmission fields changed payloadHash');
});

check('[REQUIRED] sample required-field validator rejects missing required fields', () => {
  const valid = attachHash(baseProjection());
  assert.deepEqual(validateRequiredFields(valid), []);
  const invalid = attachHash(baseProjection());
  delete invalid.projection.categories[0].parentId;
  delete invalid.projection.labels[0].color;
  delete invalid.projection.tags[0].autoDerived;
  delete invalid.projection.chats[0].categoryId;
  delete invalid.projection.bindings.labelBindings[0].labelId;
  delete invalid.projection.bindings.tagBindings[0].tagId;
  delete invalid.projection.bindings.folderBindings[0].folderId;
  delete invalid.projection.tombstones[0].recordKind;
  invalid.envelope.payloadHash = null;
  assert.ok(validateRequiredFields(invalid).length >= 8, 'missing required fields were not flagged');
});

check('[RESERVED] reserved identity/clock/signature fields remain null in pre-freeze sample', () => {
  const sample = attachHash(baseProjection());
  assert.equal(sample.envelope.envelopeId, null);
  assert.equal(sample.envelope.producerDeviceId, null);
  assert.equal(sample.envelope.logicalClock, null);
  assert.equal(sample.envelope.signature, null);
});

check('[VERSION] v3.1 additive minor is tolerated; v4 unknown major is quarantined; allowlist remains four-core', () => {
  const minor = attachHash(baseProjection());
  minor.version.minorVersion = 1;
  minor.projection.labels[0].futureOptionalField = 'ignored-by-v3.0-consumers';
  minor.envelope.payloadHash = computePayloadHash(minor);
  assert.deepEqual(parseProjectionEnvelope(minor), { ok: true, status: 'accepted' });

  const major = attachHash(baseProjection());
  major.version.schemaVersion = 4;
  major.version.schema = 'h2o.studio.fullBundle.v4';
  assert.deepEqual(parseProjectionEnvelope(major), { ok: false, status: 'unknown-major-quarantined' });

  const applied = parseAppliedAllowlist(readRepo(FOLDER_SYNC_REL));
  assert.deepEqual(applied, CORE_REQUEST_TYPES.slice().sort(), 'runtime applied allowlist drifted');
});

check('[NO PREMATURE MINT] runtime remains v2/local, productSyncReady false, WebDAV deferred, identity absent, package bodies excluded', () => {
  [EXPORT_BUNDLE_REL, FOLDER_SYNC_REL, FOLDER_IMPORT_REL, WEBDAV_RELAY_REL].forEach((rel) => {
    assertAbsent(rel, codeOf(rel), V3_RUNTIME_PATTERNS, 'runtime v3 pattern');
    assertAbsent(rel, codeOf(rel), IDENTITY_RUNTIME_PATTERNS, 'identity/key runtime pattern');
  });
  [EXPORT_BUNDLE_REL, FOLDER_SYNC_REL, FOLDER_IMPORT_REL].forEach((rel) => {
    const code = codeOf(rel);
    assert.match(code, /productSyncReady:\s*false/i, `${rel} missing productSyncReady false`);
    assertAbsent(rel, code, PRODUCT_READY_TRUE_PATTERNS, 'productSyncReady true pattern');
    assertAbsent(rel, code, PACKAGE_BODY_PATTERNS, 'package body metadata path');
  });
  assert.match(codeOf(FOLDER_SYNC_REL), /webdav:\s*'deferred'/i);
  assert.match(codeOf(FOLDER_IMPORT_REL), /webdav:\s*'deferred'/i);
});

if (FAIL.length) {
  console.error('');
  console.error('FAIL validate-sync-metadata-v3-projection-field-contract-v1');
  for (const failure of FAIL) console.error(`- ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log('');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.metadata-v3-projection-field-contract.v1',
  status: 'passed',
  preFreeze: true,
  fullBundleV3Minted: false,
  productSyncReady: false,
  sampleProjection: {
    categories: 2,
    labels: 2,
    tags: 2,
    folders: 1,
    chats: 2,
    labelBindings: 2,
    tagBindings: 2,
    folderBindings: 2,
    tombstones: 1,
  },
  payloadHash: attachHash(baseProjection()).envelope.payloadHash,
  scannedFiles: SCANNED_RELS,
  checks: PASS.length,
}, null, 2));
console.log('PASS validate-sync-metadata-v3-projection-field-contract-v1');
