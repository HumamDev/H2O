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
const PRODUCTION_SOURCE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const PRODUCTION_SOURCE_ABS = path.join(ROOT, PRODUCTION_SOURCE_PATH);
const EXPECTED_SOURCE_SHA256 = '20590bbfed35651e4ef67b6d0d478cd4dba13c5e62892ba26e074156323a399b';
const FIXED_NOW_ISO = '2026-07-13T12:00:00.000Z';
const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);
const SAMPLE_LIMIT = 12;
const LEGACY_SOURCE = 'legacy-durable-cache';

const ID = Object.freeze({
  chatA: 'fixture-chat-a',
  chatB: 'fixture-chat-b',
  q1: 'fixture-question-1',
  q2: 'fixture-question-2',
  q3: 'fixture-question-3',
  qB: 'fixture-question-b',
  answerX: 'fixture-answer-x',
  answerY: 'fixture-answer-y',
});

class InstrumentationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'InstrumentationError';
    this.details = details;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countOccurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function stableNormalize(value) {
  if (value instanceof Set) return Array.from(value, stableNormalize).sort(compareJson);
  if (value instanceof Map) {
    return Array.from(value, ([key, item]) => [stableNormalize(key), stableNormalize(item)])
      .sort((a, b) => compareJson(a[0], b[0]));
  }
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = stableNormalize(value[key]);
  return output;
}

function compareJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function stableJson(value) {
  return JSON.stringify(stableNormalize(value));
}

function plain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function sorted(values) {
  return Array.from(values || []).map(String).sort();
}

function memberHasAlias(member, alias) {
  return [
    ...(member?.question?.aliases || []),
    ...(member?.answer?.aliases || []),
    ...(member?.resolverHistoryAliases || []),
    ...(member?.aliases || []),
  ].includes(alias);
}

function publicMemberHasAlias(member, alias) {
  return [
    ...(member?.question?.aliases || []),
    ...(member?.answer?.aliases || []),
    ...(member?.resolverAliases || []),
  ].includes(alias);
}

function buildInstrumentedSource(productionSource) {
  const anchors = [];
  const verifyUnique = (name, needle) => {
    const count = countOccurrences(productionSource, needle);
    anchors.push({ name, matches: count });
    if (count !== 1) {
      throw new InstrumentationError(`anchor ${name} must match exactly once; found ${count}`);
    }
  };

  const requiredFunctions = [
    'chatAtlasPairEvidence',
    'chatAtlasBuildCurrentAliasOwners',
    'chatAtlasPrepareAliasQuarantine',
    'chatAtlasAbsorbHistoricalAliases',
    'chatAtlasRepairResolverOwnership',
    'chatAtlasRecordNoAnswerHistoryRepairs',
    'chatAtlasApplyEvidence',
    'chatAtlasRecordAliasConflict',
    'chatAtlasRecordPairingRejection',
    'chatAtlasCv2ResetBindingEvidence',
    'getChatAtlasLedgerSnapshot',
    'getChatAtlasLedgerDiagnostics',
  ];
  for (const name of requiredFunctions) verifyUnique(`function:${name}`, `  function ${name}(`);

  const setterAnchor = '  function setChatAtlasCanonicalSource(value) {\n';
  const commitAnchor = '  function commitTurnDrafts(canonicalDrafts, liveDrafts = canonicalDrafts) {\n';
  const preRepairAnchor = [
    '    const aliasOwners = chatAtlasRepairResolverOwnership(',
    '      next,',
    '      currentOwners,',
    '      quarantine,',
    '      repairEventKeys,',
    '    );',
  ].join('\n');
  const bootstrapMarker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const bootRefresh = "  refresh('boot');";
  const bootLedger = '  startChatAtlasLedger();';
  const finalClose = '\n})();';

  verifyUnique('guard:source-setter', setterAnchor);
  verifyUnique('guard:canonical-commit', commitAnchor);
  verifyUnique('hook:pre-repair', preRepairAnchor);
  verifyUnique('bootstrap:tail-marker', bootstrapMarker);
  verifyUnique('bootstrap:refresh-call', bootRefresh);
  verifyUnique('bootstrap:ledger-call', bootLedger);
  if (!productionSource.endsWith(`${finalClose}\n`) && !productionSource.endsWith(finalClose)) {
    throw new InstrumentationError('production IIFE final close anchor is not the final source token');
  }
  anchors.push({ name: 'bootstrap:final-close', matches: 1 });

  let instrumented = productionSource.replace(
    setterAnchor,
    `${setterAnchor}    globalThis.__CV26_GUARD_CALL__('sourceSetterCalls');\n`,
  );
  instrumented = instrumented.replace(
    commitAnchor,
    `${commitAnchor}    globalThis.__CV26_GUARD_CALL__('canonicalCommits');\n`,
  );
  instrumented = instrumented.replace(
    preRepairAnchor,
    [
      '    if (typeof globalThis.__CV26_BEFORE_REPAIR_HOOK__ === \'function\') {',
      '      globalThis.__CV26_BEFORE_REPAIR_HOOK__({',
      '        members: next, currentOwners, quarantine, repairEventKeys,',
      '      });',
      '    }',
      preRepairAnchor,
    ].join('\n'),
  );

  const markerIndex = instrumented.indexOf(bootstrapMarker);
  const finalCloseIndex = instrumented.lastIndexOf(finalClose);
  if (markerIndex < 0 || finalCloseIndex <= markerIndex) {
    throw new InstrumentationError('unable to isolate the production bootstrap tail');
  }
  const removedTail = instrumented.slice(markerIndex, finalCloseIndex);
  if (countOccurrences(removedTail, bootRefresh) !== 1 || countOccurrences(removedTail, bootLedger) !== 1) {
    throw new InstrumentationError('bootstrap tail does not contain the uniquely verified boot calls');
  }

  const exportBlock = [
    '  globalThis.__CV26_INTERNALS__ = Object.freeze({',
    '    chatAtlasPairEvidence,',
    '    chatAtlasBuildCurrentAliasOwners,',
    '    chatAtlasPrepareAliasQuarantine,',
    '    chatAtlasAbsorbHistoricalAliases,',
    '    chatAtlasRepairResolverOwnership,',
    '    chatAtlasRecordNoAnswerHistoryRepairs,',
    '    chatAtlasApplyEvidence,',
    '    chatAtlasRecordAliasConflict,',
    '    chatAtlasRecordPairingRejection,',
    '    chatAtlasCv2ResetBindingEvidence,',
    '    chatAtlasRebuildResolverAliases,',
    '    chatAtlasBuildOwnerMap,',
    '    chatAtlasCv2CurrentIds,',
    '    getChatAtlasLedgerSnapshot,',
    '    getChatAtlasLedgerDiagnostics,',
    '    getChatAtlasCanonicalSource,',
    '    getLedgerState: () => chatAtlasLedgerState,',
    '    getCanonicalSourceState: () => chatAtlasCanonicalSourceState,',
    '  });',
    '  globalThis.__CV26_BOOTSTRAP_SUPPRESSED__ = true;',
  ].join('\n');

  instrumented = `${instrumented.slice(0, markerIndex)}${exportBlock}${finalClose}\n`;
  if (instrumented.includes(bootRefresh) || instrumented.includes(bootLedger)) {
    throw new InstrumentationError('bootstrap call survived suppression');
  }

  return {
    instrumented,
    anchors,
    functionsExposed: [
      ...requiredFunctions,
      'chatAtlasRebuildResolverAliases',
      'chatAtlasBuildOwnerMap',
      'chatAtlasCv2CurrentIds',
      'getChatAtlasCanonicalSource',
    ],
    bootstrap: {
      marker: 'TIME / OBSERVERS section',
      refreshSuppressed: true,
      ledgerStartSuppressed: true,
      observerAndReadyTailSuppressed: true,
    },
  };
}

