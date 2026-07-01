#!/usr/bin/env node
// Operational.2/3 - Sync request/mutation readiness validator.
//
// Static validator only. It asserts the six single-canonical request types are
// implemented, label/tag unbind are no longer deferred destructive shapes,
// Operational.3 harness coverage exists, and
// productSyncReady/fullBundle.v3/WebDAV/multi-writer remain closed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const O0_CONTRACT_REL = 'release-evidence/2026-06-30/sync-operational-0-request-mutation-readiness-contract.md';
const O1_EVIDENCE_REL = 'release-evidence/2026-06-30/sync-operational-1-request-readiness-validator.md';
const O2_EVIDENCE_REL = 'release-evidence/2026-06-30/sync-operational-2-label-tag-unbind-implementation.md';
const O3_EVIDENCE_REL = 'release-evidence/2026-06-30/sync-operational-3-label-tag-unbind-harness.md';
const O3_HARNESS_REL = 'tools/validation/studio/validate-sync-operational-label-tag-unbind-harness-v1.mjs';
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

const CATALOG_CRUD_TYPES = [
  'label-create',
  'tag-create',
  'category-create',
  'label-rename',
  'tag-rename',
  'category-rename',
  'catalog-soft-delete',
  'catalog-restore',
  'hard-delete',
  'un-delete',
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

const o0 = exists(O0_CONTRACT_REL) ? readRepo(O0_CONTRACT_REL) : '';
const o1 = exists(O1_EVIDENCE_REL) ? readRepo(O1_EVIDENCE_REL) : '';
const o2 = exists(O2_EVIDENCE_REL) ? readRepo(O2_EVIDENCE_REL) : '';
const o3 = exists(O3_EVIDENCE_REL) ? readRepo(O3_EVIDENCE_REL) : '';
const o3Harness = exists(O3_HARNESS_REL) ? readRepo(O3_HARNESS_REL) : '';
const folderSync = readRepo(FOLDER_SYNC_REL);
const folderSyncCode = stripComments(folderSync);
const autoImportCode = codeOf(AUTO_IMPORT_REL);
const folderImportCode = codeOf(FOLDER_IMPORT_REL);
const gatesCode = readRepo(WEBDAV_GATES_REL);
const diagCode = readRepo(DIAG_REL);

console.log('[sync-operational-request-readiness] Operational.2/3 checks');

check('[CONTRACT] Operational.0 exists and requires six single-canonical request types', () => {
  assert.ok(exists(O0_CONTRACT_REL), 'missing Operational.0 contract');
  assert.match(o0, /OPERATIONAL\.0 READINESS/i);
  assert.match(o0, /single-canonical/i);
  assert.match(o0, /productSyncReady\s*:\s*false|productSyncReady[^.\n]*false/i);
  for (const type of SIX_TYPES) assert.ok(o0.includes(type), `Operational.0 missing ${type}`);
});

check('[BASELINE] Operational.1 evidence remains the planned/not-implemented baseline', () => {
  assert.ok(exists(O1_EVIDENCE_REL), 'missing Operational.1 evidence');
  assert.match(o1, /NOT IMPLEMENTED/i);
});

check('[EVIDENCE] Operational.2 implementation evidence exists', () => {
  assert.ok(exists(O2_EVIDENCE_REL), 'missing Operational.2 evidence');
  assert.match(o2, /OPERATIONAL\.2 LABEL\/TAG UNBIND IMPLEMENTATION - IMPLEMENTED/i);
  for (const type of ['chat-label-unbind', 'chat-tag-unbind']) assert.ok(o2.includes(type), `evidence missing ${type}`);
});

check('[HARNESS] Operational.3 deterministic label/tag unbind harness and evidence exist', () => {
  assert.ok(exists(O3_HARNESS_REL), 'missing Operational.3 harness');
  assert.ok(exists(O3_EVIDENCE_REL), 'missing Operational.3 evidence');
  assert.match(o3, /OPERATIONAL\.3 LABEL\/TAG UNBIND HARNESS - PASSED/i);
  assert.match(o3Harness, /label bind creates row, label unbind removes exact row/i);
  assert.match(o3Harness, /tag bind creates row, tag unbind removes exact row/i);
  assert.match(o3Harness, /already-unbound label\/tag return noop/i);
  assert.match(o3Harness, /repeated requestId returns existing receipt/i);
  assert.match(o3Harness, /invalid chat\/entity returns rejected/i);
  assert.match(o3Harness, /bind -> unbind -> bind follows canonical receipt order/i);
  assert.match(o3Harness, /basis mismatch is inert/i);
  assert.match(o3Harness, /post-unbind projection hash changes/i);
  assert.match(o3Harness, /catalog tables mutated/i);
  assert.match(o3Harness, /liveDesktopDbTouched:\s*false/i);
});

check('[RUNTIME] Desktop applied request allowlist is exactly six', () => {
  assertSetEqual(parseObjectAllowlist(folderSync), SIX_TYPES, 'Desktop applied allowlist must be exactly six');
});

check('[RUNTIME] WebDAV/dry-run gate allowlist reports the same six types without enabling product sync', () => {
  assertSetEqual(parseArrayAllowlist(gatesCode), SIX_TYPES, 'WebDAV gate allowlist must report exactly six');
  assert.ok(gatesCode.includes('productSyncReady: false'), 'webdav gates must keep productSyncReady false');
});

check('[REQUEST] Chrome/mirror request shapers support label/tag unbind as request-only actions', () => {
  for (const code of [autoImportCode, folderImportCode]) {
    assert.ok(code.includes("if (action === 'unbind-label') action = 'chat-label-unbind';"), 'missing unbind-label alias');
    assert.ok(code.includes("if (action === 'unbind-tag') action = 'chat-tag-unbind';"), 'missing unbind-tag alias');
    assert.ok(code.includes("'chat-label-unbind': { metadataKind: 'label', subjectKind: 'chat-label-binding', operation: 'unbind'"), 'missing label unbind spec');
    assert.ok(code.includes("'chat-tag-unbind': { metadataKind: 'tag', subjectKind: 'chat-tag-binding', operation: 'unbind'"), 'missing tag unbind spec');
    assert.ok(code.includes('noChromeCanonicalMutation: true'), 'request shaper must keep Chrome non-authoritative');
    assert.ok(code.includes('desktopApplyRequired: true'), 'request shaper must keep Desktop apply required');
  }
});

check('[APPLY] Desktop apply functions validate chat/entity, call only binding unbind APIs, and verify projection decrement', () => {
  assert.ok(folderSyncCode.includes('async function applyChatLabelUnbindLibraryMetadataRequest'), 'missing label unbind apply function');
  assert.ok(folderSyncCode.includes('async function applyChatTagUnbindLibraryMetadataRequest'), 'missing tag unbind apply function');
  assert.ok(folderSyncCode.includes('labels.unbindChat(labelId, chatId)'), 'label unbind must call labels.unbindChat');
  assert.ok(folderSyncCode.includes('tags.unbindChat(tagId, chatId)'), 'tag unbind must call tags.unbindChat');
  assert.ok(folderSyncCode.includes('library-metadata-mutation-request-label-not-found'), 'label unbind must validate label exists');
  assert.ok(folderSyncCode.includes('library-metadata-mutation-request-tag-not-found'), 'tag unbind must validate tag exists');
  assert.ok(folderSyncCode.includes('library-metadata-mutation-request-chat-not-found'), 'unbind must validate chat exists');
  assert.ok(folderSyncCode.includes('afterBindingCount !== beforeBindingCount - 1'), 'unbind apply must verify projection decrement');
});

check('[NOOP] already-unbound state returns noop/already-satisfied style receipts', () => {
  assert.ok(folderSyncCode.includes("status: 'noop'"), 'missing noop status');
  assert.ok(folderSyncCode.includes('library-metadata-mutation-request-already-unbound-canonical'), 'missing already-unbound code');
  assert.ok(folderSyncCode.includes('noopCount'), 'auto-apply result must count noop outcomes');
});

check('[BASIS] basis remains reserved/diagnostic-only under single-canonical v1', () => {
  assert.ok(folderSyncCode.includes('expectedCurrentBasisHash'), 'requests still carry basis diagnostically');
  assert.ok(!folderSyncCode.includes("status: 'stale_basis'"), 'Desktop apply validation must not reject stale basis in v1');
  assert.ok(!folderSyncCode.includes('library-metadata-mutation-request-basis-unavailable'), 'basis unavailable must not defer v1 apply');
});

check('[DIAGNOSTICS] label/tag unbind are no longer deferred destructive shapes', () => {
  const deferredBlockStart = diagCode.indexOf('var DEFERRED_DESTRUCTIVE_SHAPES = [');
  assert.ok(deferredBlockStart >= 0, 'missing deferred destructive shapes');
  const deferredBlockEnd = diagCode.indexOf('];', deferredBlockStart);
  const deferredBlock = diagCode.slice(deferredBlockStart, deferredBlockEnd);
  assert.ok(!deferredBlock.includes('chat-label-unbind'), 'label unbind must not be deferred destructive');
  assert.ok(!deferredBlock.includes('chat-tag-unbind'), 'tag unbind must not be deferred destructive');
  for (const type of SIX_TYPES) assert.ok(diagCode.includes(type), `diagnostics missing applied type ${type}`);
});

check('[DEFERRED] catalog CRUD and delete/undelete remain absent from applied allowlists', () => {
  const appliedBlock = parseObjectAllowlist(folderSync).join('\n');
  const gateBlock = parseArrayAllowlist(gatesCode).join('\n');
  for (const type of CATALOG_CRUD_TYPES) {
    assert.ok(!appliedBlock.includes(type), `Desktop allowlist must not include ${type}`);
    assert.ok(!gateBlock.includes(type), `gate allowlist must not include ${type}`);
  }
});

check('[BOUNDARY] productSyncReady false, v3 unminted, WebDAV apply/multi-writer absent', () => {
  for (const code of [folderSyncCode, autoImportCode, folderImportCode, stripComments(gatesCode), stripComments(diagCode)]) {
    assert.ok(!/productSyncReady\s*[:=]\s*true\b/.test(code), 'productSyncReady must not flip true');
    assert.ok(!/h2o\.studio\.fullBundle\.v3/i.test(code), 'fullBundle.v3 must not be minted');
    assert.ok(!/\bautoApply.*WebDAV\b/i.test(code), 'WebDAV auto-apply must remain absent');
    assert.ok(!/\bmulti-writer\b/i.test(code), 'multi-writer runtime must remain absent');
  }
});

if (FAIL.length) {
  console.error('');
  console.error('FAIL validate-sync-operational-request-readiness-v1');
  for (const failure of FAIL) console.error(`- ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log('');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.operational-request-readiness.validator.v1',
  status: 'passed',
  phase: 'operational-3-label-tag-unbind-harness',
  appliedTypes: SIX_TYPES,
  productSyncReady: false,
  fullBundleV3Minted: false,
  checks: PASS.length,
}, null, 2));
console.log('PASS validate-sync-operational-request-readiness-v1');
