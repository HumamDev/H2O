#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const MINIMAP_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const coreSource = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const miniMapSource = fs.readFileSync(path.join(ROOT, MINIMAP_PATH), 'utf8');
const CHAT_KEY = 'fixture-chat-completeness';

let assertionCount = 0;
const results = [];
const aggregateSideEffects = {
  sourceSetterCalls: 0,
  navigationMutations: 0,
  domMutations: 0,
  userActions: 0,
  storageReads: 0,
  storageWrites: 0,
  automaticStageExecutions: 0,
};

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || start !== source.lastIndexOf(anchor)) {
    throw new Error(`instrumentation-anchor-invalid:${name}:${countOccurrences(source, anchor)}`);
  }
  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) throw new Error(`instrumentation-body-missing:${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`instrumentation-function-unclosed:${name}`);
}

function forbidden(counters, key, label) {
  counters[key] += 1;
  throw new Error(`forbidden-side-effect:${label}`);
}

function makeCounters() {
  return {
    sourceSetterCalls: 0,
    navigationMutations: 0,
    domMutations: 0,
    userActions: 0,
    storageReads: 0,
    storageWrites: 0,
    automaticStageExecutions: 0,
  };
}

function guardedStorage(counters, label) {
  return {
    getItem() { counters.storageReads += 1; return null; },
    setItem() { return forbidden(counters, 'storageWrites', `${label}.setItem`); },
    removeItem() { return forbidden(counters, 'storageWrites', `${label}.removeItem`); },
    clear() { return forbidden(counters, 'storageWrites', `${label}.clear`); },
    key() { return null; },
    get length() { return 0; },
  };
}

function finishCounters(counters) {
  for (const key of Object.keys(aggregateSideEffects)) {
    aggregateSideEffects[key] += counters[key];
  }
}

const coreFunctionNames = [
  'chatAtlasCurrentChatKey',
  'chatAtlasFreeze',
  'chatAtlasNormalizeChatKey',
  'chatAtlasNullableCount',
  'chatAtlasReadMiniMapCompletenessDiagnostics',
  'chatAtlasValidCompletenessProof',
  'chatAtlasEvaluateHistoricalCompleteness',
  'chatAtlasInternalExactness',
  'chatAtlasBuildProjectionConvergenceDiagnostics',
  'getChatAtlasHistoricalCompleteness',
];
const miniMapFunctionNames = [
  'boundedCacheMergeDecision',
  'rememberCacheMergeDecision',
  'boundedCachePersistenceDecision',
  'rememberCachePersistenceDecision',
  'getCacheCompletenessDiagnostics',
];

for (const blocker of [
  "blockers.push('no-answer-minimap-primary-present')",
  "blockers.push('minimap-primary-not-member-answer')",
]) {
  if (countOccurrences(coreSource, blocker) !== 1) throw new Error(`required-blocker-anchor-invalid:${blocker}`);
}
if (countOccurrences(coreSource, 'getChatAtlasHistoricalCompleteness,') !== 1) {
  throw new Error('turn-runtime-completeness-export-anchor-invalid');
}
if (countOccurrences(miniMapSource, 'getCacheCompletenessDiagnostics,') !== 1) {
  throw new Error('minimap-diagnostic-export-anchor-invalid');
}
if (countOccurrences(coreSource, 'TOPW') !== 0) {
  throw new Error('production-completeness-lookup-must-not-reference-TOPW');
}

const coreProgram = `
'use strict';
const D = { location };
const W = globalThis;
const H2O = {
  util: {
    getChatId() {
      const match = location.pathname.match(/\\/c\\/([a-z0-9-]+)/i);
      return match ? match[1] : '';
    },
  },
};
${coreFunctionNames.map((name) => extractFunction(coreSource, name)).join('\n')}
globalThis.__PROJECTION_INTERNALS__ = Object.freeze({
  chatAtlasNormalizeChatKey,
  chatAtlasEvaluateHistoricalCompleteness,
  chatAtlasBuildProjectionConvergenceDiagnostics,
  getChatAtlasHistoricalCompleteness,
});
`;

const miniMapProgram = `
'use strict';
let fixtureChatKey = '${CHAT_KEY}';
const S = {
  turnList: [],
  lastCoreProjectionChatKey: '',
  lastCacheMergeChatKey: '',
  lastCachePersistenceChatKey: '',
  lastCoreProjectedTotal: null,
  lastCacheMergeDecision: null,
  lastCachePersistenceDecision: null,
};
function resolveChatId() { return fixtureChatKey; }
${miniMapFunctionNames.map((name) => extractFunction(miniMapSource, name)).join('\n')}
globalThis.__MINIMAP_DIAGNOSTIC_INTERNALS__ = Object.freeze({
  rememberCacheMergeDecision,
  rememberCachePersistenceDecision,
  getCacheCompletenessDiagnostics,
  setChatKey(value) { fixtureChatKey = String(value || ''); },
  setPublishedCount(value) { S.turnList = Array.from({ length: Number(value || 0) }, () => ({})); },
});
`;

function createCoreHarness({
  pathname = `/c/${CHAT_KEY}`,
  miniMapDiagnostics = null,
  topMiniMapDiagnostics = null,
  throwingTop = false,
} = {}) {
  const counters = makeCounters();
  const location = {
    pathname,
    href: `https://chatgpt.com${pathname}`,
    reload() { return forbidden(counters, 'navigationMutations', 'location.reload'); },
  };
  const miniMapApi = (diagnostics) => diagnostics ? Object.freeze({
    getCacheCompletenessDiagnostics() { return diagnostics; },
  }) : null;
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
    location,
    document: Object.freeze({
      location,
      createElement() { return forbidden(counters, 'domMutations', 'document.createElement'); },
    }),
    history: Object.freeze({
      pushState() { return forbidden(counters, 'navigationMutations', 'history.pushState'); },
      replaceState() { return forbidden(counters, 'navigationMutations', 'history.replaceState'); },
    }),
    localStorage: guardedStorage(counters, 'localStorage'),
    sessionStorage: guardedStorage(counters, 'sessionStorage'),
    H2O_MM_CORE_API: miniMapApi(miniMapDiagnostics),
    H2O_Pagination: Object.freeze({
      applySetting() { return forbidden(counters, 'userActions', 'Pagination.applySetting'); },
    }),
    setChatAtlasCanonicalSource() {
      return forbidden(counters, 'sourceSetterCalls', 'setChatAtlasCanonicalSource');
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  if (throwingTop) {
    Object.defineProperty(sandbox, 'top', {
      configurable: true,
      get() { throw new Error('fixture-cross-origin-top'); },
    });
  } else if (topMiniMapDiagnostics) {
    sandbox.top = Object.freeze({ H2O_MM_CORE_API: miniMapApi(topMiniMapDiagnostics) });
  } else {
    sandbox.top = sandbox;
  }
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: 'cv3.3-projection-completeness-core',
  });
  vm.runInContext(coreProgram, context, { filename: CORE_PATH, timeout: 2_000 });
  return { counters, internals: context.__PROJECTION_INTERNALS__ };
}

