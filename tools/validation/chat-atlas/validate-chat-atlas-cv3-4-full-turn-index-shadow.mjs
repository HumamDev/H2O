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
  .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  .join('\n');
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const Q29 = '29a40c98-0bd8-48cd-be80-0273311a4977';
const A545 = '54520999-dedf-4f01-8c60-ac8adcc2c066';
const Q29_DIRECT_HIDDEN_SYSTEM = '242630f1-a7bb-4b68-955c-72775387c242';
const Q29_NONDIRECT_HIDDEN_SYSTEM = '433ab091-7538-46c9-8b3d-52d75561b0f8';
const D824 = 'd82467fb-21a4-41a4-b46d-446bf54a47ec';
const A84 = '84c7e73c-5fb7-44f6-a930-72e92d369c5a';
const A733 = '733fa31a-7d11-4ce5-b570-8ffa474670d4';
const INTERNAL_INITIAL = '9111ad43-3734-4120-94fe-a34c9cd3a1cc';
const INTERNAL_BRIDGE_ONE = '3bdfa68f-a197-422a-a3d4-29f028fc6564';
const INTERNAL_BRIDGE_TWO = 'e1d4b63f-0be7-4a51-b074-e3372b71d790';
const INTERNAL_D824 = 'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b';
const BRIDGE_ONE_Q = '01e8bbdc-0000-4000-8000-000000000001';
const BRIDGE_ONE_A = '377a87ec-0000-4000-8000-000000000001';
const BRIDGE_TWO_Q = '5068a46e-0000-4000-8000-000000000002';
const BRIDGE_TWO_A = 'c1a937a4-0000-4000-8000-000000000002';
const LIVE_BRANCH_Q = '5068a46e-9a79-4533-a11f-2f96e4c49f4f';
const LIVE_BRANCH_CURRENT_A = 'c1a937a4-8789-44e2-ae45-44a8f6ea4420';
const LIVE_BRANCH_PREVIOUS_A = '0de24351-7b1b-471f-a055-539950beac5a';
const HISTORICAL_Q = '7e60a524-96df-462c-a6c0-647ed1a9973c';
const HISTORICAL_CONTEXT_A = '17d51c70-49a4-4ebb-a9dd-6177a003955f';
const HISTORICAL_INTERRUPTED_A = '88a66be2-37de-4237-801b-daaae73cc817';
const NEXT_AFTER_D824_Q = '82fb4d81-6f44-453c-8ccd-90582adf8c90';
const LATEST_Q = 'c64afed8-cfde-4644-b0df-3407313c4c54';
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

function extractConstDeclaration(source, name) {
  const prefix = `  const ${name} = `;
  const matches = source.split('\n').filter((line) => line.startsWith(prefix) && line.endsWith(';'));
  if (matches.length !== 1) throw new Error(`instrumentation-const-invalid:${name}:${matches.length}`);
  return matches[0].trimStart();
}

function extractStatement(source, name) {
  const prefix = `  const ${name} = `;
  const start = source.indexOf(prefix);
  if (start < 0 || source.indexOf(prefix, start + 1) >= 0) {
    throw new Error(`instrumentation-statement-invalid:${name}`);
  }
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ';' && depth === 0) return source.slice(start, index + 1).trimStart();
  }
  throw new Error(`instrumentation-statement-unclosed:${name}`);
}

function extractArchiveProviderWiring() {
  const exports = [
    '  archiveBoot.normalizeBackendConversationTurnIndex = (payload, opts = {}) => normalizeBackendConversationTurnIndex(payload, opts);',
    '  archiveBoot.fetchConversationTurnIndex = (chatId, opts = {}) => fetchConversationTurnIndex(chatId, opts);',
  ];
  for (const line of exports) {
    if (countOccurrences(archiveSource, line) !== 1) throw new Error('archive-provider-export-anchor-invalid');
  }
  const eventNeedle = 'W.dispatchEvent(new CustomEvent("evt:h2o:conversation-turn-index-provider:ready"';
  if (countOccurrences(archiveSource, eventNeedle) !== 1) throw new Error('archive-provider-ready-anchor-invalid');
  const eventIndex = archiveSource.indexOf(eventNeedle);
  const blockStart = archiveSource.lastIndexOf('  try {', eventIndex);
  const catchLine = '  } catch {}';
  const catchIndex = archiveSource.indexOf(catchLine, eventIndex);
  if (blockStart < 0 || catchIndex < eventIndex) throw new Error('archive-provider-ready-block-invalid');
  return `${exports.join('\n')}\n${archiveSource.slice(blockStart, catchIndex + catchLine.length)}`;
}

const archiveFunctions = [
  'isObj',
  'nowIso',
  'toChatId',
  'stableHash',
  'conversationTurnIndexFailure',
  'conversationTurnIndexIdentity',
  'conversationTurnIndexMessageId',
  'conversationTurnIndexRole',
  'conversationTurnIndexProductUser',
  'conversationTurnIndexStopped',
  'conversationTurnIndexProductAnswer',
  'conversationTurnIndexPlaceholder',
  'conversationTurnIndexBranchShellAlias',
  'conversationTurnIndexIdentityFingerprint',
  'normalizeBackendConversationTurnIndexUnsafe',
  'normalizeBackendConversationTurnIndex',
  'backendAuthorityFailureReason',
  'fetchConversationTurnIndex',
];

const turnIndexSchemaDeclaration = extractConstDeclaration(archiveSource, 'TURN_INDEX_SCHEMA');
const backendAuthorityCapabilityDeclaration = extractStatement(archiveSource, 'BACKEND_AUTHORITY_CAPABILITY_FAILURES');
const archiveProviderWiring = extractArchiveProviderWiring();

const archiveProgram = `
'use strict';
const W = globalThis;
const H2O = (W.H2O = W.H2O || {});
${turnIndexSchemaDeclaration}
const TURN_INDEX_FETCH_TIMEOUT_MS = 12000;
${backendAuthorityCapabilityDeclaration}
${archiveFunctions.map((name) => extractFunction(archiveSource, name)).join('\n')}
globalThis.__TURN_INDEX_ARCHIVE__ = Object.freeze({
  schema: TURN_INDEX_SCHEMA,
  normalizeBackendConversationTurnIndex,
  fetchConversationTurnIndex,
});
`;

