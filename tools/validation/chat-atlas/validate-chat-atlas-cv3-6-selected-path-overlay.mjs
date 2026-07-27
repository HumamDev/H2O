#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const coreSource = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const parentSource = execFileSync(
  'git',
  ['show', `5295e0a361fd7a8fb3b93fdd3541f6e91d7a06a7:${CORE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);
let parentHasValidator = true;
try {
  execFileSync(
    'git',
    ['cat-file', '-e', '5295e0a361fd7a8fb3b93fdd3541f6e91d7a06a7:tools/validation/chat-atlas/validate-chat-atlas-cv3-6-selected-path-overlay.mjs'],
    { cwd: ROOT, stdio: 'ignore' },
  );
} catch {
  parentHasValidator = false;
}
const effectiveProductionRefs = execFileSync(
  'git',
  [
    '-c',
    'core.quotepath=false',
    'grep',
    '-l',
    '-E',
    'getEffectivePresentation(Index|Status)|getEffectiveTurnRecordBy(QId|AId)',
    '--',
    'src-runtime-base',
    'src-surfaces-base',
  ],
  { cwd: ROOT, encoding: 'utf8' },
).trim().split('\n').filter(Boolean);
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const ROUTE_KEY = `/c/${CHAT_ID}`;
const BRANCH_2_A17 = '7b695490-e7a4-4af6-8ad9-4e15977917bb';
const BRANCH_2_Q18 = 'e9aeedf5-f75b-488c-8527-21d9ef155539';
const BRANCH_2_A18 = 'ac657e57-7d6b-4379-bf50-07158d192924';
const fixtures = [];
let assertionCount = 0;
let boundedGraphRefetchCalls = 0;
const aggregate = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  aliasWrites: 0,
  selectedPathReconciliationCalls: 0,
  networkCalls: 0,
  cacheWrites: 0,
  uiPublications: 0,
  timerCalls: 0,
  rafCalls: 0,
};

function clean(value) {
  if (value === undefined) return value;
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(clean(actual), clean(expected), message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

async function fixture(name, run) {
  try {
    await run();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function instrumentCore() {
  const required = [
    'chatAtlasBuildSelectedPathOverlay',
    'chatAtlasSelectedPathOverlayCandidateValid',
    'chatAtlasInstallSelectedPathOverlay',
    'chatAtlasSelectedPathOverlayEvaluate',
    'chatAtlasClearSelectedPathOverlay',
    'getEffectivePresentationIndex',
    'getEffectivePresentationStatus',
    'getEffectiveTurnRecordByQId',
    'getEffectiveTurnRecordByAId',
  ];
  for (const name of required) {
    if (countOccurrences(coreSource, `  function ${name}(`) !== 1) {
      throw new Error(`core-instrumentation-anchor-invalid:${name}`);
    }
  }
  const marker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const close = '\n})();';
  const markerIndex = coreSource.indexOf(marker);
  const closeIndex = coreSource.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('core-bootstrap-boundary-invalid');
  const exportBlock = `
  function cv36CanonicalTurns() {
    const turns = [];
    for (let order = 1; order <= 39; order += 1) {
      const qId = 'canonical-q-' + order;
      const primaryAId = 'canonical-a-' + order;
      turns.push(chatAtlasFreeze({
        order,
        qId,
        turnId: 'turn:' + qId,
        primaryAId,
        answerVariants: order === 17
          ? [BRANCH_2_A17, primaryAId]
          : [primaryAId],
        noAnswer: false,
        stopped: false,
      }));
    }
    return chatAtlasFreeze(turns);
  }

  function cv36CanonicalIndex(turns = cv36CanonicalTurns()) {
    return chatAtlasFreeze({
      schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
      chatId: CHAT_ID,
      payloadUpdateTime: 1785000000,
      sourceFingerprint: chatAtlasCompleteIndexFingerprint(turns),
      capturedAt: '2026-07-27T00:00:00.000Z',
      validatedAt: '2026-07-27T00:00:00.000Z',
      complete: true,
      proof: 'host-payload-full-graph',
      turns,
    });
  }

  function cv36SelectedPath(canonical) {
    const rows = canonical.turns.slice(0, 16).map((turn) => chatAtlasFreeze({
      ...turn,
      answerVariants: turn.answerVariants.slice(),
      provenance: 'canonical-prefix',
      confirmedByNativeEvidence: false,
    }));
    const anchor = canonical.turns[16];
    rows.push(chatAtlasFreeze({
      ...anchor,
      primaryAId: BRANCH_2_A17,
      answerVariants: ['canonical-a-17', BRANCH_2_A17],
      provenance: 'anchor',
      confirmedByNativeEvidence: true,
    }));
    rows.push(chatAtlasFreeze({
      order: 18,
      qId: BRANCH_2_Q18,
      turnId: 'turn:' + BRANCH_2_Q18,
      primaryAId: BRANCH_2_A18,
      answerVariants: [BRANCH_2_A18],
      noAnswer: false,
      stopped: false,
      provenance: 'graph-descent',
      confirmedByNativeEvidence: true,
    }));
    return chatAtlasFreeze(rows);
  }

  function cv36Proof(canonical, path) {
    return chatAtlasFreeze({
      anchorQId: 'canonical-q-17',
      anchorSelectedAId: BRANCH_2_A17,
      rootNodeId: 'root-system',
      tailNodeId: BRANCH_2_A18,
      pathLength: path.length,
      canonicalPrefixLength: 17,
      canonicalFingerprint: canonical.sourceFingerprint,
      graphCapturedAt: '2026-07-27T00:00:00.000Z',
      token: 'trusted-token-1',
      chatId: CHAT_ID,
      routeKey: ROUTE_KEY,
      generation: 1,
      staleRevision: 1,
      reason: 'selected-path-proven',
      source: 'host-identity-graph',
    });
  }

  function cv36Ownership(overrides = {}) {
    return {
      intent: completeTurnIndexAuthorityState.trustedSelectedPathIntent,
      enabled: completeTurnIndexAuthorityState.enabled === true,
      chatId: completeTurnIndexAuthorityState.chatId,
      routeKey: completeTurnIndexAuthorityState.routeKey,
      generation: completeTurnIndexAuthorityState.generation,
      stale: completeTurnIndexAuthorityState.branchSelectionStale === true,
      staleQId: completeTurnIndexAuthorityState.branchSelectionStaleQId,
      staleRevision: completeTurnIndexAuthorityState.branchSelectionStaleRevision,
      routeChatId: CHAT_ID,
      routeRouteKey: ROUTE_KEY,
      activatedAt: '2026-07-27T00:00:01.000Z',
      ...overrides,
    };
  }

  function cv36Clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  globalThis.__CV36_CORE__ = Object.freeze({
    configure(options = {}) {
      chatAtlasClearSelectedPathOverlay('fixture-reset');
      chatAtlasClearSelectedPathAcquisition('fixture-reset', { resetRefetchGuard: true });
      const canonical = cv36CanonicalIndex();
      completeTurnIndexAuthorityState.enabled = options.enabled !== false;
      completeTurnIndexAuthorityState.status = 'complete-validated';
      completeTurnIndexAuthorityState.chatId = CHAT_ID;
      completeTurnIndexAuthorityState.routeKey = ROUTE_KEY;
      completeTurnIndexAuthorityState.generation = 1;
      completeTurnIndexAuthorityState.index = canonical;
      completeTurnIndexAuthorityState.indexSource = 'host-payload';
      completeTurnIndexAuthorityState.branchSelectionStale = options.stale !== false;
      completeTurnIndexAuthorityState.branchSelectionStaleRevision = 1;
      completeTurnIndexAuthorityState.branchSelectionStaleQId = 'canonical-q-17';
      completeTurnIndexAuthorityState.branchSelectionStaleChatId = CHAT_ID;
      completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = ROUTE_KEY;
      completeTurnIndexAuthorityState.branchSelectionStaleGeneration = 1;
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        token: 'trusted-token-1',
        chatId: CHAT_ID,
        routeKey: ROUTE_KEY,
        generation: 1,
        direction: 'next',
        qId: 'canonical-q-17',
        priorAnswerId: 'canonical-a-17',
        staleRevision: 1,
        observedAt: Date.now(),
      });
      buildTurns();
      const path = cv36SelectedPath(canonical);
      selectedPathAcquisitionState.status = options.acquisitionStatus || 'proven';
      selectedPathAcquisitionState.reason = 'selected-path-proven';
      selectedPathAcquisitionState.token = 'trusted-token-1';
      selectedPathAcquisitionState.anchorQId = 'canonical-q-17';
      selectedPathAcquisitionState.anchorSelectedAId = BRANCH_2_A17;
      selectedPathAcquisitionState.priorAnswerId = 'canonical-a-17';
      selectedPathAcquisitionState.chatId = CHAT_ID;
      selectedPathAcquisitionState.routeKey = ROUTE_KEY;
      selectedPathAcquisitionState.generation = 1;
      selectedPathAcquisitionState.staleRevision = 1;
      selectedPathAcquisitionState.path = path;
      selectedPathAcquisitionState.proof = cv36Proof(canonical, path);
      selectedPathAcquisitionState.provenAt = '2026-07-27T00:00:00.500Z';
      return getEffectivePresentationStatus();
    },
    activate: chatAtlasSelectedPathOverlayEvaluate,
    evaluateAcquisition(members = [{
      question: { currentQId: 'canonical-q-17' },
      answer: {
        currentProjectionSource: 'native-evidence',
        currentAnswerIds: [BRANCH_2_A17],
      },
    }]) {
      return chatAtlasSelectedPathEvaluate(members);
    },
    effectiveIndex: getEffectivePresentationIndex,
    effectiveStatus: getEffectivePresentationStatus,
    byQId: getEffectiveTurnRecordByQId,
    byAId: getEffectiveTurnRecordByAId,
    completeStatus: getCompleteTurnIndexProjectionStatus,
    durableByQId: getRecordByQIdInternal,
    durableByAId: getRecordByAIdInternal,
    durableTurns: listTurnRecords,
    candidate(options = {}) {
      const canonical = completeTurnIndexAuthorityState.index;
      const path = cv36Clone(selectedPathAcquisitionState.path);
      const proof = cv36Clone(selectedPathAcquisitionState.proof);
      if (typeof options.mutatePath === 'function') options.mutatePath(path);
      if (typeof options.mutateProof === 'function') options.mutateProof(proof);
      const acquisition = {
        status: options.status || 'proven',
        token: options.acquisition?.token || proof.token,
        anchorQId: options.acquisition?.anchorQId || proof.anchorQId,
        anchorSelectedAId: options.acquisition?.anchorSelectedAId || proof.anchorSelectedAId,
        chatId: options.acquisition?.chatId || proof.chatId,
        routeKey: options.acquisition?.routeKey || proof.routeKey,
        generation: options.acquisition?.generation || proof.generation,
        staleRevision: options.acquisition?.staleRevision || proof.staleRevision,
        path: options.freezePath === false ? path : chatAtlasFreeze(path),
        proof: options.freezeProof === false ? proof : chatAtlasFreeze(proof),
      };
      return chatAtlasBuildSelectedPathOverlay(
        acquisition,
        options.canonical === undefined ? canonical : options.canonical,
        cv36Ownership(options.ownership || {}),
      );
    },
    install: chatAtlasInstallSelectedPathOverlay,
    failAcquisition(reason = 'anchor-member-missing') {
      selectedPathAcquisitionState.status = 'failed';
      selectedPathAcquisitionState.reason = reason;
      selectedPathAcquisitionState.path = null;
      selectedPathAcquisitionState.proof = null;
      return chatAtlasSelectedPathOverlayEvaluate();
    },
    clearStale(reason = 'native-branch-returned-to-canonical') {
      return chatAtlasClearBranchSelectionStale(null, reason, false);
    },
    clearOverlay: chatAtlasClearSelectedPathOverlay,
    clearAcquisition(reason, options = {}) {
      return chatAtlasClearSelectedPathAcquisition(reason, options);
    },
    setProvider(provider) {
      H2O.archiveBoot = H2O.archiveBoot || {};
      H2O.archiveBoot.fetchConversationTurnIndex = provider;
    },
    publishSame() {
      return chatAtlasPublishCompleteIndex(completeTurnIndexAuthorityState.index, 'host-refresh');
    },
    publishChanged() {
      const turns = completeTurnIndexAuthorityState.index.turns.map((turn, index) => (
        index === 38
          ? chatAtlasFreeze({
            ...turn,
            primaryAId: 'canonical-a-39-revised',
            answerVariants: ['canonical-a-39-revised'],
          })
          : turn
      ));
      return chatAtlasPublishCompleteIndex(cv36CanonicalIndex(chatAtlasFreeze(turns)), 'host-refresh');
    },
    disable() {
      return chatAtlasApplyCompleteIndexProjectionEnabled(false, 'cv36-fixture');
    },
    setRefetchGuard(token) {
      selectedPathAcquisitionState.refetchAttemptedForToken = token;
    },
    setIntentToken(token) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        ...completeTurnIndexAuthorityState.trustedSelectedPathIntent,
        token,
      });
    },
    setCanonicalFingerprint(value) {
      completeTurnIndexAuthorityState.index = Object.freeze({
        ...completeTurnIndexAuthorityState.index,
        sourceFingerprint: String(value || ''),
      });
    },
    setRoute(value) {
      completeTurnIndexAuthorityState.routeKey = String(value || '');
    },
    setGeneration(value) {
      completeTurnIndexAuthorityState.generation = Number(value || 0);
    },
    setStaleRevision(value) {
      completeTurnIndexAuthorityState.branchSelectionStaleRevision = Number(value || 0);
    },
    resetRoute() {
      return chatAtlasResetCompleteIndexRoute(
        { chatId: CHAT_ID, routeKey: ROUTE_KEY },
        false,
      );
    },
    privateSnapshot() {
      return {
        overlay: {
          status: selectedPathOverlayState.status,
          reason: selectedPathOverlayState.reason,
          token: selectedPathOverlayState.token,
          chatId: selectedPathOverlayState.chatId,
          routeKey: selectedPathOverlayState.routeKey,
          generation: selectedPathOverlayState.generation,
          staleRevision: selectedPathOverlayState.staleRevision,
          canonicalFingerprint: selectedPathOverlayState.canonicalFingerprint,
          anchorQId: selectedPathOverlayState.anchorQId,
          activatedAt: selectedPathOverlayState.activatedAt,
          pathLength: selectedPathOverlayState.pathLength,
          index: selectedPathOverlayState.index,
          proof: selectedPathOverlayState.proof,
        },
        acquisition: {
          status: selectedPathAcquisitionState.status,
          reason: selectedPathAcquisitionState.reason,
          refetchAttemptedForToken: selectedPathAcquisitionState.refetchAttemptedForToken,
          path: selectedPathAcquisitionState.path,
          proof: selectedPathAcquisitionState.proof,
        },
        canonical: completeTurnIndexAuthorityState.index,
        stale: completeTurnIndexAuthorityState.branchSelectionStale,
      };
    },
  });
  globalThis.__CV36_CORE_BOOTSTRAP_SUPPRESSED__ = true;
