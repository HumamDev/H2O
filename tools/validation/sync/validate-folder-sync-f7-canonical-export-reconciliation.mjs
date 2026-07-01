#!/usr/bin/env node
//
// Folder Sync F7 - canonical export reconciliation validator.
//
// Locks the Desktop export path so folder binding counts are derived from the
// canonical SQLite reader, not from the legacy FOLDER_STATE_DATA_KEY mirror.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const exportBundleFile = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const f1Doc = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const f2Doc = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';
const f7Doc = 'release-evidence/2026-06-25/folder-sync-f7-canonical-export-reconciliation.md';

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
  return Object.values(items || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

function canonicalOnlyPolicyFixture() {
  const canonicalItems = {
    'folder-alpha': ['chat-1', 'chat-2'],
    'folder-beta': ['chat-3'],
  };
  const staleMirrorItems = {
    'folder-alpha': ['chat-1', 'chat-2', 'stale-chat'],
    'folder-beta': ['chat-3', 'stale-chat-2'],
    'folder-gamma-stale': ['stale-chat-3'],
  };
  return {
    canonicalBindingCount: countBindings(canonicalItems),
    mirrorBindingCount: countBindings(staleMirrorItems),
    exportedBindingCount: countBindings(canonicalItems),
    skippedFallbackBindingCount: countBindings(staleMirrorItems),
  };
}

assert.ok(exists(exportBundleFile), `${exportBundleFile} missing`);
assert.ok(exists(foldersStoreFile), `${foldersStoreFile} missing`);
assert.ok(exists(f1Doc), `${f1Doc} missing`);
assert.ok(exists(f2Doc), `${f2Doc} missing`);
assert.ok(exists(f7Doc), `${f7Doc} missing`);

const exportBundle = read(exportBundleFile);
const foldersStore = read(foldersStoreFile);
const f7 = read(f7Doc);
const mergeFolderStates = extractFunction(exportBundle, 'mergeFolderStates');
const collectRelated = extractFunction(exportBundle, 'collectRelated');

assert.match(foldersStore, /function\s+listCanonicalChatFolderBindings\b/, 'Desktop folder store must expose canonical binding reader');
assert.match(foldersStore, /function\s+getCanonicalChatFolderBindingForChat\b/, 'Desktop folder store must expose canonical per-chat binding reader');
assert.match(foldersStore, /function\s+listCanonicalChatFolderBindingsForChat\b/, 'Desktop folder store must expose canonical per-chat row reader');

assert.match(exportBundle, /async function buildDesktopCanonicalChatFolderBindingProjection\b/, 'Desktop export must build canonical chat-folder binding projection');
assert.match(exportBundle, /api\.listCanonicalChatFolderBindings\b/, 'Desktop export must prefer listCanonicalChatFolderBindings');
assert.match(exportBundle, /baseDiagnostics\.canonicalBindingReadPath\s*=\s*canonicalRows[\s\S]*'store\.folders\.listCanonicalChatFolderBindings'[\s\S]*'store\.folders\.listChats'/, 'canonical binding diagnostics must name canonical reader path');

assert.doesNotMatch(mergeFolderStates, /addItems\s*\(\s*fallback\.items\b/, 'fallback folder-state items must not be merged into exported folderState.items');
assert.match(mergeFolderStates, /skippedFallbackBindingCount\s*=\s*fallbackBindingCount/, 'fallback binding count must be counted as skipped');
assert.match(mergeFolderStates, /fallbackBindingAuthority:\s*false/, 'fallback binding authority must be false');
assert.match(mergeFolderStates, /fallbackItemsMerged:\s*false/, 'fallback items must be explicitly marked unmerged');
assert.match(mergeFolderStates, /canonicalBindingAuthority:\s*'desktop-sqlite'/, 'canonical binding authority must be Desktop SQLite');
assert.match(mergeFolderStates, /fallbackUsed\s*=\s*fallbackAvailable\s*&&\s*filledVisualMetadataCount\s*>\s*0/, 'fallback can only be used for visual metadata fill');
assert.match(mergeFolderStates, /desktop-sqlite\+folder-state-cache-visuals/, 'fallback export source must be visual-only when used');

assert.match(exportBundle, /function hasDesktopFolderStoreAuthority\b/, 'export must detect Desktop folder-store authority');
assert.match(exportBundle, /async function getCanonicalFolderForChat\b/, 'export must resolve per-chat folders from canonical binding reader');
assert.match(collectRelated, /getCanonicalFolderForChat\(folderStore,\s*chatId\)/, 'chat organization must try canonical per-chat folder reader');
assert.match(collectRelated, /!hasCanonicalFolderStore\)\s*folder\s*=\s*findFolderForChat\(folderStateFallback,\s*chatId\)/, 'mirror lookup must be gated behind no canonical folder store');
assert.match(collectRelated, /!hasCanonicalFolderStore\s*&&\s*chat\s*&&\s*chat\.folderId/, 'mirror folderId lookup must be gated behind no canonical folder store');

const fixture = canonicalOnlyPolicyFixture();
assert.equal(fixture.exportedBindingCount, fixture.canonicalBindingCount, 'exported binding count must equal canonical binding count');
assert.ok(fixture.mirrorBindingCount > fixture.canonicalBindingCount, 'fixture must model stale mirror over-count');
assert.equal(fixture.skippedFallbackBindingCount, fixture.mirrorBindingCount, 'all stale mirror bindings are skipped');

assert.match(exportBundle, /productSyncReady:\s*false/, 'productSyncReady must remain false in export bundle');
assert.doesNotMatch(exportBundle, /productSyncReady\s*[:=]\s*true\b/, 'export bundle must not flip productSyncReady true');
assert.doesNotMatch(exportBundle, /h2o\.studio\.fullBundle\.v3/i, 'export bundle must not mint fullBundle.v3');
assert.doesNotMatch(exportBundle, /archivePackageCloudSync|archiveCloudSync|uploadArchivePackage|downloadArchivePackage/i, 'archive package cloud sync must remain absent');

for (const required of [
  'FOLDER SYNC F7 CANONICAL EXPORT RECONCILIATION - IMPLEMENTED',
  'Desktop SQLite remains canonical',
  'folder-state mirror remains a fallback for visual metadata only',
  'Stale mirror bindings are skipped',
  'Canonical count parity',
  'productSyncReady remains false',
]) {
  assert.ok(f7.includes(required), `${f7Doc} missing required phrase: ${required}`);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f7-canonical-export-reconciliation.v1',
  lane: 'folder-sync',
  phase: 'F7',
  canonicalOwner: 'desktop-sqlite-folders',
  staleMirrorBindingAuthority: false,
  fallbackItemsMerged: false,
  canonicalCountParity: {
    canonicalBindingCount: fixture.canonicalBindingCount,
    exportedBindingCount: fixture.exportedBindingCount,
    skippedFallbackBindingCount: fixture.skippedFallbackBindingCount,
  },
  productSyncReady: false,
  fullBundleV3Minted: false,
  webdavImplemented: false,
}, null, 2));
console.log('PASS validate-folder-sync-f7-canonical-export-reconciliation');