const archiveActivationProgram = `
'use strict';
const W = globalThis;
const H2O = (W.H2O = W.H2O || {});
const archiveBoot = (H2O.archiveBoot = H2O.archiveBoot || {});
${turnIndexSchemaDeclaration}
const TURN_INDEX_FETCH_TIMEOUT_MS = 12000;
${backendAuthorityCapabilityDeclaration}
${archiveFunctions.map((name) => extractFunction(archiveSource, name)).join('\n')}
${archiveProviderWiring}
globalThis.__TURN_INDEX_ARCHIVE_ACTIVATED__ = Object.freeze({
  schema: TURN_INDEX_SCHEMA,
  providerRegistered: typeof archiveBoot.fetchConversationTurnIndex === 'function',
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
  // The Full Index subdomain moved to 0A3a and Ledger rows to 0A3b; H2O Core's
  // export keeps only the generic turn seeding it still owns.
  const exportBlock = [
    '  globalThis.__TURN_INDEX_CORE__ = Object.freeze({',
    '    reset() { turnState.turns = []; },',
    '    setCanonicalRows(rows) { turnState.turns = Array.isArray(rows) ? rows.slice() : []; },',
    '  });',
    '  globalThis.__TURN_INDEX_CORE_BOOTSTRAP_SUPPRESSED__ = true;',
  ].join('\n');
  return `${source.slice(0, markerIndex)}${exportBlock}${close}\n`;
}


// ── Real 0A3a broker + real 0A3b Ledger as separate programs ───────────────
// Ledger rows are seeded inside the Ledger's own module now; H2O Core keeps
// seeding only the generic turn rows it owns. Script isolation is preserved and
// evaluating 0A3b is inert (no top-level observer or rAF).
const BROKER_REL = 'src-runtime-base/0A3a.\u2b1b\ufe0f\ud83e\udded Chat Atlas Core \ud83e\udded.js';
const LEDGER_REL = 'src-runtime-base/0A3b.\u2b1b\ufe0f\ud83d\udcd2 Chat Atlas Ledger \ud83d\udcd2.js';
const BROKER_PROGRAM = (() => {
  const src = fs.readFileSync(path.join(ROOT, BROKER_REL), 'utf8');
  const close = '\n})();';
  const at = src.lastIndexOf(close);
  if (at < 0) throw new Error('chat-atlas-core-iife-close-missing');
  // chatAtlasFullIndexRoute is the route-identity spine and stays in H2O Core;
  // 0A3a reads it through the host, so it is not anchored here.
  for (const n of ['chatAtlasCompareFullConversationIndex', 'chatAtlasTriggerFullConversationIndex', 'chatAtlasResetFullIndexRoute', 'getConversationTurnIndexDiagnostics']) {
    if (src.split(`  function ${n}(`).length - 1 !== 1) throw new Error(`chat-atlas-core-anchor-invalid:${n}`);
  }
  return `${src.slice(0, at)}
  globalThis.__TURN_INDEX_ATLAS__ = Object.freeze({
    chatAtlasFullIndexRoute,
    chatAtlasCompareFullConversationIndex,
    getConversationTurnIndexDiagnostics,
    chatAtlasTriggerFullConversationIndex,
    resetFullIndex() { chatAtlasResetFullIndexRoute(chatAtlasFullIndexRoute(), false); },
    state: chatAtlasFullIndexState,
  });
${close}\n`;
})();
const LEDGER_PROGRAM = (() => {
  const src = fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8');
  const close = '\n})();';
  const closeIndex = src.lastIndexOf(close);
  if (closeIndex < 0) throw new Error('ledger-bootstrap-boundary-invalid');
  return `${src.slice(0, closeIndex)}
  globalThis.__TURN_INDEX_LEDGER__ = Object.freeze({
    resetLedger() { chatAtlasLedgerState.members = []; },
    setLedgerRows(rows) {
      chatAtlasLedgerState.members = (Array.isArray(rows) ? rows : []).map((row, index) => ({
        turnNo: index + 1,
        logicalMemberKey: \`fixture:\${index + 1}\`,
        noAnswer: row?.noAnswer === true,
        question: { qId: row?.qId || null, currentAliases: row?.qId ? [row.qId] : [] },
        answer: {
          currentAnswerIds: Array.isArray(row?.answerVariants) ? row.answerVariants.slice() : [],
          currentAliases: Array.isArray(row?.answerVariants) ? row.answerVariants.slice() : [],
        },
      }));
    },
  });
${close}\n`;
})();
const coreProgram = instrumentCore();

function instrumentCoreActivation() {
  const setter = '  function setChatAtlasCanonicalSource(value) {\n';
  const marker = coreSource.split('\n').find((line) => line.includes('🟨 7) TIME / OBSERVERS')) || '';
  const tailAnchor = '  H2O.bus.on(BUS_SCAN_QUESTIONS';
  const close = '\n})();';
  const requiredWiring = [
    "  W.addEventListener('evt:h2o:route:changed', () => { chatAtlasTriggerFullConversationIndex(); });",
    "  W.addEventListener('h2o:route:changed', () => { chatAtlasTriggerFullConversationIndex(); });",
    "  W.addEventListener('popstate', () => { chatAtlasTriggerFullConversationIndex(); });",
    '  W.addEventListener(CHAT_ATLAS_FULL_INDEX_PROVIDER_READY, () => { chatAtlasTriggerFullConversationIndex(); });',
    '  chatAtlasTriggerFullConversationIndex();',
  ];
  if (
    countOccurrences(coreSource, setter) !== 1
    || countOccurrences(coreSource, marker) !== 1
    || countOccurrences(coreSource, tailAnchor) !== 1
  ) throw new Error('core-activation-anchor-invalid');
  for (const line of requiredWiring) {
    if (countOccurrences(coreSource, line) !== 1) throw new Error(`core-activation-wiring-invalid:${line}`);
  }
  let source = coreSource.replace(setter, `${setter}    globalThis.__FULL_INDEX_SETTER_GUARD__();\n`);
  const markerIndex = source.indexOf(marker);
  const tailIndex = source.indexOf(tailAnchor, markerIndex);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || tailIndex <= markerIndex || closeIndex <= tailIndex) {
    throw new Error('core-activation-boundary-invalid');
  }
  const exportBlock = [
    // Full Index state and diagnostics are owned by 0A3a now and are merged in
    // from __TURN_INDEX_ATLAS__ at the call site; H2O Core exports what it owns.
    '  globalThis.__TURN_INDEX_ACTIVATION__ = Object.freeze({',
    '    canonicalCount: () => turnState.turns.length,',
    // Ledger members are read through the 0A3a broker now, exactly as the
    // production H2O Core code reads them.
    '    ledgerCount: () => chatAtlasCoreLedgerMembers().length,',
    '  });',
    '  globalThis.__TURN_INDEX_OBSERVER_SUPPRESSED__ = true;',
  ].join('\n');
  const tail = source.slice(tailIndex, closeIndex)
    .replace("  refresh('boot');", '  globalThis.__TURN_INDEX_REFRESH_SUPPRESSED__ = true;')
    .replace('  startChatAtlasLedger();', '  globalThis.__TURN_INDEX_LEDGER_SUPPRESSED__ = true;');
  return `${source.slice(0, markerIndex)}${exportBlock}\n${tail}${close}\n`;
}

const coreActivationProgram = instrumentCoreActivation();

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

function createArchiveRuntime(requestImpl = null) {
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
    fetch: () => forbidden(counters, 'networkReads', 'unexpected-raw-fetch'),
    H2O: {
      BackendAuthority: {
        request: requestImpl || (() => forbidden(counters, 'networkReads', 'unexpected-authority-request')),
      },
    },
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
  vm.runInContext(BROKER_PROGRAM, context, { filename: BROKER_REL, timeout: 3_000 });
  vm.runInContext(LEDGER_PROGRAM, context, { filename: LEDGER_REL, timeout: 3_000 });
  equal(context.__TURN_INDEX_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core bootstrap is suppressed');
  if (provider) context.H2O.archiveBoot = { fetchConversationTurnIndex: provider };
  // Each owner seeds its own state; the fixture surface is unchanged.
  const coreApi = context.__TURN_INDEX_CORE__;
  const ledgerApi = context.__TURN_INDEX_LEDGER__;
  const atlasApi = context.__TURN_INDEX_ATLAS__;
  const api = Object.assign({}, coreApi, atlasApi, {
    setLedgerRows: (rows) => ledgerApi.setLedgerRows(rows),
    reset() { coreApi.reset(); atlasApi.resetFullIndex(); ledgerApi.resetLedger(); },
    state: atlasApi.state,
  });
  api.reset();
  return { context, api, counters, location };
}

function createActivationRuntime(payload) {
  const counters = sideEffectCounters();
  const listeners = new Map();
  const networkCalls = [];
  const location = {
    pathname: `/c/${CHAT_ID}`,
    href: `https://chatgpt.com/c/${CHAT_ID}`,
    origin: 'https://chatgpt.com',
    reload() { return forbidden(counters, 'navigationMutations', 'location.reload'); },
  };
  const addEventListener = (type, listener, options = {}) => {
    const key = String(type || '');
    const rows = listeners.get(key) || [];
    rows.push({ listener, once: options?.once === true });
    listeners.set(key, rows);
  };
  const removeEventListener = (type, listener) => {
    const key = String(type || '');
    listeners.set(key, (listeners.get(key) || []).filter((row) => row.listener !== listener));
  };
  const dispatchEvent = (event) => {
    const key = String(event?.type || '');
    const rows = (listeners.get(key) || []).slice();
    for (const row of rows) {
      row.listener.call(sandbox, event);
      if (row.once) removeEventListener(key, row.listener);
    }
    return true;
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
    addEventListener,
    removeEventListener,
    dispatchEvent,
    createElement() { return forbidden(counters, 'domMutations', 'document.createElement'); },
    createTextNode() { return forbidden(counters, 'domMutations', 'document.createTextNode'); },
  };
  class HarnessEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
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
    navigator: Object.freeze({ userAgent: 'cv3.4-activation-validator' }),
    performance: Object.freeze({ now() { tick += 0.25; return tick; } }),
    Date,
    URL,
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
    addEventListener,
    removeEventListener,
    dispatchEvent,
    H2O: {
      BackendAuthority: {
        async request(spec = {}) {
          const method = String(spec.method || 'GET').toUpperCase();
          const call = { resource: String(spec.resource || ''), chatId: String(spec.chatId || ''), method };
          networkCalls.push(call);
          if (method === 'GET') counters.networkReads += 1;
          else counters.networkWrites += 1;
          if (call.resource === 'conversation' && call.chatId === CHAT_ID) {
            return { ok: true, status: 'ok', statusCode: 200, body: payload, internalToken: 'ACTIVATION-SECRET-TOKEN' };
          }
          throw new Error(`unexpected-activation-authority:${call.resource}:${call.chatId}`);
        },
      },
    },
    fetch: () => forbidden(counters, 'networkReads', 'activation-raw-fetch'),
    XMLHttpRequest: class { constructor() { return forbidden(counters, 'networkReads', 'XMLHttpRequest'); } },
    WebSocket: class { constructor() { return forbidden(counters, 'networkReads', 'WebSocket'); } },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(coreActivationProgram, context, { filename: CORE_PATH, timeout: 3_000 });
  // The activation runtime also needs the real Chat Atlas Core, which now owns
  // the Full Index subdomain, and the Ledger it brokers.
  vm.runInContext(BROKER_PROGRAM, context, { filename: BROKER_REL, timeout: 3_000 });
  vm.runInContext(LEDGER_PROGRAM, context, { filename: LEDGER_REL, timeout: 3_000 });
  return { context, counters, listeners, networkCalls, dispatchEvent };
}

function node({
  id,
  role = '',
  parent = null,
  children = [],
  metadata = {},
  contentType = 'text',
  channel = '',
  recipient = '',
  status = '',
  endTurn = null,
  text = `secret:${id}`,
}) {
  return {
    id: `node:${id}`,
    parent,
    children: children.slice(),
    message: role ? {
      id,
      author: { role },
      content: { content_type: contentType, parts: [text] },
      metadata: { ...metadata },
      ...(channel ? { channel } : {}),
      ...(recipient ? { recipient } : {}),
      ...(status ? { status } : {}),
      ...(endTurn == null ? {} : { end_turn: endTurn }),
      create_time: 1,
    } : null,
  };
}

function branchShellNode({ id, parent = null, children = [], metadata = {} }) {
  return node({
    id,
    role: 'assistant',
    parent,
    children,
    metadata: {
      is_visually_hidden_from_conversation: true,
      model_slug: 'gpt-fixture-branch-shell',
      finish_details: { type: 'stop' },
      ...metadata,
    },
    channel: 'final',
    endTurn: true,
    text: `private branch shell ${id}`,
  });
}

function systemBranchShellNode({
  id,
  parent = null,
  children = [],
  modelSlug = 'gpt-5-5',
  endTurn = true,
  contentType = 'text',
  metadata = {},
}) {
  return node({
    id,
    role: 'system',
    parent,
    children,
    metadata: {
      is_visually_hidden_from_conversation: true,
      ...(modelSlug ? { model_slug: modelSlug } : {}),
      ...metadata,
    },
    contentType,
    recipient: 'all',
    endTurn,
    text: `private system branch shell ${id}`,
  });
}

function buildLiveSelectedBranchGraph(currentNode) {
  const contextId = 'live-selected-branch-model-editable-context';
  const internalUserId = 'e1d4b63f-0be7-4a51-b074-e3372b71d790';
  const reasoningId = 'live-selected-branch-reasoning-recap';
  return {
    mapping: {
      root: node({ id: 'root', role: 'system', children: [LIVE_BRANCH_Q] }),
      [LIVE_BRANCH_Q]: node({
        id: LIVE_BRANCH_Q,
        role: 'user',
        parent: 'root',
        children: [LIVE_BRANCH_PREVIOUS_A, contextId],
      }),
      [LIVE_BRANCH_PREVIOUS_A]: node({
        id: LIVE_BRANCH_PREVIOUS_A,
        role: 'assistant',
        parent: LIVE_BRANCH_Q,
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
      }),
      [contextId]: node({
        id: contextId,
        role: 'assistant',
        parent: LIVE_BRANCH_Q,
        children: [internalUserId],
        contentType: 'model_editable_context',
        metadata: { is_visually_hidden_from_conversation: true },
      }),
      [internalUserId]: node({
        id: internalUserId,
        role: 'user',
        parent: contextId,
        children: [reasoningId],
        contentType: 'user_editable_context',
        metadata: { user_context_message_data: { fixture: true } },
      }),
      [reasoningId]: node({
        id: reasoningId,
        role: 'assistant',
        parent: internalUserId,
        children: [LIVE_BRANCH_CURRENT_A],
        contentType: 'reasoning_recap',
        metadata: { is_visually_hidden_from_conversation: true },
      }),
      [LIVE_BRANCH_CURRENT_A]: node({
        id: LIVE_BRANCH_CURRENT_A,
        role: 'assistant',
        parent: reasoningId,
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
      }),
    },
    current_node: currentNode,
  };
}

function buildFullGraph() {
  const mapping = {};
  const root = 'root';
  mapping[root] = node({ id: root, role: 'system', parent: null, children: [], text: 'root-secret' });
  let selectedParent = root;
  const internalUserIds = [INTERNAL_INITIAL, INTERNAL_BRIDGE_ONE, INTERNAL_BRIDGE_TWO, INTERNAL_D824];
  const internalAssistantIds = [];
  const productQuestionIds = [];
  const appendSelected = (key, options) => {
    mapping[key] = node({ ...options, parent: selectedParent, children: [] });
    mapping[selectedParent].children.push(key);
    selectedParent = key;
    return key;
  };

  appendSelected('initial-internal-user', {
    id: INTERNAL_INITIAL,
    role: 'user',
    metadata: { is_visually_hidden_from_conversation: true },
    text: 'private initial context',
  });
  for (let index = 1; index <= 56; index += 1) {
    appendSelected(`prefix-system-${index}`, {
      id: `prefix-system-${index}`,
      role: 'system',
      text: `private prefix context ${index}`,
    });
  }

  let placeholderQId = '';
  let completedStopQId = '';
  for (let order = 1; order <= 38; order += 1) {
    const qId = order === 5
      ? Q29
      : order === 10
        ? BRIDGE_ONE_Q
        : order === 20
          ? BRIDGE_TWO_Q
          : order === 35
            ? HISTORICAL_Q
            : order === 36
              ? D824
              : order === 37
                ? NEXT_AFTER_D824_Q
                : order === 38
                  ? LATEST_Q
                  : `question-${String(order).padStart(2, '0')}`;
    const qKey = order === 36 ? D824 : `q-node-${order}`;
    productQuestionIds.push(qId);
    appendSelected(qKey, {
      id: qId,
      role: 'user',
      text: order === 38 ? '' : `private question ${order}`,
    });
    if (order === 38) {
      continue;
    }

    if (order === 5) {
      appendSelected('q29-hidden-system', {
        id: Q29_DIRECT_HIDDEN_SYSTEM,
        role: 'system',
        metadata: { is_visually_hidden_from_conversation: true },
        endTurn: false,
        text: 'private q29 intermediary',
      });
      appendSelected('q29-nondirect-hidden-system', {
        id: Q29_NONDIRECT_HIDDEN_SYSTEM,
        role: 'system',
        metadata: { is_visually_hidden_from_conversation: true },
        endTurn: false,
        text: 'private q29 nested intermediary',
      });
      appendSelected('q29-final', {
        id: A545,
        role: 'assistant',
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
        text: 'private q29 final',
      });
      continue;
    }

    if (order === 10 || order === 20) {
      const firstBridge = order === 10;
      const contextId = `bridge-${order}-context-assistant`;
      const reasoningId = `bridge-${order}-reasoning-recap`;
      internalAssistantIds.push(contextId, reasoningId);
      appendSelected(`bridge-${order}-context`, {
        id: contextId,
        role: 'assistant',
        contentType: firstBridge ? 'model_editable_context' : 'text',
        metadata: firstBridge ? {} : { is_visually_hidden_from_conversation: true },
        text: `private bridge ${order} context`,
      });
      appendSelected(`bridge-${order}-internal-user`, {
        id: firstBridge ? INTERNAL_BRIDGE_ONE : INTERNAL_BRIDGE_TWO,
        role: 'user',
        metadata: firstBridge
          ? { is_user_system_message: true }
          : { user_context_message_data: { kind: 'fixture-context' } },
        text: `private bridge ${order} internal user`,
      });
      appendSelected(`bridge-${order}-reasoning`, {
        id: reasoningId,
        role: 'assistant',
        contentType: 'reasoning_recap',
        text: `private bridge ${order} reasoning`,
      });
      appendSelected(`bridge-${order}-final`, {
        id: firstBridge ? BRIDGE_ONE_A : BRIDGE_TWO_A,
        role: 'assistant',
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
        text: `private bridge ${order} final`,
      });
      continue;
    }

    if (order === 32) {
      placeholderQId = qId;
      appendSelected('a-node-32-placeholder', {
        id: 'request-placeholder-stream-32',
        role: 'assistant',
        text: 'private completed placeholder',
      });
      appendSelected('a-node-32-final', {
        id: 'answer-32',
        role: 'assistant',
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
        text: 'private answer 32',
      });
      continue;
    }

    if (order === 35) {
      internalAssistantIds.push(HISTORICAL_CONTEXT_A, HISTORICAL_INTERRUPTED_A);
      appendSelected('historical-model-context', {
        id: HISTORICAL_CONTEXT_A,
        role: 'assistant',
        contentType: 'model_editable_context',
        text: 'private historical model context',
      });
      appendSelected('historical-interrupted-final', {
        id: HISTORICAL_INTERRUPTED_A,
        role: 'assistant',
        metadata: { finish_details: { type: 'interrupted' } },
        channel: 'final',
        endTurn: false,
        text: 'private interrupted final',
      });
      continue;
    }

    if (order === 36) {
      const modelContextId = 'd824-model-editable-context';
      const reasoningId = 'd824-reasoning-recap';
      internalAssistantIds.push(modelContextId, reasoningId);
      appendSelected(A84, {
        id: A84,
        role: 'system',
        metadata: {
          is_visually_hidden_from_conversation: true,
          model_slug: 'gpt-5-5',
        },
        contentType: 'text',
        recipient: 'all',
        endTurn: true,
        text: 'private hidden branch shell',
      });
      appendSelected('d824-system-context', {
        id: 'd824-system-context',
        role: 'system',
        text: 'private d824 system context',
      });
      appendSelected('d824-internal-user', {
        id: INTERNAL_D824,
        role: 'user',
        contentType: 'user_editable_context',
        text: 'private d824 internal user',
      });
      appendSelected('d824-model-context', {
        id: modelContextId,
        role: 'assistant',
        contentType: 'model_editable_context',
        text: 'private d824 model context',
      });
      appendSelected('d824-reasoning', {
        id: reasoningId,
        role: 'assistant',
        contentType: 'reasoning_recap',
        text: 'private d824 reasoning',
      });
      appendSelected(A733, {
        id: A733,
        role: 'assistant',
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
        text: 'private d824 final',
      });
      continue;
    }

    const selectedAnswerId = `answer-${String(order).padStart(2, '0')}`;
    if (order === 33) completedStopQId = qId;
    appendSelected(`a-node-${order}-selected`, {
      id: selectedAnswerId,
      role: 'assistant',
      metadata: order === 33 ? { finish_details: { type: 'stop' } } : {},
      channel: order === 33 ? 'final' : '',
      endTurn: order === 33 ? true : null,
      text: `private answer ${order}`,
    });
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
      access_token: 'PRIVATE PAYLOAD TOKEN',
      attachments: [{ id: 'PRIVATE ATTACHMENT' }],
      tool_output: 'PRIVATE RAW TOOL OUTPUT',
      mapping,
    },
    internalUserIds,
    internalAssistantIds,
    productQuestionIds,
    historicalQId: HISTORICAL_Q,
    latestQId: LATEST_Q,
    placeholderQId,
    completedStopQId,
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

function selectedPathKeys(payload) {
  const keys = [];
  let cursor = payload.current_node;
  while (cursor) {
    keys.push(cursor);
    cursor = String(payload.mapping[cursor]?.parent || '');
  }
  return keys.reverse();
}

const archiveRuntime = createArchiveRuntime();
const parser = archiveRuntime.api.normalizeBackendConversationTurnIndex;
const fullFixture = buildFullGraph();
const fullResult = parser(fullFixture.payload, { chatId: CHAT_ID, capturedAt: '2026-07-18T00:00:00.000Z' });

await fixture('live selected-path parser follows current_node and preserves sibling variants', () => {
  const currentResult = parser(buildLiveSelectedBranchGraph(LIVE_BRANCH_CURRENT_A), { chatId: CHAT_ID });
  const previousResult = parser(buildLiveSelectedBranchGraph(LIVE_BRANCH_PREVIOUS_A), { chatId: CHAT_ID });
  const currentTurn = currentResult.index.turns[0];
  const previousTurn = previousResult.index.turns[0];
  equal(currentResult.ok, true);
  equal(previousResult.ok, true);
  equal(currentTurn.qId, LIVE_BRANCH_Q);
  equal(currentTurn.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(currentTurn.answerVariants, [LIVE_BRANCH_PREVIOUS_A, LIVE_BRANCH_CURRENT_A]);
  equal(previousTurn.qId, LIVE_BRANCH_Q);
  equal(previousTurn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(previousTurn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(previousResult.index.completeness.proof, 'host-payload-full-graph');
});

await fixture('production schema is extracted from runtime source', () => {
  equal(archiveRuntime.api.schema, 1);
  equal(fullResult.index.schema, archiveRuntime.api.schema);
  equal(turnIndexSchemaDeclaration, 'const TURN_INDEX_SCHEMA = 1;');
});

await fixture('four internal user nodes collapse raw 42 to product 38', () => {
  const selected = selectedPathKeys(fullFixture.payload);
  const rawUsers = selected.filter((key) => fullFixture.payload.mapping[key]?.message?.author?.role === 'user');
  equal(fullResult.ok, true);
  equal(selected.length, 148);
  equal(rawUsers.length, 42);
  equal(fullFixture.internalUserIds.length, 4);
  equal(fullResult.index.turns.length, 38);
  equal(fullResult.index.completeness.proof, 'host-payload-full-graph');
});

await fixture('initial internal context user is excluded before the first product question', () => {
  equal(fullResult.index.turns[0].qId, 'question-01');
  equal(fullResult.index.turns.some((turn) => turn.qId === INTERNAL_INITIAL), false);
});

await fixture('all internal user identities are absent from product qIds', () => {
  const qIds = new Set(fullResult.index.turns.map((turn) => turn.qId));
  equal(fullFixture.internalUserIds.every((id) => !qIds.has(id)), true);
  equal(qIds.size, 38);
});

await fixture('internal user does not end the preceding product turn', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === BRIDGE_ONE_Q);
  equal(turn.answerVariants, [BRIDGE_ONE_A]);
  equal(turn.primaryAId, BRIDGE_ONE_A);
  equal(fullResult.index.turns.some((row) => row.qId === INTERNAL_BRIDGE_ONE), false);
});

await fixture('3bdfa transparent bridge assigns 377a87ec final to the preceding product qId', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === BRIDGE_ONE_Q);
  equal(turn.turnId, `turn:${BRIDGE_ONE_Q}`);
  equal(turn.answerVariants, [BRIDGE_ONE_A]);
  equal(turn.noAnswer, false);
});

await fixture('e1d4 transparent bridge assigns c1a937a4 final to the preceding product qId', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === BRIDGE_TWO_Q);
  equal(turn.turnId, `turn:${BRIDGE_TWO_Q}`);
  equal(turn.answerVariants, [BRIDGE_TWO_A]);
  equal(turn.primaryAId, BRIDGE_TWO_A);
});

await fixture('d824 transparent bridge resolves the selected branch root primary', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.qId, D824);
  equal(turn.turnId, `turn:${D824}`);
  // Single-child selected system branch root is now the graph-proven primary.
  equal(turn.primaryAId, A84);
  equal(turn.answerVariants, [A733, A84]);
  equal(turn.answerVariants.includes('answer-37'), false);
});

await fixture('d824 retains the accepted hidden branch-shell alias', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.answerVariants.includes(A84), true);
  equal(turn.answerVariants.includes('d824-model-editable-context'), false);
  equal(turn.answerVariants.includes('d824-reasoning-recap'), false);
});