`;
  return `${coreSource.slice(0, markerIndex)}${exportBlock}${close}\n`;
}

const coreProgram = instrumentCore();

function sideEffects() {
  return {
    storageWrites: 0,
    preferenceWrites: 0,
    canonicalWrites: 0,
    aliasWrites: 0,
    selectedPathReconciliationCalls: 0,
    networkCalls: 0,
    cacheWrites: 0,
    uiPublications: 0,
    timerCalls: 0,
    rafCalls: 0,
  };
}

function createRuntime() {
  const counters = sideEffects();
  const location = {
    pathname: ROUTE_KEY,
    href: `https://chatgpt.com${ROUTE_KEY}`,
    origin: 'https://chatgpt.com',
  };
  const body = {
    isConnected: true,
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const document = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() {},
    createElement() { throw new Error('forbidden-dom-write'); },
    createTextNode() { throw new Error('forbidden-dom-write'); },
  };
  class HarnessEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  class GuardedObserver {
    constructor() { throw new Error('forbidden-observer'); }
  }
  let tick = 0;
  const storage = {
    getItem() { return null; },
    setItem() { counters.storageWrites += 1; throw new Error('forbidden-storage-write'); },
    removeItem() { counters.storageWrites += 1; throw new Error('forbidden-storage-write'); },
  };
  const sandbox = {
    BRANCH_2_A17,
    BRANCH_2_Q18,
    BRANCH_2_A18,
    CHAT_ID,
    ROUTE_KEY,
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: Object.freeze({ pushState() {}, replaceState() {} }),
    navigator: Object.freeze({ userAgent: 'cv3.6-selected-path-overlay-validator' }),
    performance: Object.freeze({ now() { tick += 0.25; return tick; } }),
    Date,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    AbortController,
    requestAnimationFrame() { counters.rafCalls += 1; throw new Error('forbidden-raf'); },
    cancelAnimationFrame() {},
    setTimeout() { counters.timerCalls += 1; throw new Error('forbidden-timer'); },
    clearTimeout() {},
    setInterval() { counters.timerCalls += 1; throw new Error('forbidden-interval'); },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage,
    sessionStorage: storage,
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000001'; } }),
    fetch() { counters.networkCalls += 1; throw new Error('forbidden-fetch'); },
    XMLHttpRequest: class { constructor() { counters.networkCalls += 1; throw new Error('forbidden-xhr'); } },
    WebSocket: class { constructor() { counters.networkCalls += 1; throw new Error('forbidden-websocket'); } },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { counters.uiPublications += 1; return true; },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(coreProgram, context, { filename: CORE_PATH, timeout: 8_000 });
  equal(context.__CV36_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core boot side effects are suppressed');
  for (const key of Object.keys(counters)) counters[key] = 0;
  const coreApi = context.__CV36_CORE__;
  const api = {
    ...coreApi,
    configure(...args) {
      const result = coreApi.configure(...args);
      for (const key of Object.keys(counters)) counters[key] = 0;
      return result;
    },
  };
  return { context, api, counters };
}

function assertSafety(runtime) {
  for (const key of Object.keys(aggregate)) {
    equal(runtime.counters[key], 0, `${key} remains zero`);
    aggregate[key] += runtime.counters[key];
  }
}

function canonicalBytes(api) {
  return JSON.stringify(clean(api.privateSnapshot().canonical));
}

await fixture('canonical fallback is inert before activation', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  equal(runtime.api.effectiveStatus().source, 'canonical', 'effective source initially remains canonical');
  equal(runtime.api.effectiveStatus().overlayActive, false, 'overlay is initially inactive');
  equal(runtime.api.effectiveIndex().turns.length, 39, 'canonical count is unchanged');
  equal(runtime.api.byQId('canonical-q-18').order, 18, 'canonical qId lookup remains available');
  equal(runtime.api.byAId('canonical-a-18').order, 18, 'canonical aId lookup remains available');
  equal(runtime.api.byQId('unknown-q'), null, 'unknown canonical qId fails closed');
  equal(runtime.api.byAId('unknown-a'), null, 'unknown canonical aId fails closed');
  assertSafety(runtime);
});

