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
// The Chat Atlas Ledger moved out of H2O Core into 0A3b Chat Atlas Ledger,
// with 0A3a Chat Atlas Core brokering it. This validator asserts on that
// implementation, so the H2O Core source it reads is now the aggregate of the
// three files the code actually lives in. No assertion changes: positive checks
// and by-name extraction still find the code, and negative checks get strictly
// stronger because a forbidden pattern must be absent from all three.
const H2O_CORE_AGGREGATE_SOURCES = [
  'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js',
  'src-runtime-base/0A3a.⬛️🧭 Chat Atlas Core 🧭.js',
  'src-runtime-base/0A3b.⬛️📒 Chat Atlas Ledger 📒.js',
];
const coreSource = H2O_CORE_AGGREGATE_SOURCES
  .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'))
  .join('\n');
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
const LIVE_DOWNSTREAM_Q1 = 'de3883e7-dac9-4422-ba46-090082a1e808';
const LIVE_DOWNSTREAM_Q2 = 'ddb05ee3-d707-463c-85c3-52c258e83d73';

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

function lifecycleDiagnosticsDeclaration(source) {
  if (!source.includes('  function chatAtlasTraceTrustedLifecycle(')) {
    return '\n      const chatAtlasTraceTrustedLifecycle = () => {};';
  }
  const limitStart = source.indexOf('  const COMPLETE_TURN_INDEX_LIFECYCLE_TRACE_LIMIT');
  const diagStart = source.indexOf('  const completeTurnIndexLifecycleDiagnostics = {', limitStart);
  const diagEnd = source.indexOf('\n  };', diagStart);
  if (limitStart < 0 || diagStart < limitStart || diagEnd < diagStart) {
    throw new Error('lifecycle-diagnostics-anchor-invalid');
  }
  return `\n${source.slice(limitStart, diagEnd + '\n  };'.length)}\n${extractFunction(source, 'chatAtlasTraceTrustedLifecycle')}`;
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
  // When true, the selectedPathEvidenceCurrent adapter routes through the REAL
  // production predicate (intent lookup with the capture age window) instead of
  // the harness token-match stub — required to reproduce the live slow-refresh
  // age cancellation on pre-lease sources.
  productionEvidenceCurrent = false,
  initialIndex = { complete: true, chatId: 'fixture-chat', payloadUpdateTime: 1 },
} = {}) {
  const codeFunction = extractFunction(source, 'chatAtlasCompleteIndexCode');
  const coordinatorFunction = extractFunction(source, 'createCompleteIndexRefreshCoordinator');
  // Use the REAL production confirm predicate so the harness can never drift
  // from the runtime's baseline/expectChange semantics. Baseline sources that
  // predate this function fall back to the legacy inline observed-answer stub
  // (they never exercise capture-driven expectChange evidence anyway).
  const productionSelectedPathConfirmed = source.includes('  function chatAtlasCompleteIndexSelectedPathConfirmed(')
    ? vm.runInNewContext(`(function () {
      ${extractFunction(source, 'chatAtlasCompleteIndexSelectedPathConfirmed')}
      return chatAtlasCompleteIndexSelectedPathConfirmed;
    })()`, { Object, Array, String, Number })
    : (incoming, evidence) => {
      const turn = Array.isArray(incoming?.turns)
        ? incoming.turns.find((row) => row?.qId === evidence?.qId)
        : null;
      return !!turn && (!evidence?.observedAnswerId || turn.primaryAId === evidence.observedAnswerId);
    };
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
  // Round 1 separation: the memory-only automatic-reconciliation gate. Default
  // true = Gate 5 QUALIFICATION mode (these correctness fixtures exercise the
  // accepted reconciliation), so existing fixtures are unaffected. Fixtures that
  // flip it false prove the async execution-time confirmation guard.
  let reconciliationGate = true;
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
    selectedPathConfirmed: (incoming, evidence) => productionSelectedPathConfirmed(
      { complete: true, ...incoming },
      evidence,
    ) === true,
    selectedPathEvidenceCurrent: (evidence) => (productionEvidenceCurrent
      ? signalRuntime?.evidenceCurrent?.(evidence)
      : (!!evidence?.selectionToken && evidence.selectionToken === trustedSelectionToken)),
    selectedPathLeaseCurrent: (evidence) => signalRuntime?.leaseCurrent?.(evidence),
    routeGeneration: () => signalRuntime?.authorityGeneration?.() ?? 1,
    reconciliationActive: () => reconciliationGate,
    onSelectedPathResolved: (evidence, result) => {
      resolvedSelections.push({ evidence, result });
      if (evidence?.selectionToken === trustedSelectionToken) trustedSelectionToken = '';
      signalRuntime?.resolve?.(evidence, result);
    },
    trace: (event, detail) => signalRuntime?.trace?.(event, detail),
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
      ...(source.includes('  function chatAtlasTrustedNativeBranchOwnership(')
        ? ['chatAtlasCompleteIndexNativeBranchButton', 'chatAtlasTrustedNativeBranchOwnership']
        : []),
      ...(source.includes('  function chatAtlasScheduleTrustedNativeBranchReconcile(')
        ? [
          'chatAtlasCancelTrustedNativeBranchReconcile',
          'chatAtlasScheduleTrustedNativeBranchReconcile',
          'chatAtlasRunTrustedNativeBranchReconcile',
        ]
        : []),
      'chatAtlasCurrentTrustedNativeBranchSelection',
      'chatAtlasResolveTrustedNativeBranchSelection',
      ...(source.includes('  function chatAtlasCompleteIndexSelectedPathEvidenceCurrent(')
        ? ['chatAtlasCompleteIndexSelectedPathEvidenceCurrent']
        : []),
      ...(source.includes('  function chatAtlasCompleteIndexSelectedPathLeaseCurrent(')
        ? ['chatAtlasCompleteIndexSelectedPathLeaseCurrent']
        : []),
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
      const chatAtlasBranchTransactionCurrent = () => null;
      const chatAtlasOpenBranchTransaction = () => null;
      const chatAtlasCloseBranchTransaction = () => false;
      const chatAtlasBranchTransactionTrace = () => {};
      // This qualification harness intentionally carries no retained identity
      // graph. Keep the production post-event seam fail-safe so Gate 5 can
      // continue into its isolated coordinator assertions.
      const chatAtlasTryPublishRetainedBranchTransaction = () => Object.freeze({ handled: false });

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
        // Gate 5 QUALIFICATION harness: automatic native branch reconciliation
        // is DEFERRED by default in Round 1 and gated behind a memory-only
        // qualification switch. These correctness fixtures explicitly exercise
        // the accepted reconciliation implementation, so the harness enables
        // the gate — mirroring setCompleteTurnIndexAutoBranchReconciliationCanary(true).
        autoBranchReconciliationEnabled: true,
      };
      const chatAtlasFullIndexRoute = () => ({ chatId: 'fixture-chat', routeKey: '/c/fixture-chat' });
      const completeIndexRefreshCoordinator = coordinator;
      const getCompleteTurnIndexProjectionStatus = () => coordinator.getStatus();
      const chatAtlasScheduleCompleteIndexRefresh = (cause, opts) => coordinator.schedule(cause, opts);
      const isStreamingAnswerPlaceholderId = (value) => String(value || '').startsWith('request-placeholder-');
      const canonicalDraftHasStructuralQuestionProof = (draft) => draft?.structureKnown !== false;
      // Faithful post-event scheduler stub: production defers the capture-driven
      // reconcile via W.setTimeout(fn, 0). Record the deferred task so the test
      // can fire it deterministically (post native event propagation) and prove
      // cancellation. This is a SEPARATE timer queue from the coordinator's.
      const postEventTasks = new Map();
      let postEventTimerId = 0;
      const W = {
        setTimeout(fn, ms) { postEventTimerId += 1; postEventTasks.set(postEventTimerId, { fn, ms }); return postEventTimerId; },
        clearTimeout(id) { postEventTasks.delete(id); },
      };
      ${lifecycleDiagnosticsDeclaration(source)}
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
        resolve(evidence, reason) { return chatAtlasResolveTrustedNativeBranchSelection(evidence, reason); },
        lookup(qId) { return chatAtlasCurrentTrustedNativeBranchSelection(qId); },
        leaseCurrent(evidence) {
          return typeof chatAtlasCompleteIndexSelectedPathLeaseCurrent === 'function'
            ? chatAtlasCompleteIndexSelectedPathLeaseCurrent(evidence)
            : undefined;
        },
        evidenceCurrent(evidence) {
          return typeof chatAtlasCompleteIndexSelectedPathEvidenceCurrent === 'function'
            ? chatAtlasCompleteIndexSelectedPathEvidenceCurrent(evidence)
            : undefined;
        },
        authorityGeneration() { return Number(completeTurnIndexAuthorityState.generation || 0); },
        trace(event, detail) { return chatAtlasTraceTrustedLifecycle(event, detail); },
        diagnostics() {
          return typeof completeTurnIndexLifecycleDiagnostics === 'object'
            ? completeTurnIndexLifecycleDiagnostics
            : null;
        },
        setAuthorityGeneration(value) { completeTurnIndexAuthorityState.generation = Number(value); },
        setAuthorityRouteKey(value) { completeTurnIndexAuthorityState.routeKey = String(value); },
        setAuthorityEnabled(value) { completeTurnIndexAuthorityState.enabled = value === true; },
        setReconciliationGate(value) {
          const enabled = value === true;
          const disabling = completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true && !enabled;
          completeTurnIndexAuthorityState.autoBranchReconciliationEnabled = enabled;
          if (disabling) {
            if (typeof chatAtlasCancelTrustedNativeBranchReconcile === 'function') chatAtlasCancelTrustedNativeBranchReconcile();
            completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
          }
        },
        setAuthorityIndex(index) { completeTurnIndexAuthorityState.index = index; },
        resetRoute() {
          // Simulates chatAtlasResetCompleteIndexRoute's trusted-scope cleanup:
          // cancel the post-event task, bump generation, null the intent.
          if (typeof chatAtlasCancelTrustedNativeBranchReconcile === 'function') chatAtlasCancelTrustedNativeBranchReconcile();
          completeTurnIndexAuthorityState.generation += 1;
          completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
        },
        pendingPostEventTaskCount() { return postEventTasks.size; },
        runPostEventTasks(index) {
          if (index !== undefined) completeTurnIndexAuthorityState.index = index;
          const entries = Array.from(postEventTasks.values());
          postEventTasks.clear();
          for (const entry of entries) entry.fn();
          return entries.length;
        },
        ageIntent(observedAt) {
          const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
          if (!intent) return false;
          completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({ ...intent, observedAt: Number(observedAt) });
          return true;
        },
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
    diagnostics() { return signalRuntime?.diagnostics?.() || null; },
    lifecycleTrace() { return (signalRuntime?.diagnostics?.()?.trace || []).slice(); },
    emitTrace(event, detail) { return signalRuntime?.trace?.(event, detail); },
    signalIntent() { return signalRuntime?.intent?.() || null; },
    signalLookup(qId) { return signalRuntime?.lookup?.(qId); },
    setAuthorityGeneration(value) { return signalRuntime?.setAuthorityGeneration?.(value); },
    setAuthorityRouteKey(value) { return signalRuntime?.setAuthorityRouteKey?.(value); },
    setAuthorityEnabled(value) { return signalRuntime?.setAuthorityEnabled?.(value); },
    // Flip the memory-only reconciliation gate on BOTH the signal runtime
    // (Correction 1 evidence trust + Correction 3.1 run guard) and the
    // coordinator adapter (Correction 3.2/3.3 confirmation guards).
    setReconciliationGate(value) {
      const enabled = value === true;
      const disabling = reconciliationGate && !enabled;
      reconciliationGate = enabled;
      signalRuntime?.setReconciliationGate?.(enabled);
      if (disabling) {
        coordinator.cancelSelectedPathReconciliation('reconciliation-disabled-by-setter');
      }
      return coordinator.getStatus();
    },
    setAuthorityIndex(index) { return signalRuntime?.setAuthorityIndex?.(index); },
    signalResetRoute() { return signalRuntime?.resetRoute?.(); },
    pendingPostEventTaskCount() { return signalRuntime?.pendingPostEventTaskCount?.() || 0; },
    runPostEventTasks() { return signalRuntime?.runPostEventTasks?.(currentIndex) || 0; },
    ageIntent(observedAt) { return signalRuntime?.ageIntent?.(observedAt); },
    recordTrustedNativeClick(direction = 'previous', opts = {}) {
      const label = direction === 'next' ? 'Next response' : 'Previous response';
      // The branch control button lives inside the owning conversation turn's
      // container; [data-message-id] descendants identify candidate owners and
      // the click target is a nested SVG child. Three faithful scope shapes:
      //   'conversation-turn' (real ChatGPT: <div data-testid="conversation-turn-N">, NO article),
      //   'article' (legacy fallback container),
      //   'message-node' (no container queryable; nearest [data-message-id] ancestor IS the candidate).
      const messages = Array.isArray(opts.messages) ? opts.messages : [
        { id: LIVE_BRANCH_Q, role: 'user' },
        { id: LIVE_BRANCH_CURRENT_A, role: 'assistant' },
      ];
      const messageNodes = messages.map((message) => ({
        getAttribute: (name) => {
          if (name === 'data-message-id') return message.id;
          if (name === 'data-message-author-role') return message.role;
          return null;
        },
      }));
      const scopeMode = ['conversation-turn', 'article', 'message-node'].includes(opts.scope)
        ? opts.scope
        : 'article';
      const testId = opts.testId || 'conversation-turn-69';
      const container = {
        getAttribute: (name) => (name === 'data-testid' && scopeMode === 'conversation-turn') ? testId : null,
        querySelectorAll: (selector) => selector === '[data-message-id]' ? messageNodes : [],
      };
      // scope 'message-node': the nearest [data-message-id] ancestor itself
      // carries the identity (no queryable children), exercising the
      // self-candidate fallback.
      const selfNode = {
        getAttribute: (name) => {
          if (name === 'data-message-id') return messages[0]?.id || null;
          if (name === 'data-message-author-role') return messages[0]?.role || null;
          return null;
        },
      };
      const button = {
        tagName: 'BUTTON',
        getAttribute: (name) => name === 'aria-label' ? label : null,
        closest: (selector) => {
          if (scopeMode === 'conversation-turn') {
            return selector === '[data-testid^="conversation-turn-"]' ? container : null;
          }
          if (scopeMode === 'article') return selector === 'article' ? container : null;
          return selector === '[data-message-id]' ? selfNode : null;
        },
      };
      const svg = {
        tagName: 'svg',
        getAttribute: () => null,
        closest: (selector) => selector === 'button' ? button : null,
      };
      const event = {
        isTrusted: true,
        target: svg,
        composedPath: opts.composedPath === false ? undefined : () => [svg, button, container],
      };
      const recorded = signalRuntime?.record?.(event, currentIndex) === true;
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

function createLiveEnvelopeHarness(opts = {}) {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  return { envelopeRuntime, initialIndex, harness: createRefreshHarness({ initialIndex, ...opts }) };
}

function liveIncidentEnvelope(runtime) {
  // The accepted 39-turn identity envelope with the two REAL downstream qIds
  // from the live GATE_5 incident substituted at orders 19 and 21, so the
  // regression cascade can present the exact wrong-first turns observed live.
  const base = acceptedIdentityEnvelope(runtime);
  const turns = base.turns.map((turn) => {
    if (turn.order === 19) return { ...turn, qId: LIVE_DOWNSTREAM_Q1, turnId: `turn:${LIVE_DOWNSTREAM_Q1}` };
    if (turn.order === 21) return { ...turn, qId: LIVE_DOWNSTREAM_Q2, turnId: `turn:${LIVE_DOWNSTREAM_Q2}` };
    return turn;
  });
  return { ...base, sourceFingerprint: runtime.fingerprint(turns), turns };
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
    ${lifecycleDiagnosticsDeclaration(source)}
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

await fixture('D1 trusted click records capture with hashed token and direction', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('next'), true);
  const diag = harness.diagnostics();
  const intent = harness.signalIntent();
  ok(intent?.token?.startsWith('djb2:'));
  equal(diag.trustedSelectionLastCaptureDirection, 'next');
  ok(diag.trustedSelectionLastCaptureTokenHash.startsWith('djb2:'));
  equal(diag.trustedSelectionLastCaptureTokenHash === intent.token, false);
  const trace = harness.lifecycleTrace();
  equal(trace[0].event, 'trusted-capture-created');
  equal(trace[0].direction, 'next');
  equal(trace[0].tokenHash, diag.trustedSelectionLastCaptureTokenHash);
  const firstSeq = trace[0].seq;
  equal(harness.recordTrustedNativeClick('previous'), true);
  const nextTrace = harness.lifecycleTrace();
  equal(nextTrace[0].event, 'trusted-capture-created');
  equal(nextTrace[0].direction, 'previous');
  ok(nextTrace[0].seq > firstSeq);
});

