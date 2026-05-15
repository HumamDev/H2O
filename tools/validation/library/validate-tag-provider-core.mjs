#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const corePath = path.join(repoRoot, 'shared/library/tag-provider-core.js');
const nativeMirrorPath = path.join(repoRoot, 'scripts/0F0g.⬛️🗂️ Tag Provider Core 🗂️.js');
const studioMirrorPath = path.join(repoRoot, 'surfaces/studio/S0F0g. 🎬 Tag Provider Core - Studio.js');

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

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox, { filename: corePath });

const core = sandbox.H2O?.Library?.TagProviderCore;
assert.ok(core, 'TagProviderCore must publish on H2O.Library');
assert.equal(core.__phase, '5B');

const expectedApi = [
  '__phase',
  'normalizeTag',
  'normalizeTagCatalog',
  'normalizeTagBinding',
  'normalizeTurnTagBinding',
  'normalizeTagOccurrence',
  'normalizeTagOccurrenceIndex',
  'normalizeTagAutoPool',
  'normalizeTagCategoryLink',
  'mergeTagCatalog',
  'mergeTagOccurrenceIndex',
  'applyTagBinding',
  'removeTagBinding',
  'computeTagCounts',
  'deriveTagsForRecord',
  'rankTagSuggestions',
  'validateTagId',
  'resolveTagId',
  'findOrphanTagBindings',
  'repairTagState',
];
assert.deepEqual(Object.keys(core), expectedApi, 'exported API keys must remain stable');

const catalog = {
  updatedAt: '2026-05-15T00:00:00.000Z',
  tags: [
    {
      id: 'research',
      label: 'Research',
      name: 'Research',
      color: '#336699',
      source: 'user',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
      categoryIds: ['analysis'],
      usageCount: 4,
    },
    { id: 'legacy-tax', label: 'Tax Legacy', status: 'deprecated', replacementTagId: 'tax' },
    { id: 'tax', label: 'Tax', color: 'teal' },
  ],
};

{
  const tag = core.normalizeTag(catalog.tags[0]);
  assert.equal(tag.id, 'research', 'full tag id preserved');
  assert.equal(tag.label, 'Research', 'full tag label preserved');
  assert.equal(tag.name, 'Research', 'full tag name preserved');
  assert.equal(tag.color, '#336699'.toUpperCase(), 'valid color preserved');
  assert.equal(tag.source, 'user', 'source preserved');
  assert.deepEqual(plain(tag.categoryIds), ['analysis'], 'categoryIds preserved');
  assert.equal(tag.usageCount, 4, 'usageCount preserved');
}

{
  const normalized = core.normalizeTagCatalog({
    tags: [
      { id: 'dup', label: 'Alpha' },
      { id: 'dup', label: 'Beta' },
      { id: 'other', label: 'Alpha' },
    ],
  });
  assert.deepEqual(plain(normalized.tags.map((t) => t.id)), ['dup', 'other'], 'duplicate IDs dedupe deterministically');
  assert.deepEqual(plain(normalized.tags.map((t) => t.label)), ['Alpha', 'Alpha'], 'duplicate names survive');
  assert.equal(normalized.diagnostics.some((d) => d.code === 'duplicate-tag-id'), true, 'duplicate diagnostic recorded');
}

{
  assert.equal(core.validateTagId('').ok, false, 'empty tag ID rejected');
  assert.equal(core.validateTagId('bad/id').ok, false, 'slash tag ID rejected');
  assert.equal(core.validateTagId('<bad>').ok, false, 'unsafe tag ID rejected');
  assert.equal(core.validateTagId('safe_id-1').ok, true, 'safe tag ID accepted');
}

{
  const binding = core.normalizeTagBinding({ chatId: 'chat-1', tagIds: ['research', 'tax', 'research'] });
  assert.equal(binding.chatId, 'chat-1', 'chat binding chatId preserved');
  assert.equal(binding.scope, 'chat', 'chat binding scope preserved');
  assert.deepEqual(plain(binding.tagIds), ['research', 'tax'], 'chat binding tags deduped');
}

{
  const binding = core.normalizeTurnTagBinding({ chatId: 'chat-1', turnId: 'turn-1', tagIds: ['research'] });
  assert.equal(binding.chatId, 'chat-1', 'turn binding chatId preserved');
  assert.equal(binding.turnId, 'turn-1', 'turn identity preserved');
  assert.equal(binding.scope, 'turn', 'turn binding remains distinct from chat binding');
}

