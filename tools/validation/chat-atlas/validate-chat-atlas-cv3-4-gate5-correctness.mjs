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
    const COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS = [
      '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
      '3bdfa68f-a197-422a-a3d4-29f028fc6564',
      'e1d4b63f-0be7-4a51-b074-e3372b71d790',
      'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
    ];
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

function acceptedIdentityEnvelope(runtime) {
  const rows = Array.from({ length: 39 }, (_, index) => {
    const order = index + 1;
    let qId = `gate5-product-q-${String(order).padStart(2, '0')}`;
    let answerVariants = [`gate5-product-a-${String(order).padStart(2, '0')}`];
    let primaryAId = answerVariants[0];
    let noAnswer = false;
    let stopped = false;
    if (order === 20) {
      qId = '7e60a524-96df-462c-a6c0-647ed1a9973c';
      answerVariants = [];
      primaryAId = null;
      noAnswer = true;
      stopped = true;
    } else if (order === 29) {
      qId = '29a40c98-0bd8-48cd-be80-0273311a4977';
      answerVariants = ['54520999-dedf-4f01-8c60-ac8adcc2c066'];
      primaryAId = answerVariants[0];
    } else if (order === 34) {
      qId = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
      answerVariants = ['84c7e73c-5fb7-44f6-a930-72e92d369c5a', '733fa31a-7d11-4ce5-b570-8ffa474670d4'];
      primaryAId = answerVariants[1];
    } else if (order === 38) {
      qId = 'c64afed8-cfde-4644-b0df-3407313c4c54';
      answerVariants = [];
      primaryAId = null;
      noAnswer = true;
    } else if (order === 39) {
      qId = 'gate5-order-39-question';
      answerVariants = ['gate5-order-39-answer'];
      primaryAId = answerVariants[0];
    }
    return { order, qId, turnId: `turn:${qId}`, answerVariants, primaryAId, noAnswer, stopped };
  });
  return {
    schema: 1,
    chatId: 'fixture-chat',
    payloadUpdateTime: 500,
    sourceFingerprint: runtime.fingerprint(rows),
    capturedAt: '2026-07-18T00:00:00.000Z',
    completeness: { complete: true, proof: 'host-payload-full-graph', validatedAt: '2026-07-18T00:00:00.000Z' },
    turns: rows,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createRefreshHarness({ writeOk = true } = {}) {
  const codeFunction = extractFunction(coreSource, 'chatAtlasCompleteIndexCode');
  const coordinatorFunction = extractFunction(coreSource, 'createCompleteIndexRefreshCoordinator');
  const factory = vm.runInNewContext(`(function (adapters) {
    const COMPLETE_TURN_INDEX_REFRESH_LIMITS = Object.freeze({ debounceMs: 280, timeoutMs: 4500, diagnosticCauseLimit: 8, errorCodeLength: 96 });
    ${codeFunction}
    ${coordinatorFunction}
    return createCompleteIndexRefreshCoordinator(adapters);
  })`, { Object, Array, Set, Map, String, Number, Date, Math, Promise, AbortController });
  const timers = new Map();
  const providerQueue = [];
  const published = [];
  const writes = [];
  const cache = { bytes: 'previous-cache-bytes' };
  let timerId = 0;
  let route = 'fixture-chat|/c/fixture-chat';
  let enabled = true;
  let currentIndex = { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 1 };
  const adapters = {
    now: (() => { let tick = 0; return () => ++tick; })(),
    routeKey: () => route,
    isEnabled: () => enabled,
    chatId: () => 'fixture-chat',
    currentIndex: () => currentIndex,
    pendingCount: () => 0,
    provider: () => (_chatId, _opts) => {
      const next = providerQueue.shift();
      return next ? next() : Promise.resolve({ ok: false, errorCode: 'fixture-provider-empty' });
    },
    normalize: (raw) => raw?.complete === true
      ? { ok: true, envelope: raw }
      : { ok: false, errorCode: 'complete-index-proof-invalid' },
    compareRevision: (incoming, retained) => Number(incoming) - Number(retained),
    writeCache: (incoming) => {
      writes.push(incoming);
      if (!writeOk) return { ok: false, status: 'cache-write-failed' };
      cache.bytes = `cached:${incoming.payloadUpdateTime}`;
      return { ok: true, status: 'cache-written' };
    },
    publish: (incoming, source) => { currentIndex = incoming; published.push({ incoming, source }); },
    onState() {},
    setTimeout(fn, ms) { timerId += 1; timers.set(timerId, { fn, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    AbortController,
  };
  const coordinator = factory(adapters);
  return {
    coordinator,
    timers,
    providerQueue,
    published,
    writes,
    cache,
    setEnabled(value) { enabled = value === true; },
    setRoute(value) { route = String(value); },
    runTimer(ms) {
      const entry = Array.from(timers.entries()).find(([, timer]) => timer.ms === ms);
      if (!entry) return false;
      timers.delete(entry[0]);
      entry[1].fn();
      return true;
    },
  };
}

function evaluateAuthorityGuard(routeChatId, stateChatId, routeGeneration = 1) {
  const productionFunction = extractFunction(coreSource, 'chatAtlasCompleteIndexAuthorityActive');
  return vm.runInNewContext(`(function () {
    const COMPLETE_TURN_INDEX_COMPLETE_STATUSES = ['complete-validated'];
    const chatAtlasFullIndexRoute = () => ({ chatId: ${JSON.stringify(routeChatId)}, routeKey: '/c/' + ${JSON.stringify(routeChatId)} });
    const completeTurnIndexAuthorityState = {
      enabled: true, status: 'complete-validated', chatId: ${JSON.stringify(stateChatId)},
      routeKey: '/c/' + ${JSON.stringify(stateChatId)}, generation: ${Number(routeGeneration)},
      index: { complete: true, proof: 'host-payload-full-graph', turns: [{ qId: 'q' }] },
    };
    ${productionFunction}
    return chatAtlasCompleteIndexAuthorityActive();
  })()`, Object.create(null));
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

await fixture('in-flight causes coalesce into exactly one trailing refresh', async () => {
  const harness = createRefreshHarness();
  const first = deferred();
  harness.providerQueue.push(() => first.promise);
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 3 } }));
  const active = harness.coordinator.schedule('turn-settled', { immediate: true });
  await Promise.resolve();
  await Promise.resolve();
  for (let index = 0; index < 20; index += 1) void harness.coordinator.schedule(`answer-branch-${index}`);
  first.resolve({ ok: true, index: { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 2 } });
  await active;
  equal(harness.coordinator.getStatus().trailingRefreshCount, 1);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  equal(harness.coordinator.getStatus().fetchCount, 2);
  equal(harness.published.length, 2);
});

await fixture('route change cancels trailing refresh requirement', async () => {
  const harness = createRefreshHarness();
  const first = deferred();
  harness.providerQueue.push(() => first.promise);
  const active = harness.coordinator.schedule('turn-settled', { immediate: true });
  await Promise.resolve();
  void harness.coordinator.schedule('selected-path-changed');
  harness.setRoute('other-chat|/c/other-chat');
  harness.coordinator.cancel('route-changed', 'stale-route-discarded');
  first.resolve({ ok: true, index: { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 2 } });
  await active;
  equal(harness.coordinator.getStatus().trailingRequired, false);
  equal(harness.timers.size, 0);
});

await fixture('disable cancels trailing refresh requirement', async () => {
  const harness = createRefreshHarness();
  const first = deferred();
  harness.providerQueue.push(() => first.promise);
  const active = harness.coordinator.schedule('turn-settled', { immediate: true });
  await Promise.resolve();
  void harness.coordinator.schedule('question-branch-selected');
  harness.setEnabled(false);
  harness.coordinator.cancel('gate-disabled', 'idle');
  first.resolve({ ok: true, index: { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 2 } });
  await active;
  equal(harness.coordinator.getStatus().trailingRequired, false);
  equal(harness.timers.size, 0);
});

await fixture('refresh write failure publishes proven unpersisted authority and preserves bytes', async () => {
  const harness = createRefreshHarness({ writeOk: false });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 2 } }));
  const status = await harness.coordinator.schedule('turn-settled', { immediate: true });
  equal(status.status, 'complete-refresh-validated');
  equal(status.authorityUnpersisted, true);
  equal(status.cacheWriteErrorCode, 'cache-write-failed');
  equal(harness.cache.bytes, 'previous-cache-bytes');
  equal(harness.published[0].source, 'host-refresh-unpersisted');
});