await fixture('D2 capture-time ownership binding records bind attempt bind success and qId', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  const intent = harness.signalIntent();
  equal(intent?.qId, LIVE_BRANCH_Q);
  const diag = harness.diagnostics();
  equal(diag.trustedSelectionBindAttemptCount, 1);
  equal(diag.trustedSelectionBindSuccessCount, 1);
  equal(diag.trustedSelectionLastBoundQId, LIVE_BRANCH_Q);
  const events = harness.lifecycleTrace().map((entry) => entry.event);
  equal(events.indexOf('trusted-capture-created'), 0);
  ok(events.indexOf('trusted-bind-attempt') > 0);
  ok(events.indexOf('trusted-bind-success') > events.indexOf('trusted-bind-attempt'));
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success')?.qId, LIVE_BRANCH_Q);
  // an exact-qId lookup returns the frozen intent without any lazy re-binding
  equal(harness.signalLookup(LIVE_BRANCH_Q)?.qId, LIVE_BRANCH_Q);
  equal(harness.diagnostics().trustedSelectionBindAttemptCount, 1);
});

await fixture('D3 qId mismatch records skipped bind without clearing the intent', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.signalLookup(LIVE_BRANCH_Q)?.qId, LIVE_BRANCH_Q);
  equal(harness.signalLookup('gate5-product-q-21'), null);
  const intent = harness.signalIntent();
  equal(intent?.qId, LIVE_BRANCH_Q);
  const skipped = harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped');
  equal(skipped?.reason, 'trusted-qid-mismatch');
  equal(skipped?.qId, 'gate5-product-q-21');
  equal(skipped?.boundQId, LIVE_BRANCH_Q);
  equal(harness.diagnostics().trustedSelectionClearCount, 0);
});

await fixture('D4 every legitimate clear path records an exact reason', () => {
  const { harness: resolveHarness } = createLiveEnvelopeHarness();
  equal(resolveHarness.recordTrustedNativeClick('previous'), true);
  const token = resolveHarness.signalIntent().token;
  equal(resolveHarness.signalLookup(LIVE_BRANCH_Q)?.qId, LIVE_BRANCH_Q);
  equal(resolveHarness.diagnostics().trustedSelectionClearCount, 0);
  // A coordinator cancel with no pending confirmation evidence must not
  // destroy the intent silently: it survives with zero clears recorded.
  resolveHarness.coordinator.cancel('fixture-end', 'idle');
  equal(resolveHarness.signalIntent()?.token, token);
  equal(resolveHarness.diagnostics().trustedSelectionClearCount, 0);
  const { harness: gateHarness } = createLiveEnvelopeHarness();
  equal(gateHarness.recordTrustedNativeClick('previous'), true);
  gateHarness.setAuthorityEnabled(false);
  equal(gateHarness.signalLookup(LIVE_BRANCH_Q), null);
  equal(gateHarness.signalIntent(), null);
  equal(gateHarness.diagnostics().trustedSelectionLastClearReason, 'authority-disabled');
  equal(gateHarness.diagnostics().trustedSelectionClearCount, 1);
  ok(coreSource.includes("reason: staleStatus ? 'route-reset-route-changed' : 'route-reset-authority-reset'"));
  ok(coreSource.includes('reason: `resolved-${resolution}`'));
});