function createMiniMapHarness() {
  const counters = makeCounters();
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
    localStorage: guardedStorage(counters, 'localStorage'),
    sessionStorage: guardedStorage(counters, 'sessionStorage'),
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: 'cv3.3-projection-completeness-minimap',
  });
  vm.runInContext(miniMapProgram, context, { filename: MINIMAP_PATH, timeout: 2_000 });
  return { counters, internals: context.__MINIMAP_DIAGNOSTIC_INTERNALS__ };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function unknownDiagnostics(overrides = {}) {
  return {
    chatKey: CHAT_KEY,
    cachedTurnCount: 3,
    publishedTurnCount: 3,
    observedTurnCount: 3,
    offDomRetainedCount: 0,
    lastMergeDecision: {
      accepted: true,
      mode: 'live-wins',
      cachedCount: 3,
      liveCount: 3,
      outputCount: 3,
      overlapCount: 3,
      sanitizedRows: 0,
      reason: 'complete-overlap-refresh',
      completeness: 'unknown',
    },
    lastPersistenceDecision: null,
    ...overrides,
  };
}

function partialDiagnostics(overrides = {}) {
  return unknownDiagnostics({
    cachedTurnCount: 38,
    publishedTurnCount: 38,
    observedTurnCount: 3,
    offDomRetainedCount: 35,
    lastMergeDecision: {
      accepted: true,
      mode: 'union',
      cachedCount: 38,
      liveCount: 3,
      outputCount: 38,
      overlapCount: 3,
      sanitizedRows: 1,
      reason: 'cache-preserving-union',
      completeness: 'incomplete',
    },
    ...overrides,
  });
}

