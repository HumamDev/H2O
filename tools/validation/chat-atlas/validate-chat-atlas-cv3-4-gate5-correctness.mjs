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
const feedbackBaselineSha = '87098eb7cc6ca4edb7eab8617ece92a11df42c53';
const coreSource = fs.readFileSync(path.join(root, corePath), 'utf8');
const paginationSource = fs.readFileSync(path.join(root, paginationPath), 'utf8');
const archiveSource = fs.readFileSync(path.join(root, archivePath), 'utf8');
const miniMapSource = fs.readFileSync(path.join(root, miniMapPath), 'utf8');
const baselineCoreSource = execFileSync('git', ['show', `${baselineSha}:${corePath}`], {
  cwd: root,
  encoding: 'utf8',
});
const feedbackBaselineCoreSource = execFileSync('git', ['show', `${feedbackBaselineSha}:${corePath}`], {
  cwd: root,
  encoding: 'utf8',
});
const LIVE_BRANCH_Q = '5068a46e-9a79-4533-a11f-2f96e4c49f4f';
const LIVE_BRANCH_CURRENT_A = 'c1a937a4-8789-44e2-ae45-44a8f6ea4420';
const LIVE_BRANCH_PREVIOUS_A = '0de24351-7b1b-471f-a055-539950beac5a';

