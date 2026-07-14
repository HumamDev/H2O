#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(here, 'chat-atlas-cv3-2-canary-console.js');
const source = fs.readFileSync(harnessPath, 'utf8');
const checkpointKey = 'h2o:cv3:checkpoint:v2';
const legacyCheckpointKey = 'h2o:cv3:checkpoint:v1';
const testInternalsName = '__H2O_CV3_CANARY_TEST_INTERNALS__';
const testInternalsAnchor = '  const API = Object.freeze({';
const anchorCount = source.split(testInternalsAnchor).length - 1;
assert.equal(anchorCount, 1, 'unable to expose checkpoint internals from a unique harness anchor');
const instrumentedSource = source.replace(testInternalsAnchor, `  Object.defineProperty(G, '${testInternalsName}', {
    value: Object.freeze({
      saveStage,
      readCheckpoint,
      writeCheckpoint,
      compactStageSummary,
      compactCheckpointStageSummary,
      checkpointStagePolicy,
      stageStorageKey,
      readStored,
      writeStored,
      compactEvidenceState,
      compactBaselineState,
      compactBaselineTurn,
      compactConsumerResults,
      fingerprintRows,
      compareMembershipIdentityStates,
      compactMovementEvidenceReferences,
      projectedRollbackPayload,
      summarizeRollbackEquivalence,
      predictStageCapacity,
      serializeStageRecord,
      checkpointKey: CHECKPOINT_KEY,
      checkpointMaxBytes: CHECKPOINT_MAX_BYTES,
      stageRecordMaxChars: STAGE_RECORD_MAX_CHARS,
      evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
      baselineKey: BASELINE_KEY,
      movementHelperKey: MOVEMENT_HELPER_KEY,
    }),
    configurable: true,
  });

${testInternalsAnchor}`);

let sourceSetterCalls = 0;
let contextSequence = 0;

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  const mutations = { setItem: 0, removeItem: 0, clear: 0 };
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) {
      mutations.setItem += 1;
      values.set(String(key), String(value));
    },
    removeItem(key) {
      mutations.removeItem += 1;
      values.delete(String(key));
    },
    clear() {
      mutations.clear += 1;
      values.clear();
    },
    dump() { return Object.fromEntries(values); },
    stats() { return { ...mutations }; },
  };
}

function createHarnessContext(options = {}) {
  contextSequence += 1;
  const chatKey = options.chatKey || 'fixture-chat-a';
  let activeSource = options.activeSource || 'legacy-durable-cache';
  let turnStateVersion = options.turnVersion || 1;
  const runtimeRows = { rows: Array.isArray(options.rows) ? options.rows : [] };
  const allowedSetter = { calls: 0, sources: [] };
  const listeners = new Map();
  const sessionStorage = options.sessionStorage || createStorage();
  const localStorage = options.localStorage || createStorage();
  const miniMapButtons = () => runtimeRows.rows.map((row) => ({
    textContent: String(row.turnNo),
    dataset: {
      turnIdx: String(row.turnNo),
      turnId: `turn:${row.qId}`,
      questionId: row.qId,
      primaryAId: row.primaryAId || '',
      page: String(Math.floor((row.turnNo - 1) / 25) + 1),
    },
    closest() { return null; },
    hasAttribute() { return false; },
    getAttribute() { return null; },
  }));
  const miniMapRoot = Object.freeze({
    querySelectorAll() { return miniMapButtons(); },
    querySelector(selector) {
      const match = String(selector).match(/data-turn-idx="(\d+)"/);
      return match ? miniMapButtons().find((button) => button.dataset.turnIdx === match[1]) || null : null;
    },
  });
  const document = Object.freeze({
    querySelector(selector) { return String(selector).includes('mnmp') || String(selector).includes('minimap-v10') ? miniMapRoot : null; },
    querySelectorAll() { return []; },
  });
  const ledgerMembers = () => runtimeRows.rows.map((row) => ({
    logicalMemberKey: row.logicalMemberKey || `atlas:${row.turnNo}`,
    turnNo: row.turnNo,
    question: {
      qId: row.qId,
      currentAliases: row.questionCurrentAliases || [row.qId],
      aliases: row.questionResolverAliases || [row.qId],
    },
    answer: {
      primaryAId: row.primaryAId || null,
      currentAnswerIds: row.currentAnswerIds || (row.primaryAId ? [row.primaryAId] : []),
      currentAliases: row.answerCurrentAliases || (row.primaryAId ? [row.primaryAId] : []),
      aliases: row.answerResolverAliases || (row.primaryAId ? [row.primaryAId] : []),
      currentShells: row.answerCurrentShells || [],
      currentProjectionSource: row.currentProjectionSource || 'native-evidence',
    },
    resolverAliases: row.resolverAliases || [row.qId, row.primaryAId].filter(Boolean),
    noAnswer: row.noAnswer === true,
    hydration: row.hydration || 'hydrated',
    pageNo: row.pageNo || Math.floor((row.turnNo - 1) / 25) + 1,
  }));
  const runtime = Object.freeze({
    getChatAtlasCanonicalSource() { return activeSource; },
    setChatAtlasCanonicalSource(sourceName) {
      if (!options.allowSourceSetter) {
        sourceSetterCalls += 1;
        throw new Error('source setter must not run in validator execution');
      }
      allowedSetter.calls += 1;
      allowedSetter.sources.push(sourceName);
      const changed = activeSource !== sourceName;
      activeSource = sourceName;
      if (changed) turnStateVersion += 1;
      for (const listener of listeners.get('evt:h2o:core:turn:updated') || []) {
        listener({ detail: { reason: 'fixture-source-switch', version: turnStateVersion, turnTotal: runtimeRows.rows.length } });
      }
      return { ok: true, changed, activeSource, effectiveSource: activeSource };
    },
    listTurnRecords() {
      return runtimeRows.rows.map((row) => ({
        turnNo: row.turnNo,
        idx: row.turnNo,
        qId: row.qId,
        primaryAId: row.primaryAId || null,
        answerIds: row.answerIds || row.currentAnswerIds || (row.primaryAId ? [row.primaryAId] : []),
        _aliasIds: row.currentAliases || [row.qId, row.primaryAId].filter(Boolean),
        noAnswer: row.noAnswer === true,
      }));
    },
    getChatAtlasLedgerSnapshot() {
      return {
        ledgerReady: true,
        chatKey,
        version: turnStateVersion,
        memberCount: runtimeRows.rows.length,
        completeShellMap: true,
        members: ledgerMembers(),
        quarantinedAliases: [],
      };
    },
    getChatAtlasLedgerDiagnostics() {
      return {
        ledgerReady: true,
        canonicalSource: {
          activeSource,
          effectiveSource: activeSource,
          defaultSource: 'legacy-durable-cache',
          supportedSources: ['legacy-durable-cache', 'chat-atlas-ledger'],
          switchCount: allowedSetter.calls,
          invalidSwitchCount: 0,
          rejectedSwitchCount: 0,
          lastSelection: {
            legacyCount: runtimeRows.rows.length,
            selectedCount: runtimeRows.rows.length,
          },
          persisted: false,
        },
        dualRun: {
          ready: true,
          exactParity: true,
          currentMismatchCount: 0,
          totalMismatchCount: 0,
          missingInLegacyCount: 0,
          missingInAdapterCount: 0,
          duplicateIdentityCount: 0,
          duplicateAliasCount: 0,
          primaryRekeyCount: 0,
          instrumentationErrorCount: 0,
        },
      };
    },
    getChatAtlasConvergenceParity() { return { parityStatus: 'exact', blockers: [] }; },
  });
  const context = vm.createContext({
    Map,
    console: Object.freeze({ info() {}, log() {}, warn() {}, error() {} }),
    document,
    location: Object.freeze({ href: `https://chatgpt.com/c/${chatKey}`, pathname: `/c/${chatKey}` }),
    navigator: Object.freeze({}),
    history: Object.freeze({}),
    sessionStorage,
    localStorage,
    crypto: Object.freeze({
      randomUUID() { return `00000000-0000-4000-8000-${String(contextSequence).padStart(12, '0')}`; },
    }),
    performance: Object.freeze({ now() { return contextSequence; } }),
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) {
      const current = listeners.get(type) || new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    H2O_MM_mapButtons: new Map(runtimeRows.rows.map((row) => [row.turnNo, true])),
    H2O_MM_turnById: new Map(runtimeRows.rows.map((row) => [row.qId, row])),
    H2O_MM_CORE_API: Object.freeze({ getTurnList() { return runtimeRows.rows; } }),
    H2O: Object.freeze({
      surface: Object.freeze({ chatId() { return chatKey; } }),
      turn: Object.freeze({ version() { return turnStateVersion; } }),
      turnRuntime: runtime,
    }),
  });
  vm.runInContext(instrumentedSource, context, { filename: harnessPath });
  return {
    context,
    api: context.H2O_CV3_CANARY,
    internals: context[testInternalsName],
    sessionStorage,
    localStorage,
    runtimeControl: {
      allowedSetter,
      get activeSource() { return activeSource; },
      get turnVersion() { return turnStateVersion; },
      setRows(rows) {
        runtimeRows.rows = rows;
        context.H2O_MM_mapButtons = new Map(rows.map((row) => [row.turnNo, true]));
        context.H2O_MM_turnById = new Map(rows.map((row) => [row.qId, row]));
      },
    },
  };
}

