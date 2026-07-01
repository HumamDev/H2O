#!/usr/bin/env node
// Operational.3 - deterministic label/tag bind-unbind harness.
//
// In-memory SQLite proof only. This does not touch the live Desktop DB or any
// runtime sync transport. It mirrors the single-canonical request/receipt
// behavior needed to prove chat-label-unbind and chat-tag-unbind readiness.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const OPERATIONAL_0_REL = 'release-evidence/2026-06-30/sync-operational-0-request-mutation-readiness-contract.md';
const OPERATIONAL_2_REL = 'release-evidence/2026-06-30/sync-operational-2-label-tag-unbind-implementation.md';
const FOLDER_SYNC_REL = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const AUTO_IMPORT_REL = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const FOLDER_IMPORT_REL = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const WEBDAV_GATES_REL = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const DIAG_REL = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';

const SIX_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
  'chat-label-unbind',
  'chat-tag-unbind',
];

const CHAT_ID = 'op3-chat';
const LABEL_ID = 'op3-label';
const TAG_ID = 'op3-tag';
const CATEGORY_ID = 'op3-category';
const FOLDER_ID = 'op3-folder';

const PASS = [];
const FAIL = [];

function repoPath(rel) {
  return path.join(REPO_ROOT, rel);
}

function readRepo(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  throw new Error(`unsupported canonical value type ${typeof value}`);
}

function sha256Canonical(value) {
  return 'sha256-' + crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function sortById(rows) {
  return rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function normalizeRows(rows, keyFn) {
  return rows.slice().sort((a, b) => String(keyFn(a)).localeCompare(String(keyFn(b))));
}

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE labels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      auto_derived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE label_bindings (
      chat_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, label_id)
    );
    CREATE TABLE tag_bindings (
      chat_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, tag_id)
    );
    CREATE TABLE folder_bindings (
      chat_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, folder_id)
    );
    CREATE TABLE receipts (
      request_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      code TEXT NOT NULL,
      writes INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);
  seedBase(db);
  return db;
}