let assertionCount = 0;
let liveParityEvidence = null;
let nativeBranchEvidence = null;
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
    if (order === 18) {
      qId = LIVE_BRANCH_Q;
      answerVariants = [LIVE_BRANCH_PREVIOUS_A, LIVE_BRANCH_CURRENT_A];
      primaryAId = LIVE_BRANCH_CURRENT_A;
    } else if (order === 20) {
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

function withLiveBranchPrimary(runtime, envelope, primaryAId, payloadUpdateTime) {
  const turns = envelope.turns.map((turn) => turn.qId === LIVE_BRANCH_Q
    ? {
      ...turn,
      answerVariants: primaryAId === LIVE_BRANCH_PREVIOUS_A
        ? [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]
        : [LIVE_BRANCH_PREVIOUS_A, LIVE_BRANCH_CURRENT_A],
      primaryAId,
    }
    : { ...turn, answerVariants: turn.answerVariants.slice() });
  return {
    ...envelope,
    payloadUpdateTime,
    sourceFingerprint: runtime.fingerprint(turns),
    turns,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createRefreshHarness({
  source = coreSource,
  writeOk = true,
  skipUnchangedWrites = false,
  initialIndex = { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 1 },
} = {}) {
  const codeFunction = extractFunction(source, 'chatAtlasCompleteIndexCode');
  const coordinatorFunction = extractFunction(source, 'createCompleteIndexRefreshCoordinator');
  const factory = vm.runInNewContext(`(function (adapters) {
    const COMPLETE_TURN_INDEX_REFRESH_LIMITS = Object.freeze({
      debounceMs: 280,
      timeoutMs: 4500,
      selectedPathConfirmationDelayMs: 1250,
      trustedSelectionWindowMs: 5000,
      diagnosticCauseLimit: 8,
      errorCodeLength: 96,
    });
    ${codeFunction}
    ${coordinatorFunction}
    return createCompleteIndexRefreshCoordinator(adapters);
  })`, { Object, Array, Set, Map, String, Number, Date, Math, Promise, AbortController });
  const timers = new Map();
  const providerQueue = [];
  const published = [];
  const writes = [];
  const cache = { bytes: 'previous-cache-bytes', skipped: 0, identity: JSON.stringify(initialIndex) };
  let timerId = 0;
  let route = 'fixture-chat|/c/fixture-chat';
  let enabled = true;
  let currentIndex = initialIndex;
  let coordinator = null;
  let signalRuntime = null;
  let publishFeedback = null;
  let trustedSelectionToken = '';
  const resolvedSelections = [];
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
    selectedPathConfirmed: (incoming, evidence) => {
      const turn = Array.isArray(incoming?.turns)
        ? incoming.turns.find((row) => row?.qId === evidence?.qId)
        : null;
      return !!turn && (!evidence?.observedAnswerId || turn.primaryAId === evidence.observedAnswerId);
    },
    selectedPathEvidenceCurrent: (evidence) => !!evidence?.selectionToken
      && evidence.selectionToken === trustedSelectionToken,
    onSelectedPathResolved: (evidence, result) => {
      resolvedSelections.push({ evidence, result });
      if (evidence?.selectionToken === trustedSelectionToken) trustedSelectionToken = '';
      signalRuntime?.resolve?.(evidence);
    },
    writeCache: (incoming) => {
      if (!writeOk) return { ok: false, status: 'cache-write-failed' };
      const identity = JSON.stringify(incoming);
      if (skipUnchangedWrites && identity === cache.identity) {
        cache.skipped += 1;
        return { ok: true, status: 'cache-write-skipped-unchanged', bytes: cache.bytes, skipped: true };
      }
      writes.push(incoming);
      cache.bytes = `cached:${incoming.payloadUpdateTime}`;
      cache.identity = identity;
      return { ok: true, status: 'cache-written' };
    },
    publish: (incoming, publishSource) => {
      currentIndex = incoming;
      published.push({ incoming, source: publishSource });
      publishFeedback?.({ coordinator, incoming, source: publishSource });
    },
    onState() {},
    setTimeout(fn, ms) { timerId += 1; timers.set(timerId, { fn, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    AbortController,
  };
  coordinator = factory(adapters);
  if (source.includes('  function chatAtlasCompleteIndexSelectedPathEvidence(')) {
    const causeStart = source.indexOf('  const COMPLETE_TURN_INDEX_EVENT_CAUSES = Object.freeze({');
    const causeEnd = source.indexOf('\n  });', causeStart);
    const causeDeclaration = source.slice(causeStart, causeEnd + '\n  });'.length);
    const signalNames = [
      'chatAtlasCompleteIndexCode',
      'chatAtlasCompleteIndexIdentity',
      'chatAtlasCompleteIndexStableHash',
      'chatAtlasCompleteIndexNativeBranchDirection',
      'chatAtlasRecordTrustedNativeBranchSelection',
      'chatAtlasCurrentTrustedNativeBranchSelection',
      'chatAtlasResolveTrustedNativeBranchSelection',
      'chatAtlasCompleteIndexSelectedPathEvidence',
      'chatAtlasCompleteIndexTurnEventCause',
      'chatAtlasHandleCompleteIndexTurnEvent',
      'chatAtlasInspectCompleteIndexLiveChanges',
    ];
    const signalFactory = vm.runInNewContext(`(function (coordinator) {
      const COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS = [
        '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
        '3bdfa68f-a197-422a-a3d4-29f028fc6564',
        'e1d4b63f-0be7-4a51-b074-e3372b71d790',
        'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
      ];
      const COMPLETE_TURN_INDEX_REFRESH_LIMITS = { trustedSelectionWindowMs: 5000 };
      ${causeDeclaration}
      const completeTurnIndexAuthorityState = {
        enabled: true,
        generation: 1,
        chatId: 'fixture-chat',
        routeKey: '/c/fixture-chat',
        index: null,
        pendingDrafts: new Map(),
        trustedSelectionSequence: 0,
        trustedSelectionCaptureCount: 0,
        trustedSelectedPathIntent: null,
      };
      const chatAtlasFullIndexRoute = () => ({ chatId: 'fixture-chat', routeKey: '/c/fixture-chat' });
      const completeIndexRefreshCoordinator = coordinator;
      const getCompleteTurnIndexProjectionStatus = () => coordinator.getStatus();
      const chatAtlasScheduleCompleteIndexRefresh = (cause, opts) => coordinator.schedule(cause, opts);
      const isStreamingAnswerPlaceholderId = (value) => String(value || '').startsWith('request-placeholder-');
      const canonicalDraftHasStructuralQuestionProof = (draft) => draft?.structureKnown !== false;
      ${signalNames.map((name) => extractFunction(source, name)).join('\n')}
      return {
        handle(detail, index) {
          completeTurnIndexAuthorityState.index = index;
          return chatAtlasHandleCompleteIndexTurnEvent(detail);
        },
        inspect(drafts, index) {
          completeTurnIndexAuthorityState.index = index;
          return chatAtlasInspectCompleteIndexLiveChanges(drafts, index);
        },
        record(event, index) {
          completeTurnIndexAuthorityState.index = index;
          return chatAtlasRecordTrustedNativeBranchSelection(event);
        },
        intent() { return completeTurnIndexAuthorityState.trustedSelectedPathIntent; },
        resolve(evidence) { return chatAtlasResolveTrustedNativeBranchSelection(evidence); },
      };
    })`, { Object, Array, Set, Map, String, Number, Date, Math, JSON, Promise });
    signalRuntime = signalFactory(coordinator);
  }
  return {
    coordinator,
    timers,
    providerQueue,
    published,
    writes,
    cache,
    resolvedSelections,
    currentIndex: () => currentIndex,
    emitTurnEvent(detail) { return signalRuntime?.handle?.(detail, currentIndex); },
    inspectLive(drafts) { return signalRuntime?.inspect?.(drafts, currentIndex); },
    recordTrustedNativeClick(direction = 'previous') {
      const label = direction === 'next' ? 'Next response' : 'Previous response';
      const button = { getAttribute: (name) => name === 'aria-label' ? label : null };
      const recorded = signalRuntime?.record?.({ isTrusted: true, target: { closest: () => button } }, currentIndex) === true;
      trustedSelectionToken = signalRuntime?.intent?.()?.token || '';
      return recorded;
    },
    recordSyntheticNativeClick() {
      const button = { getAttribute: (name) => name === 'aria-label' ? 'Previous response' : null };
      return signalRuntime?.record?.({ isTrusted: false, target: { closest: () => button } }, currentIndex) === true;
    },
    setTrustedSelectionToken(value) { trustedSelectionToken = String(value || ''); },
    setPublishFeedback(fn) { publishFeedback = typeof fn === 'function' ? fn : null; },
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

function createCacheWriteRuntime(initialEnvelope) {
  const names = [
    'chatAtlasCompleteIndexIdentity',
    'chatAtlasCompleteIndexStableHash',
    'chatAtlasCompleteIndexFingerprint',
    'chatAtlasCompleteIndexCacheKey',
    'chatAtlasCompleteIndexExactKeys',
    'chatAtlasNormalizeCompleteIndexEnvelope',
    'chatAtlasCompleteIndexCacheIdentityBytes',
    'chatAtlasWriteCompleteIndexCache',
  ];
  const setCalls = [];
  const initialRaw = JSON.stringify(initialEnvelope);
  const W = {
    localStorage: {
      setItem(key, value) { setCalls.push({ key, value }); },
    },
  };
  const factory = vm.runInNewContext(`(function (W, initialRaw) {
    const COMPLETE_TURN_INDEX_CACHE_SCHEMA = 1;
    const COMPLETE_TURN_INDEX_CACHE_KEY_PREFIX = 'h2o:prm:cgx:chat-atlas:complete-turn-index:v1:chat:';
    const COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS = [
      '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
      '3bdfa68f-a197-422a-a3d4-29f028fc6564',
      'e1d4b63f-0be7-4a51-b074-e3372b71d790',
      'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
    ];
    const COMPLETE_TURN_INDEX_CACHE_KEYS = ['schema','chatId','payloadUpdateTime','sourceFingerprint','capturedAt','validatedAt','complete','proof','turns'];
    const COMPLETE_TURN_INDEX_ROW_KEYS = ['order','qId','turnId','answerVariants','primaryAId','noAnswer','stopped'];
    const completeTurnIndexAuthorityState = {
      cacheRaw: initialRaw,
      cacheWriteCount: 0,
      cacheWriteSkippedUnchangedCount: 0,
      cacheWriteFailureCount: 0,
    };
    ${names.map((name) => extractFunction(coreSource, name)).join('\n')}
    return {
      write: chatAtlasWriteCompleteIndexCache,
      state: completeTurnIndexAuthorityState,
      raw: () => completeTurnIndexAuthorityState.cacheRaw,
    };
  })`, { Object, Array, Set, Map, String, Number, Date, JSON });
  const runtime = factory(W, initialRaw);
  return { ...runtime, setCalls, initialRaw };
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
  const codeFunction = extractFunction(source, 'chatAtlasCompleteIndexCode');
  const hashFunction = extractFunction(source, 'chatAtlasCompleteIndexStableHash');
  const evidenceFunction = extractFunction(source, 'chatAtlasCompleteIndexSelectedPathEvidence');
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
      generation: 1,
      chatId: 'fixture-chat',
      index: { sourceFingerprint: 'djb2:fixture', payloadUpdateTime: 1 },
      pendingDrafts: new Map([['pending-q', { qId: 'pending-q', answerIds: ['request-placeholder-1'] }]]),
    };
    const completeIndexRefreshCoordinator = { markPending: (count) => marked.push(count) };
    const chatAtlasCompleteIndexIdentity = (value) => String(value || '').trim();
    const chatAtlasCurrentTrustedNativeBranchSelection = () => null;
    const getCompleteTurnIndexProjectionStatus = () => ({ enabled: completeTurnIndexAuthorityState.enabled });
    const chatAtlasScheduleCompleteIndexRefresh = (cause) => { scheduled.push(cause); return Promise.resolve({ cause }); };
    ${codeFunction}
    ${hashFunction}
    ${evidenceFunction}
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

await fixture('selected-path publication feedback reproduces the pre-fix refresh storm', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 39,
    sourceFingerprint: 'djb2:feedback-a',
    turns: [{ qId: 'feedback-q', primaryAId: 'old-primary-a' }],
  };
  const evidence = {
    signature: 'djb2:feedback-selected-path-a',
    qId: 'feedback-q',
    observedAnswerId: 'unconfirmed-primary-b',
  };
  const harness = createRefreshHarness({ source: feedbackBaselineCoreSource, initialIndex });
  harness.setPublishFeedback(({ coordinator }) => {
    void coordinator.schedule('question-selected-path-changed', { selectedPathEvidence: evidence });
  });
  for (let index = 0; index < 4; index += 1) {
    harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  }
  await harness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: evidence,
  });
  for (let index = 0; index < 3; index += 1) {
    equal(harness.runTimer(280), true);
    await new Promise((resolve) => setImmediate(resolve));
  }
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 4);
  equal(status.trailingRefreshCount, 4);
  equal(status.timerPending, true);
  harness.coordinator.cancel('fixture-bounded-stop', 'idle');
});

await fixture('selected-path unchanged live-parity feedback becomes fully quiescent', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const signal = { reason: 'selected-path-changed' };
  const liveDraft = {
    qId: 'live-unconfirmed-question',
    primaryAId: 'live-unconfirmed-answer',
    answerIds: ['live-unconfirmed-answer'],
    structureKnown: true,
  };
  const first = deferred();
  const harness = createRefreshHarness({
    initialIndex,
    skipUnchangedWrites: true,
  });
  harness.providerQueue.push(() => first.promise);
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  harness.setPublishFeedback(() => {
    for (let index = 0; index < 6; index += 1) {
      harness.inspectLive([liveDraft]);
    }
  });
  await harness.emitTurnEvent(signal);
  const active = harness.coordinator.refresh();
  await Promise.resolve();
  await Promise.resolve();
  for (let index = 0; index < 12; index += 1) {
    void harness.emitTurnEvent(signal);
  }
  first.resolve({ ok: true, index: initialIndex });
  await active;
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  for (let index = 0; index < 5; index += 1) {
    await harness.emitTurnEvent(signal);
    harness.inspectLive([liveDraft]);
  }
  const status = harness.coordinator.getStatus();
  ok(status.fetchCount <= 2);
  ok(status.trailingRefreshCount <= 1);
  equal(status.fetchCount, 2);
  equal(status.trailingRefreshCount, 1);
  equal(status.timerPending, false);
  equal(status.requestActive, false);
  equal(status.trailingRequired, false);
  equal(status.pendingCount, 0);
  equal(status.selectedPathUnconfirmedCount, 2);
  equal(status.selectedPathResultCode, 'selected-path-unconfirmed-unchanged');
  ok(status.selectedPathLastSignature.startsWith('djb2:'));
  equal(status.selectedPathLastSignature.includes(liveDraft.qId), false);
  equal(status.selectedPathLastSignature.includes(liveDraft.primaryAId), false);
  ok(status.selectedPathDeduplicatedCount >= 23);
  equal(harness.writes.length, 0);
  equal(harness.cache.skipped, 2);
  equal(harness.cache.bytes, 'previous-cache-bytes');
  equal(harness.currentIndex().complete, true);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.currentIndex().turns.some((row) => row.answerVariants.some(
    (answerId) => answerId.startsWith('request-placeholder-'),
  )), false);
  liveParityEvidence = Object.freeze({
    providerRefreshGets: status.fetchCount,
    trailingRefreshes: status.trailingRefreshCount,
    cacheWrites: harness.writes.length,
    cacheWritesSkippedUnchanged: harness.cache.skipped,
    selectedPathSignals: status.selectedPathSignalCount,
    selectedPathDeduplicated: status.selectedPathDeduplicatedCount,
    selectedPathUnconfirmed: status.selectedPathUnconfirmedCount,
  });
});

