#!/usr/bin/env node
//
// Folder Sync F11 — render-only mirror rebuild validator.
//
// Locks the F10-approved implementation boundary: only missing mirror folder
// rows and mirror color mismatches can be rebuilt from Desktop SQLite into
// FOLDER_STATE_DATA_KEY. Sort order, bindings, tombstones, canonical SQLite,
// transport, productSyncReady, and Chat Saving CAS remain blocked.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const f11Doc = 'release-evidence/2026-06-25/folder-sync-f11-render-only-mirror-rebuild.md';
const f10Doc = 'release-evidence/2026-06-25/folder-sync-f10-mirror-write-through-rebuild-spec.md';
const s5Doc = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

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
  throw new Error(`${name} body unterminated`);
}

function modelRebuild(canonicalFolders, mirrorState, options = {}) {
  const s5Enabled = exists(s5Doc);
  const defaultClasses = s5Enabled
    ? ['missing-mirror-folder', 'field-mismatch:color', 'field-mismatch:sortOrder']
    : ['missing-mirror-folder', 'field-mismatch:color'];
  const allowed = new Set(options.classes || defaultClasses);
  const blocked = s5Enabled ? ['binding-mismatch'] : ['field-mismatch:sortOrder', 'binding-mismatch'];
  const folders = Array.isArray(mirrorState.folders) ? mirrorState.folders.map((row) => ({ ...row })) : [];
  const items = { ...(mirrorState.items || {}) };
  const byId = new Map(folders.map((row, index) => [row.folderId || row.id, { row, index }]));
  const diagnostics = [];
  for (const folder of canonicalFolders) {
    const folderId = folder.folderId || folder.id;
    const found = byId.get(folderId);
    if (!found && allowed.has('missing-mirror-folder')) {
      const inserted = {
        id: folderId,
        folderId,
        name: folder.name,
        title: folder.name,
        normalizedName: String(folder.name || '').toLowerCase(),
        color: folder.color || '',
        iconColor: folder.color || '',
        source: 'desktop-sqlite-render-mirror-rebuild',
        stateSource: 'desktop-sqlite-render-mirror-rebuild',
      };
      const insertedSortOrder = Number(folder.sortOrder ?? folder.sort_order);
      if (s5Enabled && Number.isFinite(insertedSortOrder)) {
        inserted.sortOrder = insertedSortOrder;
        inserted.sort_order = insertedSortOrder;
      }
      folders.push(inserted);
      if (!Array.isArray(items[folderId])) items[folderId] = [];
      diagnostics.push({ class: 'missing-mirror-folder', folderToken: 'sha256:fixture' });
      continue;
    }
    if (!found || !allowed.has('field-mismatch:color')) continue;
    const canonicalColor = String(folder.color || '');
    const mirrorColor = String(found.row.color || found.row.iconColor || '');
    if (canonicalColor !== mirrorColor) {
      folders[found.index] = {
        ...found.row,
        color: canonicalColor,
        iconColor: canonicalColor,
      };
      diagnostics.push({ class: 'field-mismatch:color', folderToken: 'sha256:fixture' });
    }
    if (allowed.has('field-mismatch:sortOrder')) {
      const canonicalSortOrder = Number(folder.sortOrder ?? folder.sort_order);
      const mirrorSortOrder = Number(folders[found.index].sortOrder ?? folders[found.index].sort_order);
      if (Number.isFinite(canonicalSortOrder) && mirrorSortOrder !== canonicalSortOrder) {
        folders[found.index] = {
          ...folders[found.index],
          sortOrder: canonicalSortOrder,
          sort_order: canonicalSortOrder,
        };
        diagnostics.push({ class: 'field-mismatch:sortOrder', folderToken: 'sha256:fixture' });
      }
    }
  }
  return {
    folders,
    items,
    diagnostics,
    blocked,
    bindingBucket: items.folderBindingTarget || [],
  };
}

assert.ok(exists(f11Doc), `${f11Doc} missing`);
assert.ok(exists(f10Doc), `${f10Doc} missing`);
assert.ok(exists(foldersStoreFile), `${foldersStoreFile} missing`);

const doc = read(f11Doc);
const flat = doc.replace(/\s+/g, ' ');
const store = read(foldersStoreFile);
const helper = extractFunction(store, 'rebuildRenderMirrorFromSqlite');
const classCleaner = extractFunction(store, 'f11CleanAllowedRenderMirrorClasses');
const rowBuilder = extractFunction(store, 'f11BuildRenderMirrorFolderRow');
const s5Enabled = exists(s5Doc);

