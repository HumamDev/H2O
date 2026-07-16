#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const SOURCE_ABS = path.join(ROOT, SOURCE_PATH);
const SOURCE = fs.readFileSync(SOURCE_ABS, 'utf8');
const LEGACY_SOURCE = 'legacy-durable-cache';
const CHAT_ID = 'fixture-chat-current-question';
const OBSERVED = Object.freeze({
  durableQId: '5068a46e-9a79-4533-a11f-2f96e4c49f4f',
  mountedQId: 'd82467fb-21a4-41a4-b46d-446bf54a47ec',
  answerId: '733fa31a-7d11-4ce5-b570-8ffa474670d4',
});

let assertionCount = 0;
const aggregate = {
  sourceSetterCalls: 0,
  navigationMutations: 0,
  domMutations: 0,
  userActions: 0,
  storageWrites: 0,
  networkCalls: 0,
};

function equal(actual, expected, message) {
  assertionCount += 1;
  if (actual === expected) {
    assert.ok(true, message);
    return;
  }
  const normalize = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(normalize(actual), normalize(expected), message);
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

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function instrumentSource() {
  const required = [
    'canonicalMountedQuestionIdentity',
    'canonicalLiveDraftMatch',
    'syncDurableCurrentQuestionIdentity',
    'promoteCanonicalCurrentQuestionIdentity',
    'applyCanonicalDraft',
    'applyLiveDraft',
    'commitTurnDrafts',
    'buildTurnDraftsFromEntries',
    'reconcileBootSplitTurnDrafts',
    'chatAtlasPairEvidence',
    'seedDurableTurnDrafts',
    'mergeDurableTurnDrafts',
    'chatAtlasApplyEvidence',
    'buildChatAtlasLedgerCanonicalRecords',
    'getChatAtlasLedgerSnapshot',
    'getChatAtlasLedgerDiagnostics',
  ];
  for (const name of required) {
    const anchor = `  function ${name}(`;
    if (countOccurrences(SOURCE, anchor) !== 1) throw new Error(`instrumentation-anchor-invalid:${name}`);
  }
  const setterAnchor = '  function setChatAtlasCanonicalSource(value) {\n';
  const marker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const bootRefresh = "  refresh('boot');";
  const bootLedger = '  startChatAtlasLedger();';
  const close = '\n})();';
  for (const [name, anchor] of [
    ['setter', setterAnchor],
    ['bootstrap-marker', marker],
    ['boot-refresh', bootRefresh],
    ['boot-ledger', bootLedger],
  ]) {
    if (countOccurrences(SOURCE, anchor) !== 1) throw new Error(`instrumentation-anchor-invalid:${name}`);
  }
  let source = SOURCE.replace(
    setterAnchor,
    `${setterAnchor}    globalThis.__CV33_QID_SETTER_GUARD__();\n`,
  );
  const markerIndex = source.indexOf(marker);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('bootstrap-boundary-invalid');
  const removed = source.slice(markerIndex, closeIndex);
  if (!removed.includes(bootRefresh) || !removed.includes(bootLedger)) throw new Error('bootstrap-suppression-unproven');
  const exportBlock = [
    '  globalThis.__CV33_QID_INTERNALS__ = Object.freeze({',
    '    canonicalMountedQuestionIdentity,',
    '    canonicalLiveDraftMatch,',
    '    promoteCanonicalCurrentQuestionIdentity,',
    '    applyCanonicalDraft,',
    '    applyLiveDraft,',
    '    commitTurnDrafts,',
    '    buildTurnDraftsFromEntries,',
    '    reconcileBootSplitTurnDrafts,',
    '    chatAtlasPairEvidence,',
    '    createTurnRecord,',
    '    seedDurableTurnDrafts,',
    '    mergeDurableTurnDrafts,',
    '    chatAtlasApplyEvidence,',
    '    buildChatAtlasLedgerCanonicalRecords,',
    '    getChatAtlasLedgerSnapshot,',
    '    getChatAtlasLedgerDiagnostics,',
    '    getChatAtlasCanonicalSource,',
    '    getRecords: () => turnState.turns,',
    '    getDurableSnapshot() {',
    '      ensureDurableTurnCache();',
    '      return {',
    '        order: turnState.durableOrder.slice(),',
    '        rows: turnState.durableOrder.map((key) => ({ key, ...slimTurnDraft(turnState.durableByKey.get(key)) })),',
    '      };',
    '    },',
    '    resetFixtureState() {',
    '      turnState.turns = [];',
    '      rebuildTurnMaps([]);',
    '      turnState.durableByKey = new Map();',
    '      turnState.durableOrder = [];',
    '      turnState.durableChatKey = String(D?.location?.pathname || "/");',
    '      chatAtlasLedgerState.members = [];',
    '      chatAtlasLedgerState.ready = false;',
    '      chatAtlasLedgerState.chatKey = "";',
    '      chatAtlasLedgerState.nextMemberId = 1;',
    '      chatAtlasLedgerState.quarantinedAliases = new Set();',
    '    },',
    '  });',
    '  globalThis.__CV33_QID_BOOTSTRAP_SUPPRESSED__ = true;',
  ].join('\n');
  source = `${source.slice(0, markerIndex)}${exportBlock}${close}\n`;
  if (source.includes(bootRefresh) || source.includes(bootLedger)) throw new Error('bootstrap-call-survived');
  return source;
}

const INSTRUMENTED = instrumentSource();

function counters() {
  return {
    sourceSetterCalls: 0,
    navigationMutations: 0,
    domMutations: 0,
    userActions: 0,
    storageWrites: 0,
    networkCalls: 0,
  };
}

function forbidden(state, key, label) {
  state[key] += 1;
  throw new Error(`forbidden-side-effect:${label}`);
}

function storage(state, label) {
  return Object.freeze({
    getItem() { return null; },
    key() { return null; },
    get length() { return 0; },
    setItem() { return forbidden(state, 'storageWrites', `${label}.setItem`); },
    removeItem() { return forbidden(state, 'storageWrites', `${label}.removeItem`); },
    clear() { return forbidden(state, 'storageWrites', `${label}.clear`); },
  });
}

function guardedNetwork(state, label) {
  return new Proxy(function guarded() {}, {
    apply() { return forbidden(state, 'networkCalls', label); },
    construct() { return forbidden(state, 'networkCalls', label); },
  });
}

function createRuntime(name) {
  const sideEffects = counters();
  const location = {
    pathname: `/c/${CHAT_ID}`,
    href: `https://chatgpt.com/c/${CHAT_ID}`,
    origin: 'https://chatgpt.com',
    reload() { return forbidden(sideEffects, 'navigationMutations', 'location.reload'); },
  };
  const body = Object.freeze({
    isConnected: true,
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const document = Object.freeze({
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() {},
    createElement() { return forbidden(sideEffects, 'domMutations', 'document.createElement'); },
    createTextNode() { return forbidden(sideEffects, 'domMutations', 'document.createTextNode'); },
  });
  class HarnessEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  class HarnessTarget {
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  }
  class GuardedObserver {
    constructor() { return forbidden(sideEffects, 'domMutations', 'observer-construction'); }
  }
  let tick = 0;
  const sandbox = {
    __CV33_QID_SETTER_GUARD__() { return forbidden(sideEffects, 'sourceSetterCalls', 'source-setter'); },
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: Object.freeze({
      pushState() { return forbidden(sideEffects, 'navigationMutations', 'history.pushState'); },
      replaceState() { return forbidden(sideEffects, 'navigationMutations', 'history.replaceState'); },
    }),
    navigator: Object.freeze({ userAgent: 'cv3.3-current-question-validator' }),
    performance: Object.freeze({ now() { tick += 0.25; return tick; } }),
    Date,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    EventTarget: HarnessTarget,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    queueMicrotask() {},
    localStorage: storage(sideEffects, 'localStorage'),
    sessionStorage: storage(sideEffects, 'sessionStorage'),
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000001'; } }),
    fetch: guardedNetwork(sideEffects, 'fetch'),
    XMLHttpRequest: guardedNetwork(sideEffects, 'XMLHttpRequest'),
    WebSocket: guardedNetwork(sideEffects, 'WebSocket'),
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, {
    name: `cv3.3-current-question:${name}`,
    codeGeneration: { strings: false, wasm: false },
  });
  vm.runInContext(INSTRUMENTED, context, { filename: SOURCE_PATH, timeout: 2_000 });
  equal(context.__CV33_QID_BOOTSTRAP_SUPPRESSED__, true, 'bootstrap must be suppressed');
  const internals = context.__CV33_QID_INTERNALS__;
  ok(internals && typeof internals === 'object', 'private production internals must be exposed');
  internals.resetFixtureState();
  return { context, internals, sideEffects };
}

function shell(turnId, role = 'user') {
  return {
    isConnected: true,
    getAttribute(name) {
      if (name === 'data-turn-id') return turnId;
      if (name === 'data-turn') return role;
      if (name === 'data-testid') return `conversation-turn-${turnId}`;
      return null;
    },
  };
}

function questionElement(messageId, shellTurnId, { connected = true } = {}) {
  const owner = shell(shellTurnId, 'user');
  return {
    isConnected: connected,
    dataset: { messageId },
    getAttribute(name) {
      if (name === 'data-message-id') return messageId;
      if (name === 'data-message-author-role') return 'user';
      return null;
    },
    closest(selector) { return String(selector).includes('conversation-turn') ? owner : null; },
  };
}

function draft({ qId, answers = [], aliases = [], qEl = null, turnNo = 1 }) {
  return {
    turnNo,
    qId,
    primaryAId: answers[answers.length - 1] || null,
    answerIds: answers.slice(),
    aliasIds: aliases.slice(),
    live: {
      qEl,
      primaryAEl: null,
      answerEls: [],
      connected: !!qEl?.isConnected,
    },
  };
}

function recordRow(row) {
  return JSON.parse(JSON.stringify(row));
}

function evidence({ role, shellRef, shellIndex, shellOrdinal, flowRef, shellTurnId, messageId }) {
  return {
    shell: shellRef,
    shellIndex,
    testId: `conversation-turn-${shellOrdinal}`,
    shellOrdinal,
    flowRef,
    role,
    roleNode: null,
    hydrated: !!messageId,
    aliases: new Set([shellTurnId, messageId].filter(Boolean)),
    shellTurnId: shellTurnId || null,
    messageId: messageId || null,
    currentId: messageId || shellTurnId || null,
  };
}

function read(evidenceRows, canonicalRecords = [], bindings = new Map()) {
  return {
    shells: evidenceRows.map((row) => row.shell),
    root: null,
    evidence: evidenceRows,
    unbound: [],
    questionShellCount: evidenceRows.filter((row) => row.role === 'user').length,
    answerShellCount: evidenceRows.filter((row) => row.role === 'assistant').length,
    canonicalRecords,
    canonicalShellBindings: bindings,
    canonicalVersion: 1,
    completeShellMap: true,
    readMs: 0,
  };
}

function structuralPairing(runtime, qId, answerIds, prefix = 'fixture-boot-split') {
  const flow = { id: `${prefix}-flow` };
  const rows = [
    evidence({
      role: 'user',
      shellRef: shell(`${prefix}-q-shell`, 'user'),
      shellIndex: 0,
      shellOrdinal: 1,
      flowRef: flow,
      shellTurnId: `${prefix}-q-shell`,
      messageId: qId,
    }),
    ...answerIds.map((answerId, index) => evidence({
      role: 'assistant',
      shellRef: shell(`${prefix}-a-shell-${index + 1}`, 'assistant'),
      shellIndex: index + 1,
      shellOrdinal: index + 2,
      flowRef: flow,
      shellTurnId: `${prefix}-a-shell-${index + 1}`,
      messageId: answerId,
    })),
  ];
  return runtime.internals.chatAtlasPairEvidence(rows);
}

function assertSafety(runtime) {
  for (const [key, value] of Object.entries(runtime.sideEffects)) {
    equal(value, 0, `${key} must remain zero`);
    aggregate[key] += value;
  }
  equal(runtime.internals.getChatAtlasCanonicalSource(), LEGACY_SOURCE, 'source remains legacy');
}

function canonicalPromotionFixture(runtime) {
  const qEl = questionElement(OBSERVED.mountedQId, OBSERVED.durableQId);
  const canonical = draft({
    qId: OBSERVED.durableQId,
    answers: [OBSERVED.answerId],
    aliases: [OBSERVED.durableQId, OBSERVED.answerId],
  });
  const live = draft({
    qId: OBSERVED.mountedQId,
    answers: [OBSERVED.answerId],
    aliases: [OBSERVED.mountedQId, OBSERVED.durableQId, OBSERVED.answerId],
    qEl,
  });
  runtime.internals.seedDurableTurnDrafts([canonical]);
  runtime.internals.commitTurnDrafts([canonical], [live]);
  const rows = runtime.internals.getRecords();
  equal(rows.length, 1, 'qId promotion must not create another turn');
  equal(rows[0].qId, OBSERVED.mountedQId, 'mounted qId wins');
  equal(rows[0].turnId, `turn:${OBSERVED.mountedQId}`, 'turnId follows current qId');
  includes(rows[0]._aliasIds, OBSERVED.durableQId, 'displaced durable qId remains an alias');
  equal(rows[0].primaryAId, OBSERVED.answerId, 'answer primary remains stable');
  const durable = runtime.internals.getDurableSnapshot();
  equal(durable.order, [`q:${OBSERVED.mountedQId}`], 'durable key is rekeyed once');
  includes(durable.rows[0].aliasIds, OBSERVED.durableQId, 'durable row retains displaced qId');
}

function answerProofFixture(runtime) {
  const oldQId = 'fixture-durable-question-answer-proof';
  const newQId = 'fixture-mounted-question-answer-proof';
  const answerId = 'fixture-answer-proof';
  const canonical = draft({ qId: oldQId, answers: [answerId], aliases: [oldQId] });
  const live = draft({
    qId: newQId,
    answers: [answerId],
    aliases: [newQId],
    qEl: questionElement(newQId, 'fixture-unrelated-shell'),
  });
  runtime.internals.seedDurableTurnDrafts([canonical]);
  runtime.internals.commitTurnDrafts([canonical], [live]);
  equal(runtime.internals.getRecords()[0].qId, newQId, 'unique current answer proves the mounted pair');
  includes(runtime.internals.getRecords()[0]._aliasIds, oldQId, 'answer-proven promotion retains old qId');
}

function historicalAliasCannotPromoteFixture(runtime) {
  const oldQId = 'fixture-question-old-alias';
  const newQId = 'fixture-question-new-alias';
  const canonical = draft({ qId: oldQId, aliases: [oldQId, 'fixture-shared-history'] });
  const live = draft({
    qId: newQId,
    aliases: ['fixture-shared-history'],
    qEl: questionElement(newQId, 'fixture-unrelated-shell'),
  });
  runtime.internals.commitTurnDrafts([canonical], [live]);
  equal(runtime.internals.getRecords()[0].qId, oldQId, 'broad historical alias alone cannot rewrite qId');
}

function noMountedIdentityFixture(runtime) {
  const oldQId = 'fixture-question-retained-unmounted';
  const canonical = draft({ qId: oldQId, aliases: [oldQId] });
  const live = draft({ qId: 'fixture-shell-only', aliases: [oldQId], qEl: null });
  runtime.internals.commitTurnDrafts([canonical], [live]);
  equal(runtime.internals.getRecords()[0].qId, oldQId, 'unmounted evidence retains durable qId');
}

function canonicalDraftAliasFixture(runtime) {
  const row = runtime.internals.createTurnRecord('', 1);
  runtime.internals.applyCanonicalDraft(row, draft({ qId: 'fixture-q-before', aliases: ['fixture-q-before'] }));
  runtime.internals.applyCanonicalDraft(row, draft({ qId: 'fixture-q-after', aliases: ['fixture-q-after'] }));
  equal(row.qId, 'fixture-q-after');
  includes(row._aliasIds, 'fixture-q-before', 'canonical draft displacement is retained');
  includes(row._aliasIds, 'fixture-q-after', 'current alias shape remains compatible');
}

function variantsFixture(runtime) {
  const oldQId = 'fixture-variant-old-q';
  const currentQId = 'fixture-variant-current-q';
  const answers = ['fixture-answer-v1', 'fixture-answer-v2', 'fixture-answer-v3'];
  const canonical = draft({ qId: oldQId, answers, aliases: [oldQId, ...answers] });
  const live = draft({
    qId: currentQId,
    answers,
    aliases: [currentQId, oldQId, ...answers],
    qEl: questionElement(currentQId, oldQId),
  });
  runtime.internals.commitTurnDrafts([canonical], [live]);
  const rows = runtime.internals.getRecords();
  equal(rows.length, 1, 'assistant variants remain beneath one question turn');
  equal(Array.from(rows[0].answerIds), answers, 'variant order remains stable');
  equal(rows[0].primaryAId, answers[2], 'selected primary remains final variant');
}

function noAnswerFixture(runtime) {
  const oldQId = 'fixture-no-answer-old-q';
  const currentQId = 'fixture-no-answer-current-q';
  const canonical = draft({ qId: oldQId, aliases: [oldQId] });
  const live = draft({
    qId: currentQId,
    aliases: [currentQId, oldQId],
    qEl: questionElement(currentQId, oldQId),
  });
  runtime.internals.commitTurnDrafts([canonical], [live]);
  const row = runtime.internals.getRecords()[0];
  equal(row.qId, currentQId, 'NO ANSWER current qId promotes with shell proof');
  equal(row.primaryAId, null, 'NO ANSWER primary remains null');
  equal(Array.from(row.answerIds), [], 'NO ANSWER answer set remains empty');
  includes(row._aliasIds, oldQId, 'NO ANSWER old qId remains historical evidence');
}

function oneToOneFixture(runtime) {
  const answerId = 'fixture-one-owner-answer';
  const canonical = draft({ qId: 'fixture-one-owner-q', answers: [answerId] });
  runtime.internals.commitTurnDrafts([canonical], []);
  const record = runtime.internals.getRecords()[0];
  const used = new Set();
  const first = runtime.internals.canonicalLiveDraftMatch([record], draft({
    qId: 'fixture-one-owner-live-1', answers: [answerId], qEl: questionElement('fixture-one-owner-live-1', 'shell-a'),
  }), used);
  equal(first.record, record, 'first live row claims the unique answer owner');
  used.add(record);
  const second = runtime.internals.canonicalLiveDraftMatch([record], draft({
    qId: 'fixture-one-owner-live-2', answers: [answerId], qEl: questionElement('fixture-one-owner-live-2', 'shell-b'),
  }), used);
  equal(second.record, null, 'used canonical row cannot satisfy a second live row');
}

function ledgerMountedIdentityFixture(runtime) {
  const flow = { id: 'flow-ledger-current-qid' };
  const qShell = shell(OBSERVED.durableQId, 'user');
  const aShell = shell(OBSERVED.answerId, 'assistant');
  const canonical = {
    turnNo: 1,
    qId: OBSERVED.mountedQId,
    primaryAId: OBSERVED.answerId,
    answerIds: [OBSERVED.answerId],
    _aliasIds: [OBSERVED.durableQId, OBSERVED.mountedQId, OBSERVED.answerId],
    live: { qEl: null, answerEls: [] },
  };
  const evidenceRows = [
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: OBSERVED.durableQId, messageId: OBSERVED.mountedQId }),
    evidence({ role: 'assistant', shellRef: aShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: OBSERVED.answerId, messageId: OBSERVED.answerId }),
  ];
  runtime.internals.chatAtlasApplyEvidence(
    read(evidenceRows, [canonical], new Map([[canonical, { qShell, answerShells: [aShell] }]])),
    'fixture-mounted-current-qid',
    true,
  );
  const member = runtime.internals.getChatAtlasLedgerSnapshot().members[0];
  equal(member.question.currentQId, OBSERVED.mountedQId, 'ledger currentQId uses mounted message ID');
  equal(member.question.qId, OBSERVED.mountedQId, 'ledger projected qId uses mounted message ID');
  includes(member.question.aliases, OBSERVED.durableQId, 'shell/durable qId remains resolver evidence');
  equal(runtime.internals.buildChatAtlasLedgerCanonicalRecords()[0].qId, OBSERVED.mountedQId, 'ledger canonical adapter publishes current qId');
}

function ledgerHydrationFallbackFixture(runtime) {
  const flow = { id: 'flow-ledger-hydration-fallback' };
  const qShell = shell('fixture-ledger-durable-q', 'user');
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: 'fixture-ledger-durable-q', messageId: 'fixture-ledger-live-q' }),
  ]), 'fixture-ledger-hydrated', true);
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: 'fixture-ledger-durable-q', messageId: null }),
  ]), 'fixture-ledger-unhydrated', true);
  const member = runtime.internals.getChatAtlasLedgerSnapshot().members[0];
  equal(member.question.currentQId, null, 'shell ID is not labeled as mounted currentQId');
  equal(member.question.qId, 'fixture-ledger-live-q', 'unhydrated generation retains previous durable qId');
  includes(member.question.aliases, 'fixture-ledger-durable-q', 'shell identity remains an alias');
}

