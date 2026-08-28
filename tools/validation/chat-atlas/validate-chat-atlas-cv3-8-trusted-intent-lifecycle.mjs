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
const CORE_SOURCE = H2O_CORE_AGGREGATE_SOURCES
  .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  .join('\n');
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
const Q19 = 'cv38-selected-q-19';
const A19 = 'cv38-selected-a-19';

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
  reconcileTasks: 0,
  newObservers: 0,
  existingUpdateEvents: 0,
  existingLedgerRafs: 0,
  effectivePresentationEmitsWithRequestLease: 0,
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

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

// 0A3a deliberately declares its broker forwards as `const x = (...) => ...`
// rather than function declarations, precisely so they cannot collide with the
// real implementations under a `  function <name>(` scan. Extracting them needs
// its own anchor: a single-statement const-arrow terminated by `;` at depth 0.
function extractBinding(source, name) {
  // Newline-anchored: a plain `  const x = ` is also a substring of a deeper
  // `    const x = `, which would make a module-level binding read as ambiguous.
  const anchor = `\n  const ${name} = `;
  const found = source.indexOf(anchor);
  if (found < 0 || source.indexOf(anchor, found + anchor.length) >= 0) {
    throw new Error(`binding-anchor-invalid:${name}`);
  }
  const start = found + 1;
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  // `anchor` carries the leading newline, so the first character of the
  // initialiser is at found + anchor.length, not start + anchor.length.
  for (let index = found + anchor.length; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') depth -= 1;
    else if (char === ';' && depth === 0) return source.slice(start, index + 1);
    if (depth < 0) throw new Error(`binding-boundary-invalid:${name}`);
  }
  throw new Error(`binding-boundary-invalid:${name}`);
}

// The eleven load-bearing implementations must each exist exactly once across
// the owners, whichever file each now lives in. This runs against the aggregate
// corpus, so a duplicate introduced in ANY owner still fails it.
function assertCoreAnchors(source) {
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
}

// Accepted-parent source only. There the Ledger and the whole central Chat Atlas
// pipeline were still lexically inside 0A1a, so a single program carries both the
// implementation and this fixture surface.
function instrumentCore(source, options = {}) {
  const exportsText = options.exportsText || coreExportsBlock('commitTurnDrafts');
  if (options.assertAnchors !== false) assertCoreAnchors(source);
  const marker = '  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */';
  const close = '\n})();';
  const markerIndex = source.indexOf(marker);
  const closeIndex = source.lastIndexOf(close);
  if (markerIndex < 0 || closeIndex <= markerIndex) throw new Error('core-bootstrap-boundary-invalid');
  return `${source.slice(0, markerIndex)}${exportsText}${CORE_BOOTSTRAP_SUPPRESSED}${close}\n`;
}

const CORE_BOOTSTRAP_SUPPRESSED = '  globalThis.__CV38_CORE_BOOTSTRAP_SUPPRESSED__ = true;\n';

// The fixture-facing surface, shared verbatim by both runtimes so no expectation
// can drift between them. The single parameter is how it reaches H2O Core's
// generic commitTurnDrafts: on the accepted parent that name is in the same
// lexical scope, while on current source this block is evaluated inside 0A3a,
// which has no lexical access to 0A1a and must cross the owner boundary through
// the harness surface each owner publishes for itself.
function coreExportsBlock(commitDrafts) {
  return `
  globalThis.__CV38_CORE__ = Object.freeze({
    configure(rawIndex, identityGraph) {
      chatAtlasClearSelectedPathOverlay('fixture-reset');
      chatAtlasClearSelectedPathAcquisition('fixture-reset', { resetRefetchGuard: true });
      // The Ledger now lives in 0A3b behind the 0A3a broker, so this fixture no
      // longer reaches into its private state. With no Ledger service registered
      // in this sandbox the broker reports exactly what these lines used to set:
      // no members, not ready, version 0. The reset is therefore already true,
      // and the Atlas code under test reads it through the real broker path.
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
      completeTurnIndexAuthorityState.branchExpansionLease = null;
      completeTurnIndexAuthorityState.branchExpansionTimeoutTask = null;
      completeTurnIndexAuthorityState.branchExpansionRetryTask = null;
      completeTurnIndexAuthorityState.branchExpansionFailure = null;
      completeTurnIndexAuthorityState.branchExpansionState = 'idle';
      completeTurnIndexAuthorityState.branchExpansionReason = null;
      completeTurnIndexAuthorityState.branchExpansionAnchorReturned = false;
      completeTurnIndexAuthorityState.branchExpansionPriorCount = 0;
      completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = '';
      completeTurnIndexAuthorityState.branchExpansionTargetCount = 0;
      completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = '';
      completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = Object.freeze([]);
      completeTurnIndexAuthorityState.branchExpansionSequence = 0;
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
      // chatAtlasApplyEvidence lives in 0A3b for current source; the parent-source
      // runtime still has it inline.
      if (globalThis.__CV38_LEDGER__) return globalThis.__CV38_LEDGER__.applyEvidence(read, reason, true);
      return chatAtlasApplyEvidence(read, reason, true);
    },
    publishHostIndex(rawIndex) {
      const normalized = chatAtlasNormalizeCompleteIndexEnvelope(
        rawIndex,
        rawIndex?.chatId,
        { source: 'host' },
      );
      if (!normalized.ok) throw new Error('fixture-index-invalid:' + normalized.errorCode);
      return chatAtlasPublishCompleteIndex(normalized.envelope, 'host-payload');
    },
    evaluate(members = (typeof chatAtlasLedgerState !== 'undefined' ? chatAtlasLedgerState.members : chatAtlasCoreLedgerMembers())) {
      return chatAtlasSelectedPathEvaluate(members);
    },
    overlayEvaluate() {
      return chatAtlasSelectedPathOverlayEvaluate();
    },
    clearOverlay(reason = 'fixture-overlay-republished') {
      return chatAtlasClearSelectedPathOverlay(reason);
    },
    currentIntent(qId) {
      return chatAtlasCurrentTrustedNativeBranchSelection(qId);
    },
    returnExpansionWindow() {
      return chatAtlasPreExpansionCanonicalReturnWindow(
        completeTurnIndexAuthorityState.trustedSelectedPathIntent,
      );
    },
    captureCandidate(context = {}, priorIndex = null) {
      const current = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      return chatAtlasCaptureBranchReturnCandidate({
        token: String(context.token || current?.token || 'fixture-token'),
        qId: String(context.qId || current?.qId || ${JSON.stringify(Q17)}),
        priorAnswerId: String(context.priorAnswerId || ${JSON.stringify(A17_SELECTED)}),
        direction: String(context.direction || 'previous'),
        chatId: String(context.chatId || completeTurnIndexAuthorityState.chatId || ''),
        routeKey: String(context.routeKey || completeTurnIndexAuthorityState.routeKey || ''),
        generation: Number(context.generation || completeTurnIndexAuthorityState.generation || 0),
        staleRevision: Number(context.staleRevision || completeTurnIndexAuthorityState.branchSelectionStaleRevision || 1),
        priorEffectiveCount: Number(context.priorEffectiveCount || priorIndex?.turns?.length || 0),
        priorEffectiveFingerprint: String(context.priorEffectiveFingerprint || priorIndex?.sourceFingerprint || ''),
        priorPresentationSource: String(context.priorPresentationSource || 'retained-selected-path-graph'),
      }, priorIndex || getEffectivePresentationIndex());
    },
    patchRetainedGraph(patch = {}) {
      if (!selectedPathAcquisitionState.graph) return null;
      selectedPathAcquisitionState.graph = Object.freeze({
        ...selectedPathAcquisitionState.graph,
        ...patch,
      });
      return selectedPathAcquisitionState.graph;
    },
    retainAndPublishGraph(identityGraph, source = 'coordinator-graph-acquisition') {
      const retained = chatAtlasRetainIdentityGraph({ ok: true, identityGraph }, {
        chatId: completeTurnIndexAuthorityState.chatId,
        routeKey: completeTurnIndexAuthorityState.routeKey,
        generation: completeTurnIndexAuthorityState.generation,
      });
      return {
        retained,
        publication: retained
          ? chatAtlasTryPublishRetainedBranchTransaction(source)
          : Object.freeze({ handled: false }),
      };
    },
    installOverlay(index) {
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (!intent || !index || !Array.isArray(index.turns)) return null;
      const byQId = new Map(index.turns.map((turn) => [turn.qId, turn]));
      const byAId = new Map();
      for (const turn of index.turns) {
        for (const aId of turn.answerVariants || []) byAId.set(aId, turn);
      }
      return chatAtlasInstallSelectedPathOverlay(Object.freeze({
        ok: true,
        token: intent.token,
        chatId: intent.chatId,
        routeKey: intent.routeKey,
        generation: intent.generation,
        staleRevision: intent.staleRevision,
        canonicalFingerprint: String(completeTurnIndexAuthorityState.index?.sourceFingerprint || ''),
        acquisitionProofIdentity: 'fixture-proof:' + intent.token,
        acquisitionPathIdentity: String(index.sourceFingerprint || ''),
        evaluationKey: 'fixture-overlay:' + intent.token + ':' + index.sourceFingerprint,
        anchorQId: intent.qId,
        activatedAt: new Date().toISOString(),
        pathLength: index.turns.length,
        index,
        byQId,
        byAId,
        proof: Object.freeze({ token: intent.token, staleRevision: intent.staleRevision }),
      }));
    },
    setAutoReconciliation(value) {
      return setCompleteTurnIndexAutoBranchReconciliationCanary(value);
    },
    requestLeaseOwnsIntent() {
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      return !!intent && completeIndexRefreshCoordinator?.selectedPathRequestOwnsIntent?.(intent) === true;
    },
    refreshStatus() {
      return completeIndexRefreshCoordinator?.getStatus?.() || null;
    },
    installClientChainDom(elements) {
      return document.__cv38InstallClientChain(elements);
    },
    readClientChain(graph, selectedAnswerId) {
      return chatAtlasNativeClientSelectedChain(graph, selectedAnswerId);
    },
    clientChainProves(chain, selectedAnswerId) {
      return chatAtlasClientChainProvesAnchor(chain, selectedAnswerId);
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
        expansion: {
          state: completeTurnIndexAuthorityState.branchExpansionState,
          reason: completeTurnIndexAuthorityState.branchExpansionReason,
          lease: completeTurnIndexAuthorityState.branchExpansionLease,
          failure: completeTurnIndexAuthorityState.branchExpansionFailure,
          requiredPageNums: completeTurnIndexAuthorityState.branchExpansionRequiredPageNums,
        },
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
        coreTurns: turnState.turns.slice(),
        ledgerTurns: buildChatAtlasLedgerCanonicalRecords(),
        derivation: typeof getSelectedPathDerivationDiagnostics === 'function'
          ? getSelectedPathDerivationDiagnostics()
          : null,
        canonical: completeTurnIndexAuthorityState.index,
        complete: getCompleteTurnIndexProjectionStatus(),
        trace: completeTurnIndexLifecycleDiagnostics.trace.map((entry) => ({
          event: entry.event,
          reason: entry.reason || '',
          qId: entry.qId || '',
        })),
      };
    },
    patchIntent(patch = {}) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        ...(completeTurnIndexAuthorityState.trustedSelectedPathIntent || {}),
        ...patch,
      });
    },
    evidenceFor(cause, detail = {}) {
      return chatAtlasCompleteIndexSelectedPathEvidence(cause, detail);
    },
    scheduleRefresh(cause, evidence) {
      return chatAtlasScheduleCompleteIndexRefresh(cause, { selectedPathEvidence: evidence });
    },
    publish(index, source = 'fixture-host-refresh') {
      return chatAtlasPublishCompleteIndex(index, source);
    },
    commitForeignDraft(qId = 'cv38-foreign-q-20', aId = 'cv38-foreign-a-20') {
      const effective = getEffectivePresentationIndex();
      const canonicalDrafts = chatAtlasCompleteIndexCanonicalDrafts(effective);
      const foreign = {
        turnNo: canonicalDrafts.length + 1,
        qId,
        primaryAId: aId,
        answerIds: [aId],
        aliasIds: [qId, aId],
        hasQuestion: true,
        hasAssistant: true,
        noAnswer: false,
        stopped: false,
        structure: {
          segmentId: 1,
          flowIdentity: 'cv38-foreign-flow',
          structureKnown: true,
          selectedPathEligible: true,
          pairingContiguous: true,
          currentQuestionProof: true,
          unpairedAssistant: false,
          questionOrdinal: canonicalDrafts.length,
          answerOrdinals: [canonicalDrafts.length + 1],
        },
        live: { qEl: null, primaryAEl: null, answerEls: [], connected: true },
      };
      ${commitDrafts}(canonicalDrafts, canonicalDrafts.concat(foreign));
      return turnState.turns.slice();
    },
    commitPendingForeignDraft(qId = 'cv38-pending-foreign-q-20') {
      const effective = getEffectivePresentationIndex();
      const canonicalDrafts = chatAtlasCompleteIndexCanonicalDrafts(effective);
      const foreign = {
        turnNo: canonicalDrafts.length + 1,
        qId,
        primaryAId: null,
        answerIds: [],
        aliasIds: [qId],
        hasQuestion: true,
        hasAssistant: false,
        noAnswer: true,
        stopped: false,
        structure: {
          segmentId: 1,
          flowIdentity: 'cv38-pending-foreign-flow',
          structureKnown: true,
          selectedPathEligible: true,
          pairingContiguous: true,
          currentQuestionProof: true,
          unpairedAssistant: false,
          questionOrdinal: canonicalDrafts.length,
          answerOrdinals: [],
        },
        live: { qEl: null, primaryAEl: null, answerEls: [], connected: true },
      };
      completeTurnIndexAuthorityState.pendingDrafts.set(qId, foreign);
      const pendingDrafts = chatAtlasCompleteIndexPendingCanonicalDrafts(effective);
      ${commitDrafts}(canonicalDrafts.concat(pendingDrafts), canonicalDrafts.concat(pendingDrafts));
      return turnState.turns.slice();
    },
    suppressesLiveAppend() {
      return chatAtlasBranchTransitionSuppressesLiveAppend();
    },
    forceClearStale(reason = 'fixture-forced-clear') {
      return chatAtlasClearBranchSelectionStale(null, reason, false);
    },
    setPageHeadState(state) {
      const pageState = String(state || 'unavailable');
      H2O.ChatPageTitleIntent = {
        api: {
          resolveNativePageHeadCoherence() {
            return Object.freeze({ state: pageState });
          },
        },
      };
    },
    expansionCheckpoint(allowConfirmation = false, reason = 'cv38-expansion-checkpoint') {
      return chatAtlasCompleteBranchExpansionCheckpoint(reason, { allowConfirmation });
    },
    recheckFailure(reason = 'explicit-refresh-later-confirmation') {
      return chatAtlasRecheckFailedBranchExpansion(reason);
    },
    injectFailure(failure) {
      completeTurnIndexAuthorityState.branchExpansionLease = null;
      completeTurnIndexAuthorityState.branchExpansionFailure = failure;
      completeTurnIndexAuthorityState.branchExpansionState = 'fail-closed';
      completeTurnIndexAuthorityState.branchExpansionReason = String(failure?.reason || 'injected-failure');
      completeTurnIndexAuthorityState.branchExpansionPriorCount = Number(failure?.priorCount || 0);
      completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = String(failure?.priorFingerprint || '');
      completeTurnIndexAuthorityState.branchExpansionTargetCount = Number(failure?.targetCount || 0);
      completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = String(failure?.expectedFingerprint || '');
      completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = Object.freeze(
        Array.from(failure?.requiredPageNums || []),
      );
      return failure;
    },
  });
`;
}


// ── Real 0A3a broker + real 0A3b Ledger, loaded as separate programs ───────
// The Ledger physically left H2O Core, so the current-source runtime loads the
// three real scripts the way production does rather than sharing one lexical
// scope. Evaluating 0A3b is inert — its MutationObserver and rAF only appear
// inside chatAtlasRebindObserver / scheduleChatAtlasLedgerFlush — so this
// validator's side-effect counters stay meaningful. The parent-source runtime
// still has the Ledger inline and is left untouched.
const BROKER_REL = 'src-runtime-base/0A3a.\u2b1b\ufe0f\ud83e\udded Chat Atlas Core \ud83e\udded.js';
const LEDGER_REL = 'src-runtime-base/0A3b.\u2b1b\ufe0f\ud83d\udcd2 Chat Atlas Ledger \ud83d\udcd2.js';
const BROKER_PROGRAM = fs.readFileSync(path.join(ROOT, BROKER_REL), 'utf8');
function instrumentLedger(src = fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8')) {
  const close = '\n})();';
  const closeIndex = src.lastIndexOf(close);
  if (closeIndex < 0) throw new Error('ledger-bootstrap-boundary-invalid');
  if (src.split('  function chatAtlasApplyEvidence(').length - 1 !== 1) {
    throw new Error('ledger-instrumentation-anchor-invalid:chatAtlasApplyEvidence');
  }
  return `${src.slice(0, closeIndex)}
  globalThis.__CV38_LEDGER__ = Object.freeze({
    applyEvidence(read, reason, force) { return chatAtlasApplyEvidence(read, reason, force); },
  });
${close}\n`;
}
const LEDGER_PROGRAM = instrumentLedger();
const LEDGER_SOURCE = fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8');

// Some mutation fixtures target functions that now live in the Ledger. Mutating
// the aggregated H2O Core text would be discarded, because only the H2O Core
// portion is evaluated as the core program, so those mutants are applied to the
// Ledger program instead. The mutation itself is unchanged.
function mutateLedgerFunction(name, mutate) {
  const original = extractFunction(LEDGER_SOURCE, name);
  const replacement = mutate(original);
  if (!replacement || replacement === original) throw new Error(`ledger-mutation-not-applied:${name}`);
  return instrumentLedger(LEDGER_SOURCE.replace(original, replacement));
}
// ── Owner-separated current-source runtime ────────────────────────────────
// The central Chat Atlas pipeline this validator asserts on now lives in 0A3a,
// and 0A1a keeps only the generic turn model. The fixture surface therefore has
// to be evaluated inside 0A3a, where those implementations actually are: the
// aggregate text above stays a SEARCH corpus for the by-name and absence scans,
// and is never evaluated as one scope.
//
// Each owner publishes its own harness surface from inside its own program:
//   0A1a -> __CV38_H2O__   (generic commitTurnDrafts, the one thing 0A1a owns
//                           that the fixtures drive, and which is deliberately
//                           NOT on the production host surface)
//   0A3a -> __CV38_CORE__  (the whole central Chat Atlas fixture surface)
//   0A3b -> __CV38_LEDGER__
// Nothing gains lexical reach it does not have in production: Chat Atlas Core
// still reads generic H2O only through H2O_CHAT_ATLAS_HOST_V1, and the Ledger
// still reaches Core only through the 0A3a service registry.
const H2O_CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8');
const H2O_EXPORTS_BLOCK = `
  globalThis.__CV38_H2O__ = Object.freeze({
    commitTurnDrafts(canonicalDrafts, liveDrafts) {
      return commitTurnDrafts(canonicalDrafts, liveDrafts);
    },
  });
`;

function instrumentH2OCore(src) {
  return instrumentCore(src, { exportsText: H2O_EXPORTS_BLOCK, assertAnchors: false });
}

// 0A3a is evaluated whole — it is already loaded whole today, so this adds no
// boot side effects — with the fixture surface appended inside its outer IIFE.
function instrumentAtlasCore(src) {
  const close = '\n})();';
  const closeIndex = src.lastIndexOf(close);
  if (closeIndex < 0) throw new Error('atlas-bootstrap-boundary-invalid');
  return `${src.slice(0, closeIndex)}
${coreExportsBlock('globalThis.__CV38_H2O__.commitTurnDrafts')}${close}\n`;
}

const CORE_PROGRAM = Object.freeze({
  h2o: instrumentH2OCore(H2O_CORE_SOURCE),
  atlas: instrumentAtlasCore(BROKER_PROGRAM),
});
// The accepted parent predates every extraction, so it stays a single program.
const PARENT_CORE_PROGRAM = instrumentCore(PARENT_CORE_SOURCE);
assertCoreAnchors(CORE_SOURCE);

// A mutation has to be applied to the owner that actually declares the target,
// and that owner's program rebuilt. Applying it to the aggregate text would be
// silently discarded, because the aggregate is never evaluated.
// A name can legitimately appear in two owners: 0A1a keeps a const-arrow FORWARD
// for several Chat Atlas policy reads whose real implementation is in 0A3a. Only
// the function declaration is the implementation, so ownership resolves on that
// and an ambiguity between two real declarations is still an error.
function coreOwnerOf(name) {
  const implements_ = (src) => src.includes(`  function ${name}(`)
    || src.includes(`  async function ${name}(`);
  const h2o = implements_(H2O_CORE_SOURCE);
  const atlas = implements_(BROKER_PROGRAM);
  if (h2o && atlas) throw new Error(`mutation-owner-ambiguous:${name}`);
  if (atlas) return 'atlas';
  if (h2o) return 'h2o';
  throw new Error(`mutation-owner-unresolved:${name}`);
}

function mutateCoreFunction(source, name, mutate) {
  if (source !== CORE_SOURCE) throw new Error(`mutation-source-unexpected:${name}`);
  const owner = coreOwnerOf(name);
  const ownerSource = owner === 'atlas' ? BROKER_PROGRAM : H2O_CORE_SOURCE;
  const original = extractFunction(ownerSource, name);
  const replacement = mutate(original);
  if (!replacement || replacement === original) throw new Error(`mutation-not-applied:${name}`);
  const mutated = ownerSource.replace(original, replacement);
  return owner === 'atlas'
    ? Object.freeze({ ...CORE_PROGRAM, atlas: instrumentAtlasCore(mutated) })
    : Object.freeze({ ...CORE_PROGRAM, h2o: instrumentH2OCore(mutated) });
}

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

