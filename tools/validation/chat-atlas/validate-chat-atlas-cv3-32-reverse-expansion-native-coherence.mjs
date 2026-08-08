#!/usr/bin/env node
// CV-3.32 — inert native page-head coherence (Stage 2C-2gA).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const CORE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const MINI_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
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
const CORE_SOURCE = H2O_CORE_AGGREGATE_SOURCES
  .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  .join('\n');
// The chat page's structural implementation moved out of MiniMap Core into
// 0C3a Chat Page Structure Engine, so the MiniMap source read here is that
// file plus the engine the code now lives in. No assertion below is altered:
// positive checks and by-name function extraction still find the code, and
// negative checks get strictly stronger, because a forbidden pattern must now
// be absent from both files instead of from MiniMap Core alone.
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const MINI_SOURCE = `${fs.readFileSync(path.join(ROOT, MINI_PATH), 'utf8')}\n${STRUCTURE_SOURCE}`;

const fixtures = [];
let assertions = 0;
function ok(value, message) { assertions += 1; assert.ok(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }
async function fixture(name, run) {
  try {
    await run();
    fixtures.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    fixtures.push({ name, ok: false, error });
    console.log(`FAIL ${name}`);
  }
}

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function extractConstDeclaration(source, name) {
  const anchor = `  const ${name} =`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`const-anchor-invalid:${name}`);
  }
  const end = source.indexOf(';', start);
  if (end < 0) throw new Error(`const-boundary-invalid:${name}`);
  return source.slice(start, end + 1);
}

const TURN_NUMBER_SOURCE = extractFunction(SOURCE, 'turnNumberOfSection');
const STATUS_IDENTITY_SOURCE = extractFunction(SOURCE, 'collapsedBoundaryStatusIdentity');
const SLOT_IDENTITY_SOURCE = extractFunction(SOURCE, 'nativeTurnSlotMountedIdentity');
const FROZEN_COHERENCE_SOURCE = extractFunction(SOURCE, 'frozenNativePageHeadCoherence');
const PAGE_HEAD_SOURCE = extractFunction(SOURCE, 'resolveNativePageHeadCoherence');
const SEQUENCE_SOURCE = extractFunction(SOURCE, 'resolveNativeTurnSlotSequence');
const EXPANSION_TIMING_SOURCE = [
  extractConstDeclaration(CORE_SOURCE, 'CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS'),
  extractConstDeclaration(CORE_SOURCE, 'CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS'),
].join('\n');

class TurnSection {
  constructor(ordinal, role, id, { excluded = false } = {}) {
    this.nodeType = 1;
    this.isConnected = true;
    this.excluded = excluded;
    this.attrs = new Map([
      ['data-testid', `conversation-turn-${String(ordinal)}`],
      ['data-turn', String(role || '')],
      ['data-turn-id', String(id || '')],
    ]);
  }
  getAttribute(name) { return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null; }
  closest(selector) {
    return this.excluded && String(selector).includes('chat-page-title-list-synth') ? {} : null;
  }
  setAttribute() { throw new Error('dom-mutation:setAttribute'); }
  removeAttribute() { throw new Error('dom-mutation:removeAttribute'); }
  appendChild() { throw new Error('dom-mutation:appendChild'); }
  remove() { throw new Error('dom-mutation:remove'); }
}

function recordsForCount(count = 39) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `a-${index + 1}`,
    answerId: `a-${index + 1}`,
    questionId: `q-${index + 1}`,
    turnId: `turn-${index + 1}`,
    aliasIds: [],
    turnNo: index + 1,
    type: 'answer',
  }));
}

function modelForCount(count = 39, coherent = true) {
  const members = recordsForCount(count);
  const pages = [];
  for (let pageNo = 1; pageNo <= Math.ceil(count / 25); pageNo += 1) {
    const startOrder = ((pageNo - 1) * 25) + 1;
    const endOrder = Math.min(count, pageNo * 25);
    pages.push({
      pageNo,
      startOrder,
      endOrder,
      turnRecords: members.slice(startOrder - 1, endOrder),
    });
  }
  return {
    source: 'canonical',
    count,
    pageSize: 25,
    pageCount: pages.length,
    coherent,
    pages: coherent ? pages : [],
  };
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`mutation-anchor-missing:${label}`);
  return source.replace(before, after);
}

function makeHarness(options = {}, sources = {}) {
  const count = Number(options.count ?? 39);
  const status = {
    source: 'canonical',
    overlayActive: false,
    count,
    canonicalFingerprint: 'fp-native-page-head',
    chatId: 'chat-native-page-head',
    routeKey: '/c/chat-native-page-head',
    generation: 7,
  };
  const model = options.modelUnavailable === true
    ? modelForCount(count, false)
    : modelForCount(count, true);
  const sections = [];
  const add = (ordinal, role, id) => sections.push(new TurnSection(ordinal, role, id));
  if (options.userActual !== null) add(51, 'user', options.userActual ?? 'q-26');
  if (options.assistantActual !== null) add(52, 'assistant', options.assistantActual ?? 'a-26');
  for (const section of options.extraSections || []) sections.push(section);
  const safety = {
    domMutations: 0,
    statusWrites: 0,
    scrolls: 0,
    navigations: 0,
    refreshes: 0,
    timers: 0,
    rafs: 0,
    observers: 0,
    network: 0,
  };
  const runtime = options.authorityUnavailable === true ? null : {
    getEffectivePresentationStatus: () => Object.freeze({ ...status }),
  };
  const sandbox = {
    injectedRuntime: runtime,
    injectedModel: model,
    injectedSections: sections,
    injectedSafety: safety,
    console,
    setTimeout() { safety.timers += 1; throw new Error('timer'); },
    setInterval() { safety.timers += 1; throw new Error('interval'); },
    requestAnimationFrame() { safety.rafs += 1; throw new Error('raf'); },
    MutationObserver: class {
      constructor() { safety.observers += 1; throw new Error('observer'); }
    },
    fetch() { safety.network += 1; throw new Error('network'); },
    location: Object.freeze({ assign() { safety.navigations += 1; throw new Error('navigation'); } }),
  };
  vm.createContext(sandbox);
  new vm.Script(`
    const TITLE_LIST_PAGE_SIZE = 25;
    const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
    const TITLE_LIST_SYNTH_SEL = '[data-cgxui="chat-page-title-list-synth"]';
    const TITLE_LIST_EFFECTIVE_METHOD = Object.freeze({ STATUS: 'getEffectivePresentationStatus' });
    const document = Object.freeze({
      querySelectorAll(selector) {
        if (selector !== TURN_HOST_SEL) throw new Error('unexpected-dom-query:' + selector);
        return injectedSections.slice();
      },
      documentElement: Object.freeze({
        setAttribute() { injectedSafety.statusWrites += 1; throw new Error('status-write'); },
      }),
    });
    const window = Object.freeze({
      scrollTo() { injectedSafety.scrolls += 1; throw new Error('scroll'); },
      scrollBy() { injectedSafety.scrolls += 1; throw new Error('scroll'); },
    });
    const TURN_RUNTIME = () => injectedRuntime;
    const buildTitleListPresentationPageModel = () => injectedModel;
    const getTurnHostRole = (section) => String(section?.getAttribute?.('data-turn') || '').trim().toLowerCase();
    ${TURN_NUMBER_SOURCE}
    ${STATUS_IDENTITY_SOURCE}
    ${sources.slotIdentity || SLOT_IDENTITY_SOURCE}
    ${sources.frozen || FROZEN_COHERENCE_SOURCE}
    ${sources.resolver || PAGE_HEAD_SOURCE}
    globalThis.__api = Object.freeze({
      resolve: resolveNativePageHeadCoherence,
      slotIdentity: nativeTurnSlotMountedIdentity,
    });
  `, { filename: `${PAGE_PATH}:native-page-head` }).runInContext(sandbox);
  const membersByOrder = new Map([[26, modelForCount(39).pages[1].turnRecords[0]]]);
  return { api: sandbox.__api, sections, status, model, safety, membersByOrder };
}

function sequenceAdmissionBlock(sequenceSource = SEQUENCE_SOURCE) {
  const startMarker = 'const mountedIdentity = nativeTurnSlotMountedIdentity';
  const endMarker = 'exactMounted.push({ section, identity });';
  const start = sequenceSource.indexOf(startMarker);
  const end = sequenceSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('sequence-admission-block-unavailable');
  return sequenceSource.slice(start, end + endMarker.length);
}

function runSequenceAdmission(identity, sequenceSource = SEQUENCE_SOURCE) {
  const sandbox = { injectedIdentity: identity };
  vm.createContext(sandbox);
  return new vm.Script(`(() => {
    const exactMounted = [];
    const seenNativeOrdinals = new Set();
    const membersByOrder = new Map();
    const expectedSlotCount = 78;
    const nativeTurnSlotMountedIdentity = () => injectedIdentity;
    const fail = (reason) => { throw new Error(reason); };
    for (const section of [Object.freeze({})]) {
      ${sequenceAdmissionBlock(sequenceSource)}
    }
    return exactMounted.map((entry) => entry.identity);
  })()`, { filename: `${PAGE_PATH}:sequence-admission` }).runInContext(sandbox);
}

function mutationKilled(run, stillValid, label) {
  let survived = false;
  try { survived = stillValid(run()); } catch {}
  ok(!survived, `${label} is killed`);
}