function createSideEffectCounters() {
  return {
    domWrites: 0,
    storageWrites: 0,
    canonicalCommits: 0,
    paginationCalls: 0,
    unmountCalls: 0,
    miniMapCalls: 0,
    networkCalls: 0,
    sourceSetterCalls: 0,
    timerSchedules: 0,
    observerCreations: 0,
    eventDispatches: 0,
    vmListenerRegistrations: 0,
    domReads: 0,
  };
}

function failSideEffect(counters, key, label) {
  counters[key] += 1;
  throw new Error(`forbidden side effect: ${label}`);
}

function guardedApi(counters, key, label) {
  const callable = () => failSideEffect(counters, key, label);
  return new Proxy(callable, {
    apply() { return failSideEffect(counters, key, label); },
    construct() { return failSideEffect(counters, key, label); },
    get(_target, property) {
      if (property === 'then') return undefined;
      return guardedApi(counters, key, `${label}.${String(property)}`);
    },
    set() { return failSideEffect(counters, key, `${label}.set`); },
  });
}

function createStorage(counters, label) {
  return Object.freeze({
    getItem() { return null; },
    key() { return null; },
    get length() { return 0; },
    setItem() { return failSideEffect(counters, 'storageWrites', `${label}.setItem`); },
    removeItem() { return failSideEffect(counters, 'storageWrites', `${label}.removeItem`); },
    clear() { return failSideEffect(counters, 'storageWrites', `${label}.clear`); },
  });
}

function createReadOnlyDocument(counters, location) {
  const body = Object.freeze({
    isConnected: true,
    contains() { return false; },
    querySelector() { counters.domReads += 1; return null; },
    querySelectorAll() { counters.domReads += 1; return []; },
  });
  const target = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector() { counters.domReads += 1; return null; },
    querySelectorAll() { counters.domReads += 1; return []; },
    getElementById() { counters.domReads += 1; return null; },
    addEventListener() { counters.vmListenerRegistrations += 1; },
    removeEventListener() {},
    createElement() { return failSideEffect(counters, 'domWrites', 'document.createElement'); },
    createTextNode() { return failSideEffect(counters, 'domWrites', 'document.createTextNode'); },
  };
  return new Proxy(target, {
    set() { return failSideEffect(counters, 'domWrites', 'document property write'); },
    defineProperty() { return failSideEffect(counters, 'domWrites', 'document defineProperty'); },
    deleteProperty() { return failSideEffect(counters, 'domWrites', 'document deleteProperty'); },
  });
}

function createFixedDate() {
  return class FixedDate extends Date {
    constructor(...args) { super(args.length ? args[0] : FIXED_NOW_MS); }
    static now() { return FIXED_NOW_MS; }
  };
}

