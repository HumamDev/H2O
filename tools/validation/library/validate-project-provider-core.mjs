#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const corePath = path.join(repoRoot, 'shared/library/project-provider-core.js');
const nativeMirrorPath = path.join(repoRoot, 'src-runtime-base/0F0i.⬛️🗂️ Project Provider Core 🗂️.js');
const studioMirrorPath = path.join(repoRoot, 'surfaces/studio/S0F0i. 🎬 Project Provider Core - Studio.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function iifeBody(src) {
  const idx = src.indexOf('(() => {');
  assert.ok(idx >= 0, 'IIFE body marker missing');
  return src.slice(idx);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const coreSource = read(corePath);
const nativeSource = read(nativeMirrorPath);
const studioSource = read(studioMirrorPath);

assert.equal(iifeBody(coreSource), iifeBody(nativeSource), 'native mirror IIFE body must match canonical core');
assert.equal(iifeBody(coreSource), iifeBody(studioSource), 'Studio mirror IIFE body must match canonical core');

const sandbox = { console, URL };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox, { filename: corePath });

const core = sandbox.H2O?.Library?.ProjectProviderCore;
assert.ok(core, 'ProjectProviderCore must publish on H2O.Library');
assert.equal(core.__phase, '6B');

const expectedApi = [
  '__phase',
  'normalizeProject',
  'normalizeProjectCatalog',
  'normalizeProjectCache',
  'normalizeProjectRef',
  'normalizeProjectBinding',
  'mergeProjectCatalog',
  'mergeProjectCache',
  'applyProjectBinding',
  'removeProjectBinding',
  'computeProjectCounts',
  'deriveProjectForRecord',
  'validateProjectId',
  'resolveProjectId',
  'findOrphanProjectBindings',
  'repairProjectState',
];
assert.deepEqual(Object.keys(core), expectedApi, 'exported API keys must remain stable');

const nativeRows = [
  {
    id: 'g-alpha',
    href: '/g/g-alpha/project',
    title: 'Research',
    iconHtml: '<svg></svg>',
    index: 2,
    source: 'snorlax-sidebar',
    cachedAt: '2026-05-16T00:00:00.000Z',
  },
  {
    id: 'g-beta',
    href: 'https://chatgpt.com/g/g-beta/project?x=1',
    title: 'Research',
    source: 'native-fetch-observed',
  },
];

{
  const project = core.normalizeProject(nativeRows[0]);
  assert.equal(project.id, 'g-alpha', 'native project id preserved');
  assert.equal(project.projectId, 'g-alpha', 'native project projectId preserved');
  assert.equal(project.title, 'Research', 'native project title preserved');
  assert.equal(project.href, '/g/g-alpha/project', 'native project href normalized to path');
  assert.equal(project.iconHtml, '<svg></svg>', 'native project iconHtml preserved');
  assert.equal(project.index, 2, 'native project index preserved');
  assert.equal(project.source, 'snorlax-sidebar', 'native project source preserved');
}

{
  const project = core.normalizeProject({ id: 'g-facet', count: 3, chatIds: ['a', 'b', 'a'], source: 'studio-facet' });
  assert.equal(project.id, 'g-facet', 'Studio facet project id accepted');
  assert.equal(project.name, 'g-facet', 'facet-only project name falls back to id');
  assert.deepEqual(plain(project.chatIds), ['a', 'b'], 'facet chatIds dedupe');
  assert.equal(project.count, 3, 'facet count preserved');
}

{
  const catalog = core.normalizeProjectCatalog([
    { id: 'dup', title: 'Alpha' },
    { id: 'dup', title: 'Beta' },
    { id: 'other', title: 'Alpha' },
  ]);
  assert.deepEqual(plain(catalog.projects.map((p) => p.id)), ['dup', 'other'], 'duplicate IDs dedupe deterministically');
  assert.deepEqual(plain(catalog.projects.map((p) => p.title)), ['Alpha', 'Alpha'], 'duplicate names survive');
  assert.equal(catalog.diagnostics.some((d) => d.code === 'duplicate-project-id'), true, 'duplicate diagnostic recorded');
}

{
  assert.equal(core.validateProjectId('').ok, false, 'empty project ID rejected');
  assert.equal(core.validateProjectId('bad/id').ok, false, 'slash project ID rejected');
  assert.equal(core.validateProjectId('<bad>').ok, false, 'unsafe project ID rejected');
  assert.equal(core.validateProjectId('g-safe_id-1').ok, true, 'safe project ID accepted');
}

{
  const cache = core.normalizeProjectCache({
    version: 2,
    source: 'snorlax-sidebar',
    rows: nativeRows,
    bestRows: [nativeRows[1]],
    complete: true,
    lastSuccessAt: 10,
    lastAttemptAt: 11,
    pageCount: 1,
    itemCount: 2,
    nextCursor: 'next',
    signature: 'sig',
    error: '',
    orderSource: 'api',
    lastReconciledAt: 12,
    bestSignature: 'best-sig',
    bestSource: 'native-snorlax-history',
    bestSourceRank: 85,
    bestRowCount: 1,
    bestAt: 13,
    bestComplete: true,
    knownProjectIds: ['g-extra'],
    lastRicherNativeAt: 14,
    sources: { api: { rowCount: 2 } },
  });
  assert.equal(cache.source, 'snorlax-sidebar', 'cache source preserved');
  assert.equal(cache.complete, true, 'cache complete preserved');
  assert.equal(cache.rows.length, 2, 'cache rows normalized');
  assert.equal(cache.bestRows.length, 1, 'cache bestRows normalized');
  assert.deepEqual(plain(cache.knownProjectIds), ['g-extra', 'g-beta', 'g-alpha'], 'cache known IDs preserved and extended');
  assert.equal(cache.sources.api.rowCount, 2, 'cache sources preserved');
}

