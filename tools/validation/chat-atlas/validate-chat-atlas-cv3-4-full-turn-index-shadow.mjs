#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARCHIVE_PATH = 'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js';
const CORE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const archiveSource = fs.readFileSync(path.join(ROOT, ARCHIVE_PATH), 'utf8');
const coreSource = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const Q29 = '29a40c98-0bd8-48cd-be80-0273311a4977';
const A545 = '54520999-dedf-4f01-8c60-ac8adcc2c066';
const D824 = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
const A84 = '84c7e73c-5fb7-44f6-a930-72e92d369c5a';
const A733 = '733fa31a-7d11-4ce5-b570-8ffa474670d4';
const SAMPLE_LIMIT = 12;

let assertionCount = 0;
const fixtures = [];
const aggregate = {
  sourceSetterCalls: 0,
  navigationMutations: 0,
  domMutations: 0,
  userActions: 0,
  storageWrites: 0,
  networkReads: 0,
  networkWrites: 0,
  automaticCanaryExecutions: 0,
};

function equal(actual, expected, message) {
  assertionCount += 1;
  const clean = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(clean(actual), clean(expected), message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

function fixture(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => fixtures.push({ name, ok: true }))
    .catch((error) => {
      fixtures.push({ name, ok: false, error: String(error?.stack || error) });
    });
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function extractFunction(source, name) {
  const anchors = [`  function ${name}(`, `  async function ${name}(`];
  const matches = anchors.map((anchor) => ({ anchor, index: source.indexOf(anchor) })).filter((item) => item.index >= 0);
  if (matches.length !== 1 || source.indexOf(matches[0].anchor) !== source.lastIndexOf(matches[0].anchor)) {
    throw new Error(`instrumentation-anchor-invalid:${name}`);
  }
  const start = matches[0].index;
  const signatureEnd = source.indexOf(') {', start);
  const bodyStart = signatureEnd >= 0 ? signatureEnd + 2 : -1;
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
      if (ch === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
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
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`instrumentation-function-unclosed:${name}`);
}

const archiveFunctions = [
  'isObj',
  'nowIso',
  'toChatId',
  'stableHash',
  'readChatGptAccessToken',
  'nativeConversationHeaders',
  'conversationTurnIndexFailure',
  'conversationTurnIndexIdentity',
  'conversationTurnIndexMessageId',
  'conversationTurnIndexRole',
  'conversationTurnIndexStopped',
  'conversationTurnIndexPlaceholder',
  'conversationTurnIndexIdentityFingerprint',
  'normalizeBackendConversationTurnIndexUnsafe',
  'normalizeBackendConversationTurnIndex',
  'fetchConversationTurnIndex',
];

const archiveProgram = `
'use strict';
const W = globalThis;
const TURN_INDEX_SCHEMA = 1;
const TURN_INDEX_FETCH_TIMEOUT_MS = 12000;
${archiveFunctions.map((name) => extractFunction(archiveSource, name)).join('\n')}
globalThis.__TURN_INDEX_ARCHIVE__ = Object.freeze({
  normalizeBackendConversationTurnIndex,
  fetchConversationTurnIndex,
});
`;

function instrumentCore() {
  const names = [
    'chatAtlasFullIndexRoute',
    'chatAtlasFullIndexReadMiniMapRows',
    'chatAtlasFullIndexProjectionRow',
    'chatAtlasFullIndexCompareProjection',
    'chatAtlasCompareFullConversationIndex',
    'getConversationTurnIndexDiagnostics',
    'chatAtlasResetFullIndexRoute',
    'chatAtlasTriggerFullConversationIndex',
  ];
  for (const name of names) {
    if (countOccurrences(coreSource, `  function ${name}(`) !== 1) {
      throw new Error(`core-instrumentation-anchor-invalid:${name}`);
    }
  }
  const setter = '  function setChatAtlasCanonicalSource(value) {\n';
  const marker = coreSource.split('\n').find((line) => line.includes('🟨 7) TIME / OBSERVERS')) || '';
  const close = '\n})();';
  if (countOccurrences(coreSource, setter) !== 1 || countOccurrences(coreSource, marker) !== 1) {
    throw new Error('core-bootstrap-anchor-invalid');
  }
  let source = coreSource.replace(setter, `${setter}    globalThis.__FULL_INDEX_SETTER_GUARD__();\n`);
  const markerIndex = source.indexOf(marker);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('core-bootstrap-boundary-invalid');
  const exportBlock = [
    '  globalThis.__TURN_INDEX_CORE__ = Object.freeze({',
    '    chatAtlasFullIndexRoute,',
    '    chatAtlasCompareFullConversationIndex,',
    '    getConversationTurnIndexDiagnostics,',
    '    chatAtlasTriggerFullConversationIndex,',
    '    reset() {',
    '      chatAtlasResetFullIndexRoute(chatAtlasFullIndexRoute(), false);',
    '      turnState.turns = [];',
    '      chatAtlasLedgerState.members = [];',
    '    },',
    '    setCanonicalRows(rows) { turnState.turns = Array.isArray(rows) ? rows.slice() : []; },',
    '    setLedgerRows(rows) {',
    '      chatAtlasLedgerState.members = (Array.isArray(rows) ? rows : []).map((row, index) => ({',
    '        turnNo: index + 1,',
    '        logicalMemberKey: `fixture:${index + 1}`,',
    '        noAnswer: row?.noAnswer === true,',
    '        question: { qId: row?.qId || null, currentAliases: row?.qId ? [row.qId] : [] },',
    '        answer: {',
    '          currentAnswerIds: Array.isArray(row?.answerVariants) ? row.answerVariants.slice() : [],',
    '          currentAliases: Array.isArray(row?.answerVariants) ? row.answerVariants.slice() : [],',
    '        },',
    '      }));',
    '    },',
    '    state: chatAtlasFullIndexState,',
    '  });',
    '  globalThis.__TURN_INDEX_CORE_BOOTSTRAP_SUPPRESSED__ = true;',
  ].join('\n');
  return `${source.slice(0, markerIndex)}${exportBlock}${close}\n`;
}

const coreProgram = instrumentCore();

function sideEffectCounters() {
  return {
    sourceSetterCalls: 0,
    navigationMutations: 0,
    domMutations: 0,
    userActions: 0,
    storageWrites: 0,
    networkReads: 0,
    networkWrites: 0,
    automaticCanaryExecutions: 0,
  };
}

function forbidden(counters, key, label) {
  counters[key] += 1;
  throw new Error(`forbidden-side-effect:${label}`);
}

function storage(counters, label) {
  return {
    getItem() { return null; },
    key() { return null; },
    get length() { return 0; },
    setItem() { return forbidden(counters, 'storageWrites', `${label}.setItem`); },
    removeItem() { return forbidden(counters, 'storageWrites', `${label}.removeItem`); },
    clear() { return forbidden(counters, 'storageWrites', `${label}.clear`); },
  };
}

function accumulate(counters) {
  for (const key of Object.keys(aggregate)) aggregate[key] += counters[key];
}

function createArchiveRuntime(fetchImpl = null) {
  const counters = sideEffectCounters();
  const location = { pathname: `/c/${CHAT_ID}`, href: `https://chatgpt.com/c/${CHAT_ID}`, origin: 'https://chatgpt.com' };
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    location,
    Date,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    localStorage: storage(counters, 'localStorage'),
    sessionStorage: storage(counters, 'sessionStorage'),
    fetch: fetchImpl || (() => forbidden(counters, 'networkReads', 'unexpected-fetch')),
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(archiveProgram, context, { filename: ARCHIVE_PATH, timeout: 2_000 });
  return { context, api: context.__TURN_INDEX_ARCHIVE__, counters };
}

function createCoreRuntime({ provider = null, miniMapRows = [] } = {}) {
  const counters = sideEffectCounters();
  const location = {
    pathname: `/c/${CHAT_ID}`,
    href: `https://chatgpt.com/c/${CHAT_ID}`,
    origin: 'https://chatgpt.com',
    reload() { return forbidden(counters, 'navigationMutations', 'location.reload'); },
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
    createElement() { return forbidden(counters, 'domMutations', 'document.createElement'); },
    createTextNode() { return forbidden(counters, 'domMutations', 'document.createTextNode'); },
  };
  class HarnessEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class GuardedObserver { constructor() { return forbidden(counters, 'domMutations', 'observer'); } }
  let tick = 0;
  const sandbox = {
    __FULL_INDEX_SETTER_GUARD__() { return forbidden(counters, 'sourceSetterCalls', 'source-setter'); },
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: {
      pushState() { return forbidden(counters, 'navigationMutations', 'history.pushState'); },
      replaceState() { return forbidden(counters, 'navigationMutations', 'history.replaceState'); },
    },
    navigator: Object.freeze({ userAgent: 'cv3.4-full-index-validator' }),
    performance: Object.freeze({ now() { tick += 0.25; return tick; } }),
    Date,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    AbortController,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage(counters, 'localStorage'),
    sessionStorage: storage(counters, 'sessionStorage'),
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000001'; } }),
    fetch() { return forbidden(counters, 'networkReads', 'core-fetch'); },
    XMLHttpRequest: class { constructor() { return forbidden(counters, 'networkReads', 'XMLHttpRequest'); } },
    WebSocket: class { constructor() { return forbidden(counters, 'networkReads', 'WebSocket'); } },
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.H2O_MM_CORE_API = { getTurnList: () => miniMapRows.slice() };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(coreProgram, context, { filename: CORE_PATH, timeout: 3_000 });
  equal(context.__TURN_INDEX_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core bootstrap is suppressed');
  if (provider) context.H2O.archiveBoot = { fetchConversationTurnIndex: provider };
  const api = context.__TURN_INDEX_CORE__;
  api.reset();
  return { context, api, counters, location };
}

function node({ id, role = '', parent = null, children = [], metadata = {}, text = `secret:${id}` }) {
  return {
    id: `node:${id}`,
    parent,
    children: children.slice(),
    message: role ? {
      id,
      author: { role },
      content: { content_type: 'text', parts: [text] },
      metadata: { ...metadata },
      create_time: 1,
    } : null,
  };
}

function buildFullGraph() {
  const mapping = {};
  const root = 'root';
  mapping[root] = node({ id: root, role: 'system', parent: null, children: [], text: 'root-secret' });
  let selectedParent = root;
  let noAnswerQId = '';
  let stoppedQId = '';
  let placeholderQId = '';
  for (let order = 1; order <= 38; order += 1) {
    const qId = order === 5 ? Q29 : (order === 36 ? D824 : `question-${String(order).padStart(2, '0')}`);
    const qKey = `q-node-${order}`;
    const questionMetadata = order === 37 ? { stopped: true } : {};
    mapping[qKey] = node({ id: qId, role: 'user', parent: selectedParent, children: [], metadata: questionMetadata, text: order === 38 ? '' : `private question ${order}` });
    mapping[selectedParent].children.push(qKey);
    if (order === 38) {
      noAnswerQId = qId;
      selectedParent = qKey;
      continue;
    }
    if (order === 37) {
      stoppedQId = qId;
      selectedParent = qKey;
      continue;
    }
    const selectedAnswerId = order === 5 ? A545 : (order === 36 ? A733 : `answer-${String(order).padStart(2, '0')}`);
    const selectedKey = `a-node-${order}-selected`;
    const selectedMetadata = order === 35 ? { finish_details: { type: 'stopped' } } : {};
    mapping[selectedKey] = node({ id: selectedAnswerId, role: 'assistant', parent: qKey, children: [], metadata: selectedMetadata, text: `private answer ${order}` });
    if (order === 36) {
      const siblingKey = `a-node-${order}-sibling`;
      mapping[siblingKey] = node({ id: A84, role: 'assistant', parent: qKey, children: [], text: 'private hidden variant' });
      mapping[qKey].children.push(siblingKey, selectedKey);
    } else if (order === 34) {
      placeholderQId = qId;
      const placeholderKey = `a-node-${order}-placeholder`;
      mapping[placeholderKey] = node({ id: 'request-placeholder-stream-34', role: 'assistant', parent: qKey, children: [] });
      mapping[qKey].children.push(placeholderKey, selectedKey);
    } else {
      mapping[qKey].children.push(selectedKey);
    }
    selectedParent = selectedKey;
  }
  const toolKey = 'hidden-tool';
  mapping[toolKey] = node({ id: 'tool-output-id', role: 'tool', parent: 'q-node-3', children: [], text: 'private tool output' });
  mapping['q-node-3'].children.push(toolKey);
  return {
    payload: {
      id: CHAT_ID,
      conversation_id: CHAT_ID,
      current_node: selectedParent,
      update_time: 123456,
      title: 'PRIVATE TITLE',
      mapping,
    },
    noAnswerQId,
    stoppedQId,
    placeholderQId,
  };
}

function projectionRows(turns, count) {
  return turns.slice(0, count).map((turn) => ({
    order: turn.order,
    qId: turn.qId,
    primaryAId: turn.primaryAId,
    answerIds: turn.answerVariants.slice(),
    noAnswer: turn.noAnswer,
  }));
}

const archiveRuntime = createArchiveRuntime();
const parser = archiveRuntime.api.normalizeBackendConversationTurnIndex;
const fullFixture = buildFullGraph();
const fullResult = parser(fullFixture.payload, { chatId: CHAT_ID, capturedAt: '2026-07-18T00:00:00.000Z' });

await fixture('38 selected-path users produce 38 turns', () => {
  equal(fullResult.ok, true);
  equal(fullResult.index.turns.length, 38);
  equal(fullResult.index.completeness.proof, 'host-payload-full-graph');
});

await fixture('mapping insertion order does not change index identity', () => {
  const reversed = { ...fullFixture.payload, mapping: Object.fromEntries(Object.entries(fullFixture.payload.mapping).reverse()) };
  const parsed = parser(reversed, { chatId: CHAT_ID, capturedAt: '2099-01-01T00:00:00.000Z' });
  equal(parsed.ok, true);
  equal(parsed.index.sourceFingerprint, fullResult.index.sourceFingerprint);
  equal(parsed.index.turns.map((turn) => turn.qId), fullResult.index.turns.map((turn) => turn.qId));
});

await fixture('current_node parent traversal defines selected order', () => {
  equal(fullResult.index.turns[0].qId, 'question-01');
  equal(fullResult.index.turns.at(-1).qId, fullFixture.noAnswerQId);
  equal(fullResult.index.turns.every((turn, index) => turn.order === index + 1), true);
});

await fixture('one selected user produces one logical turn', () => {
  equal(new Set(fullResult.index.turns.map((turn) => turn.qId)).size, 38);
  equal(fullResult.index.turns.every((turn) => turn.turnId === `turn:${turn.qId}`), true);
});

await fixture('assistant siblings remain variants under one box', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.answerVariants, [A84, A733]);
  equal(turn.branch.variantCount, 2);
});

await fixture('accepted d824 ownership and primary are preserved', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.primaryAId, A733);
  equal(turn.noAnswer, false);
});