{
  const occ = core.normalizeTagOccurrence({ chatId: 'chat-1', turnId: 'turn-1', tagId: 'research', count: 2, score: 0.7 });
  assert.equal(occ.chatId, 'chat-1', 'occurrence chatId preserved');
  assert.equal(occ.turnId, 'turn-1', 'occurrence turnId preserved');
  assert.equal(occ.tagId, 'research', 'occurrence tagId preserved');
  assert.equal(occ.count, 2, 'occurrence count preserved');
}

{
  const index = core.normalizeTagOccurrenceIndex({
    chatId: 'chat-1',
    phrases: {
      research: { phrase: 'Research', turnIds: ['turn-1', 'turn-2'], count: 2 },
      tax: { phrase: 'Tax', turnIds: ['turn-3'], count: 1 },
    },
  });
  assert.equal(index.occurrences.length, 3, 'occurrence index expands phrase turn IDs');
  assert.deepEqual(plain(Object.keys(index.byTag).sort()), ['research', 'tax'], 'occurrence index grouped by tag');
}

{
  const pool = core.normalizeTagAutoPool({
    phrases: {
      beta: { phrase: 'Beta', totalCount: 5, score: 0.2 },
      alpha: { phrase: 'Alpha', totalCount: 2, score: 0.9 },
    },
  });
  assert.deepEqual(plain(pool.suggestions.map((t) => t.id)), ['alpha', 'beta'], 'auto-pool suggestions ranked by score');
}

{
  const link = core.normalizeTagCategoryLink({ tagId: 'research', label: 'Research', categoryIds: ['analysis', 'tax', 'analysis'] });
  assert.equal(link.tagId, 'research', 'tag-category link tagId preserved');
  assert.deepEqual(plain(link.categoryIds), ['analysis', 'tax'], 'tag-category categories deduped');
}

{
  const merged = core.mergeTagCatalog([{ id: 'alpha', label: 'Name' }], [{ id: 'beta', label: 'Name' }]);
  assert.deepEqual(plain(merged.tags.map((t) => t.id)), ['alpha', 'beta'], 'merge keeps distinct IDs');
  assert.deepEqual(plain(merged.tags.map((t) => t.label)), ['Name', 'Name'], 'merge preserves duplicate names');
}

{
  const applied = core.applyTagBinding({}, { chatId: 'chat-1', tagIds: ['research', 'tax'] });
  assert.equal(applied.ok, true, 'apply binding succeeds');
  assert.deepEqual(plain(applied.state.bindings['chat-1']), ['research', 'tax'], 'binding written');
  const removed = core.removeTagBinding(applied.state, 'chat-1', 'tax');
  assert.deepEqual(plain(removed.state.bindings['chat-1']), ['research'], 'remove binding removes requested tag');
}

{
  const counts = core.computeTagCounts([
    { chatId: 'a', tagIds: ['research', 'tax'] },
    { chatId: 'b', tags: ['research'] },
    { chatId: 'c', tags: [] },
  ]);
  assert.deepEqual(plain(counts.byTag), { research: 2, tax: 1 }, 'tag counts computed');
  assert.equal(counts.untagged, 1, 'untagged rows counted');
}

{
  const derived = core.deriveTagsForRecord({ tags: [{ id: 'research', label: 'Research' }], organization: { tagIds: ['tax'] } });
  assert.deepEqual(plain(derived.tagIds), ['research', 'tax'], 'record tags derived from row and organization');
}

{
  const ranked = core.rankTagSuggestions([
    { id: 'low', label: 'Low', score: 0.1, usageCount: 100 },
    { id: 'high', label: 'High', score: 0.9, usageCount: 1 },
    { id: 'mid', label: 'Mid', score: 0.5, confidence: 0.8 },
  ]);
  assert.deepEqual(plain(ranked.map((t) => t.id)), ['high', 'mid', 'low'], 'suggestions rank deterministically');
}

{
  const orphans = core.findOrphanTagBindings({ bindings: { 'chat-1': ['research', 'missing'] } }, catalog);
  assert.deepEqual(plain(orphans), [{ chatId: 'chat-1', tagId: 'missing', reason: 'tag-not-found' }], 'orphan bindings detected');
}

{
  const repaired = core.repairTagState({ bindings: { 'chat-1': ['legacy-tax', 'missing'] } }, catalog);
  assert.deepEqual(plain(repaired.state.bindings['chat-1']), ['tax'], 'repair maps deprecated tag and removes orphan');
  assert.deepEqual(plain(repaired.removed), [{ chatId: 'chat-1', tagId: 'missing' }], 'repair reports removed orphan');
}

console.log('validate-tag-provider-core: ok');