function createVmRuntime(instrumentation, fixtureName) {
  const counters = createSideEffectCounters();
  const location = {
    pathname: `/c/${ID.chatA}`,
    href: `https://chatgpt.com/c/${ID.chatA}`,
    origin: 'https://chatgpt.com',
  };
  const document = createReadOnlyDocument(counters, location);
  const FixedDate = createFixedDate();
  let performanceTick = 0;
  let deterministicUuidSequence = 0;

  class HarnessEvent {
    constructor(type, init = {}) {
      this.type = String(type || '');
      this.detail = init.detail;
    }
  }
  class HarnessEventTarget {
    addEventListener() { counters.vmListenerRegistrations += 1; }
    removeEventListener() {}
    dispatchEvent() { return failSideEffect(counters, 'eventDispatches', 'EventTarget.dispatchEvent'); }
  }
  class GuardedObserver {
    constructor() { failSideEffect(counters, 'observerCreations', 'observer construction'); }
  }

  const sandbox = {
    __CV26_SIDE_EFFECTS__: counters,
    __CV26_BEFORE_REPAIR_HOOK__: null,
    __CV26_GUARD_CALL__(key) {
      if (!Object.hasOwn(counters, key)) throw new Error(`unknown guarded category ${key}`);
      return failSideEffect(counters, key, key);
    },
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: Object.freeze({
      pushState() { return failSideEffect(counters, 'domWrites', 'history.pushState'); },
      replaceState() { return failSideEffect(counters, 'domWrites', 'history.replaceState'); },
    }),
    navigator: Object.freeze({ userAgent: 'cv2.6-node-vm', language: 'en-US' }),
    Date: FixedDate,
    performance: Object.freeze({ now() { performanceTick += 0.25; return performanceTick; } }),
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    EventTarget: HarnessEventTarget,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    requestAnimationFrame() { return failSideEffect(counters, 'timerSchedules', 'requestAnimationFrame'); },
    cancelAnimationFrame() {},
    setTimeout() { return failSideEffect(counters, 'timerSchedules', 'setTimeout'); },
    clearTimeout() {},
    setInterval() { return failSideEffect(counters, 'timerSchedules', 'setInterval'); },
    clearInterval() {},
    queueMicrotask() { return failSideEffect(counters, 'timerSchedules', 'queueMicrotask'); },
    localStorage: createStorage(counters, 'localStorage'),
    sessionStorage: createStorage(counters, 'sessionStorage'),
    crypto: Object.freeze({
      randomUUID() {
        deterministicUuidSequence += 1;
        return `00000000-0000-4000-8000-${String(deterministicUuidSequence).padStart(12, '0')}`;
      },
      getRandomValues(array) {
        for (let index = 0; index < array.length; index += 1) array[index] = index & 0xff;
        return array;
      },
    }),
    fetch: guardedApi(counters, 'networkCalls', 'fetch'),
    XMLHttpRequest: guardedApi(counters, 'networkCalls', 'XMLHttpRequest'),
    WebSocket: guardedApi(counters, 'networkCalls', 'WebSocket'),
    H2O_Pagination: guardedApi(counters, 'paginationCalls', 'H2O_Pagination'),
    H2O_Unmount: guardedApi(counters, 'unmountCalls', 'H2O_Unmount'),
    H2O_UnmountAdapter: guardedApi(counters, 'unmountCalls', 'H2O_UnmountAdapter'),
    H2O_MM_CORE_API: guardedApi(counters, 'miniMapCalls', 'H2O_MM_CORE_API'),
    H2O_MM: guardedApi(counters, 'miniMapCalls', 'H2O_MM'),
  };
  sandbox.addEventListener = () => { counters.vmListenerRegistrations += 1; };
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => failSideEffect(counters, 'eventDispatches', 'window.dispatchEvent');
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox, {
    name: `chat-atlas-cv2.6:${fixtureName}`,
    codeGeneration: { strings: false, wasm: false },
  });
  try {
    vm.runInContext(instrumentation.instrumented, context, {
      filename: PRODUCTION_SOURCE_PATH,
      timeout: 2_000,
      displayErrors: true,
    });
  } catch (error) {
    throw new InstrumentationError(`production source VM evaluation failed: ${error.message}`);
  }
  if (context.__CV26_BOOTSTRAP_SUPPRESSED__ !== true) {
    throw new InstrumentationError('bootstrap suppression marker was not established');
  }
  const internals = context.__CV26_INTERNALS__;
  if (!internals || typeof internals !== 'object') {
    throw new InstrumentationError('instrumented private API was not exported');
  }
  for (const name of instrumentation.functionsExposed) {
    if (typeof internals[name] !== 'function') {
      throw new InstrumentationError(`required private function was not exported: ${name}`);
    }
  }

  return {
    context,
    counters,
    internals,
    setChat(chatId) {
      location.pathname = `/c/${chatId}`;
      location.href = `https://chatgpt.com/c/${chatId}`;
    },
  };
}