await fixture('q29 remains local to answer 545', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === Q29);
  equal(turn.answerVariants, [A545]);
  equal(turn.primaryAId, A545);
});

await fixture('NO ANSWER remains one ID-bearing turn', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.noAnswerQId);
  equal(turn.noAnswer, true);
  equal(turn.primaryAId, null);
  equal(turn.answerVariants, []);
});

await fixture('empty text does not drop NO ANSWER identity', () => {
  ok(fullResult.index.turns.some((turn) => turn.qId === fullFixture.noAnswerQId));
});

await fixture('stopped metadata is conservative and fabricates no answer', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.stoppedQId);
  equal(turn.stopped, true);
  equal(turn.primaryAId, null);
});

await fixture('stopped assistant metadata retains only its real identity', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === 'question-35');
  equal(turn.stopped, true);
  equal(turn.primaryAId, 'answer-35');
  equal(turn.answerVariants, ['answer-35']);
});

await fixture('completed request placeholders are evicted', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.placeholderQId);
  equal(turn.answerVariants, ['answer-34']);
  equal(turn.primaryAId, 'answer-34');
});

await fixture('system tool and developer nodes do not become turns', () => {
  equal(fullResult.index.turns.some((turn) => ['root', 'tool-output-id'].includes(turn.qId)), false);
});

