#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_REL = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_REL), 'utf8');
const BASE_COMMIT = '1b88533ba7f2d331dfc81370ddc26977518b41cf';
const BASE_SOURCE = execFileSync('git', ['show', `${BASE_COMMIT}:${CORE_REL}`], {
  cwd: ROOT,
  encoding: 'utf8',
});
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const ROUTE_KEY = `/c/${CHAT_ID}`;
const Q36_NODE = '2fffee51-0cdc-43e4-8bb7-b26ab0baca02';
const Q36_MESSAGE = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
const A73 = 'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b';
const Q39_NODE = 'b56ec93b-a9da-4e97-9a1e-dc32a6c94ba7';
const Q39_MESSAGE = 'b2f9f77a-d2ae-448a-aa66-9b04918d120c';
const A36_MESSAGE = '84c7e73c-5fb7-44f6-a930-72e92d369c5a';
const A39_MESSAGE = '19e8c88d-6db7-42f1-90c3-32807d0921b1';
const EXPANSION_FIELDS = Object.freeze([
  'branchExpansionPending',
  'branchExpansionFailClosed',
  'branchExpansionState',
  'branchExpansionReason',
  'branchExpansionPriorCount',
  'branchExpansionTargetCount',
  'branchExpansionExpectedFingerprint',
  'branchExpansionRequiredPageNums',
  // Stage 2C-2i branch-transition diagnostics: last stale-clear reason and
  // the count of foreign mounted turns suppressed mid-transition.
  'branchStaleLastClearReason',
  'branchTransitionSuppressedLiveAppendCount',
  // Stage 2C-2k branch-transaction ownership diagnostics.
  'branchTransactionPending',
  'branchTransactionStateCode',
  'branchTransactionReason',
  'branchTransactionTrace',
  // Stage 2C-2p native downstream-edit convergence diagnostics.
  'nativeConvergencePhase',
  'nativeConvergenceReason',
  'nativeConvergenceExpectedQId',
  'nativeConvergenceAttempts',
  // Stage 2C-2q nested branch-selection plan and authority-contract counters.
  'graphNodeCount',
  'effectivePathTurnCount',
  'ledgerTurnCount',
  'miniMapTurnCount',
  'nativeMountedTurnCount',
  'nativeMountedPrefixCount',
  'nativeTerminalMounted',
  'nativeFirstMismatchKind',
  'nativeFirstMismatchOrder',
  'nativeFirstMismatchMountedAId',
  'nativeFirstMismatchExpectedAId',
  'nativeBranchPlanReason',
  'nativeBranchPlanPointCount',
  'nativeBranchPlanEditPointCount',
  'nativeBranchPlanRegenerationPointCount',
  'nativeBranchPlanRemainingMismatches',
  // Stage 2C-2t explicit overlay-origin publication diagnostics.
  'defaultOverlayState',
  'defaultPublicationReason',
  'defaultTerminalId',
  'defaultTerminalCreateTime',
  'defaultPathCount',
  'defaultPathFingerprint',
  'defaultBranchVectorCount',
  'defaultPublications',
  'defaultGraphAcquisitions',
  'manualOverrideActive',
  'manualOverrideRevision',
  'defaultResolutions',
  'defaultEffectiveIdentity',
  'defaultSamePathCheckRan',
  'defaultSamePathResult',
  'defaultEffectiveAvailableAtCheck',
  'defaultEffectiveCountAtCheck',
  'defaultFirstDifference',
  'defaultDedupKey',
  'defaultDeferrals',
  'defaultResolutionSource',
  'defaultAnswerOnlyReason',
  'defaultConvergenceAttempts',
  'defaultConvergenceReason',
  'defaultConvergenceExpectedAId',
  'defaultConvergenceExpectedQId',
  'defaultConvergenceEvaluation',
  'revealTargetOrder',
  'revealTargetQId',
  'revealTargetExpectedAId',
  'revealTargetCurrentAId',
  'revealTargetDivergenceKind',
  'revealTargetReason',
  'revealState',
  'revealReason',
  'revealAttempts',
  'revealTransactionState',
  'revealTransactionTokenHash',
  'revealTransactionReason',
  'revealTransactionScopeValid',
  'revealTransactionSuperseded',
  'revealUserSuperseded',
  'revealTopScrollExecuted',
  'revealListenerCount',
  'revealMountedQId',
  'revealMountedAId',
  'revealPagerPresent',
  'revealBookmarkKind',
  'revealBookmarkTurnId',
  'revealBookmarkOffset',
  'revealBookmarkScrollTop',
  'revealBookmarkCaptured',
  'revealRestoreState',
  'revealRestoreReason',
  'revealRestoreMethod',
  'revealRestoreTargetId',
  'revealRestoreOffset',
  'revealContainerState',
  'revealContainerReason',
  'revealContainerCandidateCount',
  'revealContainerGovernedTurns',
  'revealContainerTag',
  'revealContainerTestIdHash',
  'revealContainerClientHeight',
  'revealContainerScrollHeight',
  'revealContainerScrollTop',
]);

const fixtures = [];
let assertions = 0;