function makeShell(name, role) {
  const attributes = new Map([
    ['data-testid', name],
    ['data-turn', role],
    ['data-turn-id', name],
  ]);
  return {
    isConnected: true,
    dataset: {},
    parentElement: null,
    ownerDocument: null,
    getAttribute(attribute) { return attributes.get(attribute) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
}

function makeEvidence({
  role,
  shell,
  shellIndex,
  shellOrdinal,
  flowRef,
  shellTurnId,
  messageId = shellTurnId,
  extraAliases = [],
}) {
  const aliases = new Set([shellTurnId, messageId, ...extraAliases].filter(Boolean));
  return {
    shell,
    shellIndex,
    testId: `conversation-turn-${shellOrdinal}`,
    shellOrdinal,
    flowRef,
    role,
    roleNode: null,
    hydrated: !!messageId,
    aliases,
    shellTurnId: shellTurnId || null,
    messageId: messageId || null,
    currentId: messageId || shellTurnId || null,
  };
}

function makeRead(evidence, options = {}) {
  const canonicalRecords = options.canonicalRecords || [];
  return {
    shells: options.shells || evidence.map((item) => item.shell),
    root: null,
    evidence,
    unbound: options.unbound || [],
    questionShellCount: evidence.filter((item) => item.role === 'user').length,
    answerShellCount: evidence.filter((item) => item.role === 'assistant').length,
    canonicalRecords,
    canonicalShellBindings: options.canonicalShellBindings || new Map(),
    canonicalVersion: options.canonicalVersion || 0,
    completeShellMap: options.completeShellMap !== false,
    readMs: 0,
  };
}

function makeCanonicalRecord({ turnNo, qId, primaryAId, answerIds = [], aliases = [] }) {
  return {
    turnNo,
    idx: turnNo,
    qId,
    primaryAId,
    answerIds: answerIds.slice(),
    _aliasIds: aliases.slice(),
    noAnswer: !primaryAId && answerIds.length === 0,
    live: { qEl: null, answerEls: [] },
  };
}

function makeInternalMember({ key, turnNo, questionAliases = [], answerAliases = [], historyAliases = [] }) {
  return {
    logicalMemberKey: key,
    turnNo,
    aliases: new Set([...questionAliases, ...answerAliases, ...historyAliases]),
    resolverHistoryAliases: new Set(historyAliases),
    question: {
      qId: questionAliases[0] || null,
      currentQId: null,
      currentAliases: [],
      evidenceAliases: [],
      aliases: new Set(questionAliases),
      shellRef: null,
      hydrated: false,
    },
    answer: {
      primaryAId: null,
      currentAnswerIds: [],
      currentAliases: [],
      evidenceAliases: [],
      currentProjectionSource: 'none',
      aliases: new Set(answerAliases),
      shellRef: null,
      hydrated: false,
    },
    noAnswer: answerAliases.length === 0,
    hydration: 'none',
    pageNo: 1,
    pageIndex: 0,
  };
}

function applySequence(runtime, evidence, reason, options = {}) {
  return runtime.internals.chatAtlasApplyEvidence(
    makeRead(evidence, options),
    reason,
    options.isFlush !== false,
  );
}

function snapshot(runtime) {
  return plain(runtime.internals.getChatAtlasLedgerSnapshot());
}

function diagnostics(runtime) {
  return plain(runtime.internals.getChatAtlasLedgerDiagnostics());
}

function sourceSafety(runtime) {
  const state = runtime.internals.getCanonicalSourceState();
  return {
    defaultSource: String(state.defaultSource || ''),
    activeSource: String(state.activeSource || ''),
    effectiveSource: String(state.effectiveSource || ''),
    sourceSetterCalls: runtime.counters.sourceSetterCalls,
  };
}

function assertLegacySource(runtime) {
  const safety = sourceSafety(runtime);
  assert.equal(safety.defaultSource, LEGACY_SOURCE);
  assert.equal(safety.activeSource, LEGACY_SOURCE);
  assert.equal(safety.effectiveSource, LEGACY_SOURCE);
  assert.equal(safety.sourceSetterCalls, 0);
}

function assertForbiddenSideEffectsZero(runtime) {
  for (const key of [
    'domWrites',
    'storageWrites',
    'canonicalCommits',
    'paginationCalls',
    'unmountCalls',
    'miniMapCalls',
    'networkCalls',
    'sourceSetterCalls',
  ]) {
    assert.equal(runtime.counters[key], 0, `${key} must remain zero`);
  }
}

function fixtureCurrentOwnerRepairsHistoricalOwner(runtime) {
  const flow = { id: 'flow-main-repair' };
  const q1Shell = makeShell('shell-q1', 'user');
  const q2Shell = makeShell('shell-q2', 'user');
  const answerShell = makeShell('shell-answer-x', 'assistant');
  let generation = 1;
  let preRepair = null;

  runtime.context.__CV26_BEFORE_REPAIR_HOOK__ = ({ members, currentOwners }) => {
    if (generation !== 2) return;
    const historicalOwner = members.find((member) => member.turnNo === 1);
    const currentOwner = members.find((member) => member.turnNo === 2);
    historicalOwner.answer.aliases.add(ID.answerX);
    const candidateMembers = members
      .filter((member) => memberHasAlias(member, ID.answerX))
      .map((member) => member.logicalMemberKey);
    const currentEntries = Array.from(currentOwners.get(ID.answerX)?.values() || []);
    preRepair = {
      alias: ID.answerX,
      candidateLogicalMembers: candidateMembers,
      candidateCount: candidateMembers.length,
      currentOwnerKeys: currentEntries.map((entry) => entry.member.logicalMemberKey),
      historicalOwnerKey: historicalOwner.logicalMemberKey,
      correctCurrentOwnerKey: currentOwner.logicalMemberKey,
      historicalOwnerContainsAlias: memberHasAlias(historicalOwner, ID.answerX),
      currentOwnerContainsAlias: memberHasAlias(currentOwner, ID.answerX),
    };
  };

  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerX }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 2, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
  ], 'fixture-main-generation-a');
  const generationA = snapshot(runtime);
  assert.equal(generationA.members[0].answer.primaryAId, ID.answerX);

  generation = 2;
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 1, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 2, shellOrdinal: 4, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-main-generation-b');

  const post = snapshot(runtime);
  const diag = diagnostics(runtime);
  const first = post.members.find((member) => member.turnNo === 1);
  const second = post.members.find((member) => member.turnNo === 2);
  const repairSamples = diag.recentAliasConflicts.filter((sample) => (
    sample.alias === ID.answerX && sample.action === 'removed-from-historical-owner'
  ));

  assert.ok(preRepair, 'pre-repair hook must capture the contaminated boundary');
  assert.equal(preRepair.candidateCount, 2);
  assert.equal(preRepair.historicalOwnerContainsAlias, true);
  assert.equal(preRepair.currentOwnerContainsAlias, true);
  assert.deepEqual(preRepair.currentOwnerKeys, [preRepair.correctCurrentOwnerKey]);
  assert.equal(first.noAnswer, true);
  assert.equal(first.answer.primaryAId, null);
  assert.equal(first.answer.currentAnswerIds.includes(ID.answerX), false);
  assert.equal(first.answer.currentAliases.includes(ID.answerX), false);
  assert.equal(first.answer.aliases.includes(ID.answerX), false);
  assert.equal(publicMemberHasAlias(first, ID.answerX), false);
  assert.equal(second.answer.primaryAId, ID.answerX);
  assert.equal(second.answer.currentAnswerIds.includes(ID.answerX), true);
  assert.equal(publicMemberHasAlias(second, ID.answerX), true);
  assert.ok(diag.crossMemberAliasRepairCount >= 1);
  assert.equal(repairSamples.length, 1);
  assert.equal(diag.currentAliasConflictCount, 0);
  assert.equal(diag.historicalAliasConflictCount, 0);
  assert.equal(diag.quarantinedAliasCount, 0);
  assert.equal(diag.quarantinedAliasResolutionCount, 0);

  return {
    preRepair,
    postRepair: {
      member1: first,
      member2: second,
      repairCount: diag.crossMemberAliasRepairCount,
      repairSamples,
      currentConflictCount: diag.currentAliasConflictCount,
      historicalConflictCount: diag.historicalAliasConflictCount,
      quarantinedAliasCount: diag.quarantinedAliasCount,
      quarantinedAliasResolutionCount: diag.quarantinedAliasResolutionCount,
    },
  };
}