await fixture('proven acquisition installs one immutable overlay atomically', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  const before = canonicalBytes(runtime.api);
  const durableBefore = JSON.stringify(clean(runtime.api.durableTurns()));
  const acquisitionBefore = JSON.stringify(clean(runtime.api.privateSnapshot().acquisition));
  const status = runtime.api.activate();
  equal(status.source, 'selected-path-overlay', 'effective source is the selected-path overlay');
  equal(status.overlayActive, true, 'overlay is active');
  equal(status.count, 18, 'overlay has the selected path length');
  const index = runtime.api.effectiveIndex();
  equal(index.proof, 'selected-path-overlay', 'overlay has a distinct proof label');
  equal(index.turns.map((turn) => turn.order), Array.from({ length: 18 }, (_, i) => i + 1), 'orders are contiguous');
  equal(index.turns[16].primaryAId, BRANCH_2_A17, 'anchor selects branch 2');
  equal(index.turns[17].qId, BRANCH_2_Q18, 'downstream q18 is present');
  equal(index.turns[17].primaryAId, BRANCH_2_A18, 'downstream a18 is present');
  equal(Object.keys(index.turns[0]).sort(), ['answerVariants', 'noAnswer', 'order', 'primaryAId', 'qId', 'stopped', 'turnId'], 'row shape is complete-index compatible');
  ok(Object.isFrozen(index), 'overlay envelope is frozen');
  ok(Object.isFrozen(index.turns), 'overlay turns are frozen');
  ok(index.turns.every((turn) => Object.isFrozen(turn) && Object.isFrozen(turn.answerVariants)), 'overlay rows and variants are frozen');
  equal(canonicalBytes(runtime.api), before, 'canonical projection remains byte-stable');
  equal(JSON.stringify(clean(runtime.api.durableTurns())), durableBefore, 'durable canonical getters remain byte-stable');
  equal(JSON.stringify(clean(runtime.api.privateSnapshot().acquisition)), acquisitionBefore, 'Stage 1 path and proof remain byte-stable');
  equal(runtime.api.durableByQId('canonical-q-17').primaryAId, 'canonical-a-17', 'durable qId getter remains canonical');
  equal(runtime.api.durableByAId('canonical-a-17').qId, 'canonical-q-17', 'durable aId getter remains canonical');
  equal(runtime.api.privateSnapshot().overlay.proof.source, 'selected-path-acquisition', 'overlay has independent proof metadata');
  assertSafety(runtime);
});