function completeProof(overrides = {}) {
  return {
    status: 'complete',
    kind: 'independent-end-to-end-coverage',
    independent: true,
    endToEndCoverage: true,
    current: true,
    chatKey: CHAT_KEY,
    basis: 'fixture-independent-end-to-end-proof',
    ...overrides,
  };
}

function runCore(diag, callback, options = {}) {
  const harness = createCoreHarness({
    pathname: options.pathname,
    miniMapDiagnostics: diag,
    topMiniMapDiagnostics: options.topMiniMapDiagnostics,
    throwingTop: options.throwingTop === true,
  });
  try {
    callback(harness.internals, harness.counters);
  } finally {
    finishCounters(harness.counters);
  }
}

function fixture(name, callback) {
  const before = assertionCount;
  try {
    callback();
    results.push({ name, ok: true, assertions: assertionCount - before });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({ name, ok: false, assertions: assertionCount - before, error: String(error?.message || error) });
    process.stdout.write(`FAIL ${name}: ${String(error?.message || error)}\n`);
  }
}

fixture('exact and independently complete', () => runCore(unknownDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, unknownDiagnostics(), completeProof()));
  equal(result.parityStatus, 'exact');
  equal(result.internalExactness.exact, true);
  equal(result.historicalCompleteness.status, 'complete');
  equal(result.historicalCompleteness.completenessProofAvailable, true);
}));

fixture('exact but partial', () => runCore(partialDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, partialDiagnostics()));
  equal(result.parityStatus, 'exact');
  equal(result.internalExactness.exact, true);
  equal(result.historicalCompleteness.status, 'incomplete');
  equal(result.warning, 'incomplete-projection-coverage');
  equal(result.blockers, []);
}));

fixture('exact but historically unknown', () => runCore(unknownDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, unknownDiagnostics()));
  equal(result.parityStatus, 'exact');
  equal(result.historicalCompleteness.status, 'unknown');
  equal(result.warning, null);
}));

fixture('core count agreement alone cannot prove completeness', () => runCore(unknownDiagnostics({ coreProjectedTotal: 3 }), (api) => {
  equal(plain(api.chatAtlasEvaluateHistoricalCompleteness(unknownDiagnostics({ coreProjectedTotal: 3 }))).historicalCompleteness.status, 'unknown');
}));

fixture('section and role-node agreement cannot prove completeness', () => runCore(unknownDiagnostics({ sectionScanCount: 3, roleNodeCount: 3 }), (api) => {
  equal(plain(api.chatAtlasEvaluateHistoricalCompleteness(unknownDiagnostics({ sectionScanCount: 3, roleNodeCount: 3 }))).historicalCompleteness.status, 'unknown');
}));

fixture('ordinary and project routes normalize to one chat key', () => {
  runCore(null, (api) => equal(api.chatAtlasNormalizeChatKey(`/c/${CHAT_KEY}`), CHAT_KEY), { pathname: `/c/${CHAT_KEY}` });
  runCore(null, (api) => equal(api.chatAtlasNormalizeChatKey(`/g/fixture-project/c/${CHAT_KEY}`), CHAT_KEY), { pathname: `/g/fixture-project/c/${CHAT_KEY}` });
});

fixture('production completeness lookup has no TOPW binding', () => {
  equal(countOccurrences(coreSource, 'TOPW'), 0);
  check(!coreProgram.includes('TOPW'));
});

fixture('same-window MiniMap diagnostics reach historical completeness', () => runCore(partialDiagnostics(), (api) => {
  const result = plain(api.getChatAtlasHistoricalCompleteness());
  equal(result.status, 'incomplete');
  equal(result.cachedTurnCount, 38);
  equal(result.publishedTurnCount, 38);
  equal(result.observedTurnCount, 3);
  equal(result.offDomRetainedCount, 35);
}));