const EXPANSION_FUNCTIONS = [
  'chatAtlasCompleteIndexFingerprint',
  'chatAtlasBranchExpansionRequiredPageNums',
  'chatAtlasBranchReturnPathMembers',
  'chatAtlasBranchReturnPathIdentity',
  'chatAtlasCaptureBranchReturnCandidate',
  'chatAtlasGraphReturnCandidateScopeCurrent',
  'chatAtlasPreExpansionCanonicalReturnWindow',
  'chatAtlasRealBranchExpansionTargetValidation',
  'chatAtlasBranchExpansionFailureRecord',
  'chatAtlasClearBranchExpansionTimers',
  'chatAtlasResetBranchExpansionLifecycle',
  'chatAtlasBranchExpansionLeaseCurrent',
  'chatAtlasClearTrustedIntentForExpansion',
  'chatAtlasFailClosedPreExpansionReturn',
  'chatAtlasBranchExpansionStaleCheckpoint',
  'chatAtlasFinishBranchExpansion',
  'chatAtlasThreadPagesControllerApi',
  'chatAtlasEvaluateNativePageHeadsForExpansion',
  'chatAtlasScheduleBranchExpansionConvergence',
  'chatAtlasEnsureBranchExpansionTimeout',
  'chatAtlasCompleteBranchExpansionCheckpoint',
  'chatAtlasRecheckFailedBranchExpansion',
  'chatAtlasOpenBranchExpansion',
  'chatAtlasBranchExpansionRebuildSnapshot',
  'chatAtlasCurrentTrustedNativeBranchSelection',
];

function expansionRows(count, { selected = false } = {}) {
  return Object.freeze(Array.from({ length: count }, (_value, index) => Object.freeze({
    order: index + 1,
    qId: index === 0 ? 'q-anchor' : `q-expansion-${index + 1}`,
    primaryAId: index === 0
      ? (selected ? 'a-prior' : 'a-target')
      : `a-expansion-${index + 1}`,
    noAnswer: false,
    stopped: false,
    answerVariants: Object.freeze(index === 0
      ? (selected ? ['a-target', 'a-prior'] : ['a-prior', 'a-target'])
      : [`a-expansion-${index + 1}`]),
  })));
}

function expansionFingerprint(turns) {
  const identity = turns.map((turn) => [
    String(turn?.qId || ''),
    String(turn?.primaryAId || ''),
    ...(turn?.answerVariants || []).map((id) => String(id || '')),
    turn?.noAnswer === true ? 'no-answer:1' : 'no-answer:0',
    turn?.stopped === true ? 'stopped:1' : 'stopped:0',
  ]);
  let hash = 5381;
  for (const char of JSON.stringify(identity)) hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
  return `djb2:${Math.abs(hash >>> 0).toString(36)}`;
}

function makeExpansionHarness(options = {}, sourceOverrides = {}) {
  const clock = { now: Number(options.now || 1000) };
  const targetRows = expansionRows(39);
  const overlayRows = expansionRows(19, { selected: true });
  const targetFingerprint = expansionFingerprint(targetRows);
  const overlayFingerprint = expansionFingerprint(overlayRows);
  const graphPathMembers = Object.freeze(targetRows.map((turn) => Object.freeze({
    order: turn.order,
    qId: turn.qId,
    primaryAId: turn.primaryAId,
    noAnswer: turn.noAnswer,
  })));
  const graphPathIdentity = (() => {
    let hash = 5381;
    const raw = JSON.stringify(graphPathMembers.map((turn) => [
      turn.order,
      turn.qId,
      turn.primaryAId,
      turn.noAnswer,
    ]));
    for (const char of raw) hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
    return `djb2:${Math.abs(hash >>> 0).toString(36)}`;
  })();
  const timers = [];
  let timerSequence = 0;
  const safety = {
    refreshCalls: 0,
    staleCallbacks: 0,
    clearStaleCalls: 0,
    notifications: 0,
    navigations: 0,
    scrolls: 0,
    domMutations: 0,
    localRuntimeReads: 0,
    sharedRuntimeReads: 0,
  };
  const traces = [];
  const pageStates = new Map([[2, String(options.page2State || 'absent')]]);
  const localPageStates = new Map([[2, String(options.localPage2State || 'conflict')]]);
  const state = {
    enabled: true,
    chatId: 'chat-reverse-expansion',
    routeKey: '/c/chat-reverse-expansion',
    generation: 7,
    branchSelectionStale: true,
    branchSelectionStaleRevision: 3,
    branchSelectionStaleQId: 'q-anchor',
    branchSelectionStaleChatId: 'chat-reverse-expansion',
    branchSelectionStaleRouteKey: '/c/chat-reverse-expansion',
    branchSelectionStaleGeneration: 7,
    trustedSelectedPathIntent: Object.freeze({
      token: 'token-1',
      qId: 'q-anchor',
      chatId: 'chat-reverse-expansion',
      routeKey: '/c/chat-reverse-expansion',
      generation: 7,
      staleRevision: 3,
      observedAt: Number(options.now || 1000),
      priorEffectiveCount: options.preExpansion === true ? 19 : 18,
      priorEffectiveFingerprint: options.preExpansion === true ? overlayFingerprint : 'fp-18',
      returnTargetCandidate: options.preExpansion === true ? Object.freeze({
        classification: 'expanding',
        reason: 'graph-derived-expanding-return',
        targetVariantAnswerId: 'a-target',
        graphCaptureIdentity: 'graph-capture-1',
        graphCapturedAt: '2026-08-03T00:00:00.000Z',
        derivedTargetCount: 39,
        derivedPathIdentity: graphPathIdentity,
        derivedPathMembers: graphPathMembers,
        priorPresentationSource: 'selected-path-overlay',
      }) : null,
    }),
    branchExpansionLease: null,
    branchExpansionTimeoutTask: null,
    branchExpansionRetryTask: null,
    branchExpansionFailure: null,
    branchExpansionState: 'idle',
    branchExpansionReason: null,
    branchExpansionAnchorReturned: false,
    branchExpansionPriorCount: 0,
    branchExpansionPriorFingerprint: '',
    branchExpansionTargetCount: 0,
    branchExpansionExpectedFingerprint: '',
    branchExpansionRequiredPageNums: Object.freeze([]),
    branchExpansionSequence: 0,
  };
  const targetIndex = Object.freeze({
    chatId: state.chatId,
    complete: true,
    proof: 'host-payload-full-graph',
    sourceFingerprint: targetFingerprint,
    turns: targetRows,
  });
  const priorHostIndex = Object.freeze({
    chatId: state.chatId,
    complete: true,
    proof: 'host-payload-full-graph',
    sourceFingerprint: overlayFingerprint,
    turns: overlayRows,
  });
  const overlayIndex = Object.freeze({
    chatId: state.chatId,
    complete: true,
    proof: 'selected-path-overlay',
    sourceFingerprint: overlayFingerprint,
    turns: overlayRows,
  });
  const indexState = { current: options.preExpansion === true ? priorHostIndex : targetIndex };
  const selectedPathOverlayState = {
    status: options.preExpansion === true ? 'active' : 'idle',
    token: options.preExpansion === true ? 'token-1' : '',
    anchorQId: options.preExpansion === true ? 'q-anchor' : '',
    chatId: options.preExpansion === true ? state.chatId : '',
    routeKey: options.preExpansion === true ? state.routeKey : '',
    generation: options.preExpansion === true ? state.generation : 0,
    staleRevision: options.preExpansion === true ? state.branchSelectionStaleRevision : 0,
    canonicalFingerprint: options.preExpansion === true ? priorHostIndex.sourceFingerprint : '',
    index: options.preExpansion === true ? overlayIndex : null,
    byQId: options.preExpansion === true ? new Map([['q-anchor', Object.freeze({ order: 1 })]]) : null,
    byAId: options.preExpansion === true ? new Map() : null,
    proof: options.preExpansion === true ? Object.freeze({ exact: true }) : null,
  };
  const setTimeoutStub = (fn, delay) => {
    const entry = { id: ++timerSequence, fn, delay: Number(delay || 0), cleared: false };
    timers.push(entry);
    return entry.id;
  };
  const clearTimeoutStub = (id) => {
    const entry = timers.find((item) => item.id === id);
    if (entry) entry.cleared = true;
  };
  class FakeDate extends Date { static now() { return clock.now; } }
  let controllerThrows = options.controllerThrows === true;
  const controllerApi = options.controllerMissingResolver === true
    ? {}
    : {
      resolveNativePageHeadCoherence(pageNum) {
        if (controllerThrows) throw new TypeError('private-message-must-not-escape');
        return Object.freeze({ state: String(pageStates.get(Number(pageNum)) || 'unavailable') });
      },
    };
  const localControllerApi = {
    resolveNativePageHeadCoherence(pageNum) {
      return Object.freeze({ state: String(localPageStates.get(Number(pageNum)) || 'unavailable') });
    },
  };
  const topH2O = {};
  const localH2O = {};
  const topWindow = {};
  if (options.topRuntimeThrows === true) {
    Object.defineProperty(topWindow, 'H2O', {
      get() {
        safety.sharedRuntimeReads += 1;
        throw new DOMException('cross-origin-private-state', 'SecurityError');
      },
    });
  } else {
    Object.defineProperty(topWindow, 'H2O', {
      get() { safety.sharedRuntimeReads += 1; return topH2O; },
    });
  }
  const publishController = () => {
    const targetH2O = options.sameRuntime === true ? localH2O : topH2O;
    targetH2O.ChatPageTitleIntent = { api: controllerApi };
    return controllerApi;
  };
  if (options.controllerPublished !== false && options.topRuntimeThrows !== true) publishController();
  const W = {
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
  };
  Object.defineProperty(W, 'H2O', {
    configurable: true,
    get() { safety.localRuntimeReads += 1; return localH2O; },
  });
  if (options.topGetterThrows === true) {
    Object.defineProperty(W, 'top', {
      get() { throw new DOMException('cross-origin-private-state', 'SecurityError'); },
    });
  } else {
    W.top = options.sameRuntime === true ? W : topWindow;
  }
  if (options.localController === true) {
    localH2O.ChatPageTitleIntent = { api: localControllerApi };
  }
  const sandbox = {
    injectedState: state,
    injectedTargetIndex: targetIndex,
    injectedIndexState: indexState,
    injectedOverlayIndex: overlayIndex,
    injectedSelectedPathOverlayState: selectedPathOverlayState,
    injectedSafety: safety,
    injectedTraces: traces,
    W,
    document: Object.freeze({ readyState: 'complete' }),
    Date: FakeDate,
    console,
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
  };
  vm.createContext(sandbox);
  const functionSource = EXPANSION_FUNCTIONS.map((name) => (
    sourceOverrides[name] || extractFunction(CORE_SOURCE, name)
  )).join('\n');
  new vm.Script(`
    const CHAT_ATLAS_PAGE_SIZE = 25;
    const chatAtlasBranchTransactionCurrent = () => null;
    const chatAtlasOpenBranchTransaction = () => null;
    const chatAtlasCloseBranchTransaction = () => false;
    const chatAtlasBranchTransactionTrace = () => {};

    ${options.timingSource || EXPANSION_TIMING_SOURCE}
    const COMPLETE_TURN_INDEX_REFRESH_LIMITS = Object.freeze({ trustedSelectionWindowMs: 5000 });
    const completeTurnIndexAuthorityState = injectedState;
    const selectedPathOverlayState = injectedSelectedPathOverlayState;
    const selectedPathAcquisitionState = {
      token: '',
      refetchAttemptedForToken: '',
      refetchActiveForToken: '',
      anchorQId: '',
      chatId: '',
      routeKey: '',
      generation: 0,
      staleRevision: 0,
      graph: injectedState.trustedSelectedPathIntent?.returnTargetCandidate ? Object.freeze({
        chatId: injectedState.chatId,
        routeKey: injectedState.routeKey,
        generation: injectedState.generation,
        captureIdentity: 'graph-capture-1',
        identityGraph: Object.freeze({ valid: true }),
      }) : null,
    };
    const completeIndexRefreshCoordinator = Object.freeze({
      selectedPathRequestOwnsIntent: () => false,
    });
    const chatAtlasFullIndexRoute = () => ({ chatId: injectedState.chatId, routeKey: injectedState.routeKey });
    const chatAtlasCompleteIndexIdentity = (value) => String(value || '').trim().replace(/^turn:/i, '');
    const chatAtlasCompleteIndexCode = (value, fallback) => String(value || fallback || '');
    const chatAtlasCompleteIndexStableHash = (value) => {
      let hash = 5381;
      for (const char of String(value || '')) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
      return hash.toString(36);
    };
    const chatAtlasIdentityGraphValid = (graph) => graph?.valid === true;
    const chatAtlasDeriveSelectedPath = () => Object.freeze({
      ok: true,
      path: injectedTargetIndex.turns,
    });
    const chatAtlasCanonicalPresentationIndex = () => injectedIndexState.current;
    const chatAtlasSelectedPathOverlayCurrent = () => selectedPathOverlayState.status === 'active'
      && selectedPathOverlayState.index === injectedOverlayIndex
      && selectedPathOverlayState.token === String(injectedState.trustedSelectedPathIntent?.token || selectedPathOverlayState.token)
      && selectedPathOverlayState.anchorQId === String(injectedState.branchSelectionStaleQId || '')
      && selectedPathOverlayState.chatId === injectedState.chatId
      && selectedPathOverlayState.routeKey === injectedState.routeKey
      && selectedPathOverlayState.generation === injectedState.generation
      && selectedPathOverlayState.staleRevision === injectedState.branchSelectionStaleRevision
      && selectedPathOverlayState.canonicalFingerprint === injectedIndexState.current.sourceFingerprint;
    const getEffectivePresentationIndex = () => chatAtlasSelectedPathOverlayCurrent()
      ? selectedPathOverlayState.index
      : injectedTargetIndex;
    const chatAtlasClearSelectedPathAcquisition = () => true;
    const chatAtlasTraceTrustedLifecycle = (event, details) => {
      injectedTraces.push(Object.freeze({ event: String(event || ''), details: Object.freeze({ ...(details || {}) }) }));
      return true;
    };
    const chatAtlasNotifyCompleteIndexState = () => { injectedSafety.notifications += 1; };
    const chatAtlasClearBranchSelectionStale = () => {
      injectedSafety.clearStaleCalls += 1;
      injectedState.branchSelectionStale = false;
      injectedState.branchSelectionStaleQId = null;
      injectedState.branchSelectionStaleChatId = null;
      injectedState.branchSelectionStaleRouteKey = '';
      injectedState.branchSelectionStaleGeneration = 0;
      selectedPathOverlayState.status = 'idle';
      selectedPathOverlayState.index = null;
      return true;
    };
    function refreshCompleteTurnIndexProjection() {
      injectedSafety.refreshCalls += 1;
      return Promise.resolve().then(() => chatAtlasCompleteBranchExpansionCheckpoint(
        'explicit-refresh-complete',
        { allowConfirmation: true },
      ));
    }
    ${functionSource}
    globalThis.__api = Object.freeze({
      ${EXPANSION_FUNCTIONS.join(', ')},
      state: completeTurnIndexAuthorityState,
    });
  `, { filename: `${CORE_PATH}:branch-expansion` }).runInContext(sandbox);

  const api = sandbox.__api;
  const intent = state.trustedSelectedPathIntent;
  return {
    api, state, safety, timers, clock, pageStates, localPageStates, intent, targetIndex,
    overlayIndex, selectedPathOverlayState,
    traces, topWindow, publishController,
    setControllerThrows(value) { controllerThrows = value === true; },
    open() { return api.chatAtlasOpenBranchExpansion(intent, targetIndex); },
    captureCandidate() {
      return api.chatAtlasCaptureBranchReturnCandidate({
        token: 'token-1',
        qId: 'q-anchor',
        priorAnswerId: 'a-prior',
        direction: 'previous',
        chatId: state.chatId,
        routeKey: state.routeKey,
        generation: state.generation,
        staleRevision: state.branchSelectionStaleRevision,
        priorEffectiveCount: 19,
        priorEffectiveFingerprint: overlayIndex.sourceFingerprint,
        priorPresentationSource: 'retained-selected-path-graph',
      }, overlayIndex);
    },
    currentIntent() { return api.chatAtlasCurrentTrustedNativeBranchSelection('q-anchor'); },
    returnWindow() { return api.chatAtlasPreExpansionCanonicalReturnWindow(state.trustedSelectedPathIntent); },
    installTarget() { indexState.current = targetIndex; return targetIndex; },
    handoff() {
      indexState.current = targetIndex;
      const current = state.trustedSelectedPathIntent;
      const validation = api.chatAtlasRealBranchExpansionTargetValidation(
        current,
        targetIndex,
        current?.returnTargetCandidate,
      );
      return validation.ok ? api.chatAtlasOpenBranchExpansion(current, targetIndex) : null;
    },
    recover(reason = 'explicit-refresh-later-confirmation') {
      indexState.current = targetIndex;
      return api.chatAtlasRecheckFailedBranchExpansion(reason);
    },
    advance(ms) { clock.now += Number(ms || 0); },
    checkpoint(allowConfirmation = false, reason = 'test-checkpoint') {
      return api.chatAtlasCompleteBranchExpansionCheckpoint(reason, { allowConfirmation });
    },
    activeTimers() { return timers.filter((entry) => !entry.cleared); },
    async fireDelay(delay) {
      const entry = timers.find((item) => !item.cleared && item.delay === delay);
      if (!entry) throw new Error(`timer-unavailable:${delay}`);
      entry.cleared = true;
      clock.now += delay;
      entry.fn();
      await Promise.resolve();
      await Promise.resolve();
      return entry;
    },
  };
}