await fixture('D5 age expiry records trusted-intent-expired and preserves capture fields', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  const captureHash = harness.diagnostics().trustedSelectionLastCaptureTokenHash;
  equal(harness.ageIntent(Date.now() - 6000), true);
  equal(harness.signalLookup(LIVE_BRANCH_Q), null);
  equal(harness.signalIntent(), null);
  const diag = harness.diagnostics();
  equal(diag.trustedSelectionClearCount, 1);
  equal(diag.trustedSelectionLastClearReason, 'age-window-exceeded');
  const expired = harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-intent-expired');
  equal(expired?.reason, 'age-window-exceeded');
  ok(Number(expired?.age) > 5000);
  equal(diag.trustedSelectionLastCaptureTokenHash, captureHash);
});

await fixture('D6 trusted schedule attempt records trusted true qId and cause', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  equal(harness.recordTrustedNativeClick('previous'), true);
  harness.inspectLive([{
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  }]);
  const diag = harness.diagnostics();
  equal(diag.selectedPathTrustedScheduleAttemptCount, 1);
  equal(diag.selectedPathTrustedScheduleAcceptedCount, 1);
  equal(diag.selectedPathLastScheduleTrusted, true);
  equal(diag.selectedPathLastScheduleQId, LIVE_BRANCH_Q);
  equal(diag.selectedPathLastScheduleCause, 'answer-branch-changed');
  const attempt = harness.lifecycleTrace().findLast((entry) => entry.event === 'selected-schedule-attempt');
  equal(attempt?.trusted, true);
  equal(attempt?.qId, LIVE_BRANCH_Q);
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('D7 missing-token confirmation skip records missing-selection-token', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 1,
    sourceFingerprint: 'djb2:d7-fingerprint',
    turns: [{ qId: 'd7-q', primaryAId: 'old-a' }],
  };
  const harness = createRefreshHarness({ initialIndex });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  await harness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: {
      signature: 'djb2:d7-signature',
      qId: 'd7-q',
      observedAnswerId: 'new-a',
      trusted: true,
    },
  });
  const diag = harness.diagnostics();
  equal(diag.selectedPathConfirmationEligibilityCheckCount, 1);
  equal(diag.selectedPathConfirmationSkipCount, 1);
  equal(diag.selectedPathConfirmationLastSkipReason, 'missing-selection-token');
  equal(harness.coordinator.getStatus().selectedPathConfirmationScheduledCount, 0);
  equal(harness.coordinator.getStatus().selectedPathResultCode, 'selected-path-unconfirmed-unchanged');
});

await fixture('D8 superseded-token confirmation skip records evidence-not-current', async () => {
  // Under the confirmation-lease contract, a GONE intent no longer blocks an
  // accepted trusted request (the lease holds); only a genuinely NEWER live
  // token (supersession) fails closed at eligibility.
  const { harness, initialIndex } = createLiveEnvelopeHarness();
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  // A live trusted intent exists (token A, bound to the live branch turn)...
  equal(harness.recordTrustedNativeClick('previous'), true);
  // ...while stale evidence carrying a DIFFERENT token reaches the coordinator.
  await harness.coordinator.schedule('question-selected-path-changed', {
    immediate: true,
    selectedPathEvidence: {
      signature: 'djb2:d8-signature',
      qId: 'd8-q',
      observedAnswerId: 'new-a',
      trusted: true,
      selectionToken: 'djb2:d8-token',
    },
  });
  const diag = harness.diagnostics();
  equal(diag.selectedPathConfirmationSkipCount, 1);
  equal(diag.selectedPathConfirmationLastSkipReason, 'evidence-not-current');
  const skipped = harness.lifecycleTrace().findLast((entry) => entry.event === 'confirmation-skipped');
  equal(skipped?.reason, 'evidence-not-current');
  equal(harness.coordinator.getStatus().selectedPathConfirmationScheduledCount, 0);
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('D9 route and generation mismatch record their own clear reasons', () => {
  const { harness: generationHarness } = createLiveEnvelopeHarness();
  equal(generationHarness.recordTrustedNativeClick('previous'), true);
  generationHarness.setAuthorityGeneration(99);
  equal(generationHarness.signalLookup(LIVE_BRANCH_Q), null);
  equal(generationHarness.diagnostics().trustedSelectionLastClearReason, 'generation-mismatch');
  const generationCleared = generationHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-intent-cleared');
  equal(generationCleared?.reason, 'generation-mismatch');

  const { harness: routeHarness } = createLiveEnvelopeHarness();
  equal(routeHarness.recordTrustedNativeClick('previous'), true);
  routeHarness.setAuthorityRouteKey('/c/other-route');
  equal(routeHarness.signalLookup(LIVE_BRANCH_Q), null);
  equal(routeHarness.diagnostics().trustedSelectionLastClearReason, 'route-mismatch');
  const routeCleared = routeHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-intent-cleared');
  equal(routeCleared?.reason, 'route-mismatch');
});

await fixture('D10 deduplication records the deduplicated signature and cause', async () => {
  const initialIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 1,
    sourceFingerprint: 'djb2:d10-fingerprint',
    turns: [{ qId: 'd10-q', primaryAId: 'old-a' }],
  };
  const evidence = {
    signature: 'djb2:d10-signature',
    qId: 'd10-q',
    observedAnswerId: 'new-a',
    trusted: true,
    selectionToken: 'djb2:d10-token',
  };
  const harness = createRefreshHarness({ initialIndex });
  harness.setTrustedSelectionToken(evidence.selectionToken);
  void harness.coordinator.schedule('question-selected-path-changed', { selectedPathEvidence: evidence });
  void harness.coordinator.schedule('question-selected-path-changed', { selectedPathEvidence: evidence });
  equal(harness.coordinator.getStatus().selectedPathDeduplicatedCount, 1);
  const diag = harness.diagnostics();
  equal(diag.selectedPathTrustedScheduleAttemptCount, 2);
  equal(diag.selectedPathTrustedScheduleAcceptedCount, 1);
  const deduplicated = harness.lifecycleTrace().findLast((entry) => entry.event === 'selected-schedule-deduplicated');
  equal(deduplicated?.signature, evidence.signature);
  equal(deduplicated?.cause, 'question-selected-path-changed');
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('D11 lifecycle trace is capped at 32 entries preserving the earliest window', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  for (let index = 0; index < 40; index += 1) {
    harness.emitTrace('selected-evidence-created', { qId: `cap-q-${index}` });
  }
  const diag = harness.diagnostics();
  equal(diag.trace.length, 32);
  // capture emits 3 window entries (created/bind-attempt/bind-success), so 29
  // of the 40 synthetic events fit and 11 overflow.
  equal(diag.traceDroppedCount, 11);
  equal(diag.trace[0].event, 'trusted-capture-created');
  equal(diag.trace[1].event, 'trusted-bind-attempt');
  equal(diag.trace[2].event, 'trusted-bind-success');
  equal(diag.trace[3].qId, 'cap-q-0');
  const sequences = diag.trace.map((entry) => entry.seq);
  ok(sequences.every((value, index) => index === 0 || value > sequences[index - 1]));
  equal(harness.recordTrustedNativeClick('previous'), true);
  // Re-capture over a live prior intent: created + cleared(superseded-by-
  // newer-capture) + bind-attempt + bind-success.
  equal(harness.diagnostics().trace.length, 4);
  equal(harness.diagnostics().trace[0].event, 'trusted-capture-created');
  equal(harness.diagnostics().trace[1].event, 'trusted-intent-cleared');
  equal(harness.diagnostics().trace[1].reason, 'superseded-by-newer-capture');
  equal(harness.diagnostics().traceDroppedCount, 0);
});

await fixture('D12 lifecycle trace contains no raw token and only bounded ID fields', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  equal(harness.recordTrustedNativeClick('previous'), true);
  const rawToken = harness.signalIntent().token;
  harness.inspectLive([{
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  }]);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  const serialized = JSON.stringify(harness.lifecycleTrace());
  equal(serialized.includes(rawToken), false);
  const allowedKeys = new Set([
    'seq', 'event', 'at', 'gen', 'tokenHash', 'chatHash', 'qId', 'boundQId', 'direction',
    'trusted', 'signature', 'reason', 'cause', 'resultCode', 'confirmationAttempt', 'age',
  ]);
  for (const entry of harness.lifecycleTrace()) {
    for (const key of Object.keys(entry)) ok(allowedKeys.has(key), `unexpected trace key ${key}`);
  }
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('D13 golden-path lifecycle trace covers the full confirmation ordering unchanged', async () => {
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
  harness.inspectLive([{
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  }]);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathResultCode, null);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  const events = harness.lifecycleTrace().map((entry) => entry.event);
  const milestones = [
    'trusted-capture-created',
    'trusted-bind-attempt',
    'trusted-bind-success',
    'selected-evidence-created',
    'selected-schedule-attempt',
    'selected-refresh-started',
    'selected-refresh-unchanged',
    'confirmation-eligibility-checked',
    'confirmation-scheduled',
    'confirmation-started',
    'confirmation-confirmed',
    'trusted-intent-cleared',
  ];
  let cursor = -1;
  for (const milestone of milestones) {
    const position = events.indexOf(milestone, cursor + 1);
    ok(position > cursor, `milestone out of order or missing: ${milestone}`);
    cursor = position;
  }
  const cleared = harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-intent-cleared');
  equal(cleared?.reason, 'resolved-confirmed');
  equal(harness.timers.size, 0);
});

await fixture('D14 existing multi-turn confirmation fixture remained green', () => {
  const row = fixtures.find((entry) => entry.name === 'trusted native mid-conversation switch confirms across downstream turn changes');
  equal(row?.ok, true);
  const single = fixtures.find((entry) => entry.name === 'trusted native previous response receives one delayed host confirmation');
  equal(single?.ok, true);
});

await fixture('D15 existing selected-path storm fixtures remained green', () => {
  const storm = fixtures.find((entry) => entry.name === 'selected-path publication feedback reproduces the pre-fix refresh storm');
  equal(storm?.ok, true);
  const parity = fixtures.find((entry) => entry.name === 'selected-path unchanged live-parity feedback becomes fully quiescent');
  equal(parity?.ok, true);
});

await fixture('G5 live incident regression: capture binds canonical owner and confirms across wrong-first downstream turns', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
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

  // Items 1-3: feature starts disabled (a real branch click cannot capture);
  // the memory-canary activation path has no persisted-preference write; the
  // canary-equivalent enable exposes the 39-turn host-proven authority.
  harness.setEnabled(false);
  harness.setAuthorityEnabled(false);
  equal(harness.recordTrustedNativeClick('previous'), false);
  equal(harness.signalIntent(), null);
  ok(coreSource.includes("const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';"));
  equal(coreSource.includes("setItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY, '1')"), false);
  harness.setEnabled(true);
  harness.setAuthorityEnabled(true);
  equal(harness.currentIndex().turns.length, 39);

  // Items 4-8: nested SVG click inside button[aria-label="Previous response"]
  // whose owning article carries the CURRENT assistant answer id (the real
  // live topology); capture immediately resolves the canonical owner qId via
  // unique answer ownership and freezes it into the intent.
  equal(harness.recordTrustedNativeClick('previous', {
    messages: [{ id: LIVE_BRANCH_CURRENT_A, role: 'assistant' }],
  }), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(harness.diagnostics().trustedSelectionLastBoundQId, LIVE_BRANCH_Q);
  const bound = harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success');
  equal(bound?.reason, 'capture-owner-answer-resolved');
  equal(bound?.qId, LIVE_BRANCH_Q);

  // Items 9-11: the two REAL wrong/downstream qIds are presented FIRST;
  // neither binds nor receives the trusted token; only target-qId evidence
  // remains trusted.
  const cascade = [
    { qId: LIVE_DOWNSTREAM_Q1, primaryAId: 'live-downstream-a-19', answerIds: ['live-downstream-a-19'], structureKnown: true },
    { qId: LIVE_DOWNSTREAM_Q2, primaryAId: 'live-downstream-a-21', answerIds: ['live-downstream-a-21'], structureKnown: true },
    { qId: LIVE_BRANCH_Q, primaryAId: LIVE_BRANCH_PREVIOUS_A, answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A], structureKnown: true },
  ];
  harness.inspectLive(cascade);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  const evidenceEntries = harness.lifecycleTrace().filter((entry) => entry.event === 'selected-evidence-created');
  equal(evidenceEntries.filter((entry) => entry.qId === LIVE_DOWNSTREAM_Q1).every((entry) => entry.trusted === false), true);
  equal(evidenceEntries.filter((entry) => entry.qId === LIVE_DOWNSTREAM_Q2).every((entry) => entry.trusted === false), true);
  equal(evidenceEntries.some((entry) => entry.trusted === true), true);
  equal(evidenceEntries.filter((entry) => entry.trusted === true).every((entry) => entry.qId === LIVE_BRANCH_Q), true);
  equal(harness.diagnostics().selectedPathLastScheduleQId, LIVE_BRANCH_Q);
  equal(harness.diagnostics().selectedPathLastScheduleTrusted, true);

  // Items 12-13: immediate refresh returns the unchanged primary and exactly
  // one 1250ms confirmation schedules.
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.selectedPathActiveTrusted, true);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(status.selectedPathResultCode, 'selected-path-confirmation-pending');

  // A progressive re-render of the same cascade stays deduplicated.
  harness.inspectLive(cascade);
  equal(harness.coordinator.getStatus().selectedPathConfirmationScheduledCount, 1);
  ok(harness.coordinator.getStatus().selectedPathDeduplicatedCount >= 1);

  // Items 14-19: exactly one confirmation GET; the host payload selects the
  // previous answer; both variants survive; count stays 39; provider GETs
  // stay bounded at two; no trailing refresh runs.
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathResultCode, null);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);

  // The corrected live trace shape (final-response expectation).
  const events = harness.lifecycleTrace().map((entry) => entry.event);
  const milestones = [
    'trusted-capture-created',
    'trusted-bind-attempt',
    'trusted-bind-success',
    'selected-evidence-created',
    'selected-schedule-attempt',
    'selected-refresh-started',
    'selected-refresh-unchanged',
    'confirmation-eligibility-checked',
    'confirmation-scheduled',
    'confirmation-started',
    'confirmation-confirmed',
  ];
  let cursor = -1;
  for (const milestone of milestones) {
    const position = events.indexOf(milestone, cursor + 1);
    ok(position > cursor, `milestone out of order or missing: ${milestone}`);
    cursor = position;
  }
});