await fixture('d824 variant order keeps the selected branch-root primary last', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.answerVariants, [A733, A84]);
  equal(turn.answerVariants.at(-1), A84);
});

await fixture('d824 selected primary is the single-child system branch root', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.primaryAId, A84);
  equal(turn.branch.rootResolution, 'branch-root-system-selected-single-child');
  equal(turn.noAnswer, false);
  equal(turn.stopped, false);
});

await fixture('d824 branch diagnostics reflect the selected root and one inactive final', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.branch.selectedAssistantNodeId, A84);
  equal(turn.branch.variantCount, 2);
  equal(turn.branch.inactiveVariantCount, 1);
});

await fixture('live-shaped system-role 84c7 direct shell is retained', () => {
  const shell = fullFixture.payload.mapping[A84];
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(shell.parent, D824);
  equal(shell.message.author.role, 'system');
  equal(shell.message.content.content_type, 'text');
  equal(shell.message.metadata.is_visually_hidden_from_conversation, true);
  equal(shell.message.metadata.model_slug, 'gpt-5-5');
  equal(shell.message.end_turn, true);
  equal(shell.message.channel, undefined);
  equal(shell.message.recipient, 'all');
  equal(turn.answerVariants, [A733, A84]);
});

await fixture('assistant-only shell classification would reject the live system fixture', () => {
  const shell = fullFixture.payload.mapping[A84];
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(shell.message.author.role === 'assistant', false);
  equal(turn.answerVariants.includes(A84), true);
  equal(countOccurrences(archiveSource, '["assistant", "system"].includes(role)'), 1);
});