function clean(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function equal(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(clean(actual), clean(expected), message);
}

function ok(value, message) {
  assertions += 1;
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

function extractFunction(source, name) {
  const anchors = [`  function ${name}(`, `  async function ${name}(`];
  const matches = anchors
    .map((anchor) => ({ anchor, index: source.indexOf(anchor) }))
    .filter((item) => item.index >= 0);
  if (matches.length !== 1 || source.indexOf(matches[0].anchor) !== source.lastIndexOf(matches[0].anchor)) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
  const start = matches[0].index;
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function graphNode({
  nodeId,
  messageId = nodeId,
  parentId = null,
  childIds = [],
  role = null,
  productUser = false,
  productAnswer = false,
  stopped = false,
}) {
  return {
    nodeId,
    parentId,
    childIds: childIds.slice(),
    role,
    messageId,
    productUser,
    productAnswer,
    stopped,
  };
}

function makeIdentityGraph() {
  const wideChildren = Array.from({ length: 40 }, (_unused, index) => `wide-child-${index + 1}`);
  const nodes = [
    graphNode({
      nodeId: 'system-root',
      messageId: 'system-message',
      childIds: [Q36_NODE, 'tool-node', 'stale-off-path', 'wide-parent'],
      role: 'system',
    }),
    graphNode({
      nodeId: Q36_NODE,
      messageId: Q36_MESSAGE,
      parentId: 'system-root',
      childIds: [A73, 'assistant-node-36'],
      role: 'user',
      productUser: true,
    }),
    graphNode({
      nodeId: A73,
      messageId: A73,
      parentId: Q36_NODE,
      childIds: [Q39_NODE],
      role: 'assistant',
      productAnswer: false,
      stopped: true,
    }),
    graphNode({
      nodeId: 'assistant-node-36',
      messageId: A36_MESSAGE,
      parentId: Q36_NODE,
      role: 'assistant',
      productAnswer: true,
    }),
    graphNode({
      nodeId: Q39_NODE,
      messageId: Q39_MESSAGE,
      parentId: A73,
      childIds: ['assistant-node-39'],
      role: 'user',
      productUser: true,
    }),
    graphNode({
      nodeId: 'assistant-node-39',
      messageId: A39_MESSAGE,
      parentId: Q39_NODE,
      role: 'assistant',
      productAnswer: true,
    }),
    graphNode({
      nodeId: 'tool-node',
      messageId: 'tool-message',
      parentId: 'system-root',
      role: 'tool',
    }),
    graphNode({
      nodeId: 'stale-off-path',
      messageId: 'stale-message',
      parentId: 'system-root',
      role: 'assistant',
    }),
    graphNode({
      nodeId: 'wide-parent',
      messageId: 'wide-parent-message',
      parentId: 'system-root',
      childIds: wideChildren,
      role: 'assistant',
      productAnswer: false,
    }),
    ...wideChildren.map((nodeId, index) => graphNode({
      nodeId,
      messageId: `wide-message-${index + 1}`,
      parentId: 'wide-parent',
      role: index % 2 ? 'tool' : 'assistant',
    })),
  ];
  return {
    chatId: CHAT_ID,
    currentNode: 'assistant-node-39',
    nodeCount: nodes.length,
    capturedAt: '2026-07-30T00:00:00.000Z',
    nodes,
  };
}

function makeHarness(overrides = {}) {
  const identityGraph = overrides.identityGraph === undefined ? makeIdentityGraph() : overrides.identityGraph;
  const retained = overrides.retained === undefined
    ? {
      identityGraph,
      chatId: CHAT_ID,
      routeKey: ROUTE_KEY,
      generation: 7,
      captureIdentity: 'djb2:graph-current',
      selectedPathProofToken: 'must-never-leak',
      metadata: { content: 'must-never-leak' },
    }
    : overrides.retained;
  const authority = {
    enabled: true,
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation: 7,
    index: { sourceFingerprint: 'djb2:canonical-current' },
    ...(overrides.authority || {}),
  };
  const state = {
    selectedPathAcquisitionState: { graph: retained, status: 'inactive' },
    completeTurnIndexAuthorityState: authority,
    route: { chatId: CHAT_ID, routeKey: ROUTE_KEY, ...(overrides.route || {}) },
    authoritative: overrides.authoritative !== false,
  };
  const safety = {
    storageWrites: 0,
    cacheWrites: 0,
    preferenceWrites: 0,
    aliasWrites: 0,
    networkCalls: 0,
    timeoutCalls: 0,
    intervalCalls: 0,
    rafCalls: 0,
    observerCalls: 0,
    navigationCalls: 0,
    scrollCalls: 0,
  };
  const throwing = (key) => () => {
    safety[key] += 1;
    throw new Error(`forbidden:${key}`);
  };
  const context = vm.createContext({
    console,
    Map,
    Set,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    Math,
    __state: state,
    __safety: safety,
    localStorage: { setItem: throwing('storageWrites') },
    sessionStorage: { setItem: throwing('storageWrites') },
    indexedDB: { open: throwing('storageWrites') },
    fetch: throwing('networkCalls'),
    setTimeout: throwing('timeoutCalls'),
    setInterval: throwing('intervalCalls'),
    requestAnimationFrame: throwing('rafCalls'),
    MutationObserver: class {
      constructor() {
        safety.observerCalls += 1;
        throw new Error('forbidden:observerCalls');
      }
    },
    navigation: { navigate: throwing('navigationCalls') },
    scrollTo: throwing('scrollCalls'),
    scrollBy: throwing('scrollCalls'),
    cacheWriter: throwing('cacheWrites'),
    preferenceWriter: throwing('preferenceWrites'),
    aliasWriter: throwing('aliasWrites'),
  });
  const functionNames = [
    'chatAtlasFreeze',
    'chatAtlasCompleteIndexIdentity',
    'chatAtlasCompleteIndexExactKeys',
    'chatAtlasIdentityGraphValid',
    'chatAtlasNormalizeGraphDiagnosticIds',
    'chatAtlasGraphIdentitySummary',
    'chatAtlasGraphIdentityMiss',
    'getGraphIdentityDiagnostics',
  ];
  const runtimeSource = `
    'use strict';
    const selectedPathAcquisitionState = __state.selectedPathAcquisitionState;
    const completeTurnIndexAuthorityState = __state.completeTurnIndexAuthorityState;
    function chatAtlasCompleteIndexAuthorityActive() { return __state.authoritative === true; }
    function chatAtlasFullIndexRoute() { return { ...__state.route }; }
    ${functionNames.map((name) => extractFunction(CORE_SOURCE, name)).join('\n')}
    globalThis.__api = Object.freeze({ get: getGraphIdentityDiagnostics });
  `;
  vm.runInContext(runtimeSource, context, { filename: '0A1a-graph-diagnostics.vm.js' });
  return {
    api: context.__api,
    state,
    safety,
    identityGraph,
    retained,
    authority,
  };
}

function makeProjectionState(overrides = {}) {
  const requiredPageNums = overrides.branchExpansionRequiredPageNums || [];
  return {
    enabled: true,
    activationSource: 'memory-only',
    status: 'complete-validated',
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation: 7,
    index: Object.freeze({
      turns: Object.freeze([{ order: 1 }, { order: 2 }]),
      sourceFingerprint: 'djb2:projection-current',
      payloadUpdateTime: 1785000000,
      proof: 'host-payload-full-graph',
    }),
    indexSource: 'host-payload',
    pendingDrafts: new Map([['pending-q', Object.freeze({ qId: 'pending-q' })]]),
    fetchCount: 2,
    cacheReadCount: 3,
    cacheWriteCount: 0,
    cacheWriteSkippedUnchangedCount: 1,
    cacheWriteFailureCount: 0,
    setterCallCount: 0,
    automaticSetterCallCount: 0,
    preferenceSetterCallCount: 0,
    preferenceReadCount: 0,
    preferenceWriteCount: 0,
    preferenceClearCount: 0,
    preferenceWriteFailureCount: 0,
    bootApplyCount: 1,
    bootActivationCount: 1,
    staleDiscardCount: 0,
    trustedSelectionCaptureCount: 4,
    trustedSelectedPathIntent: Object.freeze({ qId: 'q-17' }),
    branchSelectionStale: true,
    branchSelectionStaleRevision: 9,
    branchSelectionStaleQId: 'q-17',
    branchExpansionState: overrides.branchExpansionState || 'idle',
    branchExpansionReason: overrides.branchExpansionReason ?? null,
    branchExpansionPriorCount: overrides.branchExpansionPriorCount || 0,
    branchExpansionTargetCount: overrides.branchExpansionTargetCount || 0,
    branchExpansionExpectedFingerprint: overrides.branchExpansionExpectedFingerprint || '',
    branchExpansionRequiredPageNums: requiredPageNums,
    branchExpansionLease: overrides.branchExpansionLease || null,
    branchExpansionTimeoutTask: overrides.branchExpansionTimeoutTask || null,
    branchExpansionRetryTask: overrides.branchExpansionRetryTask || null,
    autoBranchReconciliationEnabled: false,
    autoBranchReconciliationSetterCallCount: 0,
    refreshListenerRegistrationCount: 1,
    startedAt: '2026-07-31T00:00:00.000Z',
    completedAt: '2026-07-31T00:00:01.000Z',
    errorCode: null,
    authorityUnpersisted: false,
    cacheWriteErrorCode: null,
    diagnosticStatus: null,
    preferenceResolved: true,
    preferenceStoredValue: null,
    preferenceResolution: 'default',
    preferenceReadErrorCode: null,
    preferenceWriteErrorCode: null,
  };
}

const BASE_PROJECTION_SOURCE = extractFunction(BASE_SOURCE, 'getCompleteTurnIndexProjectionStatus');
const CURRENT_PROJECTION_SOURCE = extractFunction(CORE_SOURCE, 'getCompleteTurnIndexProjectionStatus');

function runProjection(source, overrides = {}) {
  const state = makeProjectionState(overrides);
  const lifecycle = {
    trustedSelectionLastCaptureTokenHash: 'djb2:trusted',
    trustedSelectionLastCaptureDirection: 'next',
    trustedSelectionBindAttemptCount: 4,
    trustedSelectionBindSuccessCount: 4,
    trustedSelectionLastBoundQId: 'q-17',
    trustedSelectionClearCount: 1,
    trustedSelectionLastClearReason: 'confirmed',
    trustedSelectionLastClearQId: 'q-17',
    selectedPathTrustedScheduleAttemptCount: 2,
    selectedPathTrustedScheduleAcceptedCount: 2,
    selectedPathLastScheduleTrusted: true,
    selectedPathLastScheduleQId: 'q-17',
    selectedPathLastScheduleCause: 'fixture',
    selectedPathConfirmationEligibilityCheckCount: 2,
    selectedPathConfirmationSkipCount: 0,
    selectedPathConfirmationLastSkipReason: null,
    traceDroppedCount: 0,
    trace: Object.freeze([]),
  };
  const refresh = Object.freeze({
    fetchCount: 1,
    debounceCount: 2,
    coalescedCount: 3,
    staleDiscardCount: 0,
    trailingRequired: false,
    trailingRefreshCount: 0,
    selectedPathSignalCount: 2,
    selectedPathAcceptanceCount: 1,
    selectedPathRejectedCount: 0,
    selectedPathCancellationCount: 0,
    selectedPathDeduplicatedCount: 1,
    selectedPathUnconfirmedCount: 0,
    selectedPathLastSignature: 'last-signature',
    selectedPathActiveSignature: 'active-signature',
    selectedPathActiveTrusted: true,
    selectedPathResultCode: 'accepted',
    selectedPathConfirmationPending: false,
    selectedPathConfirmationLeaseActive: false,
    selectedPathRequestLeaseActive: false,
    selectedPathConfirmationScheduledCount: 1,
    selectedPathConfirmationFetchCount: 1,
    selectedPathConfirmationCancelledCount: 0,
    causeSample: Object.freeze(['fixture']),
    timerPending: false,
    requestActive: false,
  });
  const sandbox = vm.createContext({
    __state: state,
    __lifecycle: lifecycle,
    __refresh: refresh,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Map,
  });
  vm.runInContext(`
    const COMPLETE_TURN_INDEX_CANARY = 'cv3.20-canary';
    const COMPLETE_TURN_INDEX_COMPILED_DEFAULT = true;
    const COMPLETE_TURN_INDEX_CACHE_SCHEMA = 1;
    const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'cv3.20-preference';
    const completeTurnIndexAuthorityState = __state;
    const completeTurnIndexLifecycleDiagnostics = __lifecycle;
    const completeIndexRefreshCoordinator = Object.freeze({ getStatus: () => __refresh });
    const chatAtlasCompleteIndexAuthorityActive = () => true;
    const chatAtlasCompleteIndexCacheKey = (chatId) => 'cache:' + String(chatId || '');
    const getSelectedPathAcquisitionStatus = () => Object.freeze({ status: 'proven' });
    const getEffectivePresentationStatus = () => Object.freeze({ source: 'canonical', count: 2 });
    const chatAtlasBranchTransactionCurrent = () => (__state.branchTransactionState || null);
    if (!Array.isArray(__state.branchTransactionTrace)) __state.branchTransactionTrace = [];
    ${extractFunction(CORE_SOURCE, 'chatAtlasFreeze')}
    ${extractFunction(CORE_SOURCE, 'chatAtlasNativeBranchPlanDiagnostics')}
    const chatAtlasRevealDiagnostics = () => ({ revealState: 'idle', revealReason: null, revealAttempts: 0, revealTransactionState: 'idle', revealTransactionTokenHash: '', revealTransactionReason: null, revealTransactionScopeValid: false, revealTransactionSuperseded: false, revealUserSuperseded: false, revealTopScrollExecuted: false, revealListenerCount: 0, revealMountedQId: null, revealMountedAId: null, revealPagerPresent: false, revealBookmarkKind: null, revealBookmarkTurnId: null, revealBookmarkOffset: 0, revealBookmarkScrollTop: 0, revealBookmarkCaptured: false, revealRestoreState: 'idle', revealRestoreReason: null, revealRestoreMethod: null, revealRestoreTargetId: null, revealRestoreOffset: 0, revealContainerState: 'unresolved', revealContainerReason: null, revealContainerCandidateCount: 0, revealContainerGovernedTurns: 0, revealContainerTag: null, revealContainerTestIdHash: null, revealContainerClientHeight: 0, revealContainerScrollHeight: 0, revealContainerScrollTop: 0 });
    const chatAtlasDefaultOverlayState = { state: 'idle', reason: null, key: '', terminalNodeId: null, terminalCreateTime: null, pathCount: 0, fingerprint: '', branchVectorCount: 0, publications: 0, resolutions: 0, graphAcquisitions: 0, effectiveIdentity: '', samePathCheckRan: false, samePathResult: null, effectiveAvailableAtCheck: false, effectiveCountAtCheck: 0, firstDifference: null, deferrals: 0, resolutionSource: null, answerOnlyReason: null, convergenceAttempts: 0, convergenceSignature: '', convergenceReason: null, convergenceExpectedAId: null, convergenceExpectedQId: null, convergenceEvaluation: null, revealTargetOrder: 0, revealTargetQId: null, revealTargetExpectedAId: null, revealTargetCurrentAId: null, revealTargetDivergenceKind: null, revealTargetReason: null, convergenceRecord: null };
    ${extractFunction(CORE_SOURCE, 'chatAtlasDefaultOverlayDiagnostics')}
    ${source}
    globalThis.__projection = getCompleteTurnIndexProjectionStatus();
  `, sandbox, { filename: '0A1a-projection-compatibility.vm.js' });
  return { result: sandbox.__projection, state };
}

function assertProjectionCompatibility(current, base) {
  for (const [key, value] of Object.entries(base)) {
    equal(Object.hasOwn(current, key), true, `pre-existing projection field ${key} remains present`);
    equal(current[key], value, `pre-existing projection field ${key} retains its value`);
  }
  for (const key of EXPANSION_FIELDS) equal(Object.hasOwn(current, key), true, `additive field ${key} is present`);
  equal(Object.keys(current).length, Object.keys(base).length + EXPANSION_FIELDS.length, 'only the approved additive fields are present');
}

function mutationKilled(run, label) {
  let survived = false;
  try {
    run();
    survived = true;
  } catch {}
  ok(!survived, `${label} is killed`);
}

function record(result, requestedId) {
  return result.records.find((item) => item.requestedId === requestedId);
}

function assertDeepFrozen(value, pathLabel = 'root') {
  if (!value || typeof value !== 'object') return;
  ok(Object.isFrozen(value), `${pathLabel} frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeepFrozen(item, `${pathLabel}[${index}]`));
  } else {
    Object.entries(value).forEach(([key, item]) => assertDeepFrozen(item, `${pathLabel}.${key}`));
  }
}

function recursiveKeys(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, item] of Object.entries(value)) {
    out.push(key);
    recursiveKeys(item, out);
  }
  return out;
}

await fixture('lookup by node ID succeeds', () => {
  const result = makeHarness().api.get([Q36_NODE]);
  const found = record(result, Q36_NODE);
  equal(result.available, true, 'available');
  equal(found.found, true, 'found');
  equal(found.nodeId, Q36_NODE, 'node id');
  equal(found.messageId, Q36_MESSAGE, 'message id');
});

await fixture('lookup by message ID resolves the same graph node', () => {
  const harness = makeHarness();
  const byNode = record(harness.api.get([Q36_NODE]), Q36_NODE);
  const byMessage = record(harness.api.get([Q36_MESSAGE]), Q36_MESSAGE);
  equal(byMessage.nodeId, byNode.nodeId, 'same node');
  equal(byMessage.messageId, byNode.messageId, 'same message');
});

await fixture('matchedDomains is exact for node-ID lookup', () => {
  equal(record(makeHarness().api.get([Q36_NODE]), Q36_NODE).matchedDomains, ['nodeId'], 'node domain');
});

await fixture('matchedDomains is exact for message-ID lookup', () => {
  equal(record(makeHarness().api.get([Q36_MESSAGE]), Q36_MESSAGE).matchedDomains, ['messageId'], 'message domain');
});

await fixture('node ID equal to message ID reports both domains', () => {
  equal(record(makeHarness().api.get([A73]), A73).matchedDomains, ['nodeId', 'messageId'], 'both domains');
});

await fixture('alternate user identity domains remain distinguishable', () => {
  const result = makeHarness().api.get([Q36_NODE, Q36_MESSAGE, Q39_NODE, Q39_MESSAGE]);
  equal(result.records.map((item) => item.requestedId), [Q36_NODE, Q36_MESSAGE, Q39_NODE, Q39_MESSAGE], 'request identities');
  equal(record(result, Q36_NODE).messageId, Q36_MESSAGE, 'first alias');
  equal(record(result, Q39_NODE).messageId, Q39_MESSAGE, 'second alias');
});

await fixture('parent summary is copied exactly', () => {
  const parent = record(makeHarness().api.get([Q39_NODE]), Q39_NODE).parent;
  equal(parent.nodeId, A73, 'parent node');
  equal(parent.messageId, A73, 'parent message');
  equal(parent.role, 'assistant', 'parent role');
  equal(parent.stopped, true, 'parent stopped');
});

await fixture('child summaries preserve graph order', () => {
  const children = record(makeHarness().api.get([Q36_NODE]), Q36_NODE).children;
  equal(children.map((item) => item.nodeId), [A73, 'assistant-node-36'], 'ordered children');
  equal(children.map((item) => item.productAnswer), [false, true], 'child flags');
});

await fixture('child summaries are capped at 32', () => {
  const children = record(makeHarness().api.get(['wide-parent']), 'wide-parent').children;
  equal(children.length, 32, 'cap');
  equal(children[0].nodeId, 'wide-child-1', 'first child');
  equal(children[31].nodeId, 'wide-child-32', 'last retained child');
});

await fixture('unknown ID returns found false', () => {
  const missing = record(makeHarness().api.get(['unknown-id']), 'unknown-id');
  equal(missing.found, false, 'not found');
  equal(missing.matchedDomains, [], 'no domains');
  equal(missing.children, [], 'no children');
});

await fixture('duplicate requested IDs preserve first occurrence only', () => {
  const result = makeHarness().api.get([Q36_NODE, ` ${Q36_NODE} `, Q39_NODE, Q36_NODE]);
  equal(result.records.map((item) => item.requestedId), [Q36_NODE, Q39_NODE], 'deduplicated order');
});

await fixture('more than 32 normalized unique IDs are capped', () => {
  const ids = Array.from({ length: 40 }, (_unused, index) => `unknown-${index + 1}`);
  const result = makeHarness().api.get(ids);
  equal(result.records.length, 32, 'input cap');
  equal(result.records[31].requestedId, 'unknown-32', 'first 32 preserved');
});

await fixture('empty and non-string inputs are safely ignored', () => {
  const result = makeHarness().api.get(['', '  ', null, 42, {}, ` turn:${Q36_NODE} `]);
  equal(result.records.length, 1, 'one normalized id');
  equal(result.records[0].requestedId, Q36_NODE, 'turn prefix removed');
  equal(makeHarness().api.get(null).records.length, 0, 'non-array ignored');
});

await fixture('missing graph reports graph-unavailable', () => {
  const result = makeHarness({ retained: null }).api.get([Q36_NODE]);
  equal(result.available, false, 'unavailable');
  equal(result.reason, 'graph-unavailable', 'reason');
  equal(result.scope, null, 'no scope');
  equal(result.records[0].found, false, 'record remains missing');

  const authorityUnavailable = makeHarness({ authoritative: false }).api.get([Q36_NODE]);
  equal(authorityUnavailable.available, false, 'authority unavailable');
  equal(authorityUnavailable.reason, 'authority-unavailable', 'authority reason');
  equal(authorityUnavailable.records[0].found, false, 'authority absence serves no identity');
});

await fixture('stale graph reports graph-stale', () => {
  const result = makeHarness({ route: { routeKey: `${ROUTE_KEY}/changed` } }).api.get([Q36_NODE]);
  equal(result.available, false, 'unavailable');
  equal(result.reason, 'graph-stale', 'reason');
  equal(result.records[0].found, false, 'no stale identity served');
});

await fixture('current scope is bounded and content-free', () => {
  const result = makeHarness().api.get([]);
  equal(result.scope, {
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation: 7,
    fingerprint: 'djb2:graph-current',
    graphCurrentNodeId: 'assistant-node-39',
    graphNodeCount: 49,
  }, 'scope');
});

await fixture('every returned object and array is deeply frozen', () => {
  assertDeepFrozen(makeHarness().api.get([Q36_NODE, Q36_MESSAGE, 'wide-parent']));
});

await fixture('mutation attempts throw or have no effect', () => {
  const result = makeHarness().api.get([Q36_NODE]);
  const before = JSON.stringify(result);
  let threw = false;
  try { result.records.push({}); } catch { threw = true; }
  ok(threw || result.records.length === 1, 'array immutable');
  try { result.records[0].nodeId = 'changed'; } catch {}
  equal(JSON.stringify(result), before, 'result unchanged');
});

await fixture('returned values never alias retained graph objects', () => {
  const harness = makeHarness();
  const result = harness.api.get([Q36_NODE]);
  const raw = harness.identityGraph.nodes.find((node) => node.nodeId === Q36_NODE);
  ok(result !== harness.retained, 'result not retained wrapper');
  ok(result.records[0] !== raw, 'record not raw node');
  ok(result.records[0].parent !== harness.identityGraph.nodes[0], 'parent not raw node');
  ok(result.records[0].children[0] !== harness.identityGraph.nodes[2], 'child not raw node');
});

await fixture('recursive forbidden-key audit passes', () => {
  const result = makeHarness().api.get([Q36_NODE, A73, 'tool-node', 'stale-off-path']);
  const forbidden = /^(text|prompt|assistantText|markdown|html|content|contentParts|parts|attachments|images|filenames|urls|citations|author|authorName|timestamp|metadata|mapping|rawGraph|graph|token|proofToken|credentials|profile|page|pageNumber|order|variantOf|graphCategory|renderedOrdinal|nativeTestId|selectedPath)$/i;
  const violations = recursiveKeys(result).filter((key) => forbidden.test(key));
  equal(violations, [], 'no forbidden keys');
});

await fixture('message content and metadata blobs are not exposed', () => {
  const harness = makeHarness();
  const serialized = JSON.stringify(harness.api.get([Q36_NODE, Q36_MESSAGE]));
  equal(serialized.includes('must-never-leak'), false, 'private wrapper state excluded');
  equal(serialized.includes('content'), false, 'content key excluded');
  equal(serialized.includes('metadata'), false, 'metadata key excluded');
});

await fixture('canonical effective and selected-path state remain byte-identical', () => {
  const harness = makeHarness();
  const before = JSON.stringify(harness.state);
  harness.api.get([Q36_NODE, Q36_MESSAGE, A73]);
  equal(JSON.stringify(harness.state), before, 'state unchanged');
});

await fixture('storage writes remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.storageWrites, 0, 'storage writes');
});

await fixture('cache writes remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.cacheWrites, 0, 'cache writes');
});

await fixture('preference writes remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.preferenceWrites, 0, 'preference writes');
});

await fixture('alias writes remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.aliasWrites, 0, 'alias writes');
});

await fixture('network requests remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.networkCalls, 0, 'network calls');
});

await fixture('timers RAF and observers remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.timeoutCalls, 0, 'timeouts');
  equal(harness.safety.intervalCalls, 0, 'intervals');
  equal(harness.safety.rafCalls, 0, 'rafs');
  equal(harness.safety.observerCalls, 0, 'observers');
});

await fixture('navigation and scrolling remain zero', () => {
  const harness = makeHarness();
  harness.api.get([Q36_NODE]);
  equal(harness.safety.navigationCalls, 0, 'navigation');
  equal(harness.safety.scrollCalls, 0, 'scrolling');
  const source = extractFunction(CORE_SOURCE, 'getGraphIdentityDiagnostics');
  equal(/navigate|scroll|requestMount|campaign|fetch\s*\(/.test(source), false, 'no movement or network source');
});

await fixture('unchanged runtime getters remain byte-identical while projection is behaviorally compatible', () => {
  const existing = [
    'getSelectedPathAcquisitionStatus',
    'getEffectivePresentationIndex',
    'getEffectivePresentationStatus',
    'getEffectiveTurnRecordByQId',
    'getEffectiveTurnRecordByAId',
    'getConversationTurnIndexDiagnostics',
  ];
  for (const name of existing) {
    equal(extractFunction(CORE_SOURCE, name), extractFunction(BASE_SOURCE, name), `${name} unchanged`);
  }
  const base = runProjection(BASE_PROJECTION_SOURCE).result;
  const current = runProjection(CURRENT_PROJECTION_SOURCE).result;
  assertProjectionCompatibility(current, base);
  const legacyConsumerView = Object.fromEntries(Object.keys(base).map((key) => [key, current[key]]));
  equal(legacyConsumerView, base, 'consumers that ignore additive fields retain their exact view');
  ok(CURRENT_PROJECTION_SOURCE !== BASE_PROJECTION_SOURCE, 'obsolete whole-function byte pin is intentionally not restored');
  ok(CORE_SOURCE.includes('getGraphIdentityDiagnostics,'), 'one additive runtime export');
  const changedProductionPaths = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'diff', '--name-only', BASE_COMMIT, '--', 'src-runtime-base'],
    { cwd: ROOT, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean);
  equal(changedProductionPaths.includes(CORE_REL), true, 'accepted graph owner remains in the production chain');
});

await fixture('projection expansion diagnostics are immutable additive state', () => {
  const requiredPageNums = [2, 3];
  const lease = { secret: 'mutable-lease-must-not-escape' };
  const { result, state } = runProjection(CURRENT_PROJECTION_SOURCE, {
    branchExpansionState: 'pending',
    branchExpansionReason: 'native-page-head-absent',
    branchExpansionPriorCount: 18,
    branchExpansionTargetCount: 64,
    branchExpansionExpectedFingerprint: 'djb2:target-64',
    branchExpansionRequiredPageNums: requiredPageNums,
    branchExpansionLease: lease,
    branchExpansionTimeoutTask: { id: 1 },
    branchExpansionRetryTask: { id: 2 },
  });
  equal(result.branchExpansionPending, true, 'pending state is explicit');
  equal(result.branchExpansionFailClosed, false, 'pending is distinct from fail closed');
  equal(result.branchExpansionState, 'pending', 'state is copied');
  equal(result.branchExpansionReason, 'native-page-head-absent', 'reason is copied');
  equal(result.branchExpansionPriorCount, 18, 'prior count is scalar');
  equal(result.branchExpansionTargetCount, 64, 'target count is scalar');
  equal(result.branchExpansionExpectedFingerprint, 'djb2:target-64', 'target fingerprint is scalar');
  equal(result.branchExpansionRequiredPageNums, [2, 3], 'required pages are copied');
  ok(Object.isFrozen(result), 'projection result is deeply frozen');
  ok(Object.isFrozen(result.branchExpansionRequiredPageNums), 'required-page copy is frozen');
  ok(result.branchExpansionRequiredPageNums !== requiredPageNums, 'required-page array does not alias state');
  ok(result.branchExpansionRequiredPageNums !== state.branchExpansionRequiredPageNums, 'required-page array does not alias retained state');
  for (const forbidden of ['branchExpansionLease', 'branchExpansionTimeoutTask', 'branchExpansionRetryTask', 'controller', 'callback', 'domNode']) {
    equal(Object.hasOwn(result, forbidden), false, `${forbidden} is not exposed`);
  }
  equal(JSON.stringify(result).includes('mutable-lease-must-not-escape'), false, 'mutable lease content is absent');
});

await fixture('projection neutral and fail-closed states remain stable and distinguishable', () => {
  const neutral = runProjection(CURRENT_PROJECTION_SOURCE).result;
  equal(neutral.branchExpansionPending, false, 'neutral pending is false');
  equal(neutral.branchExpansionFailClosed, false, 'neutral fail closed is false');
  equal(neutral.branchExpansionState, 'idle', 'neutral state is idle');
  equal(neutral.branchExpansionReason, null, 'neutral reason is null');
  equal(neutral.branchExpansionPriorCount, 0, 'neutral prior count is zero');
  equal(neutral.branchExpansionTargetCount, 0, 'neutral target count is zero');
  equal(neutral.branchExpansionExpectedFingerprint, null, 'neutral fingerprint is null');
  equal(neutral.branchExpansionRequiredPageNums, [], 'neutral required pages are empty');
  const failed = runProjection(CURRENT_PROJECTION_SOURCE, {
    branchExpansionState: 'fail-closed',
    branchExpansionReason: 'native-page-head-conflict',
    branchExpansionPriorCount: 18,
    branchExpansionTargetCount: 39,
    branchExpansionExpectedFingerprint: 'djb2:target-39',
    branchExpansionRequiredPageNums: [2],
  }).result;
  equal(failed.branchExpansionPending, false, 'fail closed is not pending');
  equal(failed.branchExpansionFailClosed, true, 'fail closed is explicit');
  equal(failed.branchExpansionState, 'fail-closed', 'terminal state is preserved');
  equal(failed.branchExpansionReason, 'native-page-head-conflict', 'terminal reason is preserved');
});

await fixture('projection compatibility mutations are killed', () => {
  const base = runProjection(BASE_PROJECTION_SOURCE).result;
  mutationKilled(() => {
    const mutant = CURRENT_PROJECTION_SOURCE.replace('      memoryOnly: true,\n', '');
    assertProjectionCompatibility(runProjection(mutant).result, base);
  }, 'remove old projection field');
  mutationKilled(() => {
    const mutant = CURRENT_PROJECTION_SOURCE.replace('      memoryOnly: true,', '      memoryOnly: false,');
    assertProjectionCompatibility(runProjection(mutant).result, base);
  }, 'change old projection field value');
  mutationKilled(() => {
    const mutant = CURRENT_PROJECTION_SOURCE.replace(
      '      branchExpansionPending:',
      '      branchExpansionLease: completeTurnIndexAuthorityState.branchExpansionLease,\n      branchExpansionPending:',
    );
    const result = runProjection(mutant, { branchExpansionLease: { mutable: true } }).result;
    equal(Object.hasOwn(result, 'branchExpansionLease'), false, 'mutable lease remains private');
  }, 'expose mutable lease');
  mutationKilled(() => {
    const mutant = CURRENT_PROJECTION_SOURCE.replace(
      `      branchExpansionRequiredPageNums: Object.freeze(\n        Array.from(completeTurnIndexAuthorityState.branchExpansionRequiredPageNums || []),\n      ),`,
      '      branchExpansionRequiredPageNums: completeTurnIndexAuthorityState.branchExpansionRequiredPageNums,',
    );
    const execution = runProjection(mutant, { branchExpansionRequiredPageNums: [2] });
    ok(
      execution.result.branchExpansionRequiredPageNums !== execution.state.branchExpansionRequiredPageNums,
      'required pages remain an immutable copy rather than retained state',
    );
  }, 'expose mutable required-page array');
  mutationKilled(() => {
    const mutant = CURRENT_PROJECTION_SOURCE.replace(
      "completeTurnIndexAuthorityState.branchExpansionState === 'fail-closed'",
      "completeTurnIndexAuthorityState.branchExpansionState === 'pending'",
    );
    const result = runProjection(mutant, { branchExpansionState: 'fail-closed' }).result;
    equal(result.branchExpansionFailClosed, true, 'fail-closed remains distinct');
  }, 'collapse pending and fail-closed state');
  mutationKilled(() => {
    const mutant = CURRENT_PROJECTION_SOURCE.replace(
      '      branchExpansionReason: completeTurnIndexAuthorityState.branchExpansionReason,\n',
      '',
    );
    for (const key of EXPANSION_FIELDS) equal(Object.hasOwn(runProjection(mutant).result, key), true, `${key} remains additive`);
  }, 'remove additive projection field');
  mutationKilled(() => {
    equal(CURRENT_PROJECTION_SOURCE, BASE_PROJECTION_SOURCE, 'obsolete byte-identical projection pin');
  }, 'restore obsolete byte-identical pin');
});

const failures = fixtures.filter((item) => !item.ok);
for (const item of fixtures) {
  if (item.ok) console.log(`PASS ${item.name}`);
  else console.error(`FAIL ${item.name}\n${item.error}`);
}
console.log(`Fixtures: ${fixtures.length - failures.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
console.log('Safety counters: storage=0 cache=0 preference=0 alias=0 network=0 timers=0 observers=0 navigation=0 scrolling=0');
if (failures.length) process.exitCode = 1;