function makeMiniExpansionCoherenceHarness(options = {}, sourceOverride = '') {
  const projection = Object.freeze({
    branchExpansionPending: options.pending === true,
    branchExpansionFailClosed: options.failClosed === true,
    branchExpansionExpectedFingerprint: 'fp-39',
    branchExpansionRequiredPageNums: Object.freeze([2]),
  });
  const sandbox = {
    injectedProjection: projection,
    injectedPageState: String(options.pageState || 'match'),
    console,
  };
  vm.createContext(sandbox);
  new vm.Script(`
    const getEffectivePresentationRuntimeStatus = () => Object.freeze({
      effectiveCount: 39,
      effectiveFingerprint: 'fp-39',
    });
    const getCompleteIndexProjectionStatus = () => injectedProjection;
    const getChatPagesControllerApi = () => Object.freeze({
      resolveNativePageHeadCoherence: () => Object.freeze({ state: injectedPageState }),
    });
    ${sourceOverride || extractFunction(MINI_SOURCE, 'chatPageUnitPresentationCoherence')}
    ${options.transitionSource || extractFunction(MINI_SOURCE, 'chatPageUnitBranchTransitionActive')}
    globalThis.__api = Object.freeze({
      coherence: chatPageUnitPresentationCoherence,
      transition: chatPageUnitBranchTransitionActive,
    });
  `, { filename: `${MINI_PATH}:branch-expansion-gate` }).runInContext(sandbox);
  return sandbox.__api;
}

await fixture('1 exact page-head identities match coherently', () => {
  const result = makeHarness().api.resolve(2);
  equal(result.state, 'match', 'overall match');
  equal(result.coherent, true, 'coherent true');
  equal(result.convergenceEligible, false, 'match does not converge');
  equal(result.user.state, 'match', 'user matches');
  equal(result.assistant.state, 'match', 'assistant matches');
  equal(result.user.actualId, 'q-26', 'user actual identity');
  equal(result.assistant.actualId, 'a-26', 'assistant actual identity');
  ok(Object.isFrozen(result) && Object.isFrozen(result.user) && Object.isFrozen(result.assistant), 'result deeply frozen');
});

await fixture('2 user conflict remains observable', () => {
  const result = makeHarness({ userActual: 'wrong-user' }).api.resolve(2);
  equal(result.user.state, 'conflict', 'user conflict');
  equal(result.user.expectedId, 'q-26', 'expected user retained');
  equal(result.user.actualId, 'wrong-user', 'actual user retained');
  equal(result.state, 'conflict', 'overall conflict');
  equal(result.coherent, false, 'conflict incoherent');
});