await fixture('effective identity getters use overlay ownership and fail closed', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  equal(runtime.api.byQId('canonical-q-17').primaryAId, BRANCH_2_A17, 'anchor qId resolves selected branch');
  equal(runtime.api.byAId(BRANCH_2_A17).qId, 'canonical-q-17', 'selected anchor aId resolves');
  equal(runtime.api.byAId('canonical-a-17').qId, 'canonical-q-17', 'anchor answer variant resolves to its owner');
  equal(runtime.api.byQId(BRANCH_2_Q18).order, 18, 'graph qId resolves');
  equal(runtime.api.byAId(BRANCH_2_A18).order, 18, 'graph aId resolves');
  equal(runtime.api.byQId('canonical-q-39'), null, 'off-path canonical qId is not presented');
  equal(runtime.api.byAId('canonical-a-39'), null, 'off-path canonical aId is not presented');
  equal(runtime.api.byQId(undefined), null, 'missing qId fails closed');
  equal(runtime.api.byAId(''), null, 'empty aId fails closed');
  assertSafety(runtime);
});

const failureCases = [
  ['feature disabled', { ownership: { enabled: false } }, 'feature-disabled'],
  ['acquisition not proven', { status: 'failed' }, 'acquisition-not-proven'],
  ['missing canonical authority', { canonical: null }, 'canonical-authority-unavailable'],
  ['mutable acquisition proof', { freezeProof: false }, 'acquisition-proof-invalid'],
  ['missing leaf proof', { mutateProof: (proof) => { proof.tailNodeId = ''; } }, 'acquisition-proof-invalid'],
  ['mutable acquisition path', { freezePath: false }, 'path-invalid'],
  ['proof path length mismatch', { mutateProof: (proof) => { proof.pathLength = 19; } }, 'proof-path-length-mismatch'],
  ['acquisition ownership mismatch', { acquisition: { token: 'other-token' } }, 'acquisition-ownership-mismatch'],
  ['token mismatch', { mutateProof: (proof) => { proof.token = 'other-token'; } }, 'token-mismatch'],
  ['chat mismatch', { mutateProof: (proof) => { proof.chatId = 'other-chat'; } }, 'chat-mismatch'],
  ['route mismatch', { mutateProof: (proof) => { proof.routeKey = '/c/other'; } }, 'route-mismatch'],
  ['generation mismatch', { mutateProof: (proof) => { proof.generation = 2; } }, 'generation-mismatch'],
  ['stale inactive', { ownership: { stale: false } }, 'stale-inactive'],
  ['stale qId mismatch', { ownership: { staleQId: 'canonical-q-16' } }, 'stale-qid-mismatch'],
  ['stale revision mismatch', { ownership: { staleRevision: 2 } }, 'stale-revision-mismatch'],
  ['canonical fingerprint mismatch', { mutateProof: (proof) => { proof.canonicalFingerprint = 'djb2:other'; } }, 'canonical-fingerprint-mismatch'],
  ['noncontiguous order', { mutatePath: (rows) => { rows[17].order = 19; } }, 'order-noncontiguous'],
  ['missing qId', { mutatePath: (rows) => { rows[17].qId = ''; rows[17].turnId = 'turn:'; } }, 'question-identity-invalid'],
  ['missing primary answer', { mutatePath: (rows) => { rows[17].primaryAId = null; } }, 'answer-state-invalid'],
  ['duplicate qId', { mutatePath: (rows) => { rows[17].qId = rows[16].qId; rows[17].turnId = rows[16].turnId; } }, 'duplicate-qid'],
  ['duplicate turnId', { mutatePath: (rows) => { rows[17].turnId = rows[16].turnId; } }, 'turn-identity-invalid'],
  ['ambiguous answer ownership', { mutatePath: (rows) => { rows[17].answerVariants = [BRANCH_2_A17]; rows[17].primaryAId = BRANCH_2_A17; } }, 'answer-identity-ambiguous'],
  ['canonical prefix mismatch', { mutatePath: (rows) => { rows[0].primaryAId = 'wrong-a'; rows[0].answerVariants = ['wrong-a']; } }, 'canonical-prefix-mismatch'],
  ['nonterminal no-answer row', { mutatePath: (rows) => { rows[9].primaryAId = null; rows[9].answerVariants = []; rows[9].noAnswer = true; } }, 'nonterminal-no-answer'],
  ['anchor qId mismatch', { mutateProof: (proof) => { proof.anchorQId = 'canonical-q-16'; } }, 'stale-qid-mismatch'],
  ['anchor answer mismatch', { mutateProof: (proof) => { proof.anchorSelectedAId = 'canonical-a-17'; } }, 'anchor-answer-mismatch'],
  ['anchor does not diverge', { mutatePath: (rows) => { rows[16].primaryAId = 'canonical-a-17'; rows[16].answerVariants = [BRANCH_2_A17, 'canonical-a-17']; } }, 'anchor-answer-mismatch'],
  ['downstream canonical qId reuse', { mutatePath: (rows) => { rows[17].qId = 'canonical-q-18'; rows[17].turnId = 'turn:canonical-q-18'; } }, 'duplicate-qid'],
  ['path turn bound', {
    mutatePath: (rows) => {
      while (rows.length <= 512) {
        const order = rows.length + 1;
        const qId = `bounded-q-${order}`;
        rows.push({
          order,
          qId,
          turnId: `turn:${qId}`,
          primaryAId: `bounded-a-${order}`,
          answerVariants: [`bounded-a-${order}`],
          noAnswer: false,
          stopped: false,
          provenance: 'graph-descent',
          confirmedByNativeEvidence: false,
        });
      }
    },
  }, 'path-bounds-exceeded'],
];

