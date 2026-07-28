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
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const ACCEPTED_PARENT = 'd0a31215ec24b1f5f35f45a233b3e39ef6fad713';
const PARENT_CORE_SOURCE = execFileSync(
  'git',
  ['show', `${ACCEPTED_PARENT}:${CORE_PATH}`],
  { cwd: ROOT, encoding: 'utf8' },
);
const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const ROUTE_KEY = `/c/${CHAT_ID}`;
const Q17 = '8a2afe19-c39b-4e29-8c5f-74043a2e0c4c';
const A17_CANONICAL = '9215a4ba-d9b1-4f04-b06a-df4a5834df28';
const A17_SELECTED = '7b695490-e7a4-4af6-8ad9-4e15977917bb';
const Q18 = 'e9aeedf5-f75b-488c-8527-21d9ef155539';
const A18 = 'ac657e57-7d6b-4379-bf50-07158d192924';

const fixtures = [];
let assertions = 0;
const aggregate = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  aliasWrites: 0,
  cacheWrites: 0,
  reconciliationAccepts: 0,
  forbiddenNetworkCalls: 0,
  boundedGraphRefetchCalls: 0,
  pollingIntervals: 0,
  generalTimers: 0,
  newObservers: 0,
  existingUpdateEvents: 0,
  existingLedgerRafs: 0,
};