{
  const ref = core.normalizeProjectRef({
    originProjectRef: { projectId: 'g-origin', projectName: 'Origin Name', nativeProjectHref: '/g/g-origin/project' },
  });
  assert.equal(ref.projectId, 'g-origin', 'originProjectRef projectId read');
  assert.equal(ref.projectName, 'Origin Name', 'originProjectRef projectName read');
  assert.equal(ref.nativeProjectHref, '/g/g-origin/project', 'originProjectRef href read');
}

{
  const merged = core.mergeProjectCatalog([{ id: 'alpha', title: 'Name' }], [{ id: 'beta', title: 'Name' }]);
  assert.deepEqual(plain(merged.projects.map((p) => p.id)), ['alpha', 'beta'], 'merge keeps distinct IDs');
  assert.deepEqual(plain(merged.projects.map((p) => p.title)), ['Name', 'Name'], 'merge preserves duplicate names');
}

{
  const merged = core.mergeProjectCache(
    { rows: [{ id: 'alpha', title: 'Alpha' }], bestRows: [{ id: 'alpha', title: 'Alpha' }], knownProjectIds: ['alpha'] },
    { rows: [{ id: 'beta', title: 'Beta' }], bestRows: [{ id: 'beta', title: 'Beta' }], knownProjectIds: ['beta'] },
  );
  assert.deepEqual(plain(merged.rows.map((p) => p.id)), ['alpha', 'beta'], 'cache rows merge safely');
  assert.deepEqual(plain(merged.knownProjectIds), ['alpha', 'beta'], 'cache known IDs merge safely');
}

{
  const binding = core.normalizeProjectBinding({ chatId: 'chat-1', projectId: 'g-alpha', projectName: 'Research' });
  assert.equal(binding.chatId, 'chat-1', 'binding chatId preserved');
  assert.equal(binding.projectId, 'g-alpha', 'binding projectId preserved');
  assert.equal(binding.projectName, 'Research', 'binding projectName preserved');
}

{
  const applied = core.applyProjectBinding({}, { chatId: 'chat-1', projectId: 'g-alpha', projectName: 'Research' });
  assert.equal(applied.ok, true, 'apply binding succeeds');
  assert.equal(applied.state.bindings['chat-1'].projectId, 'g-alpha', 'binding written');
  const removed = core.removeProjectBinding(applied.state, 'chat-1');
  assert.equal(removed.previous.projectId, 'g-alpha', 'remove reports previous binding');
  assert.deepEqual(plain(removed.state.bindings), {}, 'remove clears binding');
}

{
  const counts = core.computeProjectCounts([
    { chatId: 'a', projectId: 'g-alpha' },
    { chatId: 'b', project: { projectId: 'g-alpha' } },
    { chatId: 'c', originProjectRef: { id: 'g-beta', name: 'Beta' } },
    { chatId: 'd' },
  ]);
  assert.deepEqual(plain(counts.byProject), { 'g-alpha': 2, 'g-beta': 1 }, 'project counts computed');
  assert.equal(counts.unassigned, 1, 'unassigned rows counted');
}

{
  const derived = core.deriveProjectForRecord({ projectId: 'g-top', projectName: 'Top' });
  assert.equal(derived.projectId, 'g-top', 'top-level projectId derived');
  assert.equal(derived.projectName, 'Top', 'top-level projectName derived');
}

{
  const derived = core.deriveProjectForRecord({ project: { projectId: 'g-nested', projectName: 'Nested' } });
  assert.equal(derived.projectId, 'g-nested', 'nested projectId derived');
  assert.equal(derived.projectName, 'Nested', 'nested projectName derived');
}

{
  const derived = core.deriveProjectForRecord({ originProjectRef: { id: 'g-origin', name: 'Origin' } });
  assert.equal(derived.projectId, 'g-origin', 'originProjectRef id derived');
  assert.equal(derived.projectName, 'Origin', 'originProjectRef name derived');
}

{
  const catalog = [{ id: 'g-alpha', title: 'Alpha' }];
  const orphans = core.findOrphanProjectBindings({ bindings: { 'chat-1': { projectId: 'g-alpha' }, 'chat-2': { projectId: 'missing' } } }, catalog);
  assert.deepEqual(plain(orphans), [{ chatId: 'chat-2', projectId: 'missing', reason: 'project-not-found' }], 'orphan project bindings detected');
}

{
  const catalog = [
    { id: 'old-project', title: 'Old', status: 'deprecated', replacementProjectId: 'new-project' },
    { id: 'new-project', title: 'New' },
  ];
  const repaired = core.repairProjectState({ bindings: { 'chat-1': { projectId: 'old-project' }, 'chat-2': { projectId: 'missing' } } }, catalog);
  assert.equal(repaired.state.bindings['chat-1'].projectId, 'new-project', 'repair maps deprecated project');
  assert.deepEqual(plain(repaired.removed), [{ chatId: 'chat-2', projectId: 'missing' }], 'repair reports removed orphan');
}

{
  const emptyCatalog = core.normalizeProjectCatalog(null);
  assert.deepEqual(plain(emptyCatalog.projects), [], 'null catalog is safe empty catalog');
  const emptyCache = core.normalizeProjectCache(null);
  assert.deepEqual(plain(emptyCache.rows), [], 'null cache is safe empty cache');
  const emptyProject = core.deriveProjectForRecord(null);
  assert.equal(emptyProject.projectId, '', 'null record has empty project');
}

console.log('validate-project-provider-core: ok');