await fixture('boot and refresh expose the same unpersisted-authority policy', () => {
  ok(coreSource.includes("completeTurnIndexAuthorityState.indexSource = write.ok ? 'host-payload' : 'host-payload-unpersisted';"));
  ok(coreSource.includes("adapters?.publish?.(incoming, 'host-refresh-unpersisted');"));
  ok(coreSource.includes('authorityUnpersisted: completeTurnIndexAuthorityState.authorityUnpersisted === true'));
});

await fixture('route guard rejects wrong chat and invalid generation', () => {
  equal(evaluateAuthorityGuard('fixture-chat', 'fixture-chat', 1), true);
  equal(evaluateAuthorityGuard('other-chat', 'fixture-chat', 1), false);
  equal(evaluateAuthorityGuard('fixture-chat', 'fixture-chat', 0), false);
});

await fixture('diagnostic errors are bounded codes rather than arbitrary messages', async () => {
  const harness = createRefreshHarness();
  harness.providerQueue.push(() => Promise.reject(new Error('private arbitrary payload text')));
  const status = await harness.coordinator.schedule('cause with private text', { immediate: true });
  equal(status.errorCode, 'provider-failed');
  equal(status.causeSample.includes('cause with private text'), false);
});

await fixture('q29 accepted identity remains exact', () => {
  const runtime = createEnvelopeRuntime(coreSource);
  const result = runtime.normalize(acceptedIdentityEnvelope(runtime), 'fixture-chat', { source: 'host' });
  const row = result.envelope.turns[28];
  equal(row.qId, '29a40c98-0bd8-48cd-be80-0273311a4977');
  equal(row.answerVariants, ['54520999-dedf-4f01-8c60-ac8adcc2c066']);
  equal(row.primaryAId, '54520999-dedf-4f01-8c60-ac8adcc2c066');
});