const primaryHarness = createHarnessContext();
const evaluate = primaryHarness.api?.evaluateStreamingIdentityContinuity;
const evaluateRollback = primaryHarness.api?.evaluateRollbackEquivalence;
assert.equal(typeof evaluate, 'function', 'streaming continuity evaluator was not exported');
assert.equal(typeof evaluateRollback, 'function', 'rollback equivalence evaluator was not exported');
assert.equal(sourceSetterCalls, 0, 'harness evaluation invoked the canonical source setter');

const placeholder = 'request-placeholder-request-fixture-stream-0';
const finalAnswerId = 'fixture-answer-final';
const qId = 'fixture-question-10';
const logicalMemberKey = 'atlas:10';

const cleanAliasDiagnostics = Object.freeze({
  currentCrossMemberDuplicateCount: 0,
  crossMemberAliasConflictCount: 0,
  currentAliasConflictCount: 0,
  historicalAliasConflictCount: 0,
  duplicateAliasCount: 0,
  quarantinedAliasCount: 0,
  quarantinedAliases: [],
});

function duringRow(primaryAId = placeholder) {
  return {
    logicalMemberKey,
    turnNo: 10,
    qId,
    primaryAId,
  };
}

function finalRow(overrides = {}) {
  return {
    logicalMemberKey,
    turnNo: 10,
    qId,
    primaryAId: finalAnswerId,
    currentAnswerIds: [finalAnswerId],
    currentAliases: [qId, finalAnswerId],
    answerResolverAliases: [placeholder, finalAnswerId],
    resolverAliases: [qId, placeholder, finalAnswerId],
    ...overrides,
  };
}

function state(rows, aliasDiagnostics = cleanAliasDiagnostics) {
  return { perTurn: rows, aliasDiagnostics };
}

function rollbackRow(turnNo, overrides = {}) {
  const rowQId = `fixture-question-${turnNo}`;
  const rowPrimary = `fixture-answer-${turnNo}`;
  return {
    logicalMemberKey: `atlas:${turnNo}`,
    turnNo,
    qId: rowQId,
    primaryAId: rowPrimary,
    currentAnswerIds: [rowPrimary],
    currentAliases: [rowQId, rowPrimary],
    questionCurrentAliases: [rowQId],
    answerCurrentAliases: [rowPrimary],
    questionResolverAliases: [rowQId],
    answerResolverAliases: [rowPrimary],
    resolverAliases: [rowQId, rowPrimary],
    answerCurrentShells: [{
      shellTurnId: `fixture-shell-${turnNo}`,
      messageId: rowPrimary,
      currentAnswerId: rowPrimary,
    }],
    currentProjectionSource: 'native-evidence',
    noAnswer: false,
    ...overrides,
  };
}

function rollbackState(rows, overrides = {}) {
  const final = rows.at(-1) || null;
  return {
    activeChatKey: 'fixture-chat-a',
    perTurn: rows,
    aliasDiagnostics: cleanAliasDiagnostics,
    miniMapBoxes: final ? [{ turnNo: final.turnNo, primaryAId: final.primaryAId }] : [],
    ...overrides,
  };
}

function syntheticRows(count, options = {}) {
  return Array.from({ length: count }, (_, index) => {
    const turnNo = index + 1;
    const row = rollbackRow(turnNo, {
      hydration: turnNo % 3 === 0 ? 'shell' : 'hydrated',
      pageNo: Math.floor(index / 25) + 1,
    });
    if (turnNo === 5 && options.includeVariant !== false) {
      row.answerIds = [`fixture-answer-${turnNo}-variant-a`, row.primaryAId];
    } else {
      row.answerIds = [row.primaryAId];
    }
    return row;
  });
}

function syntheticFullState(count, options = {}) {
  const rows = options.rows || syntheticRows(count, options);
  const sourceName = options.source || 'legacy-durable-cache';
  const miniMapBoxes = rows.map((row) => ({
    turnNo: row.turnNo,
    qId: row.qId,
    primaryAId: row.primaryAId,
    noAnswer: row.noAnswer === true,
  }));
  return {
    href: `https://chatgpt.com/c/${options.chatKey || 'fixture-chat-a'}`,
    activeChatKey: options.chatKey || 'fixture-chat-a',
    turnVersion: options.turnVersion || 7,
    source: {
      activeSource: sourceName,
      effectiveSource: sourceName,
      defaultSource: 'legacy-durable-cache',
      supportedSources: ['legacy-durable-cache', 'chat-atlas-ledger'],
      switchCount: sourceName === 'legacy-durable-cache' ? 2 : 1,
      invalidSwitchCount: 0,
      rejectedSwitchCount: 0,
      persisted: false,
      lastSelection: { legacyCount: count, selectedCount: count },
    },
    counts: {
      canonical: count,
      ledger: count,
      miniMap: count,
      mapButtons: count,
      turnById: count,
      coreTurnList: count,
    },
    ledgerSummary: {
      ledgerReady: true,
      chatKey: options.chatKey || 'fixture-chat-a',
      version: options.turnVersion || 7,
      memberCount: count,
      completeShellMap: true,
    },
    dualRun: {
      ready: true,
      comparisonEligible: true,
      exactParity: true,
      countParity: true,
      orderParity: true,
      fieldShapeParity: true,
      currentMismatchCount: 0,
      totalMismatchCount: 0,
      missingInLegacyCount: 0,
      missingInAdapterCount: 0,
      duplicateIdentityCount: 0,
      duplicateAliasCount: 0,
      primaryRekeyCount: 0,
      instrumentationErrorCount: 0,
      evidenceChatKey: options.chatKey || 'fixture-chat-a',
      captureChatKey: options.chatKey || 'fixture-chat-a',
      ledgerChatKey: options.chatKey || 'fixture-chat-a',
    },
    convergence: { parityStatus: 'exact', blockers: [] },
    aliasDiagnostics: cleanAliasDiagnostics,
    miniMapAutomaticRefresh: {
      automaticRefresh: {
        identityDriftDetectedCount: 0,
        identityDriftPersistentCount: 0,
        identityDriftRebuildCount: 0,
        coreTurnUpdatedRebuildCount: 0,
      },
    },
    miniMapIdentityAlignment: { ok: true, drifts: [], duplicateTurns: [] },
    canonicalRecords: rows.map((row) => ({
      turnNo: row.turnNo,
      qId: row.qId,
      primaryAId: row.primaryAId,
      answerIds: row.answerIds,
      aliases: row.currentAliases,
      noAnswer: row.noAnswer === true,
      pageNo: row.pageNo,
    })),
    ledgerSnapshot: { members: rows },
    perTurn: rows,
    miniMapBoxes,
    visibleNumbers: { answer: [], question: [] },
    pageDividers: [],
    titleBars: [],
    timestamps: [],
    washerProjection: { rows: [], mismatches: [] },
    consumers: {},
  };
}