function ledgerQuestionRekeyFixture(runtime) {
  const flow = { id: 'flow-ledger-question-rekey' };
  const shellId = 'fixture-ledger-rekey-shell';
  const oldQId = 'fixture-ledger-rekey-old';
  const currentQId = 'fixture-ledger-rekey-current';
  const qShell = shell(shellId, 'user');
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: shellId, messageId: oldQId }),
  ]), 'fixture-ledger-rekey-before', true);
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: shellId, messageId: currentQId }),
  ]), 'fixture-ledger-rekey-after', true);
  const member = runtime.internals.getChatAtlasLedgerSnapshot().members[0];
  equal(member.question.qId, currentQId, 'later mounted message identity replaces prior current qId');
  equal(member.question.currentQId, currentQId, 'currentQId follows the selected mounted branch');
  includes(member.question.aliases, oldQId, 'displaced mounted qId remains historical resolver evidence');
  equal(member.logicalMemberKey.startsWith('atlas:'), true, 'logical member remains one allocation');
}

function integratedCanonicalLedgerParityFixture(runtime) {
  const flow = { id: 'flow-integrated-canonical-ledger' };
  const oldQId = 'fixture-integrated-old-q';
  const currentQId = 'fixture-integrated-current-q';
  const answerId = 'fixture-integrated-answer';
  const qShell = shell(oldQId, 'user');
  const aShell = shell(answerId, 'assistant');
  const qEl = questionElement(currentQId, oldQId);
  const canonicalDraft = draft({ qId: oldQId, answers: [answerId], aliases: [oldQId, answerId] });
  const liveDraft = draft({ qId: currentQId, answers: [answerId], aliases: [currentQId, oldQId, answerId], qEl });
  runtime.internals.commitTurnDrafts([canonicalDraft], [liveDraft]);
  const canonical = runtime.internals.getRecords()[0];
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: oldQId, messageId: currentQId }),
    evidence({ role: 'assistant', shellRef: aShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: answerId, messageId: answerId }),
  ], [canonical], new Map([[canonical, { qShell, answerShells: [aShell] }]])), 'fixture-integrated-parity', true);
  const ledgerRecord = runtime.internals.buildChatAtlasLedgerCanonicalRecords()[0];
  equal(canonical.qId, currentQId, 'canonical publishes mounted current qId');
  equal(ledgerRecord.qId, currentQId, 'ledger publishes the same current qId');
  equal(ledgerRecord.primaryAId, canonical.primaryAId, 'answer primary remains aligned');
  equal(runtime.internals.getChatAtlasLedgerDiagnostics().parityWithCurrentTurnRuntime, true, 'ledger parity recognizes the unified identity');
}