await fixture('branch switch changes primary and fingerprint without another qId', () => {
  const qKey = 'branch-q';
  const firstKey = 'branch-a-1';
  const secondKey = 'branch-a-2';
  const mapping = {
    root: node({ id: 'root', role: 'system', children: [qKey] }),
    [qKey]: node({ id: 'branch-question', role: 'user', parent: 'root', children: [firstKey, secondKey] }),
    [firstKey]: node({ id: 'branch-answer-1', role: 'assistant', parent: qKey }),
    [secondKey]: node({ id: 'branch-answer-2', role: 'assistant', parent: qKey }),
  };
  const first = parser({ mapping, current_node: firstKey }, { chatId: CHAT_ID });
  const second = parser({ mapping, current_node: secondKey }, { chatId: CHAT_ID });
  equal(first.index.turns.length, 1);
  equal(second.index.turns.length, 1);
  equal(first.index.turns[0].primaryAId, 'branch-answer-1');
  equal(second.index.turns[0].primaryAId, 'branch-answer-2');
  ok(first.index.sourceFingerprint !== second.index.sourceFingerprint);
});

await fixture('malformed mapping fails closed', () => {
  equal(parser({ mapping: [] }, { chatId: CHAT_ID }).errorCode, 'mapping-invalid');
});

await fixture('missing current_node fails closed', () => {
  equal(parser({ mapping: fullFixture.payload.mapping }, { chatId: CHAT_ID }).errorCode, 'current-node-missing');
});