function fixtureSameMemberDuplicateEvidence(runtime) {
  const flow = { id: 'flow-same-member' };
  const qShell = makeShell('shell-same-q', 'user');
  const answerShell = makeShell('shell-same-answer', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({
      role: 'assistant', shell: answerShell, shellIndex: 1, shellOrdinal: 2,
      flowRef: flow, shellTurnId: ID.answerX, messageId: ID.answerX,
    }),
  ], 'fixture-same-member-duplicate');
  const post = snapshot(runtime);
  const diag = diagnostics(runtime);
  const member = post.members[0];
  assert.deepEqual(member.answer.currentAliases, [ID.answerX]);
  assert.deepEqual(member.answer.currentAnswerIds, [ID.answerX]);
  assert.equal(member.resolverAliases.filter((alias) => alias === ID.answerX).length, 1);
  assert.equal(diag.crossMemberAliasConflictCount, 0);
  assert.equal(diag.quarantinedAliasCount, 0);
  assert.equal(diag.crossMemberAliasRepairCount, 0);
  return { member, diagnostics: aliasDiagnostics(diag) };
}

function fixtureTwoCurrentOwners(runtime) {
  const flow = { id: 'flow-two-current' };
  const q1Shell = makeShell('shell-current-q1', 'user');
  const q2Shell = makeShell('shell-current-q2', 'user');
  const a1Shell = makeShell('shell-current-a1', 'assistant');
  const a2Shell = makeShell('shell-current-a2', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: a1Shell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerX }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 2, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
    makeEvidence({ role: 'assistant', shell: a2Shell, shellIndex: 3, shellOrdinal: 4, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-two-current-owners');
  const post = snapshot(runtime);
  const diag = diagnostics(runtime);
  assert.equal(post.quarantinedAliases.includes(ID.answerX), true);
  assert.equal(post.members.some((member) => publicMemberHasAlias(member, ID.answerX)), false);
  assert.equal(diag.currentAliasConflictCount, 1);
  assert.equal(diag.currentCrossMemberDuplicateCount, 1);
  assert.equal(diag.quarantinedAliasResolutionCount, 0);
  return {
    quarantine: post.quarantinedAliases,
    ownersAfterRepair: post.members.filter((member) => publicMemberHasAlias(member, ID.answerX)).map((member) => member.logicalMemberKey),
    diagnostics: aliasDiagnostics(diag),
  };
}

function fixtureHistoricalOnlyConflict(runtime) {
  const members = [
    makeInternalMember({ key: 'atlas:fixture-history-1', turnNo: 1, questionAliases: [ID.q1], answerAliases: [ID.answerX] }),
    makeInternalMember({ key: 'atlas:fixture-history-2', turnNo: 2, questionAliases: [ID.q2], historyAliases: [ID.answerX] }),
  ];
  const preRepair = {
    alias: ID.answerX,
    candidateLogicalMembers: members.filter((member) => memberHasAlias(member, ID.answerX)).map((member) => member.logicalMemberKey),
  };
  const currentOwners = new Map();
  const quarantine = new Set();
  runtime.internals.chatAtlasRepairResolverOwnership(members, currentOwners, quarantine, new Set());
  const state = runtime.internals.getLedgerState();
  assert.equal(preRepair.candidateLogicalMembers.length, 2);
  assert.equal(quarantine.has(ID.answerX), true);
  assert.equal(members.some((member) => memberHasAlias(member, ID.answerX)), false);
  assert.equal(state.historicalAliasConflictCount, 1);
  assert.equal(state.quarantinedAliasResolutionCount, 0);
  return {
    preRepair,
    postRepair: {
      quarantine: sorted(quarantine),
      remainingOwners: members.filter((member) => memberHasAlias(member, ID.answerX)).map((member) => member.logicalMemberKey),
      historicalAliasConflictCount: state.historicalAliasConflictCount,
      quarantinedAliasResolutionCount: state.quarantinedAliasResolutionCount,
    },
  };
}

function fixtureIncompleteShellMap(runtime) {
  const flow = { id: 'flow-incomplete' };
  const qShell = makeShell('shell-incomplete-q', 'user');
  const answerShell = makeShell('shell-incomplete-answer', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-incomplete-seed');
  const before = snapshot(runtime);
  const stateBefore = runtime.internals.getLedgerState();
  const repairCountBefore = stateBefore.crossMemberAliasRepairCount;
  const quarantineBefore = sorted(stateBefore.quarantinedAliases);
  const delta = applySequence(runtime, [
    makeEvidence({ role: 'user', shell: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 2, shellOrdinal: 4, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-incomplete-rejected');
  const after = snapshot(runtime);
  const diag = diagnostics(runtime);
  assert.equal(delta.skipped, true);
  assert.equal(delta.skipReason, 'incomplete-stable-shell-map');
  assert.equal(stableJson(before.members), stableJson(after.members));
  assert.equal(diag.pairingAdjacencyRejectCount, 1);
  assert.equal(diag.crossMemberAliasRepairCount, repairCountBefore);
  assert.deepEqual(diag.quarantinedAliases, quarantineBefore);
  return {
    retainedMembers: after.members,
    delta: plain(delta),
    pairingAdjacencyRejectCount: diag.pairingAdjacencyRejectCount,
    recentPairingRejections: diag.recentPairingRejections,
  };
}

function fixtureValidAdjacentPair(runtime) {
  const flow = { id: 'flow-valid-adjacent' };
  const qShell = makeShell('shell-valid-q', 'user');
  const answerShell = makeShell('shell-valid-answer', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-valid-adjacent');
  const post = snapshot(runtime);
  const diag = diagnostics(runtime);
  assert.equal(post.members.length, 1);
  assert.equal(post.members[0].answer.primaryAId, ID.answerX);
  assert.equal(post.members[0].noAnswer, false);
  assert.equal(diag.pairingAdjacencyRejectCount, 0);
  return { member: post.members[0], pairingAdjacencyRejectCount: diag.pairingAdjacencyRejectCount };
}

function fixtureNoAnswerEnrichmentGuard(runtime) {
  const flow = { id: 'flow-no-answer' };
  const q1Shell = makeShell('shell-no-answer-q1', 'user');
  const q2Shell = makeShell('shell-no-answer-q2', 'user');
  const answerShell = makeShell('shell-no-answer-x', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerX }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 2, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
  ], 'fixture-no-answer-seed');

  const canonicalQ1 = makeCanonicalRecord({
    turnNo: 1,
    qId: ID.q1,
    primaryAId: ID.answerX,
    answerIds: [ID.answerX],
    aliases: [ID.q1, ID.answerX],
  });
  const canonicalShellBindings = new Map([
    [canonicalQ1, { qShell: q1Shell, answerShells: [] }],
  ]);
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 1, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
    makeEvidence({ role: 'assistant', shell: answerShell, shellIndex: 2, shellOrdinal: 4, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-no-answer-guard', {
    canonicalRecords: [canonicalQ1],
    canonicalShellBindings,
  });
  const post = snapshot(runtime);
  const first = post.members.find((member) => member.turnNo === 1);
  const second = post.members.find((member) => member.turnNo === 2);
  assert.equal(first.noAnswer, true);
  assert.equal(first.answer.primaryAId, null);
  assert.deepEqual(first.answer.currentAnswerIds, []);
  assert.equal(first.answer.aliases.includes(ID.answerX), false);
  assert.equal(publicMemberHasAlias(first, ID.answerX), false);
  assert.equal(second.answer.primaryAId, ID.answerX);
  return { noAnswerMember: first, currentOwner: second.logicalMemberKey };
}

function fixtureQuarantineRecovery(runtime) {
  const flow = { id: 'flow-quarantine-recovery' };
  const q1Shell = makeShell('shell-recovery-q1', 'user');
  const q2Shell = makeShell('shell-recovery-q2', 'user');
  const a1Shell = makeShell('shell-recovery-a1', 'assistant');
  const a2Shell = makeShell('shell-recovery-a2', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: a1Shell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerX }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 2, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
    makeEvidence({ role: 'assistant', shell: a2Shell, shellIndex: 3, shellOrdinal: 4, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-quarantine-create');
  const before = snapshot(runtime);
  assert.equal(before.quarantinedAliases.includes(ID.answerX), true);

  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: a1Shell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: ID.answerY }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 2, shellOrdinal: 3, flowRef: flow, shellTurnId: ID.q2 }),
    makeEvidence({ role: 'assistant', shell: a2Shell, shellIndex: 3, shellOrdinal: 4, flowRef: flow, shellTurnId: ID.answerX }),
  ], 'fixture-quarantine-release');
  const after = snapshot(runtime);
  const owners = after.members.filter((member) => publicMemberHasAlias(member, ID.answerX));
  const quarantineReleaseCount = before.quarantinedAliases.includes(ID.answerX)
    && !after.quarantinedAliases.includes(ID.answerX)
    && owners.length === 1
    ? 1
    : 0;
  assert.equal(after.quarantinedAliases.includes(ID.answerX), false);
  assert.equal(owners.length, 1);
  assert.equal(owners[0].turnNo, 2);
  assert.equal(quarantineReleaseCount, 1);
  // Production counts aliases that remain resolvable while quarantined. A
  // successful release removes X from quarantine, so this safety counter must
  // stay zero; the transition above is the measured recovery evidence.
  assert.equal(after.quarantinedAliasResolutionCount, 0);
  return {
    before: {
      quarantine: before.quarantinedAliases,
      quarantinedAliasResolutionCount: before.quarantinedAliasResolutionCount,
    },
    after: {
      quarantine: after.quarantinedAliases,
      quarantinedAliasResolutionCount: after.quarantinedAliasResolutionCount,
      quarantineReleaseCount,
      ownerKeys: owners.map((member) => member.logicalMemberKey),
    },
    productionCounterSemantics: 'aliases-still-resolvable-while-quarantined',
  };
}

function fixtureBoundedDiagnostics(runtime) {
  for (let index = 1; index <= 15; index += 1) {
    runtime.internals.chatAtlasRecordAliasConflict({
      alias: `fixture-conflict-${String(index).padStart(2, '0')}`,
      winningMemberKey: null,
      winningTurnNo: null,
      losingMembers: [],
      evidenceClass: 'historical',
      action: 'quarantined',
    }, 'historical');
  }
  const state = runtime.internals.getLedgerState();
  const retained = Array.from(state.recentAliasConflicts, (sample) => sample.alias);
  const expected = Array.from({ length: SAMPLE_LIMIT }, (_, offset) => (
    `fixture-conflict-${String(offset + 4).padStart(2, '0')}`
  ));
  assert.equal(state.crossMemberAliasConflictCount, 15);
  assert.equal(state.historicalAliasConflictCount, 15);
  assert.equal(state.recentAliasConflicts.length, SAMPLE_LIMIT);
  assert.deepEqual(retained, expected);
  return {
    cumulativeConflictCount: state.crossMemberAliasConflictCount,
    historicalConflictCount: state.historicalAliasConflictCount,
    retainedSampleCount: state.recentAliasConflicts.length,
    retainedAliases: retained,
  };
}

function fixtureChatBindingReset(runtime) {
  const flowA = { id: 'flow-chat-a' };
  const q1Shell = makeShell('shell-chat-a-q1', 'user');
  const q2Shell = makeShell('shell-chat-a-q2', 'user');
  const a1Shell = makeShell('shell-chat-a-a1', 'assistant');
  const a2Shell = makeShell('shell-chat-a-a2', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: q1Shell, shellIndex: 0, shellOrdinal: 1, flowRef: flowA, shellTurnId: ID.q1 }),
    makeEvidence({ role: 'assistant', shell: a1Shell, shellIndex: 1, shellOrdinal: 2, flowRef: flowA, shellTurnId: ID.answerX }),
    makeEvidence({ role: 'user', shell: q2Shell, shellIndex: 2, shellOrdinal: 3, flowRef: flowA, shellTurnId: ID.q2 }),
    makeEvidence({ role: 'assistant', shell: a2Shell, shellIndex: 3, shellOrdinal: 4, flowRef: flowA, shellTurnId: ID.answerX }),
  ], 'fixture-chat-a-conflict');
  const chatA = snapshot(runtime);
  assert.equal(chatA.chatKey, ID.chatA);
  assert.equal(chatA.quarantinedAliases.includes(ID.answerX), true);

  runtime.setChat(ID.chatB);
  const flowB = { id: 'flow-chat-b' };
  const qBShell = makeShell('shell-chat-b-q', 'user');
  const aBShell = makeShell('shell-chat-b-a', 'assistant');
  applySequence(runtime, [
    makeEvidence({ role: 'user', shell: qBShell, shellIndex: 0, shellOrdinal: 1, flowRef: flowB, shellTurnId: ID.qB }),
    makeEvidence({ role: 'assistant', shell: aBShell, shellIndex: 1, shellOrdinal: 2, flowRef: flowB, shellTurnId: ID.answerY }),
  ], 'fixture-chat-b-isolated');
  const chatB = snapshot(runtime);
  assert.equal(chatB.chatKey, ID.chatB);
  assert.equal(chatB.quarantinedAliases.includes(ID.answerX), false);
  assert.equal(chatB.members.some((member) => publicMemberHasAlias(member, ID.answerX)), false);
  assert.equal(chatB.members.length, 1);
  assert.equal(chatB.members[0].answer.primaryAId, ID.answerY);
  return {
    chatA: { chatKey: chatA.chatKey, quarantine: chatA.quarantinedAliases },
    chatB: {
      chatKey: chatB.chatKey,
      quarantine: chatB.quarantinedAliases,
      resolverAliases: chatB.members[0].resolverAliases,
    },
  };
}