function clean(value) {
  if (value === undefined) return value;
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

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function instrumentCore(source) {
  const required = [
    'chatAtlasRecordTrustedNativeBranchSelection',
    'chatAtlasCurrentTrustedNativeBranchSelection',
    'chatAtlasApplyEvidence',
    'chatAtlasRetainIdentityGraph',
    'chatAtlasSelectedPathEvaluate',
    'chatAtlasSelectedPathOverlayEvaluate',
    'chatAtlasClearSelectedPathAcquisition',
    'chatAtlasClearSelectedPathOverlay',
    'getSelectedPathAcquisitionStatus',
    'getEffectivePresentationStatus',
    'getEffectivePresentationIndex',
  ];
  for (const name of required) {
    const occurrences = count(source, `  function ${name}(`)
      + count(source, `  async function ${name}(`);
    if (occurrences !== 1) throw new Error(`core-anchor-invalid:${name}:${occurrences}`);
  }
  const marker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const close = '\n})();';
  const markerIndex = source.indexOf(marker);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('core-bootstrap-boundary-invalid');
  const exports = `
  globalThis.__CV38_CORE__ = Object.freeze({
    configure(rawIndex, identityGraph) {
      chatAtlasClearSelectedPathOverlay('fixture-reset');
      chatAtlasClearSelectedPathAcquisition('fixture-reset', { resetRefetchGuard: true });
      chatAtlasLedgerState.members = [];
      chatAtlasLedgerState.ready = false;
      chatAtlasLedgerState.version = 0;
      chatAtlasLedgerState.chatKey = '';
      chatAtlasLedgerState.nextMemberId = 1;
      chatAtlasLedgerState.quarantinedAliases = new Set();
      const normalized = chatAtlasNormalizeCompleteIndexEnvelope(rawIndex, rawIndex.chatId, { source: 'host' });
      if (!normalized.ok) throw new Error('fixture-index-invalid:' + normalized.errorCode);
      completeTurnIndexAuthorityState.enabled = true;
      completeTurnIndexAuthorityState.status = 'complete-validated';
      completeTurnIndexAuthorityState.chatId = rawIndex.chatId;
      completeTurnIndexAuthorityState.routeKey = D.location.pathname;
      completeTurnIndexAuthorityState.generation = 1;
      completeTurnIndexAuthorityState.index = normalized.envelope;
      completeTurnIndexAuthorityState.indexSource = 'host-payload';
      completeTurnIndexAuthorityState.trustedSelectionSequence = 0;
      completeTurnIndexAuthorityState.trustedSelectionCaptureCount = 0;
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      completeTurnIndexAuthorityState.branchSelectionStale = false;
      completeTurnIndexAuthorityState.branchSelectionStaleRevision = 0;
      completeTurnIndexAuthorityState.branchSelectionStaleQId = null;
      completeTurnIndexAuthorityState.branchSelectionStaleChatId = null;
      completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = '';
      completeTurnIndexAuthorityState.branchSelectionStaleGeneration = 0;
      completeTurnIndexAuthorityState.autoBranchReconciliationEnabled = false;
      if (identityGraph) {
        chatAtlasRetainIdentityGraph({ ok: true, identityGraph }, {
          chatId: rawIndex.chatId,
          routeKey: D.location.pathname,
          generation: 1,
        });
      }
      return getCompleteTurnIndexProjectionStatus();
    },
    capture(event) {
      return chatAtlasRecordTrustedNativeBranchSelection(event);
    },
    apply(read, reason = 'cv38-remount') {
      return chatAtlasApplyEvidence(read, reason, true);
    },
    evaluate(members = chatAtlasLedgerState.members) {
      return chatAtlasSelectedPathEvaluate(members);
    },
    overlayEvaluate() {
      return chatAtlasSelectedPathOverlayEvaluate();
    },
    currentIntent(qId) {
      return chatAtlasCurrentTrustedNativeBranchSelection(qId);
    },
    setProvider(provider) {
      H2O.archiveBoot = H2O.archiveBoot || {};
      H2O.archiveBoot.fetchConversationTurnIndex = provider;
    },
    setRoute(routeKey) {
      completeTurnIndexAuthorityState.routeKey = String(routeKey || '');
    },
    setGeneration(generation) {
      completeTurnIndexAuthorityState.generation = Number(generation || 0);
    },
    snapshot() {
      return {
        captureCount: completeTurnIndexAuthorityState.trustedSelectionCaptureCount,
        sequence: completeTurnIndexAuthorityState.trustedSelectionSequence,
        intent: completeTurnIndexAuthorityState.trustedSelectedPathIntent,
        stale: completeTurnIndexAuthorityState.branchSelectionStale,
        staleQId: completeTurnIndexAuthorityState.branchSelectionStaleQId,
        staleRevision: completeTurnIndexAuthorityState.branchSelectionStaleRevision,
        acquisition: {
          status: selectedPathAcquisitionState.status,
          reason: selectedPathAcquisitionState.reason,
          token: selectedPathAcquisitionState.token,
          path: selectedPathAcquisitionState.path,
          proof: selectedPathAcquisitionState.proof,
          refetchAttemptedForToken: selectedPathAcquisitionState.refetchAttemptedForToken,
        },
        overlay: getEffectivePresentationStatus(),
        effective: getEffectivePresentationIndex(),
        complete: getCompleteTurnIndexProjectionStatus(),
        trace: completeTurnIndexLifecycleDiagnostics.trace.map((entry) => ({
          event: entry.event,
          reason: entry.reason || '',
          qId: entry.qId || '',
        })),
      };
    },
  });
  globalThis.__CV38_CORE_BOOTSTRAP_SUPPRESSED__ = true;
`;
  return `${source.slice(0, markerIndex)}${exports}${close}\n`;
}

const CORE_PROGRAM = instrumentCore(CORE_SOURCE);
const PARENT_CORE_PROGRAM = instrumentCore(PARENT_CORE_SOURCE);

function canonicalRows() {
  return Array.from({ length: 39 }, (_value, index) => {
    const order = index + 1;
    const qId = order === 17 ? Q17 : `canonical-q-${order}`;
    const primaryAId = order === 17 ? A17_CANONICAL : `canonical-a-${order}`;
    return Object.freeze({
      order,
      qId,
      turnId: `turn:${qId}`,
      primaryAId,
      answerVariants: Object.freeze(order === 17
        ? [A17_SELECTED, A17_CANONICAL]
        : [primaryAId]),
      noAnswer: false,
      stopped: false,
    });
  });
}

function stableHash(raw) {
  const value = String(raw || '');
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function fingerprint(turns) {
  const identity = turns.map((turn) => [
    String(turn.qId || ''),
    String(turn.primaryAId || ''),
    ...turn.answerVariants.map((id) => String(id || '')),
    turn.noAnswer === true ? 'no-answer:1' : 'no-answer:0',
    turn.stopped === true ? 'stopped:1' : 'stopped:0',
  ]);
  return `djb2:${stableHash(JSON.stringify(identity))}`;
}

function canonicalIndex() {
  const turns = canonicalRows();
  return Object.freeze({
    schema: 1,
    chatId: CHAT_ID,
    payloadUpdateTime: 1785250000,
    sourceFingerprint: fingerprint(turns),
    capturedAt: '2026-07-28T00:00:00.000Z',
    completeness: Object.freeze({
      complete: true,
      proof: 'host-payload-full-graph',
      validatedAt: '2026-07-28T00:00:00.000Z',
    }),
    turns: Object.freeze(turns),
  });
}

function identityGraph() {
  const nodes = [];
  const byId = new Map();
  const add = (nodeId, role, parentId = null) => {
    const record = {
      nodeId,
      parentId,
      childIds: [],
      role,
      messageId: nodeId,
      productUser: role === 'user',
      productAnswer: role === 'assistant',
      stopped: false,
    };
    nodes.push(record);
    byId.set(nodeId, record);
    if (parentId) byId.get(parentId).childIds.push(nodeId);
    return nodeId;
  };
  add('root-system', 'system');
  let parent = 'root-system';
  for (let order = 1; order <= 16; order += 1) {
    const qId = `canonical-q-${order}`;
    const aId = `canonical-a-${order}`;
    add(qId, 'user', parent);
    add(aId, 'assistant', qId);
    parent = aId;
  }
  add(Q17, 'user', parent);
  add(A17_CANONICAL, 'assistant', Q17);
  add(A17_SELECTED, 'assistant', Q17);
  let canonicalParent = A17_CANONICAL;
  for (let order = 18; order <= 39; order += 1) {
    const qId = `canonical-q-${order}`;
    const aId = `canonical-a-${order}`;
    add(qId, 'user', canonicalParent);
    add(aId, 'assistant', qId);
    canonicalParent = aId;
  }
  add('branch-2-tool-17', 'tool', A17_SELECTED);
  add(Q18, 'user', 'branch-2-tool-17');
  add('branch-2-system-18', 'system', Q18);
  add(A18, 'assistant', 'branch-2-system-18');
  const frozenNodes = Object.freeze(nodes.map((node) => Object.freeze({
    ...node,
    childIds: Object.freeze(node.childIds.slice()),
  })));
  return Object.freeze({
    chatId: CHAT_ID,
    currentNode: canonicalParent,
    nodeCount: frozenNodes.length,
    capturedAt: '2026-07-28T00:00:00.000Z',
    nodes: frozenNodes,
  });
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

function evidence({ role, id, shellIndex, flowRef }) {
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

function selectedPathRead({ canonical = false } = {}) {
  const flowRef = { id: 'cv38-flow' };
  const rows = [];
  let shellIndex = 0;
  for (let order = 1; order <= (canonical ? 39 : 18); order += 1) {
    const qId = order === 17 ? Q17 : (order === 18 && !canonical ? Q18 : `canonical-q-${order}`);
    const aId = order === 17
      ? (canonical ? A17_CANONICAL : A17_SELECTED)
      : (order === 18 && !canonical ? A18 : `canonical-a-${order}`);
    rows.push(evidence({ role: 'user', id: qId, shellIndex: shellIndex++, flowRef }));
    rows.push(evidence({ role: 'assistant', id: aId, shellIndex: shellIndex++, flowRef }));
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

function messageNode(id, role) {
  return {
    getAttribute(name) {
      if (name === 'data-message-id') return id;
      if (name === 'data-message-author-role') return role;
      return null;
    },
  };
}

function branchEvent({
  direction = 'next',
  timeStamp = 100,
  qId = Q17,
  answerIds = [A17_CANONICAL],
  validOwnership = true,
  nestedTarget = false,
} = {}) {
  const scope = {
    getAttribute(name) {
      return name === 'data-testid' ? 'conversation-turn-17' : null;
    },
    querySelectorAll() {
      if (!validOwnership) return [];
      return [
        messageNode(qId, 'user'),
        ...answerIds.map((answerId) => messageNode(answerId, 'assistant')),
      ];
    },
  };
  const button = {
    tagName: 'BUTTON',
    getAttribute(name) {
      if (name === 'aria-label') return direction === 'previous' ? 'Previous response' : 'Next response';
      return null;
    },
    closest(selector) {
      if (selector === '[data-testid^="conversation-turn-"]') return scope;
      if (selector === 'article' || selector === '[data-message-id]') return scope;
      if (selector === 'button') return button;
      return null;
    },
  };
  const target = nestedTarget
    ? { closest(selector) { return selector === 'button' ? button : null; } }
    : button;
  return {
    type: 'click',
    isTrusted: true,
    timeStamp,
    detail: 1,
    button: 0,
    pointerId: 1,
    target,
    composedPath() { return [target, button, scope]; },
  };
}

function createRuntime(program = CORE_PROGRAM) {
  const counters = {
    storageWrites: 0,
    preferenceWrites: 0,
    canonicalWrites: 0,
    aliasWrites: 0,
    cacheWrites: 0,
    reconciliationAccepts: 0,
    forbiddenNetworkCalls: 0,
    boundedGraphRefetchCalls: 0,
    pollingIntervals: 0,
    generalTimers: 0,
    newObservers: 0,
    existingUpdateEvents: 0,
    existingLedgerRafs: 0,
  };
  let now = 1_000_000;
  let rafSequence = 0;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class HarnessEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  class ForbiddenObserver {
    constructor() {
      counters.newObservers += 1;
      throw new Error('forbidden-observer');
    }
  }
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
    dispatchEvent() { counters.existingUpdateEvents += 1; return true; },
    createElement() { throw new Error('forbidden-dom-write'); },
    createTextNode() { throw new Error('forbidden-dom-write'); },
  };
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
    navigator: Object.freeze({ userAgent: 'cv3.8-trusted-intent-validator' }),
    performance: Object.freeze({ now() { return now / 1000; } }),
    Date: FakeDate,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    MutationObserver: ForbiddenObserver,
    ResizeObserver: ForbiddenObserver,
    IntersectionObserver: ForbiddenObserver,
    AbortController,
    requestAnimationFrame() {
      counters.existingLedgerRafs += 1;
      rafSequence += 1;
      return rafSequence;
    },
    cancelAnimationFrame() {},
    setTimeout() {
      counters.generalTimers += 1;
      throw new Error('forbidden-timer');
    },
    clearTimeout() {},
    setInterval() {
      counters.pollingIntervals += 1;
      throw new Error('forbidden-interval');
    },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage,
    sessionStorage: storage,
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000038'; } }),
    fetch() {
      counters.forbiddenNetworkCalls += 1;
      throw new Error('forbidden-fetch');
    },
    XMLHttpRequest: class {
      constructor() {
        counters.forbiddenNetworkCalls += 1;
        throw new Error('forbidden-xhr');
      }
    },
    WebSocket: class {
      constructor() {
        counters.forbiddenNetworkCalls += 1;
        throw new Error('forbidden-websocket');
      }
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { counters.existingUpdateEvents += 1; return true; },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(program, context, { filename: CORE_PATH, timeout: 8_000 });
  equal(context.__CV38_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core boot effects are suppressed');
  for (const key of Object.keys(counters)) counters[key] = 0;
  const api = context.__CV38_CORE__;
  api.configure(canonicalIndex(), identityGraph());
  for (const key of Object.keys(counters)) counters[key] = 0;
  return {
    api,
    counters,
    advance(ms) { now += Number(ms || 0); },
  };
}

function assertSafe(runtime, { refetchCalls = 0 } = {}) {
  const { counters } = runtime;
  equal(counters.storageWrites, 0, 'storage writes stay zero');
  equal(counters.preferenceWrites, 0, 'preference writes stay zero');
  equal(counters.canonicalWrites, 0, 'canonical writes stay zero');
  equal(counters.aliasWrites, 0, 'alias writes stay zero');
  equal(counters.cacheWrites, 0, 'cache writes stay zero');
  equal(counters.reconciliationAccepts, 0, 'reconciliation acceptance stays zero');
  equal(counters.forbiddenNetworkCalls, 0, 'general network calls stay zero');
  equal(counters.boundedGraphRefetchCalls, refetchCalls, 'bounded graph refetch count is exact');
  equal(counters.pollingIntervals, 0, 'polling intervals stay zero');
  equal(counters.generalTimers, 0, 'general timers stay zero');
  equal(counters.newObservers, 0, 'new observers stay zero');
  for (const key of Object.keys(aggregate)) aggregate[key] += counters[key];
}

await fixture('accepted parent reproduces the exact stale-with-superseded live failure', () => {
  const runtime = createRuntime(PARENT_CORE_PROGRAM);
  const first = branchEvent({ timeStamp: 50 });
  equal(runtime.api.capture(first), true, 'accepted parent records the genuine click');
  const bound = runtime.api.snapshot();
  ok(bound.intent?.token, 'accepted parent initially owns a trusted token');
  equal(bound.staleQId, Q17, 'accepted parent records the correct stale qId');
  const duplicateAfterRemount = branchEvent({
    timeStamp: 50,
    nestedTarget: true,
    validOwnership: false,
  });
  equal(runtime.api.capture(duplicateAfterRemount), false, 'duplicate rebind fails after remount');
  const failed = runtime.api.snapshot();
  equal(failed.stale, true, 'accepted parent leaves stale true');
  equal(failed.staleQId, Q17, 'accepted parent leaves the first stale owner');
  equal(failed.intent, null, 'accepted parent erases the trusted intent');
  equal(failed.acquisition.status, 'inactive', 'accepted parent never reaches acquisition');
  equal(failed.acquisition.reason, 'trusted-intent-superseded', 'accepted parent emits the observed reason');
  equal(failed.overlay.overlayActive, false, 'accepted parent cannot activate the overlay');
  equal(failed.overlay.count, 39, 'accepted parent remains canonical 39');
  assertSafe(runtime);
});

await fixture('single native click survives remount and activates the effective 18-turn path', () => {
  const runtime = createRuntime();
  const event = branchEvent();
  equal(runtime.api.capture(event), true, 'trusted click is accepted');
  const captured = runtime.api.snapshot();
  ok(captured.intent?.token, 'exactly one trusted token exists');
  equal(captured.captureCount, 1, 'one token epoch is captured');
  equal(captured.stale, true, 'branch state becomes stale');
  equal(captured.staleQId, Q17, 'stale owner qId is exact');
  runtime.api.apply(selectedPathRead(), 'native-remount');
  const result = runtime.api.snapshot();
  equal(result.intent.token, captured.intent.token, 'token survives remount evidence');
  equal(result.acquisition.status, 'proven', 'Stage 1 reaches proven');
  equal(result.acquisition.path.length, 18, 'Stage 1 path has 18 turns');
  equal(result.overlay.overlayActive, true, 'Stage 2 overlay activates');
  equal(result.overlay.count, 18, 'effective overlay count is 18');
  equal(result.effective.turns.length, 18, 'effective index exposes 18 turns');
  assertSafe(runtime);
});

await fixture('duplicate delivery of the same click reuses ownership without clearing', () => {
  const runtime = createRuntime();
  const event = branchEvent({ timeStamp: 200 });
  equal(runtime.api.capture(event), true, 'first delivery is accepted');
  const before = runtime.api.snapshot();
  equal(runtime.api.capture(event), true, 'same event object is deduplicated');
  const after = runtime.api.snapshot();
  equal(after.intent.token, before.intent.token, 'duplicate keeps the token');
  equal(after.captureCount, 1, 'duplicate creates no token');
  equal(after.acquisition.reason, 'trusted-intent-created', 'duplicate does not report supersession');
  equal(
    after.trace.some((entry) => entry.event === 'trusted-capture-deduplicated'),
    true,
    'dedupe trace is recorded',
  );
  runtime.api.apply(selectedPathRead());
  equal(runtime.api.snapshot().overlay.overlayActive, true, 'deduplicated interaction still activates');
  assertSafe(runtime);
});

await fixture('nested-target duplicate with unresolved remount ownership cannot erase intent', () => {
  const runtime = createRuntime();
  const first = branchEvent({ timeStamp: 300 });
  equal(runtime.api.capture(first), true, 'first capture binds');
  const token = runtime.api.snapshot().intent.token;
  const duplicate = branchEvent({
    timeStamp: 300,
    nestedTarget: true,
    validOwnership: false,
  });
  equal(runtime.api.capture(duplicate), true, 'same delivery identity is retained before rebinding');
  const retained = runtime.api.snapshot();
  equal(retained.intent.token, token, 'unresolved duplicate cannot clear token');
  equal(retained.stale, true, 'stale ownership remains');
  equal(retained.acquisition.reason, 'trusted-intent-created', 'superseded reason is absent');
  assertSafe(runtime);
});

await fixture('remount evidence is not a new interaction and completes acquisition', () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 400 }));
  const before = runtime.api.snapshot();
  runtime.api.apply(selectedPathRead(), 'mutation');
  const after = runtime.api.snapshot();
  equal(after.captureCount, before.captureCount, 'ledger remount creates no capture');
  equal(after.intent.token, before.intent.token, 'remount retains token');
  equal(after.acquisition.status, 'proven', 'remount proves acquisition');
  equal(after.overlay.source, 'selected-path-overlay', 'remount installs overlay');
  assertSafe(runtime);
});

await fixture('genuine newer action on the same qId supersedes old asynchronous ownership', async () => {
  const runtime = createRuntime();
  const deferred = {};
  deferred.promise = new Promise((resolve) => { deferred.resolve = resolve; });
  runtime.api.configure(canonicalIndex(), null);
  runtime.api.setProvider(async () => {
    runtime.counters.boundedGraphRefetchCalls += 1;
    return deferred.promise;
  });
  runtime.api.capture(branchEvent({ timeStamp: 500 }));
  const firstToken = runtime.api.snapshot().intent.token;
  runtime.api.apply(selectedPathRead());
  await Promise.resolve();
  equal(runtime.counters.boundedGraphRefetchCalls, 1, 'old token gets one graph-only refetch');
  runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 501,
    answerIds: [A17_SELECTED],
  }));
  const newer = runtime.api.snapshot();
  ok(newer.intent.token !== firstToken, 'distinct event creates a newer token');
  equal(newer.overlay.overlayActive, false, 'newer token synchronously retires old overlay');
  deferred.resolve({ ok: true, identityGraph: identityGraph() });
  await settle();
  const settled = runtime.api.snapshot();
  equal(settled.overlay.overlayActive, false, 'old async result cannot install overlay');
  equal(settled.intent.token, newer.intent.token, 'newer token remains owner');
  assertSafe(runtime, { refetchCalls: 1 });
});