fixture('accessible top-window MiniMap diagnostics are read', () => runCore(null, (api) => {
  const result = plain(api.getChatAtlasHistoricalCompleteness());
  equal(result.status, 'incomplete');
  equal(result.cachedTurnCount, 38);
  equal(result.observedTurnCount, 3);
}, { topMiniMapDiagnostics: partialDiagnostics() }));

fixture('throwing top access safely falls back to same window', () => runCore(partialDiagnostics(), (api) => {
  const result = plain(api.getChatAtlasHistoricalCompleteness());
  equal(result.status, 'incomplete');
  equal(result.cachedTurnCount, 38);
  equal(result.offDomRetainedCount, 35);
}, { throwingTop: true }));

fixture('MiniMap diagnostics absence is safe and unknown', () => runCore(null, (api) => {
  const result = plain(api.getChatAtlasHistoricalCompleteness());
  equal(result.status, 'unknown');
  equal(result.cachedTurnCount, null);
}));

fixture('protective shrink refusal classifies incomplete without blocker', () => {
  const diag = unknownDiagnostics({
    cachedTurnCount: 38,
    lastPersistenceDecision: { ok: false, status: 'shrink-not-proven', previousCount: 38, incomingCount: 3, proofAccepted: false, reason: 'shrink-proof-missing' },
  });
  runCore(diag, (api) => {
    const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, diag));
    equal(result.historicalCompleteness.status, 'incomplete');
    equal(result.historicalCompleteness.basis, 'unproven-shrink-refused');
    equal(result.blockers, []);
  });
});

fixture('unproven destructive shrink creates blocker', () => {
  const diag = unknownDiagnostics({
    lastPersistenceDecision: { ok: true, status: 'ok', previousCount: 38, incomingCount: 3, proofAccepted: false, reason: 'unexpected-write' },
  });
  runCore(diag, (api) => {
    const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, diag));
    equal(result.parityStatus, 'mismatch');
    check(result.blockers.includes('unproven-cache-shrink-persisted'));
    equal(result.internalExactness.exact, false);
    equal(result.historicalCompleteness.status, 'incomplete');
    equal(result.warning, 'incomplete-projection-coverage');
  });
});

fixture('accepted proven shrink does not block', () => {
  const diag = unknownDiagnostics({
    lastPersistenceDecision: { ok: true, status: 'ok', previousCount: 38, incomingCount: 30, proofAccepted: true, reason: 'branch-deleted' },
  });
  runCore(diag, (api) => {
    const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, diag));
    equal(result.blockers, []);
    equal(result.parityStatus, 'exact');
  });
});

fixture('partial evidence emits one deduplicated warning', () => runCore(partialDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, partialDiagnostics()));
  equal(result.warning, 'incomplete-projection-coverage');
  equal([result.warning].filter(Boolean).length, 1);
}));

fixture('existing convergence blockers remain unchanged', () => runCore(unknownDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('mismatch', ['count-mismatch', 'washer-mismatch'], 2, unknownDiagnostics()));
  equal(result.blockers, ['count-mismatch', 'washer-mismatch']);
  equal(result.internalExactness.mismatchCount, 2);
}));

fixture('existing NO ANSWER primary blockers remain unchanged', () => runCore(unknownDiagnostics(), (api) => {
  const blockers = ['no-answer-minimap-primary-present', 'minimap-primary-not-member-answer'];
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('mismatch', blockers, 2, unknownDiagnostics()));
  equal(result.blockers, blockers);
}));

fixture('existing parity status semantics remain unchanged', () => runCore(unknownDiagnostics(), (api) => {
  equal(plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('warn', [], 0, unknownDiagnostics())).parityStatus, 'warn');
  equal(plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('unknown', [], 0, unknownDiagnostics())).parityStatus, 'unknown');
}));