function buildBranchRootIncidentGraph({ shell = {}, shellRole } = {}) {
  // Live GATE_5 incident shape (post branch-switch payload): a REAL fork at
  // the target user node — the selected branch ROOT is a hidden system shell
  // (0de24351...) whose subtree still contains the STALE assistant
  // (c1a937a4...) deeper on the current-node ancestry, and the conversation
  // continues beneath it. Role-based descent picks the stale assistant; graph
  // topology must select the system branch root.
  const contextId = 'branch-root-context-sibling';
  const nextQ = 'branch-root-next-question';
  const nextA = 'branch-root-next-answer';
  const shellNode = shellRole === 'assistant'
    ? node({
      id: LIVE_BRANCH_PREVIOUS_A,
      role: 'assistant',
      parent: LIVE_BRANCH_Q,
      children: [LIVE_BRANCH_CURRENT_A],
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    })
    : systemBranchShellNode({
      id: LIVE_BRANCH_PREVIOUS_A,
      parent: LIVE_BRANCH_Q,
      children: [LIVE_BRANCH_CURRENT_A],
      ...shell,
    });
  return {
    mapping: {
      root: node({ id: 'root', role: 'system', children: [LIVE_BRANCH_Q] }),
      [LIVE_BRANCH_Q]: node({
        id: LIVE_BRANCH_Q,
        role: 'user',
        parent: 'root',
        children: [LIVE_BRANCH_PREVIOUS_A, contextId],
      }),
      [LIVE_BRANCH_PREVIOUS_A]: shellNode,
      [contextId]: node({
        id: contextId,
        role: 'assistant',
        parent: LIVE_BRANCH_Q,
        contentType: 'model_editable_context',
        metadata: { is_visually_hidden_from_conversation: true },
      }),
      [LIVE_BRANCH_CURRENT_A]: node({
        id: LIVE_BRANCH_CURRENT_A,
        role: 'assistant',
        parent: LIVE_BRANCH_PREVIOUS_A,
        children: [nextQ],
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
      }),
      [nextQ]: node({ id: nextQ, role: 'user', parent: LIVE_BRANCH_CURRENT_A, children: [nextA] }),
      [nextA]: node({
        id: nextA,
        role: 'assistant',
        parent: nextQ,
        metadata: { finish_details: { type: 'stop' } },
        channel: 'final',
        endTurn: true,
      }),
    },
    current_node: nextA,
  };
}