function movementEvidence(scenarioId = 'CV3.3-S1-fixture', chatKey = 'fixture-chat-a', labels = ['oldest', 'middle', 'newest']) {
  return JSON.stringify({
    schemaVersion: 1,
    helperVersion: 'cv3.3-navigation-spot-check-v1',
    scenarioId,
    scenario: 'CV3.3-S1',
    createdAt: '2026-07-14T10:00:00.000Z',
    updatedAt: '2026-07-14T10:03:00.000Z',
    snapshots: labels.map((label, index) => ({
      label,
      capturedAt: `2026-07-14T10:0${index}:00.000Z`,
      href: `https://chatgpt.com/c/${chatKey}`,
      chatKey,
      counts: { canonical: 83, ledger: 83, miniMap: 83, mapButtons: 83, turnById: 83, coreTurnList: 83 },
      gates: { countsAligned: true, dualRunExact: true },
    })),
  });
}

function saturateCheckpoint(harness, targetBytes = 16300) {
  const read = harness.internals.readCheckpoint();
  assert.equal(read.ok, true);
  const checkpoint = read.checkpoint;
  let padding = 'x'.repeat(Math.max(0, targetBytes - Buffer.byteLength(JSON.stringify(checkpoint), 'utf8') - 80));
  let raw;
  do {
    raw = JSON.stringify({ ...checkpoint, fixturePadding: padding });
    if (Buffer.byteLength(raw, 'utf8') > targetBytes) padding = padding.slice(0, -1);
    else break;
  } while (padding.length);
  harness.localStorage.setItem(checkpointKey, raw);
  return Buffer.byteLength(raw, 'utf8');
}

async function prepareLedgerHarness(count = 83, options = {}) {
  const rows = options.rows || syntheticRows(count);
  const sessionStorage = options.sessionStorage || createStorage({
    'h2o:cv3-3:navigation:v1': movementEvidence(options.scenarioId, options.chatKey),
  });
  const harness = createHarnessContext({
    chatKey: options.chatKey || 'fixture-chat-a',
    rows,
    allowSourceSetter: true,
    sessionStorage,
    localStorage: options.localStorage || createStorage(),
  });
  const p0 = await harness.api.P0();
  assert.equal(p0.ok, true, `fixture P0 failed: ${p0.failureReasons}`);
  const p1 = await harness.api.P1();
  assert.equal(p1.ok, true, `fixture P1 failed: ${p1.failureReasons}`);
  const p2 = await harness.api.P2();
  assert.equal(p2.ok, true, `fixture P2 failed: ${p2.failureReasons}`);
  assert.equal(harness.runtimeControl.activeSource, 'chat-atlas-ledger');
  return harness;
}

async function createValidCheckpoint(options = {}) {
  const localStorage = options.localStorage || createStorage();
  const sessionStorage = options.sessionStorage || createStorage();
  const harness = createHarnessContext({
    chatKey: options.chatKey || 'fixture-chat-a',
    activeSource: options.activeSource || 'legacy-durable-cache',
    rows: options.rows || [],
    allowSourceSetter: options.allowSourceSetter === true,
    localStorage,
    sessionStorage,
  });
  await harness.api.P0();
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, true, `unable to create checkpoint: ${exported.checkpointReason}`);
  return { ...harness, exported };
}

function representativeState(source = 'legacy-durable-cache') {
  return {
    source: {
      activeSource: source,
      effectiveSource: source,
      defaultSource: 'legacy-durable-cache',
      persisted: false,
      switchCount: source === 'legacy-durable-cache' ? 2 : 1,
    },
    counts: {
      canonical: 12,
      ledger: 12,
      miniMap: 12,
      mapButtons: 12,
      turnById: 12,
      coreTurnList: 12,
    },
    aliasDiagnostics: cleanAliasDiagnostics,
    dualRun: {
      ready: true,
      exactParity: true,
      currentMismatchCount: 0,
      totalMismatchCount: 0,
      instrumentationErrorCount: 0,
    },
    convergence: { parityStatus: 'exact', blockers: [] },
  };
}

const representativeGateCounts = Object.freeze({
  P1: 4,
  P2: 8,
  P3: 12,
  P4: 9,
  P5: 9,
  P6: 9,
  P7: 12,
  P7_DURING: 4,
  P8: 14,
  P9: 11,
});

function representativeStagePayload(stage, options = {}) {
  const sourceName = ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P7_DURING'].includes(stage)
    ? 'chat-atlas-ledger'
    : 'legacy-durable-cache';
  const gateCount = options.gateCount ?? representativeGateCounts[stage] ?? 5;
  const failureCount = options.failureCount ?? 0;
  const ok = options.ok ?? failureCount === 0;
  const gates = Object.fromEntries(Array.from({ length: gateCount }, (_, index) => [
    `${stage.toLowerCase()}RepresentativeGate${String(index + 1).padStart(2, '0')}`,
    ok || index > 0,
  ]));
  const payload = {
    ok,
    gates,
    failureReasons: Array.from({ length: failureCount }, (_, index) => {
      return `${stage.toLowerCase()}-representative-failure-${String(index + 1).padStart(2, '0')}`;
    }),
    state: representativeState(sourceName),
  };
  if (stage === 'P2') {
    payload.before = representativeState('legacy-durable-cache');
    payload.after = payload.state;
    payload.changed = true;
  } else if (stage === 'P8') {
    payload.before = representativeState('chat-atlas-ledger');
    payload.after = payload.state;
    payload.changed = true;
  }
  return payload;
}

async function buildCheckpointSequence(options = {}) {
  const harness = createHarnessContext();
  const p0Attempt = await harness.api.P0();
  assert.equal(p0Attempt.checkpointWrite?.ok, true, 'representative sequence checkpoint was not established');
  const p0 = harness.internals.saveStage('P0', representativeStagePayload('P0'));
  assert.equal(p0.ok, true, 'representative P0 summary failed');
  const stages = [
    'P1',
    'P2',
    'P3',
    'P4_ARM',
    'P4',
    'P5_ARM',
    'P5',
    'P6_ARM',
    'P6',
    'P7_ARM',
    'P7_DURING',
    'P7',
    'P8',
    'P9_ARM',
    'P9',
  ];
  const saved = {};
  for (const stage of stages) {
    const maximal = options.maximal && stage === 'P9';
    saved[stage] = harness.internals.saveStage(stage, representativeStagePayload(stage, maximal
      ? { gateCount: 40, failureCount: 24, ok: false }
      : {}));
  }
  const afterP9 = harness.internals.readCheckpoint();
  assert.equal(afterP9.ok, true, `representative P9 checkpoint failed: ${afterP9.reason}`);
  const p10 = await harness.api.P10();
  const afterP10 = harness.internals.readCheckpoint();
  assert.equal(afterP10.ok, true, `representative P10 checkpoint failed: ${afterP10.reason}`);
  return { harness, saved, p0, p10, afterP9, afterP10 };
}

let realisticCapacitySequence = null;
let maximalCapacitySequence = null;
const capacityEvidence = {};
const largeStageEvidence = {};
const previousTestCount = 39;