fixture('diagnostics are bounded and contain no conversation rows', () => runCore(partialDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, partialDiagnostics()));
  const serialized = JSON.stringify(result);
  check(serialized.length < 4000);
  for (const forbiddenKey of ['ledgerRows', 'canonicalRows', 'qId', 'answerIds', 'prompt', 'variants']) {
    check(!serialized.includes(`"${forbiddenKey}"`), `must not expose ${forbiddenKey}`);
  }
}));

fixture('source setter invocations remain zero', () => runCore(unknownDiagnostics(), (api, counters) => {
  api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, unknownDiagnostics());
  equal(counters.sourceSetterCalls, 0);
}));

fixture('navigation mutations remain zero', () => runCore(unknownDiagnostics(), (api, counters) => {
  api.getChatAtlasHistoricalCompleteness();
  equal(counters.navigationMutations, 0);
}));

fixture('DOM mutations remain zero', () => runCore(unknownDiagnostics(), (api, counters) => {
  api.getChatAtlasHistoricalCompleteness();
  equal(counters.domMutations, 0);
}));

fixture('user actions remain zero', () => runCore(unknownDiagnostics(), (api, counters) => {
  api.getChatAtlasHistoricalCompleteness();
  equal(counters.userActions, 0);
}));

fixture('browser storage writes remain zero', () => runCore(unknownDiagnostics(), (api, counters) => {
  api.getChatAtlasHistoricalCompleteness();
  equal(counters.storageWrites, 0);
  equal(counters.storageReads, 0);
}));

fixture('repeated completeness reads are stable and side-effect-free', () => runCore(partialDiagnostics(), (api, counters) => {
  const first = plain(api.getChatAtlasHistoricalCompleteness());
  const second = plain(api.getChatAtlasHistoricalCompleteness());
  equal(first, second);
  equal(counters.storageReads, 0);
  equal(counters.storageWrites, 0);
}));

fixture('Pagination disabled never proves completeness', () => runCore(unknownDiagnostics({ paginationEnabled: false }), (api) => {
  equal(plain(api.chatAtlasEvaluateHistoricalCompleteness(unknownDiagnostics({ paginationEnabled: false }))).historicalCompleteness.status, 'unknown');
}));

fixture('page-divider state never proves completeness', () => runCore(unknownDiagnostics({ pageDividerCount: 1 }), (api) => {
  equal(plain(api.chatAtlasEvaluateHistoricalCompleteness(unknownDiagnostics({ pageDividerCount: 1 }))).historicalCompleteness.status, 'unknown');
}));

fixture('internal exactness and completeness differ without contradiction', () => runCore(partialDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, partialDiagnostics()));
  equal(result.internalExactness.exact, true);
  equal(result.historicalCompleteness.status, 'incomplete');
}));

fixture('internal mismatch can coexist with independent completeness', () => runCore(unknownDiagnostics(), (api) => {
  const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('mismatch', ['count-mismatch'], 1, unknownDiagnostics(), completeProof()));
  equal(result.internalExactness.exact, false);
  equal(result.historicalCompleteness.status, 'complete');
  equal(result.blockers, ['count-mismatch']);
}));

fixture('diagnostic accessor returns immutable copied objects', () => {
  const harness = createMiniMapHarness();
  try {
    harness.internals.setPublishedCount(38);
    harness.internals.rememberCacheMergeDecision(CHAT_KEY, partialDiagnostics().lastMergeDecision);
    const first = harness.internals.getCacheCompletenessDiagnostics();
    const second = harness.internals.getCacheCompletenessDiagnostics();
    check(Object.isFrozen(first));
    check(Object.isFrozen(first.lastMergeDecision));
    check(first !== second);
    check(first.lastMergeDecision !== second.lastMergeDecision);
  } finally { finishCounters(harness.counters); }
});

fixture('mutating accessor output cannot change internal state', () => {
  const harness = createMiniMapHarness();
  try {
    harness.internals.setPublishedCount(38);
    harness.internals.rememberCacheMergeDecision(CHAT_KEY, partialDiagnostics().lastMergeDecision);
    const first = harness.internals.getCacheCompletenessDiagnostics();
    try { first.lastMergeDecision.liveCount = 99; } catch {}
    const second = plain(harness.internals.getCacheCompletenessDiagnostics());
    equal(second.lastMergeDecision.liveCount, 3);
  } finally { finishCounters(harness.counters); }
});