function canonicalIndex(count = 39) {
  const turns = Object.freeze(canonicalRows().slice(0, Math.max(0, Number(count || 0))));
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

function hostIndexFromTurns(turnsRaw, chatId = CHAT_ID) {
  const turns = Object.freeze(Array.from(turnsRaw || []));
  return Object.freeze({
    schema: 1,
    chatId,
    payloadUpdateTime: 1785250002,
    sourceFingerprint: fingerprint(turns),
    capturedAt: '2026-08-03T00:00:00.000Z',
    completeness: Object.freeze({
      complete: true,
      proof: 'host-payload-full-graph',
      validatedAt: '2026-08-03T00:00:00.000Z',
    }),
    turns,
  });
}

function selectedOverlayIndex(count = 19) {
  const selectedCount = Math.max(0, Number(count || 0));
  const turns = canonicalRows().slice(0, selectedCount).map((turn, index) => {
    const order = index + 1;
    if (order === 17) {
      return Object.freeze({
        ...turn,
        primaryAId: A17_SELECTED,
        answerVariants: Object.freeze([A17_CANONICAL, A17_SELECTED]),
      });
    }
    if (order === 18) {
      return Object.freeze({
        order,
        qId: Q18,
        turnId: `turn:${Q18}`,
        primaryAId: A18,
        answerVariants: Object.freeze([A18]),
        noAnswer: false,
        stopped: false,
      });
    }
    if (order === 19) {
      return Object.freeze({
        order,
        qId: Q19,
        turnId: `turn:${Q19}`,
        primaryAId: A19,
        answerVariants: Object.freeze([A19]),
        noAnswer: false,
        stopped: false,
      });
    }
    return turn;
  });
  const frozenTurns = Object.freeze(turns);
  return Object.freeze({
    schema: 1,
    complete: true,
    proof: 'selected-path-overlay',
    chatId: CHAT_ID,
    payloadUpdateTime: 1785250001,
    sourceFingerprint: fingerprint(frozenTurns),
    capturedAt: '2026-07-28T00:00:01.000Z',
    completeness: Object.freeze({
      complete: true,
      proof: 'selected-path-overlay',
      validatedAt: '2026-07-28T00:00:01.000Z',
    }),
    turns: frozenTurns,
  });
}

function selectedHostIndex(count = 19) {
  const selected = selectedOverlayIndex(count);
  return Object.freeze({
    schema: selected.schema,
    chatId: selected.chatId,
    payloadUpdateTime: selected.payloadUpdateTime,
    sourceFingerprint: selected.sourceFingerprint,
    capturedAt: selected.capturedAt,
    completeness: Object.freeze({
      complete: true,
      proof: 'host-payload-full-graph',
      validatedAt: selected.capturedAt,
    }),
    turns: selected.turns,
  });
}

function selectedPriorWithAnchorVariants(answerVariants, primaryAId = A17_SELECTED) {
  const base = selectedHostIndex(19);
  const turns = Object.freeze(base.turns.map((turn) => turn.qId === Q17
    ? Object.freeze({
      ...turn,
      primaryAId,
      answerVariants: Object.freeze(Array.from(answerVariants || [])),
    })
    : turn));
  return Object.freeze({
    ...base,
    sourceFingerprint: fingerprint(turns),
    turns,
  });
}

function identityGraph(canonicalTargetCount = 39, { selectedCount = 18, noAnswerAt = 0 } = {}) {
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
      branchShellAlias: false,
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
  for (let order = 18; order <= canonicalTargetCount; order += 1) {
    const qId = `canonical-q-${order}`;
    const aId = `canonical-a-${order}`;
    add(qId, 'user', canonicalParent);
    if (order === noAnswerAt) {
      // Live shape: an unanswered mid-turn — the generation produced only a
      // non-product node, and the branch continues beneath it.
      add(`canonical-noanswer-${order}`, 'tool', qId);
      canonicalParent = `canonical-noanswer-${order}`;
      continue;
    }
    add(aId, 'assistant', qId);
    canonicalParent = aId;
  }
  add('branch-2-tool-17', 'tool', A17_SELECTED);
  add(Q18, 'user', 'branch-2-tool-17');
  add('branch-2-system-18', 'system', Q18);
  add(A18, 'assistant', 'branch-2-system-18');
  if (selectedCount >= 19) {
    add(Q19, 'user', A18);
    add(A19, 'assistant', Q19);
  }
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

const LIVE_Q20 = '7e60a524-96df-462c-a6c0-647ed1a9973c';
const LIVE_Q26 = 'dd431d44-a11f-4bf9-b6d0-84e61e4c4237';
const LIVE_A26 = '5cc611a6-3863-45df-9523-e72dcb2a753b';
const LIVE_Q27 = '6c60b4aa-08b3-418c-b4e5-89d43ffa6f74';
const LIVE_A27 = '82c1038f-6944-4e2a-aaff-5570a5098850';
const LIVE_Q39 = 'b2f9f77a-d2ae-448a-aa66-9b04918d120c';
const LIVE_A39 = '8833c25d-fe71-4105-bfeb-c61317ec273f';
const LIVE_FORK_Q = '01e8bbdc-fcc2-4cce-8a1d-a56e3951a734';
const LIVE_FORK_SHORT_Q = 'de3883e7-dac9-4422-ba46-090082a1e808';
const LIVE_FORK_SHORT_LEAF_A = 'b01fc97b-ccf3-4015-8742-9b846740ffea';
const LIVE_FORK_SHORT_LEAF_B = '11fe475b-01da-47fc-a8de-2ca19583b16e';
const LIVE_Q26_PRODUCT_FINAL = 'c0445917-ade3-47dc-98fe-295082cd8dfb';
const LIVE_SHORT_Q26 = '1d6e9676-4431-4325-b166-ee0484924005';
const LIVE_SHORT_A26 = 'd717ba7e-f26b-4a8c-80ee-8a961ff781a7';
const LIVE_SECOND_Q26 = 'ef6cf7af-a528-41e4-ba7a-f7a8d083921c';
const LIVE_LONG_Q_IDS = Object.freeze([
  LIVE_Q26,
  LIVE_Q27,
  '0c96635c-bd95-4160-a059-fabdf62cfc6a',
  'd8c3ca7d-b0d3-4c1b-9352-0b73b00134e1',
  '1dd3ef01-125b-4827-9519-baea68468432',
  '6a9df10d-ce1b-4059-9686-3a33eaf7ba4d',
  'ed7d17a2-ba68-4fe9-af81-2ea90b3c7ff3',
  'd7632e09-396e-444c-9ffd-c4c37786cb28',
  '01e8bbdc-fcc2-4cce-8a1d-a56e3951a734',
  '5068a46e-9a79-4533-a11f-2f96e4c49f4f',
  'd82467fb-21a4-41a4-b46d-446bf54a47ec',
  '82fb4d81-6f44-453c-8ccd-90582adf8c90',
  'c64afed8-cfde-4644-b0df-3407313c4c54',
  LIVE_Q39,
]);
const LIVE_LONG_A_IDS = Object.freeze([
  LIVE_A26,
  LIVE_A27,
  'fec6b0b9-8576-45d0-9849-8b09e70d9a5b',
  '9de5eca9-a67e-4fac-8293-31b0d030ca93',
  '4facc13a-1085-419f-9148-1cee2e235e28',
  '52c998c5-6ebb-422d-afef-6aeecfcd0ec0',
  '1f74ecea-0cd0-434c-bdde-78941b981b69',
  'da4d682f-83e5-41ac-b30c-5ed9181e4adc',
  '377a87ec-2c17-4e9d-a047-987bc3a41165',
  'c1a937a4-8789-44e2-ae45-44a8f6ea4420',
  '733fa31a-7d11-4ce5-b570-8ffa474670d4',
  '381b68ff-e6cd-449d-a323-45d5d9b0a60b',
  null,
  LIVE_A39,
]);

function stage2mIdentityGraph() {
  const source = identityGraph(39, { selectedCount: 19, noAnswerAt: 20 });
  const rename = new Map([['canonical-q-20', LIVE_Q20]]);
  for (let offset = 0; offset < LIVE_LONG_Q_IDS.length; offset += 1) {
    const order = offset + 26;
    rename.set(`canonical-q-${order}`, LIVE_LONG_Q_IDS[offset]);
    if (LIVE_LONG_A_IDS[offset]) rename.set(`canonical-a-${order}`, LIVE_LONG_A_IDS[offset]);
  }
  const nodes = source.nodes.map((node) => ({
    ...node,
    nodeId: rename.get(node.nodeId) || node.nodeId,
    messageId: rename.get(node.messageId) || node.messageId,
    parentId: rename.get(node.parentId) || node.parentId,
    childIds: node.childIds.map((childId) => rename.get(childId) || childId),
  }));
  const a25 = nodes.find((node) => node.nodeId === 'canonical-a-25');
  const q26 = nodes.find((node) => node.nodeId === LIVE_Q26);
  const a26Alias = nodes.find((node) => node.nodeId === LIVE_A26);
  const q27 = nodes.find((node) => node.nodeId === LIVE_Q27);
  const q38 = nodes.find((node) => node.nodeId === LIVE_LONG_Q_IDS[12]);
  const removedA38 = nodes.find((node) => node.nodeId === 'canonical-a-38');
  const q39 = nodes.find((node) => node.nodeId === LIVE_Q39);
  const forkAnswer = nodes.find((node) => node.nodeId === LIVE_LONG_A_IDS[8]);

  // Exact live topology at the first post-25 break: three user edit children.
  // The mounted 1/3 child is terminal; the third qId owns the complete hidden
  // Page-2 branch. Mounted evidence must not turn the first leaf into authority.
  a25.childIds = [LIVE_SHORT_Q26, LIVE_SECOND_Q26, LIVE_Q26];
  nodes.push({
    nodeId: LIVE_SHORT_Q26,
    parentId: a25.nodeId,
    childIds: [LIVE_SHORT_A26],
    role: 'user',
    messageId: LIVE_SHORT_Q26,
    productUser: true,
    productAnswer: false,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: LIVE_SHORT_A26,
    parentId: LIVE_SHORT_Q26,
    childIds: [],
    role: 'assistant',
    messageId: LIVE_SHORT_A26,
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: LIVE_SECOND_Q26,
    parentId: a25.nodeId,
    childIds: ['stage2m-second-a-26'],
    role: 'user',
    messageId: LIVE_SECOND_Q26,
    productUser: true,
    productAnswer: false,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: 'stage2m-second-a-26',
    parentId: LIVE_SECOND_Q26,
    childIds: ['stage2m-second-q-27'],
    role: 'assistant',
    messageId: 'stage2m-second-a-26',
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: 'stage2m-second-q-27',
    parentId: 'stage2m-second-a-26',
    childIds: ['stage2m-second-a-27'],
    role: 'user',
    messageId: 'stage2m-second-q-27',
    productUser: true,
    productAnswer: false,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: 'stage2m-second-a-27',
    parentId: 'stage2m-second-q-27',
    childIds: [],
    role: 'assistant',
    messageId: 'stage2m-second-a-27',
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  });

  // The accepted Page-2 qId uses a host-owned structural answer shell as its
  // selected primary and a product final beneath it. The shell is preserved
  // as identity; neither node becomes an extra turn.
  a26Alias.role = 'system';
  a26Alias.productAnswer = false;
  a26Alias.branchShellAlias = true;
  a26Alias.childIds = [LIVE_Q26_PRODUCT_FINAL];
  nodes.push({
    nodeId: LIVE_Q26_PRODUCT_FINAL,
    parentId: LIVE_A26,
    childIds: [LIVE_Q27],
    role: 'assistant',
    messageId: LIVE_Q26_PRODUCT_FINAL,
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  });
  q27.parentId = LIVE_Q26_PRODUCT_FINAL;

  // Exact Stage 2C-2n live fork after order 34. The first continuation has
  // two distinct terminal-complete two-turn edits; the second continuation
  // is the unique five-turn route through the real Turn 39 leaf. The old
  // resolver rejected the whole fork because the shorter candidate was
  // internally ambiguous before comparing the global terminal maximum.
  forkAnswer.childIds = [LIVE_FORK_SHORT_Q, LIVE_LONG_Q_IDS[9]];
  nodes.push({
    nodeId: LIVE_FORK_SHORT_Q,
    parentId: forkAnswer.nodeId,
    childIds: ['stage2n-short-a-35'],
    role: 'user',
    messageId: LIVE_FORK_SHORT_Q,
    productUser: true,
    productAnswer: false,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: 'stage2n-short-a-35',
    parentId: LIVE_FORK_SHORT_Q,
    childIds: ['stage2n-short-q-36-a', 'stage2n-short-q-36-b'],
    role: 'assistant',
    messageId: 'stage2n-short-a-35',
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: 'stage2n-short-q-36-a',
    parentId: 'stage2n-short-a-35',
    childIds: [LIVE_FORK_SHORT_LEAF_A],
    role: 'user',
    messageId: 'stage2n-short-q-36-a',
    productUser: true,
    productAnswer: false,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: LIVE_FORK_SHORT_LEAF_A,
    parentId: 'stage2n-short-q-36-a',
    childIds: [],
    role: 'assistant',
    messageId: LIVE_FORK_SHORT_LEAF_A,
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: 'stage2n-short-q-36-b',
    parentId: 'stage2n-short-a-35',
    childIds: [LIVE_FORK_SHORT_LEAF_B],
    role: 'user',
    messageId: 'stage2n-short-q-36-b',
    productUser: true,
    productAnswer: false,
    branchShellAlias: false,
    stopped: false,
  }, {
    nodeId: LIVE_FORK_SHORT_LEAF_B,
    parentId: 'stage2n-short-q-36-b',
    childIds: [],
    role: 'assistant',
    messageId: LIVE_FORK_SHORT_LEAF_B,
    productUser: false,
    productAnswer: true,
    branchShellAlias: false,
    stopped: false,
  });

  // The real terminal route contains a legitimate unanswered row immediately
  // before order 39. Structural continuity, not strict alternation, proves it.
  q38.childIds = [LIVE_Q39];
  q39.parentId = q38.nodeId;
  const removedIndex = nodes.indexOf(removedA38);
  if (removedIndex >= 0) nodes.splice(removedIndex, 1);
  // Preserve the live normalized graph's 115-node bounded shape. These
  // unrelated structural nodes are outside the selected-answer subtree and
  // therefore cannot participate in route ranking.
  let unrelatedParent = 'root-system';
  while (nodes.length < 115) {
    const nodeId = `stage2n-unrelated-structural-${nodes.length}`;
    const parentNode = nodes.find((node) => node.nodeId === unrelatedParent);
    parentNode.childIds.push(nodeId);
    nodes.push({
      nodeId,
      parentId: unrelatedParent,
      childIds: [],
      role: nodes.length % 2 ? 'tool' : 'system',
      messageId: nodeId,
      productUser: false,
      productAnswer: false,
      branchShellAlias: false,
      stopped: false,
    });
    unrelatedParent = nodeId;
  }
  const frozenNodes = Object.freeze(nodes.map((node) => Object.freeze({
    ...node,
    branchShellAlias: node.branchShellAlias === true,
    childIds: Object.freeze(node.childIds.slice()),
  })));
  return Object.freeze({
    ...source,
    // The payload current_node stays on the outgoing 19-turn branch. It is
    // explicitly outside the selected answer subtree and cannot choose q26.
    currentNode: A19,
    nodeCount: frozenNodes.length,
    nodes: frozenNodes,
  });
}

// The same Stage-2m topology with current_node moved onto the selected route.
// stage2mIdentityGraph() is deliberately PRE-CLICK (current_node = A19, the
// outgoing 19-turn chain) and cannot prove the selected downstream forks; this
// is its post-click counterpart, used for the refreshed-graph phase. Only
// current_node differs — no node is added, removed or re-parented.
//
// LIVE_A39 is the selected route's terminal: LIVE_LONG_A_IDS[12] is null, so
// order 38 is the legitimate unanswered row and canonical-a-38 is spliced out,
// while LIVE_LONG_A_IDS[13] = LIVE_A39 survives under LIVE_Q39 (q38 -> LIVE_Q39
// -> LIVE_A39).
function stage2mPostClickGraph() {
  const source = stage2mIdentityGraph();
  return Object.freeze({
    ...source,
    currentNode: LIVE_A39,
  });
}

function stage2mAmbiguousGraph() {
  const source = stage2mIdentityGraph();
  const nodes = source.nodes.map((node) => ({
    ...node,
    childIds: node.childIds.slice(),
  }));
  const a25 = nodes.find((node) => node.nodeId === 'canonical-a-25');
  const root = nodes.find((node) => node.nodeId === LIVE_Q26);
  const descendants = nodes.filter((node) => {
    let cursor = node;
    const seen = new Set();
    while (cursor && !seen.has(cursor.nodeId)) {
      if (cursor.nodeId === root.nodeId) return true;
      seen.add(cursor.nodeId);
      cursor = nodes.find((candidate) => candidate.nodeId === cursor.parentId);
    }
    return false;
  });
  const remap = new Map(descendants.map((node) => [node.nodeId, `stage2m-tie-${node.nodeId}`]));
  for (const node of descendants) {
    nodes.push({
      ...node,
      nodeId: remap.get(node.nodeId),
      messageId: `stage2m-tie-${node.messageId}`,
      parentId: node.nodeId === root.nodeId ? a25.nodeId : remap.get(node.parentId),
      childIds: node.childIds.map((childId) => remap.get(childId)),
    });
  }
  a25.childIds.push(remap.get(root.nodeId));
  const frozenNodes = Object.freeze(nodes.map((node) => Object.freeze({
    ...node,
    childIds: Object.freeze(node.childIds.slice()),
  })));
  return Object.freeze({ ...source, nodeCount: frozenNodes.length, nodes: frozenNodes });
}

// Case C shape. current_node PROVES the selected anchor -- it sits inside the
// A17_SELECTED subtree -- but stops ABOVE the tie at canonical-a-25, so
// containment cannot elect either equal route. That is REAL ambiguity, not
// pre-click evidence, so it must still fail closed with no refresh handoff.
function stage2mAmbiguousProvenGraph() {
  const source = stage2mAmbiguousGraph();
  return Object.freeze({ ...source, currentNode: 'canonical-a-25' });
}

// Post-click counterpart of stage2mAmbiguousGraph(). The graph keeps BOTH
// equal terminal-complete routes — the original LIVE_Q26 subtree ending at
// LIVE_A39, and its `stage2m-tie-` clone ending at `stage2m-tie-<LIVE_A39>`.
// Only current_node moves, onto route A's terminal, so publication is
// permitted at all; the two-route ambiguity the fixture depends on is
// untouched, and production must still fail closed on it.
function stage2mPostClickAmbiguousGraph() {
  const source = stage2mAmbiguousGraph();
  return Object.freeze({ ...source, currentNode: LIVE_A39 });
}

function stage2mLongTurns() {
  return Object.freeze(Array.from({ length: 39 }, (_value, index) => {
    const order = index + 1;
    const page2Index = order - 26;
    const qId = order === 17
      ? Q17
      : (order === 20
        ? LIVE_Q20
        : (page2Index >= 0 ? LIVE_LONG_Q_IDS[page2Index] : `canonical-q-${order}`));
    const primaryAId = order === 17
      ? A17_CANONICAL
      : (order === 20
        ? null
        : (page2Index >= 0 ? LIVE_LONG_A_IDS[page2Index] : `canonical-a-${order}`));
    return Object.freeze({
      order,
      qId,
      turnId: `turn:${qId}`,
      primaryAId,
      answerVariants: Object.freeze(order === 17
        ? [A17_SELECTED, A17_CANONICAL]
        : (order === 26
          ? [LIVE_Q26_PRODUCT_FINAL, LIVE_A26]
          : (primaryAId ? [primaryAId] : []))),
      noAnswer: order === 20 || order === 38,
      stopped: false,
    });
  }));
}

function stage2mPrefixIndex() {
  return hostIndexFromTurns(stage2mLongTurns().slice(0, 26));
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

function selectedPathRead({ canonical = false, count = canonical ? 39 : 18 } = {}) {
  const flowRef = { id: 'cv38-flow' };
  const rows = [];
  let shellIndex = 0;
  for (let order = 1; order <= count; order += 1) {
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

function createRuntime(program = CORE_PROGRAM, ledgerProgram = LEDGER_PROGRAM) {
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
    reconcileTasks: 0,
    newObservers: 0,
    existingUpdateEvents: 0,
    existingLedgerRafs: 0,
    effectivePresentationEmitsWithRequestLease: 0,
  };
  let apiRef = null;
  let now = 1_000_000;
  let rafSequence = 0;
  const timers = [];
  const zeroTasks = [];
  let timerSequence = 0;
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
  const clientChainDom = { elements: [] };
  const document = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const text = String(selector || '');
      if (text.includes('data-message-id') || text.includes('data-conversation-screenshot-content')) {
        return clientChainDom.elements;
      }
      return [];
    },
    // Bridge: the fixture api is injected into the Core source and evaluated
    // inside the vm, so it cannot close over this module's scope. The shared
    // document object is the one thing both sides already hold.
    __cv38InstallClientChain(elements) {
      clientChainDom.elements = Array.isArray(elements) ? elements : [];
      return clientChainDom.elements.length;
    },
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
    setTimeout(fn, delay) {
      const normalizedDelay = Number(delay || 0);
      // The user-driven trusted branch click schedules exactly one bounded
      // zero-delay reconcile task; production fires it on the next macrotask.
      // Track it apart from general timers so timer-budget assertions pin
      // forbidden background work, not the sanctioned capture-driven task.
      // (The only other zero-delay setTimeout in scope is the ledger rAF
      // fallback, unreachable here because this harness supplies rAF.)
      if (normalizedDelay === 0) {
        counters.reconcileTasks += 1;
        const task = { id: ++timerSequence, fn, delay: 0, cleared: false, reconcile: true };
        zeroTasks.push(task);
        return task.id;
      }
      counters.generalTimers += 1;
      const entry = { id: ++timerSequence, fn, delay: normalizedDelay, cleared: false };
      timers.push(entry);
      return entry.id;
    },
    clearTimeout(id) {
      const entry = timers.find((item) => item.id === id)
        || zeroTasks.find((item) => item.id === id);
      if (entry) entry.cleared = true;
    },
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
    dispatchEvent(event) {
      counters.existingUpdateEvents += 1;
      if (
        event?.detail?.reason === 'effective-presentation'
        && apiRef?.snapshot?.().complete?.selectedPathRequestLeaseActive === true
      ) counters.effectivePresentationEmitsWithRequestLease += 1;
      return true;
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  // Current source is three owner programs in production's own loader order:
  // 0A1a H2O Core, then 0A3a Chat Atlas Core, then 0A3b Chat Atlas Ledger. Each
  // is its own scope, exactly as the page loads them. The accepted-parent source
  // predates the extractions and is still a single program.
  if (typeof program === 'string') {
    vm.runInContext(program, context, { filename: CORE_PATH, timeout: 8_000 });
  } else {
    vm.runInContext(program.h2o, context, { filename: CORE_PATH, timeout: 8_000 });
    vm.runInContext(program.atlas, context, { filename: BROKER_REL, timeout: 8_000 });
    vm.runInContext(ledgerProgram, context, { filename: LEDGER_REL, timeout: 8_000 });
  }
  equal(context.__CV38_CORE_BOOTSTRAP_SUPPRESSED__, true, 'Core boot effects are suppressed');
  for (const key of Object.keys(counters)) counters[key] = 0;
  const api = context.__CV38_CORE__;
  apiRef = api;
  api.configure(canonicalIndex(), identityGraph());
  for (const key of Object.keys(counters)) counters[key] = 0;
  return {
    api,
    counters,
    advance(ms) { now += Number(ms || 0); },
    activeTimers() { return timers.filter((entry) => !entry.cleared); },
    pendingReconcileTasks() { return zeroTasks.filter((entry) => !entry.cleared); },
    async fireReconcile() {
      const entry = zeroTasks.find((item) => !item.cleared);
      if (!entry) throw new Error('reconcile-task-unavailable');
      entry.cleared = true;
      entry.fn();
      await Promise.resolve();
      await Promise.resolve();
      return entry;
    },
    async fireDelay(delay) {
      const pool = Number(delay) === 0 ? zeroTasks : timers;
      const entry = pool.find((item) => !item.cleared && item.delay === Number(delay));
      if (!entry) throw new Error(`timer-unavailable:${delay}`);
      entry.cleared = true;
      now += Number(delay || 0);
      entry.fn();
      await Promise.resolve();
      await Promise.resolve();
      return entry;
    },
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

function preparePreExpansionReturn(runtime, {
  graphTargetCount = 39,
  overlayCount = 19,
  departureTime = 590,
  returnTime = 591,
} = {}) {
  runtime.api.configure(
    selectedHostIndex(overlayCount),
    identityGraph(graphTargetCount, { selectedCount: overlayCount }),
  );
  equal(runtime.api.capture(branchEvent({
    direction: 'next',
    timeStamp: departureTime,
    answerIds: [A17_SELECTED],
  })), true, 'selected-path ownership capture succeeds');
  const overlay = selectedOverlayIndex(overlayCount);
  ok(runtime.api.installOverlay(overlay), 'selected overlay is installed through the real producer');
  const installedOverlay = runtime.api.snapshot().effective;
  equal(installedOverlay.turns.length, overlayCount, 'selected overlay owns effective presentation');
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: returnTime,
    answerIds: [A17_SELECTED],
  })), true, 'canonical-return capture succeeds');
  ok(runtime.api.installOverlay(overlay), 'return intent retains the selected overlay until confirmation');
  const snapshot = runtime.api.snapshot();
  equal(snapshot.intent.priorEffectiveCount, overlayCount, 'return capture records selected prior count');
  equal(snapshot.intent.priorEffectiveFingerprint, installedOverlay.sourceFingerprint, 'return capture records selected fingerprint');
  equal(snapshot.intent.returnTargetCandidate.classification, graphTargetCount > overlayCount
    ? 'expanding'
    : 'not-expanding', 'capture freezes the graph-derived direction classification');
  equal(snapshot.overlay.overlayActive, true, 'selected overlay remains current before canonical evidence');
  return Object.freeze({
    overlay: snapshot.effective,
    token: snapshot.intent.token,
    staleRevision: snapshot.intent.staleRevision,
    qId: snapshot.intent.qId,
    candidate: snapshot.intent.returnTargetCandidate,
  });
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

await fixture('owned slow contracting refetch survives intent age and installs the selected overlay', async () => {
  const runtime = createRuntime();
  const graphRefetch = {};
  graphRefetch.promise = new Promise((resolve) => { graphRefetch.resolve = resolve; });
  const confirmationRefresh = {};
  confirmationRefresh.promise = new Promise((resolve) => { confirmationRefresh.resolve = resolve; });
  let coordinatorCalls = 0;
  runtime.api.configure(canonicalIndex(), null);
  runtime.api.setAutoReconciliation(true);
  runtime.api.setProvider((_chatId, options = {}) => {
    if (!options.signal) {
      runtime.counters.boundedGraphRefetchCalls += 1;
      return graphRefetch.promise;
    }
    coordinatorCalls += 1;
    return coordinatorCalls === 1
      ? Promise.resolve({ ok: true, index: canonicalIndex() })
      : confirmationRefresh.promise;
  });
  equal(runtime.api.capture(branchEvent({ timeStamp: 550 })), true, 'real capture owns the contracting selection');
  const token = runtime.api.snapshot().intent.token;
  await runtime.fireDelay(0);
  runtime.api.apply(selectedPathRead(), 'slow-selected-path-remount');
  await runtime.fireDelay(280);
  await settle();
  await runtime.fireDelay(1250);
  runtime.advance(3471);
  equal(runtime.api.refreshStatus().selectedPathRequestLeaseActive, true, 'existing request lease remains active');
  equal(runtime.api.requestLeaseOwnsIntent(), true, 'request lease exactly owns the current intent');
  const storageWritesBeforeAgeRead = runtime.counters.storageWrites;
  equal(runtime.api.currentIntent(Q17)?.token, token, 'owned refetch survives the ordinary age window');
  equal(runtime.counters.storageWrites, storageWritesBeforeAgeRead, 'age protection performs no persistence write');
  const protectedSnapshot = runtime.api.snapshot();
  equal(protectedSnapshot.stale, true, 'branch stale containment remains owned');
  equal(protectedSnapshot.expansion.lease, null, 'contracting acquisition opens no expansion lease');
  equal(
    protectedSnapshot.stale
      && !protectedSnapshot.intent
      && !protectedSnapshot.overlay.overlayActive
      && runtime.api.refreshStatus().selectedPathRequestLeaseActive,
    false,
    'an owned request cannot strand stale state without its matching intent',
  );
  graphRefetch.resolve({ ok: true, identityGraph: identityGraph() });
  await settle();
  const acquired = runtime.api.snapshot();
  equal(
    { status: acquired.acquisition.status, reason: acquired.acquisition.reason },
    { status: 'proven', reason: 'selected-path-proven' },
    'slow graph refetch proves the selected path',
  );
  equal(acquired.overlay.overlayActive, true, 'slow graph refetch installs the selected overlay');
  equal(acquired.effective.turns.length, 18, 'effective presentation becomes the selected 18-turn path');
  equal(acquired.canonical.turns.length, 39, 'canonical authority remains separately 39 turns');
  equal(acquired.stale, true, 'selected overlay retains branch-stale ownership');
  confirmationRefresh.resolve({ ok: true, index: canonicalIndex() });
  await settle();
  const completed = runtime.api.snapshot();
  equal(completed.intent, null, 'existing request completion retires the intent once');
  equal(completed.overlay.overlayActive, true, 'intent cleanup does not discard the proven overlay');
  equal(runtime.activeTimers().length, 0, 'existing request lifecycle cleans every timer');
  equal(runtime.counters.generalTimers, 4, 'only the existing debounce, timeout, confirmation, and timeout timers run');
  equal(runtime.counters.reconcileTasks >= 1, true, 'the capture-driven reconcile task is tracked separately');
  runtime.counters.storageWrites = 0;
  runtime.counters.generalTimers = 0;
  assertSafe(runtime, { refetchCalls: 1 });
});

await fixture('newer real capture cancels old request protection and keeps the late callback inert', async () => {
  const runtime = createRuntime();
  const graphRefetch = {};
  graphRefetch.promise = new Promise((resolve) => { graphRefetch.resolve = resolve; });
  const coordinatorRefresh = {};
  coordinatorRefresh.promise = new Promise((resolve) => { coordinatorRefresh.resolve = resolve; });
  runtime.api.configure(canonicalIndex(), null);
  runtime.api.setAutoReconciliation(true);
  runtime.api.setProvider((_chatId, options = {}) => {
    if (!options.signal) {
      runtime.counters.boundedGraphRefetchCalls += 1;
      return graphRefetch.promise;
    }
    return coordinatorRefresh.promise;
  });
  runtime.api.capture(branchEvent({ timeStamp: 553 }));
  const oldToken = runtime.api.snapshot().intent.token;
  await runtime.fireDelay(0);
  runtime.api.apply(selectedPathRead(), 'superseded-owned-refetch');
  await runtime.fireDelay(280);
  equal(runtime.api.requestLeaseOwnsIntent(), true, 'old refetch initially owns its request lease');
  runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 554,
    answerIds: [A17_SELECTED],
  }));
  const newer = runtime.api.snapshot();
  ok(newer.intent.token !== oldToken, 'newer capture owns a distinct token');
  equal(runtime.api.requestLeaseOwnsIntent(), false, 'old request lease cannot protect the newer intent');
  graphRefetch.resolve({ ok: true, identityGraph: identityGraph() });
  coordinatorRefresh.resolve({ ok: true, index: canonicalIndex() });
  await settle();
  const settled = runtime.api.snapshot();
  equal(settled.intent.token, newer.intent.token, 'late old callbacks cannot clear the newer intent');
  equal(settled.overlay.overlayActive, false, 'late old graph cannot publish an overlay');
  runtime.api.setAutoReconciliation(false);
  runtime.counters.storageWrites = 0;
  runtime.counters.generalTimers = 0;
  assertSafe(runtime, { refetchCalls: 1 });
});