await fixture('fast branch return is not deduplicated and restores canonical 39', () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 600 }));
  runtime.api.apply(selectedPathRead());
  equal(runtime.api.snapshot().overlay.count, 18, 'branch overlay is active');
  const selectedToken = runtime.api.snapshot().intent.token;
  runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 601,
    answerIds: [A17_SELECTED],
  }));
  const returnCapture = runtime.api.snapshot();
  ok(returnCapture.intent.token !== selectedToken, 'return action receives a distinct token');
  runtime.api.apply(selectedPathRead({ canonical: true }), 'native-return');
  const returned = runtime.api.snapshot();
  equal(returned.stale, false, 'canonical return clears stale state');
  equal(returned.intent, null, 'canonical return retires intent');
  equal(returned.overlay.overlayActive, false, 'canonical return clears overlay');
  equal(returned.overlay.count, 39, 'effective presentation returns to 39');
  equal(returned.effective.turns.length, 39, 'canonical index is immediately effective');
  assertSafe(runtime);
});

await fixture('bounded intent lifetime survives remount budget then expires', () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 700 }));
  const token = runtime.api.snapshot().intent.token;
  runtime.advance(4_999);
  equal(runtime.api.currentIntent(Q17)?.token, token, 'intent survives the established five-second budget');
  runtime.advance(2);
  equal(runtime.api.currentIntent(Q17), null, 'intent expires outside the bounded window');
  equal(runtime.api.snapshot().acquisition.reason, 'trusted-intent-expired', 'expiry reason is exact');
  assertSafe(runtime);
});