function aliasDiagnostics(diag) {
  return {
    crossMemberAliasConflictCount: diag.crossMemberAliasConflictCount,
    crossMemberAliasRepairCount: diag.crossMemberAliasRepairCount,
    currentAliasConflictCount: diag.currentAliasConflictCount,
    historicalAliasConflictCount: diag.historicalAliasConflictCount,
    quarantinedAliasCount: diag.quarantinedAliasCount,
    quarantinedAliasResolutionCount: diag.quarantinedAliasResolutionCount,
    recentAliasConflicts: diag.recentAliasConflicts,
  };
}

const FIXTURES = Object.freeze([
  { name: 'current-owner-repairs-historical-owner', run: fixtureCurrentOwnerRepairsHistoricalOwner },
  { name: 'same-member-duplicate-evidence', run: fixtureSameMemberDuplicateEvidence },
  { name: 'two-current-owners', run: fixtureTwoCurrentOwners },
  { name: 'historical-only-conflict', run: fixtureHistoricalOnlyConflict },
  { name: 'incomplete-shell-map', run: fixtureIncompleteShellMap },
  { name: 'valid-adjacent-pair', run: fixtureValidAdjacentPair },
  { name: 'no-answer-enrichment-guard', run: fixtureNoAnswerEnrichmentGuard },
  { name: 'quarantine-recovery', run: fixtureQuarantineRecovery },
  { name: 'bounded-diagnostics', run: fixtureBoundedDiagnostics },
  { name: 'chat-binding-reset', run: fixtureChatBindingReset },
]);

