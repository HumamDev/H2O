#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const corePath = path.join(repoRoot, 'shared/library/label-provider-core.js');
const nativeMirrorPath = path.join(repoRoot, 'scripts/0F0h.⬛️🏷️ Label Provider Core 🏷️.js');
const studioMirrorPath = path.join(repoRoot, 'surfaces/studio/S0F0h. 🎬 Label Provider Core - Studio.js');

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

const core = sandbox.H2O?.Library?.LabelProviderCore;
assert.ok(core, 'LabelProviderCore must publish on H2O.Library');
assert.equal(core.__phase, '5C');

const expectedApi = [
  '__phase',
  'normalizeLabel',
  'normalizeLabelCatalog',
  'normalizeLabelBinding',
  'normalizeLabelType',
  'normalizeLabelSummary',
  'mergeLabelCatalog',
  'applyLabelBinding',
  'removeLabelBinding',
  'computeLabelCounts',
  'deriveLabelsForRecord',
  'validateLabelId',
  'resolveLabelId',
  'findOrphanLabelBindings',
  'repairLabelState',
];
assert.deepEqual(Object.keys(core), expectedApi, 'exported API keys must remain stable');

const nativeCatalog = {
  workflowStatus: [
    { id: 'todo', label: 'Todo', type: 'workflowStatus', color: '#336699', builtIn: true, createdAt: '2026-05-01T00:00:00.000Z' },
  ],
  priority: [
    { id: 'p1', label: 'P1', type: 'priority', color: 'red' },
  ],
  custom: [
    { id: 'old-label', label: 'Old', type: 'custom', status: 'deprecated', replacementLabelId: 'new-label' },
    { id: 'new-label', label: 'New', type: 'custom' },
  ],
};

{
  const label = core.normalizeLabel(nativeCatalog.workflowStatus[0]);
  assert.equal(label.id, 'todo', 'native typed label id preserved');
  assert.equal(label.label, 'Todo', 'native typed label label preserved');
  assert.equal(label.name, 'Todo', 'native typed label name preserved');
  assert.equal(label.type, 'workflowStatus', 'native typed label type preserved');
  assert.equal(label.color, '#336699'.toUpperCase(), 'native typed label color preserved');
  assert.equal(label.builtIn, true, 'builtIn preserved');
}

{
  const label = core.normalizeLabel({ id: 'flat', name: 'Flat Label', type: 'context', sortOrder: 2 });
  assert.equal(label.id, 'flat', 'Studio flat label id preserved');
  assert.equal(label.label, 'Flat Label', 'Studio flat name becomes label');
  assert.equal(label.name, 'Flat Label', 'Studio flat name preserved');
  assert.equal(label.type, 'context', 'Studio flat type preserved');
  assert.equal(label.sortOrder, 2, 'Studio flat sortOrder preserved');
}

{
  const normalized = core.normalizeLabelCatalog([
    { id: 'dup', name: 'Alpha', type: 'custom' },
    { id: 'dup', name: 'Beta', type: 'custom' },
    { id: 'other', name: 'Alpha', type: 'custom' },
  ]);
  assert.deepEqual(plain(normalized.labels.map((l) => l.id)), ['dup', 'other'], 'duplicate IDs dedupe deterministically');
  assert.deepEqual(plain(normalized.labels.map((l) => l.label)), ['Alpha', 'Alpha'], 'duplicate names survive');
  assert.equal(normalized.diagnostics.some((d) => d.code === 'duplicate-label-id'), true, 'duplicate diagnostic recorded');
}

{
  assert.equal(core.validateLabelId('').ok, false, 'empty label ID rejected');
  assert.equal(core.validateLabelId('bad/id').ok, false, 'slash label ID rejected');
  assert.equal(core.validateLabelId('<bad>').ok, false, 'unsafe label ID rejected');
  assert.equal(core.validateLabelId('safe_id-1').ok, true, 'safe label ID accepted');
}

{
  assert.equal(core.normalizeLabelType('workflow'), 'workflowStatus', 'workflow alias normalized');
  assert.equal(core.normalizeLabelType('priority'), 'priority', 'priority type preserved');
  assert.equal(core.normalizeLabelType('context'), 'context', 'context type preserved');
  assert.equal(core.normalizeLabelType('custom'), 'custom', 'custom type preserved');
  assert.equal(core.normalizeLabelType('action'), 'action', 'action type preserved');
  assert.equal(core.normalizeLabelType('content'), 'contentType', 'content alias normalized');
}