for (const [name, options, reason] of failureCases) {
  await fixture(`independent validation: ${name}`, () => {
    const runtime = createRuntime();
    runtime.api.configure();
    const before = canonicalBytes(runtime.api);
    const candidate = runtime.api.candidate(options);
    equal(candidate.ok, false, `${name} fails closed`);
    equal(candidate.reason, reason, `${name} has exact reason`);
    equal(runtime.api.effectiveStatus().source, 'canonical', `${name} leaves canonical fallback active`);
    equal(canonicalBytes(runtime.api), before, `${name} leaves canonical bytes unchanged`);
    assertSafety(runtime);
  });
}

await fixture('invalid candidate installation cannot expose partial overlay state', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  const candidate = runtime.api.candidate({ mutatePath: (rows) => { rows[17].order = 99; } });
  runtime.api.install(candidate);
  equal(runtime.api.effectiveStatus().source, 'canonical', 'invalid install falls back canonically');
  equal(runtime.api.privateSnapshot().overlay.index, null, 'no partial index is retained');
  equal(runtime.api.privateSnapshot().overlay.pathLength, 0, 'no partial path length is retained');
  equal(runtime.api.privateSnapshot().overlay.status, 'invalid', 'invalid state is diagnostic only');
  assertSafety(runtime);
});