function largeStagePayloads(harness, fullState) {
  const compact = harness.internals.compactEvidenceState(fullState);
  const movement = {
    ok: true,
    helperVersion: 'cv3.3-navigation-spot-check-v1',
    helperScenarioId: 'CV3.3-S1-fixture',
    chatKey: fullState.activeChatKey,
    snapshotLabels: ['oldest', 'middle', 'newest'],
    snapshotReferences: ['oldest', 'middle', 'newest'].map((label, index) => ({
      label,
      snapshotId: `fixture-${label}`,
      capturedAt: `2026-07-14T10:0${index}:00.000Z`,
      chatKey: fullState.activeChatKey,
    })),
    regionCount: 3,
    movementCoverageComplete: true,
    missingLabels: [],
  };
  const membership = harness.internals.compareMembershipIdentityStates(fullState, fullState);
  const rollback = evaluateRollback(
    rollbackState(fullState.perTurn),
    rollbackState(fullState.perTurn),
  );
  return {
    baseline: harness.internals.compactBaselineState(fullState),
    p4: {
      ok: true,
      gates: { countsAgree: true, logicalMembershipStable: true, movementCoverageComplete: true },
      armSummary: compact,
      firstSettledSummary: compact,
      state: compact,
      membershipIdentityComparison: membership,
      fingerprintContinuity: {
        before: membership.beforeFingerprint,
        after: membership.afterFingerprint,
        matching: true,
      },
      movementEvidence: movement,
      automaticRefreshDelta: {},
      idleThreeSecondAutomaticRefreshDelta: {},
      failureReasons: [],
    },
    p8: {
      ok: true,
      changed: true,
      evidenceDegraded: false,
      gates: { setterOk: true, legacyActive: true, rollbackEquivalent: true },
      setterResult: { ok: true, changed: true },
      turnUpdateEvents: [{ reason: 'fixture', version: fullState.turnVersion + 1 }],
      before: compact,
      state: compact,
      rollbackEquivalence: harness.internals.summarizeRollbackEquivalence(rollback),
      emergencyRollbackRequired: false,
      failureReasons: [],
    },
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function expectFailure(result, reason) {
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes(reason), `missing failure reason: ${reason}`);
}

test('request placeholder promotes to a real primary with same-member resolver continuity', () => {
  const final = finalRow();
  const result = evaluate(duringRow(), final, state([final]));
  assert.equal(result.ok, true);
  assert.equal(result.placeholderDuring, true);
  assert.equal(result.finalPrimaryAId, finalAnswerId);
  assert.equal(result.placeholderOwnerCount, 1);
  assert.equal(result.currentAliasesContainPlaceholder, false);
  assert.equal(result.currentAnswerIdsContainPlaceholder, false);
});

test('missing broad resolver continuity fails', () => {
  const final = finalRow({
    answerResolverAliases: [finalAnswerId],
    resolverAliases: [qId, finalAnswerId],
  });
  expectFailure(
    evaluate(duringRow(), final, state([final])),
    'placeholder-broad-resolver-continuity-missing',
  );
});

test('placeholder remaining as the settled primary fails', () => {
  const final = finalRow({ primaryAId: placeholder });
  expectFailure(
    evaluate(duringRow(), final, state([final])),
    'placeholder-remains-settled-primary',
  );
});

test('placeholder owned by another member fails', () => {
  const final = finalRow();
  const other = {
    logicalMemberKey: 'atlas:9',
    turnNo: 9,
    qId: 'fixture-question-9',
    answerResolverAliases: [placeholder],
    resolverAliases: ['fixture-question-9', placeholder],
  };
  expectFailure(
    evaluate(duringRow(), final, state([other, final])),
    'placeholder-owned-by-another-member',
  );
});

test('quarantined or conflicting placeholder fails', () => {
  const final = finalRow();
  const diagnostics = {
    ...cleanAliasDiagnostics,
    currentAliasConflictCount: 1,
    quarantinedAliasCount: 1,
    quarantinedAliases: [placeholder],
  };
  const result = evaluate(duringRow(), final, state([final], diagnostics));
  expectFailure(result, 'placeholder-quarantined');
  assert.ok(result.reasons.includes('alias-diagnostics-not-clean'));
});

test('already-final during identity passes when unchanged', () => {
  const final = finalRow({
    answerResolverAliases: [finalAnswerId],
    resolverAliases: [qId, finalAnswerId],
  });
  const result = evaluate(duringRow(finalAnswerId), final, state([final]));
  assert.equal(result.ok, true);
  assert.equal(result.placeholderDuring, false);
});

test('missing P7_DURING primary identity fails', () => {
  expectFailure(
    evaluate(duringRow(null), finalRow(), state([finalRow()])),
    'missing-p7-during-primary',
  );
});

test('missing P7_DURING turn fails', () => {
  expectFailure(
    evaluate(null, finalRow(), state([finalRow()])),
    'missing-p7-during-turn',
  );
});

test('different logical turn observations fail', () => {
  const final = finalRow({
    logicalMemberKey: 'atlas:11',
    turnNo: 11,
    qId: 'fixture-question-11',
  });
  const result = evaluate(duringRow(), final, state([final]));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('streaming-turn-number-mismatch'));
  assert.ok(result.reasons.includes('streaming-question-id-mismatch'));
  assert.ok(result.reasons.includes('streaming-logical-member-key-mismatch'));
});

test('existing P7 consumer and safety gates remain present', () => {
  for (const gate of [
    'canonicalIncreasedOne',
    'countsAgree',
    'finalAnswerPresent',
    'finalPrimaryPublishedByMiniMap',
    'ledgerSource',
    'miniMapAligned',
    'dualRunExact',
    'convergenceClean',
    'aliasesClean',
  ]) {
    assert.match(source, new RegExp(`\\b${gate}:`), `missing P7 gate: ${gate}`);
  }
  assert.match(source, /streamingIdentityContinuity:\s*streamingIdentityContinuity\.ok/);
  assert.doesNotMatch(source, /placeholderNotCurrentPrimaryUnlessAlreadyFinal/);
  assert.doesNotMatch(source, /finalTurn\?\.currentAliases\?\.includes\(placeholder\)/);
});

test('rollback gates remain present and source selection stays memory-only', () => {
  for (const gate of [
    'setterOk',
    'legacyActive',
    'versionAdvanced',
    'sourceNotPersisted',
    'oneTurnUpdate',
    'countsAgree',
    'miniMapAligned',
    'dualRunExact',
    'convergenceClean',
    'aliasesClean',
    'rollbackEquivalent',
    'finalPrimaryNonPlaceholder',
    'finalPrimaryPublishedByMiniMap',
  ]) {
    assert.match(source, new RegExp(`\\b${gate}:`), `missing P8 gate: ${gate}`);
  }
  assert.match(source, /const SOURCE_LEGACY = 'legacy-durable-cache'/);
  assert.match(source, /persisted:\s*source\.persisted/);
  assert.match(source, /evaluateRollbackEquivalence\(baseline, after\)/);
});

test('normalized rows expose broad aliases without changing currentAliases composition', () => {
  assert.match(source, /logicalMemberKey:\s*ledger\?\.logicalMemberKey/);
  assert.match(source, /answerResolverAliases:\s*asArray\(ledger\?\.answerResolverAliases\)\.slice\(\)/);
  assert.match(source, /resolverAliases:\s*asArray\(ledger\?\.resolverAliases\)\.slice\(\)/);
  assert.match(source, /currentAliases:\s*uniqueOrdered\(\[\s*\.\.\.\(ledger\?\.questionCurrentAliases \|\| \[\]\),\s*\.\.\.\(ledger\?\.answerCurrentAliases \|\| \[\]\),\s*\]\)/);
});