await fixture('inactive or mismatched request ownership does not defeat normal age expiry', async () => {
  const expired = createRuntime();
  const graphRefetch = {};
  graphRefetch.promise = new Promise((resolve) => { graphRefetch.resolve = resolve; });
  const coordinatorRefresh = {};
  coordinatorRefresh.promise = new Promise((resolve) => { coordinatorRefresh.resolve = resolve; });
  expired.api.configure(canonicalIndex(), null);
  expired.api.setAutoReconciliation(true);
  expired.api.setProvider((_chatId, options = {}) => {
    if (!options.signal) {
      expired.counters.boundedGraphRefetchCalls += 1;
      return graphRefetch.promise;
    }
    return coordinatorRefresh.promise;
  });
  expired.api.capture(branchEvent({ timeStamp: 551 }));
  await expired.fireDelay(0);
  expired.api.apply(selectedPathRead(), 'expired-request-remount');
  await expired.fireDelay(280);
  await expired.fireDelay(4500);
  expired.advance(501);
  equal(expired.api.requestLeaseOwnsIntent(), false, 'timed-out request lease is no longer active ownership');
  // Request-lease loss no longer ends the transition: the pending branch
  // transaction owns the intent until publication or the bounded cap.
  ok(expired.api.currentIntent(Q17), 'the pending transaction outlives the request lease');
  expired.advance(90_001);
  equal(expired.api.currentIntent(Q17), null, 'expiry resumes at the transaction cap');
  equal(expired.api.snapshot().acquisition.reason, 'trusted-intent-expired', 'expired request uses the ordinary age reason');
  graphRefetch.resolve({ ok: true, identityGraph: identityGraph() });
  coordinatorRefresh.resolve({ ok: true, index: canonicalIndex() });
  await settle();
  equal(expired.api.snapshot().overlay.overlayActive, false, 'late expired-request result cannot install an overlay');
  expired.counters.generalTimers = 0;
  assertSafe(expired, { refetchCalls: 1 });

  const mismatched = createRuntime();
  const pending = new Promise(() => {});
  mismatched.api.configure(canonicalIndex(), null);
  mismatched.api.setAutoReconciliation(true);
  mismatched.api.setProvider((_chatId, options = {}) => {
    if (!options.signal) mismatched.counters.boundedGraphRefetchCalls += 1;
    return pending;
  });
  mismatched.api.capture(branchEvent({ timeStamp: 552 }));
  await mismatched.fireDelay(0);
  mismatched.api.apply(selectedPathRead(), 'mismatched-request-remount');
  await mismatched.fireDelay(280);
  mismatched.api.patchIntent({ staleRevision: 99 });
  mismatched.advance(5001);
  equal(mismatched.api.requestLeaseOwnsIntent(), false, 'stale-revision mismatch cannot claim request ownership');
  // Token-matched transaction ownership still holds (the revision patch does
  // not forge a different click); expiry resumes at the bounded cap.
  ok(mismatched.api.currentIntent(Q17), 'transaction ownership is keyed to the token, not the request lease');
  mismatched.advance(90_001);
  equal(mismatched.api.currentIntent(Q17), null, 'mismatched request still expires at the transaction cap');
  mismatched.counters.generalTimers = 0;
  assertSafe(mismatched, { refetchCalls: 1 });
});

await fixture('pre-expansion canonical return survives five seconds and hands off to exact native confirmation', () => {
  const runtime = createRuntime();
  const prepared = preparePreExpansionReturn(runtime);
  equal(runtime.api.requestLeaseOwnsIntent(), false, 'pre-expansion interval has no selected-path request owner');
  equal(runtime.api.snapshot().expansion.lease, null, 'pre-expansion interval opens no lease early');
  equal(runtime.api.returnExpansionWindow().active, true, 'strict scoped return-expansion window is recognized');
  runtime.advance(6000);
  equal(runtime.api.currentIntent(Q17)?.token, prepared.token, 'intent survives beyond five seconds inside the bounded return window');
  const protectedState = runtime.api.snapshot();
  equal(protectedState.stale, true, 'stale containment remains owned');
  equal(protectedState.overlay.overlayActive, true, 'selected overlay remains the effective owner');
  equal(protectedState.overlay.count, 19, 'effective presentation remains selected 19 before canonical evidence');
  equal(protectedState.expansion.lease, null, 'age read does not open the expansion lease');
  equal(runtime.activeTimers().length, 0, 'return-window protection creates no timer');
  equal(prepared.candidate.targetVariantAnswerId, A17_CANONICAL, 'capture freezes the direction-neighbor answer');
  equal(prepared.candidate.derivedTargetCount, 39, 'retained graph derives the longer sibling once');

  runtime.api.setPageHeadState('match');
  runtime.api.publishHostIndex(canonicalIndex());
  runtime.api.apply(selectedPathRead({ canonical: true }), 'pre-expansion-canonical-return');
  const handedOff = runtime.api.snapshot();
  equal(handedOff.expansion.state, 'pending', 'canonical evidence opens the real expansion lifecycle');
  equal(handedOff.expansion.lease.token, prepared.token, 'lease ownership receives the exact trusted token');
  equal(handedOff.expansion.requiredPageNums, [2], 'only the newly introduced Page 2 head is required');
  equal(runtime.activeTimers().map((entry) => entry.delay), [8000], 'only the existing bounded lease timeout is scheduled');
  runtime.api.expansionCheckpoint(true, 'explicit-refresh-complete');
  const confirmed = runtime.api.snapshot();
  equal(confirmed.expansion.state, 'confirmed', 'approved checkpoint confirms the expansion');
  equal(confirmed.expansion.failure, null, 'successful handoff leaves no failure');
  equal(confirmed.stale, false, 'native confirmation releases stale containment');
  equal(confirmed.intent, null, 'native confirmation retires trusted intent');
  equal(confirmed.overlay.overlayActive, false, 'selected overlay is released only after confirmation');
  equal(confirmed.effective.turns.length, 39, 'effective authority becomes canonical 39');
  equal(runtime.activeTimers().length, 0, 'confirmation cleans the lease timeout');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

await fixture('pre-expansion expiry publishes keyed containment and later exact recovery is scope-safe', () => {
  const runtime = createRuntime();
  const prepared = preparePreExpansionReturn(runtime, { departureTime: 592, returnTime: 593 });
  runtime.advance(8001);
  equal(runtime.api.currentIntent(Q17), null, 'intent cannot survive beyond the eight-second cap');
  const failed = runtime.api.snapshot();
  equal(failed.expansion.state, 'fail-closed', 'expiry creates fail-closed containment');
  equal(failed.expansion.reason, 'pre-expansion-return-target-unresolved', 'unresolved expiry reason is stable and distinct');
  equal(failed.intent, null, 'expired active intent is cleared safely');
  equal(failed.stale, true, 'stale ownership is not released at expiry');
  equal(failed.overlay.overlayActive, true, 'selected overlay remains safely retained');
  equal(failed.overlay.count, 19, 'retained overlay remains the selected presentation');
  equal(failed.expansion.lease, null, 'expiry opens no retry lease');
  equal(runtime.activeTimers().length, 0, 'expiry schedules no timer');
  equal({
    token: failed.expansion.failure.token,
    qId: failed.expansion.failure.qId,
    staleRevision: failed.expansion.failure.staleRevision,
    priorCount: failed.expansion.failure.priorCount,
    priorFingerprint: failed.expansion.failure.priorFingerprint,
    targetResolved: failed.expansion.failure.targetResolved,
    targetCount: failed.expansion.failure.targetCount,
    expectedFingerprint: failed.expansion.failure.expectedFingerprint,
    requiredPageNums: failed.expansion.failure.requiredPageNums,
    graphCaptureIdentity: failed.expansion.failure.graphCaptureIdentity,
    targetVariantAnswerId: failed.expansion.failure.targetVariantAnswerId,
    graphDerivedTargetCount: failed.expansion.failure.graphDerivedTargetCount,
    retainsSelectedPathOverlay: failed.expansion.failure.retainsSelectedPathOverlay,
  }, {
    token: prepared.token,
    qId: prepared.qId,
    staleRevision: prepared.staleRevision,
    priorCount: 19,
    priorFingerprint: prepared.overlay.sourceFingerprint,
    targetResolved: false,
    targetCount: 0,
    expectedFingerprint: '',
    requiredPageNums: [],
    graphCaptureIdentity: prepared.candidate.graphCaptureIdentity,
    targetVariantAnswerId: A17_CANONICAL,
    graphDerivedTargetCount: 39,
    retainsSelectedPathOverlay: true,
  }, 'failure record retains prior and graph identity without fabricated target data');

  runtime.api.publishHostIndex(canonicalIndex());
  runtime.api.setPageHeadState('match');
  equal(runtime.api.recheckFailure(), true, 'approved later recheck consumes the matching failure');
  const recovered = runtime.api.snapshot();
  equal(recovered.expansion.state, 'confirmed', 'matching native evidence confirms later recovery');
  equal(recovered.expansion.failure, null, 'matching recovery clears containment');
  equal(recovered.stale, false, 'matching recovery releases stale scope');
  equal(recovered.overlay.overlayActive, false, 'matching recovery releases retained overlay');
  equal(recovered.effective.turns.length, 39, 'matching recovery restores canonical effective authority');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

await fixture('return-window scope controls and seven mutations fail closed', () => {
  const equalCount = createRuntime();
  preparePreExpansionReturn(equalCount, { graphTargetCount: 19, overlayCount: 19, departureTime: 594, returnTime: 595 });
  equal(equalCount.api.returnExpansionWindow().active, false, 'equal count gets no return-window extension');
  equalCount.advance(5001);
  equal(equalCount.api.currentIntent(Q17), null, 'equal count follows ordinary age expiry');
  equal(equalCount.api.snapshot().expansion.failure, null, 'equal count creates no expansion failure');

  const contracting = createRuntime();
  preparePreExpansionReturn(contracting, { graphTargetCount: 18, overlayCount: 19, departureTime: 596, returnTime: 597 });
  equal(contracting.api.returnExpansionWindow().active, false, 'smaller canonical count gets no extension');
  contracting.advance(5001);
  equal(contracting.api.currentIntent(Q17), null, 'contracting scope follows ordinary expiry');

  for (const patch of [
    { chatId: 'other-chat' },
    { routeKey: '/c/other-route' },
    { generation: 99 },
    { staleRevision: 99 },
    { qId: 'other-qid' },
  ]) {
    const scoped = createRuntime();
    preparePreExpansionReturn(scoped, { departureTime: 598, returnTime: 599 });
    scoped.api.patchIntent(patch);
    equal(scoped.api.returnExpansionWindow().active, false, `scope mismatch is rejected:${Object.keys(patch)[0]}`);
  }

  const mutants = [
    ['return ownership removed', mutateCoreFunction(CORE_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection', (body) => body.replace(
      'const allowedAgeMs = returnExpansionWindow.active === true',
      'const allowedAgeMs = false',
    )), (runtime) => {
      preparePreExpansionReturn(runtime);
      runtime.advance(6000);
      return runtime.api.currentIntent(Q17)?.token;
    }, (value) => !!value],
    ['eight seconds applied to every intent', mutateCoreFunction(CORE_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection', (body) => body.replace(
      "const allowedAgeMs = returnExpansionWindow.active === true\n      ? CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS\n      : Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000);",
      'const allowedAgeMs = CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS;',
    )), (runtime) => {
      runtime.api.capture(branchEvent({ timeStamp: 610 }));
      runtime.advance(6000);
      return runtime.api.currentIntent(Q17);
    }, (value) => value === null],
    ['eight-second cap removed', mutateCoreFunction(CORE_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection', (body) => body.replace(
      '&& age > allowedAgeMs;',
      '&& false;',
    )), (runtime) => {
      preparePreExpansionReturn(runtime);
      runtime.advance(8001);
      runtime.api.currentIntent(Q17);
      return runtime.api.snapshot().expansion.state;
    }, (value) => value === 'fail-closed'],
    ['scope proof reduced to counts', mutateCoreFunction(CORE_SOURCE, 'chatAtlasPreExpansionCanonicalReturnWindow', (body) => body.replace(
      '&& chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate);',
      '&& Number(candidate?.derivedTargetCount || 0) > priorCount;',
    )), (runtime) => {
      preparePreExpansionReturn(runtime);
      runtime.api.patchIntent({ routeKey: '/c/wrong-scope' });
      return runtime.api.returnExpansionWindow().active;
    }, (value) => value === false],
    ['ownerless expiry restored', mutateCoreFunction(CORE_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection', (body) => body.replace(
      'chatAtlasFailClosedPreExpansionReturn(intent, returnExpansionWindow);',
      "chatAtlasClearBranchSelectionStale(null, 'mutant-ownerless-expiry');",
    )), (runtime) => {
      preparePreExpansionReturn(runtime);
      runtime.advance(8001);
      runtime.api.currentIntent(Q17);
      const state = runtime.api.snapshot();
      return state.stale === true && !!state.expansion.failure && state.overlay.overlayActive === true;
    }, (value) => value === true],
    ['unresolved target fingerprint fabricated', mutateCoreFunction(CORE_SOURCE, 'chatAtlasBranchExpansionFailureRecord', (body) => body.replace(
      ": '',\n      requiredPageNums: targetResolved",
      ": String(scope?.graphDerivedPathIdentity || 'fabricated'),\n      requiredPageNums: targetResolved",
    )), (runtime) => {
      preparePreExpansionReturn(runtime);
      runtime.advance(8001);
      runtime.api.currentIntent(Q17);
      return runtime.api.snapshot().expansion.failure?.expectedFingerprint;
    }, (value) => value === ''],
    ['old failure can clear newer scope', mutateCoreFunction(CORE_SOURCE, 'chatAtlasRecheckFailedBranchExpansion', (body) => body
      .replace(
        /const retainedOverlayScopeCurrent = [\s\S]*?;\n    if \(/,
        'const retainedOverlayScopeCurrent = true;\n    if (',
      )
      .replace(
        /      const validation = chatAtlasRealBranchExpansionTargetValidation\([\s\S]*?      if \(!validation\.ok\) return false;\n/,
        '',
      )), (runtime) => {
      const old = preparePreExpansionReturn(runtime, { departureTime: 620, returnTime: 621 });
      runtime.advance(8001);
      runtime.api.currentIntent(Q17);
      const oldFailure = runtime.api.snapshot().expansion.failure;
      runtime.api.capture(branchEvent({ timeStamp: 622, answerIds: [A17_CANONICAL] }));
      runtime.api.installOverlay(old.overlay);
      runtime.api.injectFailure(oldFailure);
      runtime.api.publishHostIndex(canonicalIndex());
      runtime.api.setPageHeadState('match');
      return runtime.api.recheckFailure();
    }, (value) => value === false],
  ];
  for (const [label, program, execute, productionPredicate] of mutants) {
    const runtime = createRuntime(program);
    ok(!productionPredicate(execute(runtime)), `${label} mutation is killed behaviorally`);
  }
});

await fixture('capture-time graph target is frozen and ambiguous candidates never gain return ownership', () => {
  const runtime = createRuntime();
  runtime.api.configure(selectedHostIndex(19), identityGraph(39, { selectedCount: 19 }));
  const candidate = runtime.api.captureCandidate({}, selectedHostIndex(19));
  equal(candidate.classification, 'expanding', 'real graph derivation classifies the 19-to-39 sibling');
  equal(candidate.targetVariantAnswerId, A17_CANONICAL, 'previous direction freezes the immediate ordered neighbor');
  equal(candidate.derivedTargetCount, 39, 'derived candidate contains the graph path count only');
  ok(candidate.graphCaptureIdentity.startsWith('djb2:'), 'candidate pins the retained graph capture identity');
  ok(candidate.derivedPathIdentity.startsWith('djb2:'), 'candidate pins the ordered identity path');
  ok(Object.isFrozen(candidate) && Object.isFrozen(candidate.derivedPathMembers), 'candidate and identity members are frozen');
  equal('targetFingerprint' in candidate, false, 'capture fabricates no host target fingerprint');

  const unknownDirection = runtime.api.captureCandidate({ direction: 'sideways' }, selectedHostIndex(19));
  equal(unknownDirection.classification, 'invalid', 'unknown direction fails closed');
  equal(unknownDirection.reason, 'capture-direction-invalid', 'unknown direction has a stable reason');
  const priorAbsent = runtime.api.captureCandidate(
    { priorAnswerId: 'missing-prior-answer' },
    selectedPriorWithAnchorVariants([A17_CANONICAL, A17_SELECTED]),
  );
  equal(priorAbsent.reason, 'capture-prior-answer-absent', 'absent prior answer fails closed');
  const noNeighbor = runtime.api.captureCandidate(
    { direction: 'next' },
    selectedPriorWithAnchorVariants([A17_CANONICAL, A17_SELECTED]),
  );
  equal(noNeighbor.reason, 'capture-direction-neighbor-unavailable', 'missing direction neighbor fails closed');
  const malformed = runtime.api.captureCandidate(
    {},
    selectedPriorWithAnchorVariants([A17_CANONICAL, A17_SELECTED, A17_SELECTED]),
  );
  equal(malformed.reason, 'capture-answer-variants-malformed', 'duplicate ordered variants fail closed');
  const unrelated = runtime.api.captureCandidate({ qId: 'unrelated-qid' }, selectedHostIndex(19));
  equal(unrelated.reason, 'capture-anchor-invalid', 'unrelated qId fails closed');

  const graphMismatch = createRuntime();
  graphMismatch.api.configure(selectedHostIndex(19), identityGraph(39, { selectedCount: 19 }));
  graphMismatch.api.patchRetainedGraph({ routeKey: '/c/other-route' });
  equal(
    graphMismatch.api.captureCandidate({}, selectedHostIndex(19)).reason,
    'capture-graph-scope-invalid',
    'retained graph route mismatch fails closed',
  );

  const valueRepublished = createRuntime();
  const prepared = preparePreExpansionReturn(valueRepublished, { departureTime: 630, returnTime: 631 });
  valueRepublished.api.publishHostIndex(selectedHostIndex(19));
  equal(valueRepublished.api.returnExpansionWindow().active, true, 'value-equivalent prior republish does not rely on object identity');
  equal(valueRepublished.api.snapshot().intent.returnTargetCandidate, prepared.candidate, 'republish never recomputes the frozen candidate');
  valueRepublished.advance(6000);
  equal(valueRepublished.api.currentIntent(Q17)?.token, prepared.token, 'frozen candidate still owns only the bounded graph window');
  valueRepublished.counters.generalTimers = 0;
  assertSafe(valueRepublished);
});

await fixture('nine graph-return authority mutations are killed by live-shaped behavior', () => {
  const circularProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasPreExpansionCanonicalReturnWindow', (body) => body.replace(
    '&& chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate);',
    '&& chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate)\n      && chatAtlasCanonicalPresentationIndex()?.turns?.length > priorCount;',
  ));
  const circular = createRuntime(circularProgram);
  preparePreExpansionReturn(circular, { departureTime: 640, returnTime: 641 });
  equal(circular.api.returnExpansionWindow().active, false, 'restored circular host-count requirement is killed');

  const projectedProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasCaptureBranchReturnCandidate', (body) => body.replace(
    'const derivedTargetCount = derivedPathMembers.length;',
    'const derivedTargetCount = 39;',
  ));
  const projected = createRuntime(projectedProgram);
  projected.api.configure(selectedHostIndex(19), identityGraph(18, { selectedCount: 19 }));
  equal(
    projected.api.captureCandidate({}, selectedHostIndex(19)).classification,
    'expanding',
    'fabricated/projected target count mutant is exposed',
  );
  const projectedControl = createRuntime();
  projectedControl.api.configure(selectedHostIndex(19), identityGraph(18, { selectedCount: 19 }));
  equal(projectedControl.api.captureCandidate({}, selectedHostIndex(19)).classification, 'not-expanding', 'production uses derived graph length');

  const scopeProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasGraphReturnCandidateScopeCurrent', (body) => body.replace(
    "&& String(retained?.captureIdentity || '') === String(candidate?.graphCaptureIdentity || '')",
    '&& true',
  ));
  const scopeMutant = createRuntime(scopeProgram);
  preparePreExpansionReturn(scopeMutant, { departureTime: 642, returnTime: 643 });
  scopeMutant.api.patchRetainedGraph({ captureIdentity: 'djb2:foreign-graph' });
  equal(scopeMutant.api.returnExpansionWindow().active, true, 'omitted graph-capture scope mutant is exposed');
  const scopeControl = createRuntime();
  preparePreExpansionReturn(scopeControl, { departureTime: 644, returnTime: 645 });
  scopeControl.api.patchRetainedGraph({ captureIdentity: 'djb2:foreign-graph' });
  equal(scopeControl.api.returnExpansionWindow().active, false, 'production rejects graph-capture drift');

  // Native pager order under Q17 is [A17_CANONICAL, A17_SELECTED] — the raw
  // graph childIds order the host's own pager walks as 1/2, 2/2, and exactly
  // the order the live Turn-17 pager reported. A real native Next therefore
  // departs A17_CANONICAL (the 39-turn canonical branch the user was on) and
  // lands on A17_SELECTED; departing A17_SELECTED has no Next neighbour at
  // all, so anchoring the case there exercised no adjacency the pager can
  // actually perform.
  const directionProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasResolveNativeReturnTarget', (body) => body.replace(
    "const targetIndexValue = priorIndexValue + (direction === 'previous' ? -1 : 1);",
    'const targetIndexValue = priorIndexValue - 1;',
  ));
  const directionPrior = canonicalIndex(39);
  const directionNext = { direction: 'next', priorAnswerId: A17_CANONICAL };
  const directionControl = createRuntime();
  directionControl.api.configure(directionPrior, identityGraph(39, { selectedCount: 19 }));
  const directionResolved = directionControl.api.captureCandidate(directionNext, directionPrior);
  equal(directionResolved.targetVariantAnswerId, A17_SELECTED, 'production honors next direction against native pager order');
  equal(directionResolved.derivedTargetCount, 19, 'the native next neighbour derives its own 19-turn route');
  equal(directionResolved.classification, 'not-expanding', 'and that route contracts away from the 39-turn prior');
  const directionMutant = createRuntime(directionProgram);
  directionMutant.api.configure(directionPrior, identityGraph(39, { selectedCount: 19 }));
  const directionKilled = directionMutant.api.captureCandidate(directionNext, directionPrior);
  equal(directionKilled.classification, 'invalid', 'direction-ignoring mutant is killed');
  equal(directionKilled.reason, 'capture-direction-neighbor-unavailable', 'and cannot reach any neighbour at all');

  const recomputeLedger = mutateLedgerFunction('chatAtlasClearBranchSelectionStaleOnCanonicalReturn', (body) => body.replace(
    'const candidate = intent?.returnTargetCandidate || null;',
    "const candidate = Object.freeze({ ...(intent?.returnTargetCandidate || {}), targetVariantAnswerId: intent?.priorAnswerId || '' });",
  ));
  const recompute = createRuntime(CORE_PROGRAM, recomputeLedger);
  preparePreExpansionReturn(recompute, { departureTime: 645, returnTime: 646 });
  recompute.api.publishHostIndex(canonicalIndex());
  recompute.api.setPageHeadState('match');
  recompute.api.apply(selectedPathRead({ canonical: true }), 'mutated-candidate-recompute');
  equal(recompute.api.snapshot().expansion.state, 'fail-closed', 'post-capture target-variant recomputation mutant is killed');

  const graphLeaseProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection', (body) => body.replace(
    'const allowedAgeMs = returnExpansionWindow.active === true',
    "if (returnExpansionWindow.active === true) chatAtlasOpenBranchExpansion(intent, { turns: returnExpansionWindow.graphDerivedPathMembers, sourceFingerprint: 'graph-only' });\n    const allowedAgeMs = returnExpansionWindow.active === true",
  ));
  const graphLease = createRuntime(graphLeaseProgram);
  preparePreExpansionReturn(graphLease, { departureTime: 646, returnTime: 647 });
  graphLease.advance(6000);
  graphLease.api.currentIntent(Q17);
  ok(graphLease.api.snapshot().expansion.lease, 'opening real lease from graph-only data mutation is exposed');
  const graphLeaseControl = createRuntime();
  preparePreExpansionReturn(graphLeaseControl, { departureTime: 648, returnTime: 649 });
  graphLeaseControl.advance(6000);
  graphLeaseControl.api.currentIntent(Q17);
  equal(graphLeaseControl.api.snapshot().expansion.lease, null, 'production never opens the real lease from graph proof alone');

  const pagesProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasBranchExpansionFailureRecord', (body) => body.replace(
    ': Object.freeze([]),\n      graphCaptureIdentity:',
    ': Object.freeze([2]),\n      graphCaptureIdentity:',
  ));
  const pages = createRuntime(pagesProgram);
  preparePreExpansionReturn(pages, { departureTime: 650, returnTime: 651 });
  pages.advance(8001);
  pages.api.currentIntent(Q17);
  equal(pages.api.snapshot().expansion.failure.requiredPageNums, [2], 'fabricated unresolved required-pages mutant is exposed');
  const pagesControl = createRuntime();
  preparePreExpansionReturn(pagesControl, { departureTime: 652, returnTime: 653 });
  pagesControl.advance(8001);
  pagesControl.api.currentIntent(Q17);
  equal(pagesControl.api.snapshot().expansion.failure.requiredPageNums, [], 'production leaves unresolved required pages empty');

  const confirmationProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasRecheckFailedBranchExpansion', (body) => body.replace(
    'return chatAtlasCompleteBranchExpansionCheckpoint(reason, { allowConfirmation: true });',
    "chatAtlasFinishBranchExpansion(lease, 'confirmed', reason);\n    return true;",
  ));
  const confirmation = createRuntime(confirmationProgram);
  preparePreExpansionReturn(confirmation, { departureTime: 654, returnTime: 655 });
  confirmation.advance(8001);
  confirmation.api.currentIntent(Q17);
  confirmation.api.publishHostIndex(canonicalIndex());
  confirmation.api.setPageHeadState('conflict');
  confirmation.api.recheckFailure();
  equal(confirmation.api.snapshot().expansion.state, 'confirmed', 'native-confirmation bypass mutant is exposed');
  const confirmationControl = createRuntime();
  preparePreExpansionReturn(confirmationControl, { departureTime: 656, returnTime: 657 });
  confirmationControl.advance(8001);
  confirmationControl.api.currentIntent(Q17);
  confirmationControl.api.publishHostIndex(canonicalIndex());
  confirmationControl.api.setPageHeadState('conflict');
  confirmationControl.api.recheckFailure();
  equal(confirmationControl.api.snapshot().expansion.state, 'fail-closed', 'production preserves Page 2 conflict containment');

  const identityProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasGraphReturnCandidateScopeCurrent', (body) => body.replace(
    "&& retained?.chatId === intent?.chatId",
    '&& getEffectivePresentationIndex() === selectedPathOverlayState.index\n      && retained?.chatId === intent?.chatId',
  ));
  const identityMutant = createRuntime(identityProgram);
  preparePreExpansionReturn(identityMutant, { departureTime: 658, returnTime: 659 });
  identityMutant.api.clearOverlay();
  equal(identityMutant.api.returnExpansionWindow().active, false, 'object-identity mutant rejects value-equivalent host index');
  const identityControl = createRuntime();
  preparePreExpansionReturn(identityControl, { departureTime: 660, returnTime: 661 });
  identityControl.api.clearOverlay();
  equal(identityControl.api.returnExpansionWindow().active, true, 'production accepts value-equivalent scoped prior presentation');
});