await fixture('trusted native previous response receives one delayed host confirmation', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const confirmedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordSyntheticNativeClick(), false);
  equal(harness.recordTrustedNativeClick('previous'), true);
  const liveDraft = {
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  };
  harness.inspectLive([liveDraft]);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathResultCode, 'selected-path-confirmation-pending');
  for (let index = 0; index < 12; index += 1) harness.inspectLive([liveDraft]);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(status.fetchCount, 2);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationPending, false);
  equal(status.timerPending, false);
  equal(status.requestActive, false);
  equal(status.trailingRequired, false);
  equal(status.selectedPathResultCode, null);
  ok(status.selectedPathDeduplicatedCount >= 12);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.currentIndex().turns.some((row) => row.answerVariants.some(
    (answerId) => answerId.startsWith('request-placeholder-'),
  )), false);
  equal(harness.cache.skipped, 1);
  equal(harness.writes.length, 1);
  equal(harness.writes[0].sourceFingerprint, confirmedIndex.sourceFingerprint);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
  nativeBranchEvidence = Object.freeze({
    providerRefreshGets: status.fetchCount,
    confirmationRefreshes: status.selectedPathConfirmationFetchCount,
    trailingRefreshes: status.trailingRefreshCount,
    cacheWrites: harness.writes.length,
    cacheWritesSkippedUnchanged: harness.cache.skipped,
    finalPrimaryAId: turn.primaryAId,
  });
});

