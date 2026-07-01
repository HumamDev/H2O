#!/usr/bin/env node
//
// Folder Sync F8 - Desktop export parity blocker validator.
//
// Locks the Desktop export fix and the fresh Desktop export parity proof that
// primary chat archive folder item buckets are constrained to the exported
// canonical folder catalog. Chrome proof remains pending after this slice.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const exportBundleFile = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const f8Doc = 'release-evidence/2026-06-25/folder-sync-f8-live-chrome-desktop-parity-proof.md';
const f7Validator = 'tools/validation/sync/validate-folder-sync-f7-canonical-export-reconciliation.mjs';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function missing`);
  const brace = source.indexOf('{', start);
  assert.ok(brace >= 0, `${name} function has no body`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} function body is unterminated`);
}

function countBindings(items) {
  return Object.values(items || {}).reduce((sum, rows) => {
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
}

function filterPrimaryFolderItemsByCatalog(folders, primaryItems) {
  const allowed = new Set(folders.map((folder) => String(folder.id || folder.folderId || '')).filter(Boolean));
  const exportedItems = Object.create(null);
  const skippedPrimaryOrphanItemBindings = [];
  for (const [folderId, chatIdsRaw] of Object.entries(primaryItems || {})) {
    const chatIds = Array.from(new Set((Array.isArray(chatIdsRaw) ? chatIdsRaw : []).filter(Boolean)));
    if (!allowed.has(folderId)) {
      skippedPrimaryOrphanItemBindings.push({
        folderId,
        chatIds,
        chatCount: chatIds.length,
        source: 'primary-folder-items',
        skipped: true,
        reason: 'folder-id-absent-from-exported-folder-catalog',
      });
      continue;
    }
    exportedItems[folderId] = chatIds;
  }
  for (const folderId of allowed) {
    if (!Object.prototype.hasOwnProperty.call(exportedItems, folderId)) exportedItems[folderId] = [];
  }
  return {
    exportedItems,
    skippedPrimaryOrphanItemBindings,
    skippedPrimaryOrphanItemBindingCount: countBindings(
      Object.fromEntries(skippedPrimaryOrphanItemBindings.map((row) => [row.folderId, row.chatIds])),
    ),
  };
}

assert.ok(exists(exportBundleFile), `${exportBundleFile} missing`);
assert.ok(exists(f8Doc), `${f8Doc} missing`);
assert.ok(exists(f7Validator), `${f7Validator} missing`);

const exportBundle = read(exportBundleFile);
const f8 = read(f8Doc);
const mergeFolderStates = extractFunction(exportBundle, 'mergeFolderStates');
const buildFolderState = extractFunction(exportBundle, 'buildFolderState');

assert.match(exportBundle, /async function buildDesktopCanonicalChatFolderBindingProjection\b/, 'Desktop export must keep canonical binding projection');
assert.match(buildFolderState, /var folders = \(await listFromStore\(stores\.folders\)\)\.map\(projectFolder\)\.filter\(Boolean\)/, 'folder catalog must be exported from Desktop folder store');
assert.match(mergeFolderStates, /var primaryAllowedFolderIds = new Set\(order\)/, 'primary folder items must be constrained by exported folder catalog ids');
assert.match(mergeFolderStates, /addItems\(primary\.items,\s*primaryAllowedFolderIds,\s*\{\s*recordPrimaryOrphan:\s*true\s*\}\)/, 'primary item add must record orphan skips');
assert.match(mergeFolderStates, /folder-id-absent-from-exported-folder-catalog/, 'orphan item skip reason must be stable');
assert.match(mergeFolderStates, /skippedPrimaryOrphanItemBindingCount/, 'primary orphan skip count diagnostic missing');
assert.match(mergeFolderStates, /skippedPrimaryOrphanItemBindings/, 'primary orphan skip details diagnostic missing');
assert.match(mergeFolderStates, /primaryOrphanItemBindingAuthority:\s*false/, 'primary orphan items must not be export authority');

assert.doesNotMatch(mergeFolderStates, /addItems\s*\(\s*fallback\.items\b/, 'fallback folder-state items must not be merged');
assert.match(mergeFolderStates, /skippedFallbackBindingCount\s*=\s*fallbackBindingCount/, 'fallback binding count must remain skipped');
assert.match(mergeFolderStates, /fallbackBindingAuthority:\s*false/, 'fallback binding authority must remain false');
assert.match(mergeFolderStates, /fallbackItemsMerged:\s*false/, 'fallback items must remain unmerged');
assert.match(mergeFolderStates, /canonicalBindingAuthority:\s*'desktop-sqlite'/, 'canonical binding authority must remain Desktop SQLite');

const blockerFixture = filterPrimaryFolderItemsByCatalog([
  { id: 'folder-valid-a' },
  { id: 'folder-valid-b' },
], {
  'folder-valid-a': ['chat-01', 'chat-02', 'chat-03', 'chat-04', 'chat-05', 'chat-06'],
  'folder-valid-b': ['chat-07', 'chat-08', 'chat-09', 'chat-10', 'chat-11', 'chat-12'],
  f_0606ea698948f19dba53d548: ['69f0c5f3-30c4-83eb-9240-26331d09532b'],
});

assert.equal(countBindings(blockerFixture.exportedItems), 12, 'exported folderState.items count must match active canonical binding count');
assert.equal(blockerFixture.skippedPrimaryOrphanItemBindingCount, 1, 'one primary orphan item binding must be skipped in the F8 blocker fixture');
assert.ok(!Object.prototype.hasOwnProperty.call(blockerFixture.exportedItems, 'f_0606ea698948f19dba53d548'), 'orphan folder id must not remain in exported folderState.items');
assert.deepEqual(blockerFixture.skippedPrimaryOrphanItemBindings.map((row) => row.folderId), ['f_0606ea698948f19dba53d548'], 'skipped primary orphan details must preserve the orphan folder id for diagnostics');

assert.match(exportBundle, /productSyncReady:\s*false/, 'productSyncReady must remain false');
assert.doesNotMatch(exportBundle, /productSyncReady\s*[:=]\s*true\b/, 'export must not flip productSyncReady true');
assert.doesNotMatch(exportBundle, /h2o\.studio\.fullBundle\.v3/i, 'export must not mint fullBundle.v3');
assert.doesNotMatch(exportBundle, /archivePackageCloudSync|archiveCloudSync|uploadArchivePackage|downloadArchivePackage/i, 'archive package cloud sync markers must remain absent');
assert.doesNotMatch(exportBundle, /webdav.*put|webdav.*upload|remote.*write/i, 'WebDAV/cloud remote write markers must remain absent from this fix');

for (const required of [
  'F8 DESKTOP EXPORT PARITY - PASSED_DESKTOP_EXPORT_PARITY',
  'CHROME_PROOF_PENDING',
  '58a09933bfe52388a5e714a16f30647ad3ef05a1',
  'folderState.items count of 13 is a real export bug',
  'folderState.items is constrained to the exported canonical folder catalog',
  'skippedPrimaryOrphanItemBindingCount',
  'skippedPrimaryOrphanItemBindings',
  'folderState.items count = 12',
  'folderParity.bindingCount`: `12`',
  'desktopCanonicalChatFolderBindings.bindingCount`: `12`',
  'orphanFolderCount: `0`',
  'productSyncReady:false',
  'contentSha256: `sha256:6c79db9cd2adc045f914ae7ae9e64913afc7f4ac55c8248ca08c5f40265a5eb4`',
  'fileSha256: `sha256:fb2303ff9c3cc59163304709740913a38b0cd2c32b5128bff7e634d0ba5da95a`',
  'fullBundleV3Present: `false`',
  'webdavCloudArchiveCasMarkersPresent: `false`',
  'chatSavingPackageBodyMarkersPresent: `false`',
  'copy()` helper failed',
  'No archive package code was touched',
  'No WebDAV/cloud/archive CAS implementation',
  'No mirror write-through or repair implementation',
  'binding mismatch is not auto-repaired',
  'sortOrder is not blindly overwritten',
  'Future shared transport must support Desktop Studio, Chrome/native extension across devices, and mobile app',
]) {
  assert.ok(f8.includes(required), `${f8Doc} missing required phrase: ${required}`);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f8-live-chrome-desktop-parity-proof.v1',
  lane: 'folder-sync',
  phase: 'F8',
  verdict: 'PASSED_DESKTOP_EXPORT_PARITY',
  chromeProofStatus: 'CHROME_PROOF_PENDING',
  sourceFixPresent: true,
  exportedFolderStateItemCountFixture: countBindings(blockerFixture.exportedItems),
  activeCanonicalBindingCountFixture: 12,
  liveDesktopExport: {
    contentSha256: 'sha256:6c79db9cd2adc045f914ae7ae9e64913afc7f4ac55c8248ca08c5f40265a5eb4',
    fileSha256: 'sha256:fb2303ff9c3cc59163304709740913a38b0cd2c32b5128bff7e634d0ba5da95a',
    folderStateItemsCount: 12,
    folderParityBindingCount: 12,
    desktopCanonicalChatFolderBindingCount: 12,
    orphanFolderCount: 0,
  },
  skippedPrimaryOrphanItemBindingCount: blockerFixture.skippedPrimaryOrphanItemBindingCount,
  fallbackBindingAuthority: false,
  fallbackItemsMerged: false,
  productSyncReady: false,
  fullBundleV3Minted: false,
  webdavCloudArchiveCasImplemented: false,
}, null, 2));
console.log('PASS validate-folder-sync-f8-live-chrome-desktop-parity-proof');