await fixture('parent cycles fail closed', () => {
  const mapping = {
    a: node({ id: 'a', role: 'user', parent: 'b', children: ['b'] }),
    b: node({ id: 'b', role: 'assistant', parent: 'a', children: ['a'] }),
  };
  equal(parser({ mapping, current_node: 'a' }, { chatId: CHAT_ID }).errorCode, 'parent-cycle');
});

await fixture('duplicate selected question identities fail closed', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q1'] }),
    q1: node({ id: 'duplicate-qid', role: 'user', parent: 'root', children: ['a1'] }),
    a1: node({ id: 'answer-1', role: 'assistant', parent: 'q1', children: ['q2'] }),
    q2: node({ id: 'duplicate-qid', role: 'user', parent: 'a1' }),
  };
  equal(parser({ mapping, current_node: 'q2' }, { chatId: CHAT_ID }).errorCode, 'duplicate-question-identity');
});

await fixture('cross-question answer identity conflicts fail closed', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q1'] }),
    q1: node({ id: 'question-a', role: 'user', parent: 'root', children: ['a1'] }),
    a1: node({ id: 'shared-answer', role: 'assistant', parent: 'q1', children: ['q2'] }),
    q2: node({ id: 'question-b', role: 'user', parent: 'a1', children: ['a2'] }),
    a2: node({ id: 'shared-answer', role: 'assistant', parent: 'q2' }),
  };
  equal(parser({ mapping, current_node: 'a2' }, { chatId: CHAT_ID }).errorCode, 'answer-ownership-conflict');
});