await fixture('unresolved explicit-refresh recovery rejects every mismatched real target scope', () => {
  const expire = (runtime, departureTime, returnTime) => {
    preparePreExpansionReturn(runtime, { departureTime, returnTime });
    runtime.advance(8001);
    runtime.api.currentIntent(Q17);
    equal(runtime.api.snapshot().expansion.failure?.targetResolved, false, 'control begins from an unresolved failure');
  };

  const wrongAnswer = createRuntime();
  expire(wrongAnswer, 670, 671);
  const wrongAnswerTurns = canonicalRows().map((turn) => turn.qId === Q17
    ? Object.freeze({
      ...turn,
      primaryAId: A17_SELECTED,
      answerVariants: Object.freeze([A17_CANONICAL, A17_SELECTED]),
    })
    : turn);
  wrongAnswer.api.publishHostIndex(hostIndexFromTurns(wrongAnswerTurns));
  wrongAnswer.api.setPageHeadState('match');
  equal(wrongAnswer.api.recheckFailure(), false, 'wrong target answer cannot recover unresolved containment');

  const wrongPath = createRuntime();
  expire(wrongPath, 672, 673);
  const wrongPathTurns = canonicalRows().map((turn) => turn.order === 30
    ? Object.freeze({
      ...turn,
      qId: 'wrong-path-q-30',
      turnId: 'turn:wrong-path-q-30',
      primaryAId: 'wrong-path-a-30',
      answerVariants: Object.freeze(['wrong-path-a-30']),
    })
    : turn);
  wrongPath.api.publishHostIndex(hostIndexFromTurns(wrongPathTurns));
  wrongPath.api.setPageHeadState('match');
  equal(wrongPath.api.recheckFailure(), false, 'wrong ordered identity path cannot recover containment');

  const equalTarget = createRuntime();
  expire(equalTarget, 674, 675);
  equalTarget.api.publishHostIndex(selectedHostIndex(19));
  equalTarget.api.setPageHeadState('match');
  equal(equalTarget.api.recheckFailure(), false, 'equal-length host target cannot recover an expansion');

  const wrongRoute = createRuntime();
  expire(wrongRoute, 676, 677);
  wrongRoute.api.setRoute('/c/wrong-route');
  wrongRoute.api.publishHostIndex(canonicalIndex());
  wrongRoute.api.setPageHeadState('match');
  equal(wrongRoute.api.recheckFailure(), false, 'route drift cannot consume an old unresolved failure');

  const wrongGeneration = createRuntime();
  expire(wrongGeneration, 678, 679);
  wrongGeneration.api.setGeneration(2);
  wrongGeneration.api.publishHostIndex(canonicalIndex());
  wrongGeneration.api.setPageHeadState('match');
  equal(wrongGeneration.api.recheckFailure(), false, 'generation drift cannot consume an old unresolved failure');
});

await fixture('fast expanding return is provisional until native Page 2 confirmation', () => {
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
  runtime.api.setPageHeadState('match');
  runtime.api.apply(selectedPathRead({ canonical: true }), 'native-return');
  const provisional = runtime.api.snapshot();
  equal(provisional.stale, true, 'expanding canonical anchor remains provisional');
  equal(provisional.intent.token, returnCapture.intent.token, 'trusted return intent remains expansion owner');
  equal(provisional.expansion.state, 'pending', 'expansion lease remains pending');
  equal(provisional.overlay.overlayActive, false, 'canonical presentation is visible while confirmation is pending');
  equal(provisional.overlay.count, 39, 'effective presentation returns to 39 provisionally');
  equal(runtime.activeTimers().length, 1, 'bounded lease timeout is the only provisional timer');
  runtime.api.expansionCheckpoint(true, 'explicit-rebuild-complete');
  const returned = runtime.api.snapshot();
  equal(returned.stale, false, 'approved native confirmation clears stale state');
  equal(returned.intent, null, 'approved confirmation retires intent exactly once');
  equal(returned.expansion.state, 'confirmed', 'expansion is confirmed at the approved checkpoint');
  equal(runtime.activeTimers().length, 0, 'confirmation cancels the bounded timeout');
  equal(
    returned.trace.filter((entry) => entry.event === 'trusted-intent-cleared' && entry.reason === 'branch-expansion-explicit-rebuild-complete').length,
    1,
    'expansion-owned trusted intent clears exactly once at confirmation',
  );
  equal(returned.trace.filter((entry) => entry.event === 'branch-stale-cleared').length, 1, 'branch stale state clears exactly once');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

await fixture('fast contracting 39-to-18 return preserves immediate clear without a lease', () => {
  const runtime = createRuntime();
  runtime.api.configure(canonicalIndex(18), identityGraph());
  runtime.api.capture(branchEvent({ direction: 'previous', timeStamp: 650, answerIds: [A17_SELECTED] }));
  runtime.api.patchIntent({ priorEffectiveCount: 39, priorEffectiveFingerprint: 'djb2:prior-39' });
  runtime.api.apply(selectedPathRead({ canonical: true, count: 18 }), 'native-contracting-return');
  const result = runtime.api.snapshot();
  equal(result.stale, false, 'contracting return clears stale state immediately');
  equal(result.intent, null, 'contracting return retires trusted intent');
  equal(result.expansion.lease, null, 'contracting return opens no expansion lease');
  equal(runtime.activeTimers().length, 0, 'contracting return schedules no timer');
  assertSafe(runtime);
});

await fixture('expansion conflict fails closed without retry ownership', () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 660 }));
  runtime.api.apply(selectedPathRead());
  runtime.api.capture(branchEvent({ direction: 'previous', timeStamp: 661, answerIds: [A17_SELECTED] }));
  runtime.api.setPageHeadState('conflict');
  runtime.api.apply(selectedPathRead({ canonical: true }), 'native-return-conflict');
  const result = runtime.api.snapshot();
  equal(result.expansion.state, 'fail-closed', 'conflict enters keyed containment');
  equal(result.expansion.reason, 'native-page-head-conflict', 'conflict reason is exact');
  equal(result.expansion.lease, null, 'conflict cleans active retry ownership');
  ok(result.expansion.failure, 'keyed fail-closed containment remains');
  equal(result.intent, null, 'terminal conflict does not retain trusted intent indefinitely');
  equal(runtime.activeTimers().length, 0, 'conflict schedules no convergence attempt');
  assertSafe(runtime);
});

await fixture('expansion absence uses three deterministic attempts and no fourth', async () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 670 }));
  runtime.api.apply(selectedPathRead());
  runtime.api.capture(branchEvent({ direction: 'previous', timeStamp: 671, answerIds: [A17_SELECTED] }));
  runtime.api.setPageHeadState('absent');
  runtime.api.apply(selectedPathRead({ canonical: true }), 'native-return-absent');
  equal(runtime.activeTimers().map((timer) => timer.delay).sort((a, b) => a - b), [250, 8000], 'campaign opens with first delay and lease timeout');
  await runtime.fireDelay(250);
  runtime.api.expansionCheckpoint(false, 'explicit-refresh-complete');
  await runtime.fireDelay(750);
  runtime.api.expansionCheckpoint(false, 'explicit-refresh-complete');
  await runtime.fireDelay(1750);
  runtime.api.expansionCheckpoint(false, 'explicit-refresh-complete');
  const result = runtime.api.snapshot();
  equal(result.expansion.state, 'fail-closed', 'three absent attempts terminate fail closed');
  equal(result.expansion.reason, 'attempts-exhausted', 'attempt bound has exact reason');
  equal(result.expansion.lease, null, 'exhaustion cleans active lease');
  equal(result.intent, null, 'exhaustion releases trusted intent ownership');
  equal(runtime.activeTimers().length, 0, 'no recursive polling or fourth attempt remains');
  equal(runtime.counters.generalTimers, 4, 'one timeout plus exactly three retries were scheduled');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

await fixture('expansion timeout releases active ownership but retains keyed containment', async () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 675 }));
  runtime.api.apply(selectedPathRead());
  runtime.api.capture(branchEvent({ direction: 'previous', timeStamp: 676, answerIds: [A17_SELECTED] }));
  runtime.api.setPageHeadState('absent');
  runtime.api.apply(selectedPathRead({ canonical: true }), 'native-return-timeout');
  await runtime.fireDelay(8000);
  const result = runtime.api.snapshot();
  equal(result.expansion.state, 'fail-closed', 'lease timeout terminates fail closed');
  equal(result.expansion.reason, 'timeout', 'timeout reason is exact');
  equal(result.expansion.lease, null, 'timeout releases active retry ownership');
  ok(result.expansion.failure, 'timeout retains only keyed containment');
  equal(result.intent, null, 'timeout does not retain trusted intent indefinitely');
  equal(runtime.activeTimers().length, 0, 'timeout cancels every retry');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

await fixture('newer trusted capture supersedes an expansion lease and makes stale callbacks inert', async () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 680 }));
  runtime.api.apply(selectedPathRead());
  runtime.api.capture(branchEvent({ direction: 'previous', timeStamp: 681, answerIds: [A17_SELECTED] }));
  runtime.api.setPageHeadState('absent');
  runtime.api.apply(selectedPathRead({ canonical: true }), 'native-return-absent');
  const oldToken = runtime.api.snapshot().intent.token;
  const staleRetry = runtime.activeTimers().find((timer) => timer.delay === 250)?.fn;
  runtime.api.capture(branchEvent({ direction: 'next', timeStamp: 682, answerIds: [A17_CANONICAL] }));
  const newer = runtime.api.snapshot();
  ok(newer.intent.token !== oldToken, 'newer trusted action owns a new token');
  equal(newer.expansion.lease, null, 'new capture cancels old expansion lease');
  equal(runtime.activeTimers().length, 0, 'new capture cancels old timers');
  staleRetry?.();
  await Promise.resolve();
  equal(runtime.api.snapshot().intent.token, newer.intent.token, 'stale retry callback cannot alter newer intent');
  equal(runtime.api.snapshot().expansion.lease, null, 'stale callback cannot reopen old lease');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

await fixture('bounded intent lifetime survives remount budget then expires', () => {
  const runtime = createRuntime();
  runtime.api.capture(branchEvent({ timeStamp: 700 }));
  const token = runtime.api.snapshot().intent.token;
  runtime.advance(4_999);
  equal(runtime.api.currentIntent(Q17)?.token, token, 'intent survives the established five-second budget');
  runtime.advance(2);
  // The pending branch transaction owns the intent past the click window:
  // derivation retries on later ledger flushes need it alive. Containment is
  // bounded by the transaction cap, after which expiry resumes and the
  // fail-closed transaction keeps suppressing foreign appends.
  equal(runtime.api.currentIntent(Q17)?.token, token, 'pending transaction keeps the intent alive past five seconds');
  equal(runtime.api.suppressesLiveAppend(), true, 'containment holds while the transaction is pending');
  runtime.advance(90_001);
  equal(runtime.api.currentIntent(Q17), null, 'intent expires once the bounded transaction cap passes');
  equal(runtime.api.snapshot().acquisition.reason, 'trusted-intent-expired', 'expiry reason is exact');
  equal(runtime.api.snapshot().complete.branchTransactionStateCode, 'fail-closed', 'capped transaction fails closed');
  equal(runtime.api.suppressesLiveAppend(), true, 'fail-closed containment still refuses foreign appends');
  assertSafe(runtime);
});

await fixture('transient missing anchor retains exact trusted ownership until remount or the transaction ceiling', () => {
  // Live Turn-26 shape: the native click is trusted and opens the keyed branch
  // transaction, then React temporarily unmounts the anchor together with the
  // downstream branch. Empty native membership is not weaker proof — it still
  // fails acquisition — but it must remain retryable while the exact pending
  // transaction owns the same token and scope.
  const recovering = createRuntime();
  equal(recovering.api.capture(branchEvent({
    direction: 'next',
    timeStamp: 750,
    answerIds: [A17_CANONICAL],
  })), true, 'trusted native selection is captured');
  const token = recovering.api.snapshot().intent.token;
  const missing = recovering.api.evaluate([]);
  equal(missing.status, 'failed', 'missing native anchor still fails acquisition');
  equal(missing.reason, 'anchor-member-missing', 'missing anchor reason remains exact');
  equal(recovering.api.snapshot().complete.branchTransactionStateCode, 'pending', 'matching branch transaction stays pending');

  recovering.advance(5_001);
  equal(
    recovering.api.currentIntent(Q17)?.token,
    token,
    'TRANSIENT_ANCHOR_MISSING_INTENT_EXPIRED_TOO_EARLY: exact pending transaction must retain the trusted intent past 5s',
  );
  const held = recovering.api.snapshot();
  equal(held.acquisition.status, 'failed', 'anchor proof is not weakened during the unavailable window');
  equal(held.acquisition.reason, 'anchor-member-missing', 'failed acquisition remains classified as missing anchor');
  equal(held.complete.branchTransactionStateCode, 'pending', 'the same transaction still owns retryability');
  equal(held.intent.token, token, 'no newer token supersedes the held intent');

  // This is the normal Ledger/native-evidence path. The fixture does not call
  // overlay publication or mutate acquisition state directly.
  recovering.api.apply(selectedPathRead(), 'native-anchor-remounted');
  const recovered = recovering.api.snapshot();
  equal(recovered.acquisition.status, 'proven', 'remounted exact anchor proves acquisition');
  equal(recovered.acquisition.reason, 'selected-path-proven', 'proof uses the canonical acquisition result');
  equal(recovered.overlay.overlayActive, true, 'selected-path overlay publishes atomically');
  equal(recovered.effective.turns.length, 18, 'effective route switches wholly to the selected branch');
  equal(recovered.coreTurns.length, 18, 'Core publishes the same complete selected route');
  equal(recovered.complete.branchTransactionStateCode, 'published', 'transaction closes only on publication');
  equal(recovering.api.suppressesLiveAppend(), false, 'branch-transition gate becomes inactive after publication');
  equal(
    recovered.effective.turns.map((turn) => turn.qId).join('|'),
    recovered.coreTurns.map((turn) => turn.qId).join('|'),
    'effective and Core routes contain no hybrid identity sequence',
  );
  assertSafe(recovering);

  // The hold is bounded by the existing 90-second transaction authority. If
  // the anchor never returns, the transaction becomes fail-closed and the
  // intent/acquisition/lease cannot remain live forever.
  const absentForever = createRuntime();
  absentForever.api.capture(branchEvent({ timeStamp: 751 }));
  absentForever.api.evaluate([]);
  absentForever.advance(90_001);
  equal(absentForever.api.currentIntent(Q17), null, 'missing anchor cannot survive the bounded transaction ceiling');
  const capped = absentForever.api.snapshot();
  equal(capped.acquisition.reason, 'trusted-intent-expired', 'ceiling retires the unavailable acquisition safely');
  equal(capped.complete.branchTransactionStateCode, 'fail-closed', 'ceiling fails the transaction closed');
  equal(capped.complete.selectedPathRequestLeaseActive, false, 'no selected-path request lease remains after the ceiling');
  assertSafe(absentForever);

  // Ambiguity is not temporary absence: two native members retain the exact
  // fail-closed classification and publish nothing.
  const ambiguous = createRuntime();
  ambiguous.api.capture(branchEvent({ timeStamp: 752 }));
  const ambiguousResult = ambiguous.api.evaluate([
    { question: { currentQId: Q17 }, answer: { currentProjectionSource: 'native-evidence', currentAnswerIds: [A17_SELECTED] } },
    { question: { currentQId: Q17 }, answer: { currentProjectionSource: 'native-evidence', currentAnswerIds: [A17_SELECTED] } },
  ]);
  equal(ambiguousResult.status, 'failed', 'ambiguous native membership fails acquisition');
  equal(ambiguousResult.reason, 'anchor-member-ambiguous', 'ambiguity never receives missing-anchor classification');
  equal(ambiguous.api.snapshot().overlay.overlayActive, false, 'ambiguous anchor publishes no overlay');
  assertSafe(ambiguous);

  // A genuinely newer trusted click replaces the held token immediately; a
  // stale missing-anchor evaluation can never recover under the old owner.
  const superseded = createRuntime();
  superseded.api.capture(branchEvent({ timeStamp: 753 }));
  superseded.api.evaluate([]);
  const oldToken = superseded.api.snapshot().intent.token;
  superseded.advance(5_001);
  superseded.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 754,
    answerIds: [A17_SELECTED],
  }));
  const newer = superseded.api.snapshot();
  ok(newer.intent.token !== oldToken, 'newer native capture supersedes the held missing-anchor token');
  equal(newer.complete.branchTransactionStateCode, 'pending', 'new token owns a fresh pending transaction');
  assertSafe(superseded);

  // Route/generation scope remain hard fail-closed guards even when the last
  // acquisition failure was the otherwise-transient missing-anchor case.
  const wrongGeneration = createRuntime();
  wrongGeneration.api.capture(branchEvent({ timeStamp: 755 }));
  wrongGeneration.api.evaluate([]);
  wrongGeneration.api.setGeneration(2);
  equal(wrongGeneration.api.currentIntent(Q17), null, 'generation drift clears missing-anchor ownership');
  equal(wrongGeneration.api.snapshot().overlay.overlayActive, false, 'generation-drifted evidence publishes nothing');
  assertSafe(wrongGeneration);
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

await fixture('fresh reload: one trusted click drives one accepted acquisition without the memory canary', async () => {
  // Live-shaped start: freshly reloaded page, canonical authority only, no
  // overlay, no acquisition, no retained prior state, canary false (default).
  const runtime = createRuntime();
  const start = runtime.api.snapshot();
  equal(start.overlay.overlayActive, false, 'fresh reload has no selected overlay');
  equal(start.acquisition.status, 'inactive', 'fresh reload has no acquisition');
  equal(start.complete.autoBranchReconciliationEnabled, false, 'memory canary is false after reload');
  equal(runtime.counters.reconcileTasks, 0, 'no reconcile task exists before the click');

  equal(runtime.api.capture(branchEvent()), true, 'trusted click is captured and bound');
  equal(runtime.counters.reconcileTasks, 1, 'the click schedules exactly one bounded zero-delay task');
  equal(runtime.pendingReconcileTasks().length, 1, 'the task is pending, not yet run');
  equal(runtime.api.snapshot().complete.selectedPathAcceptanceCount, 0, 'nothing is accepted before the task fires');

  await runtime.fireReconcile();
  const after = runtime.api.snapshot();
  equal(after.complete.selectedPathSignalCount, 1, 'the task emitted exactly one selected-path signal');
  equal(after.complete.selectedPathAcceptanceCount, 1, 'the trusted signal is accepted without the canary');
  equal(after.complete.selectedPathRejectedCount, 0, 'the trusted signal is not rejected');
  equal(after.complete.selectedPathRequestLeaseActive, true, 'acceptance freezes the trusted request lease');
  equal(after.complete.autoBranchReconciliationEnabled, false, 'the canary itself never flips');
  equal(runtime.pendingReconcileTasks().length, 0, 'the task is consumed exactly once');
  equal(runtime.counters.forbiddenNetworkCalls, 0, 'acceptance alone performs no network call');
  equal(runtime.counters.pollingIntervals, 0, 'no polling is introduced');
  ok(runtime.activeTimers().length >= 1, 'the accepted refresh is debounced through the existing timer');
});

await fixture('automatic lane stays deferred: untrusted signals reject while the canary is false', () => {
  const runtime = createRuntime();
  // No capture: the generic-inspection lane can never mint trusted evidence
  // while the canary is false.
  const evidence = runtime.api.evidenceFor('question-branch-changed', {
    qId: Q17,
    observedAnswerId: A17_SELECTED,
  });
  equal(evidence?.trusted, false, 'automatic-lane evidence is untrusted without the canary');
  equal(evidence?.selectionToken, '', 'automatic-lane evidence carries no token');
  runtime.api.scheduleRefresh('question-branch-changed', evidence);
  const status = runtime.api.snapshot().complete;
  equal(status.selectedPathAcceptanceCount, 0, 'untrusted automatic work is never accepted');
  equal(status.selectedPathRejectedCount, 1, 'untrusted automatic work is rejected exactly once');
  equal(runtime.counters.reconcileTasks, 0, 'no reconcile task exists without a capture');
  assertSafe(runtime);
});

await fixture('stale branch transition suppresses unmatched mounted-turn appends', () => {
  const runtime = createRuntime();
  equal(runtime.api.suppressesLiveAppend(), false, 'no suppression outside a branch transition');
  equal(runtime.api.capture(branchEvent()), true, 'trusted click begins the transition');
  equal(runtime.api.snapshot().stale, true, 'branch selection is stale during the transition');
  equal(runtime.api.suppressesLiveAppend(), true, 'unmatched mounted turns must not extend authority mid-transition');
  // Source contract: commitTurnDrafts consults the guard before appending an
  // unmatched live draft, so a hybrid "previous branch + one mounted foreign
  // turn" count can never publish while the transition is stale.
  const commit = extractFunction(H2O_CORE_SOURCE, 'commitTurnDrafts');
  const appendIndex = commit.indexOf('for (const draft of unmatchedLiveDrafts)');
  const guardIndex = commit.indexOf('chatAtlasBranchTransitionSuppressesLiveAppend()');
  const pushIndex = commit.indexOf('nextRecords.push(record);', appendIndex);
  ok(appendIndex >= 0, 'unmatched append loop exists');
  ok(guardIndex > appendIndex && guardIndex < pushIndex, 'the guard runs inside the loop before any push');
  // The count is Chat-Atlas-owned state, so H2O Core no longer increments it
  // inline: it reports the suppression through the 0A3a command seam and 0A3a
  // owns the increment. Both halves are proven here, so the end-to-end
  // requirement — a suppressed append is always counted — is unchanged.
  const noteIndex = commit.indexOf('noteBranchTransitionSuppressedLiveAppend()', guardIndex);
  ok(
    noteIndex > guardIndex
      && noteIndex < pushIndex
      && /noteBranchTransitionSuppressedLiveAppend\(\)\s*\{\s*completeTurnIndexAuthorityState\.branchTransitionSuppressedLiveAppendCount \+= 1;/
        .test(BROKER_PROGRAM),
    'suppression is counted',
  );
});

await fixture('screenshot regression: client-side switch with stale current_node resolves the full selected branch', async () => {
  // Live shape: fresh reload on the 19-turn branch (authority IS 19, canary
  // false, no overlay, no acquisition, no retained graph). The user clicks to
  // the 39-turn branch; ChatGPT switches client-side only, so every server
  // payload keeps reporting the 19-turn current_node. The selected answer
  // identity at the anchor is the only truth about the chosen branch.
  const runtime = createRuntime();
  const graphRefetch = {};
  graphRefetch.promise = new Promise((resolve) => { graphRefetch.resolve = resolve; });
  let coordinatorCalls = 0;
  runtime.api.configure(selectedHostIndex(19), null);
  equal(stage2mIdentityGraph().nodeCount, 115, 'fixture preserves the live normalized 115-node graph');
  runtime.api.setProvider((_chatId, options = {}) => {
    if (!options.signal) {
      runtime.counters.boundedGraphRefetchCalls += 1;
      return graphRefetch.promise;
    }
    coordinatorCalls += 1;
    // The host exposes only its current_node ancestry through the mounted
    // order-26 answer. The same acquisition graph still contains 27..39.
    return Promise.resolve({ ok: true, index: stage2mPrefixIndex() });
  });
  equal(runtime.api.snapshot().complete.autoBranchReconciliationEnabled, false, 'memory canary stays false');
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 700,
    answerIds: [A17_SELECTED],
  })), true, 'trusted click is captured on the fresh 19 authority');
  const token = runtime.api.snapshot().intent.token;
  equal(runtime.api.suppressesLiveAppend(), true, 'transition suppresses unmatched appends from the click on');
  await runtime.fireReconcile();
  equal(runtime.api.snapshot().complete.selectedPathAcceptanceCount, 1, 'click-driven acquisition is accepted');
  // Native re-render: the anchor's displayed answer is now the 39-branch
  // variant. The ledger lane starts the graph acquisition (no retained graph
  // after reload, so a bounded refetch begins).
  runtime.api.apply(selectedPathRead({ canonical: true }), 'client-side-branch-render');
  equal(runtime.counters.boundedGraphRefetchCalls, 1, 'exactly one bounded graph acquisition starts');
  // The host confirms the changed anchor but returns only its 26-turn
  // current_node ancestry. Anchor confirmation is not complete-path proof:
  // the transaction must retain the intent while the graph acquisition runs.
  const midflight = runtime.api.snapshot();
  equal(midflight.intent?.token, token, 'anchor confirmation retains the acquiring intent');
  equal(midflight.complete.branchTransactionStateCode, 'pending', 'the exact transaction still owns publication');
  equal(midflight.overlay.overlayActive, false, 'nothing publishes before the graph proves the branch');
  equal(midflight.overlay.count, 19, 'previous complete authority remains exposed, never 20');
  equal(runtime.api.suppressesLiveAppend(), true, 'foreign mounted turns still cannot append mid-acquisition');
  // The full mapping arrives: derive the branch from the confirmed selected
  // answer identity, not from the stale current_node.
  // Live shape: the 39 branch contains an unanswered mid-turn at order 20 —
  // exactly where every live partial settle (17/20, 17/21) died.
  graphRefetch.resolve({ ok: true, identityGraph: stage2mIdentityGraph() });
  await settle();
  runtime.api.publish(stage2mPrefixIndex(), 'post-overlay-host-prefix');
  const resolved = runtime.api.snapshot();
  equal(resolved.acquisition.status, 'proven', 'graph acquisition proves the selected branch');
  equal(resolved.effective.turns[19].qId, LIVE_Q20, 'the unanswered order 20 retains its exact live question identity');
  equal(resolved.effective.turns[19].noAnswer, true, 'the unanswered mid-turn is order 20 with noAnswer');
  equal(resolved.effective.turns[19].primaryAId, null, 'the no-answer turn carries no primary answer');
  ok(resolved.effective.turns[20].primaryAId, 'the walk continues past the unanswered turn');
  equal(resolved.overlay.overlayActive, true, 'the complete selected branch becomes the effective presentation');
  equal(resolved.overlay.count, 39, 'effective authority is the full 39-turn branch');
  equal(resolved.effective.turns.length, 39, 'effective index carries all 39 turns');
  equal(resolved.effective.turns[25].qId, LIVE_Q26, 'order 26 retains the exact live question identity');
  equal(resolved.effective.turns[25].primaryAId, LIVE_A26, 'order 26 retains the exact live answer identity');
  equal(resolved.effective.turns[26].qId, LIVE_Q27, 'the exact unmounted order-27 question is traversed');
  equal(resolved.effective.turns[26].primaryAId, LIVE_A27, 'the exact unmounted order-27 answer is traversed');
  equal(resolved.effective.turns.slice(25).length, 14, 'Page 2 contains the complete 26 through 39 range');
  equal(Number(resolved.effective.turns[38].order || 39), 39, 'final turn is order 39, never a partial 20');
  equal(resolved.effective.turns[38].qId, LIVE_Q39, 'final turn carries the exact selected terminal question identity');
  equal(resolved.effective.turns[38].primaryAId, LIVE_A39, 'final turn carries the exact selected terminal answer identity');
  equal(resolved.coreTurns.length, 39, 'Core turnState is rebuilt from the same complete index');
  equal(resolved.ledgerTurns.length, 39, 'Ledger canonical projection consumes the same complete index');
  equal(resolved.derivation.derivation.pathLength, 39, 'derivation diagnostics prove the complete path');
  equal(resolved.derivation.derivation.fork.forkNodeId, LIVE_FORK_Q, 'diagnostics identify the exact live unresolved fork');
  equal(
    resolved.derivation.derivation.fork.candidateChildIds,
    [LIVE_FORK_SHORT_Q, LIVE_LONG_Q_IDS[9]],
    'diagnostics preserve the exact competing continuation identities',
  );
  equal(
    resolved.derivation.derivation.fork.decisionReason,
    'unique-global-terminal-complete-maximum',
    'the unique global terminal-complete route wins',
  );
  const forkCandidates = resolved.derivation.derivation.fork.candidates;
  equal(forkCandidates[0].maximumEmittedTurnCount, 2, 'the ambiguous edit candidate is only two emitted turns');
  equal(forkCandidates[0].terminalLeaves, [LIVE_FORK_SHORT_LEAF_A, LIVE_FORK_SHORT_LEAF_B], 'both short terminal leaves remain diagnostic');
  equal(forkCandidates[0].rejectionReason, 'shorter-terminal-complete-route', 'short internal ambiguity cannot veto the longer route');
  equal(forkCandidates[1].maximumEmittedTurnCount, 5, 'the selected route emits the five remaining turns');
  equal(forkCandidates[1].terminalLeaves, [LIVE_A39], 'the selected route terminates at the real Turn 39 answer');
  equal(forkCandidates[1].accepted, true, 'the exact long continuation is selected');
  equal(resolved.derivation.publicationDecision.incomingCount, 26, 'the exact host prefix is recorded');
  equal(resolved.derivation.publicationDecision.published, false, 'the host prefix never publishes');
  equal(resolved.derivation.publicationDecision.reason, 'host-current-node-prefix-rejected', 'later prefix refresh is explicitly rejected');
  equal(runtime.api.suppressesLiveAppend(), false, 'suppression releases only after the branch publishes');
  equal(runtime.counters.boundedGraphRefetchCalls, 1, 'no request storm: one graph acquisition total');
  ok(coordinatorCalls <= 1, 'at most one host confirmation acquisition is sufficient');
  equal(
    runtime.counters.effectivePresentationEmitsWithRequestLease,
    0,
    'publication reconciliation observes no completed request lease',
  );
  equal(runtime.activeTimers().filter((entry) => entry.delay === 1250).length, 0, 'graph publication cancels the redundant confirmation fetch');
  // Overlay activation performs the same sanctioned persistence writes the
  // accepted slow-refetch fixture zeroes before the safety sweep.
  runtime.counters.storageWrites = 0;
  runtime.counters.generalTimers = 0;
  assertSafe(runtime, { refetchCalls: 1 });
});