await fixture('ledger virtualization after proof does not revoke a current overlay', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  const index = runtime.api.effectiveIndex();
  runtime.api.failAcquisition('anchor-member-missing');
  equal(runtime.api.effectiveStatus().overlayActive, true, 'overlay survives later ledger incompleteness');
  equal(runtime.api.effectiveIndex(), index, 'the installed immutable overlay is retained');
  assertSafety(runtime);
});

await fixture('trusted-intent expiry and unchanged-refresh retirement retain a proven overlay', () => {
  for (const reason of ['trusted-intent-expired', 'trusted-intent-resolved-unconfirmed']) {
    const runtime = createRuntime();
    runtime.api.configure();
    runtime.api.activate();
    const before = runtime.api.effectiveIndex();
    runtime.api.clearAcquisition(reason, { preserveGraph: true });
    runtime.api.activate();
    equal(runtime.api.effectiveStatus().overlayActive, true, `${reason} retains overlay`);
    equal(runtime.api.effectiveIndex(), before, `${reason} retains exact immutable path`);
    assertSafety(runtime);
  }
});

await fixture('non-virtualization acquisition failure revokes active overlay', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  runtime.api.failAcquisition('graph-replaced');
  equal(runtime.api.effectiveStatus().source, 'canonical', 'structural acquisition failure revokes overlay');
  equal(runtime.api.privateSnapshot().overlay.reason, 'acquisition-not-proven', 'revocation reason is exact');
  assertSafety(runtime);
});

await fixture('canonical return clears overlay synchronously without a success message', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  equal(runtime.api.clearStale(), true, 'canonical stale clear succeeds');
  equal(runtime.api.effectiveStatus().source, 'canonical', 'canonical return restores canonical fallback');
  equal(runtime.api.privateSnapshot().overlay.status, 'inactive', 'overlay state clears');
  equal(runtime.api.privateSnapshot().acquisition.status, 'inactive', 'acquisition state clears');
  assertSafety(runtime);
});

await fixture('host adoption retires overlay into canonical authority', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  equal(runtime.api.clearStale('host-adopted'), true, 'host adoption clears stale ownership');
  equal(runtime.api.privateSnapshot().overlay.reason, 'host-adopted', 'host adoption has exact overlay reason');
  equal(runtime.api.effectiveStatus().source, 'canonical', 'host adoption returns to canonical authority');
  assertSafety(runtime);
});

await fixture('unchanged host publication retains the exact installed overlay', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  const before = runtime.api.effectiveIndex();
  runtime.api.publishSame();
  equal(runtime.api.effectiveStatus().overlayActive, true, 'unchanged publication retains overlay');
  equal(runtime.api.effectiveIndex(), before, 'unchanged publication retains exact immutable index');
  equal(runtime.counters.uiPublications, 6, 'only existing canonical publication status events fire');
  runtime.counters.uiPublications = 0;
  assertSafety(runtime);
});

await fixture('changed non-adoption publication drops overlay until a fresh proof', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  runtime.api.publishChanged();
  equal(runtime.api.effectiveStatus().source, 'canonical', 'changed canonical fingerprint drops overlay');
  equal(runtime.api.privateSnapshot().overlay.reason, 'canonical-fingerprint-changed', 'drop reason is exact');
  equal(runtime.api.privateSnapshot().acquisition.status, 'failed', 'new authority requires a fresh acquisition proof');
  equal(runtime.counters.uiPublications, 6, 'only existing canonical publication status events fire');
  runtime.counters.uiPublications = 0;
  assertSafety(runtime);
});

