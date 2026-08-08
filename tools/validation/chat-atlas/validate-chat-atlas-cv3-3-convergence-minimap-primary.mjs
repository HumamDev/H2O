#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SOURCE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const SOURCE_ABS = path.join(ROOT, SOURCE_PATH);
const CHAT_KEY = 'fixture-chat-convergence-primary';
const SAMPLE_LIMIT = 12;

let assertionCount = 0;

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

function includes(values, expected, message) {
  assertionCount += 1;
  assert.ok(Array.from(values || []).includes(expected), message || `expected ${expected}`);
}

function excludes(values, expected, message) {
  assertionCount += 1;
  assert.ok(!Array.from(values || []).includes(expected), message || `did not expect ${expected}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countOccurrences(source, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function buildInstrumentedSource(source) {
  const anchors = [];
  const unique = (name, needle) => {
    const matches = countOccurrences(source, needle);
    anchors.push({ name, matches });
    if (matches !== 1) throw new Error(`instrumentation anchor ${name} matched ${matches} times`);
  };
  const setterAnchor = '  function setChatAtlasCanonicalSource(value) {\n';
  const probeAnchor = '  function getChatAtlasConvergenceParity() {\n';
  const matcherAnchor = '  function chatAtlasConvergenceMatch(entry, owners, fallbackIndex, used = null, targetLength = null) {\n';
  const semanticAnchor = '  function chatAtlasConvergenceMiniMapPrimaryMismatch(ledger, canonical, box) {\n';
  const bootstrapMarker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const bootRefresh = "  refresh('boot');";
  const bootLedger = '  startChatAtlasLedger();';
  const finalClose = '\n})();';
  const noAnswerBlocker = "blockers.push('no-answer-minimap-primary-present')";
  const answeredBlocker = "blockers.push('minimap-primary-not-member-answer')";

  unique('source-setter', setterAnchor);
  unique('convergence-probe', probeAnchor);
  unique('convergence-matcher', matcherAnchor);
  unique('primary-semantic-helper', semanticAnchor);
  unique('no-answer-blocker', noAnswerBlocker);
  unique('answered-blocker', answeredBlocker);
  unique('bootstrap-marker', bootstrapMarker);
  unique('boot-refresh', bootRefresh);
  unique('boot-ledger', bootLedger);
  if (!source.endsWith(`${finalClose}\n`) && !source.endsWith(finalClose)) {
    throw new Error('production IIFE close is not the final source token');
  }
  anchors.push({ name: 'iife-close', matches: 1 });

  let instrumented = source.replace(
    setterAnchor,
    `${setterAnchor}    globalThis.__CV33_SOURCE_SETTER_GUARD__();\n`,
  );
  const markerIndex = instrumented.indexOf(bootstrapMarker);
  const closeIndex = instrumented.lastIndexOf(finalClose);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('unable to isolate bootstrap tail');
  const removedTail = instrumented.slice(markerIndex, closeIndex);
  if (countOccurrences(removedTail, bootRefresh) !== 1 || countOccurrences(removedTail, bootLedger) !== 1) {
    throw new Error('bootstrap tail did not contain the verified boot calls');
  }

  const exports = [
    '  globalThis.__CV33_CONVERGENCE_INTERNALS__ = Object.freeze({',
    // Convergence parity and the Ledger fixture state moved to 0A3b; H2O Core
    // keeps only the generic turn seeding it still owns.
    '    setCoreFixtureState({ turns }) { turnState.turns = turns; },',
    '  });',
    '  globalThis.__CV33_BOOTSTRAP_SUPPRESSED__ = true;',
  ].join('\n');
  instrumented = `${instrumented.slice(0, markerIndex)}${exports}${finalClose}\n`;
  if (instrumented.includes(bootRefresh) || instrumented.includes(bootLedger)) {
    throw new Error('bootstrap call survived suppression');
  }
  return { instrumented, anchors };
}

function createCounters() {
  return {
    sourceSetterCalls: 0,
    navigationMutations: 0,
    domMutations: 0,
    userActions: 0,
    storageWrites: 0,
    networkCalls: 0,
    timerSchedules: 0,
    eventDispatches: 0,
    domReads: 0,
  };
}

function forbidden(counters, key, label) {
  counters[key] += 1;
  throw new Error(`forbidden side effect: ${label}`);
}

function guardedCallable(counters, key, label) {
  const fn = () => forbidden(counters, key, label);
  return new Proxy(fn, {
    apply() { return forbidden(counters, key, label); },
    construct() { return forbidden(counters, key, label); },
    get(_target, property) {
      if (property === 'then') return undefined;
      return guardedCallable(counters, key, `${label}.${String(property)}`);
    },
  });
}

function createStorage(counters, label) {
  return {
    getItem() { return null; },
    key() { return null; },
    get length() { return 0; },
    setItem() { return forbidden(counters, 'storageWrites', `${label}.setItem`); },
    removeItem() { return forbidden(counters, 'storageWrites', `${label}.removeItem`); },
    clear() { return forbidden(counters, 'storageWrites', `${label}.clear`); },
  };
}

function createElement(attributes = {}, options = {}) {
  const attrs = new Map(Object.entries(attributes).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]));
  const wrapper = options.wrapper || null;
  return {
    dataset: {},
    textContent: String(options.textContent || ''),
    classList: Array.from(options.classNames || []),
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    hasAttribute(name) { return attrs.has(name); },
    closest() { return wrapper; },
    querySelector(selector) {
      if (selector === '.cgxui-mm-num') return { textContent: String(options.turnNo || '') };
      return null;
    },
  };
}

function createDocument(counters, location) {
  let miniMapRoot = null;
  const body = {
    isConnected: true,
    contains() { return false; },
    querySelector() { counters.domReads += 1; return null; },
    querySelectorAll() { counters.domReads += 1; return []; },
  };
  return {
    document: {
      location,
      body,
      documentElement: body,
      visibilityState: 'visible',
      querySelector(selector) {
        counters.domReads += 1;
        return String(selector).includes('mnmp-root') ? miniMapRoot : null;
      },
      querySelectorAll() { counters.domReads += 1; return []; },
      getElementById() { counters.domReads += 1; return null; },
      addEventListener() {},
      removeEventListener() {},
      createElement() { return forbidden(counters, 'domMutations', 'document.createElement'); },
      createTextNode() { return forbidden(counters, 'domMutations', 'document.createTextNode'); },
    },
    setBoxes(boxes) {
      miniMapRoot = {
        querySelectorAll(selector) {
          counters.domReads += 1;
          return String(selector).includes('mnmp-btn') ? boxes : [];
        },
      };
    },
  };
}

function createRuntime(instrumentation, name, { miniMapDiagnostics = null } = {}) {
  const counters = createCounters();
  const location = {
    pathname: `/c/${CHAT_KEY}`,
    href: `https://chatgpt.com/c/${CHAT_KEY}`,
    origin: 'https://chatgpt.com',
    reload() { return forbidden(counters, 'navigationMutations', 'location.reload'); },
  };
  const documentControl = createDocument(counters, location);
  let now = 0;
  class HarnessEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  class HarnessEventTarget {
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return forbidden(counters, 'eventDispatches', 'EventTarget.dispatchEvent'); }
  }
  class GuardedObserver {
    constructor() { return forbidden(counters, 'domMutations', 'observer construction'); }
  }
  const h2o = {
    MM: {
      wash: {
        inspectMiniBtn() {
          return {
            shouldWash: false,
            selectedOrCurrent: false,
            computedVisualWash: false,
            expectedSource: 'fixture',
          };
        },
      },
    },
  };
  const miniMapApi = Object.freeze({
    getCacheCompletenessDiagnostics() { return miniMapDiagnostics; },
  });
  const sandbox = {
    __CV33_SOURCE_SETTER_GUARD__() {
      return forbidden(counters, 'sourceSetterCalls', 'setChatAtlasCanonicalSource');
    },
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document: documentControl.document,
    location,
    history: {
      pushState() { return forbidden(counters, 'navigationMutations', 'history.pushState'); },
      replaceState() { return forbidden(counters, 'navigationMutations', 'history.replaceState'); },
    },
    navigator: Object.freeze({ userAgent: 'cv3.3-convergence-validator', language: 'en-US' }),
    performance: Object.freeze({ now() { now += 0.25; return now; } }),
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    EventTarget: HarnessEventTarget,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    requestAnimationFrame() { return forbidden(counters, 'timerSchedules', 'requestAnimationFrame'); },
    cancelAnimationFrame() {},
    setTimeout() { return forbidden(counters, 'timerSchedules', 'setTimeout'); },
    clearTimeout() {},
    setInterval() { return forbidden(counters, 'timerSchedules', 'setInterval'); },
    clearInterval() {},
    queueMicrotask() { return forbidden(counters, 'timerSchedules', 'queueMicrotask'); },
    localStorage: createStorage(counters, 'localStorage'),
    sessionStorage: createStorage(counters, 'sessionStorage'),
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000001'; } }),
    fetch: guardedCallable(counters, 'networkCalls', 'fetch'),
    XMLHttpRequest: guardedCallable(counters, 'networkCalls', 'XMLHttpRequest'),
    WebSocket: guardedCallable(counters, 'networkCalls', 'WebSocket'),
    H2O: h2o,
    H2O_Pagination: guardedCallable(counters, 'userActions', 'H2O_Pagination'),
    H2O_Unmount: guardedCallable(counters, 'userActions', 'H2O_Unmount'),
    H2O_MM_CORE_API: miniMapApi,
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => forbidden(counters, 'eventDispatches', 'window.dispatchEvent');
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;

// ── Real 0A3a broker + real 0A3b Ledger as separate programs ───────────────
// Convergence parity is Ledger-owned now, so it is exported from the Ledger's
// own module instead of H2O Core's scope. Script isolation is preserved.
const BROKER_REL = 'src-runtime-base/0A3a.\u2b1b\ufe0f\ud83e\udded Chat Atlas Core \ud83e\udded.js';
const LEDGER_REL = 'src-runtime-base/0A3b.\u2b1b\ufe0f\ud83d\udcd2 Chat Atlas Ledger \ud83d\udcd2.js';
const BROKER_PROGRAM = fs.readFileSync(path.join(ROOT, BROKER_REL), 'utf8');
const LEDGER_PROGRAM = (() => {
  const src = fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8');
  const close = '\n})();';
  const closeIndex = src.lastIndexOf(close);
  if (closeIndex < 0) throw new Error('ledger-bootstrap-boundary-invalid');
  for (const n of ['getChatAtlasConvergenceParity', 'chatAtlasConvergenceMatch', 'chatAtlasConvergenceMiniMapPrimaryMismatch']) {
    if (src.split(`  function ${n}(`).length - 1 !== 1) throw new Error(`ledger-anchor-invalid:${n}`);
  }
  return `${src.slice(0, closeIndex)}
  globalThis.__CV33_LEDGER__ = Object.freeze({
    getChatAtlasConvergenceParity,
    chatAtlasConvergenceMatch,
    chatAtlasConvergenceMiniMapPrimaryMismatch,
    setLedgerFixtureState({ members, ready = true, chatKey = 'fixture-chat' }) {
      chatAtlasLedgerState.members = members;
      chatAtlasLedgerState.ready = ready;
      chatAtlasLedgerState.chatKey = chatKey;
    },
  });
${close}\n`;
})();
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox, {
    name: `cv3.3-convergence:${name}`,
    codeGeneration: { strings: false, wasm: false },
  });
  vm.runInContext(instrumentation.instrumented, context, {
    filename: SOURCE_PATH,
    timeout: 2_000,
  });
  vm.runInContext(BROKER_PROGRAM, context, { filename: BROKER_REL, timeout: 2_000 });
  vm.runInContext(LEDGER_PROGRAM, context, { filename: LEDGER_REL, timeout: 2_000 });
  if (context.__CV33_BOOTSTRAP_SUPPRESSED__ !== true) throw new Error('bootstrap suppression marker missing');
  const coreInternals = context.__CV33_CONVERGENCE_INTERNALS__;
  const ledgerInternals = context.__CV33_LEDGER__;
  const internals = Object.assign({}, coreInternals, ledgerInternals, {
    // Each owner seeds its own state; the fixture contract is unchanged.
    setFixtureState({ members, turns, ready = true, chatKey = 'fixture-chat' }) {
      ledgerInternals.setLedgerFixtureState({ members, ready, chatKey });
      coreInternals.setCoreFixtureState({ turns });
    },
  });
  if (typeof internals?.getChatAtlasConvergenceParity !== 'function') throw new Error('convergence probe was not exported');
  if (typeof internals?.chatAtlasConvergenceMatch !== 'function') throw new Error('convergence matcher was not exported');
  if (typeof internals?.chatAtlasConvergenceMiniMapPrimaryMismatch !== 'function') throw new Error('semantic helper was not exported');
  if (typeof internals?.setFixtureState !== 'function') throw new Error('fixture-state hook was not exported');
  return { counters, documentControl, internals };
}