await fixture('3 assistant conflict remains observable', () => {
  const result = makeHarness({ assistantActual: 'wrong-assistant' }).api.resolve(2);
  equal(result.assistant.state, 'conflict', 'assistant conflict');
  equal(result.assistant.expectedId, 'a-26', 'expected assistant retained');
  equal(result.assistant.actualId, 'wrong-assistant', 'actual assistant retained');
  equal(result.state, 'conflict', 'overall conflict');
});

await fixture('4 both exact slots absent are convergence eligible', () => {
  const result = makeHarness({ userActual: null, assistantActual: null }).api.resolve(2);
  equal(result.user.state, 'absent', 'user absent');
  equal(result.assistant.state, 'absent', 'assistant absent');
  equal(result.state, 'absent', 'overall absent');
  equal(result.coherent, false, 'absent incoherent');
  equal(result.convergenceEligible, true, 'absent may converge later');
});

await fixture('5 matching user with absent assistant stays absent', () => {
  const result = makeHarness({ assistantActual: null }).api.resolve(2);
  equal(result.user.state, 'match', 'user match');
  equal(result.assistant.state, 'absent', 'assistant absent');
  equal(result.state, 'absent', 'one role is insufficient');
});

await fixture('6 matching assistant with absent user stays absent', () => {
  const result = makeHarness({ userActual: null }).api.resolve(2);
  equal(result.user.state, 'absent', 'user absent');
  equal(result.assistant.state, 'match', 'assistant match');
  equal(result.state, 'absent', 'one role is insufficient');
});

await fixture('7 unavailable authority or page model never becomes coherent', () => {
  for (const options of [{ authorityUnavailable: true }, { modelUnavailable: true }]) {
    const result = makeHarness(options).api.resolve(2);
    equal(result.state, 'unavailable', 'unavailable state');
    equal(result.coherent, false, 'never coherent');
    equal(result.convergenceEligible, false, 'not convergence eligible');
  }
});

await fixture('8 exact pair match ignores unrelated virtualization', () => {
  const harness = makeHarness();
  equal(harness.sections.length, 2, 'only the exact pair is mounted');
  const result = harness.api.resolve(2);
  equal(result.state, 'match', 'unrelated absent wrappers do not matter');
  equal(result.userOrdinal, 51, 'Page 2 user ordinal');
  equal(result.assistantOrdinal, 52, 'Page 2 assistant ordinal');
});

await fixture('9 elsewhere identity cannot override an exact-slot conflict', () => {
  const elsewhere = new TurnSection(53, 'user', 'q-26');
  const result = makeHarness({ userActual: 'wrong-user', extraSections: [elsewhere] }).api.resolve(2);
  equal(result.user.state, 'conflict', 'exact ordinal owns classification');
  equal(result.state, 'conflict', 'elsewhere match is rejected');
});

await fixture('10 native sequence skips a conflicting discriminated result', () => {
  const harness = makeHarness({ userActual: 'wrong-user' });
  const identity = harness.api.slotIdentity(harness.sections[0], harness.membersByOrder, 78);
  equal(identity.state, 'conflict', 'slot result is conflict');
  equal(identity.match, false, 'slot result is not accepted');
  equal(runSequenceAdmission(identity).length, 0, 'production sequence caller skips it');
});

await fixture('11 fully matching sequence admission preserves legacy output', () => {
  const harness = makeHarness();
  const identity = harness.api.slotIdentity(harness.sections[0], harness.membersByOrder, 78);
  const admitted = runSequenceAdmission(identity);
  equal(admitted.length, 1, 'matching result admitted once');
  equal(Object.keys(admitted[0]), ['ordinal', 'order', 'role', 'id', 'testId'], 'legacy identity shape preserved');
  equal({ ...admitted[0] }, {
    ordinal: 51,
    order: 26,
    role: 'user',
    id: 'q-26',
    testId: 'conversation-turn-51',
  }, 'legacy identity values preserved');
});

await fixture('12 resolver is exported and has zero side effects', () => {
  const harness = makeHarness();
  equal(harness.api.resolve(2).state, 'match', 'read succeeds');
  equal(harness.safety, {
    domMutations: 0,
    statusWrites: 0,
    scrolls: 0,
    navigations: 0,
    refreshes: 0,
    timers: 0,
    rafs: 0,
    observers: 0,
    network: 0,
  }, 'all prohibited effects remain zero');
  ok(SOURCE.includes('      resolveNativePageHeadCoherence,'), 'resolver exported through controller API');
  ok(!/setTimeout|setInterval|requestAnimationFrame|MutationObserver|scrollTo|scrollBy/.test(PAGE_HEAD_SOURCE), 'resolver contains no scheduler or scrolling surface');
});

await fixture('13 mutation collapsing conflict to null is killed', () => {
  const mutant = replaceRequired(
    SLOT_IDENTITY_SOURCE,
    '    return Object.freeze({',
    '    if (!match) return null;\n    return Object.freeze({',
    'conflict-null',
  );
  mutationKilled(
    () => makeHarness({ userActual: 'wrong-user' }, { slotIdentity: mutant }).api.resolve(2),
    (result) => result.state === 'conflict',
    'conflict-null mutation',
  );
});

await fixture('14 mutation admitting match false into the sequence is killed', () => {
  const mutant = replaceRequired(
    SEQUENCE_SOURCE,
    'if (mountedIdentity?.match !== true) continue;',
    'if (!mountedIdentity) continue;',
    'sequence-match-false',
  );
  const harness = makeHarness({ userActual: 'wrong-user' });
  const identity = harness.api.slotIdentity(harness.sections[0], harness.membersByOrder, 78);
  mutationKilled(
    () => runSequenceAdmission(identity, mutant),
    (result) => result.length === 0,
    'sequence match:false mutation',
  );
});

await fixture('15 mutation treating user conflict as absence is killed', () => {
  const mutant = replaceRequired(
    PAGE_HEAD_SOURCE,
    "user.state === 'conflict'",
    "user.state === 'absent'",
    'user-conflict-absence',
  );
  mutationKilled(
    () => makeHarness({ userActual: 'wrong-user' }, { resolver: mutant }).api.resolve(2),
    (result) => result.state === 'conflict',
    'user conflict-as-absence mutation',
  );
});

await fixture('16 mutation treating assistant conflict as absence is killed', () => {
  const mutant = replaceRequired(
    PAGE_HEAD_SOURCE,
    "assistant.state === 'conflict'",
    "assistant.state === 'absent'",
    'assistant-conflict-absence',
  );
  mutationKilled(
    () => makeHarness({ assistantActual: 'wrong-assistant' }, { resolver: mutant }).api.resolve(2),
    (result) => result.state === 'conflict',
    'assistant conflict-as-absence mutation',
  );
});

await fixture('17 mutation allowing one matching role is killed', () => {
  const original = `: ((user.state === 'absent' || assistant.state === 'absent')
        ? 'absent'
        : ((user.state === 'match' && assistant.state === 'match') ? 'match' : 'unavailable'));`;
  const mutant = replaceRequired(
    PAGE_HEAD_SOURCE,
    original,
    `: ((user.state === 'match' || assistant.state === 'match') ? 'match' : 'unavailable');`,
    'single-role-match',
  );
  mutationKilled(
    () => makeHarness({ assistantActual: null }, { resolver: mutant }).api.resolve(2),
    (result) => result.state === 'absent',
    'single matching role mutation',
  );
});

await fixture('18 mutation requiring every wrapper mounted is killed', () => {
  const mutant = replaceRequired(
    PAGE_HEAD_SOURCE,
    '    if (!sections) return unavailable();',
    '    if (!sections || sections.length !== expectedSlotCount) return unavailable();',
    'all-wrappers-mounted',
  );
  mutationKilled(
    () => makeHarness({}, { resolver: mutant }).api.resolve(2),
    (result) => result.state === 'match',
    'all wrappers mounted mutation',
  );
});

await fixture('19 mutation accepting the expected identity elsewhere is killed', () => {
  const mutant = replaceRequired(
    PAGE_HEAD_SOURCE,
    '    const classify = (ordinal, expectedId) => {',
    `    const classify = (ordinal, expectedId) => {
      const elsewhere = sections.find((section) => String(section?.getAttribute?.('data-turn-id') || '').trim() === expectedId);
      if (elsewhere) return { state: 'match', expectedId, actualId: expectedId, ordinal };`,
    'elsewhere-identity',
  );
  const elsewhere = new TurnSection(53, 'user', 'q-26');
  mutationKilled(
    () => makeHarness(
      { userActual: 'wrong-user', extraSections: [elsewhere] },
      { resolver: mutant },
    ).api.resolve(2),
    (result) => result.state === 'conflict',
    'elsewhere identity mutation',
  );
});

await fixture('20 mutation scheduling resolver work is killed', () => {
  const mutant = replaceRequired(
    PAGE_HEAD_SOURCE,
    '  function resolveNativePageHeadCoherence(pageNum = 0) {',
    '  function resolveNativePageHeadCoherence(pageNum = 0) {\n    setTimeout(() => {}, 0);',
    'scheduled-work',
  );
  mutationKilled(
    () => makeHarness({}, { resolver: mutant }).api.resolve(2),
    (result) => result.state === 'match',
    'scheduled-work mutation',
  );
});

await fixture('21 contracting 39 to 18 keeps the established anchor-clear path', () => {
  const h = makeExpansionHarness();
  equal(Array.from(h.api.chatAtlasBranchExpansionRequiredPageNums(39, 18)), [], 'no newly introduced page');
  equal(h.state.branchExpansionLease, null, 'no expansion lease opens');
  equal(h.activeTimers().length, 0, 'no convergence timer opens');
  const anchor = extractFunction(CORE_SOURCE, 'chatAtlasClearBranchSelectionStaleOnCanonicalReturn');
  ok(anchor.indexOf('if (targetCount > priorCount)') < anchor.indexOf('chatAtlasClearBranchSelectionStale(checkpoint'), 'only expansion intercepts the old clear');
});