await fixture('unchanged host envelope publishes once when its retained full graph arrives', async () => {
  // Repeated live switch shape: after returning to the 19-turn branch, the
  // next click opens a fresh transaction with no retained graph. The bounded
  // coordinator GET returns the same 19-turn host envelope plus the complete
  // 115-node graph. An unchanged envelope may be skipped by the coordinator,
  // so graph retention itself must re-evaluate the exact transaction locally.
  const runtime = createRuntime();
  runtime.api.configure(selectedHostIndex(19), null);
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 705,
    answerIds: [A17_SELECTED],
  })), true, 'fresh repeated switch opens one exact transaction');
  // This is the exact post-provider boundary: the coordinator has retained
  // the returned graph, but its 19-turn envelope is byte-identical and will
  // not trigger another ordinary publication callback.
  // PHASE 1 — pre-click retained evidence. current_node is still on the
  // outgoing 19-turn chain, so it cannot prove the selected downstream route.
  // Retention happens; publication must not.
  const preClick = runtime.api.retainAndPublishGraph(stage2mIdentityGraph());
  const contained = runtime.api.snapshot();
  equal(preClick.retained, true, 'the one complete graph acquisition is retained');
  equal(preClick.publication.published, false, 'a pre-click retained graph cannot publish');
  equal(contained.complete.branchTransactionStateCode, 'pending', 'the exact transaction stays pending');
  equal(contained.overlay.overlayActive, false, 'no selected-path overlay is installed yet');
  equal(contained.effective.turns.length, 19, 'the effective path does not switch on unproven evidence');
  ok(contained.effective.turns.length !== 20 && contained.effective.turns.length !== 21,
    'no partial 20/21 hybrid can settle while the transaction is contained');

  // PHASE 3 — the refreshed post-click graph proves the selected route; the
  // original success expectations apply here unchanged.
  const graphArrival = runtime.api.retainAndPublishGraph(stage2mPostClickGraph());
  const resolved = runtime.api.snapshot();
  equal(graphArrival.retained, true, 'the refreshed graph acquisition is retained');
  equal(graphArrival.publication.published, true, 'graph retention re-evaluates the exact transaction once');
  equal(resolved.overlay.overlayActive, true, 'retained graph arrival publishes the selected overlay locally');
  equal(resolved.effective.turns.length, 39, 'unchanged host envelope cannot strand the complete 39-turn graph');
  equal(resolved.complete.branchTransactionStateCode, 'published', 'the exact transaction closes as published');
  equal(resolved.complete.selectedPathRequestLeaseActive, false, 'publication settles the exact request lease before consumers run');
  equal(resolved.derivation.publicationDecision.source, 'coordinator-graph-acquisition', 'diagnostics identify graph-arrival publication');
  equal(resolved.derivation.publicationDecision.acceptedCount, 39, 'graph-arrival publication accepts only the complete path');
  equal(resolved.coreTurns.length, 39, 'Core is rebuilt atomically from the complete graph path');
  equal(resolved.ledgerTurns.length, 39, 'Ledger consumes the same complete graph path');
  assertSafe(runtime);
});

await fixture('a graph retained before capture publishes at the post-event trusted reconcile', async () => {
  // Reload already acquired the complete 115-node mapping while Branch 2 was
  // current. The next native click must consume that retained graph locally;
  // no new provider envelope is required to rediscover identical bytes.
  const runtime = createRuntime();
  // PHASE 1 — the graph retained at reload is PRE-CLICK: current_node still
  // sits on the outgoing branch, so it cannot prove the selection the user
  // has just made.
  runtime.api.configure(selectedHostIndex(19), stage2mIdentityGraph());
  let providerCalls = 0;
  // PHASE 2 — the bounded host refresh supplies the post-click graph. This is
  // the one refresh opportunity this trusted token owns.
  runtime.api.setProvider(() => {
    providerCalls += 1;
    return Promise.resolve({ ok: true, index: selectedHostIndex(19), identityGraph: stage2mPostClickGraph() });
  });
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 707,
    answerIds: [A17_SELECTED],
  })), true, 'trusted capture opens the exact branch transaction');
  equal(runtime.api.snapshot().overlay.count, 19, 'publication waits for the existing post-event checkpoint');
  await runtime.fireReconcile();
  const contained = runtime.api.snapshot();
  equal(contained.overlay.overlayActive, false, 'pre-click retained evidence does not publish at reconcile');
  equal(contained.complete.branchTransactionStateCode, 'pending', 'the transaction stays pending and contained');
  ok(contained.effective.turns.length !== 20 && contained.effective.turns.length !== 21,
    'no partial 20/21 hybrid settles while the refresh is outstanding');
  // PHASE 3 — the refreshed post-click graph arrives and proves the route.
  const graphArrival = runtime.api.retainAndPublishGraph(stage2mPostClickGraph());
  equal(graphArrival.publication.published, true, 'the refreshed post-click graph publishes');
  const resolved = runtime.api.snapshot();
  equal(resolved.overlay.count, 39, 'post-click reconcile publishes the complete route');
  equal(resolved.effective.turns.length, 39, 'effective authority is atomically complete');
  equal(resolved.complete.branchTransactionStateCode, 'published', 'transaction closes only after retained-graph publication');
  equal(resolved.derivation.publicationDecision.acceptedCount, 39, 'only the complete route is accepted');
  ok(providerCalls <= 1, 'the bounded refresh runs at most once for this trusted token');
  equal(resolved.coreTurns.length, 39, 'Core consumes the complete retained route');
  equal(resolved.ledgerTurns.length, 39, 'Ledger consumes the same retained route');
  // PHASE 2 is a real refresh opportunity, not a no-op: the graph retained at
  // reload is PRE-CLICK, so the post-event handoff stays pending and hands off
  // to the coordinator's existing debounce. That handoff is the only thing that
  // could ever bring post-click evidence in the live browser, so it must be
  // scheduled; PHASE 3 simply lands first, which is why the provider is never
  // called. Account for the one sanctioned debounce explicitly instead of
  // letting the safety sweep assume no timer exists at all.
  const debounced = runtime.activeTimers();
  equal(debounced.length, 1, 'exactly one refresh is outstanding, not a storm');
  ok(debounced[0].delay > 0, 'and it is the existing debounce, never a poll');
  equal(runtime.counters.boundedGraphRefetchCalls, 0, 'no bounded graph refetch is started');
  runtime.counters.generalTimers = 0;
  assertSafe(runtime);
});

// Stale-retained-graph -> bounded-refresh handoff. Live shape: the host has
// already applied a trusted Answer-17 switch, but the retained identity graph
// still carries the PRE-CLICK current_node, so the fork below the newly
// selected answer is unresolvable by containment. Derivation must not reach a
// terminal verdict against that graph; it must stay contained and pending so
// refreshed evidence can arrive.
function openStaleGraphSelection() {
  const runtime = createRuntime();
  runtime.api.configure(selectedHostIndex(19), null);
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 731,
    answerIds: [A17_SELECTED],
  })), true, 'the trusted branch transaction opens');
  // Pre-click evidence: current_node sits outside the A17_SELECTED subtree.
  const arrival = runtime.api.retainAndPublishGraph(stage2mAmbiguousGraph());
  return { runtime, arrival, state: runtime.api.snapshot() };
}

const staleTrace = (state) => (state.complete.branchTransactionTrace || []).map((entry) => entry.code);

// A. Pre-click retained graph whose derivation would otherwise be terminal.
await fixture('a pre-click retained graph is held pending instead of failing closed', () => {
  const { runtime, arrival, state } = openStaleGraphSelection();
  equal(arrival.retained, true, 'the pre-click graph is retained like any other');
  equal(state.complete.branchTransactionStateCode, 'pending', 'the transaction stays open');
  equal(state.complete.branchTransactionPending, true, 'ownership and containment are preserved');
  equal(
    state.derivation.publicationDecision.reason,
    'branch-transaction-graph-pending',
    'the publication decision reports graph-pending, not a derivation verdict',
  );
  equal(state.derivation.publicationDecision.published, false, 'and publishes nothing');
  equal(state.derivation.derivation.ok, false, 'the derivation itself still cannot resolve the fork');
  equal(state.derivation.derivation.reason, 'fork-unresolved', 'for the exact live reason');
  const trace = staleTrace(state);
  ok(trace.includes('tx-graph-pending'), 'the stale classification is recorded on the transaction');
  ok(!trace.includes('tx-fail-closed'), 'nothing closes the transaction while evidence is pre-click');
  equal(state.overlay.count, 19, 'the previous complete authority is untouched');
  equal(state.overlay.overlayActive, false, 'no overlay is installed on stale evidence');
  equal(state.ledgerTurns.length, 19, 'Ledger is not mutated');
  // Repetition must not escalate: the hold is stable, not a race.
  runtime.api.publish(stage2mPrefixIndex(), 'stale-graph-repeat-prefix');
  runtime.api.retainAndPublishGraph(stage2mAmbiguousGraph());
  const repeated = runtime.api.snapshot();
  equal(repeated.complete.branchTransactionStateCode, 'pending', 'repeats keep the transaction open');
  equal(repeated.overlay.count, 19, 'and never publish a route');
  assertSafe(runtime);
});

// B. Refreshed post-click graph: current_node proves the anchor, parity resolves.
await fixture('a refreshed post-click graph completes the held selection', () => {
  const { runtime } = openStaleGraphSelection();
  const refreshed = runtime.api.retainAndPublishGraph(stage2mPostClickGraph());
  equal(refreshed.retained, true, 'the refreshed graph replaces the pre-click evidence');
  const state = runtime.api.snapshot();
  equal(
    state.complete.branchTransactionStateCode,
    'published',
    'the held transaction publishes rather than failing closed',
  );
  equal(state.overlay.count, 39, 'the complete hidden branch becomes authority');
  equal(state.overlay.overlayActive, true, 'the overlay is installed only on proven evidence');
  equal(state.coreTurns.length, 39, 'Core is rebuilt atomically on the refreshed path');
  equal(state.derivation.derivation.ok, true, 'the refreshed current_node resolves the fork');
  equal(
    state.derivation.derivation.tailNodeId,
    LIVE_A39,
    'and lands on the proven terminal identity',
  );
});

// C. Refreshed post-click graph that is STILL genuinely ambiguous.
await fixture('a refreshed graph that proves the anchor still fails closed on real ambiguity', () => {
  const { runtime, state: held } = openStaleGraphSelection();
  // Proves the anchor, but stops above the tie: containment cannot elect
  // either equal route, so this is real ambiguity and must be terminal.
  runtime.api.retainAndPublishGraph(stage2mAmbiguousProvenGraph());
  const state = runtime.api.snapshot();
  equal(
    state.complete.branchTransactionStateCode,
    'fail-closed',
    'the transaction closes once the evidence is current',
  );
  equal(
    state.derivation.publicationDecision.reason,
    'fork-unresolved',
    'and reports the genuine derivation verdict, not graph-pending',
  );
  equal(state.overlay.count, 19, 'no ambiguous route ever becomes authority');
  equal(state.overlay.overlayActive, false, 'and no overlay is installed');
  equal(state.coreTurns.length, held.coreTurns.length, 'Core stays on the previous complete authority');
  // No retry loop: a further arrival cannot reopen a closed transaction.
  const before = staleTrace(state).length;
  runtime.api.retainAndPublishGraph(stage2mPostClickGraph());
  const after = runtime.api.snapshot();
  equal(
    after.complete.branchTransactionStateCode,
    'fail-closed',
    'a later arrival cannot reopen a terminally closed selection',
  );
  equal(after.overlay.count, 19, 'and cannot publish through it');
  ok(staleTrace(after).length >= before, 'the trace stays bounded and append-only');
});

// D. The hold is bounded, and evidence whose scope has drifted stays inert.
await fixture('the pending hold is bounded and drifted evidence stays inert', () => {
  const { runtime, state: held } = openStaleGraphSelection();
  // The refreshed graph now arrives AFTER the route generation moved on. It
  // must not mutate authority, install an overlay, or revive the selection.
  runtime.api.setGeneration(2);
  runtime.api.retainAndPublishGraph(stage2mPostClickGraph());
  const drifted = runtime.api.snapshot();
  equal(drifted.overlay.count, 19, 'a drifted arrival publishes nothing');
  equal(drifted.overlay.overlayActive, false, 'and installs no overlay');
  equal(drifted.coreTurns.length, held.coreTurns.length, 'Core is untouched by out-of-scope evidence');
  ok(drifted.acquisition.status !== 'proven', 'a drifted arrival can never prove a selection');
  ok(
    drifted.complete.branchTransactionStateCode !== 'published',
    'and can never publish the held transaction',
  );
  assertSafe(runtime);
});

// ---- Native client selected-chain authority --------------------------------
// Backend current_node is proven not to follow a native variant switch, so the
// page's own linearized selected-message chain is the manual-session authority.
// The fixture graph mirrors the live shape exactly: A17_SELECTED descends
// through structural tool/system nodes to its own q/a turns, with no shell
// alias on the route, so a chain of genuine product message ids is what a real
// ChatGPT client would expose -- production validation is never relaxed here.

// Root-to-leaf product message ids for a chosen terminal, read from the graph
// so no id sequence is ever hand-written.
function clientChainIdsTo(graph, terminalNodeId) {
  const byNodeId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const ids = [];
  let cursor = byNodeId.get(terminalNodeId);
  let guard = 0;
  while (cursor && guard < 4096) {
    if (cursor.productUser === true || cursor.productAnswer === true) ids.push(cursor.messageId);
    if (!cursor.parentId) break;
    cursor = byNodeId.get(cursor.parentId);
    guard += 1;
  }
  return ids.reverse();
}

// The graph's genuine conversation root. Live this is `client-created-root`,
// the leading wrapper of every host chain.
function graphRootId(graph) {
  const root = graph.nodes.find((node) => !node.parentId);
  return root ? root.nodeId : null;
}

// LIVE SHAPE A — an assistant turn rendered as MULTIPLE messages. The host
// names the turn by its FIRST message; the rendered answer, and the node the
// next question descends from, is the LAST product answer of that run.
//   Q -> firstAnswer -> (non-product) -> finalAnswer -> nextQ
function withMultiMessageAssistantRun(graph, answerMessageId, prefix) {
  const nodes = graph.nodes.map((node) => ({ ...node, childIds: node.childIds.slice() }));
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const first = byId.get(answerMessageId);
  const kids = first.childIds.slice();
  const midId = `${prefix}-run-mid`;
  const finalId = `${prefix}-run-final`;
  first.childIds = [midId];
  for (const kid of kids) byId.get(kid).parentId = finalId;
  nodes.push({
    nodeId: midId, parentId: first.nodeId, childIds: [finalId], role: 'tool', messageId: midId,
    productUser: false, productAnswer: false, branchShellAlias: false, stopped: false,
  }, {
    nodeId: finalId, parentId: midId, childIds: kids, role: 'assistant', messageId: finalId,
    productUser: false, productAnswer: true, branchShellAlias: false, stopped: false,
  });
  const frozen = Object.freeze(nodes.map((node) => Object.freeze({
    ...node, childIds: Object.freeze(node.childIds.slice()),
  })));
  return {
    graph: Object.freeze({ ...graph, nodeCount: frozen.length, nodes: frozen }),
    firstAnswerId: answerMessageId, finalAnswerId: finalId, midId,
  };
}

// LIVE SHAPE B — an assistant turn whose rendered-turn id is a NON-PRODUCT
// assistant node, exactly like live `80c1a30f -> 0d2fad64 -> 3a1e5e85`.
//   Q -> structuralHead(assistant, non-product) -> answer
function withStructuralAssistantTurnHead(graph, answerMessageId, prefix) {
  const nodes = graph.nodes.map((node) => ({ ...node, childIds: node.childIds.slice() }));
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const answer = byId.get(answerMessageId);
  const parent = byId.get(answer.parentId);
  const headId = `${prefix}-turn-head`;
  parent.childIds = parent.childIds.map((id) => (id === answer.nodeId ? headId : id));
  answer.parentId = headId;
  nodes.push({
    nodeId: headId, parentId: parent.nodeId, childIds: [answer.nodeId], role: 'assistant',
    messageId: headId, productUser: false, productAnswer: false, branchShellAlias: false, stopped: false,
  });
  const frozen = Object.freeze(nodes.map((node) => Object.freeze({
    ...node, childIds: Object.freeze(node.childIds.slice()),
  })));
  return {
    graph: Object.freeze({ ...graph, nodeCount: frozen.length, nodes: frozen }),
    headId, answerId: answerMessageId,
  };
}

// What the HOST array actually contains: one rendered-turn id per turn — the
// question id, then the FIRST node of that turn's assistant run (product or
// not) — read from the graph so no sequence is ever hand-written.
function renderedTurnIdsTo(graph, terminalNodeId) {
  const byNodeId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const chain = [];
  let cursor = byNodeId.get(terminalNodeId);
  let guard = 0;
  while (cursor && guard < 4096) { chain.unshift(cursor); cursor = byNodeId.get(cursor.parentId); guard += 1; }
  const ids = [];
  let open = false;
  for (const node of chain) {
    if (node.productUser === true) { ids.push(node.messageId); open = true; continue; }
    if (!open) continue;
    // first node of this turn's assistant run
    if (ids.length && ids[ids.length - 1] !== node.messageId
      && (node.productAnswer === true || String(node.role || '') === 'assistant'
        || node.branchShellAlias === true)) {
      const prev = byNodeId.get(chain[chain.indexOf(node) - 1]?.nodeId);
      if (prev && prev.productUser === true) ids.push(node.messageId);
    }
  }
  return ids;
}

// The terminal of the subtree that genuinely descends from A17_SELECTED.
function selectedSubtreeTerminal(graph, startMessageId = A17_CANONICAL, pick = 0) {
  const byNodeId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  let cursor = graph.nodes.find((node) => node.messageId === startMessageId) || null;
  let guard = 0;
  while (cursor && cursor.childIds.length && guard < 4096) {
    const index = Math.min(pick, cursor.childIds.length - 1);
    cursor = byNodeId.get(cursor.childIds[cursor.childIds.length > 1 ? index : 0]);
    guard += 1;
  }
  return cursor ? cursor.nodeId : null;
}

// Clone a subtree and attach the copy as a sibling, producing a real fork that
// only the client chain can resolve.
function cloneSubtreeAsSibling(graph, rootNodeId, newParentId, prefix) {
  const nodes = graph.nodes.map((node) => ({ ...node, childIds: node.childIds.slice() }));
  const byNodeId = new Map(nodes.map((node) => [node.nodeId, node]));
  const root = byNodeId.get(rootNodeId);
  const parent = byNodeId.get(newParentId);
  const descendants = [];
  const collect = (node) => {
    if (!node) return;
    descendants.push(node);
    for (const childId of node.childIds) collect(byNodeId.get(childId));
  };
  collect(root);
  const remap = new Map(descendants.map((node) => [node.nodeId, `${prefix}${node.nodeId}`]));
  for (const node of descendants) {
    nodes.push({
      ...node,
      nodeId: remap.get(node.nodeId),
      messageId: `${prefix}${node.messageId}`,
      parentId: node.nodeId === root.nodeId ? parent.nodeId : remap.get(node.parentId),
      childIds: node.childIds.map((childId) => remap.get(childId)),
    });
  }
  parent.childIds.push(remap.get(root.nodeId));
  const frozen = Object.freeze(nodes.map((node) => Object.freeze({
    ...node, childIds: Object.freeze(node.childIds.slice()),
  })));
  return Object.freeze({ ...graph, nodeCount: frozen.length, nodes: frozen });
}

// Deliberately varied fiber shapes. Nothing here may be load-bearing for the
// reader: not the element key suffix, not the hop count, not whether the chain
// sits in props or in a hook, not which hook index, not how deeply nested.
function clientChainElement(ids, {
  hops = 4, mode = 'hook', hookIndex = 0, nest = 0, key = '__reactFiber$cv38a',
} = {}) {
  let payload = ids;
  for (let index = 0; index < nest; index += 1) payload = { wrapped: payload };
  let fiber;
  if (mode === 'props') {
    fiber = { memoizedProps: { anythingAtAll: payload }, memoizedState: null, return: null };
  } else {
    let hook = { memoizedState: { deps: [[payload]] }, next: null };
    for (let index = 0; index < hookIndex; index += 1) {
      hook = { memoizedState: { unrelated: index }, next: hook };
    }
    fiber = { memoizedProps: {}, memoizedState: hook, return: null };
  }
  for (let index = 0; index < hops; index += 1) {
    fiber = { memoizedProps: {}, memoizedState: null, return: fiber };
  }
  const element = {};
  element[key] = fiber;
  return element;
}

function runClientChain(elements, graph) {
  const runtime = createRuntime();
  runtime.api.installClientChainDom(elements);
  runtime.api.configure(selectedHostIndex(19), graph);
  // Turn 17 answerVariants are [A17_CANONICAL, A17_SELECTED] and the index
  // displays A17_SELECTED (position 1), so 'previous' resolves the target to
  // A17_CANONICAL (position 0). That subtree is the forked one, and its leaves
  // are what a synthetic client chain may legitimately end on.
  runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 742,
    answerIds: [A17_SELECTED],
  }));
  runtime.api.publish(stage2mPrefixIndex(), 'client-chain-host-prefix');
  return { runtime, state: runtime.api.snapshot() };
}

const turnAt = (state, order) => (state.effective.turns || []).find((turn) => turn.order === order) || null;

// A. The chain carries the manually selected answer while current_node does not.
await fixture('a client selected chain outranks a stale current_node', () => {
  const graph = stage2mIdentityGraph();
  const ids = clientChainIdsTo(graph, LIVE_A39);
  ok(ids.includes(A17_CANONICAL), 'the chain carries the manually selected answer');
  ok(!ids.includes(A17_SELECTED), 'and never carries the outgoing one');
  const { runtime, state } = runClientChain(
    [clientChainElement(ids, { hops: 6, mode: 'hook', hookIndex: 3, key: '__reactFiber$aaa1' })],
    graph,
  );
  const chain = runtime.api.readClientChain(graph, A17_CANONICAL);
  equal(chain.ok, true, 'the chain validates against the identity graph');
  equal(chain.candidateCount, 1, 'exactly one graph-valid candidate wins');
  equal(runtime.api.clientChainProves(chain, A17_CANONICAL), true, 'and proves the trusted anchor');
  equal(runtime.api.clientChainProves(chain, A17_SELECTED), false, 'it proves only what it contains');
  equal(state.acquisition.status, 'proven', 'acquisition proves from the chain');
  equal(state.overlay.overlayActive, true, 'the overlay installs on client-chain proof');
  equal(turnAt(state, 17).primaryAId, A17_CANONICAL, 'the anchor shows the manually selected answer');
  equal(
    state.complete.branchTransactionStateCode,
    'published',
    'and the transaction publishes despite the stale current_node',
  );
});