await fixture('G5 ownership resolves via unique user message qId and closest fallback', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous', {
    messages: [{ id: LIVE_BRANCH_Q, role: 'user' }],
  }), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success')?.reason, 'capture-owner-qid-resolved');
  // Without composedPath support the nested target resolves through closest().
  const { harness: closestHarness } = createLiveEnvelopeHarness();
  equal(closestHarness.recordTrustedNativeClick('previous', { composedPath: false }), true);
  equal(closestHarness.signalIntent()?.qId, LIVE_BRANCH_Q);
});

await fixture('G5 ambiguous DOM-to-canonical ownership produces no trusted token', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous', {
    messages: [
      { id: LIVE_BRANCH_Q, role: 'user' },
      { id: '54520999-dedf-4f01-8c60-ac8adcc2c066', role: 'assistant' },
    ],
  }), false);
  equal(harness.signalIntent(), null);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-ambiguous');
  equal(harness.diagnostics().trustedSelectionBindAttemptCount, 1);
  equal(harness.diagnostics().trustedSelectionBindSuccessCount, 0);
});

await fixture('G5 unknown answer id produces no trusted token', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous', {
    messages: [{ id: 'f0000000-0000-4000-8000-00000000dead', role: 'assistant' }],
  }), false);
  equal(harness.signalIntent(), null);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-not-canonical');
});