await fixture('trusted native mid-conversation switch confirms across downstream turn changes', async () => {
  // Reproduces the live GATE_5_BRANCH_CONFIRMATION_NOT_REFLECTED failure:
  // LIVE_BRANCH_Q is order 18 (mid-conversation), so switching its branch also
  // re-renders downstream turns. Before the fix, inspecting those downstream
  // (untrusted) turns nulled the single shared trusted intent and scheduled
  // untrusted evidence, so no confirmation ever ran. The switched turn's
  // trusted evidence must survive the downstream turn changes.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const confirmedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordTrustedNativeClick('previous'), true);
  // The switched turn is processed first (document order), followed by two
  // downstream turns whose selected answer also changed as a consequence.
  const switchedDraft = {
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  };
  const downstreamDrafts = [
    { qId: 'gate5-product-q-19', primaryAId: 'gate5-downstream-a-19', answerIds: ['gate5-downstream-a-19'], structureKnown: true },
    { qId: 'gate5-product-q-21', primaryAId: 'gate5-downstream-a-21', answerIds: ['gate5-downstream-a-21'], structureKnown: true },
  ];
  const cascade = [switchedDraft, ...downstreamDrafts];
  harness.inspectLive(cascade);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  // The switched turn's evidence stayed trusted despite the downstream churn;
  // the confirmation evidence now in flight is the trusted one.
  equal(status.selectedPathActiveTrusted, true);
  equal(status.selectedPathConfirmationPending, true);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathResultCode, 'selected-path-confirmation-pending');
  // Repeated cascades (progressive re-render) must not schedule more work.
  for (let index = 0; index < 12; index += 1) harness.inspectLive(cascade);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(status.fetchCount, 2);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, false);
  equal(status.selectedPathResultCode, null);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.writes.length, 1);
  equal(harness.writes[0].sourceFingerprint, confirmedIndex.sourceFingerprint);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
});

