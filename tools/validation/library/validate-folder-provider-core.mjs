#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const corePath = path.join(repoRoot, 'shared/library/folder-provider-core.js');
const nativeMirrorPath = path.join(repoRoot, 'src-runtime-base/0F0e.⬛️🗂️ Folder Provider Core 🗂️.js');
const studioMirrorPath = path.join(repoRoot, 'surfaces/studio/S0F0e. 🎬 Folder Provider Core - Studio.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function iifeBody(src) {
  const idx = src.indexOf('(() => {');
  assert.ok(idx >= 0, 'IIFE body marker missing');
  return src.slice(idx);
}

const coreSource = read(corePath);
const nativeSource = read(nativeMirrorPath);
const studioSource = read(studioMirrorPath);

assert.equal(iifeBody(coreSource), iifeBody(nativeSource), 'native mirror IIFE body must match canonical core');
assert.equal(iifeBody(coreSource), iifeBody(studioSource), 'Studio mirror IIFE body must match canonical core');

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox, { filename: corePath });

const core = sandbox.H2O?.Library?.FolderProviderCore;
assert.ok(core, 'FolderProviderCore must publish on H2O.Library');
assert.equal(core.__phase, '3B');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const expectedApi = [
  '__phase',
  'normalizeFolder',
  'normalizeFolderCatalog',
  'normalizeFolderBinding',
  'normalizeFolderState',
  'migrateLegacyFolderState',
  'dedupeFolders',
  'validateFolderId',
  'deriveFolderDisplayName',
  'getFolderById',
  'getBinding',
  'applyFolderBinding',
  'removeFolderBinding',
  'computeFolderCounts',
  'listFolderItems',
  'normalizeBindingKey',
  'bindingKeyCandidates',
  'findOrphanBindings',
  'repairFolderState',
];
assert.deepEqual(Object.keys(core), expectedApi, 'exported API keys must remain stable');

const nativeState = {
  folders: [
    { id: 'f_a', name: 'Alpha', kind: 'local', createdAt: 100, updatedAt: 200 },
    { id: 'f_b', name: 'Beta', kind: 'local', createdAt: 101, updatedAt: 201 },
  ],
  items: {
    f_a: ['/c/a'],
    f_b: [],
  },
};

{
  const state = core.normalizeFolderState(nativeState);
  assert.equal(state.folders.length, 2, 'native shape folder count');
  assert.deepEqual(plain(state.items.f_a), ['/c/a'], 'native shape item key preserved/canonicalized');
}

{
  const legacy = {
    folders: [{ id: 'f_a', name: 'Alpha' }, { id: 'f_b', name: 'Beta' }],
    chatToFolders: {
      'https://chatgpt.com/c/legacy-a?model=x': ['f_a'],
      legacyB: ['f_b'],
    },
  };
  const migrated = core.migrateLegacyFolderState(legacy);
  assert.deepEqual(plain(migrated.items.f_a), ['/c/legacy-a'], 'legacy URL binding migrated');
  assert.deepEqual(plain(migrated.items.f_b), ['/c/legacyB'], 'legacy chatId binding migrated');
}

{
  const catalog = core.normalizeFolderCatalog([
    { id: 'dup', name: 'First' },
    { id: 'dup', name: 'Second' },
    { id: 'other', name: 'First' },
  ]);
  assert.deepEqual(plain(catalog.map((f) => f.id)), ['dup', 'other'], 'duplicate IDs dedupe');
  assert.deepEqual(plain(catalog.map((f) => f.name)), ['First', 'First'], 'duplicate names survive');
}

{
  const appliedA = core.applyFolderBinding(nativeState, 'chat-one', 'f_a');
  assert.equal(appliedA.ok, true);
  assert.deepEqual(plain(appliedA.state.items.f_a), ['/c/a', '/c/chat-one'], 'binding applied to folder A');

  const appliedB = core.applyFolderBinding(appliedA.state, '/c/chat-one', 'f_b');
  assert.deepEqual(plain(appliedB.state.items.f_a), ['/c/a'], 'reapply removes from folder A');
  assert.deepEqual(plain(appliedB.state.items.f_b), ['/c/chat-one'], 'reapply adds to folder B');

  const removed = core.removeFolderBinding(appliedB.state, 'https://chatgpt.com/c/chat-one');
  assert.deepEqual(plain(removed.state.items.f_a), ['/c/a'], 'remove leaves unrelated item');
  assert.deepEqual(plain(removed.state.items.f_b), [], 'remove clears all equivalent keys');
}