for (const required of [
  'F11 RENDER-ONLY MIRROR REBUILD - PASS DETERMINISTIC IMPLEMENTATION/PROOF',
  'bc1a67e',
  'H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite(options)',
  'folder-sync-f11-render-only-mirror-rebuild',
  'missing-mirror-folder',
  'field-mismatch:color',
  'field-mismatch:sortOrder',
  'binding-mismatch',
  'Desktop SQLite `folders` remains canonical',
  '`FOLDER_STATE_DATA_KEY` remains a derived render mirror',
  'no SQLite writes',
  'no chat-folder binding writes',
  'no tombstone writes',
  'no folder delete/purge',
  'no sortOrder overwrite',
  'no binding repair',
  'no Chrome canonical mutation',
  'no WebDAV/cloud/archive CAS',
  'no Chat Saving code or package propagation',
  '`productSyncReady`: remains `false`',
  'Desktop Studio',
  'Chrome/native extension Studio across multiple devices',
  'mobile app',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assert.ok(flat.includes(required), `${f11Doc} missing required phrase: ${required}`);
}

assert.match(store, /F11_RENDER_MIRROR_REBUILD_GATE = 'folder-sync-f11-render-only-mirror-rebuild'/, 'F11 gate constant missing');
assert.match(store, /F11_RENDER_MIRROR_REBUILD_SCHEMA = 'h2o\.studio\.folder-sync\.f11-render-only-mirror-rebuild\.v1'/, 'F11 schema missing');
assert.match(store, /'missing-mirror-folder': true/, 'missing-mirror-folder must be allowed');
assert.match(store, /'field-mismatch:color': true/, 'field-mismatch:color must be allowed');
if (s5Enabled) {
  assert.match(store, /'field-mismatch:sortOrder': true/, 'sortOrder must be an allowed rebuild class after S5');
  assert.match(helper, /sortOrder: canonicalSortOrder/, 'F11 helper must project mirror sortOrder from canonical after S5');
  assert.match(helper, /sort_order: canonicalSortOrder/, 'F11 helper must project mirror sort_order from canonical after S5');
  assert.match(helper, /noCanonicalSortOrderWrite: true/, 'F11 helper must still avoid canonical sortOrder writes');
} else {
  assert.doesNotMatch(store, /'field-mismatch:sortOrder': true/, 'sortOrder must not be an allowed rebuild class before S5');
}
assert.doesNotMatch(store, /'binding-mismatch': true/, 'binding mismatch must not be an allowed rebuild class');
assert.match(classCleaner, /F11_RENDER_MIRROR_REBUILD_ALLOWED_CLASSES\[code\]/, 'class cleaner must only allow approved classes');
assert.match(helper, /gateSatisfied: cleanString\(opts\.gate\) === F11_RENDER_MIRROR_REBUILD_GATE/, 'helper must require explicit gate');
assert.match(helper, /applyRequested: opts\.apply === true/, 'helper must expose explicit apply request');
assert.match(helper, /dryRun: opts\.apply !== true/, 'helper must default to dry-run');
assert.match(helper, /await listFolders\(\)/, 'helper must read canonical SQLite folders');
assert.match(helper, /await chromeStorageGet\(FOLDER_STATE_DATA_KEY\)/, 'helper must read FOLDER_STATE_DATA_KEY');
assert.match(helper, /chromeStorageSet\(\{ \[FOLDER_STATE_DATA_KEY\]: nextState \}\)/, 'helper must write only FOLDER_STATE_DATA_KEY');
assert.match(helper, /opts\.apply !== true/, 'helper must avoid mirror write unless apply is true');
assert.match(helper, /noSQLiteWrite: true/, 'helper result must prove no SQLite write');
assert.match(helper, /noBindingWrite: true/, 'helper result must prove no binding write');
assert.match(helper, /noTombstoneWrite: true/, 'helper result must prove no tombstone write');
if (s5Enabled) {
  assert.match(helper, /noSortOrderOverwrite: classSelection\.allowed\.indexOf\('field-mismatch:sortOrder'\) === -1/, 'helper result must expose sortOrder projection eligibility');
} else {
  assert.match(helper, /noSortOrderOverwrite: true/, 'helper result must prove no sortOrder overwrite before S5');
}
assert.match(helper, /noBindingRepair: true/, 'helper result must prove no binding repair');
assert.match(helper, /productSyncReady: false/, 'helper result must keep productSyncReady false');
assert.match(helper, /privacy: \{ redacted: true, hashOnly: true \}/, 'helper must return redacted/hash-only diagnostics');
if (s5Enabled) {
  assert.match(rowBuilder, /next\.sortOrder = sortOrder/, 'missing-row builder may preserve canonical sortOrder after S5');
  assert.match(rowBuilder, /next\.sort_order = sortOrder/, 'missing-row builder may preserve canonical sort_order after S5');
} else {
  assert.match(rowBuilder, /delete next\.sortOrder/, 'missing-row builder must not set sortOrder before S5');
  assert.match(rowBuilder, /delete next\.sort_order/, 'missing-row builder must not set sort_order before S5');
}
assert.doesNotMatch(helper, /sqlExecute\(/, 'F11 helper must not execute SQLite writes');
assert.doesNotMatch(helper, /bindChat\(|unbindChat\(|moveCanonicalChatFolderBinding\(/, 'F11 helper must not write bindings');
assert.doesNotMatch(helper, /markRestored|writeFolderTombstone|softDeleteEmptyFolder|purgeRecentlyDeletedFolders/, 'F11 helper must not mutate tombstones/delete/purge');
assert.doesNotMatch(helper, /webdav.*(?:put|upload|download|apply)|archivePackage|archiveCloud|fullBundle\.v3/i, 'F11 helper must not touch WebDAV/archive/v3 operation paths');
assert.match(store, /rebuildRenderMirrorFromSqlite: rebuildRenderMirrorFromSqlite/, 'helper must be exposed on folders store API');

const fixture = modelRebuild([
  { folderId: 'folder-a', name: 'Folder A', color: '#111111', sortOrder: 99 },
  { folderId: 'folder-b', name: 'Folder B', color: '#222222', sortOrder: 42 },
], {
  folders: [
    { folderId: 'folder-a', name: 'Mirror A', color: '#aaaaaa', iconColor: '#aaaaaa', sortOrder: 7 },
  ],
  items: {
    folderBindingTarget: ['chat-1'],
  },
});

const folderA = fixture.folders.find((row) => row.folderId === 'folder-a');
const folderB = fixture.folders.find((row) => row.folderId === 'folder-b');
assert.equal(folderA.color, '#111111', 'color mismatch must be repaired from canonical SQLite');
if (s5Enabled) {
  assert.equal(folderA.sortOrder, 99, 'sortOrder mismatch must be repaired from canonical SQLite after S5');
} else {
  assert.equal(folderA.sortOrder, 7, 'existing sortOrder must be preserved before S5');
}
assert.ok(folderB, 'missing mirror folder must be added');
if (s5Enabled) {
  assert.equal(folderB.sortOrder, 42, 'new missing mirror row may carry canonical sortOrder after S5');
} else {
  assert.equal(Object.prototype.hasOwnProperty.call(folderB, 'sortOrder'), false, 'new missing mirror row must not rebuild sortOrder before S5');
}
assert.deepEqual(fixture.bindingBucket, ['chat-1'], 'binding buckets must remain untouched');
assert.deepEqual(fixture.diagnostics.map((row) => row.class).sort(), s5Enabled
  ? ['field-mismatch:color', 'field-mismatch:sortOrder', 'missing-mirror-folder']
  : ['field-mismatch:color', 'missing-mirror-folder'], 'only approved classes should be handled');
assert.deepEqual(fixture.blocked, s5Enabled ? ['binding-mismatch'] : ['field-mismatch:sortOrder', 'binding-mismatch'],
  'blocked classes must match current S5 posture');

assert.ok(read(folderSyncFile).includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-sync.tauri.js');
assert.ok(read(folderImportFile).includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-import.mv3.js');
assert.doesNotMatch(store, /productSyncReady\s*[:=]\s*true\b/, 'F11 source must not flip productSyncReady true');
assert.doesNotMatch(store, /h2o\.studio\.fullBundle\.v3/i, 'F11 source must not mint fullBundle.v3');

// F28 S10: binding-mismatch is routed to the reviewed F15-settled request->apply->receipt repair path, while the
// render mirror stays render-only (still a blocked render-mirror class; noBindingRepair remains true).
assert.match(store, /reviewedRepairPathClasses: \['binding-mismatch'\]/, 'S10: binding-mismatch routed to reviewed repair path');
assert.match(store, /bindingMismatchRoutedToReviewedRepairPath: true/, 'S10: binding-mismatch reviewed-repair routing flag present');
assert.match(store, /reviewedRepairApplyGate: 'folder-sync-chat-folder-binding-repair-apply'/, 'S10: reviewed repair apply gate referenced');
assert.match(store, /noBindingRepair: true/, 'S10: render mirror remains render-only (no binding repair)');
assert.doesNotMatch(store, /'binding-mismatch': true/, 'S10: binding-mismatch must still NOT be an allowed render-mirror rebuild class');

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f11-render-only-mirror-rebuild.validation.v1',
  lane: 'folder-sync',
  phase: 'F11',
  verdict: 'PASS',
  evidence: f11Doc,
  f10CommitReferenced: 'bc1a67e',
  sourceChanged: [foldersStoreFile],
  handledClasses: s5Enabled ? ['missing-mirror-folder', 'field-mismatch:color', 'field-mismatch:sortOrder'] : ['missing-mirror-folder', 'field-mismatch:color'],
  blockedClasses: s5Enabled ? ['binding-mismatch'] : ['field-mismatch:sortOrder', 'binding-mismatch'],
  writeTarget: 'FOLDER_STATE_DATA_KEY',
  gate: 'folder-sync-f11-render-only-mirror-rebuild',
  defaultDryRun: true,
  noSQLiteWrite: true,
  noBindingWrite: true,
  noTombstoneWrite: true,
  noFolderDeleteOrPurge: true,
  productSyncReady: false,
  chatSavingCasBlocked: true,
  crossSurface: 'desktop-chrome-native-extension-multi-device-mobile',
}, null, 2));
console.log('PASS validate-folder-sync-f11-render-only-mirror-rebuild');