function answerIdentityNeverBecomesQuestionFixture(runtime) {
  const flow = { id: 'flow-answer-not-question' };
  const qId = 'fixture-role-correct-q';
  const answerId = 'fixture-role-correct-answer';
  const qShell = shell('fixture-role-correct-shell-q', 'user');
  const aShell = shell('fixture-role-correct-shell-a', 'assistant');
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: 'fixture-role-correct-shell-q', messageId: qId }),
    evidence({ role: 'assistant', shellRef: aShell, shellIndex: 1, shellOrdinal: 2, flowRef: flow, shellTurnId: 'fixture-role-correct-shell-a', messageId: answerId }),
  ]), 'fixture-role-correct', true);
  const member = runtime.internals.getChatAtlasLedgerSnapshot().members[0];
  equal(member.question.qId, qId, 'user message owns current qId');
  equal(member.answer.primaryAId, answerId, 'assistant message remains answer identity');
  excludes([member.question.qId], answerId, 'answer identity never becomes qId');
}

function untrustedFallbackCannotPromoteFixture(runtime) {
  const oldQId = 'fixture-untrusted-durable-q';
  const generatedQId = 'q_fixture_generated_fallback';
  const canonical = draft({ qId: oldQId, aliases: [oldQId] });
  const qEl = questionElement(null, oldQId);
  const live = draft({ qId: generatedQId, aliases: [oldQId], qEl });
  runtime.internals.commitTurnDrafts([canonical], [live]);
  equal(runtime.internals.getRecords()[0].qId, oldQId, 'generated fallback cannot displace a durable qId');
  equal(runtime.internals.canonicalMountedQuestionIdentity(live).qId, null, 'direct mounted identity proof is absent');
}