await fixture('unresolvable partial graph cannot claim completeness', () => {
  const mapping = { a: node({ id: 'a', role: 'user', parent: 'missing' }) };
  const result = parser({ mapping, current_node: 'a' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'parent-unresolvable');
  equal(result.completeness, undefined);
});

await fixture('unexpected parser exceptions become bounded failures', () => {
  const payload = {};
  Object.defineProperty(payload, 'mapping', { get() { throw new Error('private parser detail'); } });
  const result = parser(payload, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'turn-index-parser-failed');
  equal(JSON.stringify(result).includes('private parser detail'), false);
});

await fixture('returned index respects the privacy boundary', () => {
  const serialized = JSON.stringify(fullResult.index);
  equal(serialized.includes('PRIVATE TITLE'), false);
  equal(serialized.includes('private question'), false);
  equal(serialized.includes('private answer'), false);
  equal(serialized.includes('"mapping":'), false);
  equal(Object.hasOwn(fullResult.index.turns[0], 'text'), false);
});

let providerCounters = null;
let providerResult = null;
await fixture('provider performs one session read and one conversation GET', async () => {
  const calls = [];
  const runtime = createArchiveRuntime(async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    calls.push({ url: String(url), method, authorization: String(options.headers?.authorization || '') });
    if (method === 'GET') runtime.counters.networkReads += 1;
    else runtime.counters.networkWrites += 1;
    if (String(url) === '/api/auth/session') return { ok: true, json: async () => ({ accessToken: 'TOP-SECRET-TOKEN' }) };
    return { ok: true, json: async () => fullFixture.payload };
  });
  providerResult = await runtime.api.fetchConversationTurnIndex(CHAT_ID, { capturedAt: '2026-07-18T00:00:00.000Z' });
  providerCounters = runtime.counters;
  equal(calls.length, 2);
  equal(calls.map((call) => call.method), ['GET', 'GET']);
  equal(calls[1].url, `/backend-api/conversation/${CHAT_ID}`);
  equal(runtime.counters.networkWrites, 0);
});