await fixture('22 expanding anchor return is provisional and cannot clear alone', () => {
  const h = makeExpansionHarness({ page2State: 'match' });
  const lease = h.open();
  ok(lease, '18 to 39 opens a lease');
  equal(Array.from(lease.requiredPageNums), [2], 'only newly introduced Page 2 is required');
  h.checkpoint(false, 'native-anchor-returned');
  equal(h.state.branchExpansionState, 'pending', 'matching anchor remains provisional');
  equal(h.state.branchSelectionStale, true, 'trusted transition remains active');
  equal(h.safety.clearStaleCalls, 0, 'anchor alone never clears');
});

await fixture('23 Page 2 conflict blocks Core and MiniMap containment', () => {
  const h = makeExpansionHarness({ page2State: 'conflict' });
  h.open();
  h.checkpoint(false);
  equal(h.state.branchExpansionState, 'fail-closed', 'Core publishes fail-closed');
  equal(h.state.branchExpansionReason, 'native-page-head-conflict', 'conflict reason retained');
  equal(h.state.branchExpansionLease, null, 'active retry lease is cleaned');
  const mini = makeMiniExpansionCoherenceHarness({ failClosed: true, pageState: 'conflict' });
  equal(mini.coherence({ count: 39 }).reason, 'native-page-head-conflict', 'MiniMap distinguishes native conflict');
  equal(mini.transition(), true, 'fail-closed containment remains active');
});

await fixture('24 either exact role conflict is a positive page-head conflict', () => {
  equal(makeHarness({ userActual: 'wrong-q' }).api.resolve(2).state, 'conflict', 'user conflict');
  equal(makeHarness({ assistantActual: 'wrong-a' }).api.resolve(2).state, 'conflict', 'assistant conflict');
  const mini = makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'conflict' });
  equal(mini.coherence({ count: 39 }).coherent, false, 'neither conflict can settle MiniMap');
});

await fixture('25 absent Page 2 head stays pending and schedules bounded convergence', () => {
  const h = makeExpansionHarness({ page2State: 'absent' });
  h.open();
  h.checkpoint(false);
  equal(h.state.branchExpansionState, 'pending', 'pending remains active');
  equal(h.state.branchExpansionReason, 'native-page-head-absent', 'absence is explicit');
  equal(h.activeTimers().filter((timer) => timer.delay === 250).length, 1, 'first attempt is scheduled at 250ms');
  equal(h.safety.clearStaleCalls, 0, 'absence cannot settle');
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'absent' }).coherence({ count: 39 }).reason, 'native-page-head-absent', 'MiniMap distinguishes absence');
});

await fixture('26 exact Page 2 head confirmation clears only at refresh completion', async () => {
  const h = makeExpansionHarness({ page2State: 'absent' });
  h.open();
  h.checkpoint(false);
  h.pageStates.set(2, 'match');
  await h.fireDelay(250);
  equal(h.safety.refreshCalls, 1, 'one narrow refresh ran');
  equal(h.state.branchExpansionState, 'confirmed', 'approved completion confirms');
  equal(h.state.branchExpansionLease, null, 'lease cleaned');
  equal(h.state.branchExpansionRetryTask, null, 'retry cleaned');
  equal(h.state.branchExpansionTimeoutTask, null, 'timeout cleaned');
  equal(h.state.branchSelectionStale, false, 'trusted transition clears after confirmation');
});

await fixture('27 post-confirmation virtualization does not reopen containment', () => {
  const mini = makeMiniExpansionCoherenceHarness({ pageState: 'absent' });
  equal(mini.coherence({ count: 39 }).coherent, true, 'inactive expansion ignores offscreen disappearance');
  equal(mini.transition(), false, 'confirmed/inactive transition remains closed');
  const coherence = extractFunction(MINI_SOURCE, 'chatPageUnitPresentationCoherence');
  ok(!/querySelector|allWrappers|everyWrapper/.test(coherence), 'no all-wrapper requirement exists');
});

await fixture('28 positive conflict schedules no retry and retains keyed failure', () => {
  const h = makeExpansionHarness({ page2State: 'conflict' });
  h.open();
  h.checkpoint(false);
  equal(h.state.branchExpansionState, 'fail-closed', 'failure state published');
  equal(h.state.branchExpansionFailure?.expectedFingerprint, h.targetIndex.sourceFingerprint, 'failure remains presentation keyed');
  equal(h.activeTimers().length, 0, 'all timers stopped');
  equal(h.safety.refreshCalls, 0, 'conflict never refreshes');
});

await fixture('29 lease timeout ends active work but preserves containment', async () => {
  const h = makeExpansionHarness({ page2State: 'match' });
  h.open();
  h.checkpoint(false);
  await h.fireDelay(8000);
  equal(h.state.branchExpansionState, 'fail-closed', 'timeout is terminal fail-closed');
  equal(h.state.branchExpansionReason, 'timeout', 'timeout reason retained');
  equal(h.state.branchExpansionLease, null, 'active lease ended');
  ok(h.state.branchExpansionFailure, 'keyed containment failure survives');
  equal(h.activeTimers().length, 0, 'timeout leaves no work');
});

await fixture('30 absent campaign performs exactly three attempts and no fourth', async () => {
  const h = makeExpansionHarness({ page2State: 'absent' });
  h.open();
  h.checkpoint(false);
  await h.fireDelay(250);
  await h.fireDelay(750);
  await h.fireDelay(1750);
  equal(h.safety.refreshCalls, 3, 'exactly three coordinator refreshes');
  equal(h.state.branchExpansionState, 'fail-closed', 'attempt exhaustion is terminal');
  equal(h.state.branchExpansionReason, 'attempts-exhausted', 'attempt limit reason');
  equal(h.activeTimers().length, 0, 'no fourth timer remains');
});

await fixture('31 stale callback from a superseded lease is inert', () => {
  const h = makeExpansionHarness({ page2State: 'absent' });
  h.open();
  h.checkpoint(false);
  const staleCallback = h.timers.find((timer) => timer.delay === 250)?.fn;
  ok(typeof staleCallback === 'function', 'old retry captured');
  h.api.chatAtlasResetBranchExpansionLifecycle('newer-trusted-capture');
  h.pageStates.set(2, 'match');
  const current = h.open();
  staleCallback();
  equal(h.state.branchExpansionLease?.key, current.key, 'current lease identity preserved');
  equal(h.safety.refreshCalls, 0, 'stale callback requests no refresh');
  equal(current.attemptCount, 0, 'stale callback cannot mutate attempts');
});

await fixture('32 route generation or newer capture removes old failure and timers', () => {
  const h = makeExpansionHarness({ page2State: 'conflict' });
  h.open();
  h.checkpoint(false);
  ok(h.state.branchExpansionFailure, 'failure established');
  h.api.chatAtlasResetBranchExpansionLifecycle('route-changed');
  equal(h.state.branchExpansionState, 'idle', 'lifecycle reset returns idle');
  equal(h.state.branchExpansionFailure, null, 'old failure removed');
  equal(h.state.branchExpansionLease, null, 'old lease removed');
  equal(h.activeTimers().length, 0, 'old timers cancelled');
});

await fixture('33 successful later confirmation clears matching fail-closed state', () => {
  const h = makeExpansionHarness({ page2State: 'conflict' });
  h.open();
  h.checkpoint(false);
  h.pageStates.set(2, 'match');
  equal(h.api.chatAtlasRecheckFailedBranchExpansion('later-native-confirmation'), true, 'matching presentation is rechecked');
  equal(h.state.branchExpansionState, 'confirmed', 'later exact proof confirms');
  equal(h.state.branchExpansionFailure, null, 'matching failure cleared');
});

await fixture('34 projection publishes immutable expansion containment fields', () => {
  const status = extractFunction(CORE_SOURCE, 'getCompleteTurnIndexProjectionStatus');
  for (const field of [
    'branchExpansionPending', 'branchExpansionFailClosed', 'branchExpansionState',
    'branchExpansionReason', 'branchExpansionPriorCount', 'branchExpansionTargetCount',
    'branchExpansionExpectedFingerprint', 'branchExpansionRequiredPageNums',
  ]) ok(status.includes(field), `${field} published`);
  ok(status.includes('Object.freeze('), 'required page numbers are copied immutably');
});

await fixture('35 MiniMap settles only after both containment and native proof clear', () => {
  const pending = makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'match' });
  equal(pending.coherence({ count: 39 }).coherent, true, 'exact head itself is coherent');
  equal(pending.transition(), true, 'pending lease still prevents settlement');
  const confirmed = makeMiniExpansionCoherenceHarness({ pageState: 'absent' });
  equal(confirmed.coherence({ count: 39 }).coherent, true, 'ordinary post-confirm virtualization allowed');
  equal(confirmed.transition(), false, 'normal settlement can resume');
  ok(MINI_SOURCE.includes("'data-h2o-page-unit-ordering-count',\n            '0'"), 'withdrawal publishes ordering count zero');
});

await fixture('36 mutation allowing anchor-only expansion clear is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasClearBranchSelectionStaleOnCanonicalReturn');
  const mutant = replaceRequired(
    source,
    '        return true;\n      }\n    }\n    const checkpoint',
    '        void lease;\n      }\n    }\n    const checkpoint',
    'anchor-only-clear',
  );
  const invariant = (value) => value.includes('return true;\n      }\n    }\n    const checkpoint');
  ok(invariant(source), 'parent has provisional return');
  ok(!invariant(mutant), 'anchor-only clear mutant killed');
});

await fixture('37 mutation reducing MiniMap to index-only coherence is killed', () => {
  const source = extractFunction(MINI_SOURCE, 'chatPageUnitPresentationCoherence');
  const mutant = replaceRequired(source, '    if (requiredPageNums.length) {', '    if (false && requiredPageNums.length) {', 'index-only');
  const result = makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'conflict' }, mutant).coherence({ count: 39 });
  equal(result.coherent, true, 'mutant incorrectly accepts index-only coherence');
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'conflict' }).coherence({ count: 39 }).coherent, false, 'production kills mutant');
});