test('harness remains inert and retains exactly one forward and rollback setter call', () => {
  const setterCalls = source.match(/setChatAtlasCanonicalSource\s*\(/g) || [];
  assert.equal(setterCalls.length, 2);
  assert.equal(sourceSetterCalls, 0);
  assert.doesNotMatch(source, /rebuildNow\s*\(/);
});

test('alias-equivalent primary rekey is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    primaryAId: 'fixture-answer-1-rekeyed',
    currentAnswerIds: ['fixture-answer-1-rekeyed'],
    answerCurrentAliases: ['fixture-answer-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-answer-1', 'fixture-answer-1-rekeyed'],
    answerCurrentShells: [],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  assert.equal(result.ok, true);
  assert.equal(result.perTurnEvidence[0].transition, 'alias-equivalent');
  assert.equal(result.perTurnEvidence[0].answer.ownerCount, 1);
  assert.equal(result.perTurnEvidence[0].visibleBranch.status, 'not-evaluable');
});

test('qId alias-equivalent transition is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    qId: 'fixture-question-1-rekeyed',
    questionCurrentAliases: ['fixture-question-1-rekeyed'],
    questionResolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed', 'fixture-answer-1'],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  assert.equal(result.ok, true);
  assert.equal(result.perTurnEvidence[0].question.aliasEquivalent, true);
  assert.equal(result.perTurnEvidence[0].question.ownerCount, 1);
});

test('regenerated logical member key with exact identities is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, { logicalMemberKey: 'atlas:regenerated-exact-1' });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  const evidence = result.perTurnEvidence[0];
  assert.equal(result.ok, true);
  assert.equal(evidence.transition, 'exact');
  assert.equal(evidence.memberKeyRelation, 'regenerated');
  assert.equal(evidence.memberKeyRegenerated, true);
  assert.equal(evidence.memberKeyCorroborates, false);
});

test('regenerated logical member key with alias-equivalent identities is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    logicalMemberKey: 'atlas:regenerated-alias-1',
    qId: 'fixture-question-1-rekeyed',
    primaryAId: 'fixture-answer-1-rekeyed',
    currentAnswerIds: ['fixture-answer-1-rekeyed'],
    questionCurrentAliases: ['fixture-question-1-rekeyed'],
    answerCurrentAliases: ['fixture-answer-1-rekeyed'],
    questionResolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: [
      'fixture-question-1',
      'fixture-question-1-rekeyed',
      'fixture-answer-1',
      'fixture-answer-1-rekeyed',
    ],
    answerCurrentShells: [],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  const evidence = result.perTurnEvidence[0];
  assert.equal(result.ok, true);
  assert.equal(evidence.transition, 'alias-equivalent');
  assert.equal(evidence.memberKeyRelation, 'regenerated');
  assert.equal(evidence.memberKeyRegenerated, true);
  assert.equal(evidence.question.ownerCount, 1);
  assert.equal(evidence.answer.ownerCount, 1);
});

test('different-turn resolver ownership is rejected despite matching logical member key', () => {
  const previous = rollbackRow(1, { logicalMemberKey: 'atlas:shared-key' });
  const wrongOwner = rollbackRow(2, {
    logicalMemberKey: 'atlas:shared-key',
    questionResolverAliases: ['fixture-question-2', previous.qId],
    answerResolverAliases: ['fixture-answer-2', previous.primaryAId],
    resolverAliases: [
      'fixture-question-2',
      previous.qId,
      'fixture-answer-2',
      previous.primaryAId,
    ],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([wrongOwner]));
  assert.equal(result.ok, false);
  assert.equal(result.perTurnEvidence[0].question.ownerCount, 1);
  assert.equal(result.perTurnEvidence[0].answer.ownerCount, 1);
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('question-owned-by-another-member'));
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('answer-owned-by-another-member'));
});

test('incident replay accepts alias-equivalent turns 4 through 6', () => {
  const baselineRows = Array.from({ length: 6 }, (_, index) => rollbackRow(index + 1));
  const currentRows = baselineRows.map((previous) => {
    if (previous.turnNo < 4) return rollbackRow(previous.turnNo);
    const nextQId = `${previous.qId}-rehydrated`;
    const nextPrimary = `${previous.primaryAId}-rehydrated`;
    return rollbackRow(previous.turnNo, {
      qId: nextQId,
      primaryAId: nextPrimary,
      currentAnswerIds: [nextPrimary],
      questionCurrentAliases: [nextQId],
      answerCurrentAliases: [nextPrimary],
      questionResolverAliases: [previous.qId, nextQId],
      answerResolverAliases: [previous.primaryAId, nextPrimary],
      resolverAliases: [previous.qId, nextQId, previous.primaryAId, nextPrimary],
      answerCurrentShells: [],
    });
  });
  const result = evaluateRollback(rollbackState(baselineRows), rollbackState(currentRows));
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.perTurnEvidence.slice(3).map((row) => row.transition)), [
    'alias-equivalent',
    'alias-equivalent',
    'alias-equivalent',
  ]);
});

test('cross-member alias ownership is rejected', () => {
  const baselineRows = [rollbackRow(1), rollbackRow(2)];
  const currentOne = rollbackRow(1, {
    primaryAId: 'fixture-answer-1-rekeyed',
    currentAnswerIds: ['fixture-answer-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-answer-1', 'fixture-answer-1-rekeyed'],
    answerCurrentShells: [],
  });
  const currentTwo = rollbackRow(2, {
    answerResolverAliases: ['fixture-answer-2', 'fixture-answer-1'],
    resolverAliases: ['fixture-question-2', 'fixture-answer-2', 'fixture-answer-1'],
  });
  const result = evaluateRollback(rollbackState(baselineRows), rollbackState([currentOne, currentTwo]));
  assert.equal(result.ok, false);
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('answer-owner-count-not-one'));
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('answer-owned-by-another-member'));
});

test('quarantined rollback identity is rejected', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1);
  const currentState = rollbackState([current], {
    aliasDiagnostics: {
      ...cleanAliasDiagnostics,
      quarantinedAliasCount: 1,
      quarantinedAliases: [previous.primaryAId],
    },
  });
  const result = evaluateRollback(rollbackState([previous]), currentState);
  assert.equal(result.ok, false);
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('involved-identity-quarantined'));
  assert.ok(result.failureReasons.includes('alias-diagnostics-not-clean'));
});

test('visible branch variant change is rejected despite resolver continuity', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    primaryAId: 'fixture-answer-1-variant-b',
    currentAnswerIds: ['fixture-answer-1-variant-b'],
    answerCurrentAliases: ['fixture-answer-1-variant-b'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-variant-b'],
    resolverAliases: ['fixture-question-1', 'fixture-answer-1', 'fixture-answer-1-variant-b'],
    answerCurrentShells: [{
      shellTurnId: 'fixture-shell-1-variant-b',
      messageId: 'fixture-answer-1-variant-b',
      currentAnswerId: 'fixture-answer-1-variant-b',
    }],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  assert.equal(result.ok, false);
  assert.equal(result.perTurnEvidence[0].visibleBranch.status, 'changed');
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('visible-branch-selection-changed'));
});

test('ARM stages are session-only and absent from the durable checkpoint', async () => {
  const harness = await createValidCheckpoint();
  const beforeWrites = harness.localStorage.stats().setItem;
  for (const stage of ['P4_ARM', 'P5_ARM', 'P6_ARM', 'P7_ARM', 'P9_ARM']) {
    harness.internals.saveStage(stage, representativeStagePayload(stage));
  }
  const checkpoint = harness.internals.readCheckpoint();
  assert.equal(checkpoint.ok, true);
  assert.equal(harness.localStorage.stats().setItem, beforeWrites);
  for (const stage of ['P4_ARM', 'P5_ARM', 'P6_ARM', 'P7_ARM', 'P9_ARM']) {
    assert.equal(checkpoint.checkpoint.stages[stage], undefined);
    assert.ok(harness.sessionStorage.getItem(harness.internals.stageStorageKey(stage)));
  }
});

test('ARM stage success remains true when durable writing is intentionally skipped', async () => {
  const harness = await createValidCheckpoint();
  for (const stage of ['P4_ARM', 'P5_ARM', 'P6_ARM', 'P7_ARM', 'P9_ARM']) {
    const result = harness.internals.saveStage(stage, representativeStagePayload(stage));
    assert.equal(result.ok, true);
    assert.equal(result.checkpointWrite.ok, true);
    assert.equal(result.checkpointWrite.skipped, true);
    assert.equal(result.checkpointWrite.reason, 'session-only-stage');
  }
});