function makeMember({
  turnNo = 1,
  qId = `fixture-question-${turnNo}`,
  primaryAId = `fixture-answer-${turnNo}`,
  currentAnswerIds = primaryAId ? [primaryAId] : [],
  answerAliases = currentAnswerIds,
  questionAliases = [qId, `turn:${qId}`],
  noAnswer = !primaryAId,
  logicalMemberKey = `fixture-member-${turnNo}`,
} = {}) {
  return {
    logicalMemberKey,
    turnNo,
    pageNo: Math.floor((turnNo - 1) / 25) + 1,
    pageIndex: Math.floor((turnNo - 1) / 25),
    noAnswer,
    hydration: noAnswer ? 'question-only' : 'full',
    question: { qId, aliases: new Set(questionAliases) },
    answer: {
      primaryAId,
      currentAnswerIds: currentAnswerIds.slice(),
      currentProjectionSource: 'native-evidence',
      aliases: new Set(answerAliases),
    },
  };
}

function makeCanonical(member, overrides = {}) {
  const qId = overrides.qId ?? member.question.qId;
  const primaryAId = overrides.primaryAId !== undefined ? overrides.primaryAId : member.answer.primaryAId;
  const answerIds = overrides.answerIds || member.answer.currentAnswerIds.slice();
  const noAnswer = overrides.noAnswer !== undefined ? overrides.noAnswer : member.noAnswer;
  return {
    turnNo: overrides.turnNo || member.turnNo,
    idx: overrides.turnNo || member.turnNo,
    turnId: overrides.turnId || `turn:${qId}`,
    qId,
    primaryAId,
    answerIds,
    _aliasIds: overrides.aliasIds || [
      qId,
      `turn:${qId}`,
      ...Array.from(member.answer.aliases),
    ],
    noAnswer,
    hasAssistant: !noAnswer,
  };
}