await fixture('real single-child topology: the only direct child system root becomes primary', () => {
  // The intercepted HTTP-200 payload's exact shape: the target user node has
  // EXACTLY ONE direct child — the selected system branch root (0de24351...)
  // — and the stale assistant (c1a937a4...) is a deeper descendant on the
  // same current-node ancestry, not a sibling. Sibling count must not gate
  // the selection.
  const graph = buildBranchRootIncidentGraph();
  delete graph.mapping['branch-root-context-sibling'];
  graph.mapping[LIVE_BRANCH_Q] = node({
    id: LIVE_BRANCH_Q,
    role: 'user',
    parent: 'root',
    children: [LIVE_BRANCH_PREVIOUS_A],
  });
  equal(graph.mapping[LIVE_BRANCH_Q].children.length, 1);
  const result = parser(graph, { chatId: CHAT_ID });
  equal(result.ok, true);
  const turn = result.index.turns[0];
  equal(turn.qId, LIVE_BRANCH_Q);
  // The only direct child is selected, role system, on the ancestry.
  equal(graph.mapping[LIVE_BRANCH_PREVIOUS_A].message.author.role, 'system');
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.branch.rootResolution, 'branch-root-system-selected-single-child');
  equal(turn.branch.rootRole, 'system');
  // The stale assistant is on the ancestry but is NOT a direct child; it
  // remains a preserved same-qId variant and cannot override the root.
  equal(graph.mapping[LIVE_BRANCH_CURRENT_A].parent === LIVE_BRANCH_Q, false);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(turn.noAnswer, false);
  // No rekey: the continuation turn stays intact under its own qId.
  equal(result.index.turns[1].qId, 'branch-root-next-question');
  equal(result.index.turns[1].primaryAId, 'branch-root-next-answer');
});

await fixture('live incident: selected system branch root becomes primary from graph topology', () => {
  const result = parser(buildBranchRootIncidentGraph(), { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns.length, 2);
  const turn = result.index.turns[0];
  equal(turn.qId, LIVE_BRANCH_Q);
  // Graph topology selects the system-role branch root, not the stale deeper
  // assistant the role walk finds.
  equal(turn.primaryAId, LIVE_BRANCH_PREVIOUS_A);
  equal(turn.answerVariants, [LIVE_BRANCH_CURRENT_A, LIVE_BRANCH_PREVIOUS_A]);
  equal(turn.noAnswer, false);
  equal(turn.stopped, false);
  equal(turn.branch.rootResolution, 'branch-root-system-selected');
  equal(turn.branch.rootRole, 'system');
  // No rekey: the continuation turn is intact under its own qId.
  equal(result.index.turns[1].qId, 'branch-root-next-question');
  equal(result.index.turns[1].primaryAId, 'branch-root-next-answer');
});

await fixture('assistant-role selected branch root keeps the role-walk primary', () => {
  const result = parser(buildBranchRootIncidentGraph({ shellRole: 'assistant' }), { chatId: CHAT_ID });
  equal(result.ok, true);
  const turn = result.index.turns[0];
  // The fork exists and the selected root is an assistant: the existing
  // final-assistant resolution stays authoritative (multi-message answers).
  equal(turn.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(turn.branch.rootResolution, 'branch-root-assistant-preserved');
  equal(turn.branch.rootRole, 'assistant');
  equal(turn.answerVariants.includes(LIVE_BRANCH_PREVIOUS_A), true);
});

await fixture('unselected system shell sibling never becomes primary', () => {
  const graph = buildBranchRootIncidentGraph({ shellRole: 'assistant' });
  // Add an alias-qualified system shell as an UNSELECTED sibling branch with
  // its own completed final.
  graph.mapping['unselected-system-shell'] = systemBranchShellNode({
    id: 'unselected-system-shell',
    parent: LIVE_BRANCH_Q,
    children: ['unselected-shell-final'],
  });
  graph.mapping['unselected-shell-final'] = node({
    id: 'unselected-shell-final',
    role: 'assistant',
    parent: 'unselected-system-shell',
    metadata: { finish_details: { type: 'stop' } },
    channel: 'final',
    endTurn: true,
  });
  graph.mapping[LIVE_BRANCH_Q].children.push('unselected-system-shell');
  const result = parser(graph, { chatId: CHAT_ID });
  equal(result.ok, true);
  const turn = result.index.turns[0];
  equal(turn.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(turn.answerVariants.includes('unselected-system-shell'), true);
  equal(turn.branch.rootResolution, 'branch-root-assistant-preserved');
});

await fixture('single-child selected system root is primary while the deep final stays preserved', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  // Sibling count is not the authority: the unique selected direct child is
  // the branch root even without a fork; the deep completed final remains a
  // preserved same-qId variant.
  equal(turn.branch.rootResolution, 'branch-root-system-selected-single-child');
  equal(turn.primaryAId, A84);
  equal(turn.answerVariants, [A733, A84]);
});

await fixture('cross-qId system branch root is rejected without rekey', () => {
  const graph = buildBranchRootIncidentGraph();
  // The selected root now carries a message id owned by the PREVIOUS turn's
  // answer: replace the shell's message id with a rogue alias of turn-1's
  // answer. Build a 3-turn graph: prior turn -> incident turn.
  const priorQ = 'branch-root-prior-question';
  const priorA = 'branch-root-prior-answer';
  const rogueKey = 'branch-root-rogue-shell';
  const mapping = {
    root: node({ id: 'root', role: 'system', children: [priorQ] }),
    [priorQ]: node({ id: priorQ, role: 'user', parent: 'root', children: [priorA] }),
    [priorA]: node({
      id: priorA,
      role: 'assistant',
      parent: priorQ,
      children: [LIVE_BRANCH_Q],
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
    [LIVE_BRANCH_Q]: node({
      id: LIVE_BRANCH_Q,
      role: 'user',
      parent: priorA,
      children: [rogueKey, 'branch-root-context-sibling'],
    }),
    [rogueKey]: systemBranchShellNode({
      id: priorA,
      parent: LIVE_BRANCH_Q,
      children: [LIVE_BRANCH_CURRENT_A],
      modelSlug: '',
    }),
    'branch-root-context-sibling': node({
      id: 'branch-root-context-sibling',
      role: 'assistant',
      parent: LIVE_BRANCH_Q,
      contentType: 'model_editable_context',
      metadata: { is_visually_hidden_from_conversation: true },
    }),
    [LIVE_BRANCH_CURRENT_A]: node({
      id: LIVE_BRANCH_CURRENT_A,
      role: 'assistant',
      parent: rogueKey,
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
  };
  void graph;
  const result = parser({ mapping, current_node: LIVE_BRANCH_CURRENT_A }, { chatId: CHAT_ID });
  equal(result.ok, true);
  const prior = result.index.turns.find((row) => row.qId === priorQ);
  const turn = result.index.turns.find((row) => row.qId === LIVE_BRANCH_Q);
  // The rogue root cannot cross-rekey the previous turn's answer; the deep
  // role-walk primary is preserved and ownership stays with the prior qId.
  equal(prior.primaryAId, priorA);
  equal(turn.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(turn.branch.rootResolution, 'branch-root-cross-qid-rejected');
  equal(turn.answerVariants.includes(priorA), false);
});

await fixture('ambiguous multiple selected direct children fail closed', () => {
  const graph = buildBranchRootIncidentGraph({ shellRole: 'assistant' });
  // A second direct child whose message id aliases a node key that IS on the
  // selected ancestry makes the selection ambiguous.
  graph.mapping['ambiguous-echo-child'] = systemBranchShellNode({
    id: 'branch-root-next-question',
    parent: LIVE_BRANCH_Q,
    children: [],
    modelSlug: '',
  });
  graph.mapping[LIVE_BRANCH_Q].children.push('ambiguous-echo-child');
  const result = parser(graph, { chatId: CHAT_ID });
  equal(result.ok, true);
  const turn = result.index.turns[0];
  equal(turn.branch.rootResolution, 'branch-root-ambiguous-rejected');
  equal(turn.primaryAId, LIVE_BRANCH_CURRENT_A);
});

await fixture('unattributable selected system root fails closed to the role-walk primary', () => {
  // The selected system root is NOT alias-qualified (no model association), so
  // it is not a same-qId variant and cannot be canonically attributed: the
  // previous authoritative primary is preserved.
  const result = parser(buildBranchRootIncidentGraph({ shell: { modelSlug: '' } }), { chatId: CHAT_ID });
  equal(result.ok, true);
  const turn = result.index.turns[0];
  equal(turn.primaryAId, LIVE_BRANCH_CURRENT_A);
  equal(turn.branch.rootResolution, 'branch-root-unowned-rejected');
  equal(turn.answerVariants.includes(LIVE_BRANCH_PREVIOUS_A), false);
});

await fixture('missing target node parses cleanly without inventing the turn', () => {
  const graph = buildBranchRootIncidentGraph();
  // Remove the incident turn entirely: the parser succeeds on the remaining
  // graph and simply does not contain the target qId (retained authority is
  // preserved upstream by the coordinator's cache-preserving refresh).
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['solo-q'] }),
    'solo-q': node({ id: 'solo-question', role: 'user', parent: 'root', children: ['solo-a'] }),
    'solo-a': node({
      id: 'solo-answer',
      role: 'assistant',
      parent: 'solo-q',
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
  };
  void graph;
  const result = parser({ mapping, current_node: 'solo-a' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns.some((row) => row.qId === LIVE_BRANCH_Q), false);
});

await fixture('system shell without modelSlug is excluded', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'system-shell-no-model-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: systemBranchShellNode({
      id: 'system-shell-no-model',
      parent: 'q',
      children: ['final'],
      modelSlug: '',
    }),
    final: node({
      id: 'system-shell-no-model-final',
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['system-shell-no-model-final']);
  equal(result.index.turns[0].answerVariants.includes('system-shell-no-model'), false);
});

await fixture('system shell without completed or end-turn evidence is excluded', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'system-shell-not-complete-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: systemBranchShellNode({
      id: 'system-shell-not-complete',
      parent: 'q',
      children: ['final'],
      endTurn: false,
    }),
    final: node({
      id: 'system-shell-not-complete-final',
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['system-shell-not-complete-final']);
  equal(result.index.turns[0].answerVariants.includes('system-shell-not-complete'), false);
});

await fixture('arbitrary hidden system intermediary with incompatible content is excluded', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'arbitrary-hidden-system-question', role: 'user', parent: 'root', children: ['system'] }),
    system: systemBranchShellNode({
      id: 'arbitrary-hidden-system',
      parent: 'q',
      children: ['final'],
      contentType: 'computer_initialize_state',
    }),
    final: node({ id: 'arbitrary-hidden-system-final', role: 'assistant', parent: 'system' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['arbitrary-hidden-system-final']);
  equal(result.index.turns[0].answerVariants.includes('arbitrary-hidden-system'), false);
});

await fixture('system shell cannot cross the next product-user boundary', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q1'] }),
    q1: node({ id: 'system-shell-boundary-question-1', role: 'user', parent: 'root', children: ['shell'] }),
    shell: systemBranchShellNode({ id: 'system-shell-before-next-question', parent: 'q1', children: ['q2'] }),
    q2: node({ id: 'system-shell-boundary-question-2', role: 'user', parent: 'shell', children: ['final'] }),
    final: node({ id: 'system-shell-boundary-final-2', role: 'assistant', parent: 'q2' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[1].answerVariants, ['system-shell-boundary-final-2']);
  equal(result.index.turns[1].answerVariants.includes('system-shell-before-next-question'), false);
});

await fixture('system shell with interrupted terminal retains no alias or answer', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'system-shell-interrupted-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: systemBranchShellNode({ id: 'system-shell-before-interruption', parent: 'q', children: ['interrupted'] }),
    interrupted: node({
      id: 'system-shell-interrupted-final',
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'interrupted' } },
      channel: 'final',
      endTurn: false,
    }),
  };
  const result = parser({ mapping, current_node: 'interrupted' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[0].primaryAId, null);
  equal(result.index.turns[0].stopped, true);
});