function noAnswerCanonicalLedgerParityFixture(runtime) {
  const flow = { id: 'flow-no-answer-parity' };
  const oldQId = 'fixture-no-answer-parity-old';
  const currentQId = 'fixture-no-answer-parity-current';
  const qShell = shell(oldQId, 'user');
  runtime.internals.commitTurnDrafts([
    draft({ qId: oldQId, aliases: [oldQId] }),
  ], [
    draft({ qId: currentQId, aliases: [oldQId, currentQId], qEl: questionElement(currentQId, oldQId) }),
  ]);
  const canonical = runtime.internals.getRecords()[0];
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: oldQId, messageId: currentQId }),
  ], [canonical], new Map([[canonical, { qShell, answerShells: [] }]])), 'fixture-no-answer-parity', true);
  const ledger = runtime.internals.buildChatAtlasLedgerCanonicalRecords()[0];
  equal(canonical.qId, currentQId);
  equal(ledger.qId, currentQId);
  equal(canonical.primaryAId, null);
  equal(ledger.primaryAId, null);
  equal(ledger.noAnswer, true);
}

function initialShellFallbackFixture(runtime) {
  const flow = { id: 'flow-ledger-initial-shell' };
  const qShell = shell('fixture-initial-shell-q', 'user');
  runtime.internals.chatAtlasApplyEvidence(read([
    evidence({ role: 'user', shellRef: qShell, shellIndex: 0, shellOrdinal: 1, flowRef: flow, shellTurnId: 'fixture-initial-shell-q', messageId: null }),
  ]), 'fixture-ledger-initial-shell', true);
  const member = runtime.internals.getChatAtlasLedgerSnapshot().members[0];
  equal(member.question.currentQId, null, 'initial shell fallback is not current live identity');
  equal(member.question.qId, 'fixture-initial-shell-q', 'initial positively paired shell remains durable fallback');
}