await fixture('38 mutations accepting conflict or absence as settled are killed', () => {
  const source = extractFunction(MINI_SOURCE, 'chatPageUnitPresentationCoherence');
  const conflictMutant = replaceRequired(
    source,
    "        if (headState === 'conflict') {\n          return { coherent: false, reason: 'native-page-head-conflict', modelCount, authorityCount };\n        }",
    "        if (headState === 'conflict') continue;",
    'conflict-coherent',
  );
  const absentMutant = replaceRequired(
    source,
    "        if (headState === 'absent') {\n          return { coherent: false, reason: 'native-page-head-absent', modelCount, authorityCount };\n        }",
    "        if (headState === 'absent') continue;",
    'absent-settled',
  );
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'conflict' }, conflictMutant).coherence({ count: 39 }).coherent, true, 'conflict mutant observable');
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'absent' }, absentMutant).coherence({ count: 39 }).coherent, true, 'absence mutant observable');
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'conflict' }).coherence({ count: 39 }).coherent, false, 'conflict killed');
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'absent' }).coherence({ count: 39 }).coherent, false, 'absence killed');
});

await fixture('39 mutation permitting a fourth convergence attempt is killed', async () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasScheduleBranchExpansionConvergence');
  const mutant = replaceRequired(
    source,
    '    if (lease.attemptCount >= CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length) {',
    '    if (lease.attemptCount > CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length) {',
    'fourth-attempt',
  );
  const h = makeExpansionHarness({ page2State: 'absent' }, {
    chatAtlasScheduleBranchExpansionConvergence: mutant,
  });
  h.open();
  h.checkpoint(false);
  await h.fireDelay(250);
  await h.fireDelay(750);
  await h.fireDelay(1750);
  equal(h.state.branchExpansionState, 'pending', 'mutant incorrectly remains pending');
  ok(h.activeTimers().some((timer) => timer.delay === 0), 'mutant schedules a fourth undefined-delay retry');
  const production = makeExpansionHarness({ page2State: 'absent' });
  production.open(); production.checkpoint(false);
  await production.fireDelay(250); await production.fireDelay(750); await production.fireDelay(1750);
  equal(production.state.branchExpansionState, 'fail-closed', 'production kills fourth attempt');
});

await fixture('40 lifecycle source has no navigation, scrolling, windowing or all-wrapper campaign', () => {
  const bodies = EXPANSION_FUNCTIONS.map((name) => extractFunction(CORE_SOURCE, name)).join('\n');
  for (const forbidden of [
    'scrollTo', 'scrollBy', 'navigate', 'click(', 'MutationObserver', 'setInterval',
    'requestAnimationFrame', 'windowing', 'unmount', 'querySelectorAll',
  ]) ok(!bodies.includes(forbidden), `expansion lifecycle excludes ${forbidden}`);
  ok(bodies.includes("refreshCompleteTurnIndexProjection('branch-expansion-convergence')"), 'uses the existing narrow refresh coordinator');
});

await fixture('41 mutation allowing a stale retry callback to mutate the current lease is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasScheduleBranchExpansionConvergence');
  const mutant = replaceRequired(
    source,
    '      if (!current || current.key !== key || !chatAtlasBranchExpansionLeaseCurrent(current)) return;',
    '      if (!current || !chatAtlasBranchExpansionLeaseCurrent(current)) return;',
    'stale-callback-key',
  );
  const h = makeExpansionHarness({ page2State: 'absent' }, {
    chatAtlasScheduleBranchExpansionConvergence: mutant,
  });
  h.open(); h.checkpoint(false);
  const staleCallback = h.timers.find((timer) => timer.delay === 250).fn;
  h.api.chatAtlasResetBranchExpansionLifecycle('superseded');
  h.open();
  staleCallback();
  equal(h.safety.refreshCalls, 1, 'mutant refreshes the wrong lease');
  const production = makeExpansionHarness({ page2State: 'absent' });
  production.open(); production.checkpoint(false);
  const safeCallback = production.timers.find((timer) => timer.delay === 250).fn;
  production.api.chatAtlasResetBranchExpansionLifecycle('superseded');
  production.open(); safeCallback();
  equal(production.safety.refreshCalls, 0, 'production kills stale callback');
});

await fixture('42 mutation dropping fail-closed containment at timeout is killed', async () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasFinishBranchExpansion');
  const mutant = replaceRequired(
    source,
    "    completeTurnIndexAuthorityState.branchExpansionFailure = outcomeCode === 'fail-closed' ? summary : null;",
    '    completeTurnIndexAuthorityState.branchExpansionFailure = null;',
    'timeout-containment',
  );
  const h = makeExpansionHarness({ page2State: 'match' }, {
    chatAtlasFinishBranchExpansion: mutant,
  });
  h.open(); h.checkpoint(false); await h.fireDelay(8000);
  equal(h.state.branchExpansionState, 'fail-closed', 'mutant still ends active lease');
  equal(h.state.branchExpansionFailure, null, 'mutant loses containment proof');
  const production = makeExpansionHarness({ page2State: 'match' });
  production.open(); production.checkpoint(false); await production.fireDelay(8000);
  ok(production.state.branchExpansionFailure, 'production preserves containment');
});

await fixture('43 mutation retaining failure across lifecycle reset is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasResetBranchExpansionLifecycle');
  const mutant = replaceRequired(
    source,
    '    completeTurnIndexAuthorityState.branchExpansionFailure = null;',
    '    void completeTurnIndexAuthorityState.branchExpansionFailure;',
    'failure-survives-route',
  );
  const h = makeExpansionHarness({ page2State: 'conflict' }, {
    chatAtlasResetBranchExpansionLifecycle: mutant,
  });
  h.open(); h.checkpoint(false); h.api.chatAtlasResetBranchExpansionLifecycle('route-changed');
  ok(h.state.branchExpansionFailure, 'mutant leaks failure across route reset');
  const production = makeExpansionHarness({ page2State: 'conflict' });
  production.open(); production.checkpoint(false); production.api.chatAtlasResetBranchExpansionLifecycle('route-changed');
  equal(production.state.branchExpansionFailure, null, 'production kills leaked failure');
});

await fixture('44 mutation settling while confirmation is pending is killed', () => {
  const source = extractFunction(MINI_SOURCE, 'chatPageUnitBranchTransitionActive');
  const mutant = replaceRequired(
    source,
    '      || projection.branchExpansionPending === true\n',
    '',
    'settlement-before-confirmation',
  );
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'match', transitionSource: mutant }).transition(), false, 'mutant settles early');
  equal(makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'match' }).transition(), true, 'production blocks early settlement');
});

await fixture('45 bounded campaign source kills unbounded retry mutation', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasScheduleBranchExpansionConvergence');
  const mutant = source
    .replace('lease.attemptCount >= CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length', 'false')
    .replace('(Date.now() + delay) > lease.deadlineAt', 'false');
  ok(mutant !== source, 'unbounded mutant applied');
  ok(!mutant.includes('lease.attemptCount >= CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length'), 'mutant drops attempt bound');
  ok(!mutant.includes('(Date.now() + delay) > lease.deadlineAt'), 'mutant drops lease bound');
  ok(source.includes('lease.attemptCount >= CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length'), 'production retains attempt bound');
  ok(source.includes('(Date.now() + delay) > lease.deadlineAt'), 'production retains deadline bound');
});

await fixture('46 mutation retaining stale ordering count is killed', () => {
  const reconcile = extractFunction(MINI_SOURCE, 'reconcileChatPageUnits');
  const mutant = replaceRequired(
    reconcile,
    "            'data-h2o-page-unit-ordering-count',\n            '0',",
    "            'data-h2o-page-unit-ordering-count',\n            String(model.pageCount),",
    'stale-ordering-count',
  );
  ok(mutant.includes('String(model.pageCount)'), 'stale-count mutant applied');
  ok(!mutant.includes("'data-h2o-page-unit-ordering-count',\n            '0'"), 'mutant is detected');
  ok(reconcile.includes("'data-h2o-page-unit-ordering-count',\n            '0'"), 'production kills stale count');
});

await fixture('47 Core resolves the controller from the shared top runtime', () => {
  const h = makeExpansionHarness({ page2State: 'match' });
  const lookup = h.api.chatAtlasThreadPagesControllerApi();
  equal(lookup.state, 'ready', 'shared lookup is ready');
  equal(lookup.source, 'shared', 'shared runtime is authoritative');
  equal(lookup.controller, h.topWindow.H2O.ChatPageTitleIntent.api, 'shared controller is returned');
  h.open();
  h.checkpoint(true, 'top-runtime-confirmation');
  equal(h.state.branchExpansionState, 'confirmed', 'top-only controller completes native confirmation');
  ok(SOURCE.includes('TOPW.H2O.ChatPageTitleIntent.api = api;'), '1C1b production publication remains pinned to TOPW');
});

await fixture('48 controller absence is temporary and bounded independently of document readiness', async () => {
  const h = makeExpansionHarness({ controllerPublished: false, page2State: 'match' });
  h.open();
  h.checkpoint(false, 'controller-not-yet-published');
  equal(h.state.branchExpansionState, 'pending', 'temporary loader-order gap stays pending');
  equal(h.state.branchExpansionReason, 'controller-initializing', 'temporary reason is explicit');
  equal(h.activeTimers().filter((timer) => timer.delay === 250).length, 1, 'existing first convergence attempt is scheduled');
  equal(h.activeTimers().filter((timer) => timer.delay === 8000).length, 1, 'existing lease timeout bounds initialization');
  h.publishController();
  await h.fireDelay(250);
  equal(h.state.branchExpansionState, 'confirmed', 'published top controller confirms at bounded completion');
  equal(h.activeTimers().length, 0, 'successful confirmation cleans temporary work');
});