function seedBase(db) {
  db.prepare('INSERT INTO chats (id, title, category_id, is_deleted, updated_at, meta_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    CHAT_ID, 'Operational 3 Chat', CATEGORY_ID, 0, 1000, JSON.stringify({ fixture: 'op3' }));
  db.prepare('INSERT INTO labels (id, name, color, updated_at) VALUES (?, ?, ?, ?)').run(LABEL_ID, 'Operational Label', '#4078f2', 1001);
  db.prepare('INSERT INTO tags (id, name, auto_derived, created_at) VALUES (?, ?, ?, ?)').run(TAG_ID, 'operational-tag', 0, 1002);
  db.prepare('INSERT INTO categories (id, name, updated_at) VALUES (?, ?, ?)').run(CATEGORY_ID, 'Operational Category', 1003);
  db.prepare('INSERT INTO folders (id, name, updated_at) VALUES (?, ?, ?)').run(FOLDER_ID, 'Operational Folder', 1004);
  db.prepare('INSERT INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)').run(CHAT_ID, FOLDER_ID, 1005);
}

function count(db, tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${tableName}`).get().n);
}

function row(db, sql, ...params) {
  return db.prepare(sql).get(...params) || null;
}

function all(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

function bindingExists(db, tableName, chatId, entityId) {
  if (tableName === 'label_bindings') {
    return !!row(db, 'SELECT 1 AS ok FROM label_bindings WHERE chat_id=? AND label_id=?', chatId, entityId);
  }
  if (tableName === 'tag_bindings') {
    return !!row(db, 'SELECT 1 AS ok FROM tag_bindings WHERE chat_id=? AND tag_id=?', chatId, entityId);
  }
  throw new Error(`unknown binding table ${tableName}`);
}

function catalogSignature(db) {
  return sha256Canonical({
    categories: all(db, 'SELECT * FROM categories'),
    folders: all(db, 'SELECT * FROM folders'),
    labels: all(db, 'SELECT * FROM labels'),
    tags: all(db, 'SELECT * FROM tags'),
  });
}

function tableCounts(db) {
  return {
    categories: count(db, 'categories'),
    chats: count(db, 'chats'),
    folders: count(db, 'folders'),
    labelBindings: count(db, 'label_bindings'),
    labels: count(db, 'labels'),
    receipts: count(db, 'receipts'),
    tagBindings: count(db, 'tag_bindings'),
    tags: count(db, 'tags'),
  };
}

function projection(db) {
  return {
    bindings: {
      folderBindings: normalizeRows(all(db, 'SELECT chat_id AS chatId, folder_id AS folderId FROM folder_bindings'), (r) => `${r.chatId}:${r.folderId}`),
      labelBindings: normalizeRows(all(db, 'SELECT chat_id AS chatId, label_id AS labelId FROM label_bindings'), (r) => `${r.chatId}:${r.labelId}`),
      tagBindings: normalizeRows(all(db, 'SELECT chat_id AS chatId, tag_id AS tagId FROM tag_bindings'), (r) => `${r.chatId}:${r.tagId}`),
    },
    categories: sortById(all(db, 'SELECT id, name FROM categories')),
    chats: sortById(all(db, 'SELECT id, title, category_id AS categoryId, is_deleted AS isDeleted FROM chats')),
    folders: sortById(all(db, 'SELECT id, name FROM folders')),
    labels: sortById(all(db, 'SELECT id, name, color FROM labels')),
    tags: sortById(all(db, 'SELECT id, name, auto_derived AS autoDerived FROM tags')),
  };
}

function projectionHash(db) {
  return sha256Canonical(projection(db));
}

function receiptPayload(request, status, code, writes, beforeHash, afterHash) {
  return {
    action: request.action,
    basisObserved: !!request.expectedCurrentBasisHash,
    basisRejected: false,
    beforeProjectionHash: beforeHash,
    afterProjectionHash: afterHash,
    payload: request.payload || {},
    requestId: request.requestId,
    status,
    code,
    writes,
  };
}

function writeReceipt(db, request, status, code, writes, beforeHash, afterHash) {
  const payload = receiptPayload(request, status, code, writes, beforeHash, afterHash);
  db.prepare('INSERT INTO receipts (request_id, action, status, code, writes, payload_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    request.requestId,
    request.action,
    status,
    code,
    Number(writes || 0),
    JSON.stringify(payload),
  );
  return payload;
}

function existingReceipt(db, requestId) {
  const hit = row(db, 'SELECT * FROM receipts WHERE request_id=?', requestId);
  if (!hit) return null;
  return { ...JSON.parse(hit.payload_json), deduped: true, writes: 0 };
}

function reject(db, request, code, beforeHash) {
  return writeReceipt(db, request, 'rejected', code, 0, beforeHash, beforeHash);
}

function noop(db, request, code, beforeHash) {
  return writeReceipt(db, request, 'noop', code, 0, beforeHash, beforeHash);
}

function requireRequest(request) {
  assert.ok(request && typeof request === 'object', 'request object required');
  assert.ok(request.requestId, 'request id required');
  assert.ok(SIX_TYPES.includes(request.action), `unsupported action ${request.action}`);
}

function validateChatAndEntity(db, request, entityKind) {
  const payload = request.payload || {};
  const chatId = payload.chatId;
  const entityId = entityKind === 'label' ? payload.labelId : payload.tagId;
  if (!row(db, 'SELECT id FROM chats WHERE id=? AND is_deleted=0', chatId)) {
    return { ok: false, code: 'library-metadata-mutation-request-chat-not-found' };
  }
  if (entityKind === 'label' && !row(db, 'SELECT id FROM labels WHERE id=?', entityId)) {
    return { ok: false, code: 'library-metadata-mutation-request-label-not-found' };
  }
  if (entityKind === 'tag' && !row(db, 'SELECT id FROM tags WHERE id=?', entityId)) {
    return { ok: false, code: 'library-metadata-mutation-request-tag-not-found' };
  }
  return { ok: true, chatId, entityId };
}

function applyRequest(db, request) {
  requireRequest(request);
  const deduped = existingReceipt(db, request.requestId);
  if (deduped) return deduped;

  const beforeHash = projectionHash(db);
  const beforeCatalog = catalogSignature(db);
  const beforeCounts = tableCounts(db);
  const beforeChatDeleted = row(db, 'SELECT is_deleted FROM chats WHERE id=?', CHAT_ID)?.is_deleted;
  let result;

  if (request.action === 'chat-label-bind' || request.action === 'chat-label-unbind') {
    const valid = validateChatAndEntity(db, request, 'label');
    if (!valid.ok) result = reject(db, request, valid.code, beforeHash);
    else {
      const exists = bindingExists(db, 'label_bindings', valid.chatId, valid.entityId);
      if (request.action === 'chat-label-bind') {
        if (exists) result = noop(db, request, 'library-metadata-mutation-request-already-bound-canonical', beforeHash);
        else {
          const changes = db.prepare('INSERT INTO label_bindings (chat_id, label_id, assigned_at) VALUES (?, ?, ?)').run(valid.chatId, valid.entityId, 2000).changes;
          result = writeReceipt(db, request, 'applied', 'library-metadata-mutation-request-applied', changes, beforeHash, projectionHash(db));
        }
      } else if (!exists) {
        result = noop(db, request, 'library-metadata-mutation-request-already-unbound-canonical', beforeHash);
      } else {
        const changes = db.prepare('DELETE FROM label_bindings WHERE chat_id=? AND label_id=?').run(valid.chatId, valid.entityId).changes;
        result = writeReceipt(db, request, 'applied', 'library-metadata-mutation-request-applied', changes, beforeHash, projectionHash(db));
      }
    }
  } else if (request.action === 'chat-tag-bind' || request.action === 'chat-tag-unbind') {
    const valid = validateChatAndEntity(db, request, 'tag');
    if (!valid.ok) result = reject(db, request, valid.code, beforeHash);
    else {
      const exists = bindingExists(db, 'tag_bindings', valid.chatId, valid.entityId);
      if (request.action === 'chat-tag-bind') {
        if (exists) result = noop(db, request, 'library-metadata-mutation-request-already-bound-canonical', beforeHash);
        else {
          const changes = db.prepare('INSERT INTO tag_bindings (chat_id, tag_id, assigned_at) VALUES (?, ?, ?)').run(valid.chatId, valid.entityId, 2001).changes;
          result = writeReceipt(db, request, 'applied', 'library-metadata-mutation-request-applied', changes, beforeHash, projectionHash(db));
        }
      } else if (!exists) {
        result = noop(db, request, 'library-metadata-mutation-request-already-unbound-canonical', beforeHash);
      } else {
        const changes = db.prepare('DELETE FROM tag_bindings WHERE chat_id=? AND tag_id=?').run(valid.chatId, valid.entityId).changes;
        result = writeReceipt(db, request, 'applied', 'library-metadata-mutation-request-applied', changes, beforeHash, projectionHash(db));
      }
    }
  } else {
    result = reject(db, request, 'library-metadata-mutation-request-harness-category-action-not-exercised', beforeHash);
  }

  const afterCatalog = catalogSignature(db);
  const afterCounts = tableCounts(db);
  const afterChatDeleted = row(db, 'SELECT is_deleted FROM chats WHERE id=?', CHAT_ID)?.is_deleted;
  result.boundaries = {
    catalogTablesUnchanged: beforeCatalog === afterCatalog,
    chatRowsUnchanged: beforeCounts.chats === afterCounts.chats,
    noChatDeletion: beforeChatDeleted === afterChatDeleted,
    noLabelEntityDeletion: beforeCounts.labels === afterCounts.labels,
    noTagEntityDeletion: beforeCounts.tags === afterCounts.tags,
  };
  return result;
}

function labelBindRequest(id = 'req-label-bind', chatId = CHAT_ID, labelId = LABEL_ID, basis = 'sha256-stale-label-basis') {
  return { requestId: id, action: 'chat-label-bind', expectedCurrentBasisHash: basis, payload: { chatId, labelId } };
}

function labelUnbindRequest(id = 'req-label-unbind', chatId = CHAT_ID, labelId = LABEL_ID, basis = 'sha256-stale-label-basis') {
  return { requestId: id, action: 'chat-label-unbind', expectedCurrentBasisHash: basis, payload: { chatId, labelId } };
}

function tagBindRequest(id = 'req-tag-bind', chatId = CHAT_ID, tagId = TAG_ID, basis = 'sha256-stale-tag-basis') {
  return { requestId: id, action: 'chat-tag-bind', expectedCurrentBasisHash: basis, payload: { chatId, tagId } };
}

function tagUnbindRequest(id = 'req-tag-unbind', chatId = CHAT_ID, tagId = TAG_ID, basis = 'sha256-stale-tag-basis') {
  return { requestId: id, action: 'chat-tag-unbind', expectedCurrentBasisHash: basis, payload: { chatId, tagId } };
}

function assertZeroWrite(result) {
  assert.equal(result.writes, 0, 'expected zero write result');
}

function assertBoundaryClean(result) {
  assert.equal(result.boundaries.catalogTablesUnchanged, true, 'catalog tables mutated');
  assert.equal(result.boundaries.chatRowsUnchanged, true, 'chat row count changed');
  assert.equal(result.boundaries.noChatDeletion, true, 'chat deletion state changed');
  assert.equal(result.boundaries.noLabelEntityDeletion, true, 'label entity count changed');
  assert.equal(result.boundaries.noTagEntityDeletion, true, 'tag entity count changed');
}

function runtimeCode(rel) {
  return stripComments(readRepo(rel));
}

console.log('[sync-operational-label-tag-unbind-harness] Operational.3 checks');

check('[CONTRACT] Operational.0/O2 evidence exists and names six applied request types', () => {
  const o0 = readRepo(OPERATIONAL_0_REL);
  const o2 = readRepo(OPERATIONAL_2_REL);
  for (const type of SIX_TYPES) {
    assert.ok(o0.includes(type), `Operational.0 missing ${type}`);
    assert.ok(o2.includes(type), `Operational.2 missing ${type}`);
  }
  assert.match(o2, /OPERATIONAL\.2 LABEL\/TAG UNBIND IMPLEMENTATION - IMPLEMENTED/i);
});

check('[SYMMETRY] label bind creates row, label unbind removes exact row, projection drops binding', () => {
  const db = createDb();
  const before = tableCounts(db);
  const hash0 = projectionHash(db);
  const bind = applyRequest(db, labelBindRequest());
  assert.equal(bind.status, 'applied');
  assert.equal(bind.writes, 1);
  assert.equal(bindingExists(db, 'label_bindings', CHAT_ID, LABEL_ID), true);
  assert.equal(tableCounts(db).labelBindings, before.labelBindings + 1);
  assert.notEqual(projectionHash(db), hash0, 'label bind must change projection hash');

  const hashBound = projectionHash(db);
  const unbind = applyRequest(db, labelUnbindRequest());
  assert.equal(unbind.status, 'applied');
  assert.equal(unbind.writes, 1);
  assertBoundaryClean(unbind);
  assert.equal(bindingExists(db, 'label_bindings', CHAT_ID, LABEL_ID), false);
  assert.equal(tableCounts(db).labelBindings, before.labelBindings);
  assert.equal(projection(db).bindings.labelBindings.length, 0, 'projection still lists label binding');
  assert.notEqual(projectionHash(db), hashBound, 'label unbind must change projection hash');
  db.close();
});

check('[SYMMETRY] tag bind creates row, tag unbind removes exact row, projection drops binding', () => {
  const db = createDb();
  const before = tableCounts(db);
  const hash0 = projectionHash(db);
  const bind = applyRequest(db, tagBindRequest());
  assert.equal(bind.status, 'applied');
  assert.equal(bind.writes, 1);
  assert.equal(bindingExists(db, 'tag_bindings', CHAT_ID, TAG_ID), true);
  assert.equal(tableCounts(db).tagBindings, before.tagBindings + 1);
  assert.notEqual(projectionHash(db), hash0, 'tag bind must change projection hash');

  const hashBound = projectionHash(db);
  const unbind = applyRequest(db, tagUnbindRequest());
  assert.equal(unbind.status, 'applied');
  assert.equal(unbind.writes, 1);
  assertBoundaryClean(unbind);
  assert.equal(bindingExists(db, 'tag_bindings', CHAT_ID, TAG_ID), false);
  assert.equal(tableCounts(db).tagBindings, before.tagBindings);
  assert.equal(projection(db).bindings.tagBindings.length, 0, 'projection still lists tag binding');
  assert.notEqual(projectionHash(db), hashBound, 'tag unbind must change projection hash');
  db.close();
});

check('[NOOP] already-unbound label/tag return noop with zero writes', () => {
  const db = createDb();
  const counts0 = tableCounts(db);
  const label = applyRequest(db, labelUnbindRequest('req-label-unbind-noop'));
  const tag = applyRequest(db, tagUnbindRequest('req-tag-unbind-noop'));
  assert.equal(label.status, 'noop');
  assert.equal(label.code, 'library-metadata-mutation-request-already-unbound-canonical');
  assert.equal(tag.status, 'noop');
  assert.equal(tag.code, 'library-metadata-mutation-request-already-unbound-canonical');
  assertZeroWrite(label);
  assertZeroWrite(tag);
  const counts1 = tableCounts(db);
  assert.equal(counts1.labelBindings, counts0.labelBindings);
  assert.equal(counts1.tagBindings, counts0.tagBindings);
  assert.equal(counts1.labels, counts0.labels);
  assert.equal(counts1.tags, counts0.tags);
  db.close();
});

check('[DEDUPE] repeated requestId returns existing receipt with zero writes', () => {
  const db = createDb();
  const first = applyRequest(db, labelBindRequest('req-dedupe-label-bind'));
  assert.equal(first.status, 'applied');
  assert.equal(first.writes, 1);
  const receiptsAfterFirst = count(db, 'receipts');
  const second = applyRequest(db, labelBindRequest('req-dedupe-label-bind'));
  assert.equal(second.deduped, true);
  assert.equal(second.status, 'applied');
  assert.equal(second.writes, 0);
  assert.equal(count(db, 'receipts'), receiptsAfterFirst);
  assert.equal(tableCounts(db).labelBindings, 1);
  db.close();
});

check('[REJECTION] invalid chat/entity returns rejected with reason and zero binding/catalog writes', () => {
  const cases = [
    labelBindRequest('req-missing-chat-label', 'missing-chat', LABEL_ID),
    labelUnbindRequest('req-missing-label', CHAT_ID, 'missing-label'),
    tagBindRequest('req-missing-chat-tag', 'missing-chat', TAG_ID),
    tagUnbindRequest('req-missing-tag', CHAT_ID, 'missing-tag'),
  ];
  for (const req of cases) {
    const db = createDb();
    const counts0 = tableCounts(db);
    const catalog0 = catalogSignature(db);
    const out = applyRequest(db, req);
    assert.equal(out.status, 'rejected', `${req.requestId} did not reject`);
    assert.match(out.code, /not-found/);
    assertZeroWrite(out);
    assert.equal(tableCounts(db).labelBindings, counts0.labelBindings);
    assert.equal(tableCounts(db).tagBindings, counts0.tagBindings);
    assert.equal(catalogSignature(db), catalog0);
    db.close();
  }
});

check('[ORDERING] bind -> unbind -> bind follows canonical receipt order; basis mismatch is inert', () => {
  const db = createDb();
  const a = applyRequest(db, labelBindRequest('req-order-bind-a', CHAT_ID, LABEL_ID, 'sha256-basis-a'));
  const b = applyRequest(db, labelUnbindRequest('req-order-unbind-b', CHAT_ID, LABEL_ID, 'sha256-stale-mismatch'));
  const c = applyRequest(db, labelBindRequest('req-order-bind-c', CHAT_ID, LABEL_ID, 'sha256-even-staler'));
  assert.equal(a.status, 'applied');
  assert.equal(b.status, 'applied');
  assert.equal(c.status, 'applied');
  assert.equal(a.basisObserved, true);
  assert.equal(b.basisRejected, false);
  assert.equal(c.basisRejected, false);
  assert.equal(bindingExists(db, 'label_bindings', CHAT_ID, LABEL_ID), true, 'last canonical request did not win');
  assert.equal(tableCounts(db).labelBindings, 1);
  db.close();
});

check('[HASH] post-unbind projection hash changes on removal and remains stable for same logical state', () => {
  const dbA = createDb();
  const dbB = createDb();
  applyRequest(dbA, labelBindRequest('req-hash-label-bind-a'));
  const boundHash = projectionHash(dbA);
  applyRequest(dbA, labelUnbindRequest('req-hash-label-unbind-a'));
  const unboundHashA = projectionHash(dbA);
  assert.notEqual(unboundHashA, boundHash, 'unbind must change projection hash');

  applyRequest(dbB, labelBindRequest('req-hash-label-bind-b'));
  applyRequest(dbB, labelUnbindRequest('req-hash-label-unbind-b'));
  const unboundHashB = projectionHash(dbB);
  assert.equal(unboundHashA, unboundHashB, 'same logical post-unbind state must hash stably');
  dbA.close();
  dbB.close();
});

check('[BOUNDARY] runtime remains productSyncReady:false, v3 unminted, WebDAV/multi-writer/archive CAS absent', () => {
  const files = [FOLDER_SYNC_REL, AUTO_IMPORT_REL, FOLDER_IMPORT_REL, WEBDAV_GATES_REL, DIAG_REL];
  for (const rel of files) {
    const code = runtimeCode(rel);
    assert.doesNotMatch(code, /productSyncReady\s*[:=]\s*true\b/i, `${rel} flips productSyncReady true`);
    assert.doesNotMatch(code, /h2o\.studio\.fullBundle\.v3/i, `${rel} mints fullBundle.v3`);
    assert.doesNotMatch(code, /\bautoApply.*WebDAV\b/i, `${rel} adds WebDAV auto-apply`);
    assert.doesNotMatch(code, /\bmulti-writer\b/i, `${rel} adds multi-writer runtime`);
    assert.doesNotMatch(code, /\.h2ochat\.enc|archivePackageCAS|uploadArchivePackage/i, `${rel} adds archive CAS transport`);
  }
});

check('[RUNTIME] Desktop source still carries six applied types and unbind apply functions', () => {
  const code = runtimeCode(FOLDER_SYNC_REL);
  for (const type of SIX_TYPES) assert.ok(code.includes(`'${type}'`), `missing ${type}`);
  assert.ok(code.includes('applyChatLabelUnbindLibraryMetadataRequest'), 'missing label unbind apply function');
  assert.ok(code.includes('applyChatTagUnbindLibraryMetadataRequest'), 'missing tag unbind apply function');
  assert.ok(code.includes('expectedCurrentBasisHash'), 'basis should still be carried diagnostically');
  assert.doesNotMatch(code, /status:\s*['"]stale_basis['"]/i, 'basis mismatch must not reject in single-canonical v1');
});

if (FAIL.length) {
  console.error('');
  console.error('FAIL validate-sync-operational-label-tag-unbind-harness-v1');
  for (const failure of FAIL) console.error(`- ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log('');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.operational-label-tag-unbind.harness.v1',
  status: 'passed',
  phase: 'operational-3-label-tag-unbind-harness',
  liveDesktopDbTouched: false,
  appliedTypes: SIX_TYPES,
  productSyncReady: false,
  fullBundleV3Minted: false,
  checks: PASS.length,
}, null, 2));
console.log('PASS validate-sync-operational-label-tag-unbind-harness-v1');