await fixture('new trusted interaction epoch drops the prior overlay and resets its refetch lease', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  runtime.api.setRefetchGuard('trusted-token-1');
  runtime.api.clearOverlay('trusted-intent-superseded');
  runtime.api.clearAcquisition('trusted-intent-superseded', {
    preserveGraph: true,
    resetRefetchGuard: true,
  });
  runtime.api.setIntentToken('trusted-token-2');
  equal(runtime.api.effectiveStatus().source, 'canonical', 'new token cannot display prior overlay');
  equal(runtime.api.privateSnapshot().overlay.reason, 'trusted-intent-superseded', 'supersede reason is exact');
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, null, 'new token receives a new refetch lease');
  assertSafety(runtime);
});

await fixture('route generation and stale-revision ownership fail closed', () => {
  const routeRuntime = createRuntime();
  routeRuntime.api.configure();
  routeRuntime.api.activate();
  routeRuntime.api.setRoute('/c/other');
  equal(routeRuntime.api.effectiveStatus().source, 'canonical', 'route drift disables overlay');
  const generationRuntime = createRuntime();
  generationRuntime.api.configure();
  generationRuntime.api.activate();
  generationRuntime.api.setGeneration(2);
  equal(generationRuntime.api.effectiveStatus().source, 'canonical', 'generation drift disables overlay');
  const revisionRuntime = createRuntime();
  revisionRuntime.api.configure();
  revisionRuntime.api.activate();
  revisionRuntime.api.setStaleRevision(2);
  equal(revisionRuntime.api.effectiveStatus().source, 'canonical', 'stale revision drift disables overlay');
  assertSafety(routeRuntime);
  assertSafety(generationRuntime);
  assertSafety(revisionRuntime);
});

await fixture('canonical fingerprint change invalidates overlay', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  runtime.api.setCanonicalFingerprint('djb2:changed');
  equal(runtime.api.effectiveStatus().source, 'canonical', 'changed canonical fingerprint disables overlay');
  equal(runtime.api.effectiveStatus().overlayActive, false, 'changed fingerprint is never accepted');
  assertSafety(runtime);
});

await fixture('same acquisition is memoized and overlay records stay stable', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  const before = runtime.api.effectiveIndex();
  const activatedAt = runtime.api.effectiveStatus().activatedAt;
  runtime.api.activate();
  equal(runtime.api.effectiveIndex(), before, 'same proof/path/fingerprint reuses installed overlay');
  equal(runtime.api.effectiveStatus().activatedAt, activatedAt, 'activation timestamp stays stable');
  assertSafety(runtime);
});

await fixture('route reset clears overlay and the token refetch guard', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  runtime.api.setRefetchGuard('trusted-token-1');
  runtime.api.resetRoute();
  equal(runtime.api.privateSnapshot().overlay.status, 'inactive', 'route reset clears overlay');
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, null, 'route reset opens a new token epoch');
  equal(runtime.counters.uiPublications, 3, 'route reset retains only its existing status publications');
  runtime.counters.uiPublications = 0;
  assertSafety(runtime);
});

await fixture('feature disable drops overlay and fresh runtime starts inactive', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  runtime.api.disable();
  equal(runtime.api.privateSnapshot().overlay.status, 'inactive', 'feature disable clears overlay state');
  equal(runtime.api.effectiveStatus().overlayActive, false, 'feature disable cannot present overlay');
  equal(runtime.counters.uiPublications, 9, 'disable retains only existing reset/disabled publications');
  runtime.counters.uiPublications = 0;
  assertSafety(runtime);
  const fresh = createRuntime();
  equal(fresh.api.effectiveStatus().overlayActive, false, 'fresh runtime starts without overlay');
  equal(fresh.api.privateSnapshot().overlay.status, 'inactive', 'fresh private state is inactive');
  assertSafety(fresh);
});

await fixture('refetch guard survives same-token failures and fingerprint invalidation', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.setRefetchGuard('trusted-token-1');
  runtime.api.clearAcquisition('canonical-fingerprint-changed', { preserveGraph: true });
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, 'trusted-token-1', 'fingerprint invalidation preserves token guard');
  runtime.api.clearAcquisition('anchor-not-in-graph', { preserveGraph: true });
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, 'trusted-token-1', 'same-token failure preserves token guard');
  runtime.api.clearAcquisition('trusted-intent-superseded', {
    preserveGraph: true,
    resetRefetchGuard: true,
  });
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, null, 'new trusted interaction resets guard');
  assertSafety(runtime);
});

await fixture('fingerprint re-evaluation cannot issue a second graph refetch for one token', async () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.clearAcquisition('fixture-graph-absent', { resetRefetchGuard: true });
  let calls = 0;
  runtime.api.setProvider(async (_chatId, options) => {
    calls += 1;
    boundedGraphRefetchCalls += 1;
    equal(options.includeIdentityGraph, true, 'bounded provider call requests graph only');
    return { ok: true, identityGraph: null };
  });
  runtime.api.evaluateAcquisition();
  await Promise.resolve();
  await Promise.resolve();
  equal(calls, 1, 'first evaluation issues one graph refetch');
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, 'trusted-token-1', 'guard is set before resolution');
  runtime.api.setCanonicalFingerprint('djb2:changed');
  runtime.api.clearAcquisition('canonical-fingerprint-changed', { preserveGraph: true });
  runtime.api.evaluateAcquisition();
  await Promise.resolve();
  equal(calls, 1, 'same token cannot refetch after fingerprint clear/re-evaluation');
  equal(runtime.api.privateSnapshot().acquisition.reason, 'anchor-not-in-graph', 'same-token second attempt fails closed');
  assertSafety(runtime);
});