await fixture('route and generation drift clear ownership and reject late evidence', () => {
  const routeRuntime = createRuntime();
  routeRuntime.api.capture(branchEvent({ timeStamp: 800 }));
  routeRuntime.api.setRoute('/c/other-chat');
  equal(routeRuntime.api.currentIntent(Q17), null, 'route drift clears intent');
  routeRuntime.api.apply(selectedPathRead());
  equal(routeRuntime.api.snapshot().overlay.overlayActive, false, 'late route evidence cannot install');
  assertSafe(routeRuntime);

  const generationRuntime = createRuntime();
  generationRuntime.api.capture(branchEvent({ timeStamp: 801 }));
  generationRuntime.api.setGeneration(2);
  equal(generationRuntime.api.currentIntent(Q17), null, 'generation drift clears intent');
  generationRuntime.api.apply(selectedPathRead());
  equal(generationRuntime.api.snapshot().overlay.overlayActive, false, 'late generation evidence cannot install');
  assertSafe(generationRuntime);
});

await fixture('superseded reason is reserved for a genuinely different newer click', () => {
  const runtime = createRuntime();
  const first = branchEvent({ timeStamp: 900 });
  runtime.api.capture(first);
  runtime.api.capture(first);
  equal(
    runtime.api.snapshot().trace.some((entry) => entry.reason === 'superseded-by-newer-capture'),
    false,
    'duplicate delivery is not labelled superseded',
  );
  runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 901,
    answerIds: [A17_SELECTED],
  }));
  const trace = runtime.api.snapshot().trace;
  equal(
    trace.some((entry) => entry.reason === 'superseded-by-newer-capture'),
    true,
    'different browser event is labelled genuine supersession',
  );
  equal(runtime.api.snapshot().acquisition.reason, 'trusted-intent-superseded', 'state reason is exact');
  assertSafe(runtime);
});