// B. A downstream QUESTION-EDIT fork is decided by the chain alone.
await fixture('downstream question-edit selections are taken from the client chain', () => {
  // Two equal terminal-complete question edits under canonical-a-25: only the
  // client chain can say which one the user is on.
  const graph = stage2mAmbiguousGraph();
  const ids = clientChainIdsTo(graph, LIVE_A39);
  ok(ids.includes(LIVE_Q26), 'the chain names the selected question edit');
  ok(!ids.some((id) => String(id).startsWith('stage2m-tie-')), 'and never the unselected sibling');

  // Without the chain this exact fork is unresolvable -- the live defect.
  const blind = runClientChain([], graph);
  equal(blind.state.overlay.overlayActive, false, 'no chain, no resolution of the question-edit fork');

  const { state } = runClientChain(
    [clientChainElement(ids, { hops: 1, mode: 'props', key: '__reactFiber$zz9' })],
    graph,
  );
  equal(state.overlay.overlayActive, true, 'the chain resolves the question-edit fork');
  equal(turnAt(state, 26).qId, LIVE_Q26, 'the exact selected qId comes from the chain');
  ok(
    !(state.effective.turns || []).some((turn) => String(turn.qId || '').startsWith('stage2m-tie-')),
    'the unselected question-edit subtree never appears',
  );

  // LIVE SHAPE (2026-08-08 acceptance). The host array is a sequence of
  // RENDERED TURN ids, not a product-message ancestry path: a leading
  // conversation-root wrapper, then one id per rendered turn. An assistant turn
  // is named by the FIRST node of its run, while the rendered answer — and the
  // node the next question descends from — is the LAST product answer of that
  // run. Live: 37ab747d -> 16e81a3e, and 80c1a30f -> 3a1e5e85. Both shapes are
  // reproduced here on the same forked graph, so the projection is proven while
  // the downstream question-edit fork still has to be decided by the chain.
  const multi = withMultiMessageAssistantRun(graph, 'canonical-a-2', 'cv38-t2');
  const shaped = withStructuralAssistantTurnHead(multi.graph, LIVE_A39, 'cv38-t39');
  const liveGraph = shaped.graph;
  const rootId = graphRootId(liveGraph);
  ok(rootId, 'the fixture graph owns a real conversation root');

  const rendered = renderedTurnIdsTo(liveGraph, LIVE_A39);
  ok(rendered.includes(multi.firstAnswerId), 'the host names the multi-message turn by its FIRST message');
  ok(!rendered.includes(multi.finalAnswerId), 'and not by the rendered final answer');
  ok(rendered.includes(shaped.headId), 'the host names the final turn by its NON-PRODUCT run head');
  ok(!rendered.includes(LIVE_A39), 'and not by the product answer that turn actually renders');

  const hostShaped = [rootId, ...rendered];
  const expected = rendered.map((id) => {
    if (id === multi.firstAnswerId) return multi.finalAnswerId;
    if (id === shaped.headId) return LIVE_A39;
    return id;
  });

  const live = runClientChain(
    [clientChainElement(hostShaped, { hops: 3, mode: 'hook', hookIndex: 2, key: '__reactFiber$live39' })],
    liveGraph,
  );
  const liveChain = live.runtime.api.readClientChain(liveGraph, A17_CANONICAL);
  equal(liveChain.ok, true, 'a rendered-turn host chain is accepted');
  equal(liveChain.reason, null, 'and the reader names no refusal');
  equal(liveChain.candidateCount, 1, 'exactly one projected route survives');
  equal(liveChain.messageIds.join('|'), expected.join('|'), 'the projection is the H2O qId/primaryAId route');
  equal(liveChain.messageIds.includes(rootId), false, 'the conversation root is never a turn');
  equal(liveChain.messageIds.includes(multi.firstAnswerId), false, 'the run-opening message is not the rendered answer');
  equal(liveChain.messageIds.includes(multi.midId), false, 'the non-product node inside the run is never a turn');
  ok(liveChain.messageIds.includes(multi.finalAnswerId), 'the LAST product answer of the run is');
  equal(liveChain.messageIds.includes(shaped.headId), false, 'the structural run head is never a turn');
  ok(liveChain.messageIds.includes(LIVE_A39), 'and the turn it heads is no longer dropped');
  equal(liveChain.messageIds[liveChain.messageIds.length - 1], LIVE_A39, 'the terminal is the final rendered answer');
  equal(
    live.runtime.api.clientChainProves(liveChain, A17_CANONICAL),
    true,
    'the trusted target is proven from the projected route',
  );
  equal(live.state.overlay.overlayActive, true, 'whole-path derivation publishes from the rendered-turn chain');
  equal(turnAt(live.state, 17).primaryAId, A17_CANONICAL, 'the anchor carries the manual selection');
  equal(turnAt(live.state, 26).qId, LIVE_Q26, 'the downstream fork winner is the one the chain names');
  ok(
    !(live.state.effective.turns || []).some((turn) => String(turn.qId || '').startsWith('stage2m-tie-')),
    'and the rival fork never appears',
  );
  ok(
    !(live.state.effective.turns || []).some(
      (turn) => turn.qId === rootId || turn.primaryAId === rootId
        || turn.qId === multi.midId || turn.primaryAId === multi.midId
        || turn.qId === shaped.headId || turn.primaryAId === shaped.headId,
    ),
    'no wrapper or run-internal node is ever handed to derivation as a turn',
  );

  // Equivalent React copies naming the SAME route are one selection, not two.
  const dedup = runClientChain([
    clientChainElement(hostShaped, { hops: 2, key: '__reactFiber$d1' }),
    clientChainElement(rendered, { hops: 7, mode: 'props', key: '__reactFiber$d2' }),
  ], liveGraph);
  const dedupChain = dedup.runtime.api.readClientChain(liveGraph, A17_CANONICAL);
  equal(dedupChain.ok, true, 'the same projected route found twice is one route');
  equal(dedupChain.candidateCount, 1, 'deduped on the projected sequence');

  // SAFETY: a skipped user turn, and a run-internal node promoted to a turn.
  const skipped = rendered.filter((id) => id !== LIVE_Q26);
  equal(
    runClientChain([clientChainElement([rootId, ...skipped])], liveGraph)
      .runtime.api.readClientChain(liveGraph, A17_CANONICAL).ok,
    false,
    'a skipped user turn is rejected',
  );
  const reordered = rendered.slice();
  [reordered[2], reordered[4]] = [reordered[4], reordered[2]];
  equal(
    runClientChain([clientChainElement([rootId, ...reordered])], liveGraph)
      .runtime.api.readClientChain(liveGraph, A17_CANONICAL).ok,
    false,
    'a reordered rendered-turn sequence is rejected',
  );
});

// C. A downstream ANSWER-REGENERATION fork is decided by the chain alone.
await fixture('downstream answer-regeneration selections are taken from the client chain', () => {
  // Deliberately NOT the longest route: ranking would elect LIVE_A39, so a
  // path ending here can only have come from the chain.
  const graph = stage2mIdentityGraph();
  const shorterTerminal = 'b01fc97b-ccf3-4015-8742-9b846740ffea';
  const ids = clientChainIdsTo(graph, shorterTerminal);
  ok(ids.includes(shorterTerminal), 'the chain names the selected regeneration terminal');
  ok(!ids.includes(LIVE_A39), 'and not the longer sibling ranking would have picked');

  const blind = runClientChain([], graph);
  equal(blind.state.overlay.overlayActive, false, 'no chain, no resolution of the regeneration fork');

  const { state } = runClientChain(
    [clientChainElement(ids, { hops: 11, mode: 'hook', hookIndex: 0, nest: 2, key: '__reactFiber$q7' })],
    graph,
  );
  equal(state.overlay.overlayActive, true, 'the chain resolves the regeneration fork');
  equal(turnAt(state, 26).primaryAId, LIVE_A26, 'the exact selected primaryAId comes from the chain');
  const tail = state.effective.turns[state.effective.turns.length - 1];
  equal(tail.primaryAId, shorterTerminal, 'the terminal regeneration is the chain-selected one');
  ok(
    !(state.effective.turns || []).some((turn) => turn.primaryAId === LIVE_A39),
    'the longer ranked route is not published anywhere',
  );
});

// D. Unmounted downstream turns: only the anchor row is modelled, everything
//    below it resolves from the chain.
await fixture('unmounted downstream turns still resolve from the client chain', () => {
  const graph = stage2mIdentityGraph();
  const shortTerminal = 'stage2m-second-a-27';
  const ids = clientChainIdsTo(graph, shortTerminal);
  const { state } = runClientChain(
    [clientChainElement(ids, { hops: 17, mode: 'hook', hookIndex: 5, key: '__reactFiber$deep' })],
    graph,
  );
  equal(state.overlay.overlayActive, true, 'the route resolves with no mounted downstream evidence');
  const tail = (state.effective.turns || [])[state.effective.turns.length - 1];
  equal(tail.primaryAId, shortTerminal, 'the published route ends exactly where the chain does');
  // Turn 20 is a legitimate noAnswer turn, so 27 turns carry 53 message ids,
  // not 54. Compare identities directly instead of counting: exact membership,
  // exact order, nothing extra, nothing omitted.
  const publishedIds = [];
  for (const turn of state.effective.turns) {
    publishedIds.push(turn.qId);
    if (turn.primaryAId) publishedIds.push(turn.primaryAId);
  }
  equal(
    publishedIds.join('|'),
    ids.join('|'),
    'every chain turn is present, in order, and no other',
  );
  equal(turnAt(state, 17).primaryAId, A17_CANONICAL, 'and still carries the manual selection');
});

// E. Missing, unknown, broken or ambiguous chains fail closed with no guess.
await fixture('missing, ambiguous or broken client chains fail closed', () => {
  const base = stage2mIdentityGraph();
  const graph = stage2mAmbiguousGraph();
  const ids = clientChainIdsTo(graph, LIVE_A39);

  const absent = runClientChain([], graph);
  equal(absent.runtime.api.readClientChain(graph, A17_CANONICAL).ok, false, 'no chain, no proof');
  equal(absent.runtime.api.readClientChain(graph, A17_CANONICAL).reason, 'client-chain-unavailable', 'named exactly');
  equal(absent.state.overlay.overlayActive, false, 'and nothing is published');

  // Two DIFFERENT fully graph-valid chains cannot both be the native selection.
  const rival = clientChainIdsTo(graph, `stage2m-tie-${LIVE_A39}`);
  ok(rival.join('|') !== ids.join('|'), 'the rival chain is a genuinely different valid route');
  ok(rival.includes(A17_CANONICAL), 'and also passes the anchor');
  const ambiguous = runClientChain(
    [clientChainElement(ids, { hops: 2 }), clientChainElement(rival, { hops: 5, mode: 'props' })],
    graph,
  );
  const ambiguousChain = ambiguous.runtime.api.readClientChain(graph, A17_CANONICAL);
  equal(ambiguousChain.ok, false, 'two valid candidates cannot elect a winner');
  equal(ambiguousChain.reason, 'client-chain-ambiguous', 'and the refusal is named exactly');
  equal(ambiguous.state.overlay.overlayActive, false, 'ambiguity publishes nothing');

  // One unknown id disqualifies the whole array -- never silently trimmed.
  const unknown = runClientChain(
    [clientChainElement(ids.slice(0, 8).concat(['not-a-known-message-id']))], graph,
  );
  equal(unknown.runtime.api.readClientChain(graph, A17_CANONICAL).ok, false, 'unknown ids are rejected');
  equal(unknown.state.overlay.overlayActive, false, 'and publish nothing');

  // Linkage break: a real prefix with downstream turns spliced out.
  const broken = ids.slice(0, 6).concat(ids.slice(9));
  const brokenRun = runClientChain([clientChainElement(broken)], graph);
  equal(brokenRun.runtime.api.readClientChain(graph, A17_CANONICAL).ok, false, 'broken linkage is rejected');
  equal(brokenRun.state.overlay.overlayActive, false, 'and publishes nothing');

  // A valid chain that does not contain the trusted anchor proves nothing.
  const foreign = clientChainIdsTo(base, 'canonical-a-16');
  const foreignRun = runClientChain([clientChainElement(foreign)], graph);
  equal(foreignRun.runtime.api.readClientChain(graph, A17_CANONICAL).ok, false, 'an anchorless chain is refused');
  equal(foreignRun.state.overlay.overlayActive, false, 'and cannot publish');

  // ---- Rendered-turn ids are legal now; the fail-closed contract is not ----
  const rootId = graphRootId(graph);

  // A UUID-shaped id this graph does not own still destroys the whole array,
  // even when every other entry — the conversation root included — is real.
  const unknownUuid = runClientChain([clientChainElement(
    [rootId, ...ids.slice(0, 8), '00000000-0000-4000-8000-000000000999'],
  )], graph);
  equal(
    unknownUuid.runtime.api.readClientChain(graph, A17_CANONICAL).ok,
    false,
    'an unknown UUID still rejects the whole array',
  );
  equal(unknownUuid.state.overlay.overlayActive, false, 'and publishes nothing');

  // The exact pre-click live array: the conversation id repeated. It is not a
  // graph node, and it is explicitly barred, so it can never become a chain.
  const chatIdRun = runClientChain([clientChainElement([CHAT_ID, CHAT_ID])], graph);
  equal(
    chatIdRun.runtime.api.readClientChain(graph, A17_CANONICAL).reason,
    'client-chain-unavailable',
    'the repeated conversation-id array stays rejected',
  );

  // The wrapper alone names no turn.
  const rootOnly = runClientChain([clientChainElement([rootId, rootId])], graph);
  equal(
    rootOnly.runtime.api.readClientChain(graph, A17_CANONICAL).ok,
    false,
    'the conversation root alone is not a route',
  );

  // A route that does not OPEN on a question is not a rendered route.
  const headless = runClientChain([clientChainElement(ids.slice(1))], graph);
  equal(
    headless.runtime.api.readClientChain(graph, A17_CANONICAL).ok,
    false,
    'a chain that does not open on a question is rejected',
  );

  // Two genuinely DIFFERENT projected routes stay ambiguous, each carrying the
  // legitimate conversation-root wrapper.
  const wrappedRivals = runClientChain([
    clientChainElement([rootId, ...ids], { hops: 2, key: '__reactFiber$r1' }),
    clientChainElement([rootId, ...rival], { hops: 5, mode: 'props', key: '__reactFiber$r2' }),
  ], graph);
  equal(
    wrappedRivals.runtime.api.readClientChain(graph, A17_CANONICAL).reason,
    'client-chain-ambiguous',
    'different projected routes stay ambiguous under the root wrapper',
  );
  equal(wrappedRivals.state.overlay.overlayActive, false, 'and publish nothing');

  // The SAME route discovered at several React locations, wrapped differently
  // each time, is ONE selection — live it was found 137 times.
  const dedup = runClientChain([
    clientChainElement([rootId, ...ids], { hops: 2, key: '__reactFiber$w1' }),
    clientChainElement(ids, { hops: 6, mode: 'props', key: '__reactFiber$w2' }),
    clientChainElement(ids, { hops: 13, mode: 'hook', hookIndex: 1, key: '__reactFiber$w4' }),
  ], graph);
  const dedupChain = dedup.runtime.api.readClientChain(graph, A17_CANONICAL);
  equal(dedupChain.ok, true, 'equivalent wrappers are one route, not ambiguity');
  equal(dedupChain.candidateCount, 1, 'deduped on the projected sequence');
  // The projected route speaks H2O's own turn language, which includes the
  // canonical system-branch-root promotion: turn 26's rendered identity is the
  // owned shell alias LIVE_A26, not the product node beneath it. Fixture C
  // already pins that same primaryAId from the effective path.
  const expectedRoute = ids.map((id) => (id === LIVE_Q26_PRODUCT_FINAL ? LIVE_A26 : id));
  equal(
    dedupChain.messageIds.join('|'),
    expectedRoute.join('|'),
    'and it is the expected projected route in H2O turn language',
  );
  equal(dedupChain.messageIds.includes(LIVE_A26), true, 'the promoted shell alias is the turn-26 identity');
  equal(dedupChain.messageIds.includes(LIVE_Q26_PRODUCT_FINAL), false, 'and the product node beneath it is not');
  equal(dedup.state.overlay.overlayActive, true, 'so the selected route still publishes');

  assertSafe(brokenRun.runtime);
});

// F. The reload/default rule is untouched: with no trusted manual transaction,
//    an installed chain must not influence latest-created-terminal authority.
await fixture('an installed client chain never disturbs the reload default rule', () => {
  const graph = stage2mIdentityGraph();
  const ids = clientChainIdsTo(graph, LIVE_A39);
  const runtime = createRuntime();
  runtime.api.installClientChainDom([clientChainElement(ids)]);
  runtime.api.configure(selectedHostIndex(19), graph);
  const before = runtime.api.snapshot();
  equal(before.acquisition.status, 'inactive', 'no manual intent, no acquisition');
  equal(before.overlay.overlayActive, false, 'and no overlay from a chain alone');
  runtime.api.publish(stage2mPrefixIndex(), 'default-rule-host-prefix');
  const after = runtime.api.snapshot();
  equal(after.overlay.overlayActive, false, 'a host publish without a trusted click installs no overlay');
  equal(after.overlay.source, 'canonical', 'the default rule still owns the effective path');
  equal(after.acquisition.status, 'inactive', 'and no acquisition is created by a chain alone');
  assertSafe(runtime);
});

await fixture('the same prefix with two equal terminal-complete routes fails closed', () => {
  const runtime = createRuntime();
  // Real ambiguity requires proven evidence: a graph whose current_node does
  // NOT prove the selected anchor is pre-click, and is now handed to the
  // bounded refresh instead of being treated as a verdict.
  runtime.api.configure(selectedHostIndex(19), stage2mAmbiguousProvenGraph());
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 710,
    answerIds: [A17_SELECTED],
  })), true, 'the exact branch transaction opens');
  runtime.api.apply(selectedPathRead({ canonical: true, count: 26 }), 'ambiguous-branch-render');
  runtime.api.publish(stage2mPrefixIndex(), 'ambiguous-host-prefix');
  const blocked = runtime.api.snapshot();
  equal(blocked.overlay.count, 19, 'the previous complete authority remains active');
  ok(blocked.coreTurns.length !== 26, 'Core never accepts the 26-turn prefix');
  equal(blocked.complete.branchTransactionStateCode, 'fail-closed', 'the transaction becomes fail-closed');
  equal(blocked.derivation.publicationDecision.published, false, 'the prefix is never published');
  equal(blocked.derivation.publicationDecision.reason, 'fork-unresolved', 'equal complete terminal routes are genuinely ambiguous');
  equal(runtime.api.suppressesLiveAppend(), true, 'fail-closed ownership still blocks foreign append');
  const beforeSuppressed = Number(blocked.complete.branchTransitionSuppressedLiveAppendCount || 0);
  const turns = runtime.api.commitForeignDraft();
  const after = runtime.api.snapshot();
  equal(turns.length, 19, 'fail-closed commit rejects the foreign mounted Turn 20');
  equal(after.coreTurns.length, 19, 'Core remains on the previous complete authority');
  equal(after.ledgerTurns.length, 19, 'Ledger remains on the same complete membership');
  equal(
    after.complete.branchTransitionSuppressedLiveAppendCount,
    beforeSuppressed + 1,
    'the foreign append increments the suppression diagnostic',
  );
  const beforePendingSuppressed = after.complete.branchTransitionSuppressedLiveAppendCount;
  const pendingTurns = runtime.api.commitPendingForeignDraft();
  const afterPending = runtime.api.snapshot();
  equal(pendingTurns.length, 19, 'fail-closed containment also rejects the pending canonical Turn 20 lane');
  equal(afterPending.coreTurns.length, 19, 'pending-draft projection cannot bypass transaction containment');
  ok(
    afterPending.complete.branchTransitionSuppressedLiveAppendCount > beforePendingSuppressed,
    'pending foreign membership increments the same bounded suppression diagnostic',
  );
  runtime.api.publish(stage2mPrefixIndex(), 'post-failure-host-prefix');
  equal(runtime.api.snapshot().canonical.turns.length, 19, 'fail-closed rejects later host prefixes too');
  assertSafe(runtime);
});

await fixture('Stage 2C-2m truncation and partial-publication mutations are killed behaviorally', () => {
  // Publication now requires a post-click current_node, so the derivation
  // mutations below are measured against the refreshed graph. The derivation
  // under test is identical — only the evidence that permits publication moved.
  const execute = (program, graph = stage2mPostClickGraph()) => {
    const runtime = createRuntime(program);
    runtime.api.configure(selectedHostIndex(19), graph);
    runtime.api.capture(branchEvent({
      direction: 'previous',
      timeStamp: 715,
      answerIds: [A17_SELECTED],
    }));
    runtime.api.publish(stage2mPrefixIndex(), 'stage2m-mutation-prefix');
    return { runtime, state: runtime.api.snapshot() };
  };
  const production = execute(CORE_PROGRAM);
  equal(production.state.overlay.count, 39, 'production derives the complete hidden branch');
  equal(production.state.coreTurns.length, 39, 'production atomically rebuilds Core');
  const productionDerivationTurns = production.state.derivation?.derivation?.turns || [];
  equal(productionDerivationTurns.length, 39, 'the derivation record covers every derived turn');

  const terminalProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasDeriveSelectedPath', (body) => body.replace(
    "const selectedQuestion = chooseGraphCandidate(sameSelectedBranch, questionNode, 'selected-answer-continuation');",
    'const selectedQuestion = sameSelectedBranch[0] || null;',
  ));
  // The truncated route now fails downstream native parity as well, so the
  // mutant cannot publish at all. Discrimination is preserved and strengthened:
  // production reaches the complete 39 route, the mutant reaches no authority.
  const truncated = execute(terminalProgram).state;
  ok(truncated.overlay.count !== 39, 'restoring the mounted/first Turn-26 truncation is killed');
  ok(truncated.overlay.count !== 26, 'and the truncated route never becomes authority');

  const mountedProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasDeriveSelectedPath', (body) => body.replace(
    "const chooseGraphCandidate = (candidates, contextNode = null, phase = 'graph-fork') => {",
    "const chooseGraphCandidate = (candidates, contextNode = null, phase = 'graph-fork') => { if (!mountedEvidence.size) return null;",
  ));
  ok(execute(mountedProgram).state.overlay.count !== 39, 'requiring mounted evidence after 26 is killed');

  const staleCurrentNodeProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasDeriveSelectedPath', (body) => body
    .replace('if (currentNodeInsideSelectedAnswer) {', 'if (currentGraphNode) {')
    .replace(
      'if (selectedMatches.length === 1) {',
      'if (!selectedMatches.length) return unique[0];\n        if (selectedMatches.length === 1) {',
    ));
  // This mutation's harm is deriving a truncated 26-turn route from a stale
  // current_node that sits OUTSIDE the selected-answer subtree, so it is still
  // exercised against the PRE-CLICK graph — that is the only shape in which a
  // stale pointer exists. Under the new contract the harm can no longer reach
  // authority at all: a pre-click current_node fails downstream native parity,
  // so neither production nor the mutant may publish a route.
  const stale = execute(staleCurrentNodeProgram, stage2mIdentityGraph());
  ok(stale.state.overlay.count !== 39, 'a stale-current_node route never becomes authority');
  ok(stale.state.overlay.count !== 26, 'the truncated 26-turn route is never published');
  equal(stale.state.overlay.overlayActive, false, 'stale current_node cannot install an overlay');
  equal(
    execute(staleCurrentNodeProgram).state.overlay.count,
    39,
    'with a proven post-click current_node the complete route still derives',
  );

  const ambiguousTerminalProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasDeriveSelectedPath', (body) => body.replace(
    'const winner = maximumLogicalRoutes.size === 1 && maximumCandidateIds.size === 1\n        ? maxima[0].entry.candidate\n        : null;',
    'const winner = maxima[0]?.entry.candidate || null;',
  ));
  // Two independent protections now stand between an ambiguous fork and
  // authority, and each is proven on its own terms.
  //
  // (1) DERIVATION AMBIGUITY FAIL-CLOSED -- where this mutation is killed.
  //     The pre-click ambiguous graph carries two equal terminal-complete
  //     routes under canonical-a-25 and the host has selected NEITHER, so
  //     production must refuse to elect one. The mutant takes maxima[0] and
  //     wrongly resolves a complete route the host never chose.
  const productionAmbiguous = execute(CORE_PROGRAM, stage2mAmbiguousGraph()).state;
  const productionDerivation = productionAmbiguous.derivation?.derivation || null;
  equal(productionDerivation?.ok, false, 'production derivation fails closed on the equal-terminal tie');
  equal(productionDerivation?.reason, 'fork-unresolved', 'the tie is reported as an unresolved fork');
  equal(productionDerivation?.pathLength, 0, 'production returns no path for an unresolved fork');
  equal(
    productionDerivation?.fork?.decisionReason,
    'equal-global-terminal-complete-maximum',
    'the recorded fork decision names the equal-maximum tie',
  );
  equal(productionDerivation?.fork?.winnerNodeId, null, 'no candidate is elected from the tie');
  const tiedRejections = (productionDerivation?.fork?.candidates || [])
    .filter((candidate) => candidate.rejectionReason === 'equal-terminal-complete-route')
    .map((candidate) => candidate.nodeId);
  equal(tiedRejections.length, 2, 'both equal terminal-complete candidates are rejected');
  ok(
    tiedRejections.includes(LIVE_Q26) && tiedRejections.includes(`stage2m-tie-${LIVE_Q26}`),
    'the original route and its equal-length clone are the rejected pair',
  );

  const mutantAmbiguous = execute(ambiguousTerminalProgram, stage2mAmbiguousGraph()).state;
  const mutantDerivation = mutantAmbiguous.derivation?.derivation || null;
  equal(mutantDerivation?.ok, true, 'accepting one of two equal terminal-complete routes is killed');
  equal(mutantDerivation?.pathLength, 39, 'the mutant resolves a full route the host never selected');
  equal(
    mutantDerivation?.fork?.decisionReason,
    'unique-global-terminal-complete-maximum',
    'the mutant misreports the tie as a unique maximum',
  );

  // (2) PUBLICATION DOWNSTREAM-NATIVE PARITY FAIL-CLOSED -- independent of (1).
  //     current_node proves neither route, so NEITHER production nor the mutant
  //     may reach authority. The mutant's wrongly-resolved path is caught a
  //     second time, at the publication gate, with no overlay installed.
  equal(productionAmbiguous.overlay.count, 19, 'production publishes no ambiguous route');
  equal(productionAmbiguous.overlay.overlayActive, false, 'and installs no overlay for it');
  equal(mutantAmbiguous.overlay.count, 19, 'an unselected resolved route is still blocked by native parity');
  equal(mutantAmbiguous.overlay.overlayActive, false, 'the mutant reaches no overlay either');

  // The tie is a genuine ambiguity only while the host has selected neither
  // route. Once current_node proves one of them the fork is legitimately
  // resolved by subtree containment, and the complete route publishes.
  equal(
    execute(CORE_PROGRAM, stage2mPostClickAmbiguousGraph()).state.overlay.count,
    39,
    'a proving current_node resolves the tie by containment rather than by veto',
  );

  const shorterAmbiguityVetoProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasDeriveSelectedPath', (body) => body.replace(
    'if (!terminalCandidates.length) {',
    'if (ranked.some((entry) => entry.proof.ok !== true)) {',
  ));
  // Same two-layer split. This mutation restores the historical over-broad
  // veto in which ANY ranked candidate lacking a terminal proof aborted the
  // whole fork, so a merely SHORTER sibling truncated the route. Its harm
  // exists only where the fork must be settled by ranking; once current_node
  // sits inside the target subtree the fork resolves by containment and the
  // veto is never reached, so the discriminating shape is the pre-click graph.
  const productionRanked = execute(CORE_PROGRAM, stage2mIdentityGraph()).state;
  const productionRankedDerivation = productionRanked.derivation?.derivation || null;
  equal(productionRankedDerivation?.ok, true, 'production resolves the fork by ranking alone');
  equal(productionRankedDerivation?.pathLength, 39, 'and derives the complete route without containment');
  equal(
    productionRankedDerivation?.fork?.decisionReason,
    'unique-global-terminal-complete-maximum',
    'the longest terminal-complete route wins the fork outright',
  );
  equal(
    (productionRankedDerivation?.fork?.candidates || [])
      .filter((candidate) => candidate.rejectionReason === 'shorter-terminal-complete-route').length,
    1,
    'the shorter sibling merely loses; it does not veto',
  );

  const vetoed = execute(shorterAmbiguityVetoProgram, stage2mIdentityGraph()).state;
  const vetoedDerivation = vetoed.derivation?.derivation || null;
  equal(vetoedDerivation?.ok, false, 'restoring the exact live shorter-candidate veto is killed');
  equal(vetoedDerivation?.pathLength, 0, 'the veto destroys the whole fork rather than one candidate');
  equal(
    vetoedDerivation?.fork?.decisionReason,
    'candidate-terminal-proof-unavailable',
    'the restored veto is recorded as a missing-proof abort',
  );

  // Publication parity is independent of the ranking outcome: with no proving
  // current_node neither the correct nor the vetoed derivation reaches authority.
  equal(productionRanked.overlay.count, 19, 'a correct pre-click derivation still publishes nothing');
  equal(vetoed.overlay.count, 19, 'and neither does the vetoed one');
  equal(
    execute(shorterAmbiguityVetoProgram).state.overlay.count,
    39,
    'post-click containment settles the fork before the veto can be reached',
  );

  const shellAliasProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasDeriveSelectedPath', (body) => body.replace(
    'const primaryNode = selectedBranchRoot?.branchShellAlias === true',
    'const primaryNode = selectedBranchRoot?.branchShellAlias === false',
  ));
  // This mutation corrupts identity rather than length: the route still spans
  // 39 turns, but Turn 26 adopts the product answer BENEATH the branch shell
  // instead of the graph-proven shell itself. The old assertion read the
  // corrupted id off the published overlay; publication is now blocked by
  // native parity, so effective.turns[25] would be undefined and the check
  // would pass vacuously. Read the id from the derivation instead, where the
  // mutation actually lands, and assert the parity block separately.
  const shellAliasState = execute(shellAliasProgram).state;
  const shellAliasDerivation = shellAliasState.derivation?.derivation || null;
  equal(shellAliasDerivation?.ok, true, 'shell-alias mutation still reaches the selected terminal');
  equal(shellAliasDerivation?.pathLength, 39, 'the corrupted route is the same length as the correct one');
  equal(
    productionDerivationTurns[25]?.primaryAId,
    LIVE_A26,
    'production adopts the graph-proven branch shell identity for Turn 26',
  );
  equal(
    shellAliasDerivation?.turns?.[25]?.primaryAId,
    LIVE_Q26_PRODUCT_FINAL,
    'discarding the graph-proven branch shell identity is killed',
  );
  ok(
    shellAliasDerivation?.turns?.[25]?.primaryAId !== LIVE_A26,
    'the mutant never recovers the shell identity by another route',
  );
  equal(shellAliasState.overlay.count, 19, 'a shell-identity-corrupted route fails downstream native parity');
  equal(shellAliasState.overlay.overlayActive, false, 'and installs no overlay');

  const prefixProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasPublishCompleteIndex', (body) => body
    .replace(
      'if (transactionDecision.handled) return chatAtlasNotifyCompleteIndexState();',
      'if (false && transactionDecision.handled) return chatAtlasNotifyCompleteIndexState();',
    )
    .replace(
      '&& chatAtlasIndexIsStrictPrefixOf(envelope, effective)',
      '&& false',
    ));
  equal(execute(prefixProgram).state.canonical.turns.length, 26, 'longest-prefix publication mutation is exposed');

  const frozenPathProgram = mutateCoreFunction(CORE_SOURCE, 'chatAtlasBranchTransactionPublicationDecision', (body) => body.replace(
    'Number(candidate.derivedTargetCount) !== derived.path.length',
    'false',
  ));
  const runFrozenMismatch = (program) => {
    const runtime = createRuntime(program);
    // Post-click graph: this mutation lives in the publication decision, so
    // publication has to be reachable for its harm to exist at all.
    runtime.api.configure(selectedHostIndex(19), stage2mPostClickGraph());
    runtime.api.capture(branchEvent({
      direction: 'previous',
      timeStamp: 716,
      answerIds: [A17_SELECTED],
    }));
    const intent = runtime.api.snapshot().intent;
    runtime.api.patchIntent({
      returnTargetCandidate: Object.freeze({
        ...intent.returnTargetCandidate,
        derivedTargetCount: 26,
      }),
    });
    runtime.api.publish(stage2mPrefixIndex(), 'frozen-path-mismatch');
    return runtime.api.snapshot();
  };
  const frozenProduction = runFrozenMismatch(CORE_PROGRAM);
  equal(frozenProduction.overlay.count, 19, 'changed frozen path fails closed');
  equal(
    frozenProduction.complete.branchTransactionStateCode,
    'fail-closed',
    'the frozen-path mismatch closes the transaction rather than leaving it pending',
  );
  equal(
    frozenProduction.complete.branchTransactionReason,
    'branch-transaction-frozen-path-mismatch',
    'and names the mismatch as the reason',
  );
  equal(runFrozenMismatch(frozenPathProgram).overlay.count, 39, 'ignoring frozen path count is killed');

  const failureReleaseProgram = mutateCoreFunction(
    CORE_SOURCE,
    'chatAtlasBranchTransactionPublicationDecision',
    (body) => body.replace(
      "'fail-closed',\n        reason,",
      "'published',\n        reason,",
    ),
  );
  const released = execute(failureReleaseProgram, stage2mAmbiguousProvenGraph());
  equal(
    released.state.complete.branchTransactionStateCode,
    'published',
    'releasing transaction ownership after path failure is exposed',
  );

  equal(production.state.ledgerTurns.length, 39, 'Ledger cannot consume a different partial membership');
  equal(production.state.derivation.publicationDecision.acceptedCount, 39, 'only complete publication closes the transaction');
  equal(production.state.effective.turns[19].noAnswer, true, 'the valid no-answer order 20 survives');
  equal(production.state.effective.turns[25].qId, LIVE_Q26, 'order 26 identity remains exact');
  equal(production.state.effective.turns[26].qId, LIVE_Q27, 'order 27 identity remains exact and unmounted');
  equal(production.runtime.counters.forbiddenNetworkCalls, 0, 'derivation uses no navigation or scrolling');

  const failClosedAppendProgram = mutateCoreFunction(
    CORE_SOURCE,
    'chatAtlasBranchTransitionSuppressesLiveAppend',
    (body) => body.replace(
      "if (transaction?.state === 'pending' || transaction?.state === 'fail-closed') return true;",
      "if (transaction?.state === 'pending') return true;\n      if (transaction?.state === 'fail-closed') return false;",
    ),
  );
  const leaking = execute(failClosedAppendProgram, stage2mAmbiguousProvenGraph());
  leaking.runtime.api.commitForeignDraft();
  equal(leaking.runtime.api.snapshot().coreTurns.length, 20, 'removing fail-closed suppression reproduces the fake Turn 20');

  const pendingLeakProgram = mutateCoreFunction(
    CORE_SOURCE,
    'chatAtlasCompleteIndexPendingCanonicalDrafts',
    (body) => body.replace(
      'if (chatAtlasBranchTransitionSuppressesLiveAppend()) {',
      'if (false && chatAtlasBranchTransitionSuppressesLiveAppend()) {',
    ),
  );
  const pendingLeak = execute(pendingLeakProgram, stage2mAmbiguousProvenGraph());
  pendingLeak.runtime.api.commitPendingForeignDraft();
  equal(
    pendingLeak.runtime.api.snapshot().coreTurns.length,
    20,
    'allowing the pending canonical lane reproduces the same fake Turn 20',
  );
});