await fixture('system shell without a final retains no alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'system-shell-no-final-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: systemBranchShellNode({ id: 'system-shell-without-final', parent: 'q' }),
  };
  const result = parser({ mapping, current_node: 'shell' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[0].primaryAId, null);
  equal(result.index.turns[0].noAnswer, true);
});

await fixture('duplicate system-shell and final identity dedupes while final stays primary', () => {
  const sharedId = 'system-shell-shared-final-id';
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'system-shell-dedupe-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: systemBranchShellNode({ id: sharedId, parent: 'q', children: ['final'] }),
    final: node({
      id: sharedId,
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, [sharedId]);
  equal(result.index.turns[0].primaryAId, sharedId);
  equal(result.index.turns[0].branch.selectedAssistantNodeId, 'final');
});

await fixture('non-direct hidden assistant intermediary cannot become a shell alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'nondirect-shell-question', role: 'user', parent: 'root', children: ['system'] }),
    system: node({ id: 'direct-system-intermediary', role: 'system', parent: 'q', children: ['shell'] }),
    shell: branchShellNode({ id: 'nondirect-hidden-assistant', parent: 'system', children: ['final'] }),
    final: node({
      id: 'nondirect-shell-final',
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'stop' } },
      channel: 'final',
      endTurn: true,
    }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['nondirect-shell-final']);
  equal(result.index.turns[0].primaryAId, 'nondirect-shell-final');
});

await fixture('direct model_editable_context assistant cannot become a shell alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'model-context-shell-question', role: 'user', parent: 'root', children: ['context'] }),
    context: node({
      id: 'model-context-shell',
      role: 'assistant',
      parent: 'q',
      children: ['final'],
      metadata: {
        is_visually_hidden_from_conversation: true,
        model_slug: 'gpt-fixture-branch-shell',
        finish_details: { type: 'stop' },
      },
      contentType: 'model_editable_context',
      channel: 'final',
      endTurn: true,
    }),
    final: node({ id: 'model-context-final', role: 'assistant', parent: 'context' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['model-context-final']);
  equal(result.index.turns[0].answerVariants.includes('model-context-shell'), false);
});

await fixture('direct reasoning_recap assistant cannot become a shell alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'reasoning-shell-question', role: 'user', parent: 'root', children: ['reasoning'] }),
    reasoning: node({
      id: 'reasoning-shell',
      role: 'assistant',
      parent: 'q',
      children: ['final'],
      metadata: {
        is_visually_hidden_from_conversation: true,
        model_slug: 'gpt-fixture-branch-shell',
        finish_details: { type: 'stop' },
      },
      contentType: 'reasoning_recap',
      channel: 'final',
      endTurn: true,
    }),
    final: node({ id: 'reasoning-shell-final', role: 'assistant', parent: 'reasoning' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['reasoning-shell-final']);
  equal(result.index.turns[0].answerVariants.includes('reasoning-shell'), false);
});

await fixture('interrupted branch retains neither hidden shell alias nor answer', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'hidden-shell-interrupted-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: branchShellNode({ id: 'hidden-shell-before-interruption', parent: 'q', children: ['interrupted'] }),
    interrupted: node({
      id: 'hidden-shell-interrupted-final',
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'interrupted' } },
      channel: 'final',
      endTurn: false,
    }),
  };
  const result = parser({ mapping, current_node: 'interrupted' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[0].primaryAId, null);
  equal(result.index.turns[0].stopped, true);
});

await fixture('branch with no valid final cannot retain a hidden shell alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'hidden-shell-no-final-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: branchShellNode({ id: 'hidden-shell-without-final', parent: 'q' }),
  };
  const result = parser({ mapping, current_node: 'shell' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[0].primaryAId, null);
  equal(result.index.turns[0].noAnswer, true);
});

await fixture('hidden shell alias cannot cross the next product-user boundary', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q1'] }),
    q1: node({ id: 'shell-boundary-question-1', role: 'user', parent: 'root', children: ['shell'] }),
    shell: branchShellNode({ id: 'shell-before-next-question', parent: 'q1', children: ['q2'] }),
    q2: node({ id: 'shell-boundary-question-2', role: 'user', parent: 'shell', children: ['final'] }),
    final: node({ id: 'shell-boundary-final-2', role: 'assistant', parent: 'q2' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[1].answerVariants, ['shell-boundary-final-2']);
  equal(result.index.turns[1].answerVariants.includes('shell-before-next-question'), false);
});

await fixture('d824 shell alias cannot attach to the following product qId', () => {
  const d824 = fullResult.index.turns.find((row) => row.qId === D824);
  const following = fullResult.index.turns.find((row) => row.qId === NEXT_AFTER_D824_Q);
  equal(d824.answerVariants.includes(A84), true);
  equal(following.answerVariants.includes(A84), false);
});

await fixture('duplicate shell and final identities fail closed before projection', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'duplicate-shell-final-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: branchShellNode({ id: 'duplicate-shell-final-id', parent: 'q', children: ['final'] }),
    final: node({ id: 'duplicate-shell-final-id', role: 'assistant', parent: 'shell' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'duplicate-answer-identity');
  equal(result.completeness, undefined);
});

await fixture('shell alias insertion remains unique and selected primary remains last', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(new Set(turn.answerVariants).size, turn.answerVariants.length);
  equal(turn.answerVariants.at(-1), turn.primaryAId);
  equal(turn.primaryAId, A84);
});