await fixture('49 an installed API missing the resolver fails closed', () => {
  const h = makeExpansionHarness({ controllerMissingResolver: true });
  h.open();
  h.checkpoint(false, 'controller-contract-invalid');
  equal(h.state.branchExpansionState, 'fail-closed', 'invalid installed API is not treated as temporary');
  equal(h.state.branchExpansionReason, 'controller-unavailable', 'permanent controller reason retained');
  equal(h.activeTimers().length, 0, 'permanent API failure schedules no retry');
});

await fixture('50 mutation resolving only the local runtime is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasThreadPagesControllerApi');
  const mutant = replaceRequired(
    source,
    `    let topWindow = null;\n    try { topWindow = W?.top || W; } catch {}\n    if (topWindow === W) return readRuntime(W, 'shared');\n    if (topWindow) {\n      const shared = readRuntime(topWindow, 'shared');\n      if (shared.state === 'ready' || shared.state === 'structurally-incomplete') return shared;\n      const local = readRuntime(W, 'local');\n      if (local.state === 'ready' || local.state === 'structurally-incomplete') return local;\n      return shared.state === 'runtime-access-failure' ? shared : local;\n    }\n    const local = readRuntime(W, 'local');\n    return local.state === 'temporarily-unpublished'\n      ? Object.freeze({ state: 'runtime-access-failure', source: 'shared', controller: null, resolve: null })\n      : local;`,
    `    return readRuntime(W, 'local');`,
    'local-runtime-only',
  );
  const h = makeExpansionHarness({ page2State: 'match' }, { chatAtlasThreadPagesControllerApi: mutant });
  h.open(); h.checkpoint(true);
  equal(h.state.branchExpansionState, 'pending', 'local-only mutant cannot confirm from top publication');
  equal(h.state.branchExpansionReason, 'controller-initializing', 'local-only mutant misclassifies the published controller');
  const production = makeExpansionHarness({ page2State: 'match' });
  production.open(); production.checkpoint(true);
  equal(production.state.branchExpansionState, 'confirmed', 'production kills local-only lookup');
});

await fixture('51 mutation making loader-order absence permanent is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasEvaluateNativePageHeadsForExpansion');
  const mutant = replaceRequired(
    source,
    "      const temporary = lookup.state === 'temporarily-unpublished' || lookup.state === 'runtime-access-failure';",
    '      const temporary = false;',
    'temporary-permanent',
  );
  const h = makeExpansionHarness({ controllerPublished: false }, {
    chatAtlasEvaluateNativePageHeadsForExpansion: mutant,
  });
  h.open(); h.checkpoint(false);
  equal(h.state.branchExpansionState, 'fail-closed', 'mutant terminates during loader-order gap');
  const production = makeExpansionHarness({ controllerPublished: false });
  production.open(); production.checkpoint(false);
  equal(production.state.branchExpansionState, 'pending', 'production preserves bounded initialization');
});

await fixture('52 mutation leaving temporary unavailability unbounded is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasCompleteBranchExpansionCheckpoint');
  let mutant = replaceRequired(
    source,
    '        chatAtlasEnsureBranchExpansionTimeout(lease);\n',
    '',
    'unbounded-temporary-timeout',
  );
  mutant = replaceRequired(
    mutant,
    `        chatAtlasScheduleBranchExpansionConvergence(\n          lease,\n          verdict.reason === 'native-page-head-controller-exception'\n            ? 'controller-exception-attempts-exhausted'\n            : 'attempts-exhausted',\n        );\n`,
    '',
    'unbounded-temporary-retry',
  );
  const h = makeExpansionHarness({ controllerPublished: false }, {
    chatAtlasCompleteBranchExpansionCheckpoint: mutant,
  });
  h.open(); h.checkpoint(false);
  equal(h.activeTimers().length, 0, 'mutant leaves temporary state without bounded work');
  const production = makeExpansionHarness({ controllerPublished: false });
  production.open(); production.checkpoint(false);
  equal(production.activeTimers().length, 2, 'production kills unbounded temporary handling');
});

await fixture('53 stale local controller cannot override the current shared controller', () => {
  const production = makeExpansionHarness({
    page2State: 'match',
    localController: true,
    localPage2State: 'conflict',
  });
  const lookup = production.api.chatAtlasThreadPagesControllerApi();
  equal(lookup.source, 'shared', 'shared runtime wins over stale local API');
  production.open(); production.checkpoint(true);
  equal(production.state.branchExpansionState, 'confirmed', 'current shared result confirms');

  const source = extractFunction(CORE_SOURCE, 'chatAtlasThreadPagesControllerApi');
  const mutant = replaceRequired(
    source,
    "    if (topWindow === W) return readRuntime(W, 'shared');",
    "    const staleLocal = readRuntime(W, 'local');\n    if (staleLocal.state === 'ready') return staleLocal;\n    if (topWindow === W) return readRuntime(W, 'shared');",
    'stale-local-priority',
  );
  const stale = makeExpansionHarness({
    page2State: 'match',
    localController: true,
    localPage2State: 'conflict',
  }, { chatAtlasThreadPagesControllerApi: mutant });
  stale.open(); stale.checkpoint(true);
  equal(stale.state.branchExpansionState, 'fail-closed', 'stale-local priority mutation is killed');
});

await fixture('54 inaccessible shared runtime safely falls back to the local controller', () => {
  for (const options of [
    { topGetterThrows: true },
    { topRuntimeThrows: true },
  ]) {
    const h = makeExpansionHarness({
      ...options,
      localController: true,
      localPage2State: 'match',
    });
    const lookup = h.api.chatAtlasThreadPagesControllerApi();
    equal(lookup.state, 'ready', 'local fallback remains ready');
    equal(lookup.source, 'local', 'inaccessible shared runtime uses local fallback');
    h.open(); h.checkpoint(true);
    equal(h.state.branchExpansionState, 'confirmed', 'fallback confirms without an escaped access error');
  }
});

await fixture('55 a single-frame runtime is evaluated once', () => {
  const h = makeExpansionHarness({ sameRuntime: true, page2State: 'match' });
  const lookup = h.api.chatAtlasThreadPagesControllerApi();
  equal(lookup.state, 'ready', 'single-frame lookup ready');
  equal(lookup.source, 'shared', 'single-frame runtime retains shared classification');
  equal(h.safety.localRuntimeReads, 1, 'the identical top/local runtime is read once');
  equal(h.safety.sharedRuntimeReads, 0, 'no separate top object is inspected');
});

await fixture('56 controller exception is traced safely and enters bounded temporary handling', () => {
  const h = makeExpansionHarness({ controllerThrows: true });
  h.open(); h.checkpoint(false);
  equal(h.state.branchExpansionState, 'pending', 'first controller exception remains pending');
  equal(h.state.branchExpansionReason, 'native-page-head-controller-exception', 'exception classification is distinct');
  const exceptionTraces = h.traces.filter((entry) => entry.event === 'branch-expansion-controller-exception');
  equal(exceptionTraces.length, 1, 'one private exception trace is emitted');
  equal(JSON.parse(JSON.stringify(exceptionTraces[0])), {
    event: 'branch-expansion-controller-exception',
    details: {
      subsystem: 'thread-pages-controller',
      operation: 'resolve-native-page-head-coherence',
      phase: 'branch-expansion-confirmation',
      category: 'exception',
    },
  }, 'trace contains only stable classification');
  const traceText = JSON.stringify(exceptionTraces);
  for (const forbidden of ['private-message', 'q-', 'a-', 'credential', 'stack', 'http']) {
    ok(!traceText.includes(forbidden), `trace excludes ${forbidden}`);
  }
  equal(h.activeTimers().filter((timer) => timer.delay === 250).length, 1, 'exception schedules the existing first retry');
  equal(h.activeTimers().filter((timer) => timer.delay === 8000).length, 1, 'exception remains lease bounded');
});

await fixture('57 repeated controller exceptions exhaust exactly three attempts', async () => {
  const h = makeExpansionHarness({ controllerThrows: true });
  h.open(); h.checkpoint(false);
  await h.fireDelay(250);
  await h.fireDelay(750);
  await h.fireDelay(1750);
  equal(h.safety.refreshCalls, 3, 'exactly three existing coordinator attempts run');
  equal(h.state.branchExpansionState, 'fail-closed', 'persistent exception becomes fail-closed');
  equal(h.state.branchExpansionReason, 'controller-exception-attempts-exhausted', 'terminal exception reason is distinct');
  equal(h.state.branchExpansionFailure?.reason, 'controller-exception-attempts-exhausted', 'containment retains safe reason');
  equal(h.activeTimers().length, 0, 'no fourth attempt or timeout remains');
});

await fixture('58 controller exception timeout has a distinct safe reason', async () => {
  const h = makeExpansionHarness({ controllerThrows: true });
  h.open(); h.checkpoint(false);
  await h.fireDelay(8000);
  equal(h.state.branchExpansionState, 'fail-closed', 'lease timeout remains fail-closed');
  equal(h.state.branchExpansionReason, 'controller-exception-timeout', 'timeout retains exception classification');
  equal(h.activeTimers().length, 0, 'timeout cleans retry state');
});

await fixture('59 controller-returned unavailable remains structural and immediate', () => {
  const h = makeExpansionHarness({ page2State: 'unavailable' });
  h.open(); h.checkpoint(false);
  equal(h.state.branchExpansionState, 'fail-closed', 'returned unavailable fails closed');
  equal(h.state.branchExpansionReason, 'native-page-head-unavailable', 'returned unavailable remains distinct');
  equal(h.traces.filter((entry) => entry.event === 'branch-expansion-controller-exception').length, 0, 'ordinary unavailable emits no exception trace');
  equal(h.activeTimers().length, 0, 'ordinary unavailable schedules no retry');
});