await fixture('G5 duplicate canonical ownership fails closed', () => {
  const duplicateAnswerIndex = {
    complete: true,
    chatId: 'fixture-chat',
    payloadUpdateTime: 1,
    sourceFingerprint: 'djb2:dup-owner-a',
    turns: [
      { qId: 'dup-owner-q-1', primaryAId: 'dup-owner-a', answerVariants: ['dup-owner-a'], noAnswer: false, stopped: false },
      { qId: 'dup-owner-q-2', primaryAId: 'other-owner-a', answerVariants: ['other-owner-a', 'dup-owner-a'], noAnswer: false, stopped: false },
    ],
  };
  const answerHarness = createRefreshHarness({ initialIndex: duplicateAnswerIndex });
  equal(answerHarness.recordTrustedNativeClick('previous', {
    messages: [{ id: 'dup-owner-a', role: 'assistant' }],
  }), false);
  equal(answerHarness.signalIntent(), null);
  equal(answerHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-ambiguous');
  const duplicateQIndex = {
    ...duplicateAnswerIndex,
    sourceFingerprint: 'djb2:dup-owner-q',
    turns: [
      { qId: 'dup-owner-q-1', primaryAId: 'dup-a-1', answerVariants: ['dup-a-1'], noAnswer: false, stopped: false },
      { qId: 'dup-owner-q-1', primaryAId: 'dup-a-2', answerVariants: ['dup-a-2'], noAnswer: false, stopped: false },
    ],
  };
  const questionHarness = createRefreshHarness({ initialIndex: duplicateQIndex });
  equal(questionHarness.recordTrustedNativeClick('previous', {
    messages: [{ id: 'dup-owner-q-1', role: 'user' }],
  }), false);
  equal(questionHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-ambiguous');
});

await fixture('G5 unresolved capture falls back to bounded untrusted observation', async () => {
  const { harness, initialIndex } = createLiveEnvelopeHarness({ skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  equal(harness.recordTrustedNativeClick('previous', { messages: [] }), false);
  equal(harness.signalIntent(), null);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-unresolved');
  harness.inspectLive([{
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  }]);
  equal(harness.diagnostics().selectedPathLastScheduleTrusted, false);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.selectedPathConfirmationScheduledCount, 0);
  equal(status.selectedPathResultCode, 'selected-path-unconfirmed-unchanged');
  equal(harness.diagnostics().selectedPathConfirmationLastSkipReason, 'evidence-untrusted');
  equal(status.trailingRefreshCount, 0);
  equal(harness.timers.size, 0);
});

await fixture('G5 newer trusted capture supersedes the older intent', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  const first = harness.signalIntent();
  equal(first?.qId, LIVE_BRANCH_Q);
  equal(harness.recordTrustedNativeClick('next', {
    messages: [{ id: '29a40c98-0bd8-48cd-be80-0273311a4977', role: 'user' }],
  }), true);
  const second = harness.signalIntent();
  equal(second?.qId, '29a40c98-0bd8-48cd-be80-0273311a4977');
  equal(second?.token === first?.token, false);
  // The supersede is a recorded clear, not a silent disappearance.
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-intent-cleared')?.reason, 'superseded-by-newer-capture');
  equal(harness.diagnostics().trustedSelectionLastClearQId, LIVE_BRANCH_Q);
  // The superseded token is no longer current for its own qId.
  equal(harness.signalLookup(LIVE_BRANCH_Q), null);
  // A newer unresolved capture also supersedes: no stale intent survives it,
  // and that clear is recorded too.
  equal(harness.recordTrustedNativeClick('previous', { messages: [] }), false);
  equal(harness.signalIntent(), null);
  equal(harness.diagnostics().trustedSelectionClearCount, 2);
});

await fixture('G5 untrusted partial re-render cannot cancel the pending trusted confirmation', async () => {
  // Virtualization can unmount the switched turn while a downstream turn is
  // still visibly different. The resulting token-less untrusted evidence must
  // not supersede the pending trusted confirmation or consume the intent.
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
  harness.inspectLive([{
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  }]);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  equal(harness.coordinator.getStatus().selectedPathConfirmationPending, true);
  // Partial pass during the confirmation window: the switched turn is absent,
  // only a downstream changed turn remains.
  harness.inspectLive([{
    qId: 'gate5-product-q-19',
    primaryAId: 'gate5-partial-a-19',
    answerIds: ['gate5-partial-a-19'],
    structureKnown: true,
  }]);
  const midStatus = harness.coordinator.getStatus();
  equal(midStatus.selectedPathConfirmationPending, true);
  equal(midStatus.selectedPathConfirmationCancelledCount, 0);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.fetchCount, 2);
  equal(status.trailingRefreshCount, 0);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
});

await fixture('G5 missing canonical authority and article-less topology fail closed or fall back', () => {
  // A capture with an empty canonical index fails closed.
  const emptyHarness = createRefreshHarness({
    initialIndex: {
      complete: true,
      chatId: 'fixture-chat',
      payloadUpdateTime: 1,
      sourceFingerprint: 'djb2:empty-authority',
      turns: [],
    },
  });
  equal(emptyHarness.recordTrustedNativeClick('previous'), false);
  equal(emptyHarness.signalIntent(), null);
  equal(emptyHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-not-canonical');
  // Without an ancestor <article>, the nearest [data-message-id] ancestor
  // itself resolves ownership through the self-candidate fallback.
  const { harness: fallbackHarness } = createLiveEnvelopeHarness();
  equal(fallbackHarness.recordTrustedNativeClick('previous', {
    scope: 'message-node',
    messages: [{ id: LIVE_BRANCH_Q, role: 'user' }],
  }), true);
  equal(fallbackHarness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(fallbackHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success')?.reason, 'capture-owner-qid-resolved');
});

await fixture('G5 conversation-turn container regression: real ChatGPT topology binds canonical owner and confirms', async () => {
  // Reproduces the FINAL live failure: the target answer + branch controls are
  // grouped under <div data-testid="conversation-turn-69"> with NO <article>
  // ancestor. The prior resolver searched only article/[data-message-id] and
  // returned capture-owner-unresolved, so no trusted intent was ever created.
  // The clicked button carries no qId; the nested SVG/path is the click target.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
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

  // Real topology: conversation-turn-69 container holds the user qId AND the
  // current assistant answer id; ownership resolves through the answer id to
  // the unique canonical qId 5068a46e..., NEVER capture-owner-unresolved.
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    testId: 'conversation-turn-69',
    messages: [
      { id: LIVE_BRANCH_Q, role: 'user' },
      { id: LIVE_BRANCH_CURRENT_A, role: 'assistant' },
    ],
  }), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  const events = harness.lifecycleTrace().map((entry) => entry.event);
  equal(events.includes('capture-owner-unresolved'), false);
  equal(events.indexOf('trusted-capture-created'), 0);
  ok(events.includes('trusted-bind-attempt'));
  ok(events.includes('trusted-bind-success'));
  const bound = harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success');
  equal(bound?.qId, LIVE_BRANCH_Q);
  equal(bound?.reason, 'capture-owner-answer-resolved');

  // Downstream wrong-first turns stay untrusted; only the target carries the token.
  const cascade = [
    { qId: LIVE_DOWNSTREAM_Q1, primaryAId: 'live-downstream-a-19', answerIds: ['live-downstream-a-19'], structureKnown: true },
    { qId: LIVE_DOWNSTREAM_Q2, primaryAId: 'live-downstream-a-21', answerIds: ['live-downstream-a-21'], structureKnown: true },
    { qId: LIVE_BRANCH_Q, primaryAId: LIVE_BRANCH_PREVIOUS_A, answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A], structureKnown: true },
  ];
  harness.inspectLive(cascade);
  const evidenceEntries = harness.lifecycleTrace().filter((entry) => entry.event === 'selected-evidence-created');
  equal(evidenceEntries.filter((entry) => entry.qId === LIVE_DOWNSTREAM_Q1).every((entry) => entry.trusted === false), true);
  equal(evidenceEntries.filter((entry) => entry.qId === LIVE_DOWNSTREAM_Q2).every((entry) => entry.trusted === false), true);
  equal(evidenceEntries.filter((entry) => entry.trusted === true).every((entry) => entry.qId === LIVE_BRANCH_Q), true);

  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathResultCode, null);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
});

await fixture('G5 conversation-turn ownership resolves via unique user message qId', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [{ id: LIVE_BRANCH_Q, role: 'user' }],
  }), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success')?.reason, 'capture-owner-qid-resolved');
});

await fixture('G5 ambiguous conversation-turn container fails closed', () => {
  const { harness } = createLiveEnvelopeHarness();
  // Two canonically-distinct owners inside one container (a malformed/merged
  // turn): user qId 5068a46e... AND an assistant answer belonging to a
  // DIFFERENT canonical turn — the resolved set has size > 1.
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [
      { id: LIVE_BRANCH_Q, role: 'user' },
      { id: '54520999-dedf-4f01-8c60-ac8adcc2c066', role: 'assistant' },
    ],
  }), false);
  equal(harness.signalIntent(), null);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-ambiguous');
  equal(harness.diagnostics().trustedSelectionBindSuccessCount, 0);
});

await fixture('G5 conversation-turn container with no canonical message IDs fails closed', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [{ id: 'f0000000-0000-4000-8000-00000000dead', role: 'assistant' }],
  }), false);
  equal(harness.signalIntent(), null);
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-not-canonical');
  // An empty container (no [data-message-id] descendants at all) is unresolved.
  const { harness: emptyContainer } = createLiveEnvelopeHarness();
  equal(emptyContainer.recordTrustedNativeClick('previous', { scope: 'conversation-turn', messages: [] }), false);
  equal(emptyContainer.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-skipped')?.reason, 'capture-owner-unresolved');
});

await fixture('G5 legacy article topology remains supported alongside conversation-turn', () => {
  const { harness: articleHarness } = createLiveEnvelopeHarness();
  equal(articleHarness.recordTrustedNativeClick('previous', {
    scope: 'article',
    messages: [{ id: LIVE_BRANCH_CURRENT_A, role: 'assistant' }],
  }), true);
  equal(articleHarness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(articleHarness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-bind-success')?.reason, 'capture-owner-answer-resolved');
  // Production tries conversation-turn first, then article — the scope-order
  // fallback is present in source.
  ok(coreSource.includes("button.closest?.('[data-testid^=\"conversation-turn-\"]')"));
  ok(coreSource.includes("|| button.closest?.('article')"));
});

await fixture('G5 capture-driven reconciliation: real downstream-only sequence confirms the captured qId', async () => {
  // The decisive live sequence: capture uniquely resolves the branch owner
  // (5068a46e...), but generic live inspection reports ONLY downstream changed
  // turns (de3883e7.../ddb05ee3...) and never the captured qId. The capture-
  // driven post-event task must schedule reconciliation for the captured qId
  // anyway, so the delayed confirmation runs and the host-proven switch to
  // 0de24351... publishes — without ever waiting for inspection to rediscover
  // the qId, and without downstream signals diverting or blocking it.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
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
  // First refresh returns the UNCHANGED host path; the delayed confirmation GET
  // returns the switched host path.
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));

  // (3-6) Trusted click on the real conversation-turn container freezes the qId.
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    testId: 'conversation-turn-69',
    messages: [
      { id: LIVE_BRANCH_Q, role: 'user' },
      { id: LIVE_BRANCH_CURRENT_A, role: 'assistant' },
    ],
  }), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  // The capture enqueued exactly one bounded post-event task.
  equal(harness.pendingPostEventTaskCount(), 1);

  // (7-8-10) Generic inspection reports ONLY downstream qIds; they are untrusted
  // and must not schedule a trusted request or divert the capture-driven one.
  const downstream = [
    { qId: LIVE_DOWNSTREAM_Q1, primaryAId: 'live-downstream-a-19', answerIds: ['live-downstream-a-19'], structureKnown: true },
    { qId: LIVE_DOWNSTREAM_Q2, primaryAId: 'live-downstream-a-21', answerIds: ['live-downstream-a-21'], structureKnown: true },
  ];
  harness.inspectLive(downstream);
  equal(harness.diagnostics().selectedPathLastScheduleTrusted, false);

  // (9) Fire the post-event task (after native event propagation): exactly one
  // trusted schedule for the captured qId, despite inspection never emitting it.
  equal(harness.runPostEventTasks(), 1);
  equal(harness.pendingPostEventTaskCount(), 0);
  const scheduleTrace = harness.lifecycleTrace().findLast((entry) => entry.event === 'selected-schedule-attempt' && entry.trusted === true);
  equal(scheduleTrace?.qId, LIVE_BRANCH_Q);
  equal(harness.lifecycleTrace().some((entry) => entry.event === 'trusted-native-branch-click' && entry.qId === LIVE_BRANCH_Q), true);
  equal(harness.diagnostics().selectedPathLastScheduleQId, LIVE_BRANCH_Q);
  equal(harness.diagnostics().selectedPathLastScheduleTrusted, true);

  // A late downstream signal during the window must not replace the trusted request.
  harness.inspectLive(downstream);

  // (11-12) First provider refresh retains the original primary and schedules
  // exactly one delayed confirmation.
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.selectedPathActiveTrusted, true);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q).primaryAId, LIVE_BRANCH_CURRENT_A);

  // (13-17) Exactly one confirmation GET; host switch publishes; variants and
  // count preserved.
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathResultCode, null);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);

  // (12 trace) Full corrected trace ordering.
  const events = harness.lifecycleTrace().map((entry) => entry.event);
  const milestones = [
    'trusted-capture-created',
    'trusted-bind-attempt',
    'trusted-bind-success',
    'trusted-native-branch-click',
    'selected-schedule-attempt',
    'selected-refresh-started',
    'selected-refresh-unchanged',
    'confirmation-eligibility-checked',
    'confirmation-scheduled',
    'confirmation-started',
    'confirmation-confirmed',
  ];
  let cursor = -1;
  for (const milestone of milestones) {
    const position = events.indexOf(milestone, cursor + 1);
    ok(position > cursor, `milestone out of order or missing: ${milestone}`);
    cursor = position;
  }
  equal(harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-intent-cleared')?.reason, 'resolved-confirmed');
});