test('full realistic sequence through P9 fits under the 16 KiB checkpoint limit', async () => {
  realisticCapacitySequence ||= await buildCheckpointSequence();
  capacityEvidence.realisticP9Bytes = realisticCapacitySequence.afterP9.bytes;
  assert.ok(realisticCapacitySequence.afterP9.bytes < 16 * 1024);
});

test('full realistic sequence through P10 fits under the 16 KiB checkpoint limit', async () => {
  realisticCapacitySequence ||= await buildCheckpointSequence();
  capacityEvidence.realisticP10Bytes = realisticCapacitySequence.afterP10.bytes;
  assert.ok(realisticCapacitySequence.afterP10.bytes < 16 * 1024);
});

test('representative maximum gate and failure arrays retain at least 2 KiB headroom through P10', async () => {
  maximalCapacitySequence ||= await buildCheckpointSequence({ maximal: true });
  capacityEvidence.maximumP9Bytes = maximalCapacitySequence.afterP9.bytes;
  capacityEvidence.maximumP10Bytes = maximalCapacitySequence.afterP10.bytes;
  assert.ok(maximalCapacitySequence.afterP10.bytes <= 14 * 1024);
});

test('P9 remains a successful durable checkpoint write', async () => {
  realisticCapacitySequence ||= await buildCheckpointSequence();
  assert.equal(realisticCapacitySequence.saved.P9.checkpointWrite.ok, true);
  assert.equal(realisticCapacitySequence.saved.P9.checkpointWrite.skipped, false);
  assert.ok(realisticCapacitySequence.afterP9.checkpoint.stages.P9);
});

test('P10 remains a successful durable checkpoint write', async () => {
  realisticCapacitySequence ||= await buildCheckpointSequence();
  assert.equal(realisticCapacitySequence.p10.checkpointWrite.ok, true);
  assert.equal(realisticCapacitySequence.p10.checkpointWrite.skipped, false);
  assert.ok(realisticCapacitySequence.afterP10.checkpoint.stages.P10);
});