await fixture('new trusted token receives exactly one new graph refetch opportunity', async () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.clearAcquisition('fixture-graph-absent', { resetRefetchGuard: true });
  runtime.api.setRefetchGuard('trusted-token-1');
  runtime.api.clearAcquisition('trusted-intent-superseded', {
    preserveGraph: true,
    resetRefetchGuard: true,
  });
  runtime.api.setIntentToken('trusted-token-2');
  let calls = 0;
  runtime.api.setProvider(async () => {
    calls += 1;
    boundedGraphRefetchCalls += 1;
    return { ok: false, errorCode: 'unavailable' };
  });
  runtime.api.evaluateAcquisition();
  await Promise.resolve();
  await Promise.resolve();
  runtime.api.evaluateAcquisition();
  await Promise.resolve();
  equal(calls, 1, 'new token gets one and only one refetch');
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, 'trusted-token-2', 'guard moves to new token');
  assertSafety(runtime);
});

await fixture('rejected graph provider promise cannot create a retry loop', async () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.clearAcquisition('fixture-graph-absent', { resetRefetchGuard: true });
  let calls = 0;
  runtime.api.setProvider(async () => {
    calls += 1;
    boundedGraphRefetchCalls += 1;
    throw new Error('expected-provider-rejection');
  });
  runtime.api.evaluateAcquisition();
  await Promise.resolve();
  await Promise.resolve();
  runtime.api.clearAcquisition('ledger-reapplied', { preserveGraph: true });
  runtime.api.evaluateAcquisition();
  await Promise.resolve();
  equal(calls, 1, 'provider rejection leaves the same-token guard closed');
  equal(runtime.api.privateSnapshot().acquisition.refetchAttemptedForToken, 'trusted-token-1', 'rejection preserves guard');
  assertSafety(runtime);
});

await fixture('public diagnostics are additive IDs-only metadata', () => {
  const runtime = createRuntime();
  runtime.api.configure();
  runtime.api.activate();
  const status = runtime.api.effectiveStatus();
  const complete = runtime.api.completeStatus();
  equal(Object.keys(status).sort(), ['activatedAt', 'anchorQId', 'canonicalFingerprint', 'chatId', 'count', 'generation', 'overlayActive', 'pathLength', 'reason', 'routeKey', 'source'], 'effective status keys are narrow');
  equal(Object.hasOwn(status, 'token'), false, 'effective status omits raw token');
  equal(Object.hasOwn(status, 'graph'), false, 'effective status omits raw graph');
  equal(Object.hasOwn(status, 'turns'), false, 'effective status omits path rows');
  equal(complete.selectedPathOverlay.overlayActive, true, 'complete status includes additive overlay diagnostics');
  equal(Object.hasOwn(complete.selectedPathOverlay, 'token'), false, 'additive diagnostics omit token');
  assertSafety(runtime);
});

await fixture('source integration is Stage-2-only and consumers remain disconnected', () => {
  equal(parentSource.includes('getEffectivePresentationIndex'), false, 'immutable Stage 1 parent lacks overlay API');
  equal(parentHasValidator, false, 'immutable Stage 1 parent lacks CV-3.6 validator');
  equal(coreSource.includes('getEffectivePresentationIndex,'), true, 'effective index getter is public');
  equal(coreSource.includes('getEffectivePresentationStatus,'), true, 'effective status getter is public');
  equal(coreSource.includes('getEffectiveTurnRecordByQId,'), true, 'effective qId getter is public');
  equal(coreSource.includes('getEffectiveTurnRecordByAId,'), true, 'effective aId getter is public');
  equal(countOccurrences(coreSource, 'selectedPathOverlay: getEffectivePresentationStatus()'), 1, 'overlay diagnostics are additive once');
  equal(countOccurrences(coreSource, 'chatAtlasSelectedPathOverlayEvaluate();'), 2, 'overlay evaluates only after acquisition/ledger completion');
  equal(coreSource.includes('H2O_MM_CORE_API.set'), false, 'no MiniMap setter is introduced');
  equal(coreSource.includes('setSelectedPath'), false, 'no selected-path setter is exposed');
  equal(effectiveProductionRefs, [CORE_PATH], 'no production module outside Core references effective APIs');
});

for (const key of Object.keys(aggregate)) {
  equal(aggregate[key], 0, `aggregate ${key} remains zero`);
}
equal(boundedGraphRefetchCalls, 3, 'only the three explicit bounded-refetch fixtures call the provider');

const failed = fixtures.filter((item) => !item.ok);
const report = {
  validator: 'chat-atlas-cv3-6-selected-path-overlay',
  fixtures: {
    total: fixtures.length,
    passed: fixtures.length - failed.length,
    failed: failed.length,
  },
  assertions: assertionCount,
  safetyCounters: aggregate,
  boundedGraphRefetchCalls,
  results: fixtures,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