function ambiguousAnswerFixture(runtime) {
  const shared = 'fixture-ambiguous-answer';
  const records = [
    recordRow({ qId: 'fixture-ambiguous-q1', turnId: 'turn:fixture-ambiguous-q1', answerIds: [shared], primaryAId: shared, _aliasIds: [] }),
    recordRow({ qId: 'fixture-ambiguous-q2', turnId: 'turn:fixture-ambiguous-q2', answerIds: [shared], primaryAId: shared, _aliasIds: [] }),
  ];
  const match = runtime.internals.canonicalLiveDraftMatch(records, draft({
    qId: 'fixture-ambiguous-mounted',
    answers: [shared],
    qEl: questionElement('fixture-ambiguous-mounted', 'fixture-unrelated-shell'),
  }), new Set());
  equal(match.record, null, 'ambiguous answer ownership cannot promote a qId');
}

function branchSwitchFixture(runtime) {
  const answerA = 'fixture-branch-answer-a';
  const answerB = 'fixture-branch-answer-b';
  const qA = 'fixture-branch-question-a';
  const qB = 'fixture-branch-question-b';
  const first = draft({ qId: qA, answers: [answerA], aliases: [qA, answerA] });
  runtime.internals.seedDurableTurnDrafts([first]);
  runtime.internals.commitTurnDrafts([first], [draft({
    qId: qB,
    answers: [answerA],
    aliases: [qB, qA, answerA],
    qEl: questionElement(qB, qA),
  })]);
  const row = runtime.internals.getRecords()[0];
  equal(row.qId, qB, 'positive selected-shell evidence changes current branch qId');
  includes(row._aliasIds, qA, 'previous branch qId remains historical');
  equal(row.answerIds.includes(answerB), false, 'question promotion does not invent answer variants');
}

