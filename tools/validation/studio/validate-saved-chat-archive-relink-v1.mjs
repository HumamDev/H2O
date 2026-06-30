#!/usr/bin/env node
// K.4.2 - Saved-chat archive RELINK validator (static).
//
// This validator locks the K.4 relink contract and the K.4.2 implementation:
// a separate Desktop-only, verification-gated relink module that inserts a
// fresh snapshot under a target chat and updates only target chat pointers.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const K4_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k4-relink-contract.md';
const K41_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k4-1-relink-validator.md';
const K42_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k4-2-relink-action.md';
const RECOVERY_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs';
const RESTORE_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs';
const RESTORE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js';
const RELINK_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js';
const IMPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js';
const INSPECTOR_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js';
const EXPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js';
const HEALTH_UI_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const STUDIO_DIR_REL = 'src-surfaces-base/studio';

const RELINK_NAMES = ['H2O.Studio.archiveRelink', 'dryRunRelinkPackage', 'relinkVerifiedPackage'];
const TOMBSTONE_OVERRIDE_NAMES = [
  'clearTombstone',
  'deleteTombstone',
  'supersedeTombstone',
  'UPDATE sync_tombstones',
  'DELETE FROM sync_tombstones',
];

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m}`);
  }
}

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walkJs(absDir) {
  const out = [];
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const k4 = exists(K4_CONTRACT_REL) ? readRepo(K4_CONTRACT_REL) : '';
const k41 = exists(K41_EVIDENCE_REL) ? readRepo(K41_EVIDENCE_REL) : '';
const k42 = exists(K42_EVIDENCE_REL) ? readRepo(K42_EVIDENCE_REL) : '';
const recoveryValidator = exists(RECOVERY_VALIDATOR_REL) ? readRepo(RECOVERY_VALIDATOR_REL) : '';
const restoreValidator = exists(RESTORE_VALIDATOR_REL) ? readRepo(RESTORE_VALIDATOR_REL) : '';
const restoreCode = exists(RESTORE_REL) ? stripComments(readRepo(RESTORE_REL)) : '';
const relinkSrc = exists(RELINK_REL) ? readRepo(RELINK_REL) : '';
const relinkCode = exists(RELINK_REL) ? stripComments(relinkSrc) : '';
const healthUiCode = exists(HEALTH_UI_REL) ? stripComments(readRepo(HEALTH_UI_REL)) : '';
const studioHtml = exists(STUDIO_HTML_REL) ? readRepo(STUDIO_HTML_REL) : '';
const packSrc = exists(PACK_REL) ? readRepo(PACK_REL) : '';

console.log('[archive-relink] K.4.2 static relink implementation checks');

check('[K.4] relink contract exists and is marked NOT IMPLEMENTED', () => {
  assert.ok(exists(K4_CONTRACT_REL), 'missing K.4 contract evidence');
  assert.match(k4, /PHASE K\.4 CONTRACT[\s\S]*RELINK[\s\S]*NOT IMPLEMENTED/);
});

check('[K.4] contract defines the core relink operation', () => {
  for (const phrase of [
    'inserts a fresh recovered snapshot under the target chatId',
    'updates the target chat’s current snapshot pointer/metadata',
    'Relink must be additive in data',
    'target chat',
  ]) {
    assert.ok(k4.includes(phrase), 'missing relink operation phrase: ' + phrase);
  }
});

check('[K.4] contract locks typed confirmation and undo provenance', () => {
  assert.match(k4, /typed confirmation required/i);
  for (const field of [
    'previousSnapshotId',
    'previousCurrentLeafId',
    'previousLastCapturedAt',
    'newSnapshotId',
    'contentHash',
    'relinkedAt',
    'mode: `relink`',
  ]) {
    assert.ok(k4.includes(field), 'missing provenance field: ' + field);
  }
});

check('[K.4] contract defers tombstone override / undelete to K.5', () => {
  assert.match(k4, /Tombstone override is deferred to K\.5|Deferred to K\.5/);
  assert.ok(k4.includes('un-delete'), 'un-delete must be deferred');
  assert.ok(k4.includes('clear/supersede `sync_tombstones`'), 'sync_tombstones override must be deferred');
});

check('[K.4] contract forbids overwrite, re-parenting, original snapshot id reuse, and forbidden authorities', () => {
  for (const phrase of [
    'overwrite: never allowed',
    'snapshot re-parenting',
    'package original snapshotId as the new snapshot id',
    '`libraryIndex`',
    '`sync_tombstones`',
    '`saved_chat_archive_requests`',
    'no Chrome package authority',
  ]) {
    assert.ok(k4.includes(phrase), 'missing forbidden boundary: ' + phrase);
  }
  assert.match(k4, /no tombstone clear\/delete\/supersede/i);
});

check('[K.4] contract defines allowed and forbidden target chat update fields', () => {
  for (const allowed of ['last_snapshot_id', 'current_leaf_id', 'last_captured_at', 'snapshot_count', 'updated_at', 'meta_json']) {
    assert.ok(k4.includes(allowed), 'missing allowed update field: ' + allowed);
  }
  for (const forbidden of ['is_saved', 'is_linked', 'link_source_href', 'href', 'normalized_href', 'folder/category/label bindings']) {
    assert.ok(k4.includes(forbidden), 'missing forbidden update field: ' + forbidden);
  }
});

check('[K.4.2] relink module exists, registers archiveRelink, and is wired into Studio/pack', () => {
  assert.ok(exists(RELINK_REL), 'production relink module missing');
  assert.match(relinkSrc, /H2O\.Studio\.archiveRelink\s*=/);
  for (const name of ['isDesktopCapable', 'dryRunRelinkPackage', 'relinkVerifiedPackage']) {
    assert.ok(relinkSrc.includes(name), 'relink API missing: ' + name);
  }
  assert.ok(studioHtml.includes('ingestion/saved-chat-archive-relink.studio.js'), 'studio.html loader missing');
  assert.ok(packSrc.includes('ingestion/saved-chat-archive-relink.studio.js'), 'pack list missing');
});

check('[K.4.2] relink is Desktop-only and uses inspector + importer turn builder', () => {
  assert.match(relinkCode, /function detectTauri\s*\(/);
  assert.match(relinkCode, /__TAURI_INTERNALS__|__TAURI__/);
  assert.match(relinkCode, /function isDesktopCapable\s*\(/);
  assert.ok(relinkCode.includes('inspectPackage'), 'must verify via inspectPackage');
  assert.ok(relinkCode.includes('archiveImporter'), 'must reference archiveImporter');
  assert.ok(relinkCode.includes('buildTurnsFromPackageSnapshot'), 'must reuse importer turn builder');
});

check('[K.4.2] relink remains API-only; no Relink UI card is mounted', () => {
  assert.ok(!healthUiCode.includes('archiveRelink'), 'Relink UI card must not be mounted');
  assert.ok(!healthUiCode.includes('mountArchiveRelinkCard'), 'Relink UI mount must not exist');
});

check('[K.4.2] contract invariants remain locked', () => {
  for (const phrase of [
    'module: `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`',
    'namespace: `H2O.Studio.archiveRelink`',
    '`dryRunRelinkPackage({ packagePath, targetChatId })`',
    '`relinkVerifiedPackage({ packagePath, targetChatId, confirm })`',
    '`archiveRestore` remains insert-only',
    'inspects/verifies package',
    'reuse `archiveImporter.buildTurnsFromPackageSnapshot`',
    'typed confirmation required',
    'inserts a fresh recovered snapshot',
    'no relink to an existing snapshot id',
    'no pure mode that only repoints to an existing snapshot',
  ]) {
    assert.ok(k4.includes(phrase), 'missing future invariant: ' + phrase);
  }
});

check('[K.4.2] recovery validator allows relink names only inside the relink module', () => {
  assert.ok(recoveryValidator.includes("const RELINK_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js'"), 'missing RELINK_REL');
  assert.ok(recoveryValidator.includes('RELINK_ENTRY_NAMES'), 'missing RELINK_ENTRY_NAMES');
  assert.ok(recoveryValidator.includes('rel !== RELINK_REL'), 'relink names must be forbidden outside RELINK_REL');
  for (const name of RELINK_NAMES) {
    assert.ok(recoveryValidator.includes(name), 'recovery validator missing relink name allowance: ' + name);
  }
  assert.ok(recoveryValidator.includes('RESTORE_REL'), 'restore allowance must remain');
});

check('[K.4.2] typed string confirmation is required; boolean confirm is not accepted', () => {
  assert.ok(relinkCode.includes("return 'RELINK:' + cleanString(targetChatId)"), 'deterministic RELINK:<targetChatId> token missing');
  assert.ok(relinkCode.includes("typeof opts.confirm !== 'string'"), 'confirm must be string typed');
  assert.ok(relinkCode.includes('typed confirm required'), 'typed confirm rejection missing');
  assert.ok(!relinkCode.includes('confirm !== true'), 'boolean confirm gate must not be used for relink');
  assert.ok(!relinkCode.includes('opts.confirm === true'), 'boolean confirm must not be accepted for relink');
});

check('[K.4.2] dry-run checks target chat existence/deleted/tombstoned and has the required decisions', () => {
  assert.ok(relinkCode.includes('targetChatId required'), 'targetChatId required check missing');
  assert.ok(relinkCode.includes('target-chat-missing'), 'target-chat-missing decision missing');
  assert.ok(relinkCode.includes('target-chat-deleted'), 'target-chat-deleted decision missing');
  assert.ok(relinkCode.includes('tombstoned'), 'tombstoned decision missing');
  assert.ok(relinkCode.includes('snapshot-belongs-to-other-chat'), 'snapshot-belongs-to-other-chat decision missing');
  assert.ok(relinkCode.includes('snapshot-missing'), 'snapshot-missing decision missing');
  assert.ok(relinkCode.includes('already-relinked'), 'already-relinked decision missing');
  assert.ok(relinkCode.includes('relink-ready'), 'relink-ready decision missing');
  assert.ok(relinkCode.includes('findActiveChatTombstone'), 'target tombstone read gate missing');
});

check('[K.4.2] fresh snapshot id is generated and package original snapshotId is not reused', () => {
  assert.ok(relinkCode.includes('function generateFreshSnapshotId'), 'fresh snapshot id generator missing');
  assert.ok(relinkCode.includes('snap_relinked_'), 'fresh relink snapshot prefix missing');
  assert.ok(relinkCode.includes('ensureFreshRelinkSnapshotId(identity.originalSnapshotId)'), 'must compare against original snapshot id');
  assert.ok(!/newSnapshotId\s*=\s*identity\.originalSnapshotId/.test(relinkCode), 'must not use package original snapshot id as new snapshot id');
});

check('[K.4.2] write path inserts snapshot + turns and updates only target chat pointer metadata', () => {
  assert.match(relinkCode, /INSERT INTO snapshots/);
  assert.match(relinkCode, /INSERT INTO snapshot_turns/);
  assert.match(relinkCode, /UPDATE chats SET last_snapshot_id = \?, current_leaf_id = \?, last_captured_at = \?, snapshot_count = COALESCE\(snapshot_count, 0\) \+ 1, updated_at = \?, meta_json = \? WHERE id = \?/);
  for (const forbidden of ['is_saved', 'is_linked', 'link_source_href', 'normalized_href', 'category_id', 'folder_id', 'label_ids']) {
    assert.ok(!/UPDATE chats SET[\s\S]{0,3000}/.test(relinkCode) || !relinkCode.match(/UPDATE chats SET[\s\S]*WHERE id = \?/)[0].includes(forbidden), 'target chat UPDATE must not include ' + forbidden);
  }
  assert.ok(!/DELETE FROM snapshot_turns|DELETE FROM snapshots|UPDATE snapshots|UPDATE snapshot_turns/i.test(relinkCode), 'old snapshots/turns must not be deleted or overwritten');
});

check('[K.4.2] provenance captures previous pointer and package identity before update', () => {
  for (const field of [
    'previousSnapshotId',
    'previousCurrentLeafId',
    'previousLastCapturedAt',
    'newSnapshotId',
    'originalChatId',
    'originalSnapshotId',
    'contentHash',
    'packagePath',
    'packageDirName',
    'relinkedAt',
    'confirmToken',
    "mode: 'relink'",
  ]) {
    assert.ok(relinkCode.includes(field), 'provenance missing: ' + field);
  }
  assert.ok(relinkCode.includes('Object.assign({}, existingMeta'), 'target meta_json must be merged, not replaced blindly');
});

check('[K.4.2] tombstone override remains forbidden in archive restore/relink scope', () => {
  for (const rel of [RESTORE_REL, RELINK_REL, IMPORTER_REL, INSPECTOR_REL, EXPORTER_REL, HEALTH_UI_REL]) {
    if (!exists(rel)) continue;
    const code = stripComments(readRepo(rel));
    for (const banned of TOMBSTONE_OVERRIDE_NAMES) {
      assert.ok(!code.includes(banned), 'archive relink/import/restore scope must not override tombstones: ' + banned + ' in ' + rel);
    }
  }
});

check('[K.4.2] forbidden authorities and side effects remain absent from relink module', () => {
  for (const banned of [
    'libraryIndex',
    'saved_chat_archive_requests',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'scanSavedChatArchiveRequestInboxV1',
    'chrome.runtime',
    'connectNative',
    'sendNativeMessage',
    'webdav',
    'WebDAV',
    'syncNow',
    'plugin:fs|write',
    'remove_file',
    'remove_dir',
    'rename',
    'setInterval',
    'MutationObserver',
  ]) {
    assert.ok(!relinkCode.includes(banned), 'relink module must not reference: ' + banned);
  }
});

check('[INVARIANT] restore validator remains focused on insert-only restore and still forbids relink runtime', () => {
  assert.ok(restoreValidator.includes('writes are insert-only'), 'restore validator must preserve insert-only check');
  assert.ok(restoreValidator.includes('relink runtime is confined to the separate relink module'), 'restore validator must keep relink confined');
  assert.ok(restoreValidator.includes('tombstone override/un-delete stays absent'), 'restore validator must keep tombstone override deferred');
});

check('[INVARIANT] archiveRestore implementation remains insert-only and has no relink/pointer update behavior', () => {
  assert.ok(restoreCode.includes('INSERT INTO chats'), 'restore must still insert chats');
  assert.ok(restoreCode.includes('INSERT INTO snapshots'), 'restore must still insert snapshots');
  assert.ok(restoreCode.includes('INSERT INTO snapshot_turns'), 'restore must still insert turns');
  assert.ok(!/UPDATE\s+chats|UPDATE\s+snapshots|UPDATE\s+snapshot_turns/i.test(restoreCode), 'restore must not UPDATE existing state');
  for (const name of RELINK_NAMES) {
    assert.ok(!restoreCode.includes(name), 'restore module must not expose relink name: ' + name);
  }
});

check('[K.4.1] validator evidence remains present', () => {
  assert.ok(exists(K41_EVIDENCE_REL), 'missing K.4.1 evidence note');
  assert.match(k41, /PHASE K\.4\.1[\s\S]*RELINK VALIDATOR[\s\S]*NOT IMPLEMENTED/);
});

check('[K.4.2] action evidence records implementation and remaining deferrals', () => {
  assert.ok(exists(K42_EVIDENCE_REL), 'missing K.4.2 evidence note');
  assert.match(k42, /PHASE K\.4\.2[\s\S]*RELINK ACTION[\s\S]*IMPLEMENTED/);
  for (const phrase of [
    'typed confirmation token',
    'RELINK:<targetChatId>',
    'API-only',
    'relink is implemented',
    'tombstone override still deferred',
    'runtime smoke deferred to K.4.3',
  ]) {
    assert.ok(k42.includes(phrase), 'evidence missing: ' + phrase);
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-relink] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-relink] PASS ${PASS.length} checks`);
}
