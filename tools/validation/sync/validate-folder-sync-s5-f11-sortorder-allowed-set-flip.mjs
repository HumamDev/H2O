#!/usr/bin/env node
//
// Folder Sync S5/F11 - sortOrder-only allowed-set flip validator.
//
// Proves the F11 helper now allows only field-mismatch:sortOrder from the
// previously blocked set, while binding-mismatch and product readiness remain blocked.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const s2CloseoutPath = 'release-evidence/2026-07-01/folder-sync-s2-sortorder-local-closeout.md';
const s2bLivePath = 'release-evidence/2026-07-01/folder-sync-s2b-live-projection-activation.md';
const preflightPath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}: missing ${needle}`);
}

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function missing`);
  const brace = source.indexOf('{', start);
  assert.ok(brace >= 0, `${name} function body missing`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} function body unterminated`);
}

assert.ok(exists(evidencePath), `${evidencePath} must exist`);
assert.ok(exists(s2CloseoutPath), `${s2CloseoutPath} must exist`);
assert.ok(exists(s2bLivePath), `${s2bLivePath} must exist`);
assert.ok(exists(preflightPath), `${preflightPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const s2Closeout = read(s2CloseoutPath);
const s2bLive = read(s2bLivePath);
const preflight = read(preflightPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const f11Helper = extractFunction(foldersStore, 'rebuildRenderMirrorFromSqlite');
const f11ClassCleaner = extractFunction(foldersStore, 'f11CleanAllowedRenderMirrorClasses');

for (const token of [
  'S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED',
  '17d5119b',
  '05b581ea',
  '938b47e0',
  'field-mismatch:sortOrder',
  'binding-mismatch',
  'Binding receipt schema remains unminted',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'This does not declare full product sync ready',
  'This does not start remote sync',
  'productSyncReady readiness re-check / binding blocker decision',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

assertIncludes(s2Closeout, 'S2 LOCAL SORTORDER LANE CLOSED', 'S2 closeout verdict');
assertIncludes(s2bLive, 'S2B LIVE PROJECTION PASSED', 'S2b live projection verdict');
assertIncludes(preflight, 'S5/F11 SORTORDER ALLOWED-SET FLIP PREFLIGHT GO-WITH-CONDITIONS', 'S5 preflight verdict');

assertIncludes(foldersStore, "'field-mismatch:sortOrder': true", 'sortOrder class is allowed');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'only binding mismatch is force-blocked');
assert.ok(!foldersStore.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
  'sortOrder must no longer be force-blocked with binding-mismatch');
assertIncludes(foldersStore, 'rebuiltSortOrderMismatchCount', 'sortOrder mismatch diagnostic count exists');
assertIncludes(foldersStore, 'sortOrderMirrorProjectionOnly: true', 'sortOrder mirror projection is explicitly render-only');
assertIncludes(foldersStore, 'noCanonicalSortOrderWrite: true', 'canonical sortOrder write is not introduced');
assertIncludes(f11Helper, "diagnostics.push({ class: 'field-mismatch:sortOrder'", 'sortOrder diagnostics are emitted');
assertIncludes(f11Helper, 'sortOrder: canonicalSortOrder', 'mirror sortOrder is projected from canonical');
assertIncludes(f11Helper, 'sort_order: canonicalSortOrder', 'mirror sort_order is projected from canonical');
assertIncludes(f11Helper, "result.skippedBindingRepairCount = classSelection.blocked.indexOf('binding-mismatch') !== -1 ? 1 : 0;",
  'binding repair remains skipped when blocked');
assertIncludes(f11ClassCleaner, 'F11_RENDER_MIRROR_REBUILD_ALLOWED_CLASSES[code]', 'class cleaner still gates allowed classes');

assertIncludes(folderSync, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b helper remains present');
assertIncludes(folderSync, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b marker remains present');

const combinedSource = `${foldersStore}\n${folderSync}`;
assert.ok(!combinedSource.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema remains unminted');
assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not flip true');
assert.doesNotMatch(combinedSource, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assert.doesNotMatch(f11Helper, /bindChat\(|unbindChat\(|moveCanonicalChatFolderBinding\(/, 'binding repair must not be introduced');
assert.doesNotMatch(f11Helper, /webdav.*(?:put|upload|download|apply)|archivePackage|archiveCloud/i,
  'F11 helper must not introduce WebDAV/cloud/archive CAS');

for (const forbidden of [
  'binding-mismatch is allowed',
  'binding repair is now implemented',
  'productSyncReady` is `true`',
  'WebDAV enabled',
  'Chat Saving CAS unblocked',
  'Verdict: full product sync ready',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.s5-f11-sortorder-allowed-set-flip.validator.v1',
  lane: 'folder-sync',
  phase: 'S5-F11',
  evidence: evidencePath,
  verdict: 'S5_F11_SORTORDER_ONLY_ALLOWED_SET_FLIP_PASSED',
  sourceChanged: [foldersStorePath],
  allowedOnly: ['field-mismatch:sortOrder'],
  bindingMismatchBlocked: true,
  bindingReceiptSchemaMinted: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-s5-f11-sortorder-allowed-set-flip');