function durableIdempotenceFixture(runtime) {
  const oldQId = 'fixture-idempotent-old-q';
  const currentQId = 'fixture-idempotent-current-q';
  const answerId = 'fixture-idempotent-answer';
  const canonical = draft({ qId: oldQId, answers: [answerId], aliases: [oldQId] });
  const live = draft({ qId: currentQId, answers: [answerId], aliases: [oldQId, currentQId], qEl: questionElement(currentQId, oldQId) });
  runtime.internals.seedDurableTurnDrafts([canonical]);
  runtime.internals.commitTurnDrafts([canonical], [live]);
  const first = JSON.stringify(runtime.internals.getDurableSnapshot());
  runtime.internals.commitTurnDrafts(runtime.internals.mergeDurableTurnDrafts([live]), [live]);
  const second = JSON.stringify(runtime.internals.getDurableSnapshot());
  equal(second, first, 'repeated current-qId refresh is durable-idempotent');
  equal(runtime.internals.getRecords().length, 1, 'repeated refresh creates no duplicate turn');
}

function partialHydrationFixture(runtime) {
  const canonical = Array.from({ length: 5 }, (_, index) => draft({
    qId: `fixture-partial-q-${index + 1}`,
    answers: [`fixture-partial-a-${index + 1}`],
    aliases: [`fixture-partial-q-${index + 1}`],
    turnNo: index + 1,
  }));
  runtime.internals.seedDurableTurnDrafts(canonical);
  const live = draft({
    qId: 'fixture-partial-live-q-3',
    answers: ['fixture-partial-a-3'],
    aliases: ['fixture-partial-q-3'],
    qEl: questionElement('fixture-partial-live-q-3', 'fixture-partial-q-3'),
  });
  runtime.internals.commitTurnDrafts(canonical, [live]);
  equal(runtime.internals.getRecords().length, 5, 'partial hydration preserves canonical membership');
  equal(runtime.internals.getRecords()[2].qId, 'fixture-partial-live-q-3', 'overlapping row promotes current qId');
  includes(runtime.internals.getRecords()[2]._aliasIds, 'fixture-partial-q-3');
  equal(runtime.internals.getRecords().filter((_, index) => index !== 2).map((row) => row.qId), [
    'fixture-partial-q-1',
    'fixture-partial-q-2',
    'fixture-partial-q-4',
    'fixture-partial-q-5',
  ], 'off-DOM current question identities remain unchanged');
  equal(runtime.internals.getRecords().filter((_, index) => index !== 2).map((row) => row.primaryAId), [
    'fixture-partial-a-1',
    'fixture-partial-a-2',
    'fixture-partial-a-4',
    'fixture-partial-a-5',
  ], 'off-DOM answer identities remain unchanged');
}

