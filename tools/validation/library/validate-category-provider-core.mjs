#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const corePath = path.join(repoRoot, 'shared/library/category-provider-core.js');
const nativeMirrorPath = path.join(repoRoot, 'src-runtime-base/0F0f.⬛️🗂️ Category Provider Core 🗂️.js');
const studioMirrorPath = path.join(repoRoot, 'surfaces/studio/S0F0f. 🎬 Category Provider Core - Studio.js');

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

const core = sandbox.H2O?.Library?.CategoryProviderCore;
assert.ok(core, 'CategoryProviderCore must publish on H2O.Library');
assert.equal(core.__phase, '4B');

const expectedApi = [
  '__phase',
  'normalizeCategory',
  'normalizeCategoryCatalog',
  'normalizeCategoryOverride',
  'normalizeCategoryCandidate',
  'normalizeSnapshotCategory',
  'validateCategoryId',
  'resolveCategoryId',
  'mergeCategoryCatalog',
  'applyCategoryOverride',
  'removeCategoryOverride',
  'rankCategoryCandidates',
  'computeCategoryCounts',
  'deriveCategoryForRecord',
  'classifyRecordCategory',
  'findOrphanCategoryAssignments',
  'repairCategoryState',
];
assert.deepEqual(Object.keys(core), expectedApi, 'exported API keys must remain stable');

const catalog = {
  updatedAt: '2026-05-15T00:00:00.000Z',
  categories: [
    {
      id: 'legal',
      name: 'Legal',
      description: 'Law and policy',
      color: '#336699',
      sortOrder: 2,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
      status: 'active',
      aliases: ['law', 'policy'],
      custom: true,
    },
    { id: 'tax-old', name: 'Tax Legacy', status: 'deprecated', replacementCategoryId: 'tax' },
    { id: 'tax', name: 'Tax', status: 'active', color: 'teal' },
  ],
};

{
  const category = core.normalizeCategory(catalog.categories[0]);
  assert.equal(category.id, 'legal', 'full catalog category id preserved');
  assert.equal(category.name, 'Legal', 'full catalog category name preserved');
  assert.equal(category.description, 'Law and policy', 'description preserved');
  assert.equal(category.color, '#336699'.toUpperCase(), 'valid hex color preserved');
  assert.equal(category.sortOrder, 2, 'sortOrder preserved');
  assert.equal(category.createdAt, '2026-05-01T00:00:00.000Z', 'createdAt preserved');
  assert.equal(category.updatedAt, '2026-05-02T00:00:00.000Z', 'updatedAt preserved');
  assert.deepEqual(plain(category.aliases), ['law', 'policy'], 'aliases preserved');
  assert.equal(category.custom, true, 'custom preserved');
}

{
  const normalized = core.normalizeCategoryCatalog({
    categories: [
      { id: 'dup', name: 'Alpha' },
      { id: 'dup', name: 'Beta' },
      { id: 'other', name: 'Alpha' },
    ],
  });
  assert.deepEqual(plain(normalized.categories.map((c) => c.id)), ['dup', 'other'], 'duplicate IDs dedupe deterministically');
  assert.deepEqual(plain(normalized.categories.map((c) => c.name)), ['Alpha', 'Alpha'], 'duplicate names survive');
  assert.equal(normalized.diagnostics.some((d) => d.code === 'duplicate-category-id'), true, 'duplicate diagnostic recorded');
}

{
  assert.equal(core.validateCategoryId('').ok, false, 'empty category ID rejected');
  assert.equal(core.validateCategoryId('bad/id').ok, false, 'slash category ID rejected');
  assert.equal(core.validateCategoryId('<bad>').ok, false, 'unsafe category ID rejected');
  assert.equal(core.validateCategoryId('safe_id-1').ok, true, 'safe category ID accepted');
}

{
  const resolved = core.resolveCategoryId('tax-old', catalog);
  assert.equal(resolved.ok, true, 'deprecated category resolves');
  assert.equal(resolved.categoryId, 'tax', 'replacement category returned');
  assert.equal(resolved.replaced, true, 'replacement flag set');
  assert.deepEqual(plain(resolved.chain), ['tax-old', 'tax'], 'replacement chain preserved');
}