await fixture('provider never returns its access token', () => {
  equal(providerResult.ok, true);
  equal(JSON.stringify(providerResult).includes('TOP-SECRET-TOKEN'), false);
  accumulate(providerCounters);
});

await fixture('ordinary and project chat routes resolve the same identity', () => {
  const runtime = createCoreRuntime();
  equal(runtime.api.chatAtlasFullIndexRoute().chatId, CHAT_ID);
  runtime.location.pathname = `/g/fixture-gpt/c/${CHAT_ID}`;
  equal(runtime.api.chatAtlasFullIndexRoute().chatId, CHAT_ID);
  accumulate(runtime.counters);
});

await fixture('same-route shadow triggers share one operation', async () => {
  let resolveProvider;
  let calls = 0;
  const deferred = new Promise((resolve) => { resolveProvider = resolve; });
  const runtime = createCoreRuntime({ provider: () => { calls += 1; return deferred; } });
  const first = runtime.api.chatAtlasTriggerFullConversationIndex();
  const second = runtime.api.chatAtlasTriggerFullConversationIndex();
  equal(first, second);
  equal(calls, 0);
  await Promise.resolve();
  equal(calls, 1);
  resolveProvider(providerResult);
  await first;
  equal(runtime.api.getConversationTurnIndexDiagnostics().fetchCount, 1);
  accumulate(runtime.counters);
});

await fixture('route change discards stale shadow work', async () => {
  let resolveProvider;
  const deferred = new Promise((resolve) => { resolveProvider = resolve; });
  const runtime = createCoreRuntime({ provider: () => deferred });
  const operation = runtime.api.chatAtlasTriggerFullConversationIndex();
  await Promise.resolve();
  runtime.location.pathname = '/';
  await runtime.api.chatAtlasTriggerFullConversationIndex();
  resolveProvider(providerResult);
  await operation;
  const diagnostics = runtime.api.getConversationTurnIndexDiagnostics();
  equal(diagnostics.status, 'stale-route-discarded');
  equal(diagnostics.index, null);
  accumulate(runtime.counters);
});