function bootSplitIncidentFixture(runtime) {
  const variants = [
    '84c7e73c-5fb7-44f6-a930-72e92d369c5a',
    OBSERVED.answerId,
  ];
  const pairing = structuralPairing(runtime, OBSERVED.mountedQId, variants, 'incident-boot-split');
  const questionOnly = draft({
    qId: OBSERVED.mountedQId,
    aliases: [OBSERVED.mountedQId, 'incident-question-shell'],
  });
  const answerOnly = draft({
    qId: null,
    answers: variants,
    aliases: [...variants, 'incident-answer-shell'],
  });
  const reconciled = runtime.internals.reconcileBootSplitTurnDrafts(
    [questionOnly, answerOnly],
    pairing,
  );
  equal(reconciled.reconciledCount, 1, 'exact incident halves reconcile once');
  equal(reconciled.drafts.length, 1, 'exact incident produces one canonical draft');
  equal(reconciled.drafts[0].qId, OBSERVED.mountedQId, 'mounted selected-path qId wins');
  equal(reconciled.drafts[0].answerIds, variants, 'all incident answer variants remain ordered');
  equal(reconciled.drafts[0].primaryAId, OBSERVED.answerId, 'incident selected primary remains unchanged');
  includes(reconciled.drafts[0].aliasIds, OBSERVED.mountedQId, 'question identity remains an alias');
  includes(reconciled.drafts[0].aliasIds, variants[0], 'earlier answer variant remains an alias');
  includes(reconciled.drafts[0].aliasIds, OBSERVED.answerId, 'selected answer remains an alias');

  runtime.internals.seedDurableTurnDrafts(reconciled.drafts);
  runtime.internals.commitTurnDrafts(reconciled.drafts, reconciled.drafts);
  equal(runtime.internals.getRecords().length, 1, 'canonical publication emits one record');
  equal(runtime.internals.getRecords()[0].turnId, `turn:${OBSERVED.mountedQId}`, 'turn identity becomes question-derived');
  equal(runtime.internals.getDurableSnapshot().order, [`q:${OBSERVED.mountedQId}`], 'durable cache emits only the question key');
}

function bootSplitReverseArrivalFixture(runtime) {
  const qId = 'fixture-reverse-boot-question';
  const answerId = 'fixture-reverse-boot-answer';
  const pairing = structuralPairing(runtime, qId, [answerId], 'reverse-boot-split');
  const answerOnly = draft({ qId: null, answers: [answerId], aliases: [answerId] });
  const questionOnly = draft({ qId, aliases: [qId] });
  const reconciled = runtime.internals.reconcileBootSplitTurnDrafts(
    [answerOnly, questionOnly],
    pairing,
  );
  equal(reconciled.drafts.length, 1, 'answer-first split reconciles to one turn');
  equal(reconciled.drafts[0].qId, qId);
  equal(reconciled.drafts[0].primaryAId, answerId);
  equal(reconciled.drafts[0].turnNo, 1, 'reverse arrival is deterministically reindexed');
}

function bootSplitSelectedPrimaryFixture(runtime) {
  const qId = 'fixture-selected-primary-question';
  const answerIds = ['fixture-selected-primary-answer', 'fixture-later-variant-answer'];
  const pairing = structuralPairing(runtime, qId, answerIds, 'selected-primary-boot-split');
  const answerOnly = draft({ qId: null, answers: answerIds, aliases: answerIds });
  answerOnly.primaryAId = answerIds[0];
  const reconciled = runtime.internals.reconcileBootSplitTurnDrafts([
    draft({ qId, aliases: [qId] }),
    answerOnly,
  ], pairing);
  equal(reconciled.drafts.length, 1);
  equal(reconciled.drafts[0].answerIds, answerIds, 'variant ordering remains unchanged');
  equal(reconciled.drafts[0].primaryAId, answerIds[0], 'selected primary is not inferred from variant order');
  runtime.internals.seedDurableTurnDrafts(reconciled.drafts);
  runtime.internals.commitTurnDrafts(reconciled.drafts, reconciled.drafts);
  equal(runtime.internals.getRecords()[0].primaryAId, answerIds[0], 'canonical commit retains explicit selection');
  equal(runtime.internals.getDurableSnapshot().rows[0].primaryAId, answerIds[0], 'durable draft retains explicit selection');
}