await fixture('pending native confirmation is cleared by route chat gate and runtime reset', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 1,
    sourceFingerprint: 'djb2:native-cancel-a',
    turns: [{ qId: 'native-cancel-q', primaryAId: 'old-a' }],
  };
  const evidence = {
    signature: 'djb2:native-cancel-signature',
    qId: 'native-cancel-q',
    observedAnswerId: 'new-a',
    trusted: true,
    selectionToken: 'djb2:native-cancel-token',
  };
  const routeHarness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  routeHarness.setTrustedSelectionToken(evidence.selectionToken);
  routeHarness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  await routeHarness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: evidence,
  });
  equal(routeHarness.coordinator.getStatus().selectedPathConfirmationPending, true);
  routeHarness.setRoute('other-chat|/c/other-chat');
  routeHarness.coordinator.cancel('route-changed', 'stale-route-discarded');
  equal(routeHarness.coordinator.getStatus().selectedPathConfirmationPending, false);
  equal(routeHarness.runTimer(1250), false);

  const gateHarness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  gateHarness.setTrustedSelectionToken(evidence.selectionToken);
  gateHarness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  await gateHarness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: evidence,
  });
  equal(gateHarness.coordinator.getStatus().selectedPathConfirmationPending, true);
  gateHarness.setEnabled(false);
  gateHarness.coordinator.cancel('gate-disabled', 'idle');
  equal(gateHarness.coordinator.getStatus().selectedPathConfirmationPending, false);
  equal(gateHarness.timers.size, 0);

  const recreated = createRefreshHarness({ initialIndex });
  equal(recreated.coordinator.getStatus().selectedPathConfirmationPending, false);
  equal(recreated.coordinator.getStatus().selectedPathLastSignature, null);
});