await fixture('d824 accepted identity and ownership remain exact', () => {
  const runtime = createEnvelopeRuntime(coreSource);
  const result = runtime.normalize(acceptedIdentityEnvelope(runtime), 'fixture-chat', { source: 'host' });
  const row = result.envelope.turns[33];
  equal(row.answerVariants, ['84c7e73c-5fb7-44f6-a930-72e92d369c5a', '733fa31a-7d11-4ce5-b570-8ffa474670d4']);
  equal(row.primaryAId, '733fa31a-7d11-4ce5-b570-8ffa474670d4');
});

await fixture('order 39 completed identity remains exact', () => {
  const runtime = createEnvelopeRuntime(coreSource);
  const result = runtime.normalize(acceptedIdentityEnvelope(runtime), 'fixture-chat', { source: 'host' });
  const row = result.envelope.turns[38];
  equal(row.order, 39);
  equal(row.qId, 'gate5-order-39-question');
  equal(row.primaryAId, 'gate5-order-39-answer');
});

await fixture('internal context qIds remain rejected from complete projection', () => {
  const runtime = createEnvelopeRuntime(coreSource);
  const raw = acceptedIdentityEnvelope(runtime);
  raw.turns[0].qId = 'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b';
  raw.turns[0].turnId = `turn:${raw.turns[0].qId}`;
  raw.sourceFingerprint = runtime.fingerprint(raw.turns);
  const result = runtime.normalize(raw, 'fixture-chat', { source: 'host' });
  equal(result.ok, false);
  equal(result.errorCode, 'complete-index-question-identity-invalid');
});

await fixture('Gate 5 activation has no automatic preference write path', () => {
  ok(coreSource.includes('chatAtlasApplyCompleteIndexProjectionPreferenceAtBoot();'));
  equal(coreSource.includes("setItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY, '1')"), false);
  equal(coreSource.includes('COMPLETE_TURN_INDEX_COMPILED_DEFAULT = true'), false);
});

await fixture('refresh coordinator leaves no timer after completed trailing work', async () => {
  const harness = createRefreshHarness();
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 2 } }));
  await harness.coordinator.schedule('turn-settled', { immediate: true });
  equal(harness.coordinator.getStatus().timerPending, false);
  equal(harness.coordinator.getStatus().requestActive, false);
  equal(harness.timers.size, 0);
});

await fixture('complete-index provider remains GET-only', () => {
  ok(archiveSource.includes('method: "GET"'));
  equal(archiveSource.includes('method: "POST"'), false);
  equal(archiveSource.includes('method: "PUT"'), false);
});

await fixture('preference and complete cache remain IDs-only and content-free', () => {
  const sensitive = ['authorization', 'rawMapping', 'rawPayload', 'toolOutput', 'messageText'];
  for (const field of sensitive) equal(coreSource.includes(`'${field}'`), false);
  equal(coreSource.includes("const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';"), true);
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
