#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corePath = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const paginationPath = 'src-runtime-base/0C1b.⚫️🪟 Pagination Windowing (Chat 🔗 Adapter) 🪟.js';
const archivePath = 'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js';
const miniMapPath = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const baselineSha = 'be9fcf7369ef66c8db6d2e9acde6b9357fbd58a7';
const coreSource = fs.readFileSync(path.join(root, corePath), 'utf8');
const paginationSource = fs.readFileSync(path.join(root, paginationPath), 'utf8');
const archiveSource = fs.readFileSync(path.join(root, archivePath), 'utf8');
const miniMapSource = fs.readFileSync(path.join(root, miniMapPath), 'utf8');
const baselineCoreSource = execFileSync('git', ['show', `${baselineSha}:${corePath}`], {
  cwd: root,
  encoding: 'utf8',
});

let assertionCount = 0;
const fixtures = [];
const equal = (actual, expected, message) => {
  assertionCount += 1;
  const clean = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(clean(actual), clean(expected), message);
};
const ok = (value, message) => {
  assertionCount += 1;
  assert.ok(value, message);
};
const fixture = async (name, fn) => {
  try {
    await fn();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
};

function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start < 0 || source.indexOf(`  function ${name}(`, start + 1) >= 0) {
    throw new Error(`production-function-anchor-invalid:${name}`);
  }
  const signatureEnd = source.indexOf(') {', start);
  const brace = signatureEnd < 0 ? -1 : signatureEnd + 2;
  if (brace < 0) throw new Error(`production-function-signature-invalid:${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`production-function-boundary-invalid:${name}`);
}

function createEnvelopeRuntime(source) {
  const names = [
    'chatAtlasCompleteIndexIdentity',
    'chatAtlasCompleteIndexStableHash',
    'chatAtlasCompleteIndexFingerprint',
    'chatAtlasCompleteIndexExactKeys',
    'chatAtlasNormalizeCompleteIndexEnvelope',
  ];
  const program = `(function () {
    const COMPLETE_TURN_INDEX_CACHE_SCHEMA = 1;
    const COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS = [];
    const COMPLETE_TURN_INDEX_CACHE_KEYS = ['schema','chatId','payloadUpdateTime','sourceFingerprint','capturedAt','validatedAt','complete','proof','turns'];
    const COMPLETE_TURN_INDEX_ROW_KEYS = ['order','qId','turnId','answerVariants','primaryAId','noAnswer','stopped'];
    ${names.map((name) => extractFunction(source, name)).join('\n')}
    return { normalize: chatAtlasNormalizeCompleteIndexEnvelope, fingerprint: chatAtlasCompleteIndexFingerprint };
  })()`;
  return vm.runInNewContext(program, { Date, Object, Array, Set, Map, String, Number, JSON });
}

function stoppedSiblingHostEnvelope(runtime) {
  const turns = [{
    order: 1,
    qId: 'stopped-selected-q',
    turnId: 'turn:stopped-selected-q',
    answerVariants: ['completed-sibling-a'],
    primaryAId: null,
    noAnswer: true,
    stopped: true,
  }];
  return {
    schema: 1,
    chatId: 'fixture-chat',
    payloadUpdateTime: 40,
    sourceFingerprint: runtime.fingerprint(turns),
    capturedAt: '2026-07-18T00:00:00.000Z',
    completeness: {
      complete: true,
      proof: 'host-payload-full-graph',
      validatedAt: '2026-07-18T00:00:00.000Z',
    },
    turns,
  };
}

function createPaginationReconciler(source, authorityActive) {
  const productionFunction = extractFunction(source, 'reconcileTurnRecordsFromPaginationSnapshot');
  const program = `(function () {
    const turnState = { turns: [{ qId: 'proven-q-1' }, { qId: 'proven-q-2' }], paginationDrafts: null };
    const counters = { seeds: 0, commits: 0 };
    const chatAtlasCompleteIndexAuthorityActive = () => ${authorityActive === true};
    const buildPaginationTurnDrafts = (rows) => rows.map((row) => ({ ...row }));
    const seedDurableTurnDrafts = () => { counters.seeds += 1; };
    const buildLiveTurnDrafts = () => [];
    const selectChatAtlasCanonicalDrafts = (rows) => rows;
    const commitTurnDrafts = (rows) => { counters.commits += 1; turnState.turns = rows.map((row) => ({ ...row })); };
    const listTurnRecords = () => turnState.turns.map((row) => ({ ...row }));
    ${productionFunction}
    return { run: reconcileTurnRecordsFromPaginationSnapshot, turnState, counters };
  })()`;
  return vm.runInNewContext(program, Object.create(null));
}

function evaluateSlimTurnDraft(source, draft) {
  const productionFunction = extractFunction(source, 'slimTurnDraft');
  return vm.runInNewContext(`(function () {
    const boundedTurnDraftStructure = (value) => value || null;
    ${productionFunction}
    return slimTurnDraft(${JSON.stringify(draft)});
  })()`, Object.create(null));
}

function createTurnEventRuntime(source, enabled = true) {
  const causeFunction = extractFunction(source, 'chatAtlasCompleteIndexTurnEventCause');
  const handlerFunction = extractFunction(source, 'chatAtlasHandleCompleteIndexTurnEvent');
  const causesStart = source.indexOf('  const COMPLETE_TURN_INDEX_EVENT_CAUSES = Object.freeze({');
  const causesEnd = source.indexOf('\n  });', causesStart);
  if (causesStart < 0 || causesEnd < causesStart) throw new Error('turn-event-causes-anchor-invalid');
  const causesDeclaration = source.slice(causesStart, causesEnd + '\n  });'.length);
  const program = `(function () {
    ${causesDeclaration}
    const scheduled = [];
    const marked = [];
    const completeTurnIndexAuthorityState = {
      enabled: ${enabled === true},
      pendingDrafts: new Map([['pending-q', { qId: 'pending-q', answerIds: ['request-placeholder-1'] }]]),
    };
    const completeIndexRefreshCoordinator = { markPending: (count) => marked.push(count) };
    const chatAtlasCompleteIndexIdentity = (value) => String(value || '').trim();
    const getCompleteTurnIndexProjectionStatus = () => ({ enabled: completeTurnIndexAuthorityState.enabled });
    const chatAtlasScheduleCompleteIndexRefresh = (cause) => { scheduled.push(cause); return Promise.resolve({ cause }); };
    ${causeFunction}
    ${handlerFunction}
    return { cause: chatAtlasCompleteIndexTurnEventCause, handle: chatAtlasHandleCompleteIndexTurnEvent,
      state: completeTurnIndexAuthorityState, scheduled, marked };
  })()`;
  return vm.runInNewContext(program, Object.create(null));
}

await fixture('B1 previous production contract replaces proven membership', () => {
  const runtime = createPaginationReconciler(baselineCoreSource, true);
  const rows = runtime.run([{ qId: 'legacy-mounted-only' }]);
  equal(rows.map((row) => row.qId), ['legacy-mounted-only']);
  equal(runtime.counters.commits, 1);
  equal(runtime.counters.seeds, 1);
});

await fixture('B1 complete authority survives pagination reconciliation', () => {
  const runtime = createPaginationReconciler(coreSource, true);
  const rows = runtime.run([{ qId: 'legacy-mounted-only' }]);
  equal(rows.map((row) => row.qId), ['proven-q-1', 'proven-q-2']);
  equal(runtime.counters.commits, 0);
  equal(runtime.counters.seeds, 0);
  equal(runtime.turnState.paginationDrafts, null);
});

await fixture('B1 complete authority blocks append remove reorder renumber and rekey', () => {
  const runtime = createPaginationReconciler(coreSource, true);
  const before = JSON.stringify(runtime.turnState.turns);
  runtime.run([
    { qId: 'rekeyed-q', turnNo: 99 },
    { qId: 'appended-q', turnNo: 1 },
  ]);
  equal(JSON.stringify(runtime.turnState.turns), before);
});

await fixture('B1 disabled mode preserves legacy pagination reconciliation', () => {
  const runtime = createPaginationReconciler(coreSource, false);
  const rows = runtime.run([{ qId: 'legacy-q-1' }, { qId: 'legacy-q-2' }]);
  equal(rows.map((row) => row.qId), ['legacy-q-1', 'legacy-q-2']);
  equal(runtime.counters.commits, 1);
});

await fixture('B1 pagination adapter checks route-owned authority before canonical sync', () => {
  ok(paginationSource.includes("authority?.enabled === true"));
  ok(paginationSource.includes("authority?.authoritative === true"));
  ok(paginationSource.includes("authorityChatId === currentChatId"));
  ok(paginationSource.indexOf('authorityChatId === currentChatId') < paginationSource.indexOf('api._reconcilePaginationSnapshot(rows)'));
});

await fixture('B2 previous listener contract has no question-branch refresh ownership', () => {
  const baselineListener = extractFunction(baselineCoreSource, 'chatAtlasBindCompleteIndexRefreshListeners');
  equal(baselineListener.includes('question-branch-changed'), false);
  equal(baselineListener.includes('question-selected-path-changed'), false);
});

await fixture('B2 question branch and selected path events schedule bounded refresh causes', async () => {
  const runtime = createTurnEventRuntime(coreSource);
  await runtime.handle({ reason: 'question-branch-selected' });
  await runtime.handle({ reason: 'selected-path-changed' });
  await runtime.handle({ reason: 'edited-question-selected-path' });
  equal(runtime.scheduled, [
    'question-branch-changed',
    'question-selected-path-changed',
    'question-selected-path-changed',
  ]);
});

await fixture('B2 answer branch event retains one coordinator owner', async () => {
  const runtime = createTurnEventRuntime(coreSource);
  await runtime.handle({ cause: 'answer-branch-selected' });
  equal(runtime.scheduled, ['answer-branch-changed']);
  equal(coreSource.split('H2O.bus.on(EV_CORE_TURN_UPDATED').length - 1, 2);
});

await fixture('B2 disabled handler performs no complete-index update work', async () => {
  const runtime = createTurnEventRuntime(coreSource, false);
  await runtime.handle({ reason: 'selected-path-changed' });
  equal(runtime.scheduled.length, 0);
});

await fixture('B3 previous slim draft drops explicit stopped state', () => {
  const draft = evaluateSlimTurnDraft(baselineCoreSource, { qId: 'pending-q', stopped: true, noAnswer: true });
  equal(draft.stopped, undefined);
});

await fixture('B3 stopped live draft retains explicit stopped state', () => {
  const draft = evaluateSlimTurnDraft(coreSource, { qId: 'pending-q', stopped: true, noAnswer: true });
  equal(draft.stopped, true);
  equal(draft.noAnswer, true);
});

await fixture('B3 stop-before-first-answer marks pending and schedules one refresh', async () => {
  const runtime = createTurnEventRuntime(coreSource);
  await runtime.handle({ kind: 'response-stopped', qId: 'pending-q' });
  const pending = runtime.state.pendingDrafts.get('pending-q');
  equal(pending.stopped, true);
  equal(pending.noAnswer, true);
  equal(pending.answerIds, ['request-placeholder-1']);
  equal(runtime.scheduled, ['turn-stopped']);
  equal(runtime.marked, [1]);
});

await fixture('B3 ordinary empty-child event is not guessed stopped', async () => {
  const runtime = createTurnEventRuntime(coreSource);
  await runtime.handle({ reason: 'turn-settled', qId: 'pending-q' });
  const pending = runtime.state.pendingDrafts.get('pending-q');
  equal(pending.stopped, undefined);
  equal(runtime.scheduled, ['turn-settled']);
});

await fixture('B4 previous envelope contract rejects stopped selected branch with sibling', () => {
  const runtime = createEnvelopeRuntime(baselineCoreSource);
  const result = runtime.normalize(stoppedSiblingHostEnvelope(runtime), 'fixture-chat', { source: 'host' });
  equal(result.ok, false);
  equal(result.errorCode, 'complete-index-no-answer-invalid');
});

await fixture('B4 stopped selected branch accepts completed inactive sibling without primary', () => {
  const runtime = createEnvelopeRuntime(coreSource);
  const result = runtime.normalize(stoppedSiblingHostEnvelope(runtime), 'fixture-chat', { source: 'host' });
  equal(result.ok, true);
  equal(result.envelope.turns[0], {
    order: 1,
    qId: 'stopped-selected-q',
    turnId: 'turn:stopped-selected-q',
    answerVariants: ['completed-sibling-a'],
    primaryAId: null,
    noAnswer: true,
    stopped: true,
  });
});

await fixture('B4 clean NO ANSWER still forbids variants unless selected branch is stopped', () => {
  const runtime = createEnvelopeRuntime(coreSource);
  const raw = stoppedSiblingHostEnvelope(runtime);
  raw.turns[0].stopped = false;
  raw.sourceFingerprint = runtime.fingerprint(raw.turns);
  const result = runtime.normalize(raw, 'fixture-chat', { source: 'host' });
  equal(result.ok, false);
  equal(result.errorCode, 'complete-index-no-answer-invalid');
});

await fixture('B4 parser explicitly separates selected NO ANSWER from inactive sibling variants', () => {
  ok(archiveSource.includes('const selectedBranchNoAnswer = !primaryAId;'));
  ok(archiveSource.includes('noAnswer: selectedBranchNoAnswer'));
  ok(archiveSource.includes('inactiveVariantCount: Math.max(0, answerVariants.length - (primaryAId ? 1 : 0))'));
});

await fixture('B4 MiniMap preserves sibling ownership while rendering one NO ANSWER box', () => {
  equal(miniMapSource.split('const answerIds = cacheRowAnswerIds({').length - 1 >= 2, true);
  ok(miniMapSource.includes("const answerId = noAnswer ? ''"));
  ok(miniMapSource.includes('hasAssistant: noAnswer ? false'));
});

await fixture('Gate 5 correctness validator remains production-backed and privacy bounded', () => {
  equal(coreSource.includes('conversation text'), false);
  equal(coreSource.includes('authorization header'), false);
  ok(coreSource.includes('host-payload-full-graph'));
});

const failed = fixtures.filter((row) => !row.ok);
console.log(`CV-3.4 Gate 5 correctness: ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failed.length} failures`);
for (const row of failed) console.error(`FAIL ${row.name}\n${row.error}`);
if (failed.length) process.exitCode = 1;