fixture('diagnostic accessor exposes no raw cache identities', () => {
  const harness = createMiniMapHarness();
  try {
    harness.internals.setPublishedCount(38);
    harness.internals.rememberCacheMergeDecision(CHAT_KEY, partialDiagnostics().lastMergeDecision);
    const serialized = JSON.stringify(harness.internals.getCacheCompletenessDiagnostics());
    for (const forbiddenKey of ['turns', 'rows', 'qIds', 'answerIds', 'prompts', 'variants', 'removedQIds']) {
      check(!serialized.includes(`"${forbiddenKey}"`), `must not expose ${forbiddenKey}`);
    }
  } finally { finishCounters(harness.counters); }
});

fixture('union 38 to 3 to 38 classifies incomplete', () => {
  const harness = createMiniMapHarness();
  try {
    harness.internals.setPublishedCount(38);
    harness.internals.rememberCacheMergeDecision(CHAT_KEY, partialDiagnostics().lastMergeDecision);
    const diag = plain(harness.internals.getCacheCompletenessDiagnostics());
    runCore(diag, (api) => {
      equal(plain(api.chatAtlasEvaluateHistoricalCompleteness(diag)).historicalCompleteness.status, 'incomplete');
      equal(diag.offDomRetainedCount, 35);
    });
  } finally { finishCounters(harness.counters); }
});

fixture('live-wins equal or growth does not prove completeness', () => runCore(unknownDiagnostics(), (api) => {
  const result = plain(api.chatAtlasEvaluateHistoricalCompleteness(unknownDiagnostics()));
  equal(result.historicalCompleteness.status, 'unknown');
  equal(result.historicalCompleteness.completenessProofAvailable, false);
}));

fixture('protective persistence refusal is not an invariant failure', () => {
  const diag = unknownDiagnostics({
    cachedTurnCount: 38,
    lastPersistenceDecision: { ok: false, status: 'shrink-not-proven', previousCount: 38, incomingCount: 3, proofAccepted: false, reason: 'shrink-proof-missing' },
  });
  runCore(diag, (api) => {
    const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, diag));
    equal(result.parityStatus, 'exact');
    check(!result.blockers.includes('unproven-cache-shrink-persisted'));
    equal(result.historicalCompleteness.persistenceProtection.status, 'shrink-not-proven');
  });
});

fixture('accepted shrink evidence omits removed identities', () => {
  const diag = unknownDiagnostics({
    lastPersistenceDecision: { ok: true, status: 'ok', previousCount: 38, incomingCount: 30, proofAccepted: true, reason: 'variant-switched', removedQIds: ['must-not-leak'] },
  });
  runCore(diag, (api) => {
    const result = plain(api.chatAtlasBuildProjectionConvergenceDiagnostics('exact', [], 0, diag));
    equal(result.historicalCompleteness.persistenceProtection.proofAccepted, true);
    equal(result.historicalCompleteness.persistenceProtection.reason, 'variant-switched');
    check(!JSON.stringify(result).includes('removedQIds'));
    check(!JSON.stringify(result).includes('must-not-leak'));
  });
});

const failures = results.filter((result) => !result.ok);
for (const [key, value] of Object.entries(aggregateSideEffects)) {
  equal(value, 0, `${key} must remain zero across validator execution`);
}

const summary = {
  ok: failures.length === 0,
  fixtureCount: results.length,
  passed: results.length - failures.length,
  failures: failures.length,
  assertionCount,
  productionFiles: [CORE_PATH, MINIMAP_PATH],
  productionSourceSha256: {
    core: createHash('sha256').update(coreSource).digest('hex'),
    miniMap: createHash('sha256').update(miniMapSource).digest('hex'),
  },
  productionFunctionsExposed: {
    core: coreFunctionNames,
    miniMap: miniMapFunctionNames,
  },
  sideEffects: aggregateSideEffects,
  results,
};

process.stdout.write(`${JSON.stringify(summary)}\n`);
process.exitCode = failures.length ? 1 : 0;