function bootSplitAmbiguousOwnershipFixture(runtime) {
  const qId = 'fixture-ambiguous-boot-question';
  const answerId = 'fixture-ambiguous-boot-answer';
  const pairing = structuralPairing(runtime, qId, [answerId], 'ambiguous-boot-split');
  const reconciled = runtime.internals.reconcileBootSplitTurnDrafts([
    draft({ qId, aliases: [qId, 'question-candidate-a'] }),
    draft({ qId, aliases: [qId, 'question-candidate-b'] }),
    draft({ qId: null, answers: [answerId], aliases: [answerId] }),
  ], pairing);
  equal(reconciled.reconciledCount, 0, 'multiple question owners fail closed');
  equal(reconciled.drafts.length, 3, 'ambiguous halves remain separate');
  equal(reconciled.ambiguousCount > 0, true, 'ambiguity is explicit');
}

function bootSplitUnrelatedRowsFixture(runtime) {
  const pairing = structuralPairing(
    runtime,
    'fixture-paired-question',
    ['fixture-paired-answer'],
    'unrelated-boot-split',
  );
  const source = [
    draft({ qId: 'fixture-unrelated-question', aliases: ['fixture-unrelated-question'] }),
    draft({ qId: null, answers: ['fixture-unrelated-answer'], aliases: ['fixture-unrelated-answer'] }),
  ];
  const reconciled = runtime.internals.reconcileBootSplitTurnDrafts(source, pairing);
  equal(reconciled.reconciledCount, 0, 'unrelated rows are never merged by position');
  equal(reconciled.drafts.length, 2);
  equal(reconciled.drafts[0].qId, 'fixture-unrelated-question');
  equal(reconciled.drafts[1].primaryAId, 'fixture-unrelated-answer');
}

function bootSplitReconciliationIdempotentFixture(runtime) {
  const qId = 'fixture-idempotent-boot-question';
  const answerId = 'fixture-idempotent-boot-answer';
  const pairing = structuralPairing(runtime, qId, [answerId], 'idempotent-boot-split');
  const first = runtime.internals.reconcileBootSplitTurnDrafts([
    draft({ qId, aliases: [qId] }),
    draft({ qId: null, answers: [answerId], aliases: [answerId] }),
  ], pairing);
  const second = runtime.internals.reconcileBootSplitTurnDrafts(first.drafts, pairing);
  equal(second.reconciledCount, 0, 'already reconciled turn is not merged again');
  equal(JSON.stringify(second.drafts), JSON.stringify(first.drafts), 'reconciliation is byte-stable on repeat');
}

const FIXTURES = [
  ['observed-canonical-ledger-qid-split', canonicalPromotionFixture],
  ['unique-answer-proves-current-question', answerProofFixture],
  ['historical-alias-alone-cannot-promote', historicalAliasCannotPromoteFixture],
  ['unmounted-evidence-retains-durable-qid', noMountedIdentityFixture],
  ['canonical-draft-retains-displaced-qid', canonicalDraftAliasFixture],
  ['assistant-variants-remain-one-turn', variantsFixture],
  ['no-answer-current-question-promotion', noAnswerFixture],
  ['live-matching-is-one-to-one', oneToOneFixture],
  ['ledger-publishes-mounted-current-qid', ledgerMountedIdentityFixture],
  ['ledger-unhydrated-retains-prior-qid', ledgerHydrationFallbackFixture],
  ['ledger-mounted-question-rekey-retains-history', ledgerQuestionRekeyFixture],
  ['canonical-and-ledger-publish-one-current-qid', integratedCanonicalLedgerParityFixture],
  ['assistant-identity-never-becomes-question-id', answerIdentityNeverBecomesQuestionFixture],
  ['generated-fallback-cannot-promote-current-qid', untrustedFallbackCannotPromoteFixture],
  ['no-answer-canonical-ledger-qid-parity', noAnswerCanonicalLedgerParityFixture],
  ['ledger-initial-shell-is-durable-fallback', initialShellFallbackFixture],
  ['ambiguous-answer-ownership-fails-closed', ambiguousAnswerFixture],
  ['positive-branch-switch-retains-old-qid', branchSwitchFixture],
  ['durable-current-qid-rekey-is-idempotent', durableIdempotenceFixture],
  ['partial-hydration-preserves-membership', partialHydrationFixture],
  ['boot-split-exact-incident-reconciles-before-commit', bootSplitIncidentFixture],
  ['boot-split-reverse-arrival-reconciles', bootSplitReverseArrivalFixture],
  ['boot-split-selected-primary-remains-stable', bootSplitSelectedPrimaryFixture],
  ['boot-split-ambiguous-ownership-fails-closed', bootSplitAmbiguousOwnershipFixture],
  ['boot-split-unrelated-rows-remain-separate', bootSplitUnrelatedRowsFixture],
  ['boot-split-reconciliation-is-idempotent', bootSplitReconciliationIdempotentFixture],
];

const results = [];
for (const [name, fixture] of FIXTURES) {
  try {
    const runtime = createRuntime(name);
    fixture(runtime);
    assertSafety(runtime);
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack || error) });
    console.log(`FAIL ${name}: ${String(error?.message || error)}`);
  }
}

const failures = results.filter((result) => !result.ok);
const report = {
  ok: failures.length === 0,
  productionSourcePath: SOURCE_PATH,
  fixtureCount: results.length,
  passed: results.length - failures.length,
  failures: failures.length,
  assertionCount,
  sideEffects: aggregate,
  sourceSetterCalls: aggregate.sourceSetterCalls,
  results,
};

console.log(JSON.stringify(report));
process.exitCode = report.ok ? 0 : 1;