await fixture('completed request placeholder cannot become a shell alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'placeholder-shell-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: branchShellNode({ id: 'request-placeholder-completed-shell', parent: 'q', children: ['final'] }),
    final: node({ id: 'placeholder-shell-final', role: 'assistant', parent: 'shell' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['placeholder-shell-final']);
  equal(result.index.turns[0].primaryAId, 'placeholder-shell-final');
});

await fixture('hidden direct assistant without model or completion proof is not a shell alias', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'unproven-shell-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: node({
      id: 'unproven-hidden-shell',
      role: 'assistant',
      parent: 'q',
      children: ['final'],
      metadata: { is_visually_hidden_from_conversation: true },
    }),
    final: node({ id: 'unproven-shell-final', role: 'assistant', parent: 'shell' }),
  };
  const result = parser({ mapping, current_node: 'final' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['unproven-shell-final']);
  equal(result.index.turns[0].answerVariants.includes('unproven-hidden-shell'), false);
});

await fixture('internal aabc user does not become a product qId or split d824 ownership', () => {
  const d824Turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(fullResult.index.turns.some((row) => row.qId === INTERNAL_D824), false);
  equal(d824Turn.answerVariants, [A733, A84]);
  equal(d824Turn.primaryAId, A84);
});

await fixture('model_editable_context assistant is not a product answer', () => {
  const answerIds = fullResult.index.turns.flatMap((turn) => turn.answerVariants);
  equal(answerIds.includes(HISTORICAL_CONTEXT_A), false);
  equal(answerIds.includes('bridge-10-context-assistant'), false);
  equal(answerIds.includes('d824-model-editable-context'), false);
});

await fixture('reasoning_recap assistant is not a product answer', () => {
  const answerIds = fullResult.index.turns.flatMap((turn) => turn.answerVariants);
  equal(answerIds.includes('bridge-10-reasoning-recap'), false);
  equal(answerIds.includes('bridge-20-reasoning-recap'), false);
  equal(answerIds.includes('d824-reasoning-recap'), false);
});

await fixture('hidden internal context assistant is not a product answer', () => {
  const answerIds = fullResult.index.turns.flatMap((turn) => turn.answerVariants);
  equal(answerIds.includes('bridge-20-context-assistant'), false);
  equal(fullFixture.internalAssistantIds.some((id) => answerIds.includes(id)), false);
});

await fixture('interrupted final assistant becomes NO ANSWER', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === HISTORICAL_Q);
  equal(turn.answerVariants.includes(HISTORICAL_INTERRUPTED_A), false);
  equal(turn.noAnswer, true);
  equal(turn.primaryAId, null);
});

await fixture('historical 7e60 is empty null NO ANSWER and stopped', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === HISTORICAL_Q);
  equal({
    qId: turn.qId,
    turnId: turn.turnId,
    primaryAId: turn.primaryAId,
    answerVariants: turn.answerVariants,
    noAnswer: turn.noAnswer,
    stopped: turn.stopped,
  }, {
    qId: HISTORICAL_Q,
    turnId: `turn:${HISTORICAL_Q}`,
    primaryAId: null,
    answerVariants: [],
    noAnswer: true,
    stopped: true,
  });
});

await fixture('branch with only a shell and interrupted terminal contributes no answer variant', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'shell-interrupted-question', role: 'user', parent: 'root', children: ['shell'] }),
    shell: node({ id: 'shell-before-interruption', role: 'assistant', parent: 'q', children: ['interrupted'] }),
    interrupted: node({
      id: 'interrupted-terminal',
      role: 'assistant',
      parent: 'shell',
      metadata: { finish_details: { type: 'interrupted' } },
      channel: 'final',
      endTurn: false,
    }),
  };
  const result = parser({ mapping, current_node: 'interrupted' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, []);
  equal(result.index.turns[0].primaryAId, null);
  equal(result.index.turns[0].noAnswer, true);
  equal(result.index.turns[0].stopped, true);
});

await fixture('latest c64 remains empty null NO ANSWER and not stopped', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === LATEST_Q);
  equal(turn.turnId, `turn:${LATEST_Q}`);
  equal(turn.primaryAId, null);
  equal(turn.answerVariants, []);
  equal(turn.noAnswer, true);
  equal(turn.stopped, false);
});

await fixture('finish type stop remains a valid completed answer', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.completedStopQId);
  equal(turn.answerVariants, ['answer-33']);
  equal(turn.primaryAId, 'answer-33');
  equal(turn.noAnswer, false);
  equal(turn.stopped, false);
});

await fixture('complete internal nodes still participate in raw global validation', () => {
  equal(fullResult.ok, true);
  equal(fullResult.index.completeness.complete, true);
  equal(fullResult.index.completeness.proof, 'host-payload-full-graph');
  equal(selectedPathKeys(fullFixture.payload).some((key) => key === 'd824-internal-user'), true);
});

await fixture('malformed internal branch cannot receive completeness proof', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['internal'] }),
    internal: node({
      id: INTERNAL_INITIAL,
      role: 'user',
      parent: 'root',
      children: [],
      metadata: { is_visually_hidden_from_conversation: true },
    }),
    q: node({ id: 'product-question', role: 'user', parent: 'internal' }),
  };
  const result = parser({ mapping, current_node: 'q' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'parent-child-contradiction');
  equal(result.completeness, undefined);
});

await fixture('internal filtering changes product fingerprint deterministically', () => {
  const initial = fullFixture.payload.mapping['initial-internal-user'];
  const promoted = {
    ...fullFixture.payload,
    mapping: {
      ...fullFixture.payload.mapping,
      'initial-internal-user': {
        ...initial,
        message: { ...initial.message, metadata: {} },
      },
    },
  };
  const first = parser(promoted, { chatId: CHAT_ID, capturedAt: '2026-07-18T00:00:00.000Z' });
  const second = parser(promoted, { chatId: CHAT_ID, capturedAt: '2099-01-01T00:00:00.000Z' });
  equal(first.ok, true);
  equal(first.index.turns.length, 39);
  equal(first.index.sourceFingerprint, second.index.sourceFingerprint);
  ok(first.index.sourceFingerprint !== fullResult.index.sourceFingerprint);
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
  equal(fullResult.index.turns.at(-1).qId, fullFixture.latestQId);
  equal(fullResult.index.turns.every((turn, index) => turn.order === index + 1), true);
});

await fixture('one selected user produces one logical turn', () => {
  equal(new Set(fullResult.index.turns.map((turn) => turn.qId)).size, 38);
  equal(fullResult.index.turns.every((turn) => turn.turnId === `turn:${turn.qId}`), true);
});

await fixture('assistant siblings remain variants under one box', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.answerVariants, [A733, A84]);
  equal(turn.branch.variantCount, 2);
});

await fixture('accepted d824 ownership resolves to the selected branch root', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === D824);
  equal(turn.primaryAId, A84);
  equal(turn.answerVariants.includes(A733), true);
  equal(turn.noAnswer, false);
});

await fixture('q29 remains local to answer 545', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === Q29);
  equal(turn.answerVariants, [A545]);
  equal(turn.primaryAId, A545);
  equal(turn.noAnswer, false);
  equal(turn.stopped, false);
});

await fixture('q29 direct hidden 2426 system intermediary is not an alias', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === Q29);
  equal(turn.answerVariants.includes(Q29_DIRECT_HIDDEN_SYSTEM), false);
  equal(turn.answerVariants, [A545]);
});

await fixture('q29 direct 2426 lacks model and completed shell proof', () => {
  const intermediary = fullFixture.payload.mapping['q29-hidden-system'];
  equal(intermediary.message.id, Q29_DIRECT_HIDDEN_SYSTEM);
  equal(intermediary.message.author.role, 'system');
  equal(intermediary.message.metadata.is_visually_hidden_from_conversation, true);
  equal(intermediary.message.metadata.model_slug, undefined);
  equal(intermediary.message.end_turn, false);
});

await fixture('q29 non-direct hidden 433a system intermediary is not an alias', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === Q29);
  equal(turn.answerVariants.includes(Q29_NONDIRECT_HIDDEN_SYSTEM), false);
  equal(turn.answerVariants, [A545]);
});

await fixture('NO ANSWER remains one ID-bearing turn', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.latestQId);
  equal(turn.noAnswer, true);
  equal(turn.primaryAId, null);
  equal(turn.answerVariants, []);
});

await fixture('empty text does not drop NO ANSWER identity', () => {
  ok(fullResult.index.turns.some((turn) => turn.qId === fullFixture.latestQId));
});

await fixture('stopped metadata is conservative and fabricates no answer', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.historicalQId);
  equal(turn.stopped, true);
  equal(turn.primaryAId, null);
});

await fixture('interrupted assistant metadata retains no current product identity', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.historicalQId);
  equal(turn.stopped, true);
  equal(turn.primaryAId, null);
  equal(turn.answerVariants, []);
});