await fixture('retained-graph publication hook mutation is killed by repeated-switch behavior', async () => {
  const execute = (program) => {
    const runtime = createRuntime(program);
    runtime.api.configure(selectedHostIndex(19), null);
    runtime.api.capture(branchEvent({
      direction: 'previous',
      timeStamp: 717,
      answerIds: [A17_SELECTED],
    }));
    // The graph lands after the click, so what arrives is the post-click graph.
    // Publication now requires that proof; the arrival hook under test is
    // unchanged, only the evidence that permits it to publish.
    const graphArrival = runtime.api.retainAndPublishGraph(stage2mPostClickGraph());
    return { state: runtime.api.snapshot(), graphArrival };
  };
  const production = execute(CORE_PROGRAM);
  equal(production.graphArrival.retained, true, 'production retains the repeated-switch graph once');
  equal(production.state.overlay.count, 39, 'production publishes on retained graph arrival');

  const mutation = mutateCoreFunction(
    CORE_SOURCE,
    'chatAtlasTryPublishRetainedBranchTransaction',
    () => "  function chatAtlasTryPublishRetainedBranchTransaction() { return Object.freeze({ handled: false }); }",
  );
  const mutated = execute(mutation);
  equal(mutated.graphArrival.retained, true, 'mutation still retains the one complete graph');
  equal(mutated.state.overlay.count, 19, 'without graph-arrival publication the unchanged host envelope strands authority at 19');
  equal(mutated.state.complete.branchTransactionStateCode, 'pending', 'mutation leaves the exact transaction pending rather than publishing');
});

await fixture('post-event retained-graph handoff mutation is killed', async () => {
  const execute = async (program) => {
    const runtime = createRuntime(program);
    // Retained before the capture, consumed at the post-event boundary. It has
    // to be the post-click graph for publication to be permitted at all.
    runtime.api.configure(selectedHostIndex(19), stage2mPostClickGraph());
    let providerCalls = 0;
    runtime.api.setProvider(() => {
      providerCalls += 1;
      return Promise.resolve({ ok: true, index: selectedHostIndex(19) });
    });
    runtime.api.capture(branchEvent({
      direction: 'previous',
      timeStamp: 718,
      answerIds: [A17_SELECTED],
    }));
    await runtime.fireReconcile();
    await settle();
    return { state: runtime.api.snapshot(), providerCalls };
  };
  const production = await execute(CORE_PROGRAM);
  equal(production.state.overlay.count, 39, 'production consumes the graph retained before capture');
  equal(production.providerCalls, 0, 'production avoids the redundant host acquisition');

  const mutation = mutateCoreFunction(
    CORE_SOURCE,
    'chatAtlasRunTrustedNativeBranchReconcile',
    (body) => body.replace(
      "    const retainedPublication = chatAtlasTryPublishRetainedBranchTransaction(\n      'trusted-native-retained-graph',\n    );",
      "    const retainedPublication = Object.freeze({ handled: false });",
    ),
  );
  const mutated = await execute(mutation);
  equal(mutated.state.overlay.count, 19, 'without the post-event handoff complete authority remains stranded at 19');
  equal(mutated.state.complete.branchTransactionStateCode, 'pending', 'mutation leaves containment pending rather than falsely publishing');
  equal(mutated.providerCalls, 0, 'the post-event boundary itself receives no replacement envelope');
});

await fixture('failed acquisition keeps the transaction pending: 20/21 can never settle', async () => {
  // The live 17/21 screenshots: derivation failed mid-descent (unmounted
  // forks), the intent died, the transition silently "ended", and mounted
  // foreign turns extended the 19 authority. The transaction must own the
  // whole window: a failed derivation keeps containment, keeps the intent
  // alive for later ledger retries, and only a superseding click, a
  // publication, or the bounded cap may end it.
  const runtime = createRuntime();
  const graphRefetch = {};
  graphRefetch.promise = new Promise((resolve) => { graphRefetch.resolve = resolve; });
  runtime.api.configure(selectedHostIndex(19), null);
  runtime.api.setProvider((_chatId, options = {}) => {
    if (!options.signal) {
      runtime.counters.boundedGraphRefetchCalls += 1;
      return graphRefetch.promise;
    }
    return Promise.resolve({ ok: true, index: selectedHostIndex(19) });
  });
  equal(runtime.api.capture(branchEvent({
    direction: 'previous',
    timeStamp: 720,
    answerIds: [A17_SELECTED],
  })), true, 'trusted click opens the transaction');
  const token = runtime.api.snapshot().intent.token;
  equal(runtime.api.snapshot().complete.branchTransactionStateCode, 'pending', 'transaction is pending from capture');
  await runtime.fireReconcile();
  runtime.api.apply(selectedPathRead({ canonical: true }), 'branch-render');
  // The graph acquisition FAILS (provider error), so no path can be derived.
  graphRefetch.resolve({ ok: false });
  await settle();
  equal(runtime.api.snapshot().acquisition.status, 'failed', 'acquisition records the failure');
  await runtime.fireDelay(280);
  await settle();
  await runtime.fireDelay(1250);
  await settle();
  const contained = runtime.api.snapshot();
  equal(contained.intent?.token, token, 'failed acquisition does not retire the transaction-owned intent');
  equal(contained.complete.branchTransactionStateCode, 'pending', 'transaction remains pending after failure');
  equal(runtime.api.suppressesLiveAppend(), true, 'foreign mounted turns cannot extend authority after failure');
  equal(contained.overlay.count, 19, 'previous complete authority remains exposed, never 20 or 21');
  runtime.advance(8001);
  ok(runtime.api.currentIntent(Q17), 'ordinary windows do not end the pending transaction');
  equal(runtime.api.suppressesLiveAppend(), true, 'containment holds through the whole pending window');
  // Even a rogue stale-clear (the exact class that legalized the live 21)
  // cannot release containment: the transaction is the dominant owner.
  runtime.api.forceClearStale('rogue-clear-probe');
  equal(runtime.api.snapshot().stale, false, 'stale flag was force-cleared');
  equal(runtime.api.suppressesLiveAppend(), true, 'the pending transaction alone still refuses foreign appends');
  // A superseding real click replaces the transaction cleanly.
  equal(runtime.api.capture(branchEvent({
    direction: 'next',
    timeStamp: 100_000,
    answerIds: [A17_CANONICAL],
  })), true, 'superseding click is captured');
  const superseded = runtime.api.snapshot();
  ok(superseded.intent.token !== token, 'a new token owns the new transaction');
  equal(superseded.complete.branchTransactionStateCode, 'pending', 'the new transaction is pending');
  equal(runtime.api.suppressesLiveAppend(), true, 'containment continues under the new owner');
  runtime.counters.storageWrites = 0;
  runtime.counters.generalTimers = 0;
  assertSafe(runtime, { refetchCalls: 1 });
});

// ── Native downstream-edit convergence (Stage 2C-2p) ──────────────────────
// Live shape: the complete 39-turn branch is published, but the host still
// displays a SHORTER sibling edit at turn 26, so 27-39 never render. Every
// activation must be proven from the same identity graph the branch came
// from; anything unproven fails closed WITHOUT clicking.
const CVG_MOUNTED_Q = '1d6e9676-4431-4325-b166-ee0484924005';
const CVG_MOUNTED_A = 'd717ba7e-f26b-4a8c-80ee-8a961ff781a7';
const CVG_EXPECTED_Q = 'dd431d44-a11f-4bf9-b6d0-84e61e4c4237';
const CVG_EXPECTED_A = 'c0445917-ade3-47dc-98fe-295082cd8dfb';