function executeFixtureOnce(definition, instrumentation, runNumber) {
  const runtime = createVmRuntime(instrumentation, `${definition.name}:run-${runNumber}`);
  try {
    const evidence = definition.run(runtime);
    assertLegacySource(runtime);
    assertForbiddenSideEffectsZero(runtime);
    return stableNormalize({
      ok: true,
      evidence,
      canonicalSource: sourceSafety(runtime),
      sideEffects: runtime.counters,
    });
  } catch (error) {
    if (error instanceof InstrumentationError) throw error;
    return stableNormalize({
      ok: false,
      error: {
        name: String(error?.name || 'Error'),
        message: String(error?.message || error || 'fixture failed'),
      },
      canonicalSource: sourceSafety(runtime),
      sideEffects: runtime.counters,
    });
  }
}

function addSideEffects(total, counters) {
  for (const [key, value] of Object.entries(counters || {})) {
    total[key] = Number(total[key] || 0) + Number(value || 0);
  }
}

function runFixtures(instrumentation) {
  const fixtureResults = [];
  const determinismResults = [];
  const sideEffectTotals = createSideEffectCounters();
  for (const definition of FIXTURES) {
    const first = executeFixtureOnce(definition, instrumentation, 1);
    const second = executeFixtureOnce(definition, instrumentation, 2);
    const firstJson = stableJson(first);
    const secondJson = stableJson(second);
    const deterministic = firstJson === secondJson;
    addSideEffects(sideEffectTotals, first.sideEffects);
    addSideEffects(sideEffectTotals, second.sideEffects);
    const result = {
      name: definition.name,
      ok: first.ok === true && second.ok === true && deterministic,
      evidence: first.evidence || null,
      error: first.error || second.error || null,
      canonicalSource: first.canonicalSource,
      sideEffects: first.sideEffects,
      deterministic,
      firstNormalizedSha256: sha256(firstJson),
      secondNormalizedSha256: sha256(secondJson),
    };
    fixtureResults.push(result);
    determinismResults.push({
      name: definition.name,
      deterministic,
      firstNormalizedSha256: result.firstNormalizedSha256,
      secondNormalizedSha256: result.secondNormalizedSha256,
    });
  }
  return { fixtureResults, determinismResults, sideEffectTotals };
}