{
  const state = {
    folders: [{ id: 'f_a', name: 'Alpha' }],
    items: { f_a: ['abc', '/c/abc%201', 'https://chatgpt.com/c/abc-2?x=1'] },
  };
  assert.equal(core.getBinding(state, '/c/abc').folderId, 'f_a', 'raw chatId and path are equivalent');
  assert.equal(core.getBinding(state, 'abc 1').folderId, 'f_a', 'encoded path equivalent');
  assert.equal(core.getBinding(state, '/c/abc-2').folderId, 'f_a', 'full URL equivalent');
}

{
  const state = core.applyFolderBinding(nativeState, 'count-a', 'f_a').state;
  const counts = core.computeFolderCounts(state);
  assert.deepEqual(plain(counts.byFolder), { f_a: 2, f_b: 0 }, 'counts by folder');
  assert.equal(counts.total, 2, 'total count');
}

{
  const state = core.normalizeFolderState({
    folders: [{ id: 'f_a', name: 'Alpha' }],
    items: { f_a: ['/c/a'], missing: ['/c/orphan'] },
  });
  const orphans = core.findOrphanBindings(state);
  assert.equal(orphans.length, 1, 'orphan bucket detected');
  assert.equal(orphans[0].folderId, 'missing');
  assert.deepEqual(plain(orphans[0].chatKeys), ['/c/orphan']);
  const repaired = core.repairFolderState(state);
  assert.deepEqual(plain(repaired.affectedChatKeys), ['/c/orphan'], 'repair returns affected chat keys');
  assert.equal(Object.hasOwn(repaired.state.items, 'missing'), false, 'repair removes orphan bucket');
}

{
  const malformed = core.normalizeFolderState(null);
  assert.deepEqual(plain(malformed.folders), [], 'malformed state safe folders');
  assert.deepEqual(plain(malformed.items), {}, 'malformed state safe items');
  assert.equal(malformed.diagnostics[0].code, 'malformed-folder-state', 'malformed diagnostic');
}

{
  const state = core.normalizeFolderState({
    folders: [{
      id: 'proj_1',
      name: 'Project Backed',
      kind: 'project_backed',
      projectRef: { id: 'project-a', name: 'Project A' },
      iconColor: '#3b82f6',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }],
    items: {},
  });
  assert.equal(state.folders[0].kind, 'project_backed', 'project-backed kind survives');
  assert.deepEqual(plain(state.folders[0].projectRef), { id: 'project-a', name: 'Project A' }, 'projectRef survives');
  assert.equal(state.folders[0].iconColor, '#3B82F6', 'iconColor survives normalized');
  assert.equal(state.folders[0].createdAt, '2026-05-01T00:00:00.000Z', 'createdAt survives');
  assert.equal(state.folders[0].updatedAt, '2026-05-02T00:00:00.000Z', 'updatedAt survives');
}

{
  const folder = core.normalizeFolder({ id: 'f_ts', name: 'Timestamped' }, { nowIso: '2026-05-15T00:00:00.000Z' });
  assert.equal(folder.createdAt, '2026-05-15T00:00:00.000Z', 'createdAt safely defaulted via opts');
  assert.equal(folder.updatedAt, '2026-05-15T00:00:00.000Z', 'updatedAt safely defaulted via opts');
}

{
  assert.equal(core.validateFolderId('').ok, false, 'empty folder ID rejected');
  assert.equal(core.validateFolderId('bad/id').ok, false, 'unsafe slash folder ID rejected');
  assert.equal(core.validateFolderId('<bad>').ok, false, 'unsafe angle folder ID rejected');
  assert.equal(core.validateFolderId('safe_id-1').ok, true, 'safe folder ID accepted');
}

console.log('[validate-folder-provider-core] ok');