await fixture('newer native selection supersedes an older delayed confirmation', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 1,
    sourceFingerprint: 'djb2:native-supersede-a',
    turns: [{ qId: 'native-supersede-q', primaryAId: 'old-a' }],
  };
  const oldEvidence = {
    signature: 'djb2:native-supersede-old-signature',
    qId: 'native-supersede-q',
    observedAnswerId: 'candidate-a',
    trusted: true,
    selectionToken: 'djb2:native-supersede-old-token',
  };
  const newEvidence = {
    ...oldEvidence,
    signature: 'djb2:native-supersede-new-signature',
    observedAnswerId: 'candidate-b',
    selectionToken: 'djb2:native-supersede-new-token',
  };
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.setTrustedSelectionToken(oldEvidence.selectionToken);
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  await harness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: oldEvidence,
  });
  equal(harness.coordinator.getStatus().selectedPathConfirmationPending, true);
  harness.setTrustedSelectionToken(newEvidence.selectionToken);
  await harness.coordinator.schedule('question-selected-path-changed', { selectedPathEvidence: newEvidence });
  const status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationPending, false);
  equal(status.selectedPathActiveSignature, newEvidence.signature);
  equal(status.selectedPathConfirmationCancelledCount, 1);
  equal(harness.runTimer(1250), false);
  equal(harness.runTimer(280), true);
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('new selected-path evidence and newer host identity remain eligible', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 39,
    sourceFingerprint: 'djb2:new-evidence-a',
    turns: [{ qId: 'feedback-q', primaryAId: 'old-primary-a' }],
  };
  const unchangedEvidence = {
    signature: 'djb2:new-evidence-signature-a',
    qId: 'feedback-q',
    observedAnswerId: 'new-primary-b',
  };
  const newerEvidence = { ...unchangedEvidence, signature: 'djb2:new-evidence-signature-b' };
  const newerIndex = {
    ...initialIndex,
    payloadUpdateTime: 40,
    sourceFingerprint: 'djb2:new-evidence-b',
    turns: [{ qId: 'feedback-q', primaryAId: 'new-primary-b' }],
  };
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  await harness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: unchangedEvidence,
  });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: newerIndex }));
  await harness.coordinator.schedule('question-selected-path-changed', { selectedPathEvidence: newerEvidence });
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathResultCode, null);
  equal(harness.currentIndex().sourceFingerprint, 'djb2:new-evidence-b');
  equal(harness.writes.length, 1);
  equal(harness.cache.bytes, 'cached:40');
});