function makeBox({
  turnNo = 1,
  qId = `fixture-question-${turnNo}`,
  turnId = `turn:${qId}`,
  primaryAId = null,
  noAnswer = false,
  extraIds = {},
} = {}) {
  const wrapper = createElement({}, { turnNo });
  return createElement({
    'data-cgxui': 'mnmp-btn',
    'data-turn-idx': turnNo,
    'data-turn-id': turnId,
    'data-question-id': qId,
    'data-primary-a-id': primaryAId,
    ...(noAnswer ? { 'data-no-answer': 'true' } : {}),
    ...extraIds,
  }, { wrapper, turnNo, textContent: String(turnNo) });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function executeFixture(instrumentation, name, { members, turns, boxes, miniMapDiagnostics = null }) {
  const runtime = createRuntime(instrumentation, name, { miniMapDiagnostics });
  runtime.internals.setFixtureState({ members, turns, ready: true, chatKey: CHAT_KEY });
  runtime.documentControl.setBoxes(boxes);
  const result = plain(runtime.internals.getChatAtlasConvergenceParity());
  for (const key of [
    'sourceSetterCalls',
    'navigationMutations',
    'domMutations',
    'userActions',
    'storageWrites',
    'networkCalls',
    'timerSchedules',
    'eventDispatches',
  ]) equal(runtime.counters[key], 0, `${name}: ${key} must remain zero`);
  return { result, counters: runtime.counters };
}

function singleFixture(options = {}) {
  const member = makeMember(options.member || {});
  return {
    members: options.members || [member],
    turns: options.turns || [makeCanonical(member, options.canonical || {})],
    miniMapDiagnostics: options.miniMapDiagnostics || null,
    boxes: options.boxes || [makeBox({
      turnNo: member.turnNo,
      qId: member.question.qId,
      turnId: `turn:${member.question.qId}`,
      primaryAId: member.answer.primaryAId,
      noAnswer: member.noAnswer,
      ...(options.box || {}),
    })],
  };
}

// The Chat Atlas Ledger moved out of H2O Core into 0A3b Chat Atlas Ledger,
// with 0A3a Chat Atlas Core brokering it. The H2O Core source read here is now
// the aggregate of the three files the code actually lives in. No assertion
// changes; negative checks get strictly stronger across all three files.
const H2O_CORE_AGGREGATE_ABS = [
  SOURCE_ABS,
  path.join(ROOT, 'src-runtime-base/0A3a.⬛️🧭 Chat Atlas Core 🧭.js'),
  path.join(ROOT, 'src-runtime-base/0A3b.⬛️📒 Chat Atlas Ledger 📒.js'),
];
const source = H2O_CORE_AGGREGATE_ABS.map((abs) => fs.readFileSync(abs, 'utf8')).join('\n');
const instrumentation = buildInstrumentedSource(source);
const fixtures = [];

function fixture(name, setup, verify) {
  fixtures.push({ name, setup, verify });
}

function expectPrimaryBlocker(result, blocker, reason = blocker) {
  includes(result.blockers, blocker);
  equal(result.miniMapPrimaryMismatches.length, 1);
  equal(result.miniMapPrimaryMismatches[0].reason, reason);
}

function partialMiniMapDiagnostics(overrides = {}) {
  return {
    chatKey: CHAT_KEY,
    cachedTurnCount: 6,
    publishedTurnCount: 6,
    observedTurnCount: 3,
    offDomRetainedCount: 3,
    lastMergeDecision: {
      accepted: true,
      mode: 'union',
      cachedCount: 6,
      liveCount: 3,
      outputCount: 6,
      overlapCount: 3,
      sanitizedRows: 0,
      reason: 'cache-preserving-union',
      completeness: 'incomplete',
    },
    lastPersistenceDecision: null,
    ...overrides,
  };
}

function expectNormalProbe(result) {
  ok(!result.warnings.some((warning) => String(warning).startsWith('convergence-parity-probe-failed:')),
    'normal convergence path must not use the outer failure wrapper');
  ok(['exact', 'warn', 'mismatch', 'unknown'].includes(result.parityStatus));
}

fixture('fallback-index-equal-to-target-length-is-unmatched', () => {
  const member = makeMember({ turnNo: 1 });
  return {
    members: [member],
    turns: [makeCanonical(member)],
    boxes: [makeBox({ turnNo: 2, qId: '', turnId: '', primaryAId: null })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.miniMapUnexpectedBoxes.length, 1);
  equal(result.miniMapUnexpectedBoxes[0].mismatchReason, 'no-ledger-member-match');
  equal(result.miniMapUnexpectedBoxes[0].resolvedLogicalMemberKey, null);
});

fixture('fallback-index-greater-than-target-length-is-unmatched', () => {
  const member = makeMember({ turnNo: 1 });
  return {
    members: [member],
    turns: [makeCanonical(member)],
    boxes: [makeBox({ turnNo: 3, qId: '', turnId: '', primaryAId: null })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.miniMapUnexpectedBoxes.length, 1);
  equal(result.unmatchedRowCounts['unresolved-identity-mismatch'], 1);
});

fixture('ledger-universe-larger-than-canonical-never-throws', () => {
  const first = makeMember({ turnNo: 1 });
  const second = makeMember({ turnNo: 2 });
  return {
    members: [first, second],
    turns: [makeCanonical(first)],
    boxes: [
      makeBox({ turnNo: 1, qId: first.question.qId, primaryAId: first.answer.primaryAId }),
      makeBox({ turnNo: 2, qId: second.question.qId, primaryAId: second.answer.primaryAId }),
    ],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.unmatchedRowCounts['ledger-only-live-row'], 1);
  includes(result.blockers, 'count-mismatch');
});

fixture('minimap-row-with-no-current-owner-is-unresolved', () => {
  const member = makeMember({ turnNo: 1 });
  return {
    members: [member],
    turns: [makeCanonical(member)],
    boxes: [makeBox({ turnNo: 1, qId: 'fixture-foreign-question', primaryAId: 'fixture-foreign-answer' })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.miniMapUnexpectedBoxes[0].classification, 'unresolved-identity-mismatch');
  equal(result.unmatchedRowCounts['branch-inactive-row'], 0);
});

fixture('minimap-row-with-canonical-but-no-ledger-owner-is-classified-current-only', () => {
  const canonicalMember = makeMember({ turnNo: 1 });
  return {
    members: [],
    turns: [makeCanonical(canonicalMember)],
    boxes: [makeBox({
      turnNo: 1,
      qId: canonicalMember.question.qId,
      primaryAId: canonicalMember.answer.primaryAId,
    })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  ok(result.unmatchedRowCounts['canonical-only-current-row'] >= 1);
  equal(result.miniMapUnexpectedBoxes[0].classification, 'canonical-only-current-row');
});

fixture('ledger-member-with-no-canonical-owner-is-classified-live-only', () => {
  const member = makeMember({ turnNo: 1 });
  return {
    members: [member],
    turns: [],
    boxes: [makeBox({ turnNo: 1, qId: member.question.qId, primaryAId: member.answer.primaryAId })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.unmatchedRowCounts['ledger-only-live-row'], 1);
  equal(result.aliasMismatches[0].classification, 'ledger-only-live-row');
});

fixture('two-minimap-boxes-cannot-claim-one-ledger-member', () => {
  const member = makeMember({ turnNo: 1 });
  const box = { turnNo: 1, qId: member.question.qId, primaryAId: member.answer.primaryAId };
  return {
    members: [member],
    turns: [makeCanonical(member)],
    boxes: [makeBox(box), makeBox({ ...box, turnNo: 2 })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  const duplicate = result.miniMapUnexpectedBoxes.find((row) => row.mismatchReason === 'duplicate-ledger-member-claim');
  ok(duplicate);
  equal(duplicate.severity, 'blocker');
  includes(result.blockers, 'minimap-unexpected-boxes');
});

fixture('two-ledger-members-cannot-claim-one-canonical-record', () => {
  const first = makeMember({ turnNo: 1 });
  const second = makeMember({ turnNo: 2 });
  const canonical = makeCanonical(first, {
    aliasIds: [
      first.question.qId,
      first.answer.primaryAId,
      second.question.qId,
      second.answer.primaryAId,
    ],
  });
  return {
    members: [first, second],
    turns: [canonical],
    boxes: [makeBox({ turnNo: 1, qId: first.question.qId, primaryAId: first.answer.primaryAId })],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  const duplicate = result.aliasMismatches.find((row) => row.reason === 'duplicate-canonical-member-claim');
  ok(duplicate);
  equal(duplicate.severity, 'blocker');
  includes(result.blockers, 'record-local-alias-mismatch');
});

fixture('partial-cache-row-is-not-guessed-by-ordinal', () => {
  const member = makeMember({ turnNo: 1 });
  return {
    members: [member],
    turns: [makeCanonical(member)],
    boxes: [
      makeBox({ turnNo: 1, qId: member.question.qId, primaryAId: member.answer.primaryAId }),
      makeBox({ turnNo: 2, qId: 'fixture-cache-only-question', primaryAId: 'fixture-cache-only-answer' }),
    ],
    miniMapDiagnostics: partialMiniMapDiagnostics(),
  };
}, ({ result }) => {
  expectNormalProbe(result);
  const cacheOnly = result.miniMapUnexpectedBoxes.find((row) => row.classification === 'cache-only-historical-row');
  ok(cacheOnly);
  equal(cacheOnly.severity, 'warning');
  excludes(result.blockers, 'minimap-unexpected-boxes');
  equal(result.unmatchedRowCounts['branch-inactive-row'], 0);
});

fixture('valid-record-local-alias-match-remains-supported', () => singleFixture({
  member: {
    primaryAId: 'fixture-current-answer',
    currentAnswerIds: ['fixture-current-answer'],
    answerAliases: ['fixture-current-answer', 'fixture-shell-answer'],
  },
  box: { qId: '', turnId: '', primaryAId: 'fixture-shell-answer' },
}), ({ result }) => {
  expectNormalProbe(result);
  equal(result.renderedMiniMapBoxes[0].resolvedLogicalMemberKey, 'fixture-member-1');
  equal(result.miniMapUnexpectedBoxes.length, 0);
});

fixture('three-ledger-six-minimap-universe-is-structured-and-bounded', () => {
  const members = [1, 2, 3].map((turnNo) => makeMember({ turnNo }));
  const boxes = members.map((member) => makeBox({
    turnNo: member.turnNo,
    qId: member.question.qId,
    primaryAId: member.answer.primaryAId,
  }));
  for (let turnNo = 4; turnNo <= 6; turnNo += 1) {
    boxes.push(makeBox({
      turnNo,
      qId: `fixture-cache-question-${turnNo}`,
      primaryAId: `fixture-cache-answer-${turnNo}`,
    }));
  }
  return { members, turns: members.map((member) => makeCanonical(member)), boxes };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.ledgerMemberCount, 3);
  equal(result.renderedMiniMapBoxCount, 6);
  equal(result.miniMapUnexpectedBoxes.length, 3);
  ok(result.unmatchedRowEvidence.length <= SAMPLE_LIMIT);
});

fixture('stable-four-three-six-shape-never-throws', () => {
  const canonicalMembers = [
    makeMember({ turnNo: 1, qId: 'fixture-current-question-1', primaryAId: 'fixture-current-answer-1' }),
    makeMember({ turnNo: 2, qId: 'fixture-canonical-question-2', primaryAId: 'fixture-shared-answer-2' }),
    makeMember({ turnNo: 3, qId: 'fixture-current-question-3', primaryAId: 'fixture-current-answer-3' }),
    makeMember({ turnNo: 4, qId: 'fixture-current-question-4', primaryAId: null, currentAnswerIds: [], answerAliases: [], noAnswer: true }),
  ];
  const ledgerMembers = [
    makeMember({
      turnNo: 1,
      qId: 'fixture-ledger-question-2',
      primaryAId: 'fixture-shared-answer-2',
      questionAliases: ['fixture-ledger-question-2', 'fixture-canonical-question-2'],
    }),
    makeMember({ turnNo: 2, qId: 'fixture-current-question-3', primaryAId: 'fixture-current-answer-3' }),
    makeMember({ turnNo: 3, qId: 'fixture-current-question-4', primaryAId: null, currentAnswerIds: [], answerAliases: [], noAnswer: true }),
  ];
  return {
    members: ledgerMembers,
    turns: canonicalMembers.map((member) => makeCanonical(member)),
    boxes: [
      makeBox({ turnNo: 1, qId: 'fixture-canonical-question-2', primaryAId: 'fixture-shared-answer-2' }),
      makeBox({ turnNo: 2, qId: 'fixture-historical-question-2', primaryAId: 'fixture-historical-answer-2' }),
      makeBox({ turnNo: 3, qId: 'fixture-historical-question-3', primaryAId: 'fixture-historical-answer-3' }),
      makeBox({ turnNo: 4, qId: 'fixture-current-question-1', primaryAId: 'fixture-current-answer-1' }),
      makeBox({ turnNo: 5, qId: 'fixture-current-question-3', primaryAId: 'fixture-current-answer-3' }),
      makeBox({ turnNo: 6, qId: 'fixture-current-question-4', primaryAId: null, noAnswer: true }),
    ],
  };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.ledgerMemberCount, 3);
  equal(result.canonicalRecordCount, 4);
  equal(result.renderedMiniMapBoxCount, 6);
  equal(result.parityStatus, 'mismatch');
  equal(result.noAnswerMiniMapPrimaryMismatchCount, 0);
  equal(result.miniMapPrimaryNotMemberAnswerCount, 0);
});

fixture('unmatched-evidence-is-capped-with-complete-counters', () => {
  const member = makeMember({ turnNo: 1 });
  const boxes = [];
  for (let turnNo = 1; turnNo <= 20; turnNo += 1) {
    boxes.push(makeBox({
      turnNo,
      qId: `fixture-unmatched-question-${turnNo}`,
      primaryAId: `fixture-unmatched-answer-${turnNo}`,
    }));
  }
  return { members: [member], turns: [makeCanonical(member)], boxes };
}, ({ result }) => {
  expectNormalProbe(result);
  equal(result.unmatchedRowCounts['unresolved-identity-mismatch'], 20);
  equal(result.unmatchedRowEvidence.length, SAMPLE_LIMIT);
  equal(result.unmatchedRowEvidenceTruncated, true);
  equal(Object.keys(result.unmatchedRowCounts).sort(), [
    'branch-inactive-row',
    'cache-only-historical-row',
    'canonical-only-current-row',
    'ledger-only-live-row',
    'unresolved-identity-mismatch',
  ]);
});

fixture('no-answer-empty-primary-passes', () => singleFixture({
  member: { primaryAId: null, currentAnswerIds: [], answerAliases: [], noAnswer: true },
  box: { primaryAId: null, noAnswer: true },
}), ({ result }) => {
  excludes(result.blockers, 'no-answer-minimap-primary-present');
  equal(result.noAnswerMiniMapPrimaryMismatchCount, 0);
});

for (const [name, primary] of [
  ['no-answer-bare-qid-blocks', 'fixture-question-1'],
  ['no-answer-turn-qid-blocks', 'turn:fixture-question-1'],
  ['no-answer-turn-answer-identity-blocks', 'turn:a:fixture-answer-stale'],
  ['no-answer-placeholder-blocks', 'request-placeholder-fixture-1'],
  ['no-answer-unrelated-answer-blocks', 'fixture-unrelated-answer'],
]) {
  fixture(name, () => singleFixture({
    member: { primaryAId: null, currentAnswerIds: [], answerAliases: [], noAnswer: true },
    box: { primaryAId: primary, noAnswer: true },
  }), ({ result }) => {
    expectPrimaryBlocker(result, 'no-answer-minimap-primary-present');
    equal(result.noAnswerMiniMapPrimaryMismatchCount, 1);
  });
}

fixture('answered-exact-canonical-primary-passes', () => singleFixture(), ({ result }) => {
  excludes(result.blockers, 'minimap-primary-not-member-answer');
  equal(result.miniMapPrimaryNotMemberAnswerCount, 0);
});

fixture('answered-current-selected-primary-passes', () => singleFixture({
  member: {
    primaryAId: 'fixture-answer-selected',
    currentAnswerIds: ['fixture-answer-old', 'fixture-answer-selected'],
    answerAliases: ['fixture-answer-old', 'fixture-answer-selected'],
  },
  box: { primaryAId: 'fixture-answer-selected' },
}), ({ result }) => {
  excludes(result.blockers, 'minimap-primary-not-member-answer');
  equal(result.miniMapPrimaryNotMemberAnswerCount, 0);
});

for (const [name, primary] of [
  ['answered-qid-primary-blocks', 'fixture-question-1'],
  ['answered-turn-id-primary-blocks', 'turn:fixture-question-1'],
  ['answered-settled-placeholder-primary-blocks', 'request-placeholder-fixture-1'],
  ['answered-foreign-primary-blocks', 'fixture-answer-foreign'],
]) {
  fixture(name, () => singleFixture({ box: { primaryAId: primary } }), ({ result }) => {
    expectPrimaryBlocker(result, 'minimap-primary-not-member-answer');
    equal(result.miniMapPrimaryNotMemberAnswerCount, 1);
  });
}

fixture('answered-historical-only-alias-blocks-after-broad-match', () => singleFixture({
  member: {
    primaryAId: 'fixture-answer-current',
    currentAnswerIds: ['fixture-answer-current'],
    answerAliases: ['fixture-answer-current', 'fixture-answer-history'],
  },
  box: { primaryAId: 'fixture-answer-history', qId: '', turnId: '' },
}), ({ result }) => {
  expectPrimaryBlocker(result, 'minimap-primary-not-member-answer');
  equal(result.renderedMiniMapBoxes[0].resolvedLogicalMemberKey, 'fixture-member-1');
  equal(result.miniMapUnexpectedBoxes.length, 0);
});

fixture('answered-missing-primary-blocks', () => singleFixture({
  box: { primaryAId: null },
}), ({ result }) => {
  expectPrimaryBlocker(result, 'minimap-primary-not-member-answer');
});

fixture('observed-post-reload-bare-qid-regression-blocks-after-alias-match', () => singleFixture({
  member: {
    qId: 'c64afed8-cfde-4644-b0df-3407313c4c54',
    primaryAId: null,
    currentAnswerIds: [],
    answerAliases: [],
    noAnswer: true,
    logicalMemberKey: 'fixture-observed-member',
  },
  box: {
    qId: 'c64afed8-cfde-4644-b0df-3407313c4c54',
    turnId: 'turn:c64afed8-cfde-4644-b0df-3407313c4c54',
    primaryAId: 'c64afed8-cfde-4644-b0df-3407313c4c54',
    noAnswer: true,
  },
}), ({ result }) => {
  expectPrimaryBlocker(result, 'no-answer-minimap-primary-present');
  equal(result.renderedMiniMapBoxes[0].resolvedLogicalMemberKey, 'fixture-observed-member');
  equal(result.miniMapUnexpectedBoxes.length, 0);
});

fixture('count-mismatch-behavior-remains', () => {
  const first = makeMember({ turnNo: 1 });
  const second = makeMember({ turnNo: 2 });
  return {
    members: [first, second],
    turns: [makeCanonical(first), makeCanonical(second)],
    boxes: [makeBox({ turnNo: 1, qId: first.question.qId, primaryAId: first.answer.primaryAId })],
  };
}, ({ result }) => {
  includes(result.blockers, 'count-mismatch');
  includes(result.blockers, 'minimap-missing-boxes');
});

fixture('order-mismatch-behavior-remains', () => {
  const first = makeMember({ turnNo: 1 });
  const second = makeMember({ turnNo: 2 });
  return {
    members: [first, second],
    turns: [makeCanonical(first), makeCanonical(second)],
    boxes: [
      makeBox({ turnNo: 2, qId: second.question.qId, primaryAId: second.answer.primaryAId }),
      makeBox({ turnNo: 1, qId: first.question.qId, primaryAId: first.answer.primaryAId }),
    ],
  };
}, ({ result }) => {
  includes(result.blockers, 'minimap-order-mismatch');
});

fixture('ambiguous-membership-behavior-remains', () => {
  const first = makeMember({ turnNo: 1, answerAliases: ['fixture-answer-1', 'fixture-shared-alias'] });
  const second = makeMember({ turnNo: 2, answerAliases: ['fixture-answer-2', 'fixture-shared-alias'] });
  return {
    members: [first, second],
    turns: [makeCanonical(first), makeCanonical(second)],
    boxes: [makeBox({ turnNo: 1, qId: '', turnId: '', primaryAId: 'fixture-shared-alias' })],
  };
}, ({ result }) => {
  includes(result.blockers, 'minimap-unexpected-boxes');
  equal(result.miniMapUnexpectedBoxes[0].mismatchReason, 'ambiguous-ledger-alias-match');
});

fixture('canonical-ledger-no-answer-parity-remains', () => singleFixture({
  member: { primaryAId: null, currentAnswerIds: [], answerAliases: [], noAnswer: true },
  canonical: { primaryAId: 'fixture-answer-1', answerIds: ['fixture-answer-1'], noAnswer: false },
  box: { primaryAId: null, noAnswer: true },
}), ({ result }) => {
  includes(result.blockers, 'no-answer-mismatch');
  equal(result.noAnswerMismatches.length, 1);
});

fixture('primary-mismatch-evidence-is-bounded-with-complete-counts', () => {
  const members = [];
  const turns = [];
  const boxes = [];
  for (let turnNo = 1; turnNo <= 15; turnNo += 1) {
    const member = makeMember({ turnNo, primaryAId: null, currentAnswerIds: [], answerAliases: [], noAnswer: true });
    members.push(member);
    turns.push(makeCanonical(member));
    boxes.push(makeBox({
      turnNo,
      qId: member.question.qId,
      primaryAId: `fixture-stale-answer-${turnNo}`,
      noAnswer: true,
    }));
  }
  return { members, turns, boxes };
}, ({ result }) => {
  equal(result.noAnswerMiniMapPrimaryMismatchCount, 15);
  equal(result.miniMapPrimaryMismatches.length, SAMPLE_LIMIT);
  equal(result.miniMapPrimaryMismatchSampleLimit, SAMPLE_LIMIT);
});

const fixtureResults = [];
let failures = 0;
for (const item of fixtures) {
  try {
    const execution = executeFixture(instrumentation, item.name, item.setup());
    item.verify(execution);
    fixtureResults.push({ name: item.name, ok: true });
    process.stdout.write(`PASS ${item.name}\n`);
  } catch (error) {
    failures += 1;
    fixtureResults.push({ name: item.name, ok: false, error: String(error?.stack || error) });
    process.stdout.write(`FAIL ${item.name}: ${error?.message || error}\n`);
  }
}

const report = {
  ok: failures === 0,
  productionSourcePath: SOURCE_PATH,
  productionSourceSha256: sha256(source),
  instrumentationAnchors: instrumentation.anchors,
  productionFunctionsExposed: [
    'getChatAtlasConvergenceParity',
    'chatAtlasConvergenceMatch',
    'chatAtlasConvergenceMiniMapPrimaryMismatch',
  ],
  fixtureCount: fixtures.length,
  assertionCount,
  failures,
  fixtureResults,
  sideEffectTotals: {
    sourceSetterCalls: 0,
    navigationMutations: 0,
    domMutations: 0,
    userActions: 0,
    storageWrites: 0,
    networkCalls: 0,
    timerSchedules: 0,
    eventDispatches: 0,
  },
};

process.stdout.write(`SUMMARY ${fixtures.length - failures}/${fixtures.length} fixtures passed; ${assertionCount} assertions; ${failures} failures\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
process.exitCode = failures ? 1 : 0;
