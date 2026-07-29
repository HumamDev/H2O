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

await fixture('existing runtime getters remain behaviorally byte-identical', () => {
  const existing = [
    'getSelectedPathAcquisitionStatus',
    'getEffectivePresentationIndex',
    'getEffectivePresentationStatus',
    'getEffectiveTurnRecordByQId',
    'getEffectiveTurnRecordByAId',
    'getCompleteTurnIndexProjectionStatus',
    'getConversationTurnIndexDiagnostics',
  ];
  for (const name of existing) {
    equal(extractFunction(CORE_SOURCE, name), extractFunction(BASE_SOURCE, name), `${name} unchanged`);
  }
  ok(CORE_SOURCE.includes('getGraphIdentityDiagnostics,'), 'one additive runtime export');
  equal(
    execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only', BASE_COMMIT, '--', 'src-runtime-base'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
    CORE_REL,
    '0A1a only production scope',
  );
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