{
  const binding = core.normalizeLabelBinding({ chatId: 'chat-1', labelIds: ['todo', 'p1', 'todo'] });
  assert.equal(binding.chatId, 'chat-1', 'binding chatId preserved');
  assert.deepEqual(plain(binding.labelIds), ['todo', 'p1'], 'binding label IDs deduped');
}

{
  const summary = core.normalizeLabelSummary({
    workflowStatusLabelId: 'todo',
    priorityLabelId: 'p1',
    actionLabelIds: ['follow'],
    contentTypeLabelIds: ['analysis'],
    contextLabelIds: ['client'],
    customLabelIds: ['custom-a'],
  });
  assert.equal(summary.workflowStatus, 'todo', 'workflow summary preserved');
  assert.equal(summary.priority, 'p1', 'priority summary preserved');
  assert.deepEqual(plain(summary.action), ['follow'], 'action summary preserved');
  assert.deepEqual(plain(summary.contentType), ['analysis'], 'content summary preserved');
  assert.deepEqual(plain(summary.context), ['client'], 'context summary preserved');
  assert.deepEqual(plain(summary.custom), ['custom-a'], 'custom summary preserved');
}

{
  const merged = core.mergeLabelCatalog([{ id: 'alpha', name: 'Name', type: 'custom' }], [{ id: 'beta', name: 'Name', type: 'context' }]);
  assert.deepEqual(plain(merged.labels.map((l) => l.id)), ['alpha', 'beta'], 'merge keeps distinct IDs');
  assert.deepEqual(plain(merged.labels.map((l) => l.label)), ['Name', 'Name'], 'merge preserves duplicate names');
}

{
  const applied = core.applyLabelBinding({}, { chatId: 'chat-1', labelIds: ['todo', 'p1'] });
  assert.equal(applied.ok, true, 'apply binding succeeds');
  assert.deepEqual(plain(applied.state.bindings['chat-1']), ['todo', 'p1'], 'binding written');
  const removed = core.removeLabelBinding(applied.state, 'chat-1', 'p1');
  assert.deepEqual(plain(removed.state.bindings['chat-1']), ['todo'], 'remove binding removes requested label');
}

{
  const counts = core.computeLabelCounts([
    { chatId: 'a', labelIds: ['todo', 'p1'] },
    { chatId: 'b', labels: ['todo'] },
    { chatId: 'c', labels: [] },
  ]);
  assert.deepEqual(plain(counts.byLabel), { todo: 2, p1: 1 }, 'label counts computed');
  assert.equal(counts.unlabeled, 1, 'unlabeled rows counted');
}

{
  const derived = core.deriveLabelsForRecord({
    labels: [{ id: 'todo', label: 'Todo' }],
    organization: { labelIds: ['p1'] },
    snapshotMeta: { labels: { contextLabelIds: ['client'] } },
  });
  assert.deepEqual(plain(derived.labelIds), ['todo', 'p1', 'client'], 'record labels derived from row, organization, and snapshot summary');
}

{
  const orphans = core.findOrphanLabelBindings({ bindings: { 'chat-1': ['todo', 'missing'] } }, nativeCatalog);
  assert.deepEqual(plain(orphans), [{ chatId: 'chat-1', labelId: 'missing', reason: 'label-not-found' }], 'orphan bindings detected');
}

{
  const repaired = core.repairLabelState({ bindings: { 'chat-1': ['old-label', 'missing'] } }, nativeCatalog);
  assert.deepEqual(plain(repaired.state.bindings['chat-1']), ['new-label'], 'repair maps deprecated label and removes orphan');
  assert.deepEqual(plain(repaired.removed), [{ chatId: 'chat-1', labelId: 'missing' }], 'repair reports removed orphan');
}

{
  const emptyCatalog = core.normalizeLabelCatalog(null);
  assert.deepEqual(plain(emptyCatalog.labels), [], 'null catalog is safe empty catalog');
  const emptyBinding = core.normalizeLabelBinding(null);
  assert.deepEqual(plain(emptyBinding.labelIds), [], 'null binding is safe empty binding');
}

console.log('validate-label-provider-core: ok');