await fixture('G5 capture-driven confirmation survives a revision-advanced first refresh', async () => {
  // The first refresh returns a payload whose revision ADVANCED (an unrelated
  // downstream turn moved) while the captured branch has NOT switched yet. The
  // capture-driven request must still schedule its one delayed confirmation
  // (not be dropped by the generic revision===0 gate), and the later switch
  // confirms. Provider GETs stay bounded at two.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  // Revision-advanced but captured branch unchanged: bump a DOWNSTREAM turn.
  const advancedTurns = initialIndex.turns.map((turn) => turn.qId === LIVE_DOWNSTREAM_Q1
    ? { ...turn, primaryAId: 'live-downstream-a-19b', answerVariants: ['live-downstream-a-19b'] }
    : { ...turn, answerVariants: turn.answerVariants.slice() });
  const advancedIndex = {
    ...initialIndex,
    payloadUpdateTime: Number(initialIndex.payloadUpdateTime) + 1,
    sourceFingerprint: envelopeRuntime.fingerprint(advancedTurns),
    turns: advancedTurns,
  };
  const confirmedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    advancedIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(advancedIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: advancedIndex }));
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [{ id: LIVE_BRANCH_CURRENT_A, role: 'assistant' }],
  }), true);
  equal(harness.runPostEventTasks(), 1);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  // Captured branch still on the baseline primary after the revision-advanced refresh.
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q).primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.trailingRefreshCount, 0);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
});

await fixture('G5 capture-driven schedule is bounded to one per physical click', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.pendingPostEventTaskCount(), 1);
  // One physical click -> exactly one post-event task -> exactly one trusted
  // capture-driven schedule. Draining the queue fires it once.
  equal(harness.runPostEventTasks(), 1);
  equal(harness.pendingPostEventTaskCount(), 0);
  equal(harness.lifecycleTrace().filter((entry) => entry.event === 'trusted-native-branch-click').length, 1);
  const trustedSchedules = harness.lifecycleTrace().filter((entry) => entry.event === 'selected-schedule-attempt' && entry.trusted === true);
  equal(trustedSchedules.length, 1);
  equal(trustedSchedules[0].qId, LIVE_BRANCH_Q);
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('G5 downstream untrusted signal cannot replace or cancel the capture-driven request', async () => {
  const { harness, initialIndex } = createLiveEnvelopeHarness({ skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.runPostEventTasks(), 1);
  // Trusted pending evidence is in flight; a downstream untrusted signal dedups.
  harness.inspectLive([{ qId: 'gate5-product-q-19', primaryAId: 'gate5-alt-a-19', answerIds: ['gate5-alt-a-19'], structureKnown: true }]);
  const dedup = harness.lifecycleTrace().findLast((entry) => entry.event === 'selected-schedule-deduplicated' && entry.reason === 'trusted-request-in-flight');
  ok(dedup);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  // The refresh ran for the trusted captured qId, scheduling the confirmation.
  // (The last schedule ATTEMPT was the rejected downstream signal — that is the
  // correct diagnostic; the only ACCEPTED trusted schedule was the captured qId.)
  equal(status.selectedPathActiveTrusted, true);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  const acceptedTrusted = harness.lifecycleTrace().filter((entry) => entry.event === 'selected-schedule-attempt' && entry.trusted === true);
  equal(acceptedTrusted.length, 1);
  equal(acceptedTrusted[0].qId, LIVE_BRANCH_Q);
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('G5 newer trusted click cancels the older capture-driven task', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous'), true);
  const firstToken = harness.signalIntent()?.token;
  equal(harness.pendingPostEventTaskCount(), 1);
  // A newer click supersedes: prior task cancelled, exactly one pending task remains.
  equal(harness.recordTrustedNativeClick('next', {
    messages: [{ id: '29a40c98-0bd8-48cd-be80-0273311a4977', role: 'user' }],
  }), true);
  equal(harness.pendingPostEventTaskCount(), 1);
  equal(harness.signalIntent()?.token === firstToken, false);
  // Firing the surviving task schedules for the NEWER qId only.
  equal(harness.runPostEventTasks(), 1);
  equal(harness.diagnostics().selectedPathLastScheduleQId, '29a40c98-0bd8-48cd-be80-0273311a4977');
  harness.coordinator.cancel('fixture-end', 'idle');
});

await fixture('G5 route/gate/reset cancel the pending capture-driven task before it runs', () => {
  // Static guard: the PRODUCTION route/authority reset actively cancels the
  // pending post-event task (the harness resetRoute() only simulates it, so
  // this string check protects the real call-site from silent deletion).
  ok(coreSource.includes('chatAtlasCancelTrustedNativeBranchReconcile();'));
  const resetFn = coreSource.slice(coreSource.indexOf('  function chatAtlasResetCompleteIndexRoute('));
  ok(resetFn.slice(0, resetFn.indexOf('\n  }\n')).includes('chatAtlasCancelTrustedNativeBranchReconcile()'));
  const resetHarness = createLiveEnvelopeHarness().harness;
  equal(resetHarness.recordTrustedNativeClick('previous'), true);
  equal(resetHarness.pendingPostEventTaskCount(), 1);
  resetHarness.signalResetRoute();
  equal(resetHarness.pendingPostEventTaskCount(), 0);
  equal(resetHarness.signalIntent(), null);
  // Even a stray fire after reset is a safe no-op (guarded by live token/route).
  equal(resetHarness.runPostEventTasks(), 0);

  const gateHarness = createLiveEnvelopeHarness().harness;
  equal(gateHarness.recordTrustedNativeClick('previous'), true);
  gateHarness.setAuthorityEnabled(false);
  // The intent lookup fails closed on gate disable, so a fired task no-ops.
  equal(gateHarness.runPostEventTasks(), 1);
  equal(gateHarness.diagnostics().selectedPathLastScheduleQId !== null
    ? gateHarness.lifecycleTrace().filter((entry) => entry.event === 'trusted-native-branch-click').length
    : 0, 0);
});

await fixture('G5 unresolved ownership creates no capture-driven task', () => {
  const { harness } = createLiveEnvelopeHarness();
  equal(harness.recordTrustedNativeClick('previous', { messages: [] }), false);
  equal(harness.signalIntent(), null);
  equal(harness.pendingPostEventTaskCount(), 0);
  equal(harness.lifecycleTrace().some((entry) => entry.event === 'trusted-native-branch-click'), false);
});

await fixture('G5 capture-driven confirmation accepts both qId-resolved and answer-resolved ownership', async () => {
  for (const messages of [
    [{ id: LIVE_BRANCH_Q, role: 'user' }],
    [{ id: LIVE_BRANCH_CURRENT_A, role: 'assistant' }],
  ]) {
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
    equal(harness.recordTrustedNativeClick('previous', { scope: 'conversation-turn', messages }), true);
    equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
    equal(harness.runPostEventTasks(), 1);
    equal(harness.runTimer(280), true);
    await new Promise((resolve) => setImmediate(resolve));
    equal(harness.runTimer(1250), true);
    await new Promise((resolve) => setImmediate(resolve));
    const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
    equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
    equal(harness.coordinator.getStatus().selectedPathConfirmationFetchCount, 1);
    equal(harness.timers.size, 0);
  }
});

await fixture('G5 slow first refresh: scheduled confirmation lease survives the capture age window', async () => {
  // The final live failure: the initial provider refresh took >5s, so by the
  // time the 1250ms confirmation timer fired, the original capture was older
  // than the trusted-selection age window and the old staleness recheck
  // expired the intent ('age-window-exceeded') and cancelled the scheduled
  // confirmation (scheduled 1 / cancelled 1 / fetch 0, primary stale). The
  // accepted confirmation now holds its own bounded lease: the capture age
  // window governs capture->bind->trusted-schedule only.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const confirmedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({
    initialIndex,
    skipUnchangedWrites: true,
    productionEvidenceCurrent: true,
  });
  // Items 1-3 + 19: disabled start rejects capture; activation writes no
  // persisted preference; canary-equivalent enable exposes 39 turns.
  harness.setEnabled(false);
  harness.setAuthorityEnabled(false);
  equal(harness.recordTrustedNativeClick('previous'), false);
  ok(coreSource.includes("const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';"));
  equal(coreSource.includes("setItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY, '1')"), false);
  harness.setEnabled(true);
  harness.setAuthorityEnabled(true);
  equal(harness.currentIndex().turns.length, 39);

  // Items 4-5: trusted click canonically binds and schedules exactly once.
  const slowFirst = deferred();
  harness.providerQueue.push(() => slowFirst.promise);
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [{ id: LIVE_BRANCH_CURRENT_A, role: 'assistant' }],
  }), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(harness.runPostEventTasks(), 1);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));

  // Items 6-8: the first refresh is SLOW — the capture ages past the window
  // while the provider is still in flight — then returns the unchanged
  // baseline answer.
  equal(harness.ageIntent(Date.now() - 6000), true);
  slowFirst.resolve({ ok: true, index: initialIndex });
  await new Promise((resolve) => setImmediate(resolve));

  // Items 9-10: eligibility passes and exactly one confirmation schedules.
  let status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(harness.diagnostics().selectedPathConfirmationSkipCount, 0);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(status.selectedPathConfirmationLeaseActive, true);
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q).primaryAId, LIVE_BRANCH_CURRENT_A);

  // Item 11: the GENERAL trusted intent ages out (the live diagnostic), but
  // the matching confirmation lease remains valid.
  equal(harness.signalLookup(LIVE_BRANCH_Q), null);
  equal(harness.signalIntent(), null);
  equal(harness.diagnostics().trustedSelectionLastClearReason, 'age-window-exceeded');
  equal(harness.diagnostics().trustedSelectionLastClearQId, LIVE_BRANCH_Q);
  equal(harness.coordinator.getStatus().selectedPathConfirmationPending, true);

  // Items 12-18: the delayed confirmation still executes exactly once, is not
  // cancelled by age, and the host payload confirms the switch.
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationCancelledCount, 0);
  equal(status.fetchCount, 2);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathResultCode, null);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
  // Item 20 + double-execution guard: runtime settles idle; the consumed lease
  // cannot fire twice.
  equal(harness.runTimer(1250), false);
  equal(harness.coordinator.getStatus().selectedPathConfirmationLeaseActive, false);

  // Lifecycle trace: retained lease, started, confirmed — and NO cancellation.
  const events = harness.lifecycleTrace().map((entry) => entry.event);
  const milestones = [
    'trusted-capture-created',
    'trusted-bind-success',
    'trusted-native-branch-click',
    'selected-schedule-attempt',
    'selected-refresh-started',
    'selected-refresh-unchanged',
    'confirmation-eligibility-checked',
    'confirmation-scheduled',
    'trusted-intent-expired',
    'confirmation-lease-retained',
    'confirmation-started',
    'confirmation-confirmed',
  ];
  let cursor = -1;
  for (const milestone of milestones) {
    const position = events.indexOf(milestone, cursor + 1);
    ok(position > cursor, `milestone out of order or missing: ${milestone}`);
    cursor = position;
  }
  equal(harness.lifecycleTrace().some((entry) => entry.event === 'confirmation-cancelled'), false);
});