let comparisonDiagnostics = null;
await fixture('shadow reports full 38 against partial 3 without mutation', async () => {
  const partial = projectionRows(fullResult.index.turns, 3);
  const runtime = createCoreRuntime({ provider: async () => providerResult, miniMapRows: partial });
  runtime.api.setCanonicalRows(partial);
  runtime.api.setLedgerRows(partial.map((row) => ({ ...row, answerVariants: row.answerIds })));
  await runtime.api.chatAtlasTriggerFullConversationIndex();
  comparisonDiagnostics = runtime.api.getConversationTurnIndexDiagnostics();
  equal(comparisonDiagnostics.status, 'complete-from-host-payload');
  equal(comparisonDiagnostics.index.count, 38);
  equal(comparisonDiagnostics.comparisons.canonicalCount, 3);
  equal(comparisonDiagnostics.comparisons.ledgerCount, 3);
  equal(comparisonDiagnostics.comparisons.minimapCount, 3);
  equal(comparisonDiagnostics.comparisons.missingFromCanonicalCount, 35);
  equal(Object.hasOwn(comparisonDiagnostics.index, 'turns'), false);
  equal(Object.hasOwn(comparisonDiagnostics, 'payload'), false);
  accumulate(runtime.counters);
});

await fixture('projection incompleteness is not identity corruption', () => {
  equal(comparisonDiagnostics.comparisons.projectionIncomplete, true);
  equal(comparisonDiagnostics.comparisons.classification, 'projection-incomplete');
});

await fixture('mismatch samples remain deterministically bounded', () => {
  ok(comparisonDiagnostics.comparisons.boundedSamples.length <= SAMPLE_LIMIT);
  equal(comparisonDiagnostics.comparisons.boundedSamples.every((sample) => !('text' in sample)), true);
});

await fixture('provider failure remains typed and non-throwing', async () => {
  const runtime = createCoreRuntime({ provider: async () => ({ ok: false, errorCode: 'fixture-unavailable' }) });
  const diagnostics = await runtime.api.chatAtlasTriggerFullConversationIndex();
  equal(diagnostics.status, 'full-index-unavailable');
  equal(diagnostics.errorCode, 'fixture-unavailable');
  accumulate(runtime.counters);
});

await fixture('route-mismatched complete envelopes fail closed', async () => {
  const mismatched = {
    ...providerResult,
    index: { ...providerResult.index, chatId: 'foreign-chat' },
  };
  const runtime = createCoreRuntime({ provider: async () => mismatched });
  const diagnostics = await runtime.api.chatAtlasTriggerFullConversationIndex();
  equal(diagnostics.status, 'full-index-unavailable');
  equal(diagnostics.errorCode, 'full-index-envelope-invalid');
  accumulate(runtime.counters);
});

await fixture('source setters remain unused', () => equal(aggregate.sourceSetterCalls, 0));
await fixture('navigation mutations remain unused', () => equal(aggregate.navigationMutations, 0));
await fixture('user actions remain unused', () => equal(aggregate.userActions, 0));
await fixture('DOM mutations remain unused', () => equal(aggregate.domMutations, 0));
await fixture('browser storage writes remain unused', () => equal(aggregate.storageWrites, 0));
await fixture('automatic canary execution remains unused', () => equal(aggregate.automaticCanaryExecutions, 0));

accumulate(archiveRuntime.counters);
const failures = fixtures.filter((item) => !item.ok);
console.log(`CV-3.4 full turn index shadow: ${fixtures.length - failures.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failures.length} failures`);
console.log(`Provider network: session/conversation GET reads ${aggregate.networkReads}, writes ${aggregate.networkWrites}`);
console.log(`Safety: source setters ${aggregate.sourceSetterCalls}, navigation ${aggregate.navigationMutations}, DOM ${aggregate.domMutations}, user actions ${aggregate.userActions}, storage writes ${aggregate.storageWrites}, canary stages ${aggregate.automaticCanaryExecutions}`);
for (const failure of failures) console.error(`FAIL ${failure.name}\n${failure.error}`);
if (failures.length) process.exitCode = 1;
