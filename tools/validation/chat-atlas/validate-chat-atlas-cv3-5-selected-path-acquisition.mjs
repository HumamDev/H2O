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
const ROUTE_KEY = `/c/${CHAT_ID}`;
const BRANCH_2_A17 = '7b695490-e7a4-4af6-8ad9-4e15977917bb';
const BRANCH_2_Q18 = 'e9aeedf5-f75b-488c-8527-21d9ef155539';
const BRANCH_2_A18 = 'ac657e57-7d6b-4379-bf50-07158d192924';
const fixtures = [];
let assertionCount = 0;
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

async function settleAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function extractFunction(source, name) {
  const anchors = [`  function ${name}(`, `  async function ${name}(`];
  const matches = anchors
    .map((anchor) => ({ anchor, index: source.indexOf(anchor) }))
    .filter((item) => item.index >= 0);
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

function extractConst(source, name) {
  const prefix = `  const ${name} = `;
  const matches = source.split('\n').filter((line) => line.startsWith(prefix) && line.endsWith(';'));
  if (matches.length !== 1) throw new Error(`instrumentation-const-invalid:${name}`);
  return matches[0].trimStart();
}

const archiveFunctions = [
  'isObj',
  'nowIso',
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
  'conversationIdentityGraphFromMapping',
  'normalizeBackendConversationTurnIndexUnsafe',
  'normalizeBackendConversationTurnIndex',
];
for (const name of archiveFunctions) extractFunction(archiveSource, name);
const archiveProgram = `
'use strict';
const W = globalThis;
${extractConst(archiveSource, 'TURN_INDEX_SCHEMA')}
${archiveFunctions.map((name) => extractFunction(archiveSource, name)).join('\n')}
globalThis.__CV35_ARCHIVE__ = Object.freeze({
  normalizeBackendConversationTurnIndex,
  conversationIdentityGraphFromMapping,
});
`;

function archiveRuntime() {
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
    Date,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(archiveProgram, context, { filename: ARCHIVE_PATH, timeout: 5_000 });
  return context.__CV35_ARCHIVE__;
}

function messageNode({
  id,
  role,
  parent = null,
  children = [],
  stopped = false,
  contentType = 'text',
  hidden = false,
}) {
  const metadata = {
    ...(stopped ? { is_stopped: true } : {}),
    ...(hidden ? { is_visually_hidden_from_conversation: true } : {}),
  };
  return {
    id,
    parent,
    children: children.slice(),
    message: {
      id,
      author: { role },
      content: { content_type: contentType, parts: [`private:${id}`] },
      metadata,
      status: stopped ? 'stopped' : 'finished',
      end_turn: role === 'assistant',
      create_time: 1,
    },
  };
}

function graphNode(mapping, id, role, parent = null) {
  mapping[id] = messageNode({ id, role, parent });
  if (parent) mapping[parent].children.push(id);
  return id;
}

function buildHostGraph() {
  const mapping = {};
  graphNode(mapping, 'root-system', 'system');
  let parent = 'root-system';
  for (let order = 1; order <= 16; order += 1) {
    const qId = `canonical-q-${order}`;
    const aId = `canonical-a-${order}`;
    graphNode(mapping, qId, 'user', parent);
    graphNode(mapping, aId, 'assistant', qId);
    parent = aId;
  }
  const q17 = 'canonical-q-17';
  const a17 = 'canonical-a-17';
  graphNode(mapping, q17, 'user', parent);
  graphNode(mapping, a17, 'assistant', q17);
  graphNode(mapping, BRANCH_2_A17, 'assistant', q17);

  let canonicalParent = a17;
  for (let order = 18; order <= 39; order += 1) {
    const qId = `canonical-q-${order}`;
    const aId = `canonical-a-${order}`;
    graphNode(mapping, qId, 'user', canonicalParent);
    graphNode(mapping, aId, 'assistant', qId);
    canonicalParent = aId;
  }

  graphNode(mapping, 'branch-2-tool-17', 'tool', BRANCH_2_A17);
  graphNode(mapping, BRANCH_2_Q18, 'user', 'branch-2-tool-17');
  graphNode(mapping, 'branch-2-system-18', 'system', BRANCH_2_Q18);
  graphNode(mapping, BRANCH_2_A18, 'assistant', 'branch-2-system-18');
  return {
    id: CHAT_ID,
    conversation_id: CHAT_ID,
    current_node: canonicalParent,
    update_time: 1785000000,
    mapping,
  };
}

function buildOverflowPayload() {
  const mapping = {};
  graphNode(mapping, 'overflow-root', 'system');
  graphNode(mapping, 'overflow-q', 'user', 'overflow-root');
  graphNode(mapping, 'overflow-a', 'assistant', 'overflow-q');
  for (let index = 0; index < 8190; index += 1) {
    graphNode(mapping, `orphan-${index}`, 'system');
  }
  return {
    id: CHAT_ID,
    current_node: 'overflow-a',
    mapping,
  };
}

function instrumentCore() {
  const required = [
    'chatAtlasApplyEvidence',
    'chatAtlasRetainIdentityGraph',
    'chatAtlasSelectedPathEvaluate',
    'chatAtlasDeriveSelectedPath',
    'chatAtlasSelectedPathProofValid',
    'chatAtlasSelectedPathRefetch',
    'chatAtlasClearSelectedPathAcquisition',
    'getSelectedPathAcquisitionStatus',
  ];
  for (const name of required) {
    if (countOccurrences(coreSource, `  function ${name}(`) + countOccurrences(coreSource, `  async function ${name}(`) !== 1) {
      throw new Error(`core-instrumentation-anchor-invalid:${name}`);
    }
  }
  const marker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const close = '\n})();';
  const markerIndex = coreSource.indexOf(marker);
  const closeIndex = coreSource.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('core-bootstrap-boundary-invalid');
  const exportBlock = `
  globalThis.__CV35_CORE__ = Object.freeze({
    configure(rawIndex, identityGraph, options = {}) {
      chatAtlasClearSelectedPathAcquisition('fixture-reset');
      chatAtlasLedgerState.members = [];
      chatAtlasLedgerState.ready = false;
      chatAtlasLedgerState.version = 0;
      chatAtlasLedgerState.chatKey = '';
      chatAtlasLedgerState.nextMemberId = 1;
      chatAtlasLedgerState.quarantinedAliases = new Set();
      const normalized = chatAtlasNormalizeCompleteIndexEnvelope(rawIndex, rawIndex?.chatId, { source: 'host' });
      if (!normalized.ok) throw new Error('fixture-index-invalid:' + normalized.errorCode);
      completeTurnIndexAuthorityState.enabled = options.enabled !== false;
      completeTurnIndexAuthorityState.status = 'complete-validated';
      completeTurnIndexAuthorityState.chatId = rawIndex.chatId;
      completeTurnIndexAuthorityState.routeKey = options.routeKey || D.location.pathname;
      completeTurnIndexAuthorityState.generation = Number(options.generation || 1);
      completeTurnIndexAuthorityState.index = normalized.envelope;
      completeTurnIndexAuthorityState.indexSource = 'host-payload';
      completeTurnIndexAuthorityState.branchSelectionStale = options.stale !== false;
      completeTurnIndexAuthorityState.branchSelectionStaleRevision = Number(options.staleRevision || 1);
      completeTurnIndexAuthorityState.branchSelectionStaleQId = options.qId || 'canonical-q-17';
      completeTurnIndexAuthorityState.branchSelectionStaleChatId = rawIndex.chatId;
      completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = options.routeKey || D.location.pathname;
      completeTurnIndexAuthorityState.branchSelectionStaleGeneration = Number(options.generation || 1);
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        token: options.token || 'trusted-token-1',
        chatId: rawIndex.chatId,
        routeKey: options.intentRouteKey || options.routeKey || D.location.pathname,
        generation: Number(options.intentGeneration || options.generation || 1),
        direction: 'next',
        qId: options.qId || 'canonical-q-17',
        priorAnswerId: options.priorAnswerId || 'canonical-a-17',
        staleRevision: Number(options.intentStaleRevision || options.staleRevision || 1),
        observedAt: Date.now(),
      });
      if (identityGraph) {
        chatAtlasRetainIdentityGraph({ ok: true, identityGraph }, {
          chatId: rawIndex.chatId,
          routeKey: options.routeKey || D.location.pathname,
          generation: Number(options.generation || 1),
        });
      }
      return getSelectedPathAcquisitionStatus();
    },
    retain(result) {
      return chatAtlasRetainIdentityGraph(result, {
        chatId: completeTurnIndexAuthorityState.chatId,
        routeKey: completeTurnIndexAuthorityState.routeKey,
        generation: completeTurnIndexAuthorityState.generation,
      });
    },
    apply(read, reason = 'cv35-fixture') {
      return chatAtlasApplyEvidence(read, reason, true);
    },
    evaluate(members = chatAtlasLedgerState.members) {
      return chatAtlasSelectedPathEvaluate(members);
    },
    status: getSelectedPathAcquisitionStatus,
    completeStatus: getCompleteTurnIndexProjectionStatus,
    privateSnapshot() {
      return {
        status: selectedPathAcquisitionState.status,
        reason: selectedPathAcquisitionState.reason,
        path: selectedPathAcquisitionState.path,
        proof: selectedPathAcquisitionState.proof,
        refetchAttemptedForToken: selectedPathAcquisitionState.refetchAttemptedForToken,
        graphRetained: !!selectedPathAcquisitionState.graph,
        canonical: completeTurnIndexAuthorityState.index,
        intent: completeTurnIndexAuthorityState.trustedSelectedPathIntent,
        stale: completeTurnIndexAuthorityState.branchSelectionStale,
        staleRevision: completeTurnIndexAuthorityState.branchSelectionStaleRevision,
      };
    },
    setProvider(provider) {
      H2O.archiveBoot = H2O.archiveBoot || {};
      H2O.archiveBoot.fetchConversationTurnIndex = provider;
    },
    setIntent(patch = {}) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        ...(completeTurnIndexAuthorityState.trustedSelectedPathIntent || {}),
        ...patch,
      });
    },
    setRoute(routeKey) { completeTurnIndexAuthorityState.routeKey = String(routeKey || ''); },
    setGeneration(value) { completeTurnIndexAuthorityState.generation = Number(value || 0); },
    setStaleRevision(value) { completeTurnIndexAuthorityState.branchSelectionStaleRevision = Number(value || 0); },
    setFingerprint(value) {
      completeTurnIndexAuthorityState.index = Object.freeze({
        ...completeTurnIndexAuthorityState.index,
        sourceFingerprint: String(value || ''),
      });
    },
    clear(reason, preserveGraph = false) {
      return chatAtlasClearSelectedPathAcquisition(reason, { preserveGraph });
    },
    disable() {
      completeTurnIndexAuthorityState.enabled = false;
      chatAtlasClearSelectedPathAcquisition('feature-disabled');
    },
  });
  globalThis.__CV35_CORE_BOOTSTRAP_SUPPRESSED__ = true;
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

function createCoreRuntime() {
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
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: Object.freeze({ pushState() {}, replaceState() {} }),
    navigator: Object.freeze({ userAgent: 'cv3.5-selected-path-validator' }),
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
  equal(context.__CV35_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core boot side effects are suppressed');
  for (const key of Object.keys(counters)) counters[key] = 0;
  return { context, api: context.__CV35_CORE__, counters };
}

function shell(turnId, role) {
  return {
    isConnected: true,
    getAttribute(name) {
      if (name === 'data-testid') return `conversation-turn-${turnId}`;
      if (name === 'data-turn-id') return turnId;
      if (name === 'data-turn') return role;
      return null;
    },
  };
}

function evidence({ role, qId, aId, shellIndex, flowRef }) {
  const id = role === 'user' ? qId : aId;
  const shellRef = shell(id, role);
  return {
    shell: shellRef,
    shellIndex,
    testId: `conversation-turn-${shellIndex + 1}`,
    shellOrdinal: shellIndex + 1,
    flowRef,
    role,
    roleNode: null,
    hydrated: true,
    aliases: new Set([id]),
    shellTurnId: id,
    messageId: id,
    currentId: id,
  };
}

function selectedPathRead({
  answer17 = BRANCH_2_A17,
  includeAnchor = true,
  duplicateAnchor = false,
  includeQ18 = true,
  answer18 = BRANCH_2_A18,
} = {}) {
  const flowRef = { id: 'cv35-flow' };
  const rows = [];
  let shellIndex = 0;
  for (let order = 1; order <= 18; order += 1) {
    if (order === 17 && !includeAnchor) continue;
    if (order === 18 && !includeQ18) continue;
    const qId = order === 18 ? BRANCH_2_Q18 : `canonical-q-${order}`;
    const aId = order === 17 ? answer17 : (order === 18 ? answer18 : `canonical-a-${order}`);
    rows.push(evidence({ role: 'user', qId, shellIndex: shellIndex++, flowRef }));
    if (aId) rows.push(evidence({ role: 'assistant', aId, shellIndex: shellIndex++, flowRef }));
    if (order === 17 && duplicateAnchor) {
      rows.push(evidence({ role: 'user', qId, shellIndex: shellIndex++, flowRef }));
      rows.push(evidence({ role: 'assistant', aId, shellIndex: shellIndex++, flowRef }));
    }
  }
  return {
    shells: rows.map((row) => row.shell),
    root: null,
    evidence: rows,
    unbound: [],
    questionShellCount: rows.filter((row) => row.role === 'user').length,
    answerShellCount: rows.filter((row) => row.role === 'assistant').length,
    canonicalRecords: [],
    canonicalShellBindings: new Map(),
    canonicalVersion: 1,
    completeShellMap: true,
    readMs: 0,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mutableGraph(graph) {
  return deepClone(graph);
}

function graphById(graph) {
  return new Map(graph.nodes.map((node) => [node.nodeId, node]));
}

function removeChild(graph, parentId, childId) {
  const nodes = graphById(graph);
  nodes.get(parentId).childIds = nodes.get(parentId).childIds.filter((id) => id !== childId);
}

function addChild(graph, parentId, childId) {
  const nodes = graphById(graph);
  if (!nodes.get(parentId).childIds.includes(childId)) nodes.get(parentId).childIds.push(childId);
  nodes.get(childId).parentId = parentId;
}

function canonicalBytes(api) {
  return JSON.stringify(clean(api.privateSnapshot().canonical));
}

function assertSafety(runtime, { networkCalls = 0 } = {}) {
  equal(runtime.counters.storageWrites, 0, 'storage writes remain zero');
  equal(runtime.counters.preferenceWrites, 0, 'preference writes remain zero');
  equal(runtime.counters.canonicalWrites, 0, 'canonical writes remain zero');
  equal(runtime.counters.aliasWrites, 0, 'alias writes remain zero');
  equal(runtime.counters.selectedPathReconciliationCalls, 0, 'selected-path reconciliation remains zero');
  equal(runtime.counters.networkCalls, networkCalls, 'network calls stay at the allowed count');
  equal(runtime.counters.cacheWrites, 0, 'cache writes remain zero');
  equal(runtime.counters.uiPublications, 0, 'UI publications remain zero');
  equal(runtime.counters.timerCalls, 0, 'timer calls remain zero');
  equal(runtime.counters.rafCalls, 0, 'RAF calls remain zero');
  for (const key of Object.keys(aggregate)) aggregate[key] += runtime.counters[key];
}

const parser = archiveRuntime();
const payload = buildHostGraph();
const flagOff = parser.normalizeBackendConversationTurnIndex(payload, {
  chatId: CHAT_ID,
  capturedAt: '2026-07-27T00:00:00.000Z',
});
const flagFalse = parser.normalizeBackendConversationTurnIndex(payload, {
  chatId: CHAT_ID,
  capturedAt: '2026-07-27T00:00:00.000Z',
  includeIdentityGraph: false,
});
const flagOn = parser.normalizeBackendConversationTurnIndex(payload, {
  chatId: CHAT_ID,
  capturedAt: '2026-07-27T00:00:00.000Z',
  includeIdentityGraph: true,
});

await fixture('Harness A flag-off compatibility', () => {
  equal(flagOff, flagFalse, 'absent and false graph options are deeply identical');
  equal(Object.hasOwn(flagOff, 'identityGraph'), false, 'flag-off result has no graph field');
  equal(Object.keys(flagOff).sort(), ['index', 'ok'], 'flag-off output shape is unchanged');
  equal(flagOff.index.turns.length, 39, 'canonical current_node path remains 39 turns');
});

await fixture('Harness A IDs-only immutable graph', () => {
  equal(flagOn.ok, true, 'flag-on parser succeeds');
  equal(flagOn.identityGraph.nodeCount, Object.keys(payload.mapping).length, 'all validated nodes are represented');
  equal(flagOn.identityGraph.currentNode, payload.current_node, 'currentNode remains informational');
  equal(Object.keys(flagOn.identityGraph).sort(), ['capturedAt', 'chatId', 'currentNode', 'nodeCount', 'nodes'], 'graph keys are exact');
  equal(
    Object.keys(flagOn.identityGraph.nodes[0]).sort(),
    ['childIds', 'messageId', 'nodeId', 'parentId', 'productAnswer', 'productUser', 'role', 'stopped'],
    'node keys are exact',
  );
  ok(Object.isFrozen(flagOn.identityGraph), 'graph is frozen');
  ok(Object.isFrozen(flagOn.identityGraph.nodes), 'node array is frozen');
  ok(flagOn.identityGraph.nodes.every((node) => Object.isFrozen(node) && Object.isFrozen(node.childIds)), 'every record and child array is frozen');
  equal(JSON.stringify(flagOn.identityGraph).includes('private:'), false, 'message content is absent');
  equal(JSON.stringify(flagOn.identityGraph).includes('content'), false, 'content metadata is absent');
  equal(JSON.stringify(flagOn.identityGraph).includes('metadata'), false, 'extra message metadata is absent');
  const q17 = flagOn.identityGraph.nodes.find((node) => node.nodeId === 'canonical-q-17');
  equal(q17.childIds, ['canonical-a-17', BRANCH_2_A17], 'orderedChildren ordering is retained');
});

await fixture('Harness A graph cap preserves flat index', () => {
  const overflow = buildOverflowPayload();
  const off = parser.normalizeBackendConversationTurnIndex(overflow, {
    chatId: CHAT_ID,
    capturedAt: '2026-07-27T00:00:00.000Z',
  });
  const on = parser.normalizeBackendConversationTurnIndex(overflow, {
    chatId: CHAT_ID,
    capturedAt: '2026-07-27T00:00:00.000Z',
    includeIdentityGraph: true,
  });
  equal(on.ok, true, 'oversized graph does not invalidate the flat index');
  equal(on.index, off.index, 'oversized graph leaves flat index unchanged');
  equal(on.identityGraph, null, 'oversized graph is not exposed');
  equal(on.identityGraphError, 'graph-too-large', 'oversized graph reports the bounded error');
});

await fixture('Harness B full selected path proof', () => {
  const runtime = createCoreRuntime();
  runtime.api.configure(flagOn.index, flagOn.identityGraph);
  const before = canonicalBytes(runtime.api);
  runtime.api.apply(selectedPathRead());
  const snapshot = runtime.api.privateSnapshot();
  equal(snapshot.status, 'proven', 'selected path is proven');
  equal(snapshot.reason, 'selected-path-proven', 'proof reason is exact');
  equal(snapshot.path.length, 18, 'selected path has 18 turns');
  equal(snapshot.path.map((turn) => turn.order), Array.from({ length: 18 }, (_, index) => index + 1), 'orders are contiguous');
  equal(snapshot.path.slice(0, 16).every((turn) => turn.provenance === 'canonical-prefix'), true, 'turns 1..16 are canonical prefix');
  equal(snapshot.path[16].provenance, 'anchor', 'turn 17 is the anchor');
  equal(snapshot.path[16].primaryAId, BRANCH_2_A17, 'anchor primary is selected branch 2');
  equal(snapshot.path[17].provenance, 'graph-descent', 'turn 18 descends from graph');
  equal(snapshot.path[17].qId, BRANCH_2_Q18, 'downstream q18 is exact');
  equal(snapshot.path[17].primaryAId, BRANCH_2_A18, 'downstream a18 is exact');
  equal(snapshot.proof.rootNodeId, 'root-system', 'root is proven');
  equal(snapshot.proof.tailNodeId, BRANCH_2_A18, 'terminal leaf is proven');
  equal(snapshot.proof.canonicalPrefixLength, 17, 'canonical prefix proof includes anchor');
  equal(canonicalBytes(runtime.api), before, 'canonical rows remain byte-stable');
  equal(runtime.api.completeStatus().selectedPathAcquisition.status, 'proven', 'complete diagnostics are additive');
  equal(runtime.api.status().pathLength, 18, 'pure status reports IDs/status metadata only');
  equal(
    /^djb2:[a-z0-9]+$/.test(runtime.api.status().token),
    true,
    'pure status retains only hashed token ownership metadata',
  );
  equal(Object.hasOwn(runtime.api.status(), 'graph'), false, 'public status never exposes raw graph');
  assertSafety(runtime);
});

async function expectFailure(name, setup, expectedReason, readOptions = {}) {
  await fixture(name, async () => {
    const runtime = createCoreRuntime();
    const graph = mutableGraph(flagOn.identityGraph);
    const options = {};
    await setup({ runtime, graph, options });
    runtime.api.configure(flagOn.index, options.noGraph ? null : graph, options);
    if (options.provider) runtime.api.setProvider(options.provider);
    runtime.api.apply(selectedPathRead(readOptions));
    await settleAsyncWork();
    const snapshot = runtime.api.privateSnapshot();
    equal(snapshot.status, expectedReason === 'inactive' ? 'inactive' : 'failed', `${name} fails closed`);
    equal(snapshot.reason, expectedReason, `${name} reason is exact`);
    equal(snapshot.path, null, `${name} exposes no selected path`);
    assertSafety(runtime, { networkCalls: options.expectedNetworkCalls || 0 });
  });
}

await expectFailure(
  'graph absent refetch exhausted',
  async ({ options }) => {
    options.noGraph = true;
    options.provider = async () => ({ ok: false, errorCode: 'unavailable' });
  },
  'anchor-not-in-graph',
);

await expectFailure(
  'anchor missing after one refetch',
  async ({ graph, options }) => {
    const nodes = graphById(graph);
    removeChild(graph, 'canonical-q-17', BRANCH_2_A17);
    graph.nodes = graph.nodes.filter((node) => node.nodeId !== BRANCH_2_A17);
    options.noGraph = true;
    options.provider = async () => ({ ok: true, identityGraph: graph });
  },
  'anchor-not-in-graph',
);

await expectFailure(
  'anchor linkage invalid',
  async ({ graph }) => {
    removeChild(graph, 'canonical-q-17', BRANCH_2_A17);
    addChild(graph, 'canonical-q-16', BRANCH_2_A17);
  },
  'anchor-linkage-invalid',
);

await expectFailure(
  'canonical prefix mismatch',
  async ({ graph }) => {
    removeChild(graph, 'canonical-a-16', 'canonical-q-17');
    addChild(graph, 'canonical-a-15', 'canonical-q-17');
  },
  'prefix-mismatch',
);

await expectFailure(
  'unresolved downstream question fork',
  async ({ graph }) => {
    const nodes = graphById(graph);
    const forkQ = {
      ...nodes.get(BRANCH_2_Q18),
      nodeId: 'branch-2-q18-fork',
      messageId: 'branch-2-q18-fork',
      parentId: 'branch-2-tool-17',
      childIds: [],
    };
    graph.nodes.push(forkQ);
    nodes.get('branch-2-tool-17').childIds.push(forkQ.nodeId);
    graph.nodeCount += 1;
  },
  'fork-unresolved',
  { includeQ18: false },
);

await expectFailure(
  'ambiguous descent answer variants',
  async ({ graph }) => {
    const nodes = graphById(graph);
    const extra = {
      ...nodes.get(BRANCH_2_A18),
      nodeId: 'branch-2-a18-alt',
      messageId: 'branch-2-a18-alt',
      parentId: 'branch-2-system-18',
    };
    graph.nodes.push(extra);
    nodes.get('branch-2-system-18').childIds.push(extra.nodeId);
    graph.nodeCount += 1;
  },
  'descent-variant-ambiguous',
  { includeQ18: false },
);

await expectFailure(
  'duplicate qId in graph descent',
  async ({ graph }) => {
    const nodes = graphById(graph);
    const qDup = {
      ...nodes.get(BRANCH_2_Q18),
      nodeId: 'branch-2-q-duplicate-node',
      parentId: BRANCH_2_A18,
      childIds: [],
    };
    graph.nodes.push(qDup);
    nodes.get(BRANCH_2_A18).childIds.push(qDup.nodeId);
    graph.nodeCount += 1;
  },
  'duplicate-qid',
);

await expectFailure(
  'descent qId already belongs to canonical index',
  async ({ graph }) => {
    graphById(graph).get(BRANCH_2_Q18).messageId = 'canonical-q-18';
  },
  'descent-qid-already-canonical',
);

await expectFailure(
  'unanswered middle gap',
  async ({ graph }) => {
    const nodes = graphById(graph);
    removeChild(graph, 'branch-2-system-18', BRANCH_2_A18);
    graph.nodes = graph.nodes.filter((node) => !['branch-2-system-18', BRANCH_2_A18].includes(node.nodeId));
    nodes.get(BRANCH_2_Q18).childIds = [];
    const q19 = {
      ...nodes.get(BRANCH_2_Q18),
      nodeId: 'branch-2-q19',
      messageId: 'branch-2-q19',
      parentId: BRANCH_2_Q18,
      childIds: [],
    };
    graph.nodes.push(q19);
    nodes.get(BRANCH_2_Q18).childIds.push(q19.nodeId);
    graph.nodeCount = graph.nodes.length;
  },
  'gap-in-path',
);

await expectFailure(
  'derivation visit bounds',
  async ({ graph }) => {
    const nodes = graphById(graph);
    let parent = BRANCH_2_A17;
    removeChild(graph, BRANCH_2_A17, 'branch-2-tool-17');
    graph.nodes = graph.nodes.filter((node) => ![
      'branch-2-tool-17',
      BRANCH_2_Q18,
      'branch-2-system-18',
      BRANCH_2_A18,
    ].includes(node.nodeId));
    for (let index = 0; index < 4097; index += 1) {
      const nodeId = `bounded-tool-${index}`;
      graph.nodes.push({
        nodeId,
        parentId: parent,
        childIds: [],
        role: 'tool',
        messageId: nodeId,
        productUser: false,
        productAnswer: false,
        stopped: false,
      });
      const parentNode = graph.nodes.find((node) => node.nodeId === parent);
      parentNode.childIds.push(nodeId);
      parent = nodeId;
    }
    graph.nodeCount = graph.nodes.length;
  },
  'derivation-bounds-exceeded',
  { includeQ18: false },
);

await expectFailure(
  'two native anchor members',
  async () => {},
  'anchor-member-ambiguous',
  { duplicateAnchor: true },
);

await expectFailure(
  'no native anchor member',
  async () => {},
  'anchor-member-missing',
  { includeAnchor: false },
);

await expectFailure(
  'selected answer equals canonical primary',
  async () => {},
  'selected-answer-not-changed',
  { answer17: 'canonical-a-17' },
);

await fixture('non-native and ambiguous anchor evidence fail closed', () => {
  const nonNative = createCoreRuntime();
  nonNative.api.configure(flagOn.index, flagOn.identityGraph);
  nonNative.api.evaluate([{
    question: { currentQId: 'canonical-q-17' },
    answer: {
      currentProjectionSource: 'previous-primary-fallback',
      currentAnswerIds: [BRANCH_2_A17],
    },
  }]);
  equal(nonNative.api.privateSnapshot().status, 'failed', 'non-native anchor fails');
  equal(nonNative.api.privateSnapshot().reason, 'anchor-member-missing', 'non-native anchor reason is exact');
  const ambiguous = createCoreRuntime();
  ambiguous.api.configure(flagOn.index, flagOn.identityGraph);
  ambiguous.api.evaluate([{
    question: { currentQId: 'canonical-q-17' },
    answer: {
      currentProjectionSource: 'native-evidence',
      currentAnswerIds: [BRANCH_2_A17, 'canonical-a-17'],
    },
  }]);
  equal(ambiguous.api.privateSnapshot().status, 'failed', 'ambiguous anchor fails');
  equal(ambiguous.api.privateSnapshot().reason, 'anchor-answer-ambiguous', 'ambiguous anchor reason is exact');
  assertSafety(nonNative);
  assertSafety(ambiguous);
});

await fixture('canonical return remains owned by the accepted stale-clear lifecycle', () => {
  const runtime = createCoreRuntime();
  runtime.api.configure(flagOn.index, flagOn.identityGraph, {
    priorAnswerId: BRANCH_2_A17,
  });
  runtime.api.apply(selectedPathRead({ answer17: 'canonical-a-17', includeQ18: false }));
  const snapshot = runtime.api.privateSnapshot();
  equal(snapshot.stale, false, 'exact canonical return clears branch stale state');
  equal(snapshot.status, 'inactive', 'acquisition remains inactive after canonical return');
  equal(snapshot.reason, 'native-branch-returned-to-canonical', 'canonical return owns the clear reason');
  equal(snapshot.path, null, 'canonical return does not create a selected path');
  equal(runtime.counters.uiPublications, 3, 'only the pre-existing stale-clear notifier publishes');
  runtime.counters.uiPublications = 0;
  assertSafety(runtime);
});

await fixture('terminal NO ANSWER is proven only at an explicit leaf', () => {
  const runtime = createCoreRuntime();
  const graph = mutableGraph(flagOn.identityGraph);
  removeChild(graph, 'branch-2-system-18', BRANCH_2_A18);
  removeChild(graph, BRANCH_2_Q18, 'branch-2-system-18');
  graph.nodes = graph.nodes.filter((node) => !['branch-2-system-18', BRANCH_2_A18].includes(node.nodeId));
  graph.nodeCount = graph.nodes.length;
  runtime.api.configure(flagOn.index, graph);
  runtime.api.apply(selectedPathRead({ answer18: null }));
  const snapshot = runtime.api.privateSnapshot();
  equal(snapshot.status, 'proven', 'terminal unanswered selected path is proven');
  equal(snapshot.path.length, 18, 'terminal unanswered row retains global order');
  equal(snapshot.path[17].noAnswer, true, 'tail is explicitly NO ANSWER');
  equal(snapshot.path[17].primaryAId, null, 'tail has no invented primary');
  equal(snapshot.proof.tailNodeId, BRANCH_2_Q18, 'question leaf is the explicit tail');
  assertSafety(runtime);
});

await fixture('one bounded graph refetch is retained but flat rows are discarded', async () => {
  const runtime = createCoreRuntime();
  let calls = 0;
  runtime.api.configure(flagOn.index, null);
  const canonicalBefore = canonicalBytes(runtime.api);
  runtime.api.setProvider(async (_chatId, options) => {
    calls += 1;
    equal(options.includeIdentityGraph, true, 'refetch explicitly requests identity graph');
    return { ok: true, index: { forbidden: 'flat-result-must-not-apply' }, identityGraph: flagOn.identityGraph };
  });
  runtime.api.apply(selectedPathRead());
  await Promise.resolve();
  await Promise.resolve();
  runtime.api.evaluate();
  await Promise.resolve();
  equal(calls, 1, 'same token performs exactly one provider call');
  equal(runtime.api.privateSnapshot().status, 'proven', 'refetched graph can prove the path');
  equal(canonicalBytes(runtime.api), canonicalBefore, 'refetch flat index is discarded unread');
  runtime.counters.networkCalls = calls;
  assertSafety(runtime, { networkCalls: 1 });
});

await fixture('newer token supersedes an in-flight refetch', async () => {
  const runtime = createCoreRuntime();
  let resolveProvider;
  runtime.api.configure(flagOn.index, null);
  runtime.api.setProvider(() => new Promise((resolve) => { resolveProvider = resolve; }));
  runtime.api.apply(selectedPathRead());
  await Promise.resolve();
  runtime.api.setIntent({ token: 'trusted-token-newer' });
  resolveProvider({ ok: true, identityGraph: flagOn.identityGraph });
  await Promise.resolve();
  await Promise.resolve();
  equal(runtime.api.privateSnapshot().status, 'inactive', 'old refetch cannot publish after token supersede');
  equal(runtime.api.privateSnapshot().reason, 'identity-graph-refetch-scope-drift', 'token race has exact discard reason');
  assertSafety(runtime);
});

await fixture('route and generation drift discard acquisition', () => {
  const routeRuntime = createCoreRuntime();
  routeRuntime.api.configure(flagOn.index, flagOn.identityGraph);
  routeRuntime.api.setRoute('/c/other-route');
  routeRuntime.api.evaluate([]);
  equal(routeRuntime.api.privateSnapshot().status, 'inactive', 'route drift cannot prove');
  const generationRuntime = createCoreRuntime();
  generationRuntime.api.configure(flagOn.index, flagOn.identityGraph);
  generationRuntime.api.setGeneration(2);
  generationRuntime.api.evaluate([]);
  equal(generationRuntime.api.privateSnapshot().status, 'inactive', 'generation drift cannot prove');
  assertSafety(routeRuntime);
  assertSafety(generationRuntime);
});

await fixture('stale revision mismatch and canonical fingerprint change re-evaluate', () => {
  const revisionRuntime = createCoreRuntime();
  revisionRuntime.api.configure(flagOn.index, flagOn.identityGraph);
  revisionRuntime.api.setStaleRevision(2);
  revisionRuntime.api.evaluate([]);
  equal(revisionRuntime.api.privateSnapshot().status, 'inactive', 'stale revision mismatch cannot prove');
  const fingerprintRuntime = createCoreRuntime();
  fingerprintRuntime.api.configure(flagOn.index, flagOn.identityGraph);
  fingerprintRuntime.api.apply(selectedPathRead());
  equal(fingerprintRuntime.api.privateSnapshot().status, 'proven', 'baseline proof succeeds');
  const priorProof = fingerprintRuntime.api.privateSnapshot().proof;
  fingerprintRuntime.api.setFingerprint('djb2:changed');
  fingerprintRuntime.api.evaluate();
  equal(fingerprintRuntime.api.privateSnapshot().status, 'proven', 'valid current evidence can re-prove after fingerprint drift');
  ok(fingerprintRuntime.api.privateSnapshot().proof !== priorProof, 'old fingerprint proof object is invalidated');
  equal(fingerprintRuntime.api.privateSnapshot().proof.canonicalFingerprint, 'djb2:changed', 'replacement proof binds the new fingerprint');
  assertSafety(revisionRuntime);
  assertSafety(fingerprintRuntime);
});

await fixture('canonical return, host adoption, disable, and runtime recreation clear memory state', () => {
  const runtime = createCoreRuntime();
  runtime.api.configure(flagOn.index, flagOn.identityGraph);
  runtime.api.apply(selectedPathRead());
  equal(runtime.api.privateSnapshot().status, 'proven', 'proof starts active');
  runtime.api.clear('native-branch-returned-to-canonical', true);
  equal(runtime.api.privateSnapshot().status, 'inactive', 'canonical return clears acquisition');
  equal(runtime.api.privateSnapshot().graphRetained, true, 'same-scope canonical return may retain graph');
  runtime.api.clear('host-adopted');
  equal(runtime.api.privateSnapshot().graphRetained, false, 'host adoption can clear graph');
  runtime.api.configure(flagOn.index, flagOn.identityGraph);
  runtime.api.disable();
  equal(runtime.api.privateSnapshot().status, 'inactive', 'disable clears acquisition');
  equal(runtime.api.privateSnapshot().graphRetained, false, 'disable clears graph');
  const fresh = createCoreRuntime();
  equal(fresh.api.status().status, 'inactive', 'new runtime starts inactive');
  assertSafety(runtime);
  assertSafety(fresh);
});

await fixture('unchanged host graph retains a current proof', () => {
  const runtime = createCoreRuntime();
  runtime.api.configure(flagOn.index, flagOn.identityGraph);
  runtime.api.apply(selectedPathRead());
  const before = runtime.api.privateSnapshot();
  const recaptured = deepClone(flagOn.identityGraph);
  recaptured.capturedAt = '2026-07-27T00:00:01.000Z';
  equal(runtime.api.retain({ ok: true, identityGraph: recaptured }), true, 'unchanged graph is retained');
  const after = runtime.api.privateSnapshot();
  equal(after.status, 'proven', 'unchanged graph retains proof');
  equal(after.path, before.path, 'unchanged graph retains selected path');
  equal(after.proof.graphCapturedAt, recaptured.capturedAt, 'proof capture metadata advances');
  assertSafety(runtime);
});

await fixture('source integration remains Stage-1-only', () => {
  equal(countOccurrences(coreSource, 'chatAtlasSelectedPathEvaluate(next);'), 1, 'evaluation hooks once after ledger application');
  ok(
    coreSource.indexOf('chatAtlasClearBranchSelectionStaleOnCanonicalReturn(next);')
      < coreSource.indexOf('chatAtlasSelectedPathEvaluate(next);'),
    'canonical-return handling runs before acquisition',
  );
  equal(countOccurrences(coreSource, 'includeIdentityGraph: true'), 3, 'two provider paths plus bounded refetch opt into graph');
  equal(coreSource.includes('getSelectedPathAcquisitionStatus,'), true, 'pure public diagnostic getter is exposed');
  equal(coreSource.includes('selectedPathAcquisition: getSelectedPathAcquisitionStatus()'), true, 'complete status has additive diagnostic block');
  equal(coreSource.includes('H2O_MM_CORE_API.set'), false, 'no MiniMap setter is introduced');
});

for (const key of Object.keys(aggregate)) {
  if (key === 'networkCalls') {
    equal(aggregate[key], 1, 'aggregate network count contains only the explicit refetch fixture');
  } else {
    equal(aggregate[key], 0, `aggregate ${key} remains zero`);
  }
}

const failed = fixtures.filter((item) => !item.ok);
const report = {
  validator: 'chat-atlas-cv3-5-selected-path-acquisition',
  fixtures: {
    total: fixtures.length,
    passed: fixtures.length - failed.length,
    failed: failed.length,
  },
  assertions: assertionCount,
  safetyCounters: aggregate,
  results: fixtures,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