await fixture('G5 confirmation lease cancels on route generation gate and newer click', async () => {
  const pendingLease = async (harness, initialIndex) => {
    harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
    equal(harness.recordTrustedNativeClick('previous'), true);
    equal(harness.runPostEventTasks(), 1);
    equal(harness.runTimer(280), true);
    await new Promise((resolve) => setImmediate(resolve));
    equal(harness.coordinator.getStatus().selectedPathConfirmationPending, true);
    return harness;
  };
  // Route change during the delayed lease cancels it immediately and bounded.
  {
    const { harness, initialIndex } = createLiveEnvelopeHarness({ skipUnchangedWrites: true });
    await pendingLease(harness, initialIndex);
    harness.setRoute('other-chat|/c/other-chat');
    equal(harness.runTimer(1250), true);
    const status = harness.coordinator.getStatus();
    equal(status.selectedPathConfirmationFetchCount, 0);
    equal(status.selectedPathConfirmationCancelledCount, 1);
    equal(harness.resolvedSelections.at(-1)?.result, 'stale-confirmation');
  }
  // Generation change cancels via the frozen lease generation.
  {
    const { harness, initialIndex } = createLiveEnvelopeHarness({ skipUnchangedWrites: true });
    await pendingLease(harness, initialIndex);
    harness.setAuthorityGeneration(99);
    equal(harness.runTimer(1250), true);
    const status = harness.coordinator.getStatus();
    equal(status.selectedPathConfirmationFetchCount, 0);
    equal(status.selectedPathConfirmationCancelledCount, 1);
  }
  // Gate disable cancels.
  {
    const { harness, initialIndex } = createLiveEnvelopeHarness({ skipUnchangedWrites: true });
    await pendingLease(harness, initialIndex);
    harness.setEnabled(false);
    equal(harness.runTimer(1250), true);
    const status = harness.coordinator.getStatus();
    equal(status.selectedPathConfirmationFetchCount, 0);
    equal(status.selectedPathConfirmationCancelledCount, 1);
  }
  // A newer trusted click supersedes the older lease (token mismatch at fire).
  {
    const { harness, initialIndex } = createLiveEnvelopeHarness({ skipUnchangedWrites: true });
    await pendingLease(harness, initialIndex);
    equal(harness.recordTrustedNativeClick('next', {
      messages: [{ id: '29a40c98-0bd8-48cd-be80-0273311a4977', role: 'user' }],
    }), true);
    equal(harness.runTimer(1250), true);
    const status = harness.coordinator.getStatus();
    equal(status.selectedPathConfirmationFetchCount, 0);
    equal(status.selectedPathConfirmationCancelledCount, 1);
    equal(harness.resolvedSelections.at(-1)?.result, 'stale-confirmation');
    harness.coordinator.cancel('fixture-end', 'idle');
  }
});

await fixture('G5 graph-selected system branch root confirms the expectChange lease', () => {
  // The 0D3a parser (shadow-validated) now yields the live incident turn as
  // primary 0de24351 with both variants preserved. The 0A1a expectChange
  // confirmation predicate must treat that parsed shape as CONFIRMED against
  // the stale baseline — ending the live selected-path-unconfirmed-unchanged
  // result — while the unchanged stale shape stays unconfirmed.
  const confirmFn = vm.runInNewContext(`(function () {
    ${extractFunction(coreSource, 'chatAtlasCompleteIndexSelectedPathConfirmed')}
    return chatAtlasCompleteIndexSelectedPathConfirmed;
  })()`, { Object, Array, String, Number });
  const evidence = {
    qId: LIVE_BRANCH_Q,
    observedAnswerId: '',
    baselineAnswerId: LIVE_BRANCH_CURRENT_A,
    expectChange: true,
    selectionToken: 'djb2:g5-graph-token',
  };
  const parsedShape = {
    complete: true,
    turns: [{
      qId: LIVE_BRANCH_Q,
      primaryAId: LIVE_BRANCH_PREVIOUS_A,
      answerVariants: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    }],
  };
  const staleShape = {
    complete: true,
    turns: [{
      qId: LIVE_BRANCH_Q,
      primaryAId: LIVE_BRANCH_CURRENT_A,
      answerVariants: [LIVE_BRANCH_PREVIOUS_A, LIVE_BRANCH_CURRENT_A],
    }],
  };
  equal(confirmFn(parsedShape, evidence), true);
  equal(confirmFn(staleShape, evidence), false);
});

await fixture('G5 slow-start: request lease frozen at acceptance survives capture-age expiry mid-fetch', async () => {
  // Live timing: capture ~0ms, coordinator acceptance ~4s (still inside the
  // capture window), initial refresh in flight when the capture crosses 5s
  // and the general intent expires. The request lease — frozen at ACCEPTANCE,
  // before the refresh began — must keep the one delayed confirmation
  // eligible.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
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
  const slowFirst = deferred();
  harness.providerQueue.push(() => slowFirst.promise);
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [{ id: LIVE_BRANCH_CURRENT_A, role: 'assistant' }],
  }), true);
  // Post-event scheduling delayed ~4s: the capture is old but still valid.
  equal(harness.ageIntent(Date.now() - 4000), true);
  equal(harness.runPostEventTasks(), 1);
  // Lease exists at ACCEPTANCE — before the initial refresh begins.
  let status = harness.coordinator.getStatus();
  equal(status.selectedPathRequestLeaseActive, true);
  equal(status.fetchCount, 0);
  equal(status.timerPending, true);
  ok(harness.lifecycleTrace().some((entry) => entry.event === 'trusted-request-lease-created'));
  // Initial refresh starts; the capture crosses the 5s boundary mid-fetch.
  equal(harness.runTimer(280), true);
  equal(harness.ageIntent(Date.now() - 6000), true);
  equal(harness.signalLookup(LIVE_BRANCH_Q), null);
  equal(harness.diagnostics().trustedSelectionLastClearReason, 'age-window-exceeded');
  equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, true);
  // First provider result remains baseline.
  slowFirst.resolve({ ok: true, index: initialIndex });
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(harness.diagnostics().selectedPathConfirmationSkipCount, 0);
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  // The one delayed confirmation executes and confirms the switch.
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.selectedPathConfirmationCancelledCount, 0);
  equal(status.fetchCount, 2);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathResultCode, null);
  equal(status.selectedPathRequestLeaseActive, false);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
  equal(harness.runTimer(1250), false);
  equal(harness.lifecycleTrace().some((entry) => entry.event === 'confirmation-cancelled'), false);
});

await fixture('G5 request lease survives an outcome that consumed the active evidence', async () => {
  // Race: the trusted request's own refresh outcome is discarded (older host
  // payload), consuming the active evidence with no resolution. The accepted
  // request lease survives and supplies the trusted evidence on the NEXT
  // refresh outcome, scheduling the single delayed confirmation.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const olderIndex = { ...initialIndex, payloadUpdateTime: Number(initialIndex.payloadUpdateTime) - 1 };
  const confirmedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: olderIndex }));
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: initialIndex }));
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.runPostEventTasks(), 1);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  // The trusted refresh outcome was discarded as older; no confirmation yet,
  // but the request lease survives.
  let status = harness.coordinator.getStatus();
  equal(status.errorCode, 'older-host-payload');
  equal(status.selectedPathConfirmationScheduledCount, 0);
  equal(status.selectedPathRequestLeaseActive, true);
  // A later generic refresh evaluates the retained lease and schedules the
  // single confirmation.
  await harness.coordinator.schedule('turn-settled', { immediate: true });
  ok(harness.lifecycleTrace().some((entry) => entry.event === 'trusted-request-lease-retained'));
  status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationFetchCount, 1);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(status.selectedPathRequestLeaseActive, false);
  equal(harness.timers.size, 0);
});