{
  const snapshot = core.normalizeSnapshotCategory({
    primaryCategoryId: 'legal',
    source: 'user',
    confidence: 0.91,
    algorithmVersion: 'manual-v1',
    classifiedAt: '2026-05-10T00:00:00.000Z',
    overriddenAt: '2026-05-11T00:00:00.000Z',
  });
  assert.equal(snapshot.primaryCategoryId, 'legal', 'snapshot primary category preserved');
  assert.equal(snapshot.source, 'user', 'snapshot user source preserved');
  assert.equal(snapshot.confidence, 0.91, 'snapshot confidence preserved');
  assert.equal(snapshot.algorithmVersion, 'manual-v1', 'algorithm version preserved');
}

{
  const derived = core.deriveCategoryForRecord(
    {
      chatId: 'chat-override',
      category: { primaryCategoryId: 'legal', source: 'system', confidence: 0.4 },
    },
    {
      catalog,
      overrides: {
        'chat-override': { categoryId: 'tax', source: 'user', confidence: 1 },
      },
    },
  );
  assert.equal(derived.categoryId, 'tax', 'user override wins over system category');
  assert.equal(derived.source, 'user', 'override source retained');
}

{
  const override = core.normalizeCategoryOverride({ chatId: 'chat-a', categoryId: 'legal', source: 'user' }, { catalog });
  assert.equal(override.chatId, 'chat-a', 'override chatId preserved');
  assert.equal(override.categoryId, 'legal', 'override categoryId preserved');
  assert.equal(override.source, 'user', 'override source preserved');
}

{
  const ranked = core.rankCategoryCandidates([
    { id: 'low', name: 'Low', score: 3, confidence: 0.9 },
    { id: 'high', name: 'High', score: 5, confidence: 0.4 },
    { id: 'tie', name: 'Tie', score: 5, confidence: 0.8 },
  ]);
  assert.deepEqual(plain(ranked.map((c) => c.id)), ['tie', 'high', 'low'], 'candidates rank by score then confidence');
}

{
  const counts = core.computeCategoryCounts([
    { chatId: 'a', category: { primaryCategoryId: 'legal', source: 'system' } },
    { chatId: 'b', categoryId: 'legal' },
    { chatId: 'c', organization: { categoryId: 'tax' } },
    { chatId: 'd' },
  ], { catalog });
  assert.deepEqual(plain(counts.byCategory), { legal: 2, tax: 1 }, 'primary category counts computed');
  assert.equal(counts.total, 3, 'categorized total computed');
  assert.equal(counts.uncategorized, 1, 'uncategorized count computed');
}

{
  const derived = core.deriveCategoryForRecord({
    chatId: 'snapshot-chat',
    snapshotMeta: { category: { primaryCategoryId: 'legal', source: 'system', confidence: 0.7 } },
  }, { catalog });
  assert.equal(derived.categoryId, 'legal', 'snapshot meta category read');
  assert.equal(derived.source, 'system', 'snapshot source read');
  assert.equal(derived.confidence, 0.7, 'snapshot confidence read');
}

{
  const derived = core.deriveCategoryForRecord({
    chatId: 'registry-chat',
    organization: { categoryId: 'tax' },
  }, { catalog });
  assert.equal(derived.categoryId, 'tax', 'ChatRegistry organization.categoryId read');
  assert.equal(derived.source, 'registry', 'registry source marked');
}

{
  const orphans = core.findOrphanCategoryAssignments([
    { chatId: 'missing-chat', category: { primaryCategoryId: 'missing-category', source: 'system' } },
  ], catalog);
  assert.equal(orphans.length, 1, 'missing category assignment detected');
  assert.equal(orphans[0].categoryId, 'missing-category', 'orphan category id reported');
}

{
  const repaired = core.repairCategoryState([
    { chatId: 'legacy-tax-chat', category: { primaryCategoryId: 'tax-old', source: 'system' } },
  ], catalog);
  assert.equal(repaired.rows[0].category.primaryCategoryId, 'tax', 'deprecated category mapped to replacement');
  assert.deepEqual(plain(repaired.replacements), [{
    chatId: 'legacy-tax-chat',
    fromCategoryId: 'tax-old',
    toCategoryId: 'tax',
  }], 'replacement reported');
}

{
  assert.deepEqual(plain(core.normalizeCategoryCatalog(null).categories), [], 'null catalog safe');
  assert.deepEqual(plain(core.rankCategoryCandidates(null)), [], 'null candidates safe');
  assert.deepEqual(plain(core.computeCategoryCounts(null).byCategory), {}, 'null rows safe');
  assert.equal(core.deriveCategoryForRecord(null).categoryId, '', 'null record safe');
}

{
  assert.equal(core.__phase, '4B', 'phase exported');
}

console.log('[validate-category-provider-core] ok');