await fixture('route change and disable clear selected-path reconciliation state', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 1,
    sourceFingerprint: 'djb2:clear-a',
    turns: [{ qId: 'clear-q', primaryAId: 'old-a' }],
  };
  const evidence = { signature: 'djb2:clear-signature', qId: 'clear-q', observedAnswerId: 'new-a' };
  const harness = createRefreshHarness({ initialIndex });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  await harness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: evidence,
  });
  equal(harness.coordinator.getStatus().selectedPathResultCode, 'selected-path-unconfirmed-unchanged');
  harness.setRoute('other-chat|/c/other-chat');
  harness.coordinator.cancel('route-changed', 'stale-route-discarded');
  equal(harness.coordinator.getStatus().selectedPathLastSignature, null);
  equal(harness.coordinator.getStatus().selectedPathActiveSignature, null);
  await harness.coordinator.schedule('question-selected-path-changed', { selectedPathEvidence: evidence });
  equal(harness.coordinator.getStatus().timerPending, true);
  harness.setEnabled(false);
  harness.coordinator.cancel('gate-disabled', 'idle');
  equal(harness.coordinator.getStatus().timerPending, false);
  equal(harness.coordinator.getStatus().selectedPathLastSignature, null);
  equal(harness.coordinator.getStatus().selectedPathActiveSignature, null);
});

await fixture('identity-equivalent complete cache write is skipped without changing bytes', () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const cached = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const runtime = createCacheWriteRuntime(cached);
  const timestampOnly = {
    ...cached,
    capturedAt: '2026-07-19T00:00:00.000Z',
    validatedAt: '2026-07-19T00:00:00.000Z',
  };
  const unchanged = runtime.write(timestampOnly);
  equal(unchanged.ok, true);
  equal(unchanged.status, 'cache-write-skipped-unchanged');
  equal(unchanged.bytes, runtime.initialRaw);
  equal(runtime.setCalls.length, 0);
  equal(runtime.state.cacheWriteCount, 0);
  equal(runtime.state.cacheWriteSkippedUnchangedCount, 1);

  const newer = { ...timestampOnly, payloadUpdateTime: 501 };
  const written = runtime.write(newer);
  equal(written.ok, true);
  equal(written.status, 'cache-written');
  equal(runtime.setCalls.length, 1);
  equal(runtime.state.cacheWriteCount, 1);
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
if (liveParityEvidence) {
  console.log(`Live parity: provider GET ${liveParityEvidence.providerRefreshGets}, trailing ${liveParityEvidence.trailingRefreshes}, cache writes ${liveParityEvidence.cacheWrites}, unchanged skips ${liveParityEvidence.cacheWritesSkippedUnchanged}, selected-path signals ${liveParityEvidence.selectedPathSignals}, deduplicated ${liveParityEvidence.selectedPathDeduplicated}, unconfirmed ${liveParityEvidence.selectedPathUnconfirmed}`);
}
if (nativeBranchEvidence) {
  console.log(`Native branch confirmation: provider GET ${nativeBranchEvidence.providerRefreshGets}, confirmations ${nativeBranchEvidence.confirmationRefreshes}, trailing ${nativeBranchEvidence.trailingRefreshes}, cache writes ${nativeBranchEvidence.cacheWrites}, unchanged skips ${nativeBranchEvidence.cacheWritesSkippedUnchanged}, primary ${nativeBranchEvidence.finalPrimaryAId}`);
}
for (const row of failed) console.error(`FAIL ${row.name}\n${row.error}`);
if (failed.length) process.exitCode = 1;