class CvgEl {
  constructor(tag = 'DIV') {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1;
    this.children = []; this.parentElement = null; this.attrs = new Map();
    this.textContent = ''; this.clicks = 0;
  }
  setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
  getAttribute(n) { return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  click() { this.clicks += 1; }
  _all(out = []) { for (const c of this.children) { out.push(c); c._all(out); } return out; }
  _matchesOne(text) {
    if (text === '*') return true;
    if (/^button/i.test(text) && this.tagName !== 'BUTTON') return false;
    for (const m of text.matchAll(/\[([^\]=^]+)\^="([^"]*)"\]/g)) {
      const a = this.getAttribute(m[1].trim());
      if (a == null || !a.startsWith(m[2])) return false;
    }
    for (const m of text.matchAll(/\[([^\]=^]+)(?:="([^"]*)")?\]/g)) {
      const a = this.getAttribute(m[1].trim());
      if (a == null) return false;
      if (m[2] != null && a !== m[2]) return false;
    }
    return true;
  }
  // Selector LISTS matter here: production reads messages and pager controls in
  // one document-ordered pass to bind each pager to the message it belongs to.
  matches(sel) { return String(sel).split(',').map((s) => s.trim()).filter(Boolean).some((s) => this._matchesOne(s)); }
  closest(sel) {
    let node = this;
    while (node) { if (node.matches(sel)) return node; node = node.parentElement; }
    return null;
  }
  querySelectorAll(sel) { return this._all().filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

// A pager as the host renders it: an indicator element whose ENTIRE text is
// "n/m", flanked by the Previous/Next controls, in its own group next to the
// message it belongs to.
function mkPager(parent, indicator) {
  const group = new CvgEl('DIV');
  const label = new CvgEl('SPAN');
  label.textContent = String(indicator);
  const prev = new CvgEl('BUTTON');
  prev.setAttribute('aria-label', 'Previous response');
  const next = new CvgEl('BUTTON');
  next.setAttribute('aria-label', 'Next response');
  group.appendChild(prev);
  group.appendChild(label);
  group.appendChild(next);
  parent.appendChild(group);
  return { group, prev, next };
}

const CVG_FUNCTION_NAMES = [
  'chatAtlasConvergenceTrace', 'chatAtlasConvergenceGraphScope', 'chatAtlasConvergenceUniqueNode',
  'chatAtlasConvergenceBranchRoot', 'chatAtlasConvergenceAnswerVariantRoots',
  'chatAtlasConvergenceQuestionVariants', 'chatAtlasBuildNativeBranchSelectionPlan',
  'chatAtlasMountedTurnSections', 'chatAtlasNativePathSections', 'chatAtlasTurnsByQId',
  'chatAtlasNativeDiagnosticsCacheKey',
  'chatAtlasMapMountedNativePath', 'chatAtlasNativeBranchPlanDiagnostics',
  'chatAtlasFirstNativePathMismatch', 'chatAtlasConvergenceExactIndicator',
  'chatAtlasNativeVariantPagers', 'chatAtlasConvergencePagerOfKind', 'chatAtlasNativeEditControls',
  'chatAtlasNativeRegenerationControls', 'chatAtlasProveConvergenceStep',
  'chatAtlasConvergenceScopeCurrent', 'chatAtlasRunNativeConvergence',
  'chatAtlasConfirmNativeConvergence',
];

// options: { siblingOrder, indicator, sameParent, mountedInGraph, scope }
function createConvergenceHarness(options = {}) {
  const root = new CvgEl('MAIN');
  const mkTurn = (testId, qId, aId, withControls, indicator) => {
    const section = new CvgEl('DIV');
    section.setAttribute('data-testid', testId);
    const q = new CvgEl('DIV');
    q.setAttribute('data-message-author-role', 'user');
    q.setAttribute('data-message-id', qId);
    section.appendChild(q);
    // Live layout: the user-edit pager sits BETWEEN the question and the
    // answer, so its owning message is the question.
    if (withControls) mkPager(section, indicator || '');
    if (aId) {
      const a = new CvgEl('DIV');
      a.setAttribute('data-message-author-role', 'assistant');
      a.setAttribute('data-message-id', aId);
      section.appendChild(a);
    }
    root.appendChild(section);
    return section;
  };
  // Branch prefix that agrees, then the mismatching turn-26 position.
  mkTurn('conversation-turn-49', 'q-25', 'a-25', false);
  const bad = mkTurn('conversation-turn-51', CVG_MOUNTED_Q, CVG_MOUNTED_A, true,
    options.indicator === undefined ? '2/2' : options.indicator);
  const turns = [{ order: 25, qId: 'q-25', primaryAId: 'a-25' },
    { order: 26, qId: CVG_EXPECTED_Q, primaryAId: CVG_EXPECTED_A }];
  const order = options.siblingOrder || [CVG_EXPECTED_Q, CVG_MOUNTED_Q];
  const parentId = 'parent-a25';
  const nodes = [
    { nodeId: parentId, parentId: 'q-25', childIds: order.slice(), productUser: false, productAnswer: true, messageId: 'a-25' },
  ];
  for (const id of order) {
    nodes.push({
      nodeId: id,
      parentId: options.sameParent === false && id === CVG_EXPECTED_Q ? 'other-parent' : parentId,
      childIds: [], productUser: true, productAnswer: false, messageId: id,
    });
  }
  if (options.mountedInGraph === false) nodes.splice(nodes.findIndex((n) => n.nodeId === CVG_MOUNTED_Q), 1);
  const scope = Object.assign({ chatId: 'c', routeKey: '/c/c', generation: 1 }, options.scope || {});
  const state = {
    chatId: scope.chatId, routeKey: scope.routeKey, generation: scope.generation,
    nativeConvergenceState: null, nativeConvergenceActivating: false,
    branchTransactionState: { token: 'tok-1', chatId: scope.chatId, routeKey: scope.routeKey, generation: scope.generation, state: 'published' },
  };
  const traces = [];
  const sandbox = {
    console, Object, String, Number, Math, Map, Set, Array, JSON,
    CHAT_ATLAS_CONVERGENCE_MAX_STEPS: 8,
    D: { querySelectorAll: (sel) => root.querySelectorAll(sel), querySelector: (sel) => root.querySelector(sel) },
    completeTurnIndexAuthorityState: state,
    selectedPathAcquisitionState: {
      graph: { identityGraph: { nodes }, chatId: scope.chatId, routeKey: scope.routeKey, generation: scope.generation },
    },
    getEffectivePresentationIndex: () => ({ turns }),
    chatAtlasCompleteIndexIdentity: (v) => String(v || '').trim(),
    chatAtlasBranchTransactionCurrent: () => state.branchTransactionState,
    chatAtlasBranchTransactionTrace: (code, detail) => traces.push({ code, detail }),
    chatAtlasNotifyCompleteIndexState: () => {},
    // Ledger members now reach H2O Core through the 0A3a broker, so this
    // sandbox registers a harness-only Ledger service double on the real
    // broker global instead of injecting the private state object.
    H2O_CHAT_ATLAS_CORE: {
      getLedgerMembers: () => turns.map((t) => ({ qId: t.qId })),
      getLedgerVersion: () => 0,
    },
    CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL: '[data-h2o-minimap-root]',
    CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL: '[data-turn-idx]',
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const names = CVG_FUNCTION_NAMES;
  const code = names.map((n) => extractFunction(CORE_SOURCE, n)).join('\n')
    + `\nglobalThis.__cvg = { ${names.join(', ')} };`;
  new vm.Script(code, { filename: CORE_PATH }).runInContext(sandbox);
  const buttons = bad.querySelectorAll('button');
  return {
    api: sandbox.__cvg, state, traces, root, bad,
    prev: buttons.find((b) => b.getAttribute('aria-label') === 'Previous response'),
    next: buttons.find((b) => b.getAttribute('aria-label') === 'Next response'),
    totalClicks: () => buttons.reduce((n, b) => n + b.clicks, 0),
    mountExpected: () => {
      bad.querySelector('[data-message-author-role="user"]')
        .setAttribute('data-message-id', CVG_EXPECTED_Q);
      bad.querySelector('[data-message-author-role="assistant"]')
        .setAttribute('data-message-id', CVG_EXPECTED_A);
    },
  };
}

await fixture('convergence: the mismatch is located by identity, not position', () => {
  const h = createConvergenceHarness();
  const m = h.api.chatAtlasFirstNativePathMismatch();
  equal(m.mountedQId, CVG_MOUNTED_Q, 'the mounted short-edit question is identified');
  equal(m.mountedAId, CVG_MOUNTED_A, 'its mounted answer is identified');
  equal(m.expectedQId, CVG_EXPECTED_Q, 'the authoritative long-route question is expected');
  equal(m.expectedPrimaryAId, CVG_EXPECTED_A, 'the authoritative primary answer is expected');
  equal(m.expectedOrder, 26, 'the mismatch is at branch order 26');
});

await fixture('convergence: activation is proven, keyed and confirmed', () => {
  const h = createConvergenceHarness();
  const result = h.api.chatAtlasRunNativeConvergence('test');
  equal(result.ok, true, 'a fully proven step activates');
  equal(result.direction, 'previous', 'direction is DERIVED from the proven sibling index, not chosen');
  equal(result.steps, 1, 'exactly the proven distance');
  equal(h.prev.clicks, 1, 'only the owning control is activated');
  equal(h.next.clicks, 0, 'no other control is touched');
  equal(h.state.nativeConvergenceState.token, 'tok-1', 'the action is bound to the transaction token');
  equal(h.state.nativeConvergenceState.expectedQId, CVG_EXPECTED_Q, 'bound to the expected question');
  equal(h.state.nativeConvergenceState.expectedPrimaryAId, CVG_EXPECTED_A, 'bound to the expected primary answer');
  equal(h.state.nativeConvergenceState.phase, 'activated', 'activation is not yet convergence');
  equal(h.state.nativeConvergenceActivating, false, 'self-click suppression is released');
  // Confirmation requires the expected identity to actually be mounted.
  equal(h.api.chatAtlasConfirmNativeConvergence('t'), false, 'unconfirmed while the old identity is mounted');
  h.mountExpected();
  equal(h.api.chatAtlasConfirmNativeConvergence('t'), true, 'confirms once the expected identity is mounted');
  equal(h.state.nativeConvergenceState.phase, 'confirmed', 'phase reaches confirmed');
});

await fixture('convergence: every ambiguity fails closed without clicking', () => {
  for (const [label, options] of [
    // Position agrees but the variant COUNT does not: only the count proof
    // can catch this, so it cannot hide behind the position proof.
    ['control count disagrees with the graph', { indicator: '2/3' }],
    ['control position disagrees with the graph', { indicator: '1/2' }],
    ['no indicator to verify against', { indicator: '' }],
    ['candidate variants are not siblings', { sameParent: false }],
    ['mounted identity absent from the graph', { mountedInGraph: false }],
  ]) {
    const h = createConvergenceHarness(options);
    const result = h.api.chatAtlasRunNativeConvergence('test');
    equal(result.ok, false, `fails closed: ${label}`);
    equal(h.totalClicks(), 0, `no control activated: ${label}`);
    equal(h.state.nativeConvergenceState.phase, 'fail-closed', `containment recorded: ${label}`);
  }
});

await fixture('convergence: a superseding capture makes the older action inert', () => {
  const h = createConvergenceHarness();
  h.api.chatAtlasRunNativeConvergence('test');
  equal(h.prev.clicks, 1, 'first action activated');
  equal(h.state.nativeConvergenceState.attempts, 1, 'one attempt recorded under the first token');
  // A newer manual selection replaces the transaction token.
  h.state.branchTransactionState = { ...h.state.branchTransactionState, token: 'tok-2' };
  equal(h.api.chatAtlasConfirmNativeConvergence('t'), false, 'the old action cannot confirm under a new token');
  // A later run must DISCARD the old record rather than continue it: the
  // attempt budget restarts and the supersession is traced.
  h.state.nativeConvergenceState = { token: 'tok-1', chatId: 'c', routeKey: '/c/c', generation: 1, phase: 'activated', attempts: 7 };
  h.api.chatAtlasRunNativeConvergence('after-supersede');
  equal(h.state.nativeConvergenceState.token, 'tok-2', 'the new token owns the record');
  equal(h.state.nativeConvergenceState.attempts, 1, 'the superseded attempt budget is not inherited');
  ok(h.traces.some((t) => t.code === 'convergence-superseded'), 'supersession is traced');
});

await fixture('convergence: scope drift and an agreeing prefix both stop activation', () => {
  const drift = createConvergenceHarness();
  drift.state.generation = 9;
  const r = drift.api.chatAtlasRunNativeConvergence('test');
  equal(r.ok, false, 'generation drift fails closed');
  equal(drift.totalClicks(), 0, 'no click under scope drift');
  const agreed = createConvergenceHarness();
  agreed.mountExpected();
  const done = agreed.api.chatAtlasRunNativeConvergence('test');
  equal(done.ok, true, 'an agreeing prefix needs no activation');
  equal(done.converged, true, 'reported as converged');
  equal(agreed.totalClicks(), 0, 'a matching native prefix is never clicked');
});

await fixture('convergence: self-activation cannot be captured as a new user selection', () => {
  const capture = extractFunction(CORE_SOURCE, 'chatAtlasRecordTrustedNativeBranchSelection');
  const guard = capture.indexOf('nativeConvergenceActivating === true) return false;');
  const direction = capture.indexOf('chatAtlasCompleteIndexNativeBranchDirection(event)');
  ok(guard > 0, 'capture refuses convergence-driven clicks');
  ok(guard < direction, 'the refusal precedes any capture work');
  ok(capture.includes('nativeConvergenceState = null'), 'a genuine newer capture discards the older convergence action');
});

// ── Nested native branch path (Stage 2C-2q) ───────────────────────────────
// Live shape from the observed conversation: the authoritative path is 39
// turns; turn 17 carries an assistant branch that is ALREADY correct; turn 26
// carries a user-edit branch with three variants whose authoritative choice is
// the third; beneath that variant the answer itself has two regeneration
// variants and the authoritative one is NOT the default; and turn 27 carries a
// further regeneration branch. Descendants only materialise once every one of
// those nested choices agrees — which is why reaching turn-26 variant 3/3 is
// not convergence.
const NST = {
  q26: [CVG_MOUNTED_Q, 'q26-b', CVG_EXPECTED_Q],
  a26: ['a26-alt', CVG_EXPECTED_A],
  a27: ['a27-alt', 'a-27'],
  a17: ['a-17', 'a17-alt'],
};

function buildNestedHarness(options = {}) {
  const turns = [];
  for (let i = 1; i <= 39; i += 1) turns.push({ order: i, qId: `q-${i}`, primaryAId: `a-${i}` });
  turns[25] = { order: 26, qId: CVG_EXPECTED_Q, primaryAId: CVG_EXPECTED_A };
  // Authoritative selections: turn-17 answer index 0, turn-26 question index 2,
  // turn-26 answer index 1, turn-27 answer index 1.
  const sel = Object.assign({ q26: 0, a26: 0, a27: 0, a17: 0 }, options.selection || {});
  const clicks = { edit26: 0, regen26: 0, regen27: 0, regen17: 0 };
  const frozen = options.frozen === true;
  let root = null;
  const pagers = {};

  const render = () => {
    root = new CvgEl('MAIN');
    // `splitSections` models the other host topology: question and answer in
    // consecutive turn containers instead of one shared container.
    const split = options.splitSections === true;
    const mk = (order, qId, aId) => {
      const section = new CvgEl('DIV');
      section.setAttribute('data-testid', `conversation-turn-${order}`);
      const q = new CvgEl('DIV');
      q.setAttribute('data-message-author-role', 'user');
      q.setAttribute('data-message-id', qId);
      section.appendChild(q);
      const a = new CvgEl('DIV');
      a.setAttribute('data-message-author-role', 'assistant');
      a.setAttribute('data-message-id', aId);
      let aHost = section;
      const append = () => {
        if (split) {
          aHost = new CvgEl('DIV');
          aHost.setAttribute('data-testid', `conversation-turn-${order}-answer`);
          root.appendChild(aHost);
        }
        aHost.appendChild(a);
      };
      root.appendChild(section);
      return { section, editSlot: section, append, answerHost: () => aHost };
    };
    for (let i = 1; i <= 25; i += 1) {
      const t = mk(i, `q-${i}`, i === 17 ? NST.a17[sel.a17] : `a-${i}`);
      t.append();
      if (i === 17) pagers.regen17 = mkPager(t.answerHost(), `${sel.a17 + 1}/2`);
    }
    const q26Id = NST.q26[sel.q26];
    const onC = q26Id === CVG_EXPECTED_Q;
    const a26Id = onC ? NST.a26[sel.a26] : `a26-short-${sel.q26}`;
    const t26 = mk(26, q26Id, a26Id);
    pagers.edit26 = mkPager(t26.editSlot, `${sel.q26 + 1}/3`);
    // A stale sibling answer left mounted ABOVE the real one: the pager still
    // belongs to the real answer, so the turn's first assistant id is not the
    // message the control governs.
    if (options.decoyAssistant && onC) {
      const decoy = new CvgEl('DIV');
      decoy.setAttribute('data-message-author-role', 'assistant');
      decoy.setAttribute('data-message-id', NST.a26[0]);
      t26.section.appendChild(decoy);
    }
    t26.append();
    pagers.regen26 = onC
      ? mkPager(t26.answerHost(), options.regen26Indicator || `${sel.a26 + 1}/2`)
      : null;
    pagers.regen27 = null;
    const stopAt = Number(options.truncateAt || 0);
    if (onC && NST.a26[sel.a26] === CVG_EXPECTED_A) {
      const t27 = mk(27, 'q-27', NST.a27[sel.a27]);
      t27.append();
      pagers.regen27 = mkPager(t27.answerHost(), options.regen27Indicator || `${sel.a27 + 1}/2`);
      // `mountTerminalRegardless` models a host that leaves a foreign tail
      // mounted while an upstream branch point still disagrees.
      if (NST.a27[sel.a27] === 'a-27' || options.mountTerminalRegardless === true) {
        for (let i = 28; i <= 39; i += 1) {
          if (stopAt && i > stopAt) break;
          mk(i, `q-${i}`, `a-${i}`).append();
        }
      }
    }
    const mm = new CvgEl('DIV');
    mm.setAttribute('data-h2o-minimap-root', '1');
    for (let i = 1; i <= 39; i += 1) {
      const box = new CvgEl('DIV');
      box.setAttribute('data-turn-idx', String(i));
      mm.appendChild(box);
    }
    root.appendChild(mm);
    // The host reacts to an activation exactly as ChatGPT does: switching a
    // variant re-renders, and every choice BELOW it resets to its default.
    const wire = (pager, key, apply) => {
      if (!pager) return;
      pager.prev.click = () => { clicks[key] += 1; if (!frozen) { apply(-1); render(); } };
      pager.next.click = () => { clicks[key] += 1; if (!frozen) { apply(1); render(); } };
    };
    wire(pagers.edit26, 'edit26', (d) => {
      sel.q26 = Math.min(2, Math.max(0, sel.q26 + d)); sel.a26 = 0; sel.a27 = 0;
    });
    wire(pagers.regen26, 'regen26', (d) => {
      sel.a26 = Math.min(1, Math.max(0, sel.a26 + d)); sel.a27 = 0;
    });
    wire(pagers.regen27, 'regen27', (d) => { sel.a27 = Math.min(1, Math.max(0, sel.a27 + d)); });
    wire(pagers.regen17, 'regen17', (d) => { sel.a17 = Math.min(1, Math.max(0, sel.a17 + d)); });
  };

  const graphNodes = [];
  const node = (nodeId, parentId, childIds, user) => graphNodes.push({
    nodeId, parentId, childIds, messageId: nodeId, productUser: user, productAnswer: !user,
  });
  node('q-1', null, ['a-1'], true);
  for (let i = 1; i <= 25; i += 1) {
    if (i === 17) node('a-17', 'q-17', ['q-18'], false);
    else node(`a-${i}`, `q-${i}`, [i === 25 ? 'x' : `q-${i + 1}`], false);
    if (i > 1) node(`q-${i}`, `a-${i - 1}`, [`a-${i}`], true);
  }
  node('a17-alt', 'q-17', [], false);
  graphNodes.find((n) => n.nodeId === 'q-17').childIds = ['a-17', 'a17-alt'];
  graphNodes.find((n) => n.nodeId === 'a-25').childIds = NST.q26.slice();
  for (const qId of NST.q26) {
    node(qId, 'a-25', qId === CVG_EXPECTED_Q ? NST.a26.slice() : [`a26-short-${NST.q26.indexOf(qId)}`], true);
    if (qId !== CVG_EXPECTED_Q) node(`a26-short-${NST.q26.indexOf(qId)}`, qId, [], false);
  }
  node('a26-alt', CVG_EXPECTED_Q, [], false);
  node(CVG_EXPECTED_A, CVG_EXPECTED_Q, ['q-27'], false);
  node('q-27', CVG_EXPECTED_A, NST.a27.slice(), true);
  node('a27-alt', 'q-27', [], false);
  node('a-27', 'q-27', ['q-28'], false);
  for (let i = 28; i <= 39; i += 1) {
    node(`q-${i}`, `a-${i - 1}`, [`a-${i}`], true);
    node(`a-${i}`, `q-${i}`, i === 39 ? [] : [`q-${i + 1}`], false);
  }

  render();
  const scope = { chatId: 'c', routeKey: '/c/c', generation: 1 };
  const state = {
    chatId: scope.chatId, routeKey: scope.routeKey, generation: scope.generation,
    nativeConvergenceState: null, nativeConvergenceActivating: false,
    branchTransactionState: { token: 'tok-1', ...scope, state: 'published' },
  };
  const traces = [];
  const sandbox = {
    console, Object, String, Number, Math, Map, Set, Array, JSON,
    CHAT_ATLAS_CONVERGENCE_MAX_STEPS: 8,
    D: { querySelectorAll: (s) => root.querySelectorAll(s), querySelector: (s) => root.querySelector(s) },
    completeTurnIndexAuthorityState: state,
    selectedPathAcquisitionState: { graph: { identityGraph: { nodes: graphNodes }, ...scope } },
    getEffectivePresentationIndex: () => ({ turns }),
    chatAtlasCompleteIndexIdentity: (v) => String(v || '').trim(),
    chatAtlasBranchTransactionCurrent: () => state.branchTransactionState,
    chatAtlasBranchTransactionTrace: (code, detail) => traces.push({ code, detail }),
    chatAtlasNotifyCompleteIndexState: () => {},
    // The Ledger is reached through 0A3a's OWN service registry now, not through
    // a window global. This sandbox therefore supplies the registry's backing
    // store and registers a harness-only Ledger double into it below: only the
    // Ledger itself is a double, while every hop that resolves it — registerService,
    // getService, ledger(), getLedgerMembers/Version and the two const-arrow
    // forwards — is the genuine 0A3a implementation, extracted from 0A3a.
    services: Object.create(null),
    __ledgerDouble: {
      getMembers: () => turns.map((t) => ({ qId: t.qId })),
      getVersion: () => 0,
    },
    CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL: '[data-h2o-minimap-root]',
    CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL: '[data-turn-idx]',
  };
  sandbox.globalThis = sandbox;
  sandbox.W = sandbox;
  sandbox.top = sandbox;
  vm.createContext(sandbox);
  // Declared as const-arrows in 0A3a specifically so they cannot collide with a
  // `  function <name>(` scan, so they need the binding extractor rather than the
  // function extractor.
  const CVG_BROKER_FUNCTIONS = ['registerService', 'getService'];
  const CVG_BROKER_BINDINGS = [
    'LEDGER_SERVICE', 'ledger', 'getLedgerMembers', 'getLedgerVersion',
    'chatAtlasCoreLedgerMembers', 'chatAtlasCoreLedgerVersion',
  ];
  const code = CVG_FUNCTION_NAMES.map((n) => extractFunction(BROKER_PROGRAM, n))
    .concat(CVG_BROKER_FUNCTIONS.map((n) => extractFunction(BROKER_PROGRAM, n)))
    .concat(CVG_BROKER_BINDINGS.map((n) => extractBinding(BROKER_PROGRAM, n)))
    .join('\n')
    + `\nglobalThis.__cvg = { ${CVG_FUNCTION_NAMES.join(', ')} };`
    + '\nregisterService(LEDGER_SERVICE, globalThis.__ledgerDouble);';
  new vm.Script(code, { filename: BROKER_REL }).runInContext(sandbox);
  return {
    api: sandbox.__cvg,
    state,
    traces,
    clicks,
    selection: sel,
    turns,
    // The production trigger: confirm any landed step, then attempt the next.
    drive: (rounds = 8) => {
      for (let i = 0; i < rounds; i += 1) {
        sandbox.__cvg.chatAtlasConfirmNativeConvergence('t');
        const r = sandbox.__cvg.chatAtlasRunNativeConvergence('t');
        if (r.converged === true || r.ok === false) return r;
      }
      return null;
    },
  };
}

await fixture('nested: the plan enumerates every branch point, both kinds', () => {
  const h = buildNestedHarness();
  const plan = h.api.chatAtlasBuildNativeBranchSelectionPlan();
  ok(plan.ok, 'the plan resolves against the retained graph');
  equal(plan.pathLength, 39, 'the plan is keyed to the 39-turn effective path');
  equal(plan.terminalQId, 'q-39', 'the plan carries the terminal turn identity');
  const edits = plan.points.filter((p) => p.kind === 'question-edit');
  const regens = plan.points.filter((p) => p.kind === 'assistant-regeneration');
  equal(edits.length, 1, 'the turn-26 question edit is a branch point');
  equal(edits[0].order, 26, 'located at turn 26');
  equal(edits[0].expectedCount, 3, 'three question variants');
  equal(edits[0].expectedIndex, 2, 'the authoritative question is the third');
  equal(regens.length, 3, 'turn 17, turn 26 and turn 27 regenerations are branch points');
  equal(regens.map((p) => p.order).join(','), '17,26,27', 'each regeneration is located by turn');
  equal(regens.find((p) => p.order === 26).expectedIndex, 1, 'the authoritative turn-26 answer is the second');
  equal(regens.find((p) => p.order === 17).expectedIndex, 0, 'turn 17 is already on its authoritative answer');
});

await fixture('nested: convergence walks the whole vector and stops at the terminal turn', () => {
  const h = buildNestedHarness();
  const first = h.api.chatAtlasFirstNativePathMismatch();
  equal(first.kind, 'question-edit', 'the first branch point is the turn-26 question edit');
  const result = h.drive();
  equal(result.converged, true, 'convergence completes');
  equal(result.reason, 'native-path-matches-through-terminal', 'only the terminal turn confirms it');
  equal(h.state.nativeConvergenceState.phase, 'confirmed', 'the transaction reaches confirmed');
  equal(h.selection.q26, 2, 'the turn-26 question reached its authoritative variant');
  equal(h.selection.a26, 1, 'the turn-26 answer reached its authoritative variant');
  equal(h.selection.a27, 1, 'the turn-27 answer reached its authoritative variant');
  equal(h.clicks.edit26, 2, 'two proven steps on the question pager');
  equal(h.clicks.regen26, 1, 'one proven step on the turn-26 regeneration pager');
  equal(h.clicks.regen27, 1, 'one proven step on the turn-27 regeneration pager');
  equal(h.clicks.regen17, 0, 'the already-correct turn-17 branch is never touched');
  const map = h.api.chatAtlasMapMountedNativePath();
  equal(map.prefixLength, 39, 'the mounted native prefix reaches 39');
  equal(map.terminalMounted, true, 'turn 39 is mounted');
  const kinds = h.traces.filter((t) => t.code === 'convergence-activated').map((t) => t.detail.reason);
  equal(kinds.length, 3, 'three proven activations, one per branch point');
  equal(kinds.filter((r) => r.startsWith('question-edit')).length, 1, 'the question edit is one bounded activation');
  equal(kinds.filter((r) => r.startsWith('assistant-regeneration')).length, 2, 'two regenerations, each its own control');
  ok(kinds.some((r) => r === 'question-edit@26:next:2'), 'the edit activation is traced by kind, turn, direction and step count');
  ok(kinds.some((r) => r.startsWith('assistant-regeneration@27')), 'the downstream regeneration is traced');
});

await fixture('nested: an agreeing turn 26 does not stop the walk', () => {
  const h = buildNestedHarness({ selection: { q26: 2, a26: 1, a27: 0 } });
  const first = h.api.chatAtlasFirstNativePathMismatch();
  equal(first.kind, 'assistant-regeneration', 'the remaining branch point is a regeneration');
  equal(first.expectedOrder, 27, 'located downstream at turn 27, not at turn 26');
  const result = h.drive();
  equal(result.converged, true, 'the downstream branch converges');
  equal(h.clicks.edit26, 0, 'the already-correct turn-26 question pager is never clicked');
  equal(h.clicks.regen26, 0, 'the already-correct turn-26 answer pager is never clicked');
  equal(h.clicks.regen27, 1, 'exactly the owning downstream control is activated');
});

await fixture('nested: a correct turn 26 with no answer variant selected is not convergence', () => {
  const h = buildNestedHarness({ selection: { q26: 2, a26: 0, a27: 0 } });
  const m = h.api.chatAtlasFirstNativePathMismatch();
  equal(m.kind, 'assistant-regeneration', 'the mismatch is the answer variant, not the question');
  equal(m.expectedOrder, 26, 'at turn 26 itself');
  equal(m.mountedQId, CVG_EXPECTED_Q, 'the question already matches the authoritative path');
  equal(m.mountedAId, 'a26-alt', 'but the mounted answer is the other regeneration');
  equal(m.expectedPrimaryAId, CVG_EXPECTED_A, 'the authoritative answer is the target');
  const proof = h.api.chatAtlasProveConvergenceStep(m);
  equal(proof.ok, true, 'the regeneration step is provable');
  equal(proof.kind, 'assistant-regeneration', 'proved through the regeneration adapter');
  equal(proof.direction, 'next', 'direction is derived from the identity indexes');
  equal(proof.steps, 1, 'one variant apart');
});

await fixture('nested: an already-correct native path converges without any activation', () => {
  const h = buildNestedHarness({ selection: { q26: 2, a26: 1, a27: 1 } });
  equal(h.api.chatAtlasFirstNativePathMismatch(), null, 'no branch point disagrees');
  const r = h.api.chatAtlasRunNativeConvergence('t');
  equal(r.converged, true, 'convergence is already complete');
  equal(h.clicks.edit26 + h.clicks.regen26 + h.clicks.regen27 + h.clicks.regen17, 0, 'nothing is clicked');
});

await fixture('nested: an ambiguous downstream branch fails closed after the earlier steps landed', () => {
  const h = buildNestedHarness({ regen27Indicator: '1/3' });
  const r = h.drive();
  equal(r.ok, false, 'the ambiguous step refuses to act');
  equal(r.reason, 'variant-count-mismatch', 'the control disagrees with the graph about variant count');
  equal(h.clicks.regen27, 0, 'the ambiguous control is never clicked');
  equal(h.clicks.edit26, 2, 'the earlier proven steps still landed');
  equal(h.clicks.regen26, 1, 'and so did the turn-26 regeneration');
  equal(h.state.nativeConvergenceState.phase, 'fail-closed', 'containment is recorded');
});

await fixture('nested: an activation that changes nothing is not repeated', () => {
  const h = buildNestedHarness({ frozen: true });
  h.api.chatAtlasRunNativeConvergence('t');
  equal(h.clicks.edit26, 2, 'the first proven activation is attempted');
  const again = h.api.chatAtlasRunNativeConvergence('t');
  equal(again.ok, false, 'the second attempt refuses');
  equal(again.reason, 'activation-produced-no-identity-change', 'because the native identity did not move');
  equal(h.clicks.edit26, 2, 'no further clicks are issued');
});

await fixture('nested: a manual selection mid-convergence supersedes and is never forced back', () => {
  const h = buildNestedHarness();
  h.api.chatAtlasRunNativeConvergence('t');
  equal(h.state.nativeConvergenceState.attempts, 1, 'one automatic attempt is recorded');
  // The user manually picks a DIFFERENT turn-26 variant; capture opens a new
  // transaction. The older convergence action must not replay the old route.
  h.state.branchTransactionState = {
    token: 'tok-2', chatId: 'c', routeKey: '/c/c', generation: 1, state: 'published',
  };
  equal(h.api.chatAtlasConfirmNativeConvergence('t'), false, 'the older action cannot confirm');
  const before = h.clicks.edit26;
  h.api.chatAtlasRunNativeConvergence('after-manual');
  equal(h.state.nativeConvergenceState.token, 'tok-2', 'the newer transaction owns the record');
  equal(h.state.nativeConvergenceState.attempts, 1, 'the superseded attempt budget is not inherited');
  ok(h.traces.some((t) => t.code === 'convergence-superseded'), 'supersession is traced');
  ok(h.clicks.edit26 >= before, 'the old route is never replayed against the new transaction');
});

await fixture('nested: the exhausted attempt budget stops all activation', () => {
  const h = buildNestedHarness({ frozen: true });
  h.state.nativeConvergenceState = {
    token: 'tok-1', chatId: 'c', routeKey: '/c/c', generation: 1, phase: 'converging', attempts: 8,
  };
  const r = h.api.chatAtlasRunNativeConvergence('t');
  equal(r.reason, 'convergence-attempts-exhausted', 'the cap is enforced');
  equal(h.clicks.edit26 + h.clicks.regen26 + h.clicks.regen27, 0, 'no control is activated');
});

await fixture('nested: pagers bind to their own message, never to the other one', () => {
  const h = buildNestedHarness({ selection: { q26: 2, a26: 0, a27: 0 } });
  const section = h.api.chatAtlasMapMountedNativePath().rows.find((r) => r.order === 26).section;
  const pagers = h.api.chatAtlasNativeVariantPagers(section);
  equal(pagers.length, 2, 'the turn carries two independent pagers');
  equal(pagers[0].kind, 'question-edit', 'the first belongs to the question');
  equal(pagers[0].ownerId, CVG_EXPECTED_Q, 'owned by the mounted question');
  equal(pagers[0].indicator, '3/3', 'and reports the question variant count');
  equal(pagers[1].kind, 'assistant-regeneration', 'the second belongs to the answer');
  equal(pagers[1].ownerId, 'a26-alt', 'owned by the mounted answer');
  equal(pagers[1].indicator, '1/2', 'and reports the answer variant count');
  equal(h.api.chatAtlasNativeEditControls(section).indicator, '3/3', 'the edit adapter reads the edit pager');
  equal(h.api.chatAtlasNativeRegenerationControls(section).indicator, '1/2', 'the regeneration adapter reads its own');
});

await fixture('nested: a landed step is not a converged transaction', () => {
  // Turn 26 is fully correct and the tail is mounted, but turn 27 still
  // disagrees. Confirming the landed turn-26 step must NOT confirm the
  // transaction, and it must be decided by re-reading the mounted path.
  const h = buildNestedHarness({
    selection: { q26: 2, a26: 1, a27: 0 }, mountTerminalRegardless: true,
  });
  const remaining = h.api.chatAtlasFirstNativePathMismatch();
  equal(remaining.expectedOrder, 27, 'a downstream branch point still disagrees');
  equal(h.api.chatAtlasMapMountedNativePath().terminalMounted, true, 'while turn 39 is already mounted');
  h.state.nativeConvergenceState = {
    token: 'tok-1', chatId: 'c', routeKey: '/c/c', generation: 1,
    phase: 'activated', kind: 'question-edit', expectedOrder: 26,
    expectedQId: CVG_EXPECTED_Q, expectedPrimaryAId: CVG_EXPECTED_A, attempts: 1,
  };
  equal(h.api.chatAtlasConfirmNativeConvergence('t'), true, 'the turn-26 step landed');
  equal(h.state.nativeConvergenceState.phase, 'converging', 'but the transaction is not confirmed');
  equal(h.state.nativeConvergenceState.reason, 'step-landed-path-incomplete', 'and says exactly why');
  ok(!h.traces.some((t) => t.code === 'convergence-confirmed'), 'no confirmation is traced');
});

await fixture('nested: an agreeing but short native path is reported, not called success', () => {
  // Every mounted branch point agrees, yet the host stopped materialising at
  // turn 27. That is the host failing to expand — never convergence.
  const h = buildNestedHarness({ selection: { q26: 2, a26: 1, a27: 1 }, truncateAt: 27 });
  equal(h.api.chatAtlasFirstNativePathMismatch(), null, 'no branch point disagrees');
  const map = h.api.chatAtlasMapMountedNativePath();
  equal(map.prefixLength, 27, 'the agreeing prefix stops at 27');
  equal(map.terminalMounted, false, 'turn 39 never materialised');
  const r = h.api.chatAtlasRunNativeConvergence('t');
  equal(r.converged, false, 'convergence is not claimed');
  equal(r.reason, 'native-prefix-short-of-terminal', 'the short prefix is named exactly');
  equal(r.prefixLength, 27, 'and quantified against the 39-turn path');
  equal(h.clicks.edit26 + h.clicks.regen26 + h.clicks.regen27, 0, 'nothing is clicked to force it');
});

await fixture('nested: a pager governing a different message than the mounted one is refused', () => {
  const h = buildNestedHarness({ selection: { q26: 2, a26: 1 }, decoyAssistant: true });
  const m = h.api.chatAtlasFirstNativePathMismatch();
  equal(m.kind, 'assistant-regeneration', 'the stale sibling reads as an answer mismatch');
  equal(m.mountedAId, NST.a26[0], 'the turn s first assistant id is the stale one');
  const proof = h.api.chatAtlasProveConvergenceStep(m);
  equal(proof.ok, false, 'no step is proven');
  equal(proof.reason, 'native-control-owner-mismatch', 'because the pager governs the other message');
  equal(h.clicks.regen26, 0, 'and the control is never activated');
});

await fixture('nested: convergence is identical when the host splits question and answer', () => {
  // Same authoritative path, same nested branch points, but each message sits
  // in its own turn container. Ownership and convergence must not depend on
  // which topology the host renders.
  const h = buildNestedHarness({ splitSections: true });
  equal(h.api.chatAtlasFirstNativePathMismatch().kind, 'question-edit', 'the first branch point is still the edit');
  const result = h.drive();
  equal(result.converged, true, 'convergence completes under the split topology');
  equal(h.clicks.edit26, 2, 'the question pager took its two proven steps');
  equal(h.clicks.regen26, 1, 'the answer pager in the NEXT container was found and used');
  equal(h.clicks.regen27, 1, 'and so was the downstream one');
  equal(h.clicks.regen17, 0, 'the already-correct turn-17 branch is still untouched');
  equal(h.api.chatAtlasMapMountedNativePath().terminalMounted, true, 'turn 39 is mounted');
});

await fixture('nested: the linear surfaces carry one path while the graph carries every branch', () => {
  const h = buildNestedHarness({ selection: { q26: 2, a26: 1, a27: 1 } });
  const d = h.api.chatAtlasNativeBranchPlanDiagnostics();
  equal(d.effectivePathTurnCount, 39, 'the effective path is exactly the selected route');
  equal(d.ledgerTurnCount, 39, 'the Ledger holds exactly that route');
  equal(d.miniMapTurnCount, 39, 'the MiniMap holds exactly that route');
  ok(d.graphNodeCount > 39 * 2, 'the graph holds every branch node, alternatives included');
  equal(d.nativeMountedPrefixCount, 39, 'the mounted native prefix agrees through 39');
  equal(d.nativeTerminalMounted, true, 'the terminal turn is mounted');
  equal(d.nativeBranchPlanRemainingMismatches, 0, 'no branch point is left disagreeing');
  equal(d.nativeBranchPlanEditPointCount, 1, 'the nested choices live in the plan');
  equal(d.nativeBranchPlanRegenerationPointCount, 3, 'both kinds are planned, not flattened');
  // The alternatives exist in the plan and appear in NO linear surface.
  const alts = ['q26-b', CVG_MOUNTED_Q, 'a26-alt', 'a27-alt', 'a17-alt'];
  const pathIds = new Set(h.turns.flatMap((t) => [t.qId, t.primaryAId]));
  ok(alts.every((id) => !pathIds.has(id)), 'no branch alternative leaks into the effective path');
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