test('explicit oversized checkpoint is rejected without replacing durable evidence', async () => {
  const harness = await createValidCheckpoint();
  const current = harness.internals.readCheckpoint();
  const before = harness.localStorage.getItem(checkpointKey);
  const result = harness.internals.writeCheckpoint({
    ...current.checkpoint,
    stages: {
      ...current.checkpoint.stages,
      P10: { stage: 'P10', error: 'x'.repeat(20 * 1024) },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'checkpoint-size-limit-exceeded');
  assert.ok(result.bytes > result.limitBytes);
  assert.equal(harness.localStorage.getItem(checkpointKey), before);
});

test('EXPORT merges session-only ARM summaries without adding them to the checkpoint', async () => {
  const harness = await createValidCheckpoint();
  harness.internals.saveStage('P4_ARM', representativeStagePayload('P4_ARM'));
  harness.internals.saveStage('P9_ARM', representativeStagePayload('P9_ARM'));
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, true);
  assert.ok(exported.stageSummaries.P4_ARM);
  assert.ok(exported.stageSummaries.P9_ARM);
  assert.equal(exported.checkpoint.stages.P4_ARM, undefined);
  assert.equal(exported.checkpoint.stages.P9_ARM, undefined);
});

test('reload recovery retains critical P7, P7_DURING, and P8 summaries', async () => {
  const first = await buildCheckpointSequence();
  const second = createHarnessContext({
    localStorage: first.harness.localStorage,
    sessionStorage: createStorage(),
  });
  const reload = await second.api.P8_RELOAD_VERIFY();
  assert.equal(reload.checkpointRecovery.ok, true);
  assert.ok(reload.checkpointRecovery.recoveredStageNames.includes('P7'));
  assert.ok(reload.checkpointRecovery.recoveredStageNames.includes('P7_DURING'));
  assert.ok(reload.checkpointRecovery.recoveredStageNames.includes('P8'));
  assert.equal(reload.checkpointRecovery.previousP8Summary.ok, true);
  const checkpoint = second.internals.readCheckpoint();
  assert.ok(checkpoint.checkpoint.stages.P8_RELOAD);
});

test('v5 refuses legacy v1 evidence until CLEANUP removes every v1 and v2 harness key', async () => {
  const localStorage = createStorage({ [legacyCheckpointKey]: '{"schemaVersion":1}' });
  const sessionStorage = createStorage();
  const harness = createHarnessContext({ localStorage, sessionStorage });
  const p0 = await harness.api.P0();
  assert.equal(p0.ok, false);
  assert.equal(p0.run.reason, 'checkpoint-legacy-evidence-requires-cleanup');
  localStorage.setItem(checkpointKey, '{"schemaVersion":2}');
  localStorage.setItem('h2o:cv3:test-local', 'local');
  sessionStorage.setItem('h2o:cv3:test-session', 'session');
  const cleanup = harness.api.CLEANUP();
  assert.equal(cleanup.ok, true);
  assert.equal(localStorage.getItem(legacyCheckpointKey), null);
  assert.equal(localStorage.getItem(checkpointKey), null);
  assert.equal(Object.keys(localStorage.dump()).some((key) => key.startsWith('h2o:cv3:')), false);
  assert.equal(Object.keys(sessionStorage.dump()).some((key) => key.startsWith('h2o:cv3:')), false);
});

test('durable checkpoint survives reload and preserves the pre-reload P8 summary', async () => {
  const localStorage = createStorage();
  const first = await createValidCheckpoint({ localStorage, activeSource: 'unexpected-source' });
  const p8Failure = await first.api.P8();
  assert.equal(p8Failure.ok, false);
  const beforeReload = first.api.EXPORT();
  assert.equal(beforeReload.checkpoint.stages.P8.ok, false);
  const checkpointRaw = first.localStorage.getItem(checkpointKey);
  assert.ok(Buffer.byteLength(checkpointRaw, 'utf8') <= 16 * 1024);
  assert.doesNotMatch(checkpointRaw, /ledgerSnapshot|perTurn|miniMapBoxes|consumerResults/);

  const second = createHarnessContext({ localStorage, sessionStorage: createStorage() });
  const reloadResult = await second.api.P8_RELOAD_VERIFY();
  assert.equal(reloadResult.checkpointRecovery.ok, true);
  assert.equal(reloadResult.checkpointRecovery.previousP8Summary.ok, false);
  const afterReload = second.api.EXPORT();
  assert.equal(afterReload.ok, true);
  assert.equal(afterReload.checkpoint.stages.P8.ok, false);
  assert.ok(afterReload.checkpoint.stages.P8_RELOAD);
  const p10 = await second.api.P10();
  assert.equal(p10.checkpointRecovery.ok, true);
  assert.equal(p10.stageResults.P8.ok, false);
});

test('malformed checkpoint is rejected without throwing', () => {
  const localStorage = createStorage({ [checkpointKey]: '{not-json' });
  const harness = createHarnessContext({ localStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-malformed-json');
});

test('stale checkpoint is rejected with an explicit reason', async () => {
  const valid = await createValidCheckpoint();
  const checkpoint = JSON.parse(valid.localStorage.getItem(checkpointKey));
  checkpoint.expiresAt = '2000-01-01T00:00:00.000Z';
  valid.localStorage.setItem(checkpointKey, JSON.stringify(checkpoint));
  const harness = createHarnessContext({ localStorage: valid.localStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-expired');
});

test('foreign chat checkpoint is rejected with an explicit reason', async () => {
  const valid = await createValidCheckpoint({ chatKey: 'fixture-chat-a' });
  const harness = createHarnessContext({ chatKey: 'fixture-chat-b', localStorage: valid.localStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-foreign-chat');
});

test('foreign run checkpoint is rejected with an explicit reason', async () => {
  const valid = await createValidCheckpoint();
  const sessionStorage = createStorage({ 'h2o:cv3:run-id': 'cv3-foreign-current-run' });
  const harness = createHarnessContext({ localStorage: valid.localStorage, sessionStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-foreign-run');
});

test('CLEANUP removes every harness-owned key from both storage areas', async () => {
  const harness = await createValidCheckpoint();
  harness.sessionStorage.setItem('h2o:cv3:test-extra', 'session');
  harness.localStorage.setItem('h2o:cv3:test-extra', 'local');
  harness.sessionStorage.setItem('fixture-unrelated', 'keep');
  harness.localStorage.setItem('fixture-unrelated', 'keep');
  const result = harness.api.CLEANUP();
  assert.equal(result.ok, true);
  assert.equal(Object.keys(harness.sessionStorage.dump()).some((key) => key.startsWith('h2o:cv3:')), false);
  assert.equal(Object.keys(harness.localStorage.dump()).some((key) => key.startsWith('h2o:cv3:')), false);
  assert.equal(harness.sessionStorage.getItem('fixture-unrelated'), 'keep');
  assert.equal(harness.localStorage.getItem('fixture-unrelated'), 'keep');
});

test('v5 schema and capacity limits are published without changing checkpoint schema v2', () => {
  assert.equal(primaryHarness.api.version, 'cv3.2-canary-harness-v5');
  assert.equal(primaryHarness.api.evidenceSchema, 5);
  assert.equal(primaryHarness.internals.evidenceSchemaVersion, 5);
  assert.equal(primaryHarness.internals.stageRecordMaxChars, 900000);
  assert.equal(primaryHarness.internals.checkpointKey, 'h2o:cv3:checkpoint:v2');
});

test('83-turn compact baseline, P4, and P8 records remain comfortably writable', async () => {
  const rows = syntheticRows(83);
  const fullState = syntheticFullState(83, { rows });
  const harness = await createValidCheckpoint({ rows });
  const payloads = largeStagePayloads(harness, fullState);
  harness.internals.writeStored(harness.internals.baselineKey, payloads.baseline);
  const p4 = harness.internals.saveStage('P4', payloads.p4);
  const p8 = harness.internals.saveStage('P8', payloads.p8);
  const baselineChars = harness.sessionStorage.getItem(harness.internals.baselineKey).length;
  const p4Chars = harness.sessionStorage.getItem(harness.internals.stageStorageKey('P4')).length;
  const p8Chars = harness.sessionStorage.getItem(harness.internals.stageStorageKey('P8')).length;
  Object.assign(largeStageEvidence, { baseline83Chars: baselineChars, p4_83Chars: p4Chars, p8_83Chars: p8Chars });
  assert.equal(payloads.baseline.evidenceSchema, 5);
  assert.equal(payloads.baseline.perTurn.length, 83);
  assert.equal(p4.ok, true);
  assert.equal(p8.ok, true);
  assert.ok(Math.max(baselineChars, p4Chars, p8Chars) < 150000);
  assert.doesNotMatch(harness.sessionStorage.getItem(harness.internals.stageStorageKey('P4')), /"ledgerSnapshot"|"consumerResults"/);
});

test('250-turn compact baseline, P4, and P8 records remain comfortably writable', async () => {
  const rows = syntheticRows(250);
  const fullState = syntheticFullState(250, { rows });
  const harness = await createValidCheckpoint({ rows });
  const payloads = largeStagePayloads(harness, fullState);
  harness.internals.writeStored(harness.internals.baselineKey, payloads.baseline);
  const p4 = harness.internals.saveStage('P4', payloads.p4);
  const p8 = harness.internals.saveStage('P8', payloads.p8);
  const baselineChars = harness.sessionStorage.getItem(harness.internals.baselineKey).length;
  const p4Chars = harness.sessionStorage.getItem(harness.internals.stageStorageKey('P4')).length;
  const p8Chars = harness.sessionStorage.getItem(harness.internals.stageStorageKey('P8')).length;
  Object.assign(largeStageEvidence, { baseline250Chars: baselineChars, p4_250Chars: p4Chars, p8_250Chars: p8Chars });
  assert.equal(payloads.baseline.perTurn.length, 250);
  assert.equal(p4.ok, true);
  assert.equal(p8.ok, true);
  assert.ok(Math.max(baselineChars, p4Chars, p8Chars) < 300000);
});

test('failure-heavy 250-turn P8 retains totals and bounded row evidence', async () => {
  const baselineRows = syntheticRows(250);
  const currentRows = baselineRows.map((row) => rollbackRow(row.turnNo, {
    qId: `${row.qId}-changed`,
    primaryAId: `${row.primaryAId}-changed`,
    currentAnswerIds: [`${row.primaryAId}-changed`],
    questionResolverAliases: [`${row.qId}-changed`],
    answerResolverAliases: [`${row.primaryAId}-changed`],
    resolverAliases: [`${row.qId}-changed`, `${row.primaryAId}-changed`],
    answerCurrentShells: [],
  }));
  const evaluation = evaluateRollback(rollbackState(baselineRows), rollbackState(currentRows));
  const harness = await createValidCheckpoint({ rows: currentRows });
  const stateValue = syntheticFullState(250, { rows: currentRows });
  const payload = {
    ...largeStagePayloads(harness, stateValue).p8,
    ok: false,
    rollbackEquivalence: harness.internals.summarizeRollbackEquivalence(evaluation),
  };
  const saved = harness.internals.saveStage('P8', payload);
  const persisted = harness.internals.readStored(harness.internals.stageStorageKey('P8'));
  assert.equal(saved.evidenceDegraded, false);
  assert.equal(persisted.rollbackEquivalence.trueFailingRowCount, 250);
  assert.equal(persisted.rollbackEquivalence.failingRows.length, 24);
  assert.ok(persisted.rollbackEquivalence.passingSampleRows.length <= 3);
  assert.ok(harness.sessionStorage.getItem(harness.internals.stageStorageKey('P8')).length < 900000);
});

test('oversized P2 preflight refuses before any source setter call', async () => {
  const rows = syntheticRows(83);
  const harness = createHarnessContext({ rows, allowSourceSetter: true });
  assert.equal((await harness.api.P0()).ok, true);
  assert.equal((await harness.api.P1()).ok, true);
  saturateCheckpoint(harness);
  const result = await harness.api.P2();
  assert.equal(result.ok, false);
  assert.equal(result.switched, false);
  assert.equal(result.failureReasons.includes('evidence-capacity-preflight-failed'), true);
  assert.equal(harness.runtimeControl.allowedSetter.calls, 0);
  assert.equal(harness.runtimeControl.activeSource, 'legacy-durable-cache');
});

test('P4_ARM refuses oversized projection and does not authorize movement', async () => {
  const harness = await prepareLedgerHarness(83);
  const setterCallsBefore = harness.runtimeControl.allowedSetter.calls;
  saturateCheckpoint(harness);
  const result = await harness.api.P4_ARM();
  assert.equal(result.ok, false);
  assert.equal(result.manualActionAuthorized, false);
  assert.equal(result.failureReasons.includes('evidence-capacity-preflight-failed'), true);
  assert.equal(harness.runtimeControl.allowedSetter.calls, setterCallsBefore);
});

test('P5_ARM, P6_ARM, and P7_ARM refuse oversized projections without authorizing mutations', async () => {
  for (const stage of ['P5_ARM', 'P6_ARM', 'P7_ARM']) {
    const harness = await prepareLedgerHarness(83);
    if (stage === 'P6_ARM') {
      harness.internals.writeStored(harness.internals.stageStorageKey('P5'), {
        stage: 'P5', evidenceSchema: 5, ok: true,
      });
    }
    const setterCallsBefore = harness.runtimeControl.allowedSetter.calls;
    saturateCheckpoint(harness);
    const result = await harness.api[stage]();
    assert.equal(result.ok, false, `${stage} unexpectedly passed`);
    assert.equal(result.manualActionAuthorized, false, `${stage} authorized manual work`);
    assert.equal(result.failureReasons.includes('evidence-capacity-preflight-failed'), true);
    assert.equal(harness.runtimeControl.allowedSetter.calls, setterCallsBefore);
    assert.equal(harness.runtimeControl.activeSource, 'chat-atlas-ledger');
  }
});

test('P8 forced degradation rolls back once, persists only degraded evidence, and makes P10 incomplete', async () => {
  const harness = await prepareLedgerHarness(30);
  const hugeAlias = `fixture-huge-alias-${'x'.repeat(210000)}`;
  const hugeRows = syntheticRows(30).map((row, index) => index < 3 ? {
    ...row,
    questionResolverAliases: [row.qId, hugeAlias],
    answerResolverAliases: [row.primaryAId, hugeAlias],
    resolverAliases: [row.qId, row.primaryAId, hugeAlias],
  } : row);
  harness.runtimeControl.setRows(hugeRows);
  const setterCallsBefore = harness.runtimeControl.allowedSetter.calls;
  const sessionWritesBefore = harness.sessionStorage.stats().setItem;
  const result = await harness.api.P8();
  assert.equal(harness.runtimeControl.allowedSetter.calls - setterCallsBefore, 1);
  assert.equal(harness.runtimeControl.activeSource, 'legacy-durable-cache');
  assert.equal(result.evidenceDegraded, true);
  assert.equal(result.degradationReason, 'stage-record-size-limit-exceeded');
  assert.equal(harness.sessionStorage.stats().setItem - sessionWritesBefore, 1);
  const persisted = harness.internals.readStored(harness.internals.stageStorageKey('P8'));
  assert.equal(persisted.evidenceDegraded, true);
  assert.equal(persisted.rollbackOutcome.legacyActive, true);
  assert.equal('rollbackEquivalence' in persisted, false);
  const p10 = await harness.api.P10();
  assert.equal(p10.ok, false);
  assert.equal(p10.canaryVerdict, 'CANARY_INCOMPLETE_EVIDENCE');
  assert.deepEqual(Array.from(p10.evidenceDegradedStages), ['P8']);
  const reloaded = createHarnessContext({
    rows: hugeRows,
    localStorage: harness.localStorage,
    sessionStorage: createStorage(),
  });
  const reloadVerify = await reloaded.api.P8_RELOAD_VERIFY();
  assert.equal(reloadVerify.checkpointRecovery.previousP8Summary.evidenceDegraded, true);
  const reloadP10 = await reloaded.api.P10();
  assert.equal(reloadP10.canaryVerdict, 'CANARY_INCOMPLETE_EVIDENCE');
  assert.equal(reloadP10.evidenceDegradedStages.includes('P8'), true);
});

test('fresh v5 run rejects schema-less and v4 session evidence until CLEANUP', async () => {
  for (const evidence of [{ stage: 'P4', ok: true }, { stage: 'P4', ok: true, evidenceSchema: 4 }]) {
    const sessionStorage = createStorage({ 'h2o:cv3:p4': JSON.stringify(evidence) });
    const harness = createHarnessContext({ rows: syntheticRows(3), sessionStorage });
    const result = await harness.api.P0();
    assert.equal(result.ok, false);
    assert.equal(result.run.reason, 'session-evidence-foreign-schema-cleanup-required');
    assert.equal(harness.api.CLEANUP().ok, true);
  }
});

test('fingerprints are deterministic and change with row content', () => {
  const rows = syntheticRows(3);
  const first = primaryHarness.internals.fingerprintRows(rows);
  const second = primaryHarness.internals.fingerprintRows(rows.map((row) => ({ ...row })));
  const changed = primaryHarness.internals.fingerprintRows(rows.map((row, index) => index === 1 ? { ...row, primaryAId: 'changed' } : row));
  assert.deepEqual(first, second);
  assert.notEqual(first.hash, changed.hash);
  assert.equal(first.count, 3);
  assert.ok(first.serializedChars > 0);
});

test('trimmed baseline preserves alias-equivalent rollback semantics', () => {
  const previous = rollbackRow(1);
  const fullBaseline = syntheticFullState(1, { rows: [previous] });
  const trimmed = primaryHarness.internals.compactBaselineState(fullBaseline);
  const current = rollbackRow(1, {
    qId: 'fixture-question-1-rekeyed',
    primaryAId: 'fixture-answer-1-rekeyed',
    questionResolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed', 'fixture-answer-1', 'fixture-answer-1-rekeyed'],
    answerCurrentShells: [],
  });
  const result = evaluateRollback(trimmed, rollbackState([current]));
  assert.equal(result.ok, true);
  assert.equal(result.perTurnEvidence[0].transition, 'alias-equivalent');
});

test('P3 variant-order comparison remains visible-behavior aware with trimmed baseline', async () => {
  const rows = syntheticRows(8);
  const harness = await prepareLedgerHarness(8, { rows });
  const changed = rows.map((row) => row.turnNo === 5 ? { ...row, answerIds: row.answerIds.slice().reverse() } : row);
  harness.runtimeControl.setRows(changed);
  const result = await harness.api.P3();
  assert.equal(result.ok, true);
  assert.equal(result.rawVariantOrderChanged, true);
  assert.equal(result.rawVariantOrderChangeCount, 1);
  assert.equal(result.visibleVariantBehaviorChanged, false);
});

test('same-chat oldest, middle, and newest movement references pass', () => {
  const sessionStorage = createStorage({ 'h2o:cv3-3:navigation:v1': movementEvidence() });
  const harness = createHarnessContext({ sessionStorage });
  const result = harness.internals.compactMovementEvidenceReferences({ scenarioId: 'CV3.3-S1-fixture' });
  assert.equal(result.ok, true);
  assert.equal(result.movementCoverageComplete, true);
  assert.deepEqual(Array.from(result.snapshotLabels), ['oldest', 'middle', 'newest']);
  assert.equal(result.snapshotReferences.every((row) => row.snapshotId && row.capturedAt), true);
});

test('missing movement region fails closed', () => {
  const sessionStorage = createStorage({ 'h2o:cv3-3:navigation:v1': movementEvidence('CV3.3-S1-fixture', 'fixture-chat-a', ['oldest', 'newest']) });
  const harness = createHarnessContext({ sessionStorage });
  const result = harness.internals.compactMovementEvidenceReferences({ scenarioId: 'CV3.3-S1-fixture' });
  assert.equal(result.ok, false);
  assert.equal(result.missingLabels.includes('middle'), true);
});

test('foreign movement chat and scenario fail closed', () => {
  const foreignChat = createHarnessContext({
    chatKey: 'fixture-chat-b',
    sessionStorage: createStorage({ 'h2o:cv3-3:navigation:v1': movementEvidence('CV3.3-S1-fixture', 'fixture-chat-a') }),
  });
  assert.equal(foreignChat.internals.compactMovementEvidenceReferences().reason, 'movement-helper-foreign-chat');
  const foreignScenario = createHarnessContext({
    sessionStorage: createStorage({ 'h2o:cv3-3:navigation:v1': movementEvidence('CV3.3-S1-other') }),
  });
  assert.equal(
    foreignScenario.internals.compactMovementEvidenceReferences({ scenarioId: 'CV3.3-S1-fixture' }).reason,
    'movement-helper-foreign-scenario',
  );
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

console.log(JSON.stringify({
  ok: failures === 0,
  harnessPath,
  previousTestCount,
  testCount: tests.length,
  addedTestCount: tests.length - previousTestCount,
  failures,
  sourceSetterCalls,
  capacityEvidence,
  largeStageEvidence,
}));

process.exitCode = failures === 0 ? 0 : 1;