await fixture('60 harness executes and mutation-pins real production timing declarations', () => {
  ok(EXPANSION_TIMING_SOURCE.includes('CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS = 8000'), 'production lease duration extracted');
  ok(EXPANSION_TIMING_SOURCE.includes('250,\n    750,\n    1750,'), 'production delay sequence extracted');
  const production = makeExpansionHarness({ page2State: 'absent' });
  production.open(); production.checkpoint(false);
  equal(production.activeTimers().map((timer) => timer.delay).sort((a, b) => a - b), [250, 8000], 'production declarations drive harness timers');

  const durationMutant = replaceRequired(EXPANSION_TIMING_SOURCE, '= 8000;', '= 9000;', 'production-duration');
  mutationKilled(
    () => {
      const h = makeExpansionHarness({ page2State: 'absent', timingSource: durationMutant });
      h.open(); h.checkpoint(false);
      return h.activeTimers().map((timer) => timer.delay);
    },
    (delays) => delays.includes(8000),
    'production duration mutation',
  );

  const delayMutant = replaceRequired(EXPANSION_TIMING_SOURCE, '    250,', '    275,', 'production-delay');
  mutationKilled(
    () => {
      const h = makeExpansionHarness({ page2State: 'absent', timingSource: delayMutant });
      h.open(); h.checkpoint(false);
      return h.activeTimers().map((timer) => timer.delay);
    },
    (delays) => delays.includes(250),
    'production delay mutation',
  );
});

await fixture('61 mutation silencing controller-exception diagnostics is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasEvaluateNativePageHeadsForExpansion');
  const mutant = replaceRequired(
    source,
    `        try {\n          chatAtlasTraceTrustedLifecycle('branch-expansion-controller-exception', {\n            subsystem: 'thread-pages-controller',\n            operation: 'resolve-native-page-head-coherence',\n            phase: 'branch-expansion-confirmation',\n            category: 'exception',\n          });\n        } catch {}\n`,
    '',
    'silent-controller-exception',
  );
  const silent = makeExpansionHarness({ controllerThrows: true }, {
    chatAtlasEvaluateNativePageHeadsForExpansion: mutant,
  });
  silent.open(); silent.checkpoint(false);
  equal(silent.traces.filter((entry) => entry.event === 'branch-expansion-controller-exception').length, 0, 'silent mutant emits no exception trace');
  const production = makeExpansionHarness({ controllerThrows: true });
  production.open(); production.checkpoint(false);
  equal(production.traces.filter((entry) => entry.event === 'branch-expansion-controller-exception').length, 1, 'production kills silent exception handling');
});

await fixture('62 mutation allowing a controller exception to escape is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'chatAtlasEvaluateNativePageHeadsForExpansion');
  const start = source.indexOf('      try {\n        result = resolve.call(controller, pageNum) || null;');
  const end = source.indexOf("      const pageState = String(result?.state || 'unavailable');", start);
  if (start < 0 || end < 0) throw new Error('exception-catch-anchor-missing');
  const mutant = `${source.slice(0, start)}      result = resolve.call(controller, pageNum) || null;\n${source.slice(end)}`;
  const escaping = makeExpansionHarness({ controllerThrows: true }, {
    chatAtlasEvaluateNativePageHeadsForExpansion: mutant,
  });
  escaping.open();
  let escaped = false;
  try { escaping.checkpoint(false); } catch { escaped = true; }
  equal(escaped, true, 'escape mutant leaves the lifecycle');
  const production = makeExpansionHarness({ controllerThrows: true });
  production.open();
  let productionEscaped = false;
  try { production.checkpoint(false); } catch { productionEscaped = true; }
  equal(productionEscaped, false, 'production kills exception escape');
});

await fixture('63 pre-expansion selected overlay survives five seconds and hands off to native confirmation', () => {
  const h = makeExpansionHarness({ preExpansion: true, page2State: 'match' });
  const captured = h.captureCandidate();
  equal(captured.classification, 'expanding', 'real capture helper derives the retained-graph return');
  equal(captured.targetVariantAnswerId, 'a-target', 'real capture helper freezes the direction-neighbor answer');
  equal(captured.derivedTargetCount, 39, 'real capture helper derives the full sibling path');
  equal(h.returnWindow().active, true, 'strict 19-to-39 scoped return window is active');
  h.advance(6000);
  equal(h.currentIntent()?.token, 'token-1', 'trusted intent survives beyond the ordinary five-second age');
  equal(h.state.branchExpansionLease, null, 'age protection does not open the expansion lease');
  equal(h.selectedPathOverlayState.status, 'active', 'selected overlay remains current before handoff');
  equal(h.activeTimers().length, 0, 'pre-expansion ownership adds no timer');
  const lease = h.handoff();
  ok(lease, 'canonical-return evidence opens the real expansion lease');
  equal(lease.token, 'token-1', 'handoff preserves exact token ownership');
  equal(Array.from(lease.requiredPageNums), [2], 'only the newly introduced Page 2 head is inspected');
  equal(h.state.branchExpansionState, 'pending', 'handoff is provisional before native confirmation');
  h.checkpoint(true, 'explicit-refresh-complete');
  equal(h.state.branchExpansionState, 'confirmed', 'matching Page 2 head confirms at the approved checkpoint');
  equal(h.state.branchSelectionStale, false, 'confirmation releases stale containment');
  equal(h.selectedPathOverlayState.status, 'idle', 'confirmation releases the selected overlay');
  equal(h.activeTimers().length, 0, 'confirmation cleans the bounded timeout');
  equal(h.safety.domMutations, 0, 'confirmation requires no all-wrapper or DOM campaign');
});

await fixture('64 pre-expansion timeout remains fail-closed and cannot settle page units', () => {
  const h = makeExpansionHarness({ preExpansion: true, page2State: 'match' });
  h.advance(8001);
  equal(h.currentIntent(), null, 'intent expires at the exact pre-expansion bound');
  equal(h.state.branchExpansionState, 'fail-closed', 'timeout publishes containment');
  equal(h.state.branchExpansionReason, 'pre-expansion-return-target-unresolved', 'timeout reason is distinct');
  equal(h.state.branchExpansionLease, null, 'timeout opens no retry lease');
  equal(h.state.branchSelectionStale, true, 'timeout retains stale ownership');
  equal(h.selectedPathOverlayState.status, 'active', 'timeout retains the selected overlay under failure ownership');
  equal(h.state.branchExpansionFailure.targetResolved, false, 'failure records that no genuine target existed');
  equal(h.state.branchExpansionFailure.expectedFingerprint, '', 'failure fabricates no target fingerprint');
  equal(Array.from(h.state.branchExpansionFailure.requiredPageNums), [], 'failure fabricates no required pages');
  equal(h.state.branchExpansionFailure.graphDerivedTargetCount, 39, 'graph candidate count remains diagnostic only');
  equal(h.activeTimers().length, 0, 'timeout schedules no post-expiry retry');
  const gate = makeMiniExpansionCoherenceHarness({ failClosed: true, pageState: 'match' });
  equal(gate.transition(), true, 'MiniMap containment remains active despite matching index counts');
  equal(h.recover(), true, 'explicit refresh adopts the genuine target through the existing recovery seam');
  equal(h.state.branchExpansionState, 'confirmed', 'native Page 2 match confirms recovered real lease');

  const conflict = makeExpansionHarness({ preExpansion: true, page2State: 'conflict' });
  conflict.advance(8001);
  conflict.currentIntent();
  equal(conflict.recover(), true, 'explicit refresh opens the real lease before evaluating native conflict');
  equal(conflict.state.branchExpansionState, 'fail-closed', 'Page 2 conflict remains terminal after unresolved recovery');
  equal(conflict.state.branchExpansionReason, 'native-page-head-conflict', 'native conflict reason remains precise');
  equal(conflict.activeTimers().length, 0, 'native conflict schedules no retry after recovery');
});

await fixture('65 pre-expansion ownership handoff and confirmation mutations are killed', () => {
  const currentSource = extractFunction(CORE_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection');
  const noReturnOwner = replaceRequired(
    currentSource,
    'const allowedAgeMs = returnExpansionWindow.active === true',
    'const allowedAgeMs = false',
    'pre-expansion-owner',
  );
  const ownerless = makeExpansionHarness({ preExpansion: true, page2State: 'match' }, {
    chatAtlasCurrentTrustedNativeBranchSelection: noReturnOwner,
  });
  ownerless.advance(6000);
  equal(ownerless.currentIntent(), null, 'removing pre-expansion ownership expires at five seconds');
  const production = makeExpansionHarness({ preExpansion: true, page2State: 'match' });
  production.advance(6000);
  equal(production.currentIntent()?.token, 'token-1', 'production kills removed ownership mutation');

  const openSource = extractFunction(CORE_SOURCE, 'chatAtlasOpenBranchExpansion');
  const skippedOpen = openSource.replace(/\{[\s\S]*\}$/, '{ return null; }');
  const skipped = makeExpansionHarness({ preExpansion: true, page2State: 'match' }, {
    chatAtlasOpenBranchExpansion: skippedOpen,
  });
  skipped.advance(6000);
  equal(skipped.currentIntent()?.token, 'token-1', 'mutant still reaches the handoff point');
  equal(skipped.handoff(), null, 'skipped-handoff mutant opens no lease');
  ok(production.handoff(), 'production kills skipped handoff mutation');

  const pending = makeExpansionHarness({ preExpansion: true, page2State: 'absent' });
  pending.advance(6000);
  ok(pending.handoff(), 'real lease opens for absent Page 2 head');
  pending.checkpoint(false, 'explicit-refresh-complete');
  equal(pending.state.branchExpansionState, 'pending', 'absence cannot settle before Page 2 confirmation');
  const gate = makeMiniExpansionCoherenceHarness({ pending: true, pageState: 'absent' });
  equal(gate.transition(), true, 'MiniMap remains withdrawn while native confirmation is absent');
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of failed) console.error(entry.error?.stack || entry.error);
console.log(`CV-3.32 fixtures ${fixtures.length - failed.length}/${fixtures.length} assertions ${assertions}`);
if (failed.length) process.exitCode = 1;