await fixture('completed request placeholders are evicted', () => {
  const turn = fullResult.index.turns.find((row) => row.qId === fullFixture.placeholderQId);
  equal(turn.answerVariants, ['answer-32']);
  equal(turn.primaryAId, 'answer-32');
});

await fixture('placeholder-only streaming state remains represented', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'stream-question', role: 'user', parent: 'root', children: ['a'] }),
    a: node({ id: 'request-placeholder-stream-only', role: 'assistant', parent: 'q' }),
  };
  const result = parser({ mapping, current_node: 'a' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns[0].answerVariants, ['request-placeholder-stream-only']);
  equal(result.index.turns[0].primaryAId, 'request-placeholder-stream-only');
});

await fixture('message identity takes precedence over mapping node identity', () => {
  const mapping = {
    root: node({ id: 'root-message', role: 'system', children: ['question-node'] }),
    'question-node': node({ id: 'question-message', role: 'user', parent: 'root', children: ['answer-node'] }),
    'answer-node': node({ id: 'answer-message', role: 'assistant', parent: 'question-node' }),
  };
  const result = parser({ mapping, current_node: 'answer-node' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.identityPrecedence, 'message-id-then-mapping-node-id');
  equal(result.index.turns[0].qId, 'question-message');
  equal(result.index.turns[0].primaryAId, 'answer-message');
});

await fixture('intermediary tool nodes preserve selected assistant ownership', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'tool-path-question', role: 'user', parent: 'root', children: ['tool'] }),
    tool: node({ id: 'tool-path-node', role: 'tool', parent: 'q', children: ['a'] }),
    a: node({ id: 'tool-path-answer', role: 'assistant', parent: 'tool' }),
  };
  const result = parser({ mapping, current_node: 'a' }, { chatId: CHAT_ID });
  equal(result.ok, true);
  equal(result.index.turns.length, 1);
  equal(result.index.turns[0].qId, 'tool-path-question');
  equal(result.index.turns[0].answerVariants, ['tool-path-answer']);
  equal(result.index.turns[0].primaryAId, 'tool-path-answer');
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

await fixture('invalid whitespace mapping key fails globally', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q'] }),
    q: node({ id: 'question', role: 'user', parent: 'root' }),
    '   ': node({ id: 'invalid-key-node', role: 'assistant', parent: 'missing', children: ['missing-child'] }),
  };
  const result = parser({ mapping, current_node: 'q' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'mapping-node-invalid');
  equal(result.completeness, undefined);
});

await fixture('root child-list incompleteness fails globally', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: [] }),
    q: node({ id: 'question', role: 'user', parent: 'root' }),
  };
  const result = parser({ mapping, current_node: 'q' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'parent-child-contradiction');
  equal(result.completeness, undefined);
});

await fixture('unselected branch child-list incompleteness fails globally', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['selected-q', 'inactive-q'] }),
    'selected-q': node({ id: 'selected-question', role: 'user', parent: 'root', children: ['selected-a'] }),
    'selected-a': node({ id: 'selected-answer', role: 'assistant', parent: 'selected-q' }),
    'inactive-q': node({ id: 'inactive-question', role: 'user', parent: 'root', children: [] }),
    'inactive-a': node({ id: 'inactive-answer', role: 'assistant', parent: 'inactive-q' }),
  };
  const result = parser({ mapping, current_node: 'selected-a' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'parent-child-contradiction');
  equal(result.completeness, undefined);
});

await fixture('duplicated declared child reference fails globally', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q', 'q'] }),
    q: node({ id: 'question', role: 'user', parent: 'root' }),
  };
  const result = parser({ mapping, current_node: 'q' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'children-invalid');
  equal(result.completeness, undefined);
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

await fixture('duplicate assistant identity fails globally', () => {
  const mapping = {
    root: node({ id: 'root', role: 'system', children: ['q1'] }),
    q1: node({ id: 'question-a', role: 'user', parent: 'root', children: ['a1'] }),
    a1: node({ id: 'shared-answer', role: 'assistant', parent: 'q1', children: ['q2'] }),
    q2: node({ id: 'question-b', role: 'user', parent: 'a1', children: ['a2'] }),
    a2: node({ id: 'shared-answer', role: 'assistant', parent: 'q2' }),
  };
  const result = parser({ mapping, current_node: 'a2' }, { chatId: CHAT_ID });
  equal(result.ok, false);
  equal(result.errorCode, 'duplicate-answer-identity');
  equal(result.completeness, undefined);
  equal(countOccurrences(archiveSource, 'conversationTurnIndexFailure("answer-ownership-conflict"'), 1);
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
  equal(serialized.includes('PRIVATE PAYLOAD TOKEN'), false);
  equal(serialized.includes('PRIVATE ATTACHMENT'), false);
  equal(serialized.includes('PRIVATE RAW TOOL OUTPUT'), false);
  equal(serialized.includes('private question'), false);
  equal(serialized.includes('private answer'), false);
  equal(serialized.includes('private tool output'), false);
  equal(serialized.includes('"mapping":'), false);
  equal(Object.hasOwn(fullResult.index.turns[0], 'text'), false);
});

let providerCounters = null;
let providerResult = null;
await fixture('provider performs one logical authority conversation operation', async () => {
  const calls = [];
  const runtime = createArchiveRuntime(async (spec = {}) => {
    const method = String(spec.method || 'GET').toUpperCase();
    calls.push({ resource: String(spec.resource || ''), chatId: String(spec.chatId || ''), method });
    if (method === 'GET') runtime.counters.networkReads += 1;
    else runtime.counters.networkWrites += 1;
    return { ok: true, status: 'ok', statusCode: 200, body: fullFixture.payload, internalToken: 'TOP-SECRET-TOKEN' };
  });
  providerResult = await runtime.api.fetchConversationTurnIndex(CHAT_ID, { capturedAt: '2026-07-18T00:00:00.000Z' });
  providerCounters = runtime.counters;
  equal(calls.length, 1);
  equal(calls.map((call) => call.method), ['GET']);
  equal(calls[0].resource, 'conversation');
  equal(calls[0].chatId, CHAT_ID);
  equal(runtime.counters.networkWrites, 0);
});

await fixture('provider never returns its access token', () => {
  equal(providerResult.ok, true);
  equal(JSON.stringify(providerResult).includes('TOP-SECRET-TOKEN'), false);
  accumulate(providerCounters);
});

await fixture('real activation wiring registers provider and dedupes acquisition', async () => {
  const runtime = createActivationRuntime(fullFixture.payload);
  const activation = Object.assign({}, runtime.context.__TURN_INDEX_ACTIVATION__, {
    state: runtime.context.__TURN_INDEX_ATLAS__.state,
    diagnostics: runtime.context.__TURN_INDEX_ATLAS__.getConversationTurnIndexDiagnostics,
  });
  equal(runtime.context.__TURN_INDEX_OBSERVER_SUPPRESSED__, true);
  equal(runtime.context.__TURN_INDEX_REFRESH_SUPPRESSED__, true);
  equal(runtime.context.__TURN_INDEX_LEDGER_SUPPRESSED__, true);
  equal((runtime.listeners.get('evt:h2o:conversation-turn-index-provider:ready') || []).length, 1);
  ok((runtime.listeners.get('evt:h2o:route:changed') || []).length >= 1);
  equal(activation.state.attempted, false);
  equal(activation.state.fetchCount, 0);
  equal(runtime.networkCalls.length, 0);

  vm.runInContext(archiveActivationProgram, runtime.context, { filename: ARCHIVE_PATH, timeout: 3_000 });
  equal(runtime.context.__TURN_INDEX_ARCHIVE_ACTIVATED__.providerRegistered, true);
  ok(activation.state.promise);
  await activation.state.promise;
  equal(activation.diagnostics().status, 'complete-from-host-payload');
  equal(activation.diagnostics().index.count, 38);
  equal(activation.state.fetchCount, 1);
  equal(runtime.networkCalls.map((call) => call.method), ['GET']);
  equal(runtime.counters.networkWrites, 0);
  equal(JSON.stringify(activation.diagnostics()).includes('ACTIVATION-SECRET-TOKEN'), false);

  runtime.dispatchEvent(new runtime.context.CustomEvent('evt:h2o:conversation-turn-index-provider:ready'));
  runtime.dispatchEvent(new runtime.context.CustomEvent('evt:h2o:route:changed'));
  await Promise.resolve();
  equal(activation.state.fetchCount, 1);
  equal(runtime.networkCalls.length, 1);
  equal(activation.canonicalCount(), 0);
  equal(activation.ledgerCount(), 0);
  accumulate(runtime.counters);
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
console.log(`Provider network: logical authority conversation reads ${aggregate.networkReads}, writes ${aggregate.networkWrites}`);
console.log(`Safety: source setters ${aggregate.sourceSetterCalls}, navigation ${aggregate.navigationMutations}, DOM ${aggregate.domMutations}, user actions ${aggregate.userActions}, storage writes ${aggregate.storageWrites}, canary stages ${aggregate.automaticCanaryExecutions}`);
for (const failure of failures) console.error(`FAIL ${failure.name}\n${failure.error}`);
if (failures.length) process.exitCode = 1;