function printReport(report) {
  for (const fixture of report.fixtureResults || []) {
    const detail = fixture.ok
      ? 'PASS'
      : `FAIL${fixture.error?.message ? `: ${fixture.error.message}` : ''}`;
    console.log(`${fixture.name}: ${detail}`);
  }
  const passed = (report.fixtureResults || []).filter((fixture) => fixture.ok).length;
  console.log(`Summary: ${passed}/${(report.fixtureResults || []).length} fixtures passed; verdict=${report.verdict}`);
  console.log('--- CV26 JSON ---');
  console.log(JSON.stringify(report, null, 2));
}

function instrumentationFailureReport(error, productionSourceSha256 = null) {
  return {
    ok: false,
    verdict: 'INSTRUMENTATION_PRECONDITION_FAILED',
    productionSourcePath: PRODUCTION_SOURCE_PATH,
    productionSourceSha256,
    instrumentationAnchors: [],
    productionFunctionsExposed: [],
    fixtureResults: [],
    determinismResults: [],
    sideEffectTotals: createSideEffectCounters(),
    diagnosticCoverage: {},
    sourceSetterCalls: 0,
    error: {
      name: String(error?.name || 'InstrumentationError'),
      message: String(error?.message || error || 'instrumentation failed'),
      details: error?.details || null,
    },
  };
}

function main() {
  let productionSourceSha256 = null;
  try {
    if (!fs.existsSync(PRODUCTION_SOURCE_ABS)) {
      throw new InstrumentationError(`production source missing: ${PRODUCTION_SOURCE_PATH}`);
    }
    const productionSource = fs.readFileSync(PRODUCTION_SOURCE_ABS, 'utf8');
    productionSourceSha256 = sha256(productionSource);
    if (productionSourceSha256 !== EXPECTED_SOURCE_SHA256) {
      throw new InstrumentationError('production source SHA-256 does not match the reviewed CV-2.6 baseline', {
        expected: EXPECTED_SOURCE_SHA256,
        actual: productionSourceSha256,
      });
    }
    const instrumentation = buildInstrumentedSource(productionSource);
    const run = runFixtures(instrumentation);
    const forbiddenTotals = [
      'domWrites',
      'storageWrites',
      'canonicalCommits',
      'paginationCalls',
      'unmountCalls',
      'miniMapCalls',
      'networkCalls',
      'sourceSetterCalls',
    ].reduce((sum, key) => sum + Number(run.sideEffectTotals[key] || 0), 0);
    const ok = run.fixtureResults.every((fixture) => fixture.ok)
      && run.determinismResults.every((fixture) => fixture.deterministic)
      && forbiddenTotals === 0;
    const report = stableNormalize({
      ok,
      verdict: ok ? 'NODE_HARNESS_REQUIRED_PASS' : 'NODE_HARNESS_REQUIRED_FAILURE',
      productionSourcePath: PRODUCTION_SOURCE_PATH,
      productionSourceSha256,
      instrumentationAnchors: instrumentation.anchors,
      productionFunctionsExposed: instrumentation.functionsExposed,
      bootstrapSuppression: instrumentation.bootstrap,
      fixtureResults: run.fixtureResults,
      determinismResults: run.determinismResults,
      sideEffectTotals: run.sideEffectTotals,
      diagnosticCoverage: {
        structuralPairing: true,
        currentOwnership: true,
        historicalRepair: true,
        currentAmbiguityQuarantine: true,
        historicalAmbiguityQuarantine: true,
        noAnswerCleanup: true,
        quarantineRecovery: true,
        boundedSamples: true,
        chatBindingIsolation: true,
        productionSampleLimit: SAMPLE_LIMIT,
      },
      effectiveCanonicalSource: LEGACY_SOURCE,
      sourceSetterCalls: run.sideEffectTotals.sourceSetterCalls,
    });
    printReport(report);
    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    const report = instrumentationFailureReport(error, productionSourceSha256);
    printReport(report);
    process.exitCode = 2;
  }
}

main();