await fixture('end-to-end handoff exposes exact branch anchor and downstream turn', () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 1000 }));
  runtime.api.apply(selectedPathRead());
  const result = runtime.api.snapshot();
  equal(result.acquisition.status, 'proven', 'real acquisition is proven');
  equal(result.acquisition.proof.anchorQId, Q17, 'proof owns exact q17');
  equal(result.acquisition.proof.anchorSelectedAId, A17_SELECTED, 'proof owns exact selected a17');
  equal(result.overlay.source, 'selected-path-overlay', 'real overlay is selected-path authority');
  equal(result.overlay.pathLength, 18, 'overlay path length is 18');
  equal(result.effective.turns[16].primaryAId, A17_SELECTED, 'effective turn 17 uses branch answer');
  equal(result.effective.turns[17].qId, Q18, 'effective turn 18 qId is exact');
  equal(result.effective.turns[17].primaryAId, A18, 'effective turn 18 aId is exact');
  assertSafe(runtime);
});

const failures = fixtures.filter((item) => !item.ok);
for (const item of fixtures) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) console.error(item.error);
}
console.log(`Fixtures: ${fixtures.length - failures.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
console.log(`Safety counters: ${JSON.stringify(aggregate)}`);

if (failures.length) {
  console.error(`CV-3.8 trusted-intent lifecycle failed: ${failures.length} fixture(s)`);
  process.exit(1);
}

console.log('CV-3.8 trusted-intent lifecycle passed');