await fixture('G5 request lease cancels on scope changes and newer trusted clicks', async () => {
  // Route/gate/reset cancellation before any refresh runs.
  {
    const { harness } = createLiveEnvelopeHarness();
    equal(harness.recordTrustedNativeClick('previous'), true);
    equal(harness.runPostEventTasks(), 1);
    equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, true);
    harness.setRoute('other-chat|/c/other-chat');
    harness.coordinator.cancel('route-changed', 'stale-route-discarded');
    equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, false);
    ok(harness.lifecycleTrace().some((entry) => entry.event === 'trusted-request-lease-cancelled'));
  }
  {
    const { harness } = createLiveEnvelopeHarness();
    equal(harness.recordTrustedNativeClick('previous'), true);
    equal(harness.runPostEventTasks(), 1);
    harness.setEnabled(false);
    harness.coordinator.cancel('gate-disabled', 'idle');
    equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, false);
  }
  // A newer trusted click supersedes the older accepted lease.
  {
    const { harness } = createLiveEnvelopeHarness();
    equal(harness.recordTrustedNativeClick('previous'), true);
    equal(harness.runPostEventTasks(), 1);
    equal(harness.recordTrustedNativeClick('next', {
      messages: [{ id: '29a40c98-0bd8-48cd-be80-0273311a4977', role: 'user' }],
    }), true);
    equal(harness.runPostEventTasks(), 1);
    const superseded = harness.lifecycleTrace().findLast((entry) => entry.event === 'trusted-request-lease-cancelled');
    equal(superseded?.reason, 'superseded-by-newer-trusted');
    equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, true);
    harness.coordinator.cancel('fixture-end', 'idle');
  }
});

await fixture('G5 combined live parity: single-child graph shape plus boundary-crossing lease confirms', async () => {
  // Both live conditions together: the retained authority still shows the
  // STALE primary; acceptance lands near the five-second boundary; the
  // capture intent expires while the first fetch runs; the first payload is
  // unchanged; the delayed confirmation payload is shaped exactly as the
  // fixed parser now emits the real single-child topology (primary
  // 0de24351..., both variants preserved) and the switch confirms.
  ok(coreSource.includes("const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';"));
  equal(coreSource.includes("setItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY, '1')"), false);
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    liveIncidentEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const confirmedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  equal(confirmedIndex.turns.find((row) => row.qId === LIVE_BRANCH_Q).primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(confirmedIndex.turns.find((row) => row.qId === LIVE_BRANCH_Q).answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  const slowFirst = deferred();
  harness.providerQueue.push(() => slowFirst.promise);
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: confirmedIndex }));
  equal(harness.recordTrustedNativeClick('previous', {
    scope: 'conversation-turn',
    messages: [
      { id: LIVE_BRANCH_Q, role: 'user' },
      { id: LIVE_BRANCH_CURRENT_A, role: 'assistant' },
    ],
  }), true);
  equal(harness.ageIntent(Date.now() - 4400), true);
  equal(harness.runPostEventTasks(), 1);
  equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, true);
  equal(harness.runTimer(280), true);
  equal(harness.ageIntent(Date.now() - 5600), true);
  equal(harness.signalLookup(LIVE_BRANCH_Q), null);
  slowFirst.resolve({ ok: true, index: initialIndex });
  await new Promise((resolve) => setImmediate(resolve));
  equal(harness.coordinator.getStatus().selectedPathConfirmationScheduledCount, 1);
  equal(harness.runTimer(1250), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 2);
  equal(status.selectedPathConfirmationFetchCount, 1);
  equal(status.trailingRefreshCount, 0);
  equal(status.selectedPathResultCode, null);
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(harness.currentIndex().turns.length, 39);
  equal(new Set(harness.currentIndex().turns.map((row) => row.qId)).size, 39);
  equal(harness.resolvedSelections.at(-1)?.result, 'confirmed');
  equal(harness.timers.size, 0);
});

await fixture('SEP Path-2 with a live click intent accepts settlement evidence while the canary is false', async () => {
  // Drive the exact review-confirmed Path-2 bypass with a successful provider
  // result that would change the same-qId primary if the coordinator accepted it.
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const changedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: changedIndex }));
  harness.setReconciliationGate(false);
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.signalIntent()?.qId, LIVE_BRANCH_Q);
  equal(harness.diagnostics().trustedSelectionBindSuccessCount, 1);
  harness.inspectLive([{
    qId: LIVE_BRANCH_Q,
    primaryAId: LIVE_BRANCH_PREVIOUS_A,
    answerIds: [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A],
    structureKnown: true,
  }]);
  // Corrected contract: while the user's click intent is alive, Path-2's
  // native inspection at the captured anchor IS the branch-settlement
  // evidence — it is trusted and accepted even with the automatic canary
  // false. Rejecting it froze live branch switches on the outgoing authority
  // (the 17/20 screenshot). Without a live intent the automatic lane is
  // still rejected, which CV-3.8 pins separately.
  const evidenceEntries = harness.lifecycleTrace().filter((entry) => entry.event === 'selected-evidence-created');
  ok(evidenceEntries.length >= 1);
  equal(evidenceEntries.every((entry) => entry.trusted === true), true);
  equal(evidenceEntries.every((entry) => !!entry.tokenHash), true);
  equal(harness.diagnostics().selectedPathLastScheduleTrusted, true);
  const status = harness.coordinator.getStatus();
  equal(status.selectedPathAcceptanceCount, 1);
  equal(status.selectedPathRejectedCount, 0);
  equal(status.fetchCount, 0);
  equal(status.selectedPathConfirmationScheduledCount, 0);
  equal(status.selectedPathConfirmationLeaseActive, false);
  equal(status.selectedPathRequestLeaseActive, true);
  equal(harness.lifecycleTrace().some((entry) => entry.event === 'trusted-native-branch-click'), false);
  equal(harness.providerQueue.length, 1);
  equal(harness.writes.length, 0);
  equal(harness.published.length, 0);
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q)?.primaryAId, LIVE_BRANCH_CURRENT_A);
});

await fixture('SEP selected-path debounce is revoked when qualification turns off', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const changedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: changedIndex }));
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.runPostEventTasks(), 1);
  let status = harness.coordinator.getStatus();
  equal(status.selectedPathAcceptanceCount, 1);
  equal(status.timerPending, true);
  equal(status.selectedPathRequestLeaseActive, true);
  harness.setReconciliationGate(false);
  status = harness.coordinator.getStatus();
  equal(status.timerPending, false);
  equal(status.selectedPathActiveSignature, null);
  equal(status.selectedPathRequestLeaseActive, false);
  equal(status.selectedPathConfirmationLeaseActive, false);
  equal(status.trailingRequired, false);
  equal(harness.runTimer(280), false);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.fetchCount, 0);
  equal(harness.providerQueue.length, 1);
  equal(harness.writes.length, 0);
  equal(harness.published.length, 0);
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q)?.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(harness.timers.size, 0);
});

await fixture('SEP in-flight selected-path result is discarded after qualification turns off', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const changedIndex = withLiveBranchPrimary(
    envelopeRuntime,
    initialIndex,
    LIVE_BRANCH_PREVIOUS_A,
    Number(initialIndex.payloadUpdateTime) + 1,
  );
  const pendingProvider = deferred();
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => pendingProvider.promise);
  equal(harness.recordTrustedNativeClick('previous'), true);
  equal(harness.runPostEventTasks(), 1);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  equal(harness.coordinator.getStatus().fetchCount, 1);
  equal(harness.coordinator.getStatus().requestActive, true);
  harness.setReconciliationGate(false);
  equal(harness.coordinator.getStatus().selectedPathRequestLeaseActive, false);
  pendingProvider.resolve({ ok: true, index: changedIndex });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.requestActive, false);
  equal(status.selectedPathConfirmationScheduledCount, 0);
  equal(status.selectedPathConfirmationFetchCount, 0);
  equal(status.selectedPathConfirmationLeaseActive, false);
  equal(status.selectedPathRequestLeaseActive, false);
  equal(status.trailingRequired, false);
  equal(harness.writes.length, 0);
  equal(harness.published.length, 0);
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q)?.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(harness.timers.size, 0);
});

await fixture('SEP reconciliation false preserves ordinary non-selected-path refresh', async () => {
  const envelopeRuntime = createEnvelopeRuntime(coreSource);
  const initialIndex = envelopeRuntime.normalize(
    acceptedIdentityEnvelope(envelopeRuntime),
    'fixture-chat',
    { source: 'host' },
  ).envelope;
  const ordinaryIndex = {
    ...initialIndex,
    payloadUpdateTime: Number(initialIndex.payloadUpdateTime) + 1,
    capturedAt: '2026-07-18T00:00:01.000Z',
  };
  const harness = createRefreshHarness({ initialIndex, skipUnchangedWrites: true });
  harness.providerQueue.push(() => Promise.resolve({ ok: true, index: ordinaryIndex }));
  harness.setReconciliationGate(false);
  await harness.coordinator.schedule('turn-settled');
  equal(harness.coordinator.getStatus().timerPending, true);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  const status = harness.coordinator.getStatus();
  equal(status.fetchCount, 1);
  equal(status.selectedPathAcceptanceCount, 0);
  equal(harness.writes.length, 1);
  equal(harness.published.length, 1);
  equal(harness.currentIndex().payloadUpdateTime, ordinaryIndex.payloadUpdateTime);
  equal(harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q)?.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(harness.timers.size, 0);
});

await fixture('SEP Correction 3.3: gate off before the delayed confirmation fires cancels it with no fetch', async () => {
  // Reach a bounded pending confirmation (gate true), then disable the gate
  // before the 1250ms confirmation callback executes. The execution-time
  // recheck must cancel it: no confirmation fetch, no primary mutation.
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
  equal(harness.runPostEventTasks(), 1);
  equal(harness.runTimer(280), true);
  await new Promise((resolve) => setImmediate(resolve));
  let status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationScheduledCount, 1);
  equal(status.selectedPathConfirmationPending, true);
  // Disabling qualification cancels the pending confirmation immediately.
  harness.setReconciliationGate(false);
  equal(harness.runTimer(1250), false);
  await new Promise((resolve) => setImmediate(resolve));
  status = harness.coordinator.getStatus();
  equal(status.selectedPathConfirmationFetchCount, 0);
  equal(status.selectedPathConfirmationCancelledCount, 1);
  equal(harness.resolvedSelections.at(-1)?.result, 'reconciliation-disabled-by-setter');
  // The captured turn's primary was NOT mutated (still the pre-switch host cache).
  const turn = harness.currentIndex().turns.find((row) => row.qId === LIVE_BRANCH_Q);
  equal(turn.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(harness.timers.size, 0);
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
