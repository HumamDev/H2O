// ==H2O Module==
// @h2o-id             0a3a.chatatlas.core
// @name               0A3a.⬛️🧭 Chat Atlas Core 🧭
// @namespace          H2O.Premium.CGX.chatatlas.core
// @author             HumamDev
// @version            12.7.11
// @revision           001
// @build              260808-000002
// @description        Chat Atlas Core: service registry and policy broker between H2O Core and the Chat Atlas Ledger
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

// ─────────────────────────────────────────────────────────────────────────────
// CHAT ATLAS CORE — MILESTONE 2A SHELL.
//
// This file is deliberately small right now. Milestone 2A creates it to fix the
// *boundary* before the ~11k-line central Chat Atlas authority moves in, so the
// dependency direction is established once and never inverted:
//
//     0A1a H2O Core  →  0A3a Chat Atlas Core  →  0A3b Chat Atlas Ledger
//
// H2O Core must never depend on the Ledger directly. Everything generic H2O and
// the (still-resident) central Atlas implementation need from the Ledger goes
// through the narrow service surface below, resolved per call and inert when the
// Ledger has not registered.
//
// What this file does NOT own yet, by design: completeTurnIndexAuthorityState,
// selectedPathAcquisitionState, selectedPathOverlayState, branch expansion and
// transaction state, effective presentation, Reveal, Full Index, the Refresh
// Coordinator, trusted selection and default/manual arbitration. Those stay in
// 0A1a until Milestone 2B moves them here. Nothing is copied ahead of that move.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const H2O = (W.H2O = W.H2O || {});

  const CHAT_ATLAS_CORE_VER = '12.7.11';

  // ── Service registry ──────────────────────────────────────────────────────
  // Modelled on the project's archiveBoot._register* handshake: the provider
  // pushes its implementation in when it boots, the consumer resolves per call,
  // and absence is a normal state rather than an error. No polling, no timers,
  // no captured implementation reference anywhere else in the codebase.
  const services = Object.create(null);

  function registerService(name, impl) {
    const key = String(name || '').trim();
    if (!key || !impl || typeof impl !== 'object') return null;
    services[key] = impl;
    // Unregistration is explicit and identity-checked so a stale provider can
    // never detach a newer one.
    return function unregister() {
      if (services[key] === impl) delete services[key];
    };
  }

  function getService(name) {
    const key = String(name || '').trim();
    if (!key) return null;
    const impl = services[key];
    return (impl && typeof impl === 'object') ? impl : null;
  }

  // ── Ledger service ────────────────────────────────────────────────────────
  // -- Reveal service (0A3c Chat Atlas Reveal Engine) ------------------------
  // Reveal/Pager/Scroll moved to 0A3c. It registers through the same service
  // registry the Ledger uses, resolves per call, and is inert when absent.
  // const-arrow forwards, not function declarations, so they cannot collide
  // with the real implementations when a validator scans for "  function <name>(".
  const REVEAL_SERVICE = 'reveal';
  const reveal = () => getService(REVEAL_SERVICE);
  const chatAtlasRevealDiagnostics = (...a) => reveal()?.chatAtlasRevealDiagnostics?.(...a);
  const chatAtlasRevealReadinessTarget = (...a) => reveal()?.chatAtlasRevealReadinessTarget?.(...a);
  const chatAtlasRevealReconcileTick = (...a) => reveal()?.chatAtlasRevealReconcileTick?.(...a);
  const chatAtlasRevealRunOneShot = (...a) => reveal()?.chatAtlasRevealRunOneShot?.(...a);
  const chatAtlasRevealSupersede = (...a) => reveal()?.chatAtlasRevealSupersede?.(...a);
  const chatAtlasRevealTransactionState = (...a) => reveal()?.chatAtlasRevealTransactionState?.(...a);

  const LEDGER_SERVICE = 'ledger';
  const ledger = () => getService(LEDGER_SERVICE);
  const hasLedger = () => !!ledger();

  // Semantic reads. The raw Ledger state objects are deliberately NOT exposed:
  // the six central-Atlas functions still living in 0A1a used to read
  // chatAtlasLedgerState.members / .version directly, and they now ask for the
  // same two facts through here instead. Absent Ledger reads as "nothing yet",
  // which is exactly how the Ledger's own not-ready state already behaved.
  const getLedgerMembers = () => {
    const m = ledger()?.getMembers?.();
    return Array.isArray(m) ? m : [];
  };
  const getLedgerVersion = () => Number(ledger()?.getVersion?.() || 0);

  // ── H2O Core host surface ─────────────────────────────────────────────────
  // 0A1a publishes the internals the Ledger still needs (generic turn model,
  // and — until 2B — the central Atlas helpers). It is read through the broker
  // so the Ledger never reaches into H2O Core directly, and so 2B can drop
  // entries from it as their implementations arrive here.
  const HOST_GLOBAL = 'H2O_CHAT_ATLAS_HOST_V1';
  function getHost() {
    try {
      return TOPW[HOST_GLOBAL] || W[HOST_GLOBAL] || null;
    } catch {
      return null;
    }
  }

  // ── Canonical draft policy (the load-bearing H2O Core seam) ───────────────
  // Generic turn commits call this on every build. The contract is that the
  // Ledger is OPTIONAL: canonical source defaults to 'legacy', no production
  // caller flips it today, and if the Ledger is missing, not ready, or set to
  // legacy, the caller's own drafts are returned untouched. Turn building must
  // never depend on the Ledger being present.
  function selectCanonicalDrafts(legacyDrafts, context) {
    const svc = ledger();
    if (!svc || typeof svc.selectCanonicalDrafts !== 'function') return legacyDrafts;
    try {
      const out = svc.selectCanonicalDrafts(legacyDrafts, context);
      return (out === undefined || out === null) ? legacyDrafts : out;
    } catch {
      return legacyDrafts;
    }
  }

  // Ledger-owned entry points that generic/central code still calls by name.
  // Each is inert when the Ledger is absent.
  const scheduleLedgerFlush = (...a) => ledger()?.scheduleFlush?.(...a);
  const startLedger = (...a) => ledger()?.start?.(...a);
  const buildLedgerCanonicalRecords = (...a) => {
    const out = ledger()?.buildCanonicalRecords?.(...a);
    return Array.isArray(out) ? out : [];
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // PERIPHERAL CHAT ATLAS SUBDOMAINS (Milestone 2B-1)
  //
  // Reveal / pager / scroll and the Full Index diagnostic subdomain moved here
  // from 0A1a. Both were proven to write ZERO central Chat Atlas authority
  // state, which is why they could cross ahead of the central pipeline; that
  // pipeline stays atomic in H2O Core until Milestone 2B-2.
  //
  // Preference/canary deliberately did NOT move: six of its seven functions
  // write completeTurnIndexAuthorityState, and inventing a cross-owner mutation
  // just to hit this milestone is exactly what the boundary rule forbids.
  // ═══════════════════════════════════════════════════════════════════════════

  // Central state these subdomains READ (never write). The set trap throws
  // rather than silently succeeding: Milestone 2A lost two real behaviours to a
  // read-only proxy that swallowed writes, so any future write here fails loudly
  // instead. Production behaviour is unchanged because there are no writes.
  // Local alias for this file's own host accessor.
  const host = getHost;

  const readOnlyCentral = (name) => new Proxy({}, {
    get: (_t, k) => host()?.[name]?.[k],
    has: (_t, k) => !!host()?.[name] && k in host()[name],
    ownKeys: () => Object.keys(host()?.[name] || {}),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    set(_t, k) { throw new Error(`chat-atlas-core: ${name}.${String(k)} is owned by H2O Core; use an owner-side command`); },
  });
  const state = readOnlyCentral('state');

  // Central Chat Atlas helpers still resident in 0A1a until 2B-2. Const-arrow
  // bindings so they never collide with the real declarations under a validator
  // scan for `  function <name>(`.
  const hostFn = (name) => (...a) => host()?.[name]?.(...a);
  // Route spine stays in H2O Core; read it through the host.
  const listTurnRecords = (...a) => { const v = host()?.listTurnRecords?.(...a); return Array.isArray(v) ? v : []; };

  // Shared leaf constants (own copies; DOM/schema values, per project convention)
  const D = document;











































































  const CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT = 12;

  const chatAtlasFullIndexState = {
    status: 'idle',
    chatId: null,
    routeKey: '',
    generation: 0,
    fetchCount: 0,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    index: null,
    promise: null,
    controller: null,
    attempted: false,
  };


  function chatAtlasFullIndexReadMiniMapRows() {
    const readApi = (target) => {
      if (!target) return null;
      try {
        const candidate = target.H2O_MM_CORE_API
          || target.H2O_MM_SHARED?.get?.()?.api?.core
          || target.H2O_MM_SHARED?.api?.core
          || null;
        return typeof candidate?.getTurnList === 'function' ? candidate : null;
      } catch {
        return null;
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || null; } catch { topWindow = null; }
    const api = readApi(topWindow) || readApi(W);
    if (!api) return [];
    try {
      const rows = api.getTurnList();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function chatAtlasFullIndexProjectionRow(row, order) {
    const qId = chatAtlasNormalizeId(row?.qId || row?.questionId || '') || null;
    const primaryAId = chatAtlasNormalizeId(row?.primaryAId || row?.answerId || '') || null;
    const rawVariants = Array.isArray(row?.answerVariants)
      ? row.answerVariants
      : (Array.isArray(row?.answerIds) ? row.answerIds : []);
    const answerVariants = [];
    for (const rawId of rawVariants) {
      const answerId = chatAtlasNormalizeId(rawId?.id || rawId);
      if (answerId && !answerVariants.includes(answerId)) answerVariants.push(answerId);
    }
    if (primaryAId && !answerVariants.includes(primaryAId)) answerVariants.push(primaryAId);
    return {
      order: Number(row?.order || row?.turnNo || row?.index || order) || order,
      qId,
      primaryAId,
      answerVariants,
      noAnswer: row?.noAnswer === true || (!primaryAId && answerVariants.length === 0),
    };
  }

  function chatAtlasFullIndexCompareProjection(indexTurns, rows, source) {
    const expected = (Array.isArray(indexTurns) ? indexTurns : [])
      .map((row, index) => chatAtlasFullIndexProjectionRow(row, index + 1));
    const actual = (Array.isArray(rows) ? rows : [])
      .map((row, index) => chatAtlasFullIndexProjectionRow(row, index + 1));
    const expectedByQId = new Map(expected.filter((row) => row.qId).map((row) => [row.qId, row]));
    const actualByQId = new Map(actual.filter((row) => row.qId).map((row) => [row.qId, row]));
    const samples = [];
    const pushSample = (kind, evidence = {}) => {
      if (samples.length >= CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT) return;
      samples.push({ source, kind, ...evidence });
    };
    let missingCount = 0;
    let extraCount = 0;
    let orderMismatchCount = 0;
    let primaryMismatchCount = 0;
    let variantMismatchCount = 0;
    let noAnswerMismatchCount = 0;

    for (const expectedRow of expected) {
      if (!expectedRow.qId || actualByQId.has(expectedRow.qId)) continue;
      missingCount += 1;
      pushSample('missing-from-projection', { qId: expectedRow.qId });
    }
    for (const actualRow of actual) {
      if (!actualRow.qId || expectedByQId.has(actualRow.qId)) continue;
      extraCount += 1;
      pushSample('projection-only', { qId: actualRow.qId });
    }
    for (const [qId, expectedRow] of expectedByQId) {
      const actualRow = actualByQId.get(qId);
      if (!actualRow) continue;
      if (expectedRow.order !== actualRow.order) {
        orderMismatchCount += 1;
        pushSample('order-mismatch', { qId, expected: expectedRow.order, actual: actualRow.order });
      }
      if (expectedRow.primaryAId !== actualRow.primaryAId) {
        primaryMismatchCount += 1;
        pushSample('primary-mismatch', {
          qId,
          expected: expectedRow.primaryAId,
          actual: actualRow.primaryAId,
        });
      }
      if (JSON.stringify(expectedRow.answerVariants) !== JSON.stringify(actualRow.answerVariants)) {
        variantMismatchCount += 1;
        pushSample('variant-mismatch', {
          qId,
          expectedCount: expectedRow.answerVariants.length,
          actualCount: actualRow.answerVariants.length,
        });
      }
      if (expectedRow.noAnswer !== actualRow.noAnswer) {
        noAnswerMismatchCount += 1;
        pushSample('no-answer-mismatch', {
          qId,
          expected: expectedRow.noAnswer,
          actual: actualRow.noAnswer,
        });
      }
    }
    return {
      source,
      count: actual.length,
      missingCount,
      extraCount,
      orderMismatchCount,
      primaryMismatchCount,
      variantMismatchCount,
      noAnswerMismatchCount,
      samples,
    };
  }

  function chatAtlasCompareFullConversationIndex(index = chatAtlasFullIndexState.index) {
    const indexTurns = Array.isArray(index?.turns) ? index.turns : [];
    const canonical = chatAtlasFullIndexCompareProjection(indexTurns, listTurnRecords(), 'canonical');
    const ledger = chatAtlasFullIndexCompareProjection(
      indexTurns,
      buildChatAtlasLedgerCanonicalRecords(),
      'ledger',
    );
    const minimap = chatAtlasFullIndexCompareProjection(indexTurns, chatAtlasFullIndexReadMiniMapRows(), 'minimap');
    const sources = [canonical, ledger, minimap];
    const boundedSamples = [];
    for (const source of sources) {
      for (const sample of source.samples) {
        if (boundedSamples.length >= CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT) break;
        boundedSamples.push(sample);
      }
    }
    const orderMismatchCount = sources.reduce((sum, item) => sum + item.orderMismatchCount, 0);
    const primaryMismatchCount = sources.reduce((sum, item) => sum + item.primaryMismatchCount, 0);
    const variantMismatchCount = sources.reduce((sum, item) => sum + item.variantMismatchCount, 0);
    const noAnswerMismatchCount = sources.reduce((sum, item) => sum + item.noAnswerMismatchCount, 0);
    const identityMismatch = sources.some((item) => (
      item.extraCount > 0
      || item.primaryMismatchCount > 0
      || item.variantMismatchCount > 0
      || item.noAnswerMismatchCount > 0
    ));
    const projectionIncomplete = sources.some((item) => item.missingCount > 0 && item.count < indexTurns.length);
    return {
      canonicalCount: canonical.count,
      ledgerCount: ledger.count,
      minimapCount: minimap.count,
      missingFromCanonicalCount: canonical.missingCount,
      extraInCanonicalCount: canonical.extraCount,
      missingFromLedgerCount: ledger.missingCount,
      extraInLedgerCount: ledger.extraCount,
      missingFromMiniMapCount: minimap.missingCount,
      extraInMiniMapCount: minimap.extraCount,
      orderMismatchCount,
      primaryMismatchCount,
      variantMismatchCount,
      noAnswerMismatchCount,
      projectionIncomplete,
      classification: projectionIncomplete
        ? 'projection-incomplete'
        : (identityMismatch ? 'identity-mismatch' : 'exact'),
      boundedSamples,
    };
  }

  function getConversationTurnIndexDiagnostics() {
    if (completeTurnIndexAuthorityState.enabled) {
      const authority = getCompleteTurnIndexProjectionStatus();
      const index = completeTurnIndexAuthorityState.index;
      const comparisons = index ? chatAtlasCompareFullConversationIndex(index) : null;
      return chatAtlasFreeze({
        status: authority.status,
        chatId: authority.chatId,
        fetchCount: authority.fetchCount,
        startedAt: authority.startedAt,
        completedAt: authority.completedAt,
        errorCode: authority.errorCode,
        index: authority.authoritative ? {
          schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
          count: authority.count,
          fingerprint: authority.fingerprint,
          payloadUpdateTime: authority.payloadUpdateTime,
          completenessProof: authority.completenessProof,
          noAnswerCount: index.turns.filter((turn) => turn.noAnswer === true).length,
          variantTurnCount: index.turns.filter((turn) => turn.answerVariants.length > 1).length,
        } : null,
        comparisons,
        authority,
      });
    }
    const index = chatAtlasFullIndexState.index;
    const comparisons = index ? chatAtlasCompareFullConversationIndex(index) : null;
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    return chatAtlasFreeze({
      status: chatAtlasFullIndexState.status,
      chatId: chatAtlasFullIndexState.chatId,
      fetchCount: chatAtlasFullIndexState.fetchCount,
      startedAt: chatAtlasFullIndexState.startedAt,
      completedAt: chatAtlasFullIndexState.completedAt,
      errorCode: chatAtlasFullIndexState.errorCode,
      index: index ? {
        schema: Number(index.schema || 0) || null,
        count: turns.length,
        fingerprint: String(index.sourceFingerprint || '') || null,
        payloadUpdateTime: index.payloadUpdateTime ?? null,
        completenessProof: String(index?.completeness?.proof || '') || null,
        noAnswerCount: turns.filter((turn) => turn?.noAnswer === true).length,
        variantTurnCount: turns.filter((turn) => Array.isArray(turn?.answerVariants) && turn.answerVariants.length > 1).length,
      } : null,
      comparisons,
    });
  }

  function chatAtlasResetFullIndexRoute(nextRoute, staleStatus = false) {
    try { chatAtlasFullIndexState.controller?.abort?.('route-changed'); } catch {}
    chatAtlasFullIndexState.generation += 1;
    chatAtlasFullIndexState.status = staleStatus ? 'stale-route-discarded' : 'idle';
    chatAtlasFullIndexState.chatId = nextRoute?.chatId || null;
    chatAtlasFullIndexState.routeKey = nextRoute?.routeKey || '';
    chatAtlasFullIndexState.fetchCount = 0;
    chatAtlasFullIndexState.startedAt = null;
    chatAtlasFullIndexState.completedAt = staleStatus ? new Date().toISOString() : null;
    chatAtlasFullIndexState.errorCode = null;
    chatAtlasFullIndexState.index = null;
    chatAtlasFullIndexState.promise = null;
    chatAtlasFullIndexState.controller = null;
    chatAtlasFullIndexState.attempted = false;
  }

  function chatAtlasTriggerFullConversationIndex() {
    if (completeTurnIndexAuthorityState.enabled) return chatAtlasTriggerCompleteIndexAuthority();
    const route = chatAtlasFullIndexRoute();
    const routeChanged = route.routeKey !== chatAtlasFullIndexState.routeKey
      || route.chatId !== chatAtlasFullIndexState.chatId;
    if (routeChanged) {
      const stale = chatAtlasFullIndexState.status === 'loading-full-index';
      chatAtlasResetFullIndexRoute(route, stale && !route.chatId);
    }
    if (!route.chatId) return Promise.resolve(getConversationTurnIndexDiagnostics());
    if (chatAtlasFullIndexState.promise) return chatAtlasFullIndexState.promise;
    if (chatAtlasFullIndexState.attempted) return Promise.resolve(getConversationTurnIndexDiagnostics());
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') return Promise.resolve(getConversationTurnIndexDiagnostics());

    const Controller = W.AbortController;
    const controller = typeof Controller === 'function' ? new Controller() : null;
    const generation = chatAtlasFullIndexState.generation;
    const routeKey = route.routeKey;
    chatAtlasFullIndexState.attempted = true;
    chatAtlasFullIndexState.fetchCount += 1;
    chatAtlasFullIndexState.status = 'loading-full-index';
    chatAtlasFullIndexState.startedAt = new Date().toISOString();
    chatAtlasFullIndexState.completedAt = null;
    chatAtlasFullIndexState.errorCode = null;
    chatAtlasFullIndexState.controller = controller;
    const operation = Promise.resolve()
      .then(() => provider(route.chatId, { signal: controller?.signal }))
      .then((result) => {
        const stillCurrent = generation === chatAtlasFullIndexState.generation
          && routeKey === chatAtlasFullIndexState.routeKey
          && route.chatId === chatAtlasFullIndexState.chatId;
        if (!stillCurrent) {
          if (!chatAtlasFullIndexState.chatId && chatAtlasFullIndexState.status === 'idle') {
            chatAtlasFullIndexState.status = 'stale-route-discarded';
            chatAtlasFullIndexState.completedAt = new Date().toISOString();
          }
          return getConversationTurnIndexDiagnostics();
        }
        chatAtlasFullIndexState.completedAt = new Date().toISOString();
        const validIndex = result?.ok === true
          && Number(result?.index?.schema) === 1
          && chatAtlasNormalizeId(result?.index?.chatId) === route.chatId
          && result?.index?.completeness?.complete === true
          && result?.index?.completeness?.proof === 'host-payload-full-graph'
          && Array.isArray(result?.index?.turns);
        if (validIndex) {
          chatAtlasFullIndexState.index = result.index;
          chatAtlasFullIndexState.status = 'complete-from-host-payload';
          chatAtlasFullIndexState.errorCode = null;
        } else {
          chatAtlasFullIndexState.index = null;
          chatAtlasFullIndexState.status = 'full-index-unavailable';
          chatAtlasFullIndexState.errorCode = String(
            result?.errorCode
            || (result?.ok === true ? 'full-index-envelope-invalid' : 'full-index-unavailable'),
          ).slice(0, 96);
        }
        return getConversationTurnIndexDiagnostics();
      })
      .catch((error) => {
        if (generation === chatAtlasFullIndexState.generation && routeKey === chatAtlasFullIndexState.routeKey) {
          chatAtlasFullIndexState.index = null;
          chatAtlasFullIndexState.status = 'full-index-unavailable';
          chatAtlasFullIndexState.completedAt = new Date().toISOString();
          chatAtlasFullIndexState.errorCode = String(error?.code || 'provider-failed').slice(0, 96);
        }
        return getConversationTurnIndexDiagnostics();
      })
      .finally(() => {
        if (generation === chatAtlasFullIndexState.generation && routeKey === chatAtlasFullIndexState.routeKey) {
          chatAtlasFullIndexState.promise = null;
          chatAtlasFullIndexState.controller = null;
        }
      });
    chatAtlasFullIndexState.promise = operation;
    return operation;
  }



  // Constants and intra-file reads restored after the central move: these are
  // now local facts of this module rather than cross-owner lookups.
  const ATTR_TESTID = 'data-testid';
  const CHAT_ATLAS_SHELL_SEL = 'section[data-testid^="conversation-turn-"]';
  const COMPLETE_TURN_INDEX_CACHE_SCHEMA = 1;
  const CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS = Object.freeze(['previous', 'next', 'left', 'right']);
  // Ledger access stays behind the 0A3b service contract.
  const chatAtlasCoreLedgerMembers = () => getLedgerMembers();
  const chatAtlasCoreLedgerVersion = () => getLedgerVersion();
  const scheduleChatAtlasLedgerFlush = (...a) => ledger()?.scheduleFlush?.(...a);
  const buildChatAtlasLedgerCanonicalRecords = (...a) => {
    const v = ledger()?.buildCanonicalRecords?.(...a);
    return Array.isArray(v) ? v : [];
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRAL CHAT ATLAS AUTHORITY (Milestone 2B-2)
  //
  // The complete central pipeline moved here from H2O Core as one unit: route
  // identity spine, trusted selection and stale authority, branch expansion and
  // transaction, selected-path acquisition and every publication writer,
  // identity/native selection, default/manual arbitration, complete-index
  // provider/cache/publication, effective presentation, the refresh coordinator
  // and preference/canary. Nothing was consolidated or redesigned on the way.
  //
  // H2O Core keeps the generic turn model and reaches this file only through the
  // narrow policy surface at the bottom of this module.
  // ═══════════════════════════════════════════════════════════════════════════

  // Generic H2O Core reads. These are the nine dependencies the central pipeline
  // genuinely needs from the generic turn model, resolved per call through the
  // host. Chat Atlas Core writes no generic turnState.
  const turnState = new Proxy({}, {
    get: (_t, k) => host()?.turnState?.[k],
    has: (_t, k) => !!host()?.turnState && k in host().turnState,
    ownKeys: () => Object.keys(host()?.turnState || {}),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    set(_t, k) { throw new Error(`chat-atlas-core: turnState.${String(k)} is owned by H2O Core`); },
  });
  const buildTurns = hostFn('buildTurns');
  const busEmit = hostFn('busEmit');
  const canonicalDraftHasStructuralQuestionProof = hostFn('canonicalDraftHasStructuralQuestionProof');
  const getMsgIdAttr = hostFn('getMsgIdAttr');
  const getRecordByQIdInternal = hostFn('getRecordByQIdInternal');
  const isStreamingAnswerPlaceholderId = (...a) => host()?.isStreamingAnswerPlaceholderId?.(...a) === true;
  const normalizeTurnAlias = (...a) => host()?.normalizeTurnAlias?.(...a) ?? '';
  const refresh = hostFn('refresh');
  const slimTurnDraft = hostFn('slimTurnDraft');

  // Shared DOM/schema constants (own copies; leaf values, per project convention)
  const ATTR_MESSAGE_AUTHOR_ROLE = 'data-message-author-role';
  const ATTR_MESSAGE_ID = 'data-message-id';
  const SEL_CORE_WITH_ROLE = `[${ATTR_MESSAGE_AUTHOR_ROLE}]`;
  const EV_CORE_TURN_UPDATED = 'evt:h2o:core:turn:updated';







  // Two read-only Reveal facts; the Reveal state object itself stays in 0A3a.


  // Route identity spine. Despite the historical name this reads only the
  // location and returns { chatId, routeKey }; it touches no Full Index state and
  // fourteen central-authority call sites dereference it, so it stays in H2O Core
  // with the rest of the route spine rather than crossing with the diagnostics.
  function chatAtlasFullIndexRoute() {
    const pathname = String(W.location?.pathname || D.location?.pathname || '');
    const match = pathname.match(/(?:^|\/)c\/([a-z0-9-]+)(?:\/|$)/i);
    const chatId = match ? chatAtlasNormalizeId(match[1]) : '';
    return {
      chatId: chatId || null,
      routeKey: chatId ? pathname : '',
    };
  }

  // Semantic Ledger reads replacing the former direct Ledger state
  // access. No Ledger absent => no members and version 0, which is exactly the
  // Ledger's own not-ready state.




  const CHAT_ATLAS_PAGE_SIZE = 25;

  function chatAtlasNow() {
    try { return performance.now(); } catch { return Date.now(); }
  }

  function chatAtlasCurrentChatKey() {
    return String(H2O.util?.getChatId?.() || D.location?.pathname || '');
  }

  function chatAtlasNormalizeId(value) {
    return normalizeTurnAlias(value);
  }

  function chatAtlasFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) {
      for (const item of value) chatAtlasFreeze(item);
    } else {
      for (const item of Object.values(value)) chatAtlasFreeze(item);
    }
    try { return Object.freeze(value); } catch { return value; }
  }

  function chatAtlasReadShell(shell, index) {
    if (!shell || !shell.isConnected) return null;
    let role = String(shell.getAttribute?.('data-turn') || '').trim().toLowerCase();
    let roleNode = null;
    try {
      roleNode = shell.querySelector?.(SEL_CORE_WITH_ROLE) || null;
      if (role !== 'user' && role !== 'assistant') {
        role = String(roleNode?.getAttribute?.(ATTR_MESSAGE_AUTHOR_ROLE) || '').trim().toLowerCase();
      }
    } catch { roleNode = null; }

    const shellTurnId = chatAtlasNormalizeId(shell.getAttribute?.('data-turn-id')) || null;
    const testId = String(shell.getAttribute?.(ATTR_TESTID) || '');
    const shellOrdinal = Math.max(0, Number(testId.match(/conversation-turn-(\d+)/)?.[1] || 0) || 0);
    const flowRef = shell.closest?.('main') || shell.ownerDocument?.body || null;
    const messageId = roleNode?.isConnected
      ? (chatAtlasNormalizeId(
        roleNode.getAttribute?.(ATTR_MESSAGE_ID)
        || roleNode.dataset?.messageId
        || '',
      ) || null)
      : null;
    const aliases = new Set();
    const add = (value) => {
      const id = chatAtlasNormalizeId(value);
      if (id) aliases.add(id);
    };
    add(shell.getAttribute?.('data-turn-id'));
    add(shell.getAttribute?.(ATTR_MESSAGE_ID));
    if (roleNode) {
      add(getMsgIdAttr(roleNode));
      add(roleNode.getAttribute?.('data-turn-id'));
      add(roleNode.dataset?.turnId);
    }

    return {
      shell,
      shellIndex: index,
      testId,
      shellOrdinal,
      flowRef,
      role,
      roleNode: roleNode?.isConnected ? roleNode : null,
      hydrated: !!(roleNode && roleNode.isConnected),
      aliases,
      shellTurnId,
      messageId,
      currentId: messageId || shellTurnId || null,
    };
  }

  function chatAtlasFindConversationRoot(shells) {
    const list = Array.isArray(shells) ? shells.filter((shell) => shell?.isConnected) : [];
    if (!list.length) return D.querySelector?.('main#main, #thread, main') || D.body || null;
    const first = list[0];
    const last = list[list.length - 1];
    const preferred = first.closest?.('main#main, #thread, [data-ho-chat-root="true"], [class*="group/scroll-root"], main');
    if (preferred && preferred.contains(last)) return preferred;
    let common = first.parentElement;
    while (common && !common.contains(last)) common = common.parentElement;
    return common || D.body || null;
  }

  // All DOM reads for one build happen here. The returned evidence contains
  // live references only for in-memory binding and is never persisted.
  function chatAtlasReadEvidence() {
    const started = chatAtlasNow();
    let shells = [];
    try { shells = Array.from(D.querySelectorAll(CHAT_ATLAS_SHELL_SEL)); } catch { shells = []; }
    const evidence = [];
    const unbound = [];
    let questionShellCount = 0;
    let answerShellCount = 0;

    for (let index = 0; index < shells.length; index += 1) {
      const item = chatAtlasReadShell(shells[index], index);
      if (!item || (item.role !== 'user' && item.role !== 'assistant')) {
        unbound.push({
          shellIndex: index,
          testId: String(shells[index]?.getAttribute?.(ATTR_TESTID) || ''),
          reason: item ? 'unknown-role' : 'disconnected-or-unreadable',
        });
        continue;
      }
      if (item.role === 'user') questionShellCount += 1;
      else answerShellCount += 1;
      evidence.push(item);
    }

    const canonicalRecords = turnState.turns.slice();
    const canonicalShellBindings = new Map();
    for (const record of canonicalRecords) {
      let qShell = null;
      const answerShells = [];
      try { qShell = record?.live?.qEl?.closest?.(CHAT_ATLAS_SHELL_SEL) || null; } catch {}
      for (const answerEl of record?.live?.answerEls || []) {
        try {
          const shell = answerEl?.closest?.(CHAT_ATLAS_SHELL_SEL) || null;
          if (shell) answerShells.push(shell);
        } catch {}
      }
      canonicalShellBindings.set(record, { qShell, answerShells });
    }

    return {
      shells,
      root: chatAtlasFindConversationRoot(shells),
      evidence,
      unbound,
      questionShellCount,
      answerShellCount,
      canonicalRecords,
      canonicalShellBindings,
      canonicalVersion: turnState.version,
      completeShellMap: shells.length > 0
        && unbound.length === 0
        && evidence.length === shells.length,
      readMs: Math.max(0, chatAtlasNow() - started),
    };
  }

  function chatAtlasPairEvidence(evidence) {
    const pairs = [];
    const rejectedAssistants = [];
    let current = null;
    for (const shellEvidence of Array.isArray(evidence) ? evidence : []) {
      if (shellEvidence.role === 'user') {
        current = { question: shellEvidence, answers: [] };
        pairs.push(current);
        continue;
      }
      const previousShell = current
        ? (current.answers[current.answers.length - 1] || current.question)
        : null;
      const sameFlow = !!previousShell?.flowRef && previousShell.flowRef === shellEvidence.flowRef;
      const adjacentShell = Number(shellEvidence.shellIndex) === Number(previousShell?.shellIndex) + 1;
      const adjacentOrdinal = !previousShell?.shellOrdinal
        || !shellEvidence.shellOrdinal
        || shellEvidence.shellOrdinal === previousShell.shellOrdinal + 1;
      if (!current || !previousShell || !sameFlow || !adjacentShell || !adjacentOrdinal) {
        rejectedAssistants.push({
          shellIndex: shellEvidence.shellIndex,
          shellOrdinal: shellEvidence.shellOrdinal || null,
          testId: shellEvidence.testId || '',
          previousShellIndex: previousShell?.shellIndex ?? null,
          previousShellOrdinal: previousShell?.shellOrdinal || null,
          reason: !current || !previousShell
            ? 'assistant-without-question'
            : (!sameFlow
              ? 'assistant-flow-mismatch'
              : (!adjacentShell ? 'assistant-shell-not-adjacent' : 'assistant-ordinal-not-adjacent')),
        });
        current = null;
        continue;
      }
      current.answers.push(shellEvidence);
    }
    return { pairs, rejectedAssistants };
  }

  function chatAtlasCv2CurrentIds(values) {
    const ids = new Set();
    for (const value of values || []) {
      const id = chatAtlasNormalizeId(value);
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }

  const CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL = [
    '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
    '[data-h2o-owner="minimap-v10"]',
  ].join(', ');

  const CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL = [
    '[data-cgxui="mnmp-btn"]',
    '[data-cgxui="mm-btn"]',
    '.cgxui-mm-btn',
  ].join(', ');

  function chatAtlasNormalizeChatKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const routeMatch = raw.match(/\/c\/([a-z0-9-]+)/i);
    return routeMatch ? routeMatch[1] : raw;
  }

  function chatAtlasNullableCount(value) {
    if (value == null || value === '') return null;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function chatAtlasReadMiniMapCompletenessDiagnostics() {
    const readApi = (target) => {
      if (!target) return null;
      try {
        const candidate = target.H2O_MM_CORE_API
          || target.H2O_MM_SHARED?.get?.()?.api?.core
          || null;
        return typeof candidate?.getCacheCompletenessDiagnostics === 'function'
          ? candidate
          : null;
      } catch {
        return null;
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || null; } catch { topWindow = null; }
    const api = readApi(topWindow) || readApi(W);
    if (!api || typeof api.getCacheCompletenessDiagnostics !== 'function') return null;
    try {
      const result = api.getCacheCompletenessDiagnostics();
      return result && typeof result === 'object' ? result : null;
    } catch {
      return null;
    }
  }

  function chatAtlasValidCompletenessProof(proof, chatKey) {
    if (!proof || typeof proof !== 'object') return false;
    return proof.status === 'complete'
      && proof.kind === 'independent-end-to-end-coverage'
      && proof.independent === true
      && proof.endToEndCoverage === true
      && proof.current === true
      && !!String(proof.basis || '').trim()
      && chatAtlasNormalizeChatKey(proof.chatKey) === chatKey;
  }

  function chatAtlasEvaluateHistoricalCompleteness(miniMapDiagnostics = undefined, completenessProof = null) {
    const currentChatKey = chatAtlasNormalizeChatKey(chatAtlasCurrentChatKey()) || null;
    const diagnostics = miniMapDiagnostics === undefined
      ? chatAtlasReadMiniMapCompletenessDiagnostics()
      : miniMapDiagnostics;
    const diagnosticsChatKey = chatAtlasNormalizeChatKey(diagnostics?.chatKey) || null;
    const sameChat = !!currentChatKey && diagnosticsChatKey === currentChatKey;
    const observedTurnCount = sameChat ? chatAtlasNullableCount(diagnostics?.observedTurnCount) : null;
    const publishedTurnCount = sameChat ? chatAtlasNullableCount(diagnostics?.publishedTurnCount) : null;
    const cachedTurnCount = sameChat ? chatAtlasNullableCount(diagnostics?.cachedTurnCount) : null;
    const offDomRetainedCount = sameChat ? chatAtlasNullableCount(diagnostics?.offDomRetainedCount) : null;
    const merge = sameChat && diagnostics?.lastMergeDecision && typeof diagnostics.lastMergeDecision === 'object'
      ? {
        accepted: diagnostics.lastMergeDecision.accepted === true,
        mode: String(diagnostics.lastMergeDecision.mode || 'unknown'),
        cachedCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.cachedCount),
        liveCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.liveCount),
        outputCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.outputCount),
        overlapCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.overlapCount),
        sanitizedRows: chatAtlasNullableCount(diagnostics.lastMergeDecision.sanitizedRows),
        reason: String(diagnostics.lastMergeDecision.reason || ''),
        completeness: String(diagnostics.lastMergeDecision.completeness || 'unknown'),
      }
      : null;
    const persistence = sameChat && diagnostics?.lastPersistenceDecision
      && typeof diagnostics.lastPersistenceDecision === 'object'
      ? {
        ok: diagnostics.lastPersistenceDecision.ok === true,
        status: String(diagnostics.lastPersistenceDecision.status || 'unknown'),
        previousCount: chatAtlasNullableCount(diagnostics.lastPersistenceDecision.previousCount),
        incomingCount: chatAtlasNullableCount(diagnostics.lastPersistenceDecision.incomingCount),
        proofAccepted: diagnostics.lastPersistenceDecision.proofAccepted === true,
        reason: String(diagnostics.lastPersistenceDecision.reason || ''),
      }
      : null;
    const proofAvailable = !!currentChatKey && chatAtlasValidCompletenessProof(completenessProof, currentChatKey);
    const smallerPersistence = persistence?.previousCount != null
      && persistence?.incomingCount != null
      && persistence.incomingCount < persistence.previousCount;
    const destructiveShrink = !!(smallerPersistence && persistence.ok && !persistence.proofAccepted);
    const protectiveRefusal = !!(smallerPersistence && !persistence.ok
      && persistence.status === 'shrink-not-proven');
    const unionRetained = !!(merge?.mode === 'union'
      && merge.liveCount != null
      && merge.outputCount != null
      && merge.outputCount > merge.liveCount);
    const retainedOffDom = Number(offDomRetainedCount || 0) > 0;
    const cacheLargerThanObserved = cachedTurnCount != null && observedTurnCount != null
      && cachedTurnCount > observedTurnCount;
    const publishedLargerThanObserved = publishedTurnCount != null && observedTurnCount != null
      && publishedTurnCount > observedTurnCount;
    const positivePartialEvidence = retainedOffDom
      || unionRetained
      || cacheLargerThanObserved
      || publishedLargerThanObserved
      || protectiveRefusal
      || destructiveShrink;
    let partialBasis = null;
    if (retainedOffDom) partialBasis = 'off-dom-cache-rows-retained';
    else if (unionRetained) partialBasis = 'partial-hydration-union';
    else if (destructiveShrink) partialBasis = 'unproven-cache-shrink-persisted';
    else if (protectiveRefusal) partialBasis = 'unproven-shrink-refused';
    else if (cacheLargerThanObserved || publishedLargerThanObserved) {
      partialBasis = 'cache-larger-than-observed-projection';
    }

    let status = 'unknown';
    let basis = 'no-independent-completeness-proof';
    if (proofAvailable) {
      status = 'complete';
      basis = String(completenessProof.basis || 'independent-end-to-end-coverage');
    } else if (partialBasis) {
      status = 'incomplete';
      basis = partialBasis;
    }

    const historicalCompleteness = {
      status,
      basis,
      chatKey: currentChatKey,
      observedTurnCount,
      publishedTurnCount,
      cachedTurnCount,
      offDomRetainedCount,
      completenessProofAvailable: proofAvailable,
      latestMergeMode: merge?.mode || null,
      persistenceProtection: persistence ? {
        status: persistence.status,
        previousCount: persistence.previousCount,
        incomingCount: persistence.incomingCount,
        proofAccepted: persistence.proofAccepted,
        reason: persistence.reason,
      } : null,
    };
    const warningEvidence = positivePartialEvidence ? {
      warning: 'incomplete-projection-coverage',
      basis: partialBasis || basis,
      observedTurnCount,
      publishedTurnCount,
      cachedTurnCount,
      offDomRetainedCount,
      latestMergeMode: merge?.mode || null,
    } : null;
    const destructiveShrinkEvidence = destructiveShrink ? {
      blocker: 'unproven-cache-shrink-persisted',
      previousCount: persistence.previousCount,
      incomingCount: persistence.incomingCount,
      status: persistence.status,
      reason: persistence.reason,
    } : null;
    return chatAtlasFreeze({
      historicalCompleteness,
      warningEvidence,
      destructiveShrinkEvidence,
    });
  }

  function getChatAtlasHistoricalCompleteness() {
    return chatAtlasEvaluateHistoricalCompleteness().historicalCompleteness;
  }

  // True while a trusted native branch selection is mid-transition: the
  // committed turn list still describes the outgoing branch, so unmatched
  // mounted turns must not extend it (they belong to the incoming branch and
  // will be represented by the validated branch index instead).
  function chatAtlasBranchTransitionSuppressesLiveAppend() {
    try {
      if (completeTurnIndexAuthorityState.enabled !== true) return false;
      // The suppression owner is the whole transition, not one boolean: a
      // live click intent, an in-flight token-matched acquisition, or stale
      // scope that has not yet resolved into a current selected-path overlay.
      // Once the overlay IS the effective presentation the branch is
      // complete, and genuinely new turns may append again.
      // The branch transaction is the dominant owner: while it is pending or
      // fail-closed, no mounted foreign turn may extend authority — regardless
      // of what happens to the stale flag, intent, or host payload underneath.
      // Route/reset/supersession explicitly replace or reset the keyed owner.
      const transaction = typeof chatAtlasBranchTransactionCurrent === 'function'
        ? chatAtlasBranchTransactionCurrent()
        : null;
      if (transaction?.state === 'pending' || transaction?.state === 'fail-closed') return true;
      const overlaySettled = typeof chatAtlasSelectedPathOverlayCurrent === 'function'
        && chatAtlasSelectedPathOverlayCurrent();
      if (overlaySettled) return false;
      if (completeTurnIndexAuthorityState.branchSelectionStale === true) return true;
      if (completeTurnIndexAuthorityState.trustedSelectedPathIntent) return true;
      if (
        selectedPathAcquisitionState.token
        && selectedPathAcquisitionState.refetchActiveForToken === selectedPathAcquisitionState.token
      ) return true;
      return false;
    } catch {
      return false;
    }
  }

  function getCanonicalTurnStructureDiagnostics() {
    const decision = turnState.lastStructureDecision;
    return Object.freeze({
      crossQIdAnswerConflictCount: Math.max(0, Number(turnState.crossQIdAnswerConflictCount || 0) || 0),
      lastCrossQIdAnswerConflict: turnState.lastCrossQIdAnswerConflict
        ? { ...turnState.lastCrossQIdAnswerConflict, sharedAnswerIds: [...turnState.lastCrossQIdAnswerConflict.sharedAnswerIds] }
        : null,
      recentCrossQIdAnswerConflicts: turnState.recentCrossQIdAnswerConflicts.map((row) => ({
        ...row,
        sharedAnswerIds: [...row.sharedAnswerIds],
      })),
      lastStructureDecision: decision
        ? {
          ...decision,
          reasons: [...(decision.reasons || [])],
          structure: decision.structure
            ? { ...decision.structure, reasons: [...(decision.structure.reasons || [])] }
            : null,
        }
        : null,
    });
  }

  // ── CV-3.4 complete-turn-index authority (memory-gated) ─────────────────
  // The host-payload parser lives in 0D3a. This layer accepts only its
  // sanitized, globally-proven ID graph, persists that graph separately from
  // MiniMap's legacy row cache, and projects it through the existing canonical
  // merge machinery. The canary switch itself is deliberately memory-only.
  const COMPLETE_TURN_INDEX_CANARY = 'complete-turn-index-projection';

  /* The host renders only a sparse window of the conversation (measured: ~5 of
     37 turns, history never initially rendered, elements replaced on revisit),
     so DOM-derived membership tiers structurally under- and mis-count. The
     complete-index authority is the only membership model consistent with that
     lifecycle and has soaked on the working-internal profile via persisted
     preference. Default it on: an unset preference now resolves enabled, a
     stored '0' still disables, and every activation still requires the full
     authority proof (route match, complete status, host-payload-full-graph) —
     otherwise the legacy tiers keep serving as the automatic fallback. */
  const COMPLETE_TURN_INDEX_COMPILED_DEFAULT = true;

  const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';


  const COMPLETE_TURN_INDEX_CACHE_KEY_PREFIX = 'h2o:prm:cgx:chat-atlas:complete-turn-index:v1:chat:';

  const COMPLETE_TURN_INDEX_STATE_EVENT = 'evt:h2o:complete-turn-index:state';

  const COMPLETE_TURN_INDEX_COMPLETE_STATUSES = Object.freeze([
    'complete-from-cache',
    'complete-from-host-payload',
    'complete-validated',
    'offline-complete-cache',
    'complete-refresh-pending',
    'complete-refreshing',
    'complete-refresh-validated',
    'complete-refresh-failed-cache-preserved',
    'live-pending-overlay',
  ]);

  const COMPLETE_TURN_INDEX_REFRESH_LIMITS = Object.freeze({
    debounceMs: 280,
    timeoutMs: 4500,
    selectedPathConfirmationDelayMs: 1250,
    trustedSelectionWindowMs: 5000,
    diagnosticCauseLimit: 8,
    errorCodeLength: 96,
  });

  const COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS = Object.freeze([
    '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
    '3bdfa68f-a197-422a-a3d4-29f028fc6564',
    'e1d4b63f-0be7-4a51-b074-e3372b71d790',
    'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
  ]);

  const COMPLETE_TURN_INDEX_CACHE_KEYS = Object.freeze([
    'schema',
    'chatId',
    'payloadUpdateTime',
    'sourceFingerprint',
    'capturedAt',
    'validatedAt',
    'complete',
    'proof',
    'turns',
  ]);

  const COMPLETE_TURN_INDEX_ROW_KEYS = Object.freeze([
    'order',
    'qId',
    'turnId',
    'answerVariants',
    'primaryAId',
    'noAnswer',
    'stopped',
  ]);

  function chatAtlasCompleteIndexCode(value, fallback = 'complete-index-error', limit = 96) {
    const raw = String(value || '').trim();
    const boundedFallback = String(fallback || 'complete-index-error').slice(0, Math.max(16, Number(limit || 96)));
    if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(raw)) return boundedFallback;
    return raw.slice(0, Math.max(16, Number(limit || 96)));
  }

  // CV-3.4 Gate 4 refresh production seam:begin
  // One debounced coordinator owns all live completion/branch/edit refreshes.
  // It accepts only the already-proven host envelope and publishes only after
  // the IDs-only cache replacement succeeds, keeping membership/cache atomic.
  function createCompleteIndexRefreshCoordinator(adapters = {}, options = {}) {
    const limits = Object.freeze({
      ...COMPLETE_TURN_INDEX_REFRESH_LIMITS,
      ...(options?.limits || {}),
    });
    const state = {
      generation: 0,
      status: 'idle',
      causes: new Set(),
      timer: null,
      timeoutTimer: null,
      promise: null,
      controller: null,
      routeKey: '',
      fetchCount: 0,
      debounceCount: 0,
      coalescedCount: 0,
      staleDiscardCount: 0,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      pendingCount: 0,
      trailingRequired: false,
      trailingRefreshCount: 0,
      authorityUnpersisted: false,
      cacheWriteErrorCode: null,
      selectedPathSignalCount: 0,
      selectedPathAcceptanceCount: 0,
      selectedPathRejectedCount: 0,
      selectedPathCancellationCount: 0,
      selectedPathDeduplicatedCount: 0,
      selectedPathUnconfirmedCount: 0,
      selectedPathLastSignature: null,
      selectedPathPendingEvidence: null,
      selectedPathActiveEvidence: null,
      selectedPathSuppressedSignatures: new Set(),
      selectedPathResultCode: null,
      selectedPathConfirmationTimer: null,
      selectedPathConfirmationEvidence: null,
      selectedPathConfirmationLease: null,
      selectedPathRequestLease: null,
      selectedPathConfirmationTokens: new Set(),
      selectedPathConfirmationScheduledCount: 0,
      selectedPathConfirmationFetchCount: 0,
      selectedPathConfirmationCancelledCount: 0,
      selectedPathActiveRevoked: false,
    };
    const now = () => Math.max(0, Number(adapters?.now?.() ?? Date.now()) || 0);
    const iso = (value) => {
      try { return new Date(value).toISOString(); } catch { return null; }
    };
    const errorCode = (value, fallback = 'complete-index-error') => chatAtlasCompleteIndexCode(
      value,
      fallback,
      limits.errorCodeLength,
    );
    const routeKey = () => String(adapters?.routeKey?.() || '');
    const enabled = () => adapters?.isEnabled?.() === true;
    const selectedPathCause = (cause) => [
      'question-branch-changed',
      'question-selected-path-changed',
      'answer-branch-changed',
      'trusted-native-branch-click',
    ].includes(String(cause || ''));
    // Production always supplies this adapter. The permissive missing-adapter
    // fallback is retained only for older isolated coordinator harnesses; an
    // installed adapter must return exactly true and exceptions fail closed.
    const reconciliationActive = () => {
      if (typeof adapters?.reconciliationActive !== 'function') return true;
      try { return adapters.reconciliationActive() === true; } catch { return false; }
    };
    // Selected-path work is authorized by either owner: the memory-only
    // automatic-reconciliation canary (generic-inspection lane), or trusted
    // capture evidence minted from a real native branch click. The user's own
    // click must be able to drive its single bounded acquisition after a fresh
    // reload, where the canary is always false — otherwise the runtime waits
    // for branch authority that nothing ever fetches.
    const selectedPathTrustAuthorized = (...evidences) => reconciliationActive()
      || evidences.some((evidence) => evidence?.trusted === true && !!evidence?.selectionToken);
    const causeSample = () => Array.from(state.causes).slice(0, Math.max(1, Number(limits.diagnosticCauseLimit || 8)));
    const snapshot = () => Object.freeze({
      status: state.status,
      generation: state.generation,
      fetchCount: state.fetchCount,
      debounceCount: state.debounceCount,
      coalescedCount: state.coalescedCount,
      staleDiscardCount: state.staleDiscardCount,
      pendingCount: state.pendingCount,
      causeSample: Object.freeze(causeSample()),
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      errorCode: state.errorCode,
      trailingRequired: state.trailingRequired,
      trailingRefreshCount: state.trailingRefreshCount,
      authorityUnpersisted: state.authorityUnpersisted,
      cacheWriteErrorCode: state.cacheWriteErrorCode,
      selectedPathSignalCount: state.selectedPathSignalCount,
      selectedPathAcceptanceCount: state.selectedPathAcceptanceCount,
      selectedPathRejectedCount: state.selectedPathRejectedCount,
      selectedPathCancellationCount: state.selectedPathCancellationCount,
      selectedPathDeduplicatedCount: state.selectedPathDeduplicatedCount,
      selectedPathUnconfirmedCount: state.selectedPathUnconfirmedCount,
      selectedPathLastSignature: state.selectedPathLastSignature,
      selectedPathActiveSignature: state.selectedPathActiveEvidence?.signature
        || state.selectedPathPendingEvidence?.signature
        || state.selectedPathConfirmationEvidence?.signature
        || null,
      selectedPathActiveTrusted: (
        state.selectedPathActiveEvidence
        || state.selectedPathPendingEvidence
        || state.selectedPathConfirmationEvidence
      )?.trusted === true,
      selectedPathResultCode: state.selectedPathResultCode,
      selectedPathConfirmationPending: !!state.selectedPathConfirmationTimer,
      selectedPathConfirmationLeaseActive: !!state.selectedPathConfirmationLease,
      selectedPathRequestLeaseActive: !!state.selectedPathRequestLease,
      selectedPathConfirmationScheduledCount: state.selectedPathConfirmationScheduledCount,
      selectedPathConfirmationFetchCount: state.selectedPathConfirmationFetchCount,
      selectedPathConfirmationCancelledCount: state.selectedPathConfirmationCancelledCount,
      timerPending: !!state.timer,
      requestActive: !!state.promise,
    });
    const notify = (status, partial = {}) => {
      state.status = String(status || state.status || 'idle');
      Object.assign(state, partial || {});
      try { adapters?.onState?.(snapshot()); } catch {}
      return snapshot();
    };
    const clearDebounce = () => {
      if (!state.timer) return;
      try { (adapters?.clearTimeout || clearTimeout)(state.timer); } catch {}
      state.timer = null;
    };
    const clearRequestTimeout = () => {
      if (!state.timeoutTimer) return;
      try { (adapters?.clearTimeout || clearTimeout)(state.timeoutTimer); } catch {}
      state.timeoutTimer = null;
    };
    // The lease check (when wired) only fails on genuine supersession by a
    // newer live token; it deliberately ignores the original capture's age.
    // Harnesses/baselines without the lease adapter keep the legacy
    // evidence-current semantics.
    const selectedPathLeaseCheck = (evidence) => {
      const check = adapters?.selectedPathLeaseCurrent || adapters?.selectedPathEvidenceCurrent;
      return check ? check(evidence) : undefined;
    };
    const selectedPathRequestScope = (evidence) => {
      if (typeof adapters?.selectedPathRequestScope !== 'function') return null;
      try {
        const scope = adapters.selectedPathRequestScope(evidence);
        if (!scope || typeof scope !== 'object') return null;
        return Object.freeze({
          requestIdentity: String(scope.requestIdentity || ''),
          token: String(scope.token || ''),
          chatId: String(scope.chatId || ''),
          routeKey: String(scope.routeKey || ''),
          generation: Number(scope.generation || 0),
          staleRevision: Number(scope.staleRevision || 0),
          qId: String(scope.qId || ''),
        });
      } catch {
        return null;
      }
    };
    const selectedPathRequestOwnsIntent = (intent) => {
      const lease = state.selectedPathRequestLease;
      const evidence = lease?.evidence;
      const scope = lease?.scope;
      if (!intent || !lease || !evidence || !scope) return false;
      const token = String(intent.token || '');
      const matchingWork = [
        state.selectedPathPendingEvidence,
        state.selectedPathActiveEvidence,
        state.selectedPathConfirmationEvidence,
      ].some((candidate) => candidate?.selectionToken === token);
      return !!token
        && matchingWork
        && scope.requestIdentity === String(evidence.signature || '')
        && scope.token === token
        && scope.chatId === String(intent.chatId || '')
        && scope.routeKey === String(intent.routeKey || '')
        && scope.generation === Number(intent.generation || 0)
        && scope.staleRevision === Number(intent.staleRevision || 0)
        && scope.qId === String(intent.qId || '')
        && evidence.selectionToken === token
        && evidence.qId === scope.qId
        && lease.routeKey === state.routeKey
        && state.routeKey === routeKey()
        && Number(lease.generation || 0) === Number(adapters?.routeGeneration?.() ?? lease.generation ?? 0)
        && selectedPathLeaseCheck(evidence) !== false;
    };
    const clearSelectedPathRequestLease = (reason) => {
      const lease = state.selectedPathRequestLease;
      if (!lease) return;
      state.selectedPathRequestLease = null;
      adapters?.trace?.('trusted-request-lease-cancelled', {
        reason,
        qId: lease.evidence.qId,
        token: lease.evidence.selectionToken,
      });
    };
    function clearExpiredSelectedPathRequestLeaseForIntent(intent, reason = 'trusted-intent-expired') {
      const token = String(intent?.token || '');
      if (
        !token
        || state.selectedPathRequestLease?.evidence?.selectionToken !== token
        || selectedPathRequestOwnsIntent(intent)
      ) return false;
      clearSelectedPathRequestLease(reason);
      return true;
    }
    const resolveSelectedPath = (evidence, reason) => {
      if (
        state.selectedPathRequestLease
        && evidence?.selectionToken === state.selectedPathRequestLease.evidence.selectionToken
      ) clearSelectedPathRequestLease(`resolved-${reason}`);
      try { adapters?.onSelectedPathResolved?.(evidence, reason); } catch {}
    };
    const clearSelectedPathConfirmation = (reason = 'cancelled', clearTokens = false) => {
      const evidence = state.selectedPathConfirmationEvidence;
      if (state.selectedPathConfirmationTimer) {
        try { (adapters?.clearTimeout || clearTimeout)(state.selectedPathConfirmationTimer); } catch {}
        state.selectedPathConfirmationCancelledCount += 1;
      }
      state.selectedPathConfirmationTimer = null;
      state.selectedPathConfirmationEvidence = null;
      state.selectedPathConfirmationLease = null;
      if (evidence?.selectionToken) state.selectedPathConfirmationTokens.delete(evidence.selectionToken);
      if (clearTokens) state.selectedPathConfirmationTokens.clear();
      if (evidence) {
        resolveSelectedPath(evidence, reason);
      }
    };
    const cancelSelectedPathReconciliation = (reasonRaw = 'reconciliation-disabled') => {
      const reason = errorCode(reasonRaw, 'reconciliation-disabled');
      const pending = state.selectedPathPendingEvidence;
      const active = state.selectedPathActiveEvidence;
      const requestLease = state.selectedPathRequestLease;
      const confirmation = state.selectedPathConfirmationEvidence;
      const hadSelectedPathWork = !!(
        pending
        || active
        || requestLease
        || confirmation
        || Array.from(state.causes).some(selectedPathCause)
      );
      clearSelectedPathConfirmation(reason, true);
      clearSelectedPathRequestLease(reason);
      state.selectedPathPendingEvidence = null;
      if (active) state.selectedPathActiveRevoked = true;
      state.selectedPathSuppressedSignatures.clear();
      state.selectedPathResultCode = 'selected-path-reconciliation-disabled';
      for (const cause of Array.from(state.causes)) {
        if (selectedPathCause(cause)) state.causes.delete(cause);
      }
      if (!state.causes.size) {
        state.trailingRequired = false;
        if (!state.promise) clearDebounce();
      }
      if (hadSelectedPathWork) state.selectedPathCancellationCount += 1;
      adapters?.trace?.('selected-reconciliation-cancelled', {
        reason,
        qId: pending?.qId || active?.qId || requestLease?.evidence?.qId || confirmation?.qId || '',
      });
      return snapshot();
    };
    const settleSelectedPathGraphPublication = (tokenRaw) => {
      const token = String(tokenRaw || '');
      if (!token) return false;
      const matches = (evidence) => String(evidence?.selectionToken || '') === token;
      const owned = matches(state.selectedPathPendingEvidence)
        || matches(state.selectedPathActiveEvidence)
        || matches(state.selectedPathConfirmationEvidence)
        || matches(state.selectedPathRequestLease?.evidence);
      if (!owned) return false;
      clearSelectedPathConfirmation('complete-graph-path-published', true);
      if (matches(state.selectedPathRequestLease?.evidence)) {
        clearSelectedPathRequestLease('complete-graph-path-published');
      }
      if (matches(state.selectedPathPendingEvidence)) state.selectedPathPendingEvidence = null;
      state.selectedPathSuppressedSignatures.clear();
      state.selectedPathResultCode = 'selected-path-complete-graph-published';
      for (const cause of Array.from(state.causes)) {
        if (selectedPathCause(cause)) state.causes.delete(cause);
      }
      if (!state.causes.size) state.trailingRequired = false;
      return true;
    };
    const cancel = (reason = 'cancelled', status = 'stale-route-discarded') => {
      clearDebounce();
      clearRequestTimeout();
      clearSelectedPathConfirmation(reason, true);
      clearSelectedPathRequestLease(String(reason || 'cancelled'));
      state.generation += 1;
      try { state.controller?.abort?.(errorCode(reason)); } catch {}
      state.controller = null;
      state.promise = null;
      state.causes.clear();
      state.trailingRequired = false;
      state.selectedPathLastSignature = null;
      state.selectedPathPendingEvidence = null;
      state.selectedPathActiveEvidence = null;
      state.selectedPathActiveRevoked = false;
      state.selectedPathSuppressedSignatures.clear();
      state.selectedPathResultCode = null;
      return notify(status, {
        completedAt: iso(now()),
        errorCode: errorCode(reason),
      });
    };
    const markPending = (count = 0) => {
      state.pendingCount = Math.max(0, Number(count || 0) || 0);
      if (!enabled() || !state.pendingCount) return snapshot();
      return notify('live-pending-overlay', { errorCode: null });
    };
    const scheduleSelectedPathConfirmation = (evidence) => {
      const token = String(evidence?.selectionToken || '');
      adapters?.trace?.('confirmation-eligibility-checked', {
        qId: evidence?.qId,
        trusted: evidence?.trusted === true,
        token,
        confirmationAttempt: evidence?.confirmationAttempt === true,
      });
      // Execution-time reconciliation-gate recheck: if the memory-only gate was
      // disabled after a trusted request was accepted but before this confirmation
      // could be scheduled (e.g. flipped off during the debounce window), no
      // confirmation lease is created. Absent adapter (focused coordinator
      // harnesses) is permissive, preserving existing Gate 5 confirmation tests.
      if (!selectedPathTrustAuthorized(evidence)) {
        adapters?.trace?.('confirmation-skipped', {
          reason: 'reconciliation-disabled',
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      if (!evidence?.trusted || !token || evidence?.confirmationAttempt) {
        adapters?.trace?.('confirmation-skipped', {
          reason: !evidence?.trusted
            ? 'evidence-untrusted'
            : (!token ? 'missing-selection-token' : 'already-confirmation-attempt'),
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      // An accepted trusted request has already survived capture->bind->
      // trusted-schedule under the five-second age window; from here on its
      // confirmation is governed by its own bounded lease, NOT by the original
      // capture's age. Scope changes cancel through the coordinator instead.
      if (selectedPathLeaseCheck(evidence) === false) {
        adapters?.trace?.('confirmation-skipped', {
          reason: 'evidence-not-current',
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      if (state.selectedPathConfirmationTokens.has(token)) {
        adapters?.trace?.('confirmation-skipped', {
          reason: 'token-already-confirmed',
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      clearSelectedPathConfirmation('superseded');
      state.selectedPathConfirmationTokens.add(token);
      state.selectedPathConfirmationEvidence = evidence;
      state.selectedPathConfirmationScheduledCount += 1;
      // Freeze the confirmation lease NOW: an immutable bounded record of the
      // scope this confirmation was accepted under. The 1250ms callback
      // validates against this record (token/qId/route/generation), never
      // against the original capture timestamp.
      state.selectedPathConfirmationLease = Object.freeze({
        selectionToken: token,
        qId: String(evidence.qId || ''),
        routeKey: state.routeKey,
        generation: Number(adapters?.routeGeneration?.() ?? 0),
        baselineAnswerId: String(evidence.baselineAnswerId || ''),
        expectChange: evidence.expectChange === true,
        scheduledAt: now(),
        attempt: state.selectedPathConfirmationScheduledCount,
      });
      state.selectedPathResultCode = 'selected-path-confirmation-pending';
      adapters?.trace?.('confirmation-scheduled', {
        qId: evidence.qId,
        token,
        trusted: true,
        cause: evidence.cause,
      });
      state.selectedPathConfirmationTimer = (adapters?.setTimeout || setTimeout)(() => {
        state.selectedPathConfirmationTimer = null;
        const pending = state.selectedPathConfirmationEvidence;
        state.selectedPathConfirmationEvidence = null;
        const lease = state.selectedPathConfirmationLease;
        state.selectedPathConfirmationLease = null;
        const current = pending
          && enabled()
          && state.routeKey === routeKey()
          // Execution-time authorization recheck: a confirmation must still be
          // owned — by the canary or by its own trusted capture evidence —
          // when this delayed callback fires (bounded stale exit below).
          && selectedPathTrustAuthorized(pending)
          && lease
          && lease.selectionToken === pending.selectionToken
          && lease.qId === pending.qId
          && lease.routeKey === state.routeKey
          && Number(lease.generation || 0) === Number(adapters?.routeGeneration?.() ?? lease.generation ?? 0)
          && selectedPathLeaseCheck(pending) !== false;
        if (!current) {
          if (pending) {
            state.selectedPathConfirmationCancelledCount += 1;
            if (pending.selectionToken) state.selectedPathConfirmationTokens.delete(pending.selectionToken);
            resolveSelectedPath(pending, 'stale-confirmation');
          }
          return;
        }
        state.selectedPathSuppressedSignatures.delete(pending.signature);
        state.selectedPathPendingEvidence = Object.freeze({ ...pending, confirmationAttempt: true });
        if (state.causes.size < Number(limits.diagnosticCauseLimit || 8)) state.causes.add(pending.cause);
        adapters?.trace?.('confirmation-started', {
          qId: pending.qId,
          token: pending.selectionToken,
          trusted: pending.trusted === true,
          cause: pending.cause,
        });
        state.selectedPathConfirmationFetchCount += 1;
        void refresh();
      }, Math.max(100, Number(limits.selectedPathConfirmationDelayMs || 1250)));
      return true;
    };
    const refresh = () => {
      clearDebounce();
      if (!enabled()) return Promise.resolve(snapshot());
      if (state.promise) {
        state.coalescedCount += 1;
        return state.promise;
      }
      const retained = adapters?.currentIndex?.() || null;
      const chatId = String(retained?.chatId || adapters?.chatId?.() || '');
      const provider = adapters?.provider?.();
      if (!retained?.complete || !chatId || typeof provider !== 'function') {
        return Promise.resolve(notify('complete-refresh-failed-cache-preserved', {
          errorCode: 'refresh-prerequisite-missing',
          completedAt: iso(now()),
        }));
      }
      let causes = causeSample();
      const queuedSelectedPathWork = !!state.selectedPathPendingEvidence
        || causes.some(selectedPathCause);
      const queuedOrdinaryWork = causes.some((cause) => !selectedPathCause(cause));
      if (queuedSelectedPathWork && !selectedPathTrustAuthorized(state.selectedPathPendingEvidence)) {
        cancelSelectedPathReconciliation('reconciliation-disabled-before-provider');
        causes = causeSample();
        if (!queuedOrdinaryWork) {
          return Promise.resolve(notify('complete-refresh-failed-cache-preserved', {
            errorCode: 'selected-path-reconciliation-disabled',
            completedAt: iso(now()),
          }));
        }
      }
      const Controller = adapters?.AbortController || globalThis.AbortController;
      const controller = typeof Controller === 'function' ? new Controller() : null;
      const generation = state.generation + 1;
      state.generation = generation;
      state.routeKey = routeKey();
      state.controller = controller;
      state.startedAt = iso(now());
      state.completedAt = null;
      state.errorCode = null;
      state.selectedPathActiveEvidence = state.selectedPathPendingEvidence;
      state.selectedPathPendingEvidence = null;
      state.selectedPathActiveRevoked = false;
      if (state.selectedPathActiveEvidence) {
        adapters?.trace?.('selected-refresh-started', {
          cause: state.selectedPathActiveEvidence.cause,
          qId: state.selectedPathActiveEvidence.qId,
          trusted: state.selectedPathActiveEvidence.trusted === true,
          token: state.selectedPathActiveEvidence.selectionToken,
          confirmationAttempt: state.selectedPathActiveEvidence.confirmationAttempt === true,
        });
      }
      causes = causeSample();
      const selectedPathExecution = !!state.selectedPathActiveEvidence
        || causes.some(selectedPathCause);
      const selectedPathExecutionOnly = selectedPathExecution
        && !causes.some((cause) => !selectedPathCause(cause));
      state.causes.clear();
      notify('complete-refreshing');

      const timeoutPromise = new Promise((resolve) => {
        state.timeoutTimer = (adapters?.setTimeout || setTimeout)(() => {
          try { controller?.abort?.('refresh-timeout'); } catch {}
          resolve({ timeout: true });
        }, Math.max(100, Number(limits.timeoutMs || 4500)));
      });
      const providerPromise = Promise.resolve()
        .then(() => {
          // The debounce callback may already have started when the memory-only
          // gate turns off. Selected-only work must still stop immediately before
          // the GET; mixed ordinary work continues without selected evidence.
          if (selectedPathExecution && !selectedPathTrustAuthorized(
            state.selectedPathActiveEvidence,
            state.selectedPathRequestLease?.evidence,
          )) {
            cancelSelectedPathReconciliation('reconciliation-disabled-before-provider');
            if (selectedPathExecutionOnly) {
              return { selectedPathDiscarded: true, phase: 'before-provider' };
            }
            state.selectedPathActiveEvidence = null;
            state.selectedPathActiveRevoked = false;
          }
          state.fetchCount += 1;
          return provider(chatId, { signal: controller?.signal, causes });
        })
        .then((value) => ({ value }), (error) => ({ error }));

      const operation = Promise.race([providerPromise, timeoutPromise])
        .then((outcome) => {
          const current = generation === state.generation && state.routeKey === routeKey() && enabled();
          if (!current) {
            state.staleDiscardCount += 1;
            return snapshot();
          }
          if (outcome?.value?.selectedPathDiscarded === true) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: 'selected-path-reconciliation-disabled',
              completedAt: iso(now()),
            });
          }
          if (outcome?.timeout) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: 'refresh-timeout',
              completedAt: iso(now()),
            });
          }
          if (outcome?.error) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: errorCode(outcome.error?.code, 'provider-failed'),
              completedAt: iso(now()),
            });
          }
          const result = outcome?.value;
          const normalized = result?.ok === true
            ? adapters?.normalize?.(result.index, chatId)
            : { ok: false, errorCode: result?.errorCode || 'full-index-unavailable' };
          if (!normalized?.ok || !normalized?.envelope) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: errorCode(normalized?.errorCode || 'complete-index-proof-invalid'),
              completedAt: iso(now()),
            });
          }
          const incoming = normalized.envelope;
          const revisionOrder = Number(adapters?.compareRevision?.(
            incoming.payloadUpdateTime,
            retained.payloadUpdateTime,
          ) || 0);
          if (revisionOrder < 0) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: 'older-host-payload',
              completedAt: iso(now()),
            });
          }
          // A selected-only GET may already be in flight when qualification is
          // disabled. Preserve the existing proven authority byte-for-byte: no
          // confirmation, cache write, publication, canonical rebuild, or primary
          // mutation may consume that result. Mixed ordinary refreshes remain
          // eligible, but their selected evidence is discarded.
          if (selectedPathExecution && (
            !selectedPathTrustAuthorized(
              state.selectedPathActiveEvidence,
              state.selectedPathRequestLease?.evidence,
            )
            || state.selectedPathActiveRevoked
          )) {
            cancelSelectedPathReconciliation('reconciliation-disabled-before-publication');
            if (selectedPathExecutionOnly) {
              return notify('complete-refresh-failed-cache-preserved', {
                errorCode: 'selected-path-reconciliation-disabled',
                completedAt: iso(now()),
              });
            }
            state.selectedPathActiveEvidence = null;
            state.selectedPathActiveRevoked = false;
          }
          // The accepted trusted request lease survives outcomes that consume
          // or bypass the active evidence (races, discarded older payloads):
          // when no active evidence reached this outcome, a still-valid lease
          // supplies the trusted evidence so the initial-refresh completion
          // and the single delayed confirmation are governed by the lease —
          // never by the original capture's age.
          const requestLease = state.selectedPathRequestLease;
          const requestLeaseUsable = !!requestLease
            && !state.selectedPathActiveEvidence
            && state.routeKey === routeKey()
            && requestLease.routeKey === state.routeKey
            && Number(requestLease.generation || 0) === Number(adapters?.routeGeneration?.() ?? requestLease.generation ?? 0)
            && !state.selectedPathConfirmationTimer
            && !state.selectedPathConfirmationTokens.has(requestLease.evidence.selectionToken)
            && selectedPathLeaseCheck(requestLease.evidence) !== false;
          const selectedEvidence = state.selectedPathActiveEvidence
            || (requestLeaseUsable ? requestLease.evidence : null);
          if (requestLeaseUsable && selectedEvidence) {
            adapters?.trace?.('trusted-request-lease-retained', {
              qId: selectedEvidence.qId,
              token: selectedEvidence.selectionToken,
            });
          }
          const selectedPathConfirmed = !!selectedEvidence
            && adapters?.selectedPathConfirmed?.(incoming, selectedEvidence) === true;
          // A capture-driven request confirms strictly on the host primary
          // leaving its baseline (expectChange). While it has NOT yet — even if
          // an unrelated downstream turn advanced the payload revision — the
          // switch is still pending, so it must still schedule its one delayed
          // confirmation rather than being dropped by the revision===0 gate the
          // generic observed-answer path relies on.
          const selectedPathUnchanged = !!selectedEvidence
            && !selectedPathConfirmed
            && (
              selectedEvidence.expectChange === true
              || (
                revisionOrder === 0
                && String(incoming?.sourceFingerprint || '') === String(retained?.sourceFingerprint || '')
              )
            );
          if (selectedPathConfirmed) {
            state.selectedPathSuppressedSignatures.delete(selectedEvidence.signature);
            if (selectedEvidence.selectionToken) {
              state.selectedPathConfirmationTokens.delete(selectedEvidence.selectionToken);
            }
            state.selectedPathResultCode = null;
            resolveSelectedPath(selectedEvidence, 'confirmed');
          } else if (selectedPathUnchanged) {
            adapters?.trace?.('selected-refresh-unchanged', {
              cause: selectedEvidence.cause,
              qId: selectedEvidence.qId,
              trusted: selectedEvidence.trusted === true,
              token: selectedEvidence.selectionToken,
              confirmationAttempt: selectedEvidence.confirmationAttempt === true,
            });
            state.selectedPathUnconfirmedCount += 1;
            if (state.selectedPathSuppressedSignatures.size >= Number(limits.diagnosticCauseLimit || 8)) {
              state.selectedPathSuppressedSignatures.delete(state.selectedPathSuppressedSignatures.values().next().value);
            }
            state.selectedPathSuppressedSignatures.add(selectedEvidence.signature);
            const confirmationScheduled = scheduleSelectedPathConfirmation(selectedEvidence);
            if (!confirmationScheduled) {
              state.selectedPathResultCode = selectedEvidence?.confirmationAttempt
                ? 'selected-path-confirmation-unconfirmed'
                : 'selected-path-unconfirmed-unchanged';
              if (selectedEvidence?.confirmationAttempt) {
                if (selectedEvidence.selectionToken) {
                  state.selectedPathConfirmationTokens.delete(selectedEvidence.selectionToken);
                }
                resolveSelectedPath(selectedEvidence, 'unconfirmed');
              }
            }
          }
          const write = adapters?.writeCache?.(incoming) || { ok: false, status: 'cache-write-failed' };
          if (!write.ok) {
            adapters?.publish?.(incoming, 'host-refresh-unpersisted');
            state.pendingCount = Math.max(0, Number(adapters?.pendingCount?.() || 0) || 0);
            return notify('complete-refresh-validated', {
              errorCode: errorCode(write.status, 'cache-write-failed'),
              authorityUnpersisted: true,
              cacheWriteErrorCode: errorCode(write.status, 'cache-write-failed'),
              completedAt: iso(now()),
            });
          }
          adapters?.publish?.(incoming, 'host-refresh');
          state.pendingCount = Math.max(0, Number(adapters?.pendingCount?.() || 0) || 0);
          return notify('complete-refresh-validated', {
            errorCode: null,
            authorityUnpersisted: false,
            cacheWriteErrorCode: null,
            completedAt: iso(now()),
          });
        })
        .finally(() => {
          if (generation !== state.generation) return;
          clearRequestTimeout();
          state.controller = null;
          state.promise = null;
          if (
            state.selectedPathActiveEvidence?.confirmationAttempt
            && state.selectedPathResultCode === 'selected-path-confirmation-pending'
          ) {
            state.selectedPathResultCode = 'selected-path-confirmation-failed';
            if (state.selectedPathActiveEvidence.selectionToken) {
              state.selectedPathConfirmationTokens.delete(state.selectedPathActiveEvidence.selectionToken);
            }
            resolveSelectedPath(state.selectedPathActiveEvidence, 'failed');
          }
          state.selectedPathActiveEvidence = null;
          state.selectedPathActiveRevoked = false;
          const requestLease = state.selectedPathRequestLease;
          const requestScope = requestLease?.scope;
          if (requestLease && requestScope && !selectedPathRequestOwnsIntent({
            token: requestScope.token,
            chatId: requestScope.chatId,
            routeKey: requestScope.routeKey,
            generation: requestScope.generation,
            staleRevision: requestScope.staleRevision,
            qId: requestScope.qId,
          })) {
            try { adapters?.onSelectedPathRequestLeaseQuiescent?.(requestLease.evidence); } catch {}
          }
          const shouldTrail = state.trailingRequired
            && state.causes.size > 0
            && enabled()
            && state.routeKey === routeKey();
          state.trailingRequired = false;
          if (shouldTrail && !state.timer) {
            state.trailingRefreshCount += 1;
            state.debounceCount += 1;
            notify('complete-refresh-pending', { errorCode: null });
            state.timer = (adapters?.setTimeout || setTimeout)(() => {
              state.timer = null;
              void refresh();
            }, Math.max(0, Number(limits.debounceMs || 280)));
          }
        });
      state.promise = operation;
      return operation;
    };
    const schedule = (cause = 'turn-settled', opts = {}) => {
      if (!enabled()) return Promise.resolve(snapshot());
      const boundedCause = chatAtlasCompleteIndexCode(cause, 'turn-settled', 64);
      const rawEvidence = opts?.selectedPathEvidence;
      const rawSignature = String(rawEvidence?.signature || '').trim();
      const selectedPathEvidence = /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(rawSignature)
        ? Object.freeze({
          signature: rawSignature,
          cause: boundedCause,
          qId: String(rawEvidence?.qId || '').slice(0, 256),
          observedAnswerId: String(rawEvidence?.observedAnswerId || '').slice(0, 256),
          trusted: rawEvidence?.trusted === true,
          selectionToken: /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(String(rawEvidence?.selectionToken || ''))
            ? String(rawEvidence.selectionToken)
            : '',
          confirmationAttempt: rawEvidence?.confirmationAttempt === true,
          baselineAnswerId: String(rawEvidence?.baselineAnswerId || '').slice(0, 256),
          expectChange: rawEvidence?.expectChange === true,
        })
        : null;
      const selectedPathWork = selectedPathCause(boundedCause);
      if (selectedPathWork && !selectedPathTrustAuthorized(selectedPathEvidence)) {
        if (selectedPathEvidence) {
          state.selectedPathSignalCount += 1;
          state.selectedPathLastSignature = selectedPathEvidence.signature;
        }
        state.selectedPathRejectedCount += 1;
        adapters?.trace?.('selected-schedule-attempt', {
          cause: boundedCause,
          qId: selectedPathEvidence?.qId || '',
          trusted: selectedPathEvidence?.trusted === true,
          token: selectedPathEvidence?.selectionToken || '',
          signature: selectedPathEvidence?.signature || '',
          accepted: false,
          reason: 'reconciliation-disabled',
        });
        return Promise.resolve(snapshot());
      }
      if (selectedPathEvidence) {
        state.selectedPathSignalCount += 1;
        state.selectedPathLastSignature = selectedPathEvidence.signature;
        const duplicate = state.selectedPathSuppressedSignatures.has(selectedPathEvidence.signature)
          || selectedPathEvidence.signature === state.selectedPathActiveEvidence?.signature
          || selectedPathEvidence.signature === state.selectedPathPendingEvidence?.signature
          || selectedPathEvidence.signature === state.selectedPathConfirmationEvidence?.signature;
        adapters?.trace?.('selected-schedule-attempt', {
          cause: boundedCause,
          qId: selectedPathEvidence.qId,
          trusted: selectedPathEvidence.trusted,
          token: selectedPathEvidence.selectionToken,
          signature: selectedPathEvidence.signature,
          accepted: !duplicate,
        });
        if (duplicate) {
          state.selectedPathDeduplicatedCount += 1;
          adapters?.trace?.('selected-schedule-deduplicated', {
            cause: boundedCause,
            qId: selectedPathEvidence.qId,
            trusted: selectedPathEvidence.trusted,
            token: selectedPathEvidence.selectionToken,
            signature: selectedPathEvidence.signature,
          });
          return state.promise || Promise.resolve(snapshot());
        }
        // A trusted capture-driven request in flight (pending, confirming, or
        // actively refreshing) is authoritative. A generic UNTRUSTED signal —
        // e.g. a downstream turn re-rendering during the branch transition —
        // must never replace it as the pending evidence, so it cannot divert
        // the refresh away from the captured qId. It deduplicates against the
        // capture-driven request instead of clobbering it.
        const trustedInFlight = state.selectedPathPendingEvidence?.trusted === true
          || state.selectedPathConfirmationEvidence?.trusted === true
          || state.selectedPathActiveEvidence?.trusted === true;
        if (trustedInFlight && selectedPathEvidence.trusted !== true) {
          state.selectedPathDeduplicatedCount += 1;
          adapters?.trace?.('selected-schedule-deduplicated', {
            cause: boundedCause,
            qId: selectedPathEvidence.qId,
            trusted: false,
            signature: selectedPathEvidence.signature,
            reason: 'trusted-request-in-flight',
          });
          return state.promise || Promise.resolve(snapshot());
        }
        // Only a genuinely NEWER trusted selection (non-empty differing token)
        // may supersede a pending trusted confirmation. Token-less untrusted
        // evidence — e.g. a partial re-render pass where the switched turn is
        // virtualized out while a downstream turn still differs — must not
        // cancel the confirmation or consume the intent it belongs to.
        if (
          state.selectedPathConfirmationEvidence
          && selectedPathEvidence.selectionToken
          && selectedPathEvidence.selectionToken !== state.selectedPathConfirmationEvidence.selectionToken
        ) clearSelectedPathConfirmation('superseded');
        state.selectedPathAcceptanceCount += 1;
        state.selectedPathPendingEvidence = selectedPathEvidence;
        state.selectedPathResultCode = null;
        // ── Trusted request lease: frozen at coordinator ACCEPTANCE, before
        // the initial provider refresh begins. The five-second capture window
        // governed capture->bind->coordinator-acceptance; from here on this
        // immutable bounded record — never the capture's age — governs the
        // initial refresh completion and the single delayed confirmation.
        if (selectedPathEvidence.trusted === true && selectedPathEvidence.selectionToken) {
          if (
            state.selectedPathRequestLease
            && state.selectedPathRequestLease.evidence.selectionToken !== selectedPathEvidence.selectionToken
          ) clearSelectedPathRequestLease('superseded-by-newer-trusted');
          state.selectedPathRequestLease = Object.freeze({
            evidence: selectedPathEvidence,
            scope: selectedPathRequestScope(selectedPathEvidence),
            routeKey: routeKey(),
            generation: Number(adapters?.routeGeneration?.() ?? 0),
            acceptedAt: now(),
          });
          adapters?.trace?.('trusted-request-lease-created', {
            qId: selectedPathEvidence.qId,
            token: selectedPathEvidence.selectionToken,
            cause: boundedCause,
          });
        }
      }
      if (state.causes.size < Number(limits.diagnosticCauseLimit || 8)) state.causes.add(boundedCause);
      if (state.promise) {
        state.coalescedCount += 1;
        state.trailingRequired = true;
        return state.promise;
      }
      if (opts?.immediate === true) return refresh();
      if (state.timer) {
        state.coalescedCount += 1;
        return Promise.resolve(snapshot());
      }
      state.debounceCount += 1;
      notify('complete-refresh-pending', { errorCode: null });
      state.timer = (adapters?.setTimeout || setTimeout)(() => {
        state.timer = null;
        void refresh();
      }, Math.max(0, Number(limits.debounceMs || 280)));
      return Promise.resolve(snapshot());
    };
    return Object.freeze({
      schedule,
      refresh,
      cancel,
      cancelSelectedPathReconciliation,
      settleSelectedPathGraphPublication,
      markPending,
      getStatus: snapshot,
      selectedPathRequestOwnsIntent,
      clearExpiredSelectedPathRequestLeaseForIntent,
      limits,
    });
  }

  let completeIndexRefreshCoordinator = null;

  const completeTurnIndexAuthorityState = {
    enabled: false,
    status: 'disabled',
    chatId: null,
    routeKey: '',
    generation: 0,
    fetchCount: 0,
    cacheReadCount: 0,
    cacheWriteCount: 0,
    cacheWriteSkippedUnchangedCount: 0,
    cacheWriteFailureCount: 0,
    authorityUnpersisted: false,
    cacheWriteErrorCode: null,
    setterCallCount: 0,
    automaticSetterCallCount: 0,
    staleDiscardCount: 0,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    diagnosticStatus: null,
    index: null,
    indexSource: null,
    cacheChecked: false,
    cacheRaw: null,
    attempted: false,
    promise: null,
    controller: null,
    pendingDrafts: new Map(),
    pendingObservedAt: new Map(),
    pendingStateNotifyQueued: false,
    refreshListenerBound: false,
    refreshListenerRegistrationCount: 0,
    trustedSelectionSequence: 0,
    trustedSelectionCaptureCount: 0,
    trustedSelectedPathIntent: null,
    trustedNativeReconcileTask: null,
    // Round 1 passive branch-stale signal. IDs-only and memory-only: a valid
    // native Previous/Next capture marks the current complete projection as
    // potentially stale without authorizing any reconciliation work.
    branchSelectionStale: false,
    branchSelectionStaleRevision: 0,
    branchSelectionStaleQId: null,
    branchSelectionStaleChatId: null,
    branchSelectionStaleRouteKey: '',
    branchSelectionStaleGeneration: 0,
    branchExpansionLease: null,
    branchExpansionTimeoutTask: null,
    branchExpansionRetryTask: null,
    branchExpansionFailure: null,
    branchExpansionState: 'idle',
    branchExpansionReason: null,
    branchExpansionAnchorReturned: false,
    branchExpansionPriorCount: 0,
    branchExpansionPriorFingerprint: '',
    branchExpansionTargetCount: 0,
    branchExpansionExpectedFingerprint: '',
    branchExpansionRequiredPageNums: Object.freeze([]),
    branchExpansionSequence: 0,
    // Round 1: automatic native Previous/Next response-branch reconciliation is
    // DEFERRED to Round 2. This gate is independent of `enabled`, of the
    // persisted complete-turn preference, and of the memory canary; it defaults
    // false, is never persisted, and is flipped only by the memory-only
    // qualification setter below. Enabling the complete-turn projection never
    // enables reconciliation. Trusted native-click capture + canonical qId
    // binding + tracing stay available (for future passive stale-state
    // signaling); only the automatic reconciliation SCHEDULE is gated.
    autoBranchReconciliationEnabled: false,
    branchTransitionSuppressedLiveAppendCount: 0,
    branchStaleLastClearReason: null,
    nativeConvergenceState: null,
    nativeConvergenceActivating: false,
    branchTransactionState: null,
    branchTransactionSeq: 0,
    branchTransactionTrace: [],
    autoBranchReconciliationSetterCallCount: 0,
    preferenceResolved: false,
    preferenceStoredValue: null,
    preferenceResolution: 'unresolved',
    activationSource: 'compiled-default',
    preferenceReadCount: 0,
    preferenceWriteCount: 0,
    preferenceClearCount: 0,
    preferenceWriteFailureCount: 0,
    preferenceReadErrorCode: null,
    preferenceWriteErrorCode: null,
    preferenceSetterCallCount: 0,
    bootApplyCount: 0,
    bootActivationCount: 0,
  };

  const selectedPathAcquisitionState = {
    status: 'inactive',
    reason: 'runtime-initialized',
    token: null,
    anchorQId: null,
    anchorSelectedAId: null,
    priorAnswerId: null,
    chatId: null,
    routeKey: '',
    generation: 0,
    staleRevision: 0,
    graph: null,
    refetchAttemptedForToken: null,
    refetchActiveForToken: null,
    path: null,
    proof: null,
    provenAt: null,
    evaluatedLedgerVersion: 0,
    evaluationKey: '',
    lastDerivationDiagnostics: null,
    lastPublicationDecision: null,
  };

  const selectedPathOverlayState = {
    status: 'inactive',
    reason: 'runtime-initialized',
    token: null,
    chatId: null,
    routeKey: '',
    generation: 0,
    staleRevision: 0,
    canonicalFingerprint: '',
    acquisitionProofIdentity: '',
    acquisitionPathIdentity: '',
    evaluationKey: '',
    anchorQId: null,
    activatedAt: null,
    pathLength: 0,
    index: null,
    byQId: null,
    byAId: null,
    proof: null,
  };

  // CV-3.4 Gate 5 diagnostic-only trusted-branch lifecycle trace. Memory-only,
  // IDs-only (identifiers, hashes, reason codes — never message/payload content,
  // never the raw selection token). The persistent "last event" fields survive
  // intent clearing and route resets and reset only on runtime recreation. The
  // capped entry window re-anchors on each trusted capture so the FIRST
  // divergence after a live click can never be evicted by later signal storms.
  const COMPLETE_TURN_INDEX_LIFECYCLE_TRACE_LIMIT = 32;

  const completeTurnIndexLifecycleDiagnostics = {
    traceSequence: 0,
    traceWindowStartedAt: 0,
    traceDroppedCount: 0,
    trace: [],
    trustedSelectionLastCaptureTokenHash: null,
    trustedSelectionLastCaptureDirection: null,
    trustedSelectionBindAttemptCount: 0,
    trustedSelectionBindSuccessCount: 0,
    trustedSelectionLastBoundQId: null,
    trustedSelectionClearCount: 0,
    trustedSelectionLastClearReason: null,
    trustedSelectionLastClearQId: null,
    selectedPathTrustedScheduleAttemptCount: 0,
    selectedPathTrustedScheduleAcceptedCount: 0,
    selectedPathLastScheduleTrusted: null,
    selectedPathLastScheduleQId: null,
    selectedPathLastScheduleCause: null,
    selectedPathConfirmationEligibilityCheckCount: 0,
    selectedPathConfirmationSkipCount: 0,
    selectedPathConfirmationLastSkipReason: null,
  };

  function chatAtlasTraceTrustedLifecycle(eventRaw, detail = {}) {
    const diag = completeTurnIndexLifecycleDiagnostics;
    const event = chatAtlasCompleteIndexCode(eventRaw, 'lifecycle-event', 48);
    const tokenHash = detail?.token
      ? `djb2:${chatAtlasCompleteIndexStableHash(String(detail.token))}`
      : '';
    const chatHash = detail?.chat
      ? `djb2:${chatAtlasCompleteIndexStableHash(String(detail.chat))}`
      : '';
    if (event === 'trusted-capture-created') {
      diag.trace.length = 0;
      diag.traceDroppedCount = 0;
      diag.traceWindowStartedAt = Date.now();
      diag.trustedSelectionLastCaptureTokenHash = tokenHash || null;
      diag.trustedSelectionLastCaptureDirection = String(detail?.direction || '') || null;
    } else if (event === 'trusted-bind-attempt') {
      diag.trustedSelectionBindAttemptCount += 1;
    } else if (event === 'trusted-bind-success') {
      diag.trustedSelectionBindSuccessCount += 1;
      diag.trustedSelectionLastBoundQId = String(detail?.qId || '') || null;
    } else if (event === 'trusted-intent-cleared' || event === 'trusted-intent-expired') {
      diag.trustedSelectionClearCount += 1;
      diag.trustedSelectionLastClearReason = chatAtlasCompleteIndexCode(detail?.reason, event, 64);
      diag.trustedSelectionLastClearQId = String(detail?.qId || '') || null;
    } else if (event === 'selected-schedule-attempt') {
      diag.selectedPathLastScheduleTrusted = detail?.trusted === true;
      diag.selectedPathLastScheduleQId = String(detail?.qId || '') || null;
      diag.selectedPathLastScheduleCause = chatAtlasCompleteIndexCode(detail?.cause, 'selected-path-changed', 64);
      if (detail?.trusted === true) {
        diag.selectedPathTrustedScheduleAttemptCount += 1;
        if (detail?.accepted === true) diag.selectedPathTrustedScheduleAcceptedCount += 1;
      }
    } else if (event === 'confirmation-eligibility-checked') {
      diag.selectedPathConfirmationEligibilityCheckCount += 1;
    } else if (event === 'confirmation-skipped') {
      diag.selectedPathConfirmationSkipCount += 1;
      diag.selectedPathConfirmationLastSkipReason = chatAtlasCompleteIndexCode(detail?.reason, 'confirmation-skipped', 64);
    }
    diag.traceSequence += 1;
    if (diag.trace.length >= COMPLETE_TURN_INDEX_LIFECYCLE_TRACE_LIMIT) {
      diag.traceDroppedCount += 1;
      return;
    }
    if (!diag.traceWindowStartedAt) diag.traceWindowStartedAt = Date.now();
    const entry = {
      seq: diag.traceSequence,
      event,
      at: Math.max(0, Date.now() - Number(diag.traceWindowStartedAt || 0)),
      gen: Number(completeTurnIndexAuthorityState.generation || 0),
    };
    if (tokenHash) entry.tokenHash = tokenHash;
    if (chatHash) entry.chatHash = chatHash;
    if (detail?.qId) entry.qId = String(detail.qId).slice(0, 256);
    if (detail?.boundQId) entry.boundQId = String(detail.boundQId).slice(0, 256);
    if (detail?.direction) entry.direction = String(detail.direction).slice(0, 16);
    if (detail?.trusted !== undefined) entry.trusted = detail.trusted === true;
    if (detail?.signature) entry.signature = chatAtlasCompleteIndexCode(detail.signature, 'signature-invalid', 96);
    if (detail?.reason) entry.reason = chatAtlasCompleteIndexCode(detail.reason, 'reason-invalid', 64);
    if (detail?.cause) entry.cause = chatAtlasCompleteIndexCode(detail.cause, 'cause-invalid', 64);
    if (detail?.resultCode) entry.resultCode = chatAtlasCompleteIndexCode(detail.resultCode, 'result-invalid', 96);
    if (detail?.confirmationAttempt !== undefined) entry.confirmationAttempt = detail.confirmationAttempt === true;
    if (Number.isFinite(detail?.age)) entry.age = Math.max(0, Number(detail.age));
    diag.trace.push(Object.freeze(entry));
  }

  function chatAtlasCompleteIndexIdentity(value) {
    const id = String(value || '').trim();
    return /^[a-z0-9._:-]{1,256}$/i.test(id) ? id : '';
  }

  function chatAtlasCompleteIndexStableHash(raw) {
    const value = String(raw || '');
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return Math.abs(hash >>> 0).toString(36);
  }

  function getSelectedPathAcquisitionStatus() {
    const token = String(selectedPathAcquisitionState.token || '');
    const status = {
      status: selectedPathAcquisitionState.status,
      reason: selectedPathAcquisitionState.reason,
      pathLength: Array.isArray(selectedPathAcquisitionState.path)
        ? selectedPathAcquisitionState.path.length
        : 0,
      anchorQId: selectedPathAcquisitionState.anchorQId,
      provenAt: selectedPathAcquisitionState.provenAt,
    };
    Object.defineProperty(status, 'token', {
      value: token ? `djb2:${chatAtlasCompleteIndexStableHash(token)}` : null,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return chatAtlasFreeze(status);
  }

  function getSelectedPathDerivationDiagnostics() {
    const transaction = chatAtlasBranchTransactionCurrent();
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const candidate = intent?.returnTargetCandidate || null;
    const retainedGraph = selectedPathAcquisitionState.graph;
    const effective = getEffectivePresentationIndex();
    const effectiveTurns = Array.isArray(effective?.turns) ? effective.turns : [];
    const ledgerRecords = buildChatAtlasLedgerCanonicalRecords();
    return chatAtlasFreeze({
      version: 1,
      acquisition: getSelectedPathAcquisitionStatus(),
      transactionState: String(transaction?.state || 'none'),
      transactionReason: String(transaction?.reason || '') || null,
      effectiveCount: effectiveTurns.length,
      effectiveFingerprint: String(effective?.sourceFingerprint || '') || null,
      coreCount: Array.isArray(turnState.turns) ? turnState.turns.length : 0,
      ledgerCount: Array.isArray(ledgerRecords) ? ledgerRecords.length : 0,
      page2Count: effectiveTurns.length > CHAT_ATLAS_PAGE_SIZE
        ? effectiveTurns.slice(CHAT_ATLAS_PAGE_SIZE).length
        : 0,
      overlayActive: chatAtlasSelectedPathOverlayCurrent(),
      retainedGraph: {
        available: !!retainedGraph,
        captureIdentity: String(retainedGraph?.captureIdentity || '') || null,
        nodeCount: Array.isArray(retainedGraph?.identityGraph?.nodes)
          ? retainedGraph.identityGraph.nodes.length
          : 0,
        scopeCurrent: !!retainedGraph
          && retainedGraph.chatId === completeTurnIndexAuthorityState.chatId
          && retainedGraph.routeKey === completeTurnIndexAuthorityState.routeKey
          && retainedGraph.generation === Number(completeTurnIndexAuthorityState.generation || 0),
      },
      returnTargetCandidate: candidate ? {
        classification: String(candidate.classification || ''),
        reason: String(candidate.reason || ''),
        targetVariantAnswerId: String(candidate.targetVariantAnswerId || '') || null,
        graphCaptureIdentity: String(candidate.graphCaptureIdentity || '') || null,
        derivedTargetCount: Number(candidate.derivedTargetCount || 0),
      } : null,
      publicationDecision: selectedPathAcquisitionState.lastPublicationDecision,
      derivation: selectedPathAcquisitionState.lastDerivationDiagnostics,
    });
  }

  // ── Publication ownership (Stage 2C-2aj2) ────────────────────────────────
  // Once a trusted token's branch transaction carries a genuinely successful
  // publication decision, that acquisition record is publication-owned: no
  // ordinary lifecycle writer may demote it or clear its proof/path/anchor.
  // Only an explicit reset boundary may. The rule lives in the two mutating
  // primitives (and the one direct mutation in chatAtlasRetainIdentityGraph)
  // so it cannot be bypassed by adding another call site.
  //
  // Genuine reset boundaries, classified from the architecture's own callers:
  // route change, generation/authority reset, chat/route ownership mismatch,
  // canonical-fingerprint replacement, and identity-graph scope drift. Every
  // other reason is ordinary lifecycle cleanup.
  const CHAT_ATLAS_ACQUISITION_RESET_REASONS = Object.freeze(new Set([
    'route-changed',
    'authority-reset',
    'route-reset',
    'chat-mismatch',
    'route-mismatch',
    'generation-mismatch',
    'canonical-fingerprint-changed',
    'identity-graph-refetch-scope-drift',
    'selected-path-ownership-changed',
  ]));

  function chatAtlasAcquisitionResetBoundary(reason) {
    return CHAT_ATLAS_ACQUISITION_RESET_REASONS.has(
      chatAtlasCompleteIndexCode(reason, 'cleared', 64),
    );
  }

  // The record currently held is publication-owned when its own token has a
  // successful publication decision still in scope.
  function chatAtlasAcquisitionPublicationOwned() {
    const token = String(selectedPathAcquisitionState.token || '');
    if (!token) return false;
    return chatAtlasSelectedPathPublishedForToken(token);
  }

  function chatAtlasClearSelectedPathAcquisition(reason = 'cleared', options = {}) {
    // Ordinary lifecycle cleanup — trusted-intent disappearance, expiry,
    // supersession — must leave a published selection intact.
    if (
      !chatAtlasAcquisitionResetBoundary(reason)
      && chatAtlasAcquisitionPublicationOwned()
    ) return getSelectedPathAcquisitionStatus();
    const retainedGraph = options?.preserveGraph === true
      ? selectedPathAcquisitionState.graph
      : null;
    selectedPathAcquisitionState.status = 'inactive';
    selectedPathAcquisitionState.reason = chatAtlasCompleteIndexCode(reason, 'cleared', 64);
    selectedPathAcquisitionState.token = null;
    selectedPathAcquisitionState.anchorQId = null;
    selectedPathAcquisitionState.anchorSelectedAId = null;
    selectedPathAcquisitionState.priorAnswerId = null;
    selectedPathAcquisitionState.chatId = null;
    selectedPathAcquisitionState.routeKey = '';
    selectedPathAcquisitionState.generation = 0;
    selectedPathAcquisitionState.staleRevision = 0;
    selectedPathAcquisitionState.graph = retainedGraph;
    if (options?.resetRefetchGuard === true) {
      selectedPathAcquisitionState.refetchAttemptedForToken = null;
    }
    selectedPathAcquisitionState.refetchActiveForToken = null;
    selectedPathAcquisitionState.path = null;
    selectedPathAcquisitionState.proof = null;
    selectedPathAcquisitionState.provenAt = null;
    selectedPathAcquisitionState.evaluatedLedgerVersion = 0;
    selectedPathAcquisitionState.evaluationKey = '';
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasSelectedPathFail(reason, intent, selectedAnswerId = '') {
    // Two distinct situations reach this function while a transaction is open,
    // and they require opposite handling.
    //
    // A GENUINE derivation failure (anchor-not-in-graph, fork-unresolved,
    // descent-variant-ambiguous, …) must still be recorded while the
    // transaction is pending: that record is what keeps containment and stops
    // a 20/21 hybrid settling on the outgoing branch. CV-3.8 owns that
    // invariant and it is deliberately left untouched.
    //
    // 'selected-answer-not-changed' is not a derivation failure at all. It is
    // an artefact of re-deriving from live DOM after the native branch has
    // already switched: the anchor's mounted answer then legitimately equals
    // the intent's prior answer. The branch transaction is opened
    // synchronously inside the trusted click, a macrotask before any
    // publication evidence exists, so the pending transaction is the only
    // signal available this early. Suppressing only this reason leaves every
    // genuine failure path exactly as it was.
    const failToken = String(intent?.token || '')
      || String(selectedPathAcquisitionState.token || '');
    const transaction = completeTurnIndexAuthorityState.branchTransactionState;
    const matchesTransaction = !!failToken
      && !!transaction
      && String(transaction.token || '') === failToken;
    if (
      matchesTransaction
      && transaction.state === 'pending'
      && chatAtlasCompleteIndexCode(reason, 'selected-path-failed', 64) === 'selected-answer-not-changed'
    ) return getSelectedPathAcquisitionStatus();
    // A published transaction proves nothing on its own; only a genuinely
    // publication-owned record is protected here.
    if (chatAtlasAcquisitionPublicationOwned()) {
      return getSelectedPathAcquisitionStatus();
    }
    chatAtlasBranchTransactionTrace('acq-fail', { reason });
    selectedPathAcquisitionState.status = 'failed';
    selectedPathAcquisitionState.reason = chatAtlasCompleteIndexCode(reason, 'selected-path-failed', 64);
    selectedPathAcquisitionState.token = String(intent?.token || '') || null;
    selectedPathAcquisitionState.anchorQId = chatAtlasCompleteIndexIdentity(intent?.qId) || null;
    selectedPathAcquisitionState.anchorSelectedAId = chatAtlasCompleteIndexIdentity(selectedAnswerId) || null;
    selectedPathAcquisitionState.priorAnswerId = chatAtlasCompleteIndexIdentity(intent?.priorAnswerId) || null;
    selectedPathAcquisitionState.chatId = String(intent?.chatId || '') || null;
    selectedPathAcquisitionState.routeKey = String(intent?.routeKey || '');
    selectedPathAcquisitionState.generation = Number(intent?.generation || 0);
    selectedPathAcquisitionState.staleRevision = Number(intent?.staleRevision || 0);
    selectedPathAcquisitionState.path = null;
    selectedPathAcquisitionState.proof = null;
    selectedPathAcquisitionState.provenAt = null;
    selectedPathAcquisitionState.evaluatedLedgerVersion = Number(chatAtlasCoreLedgerVersion() || 0);
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasSelectedPathOverlayProofIdentity(proof) {
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return '';
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
      proof.anchorQId,
      proof.anchorSelectedAId,
      proof.rootNodeId,
      proof.tailNodeId,
      proof.pathLength,
      proof.canonicalPrefixLength,
      proof.canonicalFingerprint,
      proof.token,
      proof.chatId,
      proof.routeKey,
      proof.generation,
      proof.staleRevision,
      proof.reason,
      proof.source,
    ]))}`;
  }

  function chatAtlasSelectedPathOverlayPathIdentity(path) {
    if (!Array.isArray(path)) return '';
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(path.map((turn) => [
      turn?.order,
      turn?.qId,
      turn?.turnId,
      turn?.primaryAId,
      ...(Array.isArray(turn?.answerVariants) ? turn.answerVariants : []),
      turn?.noAnswer === true,
      turn?.stopped === true,
      turn?.provenance,
      turn?.confirmedByNativeEvidence === true,
    ])))}`;
  }

  function chatAtlasCanonicalPresentationIndex() {
    const index = completeTurnIndexAuthorityState.index;
    return index?.complete === true
      && index?.proof === 'host-payload-full-graph'
      && Array.isArray(index?.turns)
      && Object.isFrozen(index)
      && Object.isFrozen(index.turns)
      ? index
      : null;
  }

  function chatAtlasClearSelectedPathOverlay(reason = 'overlay-cleared', options = {}) {
    const previousPresentation = getEffectivePresentationStatus();
    selectedPathOverlayState.status = options?.invalid === true ? 'invalid' : 'inactive';
    selectedPathOverlayState.reason = chatAtlasCompleteIndexCode(reason, 'overlay-cleared', 64);
    selectedPathOverlayState.token = null;
    selectedPathOverlayState.chatId = null;
    selectedPathOverlayState.routeKey = '';
    selectedPathOverlayState.generation = 0;
    selectedPathOverlayState.staleRevision = 0;
    selectedPathOverlayState.canonicalFingerprint = '';
    selectedPathOverlayState.acquisitionProofIdentity = '';
    selectedPathOverlayState.acquisitionPathIdentity = '';
    selectedPathOverlayState.evaluationKey = '';
    selectedPathOverlayState.anchorQId = null;
    selectedPathOverlayState.activatedAt = null;
    selectedPathOverlayState.pathLength = 0;
    selectedPathOverlayState.index = null;
    selectedPathOverlayState.byQId = null;
    selectedPathOverlayState.byAId = null;
    selectedPathOverlayState.proof = null;
    return chatAtlasEmitEffectivePresentationChanged(
      previousPresentation,
      getEffectivePresentationStatus(),
      reason,
    );
  }

  function chatAtlasSelectedPathOverlayCurrent() {
    const staleQId = String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '');
    const anchorCurrent = selectedPathOverlayState.anchorQId === staleQId
      || chatAtlasQuestionEditSiblingProof(
        selectedPathAcquisitionState.graph?.identityGraph,
        staleQId,
        selectedPathOverlayState.anchorQId,
      );
    if (
      selectedPathOverlayState.status !== 'active'
      || !selectedPathOverlayState.index
      || !(selectedPathOverlayState.byQId instanceof Map)
      || !(selectedPathOverlayState.byAId instanceof Map)
      || !selectedPathOverlayState.proof
      || completeTurnIndexAuthorityState.enabled !== true
      || completeTurnIndexAuthorityState.branchSelectionStale !== true
      || selectedPathOverlayState.staleRevision
        !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || !anchorCurrent
      || selectedPathOverlayState.chatId
        !== String(completeTurnIndexAuthorityState.chatId || '')
      || selectedPathOverlayState.routeKey
        !== String(completeTurnIndexAuthorityState.routeKey || '')
      || selectedPathOverlayState.generation
        !== Number(completeTurnIndexAuthorityState.generation || 0)
      || selectedPathOverlayState.canonicalFingerprint
        !== String(completeTurnIndexAuthorityState.index?.sourceFingerprint || '')
    ) return false;
    const route = chatAtlasFullIndexRoute();
    return selectedPathOverlayState.chatId === String(route?.chatId || '')
      && selectedPathOverlayState.routeKey === String(route?.routeKey || '');
  }

  function getEffectivePresentationIndex() {
    if (chatAtlasSelectedPathOverlayCurrent()) {
      return selectedPathOverlayState.index;
    }
    return chatAtlasCanonicalPresentationIndex();
  }

  function getEffectivePresentationStatus() {
    const overlayActive = chatAtlasSelectedPathOverlayCurrent();
    const canonical = chatAtlasCanonicalPresentationIndex();
    const effective = overlayActive ? selectedPathOverlayState.index : canonical;
    return chatAtlasFreeze({
      source: overlayActive ? 'selected-path-overlay' : 'canonical',
      overlayActive,
      reason: overlayActive
        ? selectedPathOverlayState.reason
        : (selectedPathOverlayState.status === 'active'
          ? 'overlay-not-current'
          : selectedPathOverlayState.reason),
      count: Array.isArray(effective?.turns) ? effective.turns.length : 0,
      chatId: String(completeTurnIndexAuthorityState.chatId || '') || null,
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      canonicalFingerprint: String(canonical?.sourceFingerprint || ''),
      anchorQId: overlayActive ? selectedPathOverlayState.anchorQId : null,
      pathLength: overlayActive ? selectedPathOverlayState.pathLength : 0,
      activatedAt: overlayActive ? selectedPathOverlayState.activatedAt : null,
    });
  }

  function chatAtlasEffectivePresentationIdentity(status) {
    return JSON.stringify([
      String(status?.source || ''),
      status?.overlayActive === true,
      Math.max(0, Number(status?.count || 0) || 0),
      String(status?.canonicalFingerprint || ''),
      String(status?.anchorQId || ''),
      Math.max(0, Number(status?.pathLength || 0) || 0),
      String(status?.chatId || ''),
      String(status?.routeKey || ''),
      Math.max(0, Number(status?.generation || 0) || 0),
    ]);
  }

  function chatAtlasEmitEffectivePresentationChanged(previous, current, reason = 'presentation-updated') {
    if (
      chatAtlasEffectivePresentationIdentity(previous)
      === chatAtlasEffectivePresentationIdentity(current)
    ) return current;
    // A late-loading presentation stack will read the current effective
    // snapshot during its normal initial build. Emit only after MiniMap Core
    // has installed its presentation bridge, so no transient pre-consumer
    // publication becomes a second state channel.
    if (!W?.H2O_MM_CORE_API) return current;
    busEmit(EV_CORE_TURN_UPDATED, {
      reason: 'effective-presentation',
      cause: chatAtlasCompleteIndexCode(reason, 'presentation-updated', 64),
      version: state.version,
      qTotal: state.qTotal,
      aTotal: state.aTotal,
      turnTotal: Math.max(0, Number(current?.count || 0) || 0),
      presentationSource: String(current?.source || 'canonical'),
      presentationOverlayActive: current?.overlayActive === true,
      presentationCount: Math.max(0, Number(current?.count || 0) || 0),
      presentationAnchorQId: String(current?.anchorQId || '') || null,
      presentationPathLength: Math.max(0, Number(current?.pathLength || 0) || 0),
    });
    return current;
  }

  function getEffectiveTurnRecordByQId(qIdRaw) {
    const qId = chatAtlasCompleteIndexIdentity(qIdRaw);
    if (!qId) return null;
    if (chatAtlasSelectedPathOverlayCurrent()) {
      return selectedPathOverlayState.byQId.get(qId) || null;
    }
    const canonical = chatAtlasCanonicalPresentationIndex();
    const matches = canonical?.turns?.filter((turn) => turn.qId === qId) || [];
    return matches.length === 1 ? matches[0] : null;
  }

  function getEffectiveTurnRecordByAId(aIdRaw) {
    const aId = chatAtlasCompleteIndexIdentity(aIdRaw);
    if (!aId) return null;
    if (chatAtlasSelectedPathOverlayCurrent()) {
      return selectedPathOverlayState.byAId.get(aId) || null;
    }
    const canonical = chatAtlasCanonicalPresentationIndex();
    const matches = canonical?.turns?.filter((turn) => (
      turn.primaryAId === aId
      || (Array.isArray(turn.answerVariants) && turn.answerVariants.includes(aId))
    )) || [];
    return matches.length === 1 ? matches[0] : null;
  }

  function chatAtlasBuildSelectedPathOverlay(acquisition, canonical, ownership = {}) {
    const fail = (reason) => Object.freeze({
      ok: false,
      reason: chatAtlasCompleteIndexCode(reason, 'overlay-invalid', 64),
    });
    const proof = acquisition?.proof;
    const path = acquisition?.path;
    const intent = ownership?.intent;
    const expectedProofKeys = [
      'anchorQId',
      'anchorSelectedAId',
      'rootNodeId',
      'tailNodeId',
      'pathLength',
      'canonicalPrefixLength',
      'canonicalFingerprint',
      'graphCapturedAt',
      'token',
      'chatId',
      'routeKey',
      'generation',
      'staleRevision',
      'reason',
      'source',
    ];
    // The default origin carries the same proof shape plus the facts that
    // stand in for a user capture. Both lists stay EXACT: an unrecognised key
    // is still an invalid proof.
    const expectedDefaultProofKeys = [
      ...expectedProofKeys,
      'defaultOrigin',
      'defaultTerminalNodeId',
      'defaultTerminalCreateTime',
      'defaultPathFingerprint',
      'graphCaptureIdentity',
      'manualOverrideRevision',
      'defaultDivergenceKind',
      'defaultAnswerOnlyProven',
      'defaultResolutionSource',
    ];
    const expectedPathKeys = [
      'order',
      'qId',
      'turnId',
      'primaryAId',
      'answerVariants',
      'noAnswer',
      'stopped',
      'provenance',
      'confirmedByNativeEvidence',
    ];
    if (ownership?.enabled !== true) return fail('feature-disabled');
    if (acquisition?.status !== 'proven') return fail('acquisition-not-proven');
    if (
      !canonical
      || canonical.complete !== true
      || canonical.proof !== 'host-payload-full-graph'
      || !Array.isArray(canonical.turns)
      || !canonical.turns.length
      || !Object.isFrozen(canonical)
      || !Object.isFrozen(canonical.turns)
      || canonical.turns.some((turn) => (
        !Object.isFrozen(turn)
        || !Object.isFrozen(turn?.answerVariants)
      ))
    ) return fail('canonical-authority-unavailable');
    if (
      !proof
      || !Object.isFrozen(proof)
      || !(
        chatAtlasCompleteIndexExactKeys(proof, expectedProofKeys)
        || (
          proof.defaultOrigin === true
          && chatAtlasCompleteIndexExactKeys(proof, expectedDefaultProofKeys)
        )
      )
      || proof.reason !== 'selected-path-proven'
      || proof.source !== 'host-identity-graph'
      || !chatAtlasCompleteIndexIdentity(proof.rootNodeId)
      || !chatAtlasCompleteIndexIdentity(proof.tailNodeId)
      || !String(proof.graphCapturedAt || '')
      || !String(proof.token || '')
    ) return fail('acquisition-proof-invalid');
    if (
      !Array.isArray(path)
      || !Object.isFrozen(path)
      || path.length < 1
      || path.length > 512
      || path.some((turn) => (
        !turn
        || !Object.isFrozen(turn)
        || !Object.isFrozen(turn.answerVariants)
        || !chatAtlasCompleteIndexExactKeys(turn, expectedPathKeys)
      ))
    ) return fail(path?.length > 512 ? 'path-bounds-exceeded' : 'path-invalid');
    if (Number(proof.pathLength || 0) !== path.length) {
      return fail('proof-path-length-mismatch');
    }
    if (
      String(acquisition?.token || '') !== String(proof.token || '')
      || String(acquisition?.anchorQId || '') !== String(proof.anchorQId || '')
      || String(acquisition?.anchorSelectedAId || '') !== String(proof.anchorSelectedAId || '')
      || String(acquisition?.chatId || '') !== String(proof.chatId || '')
      || String(acquisition?.routeKey || '') !== String(proof.routeKey || '')
      || Number(acquisition?.generation || 0) !== Number(proof.generation || 0)
      || Number(acquisition?.staleRevision || 0) !== Number(proof.staleRevision || 0)
    ) return fail('acquisition-ownership-mismatch');
    // Two admission paths, branched explicitly by origin. The manual path is
    // unchanged: a trusted user capture, its token, and the stale checkpoint
    // it opened. The default path never fabricates any of that — it proves a
    // different, equally exact set of facts about the graph it came from.
    const origin = String(ownership.origin || 'manual-native-selection');
    if (origin !== 'manual-native-selection' && origin !== 'default-latest-created') {
      return fail('overlay-origin-unknown');
    }
    if (
      String(ownership.chatId || '') !== String(ownership.routeChatId || '')
      || String(ownership.routeKey || '') !== String(ownership.routeRouteKey || '')
    ) return fail('route-mismatch');
    if (
      String(proof.chatId || '') !== String(ownership.chatId || '')
      || chatAtlasCompleteIndexIdentity(canonical.chatId) !== String(ownership.chatId || '')
    ) return fail('chat-mismatch');
    if (String(proof.routeKey || '') !== String(ownership.routeKey || '')) return fail('route-mismatch');
    if (Number(proof.generation || 0) !== Number(ownership.generation || 0)) {
      return fail('generation-mismatch');
    }
    if (origin === 'manual-native-selection') {
      if (!intent || String(intent.token || '') !== String(proof.token || '')) {
        return fail(intent ? 'token-mismatch' : 'trusted-intent-missing');
      }
      if (String(intent.chatId || '') !== String(ownership.chatId || '')) return fail('chat-mismatch');
      if (String(intent.routeKey || '') !== String(ownership.routeKey || '')) return fail('route-mismatch');
      if (Number(intent.generation || 0) !== Number(ownership.generation || 0)) {
        return fail('generation-mismatch');
      }
      if (ownership.stale !== true) return fail('stale-inactive');
      const questionEditAnchorSwap = chatAtlasQuestionEditSiblingProof(
        selectedPathAcquisitionState.graph?.identityGraph,
        ownership.staleQId,
        proof.anchorQId,
      );
      if (
        (
          String(proof.anchorQId || '') !== String(ownership.staleQId || '')
          && !questionEditAnchorSwap
        )
        || String(intent.qId || '') !== String(ownership.staleQId || '')
      ) return fail('stale-qid-mismatch');
      if (
        Number(proof.staleRevision || 0) !== Number(ownership.staleRevision || 0)
        || Number(intent.staleRevision || 0) !== Number(ownership.staleRevision || 0)
      ) return fail('stale-revision-mismatch');
    } else {
      // default-latest-created. No user acted, so there is nothing to own the
      // publication except the graph itself: the exact capture it came from,
      // a unique newest terminal with a trustworthy creation time, and the
      // absence of any manual selection in this page session.
      if (proof.defaultOrigin !== true) return fail('default-origin-unproven');
      if (!chatAtlasCompleteIndexIdentity(proof.defaultTerminalNodeId)) {
        return fail('default-terminal-unproven');
      }
      const created = Number(proof.defaultTerminalCreateTime || 0);
      if (!Number.isFinite(created) || created <= 0) return fail('default-terminal-create-time-invalid');
      if (!String(proof.defaultPathFingerprint || '')) return fail('default-fingerprint-missing');
      if (!String(proof.graphCaptureIdentity || '')) return fail('default-graph-capture-unproven');
      if (
        String(proof.graphCaptureIdentity || '')
        !== String(selectedPathAcquisitionState.graph?.captureIdentity || '')
      ) return fail('default-graph-capture-drift');
      if (ownership.manualOverrideActive === true) return fail('default-superseded-by-manual');
      if (Number(ownership.manualOverrideRevision || 0) !== Number(proof.manualOverrideRevision || 0)) {
        return fail('default-superseded-by-manual');
      }
    }
    if (
      String(proof.canonicalFingerprint || '') !== String(canonical.sourceFingerprint || '')
      || String(canonical.sourceFingerprint || '') !== chatAtlasCompleteIndexFingerprint(canonical.turns)
    ) return fail('canonical-fingerprint-mismatch');

    const canonicalPrefixLength = Number(proof.canonicalPrefixLength || 0);
    if (
      !Number.isInteger(canonicalPrefixLength)
      || canonicalPrefixLength < 1
      || canonicalPrefixLength > path.length
      || canonicalPrefixLength > canonical.turns.length
    ) return fail('anchor-qid-mismatch');
    const anchorIndex = canonicalPrefixLength - 1;
    const proofAnchorQId = chatAtlasCompleteIndexIdentity(proof.anchorQId);
    const proofAnchorAId = chatAtlasCompleteIndexIdentity(proof.anchorSelectedAId);
    if (!proofAnchorQId || !proofAnchorAId) return fail('anchor-answer-mismatch');
    const manualQuestionEditAnchorSwap = origin === 'manual-native-selection'
      && chatAtlasQuestionEditSiblingProof(
        selectedPathAcquisitionState.graph?.identityGraph,
        ownership.staleQId,
        proofAnchorQId,
      );

    const answerOwners = new Map();
    const byQId = new Map();
    const byAId = new Map();
    const turnIds = new Set();
    const rows = [];
    let answerLookupCount = 0;
    for (let index = 0; index < path.length; index += 1) {
      const sourceRow = path[index];
      const order = Number(sourceRow.order || 0);
      const qId = chatAtlasCompleteIndexIdentity(sourceRow.qId);
      const turnId = String(sourceRow.turnId || '');
      if (order !== index + 1) return fail('order-noncontiguous');
      if (!qId || COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS.includes(qId)) {
        return fail('question-identity-invalid');
      }
      if (byQId.has(qId)) return fail('duplicate-qid');
      if (turnId !== `turn:${qId}`) return fail('turn-identity-invalid');
      if (turnIds.has(turnId)) return fail('duplicate-turn-id');
      if (!Array.isArray(sourceRow.answerVariants)) return fail('answer-variants-invalid');
      const variants = [];
      for (const rawAnswerId of sourceRow.answerVariants) {
        const answerId = chatAtlasCompleteIndexIdentity(rawAnswerId);
        if (!answerId || variants.includes(answerId)) return fail('answer-variants-invalid');
        const owner = answerOwners.get(answerId);
        if (owner && owner !== qId) return fail('answer-identity-ambiguous');
        answerOwners.set(answerId, qId);
        variants.push(answerId);
        answerLookupCount += 1;
        if (answerLookupCount > 8192) return fail('path-bounds-exceeded');
      }
      const primaryAId = sourceRow.primaryAId == null
        ? null
        : chatAtlasCompleteIndexIdentity(sourceRow.primaryAId);
      if (
        typeof sourceRow.noAnswer !== 'boolean'
        || typeof sourceRow.stopped !== 'boolean'
      ) return fail('answer-state-invalid');
      if (sourceRow.noAnswer) {
        if (sourceRow.primaryAId != null || primaryAId || variants.length) {
          return fail('answer-state-invalid');
        }
        // A no-answer turn may sit MID-path: the live 39-turn branch carries
        // an unanswered question whose conversation genuinely continues (the
        // "TITLE 20 NO ANSWER" turn). Requiring it to be terminal rejected
        // the complete derived branch and froze authority on the outgoing
        // one. Its answer-state shape (no primary, no variants) is fully
        // validated above; position carries no additional integrity.
      } else if (
        !primaryAId
        || !variants.length
        || variants[variants.length - 1] !== primaryAId
      ) return fail('answer-state-invalid');
      const row = chatAtlasFreeze({
        order,
        qId,
        turnId,
        primaryAId,
        answerVariants: variants,
        noAnswer: sourceRow.noAnswer,
        stopped: sourceRow.stopped,
      });
      rows.push(row);
      byQId.set(qId, row);
      turnIds.add(turnId);
      for (const answerId of variants) byAId.set(answerId, row);
    }

    const sameCanonicalRow = (left, right) => (
      left.order === right.order
      && left.qId === right.qId
      && left.turnId === right.turnId
      && left.primaryAId === right.primaryAId
      && left.noAnswer === right.noAnswer
      && left.stopped === right.stopped
      && JSON.stringify(left.answerVariants) === JSON.stringify(right.answerVariants)
    );
    for (let index = 0; index < anchorIndex; index += 1) {
      if (
        path[index].provenance !== 'canonical-prefix'
        || !sameCanonicalRow(rows[index], canonical.turns[index])
      ) return fail('canonical-prefix-mismatch');
    }
    const anchorSource = path[anchorIndex];
    const anchorRow = rows[anchorIndex];
    const canonicalAnchor = canonical.turns[anchorIndex];
    if (
      anchorSource.provenance !== 'anchor'
      || anchorSource.confirmedByNativeEvidence !== true
      || anchorRow.qId !== proofAnchorQId
      || (canonicalAnchor?.qId !== proofAnchorQId && !manualQuestionEditAnchorSwap)
    ) return fail('anchor-qid-mismatch');
    if (anchorRow.primaryAId !== proofAnchorAId) return fail('anchor-answer-mismatch');
    if (!manualQuestionEditAnchorSwap && !canonicalAnchor.answerVariants.includes(proofAnchorAId)) {
      return fail('anchor-answer-not-variant');
    }
    // Divergence proof, by origin. A manual selection switches the ANSWER at
    // the anchor turn itself. A default path shares the anchor turn exactly and
    // diverges strictly BELOW it — by a different question variant, a different
    // answer variant, or a different length. Both must genuinely differ from
    // the canonical path; neither may publish a copy of it.
    if (origin === 'manual-native-selection') {
      if (manualQuestionEditAnchorSwap) {
        if (canonicalAnchor.qId === proofAnchorQId) return fail('anchor-does-not-diverge');
      } else if (canonicalAnchor.primaryAId === proofAnchorAId) {
        return fail('anchor-does-not-diverge');
      }
    } else {
      // An ANSWER divergence is anchored ON the turn whose answer differs:
      // same question, different selected answer — the same shape a manual
      // regeneration switch has. A QUESTION divergence is anchored on the last
      // shared turn and must diverge strictly BELOW it.
      if (proof.defaultDivergenceKind === 'assistant-regeneration') {
        if (canonicalAnchor.primaryAId === proofAnchorAId) return fail('anchor-does-not-diverge');
      } else if (proof.defaultDivergenceKind === 'question-edit') {
        if (canonicalAnchor.primaryAId !== proofAnchorAId) return fail('default-anchor-not-shared');
        const nextPath = path[anchorIndex + 1] || null;
        const nextCanonical = canonical.turns[anchorIndex + 1] || null;
        const divergesBelow = !nextPath
          ? !!nextCanonical
          : (
            !nextCanonical
            || chatAtlasCompleteIndexIdentity(nextPath.qId) !== chatAtlasCompleteIndexIdentity(nextCanonical.qId)
            || chatAtlasCompleteIndexIdentity(nextPath.primaryAId) !== chatAtlasCompleteIndexIdentity(nextCanonical.primaryAId)
          );
        if (!divergesBelow) return fail('anchor-does-not-diverge');
      } else {
        return fail('default-divergence-kind-unproven');
      }
    }
    const canonicalQIds = new Set(canonical.turns.map((turn) => turn.qId));
    for (let index = anchorIndex + 1; index < path.length; index += 1) {
      if (path[index].provenance !== 'graph-descent') return fail('path-invalid');
      // A reused canonical question below the anchor is a foreign append —
      // EXCEPT for a default route that differs from the host by answer
      // selection only. That path adds, removes and reorders nothing: every
      // row keeps its order and question, and only graph-proven answer
      // variants differ. The exception is unavailable to every other origin
      // and to every other divergence kind.
      const answerOnlyReuse = origin === 'default-latest-created'
        && proof.defaultDivergenceKind === 'assistant-regeneration'
        && proof.defaultAnswerOnlyProven === true
        && !!canonical.turns[index]
        && chatAtlasCompleteIndexIdentity(canonical.turns[index].qId) === rows[index].qId
        && Number(canonical.turns[index].order || 0) === Number(rows[index].order || 0);
      if (canonicalQIds.has(rows[index].qId) && !answerOnlyReuse) return fail('duplicate-qid');
    }

    const activatedAt = String(ownership.activatedAt || '').slice(0, 64);
    if (!activatedAt) return fail('acquisition-proof-invalid');
    const acquisitionProofIdentity = chatAtlasSelectedPathOverlayProofIdentity(proof);
    const acquisitionPathIdentity = chatAtlasSelectedPathOverlayPathIdentity(path);
    if (!acquisitionProofIdentity || !acquisitionPathIdentity) {
      return fail('acquisition-proof-invalid');
    }
    const frozenRows = chatAtlasFreeze(rows);
    const sourceFingerprint = chatAtlasCompleteIndexFingerprint(frozenRows);
    const index = chatAtlasFreeze({
      schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
      chatId: canonical.chatId,
      payloadUpdateTime: canonical.payloadUpdateTime,
      sourceFingerprint,
      capturedAt: activatedAt,
      validatedAt: activatedAt,
      complete: true,
      proof: 'selected-path-overlay',
      turns: frozenRows,
    });
    const overlayProof = chatAtlasFreeze({
      source: 'selected-path-acquisition',
      reason: 'selected-path-overlay-proven',
      anchorQId: proofAnchorQId,
      anchorSelectedAId: proofAnchorAId,
      rootNodeId: proof.rootNodeId,
      tailNodeId: proof.tailNodeId,
      pathLength: rows.length,
      canonicalPrefixLength,
      canonicalFingerprint: canonical.sourceFingerprint,
      overlayFingerprint: sourceFingerprint,
      acquisitionProofIdentity,
      acquisitionPathIdentity,
      token: proof.token,
      chatId: ownership.chatId,
      routeKey: ownership.routeKey,
      generation: ownership.generation,
      staleRevision: ownership.staleRevision,
      activatedAt,
    });
    return Object.freeze({
      ok: true,
      reason: 'selected-path-overlay-proven',
      token: proof.token,
      chatId: ownership.chatId,
      routeKey: ownership.routeKey,
      generation: ownership.generation,
      staleRevision: ownership.staleRevision,
      canonicalFingerprint: canonical.sourceFingerprint,
      acquisitionProofIdentity,
      acquisitionPathIdentity,
      evaluationKey: JSON.stringify([
        proof.token,
        acquisitionProofIdentity,
        acquisitionPathIdentity,
        canonical.sourceFingerprint,
      ]),
      anchorQId: proofAnchorQId,
      activatedAt,
      pathLength: rows.length,
      index,
      byQId,
      byAId,
      proof: overlayProof,
    });
  }

  function chatAtlasSelectedPathOverlayCandidateValid(candidate) {
    return candidate?.ok === true
      && candidate?.index?.complete === true
      && candidate?.index?.proof === 'selected-path-overlay'
      && Array.isArray(candidate?.index?.turns)
      && candidate.index.turns.length === Number(candidate.pathLength || 0)
      && candidate.byQId instanceof Map
      && candidate.byAId instanceof Map
      && candidate.byQId.size === candidate.index.turns.length
      && Object.isFrozen(candidate.index)
      && Object.isFrozen(candidate.index.turns)
      && Object.isFrozen(candidate.proof);
  }

  function chatAtlasTurnStateMatchesEffectiveIndex(index) {
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    const records = Array.isArray(turnState.turns) ? turnState.turns : [];
    if (!turns.length || records.length !== turns.length) return false;
    return turns.every((turn, indexValue) => {
      const record = records[indexValue];
      const answerIds = Array.isArray(record?.answerIds) ? record.answerIds : [];
      return Number(record?.turnNo || 0) === indexValue + 1
        && chatAtlasCompleteIndexIdentity(record?.qId) === turn.qId
        && (chatAtlasCompleteIndexIdentity(record?.primaryAId) || null) === turn.primaryAId
        && record?.noAnswer === turn.noAnswer
        && JSON.stringify(answerIds) === JSON.stringify(turn.answerVariants);
    });
  }

  function chatAtlasInstallSelectedPathOverlay(candidate) {
    if (!chatAtlasSelectedPathOverlayCandidateValid(candidate)) {
      return chatAtlasClearSelectedPathOverlay(
        candidate?.reason || 'overlay-candidate-invalid',
        { invalid: true },
      );
    }
    const previousPresentation = getEffectivePresentationStatus();
    selectedPathOverlayState.reason = 'selected-path-overlay-active';
    selectedPathOverlayState.token = candidate.token;
    selectedPathOverlayState.chatId = candidate.chatId;
    selectedPathOverlayState.routeKey = candidate.routeKey;
    selectedPathOverlayState.generation = candidate.generation;
    selectedPathOverlayState.staleRevision = candidate.staleRevision;
    selectedPathOverlayState.canonicalFingerprint = candidate.canonicalFingerprint;
    selectedPathOverlayState.acquisitionProofIdentity = candidate.acquisitionProofIdentity;
    selectedPathOverlayState.acquisitionPathIdentity = candidate.acquisitionPathIdentity;
    selectedPathOverlayState.evaluationKey = candidate.evaluationKey;
    selectedPathOverlayState.anchorQId = candidate.anchorQId;
    selectedPathOverlayState.activatedAt = candidate.activatedAt;
    selectedPathOverlayState.pathLength = candidate.pathLength;
    selectedPathOverlayState.index = candidate.index;
    selectedPathOverlayState.byQId = candidate.byQId;
    selectedPathOverlayState.byAId = candidate.byAId;
    selectedPathOverlayState.proof = candidate.proof;
    // Publish membership as one transaction: make the frozen index current,
    // rebuild Core from that exact index, validate every row identity, and
    // only then release the keyed branch transaction. No graph prefix or
    // mounted-shell prefix is observable as a completed branch.
    selectedPathOverlayState.status = 'active';
    // The published branch is authority; the host may still display a
    // different downstream edit. Confirm a prior activation, else attempt one
    // bounded, fully identity-proven convergence step.
    // Confirm any landed step first, then attempt the NEXT branch point: the
    // path may nest several (a question edit, then a regeneration below it),
    // and each publication advances at most one bounded, proven step.
    try {
      chatAtlasConfirmNativeConvergence('overlay-active');
      chatAtlasRunNativeConvergence('overlay-active');
    } catch {}
    try {
      buildTurns();
    } catch {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'selected-path-core-rebuild-failed',
        String(candidate.token || ''),
      );
      const cleared = chatAtlasClearSelectedPathOverlay(
        'selected-path-core-rebuild-failed',
        { invalid: true },
      );
      try { buildTurns(); } catch {}
      return cleared;
    }
    if (!chatAtlasTurnStateMatchesEffectiveIndex(candidate.index)) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'selected-path-core-parity-failed',
        String(candidate.token || ''),
      );
      const cleared = chatAtlasClearSelectedPathOverlay(
        'selected-path-core-parity-failed',
        { invalid: true },
      );
      try { buildTurns(); } catch {}
      return cleared;
    }
    chatAtlasCloseBranchTransaction(
      'published',
      'selected-path-overlay-active',
      String(candidate.token || ''),
    );

    // The presentation event is the existing downstream reconciliation
    // checkpoint. Retire the exact request owner before emitting it so Page
    // units observe the accepted immutable branch, not the just-completed
    // acquisition lease, on their only publication pass.
    completeIndexRefreshCoordinator?.settleSelectedPathGraphPublication?.(
      String(candidate.token || ''),
    );
    return chatAtlasEmitEffectivePresentationChanged(
      previousPresentation,
      getEffectivePresentationStatus(),
      'selected-path-overlay-active',
    );
  }

  function chatAtlasSelectedPathOverlayEvaluate() {
    const acquisition = selectedPathAcquisitionState;
    const canonical = chatAtlasCanonicalPresentationIndex();
    const proofIdentity = chatAtlasSelectedPathOverlayProofIdentity(acquisition?.proof);
    const pathIdentity = chatAtlasSelectedPathOverlayPathIdentity(acquisition?.path);
    const prospectiveKey = acquisition?.proof
      ? JSON.stringify([
        acquisition.proof.token,
        proofIdentity,
        pathIdentity,
        canonical?.sourceFingerprint || '',
      ])
      : '';
    if (
      chatAtlasSelectedPathOverlayCurrent()
      && prospectiveKey
      && selectedPathOverlayState.evaluationKey === prospectiveKey
    ) return getEffectivePresentationStatus();
    if (acquisition?.status !== 'proven') {
      const retainAfterProofReasons = new Set([
        'anchor-member-missing',
        'trusted-intent-expired',
        'trusted-intent-unavailable',
        'trusted-intent-resolved-unconfirmed',
        'trusted-intent-resolved-failed',
        'trusted-intent-resolved-cancelled',
        'reconciliation-disabled-by-setter',
      ]);
      if (
        retainAfterProofReasons.has(String(acquisition?.reason || ''))
        && chatAtlasSelectedPathOverlayCurrent()
      ) return getEffectivePresentationStatus();
      if (selectedPathOverlayState.status === 'active') {
        return chatAtlasClearSelectedPathOverlay('acquisition-not-proven');
      }
      return getEffectivePresentationStatus();
    }
    const capturedIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const intent = capturedIntent
      && (
        acquisition.anchorQId === capturedIntent.qId
        || chatAtlasQuestionEditSiblingProof(
          selectedPathAcquisitionState.graph?.identityGraph,
          capturedIntent.qId,
          acquisition.anchorQId,
        )
      )
      ? chatAtlasCurrentTrustedNativeBranchSelection(capturedIntent.qId)
      : null;
    const route = chatAtlasFullIndexRoute();
    const candidate = chatAtlasBuildSelectedPathOverlay(acquisition, canonical, {
      intent,
      enabled: completeTurnIndexAuthorityState.enabled === true,
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      stale: completeTurnIndexAuthorityState.branchSelectionStale === true,
      staleQId: String(completeTurnIndexAuthorityState.branchSelectionStaleQId || ''),
      staleRevision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
      routeChatId: String(route?.chatId || ''),
      routeRouteKey: String(route?.routeKey || ''),
      origin: String(acquisition?.origin || 'manual-native-selection'),
      manualOverrideActive: completeTurnIndexAuthorityState.manualOverrideActive === true,
      manualOverrideRevision: Number(completeTurnIndexAuthorityState.manualOverrideRevision || 0),
      activatedAt: new Date().toISOString(),
    });
    if (!candidate.ok) {
      return chatAtlasClearSelectedPathOverlay(candidate.reason, { invalid: true });
    }
    if (
      candidate.chatId !== String(route?.chatId || '')
      || candidate.routeKey !== String(route?.routeKey || '')
    ) {
      return chatAtlasClearSelectedPathOverlay('route-mismatch', { invalid: true });
    }
    return chatAtlasInstallSelectedPathOverlay(candidate);
  }

  function chatAtlasIdentityGraphValid(graph, chatIdRaw) {
    const chatId = chatAtlasCompleteIndexIdentity(chatIdRaw);
    if (
      !graph
      || typeof graph !== 'object'
      || Array.isArray(graph)
      || chatAtlasCompleteIndexIdentity(graph.chatId) !== chatId
      || !chatAtlasCompleteIndexIdentity(graph.currentNode)
      || !Array.isArray(graph.nodes)
      || !Number.isInteger(graph.nodeCount)
      || graph.nodeCount !== graph.nodes.length
      || graph.nodeCount < 1
      || graph.nodeCount > 8192
      || !String(graph.capturedAt || '')
    ) return false;
    const nodeIds = new Set();
    for (const node of graph.nodes) {
      if (
        !node
        || typeof node !== 'object'
        || Array.isArray(node)
        || !(
          chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'stopped',
          ])
          || chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'branchShellAlias',
            'stopped',
          ])
          // Stage 2C-2r: the host's message creation time travels with the
          // node so branches can be ordered by when they were created. The
          // key set stays EXACT — an unknown key is still a rejected graph.
          || chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'stopped',
            'createTime',
          ])
          || chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'branchShellAlias',
            'stopped',
            'createTime',
          ])
        )
      ) return false;
      const nodeId = chatAtlasCompleteIndexIdentity(node.nodeId);
      const messageId = chatAtlasCompleteIndexIdentity(node.messageId);
      if (
        !nodeId
        || nodeIds.has(nodeId)
        || !messageId
        || (
          Object.hasOwn(node, 'createTime')
          && node.createTime !== null
          && !(typeof node.createTime === 'number' && Number.isFinite(node.createTime) && node.createTime > 0)
        )
        || (node.parentId != null && !chatAtlasCompleteIndexIdentity(node.parentId))
        || !Array.isArray(node.childIds)
        || node.childIds.some((childId) => !chatAtlasCompleteIndexIdentity(childId))
        || new Set(node.childIds).size !== node.childIds.length
        || typeof node.productUser !== 'boolean'
        || typeof node.productAnswer !== 'boolean'
        || (Object.hasOwn(node, 'branchShellAlias') && typeof node.branchShellAlias !== 'boolean')
        || typeof node.stopped !== 'boolean'
      ) return false;
      nodeIds.add(nodeId);
    }
    if (!nodeIds.has(graph.currentNode)) return false;
    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    for (const node of graph.nodes) {
      if (node.parentId && !nodeIds.has(node.parentId)) return false;
      if (node.childIds.some((childId) => !nodeIds.has(childId))) return false;
      if (
        node.parentId
        && !nodeById.get(node.parentId)?.childIds?.includes(node.nodeId)
      ) return false;
      if (node.childIds.some((childId) => nodeById.get(childId)?.parentId !== node.nodeId)) {
        return false;
      }
    }
    return true;
  }

  function chatAtlasRetainIdentityGraph(result, context = {}) {
    const chatId = chatAtlasCompleteIndexIdentity(context?.chatId);
    const routeKey = String(context?.routeKey || '');
    const generation = Number(context?.generation || 0);
    const graph = result?.ok === true ? result?.identityGraph : null;
    if (
      !chatId
      || !routeKey
      || !Number.isInteger(generation)
      || generation < 1
      || !chatAtlasIdentityGraphValid(graph, chatId)
    ) return false;
    const captureIdentity = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
      graph.currentNode,
      ...graph.nodes.map((node) => [
        node.nodeId,
        node.parentId,
        ...node.childIds,
        node.role,
        node.messageId,
        node.productUser,
        node.productAnswer,
        node.branchShellAlias === true,
        node.stopped,
      ]),
    ]))}`;
    const priorGraph = selectedPathAcquisitionState.graph;
    const graphUnchanged = priorGraph?.captureIdentity === captureIdentity;
    selectedPathAcquisitionState.graph = Object.freeze({
      identityGraph: graph,
      chatId,
      routeKey,
      generation,
      captureIdentity,
    });
    if (
      selectedPathAcquisitionState.status === 'proven'
      && graphUnchanged
      && selectedPathAcquisitionState.proof
    ) {
      selectedPathAcquisitionState.proof = chatAtlasFreeze({
        ...selectedPathAcquisitionState.proof,
        graphCapturedAt: String(graph.capturedAt || ''),
      });
    } else if (
      selectedPathAcquisitionState.status === 'proven'
      // An ordinary post-publication re-capture replaces the graph object
      // without invalidating the published path. Only a genuine scope change
      // (chat/route/generation) may retire a published selection here, and
      // that arrives through the reset boundary instead.
      && !chatAtlasAcquisitionPublicationOwned()
    ) {
      selectedPathAcquisitionState.status = 'inactive';
      selectedPathAcquisitionState.reason = 'graph-replaced';
      selectedPathAcquisitionState.path = null;
      selectedPathAcquisitionState.proof = null;
      selectedPathAcquisitionState.provenAt = null;
      selectedPathAcquisitionState.evaluationKey = '';
    }
    return true;
  }

  function chatAtlasNormalizeGraphDiagnosticIds(ids = []) {
    const normalized = [];
    const seen = new Set();
    for (const rawId of Array.isArray(ids) ? ids : []) {
      if (typeof rawId !== 'string') continue;
      const withoutTurnPrefix = rawId.trim().replace(/^turn:/i, '').trim();
      const identity = chatAtlasCompleteIndexIdentity(withoutTurnPrefix);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      normalized.push(identity);
      if (normalized.length >= 32) break;
    }
    return normalized;
  }

  function chatAtlasGraphIdentitySummary(node = null) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    return {
      nodeId: chatAtlasCompleteIndexIdentity(node.nodeId) || null,
      messageId: chatAtlasCompleteIndexIdentity(node.messageId) || null,
      role: String(node.role || '') || null,
      productUser: node.productUser === true,
      productAnswer: node.productAnswer === true,
      stopped: node.stopped === true,
    };
  }

  function chatAtlasGraphIdentityMiss(requestedId) {
    return {
      requestedId,
      found: false,
      matchedDomains: [],
      nodeId: null,
      messageId: null,
      role: null,
      parent: null,
      children: [],
      productUser: false,
      productAnswer: false,
      stopped: false,
      isCurrentNode: false,
    };
  }

  /* Complete-index identity proof: answers "is this id a proven product
     turn in the current authoritative scope" purely from the Tier-0
     host-payload-proven index — no identity GRAPH required. The graph needs
     an active backend fetch (includeIdentityGraph) that the profile
     capability gates off on unauthorized activations (measured live:
     profile-not-authorized), and the SSR boot payload is not fetch-visible,
     so graph-gated consumers were structurally dead there. Consumers that
     only need per-id membership + role proof (the rendered-boundary
     collapse chain) belong on THIS surface; cross-branch topology consumers
     stay on getGraphIdentityDiagnostics. */
  function getCompleteIndexIdentityProof(ids = []) {
    const requestedIds = chatAtlasNormalizeGraphDiagnosticIds(ids);
    const miss = (requestedId) => ({
      requestedId,
      found: false,
      role: null,
      order: 0,
      productUser: false,
      productAnswer: false,
      stopped: false,
    });
    const unavailable = (reason) => chatAtlasFreeze({
      version: 1,
      available: false,
      reason,
      scope: null,
      records: requestedIds.map(miss),
    });
    const authority = completeTurnIndexAuthorityState;
    const route = chatAtlasFullIndexRoute();
    if (
      authority.enabled !== true
      || !chatAtlasCompleteIndexAuthorityActive()
      || !authority.index
      || !route?.chatId
      || !route?.routeKey
      || chatAtlasCompleteIndexIdentity(authority.chatId) !== chatAtlasCompleteIndexIdentity(route.chatId)
      || String(authority.routeKey || '') !== String(route.routeKey || '')
    ) return unavailable('authority-unavailable');
    const turns = Array.isArray(authority.index?.turns) ? authority.index.turns : [];
    const fingerprint = String(authority.index?.sourceFingerprint || '') || null;
    if (!turns.length || !fingerprint) return unavailable('authority-unavailable');
    const scope = chatAtlasFreeze({
      chatId: chatAtlasCompleteIndexIdentity(authority.chatId) || null,
      routeKey: String(authority.routeKey || ''),
      generation: Math.max(0, Number(authority.generation || 0)),
      fingerprint,
      turnCount: turns.length,
    });
    const records = requestedIds.map((requestedId) => {
      for (const turn of turns) {
        const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
        if (qId && qId === requestedId) {
          return {
            requestedId,
            found: true,
            role: 'user',
            order: Math.max(0, Number(turn?.order || 0)),
            productUser: true,
            productAnswer: false,
            stopped: turn?.stopped === true,
          };
        }
        const primary = chatAtlasCompleteIndexIdentity(turn?.primaryAId);
        const variants = Array.isArray(turn?.answerVariants) ? turn.answerVariants : [];
        const selectedNode = chatAtlasCompleteIndexIdentity(turn?.branch?.selectedAssistantNodeId);
        if (
          (primary && primary === requestedId)
          || (selectedNode && selectedNode === requestedId)
          || variants.some((variant) => chatAtlasCompleteIndexIdentity(variant) === requestedId)
        ) {
          return {
            requestedId,
            found: true,
            role: 'assistant',
            order: Math.max(0, Number(turn?.order || 0)),
            productUser: false,
            productAnswer: true,
            stopped: turn?.stopped === true,
          };
        }
      }
      return miss(requestedId);
    });
    return chatAtlasFreeze({
      version: 1,
      available: true,
      reason: null,
      scope,
      records,
    });
  }

  function getGraphIdentityDiagnostics(ids = []) {
    const requestedIds = chatAtlasNormalizeGraphDiagnosticIds(ids);
    const unavailable = (reason, scope = null) => chatAtlasFreeze({
      version: 1,
      available: false,
      reason,
      scope,
      records: requestedIds.map((requestedId) => chatAtlasGraphIdentityMiss(requestedId)),
    });
    const retained = selectedPathAcquisitionState.graph;
    const graph = retained?.identityGraph || null;
    if (!graph) return unavailable('graph-unavailable');

    const authority = completeTurnIndexAuthorityState;
    const route = chatAtlasFullIndexRoute();
    if (
      authority.enabled !== true
      || !chatAtlasCompleteIndexAuthorityActive()
      || !authority.index
      || !route?.chatId
      || !route?.routeKey
    ) return unavailable('authority-unavailable');

    const scope = chatAtlasFreeze({
      chatId: String(retained.chatId || '') || null,
      routeKey: String(retained.routeKey || ''),
      generation: Math.max(0, Number(retained.generation || 0)),
      fingerprint: String(retained.captureIdentity || '') || null,
      graphCurrentNodeId: chatAtlasCompleteIndexIdentity(graph.currentNode) || null,
      graphNodeCount: Number.isInteger(graph.nodeCount) ? graph.nodeCount : 0,
    });
    const scopeCurrent = (
      chatAtlasCompleteIndexIdentity(retained.chatId) === chatAtlasCompleteIndexIdentity(route.chatId)
      && String(retained.routeKey || '') === String(route.routeKey || '')
      && Number(retained.generation || 0) === Number(authority.generation || 0)
      && chatAtlasCompleteIndexIdentity(authority.chatId) === chatAtlasCompleteIndexIdentity(route.chatId)
      && String(authority.routeKey || '') === String(route.routeKey || '')
      && !!scope.fingerprint
      && chatAtlasIdentityGraphValid(graph, route.chatId)
    );
    if (!scopeCurrent) return unavailable('graph-stale', scope);

    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const records = requestedIds.map((requestedId) => {
      const matches = graph.nodes.filter((node) => (
        node.nodeId === requestedId || node.messageId === requestedId
      ));
      if (matches.length !== 1) return chatAtlasGraphIdentityMiss(requestedId);
      const node = matches[0];
      const matchedDomains = [];
      if (node.nodeId === requestedId) matchedDomains.push('nodeId');
      if (node.messageId === requestedId) matchedDomains.push('messageId');
      const parent = node.parentId ? chatAtlasGraphIdentitySummary(nodeById.get(node.parentId)) : null;
      const children = node.childIds
        .slice(0, 32)
        .map((childId) => chatAtlasGraphIdentitySummary(nodeById.get(childId)))
        .filter(Boolean);
      return {
        requestedId,
        found: true,
        matchedDomains,
        nodeId: chatAtlasCompleteIndexIdentity(node.nodeId) || null,
        messageId: chatAtlasCompleteIndexIdentity(node.messageId) || null,
        role: String(node.role || '') || null,
        parent,
        children,
        productUser: node.productUser === true,
        productAnswer: node.productAnswer === true,
        stopped: node.stopped === true,
        isCurrentNode: node.nodeId === graph.currentNode,
      };
    });
    return chatAtlasFreeze({
      version: 1,
      available: true,
      reason: null,
      scope,
      records,
    });
  }

  function chatAtlasSelectedPathNativeEvidence(members = []) {
    const byQId = new Map();
    for (const member of Array.isArray(members) ? members : []) {
      const qId = chatAtlasCompleteIndexIdentity(member?.question?.currentQId);
      if (!qId || member?.answer?.currentProjectionSource !== 'native-evidence') continue;
      const answerIds = chatAtlasCv2CurrentIds(member?.answer?.currentAnswerIds || [])
        .map(chatAtlasCompleteIndexIdentity)
        .filter(Boolean);
      const prior = byQId.get(qId);
      if (prior) {
        prior.memberCount += 1;
        for (const answerId of answerIds) prior.answerIds.add(answerId);
      } else {
        byQId.set(qId, { memberCount: 1, answerIds: new Set(answerIds) });
      }
    }
    return byQId;
  }

  // ---- Native client selected-chain authority ------------------------------
  // The host backend's current_node is proven NOT to follow a native variant
  // switch: a successful 30s no-store refetch returned the pre-click node while
  // the page was visibly on the new answer. ChatGPT itself renders the thread
  // from a client-side linearized chain of selected message ids, which does
  // follow the switch immediately and covers unmounted turns. That chain is the
  // manual-session authority; the graph remains the validator, never the guess.
  const CHAT_ATLAS_CLIENT_CHAIN_MAX_FIBER_HOPS = 80;

  const CHAT_ATLAS_CLIENT_CHAIN_MAX_SCAN_NODES = 24000;

  const CHAT_ATLAS_CLIENT_CHAIN_MAX_DEPTH = 9;

  const CHAT_ATLAS_CLIENT_CHAIN_MIN_LENGTH = 2;

  // Structural discovery only. Minified component names, hop counts and hook
  // indices all rotate on any host deploy, so none of them may be relied on:
  // every ancestor fiber's props and full hook chain are scanned generically,
  // and a candidate is kept only if every string it holds is a message id this
  // graph already knows.
  // `isKnownChainId` decides whether ONE raw string may belong to a candidate.
  // It is deliberately wider than "product message": the host's own selected
  // chain is a root-to-leaf walk and legitimately carries structural graph node
  // ids at its endpoints (live shape: `client-created-root` at index 0 and a
  // structural terminal at index 38 of a 39-entry chain whose other 37 entries
  // are product messages). Requiring every entry to be a product message threw
  // that entire chain away on its FIRST element. The all-or-nothing rule below
  // is unchanged and still fail-closed — what widened is only what counts as
  // provably owned by this identity graph.
  function chatAtlasClientChainCollectCandidates(isKnownChainId) {
    const found = [];
    const D = typeof document === 'undefined' ? null : document;
    if (!D || typeof D.querySelectorAll !== 'function') return found;
    const anchors = [];
    try {
      const thread = D.querySelector('[data-conversation-screenshot-content]');
      if (thread) anchors.push(thread);
      const mounted = D.querySelectorAll('[data-message-id]');
      for (let index = 0; index < mounted.length && anchors.length < 6; index += 1) {
        anchors.push(mounted[index]);
      }
    } catch { return found; }
    const signatures = new Set();
    let budget = CHAT_ATLAS_CLIENT_CHAIN_MAX_SCAN_NODES;
    const consider = (value) => {
      const ids = [];
      for (const entry of value) {
        if (typeof entry !== 'string') continue;
        const id = chatAtlasCompleteIndexIdentity(entry);
        // An id this graph does not uniquely own disqualifies the whole array;
        // partial matches are never silently trimmed.
        if (!id || !isKnownChainId(id)) return;
        ids.push(id);
      }
      if (ids.length < CHAT_ATLAS_CLIENT_CHAIN_MIN_LENGTH) return;
      const signature = ids.join('|');
      if (signatures.has(signature)) return;
      signatures.add(signature);
      found.push(Object.freeze(ids));
    };
    const scan = (root) => {
      const seen = new Set();
      const walk = (node, depth) => {
        if (budget <= 0 || depth > CHAT_ATLAS_CLIENT_CHAIN_MAX_DEPTH) return;
        if (!node || typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);
        budget -= 1;
        if (Array.isArray(node)) {
          consider(node);
          for (let index = 0; index < node.length && index < 60; index += 1) {
            walk(node[index], depth + 1);
          }
          return;
        }
        let keys;
        try { keys = Object.keys(node); } catch { return; }
        for (let index = 0; index < keys.length && index < 60; index += 1) {
          let child;
          try { child = node[keys[index]]; } catch { continue; }
          walk(child, depth + 1);
        }
      };
      walk(root, 0);
    };
    for (const element of anchors) {
      let fiberKey = null;
      try {
        for (const key of Object.keys(element)) {
          if (key.slice(0, 13) === '__reactFiber$') { fiberKey = key; break; }
        }
      } catch { fiberKey = null; }
      if (!fiberKey) continue;
      let fiber = null;
      try { fiber = element[fiberKey]; } catch { fiber = null; }
      let hops = 0;
      while (fiber && hops < CHAT_ATLAS_CLIENT_CHAIN_MAX_FIBER_HOPS && budget > 0) {
        try { scan(fiber.memoizedProps); } catch {}
        let hook = null;
        try { hook = fiber.memoizedState; } catch { hook = null; }
        let index = 0;
        while (hook && index < 30 && budget > 0) {
          try { scan(hook.memoizedState); } catch {}
          try { hook = hook.next; } catch { hook = null; }
          index += 1;
        }
        try { fiber = fiber.return; } catch { fiber = null; }
        hops += 1;
      }
    }
    return found;
  }

  // Consecutive chain entries must be linked in the graph with no intervening
  // product message. Shells, tool and system nodes may sit between them; a
  // second product node may not, because that would mean the chain skipped a
  // turn it never proved.
  function chatAtlasClientChainLinked(byNodeId, previous, next) {
    if (!previous || !next) return false;
    let cursor = next;
    let guard = 0;
    while (cursor && guard < 4096) {
      if (!cursor.parentId) return false;
      const parent = byNodeId.get(cursor.parentId);
      if (!parent) return false;
      if (parent.nodeId === previous.nodeId) return true;
      if (parent.productUser === true || parent.productAnswer === true) return false;
      cursor = parent;
      guard += 1;
    }
    return false;
  }

  function chatAtlasNativeClientSelectedChain(graph, selectedAnswerIdRaw) {
    const empty = (reason) => chatAtlasFreeze({
      ok: false, reason, messageIds: null, nodes: null, closure: null, candidateCount: 0,
    });
    if (!Array.isArray(graph?.nodes) || !graph.nodes.length) {
      return empty('client-chain-graph-unavailable');
    }
    const target = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    if (!target) return empty('client-chain-target-unavailable');
    const byNodeId = new Map();
    const byMessageId = new Map();
    const ambiguous = new Set();
    // Every id this graph owns uniquely, product or structural, resolved back
    // to its ONE node. A node contributes both its nodeId and its messageId
    // (usually equal; a branch shell alias makes them differ), and registering
    // the same node twice is not ambiguity — only two DIFFERENT nodes claiming
    // one id is.
    const chainById = new Map();
    const chainAmbiguous = new Set();
    const graphChatId = chatAtlasCompleteIndexIdentity(graph?.chatId);
    const registerChainId = (rawId, node) => {
      const id = chatAtlasCompleteIndexIdentity(rawId);
      if (!id) return;
      const existing = chainById.get(id);
      if (existing && existing !== node) { chainAmbiguous.add(id); return; }
      if (!existing) chainById.set(id, node);
    };
    for (const node of graph.nodes) {
      byNodeId.set(node.nodeId, node);
      registerChainId(node?.nodeId, node);
      registerChainId(node?.messageId, node);
      if (node?.productUser !== true && node?.productAnswer !== true) continue;
      const id = chatAtlasCompleteIndexIdentity(node?.messageId);
      if (!id) continue;
      if (byMessageId.has(id)) { ambiguous.add(id); continue; }
      byMessageId.set(id, node);
    }
    // The conversation id is never a chain member. Live, the only array the
    // fiber walk found before the real chain was the chat id repeated twice;
    // it must stay rejected however the mapping is shaped.
    const known = (id) => (
      id !== graphChatId && chainById.has(id) && !chainAmbiguous.has(id)
    );
    let candidates = [];
    try { candidates = chatAtlasClientChainCollectCandidates(known); } catch { candidates = []; }
    // ── Rendered-turn projection ────────────────────────────────────────────
    // The host array is a sequence of RENDERED TURN ids, not a product-message
    // ancestry path. An assistant turn is named by the FIRST message of its
    // run, while the message actually rendered — and the one the graph's next
    // question descends from — is the LAST product answer in that run. Live:
    //   37ab747d (productAnswer) -> 50cee12f (non-product) -> 16e81a3e  => 16e81a3e
    //   80c1a30f (non-product)   -> 0d2fad64 (non-product) -> 3a1e5e85  => 3a1e5e85
    // This is exactly the window chatAtlasTurnsFromChain already applies, so
    // the projection speaks the qId/primaryAId language the rest of the
    // architecture consumes. Graph-only: no DOM, so virtualized turns project
    // identically to mounted ones.
    const projectAssistantRun = (start) => {
      let cursor = start;
      let last = start.productAnswer === true ? start : null;
      let guard = 0;
      while (cursor && guard < 4096) {
        const continuations = (cursor.childIds || [])
          .map((childId) => byNodeId.get(childId))
          .filter((child) => !!child && child.productUser !== true);
        // The run ends immediately before the next question, or at a leaf.
        if (!continuations.length) break;
        // Two viable continuations are two possible rendered runs: never guess.
        if (continuations.length > 1) return null;
        cursor = continuations[0];
        guard += 1;
        if (cursor.productAnswer === true) last = cursor;
      }
      return last;
    };
    // ── The route H2O itself derives, from the same graph ───────────────────
    // chatAtlasChainToRoot + chatAtlasTurnsFromChain is the ONE turn model in
    // this architecture, including its canonical system-branch-root promotion.
    // The projection below never re-derives an answer identity of its own: it
    // adopts whatever this model says, so the reader emits exactly the
    // qId/primaryAId language every downstream consumer already speaks.
    const modelRouteFor = (terminalNode) => {
      let fullChain = null;
      try { fullChain = chatAtlasChainToRoot(byNodeId, terminalNode); } catch { fullChain = null; }
      if (!fullChain) return null;
      const modelTurns = chatAtlasTurnsFromChain(fullChain, byNodeId);
      if (!Array.isArray(modelTurns) || !modelTurns.length) return null;
      const flat = [];
      const nodes = [];
      for (const turn of modelTurns) {
        const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
        const qNode = qId ? byMessageId.get(qId) : null;
        if (!qId || !qNode) return null;
        flat.push(qId); nodes.push(qNode);
        const primaryAId = chatAtlasCompleteIndexIdentity(turn?.primaryAId);
        if (!primaryAId) continue;
        // A promoted branch-shell alias is a legitimate answer identity that is
        // not a product node, so it is resolved through the ownership index.
        const aNode = byMessageId.get(primaryAId) || chainById.get(primaryAId) || null;
        if (!aNode) return null;
        flat.push(primaryAId); nodes.push(aNode);
      }
      return { flat, nodes, fullChain, turns: modelTurns };
    };
    // ── Rendered-turn validation ────────────────────────────────────────────
    // THIS is the linkage proof for a rendered-turn candidate, and it is
    // STRICTLY STRONGER than the pairwise walk. Every raw entry must name a
    // node ON the model route, in strictly increasing route order; every user
    // entry must open the next model turn in sequence; every assistant entry
    // must fall inside the window of the turn just opened; and every model turn
    // must be named exactly once. A skipped turn, a reorder, a cross-branch
    // splice or an invented answer all fail it. chatAtlasClientChainLinked is
    // left untouched and still guards every other caller.
    const validateCandidate = (ids) => {
      const rawNodes = [];
      let seenTurn = false;
      for (const id of ids) {
        if (!known(id)) return null;
        const node = chainById.get(id);
        if (!node) return null;
        // A genuine graph ROOT wrapper ahead of the first rendered turn is
        // validation evidence and names no turn. Only the real root qualifies —
        // an arbitrary structural id is never a wrapper.
        if (!seenTurn && node.productUser !== true && !node.parentId) continue;
        seenTurn = true;
        rawNodes.push(node);
      }
      // A rendered route always opens on a question.
      if (!rawNodes.length || rawNodes[0].productUser !== true) return null;
      const lastRaw = rawNodes[rawNodes.length - 1];
      const terminal = lastRaw.productUser === true ? lastRaw : projectAssistantRun(lastRaw);
      if (!terminal) return null;
      const model = modelRouteFor(terminal);
      if (!model) return null;
      if (model.flat.length < CHAT_ATLAS_CLIENT_CHAIN_MIN_LENGTH) return null;
      const routeIndex = new Map(model.fullChain.map((node, index) => [node.nodeId, index]));
      const questionIndex = model.turns.map((turn) => {
        const qNode = byMessageId.get(chatAtlasCompleteIndexIdentity(turn?.qId));
        return qNode ? routeIndex.get(qNode.nodeId) : null;
      });
      if (questionIndex.some((index) => index == null)) return null;
      let turnAt = 0;
      let lastRouteIndex = -1;
      for (const node of rawNodes) {
        const index = routeIndex.get(node.nodeId);
        if (index == null) return null;            // names a node off this route
        if (index <= lastRouteIndex) return null;  // repeat or reorder
        lastRouteIndex = index;
        if (node.productUser === true) {
          if (index !== questionIndex[turnAt]) return null;  // skipped/wrong turn
          turnAt += 1;
          continue;
        }
        if (turnAt < 1) return null;                          // answer before any question
        const nextQuestion = questionIndex[turnAt];
        if (nextQuestion != null && index >= nextQuestion) return null;  // outside its turn window
      }
      if (turnAt !== model.turns.length) return null;         // a turn was never named
      return { messageIds: model.flat, nodes: model.nodes, fullChain: model.fullChain };
    };
    const accepted = [];
    const acceptedSignatures = new Set();
    for (const ids of candidates) {
      const projected = validateCandidate(ids);
      if (!projected) continue;
      // Target proof is against the PROJECTED identities only.
      if (!projected.messageIds.includes(target)) continue;
      // Dedupe on the PROJECTED sequence. One selected route found at several
      // React locations, or named through different but equally valid turn
      // ids, is one route — not an ambiguity. Two genuinely different projected
      // routes still fail closed below.
      const signature = projected.messageIds.join('|');
      if (acceptedSignatures.has(signature)) continue;
      acceptedSignatures.add(signature);
      accepted.push({
        ids: projected.messageIds,
        nodes: projected.nodes,
        fullChain: projected.fullChain,
      });
    }
    if (!accepted.length) return empty('client-chain-unavailable');
    if (accepted.length > 1) return empty('client-chain-ambiguous');
    const winner = accepted[0];
    // Closure = the validated root->terminal chain itself. It carries the
    // selected route's real structural and product ancestry and no rival
    // branch, so chooseGraphCandidate can still resolve every fork on the
    // route by membership alone and never guesses.
    const closure = new Set(winner.fullChain.map((node) => node.nodeId));
    return Object.freeze({
      ok: true,
      reason: null,
      messageIds: Object.freeze(winner.ids.slice()),
      nodes: Object.freeze(winner.nodes.slice()),
      closure,
      candidateCount: accepted.length,
    });
  }

  // Convert a proven client chain into the downstream tail of the selected
  // path. This is deliberately NOT a second pairing implementation: the node
  // chain is rebuilt with chatAtlasChainToRoot and paired with
  // chatAtlasTurnsFromChain, exactly as the parity gate does.
  function chatAtlasClientChainDerivedTail(chain, nodeById, context) {
    const bad = (reason) => Object.freeze({ ok: false, reason, turns: null, tailNodeId: null });
    if (!chain || chain.ok !== true || !Array.isArray(chain.nodes) || !chain.nodes.length) return null;
    const anchorOrder = Number(context?.anchorOrder || 0);
    const anchorQId = chatAtlasCompleteIndexIdentity(context?.anchorQId);
    const anchorAnswerId = chatAtlasCompleteIndexIdentity(context?.anchorAnswerId);
    const canonicalPrefix = Array.isArray(context?.canonicalPrefix) ? context.canonicalPrefix : [];
    if (anchorOrder < 1 || !anchorQId || !anchorAnswerId) return bad('client-chain-path-mismatch');
    const terminalNode = nodeById.get(chain.nodes[chain.nodes.length - 1]?.nodeId) || null;
    if (!terminalNode) return bad('client-chain-path-mismatch');
    let chainNodes = null;
    try { chainNodes = chatAtlasChainToRoot(nodeById, terminalNode); } catch { chainNodes = null; }
    if (!chainNodes) return bad('client-chain-path-mismatch');
    const chainTurns = chatAtlasTurnsFromChain(chainNodes, nodeById);
    if (!Array.isArray(chainTurns) || chainTurns.length < anchorOrder) {
      return bad('client-chain-path-mismatch');
    }
    const anchorTurn = chainTurns[anchorOrder - 1];
    if (chatAtlasCompleteIndexIdentity(anchorTurn?.qId) !== anchorQId) {
      return bad('client-chain-path-mismatch');
    }
    if (chatAtlasCompleteIndexIdentity(anchorTurn?.primaryAId) !== anchorAnswerId) {
      return bad('client-chain-path-mismatch');
    }
    // The prefix is matched by question identity. Answer identity before the
    // anchor legitimately differs: the canonical index carries the previously
    // accepted answers, while the chain carries what the page is showing.
    for (let index = 0; index < canonicalPrefix.length; index += 1) {
      if (
        chatAtlasCompleteIndexIdentity(chainTurns[index]?.qId)
        !== chatAtlasCompleteIndexIdentity(canonicalPrefix[index]?.qId)
      ) return bad('client-chain-path-mismatch');
    }
    const tail = [];
    for (let index = anchorOrder; index < chainTurns.length; index += 1) {
      const turn = chainTurns[index];
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      if (!qId) return bad('client-chain-path-mismatch');
      tail.push(chatAtlasFreeze({
        order: index + 1,
        qId,
        turnId: `turn:${qId}`,
        primaryAId: chatAtlasCompleteIndexIdentity(turn?.primaryAId) || null,
        answerVariants: Array.isArray(turn?.answerVariants) ? turn.answerVariants.slice() : [],
        noAnswer: turn?.noAnswer === true,
        stopped: turn?.stopped === true,
        // The client chain decides WHICH graph route is authoritative; the
        // turns themselves are still reconstructed from the identity graph by
        // chatAtlasChainToRoot + chatAtlasTurnsFromChain, so their construction
        // provenance is graph-descent. And a downstream turn that is not
        // mounted cannot claim direct native confirmation.
        provenance: 'graph-descent',
        confirmedByNativeEvidence: false,
      }));
    }
    return Object.freeze({
      ok: true,
      reason: null,
      turns: Object.freeze(tail),
      tailNodeId: terminalNode.nodeId,
      chainTurns: Object.freeze(chainTurns),
    });
  }

  function chatAtlasClientChainProvesAnchor(chain, selectedAnswerIdRaw) {
    const target = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    if (!target || !chain || chain.ok !== true) return false;
    return Array.isArray(chain.messageIds) && chain.messageIds.includes(target);
  }

  function chatAtlasSelectedPathGraphAnchorNode(graph, selectedAnswerIdRaw) {
    const selectedAnswerId = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    if (!selectedAnswerId || !Array.isArray(graph?.nodes)) return null;
    const matches = graph.nodes.filter((node) => (
      node?.productAnswer === true
      && chatAtlasCompleteIndexIdentity(node?.messageId) === selectedAnswerId
    ));
    return matches.length === 1 ? matches[0] : null;
  }

  // Does this graph's current_node chain PROVE the newly selected anchor
  // answer? A trusted manual switch the host has already applied leaves
  // current_node inside the selected answer's subtree. A graph captured BEFORE
  // the click leaves it in the previous sibling's subtree, so nothing below
  // the new anchor can be resolved by containment. Presence of the anchor node
  // is not proof: sibling variants are always present in the same graph.
  // Bounded ancestor walk from current_node; equality counts as proof.
  function chatAtlasSelectedPathGraphProvesAnchor(graph, selectedAnswerIdRaw) {
    const anchorAnswerNode = chatAtlasSelectedPathGraphAnchorNode(graph, selectedAnswerIdRaw);
    if (!anchorAnswerNode || !Array.isArray(graph?.nodes)) return false;
    const currentNodeId = chatAtlasCompleteIndexIdentity(graph.currentNode);
    if (!currentNodeId) return false;
    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const seen = new Set();
    let cursor = nodeById.get(currentNodeId) || null;
    let visits = 0;
    while (cursor && visits <= 4096) {
      visits += 1;
      if (cursor.nodeId === anchorAnswerNode.nodeId) return true;
      if (seen.has(cursor.nodeId)) return false;
      seen.add(cursor.nodeId);
      if (!cursor.parentId) return false;
      cursor = nodeById.get(cursor.parentId) || null;
    }
    return false;
  }

  // Only derivation reasons whose resolution genuinely depends on current_node
  // containment qualify for the stale-evidence handoff. Every other reason is
  // a structural fault a fresher graph cannot repair, and must stay terminal.
  const CHAT_ATLAS_STALE_GRAPH_DERIVATION_REASONS = Object.freeze(new Set([
    'fork-unresolved',
  ]));

  // Pre-click evidence, or a real verdict? This is the whole distinction:
  //   graph does NOT prove the selected anchor -> stale/pre-click -> pending
  //   graph DOES prove it and the fork is still equal -> real -> fail closed
  function chatAtlasSelectedPathStaleGraphEvidence(graph, selectedAnswerIdRaw, reason) {
    return CHAT_ATLAS_STALE_GRAPH_DERIVATION_REASONS.has(
      chatAtlasCompleteIndexCode(reason, 'derivation-failed', 64),
    ) && !chatAtlasSelectedPathGraphProvesAnchor(graph, selectedAnswerIdRaw);
  }

  function chatAtlasDeriveSelectedPath(graph, intent, selectedAnswerIdRaw) {
    let lastForkDiagnostics = null;
    const fail = (reason) => {
      selectedPathAcquisitionState.lastDerivationDiagnostics = chatAtlasFreeze({
        ok: false,
        reason: chatAtlasCompleteIndexCode(reason, 'derivation-failed', 64),
        pathLength: 0,
        fingerprint: null,
        tailNodeId: null,
        graphCurrentNodeId: chatAtlasCompleteIndexIdentity(graph?.currentNode) || null,
        graphNodeCount: Number(graph?.nodeCount || 0),
        fork: lastForkDiagnostics,
        turns: Object.freeze([]),
      });
      return { ok: false, reason };
    };
    const selectedAnswerId = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    const canonical = completeTurnIndexAuthorityState.index;
    const turns = Array.isArray(canonical?.turns) ? canonical.turns : [];
    const qId = chatAtlasCompleteIndexIdentity(intent?.qId);
    const capturedAnchorQId = chatAtlasCompleteIndexIdentity(intent?.capturedAnchorQId) || qId;
    const questionEditAnchorSwap = capturedAnchorQId !== qId
      && chatAtlasQuestionEditSiblingProof(graph, capturedAnchorQId, qId);
    if (capturedAnchorQId !== qId && !questionEditAnchorSwap) return fail('anchor-linkage-invalid');
    const canonicalMatches = turns.filter(
      (turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === capturedAnchorQId,
    );
    if (canonicalMatches.length !== 1) return fail('anchor-canonical-invalid');
    const anchorCanonical = canonicalMatches[0];
    const anchorOrder = Number(anchorCanonical.order || 0);
    if (
      anchorOrder < 1
      || !selectedAnswerId
      || (!questionEditAnchorSwap && (
        !Array.isArray(anchorCanonical.answerVariants)
        || !anchorCanonical.answerVariants.includes(selectedAnswerId)
      ))
    ) return fail('anchor-answer-not-canonical-variant');

    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const anchorAnswerNode = chatAtlasSelectedPathGraphAnchorNode(graph, selectedAnswerId);
    if (!anchorAnswerNode) return fail('anchor-not-in-graph');
    let visits = 0;
    const visit = (node) => {
      visits += 1;
      return !!node && visits <= 4096;
    };
    const parentSeen = new Set();
    let cursor = anchorAnswerNode;
    let anchorQuestionNode = null;
    while (cursor?.parentId) {
      if (parentSeen.has(cursor.nodeId)) return fail('anchor-linkage-invalid');
      parentSeen.add(cursor.nodeId);
      cursor = nodeById.get(cursor.parentId);
      if (!visit(cursor)) return fail('derivation-bounds-exceeded');
      if (cursor?.productUser === true) {
        anchorQuestionNode = cursor;
        break;
      }
    }
    if (
      !anchorQuestionNode
      || chatAtlasCompleteIndexIdentity(anchorQuestionNode.messageId) !== qId
    ) return fail('anchor-linkage-invalid');

    const prefixQIds = [];
    const prefixSeen = new Set();
    cursor = anchorQuestionNode;
    let rootNodeId = cursor.nodeId;
    while (cursor) {
      if (prefixSeen.has(cursor.nodeId)) return fail('anchor-linkage-invalid');
      prefixSeen.add(cursor.nodeId);
      if (cursor.productUser === true) {
        const prefixQId = chatAtlasCompleteIndexIdentity(cursor.messageId);
        if (!prefixQId) return fail('prefix-mismatch');
        prefixQIds.push(prefixQId);
      }
      rootNodeId = cursor.nodeId;
      if (!cursor.parentId) break;
      cursor = nodeById.get(cursor.parentId);
      if (!visit(cursor)) return fail('derivation-bounds-exceeded');
    }
    prefixQIds.reverse();
    const canonicalPrefix = turns.slice(0, anchorOrder).map((turn) => turn.qId);
    if (
      prefixQIds.length !== canonicalPrefix.length
      || prefixQIds.some((prefixQId, index) => (
        index === anchorOrder - 1 && questionEditAnchorSwap
          ? prefixQId !== qId
          : prefixQId !== canonicalPrefix[index]
      ))
    ) return fail('prefix-mismatch');

    const copyCanonical = (turn, provenance, primaryAId = turn.primaryAId) => {
      const variants = Array.isArray(turn.answerVariants) ? turn.answerVariants.slice() : [];
      if (primaryAId && variants.includes(primaryAId) && variants[variants.length - 1] !== primaryAId) {
        variants.splice(variants.indexOf(primaryAId), 1);
        variants.push(primaryAId);
      }
      return chatAtlasFreeze({
        order: Number(turn.order),
        qId: turn.qId,
        turnId: turn.turnId,
        primaryAId: primaryAId || null,
        answerVariants: variants,
        noAnswer: turn.noAnswer === true,
        stopped: turn.stopped === true,
        provenance,
        confirmedByNativeEvidence: provenance === 'anchor',
      });
    };
    const path = turns.slice(0, anchorOrder - 1)
      .map((turn) => copyCanonical(turn, 'canonical-prefix'));
    if (questionEditAnchorSwap) {
      const answerVariants = chatAtlasConvergenceAnswerVariantRoots(anchorQuestionNode, nodeById)
        .map((root) => chatAtlasAnswerIdentityForRoot(root, nodeById))
        .map(chatAtlasCompleteIndexIdentity)
        .filter(Boolean);
      if (!answerVariants.includes(selectedAnswerId)) return fail('anchor-linkage-invalid');
      if (answerVariants[answerVariants.length - 1] !== selectedAnswerId) {
        answerVariants.splice(answerVariants.indexOf(selectedAnswerId), 1);
        answerVariants.push(selectedAnswerId);
      }
      path.push(chatAtlasFreeze({
        order: anchorOrder,
        qId,
        turnId: `turn:${qId}`,
        primaryAId: selectedAnswerId,
        answerVariants,
        noAnswer: false,
        stopped: anchorQuestionNode.stopped === true,
        provenance: 'anchor',
        confirmedByNativeEvidence: true,
      }));
    } else {
      path.push(copyCanonical(anchorCanonical, 'anchor', selectedAnswerId));
    }
    const pathQIds = new Set(path.map((turn) => turn.qId));
    const canonicalQIds = new Set(turns.map((turn) => turn.qId));
    const mountedEvidence = intent?.mountedEvidence instanceof Map
      ? intent.mountedEvidence
      : new Map();

    const collectBoundary = (startNode) => {
      const users = [];
      const leaves = startNode?.childIds?.length ? [] : [startNode];
      const seen = new Set();
      const stack = (startNode?.childIds || []).slice().reverse();
      while (stack.length) {
        const node = nodeById.get(stack.pop());
        if (!visit(node)) return { ok: false, reason: 'derivation-bounds-exceeded' };
        if (seen.has(node.nodeId)) return { ok: false, reason: 'fork-unresolved' };
        seen.add(node.nodeId);
        if (node.productUser === true) {
          users.push(node);
          continue;
        }
        if (!node.childIds.length) {
          leaves.push(node);
          continue;
        }
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          stack.push(node.childIds[index]);
        }
      }
      return { ok: true, users, leaves };
    };
    const collectAnswers = (questionNode) => {
      const answers = [];
      const answerIdentities = [];
      const users = [];
      const leaves = questionNode?.childIds?.length ? [] : [questionNode];
      const seen = new Set();
      let stopped = false;
      const stack = (questionNode?.childIds || []).slice().reverse();
      while (stack.length) {
        const node = nodeById.get(stack.pop());
        if (!visit(node)) return { ok: false, reason: 'derivation-bounds-exceeded' };
        if (seen.has(node.nodeId)) return { ok: false, reason: 'descent-variant-ambiguous' };
        seen.add(node.nodeId);
        if (node.productUser === true) {
          users.push(node);
          continue;
        }
        if (node.stopped === true) stopped = true;
        if (node.productAnswer === true) answers.push(node);
        if (node.productAnswer === true || node.branchShellAlias === true) {
          const answerId = chatAtlasCompleteIndexIdentity(node.messageId);
          if (answerId && !answerIdentities.includes(answerId)) answerIdentities.push(answerId);
        }
        if (!node.childIds.length) leaves.push(node);
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          stack.push(node.childIds[index]);
        }
      }
      return { ok: true, answers, answerIdentities, users, leaves, stopped };
    };
    const clientChainClosure = intent?.clientSelectedChainClosure instanceof Set
      && intent.clientSelectedChainClosure.size
      ? intent.clientSelectedChainClosure
      : null;
    const currentGraphNode = nodeById.get(chatAtlasCompleteIndexIdentity(graph.currentNode)) || null;
    const currentNodeInsideSelectedAnswer = nodeDescendsFrom(
      currentGraphNode,
      anchorAnswerNode,
    );
    // Rank only terminal-complete graph routes. This is deliberately not a
    // longest-prefix heuristic: every ranked candidate must reach a real leaf,
    // the maximum identity route must be unique, and equal maxima fail closed.
    // Mounted shells never participate. They are hydration evidence and, in
    // the live defect, exposed only the terminal 1/3 edit while 27..39 stayed
    // unmounted in the same retained graph.
    const terminalRouteProof = (startNode) => {
      if (!startNode) return {
        ok: false,
        depth: -1,
        leafId: null,
        routes: Object.freeze([]),
        branchShellAliasResolved: false,
      };
      const stack = [{
        node: startNode,
        depth: 0,
        seen: new Set(),
        identities: [],
        nodeIds: [],
      }];
      const terminalRoutes = [];
      let rankedVisits = 0;
      let branchShellAliasResolved = false;
      while (stack.length) {
        const item = stack.pop();
        const node = item.node;
        rankedVisits += 1;
        if (!node || rankedVisits > 4096 || item.seen.has(node.nodeId)) {
          return {
            ok: false,
            depth: -1,
            leafId: null,
            routes: Object.freeze([]),
            branchShellAliasResolved,
          };
        }
        const nextSeen = new Set(item.seen);
        nextSeen.add(node.nodeId);
        const nodeIds = item.nodeIds.concat(node.nodeId).slice(-64);
        const depth = item.depth + (node.productUser === true ? 1 : 0);
        if (node.branchShellAlias === true) branchShellAliasResolved = true;
        const identity = chatAtlasCompleteIndexIdentity(node.messageId);
        const identities = item.identities.slice();
        if (node.productUser === true && identity) identities.push(`q:${identity}`);
        // A branch shell is structural identity for selecting the answer, but
        // it is not a second emitted answer. Logical terminal routes are
        // ranked by the validated product-turn identities they would emit.
        if (node.productAnswer === true && identity) identities.push(`a:${identity}`);
        if (!node.childIds.length) {
          terminalRoutes.push({
            depth,
            leafId: node.nodeId,
            nodeIds,
            identityKey: JSON.stringify(identities),
            identityHash: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identities))}`,
          });
          continue;
        }
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          stack.push({
            node: nodeById.get(node.childIds[index]),
            depth,
            seen: nextSeen,
            identities,
            nodeIds,
          });
        }
      }
      const routes = Object.freeze(terminalRoutes.slice(0, 16).map((route) => Object.freeze({
        leafId: route.leafId,
        emittedTurnCount: route.depth,
        orderedIdentityHash: route.identityHash,
        orderedNodeIds: Object.freeze(route.nodeIds.slice()),
      })));
      if (!terminalRoutes.length) return {
        ok: false,
        depth: -1,
        leafId: null,
        routes,
        branchShellAliasResolved,
      };
      const depth = Math.max(...terminalRoutes.map((route) => route.depth));
      const maxima = terminalRoutes.filter((route) => route.depth === depth);
      const logicalMaxima = new Map(maxima.map((route) => [route.identityKey, route]));
      return logicalMaxima.size === 1
        ? {
          ok: true,
          depth,
          leafId: logicalMaxima.values().next().value.leafId,
          routes,
          terminalRoutes,
          branchShellAliasResolved,
        }
        : {
          ok: false,
          depth,
          leafId: null,
          routes,
          terminalRoutes,
          branchShellAliasResolved,
        };
    };
    const chooseGraphCandidate = (candidates, contextNode = null, phase = 'graph-fork') => {
      const unique = [];
      const seen = new Set();
      for (const candidate of candidates || []) {
        const identity = chatAtlasCompleteIndexIdentity(candidate?.nodeId);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        unique.push(candidate);
      }
      if (unique.length === 1) return unique[0];
      if (!unique.length) return null;
      // NATIVE CLIENT SELECTION WINS. When the page's own selected chain is
      // proven for this manual selection it decides every fork below the
      // anchor -- question edits and answer regenerations alike -- by
      // membership, never by ranking. A fork the chain does not name is a
      // fork it never proved, so it fails closed rather than guessing.
      if (clientChainClosure) {
        const onChain = unique.filter(
          (candidate) => clientChainClosure.has(candidate?.nodeId),
        );
        if (onChain.length === 1) return onChain[0];
        return null;
      }
      const candidateType = (candidate) => {
        if (candidate?.productUser === true) return 'product-user';
        if (candidate?.branchShellAlias === true) return 'branch-shell-alias';
        if (candidate?.productAnswer === true) return 'product-answer';
        return 'structural';
      };
      const ranked = unique.map((candidate) => ({
        candidate,
        proof: terminalRouteProof(candidate),
      }));
      const terminalCandidates = ranked.flatMap((entry) => (
        (entry.proof.terminalRoutes || []).map((route) => ({ ...route, entry }))
      ));
      const maxDepth = terminalCandidates.length
        ? Math.max(...terminalCandidates.map((route) => route.depth))
        : -1;
      const rememberFork = (winner, reason) => {
        lastForkDiagnostics = chatAtlasFreeze({
          phase,
          forkNodeId: chatAtlasCompleteIndexIdentity(contextNode?.nodeId) || null,
          forkQId: contextNode?.productUser === true
            ? chatAtlasCompleteIndexIdentity(contextNode?.messageId) || null
            : null,
          parentNodeId: chatAtlasCompleteIndexIdentity(contextNode?.parentId) || null,
          candidateChildIds: Object.freeze(unique.map((candidate) => candidate.nodeId)),
          graphCurrentNodeId: chatAtlasCompleteIndexIdentity(currentGraphNode?.nodeId) || null,
          currentNodeInsideTargetAnswerSubtree: currentNodeInsideSelectedAnswer,
          winnerNodeId: chatAtlasCompleteIndexIdentity(winner?.nodeId) || null,
          decisionReason: reason,
          candidates: Object.freeze(ranked.map((entry) => Object.freeze({
            nodeId: entry.candidate.nodeId,
            parentId: chatAtlasCompleteIndexIdentity(entry.candidate.parentId) || null,
            role: String(entry.candidate.role || '') || null,
            type: candidateType(entry.candidate),
            insideTargetAnswerSubtree: nodeDescendsFrom(entry.candidate, anchorAnswerNode),
            currentNodeBelongs: nodeDescendsFrom(currentGraphNode, entry.candidate),
            branchShellAliasResolved: entry.proof.branchShellAliasResolved === true,
            terminalLeaves: Object.freeze(entry.proof.routes.map((route) => route.leafId)),
            terminalRoutes: entry.proof.routes,
            maximumEmittedTurnCount: entry.proof.depth,
            accepted: winner?.nodeId === entry.candidate.nodeId,
            rejectionReason: winner?.nodeId === entry.candidate.nodeId
              ? null
              : !(entry.proof.terminalRoutes || []).length
                ? 'candidate-terminal-route-unavailable'
                : entry.proof.depth < maxDepth
                  ? 'shorter-terminal-complete-route'
                  : 'equal-terminal-complete-route',
          }))),
        });
      };
      if (currentNodeInsideSelectedAnswer) {
        const selectedMatches = unique.filter((candidate) => (
          nodeDescendsFrom(currentGraphNode, candidate)
        ));
        if (selectedMatches.length === 1) {
          rememberFork(selectedMatches[0], 'current-node-inside-target-subtree');
          return selectedMatches[0];
        }
        if (selectedMatches.length > 1) {
          rememberFork(null, 'current-node-matches-multiple-candidates');
          return null;
        }
      }
      if (!terminalCandidates.length) {
        rememberFork(null, 'candidate-terminal-proof-unavailable');
        return null;
      }
      // Resolve the fork from the globally maximal terminal-complete logical
      // route. An internally ambiguous shorter candidate cannot veto a unique
      // longer route; equal maximal logical routes still fail closed.
      const maxima = terminalCandidates.filter((route) => route.depth === maxDepth);
      const maximumLogicalRoutes = new Map(
        maxima.map((route) => [route.identityKey, route]),
      );
      const maximumCandidateIds = new Set(
        maxima.map((route) => route.entry.candidate.nodeId),
      );
      const winner = maximumLogicalRoutes.size === 1 && maximumCandidateIds.size === 1
        ? maxima[0].entry.candidate
        : null;
      rememberFork(winner, winner
        ? 'unique-global-terminal-complete-maximum'
        : 'equal-global-terminal-complete-maximum');
      return winner;
    };
    const chooseAnswer = (questionQId, answerNodes) => {
      const unique = [];
      const seen = new Set();
      for (const node of answerNodes) {
        const answerId = chatAtlasCompleteIndexIdentity(node.messageId);
        if (!answerId || seen.has(answerId)) continue;
        seen.add(answerId);
        unique.push(node);
      }
      const endpoints = unique.filter((candidate) => !unique.some((other) => (
        other !== candidate && nodeDescendsFrom(other, candidate)
      )));
      if (endpoints.length === 1) return { node: endpoints[0], confirmed: false, variants: unique };
      if (unique.length < 1) return { node: null, confirmed: false, variants: [] };
      const selected = chooseGraphCandidate(endpoints, nodeById.get(questionQId), 'answer-variant');
      return selected
        ? { node: selected, confirmed: false, variants: unique }
        : { node: null, confirmed: false, variants: unique, ambiguous: true };
    };
    function nodeDescendsFrom(node, ancestorNode) {
      if (!node || !ancestorNode) return false;
      const seen = new Set();
      let current = node;
      while (current) {
        if (current.nodeId === ancestorNode.nodeId) return true;
        if (!current.parentId || seen.has(current.nodeId)) return false;
        seen.add(current.nodeId);
        current = nodeById.get(current.parentId);
      }
      return false;
    }
    const questionBranchRoot = (questionNode, node) => {
      if (!questionNode || !node) return null;
      const seen = new Set();
      let current = node;
      while (current?.parentId && current.parentId !== questionNode.nodeId) {
        if (seen.has(current.nodeId)) return null;
        seen.add(current.nodeId);
        current = nodeById.get(current.parentId);
      }
      return current?.parentId === questionNode.nodeId ? current : null;
    };
    const chooseContinuationQuestion = (questionNode, selected, candidates) => {
      const unique = [];
      const seen = new Set();
      for (const candidate of candidates || []) {
        const qId = chatAtlasCompleteIndexIdentity(candidate?.messageId);
        if (!qId || seen.has(qId)) continue;
        seen.add(qId);
        unique.push(candidate);
      }
      if (!unique.length) return { node: null, ambiguous: false };
      const selectedRoot = questionBranchRoot(questionNode, selected?.node);
      const sameSelectedBranch = unique.filter((candidate) => (
        nodeDescendsFrom(candidate, selected?.node)
        || (
          selectedRoot
          && questionBranchRoot(questionNode, candidate)?.nodeId === selectedRoot.nodeId
        )
      ));
      if (sameSelectedBranch.length === 1) {
        return { node: sameSelectedBranch[0], ambiguous: false };
      }
      if (sameSelectedBranch.length > 1) {
        const selectedQuestion = chooseGraphCandidate(sameSelectedBranch, questionNode, 'selected-answer-continuation');
        return selectedQuestion
          ? { node: selectedQuestion, ambiguous: false }
          : { node: null, ambiguous: true };
      }
      // Some legitimate host graphs place the next user as a sibling of the
      // completed answer under the same question boundary. Exact uniqueness
      // (one selected answer and one continuation user) proves that chain;
      // multiple users remain a genuine branch ambiguity and fail closed.
      if (unique.length === 1 && selected?.variants?.length === 1) {
        return { node: unique[0], ambiguous: false };
      }
      const selectedQuestion = chooseGraphCandidate(unique, questionNode, 'question-continuation');
      return selectedQuestion
        ? { node: selectedQuestion, ambiguous: false }
        : { node: null, ambiguous: true };
    };

    let selectedNode = anchorAnswerNode;
    let tailNodeId = selectedNode.nodeId;
    // Set when a no-answer mid-turn already identified the next question, so
    // the walk continues from it instead of re-collecting an answer boundary.
    let pendingQuestion = null;
    // WHOLE-PATH NATIVE CLIENT AUTHORITY. A validated client chain is the path
    // for this trusted manual selection, not merely a fork tie-breaker. A
    // fork-free continuation never reaches chooseGraphCandidate, so constraining
    // forks alone let derivation walk a completely different route while the
    // page was on another one. When the chain is present it supplies the tail
    // and the independent descent below does not run at all.
    const clientTail = chatAtlasClientChainDerivedTail(
      intent?.clientSelectedChain || null,
      nodeById,
      {
        anchorOrder,
        anchorQId: qId,
        anchorAnswerId: selectedAnswerId,
        canonicalPrefix: turns.slice(0, anchorOrder - 1),
      },
    );
    if (clientTail && clientTail.ok !== true) return fail(clientTail.reason);
    if (clientTail) {
      for (const turn of clientTail.turns) path.push(turn);
      tailNodeId = clientTail.tailNodeId;
    }
    while (!clientTail) {
      if (path.length > 512) return fail('derivation-bounds-exceeded');
      let questionNode = pendingQuestion;
      pendingQuestion = null;
      if (!questionNode) {
        const boundary = collectBoundary(selectedNode);
        if (!boundary.ok) return fail(boundary.reason);
        if (!boundary.users.length) {
          if (boundary.leaves.length !== 1) return fail('fork-unresolved');
          tailNodeId = boundary.leaves[0].nodeId;
          break;
        }
        if (boundary.leaves.length) return fail('fork-unresolved');
        questionNode = chooseGraphCandidate(boundary.users, selectedNode, 'answer-boundary');
        if (!questionNode) return fail('fork-unresolved');
      }
      const nextQId = chatAtlasCompleteIndexIdentity(questionNode.messageId);
      if (!nextQId) return fail('duplicate-qid');
      if (pathQIds.has(nextQId)) return fail('duplicate-qid');
      if (canonicalQIds.has(nextQId)) return fail('descent-qid-already-canonical');
      pathQIds.add(nextQId);

      const answerResult = collectAnswers(questionNode);
      if (!answerResult.ok) return fail(answerResult.reason);
      const selected = chooseAnswer(nextQId, answerResult.answers);
      if (selected.ambiguous) return fail('descent-variant-ambiguous');
      if (!selected.node) {
        if (!answerResult.users.length) {
          // Genuine no-answer TAIL: nothing continues beneath this question.
          if (answerResult.leaves.length !== 1) return fail('fork-unresolved');
          path.push(chatAtlasFreeze({
            order: path.length + 1,
            qId: nextQId,
            turnId: `turn:${nextQId}`,
            primaryAId: null,
            answerVariants: [],
            noAnswer: true,
            stopped: answerResult.stopped === true,
            provenance: 'graph-descent',
            confirmedByNativeEvidence: false,
          }));
          tailNodeId = answerResult.leaves[0].nodeId;
          break;
        }
        // No-answer MID-turn: the question got no product answer, but the
        // branch genuinely continues beneath it (an empty/stopped generation
        // or a consecutive user send). This was the exact spot the live
        // 39-turn branch died at its unanswered turn: failing here (the old
        // 'gap-in-path') froze authority on the outgoing branch, and every
        // partial 20/21 settle followed. Push the no-answer turn and keep
        // walking from the continuation question.
        if (answerResult.leaves.length) return fail('fork-unresolved');
        const continuation = chooseGraphCandidate(answerResult.users, questionNode, 'no-answer-continuation');
        if (!continuation) return fail('fork-unresolved');
        path.push(chatAtlasFreeze({
          order: path.length + 1,
          qId: nextQId,
          turnId: `turn:${nextQId}`,
          primaryAId: null,
          answerVariants: [],
          noAnswer: true,
          stopped: answerResult.stopped === true,
          provenance: 'graph-descent',
          confirmedByNativeEvidence: false,
        }));
        tailNodeId = questionNode.nodeId;
        pendingQuestion = continuation;
        continue;
      }
      const selectedBranchRoot = questionBranchRoot(questionNode, selected.node);
      const primaryNode = selectedBranchRoot?.branchShellAlias === true
        ? selectedBranchRoot
        : selected.node;
      const primaryAId = primaryNode.messageId;
      const answerVariants = answerResult.answerIdentities.slice();
      if (!answerVariants.includes(primaryAId)) answerVariants.push(primaryAId);
      if (answerVariants[answerVariants.length - 1] !== primaryAId) {
        answerVariants.splice(answerVariants.indexOf(primaryAId), 1);
        answerVariants.push(primaryAId);
      }
      path.push(chatAtlasFreeze({
        order: path.length + 1,
        qId: nextQId,
        turnId: `turn:${nextQId}`,
        primaryAId,
        answerVariants,
        noAnswer: false,
        stopped: primaryNode.stopped === true,
        provenance: 'graph-descent',
        confirmedByNativeEvidence: selected.confirmed,
      }));
      const continuation = chooseContinuationQuestion(
        questionNode,
        selected,
        answerResult.users,
      );
      if (continuation.ambiguous) return fail('fork-unresolved');
      selectedNode = selected.node;
      tailNodeId = selectedNode.nodeId;
      if (continuation.node) pendingQuestion = continuation.node;
    }
    if (
      path.length > 512
      || path.some((turn, index) => turn.order !== index + 1)
      || new Set(path.map((turn) => turn.qId)).size !== path.length
    ) return fail(path.length > 512 ? 'derivation-bounds-exceeded' : 'duplicate-qid');
    // Exact whole-path parity against the client chain: identical count,
    // per-turn question identity across the route, per-turn answer identity
    // from the anchor down, and the same terminal. Any divergence fails closed
    // with its own reason rather than publishing a guessed route.
    if (clientTail) {
      const chainTurns = clientTail.chainTurns;
      if (path.length !== chainTurns.length) return fail('client-chain-path-mismatch');
      for (let index = 0; index < path.length; index += 1) {
        if (
          chatAtlasCompleteIndexIdentity(path[index]?.qId)
          !== chatAtlasCompleteIndexIdentity(chainTurns[index]?.qId)
        ) return fail('client-chain-path-mismatch');
        if (
          index >= anchorOrder - 1
          && chatAtlasCompleteIndexIdentity(path[index]?.primaryAId)
            !== chatAtlasCompleteIndexIdentity(chainTurns[index]?.primaryAId)
        ) return fail('client-chain-path-mismatch');
      }
      if (tailNodeId !== clientTail.tailNodeId) return fail('client-chain-path-mismatch');
    }
    const pathFingerprint = chatAtlasCompleteIndexFingerprint(path);
    const diagnosticTurns = path.map((turn) => {
      const questionNodes = graph.nodes.filter((node) => (
        node.productUser === true && node.messageId === turn.qId
      ));
      const answerNodes = turn.primaryAId == null
        ? []
        : graph.nodes.filter((node) => (
          node.productAnswer === true && node.messageId === turn.primaryAId
        ));
      const questionNode = questionNodes.length === 1 ? questionNodes[0] : null;
      const answerNode = answerNodes.length === 1 ? answerNodes[0] : null;
      return Object.freeze({
        order: turn.order,
        qId: turn.qId,
        primaryAId: turn.primaryAId,
        noAnswer: turn.noAnswer,
        questionNodeId: questionNode?.nodeId || null,
        questionParentId: questionNode?.parentId || null,
        questionChildIds: Object.freeze(Array.from(questionNode?.childIds || [])),
        answerNodeId: answerNode?.nodeId || null,
        answerParentId: answerNode?.parentId || null,
        answerChildIds: Object.freeze(Array.from(answerNode?.childIds || [])),
        questionRole: questionNode?.role || null,
        answerRole: answerNode?.role || null,
        decision: turn.noAnswer ? 'emit-no-answer-and-continue' : 'emit-exact-product-answer',
      });
    });
    selectedPathAcquisitionState.lastDerivationDiagnostics = chatAtlasFreeze({
      ok: true,
      reason: null,
      pathLength: path.length,
      fingerprint: pathFingerprint,
      tailNodeId,
      graphCurrentNodeId: chatAtlasCompleteIndexIdentity(graph?.currentNode) || null,
      graphNodeCount: Number(graph?.nodeCount || 0),
      fork: lastForkDiagnostics,
      turns: Object.freeze(diagnosticTurns),
    });
    const proof = chatAtlasFreeze({
      anchorQId: qId,
      anchorSelectedAId: selectedAnswerId,
      rootNodeId,
      tailNodeId,
      pathLength: path.length,
      canonicalPrefixLength: anchorOrder,
      canonicalFingerprint: String(canonical?.sourceFingerprint || ''),
      graphCapturedAt: String(graph?.capturedAt || ''),
      token: String(intent?.token || ''),
      chatId: String(intent?.chatId || ''),
      routeKey: String(intent?.routeKey || ''),
      generation: Number(intent?.generation || 0),
      staleRevision: Number(intent?.staleRevision || 0),
      reason: 'selected-path-proven',
      source: 'host-identity-graph',
    });
    return { ok: true, path: chatAtlasFreeze(path), proof };
  }

  function chatAtlasSelectedPathProofValid(candidate) {
    const proof = candidate?.proof;
    const path = candidate?.path;
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const index = completeTurnIndexAuthorityState.index;
    const staleQId = String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '');
    const proofAnchorCurrent = proof?.anchorQId === staleQId
      || chatAtlasQuestionEditSiblingProof(
        selectedPathAcquisitionState.graph?.identityGraph,
        staleQId,
        proof?.anchorQId,
      );
    if (
      !proof
      || !Array.isArray(path)
      || !path.length
      || !intent
      || proof.token !== intent.token
      || proof.chatId !== completeTurnIndexAuthorityState.chatId
      || proof.routeKey !== completeTurnIndexAuthorityState.routeKey
      || proof.generation !== Number(completeTurnIndexAuthorityState.generation || 0)
      || proof.staleRevision !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || !proofAnchorCurrent
      || proof.canonicalFingerprint !== String(index?.sourceFingerprint || '')
      || proof.pathLength !== path.length
      || path.some((turn, indexValue) => Number(turn?.order) !== indexValue + 1)
      || new Set(path.map((turn) => turn?.qId)).size !== path.length
    ) return false;
    return completeTurnIndexAuthorityState.branchSelectionStale === true;
  }

  async function chatAtlasSelectedPathRefetch(intent) {
    const token = String(intent?.token || '');
    if (!token || selectedPathAcquisitionState.refetchAttemptedForToken === token) {
      return chatAtlasSelectedPathFail(
        'anchor-not-in-graph',
        intent,
        selectedPathAcquisitionState.anchorSelectedAId,
      );
    }
    selectedPathAcquisitionState.refetchAttemptedForToken = token;
    selectedPathAcquisitionState.status = 'inactive';
    selectedPathAcquisitionState.reason = 'identity-graph-refetch-pending';
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') {
      return chatAtlasSelectedPathFail(
        'anchor-not-in-graph',
        intent,
        selectedPathAcquisitionState.anchorSelectedAId,
      );
    }
    selectedPathAcquisitionState.refetchActiveForToken = token;
    chatAtlasBranchTransactionTrace('refetch-start', { token });
    try {
      let result = null;
      try {
        // The provider's ambient 12s budget aborts mid-body on a conversation
        // this large; the archive engine swallows that abort while parsing and
        // reports 'mapping-invalid', so the one bounded refetch is spent
        // without ever obtaining fresh current_node evidence. This is the
        // single trusted, user-initiated, once-per-selection request in the
        // system, so it is the one call entitled to wait longer than ambient.
        // Scoped deliberately to this call: TURN_INDEX_FETCH_TIMEOUT_MS and
        // every other consumer's budget stay untouched.
        result = await provider(intent.chatId, {
          includeIdentityGraph: true,
          timeoutMs: 30000,
        });
      } catch {}
      const currentIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      const scopeCurrent = currentIntent?.token === token
        && currentIntent?.qId === intent.qId
        && completeTurnIndexAuthorityState.branchSelectionStale === true
        && Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0) === Number(intent.staleRevision || 0)
        && completeTurnIndexAuthorityState.chatId === intent.chatId
        && completeTurnIndexAuthorityState.routeKey === intent.routeKey
        && Number(completeTurnIndexAuthorityState.generation || 0) === Number(intent.generation || 0);
      if (!scopeCurrent) {
        return chatAtlasClearSelectedPathAcquisition('identity-graph-refetch-scope-drift');
      }
      const retainedCurrentGraph = chatAtlasRetainIdentityGraph(result, {
        chatId: intent.chatId,
        routeKey: intent.routeKey,
        generation: intent.generation,
      });
      if (retainedCurrentGraph) {
        const localPublication = chatAtlasTryPublishRetainedBranchTransaction(
          'selected-path-graph-refetch',
        );
        if (localPublication?.published === true) return getSelectedPathAcquisitionStatus();
      }
      const retained = selectedPathAcquisitionState.graph;
      if (
        !retained
        || !chatAtlasSelectedPathGraphAnchorNode(
          retained.identityGraph,
          selectedPathAcquisitionState.anchorSelectedAId,
        )
      ) {
        return chatAtlasSelectedPathFail(
          'anchor-not-in-graph',
          intent,
          selectedPathAcquisitionState.anchorSelectedAId,
        );
      }
      return chatAtlasSelectedPathEvaluate(chatAtlasCoreLedgerMembers());
    } finally {
      if (selectedPathAcquisitionState.refetchActiveForToken === token) {
        selectedPathAcquisitionState.refetchActiveForToken = null;
      }
    }
  }

  // A trusted selection whose branch transaction has already PUBLISHED is a
  // completed selection. Re-deriving it from live DOM evidence afterwards can
  // only produce a contradiction — the native DOM has by then settled onto the
  // new branch, so the anchor's answer legitimately equals the intent's prior
  // answer and the derivation reports 'selected-answer-not-changed' for a
  // selection that in fact succeeded. The published transaction is the
  // authority for its own token; this returns the outcome it already recorded.
  function chatAtlasSelectedPathPublishedForToken(token) {
    const wanted = String(token || '');
    if (!wanted) return false;
    const transaction = completeTurnIndexAuthorityState.branchTransactionState;
    if (transaction?.state !== 'published') return false;
    if (String(transaction.token || '') !== wanted) return false;
    if (String(selectedPathAcquisitionState.token || '') !== wanted) return false;
    // The published-path evidence is the PUBLICATION DECISION itself. Keying
    // on an active overlay was circular: chatAtlasSelectedPathOverlayEvaluate
    // refuses to build a candidate while the acquisition is unproven, so the
    // overlay can never be the thing that proves the acquisition.
    const decision = selectedPathAcquisitionState.lastPublicationDecision;
    if (decision?.published !== true) return false;
    if (!(Number(decision.acceptedCount || 0) > 0)) return false;
    if (!chatAtlasCompleteIndexIdentity(decision.acceptedFingerprint)) return false;
    // The retained graph that produced it must still be the current scope.
    const retained = selectedPathAcquisitionState.graph;
    return !!retained
      && retained.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && retained.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(retained.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0);
  }

  // A published selection owns its acquisition record for the lifetime of that
  // publication. Every demotion path in the evaluator — the
  // 'trusted-intent-unavailable' clear as well as the later
  // 'selected-answer-not-changed' derivation — is gated behind this, BEFORE any
  // of them can mutate state. The token comes from the ACQUISITION, not the
  // intent: the intent legitimately disappears once the selection completes,
  // and its disappearance must not erase the completed outcome.
  function chatAtlasSelectedPathHoldPublished() {
    const token = String(selectedPathAcquisitionState.token || '')
      || String(completeTurnIndexAuthorityState.trustedSelectedPathIntent?.token || '');
    if (!chatAtlasSelectedPathPublishedForToken(token)) return null;
    // No restorative mutation: the primitives can no longer damage a
    // published record, so there is nothing to repair here.
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasSelectedPathEvaluate(members = []) {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const index = completeTurnIndexAuthorityState.index;
    const held = chatAtlasSelectedPathHoldPublished();
    if (held) return held;
    if (
      completeTurnIndexAuthorityState.enabled !== true
      || !chatAtlasCompleteIndexAuthorityActive()
      || index?.proof !== 'host-payload-full-graph'
      || !intent
    ) {
      if (selectedPathAcquisitionState.token && !intent) {
        chatAtlasClearSelectedPathAcquisition('trusted-intent-unavailable', { preserveGraph: true });
      }
      return getSelectedPathAcquisitionStatus();
    }
    const currentIntent = chatAtlasCurrentTrustedNativeBranchSelection(intent.qId);
    const scopeCurrent = currentIntent?.token === intent.token
      && intent.chatId === completeTurnIndexAuthorityState.chatId
      && intent.routeKey === completeTurnIndexAuthorityState.routeKey
      && intent.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && intent.qId === completeTurnIndexAuthorityState.branchSelectionStaleQId
      && intent.staleRevision === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0);
    if (!scopeCurrent) {
      if (selectedPathAcquisitionState.token) {
        chatAtlasClearSelectedPathAcquisition('selected-path-ownership-changed', { preserveGraph: true });
      }
      return getSelectedPathAcquisitionStatus();
    }
    const retained = selectedPathAcquisitionState.graph;
    const graphCurrent = retained
      && retained.chatId === intent.chatId
      && retained.routeKey === intent.routeKey
      && retained.generation === intent.generation;
    const evidence = chatAtlasSelectedPathNativeEvidence(members);
    let resolvedAnchorQId = intent.qId;
    let anchorEvidence = evidence.get(intent.qId);
    if (!anchorEvidence) {
      const resolved = graphCurrent
        ? chatAtlasResolveQuestionEditAnchorEvidence(retained.identityGraph, evidence, intent.qId)
        : Object.freeze({ ok: false, reason: 'anchor-member-missing' });
      if (resolved.ok !== true) return chatAtlasSelectedPathFail(resolved.reason, intent);
      resolvedAnchorQId = resolved.qId;
      anchorEvidence = resolved.anchorEvidence;
    }
    if (!anchorEvidence || anchorEvidence.memberCount !== 1) {
      return chatAtlasSelectedPathFail(
        anchorEvidence ? 'anchor-member-ambiguous' : 'anchor-member-missing',
        intent,
      );
    }
    if (anchorEvidence.answerIds.size !== 1) {
      return chatAtlasSelectedPathFail('anchor-answer-ambiguous', intent);
    }
    const selectedAnswerId = Array.from(anchorEvidence.answerIds)[0];
    const canonicalMatches = index.turns.filter((turn) => turn?.qId === intent.qId);
    if (canonicalMatches.length !== 1) {
      return chatAtlasSelectedPathFail('anchor-canonical-invalid', intent, selectedAnswerId);
    }
    const canonical = canonicalMatches[0];
    const questionEditAnchorSwap = resolvedAnchorQId !== intent.qId;
    if (intent.priorAnswerId && selectedAnswerId === intent.priorAnswerId) {
      return chatAtlasSelectedPathFail('selected-answer-not-changed', intent, selectedAnswerId);
    }
    if (
      !selectedAnswerId
      || (!questionEditAnchorSwap && (
        selectedAnswerId === canonical.primaryAId
        || !canonical.answerVariants.includes(selectedAnswerId)
      ))
    ) {
      return chatAtlasSelectedPathFail(
        selectedAnswerId === canonical.primaryAId
          ? 'selected-answer-is-canonical'
          : 'anchor-answer-not-canonical-variant',
        intent,
        selectedAnswerId,
      );
    }
    const evaluationKey = JSON.stringify([
      intent.token,
      resolvedAnchorQId,
      index.sourceFingerprint,
      Number(chatAtlasCoreLedgerVersion() || 0),
      graphCurrent ? retained.captureIdentity : '',
    ]);
    if (
      selectedPathAcquisitionState.evaluationKey === evaluationKey
      && ['proven', 'failed'].includes(selectedPathAcquisitionState.status)
    ) return getSelectedPathAcquisitionStatus();
    selectedPathAcquisitionState.origin = 'manual-native-selection';
    selectedPathAcquisitionState.token = intent.token;
    selectedPathAcquisitionState.anchorQId = resolvedAnchorQId;
    selectedPathAcquisitionState.anchorSelectedAId = selectedAnswerId;
    selectedPathAcquisitionState.priorAnswerId = intent.priorAnswerId || null;
    selectedPathAcquisitionState.chatId = intent.chatId;
    selectedPathAcquisitionState.routeKey = intent.routeKey;
    selectedPathAcquisitionState.generation = intent.generation;
    selectedPathAcquisitionState.staleRevision = intent.staleRevision;
    selectedPathAcquisitionState.evaluatedLedgerVersion = Number(chatAtlasCoreLedgerVersion() || 0);
    selectedPathAcquisitionState.evaluationKey = evaluationKey;
    if (
      !graphCurrent
      || !chatAtlasSelectedPathGraphAnchorNode(retained.identityGraph, selectedAnswerId)
    ) {
      if (selectedPathAcquisitionState.refetchAttemptedForToken === intent.token) {
        return chatAtlasSelectedPathFail('anchor-not-in-graph', intent, selectedAnswerId);
      }
      void chatAtlasSelectedPathRefetch(intent);
      return getSelectedPathAcquisitionStatus();
    }
    const transaction = chatAtlasBranchTransactionCurrent();
    if (transaction?.state === 'pending' && transaction.token === intent.token) {
      transaction.graphCaptureIdentity = String(retained.captureIdentity || '');
      transaction.graphEvaluationKey = JSON.stringify([
        transaction.token,
        transaction.graphCaptureIdentity,
        selectedAnswerId,
      ]);
    }
    // Native client selected chain first. It is the only evidence that follows
    // a manual switch immediately; the graph still validates every entry.
    const clientChain = chatAtlasNativeClientSelectedChain(retained.identityGraph, selectedAnswerId);
    const clientProves = chatAtlasClientChainProvesAnchor(clientChain, selectedAnswerId);
    if (clientProves) {
      chatAtlasBranchTransactionTrace('acq-client-chain', { count: clientChain.messageIds.length });
    }
    const derived = chatAtlasDeriveSelectedPath(
      retained.identityGraph,
      Object.freeze({
        ...intent,
        qId: resolvedAnchorQId,
        capturedAnchorQId: intent.qId,
        mountedEvidence: evidence,
        clientSelectedChainClosure: clientProves ? clientChain.closure : null,
        clientSelectedChain: clientProves ? clientChain : null,
      }),
      selectedAnswerId,
    );
    if (!derived.ok) {
      // Derivation is not allowed to reach a terminal verdict against a graph
      // that is known to be pre-click for THIS trusted selection. Keep the
      // transaction open and hand off to the one bounded host refresh, then
      // re-derive against the refreshed current_node chain.
      if (
        !clientProves
        && chatAtlasSelectedPathStaleGraphEvidence(
          retained.identityGraph,
          selectedAnswerId,
          derived.reason,
        )
      ) {
        // Refresh already in flight for this exact selection: stay pending
        // rather than racing it to a failure it is about to make obsolete.
        if (selectedPathAcquisitionState.refetchActiveForToken === intent.token) {
          return getSelectedPathAcquisitionStatus();
        }
        if (selectedPathAcquisitionState.refetchAttemptedForToken !== intent.token) {
          chatAtlasBranchTransactionTrace('acq-graph-pending', { reason: derived.reason });
          selectedPathAcquisitionState.status = 'inactive';
          selectedPathAcquisitionState.reason = 'branch-transaction-graph-pending';
          void chatAtlasSelectedPathRefetch(intent);
          return getSelectedPathAcquisitionStatus();
        }
        // The one bounded refresh is spent. Refreshed evidence is the best
        // this selection will ever get, so the verdict is now genuine.
      }
      return chatAtlasSelectedPathFail(derived.reason, intent, selectedAnswerId);
    }
    if (!chatAtlasSelectedPathProofValid(derived)) {
      return chatAtlasSelectedPathFail('proof-ownership-invalid', intent, selectedAnswerId);
    }
    chatAtlasBranchTransactionTrace('acq-proven', { count: derived.path.length });
    selectedPathAcquisitionState.status = 'proven';
    selectedPathAcquisitionState.reason = 'selected-path-proven';
    selectedPathAcquisitionState.path = derived.path;
    selectedPathAcquisitionState.proof = derived.proof;
    selectedPathAcquisitionState.provenAt = new Date().toISOString();
    if (typeof chatAtlasSelectedPathOverlayEvaluate === 'function') {
      chatAtlasSelectedPathOverlayEvaluate();
    }
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasBranchSelectionStaleCheckpoint() {
    if (completeTurnIndexAuthorityState.branchSelectionStale !== true) return null;
    const qId = String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '');
    const primaryAId = String(getRecordByQIdInternal(qId)?.primaryAId || '');
    return Object.freeze({
      revision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
      qId,
      primaryAId,
      chatId: String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || ''),
      generation: Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0),
    });
  }

  function chatAtlasBranchSelectionStaleReconciled(checkpoint) {
    const qId = normalizeTurnAlias(checkpoint?.qId || '');
    const priorPrimaryAId = normalizeTurnAlias(checkpoint?.primaryAId || '');
    if (!qId || !priorPrimaryAId) return false;
    const record = getRecordByQIdInternal(qId);
    const recordQId = normalizeTurnAlias(record?.qId || '');
    const refreshedPrimaryAId = normalizeTurnAlias(record?.primaryAId || '');
    return recordQId === qId
      && !!refreshedPrimaryAId
      && refreshedPrimaryAId !== priorPrimaryAId;
  }

  const CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS = 8000;

  const CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS = Object.freeze([
    250,
    750,
    1750,
  ]);

  function chatAtlasBranchExpansionRequiredPageNums(priorCountRaw, targetCountRaw) {
    const priorCount = Math.max(0, Number(priorCountRaw || 0) || 0);
    const targetCount = Math.max(0, Number(targetCountRaw || 0) || 0);
    const priorPageCount = priorCount > 0 ? Math.ceil(priorCount / CHAT_ATLAS_PAGE_SIZE) : 0;
    const targetPageCount = targetCount > 0 ? Math.ceil(targetCount / CHAT_ATLAS_PAGE_SIZE) : 0;
    const pages = [];
    for (let pageNum = priorPageCount + 1; pageNum <= targetPageCount; pageNum += 1) {
      pages.push(pageNum);
    }
    return Object.freeze(pages);
  }

  function chatAtlasBranchReturnPathMembers(path = []) {
    if (!Array.isArray(path) || !path.length) return Object.freeze([]);
    return Object.freeze(path.map((turn) => Object.freeze({
      order: Number(turn?.order || 0),
      qId: chatAtlasCompleteIndexIdentity(turn?.qId),
      primaryAId: turn?.primaryAId == null
        ? null
        : chatAtlasCompleteIndexIdentity(turn.primaryAId),
      noAnswer: turn?.noAnswer === true,
    })));
  }

  function chatAtlasBranchReturnPathIdentity(members = []) {
    if (!Array.isArray(members) || !members.length) return '';
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(members.map((turn) => [
      Number(turn?.order || 0),
      String(turn?.qId || ''),
      turn?.primaryAId == null ? null : String(turn.primaryAId || ''),
      turn?.noAnswer === true,
    ])))}`;
  }

  function chatAtlasCaptureBranchReturnCandidate(context = {}, priorIndex = null) {
    const invalid = (reason, detail = {}) => Object.freeze({
      classification: 'invalid',
      reason: chatAtlasCompleteIndexCode(reason, 'capture-candidate-invalid', 64),
      targetVariantAnswerId: String(detail.targetVariantAnswerId || ''),
      graphCaptureIdentity: String(detail.graphCaptureIdentity || ''),
      graphCapturedAt: String(detail.graphCapturedAt || ''),
      derivedTargetCount: 0,
      derivedPathIdentity: '',
      derivedPathMembers: Object.freeze([]),
      priorPresentationSource: String(context?.priorPresentationSource || ''),
    });
    const qId = chatAtlasCompleteIndexIdentity(context?.qId);
    const priorAnswerId = chatAtlasCompleteIndexIdentity(context?.priorAnswerId);
    const direction = String(context?.direction || '');
    // A trusted click whose exact native sibling order is not yet provable is
    // NOT a failed capture. The click itself — qId, prior answer, direction and
    // the trusted transaction scope — is fully proven; only the identity of the
    // answer the pager moved to is still unknown, and it is resolved exactly
    // once at the retained-graph publication handoff. Nothing is ever guessed
    // from turn.answerVariants, which is presentation-ordered and moves
    // primaryAId last, so index ±1 on it is not a pager position at all.
    const deferred = (reason) => Object.freeze({
      classification: 'pending',
      reason: chatAtlasCompleteIndexCode(reason, 'capture-return-target-pending', 64),
      qId,
      priorAnswerId,
      direction,
      targetResolved: false,
      targetVariantAnswerId: '',
      graphCaptureIdentity: '',
      graphCapturedAt: '',
      derivedTargetCount: 0,
      derivedPathIdentity: '',
      derivedPathMembers: Object.freeze([]),
      priorPresentationSource: String(context?.priorPresentationSource || ''),
    });
    const turns = Array.isArray(priorIndex?.turns) ? priorIndex.turns : [];
    const priorCount = Number(context?.priorEffectiveCount || 0);
    const priorFingerprint = String(context?.priorEffectiveFingerprint || '');
    if (!qId || !priorAnswerId || !['previous', 'next'].includes(direction)) {
      return invalid(!['previous', 'next'].includes(direction)
        ? 'capture-direction-invalid'
        : 'capture-anchor-invalid');
    }
    if (
      !Number.isInteger(priorCount)
      || priorCount < 1
      || turns.length !== priorCount
      || !priorFingerprint
      || String(priorIndex?.sourceFingerprint || '') !== priorFingerprint
      || chatAtlasCompleteIndexFingerprint(turns) !== priorFingerprint
    ) return invalid('capture-prior-presentation-invalid');
    const anchors = turns.filter((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === qId);
    if (anchors.length !== 1 || !Array.isArray(anchors[0]?.answerVariants)) {
      return invalid(anchors.length > 1 ? 'capture-anchor-ambiguous' : 'capture-anchor-invalid');
    }
    const variants = anchors[0].answerVariants.map(chatAtlasCompleteIndexIdentity);
    if (
      variants.some((answerId) => !answerId)
      || new Set(variants).size !== variants.length
    ) return invalid('capture-answer-variants-malformed');
    const priorMatches = variants.reduce(
      (count, answerId) => count + (answerId === priorAnswerId ? 1 : 0),
      0,
    );
    if (priorMatches !== 1) {
      return invalid(priorMatches > 1
        ? 'capture-prior-answer-ambiguous'
        : 'capture-prior-answer-absent');
    }
    // Retained-graph scope is the trustworthiness gate for native sibling
    // order, so it is proven BEFORE any adjacency is attempted. The two
    // outcomes are deliberately different: a retained graph that is simply
    // ABSENT is deferrable evidence unavailability, while a retained graph
    // that exists but is out of scope or invalid is a containment failure and
    // stays terminal — it must never gain return ownership.
    const retained = selectedPathAcquisitionState.graph;
    const graph = retained?.identityGraph || null;
    if (!retained || !Array.isArray(graph?.nodes) || !graph.nodes.length) {
      return deferred('capture-native-order-deferred');
    }
    const graphCaptureIdentity = String(retained.captureIdentity || '');
    if (
      !graphCaptureIdentity
      || retained.chatId !== String(context?.chatId || '')
      || retained.routeKey !== String(context?.routeKey || '')
      || Number(retained.generation || 0) !== Number(context?.generation || 0)
      || !chatAtlasIdentityGraphValid(graph, context?.chatId)
    ) return invalid('capture-graph-scope-invalid');
    // Adjacency is resolved against the host's NATIVE sibling order, never
    // against the presentation-ordered variant list above. The checks on
    // `variants` remain as the canonical well-formedness precondition.
    const resolvedTarget = chatAtlasResolveNativeReturnTarget(
      graph,
      qId,
      priorAnswerId,
      direction,
    );
    if (resolvedTarget.ok !== true) return invalid(resolvedTarget.reason);
    const targetVariantAnswerId = resolvedTarget.targetVariantAnswerId;
    const canonical = chatAtlasCanonicalPresentationIndex();
    if (
      !canonical
      || canonical.turns.length !== priorCount
      || String(canonical.sourceFingerprint || '') !== priorFingerprint
    ) return invalid('capture-prior-authority-mismatch', {
      targetVariantAnswerId,
      graphCaptureIdentity,
      graphCapturedAt: graph?.capturedAt,
    });
    const derived = chatAtlasDeriveSelectedPath(
      graph,
      Object.freeze({
        token: String(context?.token || ''),
        qId,
        chatId: String(context?.chatId || ''),
        routeKey: String(context?.routeKey || ''),
        generation: Number(context?.generation || 0),
        staleRevision: Number(context?.staleRevision || 0),
      }),
      targetVariantAnswerId,
    );
    if (!derived?.ok) return invalid(`capture-${derived?.reason || 'derivation-failed'}`, {
      targetVariantAnswerId,
      graphCaptureIdentity,
      graphCapturedAt: graph?.capturedAt,
    });
    const derivedPathMembers = chatAtlasBranchReturnPathMembers(derived.path);
    const derivedPathIdentity = chatAtlasBranchReturnPathIdentity(derivedPathMembers);
    const derivedTargetCount = derivedPathMembers.length;
    const expanding = derivedTargetCount > priorCount;
    return Object.freeze({
      classification: expanding ? 'expanding' : 'not-expanding',
      reason: expanding
        ? 'graph-derived-expanding-return'
        : (derivedTargetCount === priorCount
          ? 'graph-derived-equal-return'
          : 'graph-derived-contracting-return'),
      targetVariantAnswerId,
      graphCaptureIdentity,
      graphCapturedAt: String(graph?.capturedAt || ''),
      derivedTargetCount,
      derivedPathIdentity,
      derivedPathMembers,
      priorPresentationSource: String(context?.priorPresentationSource || ''),
    });
  }

  function chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate, options = {}) {
    const route = chatAtlasFullIndexRoute();
    const retained = selectedPathAcquisitionState.graph;
    const effective = getEffectivePresentationIndex();
    const priorCount = Number(intent?.priorEffectiveCount || 0);
    const priorFingerprint = String(intent?.priorEffectiveFingerprint || '');
    const effectiveFingerprint = String(effective?.sourceFingerprint || '');
    const pathMembers = candidate?.derivedPathMembers;
    const effectivePriorCurrent = Array.isArray(effective?.turns)
      && effective.turns.length === priorCount
      && effectiveFingerprint === priorFingerprint
      && chatAtlasCompleteIndexFingerprint(effective.turns) === priorFingerprint;
    const retainedOverlayCurrent = selectedPathOverlayState.status === 'active'
      && selectedPathOverlayState.token === String(intent?.token || '')
      && selectedPathOverlayState.anchorQId === String(intent?.qId || '')
      && selectedPathOverlayState.chatId === String(intent?.chatId || '')
      && selectedPathOverlayState.routeKey === String(intent?.routeKey || '')
      && Number(selectedPathOverlayState.generation || 0) === Number(intent?.generation || 0)
      && Number(selectedPathOverlayState.staleRevision || 0) === Number(intent?.staleRevision || 0)
      && Array.isArray(selectedPathOverlayState.index?.turns)
      && selectedPathOverlayState.index.turns.length === priorCount
      && String(selectedPathOverlayState.index?.sourceFingerprint || '') === priorFingerprint
      && chatAtlasCompleteIndexFingerprint(selectedPathOverlayState.index.turns) === priorFingerprint;
    return candidate?.classification === 'expanding'
      && !!chatAtlasCompleteIndexIdentity(candidate?.targetVariantAnswerId)
      && !!String(candidate?.graphCaptureIdentity || '')
      && Number(candidate?.derivedTargetCount || 0) > priorCount
      && Array.isArray(pathMembers)
      && pathMembers.length === Number(candidate?.derivedTargetCount || 0)
      && String(candidate?.derivedPathIdentity || '')
        === chatAtlasBranchReturnPathIdentity(pathMembers)
      && intent?.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && intent?.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(intent?.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0)
      && Number(intent?.staleRevision || 0)
        === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      && intent?.qId === String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      && intent?.chatId === String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      && intent?.routeKey === String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      && Number(intent?.generation || 0)
        === Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
      && intent?.chatId === String(route?.chatId || '')
      && intent?.routeKey === String(route?.routeKey || '')
      && Number.isInteger(priorCount)
      && priorCount > 0
      && !!priorFingerprint
      && (effectivePriorCurrent || (options.allowTargetArrival === true && (
        retainedOverlayCurrent
        || ['selected-path-overlay', 'retained-selected-path-graph']
          .includes(String(candidate?.priorPresentationSource || ''))
      )))
      && retained?.chatId === intent?.chatId
      && retained?.routeKey === intent?.routeKey
      && Number(retained?.generation || 0) === Number(intent?.generation || 0)
      && String(retained?.captureIdentity || '') === String(candidate?.graphCaptureIdentity || '')
      && chatAtlasIdentityGraphValid(retained?.identityGraph, intent?.chatId);
  }

  function chatAtlasPreExpansionCanonicalReturnWindow(intentRaw = null) {
    const intent = intentRaw || completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const token = String(intent?.token || '');
    const qId = chatAtlasCompleteIndexIdentity(intent?.qId);
    const priorCount = Number(intent?.priorEffectiveCount || 0);
    const priorFingerprint = String(intent?.priorEffectiveFingerprint || '');
    const candidate = intent?.returnTargetCandidate || null;
    const active = !!intent
      && completeTurnIndexAuthorityState.trustedSelectedPathIntent === intent
      && completeTurnIndexAuthorityState.enabled === true
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && !!token
      && !!qId
      && chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate);
    return Object.freeze({
      active,
      token: active ? token : '',
      qId: active ? qId : '',
      chatId: active ? intent.chatId : '',
      routeKey: active ? intent.routeKey : '',
      generation: active ? Number(intent.generation || 0) : 0,
      staleRevision: active ? Number(intent.staleRevision || 0) : 0,
      priorCount: active ? priorCount : 0,
      priorFingerprint: active ? priorFingerprint : '',
      targetVariantAnswerId: active ? String(candidate.targetVariantAnswerId || '') : '',
      graphCaptureIdentity: active ? String(candidate.graphCaptureIdentity || '') : '',
      graphCapturedAt: active ? String(candidate.graphCapturedAt || '') : '',
      graphDerivedTargetCount: active ? Number(candidate.derivedTargetCount || 0) : 0,
      graphDerivedPathIdentity: active ? String(candidate.derivedPathIdentity || '') : '',
      graphDerivedPathMembers: active
        ? candidate.derivedPathMembers
        : Object.freeze([]),
    });
  }

  function chatAtlasRealBranchExpansionTargetValidation(intent, targetIndex, candidateRaw = null) {
    const fail = (reason, detail = {}) => Object.freeze({
      ok: false,
      reason: chatAtlasCompleteIndexCode(reason, 'branch-return-target-invalid', 64),
      targetAvailable: detail.targetAvailable === true,
      targetCount: Number(detail.targetCount || 0),
      targetFingerprint: String(detail.targetFingerprint || ''),
      requiredPageNums: Object.freeze(Array.from(detail.requiredPageNums || [])),
    });
    const candidate = candidateRaw || intent?.returnTargetCandidate || null;
    if (!chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate, { allowTargetArrival: true })) {
      return fail('branch-return-candidate-stale');
    }
    const turns = Array.isArray(targetIndex?.turns) ? targetIndex.turns : [];
    const priorCount = Number(intent?.priorEffectiveCount || 0);
    const targetCount = turns.length;
    const targetFingerprint = String(targetIndex?.sourceFingerprint || '');
    const targetAvailable = targetIndex?.complete === true
      && targetIndex?.proof === 'host-payload-full-graph'
      && targetCount > priorCount
      && !!targetFingerprint
      && chatAtlasCompleteIndexFingerprint(turns) === targetFingerprint;
    if (!targetAvailable) return fail('branch-return-target-unavailable');
    const targetDetail = {
      targetAvailable: true,
      targetCount,
      targetFingerprint,
      requiredPageNums: chatAtlasBranchExpansionRequiredPageNums(priorCount, targetCount),
    };
    if (chatAtlasCompleteIndexIdentity(targetIndex?.chatId) !== chatAtlasCompleteIndexIdentity(intent?.chatId)) {
      return fail('branch-return-target-chat-mismatch', targetDetail);
    }
    const anchors = turns.filter((turn) => (
      chatAtlasCompleteIndexIdentity(turn?.qId) === chatAtlasCompleteIndexIdentity(intent?.qId)
    ));
    if (
      anchors.length !== 1
      || chatAtlasCompleteIndexIdentity(anchors[0]?.primaryAId)
        !== chatAtlasCompleteIndexIdentity(candidate?.targetVariantAnswerId)
    ) return fail('branch-return-target-answer-mismatch', targetDetail);
    const targetMembers = chatAtlasBranchReturnPathMembers(turns);
    if (
      targetMembers.length !== Number(candidate?.derivedTargetCount || 0)
      || chatAtlasBranchReturnPathIdentity(targetMembers)
        !== String(candidate?.derivedPathIdentity || '')
    ) return fail('branch-return-target-path-mismatch', targetDetail);
    return Object.freeze({
      ok: true,
      reason: 'branch-return-target-proven',
      targetAvailable: true,
      targetCount,
      targetFingerprint,
      requiredPageNums: targetDetail.requiredPageNums,
    });
  }

  function chatAtlasBranchExpansionFailureRecord(scope, reasonRaw, retainsSelectedPathOverlay = false) {
    const reason = chatAtlasCompleteIndexCode(reasonRaw, 'fail-closed', 64);
    const targetResolved = scope?.targetResolved !== false;
    const graphDerivedPathMembers = chatAtlasBranchReturnPathMembers(
      scope?.graphDerivedPathMembers || [],
    );
    return Object.freeze({
      key: String(scope?.key || ''),
      token: String(scope?.token || ''),
      qId: String(scope?.qId || ''),
      chatId: String(scope?.chatId || ''),
      routeKey: String(scope?.routeKey || ''),
      generation: Number(scope?.generation || 0),
      staleRevision: Number(scope?.staleRevision || 0),
      priorCount: Number(scope?.priorCount || 0),
      priorFingerprint: String(scope?.priorFingerprint || ''),
      targetResolved,
      targetCount: targetResolved ? Number(scope?.targetCount || 0) : 0,
      expectedFingerprint: targetResolved
        ? String(scope?.expectedFingerprint || scope?.targetFingerprint || '')
        : '',
      requiredPageNums: targetResolved
        ? Object.freeze(Array.from(scope?.requiredPageNums || []))
        : Object.freeze([]),
      graphCaptureIdentity: String(scope?.graphCaptureIdentity || ''),
      targetVariantAnswerId: String(scope?.targetVariantAnswerId || ''),
      graphDerivedTargetCount: Number(scope?.graphDerivedTargetCount || 0),
      graphDerivedPathIdentity: String(scope?.graphDerivedPathIdentity || ''),
      graphDerivedPathMembers,
      retainsSelectedPathOverlay: retainsSelectedPathOverlay === true,
      reason,
      completedAt: Date.now(),
    });
  }

  function chatAtlasClearBranchExpansionTimers() {
    if (completeTurnIndexAuthorityState.branchExpansionTimeoutTask != null) {
      try { (W.clearTimeout || clearTimeout)(completeTurnIndexAuthorityState.branchExpansionTimeoutTask); } catch {}
      completeTurnIndexAuthorityState.branchExpansionTimeoutTask = null;
    }
    if (completeTurnIndexAuthorityState.branchExpansionRetryTask != null) {
      try { (W.clearTimeout || clearTimeout)(completeTurnIndexAuthorityState.branchExpansionRetryTask); } catch {}
      completeTurnIndexAuthorityState.branchExpansionRetryTask = null;
    }
  }

  function chatAtlasResetBranchExpansionLifecycle(reason = 'expansion-reset') {
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionLease = null;
    completeTurnIndexAuthorityState.branchExpansionFailure = null;
    completeTurnIndexAuthorityState.branchExpansionState = 'idle';
    completeTurnIndexAuthorityState.branchExpansionReason = chatAtlasCompleteIndexCode(reason, 'expansion-reset', 64);
    completeTurnIndexAuthorityState.branchExpansionAnchorReturned = false;
    completeTurnIndexAuthorityState.branchExpansionPriorCount = 0;
    completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = '';
    completeTurnIndexAuthorityState.branchExpansionTargetCount = 0;
    completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = '';
    completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = Object.freeze([]);
  }

  function chatAtlasBranchExpansionLeaseCurrent(leaseRaw = null, options = {}) {
    const lease = leaseRaw || completeTurnIndexAuthorityState.branchExpansionLease;
    if (!lease || completeTurnIndexAuthorityState.branchExpansionLease !== lease) return false;
    const route = chatAtlasFullIndexRoute();
    return completeTurnIndexAuthorityState.branchExpansionState === 'pending'
      && lease.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && lease.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && lease.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && lease.staleRevision === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      && lease.chatId === String(route?.chatId || '')
      && lease.routeKey === String(route?.routeKey || '')
      && (options.allowExpired === true || Date.now() <= Number(lease.deadlineAt || 0));
  }

  function chatAtlasClearTrustedIntentForExpansion(reason, token = '') {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent || (token && intent.token !== token)) return false;
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
    chatAtlasCancelTrustedNativeBranchReconcile();
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(reason, { preserveGraph: true });
    }
    chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
      reason,
      qId: intent.qId,
      token: intent.token,
    });
    return true;
  }

  function chatAtlasFailClosedPreExpansionReturn(intent, windowState, reasonRaw = '', options = {}) {
    let currentWindow = chatAtlasPreExpansionCanonicalReturnWindow(intent);
    const candidate = intent?.returnTargetCandidate || null;
    if (
      currentWindow.active !== true
      && options.allowTargetArrival === true
      && chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate, { allowTargetArrival: true })
    ) {
      currentWindow = Object.freeze({
        active: true,
        token: String(intent?.token || ''),
        qId: chatAtlasCompleteIndexIdentity(intent?.qId),
        chatId: String(intent?.chatId || ''),
        routeKey: String(intent?.routeKey || ''),
        generation: Number(intent?.generation || 0),
        staleRevision: Number(intent?.staleRevision || 0),
        priorCount: Number(intent?.priorEffectiveCount || 0),
        priorFingerprint: String(intent?.priorEffectiveFingerprint || ''),
        targetVariantAnswerId: String(candidate?.targetVariantAnswerId || ''),
        graphCaptureIdentity: String(candidate?.graphCaptureIdentity || ''),
        graphCapturedAt: String(candidate?.graphCapturedAt || ''),
        graphDerivedTargetCount: Number(candidate?.derivedTargetCount || 0),
        graphDerivedPathIdentity: String(candidate?.derivedPathIdentity || ''),
        graphDerivedPathMembers: candidate?.derivedPathMembers || Object.freeze([]),
      });
    }
    const expectedWindow = windowState?.active === true ? windowState : currentWindow;
    if (
      currentWindow.active !== true
      || expectedWindow?.active !== true
      || currentWindow.token !== expectedWindow.token
      || currentWindow.qId !== expectedWindow.qId
      || currentWindow.staleRevision !== Number(expectedWindow.staleRevision || 0)
      || currentWindow.priorFingerprint !== String(expectedWindow.priorFingerprint || '')
      || currentWindow.graphCaptureIdentity !== String(expectedWindow.graphCaptureIdentity || '')
      || currentWindow.targetVariantAnswerId !== String(expectedWindow.targetVariantAnswerId || '')
      || currentWindow.graphDerivedPathIdentity !== String(expectedWindow.graphDerivedPathIdentity || '')
      || completeTurnIndexAuthorityState.branchExpansionLease
    ) return false;
    const targetIndex = chatAtlasCanonicalPresentationIndex();
    const realTarget = chatAtlasRealBranchExpansionTargetValidation(intent, targetIndex, candidate);
    const targetResolved = realTarget.targetAvailable === true;
    const reason = chatAtlasCompleteIndexCode(
      reasonRaw || (targetResolved
        ? (realTarget.ok
          ? 'pre-expansion-return-window-exceeded'
          : 'pre-expansion-return-target-mismatch')
        : 'pre-expansion-return-target-unresolved'),
      targetResolved
        ? 'pre-expansion-return-window-exceeded'
        : 'pre-expansion-return-target-unresolved',
      64,
    );
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionSequence += 1;
    const key = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
      currentWindow.chatId,
      currentWindow.routeKey,
      currentWindow.generation,
      currentWindow.staleRevision,
      currentWindow.token,
      currentWindow.qId,
      currentWindow.priorCount,
      currentWindow.priorFingerprint,
      currentWindow.graphCaptureIdentity,
      currentWindow.targetVariantAnswerId,
      currentWindow.graphDerivedTargetCount,
      currentWindow.graphDerivedPathIdentity,
      targetResolved ? realTarget.targetCount : null,
      targetResolved ? realTarget.targetFingerprint : null,
      completeTurnIndexAuthorityState.branchExpansionSequence,
    ]))}`;
    const failure = chatAtlasBranchExpansionFailureRecord({
      ...currentWindow,
      key,
      targetResolved,
      targetCount: targetResolved ? realTarget.targetCount : 0,
      expectedFingerprint: targetResolved ? realTarget.targetFingerprint : '',
      requiredPageNums: targetResolved ? realTarget.requiredPageNums : Object.freeze([]),
    }, reason, true);
    completeTurnIndexAuthorityState.branchExpansionLease = null;
    completeTurnIndexAuthorityState.branchExpansionState = 'fail-closed';
    completeTurnIndexAuthorityState.branchExpansionReason = reason;
    completeTurnIndexAuthorityState.branchExpansionFailure = failure;
    completeTurnIndexAuthorityState.branchExpansionAnchorReturned = false;
    completeTurnIndexAuthorityState.branchExpansionPriorCount = currentWindow.priorCount;
    completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = currentWindow.priorFingerprint;
    completeTurnIndexAuthorityState.branchExpansionTargetCount = targetResolved
      ? realTarget.targetCount
      : 0;
    completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = targetResolved
      ? realTarget.targetFingerprint
      : '';
    completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = targetResolved
      ? realTarget.requiredPageNums
      : Object.freeze([]);
    chatAtlasClearTrustedIntentForExpansion(`branch-expansion-${reason}`, currentWindow.token);
    chatAtlasTraceTrustedLifecycle('branch-expansion-fail-closed', {
      reason,
      priorCount: currentWindow.priorCount,
      targetCount: targetResolved ? realTarget.targetCount : 0,
      attempts: 0,
    });
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasBranchExpansionStaleCheckpoint(lease) {
    return Object.freeze({
      revision: Number(lease?.staleRevision || 0),
      qId: String(completeTurnIndexAuthorityState.branchSelectionStaleQId || ''),
      chatId: String(lease?.chatId || ''),
      routeKey: String(lease?.routeKey || ''),
      generation: Number(lease?.generation || 0),
    });
  }

  function chatAtlasFinishBranchExpansion(lease, outcome, reasonRaw) {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease, { allowExpired: true })) return false;
    const outcomeCode = outcome === 'confirmed' ? 'confirmed' : 'fail-closed';
    const reason = chatAtlasCompleteIndexCode(reasonRaw, outcomeCode, 64);
    const summary = chatAtlasBranchExpansionFailureRecord(lease, reason);
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionLease = null;
    completeTurnIndexAuthorityState.branchExpansionState = outcomeCode;
    chatAtlasCloseBranchTransaction(outcomeCode === 'confirmed' ? 'published' : 'fail-closed', `branch-expansion-${outcomeCode}`, String(lease.token || ''));
    completeTurnIndexAuthorityState.branchExpansionReason = reason;
    completeTurnIndexAuthorityState.branchExpansionFailure = outcomeCode === 'fail-closed' ? summary : null;
    const staleCheckpoint = chatAtlasBranchExpansionStaleCheckpoint(lease);
    chatAtlasClearBranchSelectionStale(staleCheckpoint, `branch-expansion-${reason}`, false);
    chatAtlasClearTrustedIntentForExpansion(`branch-expansion-${reason}`, lease.token);
    chatAtlasTraceTrustedLifecycle(`branch-expansion-${outcomeCode}`, {
      reason,
      priorCount: lease.priorCount,
      targetCount: lease.targetCount,
      attempts: lease.attemptCount,
    });
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasThreadPagesControllerApi() {
    const readRuntime = (runtime, source) => {
      try {
        const controller = runtime?.H2O?.ChatPageTitleIntent?.api || null;
        if (!controller) {
          return Object.freeze({ state: 'temporarily-unpublished', source, controller: null, resolve: null });
        }
        const resolve = controller?.resolveNativePageHeadCoherence;
        if (typeof resolve !== 'function') {
          return Object.freeze({ state: 'structurally-incomplete', source, controller, resolve: null });
        }
        return Object.freeze({ state: 'ready', source, controller, resolve });
      } catch {
        return Object.freeze({ state: 'runtime-access-failure', source, controller: null, resolve: null });
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || W; } catch {}
    if (topWindow === W) return readRuntime(W, 'shared');
    if (topWindow) {
      const shared = readRuntime(topWindow, 'shared');
      if (shared.state === 'ready' || shared.state === 'structurally-incomplete') return shared;
      const local = readRuntime(W, 'local');
      if (local.state === 'ready' || local.state === 'structurally-incomplete') return local;
      return shared.state === 'runtime-access-failure' ? shared : local;
    }
    const local = readRuntime(W, 'local');
    return local.state === 'temporarily-unpublished'
      ? Object.freeze({ state: 'runtime-access-failure', source: 'shared', controller: null, resolve: null })
      : local;
  }

  function chatAtlasEvaluateNativePageHeadsForExpansion(lease) {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) {
      return Object.freeze({ state: 'unavailable', reason: 'lease-stale', temporary: false, pages: Object.freeze([]) });
    }
    const lookup = chatAtlasThreadPagesControllerApi();
    if (lookup.state !== 'ready') {
      const temporary = lookup.state === 'temporarily-unpublished' || lookup.state === 'runtime-access-failure';
      return Object.freeze({
        state: 'unavailable',
        reason: lookup.state === 'runtime-access-failure'
          ? 'controller-runtime-access-failure'
          : (temporary ? 'controller-initializing' : 'controller-unavailable'),
        temporary,
        pages: Object.freeze([]),
      });
    }
    const { controller, resolve } = lookup;
    const pages = [];
    let state = 'match';
    let reason = 'all-required-page-heads-match';
    let temporary = false;
    for (const pageNum of lease.requiredPageNums) {
      let result = null;
      try {
        result = resolve.call(controller, pageNum) || null;
      } catch {
        try {
          chatAtlasTraceTrustedLifecycle('branch-expansion-controller-exception', {
            subsystem: 'thread-pages-controller',
            operation: 'resolve-native-page-head-coherence',
            phase: 'branch-expansion-confirmation',
            category: 'exception',
          });
        } catch {}
        pages.push(Object.freeze({ pageNum, state: 'unavailable' }));
        state = 'unavailable';
        reason = 'native-page-head-controller-exception';
        temporary = true;
        break;
      }
      const pageState = String(result?.state || 'unavailable');
      pages.push(Object.freeze({ pageNum, state: pageState }));
      if (pageState === 'conflict') {
        state = 'conflict';
        reason = 'native-page-head-conflict';
        break;
      }
      if (pageState === 'unavailable' && state !== 'conflict') {
        state = 'unavailable';
        reason = 'native-page-head-unavailable';
      } else if (pageState === 'absent' && state === 'match') {
        state = 'absent';
        reason = 'native-page-head-absent';
      } else if (pageState !== 'match' && !['absent', 'unavailable'].includes(pageState)) {
        state = 'unavailable';
        reason = 'native-page-head-invalid';
      }
    }
    return Object.freeze({ state, reason, temporary, pages: Object.freeze(pages) });
  }

  function chatAtlasScheduleBranchExpansionConvergence(lease, exhaustedReason = 'attempts-exhausted') {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return false;
    if (completeTurnIndexAuthorityState.branchExpansionRetryTask != null) return true;
    if (lease.attemptCount >= CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length) {
      return chatAtlasFinishBranchExpansion(lease, 'fail-closed', exhaustedReason);
    }
    const delay = CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS[lease.attemptCount];
    if ((Date.now() + delay) > lease.deadlineAt) {
      return chatAtlasFinishBranchExpansion(lease, 'fail-closed', 'timeout');
    }
    const key = lease.key;
    completeTurnIndexAuthorityState.branchExpansionRetryTask = (W.setTimeout || setTimeout)(() => {
      completeTurnIndexAuthorityState.branchExpansionRetryTask = null;
      const current = completeTurnIndexAuthorityState.branchExpansionLease;
      if (!current || current.key !== key || !chatAtlasBranchExpansionLeaseCurrent(current)) return;
      current.attemptCount += 1;
      Promise.resolve(refreshCompleteTurnIndexProjection('branch-expansion-convergence')).catch(() => {
        const latest = completeTurnIndexAuthorityState.branchExpansionLease;
        if (latest?.key === key) chatAtlasFinishBranchExpansion(latest, 'fail-closed', 'refresh-failed');
      });
    }, delay);
    return true;
  }

  function chatAtlasEnsureBranchExpansionTimeout(lease) {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return false;
    if (completeTurnIndexAuthorityState.branchExpansionTimeoutTask != null) return true;
    const key = lease.key;
    const delay = Math.max(0, Number(lease.deadlineAt || 0) - Date.now());
    completeTurnIndexAuthorityState.branchExpansionTimeoutTask = (W.setTimeout || setTimeout)(() => {
      const current = completeTurnIndexAuthorityState.branchExpansionLease;
      if (current?.key === key) {
        const timeoutReason = completeTurnIndexAuthorityState.branchExpansionReason === 'native-page-head-controller-exception'
          ? 'controller-exception-timeout'
          : 'timeout';
        chatAtlasFinishBranchExpansion(current, 'fail-closed', timeoutReason);
      }
    }, delay);
    return true;
  }

  function chatAtlasCompleteBranchExpansionCheckpoint(reason = 'expansion-checkpoint', options = {}) {
    const lease = completeTurnIndexAuthorityState.branchExpansionLease;
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return false;
    const verdict = chatAtlasEvaluateNativePageHeadsForExpansion(lease);
    completeTurnIndexAuthorityState.branchExpansionReason = verdict.reason;
    if (verdict.state === 'conflict') {
      chatAtlasFinishBranchExpansion(lease, 'fail-closed', verdict.reason);
      return true;
    }
    if (verdict.state === 'unavailable') {
      if (verdict.temporary === true) {
        chatAtlasEnsureBranchExpansionTimeout(lease);
        chatAtlasScheduleBranchExpansionConvergence(
          lease,
          verdict.reason === 'native-page-head-controller-exception'
            ? 'controller-exception-attempts-exhausted'
            : 'attempts-exhausted',
        );
        if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
      } else {
        chatAtlasFinishBranchExpansion(lease, 'fail-closed', verdict.reason);
      }
      return true;
    }
    chatAtlasEnsureBranchExpansionTimeout(lease);
    if (verdict.state === 'absent') {
      chatAtlasScheduleBranchExpansionConvergence(lease);
      if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
      return true;
    }
    if (verdict.state === 'match' && options.allowConfirmation === true) {
      chatAtlasFinishBranchExpansion(lease, 'confirmed', reason);
      return true;
    }
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasRecheckFailedBranchExpansion(reason = 'expansion-recheck') {
    const failure = completeTurnIndexAuthorityState.branchExpansionFailure;
    if (!failure || completeTurnIndexAuthorityState.branchExpansionState !== 'fail-closed') return false;
    const route = chatAtlasFullIndexRoute();
    const targetIndex = chatAtlasCanonicalPresentationIndex();
    const unresolved = failure.targetResolved === false;
    const retainedOverlayScopeCurrent = failure.retainsSelectedPathOverlay !== true || (
      completeTurnIndexAuthorityState.branchSelectionStale === true
      && failure.qId === String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      && failure.staleRevision === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      && failure.chatId === String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      && failure.routeKey === String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      && failure.generation === Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
      && (unresolved ? (
        String(selectedPathAcquisitionState.graph?.captureIdentity || '')
          === String(failure.graphCaptureIdentity || '')
        && selectedPathAcquisitionState.graph?.chatId === failure.chatId
        && selectedPathAcquisitionState.graph?.routeKey === failure.routeKey
        && Number(selectedPathAcquisitionState.graph?.generation || 0) === failure.generation
      ) : (
        failure.token === String(selectedPathOverlayState.token || '')
        && failure.qId === String(selectedPathOverlayState.anchorQId || '')
        && failure.priorFingerprint === String(selectedPathOverlayState.index?.sourceFingerprint || '')
        && chatAtlasSelectedPathOverlayCurrent()
      ))
    );
    if (
      failure.chatId !== String(completeTurnIndexAuthorityState.chatId || '')
      || failure.routeKey !== String(completeTurnIndexAuthorityState.routeKey || '')
      || failure.generation !== Number(completeTurnIndexAuthorityState.generation || 0)
      || failure.chatId !== String(route?.chatId || '')
      || failure.routeKey !== String(route?.routeKey || '')
      || !retainedOverlayScopeCurrent
    ) return false;
    if (!unresolved && (
      !Array.isArray(targetIndex?.turns)
      || targetIndex.turns.length !== Number(failure.targetCount || 0)
      || String(targetIndex?.sourceFingerprint || '') !== String(failure.expectedFingerprint || '')
    )) return false;
    const failureCandidate = unresolved ? Object.freeze({
      classification: 'expanding',
      reason: 'graph-derived-expanding-return',
      targetVariantAnswerId: failure.targetVariantAnswerId,
      graphCaptureIdentity: failure.graphCaptureIdentity,
      graphCapturedAt: '',
      derivedTargetCount: failure.graphDerivedTargetCount,
      derivedPathIdentity: failure.graphDerivedPathIdentity,
      derivedPathMembers: failure.graphDerivedPathMembers,
      priorPresentationSource: 'retained-selected-path-graph',
    }) : null;
    const intent = Object.freeze({
      token: failure.token,
      qId: failure.qId,
      chatId: failure.chatId,
      routeKey: failure.routeKey,
      generation: failure.generation,
      staleRevision: failure.staleRevision,
      priorEffectiveCount: failure.priorCount,
      priorEffectiveFingerprint: failure.priorFingerprint
        || completeTurnIndexAuthorityState.branchExpansionPriorFingerprint,
      returnTargetCandidate: failureCandidate,
    });
    if (unresolved) {
      if (
        !failure.graphCaptureIdentity
        || !failure.targetVariantAnswerId
        || Number(failure.graphDerivedTargetCount || 0) <= Number(failure.priorCount || 0)
        || !failure.graphDerivedPathIdentity
      ) return false;
      const validation = chatAtlasRealBranchExpansionTargetValidation(
        intent,
        targetIndex,
        failureCandidate,
      );
      if (!validation.ok) return false;
    }
    const lease = chatAtlasOpenBranchExpansion(intent, targetIndex);
    if (!lease) return false;
    return chatAtlasCompleteBranchExpansionCheckpoint(reason, { allowConfirmation: true });
  }

  function chatAtlasOpenBranchExpansion(intent, targetIndex) {
    const priorCount = Math.max(0, Number(intent?.priorEffectiveCount || 0) || 0);
    const targetCount = Array.isArray(targetIndex?.turns) ? targetIndex.turns.length : 0;
    if (targetCount <= priorCount) return null;
    const expectedFingerprint = String(targetIndex?.sourceFingerprint || '');
    const requiredPageNums = chatAtlasBranchExpansionRequiredPageNums(priorCount, targetCount);
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionSequence += 1;
    const openedAt = Date.now();
    const lease = {
      key: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        intent.chatId,
        intent.routeKey,
        intent.generation,
        intent.staleRevision,
        priorCount,
        targetCount,
        expectedFingerprint,
        completeTurnIndexAuthorityState.branchExpansionSequence,
      ]))}`,
      token: String(intent.token || ''),
      qId: String(intent.qId || ''),
      chatId: String(intent.chatId || ''),
      routeKey: String(intent.routeKey || ''),
      generation: Number(intent.generation || 0),
      staleRevision: Number(intent.staleRevision || 0),
      priorCount,
      priorFingerprint: String(intent.priorEffectiveFingerprint || ''),
      targetCount,
      expectedFingerprint,
      openedAt,
      deadlineAt: openedAt + CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS,
      attemptCount: 0,
      requiredPageNums,
    };
    completeTurnIndexAuthorityState.branchExpansionLease = lease;
    completeTurnIndexAuthorityState.branchExpansionFailure = null;
    completeTurnIndexAuthorityState.branchExpansionState = 'pending';
    completeTurnIndexAuthorityState.branchExpansionReason = 'anchor-returned-provisional';
    completeTurnIndexAuthorityState.branchExpansionAnchorReturned = true;
    completeTurnIndexAuthorityState.branchExpansionPriorCount = priorCount;
    completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = lease.priorFingerprint;
    completeTurnIndexAuthorityState.branchExpansionTargetCount = targetCount;
    completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = expectedFingerprint;
    completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = requiredPageNums;
    return lease;
  }

  function chatAtlasBranchExpansionRebuildSnapshot() {
    const lease = completeTurnIndexAuthorityState.branchExpansionLease;
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return null;
    return Object.freeze({
      token: lease.token,
      chatId: lease.chatId,
      routeKey: lease.routeKey,
      staleRevision: lease.staleRevision,
      priorEffectiveCount: lease.priorCount,
      priorEffectiveFingerprint: lease.priorFingerprint,
    });
  }

  // ── Branch transaction: the single owner of a native branch switch ──────
  // A trusted click opens exactly one keyed pending transaction. It — not the
  // intent's age window, not one stale boolean — owns transition containment:
  // while pending, the intent survives (so the ledger can re-derive the path
  // on every flush as scrolling mounts fork evidence) and no unmatched
  // mounted turn may extend authority. It closes only on atomic publication
  // (overlay active / canonical return / expansion confirmed), a superseding
  // capture, route/generation change, or the bounded cap — never silently.
  const CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS = 90000;

  function chatAtlasBranchTransactionTrace(code, detail = {}) {
    const trace = completeTurnIndexAuthorityState.branchTransactionTrace;
    const entry = {
      seq: (completeTurnIndexAuthorityState.branchTransactionSeq += 1),
      code: chatAtlasCompleteIndexCode(code, 'tx', 32),
      detail: chatAtlasCompleteIndexCode(String(detail?.reason ?? detail?.count ?? detail?.token ?? ''), '', 72),
    };
    const last = trace[trace.length - 1];
    if (last && last.code === entry.code && last.detail === entry.detail) return;
    trace.push(entry);
    if (trace.length > 24) trace.splice(0, trace.length - 24);
  }

  function chatAtlasBranchTransactionCurrent(options = {}) {
    const tx = completeTurnIndexAuthorityState.branchTransactionState;
    if (!tx) return null;
    if (tx.state === 'pending' && (Date.now() - Number(tx.openedAt || 0)) > CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS) {
      tx.state = 'fail-closed';
      tx.reason = 'transaction-cap';
      chatAtlasBranchTransactionTrace('tx-fail-closed', { reason: 'transaction-cap' });
      // Transaction ownership was the last reason an old trusted intent could
      // remain authoritative past its age window. Re-enter the canonical
      // evaluator at the exact terminal transition; it alone decides whether
      // live request work still owns the token and whether the matching lease
      // may be released. The suppress flag prevents recursive re-entry when
      // this transition was discovered by that evaluator itself.
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (
        options?.suppressTrustedExpiryReentry !== true
        && intent?.token
        && intent.token === tx.token
      ) chatAtlasCurrentTrustedNativeBranchSelection(intent.qId);
    }
    return tx;
  }

  function chatAtlasOpenBranchTransaction(intent) {
    if (!intent?.token) return null;
    const prior = completeTurnIndexAuthorityState.branchTransactionState;
    if (prior && prior.state === 'pending') {
      chatAtlasBranchTransactionTrace('tx-superseded', { token: prior.token });
    }
    const tx = {
      token: String(intent.token),
      qId: String(intent.qId || ''),
      chatId: String(intent.chatId || ''),
      routeKey: String(intent.routeKey || ''),
      generation: Number(intent.generation || 0),
      staleRevision: Number(intent.staleRevision || 0),
      openedAt: Date.now(),
      openFingerprint: String(completeTurnIndexAuthorityState.index?.sourceFingerprint || ''),
      graphCaptureIdentity: '',
      graphEvaluationKey: '',
      state: 'pending',
      reason: 'capture',
    };
    completeTurnIndexAuthorityState.branchTransactionState = tx;
    chatAtlasBranchTransactionTrace('tx-open', { token: tx.token });
    return tx;
  }

  function chatAtlasCloseBranchTransaction(state, reason, token = '') {
    const tx = completeTurnIndexAuthorityState.branchTransactionState;
    if (!tx) return false;
    if (token && tx.token !== token) return false;
    const nextState = state === 'published'
      ? 'published'
      : (state === 'reset' ? 'reset' : 'fail-closed');
    if (tx.state === 'published' || tx.state === 'reset') return false;
    if (tx.state === 'fail-closed' && nextState === 'fail-closed') return false;
    tx.state = nextState;
    tx.reason = chatAtlasCompleteIndexCode(reason, 'closed', 64);
    chatAtlasBranchTransactionTrace(`tx-${tx.state}`, { reason: tx.reason });
    // A publication/failure can end transaction ownership before the bounded
    // cap wakeup. Move the one existing trusted-native task to the intent's
    // age deadline (or immediately when already old); the token guard in that
    // task makes a superseded close harmless. Route reset owns its own cancel.
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (
      nextState !== 'reset'
      && intent?.token
      && intent.token === tx.token
    ) {
      // Publication may synchronously settle the coordinator lease immediately
      // after closing the transaction. Check on the next microtask so a lease
      // that is already being resolved never creates a timer just to cancel it.
      Promise.resolve().then(() => {
        const currentIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
        if (!currentIntent || currentIntent.token !== intent.token) return;
        let staleLease = false;
        try {
          const refresh = completeIndexRefreshCoordinator?.getStatus?.();
          staleLease = refresh?.selectedPathRequestLeaseActive === true
            && refresh?.requestActive !== true
            && refresh?.timerPending !== true
            && refresh?.selectedPathConfirmationPending !== true
            && completeIndexRefreshCoordinator?.selectedPathRequestOwnsIntent?.(currentIntent) !== true;
        } catch {}
        if (!staleLease) return;
        const windowMs = Math.max(
          0,
          Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000),
        );
        chatAtlasScheduleTrustedNativeBranchReconcile(currentIntent.token, {
          expiryWakeup: true,
          delayMs: Math.max(0, (Number(currentIntent.observedAt || 0) + windowMs + 1) - Date.now()),
        });
      });
    }
    return true;
  }

  function chatAtlasClearBranchSelectionStale(checkpoint, reason = 'branch-stale-cleared', notify = true) {
    if (completeTurnIndexAuthorityState.branchSelectionStale !== true) return false;
    if (checkpoint && (
      Number(checkpoint.revision || 0) !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || String(checkpoint.qId || '') !== String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      || String(checkpoint.chatId || '') !== String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      || String(checkpoint.routeKey || '') !== String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      || Number(checkpoint.generation || 0) !== Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
    )) return false;
    completeTurnIndexAuthorityState.branchSelectionStale = false;
    completeTurnIndexAuthorityState.branchStaleLastClearReason = chatAtlasCompleteIndexCode(reason, 'branch-stale-cleared', 64);
    chatAtlasBranchTransactionTrace('stale-clear', { reason });
    completeTurnIndexAuthorityState.branchSelectionStaleQId = null;
    completeTurnIndexAuthorityState.branchSelectionStaleChatId = null;
    completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = '';
    completeTurnIndexAuthorityState.branchSelectionStaleGeneration = 0;
    if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
      chatAtlasClearSelectedPathOverlay(reason);
    }
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(reason, { preserveGraph: true });
    }
    chatAtlasTraceTrustedLifecycle('branch-stale-cleared', { reason });
    if (notify) chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasCompleteIndexExplicitRefreshSucceeded(result) {
    const status = String(result?.status || '');
    return status === 'complete-refresh-validated'
      || status === 'complete-validated'
      || status === 'complete-from-host-payload';
  }

  function chatAtlasCompleteIndexFingerprint(turns = []) {
    const identity = (Array.isArray(turns) ? turns : []).map((turn) => [
      String(turn?.qId || ''),
      String(turn?.primaryAId || ''),
      ...(Array.isArray(turn?.answerVariants) ? turn.answerVariants.map((id) => String(id || '')) : []),
      turn?.noAnswer === true ? 'no-answer:1' : 'no-answer:0',
      turn?.stopped === true ? 'stopped:1' : 'stopped:0',
    ]);
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identity))}`;
  }

  // ── Native downstream-edit convergence ──────────────────────────────────
  // After a trusted branch selection publishes the complete branch, the host
  // can still be displaying a DIFFERENT downstream edit at some turn: the
  // user's chosen route exists in the graph, but ChatGPT's own edit selector
  // at that position points at a shorter sibling, so the turns beyond it are
  // never rendered. Convergence activates ONLY the exact native control that
  // provably owns the mounted identity, and ONLY toward a sibling whose
  // identity is proven from the same graph the branch was derived from.
  // Every step is identity-proven; nothing is chosen by text, position,
  // direction or branch number, and anything unproven fails closed.
  const CHAT_ATLAS_CONVERGENCE_MAX_STEPS = 8;

  function chatAtlasConvergenceTrace(code, detail = {}) {
    chatAtlasBranchTransactionTrace(code, detail);
  }

  function chatAtlasConvergenceGraphScope() {
    const retained = selectedPathAcquisitionState.graph;
    const graph = retained?.identityGraph || null;
    if (!Array.isArray(graph?.nodes)) return { ok: false, reason: 'graph-unavailable' };
    if (
      retained.chatId !== String(completeTurnIndexAuthorityState.chatId || '')
      || retained.routeKey !== String(completeTurnIndexAuthorityState.routeKey || '')
      || Number(retained.generation || 0) !== Number(completeTurnIndexAuthorityState.generation || 0)
    ) return { ok: false, reason: 'graph-scope-drift' };
    return { ok: true, reason: null, graph, byId: new Map(graph.nodes.map((node) => [node.nodeId, node])) };
  }

  function chatAtlasConvergenceUniqueNode(graph, id, productKey) {
    const wanted = chatAtlasCompleteIndexIdentity(id);
    if (!wanted) return null;
    const found = graph.nodes.filter((node) => (
      node?.[productKey] === true && chatAtlasCompleteIndexIdentity(node?.messageId) === wanted
    ));
    return found.length === 1 ? found[0] : null;
  }

  // The direct child of `questionNode` whose subtree carries `node`. THAT child,
  // not the answer message itself, is the unit a native regeneration pager moves
  // between: a variant's answer may sit below wrapper/alias nodes.
  function chatAtlasConvergenceBranchRoot(questionNode, node, byId) {
    if (!questionNode || !node) return null;
    const seen = new Set();
    let current = node;
    while (current?.parentId && current.parentId !== questionNode.nodeId) {
      if (seen.has(current.nodeId)) return null;
      seen.add(current.nodeId);
      current = byId.get(current.parentId);
    }
    return current?.parentId === questionNode.nodeId ? current : null;
  }

  // Answer-branch roots under a question. A USER child is a consecutive-send
  // continuation, never an answer variant.
  function chatAtlasConvergenceAnswerVariantRoots(questionNode, byId) {
    return (questionNode?.childIds || [])
      .map((childId) => byId.get(childId))
      .filter((node) => !!node && node.productUser !== true);
  }

  function chatAtlasConvergenceQuestionVariants(questionNode, byId) {
    const parent = questionNode?.parentId ? byId.get(questionNode.parentId) : null;
    if (!parent) return [];
    return (parent.childIds || [])
      .map((childId) => byId.get(childId))
      .filter((node) => node?.productUser === true);
  }

  // A native question-edit pager replaces the question identity. When the
  // captured qId is absent, the retained graph supplies the only stable
  // equivalence relation: productUser children of the exact same parent.
  function chatAtlasQuestionEditSiblingProof(graph, capturedQIdRaw, currentQIdRaw) {
    const capturedQId = chatAtlasCompleteIndexIdentity(capturedQIdRaw);
    const currentQId = chatAtlasCompleteIndexIdentity(currentQIdRaw);
    if (!capturedQId || !currentQId || capturedQId === currentQId) return false;
    if (!Array.isArray(graph?.nodes) || !graph.nodes.length) return false;
    const captured = chatAtlasConvergenceUniqueNode(graph, capturedQId, 'productUser');
    const current = chatAtlasConvergenceUniqueNode(graph, currentQId, 'productUser');
    if (!captured || !current || !captured.parentId || captured.parentId !== current.parentId) {
      return false;
    }
    const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    return chatAtlasConvergenceQuestionVariants(captured, byId)
      .filter((node) => node?.nodeId === current.nodeId).length === 1;
  }

  function chatAtlasResolveQuestionEditAnchorEvidence(graph, evidence, capturedQIdRaw) {
    const missing = Object.freeze({ ok: false, reason: 'anchor-member-missing' });
    const capturedQId = chatAtlasCompleteIndexIdentity(capturedQIdRaw);
    if (!capturedQId || !(evidence instanceof Map) || !Array.isArray(graph?.nodes)) return missing;
    const captured = chatAtlasConvergenceUniqueNode(graph, capturedQId, 'productUser');
    if (!captured) return missing;
    const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const candidates = Array.from(new Set(
      chatAtlasConvergenceQuestionVariants(captured, byId)
        .map((node) => chatAtlasCompleteIndexIdentity(node?.messageId))
        .filter((qId) => qId && evidence.has(qId)),
    ));
    if (!candidates.length) return missing;
    if (candidates.length !== 1) {
      return Object.freeze({ ok: false, reason: 'anchor-member-ambiguous' });
    }
    const qId = candidates[0];
    const anchorEvidence = evidence.get(qId);
    if (!anchorEvidence || anchorEvidence.memberCount !== 1) {
      return Object.freeze({ ok: false, reason: 'anchor-member-ambiguous' });
    }
    return Object.freeze({ ok: true, qId, anchorEvidence });
  }

  // Native pager sibling order for one question's answer variants. Raw graph
  // childIds order IS the host's own sibling order -- the order the native
  // pager walks as 1/N, 2/N -- and it is never re-sorted by which answer is
  // currently primary. turn.answerVariants must NOT be used for this: it is
  // presentation-ordered and deliberately moves primaryAId last, so index+/-1
  // on it does not correspond to pager positions at all.
  //
  // Each root is mapped through chatAtlasAnswerIdentityForRoot, so a branch
  // shell alias resolves to the answer identity the pager actually moves to
  // rather than the shell's own node id.
  //
  // Graph-wide by construction: it resolves the clicked question directly,
  // so it stays correct when that question is not on the current or default
  // route -- which is exactly the case after a manual switch.
  //
  // The graph is supplied EXPLICITLY. Both callers already hold the exact
  // retained graph they have proven to be in scope, and neither may silently
  // fall back to whatever unrelated graph global state happens to hold.
  function chatAtlasNativeOrderedAnswerVariantIdsFromGraph(graph, qIdRaw) {
    const bad = (reason) => Object.freeze({ ok: false, reason, ids: Object.freeze([]) });
    const qId = chatAtlasCompleteIndexIdentity(qIdRaw);
    if (!qId) return bad('capture-anchor-invalid');
    if (!Array.isArray(graph?.nodes) || !graph.nodes.length) {
      return bad('capture-native-order-unavailable');
    }
    const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const questionNode = chatAtlasConvergenceUniqueNode(graph, qId, 'productUser');
    if (!questionNode) return bad('capture-anchor-ambiguous');
    const roots = chatAtlasConvergenceAnswerVariantRoots(questionNode, byId);
    // Fewer than two answer roots in a graph that IS trustworthy is positive
    // proof that this question has no pager neighbour at all -- it is not the
    // absence of evidence, so it must never be deferred.
    if (!Array.isArray(roots) || roots.length < 2) {
      return bad('capture-direction-neighbor-unavailable');
    }
    const ids = [];
    for (const root of roots) {
      const identity = chatAtlasCompleteIndexIdentity(
        chatAtlasAnswerIdentityForRoot(root, byId),
      );
      if (!identity) return bad('capture-native-order-unresolved');
      if (ids.includes(identity)) return bad('capture-answer-variants-malformed');
      ids.push(identity);
    }
    return Object.freeze({ ok: true, reason: null, ids: Object.freeze(ids) });
  }

  // Current-scope wrapper: the same native ordering read from whatever graph
  // the convergence primitives currently own. Convergence planning already
  // works exclusively in the current scope, so it needs no explicit graph.
  function chatAtlasNativeOrderedAnswerVariantIds(qIdRaw) {
    let scope = null;
    try { scope = chatAtlasConvergenceGraphScope(); } catch { scope = null; }
    if (!scope || scope.ok !== true) {
      return Object.freeze({
        ok: false,
        reason: 'capture-native-order-unavailable',
        ids: Object.freeze([]),
      });
    }
    return chatAtlasNativeOrderedAnswerVariantIdsFromGraph(scope.graph, qIdRaw);
  }

  // The one place a captured trusted click (qId + prior answer + direction)
  // becomes the exact answer identity the native pager moved to. Both the
  // capture-time resolution and the deferred graph-arrival resolution call
  // THIS, so a single arithmetic owns pager adjacency.
  function chatAtlasResolveNativeReturnTarget(graph, qIdRaw, priorAnswerIdRaw, directionRaw) {
    const bad = (reason) => Object.freeze({
      ok: false,
      reason,
      targetVariantAnswerId: '',
      nativeOrderedIds: Object.freeze([]),
    });
    const priorAnswerId = chatAtlasCompleteIndexIdentity(priorAnswerIdRaw);
    const direction = String(directionRaw || '');
    if (!priorAnswerId) return bad('capture-anchor-invalid');
    if (!['previous', 'next'].includes(direction)) return bad('capture-direction-invalid');
    const nativeOrder = chatAtlasNativeOrderedAnswerVariantIdsFromGraph(graph, qIdRaw);
    if (nativeOrder.ok !== true) return bad(nativeOrder.reason);
    const nativeIds = nativeOrder.ids;
    const priorIndexValue = nativeIds.indexOf(priorAnswerId);
    if (priorIndexValue < 0) return bad('capture-prior-answer-absent');
    const targetIndexValue = priorIndexValue + (direction === 'previous' ? -1 : 1);
    const targetVariantAnswerId = targetIndexValue >= 0 && targetIndexValue < nativeIds.length
      ? chatAtlasCompleteIndexIdentity(nativeIds[targetIndexValue])
      : '';
    if (!targetVariantAnswerId) return bad('capture-direction-neighbor-unavailable');
    return Object.freeze({
      ok: true,
      reason: null,
      targetVariantAnswerId,
      nativeOrderedIds: nativeIds,
    });
  }

  // A capture whose exact native sibling order was not yet provable. Only this
  // shape may be resolved later; an `invalid` capture is terminal.
  function chatAtlasReturnTargetCandidatePending(candidate) {
    return candidate?.classification === 'pending'
      && candidate?.targetResolved !== true
      && !chatAtlasCompleteIndexIdentity(candidate?.targetVariantAnswerId);
  }

  function chatAtlasResolvedReturnTargetCandidate(candidate, targetVariantAnswerId, retained) {
    return Object.freeze({
      ...candidate,
      classification: 'resolved',
      reason: 'graph-arrival-resolved-return',
      targetResolved: true,
      targetVariantAnswerId: chatAtlasCompleteIndexIdentity(targetVariantAnswerId),
      graphCaptureIdentity: String(retained?.captureIdentity || ''),
      graphCapturedAt: String(retained?.identityGraph?.capturedAt || ''),
      // Deliberately left unresolved: a deferred capture froze NO route, so the
      // frozen-path guard has nothing legitimate to compare against and must
      // stay inert rather than veto against a route that was never captured.
      derivedTargetCount: 0,
      derivedPathIdentity: '',
      derivedPathMembers: Object.freeze([]),
    });
  }

  function chatAtlasBuildNativeBranchSelectionPlan() {
    const transaction = chatAtlasBranchTransactionCurrent();
    const index = getEffectivePresentationIndex();
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok || !turns.length) {
      return Object.freeze({
        ok: false,
        reason: scope.ok ? 'effective-path-unavailable' : scope.reason,
        pathLength: turns.length,
        points: Object.freeze([]),
      });
    }
    const points = [];
    for (const turn of turns) {
      if (points.length > 512) break;
      const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, turn?.qId, 'productUser');
      if (!questionNode) continue;
      const order = Number(turn?.order || 0);
      const expectedQId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const expectedPrimaryAId = chatAtlasCompleteIndexIdentity(turn?.primaryAId) || null;
      const questionVariants = chatAtlasConvergenceQuestionVariants(questionNode, scope.byId);
      if (questionVariants.length > 1) {
        points.push(Object.freeze({
          order,
          kind: 'question-edit',
          ownerNodeId: questionNode.parentId,
          ownerRole: 'user',
          variantIds: Object.freeze(questionVariants.map((node) => node.nodeId)),
          expectedIndex: questionVariants.findIndex((node) => node.nodeId === questionNode.nodeId),
          expectedCount: questionVariants.length,
          expectedQId,
          expectedPrimaryAId,
        }));
      }
      const answerRoots = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId);
      if (answerRoots.length > 1 && expectedPrimaryAId) {
        const answerNode = chatAtlasConvergenceUniqueNode(scope.graph, expectedPrimaryAId, 'productAnswer');
        const selectedRoot = chatAtlasConvergenceBranchRoot(questionNode, answerNode, scope.byId);
        points.push(Object.freeze({
          order,
          kind: 'assistant-regeneration',
          ownerNodeId: questionNode.nodeId,
          ownerRole: 'assistant',
          variantIds: Object.freeze(answerRoots.map((node) => node.nodeId)),
          expectedIndex: selectedRoot
            ? answerRoots.findIndex((node) => node.nodeId === selectedRoot.nodeId)
            : -1,
          expectedCount: answerRoots.length,
          expectedQId,
          expectedPrimaryAId,
        }));
      }
    }
    const terminal = turns[turns.length - 1];
    return Object.freeze({
      ok: true,
      reason: null,
      token: String(transaction?.token || ''),
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      fingerprint: String(index?.sourceFingerprint || ''),
      pathLength: turns.length,
      terminalQId: chatAtlasCompleteIndexIdentity(terminal?.qId) || null,
      terminalPrimaryAId: chatAtlasCompleteIndexIdentity(terminal?.primaryAId) || null,
      points: Object.freeze(points),
    });
  }

  function chatAtlasGraphCreateTime(node) {
    const value = node?.createTime;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }

  function chatAtlasGraphIsProductNode(node) {
    return node?.productUser === true || node?.productAnswer === true;
  }

  // Every distinct conversation endpoint. A graph leaf that is a structural
  // tool/system wrapper is NOT an endpoint: the endpoint is the nearest
  // product message above it.
  function chatAtlasEligibleTerminalNodes(graph, byId) {
    const out = [];
    const seen = new Set();
    for (const node of graph.nodes) {
      if ((node?.childIds || []).length) continue;
      let cursor = node;
      const guard = new Set();
      while (cursor && !chatAtlasGraphIsProductNode(cursor)) {
        if (guard.has(cursor.nodeId)) { cursor = null; break; }
        guard.add(cursor.nodeId);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
      }
      if (!cursor || seen.has(cursor.nodeId)) continue;
      seen.add(cursor.nodeId);
      out.push(cursor);
    }
    return out;
  }

  function chatAtlasSelectLatestCreatedTerminal(graph, byId) {
    const fail = (reason) => Object.freeze({ ok: false, reason, node: null, createTime: null });
    const terminals = chatAtlasEligibleTerminalNodes(graph, byId);
    if (!terminals.length) return fail('terminal-unavailable');
    // A terminal without a trustworthy creation time could be the newest one.
    // Comparing the rest would be a guess, so the whole selection fails closed.
    if (terminals.some((node) => chatAtlasGraphCreateTime(node) === null)) {
      return fail('terminal-create-time-incomplete');
    }
    let best = null;
    let tied = false;
    for (const node of terminals) {
      const created = chatAtlasGraphCreateTime(node);
      if (!best || created > chatAtlasGraphCreateTime(best)) { best = node; tied = false; continue; }
      if (created === chatAtlasGraphCreateTime(best)) tied = true;
    }
    if (!best) return fail('terminal-unavailable');
    if (tied) return fail('terminal-create-time-tie');
    return Object.freeze({
      ok: true,
      reason: 'latest-created-terminal',
      node: best,
      createTime: chatAtlasGraphCreateTime(best),
    });
  }

  // The root-to-node chain. In a tree every node has one parent, so the path
  // to a chosen terminal is unique — no fork resolution is involved.
  function chatAtlasChainToRoot(byId, node) {
    const chain = [];
    const guard = new Set();
    let cursor = node;
    while (cursor) {
      if (guard.has(cursor.nodeId)) return null;
      guard.add(cursor.nodeId);
      chain.push(cursor);
      if (chain.length > 4096) return null;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    chain.reverse();
    return chain;
  }

  // The identity a native answer pager moves to for one answer-branch root.
  function chatAtlasAnswerIdentityForRoot(root, byId) {
    if (!root) return '';
    if (root.branchShellAlias === true || root.productAnswer === true) {
      return chatAtlasCompleteIndexIdentity(root.messageId) || '';
    }
    const queue = [root];
    const guard = new Set();
    while (queue.length) {
      const node = queue.shift();
      if (!node || guard.has(node.nodeId)) continue;
      guard.add(node.nodeId);
      if (guard.size > 512) break;
      if (node.productAnswer === true) return chatAtlasCompleteIndexIdentity(node.messageId) || '';
      if (node.productUser === true && node !== root) continue;
      for (const childId of node.childIds || []) queue.push(byId.get(childId));
    }
    return '';
  }

  // Turn records for one chain, in the shape the effective index publishes.
  // Two identities per turn, deliberately separate (Stage 2C-2ai1):
  //
  //   BRANCH ROOT  — the first product answer or branch-shell alias below the
  //                  question on this chain. Branch authority: variant sets,
  //                  sibling proofs, selected branch index.
  //   DISPLAY      — the LAST eligible product answer before the next
  //                  product-user node. Presentation identity: primaryAId.
  //
  // The display rule mirrors the canonical host-payload projection in 0D3a
  // (`selectedProductAssistantKeys[...length - 1]`, window closed by the next
  // product-user node, eligibility = role assistant AND productAnswer). One
  // graph chain therefore projects to ONE row set whichever module walks it.
  // branchRootId may differ from primaryAId without implying any divergence.
  function chatAtlasTurnsFromChain(chain, byId, collect = null) {
    const turns = [];
    let open = null;
    const close = () => {
      if (!open) return;
      const roots = chatAtlasConvergenceAnswerVariantRoots(open.questionNode, byId);
      const branchRootAId = open.branchRootNode
        ? (chatAtlasCompleteIndexIdentity(open.branchRootNode.messageId) || null)
        : null;
      const answerVariants = roots
        .map((root) => chatAtlasAnswerIdentityForRoot(root, byId))
        .filter(Boolean);
      let primaryAId = open.displayNode
        ? (chatAtlasCompleteIndexIdentity(open.displayNode.messageId) || null)
        : branchRootAId;
      // Canonical system-branch-root promotion, mirroring 0D3a:1013-1021. A
      // SYSTEM branch root that is itself an owned variant identity IS the
      // displayed answer — that is the identity the native pager moves to. An
      // ASSISTANT root is preserved instead ('branch-root-assistant-preserved')
      // and the last eligible product answer stands. A hidden alias is never
      // displayed on any other ground.
      if (
        branchRootAId
        && branchRootAId !== primaryAId
        && String(open.branchRootNode?.role || '').trim().toLowerCase() === 'system'
        && answerVariants.includes(branchRootAId)
      ) primaryAId = branchRootAId;
      if (primaryAId) {
        const at = answerVariants.indexOf(primaryAId);
        if (at >= 0) answerVariants.splice(at, 1);
        answerVariants.push(primaryAId);
      }
      if (collect) {
        collect.push(Object.freeze({
          order: turns.length + 1,
          qId: open.qId,
          branchRootAId,
          primaryAId,
          branchRootIsPrimary: !!branchRootAId && branchRootAId === primaryAId,
          displayResolvedFromBranchRoot: !!open.displayNode && !!open.branchRootNode
            && chatAtlasConvergenceBranchRoot(open.questionNode, open.displayNode, byId)?.nodeId
              === chatAtlasConvergenceBranchRoot(open.questionNode, open.branchRootNode, byId)?.nodeId,
        }));
      }
      turns.push(chatAtlasFreeze({
        order: turns.length + 1,
        qId: open.qId,
        turnId: `turn:${open.qId}`,
        primaryAId,
        answerVariants,
        noAnswer: !primaryAId,
        stopped: open.stopped === true,
        // Same tag the manual resolver uses for rows walked from the graph.
        provenance: 'graph-descent',
        confirmedByNativeEvidence: false,
      }));
      open = null;
    };
    for (const node of chain) {
      if (node?.productUser === true) {
        close();
        const qId = chatAtlasCompleteIndexIdentity(node.messageId);
        if (!qId) return null;
        open = {
          qId,
          questionNode: node,
          branchRootNode: null,
          displayNode: null,
          stopped: node.stopped === true,
        };
        continue;
      }
      if (!open) continue;
      // The first product answer or branch-shell alias below the question on
      // this chain IS the selected answer-branch root for that turn.
      if (!open.branchRootNode && (node?.productAnswer === true || node?.branchShellAlias === true)) {
        open.branchRootNode = node;
      }
      // Canonical display window: keep the LAST eligible product answer, and
      // inherit stopped from any assistant inside the window.
      if (String(node?.role || '').trim().toLowerCase() === 'assistant') {
        if (node.stopped === true) open.stopped = true;
        if (node.productAnswer === true) open.displayNode = node;
      }
    }
    close();
    if (!turns.length) return null;
    if (new Set(turns.map((turn) => turn.qId)).size !== turns.length) return null;
    return turns;
  }

  // The active choice at every branch point along the chain: which question
  // variant and which answer variant this path actually takes.
  function chatAtlasBranchVectorForChain(chain, byId) {
    const onChain = new Set(chain.map((node) => node.nodeId));
    const vector = [];
    let order = 0;
    for (const node of chain) {
      if (node?.productUser !== true) continue;
      order += 1;
      const questionVariants = chatAtlasConvergenceQuestionVariants(node, byId);
      if (questionVariants.length > 1) {
        vector.push(Object.freeze({
          order,
          kind: 'question-edit',
          ownerMessageId: chatAtlasCompleteIndexIdentity(byId.get(node.parentId)?.messageId) || '',
          ownerRole: 'user',
          variantIds: Object.freeze(questionVariants.map((entry) => entry.nodeId)),
          variantCreateTimes: Object.freeze(questionVariants.map(chatAtlasGraphCreateTime)),
          selectedIndex: questionVariants.findIndex((entry) => entry.nodeId === node.nodeId),
          variantCount: questionVariants.length,
          selectedMessageId: chatAtlasCompleteIndexIdentity(node.messageId) || '',
        }));
      }
      const answerRoots = chatAtlasConvergenceAnswerVariantRoots(node, byId);
      if (answerRoots.length > 1) {
        const selected = answerRoots.findIndex((root) => onChain.has(root.nodeId));
        vector.push(Object.freeze({
          order,
          kind: 'assistant-regeneration',
          ownerMessageId: chatAtlasCompleteIndexIdentity(node.messageId) || '',
          ownerRole: 'assistant',
          variantIds: Object.freeze(answerRoots.map((entry) => entry.nodeId)),
          variantCreateTimes: Object.freeze(answerRoots.map(chatAtlasGraphCreateTime)),
          selectedIndex: selected,
          variantCount: answerRoots.length,
          selectedMessageId: selected >= 0
            ? chatAtlasAnswerIdentityForRoot(answerRoots[selected], byId)
            : '',
        }));
      }
    }
    return vector;
  }

  function chatAtlasComputeDefaultLatestCreatedPath() {
    const fail = (reason) => Object.freeze({
      ok: false, reason, terminalNodeId: null, rootNodeId: null, terminalMessageId: null,
      terminalCreateTime: null, turns: Object.freeze([]), branchVector: Object.freeze([]),
      branchRoots: Object.freeze([]),
      count: 0, fingerprint: '', source: 'latest-created-terminal',
    });
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return fail(scope.reason);
    const chosen = chatAtlasSelectLatestCreatedTerminal(scope.graph, scope.byId);
    if (!chosen.ok) return fail(chosen.reason);
    const chain = chatAtlasChainToRoot(scope.byId, chosen.node);
    if (!chain) return fail('terminal-chain-unresolved');
    const branchRoots = [];
    const turns = chatAtlasTurnsFromChain(chain, scope.byId, branchRoots);
    if (!turns) return fail('terminal-chain-not-a-path');
    return Object.freeze({
      ok: true,
      reason: null,
      terminalNodeId: chosen.node.nodeId,
      rootNodeId: chain[0]?.nodeId || null,
      terminalMessageId: chatAtlasCompleteIndexIdentity(chosen.node.messageId) || null,
      terminalCreateTime: chosen.createTime,
      turns: Object.freeze(turns),
      branchRoots: Object.freeze(branchRoots),
      branchVector: Object.freeze(chatAtlasBranchVectorForChain(chain, scope.byId)),
      count: turns.length,
      fingerprint: chatAtlasCompleteIndexFingerprint(turns),
      source: 'latest-created-terminal',
    });
  }


  function chatAtlasPagerAuditHash(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return null;
    return `djb2:${chatAtlasCompleteIndexStableHash(text)}`;
  }

  function chatAtlasPagerAuditCandidate(node, region, targetAId, root) {
    const label = String(node?.getAttribute?.('aria-label') || '').trim().toLowerCase();
    const exactPrevious = label === 'previous response';
    const exactNext = label === 'next response';
    const directions = CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.filter((word) => label.includes(word));
    let indicatorHops = -1;
    let group = node;
    for (let hop = 0; hop < 8 && group; hop += 1) {
      if (chatAtlasConvergenceExactIndicator(group)) { indicatorHops = hop; break; }
      group = group.parentElement || null;
    }
    let owner = null;
    let ownerMethod = 'none';
    try { owner = node.closest?.('[data-message-id]') || null; } catch {}
    if (owner) ownerMethod = 'closest-message-id';
    if (!owner && root) {
      let ordered = [];
      try { ordered = Array.from(root.querySelectorAll?.('[data-message-id], button') || []); } catch {}
      let last = null;
      for (const entry of ordered) {
        if (entry === node) break;
        if (chatAtlasCompleteIndexIdentity(entry?.getAttribute?.('data-message-id'))) last = entry;
      }
      if (last) { owner = last; ownerMethod = 'section-document-order'; }
    }
    if (!owner) {
      let sibling = null;
      try {
        sibling = node.closest?.('[data-testid^="conversation-turn-"]')
          ?.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null;
      } catch { sibling = null; }
      if (sibling) { owner = sibling; ownerMethod = 'sibling-assistant'; }
    }
    const ownerId = chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '';
    const ownerRole = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase() || 'unknown';
    const ownerMatch = !owner
      ? 'unknown'
      : (ownerId === chatAtlasCompleteIndexIdentity(targetAId)
        ? 'target-answer'
        : (ownerRole === 'user' ? 'question' : 'other-answer'));
    let rejection = 'accepted-current-contract';
    if (!exactPrevious && !exactNext) rejection = 'label-not-recognized';
    else if (region !== 'answer-section') rejection = 'outside-current-search-root';
    else if (indicatorHops < 0) rejection = 'indicator-not-found';
    else if (!owner) rejection = 'owner-not-found';
    else if (ownerRole !== 'assistant') rejection = 'owner-role-not-assistant';
    else if (ownerMatch !== 'target-answer') rejection = 'owner-id-mismatch';
    return Object.freeze({
      region,
      tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
      ariaLabelHash: chatAtlasPagerAuditHash(node?.getAttribute?.('aria-label')),
      testIdHash: chatAtlasPagerAuditHash(node?.getAttribute?.('data-testid')),
      role: String(node?.getAttribute?.('role') || '').trim().toLowerCase() || null,
      exactPrevious,
      exactNext,
      directionWords: Object.freeze(directions),
      indicatorFound: indicatorHops >= 0,
      indicatorHops,
      disabled: node?.disabled === true || node?.getAttribute?.('aria-disabled') === 'true',
      ownerMethod,
      ownerMatch,
      ownerRole,
      rejection,
    });
  }

  function chatAtlasTurn2AuditRole(node) {
    const role = String(node?.role || '').trim().toLowerCase();
    return ['user', 'assistant', 'system', 'tool'].includes(role) ? role : 'unknown';
  }

  const chatAtlasDefaultOverlayState = {
    state: 'idle',
    reason: null,
    key: '',
    terminalNodeId: null,
    terminalCreateTime: null,
    pathCount: 0,
    fingerprint: '',
    branchVectorCount: 0,
    publications: 0,
    resolutions: 0,
    graphAcquisitions: 0,
    effectiveIdentity: '',
    samePathCheckRan: false,
    samePathResult: null,
    effectiveAvailableAtCheck: false,
    effectiveCountAtCheck: 0,
    firstDifference: null,
    deferrals: 0,
    resolutionSource: null,
    answerOnlyReason: null,
    convergenceAttempts: 0,
    convergenceSignature: '',
    convergenceReason: null,
    convergenceExpectedAId: null,
    convergenceExpectedQId: null,
    convergenceEvaluation: null,
    answerConvergenceSuppressed: false,
    nativeRoute: null,
    anchorOwnershipReason: null,
    observedDivergenceKind: null,
    revealTargetOrder: 0,
    revealTargetQId: null,
    revealTargetExpectedAId: null,
    revealTargetCurrentAId: null,
    revealTargetDivergenceKind: null,
    revealTargetReason: null,
    convergenceRecord: null,
  };

  function chatAtlasPathIdentityKey(turns) {
    return (Array.isArray(turns) ? turns : [])
      .map((turn) => `${Number(turn?.order || 0)}:${chatAtlasCompleteIndexIdentity(turn?.qId)}:${chatAtlasCompleteIndexIdentity(turn?.primaryAId) || ''}`)
      .join('|');
  }

  // Ordered identity equality. Deliberately NOT the fingerprint: that hash
  // also folds in answerVariants, and the graph-derived rows legitimately
  // carry the full variant set where the host canonical rows carry the host's
  // own. Two paths are the same selected route when these columns agree.
  // The first row whose identity columns disagree, for diagnostics. Returns
  // null when the two paths are the same selected route.
  function chatAtlasFirstPathIdentityDifference(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    if (a.length !== b.length) {
      return Object.freeze({ index: -1, field: 'length', left: a.length, right: b.length });
    }
    for (let i = 0; i < a.length; i += 1) {
      const cols = [
        ['order', Number(a[i]?.order || 0), Number(b[i]?.order || 0)],
        ['qId', chatAtlasCompleteIndexIdentity(a[i]?.qId), chatAtlasCompleteIndexIdentity(b[i]?.qId)],
        ['primaryAId', chatAtlasCompleteIndexIdentity(a[i]?.primaryAId), chatAtlasCompleteIndexIdentity(b[i]?.primaryAId)],
        ['noAnswer', a[i]?.noAnswer === true, b[i]?.noAnswer === true],
        ['stopped', a[i]?.stopped === true, b[i]?.stopped === true],
      ];
      for (const [field, l, r] of cols) {
        if (l !== r) return Object.freeze({ index: i, field, left: l, right: r });
      }
    }
    return null;
  }

  function chatAtlasSamePathIdentity(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    if (!a.length || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (
        Number(a[i]?.order || 0) !== Number(b[i]?.order || 0)
        || chatAtlasCompleteIndexIdentity(a[i]?.qId) !== chatAtlasCompleteIndexIdentity(b[i]?.qId)
        || chatAtlasCompleteIndexIdentity(a[i]?.primaryAId) !== chatAtlasCompleteIndexIdentity(b[i]?.primaryAId)
        || (a[i]?.noAnswer === true) !== (b[i]?.noAnswer === true)
        || (a[i]?.stopped === true) !== (b[i]?.stopped === true)
      ) return false;
    }
    return true;
  }

  function chatAtlasDefaultOverlayDiagnostics() {
    return Object.freeze({
      defaultOverlayState: String(chatAtlasDefaultOverlayState.state || 'idle'),
      defaultPublicationReason: chatAtlasDefaultOverlayState.reason,
      defaultTerminalId: chatAtlasDefaultOverlayState.terminalNodeId,
      defaultTerminalCreateTime: chatAtlasDefaultOverlayState.terminalCreateTime,
      defaultPathCount: Number(chatAtlasDefaultOverlayState.pathCount || 0),
      defaultPathFingerprint: String(chatAtlasDefaultOverlayState.fingerprint || ''),
      defaultBranchVectorCount: Number(chatAtlasDefaultOverlayState.branchVectorCount || 0),
      defaultPublications: Number(chatAtlasDefaultOverlayState.publications || 0),
      defaultResolutions: Number(chatAtlasDefaultOverlayState.resolutions || 0),
      defaultSamePathCheckRan: chatAtlasDefaultOverlayState.samePathCheckRan === true,
      defaultSamePathResult: chatAtlasDefaultOverlayState.samePathResult,
      defaultEffectiveAvailableAtCheck: chatAtlasDefaultOverlayState.effectiveAvailableAtCheck === true,
      defaultEffectiveCountAtCheck: Number(chatAtlasDefaultOverlayState.effectiveCountAtCheck || 0),
      defaultFirstDifference: chatAtlasDefaultOverlayState.firstDifference,
      defaultDedupKey: String(chatAtlasDefaultOverlayState.key || ''),
      defaultDeferrals: Number(chatAtlasDefaultOverlayState.deferrals || 0),
      defaultResolutionSource: chatAtlasDefaultOverlayState.resolutionSource,
      defaultAnswerOnlyReason: chatAtlasDefaultOverlayState.answerOnlyReason,
      defaultConvergenceAttempts: Number(chatAtlasDefaultOverlayState.convergenceAttempts || 0),
      defaultConvergenceReason: chatAtlasDefaultOverlayState.convergenceReason,
      defaultConvergenceExpectedAId: chatAtlasDefaultOverlayState.convergenceExpectedAId,
      defaultConvergenceExpectedQId: chatAtlasDefaultOverlayState.convergenceExpectedQId,
      defaultConvergenceEvaluation: chatAtlasDefaultOverlayState.convergenceEvaluation,
      revealTargetOrder: Number(chatAtlasDefaultOverlayState.revealTargetOrder || 0),
      revealTargetQId: chatAtlasDefaultOverlayState.revealTargetQId,
      revealTargetExpectedAId: chatAtlasDefaultOverlayState.revealTargetExpectedAId,
      revealTargetCurrentAId: chatAtlasDefaultOverlayState.revealTargetCurrentAId,
      revealTargetDivergenceKind: chatAtlasDefaultOverlayState.revealTargetDivergenceKind,
      revealTargetReason: chatAtlasDefaultOverlayState.revealTargetReason,
      ...chatAtlasRevealDiagnostics(),
      defaultEffectiveIdentity: String(chatAtlasDefaultOverlayState.effectiveIdentity || ''),
      defaultGraphAcquisitions: Number(chatAtlasDefaultOverlayState.graphAcquisitions || 0),
      manualOverrideActive: completeTurnIndexAuthorityState.manualOverrideActive === true,
      manualOverrideRevision: Number(completeTurnIndexAuthorityState.manualOverrideRevision || 0),
    });
  }

  // A manual selection owns the session from the moment it is captured. The
  // default origin is inert afterwards until a reload resets the session.
  function chatAtlasMarkManualBranchOverride(reason = 'manual-native-selection') {
    const state = completeTurnIndexAuthorityState;
    state.manualOverrideActive = true;
    state.manualOverrideRevision = Number(state.manualOverrideRevision || 0) + 1;
    state.manualOverrideChatId = String(state.chatId || '');
    state.manualOverrideRouteKey = String(state.routeKey || '');
    state.manualOverrideGeneration = Number(state.generation || 0);
    chatAtlasDefaultOverlayState.state = 'superseded';
    chatAtlasDefaultOverlayState.reason = reason;
    chatAtlasDefaultOverlayState.key = '';
    chatAtlasDefaultOverlayState.effectiveIdentity = '';
    chatAtlasDefaultOverlayState.convergenceRecord = null;
    chatAtlasDefaultOverlayState.convergenceSignature = '';
    chatAtlasDefaultOverlayState.convergenceReason = 'superseded-by-manual';
    try { chatAtlasRevealSupersede('manual-branch-selection'); } catch {}
    chatAtlasBranchTransactionTrace('default-superseded-by-manual', { reason });
  }

  // A route/generation change is a new page session for this purpose.
  function chatAtlasResetManualBranchOverride(reason = 'route-reset') {
    const state = completeTurnIndexAuthorityState;
    if (state.manualOverrideActive !== true) return;
    state.manualOverrideActive = false;
    state.manualOverrideRevision = 0;
    chatAtlasDefaultOverlayState.state = 'idle';
    chatAtlasDefaultOverlayState.reason = reason;
    chatAtlasDefaultOverlayState.key = '';
    chatAtlasDefaultOverlayState.effectiveIdentity = '';
  }

  // Every condition of the scoped exception, proven from the graph. Any single
  // failure means the route is NOT an answer-only difference and the general
  // containment rule applies unchanged.
  function chatAtlasDefaultAnswerOnlyDivergence(defaultTurns, canonicalTurns) {
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return Object.freeze({ ok: false, reason: scope.reason });
    const a = Array.isArray(defaultTurns) ? defaultTurns : [];
    const b = Array.isArray(canonicalTurns) ? canonicalTurns : [];
    if (!a.length || a.length !== b.length) return Object.freeze({ ok: false, reason: 'answer-only-length-differs' });
    const qIds = new Set();
    let differing = 0;
    for (let i = 0; i < a.length; i += 1) {
      const qId = chatAtlasCompleteIndexIdentity(a[i]?.qId);
      if (!qId || qIds.has(qId)) return Object.freeze({ ok: false, reason: 'answer-only-duplicate-question' });
      qIds.add(qId);
      if (
        Number(a[i]?.order || 0) !== Number(b[i]?.order || 0)
        || qId !== chatAtlasCompleteIndexIdentity(b[i]?.qId)
        || (a[i]?.noAnswer === true) !== (b[i]?.noAnswer === true)
        || (a[i]?.stopped === true) !== (b[i]?.stopped === true)
      ) return Object.freeze({ ok: false, reason: 'answer-only-row-mismatch' });
      const mine = chatAtlasCompleteIndexIdentity(a[i]?.primaryAId);
      const theirs = chatAtlasCompleteIndexIdentity(b[i]?.primaryAId);
      if (mine === theirs) continue;
      differing += 1;
      // The differing selection must be a PROVEN answer variant of that same
      // question in the retained graph.
      const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, qId, 'productUser');
      if (!questionNode) return Object.freeze({ ok: false, reason: 'answer-only-question-unproven' });
      const identities = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId)
        .map((root) => chatAtlasAnswerIdentityForRoot(root, scope.byId));
      if (!mine || !identities.includes(mine)) {
        return Object.freeze({ ok: false, reason: 'answer-only-variant-unproven' });
      }
    }
    if (!differing) return Object.freeze({ ok: false, reason: 'answer-only-no-difference' });
    return Object.freeze({ ok: true, reason: null, differing });
  }

  // Preferred route when the newest-created default differs from the native
  // path only by answer selections: move the NATIVE content onto the default
  // answers using the existing identity-proven bounded convergence, then let
  // the host authority refresh settle. Nothing is published while native and
  // Core disagree, so the Core parity gate is never challenged.
  // Tri-state comparison of the mounted native path against a target route.
  // Absence of evidence is NEVER agreement: a target turn that is not mounted,
  // or is mounted without its assistant identity, yields 'unavailable'.
  // The exact branch owner at the FIRST ordered divergence between the target
  // route and the published effective path. This — not the first unmounted row
  // of the path — is what must be revealed and converged.
  function chatAtlasFirstDivergenceTarget(targetTurns) {
    const none = (why) => Object.freeze({
      ok: false, reason: why, order: 0, qId: null,
      expectedAId: null, currentAId: null, kind: null,
    });
    const turns = Array.isArray(targetTurns) ? targetTurns : [];
    if (!turns.length) return none('reveal-target-unproven');
    let effective = null;
    try { effective = getEffectivePresentationIndex(); } catch { effective = null; }
    const rows = Array.isArray(effective?.turns) ? effective.turns : [];
    if (!rows.length) return none('reveal-target-unproven');
    const shared = Math.min(turns.length, rows.length);
    for (let i = 0; i < shared; i += 1) {
      const qId = chatAtlasCompleteIndexIdentity(turns[i]?.qId);
      const theirQId = chatAtlasCompleteIndexIdentity(rows[i]?.qId);
      const aId = chatAtlasCompleteIndexIdentity(turns[i]?.primaryAId);
      const theirAId = chatAtlasCompleteIndexIdentity(rows[i]?.primaryAId);
      const sameShape = (turns[i]?.noAnswer === true) === (rows[i]?.noAnswer === true)
        && (turns[i]?.stopped === true) === (rows[i]?.stopped === true)
        && Number(turns[i]?.order || 0) === Number(rows[i]?.order || 0);
      if (qId === theirQId && aId === theirAId && sameShape) continue;
      return Object.freeze({
        ok: true,
        reason: null,
        order: Number(turns[i]?.order || 0),
        qId,
        expectedAId: aId || null,
        currentAId: theirAId || null,
        // The presentation rows only OBSERVE that a qId is shared. The native
        // control kind comes from the graph-proven branch edge; an unproven
        // graph never yields 'assistant-regeneration' here.
        observedSameQuestion: qId === theirQId,
        kind: chatAtlasGraphDivergence().kind === 'assistant-regeneration'
          ? 'assistant-regeneration'
          : 'question-edit',
      });
    }
    if (turns.length === rows.length) return none('reveal-target-identical');
    const i = shared;
    return Object.freeze({
      ok: true,
      reason: null,
      order: Number(turns[i]?.order || shared + 1),
      qId: chatAtlasCompleteIndexIdentity(turns[i]?.qId) || null,
      expectedAId: chatAtlasCompleteIndexIdentity(turns[i]?.primaryAId) || null,
      currentAId: null,
      kind: 'question-edit',
    });
  }

  function chatAtlasEvaluateNativeAgainstTarget(targetTurns) {
    const frozen = (result, why, mismatch = null, expected = null) => Object.freeze({
      result,
      reason: why,
      mismatch,
      expectedQId: expected?.qId || null,
      expectedPrimaryAId: expected?.primaryAId || null,
    });
    const turns = Array.isArray(targetTurns) ? targetTurns : [];
    if (!turns.length) return frozen('unavailable', 'target-path-empty');
    let map = null;
    try { map = chatAtlasMapMountedNativePath(); } catch { map = null; }
    const rows = Array.isArray(map?.rows) ? map.rows : [];
    if (!rows.length) {
      // Report the exact divergence owner. Falling back to the first path row
      // named a turn that does not diverge at all.
      const target = chatAtlasFirstDivergenceTarget(turns);
      return frozen('unavailable', 'native-path-unmounted', null, {
        qId: target.ok ? target.qId : null,
        primaryAId: target.ok ? target.expectedAId : null,
      });
    }
    // Rows are keyed by the question they mount, so a split user/assistant
    // topology pairs through chatAtlasMapMountedNativePath rather than through
    // an assumption that both roles share one section.
    const byQId = new Map();
    for (const row of rows) if (row.mountedQId) byQId.set(row.mountedQId, row);
    let firstUnavailable = null;
    for (const turn of turns) {
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const aId = chatAtlasCompleteIndexIdentity(turn?.primaryAId);
      if (!qId) continue;
      const row = byQId.get(qId) || null;
      if (!row) {
        if (!firstUnavailable) {
          firstUnavailable = { reason: 'target-question-unmounted', qId, primaryAId: aId || null };
        }
        continue;
      }
      if (aId && !row.mountedAId) {
        if (!firstUnavailable) {
          firstUnavailable = { reason: 'target-answer-unmounted', qId, primaryAId: aId };
        }
        continue;
      }
      if (aId && row.mountedAId !== aId) {
        return frozen('mismatch', 'native-answer-differs', Object.freeze({
          section: row.answerSection || row.section,
          kind: 'assistant-regeneration',
          mountedQId: qId,
          mountedAId: row.mountedAId,
          expectedQId: qId,
          expectedPrimaryAId: aId,
          expectedOrder: Number(turn?.order || 0),
        }), { qId, primaryAId: aId });
      }
    }
    if (firstUnavailable) {
      return frozen('unavailable', firstUnavailable.reason, null, firstUnavailable);
    }
    return frozen('match', 'native-matches-target');
  }

  // ── Anchor branch ownership (Stage 2C-2ai1) ──────────────────────────────
  // The displayed answer is the LAST eligible answer in the turn window, so it
  // is generally NOT one of the question's direct variant-root ids. Requiring
  // that equality was the old `default-anchor-answer-not-variant` gate and it
  // is no longer the right question. What must hold instead: the row's branch
  // ROOT is one of the owner's variant roots, and the displayed answer lives
  // inside that same root's subtree.
  function chatAtlasProveAnchorBranchOwnership(computed, anchorIndex) {
    const fail = (reason) => Object.freeze({ ok: false, reason });
    const row = Array.isArray(computed?.turns) ? computed.turns[anchorIndex] : null;
    if (!row) return fail('anchor-row-missing');
    const roots = Array.isArray(computed?.branchRoots) ? computed.branchRoots : [];
    const record = roots.find((entry) => Number(entry?.order || 0) === Number(row.order || 0)) || null;
    if (!record) return fail('anchor-branch-root-unrecorded');
    const primaryAId = chatAtlasCompleteIndexIdentity(row.primaryAId);
    if (!primaryAId) return fail('anchor-answer-missing');
    if (chatAtlasCompleteIndexIdentity(record.primaryAId) !== primaryAId) {
      return fail('anchor-answer-row-mismatch');
    }
    const branchRootAId = chatAtlasCompleteIndexIdentity(record.branchRootAId);
    if (!branchRootAId) return fail('anchor-branch-root-missing');
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return fail(scope.reason);
    const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, row.qId, 'productUser');
    if (!questionNode) return fail('anchor-question-ambiguous');
    // 1. the selected branch root belongs to the owner's variant-root set
    const rootNodes = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId);
    const selectedRoot = rootNodes.find((node) => (
      chatAtlasCompleteIndexIdentity(node.messageId) === branchRootAId
      || chatAtlasAnswerIdentityForRoot(node, scope.byId) === branchRootAId
    )) || null;
    if (!selectedRoot) return fail('anchor-branch-root-not-a-variant');
    // 2. the displayed answer resolves from THAT root
    if (record.branchRootIsPrimary !== true && record.displayResolvedFromBranchRoot !== true) {
      return fail('anchor-answer-not-resolved-from-root');
    }
    return Object.freeze({
      ok: true, reason: null, branchRootAId, primaryAId,
      branchRootIsPrimary: record.branchRootIsPrimary === true,
      rootCount: rootNodes.length,
    });
  }

  // ── Graph-proven divergence (Stage 2C-2ah8) ──────────────────────────────
  // The native control kind is decided by a real branch EDGE, never by two
  // presentation rows sharing a qId. `same qId + different primaryAId` survives
  // only as an observation and may not select a control type.
  const chatAtlasGraphDivergenceState = { key: '', value: null };

  function chatAtlasGraphDivergenceEmpty(state, reason) {
    return chatAtlasFreeze({
      state, reason, kind: null, order: 0, sharedPrefixLength: 0,
      ownerFound: false, ownerRole: null, ownerMessageId: null,
      currentRootFound: false, defaultRootFound: false,
      currentRootMessageId: null, defaultRootMessageId: null,
      variantCount: 0, currentIndex: -1, defaultIndex: -1, requiredDirection: null,
      directAnswerSiblingProof: false, questionVariantProof: false,
      branchVectorAgreement: false, observedKind: null,
      currentQuestionMessageId: null, defaultQuestionMessageId: null,
    });
  }

  // The point in a branch vector whose variant set literally contains this
  // root node. Matching on the root is exact for BOTH kinds: the node that
  // follows the shared owner on a chain IS that chain's variant root.
  function chatAtlasGraphDivergencePointFor(vector, rootNodeId) {
    if (!rootNodeId) return null;
    for (const point of vector || []) {
      const ids = Array.isArray(point?.variantIds) ? point.variantIds : [];
      if (ids.includes(rootNodeId)) return point;
    }
    return null;
  }

  function chatAtlasComputeGraphDivergence() {
    const fail = (reason) => chatAtlasGraphDivergenceEmpty('fail-closed', reason);
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return chatAtlasGraphDivergenceEmpty('waiting', scope.reason);
    const { graph, byId } = scope;
    const captureAtStart = String(selectedPathAcquisitionState.graph?.captureIdentity || '');

    // ── The two root-to-leaf chains ───────────────────────────────────────
    const currentNode = byId.get(chatAtlasCompleteIndexIdentity(graph.currentNode)) || null;
    if (!currentNode) return fail('current-node-unresolved');
    const currentChain = chatAtlasChainToRoot(byId, currentNode);
    if (!currentChain || !currentChain.length) return fail('current-chain-unresolved');
    const chosen = chatAtlasSelectLatestCreatedTerminal(graph, byId);
    if (!chosen.ok) return fail(chosen.reason || 'default-terminal-unresolved');
    const defaultChain = chatAtlasChainToRoot(byId, chosen.node);
    if (!defaultChain || !defaultChain.length) return fail('default-chain-unresolved');

    // ── Longest common graph-node prefix ──────────────────────────────────
    let prefix = 0;
    while (
      prefix < currentChain.length
      && prefix < defaultChain.length
      && currentChain[prefix].nodeId === defaultChain[prefix].nodeId
    ) prefix += 1;
    if (prefix === 0) return fail('chains-share-no-root');
    if (prefix >= currentChain.length && prefix >= defaultChain.length) {
      return chatAtlasGraphDivergenceEmpty('identical', 'chains-identical');
    }
    if (prefix >= currentChain.length || prefix >= defaultChain.length) {
      // One chain is a prefix of the other: a continuation, not a branch edge.
      return fail('divergence-is-continuation');
    }
    const owner = currentChain[prefix - 1] || null;
    const currentRoot = currentChain[prefix];
    const defaultRoot = defaultChain[prefix];
    if (!owner) return fail('shared-owner-unproven');
    if (currentRoot.nodeId === defaultRoot.nodeId) return fail('divergence-roots-identical');

    // ── Resolve the EXISTING branch-vector point on each chain ────────────
    const currentVector = chatAtlasBranchVectorForChain(currentChain, byId);
    const defaultVector = chatAtlasBranchVectorForChain(defaultChain, byId);
    const currentPoint = chatAtlasGraphDivergencePointFor(currentVector, currentRoot.nodeId);
    const defaultPoint = chatAtlasGraphDivergencePointFor(defaultVector, defaultRoot.nodeId);
    if (!currentPoint || !defaultPoint) return fail('branch-vector-point-absent');
    const agreement = String(currentPoint.kind) === String(defaultPoint.kind)
      && String(currentPoint.ownerMessageId || '') === String(defaultPoint.ownerMessageId || '')
      && Number(currentPoint.variantCount || 0) === Number(defaultPoint.variantCount || 0);
    if (!agreement) return fail('branch-vector-disagreement');
    const variantIds = Array.isArray(defaultPoint.variantIds) ? defaultPoint.variantIds : [];
    if (!variantIds.includes(currentRoot.nodeId) || !variantIds.includes(defaultRoot.nodeId)) {
      return fail('roots-not-in-one-variant-set');
    }
    const kind = String(defaultPoint.kind || '');
    if (kind !== 'question-edit' && kind !== 'assistant-regeneration') return fail('divergence-kind-unknown');
    const currentIndex = variantIds.indexOf(currentRoot.nodeId);
    const defaultIndex = variantIds.indexOf(defaultRoot.nodeId);
    if (currentIndex < 0 || defaultIndex < 0) return fail('variant-index-unresolved');

    // ── Mission D: strict direct answer-sibling proof ─────────────────────
    let directAnswerSiblingProof = false;
    if (kind === 'assistant-regeneration') {
      const roots = owner.productUser === true
        ? chatAtlasConvergenceAnswerVariantRoots(owner, byId)
        : [];
      const rootIds = roots.map((node) => node.nodeId);
      directAnswerSiblingProof = owner.productUser === true
        && roots.length > 1
        && rootIds.includes(currentRoot.nodeId)
        && rootIds.includes(defaultRoot.nodeId)
        && !!chatAtlasAnswerIdentityForRoot(currentRoot, byId)
        && !!chatAtlasAnswerIdentityForRoot(defaultRoot, byId);
    }
    // ── Mission E: strict question-variant proof ──────────────────────────
    let questionVariantProof = false;
    if (kind === 'question-edit') {
      const variants = currentRoot.productUser === true
        ? chatAtlasConvergenceQuestionVariants(currentRoot, byId)
        : [];
      const variantNodeIds = variants.map((node) => node.nodeId);
      questionVariantProof = currentRoot.productUser === true
        && defaultRoot.productUser === true
        && variants.length > 1
        && variantNodeIds.includes(currentRoot.nodeId)
        && variantNodeIds.includes(defaultRoot.nodeId)
        && currentRoot.parentId === owner.nodeId
        && defaultRoot.parentId === owner.nodeId;
    }
    if (kind === 'assistant-regeneration' && !directAnswerSiblingProof) {
      return fail('answer-sibling-proof-failed');
    }
    if (kind === 'question-edit' && !questionVariantProof) return fail('question-variant-proof-failed');
    if (String(selectedPathAcquisitionState.graph?.captureIdentity || '') !== captureAtStart) {
      return fail('graph-capture-changed');
    }
    return chatAtlasFreeze({
      state: 'proven',
      reason: null,
      kind,
      order: Number(defaultPoint.order || 0),
      sharedPrefixLength: prefix,
      ownerFound: true,
      ownerRole: chatAtlasTurn2AuditRole(owner),
      ownerMessageId: chatAtlasCompleteIndexIdentity(owner.messageId) || null,
      currentRootFound: true,
      defaultRootFound: true,
      currentRootMessageId: chatAtlasCompleteIndexIdentity(currentRoot.messageId) || null,
      defaultRootMessageId: chatAtlasCompleteIndexIdentity(defaultRoot.messageId) || null,
      variantCount: Number(defaultPoint.variantCount || variantIds.length || 0),
      currentIndex,
      defaultIndex,
      requiredDirection: defaultIndex > currentIndex ? 'next' : 'previous',
      directAnswerSiblingProof,
      questionVariantProof,
      branchVectorAgreement: true,
      observedKind: null,
      currentQuestionMessageId: kind === 'question-edit'
        ? (chatAtlasCompleteIndexIdentity(currentRoot.messageId) || null) : null,
      defaultQuestionMessageId: kind === 'question-edit'
        ? (chatAtlasCompleteIndexIdentity(defaultRoot.messageId) || null) : null,
    });
  }

  // One computation per graph capture. Never cached across captures.
  function chatAtlasGraphDivergence() {
    const key = [
      String(completeTurnIndexAuthorityState.chatId || ''),
      String(completeTurnIndexAuthorityState.routeKey || ''),
      Number(completeTurnIndexAuthorityState.generation || 0),
      String(selectedPathAcquisitionState.graph?.captureIdentity || ''),
    ].join('|');
    if (chatAtlasGraphDivergenceState.key === key && chatAtlasGraphDivergenceState.value) {
      return chatAtlasGraphDivergenceState.value;
    }
    let value = null;
    try { value = chatAtlasComputeGraphDivergence(); }
    catch { value = chatAtlasGraphDivergenceEmpty('fail-closed', 'graph-divergence-threw'); }
    chatAtlasGraphDivergenceState.key = key;
    chatAtlasGraphDivergenceState.value = value;
    return value;
  }

  // ── Proof-only question-edit plan (Stage 2C-2ah8) ────────────────────────
  // Uses the UNCHANGED prover. Nothing here clicks, focuses or dispatches:
  // activation is refused by contract at this stage.
  const chatAtlasQuestionEditPlanState = {
    state: 'idle', reason: null, plan: null, activations: 0,
  };

  function chatAtlasQuestionEditSectionFor(messageId) {
    const id = chatAtlasCompleteIndexIdentity(messageId);
    if (!id) return null;
    let el = null;
    try { el = D.querySelector(`[data-message-author-role="user"][data-message-id="${id}"]`); } catch { el = null; }
    if (!el) return null;
    try { return el.closest('[data-testid^="conversation-turn-"]') || null; } catch { return null; }
  }

  function chatAtlasBuildQuestionEditPlan(divergence) {
    const record = (state, reason, plan = null) => {
      chatAtlasQuestionEditPlanState.state = state;
      chatAtlasQuestionEditPlanState.reason = reason;
      chatAtlasQuestionEditPlanState.plan = plan ? chatAtlasFreeze(plan) : null;
      return chatAtlasFreeze({ state, reason, plan: chatAtlasQuestionEditPlanState.plan });
    };
    if (divergence?.state !== 'proven' || divergence.kind !== 'question-edit') {
      return record('fail-closed', 'question-edit-divergence-unproven');
    }
    const section = chatAtlasQuestionEditSectionFor(divergence.currentQuestionMessageId);
    if (!section) return record('fail-closed', 'question-edit-control-unavailable');
    const proof = chatAtlasProveConvergenceStep(Object.freeze({
      kind: 'question-edit',
      section,
      mountedQId: divergence.currentQuestionMessageId,
      expectedQId: divergence.defaultQuestionMessageId,
      mountedAId: null,
      expectedPrimaryAId: null,
    }));
    if (proof.ok !== true) return record('fail-closed', proof.reason || 'question-edit-step-unproven');
    const controls = chatAtlasNativeEditControls(section);
    return record('ready', null, {
      kind: 'question-edit',
      ownerMessageId: divergence.ownerMessageId,
      order: divergence.order,
      variantCount: divergence.variantCount,
      currentIndex: divergence.currentIndex,
      targetIndex: divergence.defaultIndex,
      requiredDirection: divergence.requiredDirection,
      pagerOwnerId: String(controls.ownerId || ''),
      pagerOwnerProven: !!controls.ownerId
        && controls.ownerId === chatAtlasCompleteIndexIdentity(divergence.currentQuestionMessageId),
      previousAvailable: !!controls.previous,
      nextAvailable: !!controls.next,
      // This stage proves the step. It never earns the right to take it.
      activationPermitted: false,
    });
  }

  function chatAtlasConvergeDefaultNativeAnswers(computed, reason) {
    const state = completeTurnIndexAuthorityState;
    if (state.manualOverrideActive === true) {
      return Object.freeze({ ok: false, activated: false, reason: 'manual-override-active' });
    }
    const transaction = chatAtlasBranchTransactionCurrent();
    // A default convergence owns no user transaction: bind it to the graph
    // capture instead, and never open or supersede a manual one.
    const record = {
      token: String(transaction?.token || `default:${selectedPathAcquisitionState.graph?.captureIdentity || ''}`),
      chatId: String(state.chatId || ''),
      routeKey: String(state.routeKey || ''),
      generation: Number(state.generation || 0),
      origin: 'default-latest-created',
    };
    // Record the exact divergence owner before evaluating native evidence, so
    // the reveal target is always the turn that actually diverges.
    const revealTarget = chatAtlasFirstDivergenceTarget(computed.turns);
    chatAtlasDefaultOverlayState.revealTargetOrder = revealTarget.order;
    chatAtlasDefaultOverlayState.revealTargetQId = revealTarget.qId;
    chatAtlasDefaultOverlayState.revealTargetExpectedAId = revealTarget.expectedAId;
    chatAtlasDefaultOverlayState.revealTargetCurrentAId = revealTarget.currentAId;
    chatAtlasDefaultOverlayState.revealTargetDivergenceKind = revealTarget.kind;
    chatAtlasDefaultOverlayState.revealTargetReason = revealTarget.reason;
    if (revealTarget.ok !== true) {
      chatAtlasDefaultOverlayState.convergenceReason = revealTarget.reason;
      return Object.freeze({ ok: false, activated: false, reason: revealTarget.reason });
    }
    const evaluation = chatAtlasEvaluateNativeAgainstTarget(computed.turns);
    // Expected identities are recorded for EVERY outcome, so an unavailable
    // target never reports null targets.
    chatAtlasDefaultOverlayState.convergenceExpectedQId = evaluation.expectedQId;
    chatAtlasDefaultOverlayState.convergenceExpectedAId = evaluation.expectedPrimaryAId;
    chatAtlasDefaultOverlayState.convergenceEvaluation = evaluation.result;
    if (evaluation.result === 'unavailable') {
      // One bounded, reversible reveal may mount the exact target so a LATER
      // stage has a real pager to prove. This never activates a control and
      // never starts convergence: attempts stay 0 here by construction.
      try { chatAtlasRevealRunOneShot(revealTarget); } catch {}
      chatAtlasDefaultOverlayState.convergenceReason = `native-target-unavailable:${evaluation.reason}`;
      return Object.freeze({
        ok: false, activated: false, reason: 'native-target-unavailable', detail: evaluation.reason,
      });
    }
    if (evaluation.result === 'match') {
      chatAtlasDefaultOverlayState.convergenceReason = 'native-already-matches';
      return Object.freeze({ ok: true, activated: false, reason: 'native-already-matches' });
    }
    const mismatch = evaluation.mismatch;
    if (!mismatch) {
      chatAtlasDefaultOverlayState.convergenceReason = 'native-evaluation-unresolved';
      return Object.freeze({ ok: false, activated: false, reason: 'native-evaluation-unresolved' });
    }
    // The target must be fully known BEFORE anything is attempted. An answer
    // regeneration with no target answer identity is not a provable step.
    chatAtlasDefaultOverlayState.convergenceExpectedQId = mismatch.expectedQId || null;
    chatAtlasDefaultOverlayState.convergenceExpectedAId = mismatch.expectedPrimaryAId || null;
    if (!chatAtlasCompleteIndexIdentity(mismatch.expectedQId)) {
      chatAtlasDefaultOverlayState.convergenceReason = 'target-question-unproven';
      return Object.freeze({ ok: false, activated: false, reason: 'target-question-unproven' });
    }
    if (
      mismatch.kind === 'assistant-regeneration'
      && !chatAtlasCompleteIndexIdentity(mismatch.expectedPrimaryAId)
    ) {
      chatAtlasDefaultOverlayState.convergenceReason = 'target-variant-unproven';
      return Object.freeze({ ok: false, activated: false, reason: 'target-variant-unproven' });
    }
    const proof = chatAtlasProveConvergenceStep(mismatch);
    if (proof.ok !== true) {
      chatAtlasDefaultOverlayState.convergenceReason = proof.reason;
      return Object.freeze({ ok: false, activated: false, reason: proof.reason });
    }
    if (!proof.button) {
      chatAtlasDefaultOverlayState.convergenceReason = 'native-control-unavailable';
      return Object.freeze({ ok: false, activated: false, reason: 'native-control-unavailable' });
    }
    const attempts = Number(chatAtlasDefaultOverlayState.convergenceAttempts || 0);
    if (attempts >= CHAT_ATLAS_CONVERGENCE_MAX_STEPS) {
      chatAtlasDefaultOverlayState.convergenceReason = 'default-convergence-attempts-exhausted';
      return Object.freeze({ ok: false, activated: false, reason: 'default-convergence-attempts-exhausted' });
    }
    const signature = `${mismatch.kind}|${mismatch.expectedOrder}|${mismatch.mountedQId}|${mismatch.mountedAId}`;
    if (String(chatAtlasDefaultOverlayState.convergenceSignature || '') === signature) {
      chatAtlasDefaultOverlayState.convergenceReason = 'default-activation-produced-no-identity-change';
      return Object.freeze({ ok: false, activated: false, reason: 'default-activation-produced-no-identity-change' });
    }
    chatAtlasDefaultOverlayState.convergenceSignature = signature;
    chatAtlasDefaultOverlayState.convergenceAttempts = attempts + 1;
    chatAtlasDefaultOverlayState.convergenceExpectedAId = mismatch.expectedPrimaryAId;
    chatAtlasDefaultOverlayState.convergenceRecord = chatAtlasFreeze(record);
    // Our own activation is not a user selection.
    state.nativeConvergenceActivating = true;
    let clicked = 0;
    try {
      for (let step = 0; step < proof.steps; step += 1) {
        try { proof.button.click(); clicked += 1; } catch { break; }
      }
    } finally {
      state.nativeConvergenceActivating = false;
    }
    if (!clicked) {
      // The control did not run. Nothing was activated, so nothing may claim
      // it was: roll the attempt back and fail closed.
      chatAtlasDefaultOverlayState.convergenceAttempts = attempts;
      chatAtlasDefaultOverlayState.convergenceSignature = '';
      chatAtlasDefaultOverlayState.convergenceReason = 'native-control-activation-failed';
      return Object.freeze({ ok: false, activated: false, reason: 'native-control-activation-failed' });
    }
    chatAtlasBranchTransactionTrace('default-convergence-activated', {
      reason: `${proof.kind}@${mismatch.expectedOrder}:${proof.direction}:${clicked}`,
    });
    chatAtlasDefaultOverlayState.convergenceReason = 'activated-awaiting-identity';
    return Object.freeze({
      ok: true,
      activated: true,
      reason: 'default-convergence-activated',
      clicked,
      kind: proof.kind,
      expectedQId: mismatch.expectedQId,
      expectedPrimaryAId: mismatch.expectedPrimaryAId,
    });
  }

  function chatAtlasPublishDefaultLatestCreatedPath(reason = 'default-initial') {
    const state = completeTurnIndexAuthorityState;
    const record = (code, why) => {
      chatAtlasDefaultOverlayState.state = code;
      chatAtlasDefaultOverlayState.reason = why;
      // 'already-current' is a successful resolution with nothing to install.
      const alreadyCurrent = code === 'already-current';
      return Object.freeze({ ok: alreadyCurrent, reason: why, alreadyCurrent });
    };
    if (state.enabled !== true) return record('idle', 'authority-disabled');
    // A manual selection in this page session always wins.
    if (state.manualOverrideActive === true) return record('superseded', 'manual-override-active');
    const retained = selectedPathAcquisitionState.graph;
    if (
      !retained
      || retained.chatId !== String(state.chatId || '')
      || retained.routeKey !== String(state.routeKey || '')
      || Number(retained.generation || 0) !== Number(state.generation || 0)
    ) return record('waiting', 'graph-not-current');
    const captureIdentity = String(retained.captureIdentity || '');
    if (!captureIdentity) return record('waiting', 'graph-capture-unknown');
    const canonical = chatAtlasCanonicalPresentationIndex();
    if (!Array.isArray(canonical?.turns) || !canonical.turns.length) {
      return record('waiting', 'canonical-unavailable');
    }
    // Exactly one publication per (chat, route, generation, capture) — a DOM
    // mutation or a badge refresh can never turn into repeated work.
    const key = JSON.stringify([
      state.chatId, state.routeKey, Number(state.generation || 0),
      captureIdentity, String(canonical.sourceFingerprint || ''),
    ]);
    // Only a CONCLUSIVE outcome may suppress later attempts. Caching a
    // failure here was the live defect: the very first notification runs
    // before the effective index is installed, so an inconclusive comparison
    // became a permanent fail-closed for the whole page session.
    if (chatAtlasDefaultOverlayState.key === key
      && ['published', 'already-current'].includes(chatAtlasDefaultOverlayState.state)) {
      return Object.freeze({
        ok: true,
        reason: 'deduplicated',
        alreadyCurrent: chatAtlasDefaultOverlayState.state === 'already-current',
      });
    }
    const computed = chatAtlasComputeDefaultLatestCreatedPath();
    if (computed.ok !== true) {
      // Ambiguity is never guessed past: the host canonical path stays.
      chatAtlasDefaultOverlayState.terminalNodeId = null;
      chatAtlasDefaultOverlayState.terminalCreateTime = null;
      chatAtlasDefaultOverlayState.pathCount = 0;
      chatAtlasDefaultOverlayState.fingerprint = '';
      chatAtlasDefaultOverlayState.branchVectorCount = 0;
      return record('fail-closed', computed.reason);
    }
    // The default route may already BE the active path. That is a successful
    // resolution, not a failure: no overlay is required, and installing a
    // duplicate index would create a second authority for the same turns.
    let effective = null;
    try { effective = getEffectivePresentationIndex(); } catch { effective = null; }
    const effectiveTurns = Array.isArray(effective?.turns) ? effective.turns : [];
    chatAtlasDefaultOverlayState.effectiveAvailableAtCheck = effectiveTurns.length > 0;
    chatAtlasDefaultOverlayState.effectiveCountAtCheck = effectiveTurns.length;
    if (!effectiveTurns.length) {
      // Nothing to compare against yet. Defer WITHOUT caching: the existing
      // authority notification fires again once the index settles.
      chatAtlasDefaultOverlayState.samePathCheckRan = false;
      chatAtlasDefaultOverlayState.samePathResult = null;
      chatAtlasDefaultOverlayState.firstDifference = null;
      chatAtlasDefaultOverlayState.deferrals += 1;
      return record('waiting', 'effective-index-unavailable');
    }
    chatAtlasDefaultOverlayState.samePathCheckRan = true;
    const difference = chatAtlasFirstPathIdentityDifference(computed.turns, effectiveTurns);
    chatAtlasDefaultOverlayState.firstDifference = difference;
    chatAtlasDefaultOverlayState.samePathResult = difference === null;
    if (chatAtlasSamePathIdentity(computed.turns, effectiveTurns)) {
      chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
      chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
      chatAtlasDefaultOverlayState.pathCount = computed.count;
      chatAtlasDefaultOverlayState.fingerprint = computed.fingerprint;
      chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
      chatAtlasDefaultOverlayState.effectiveIdentity = chatAtlasPathIdentityKey(effectiveTurns);
      chatAtlasDefaultOverlayState.resolutions += 1;
      chatAtlasDefaultOverlayState.key = key;
      chatAtlasBranchTransactionTrace('default-already-current', { reason: `${computed.count}` });
      return record('already-current', 'canonical-already-selected');
    }
    // Classify the divergence against the canonical path. The anchor model is
    // NOT the same for both kinds, which is exactly why anchoring on the last
    // shared row rejected a legitimate answer-variant divergence.
    // First position where the two routes stop agreeing. Paths of different
    // length diverge at the end of the shorter one.
    const shared = Math.min(computed.turns.length, canonical.turns.length);
    let at = -1;
    for (let i = 0; i < shared; i += 1) {
      if (
        chatAtlasCompleteIndexIdentity(computed.turns[i]?.qId)
          !== chatAtlasCompleteIndexIdentity(canonical.turns[i]?.qId)
        || chatAtlasCompleteIndexIdentity(computed.turns[i]?.primaryAId)
          !== chatAtlasCompleteIndexIdentity(canonical.turns[i]?.primaryAId)
      ) { at = i; break; }
    }
    if (at < 0) {
      if (computed.turns.length === canonical.turns.length) {
        return record('fail-closed', 'default-canonical-identical');
      }
      at = shared;
    }
    if (at < 1) return record('fail-closed', 'default-canonical-root-mismatch');
    // Same question, different answer => the divergence is the answer variant
    // AT that turn. Anything else is a question/continuation divergence owned
    // by the last shared turn above it.
    const sameQuestionAtDifference = at < shared
      && chatAtlasCompleteIndexIdentity(computed.turns[at]?.qId)
        === chatAtlasCompleteIndexIdentity(canonical.turns[at]?.qId);
    // Answer divergence: anchor ON the differing turn. Question divergence:
    // anchor on the last shared turn, above it.
    // OBSERVATION ONLY. It still selects the presentation anchor model, which
    // is a row concern, but it may never decide the native control kind.
    const observedDivergenceKind = sameQuestionAtDifference ? 'assistant-regeneration' : 'question-edit';
    chatAtlasDefaultOverlayState.observedDivergenceKind = observedDivergenceKind;
    const graphDivergence = chatAtlasGraphDivergence();
    // Required invariant: assistant-regeneration ⇒ direct answer-root sibling
    // relationship is graph-proven ⇒ both alternatives share one variant set.
    const divergenceKind = graphDivergence.state === 'proven'
      && graphDivergence.kind === 'assistant-regeneration'
      && graphDivergence.directAnswerSiblingProof === true
      ? 'assistant-regeneration'
      : 'question-edit';
    const anchorIndex = sameQuestionAtDifference ? at : at - 1;
    const prefix = anchorIndex + 1;
    if (anchorIndex < 0 || prefix > computed.turns.length || prefix > canonical.turns.length) {
      return record('fail-closed', 'default-divergence-unresolved');
    }
    // Only an assistant-regeneration divergence may qualify for the scoped
    // canonical-question reuse exception.
    // The misclassified case, and ONLY it: the presentation rows share a qId,
    // so the old classifier called this an answer regeneration and sent it to
    // the answer converger — while the graph proves the branch edge is a
    // question edit. A divergence the observation ALREADY read as a question
    // edit is ordinary publication and is left entirely alone.
    if (
      observedDivergenceKind === 'assistant-regeneration'
      && graphDivergence.state === 'proven'
      && graphDivergence.kind === 'question-edit'
    ) {
      chatAtlasDefaultOverlayState.answerConvergenceSuppressed = true;
      chatAtlasDefaultOverlayState.nativeRoute = 'graph-proven-question-edit';
      const plan = chatAtlasBuildQuestionEditPlan(graphDivergence);
      chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
      chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
      chatAtlasDefaultOverlayState.pathCount = computed.count;
      chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
      return plan.state === 'ready'
        ? record('waiting', 'graph-proven-question-edit-plan-ready')
        : record('fail-closed', plan.reason || 'question-edit-plan-unresolved');
    }
    chatAtlasDefaultOverlayState.answerConvergenceSuppressed = false;
    chatAtlasDefaultOverlayState.nativeRoute = divergenceKind === 'assistant-regeneration'
      ? 'graph-proven-assistant-regeneration'
      : 'graph-divergence-unproven';
    const answerOnly = divergenceKind === 'assistant-regeneration'
      ? chatAtlasDefaultAnswerOnlyDivergence(computed.turns, canonical.turns)
      : Object.freeze({ ok: false, reason: 'answer-only-kind-ineligible' });
    chatAtlasDefaultOverlayState.resolutionSource = answerOnly.ok === true
      ? 'scoped-default-answer-overlay'
      : null;
    chatAtlasDefaultOverlayState.answerOnlyReason = answerOnly.reason;
    if (answerOnly.ok === true) {
      // Native content disagrees only by answer selection. Publishing here
      // would be refused by the Core parity gate — and rightly so, because the
      // old answer is still what the page renders. Converge the native pager
      // instead and let the host authority refresh settle the route.
      const converged = chatAtlasConvergeDefaultNativeAnswers(computed, reason);
      chatAtlasDefaultOverlayState.resolutionSource = 'native-convergence';
      chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
      chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
      chatAtlasDefaultOverlayState.pathCount = computed.count;
      chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
      // Only a REAL activation may be reported as one. `ok` alone is not
      // activation: the converger also returns ok for 'native-already-matches',
      // which is a non-activation and was being mislabelled here.
      if (converged.activated === true) {
        return record('converging', 'native-convergence-activated');
      }
      if (converged.ok === true && converged.reason === 'native-already-matches') {
        // Native already renders the default answers; the host authority has
        // not republished yet. Wait for it rather than claim either state.
        return record('waiting', 'native-matches-awaiting-authority-refresh');
      }
      return record('fail-closed', converged.reason || 'default-convergence-unresolved');
    }
    const anchor = computed.turns[anchorIndex];
    if (divergenceKind === 'assistant-regeneration') {
      const ownership = chatAtlasProveAnchorBranchOwnership(computed, anchorIndex);
      chatAtlasDefaultOverlayState.anchorOwnershipReason = ownership.reason || null;
      if (ownership.ok !== true) {
        return record('fail-closed', ownership.reason || 'default-anchor-branch-unproven');
      }
    }
    const anchorSelectedAId = chatAtlasCompleteIndexIdentity(anchor?.primaryAId);
    if (!anchorSelectedAId) return record('fail-closed', 'default-anchor-answer-missing');
    const token = `default:${captureIdentity}:${computed.fingerprint}`;
    if (!chatAtlasCompleteIndexIdentity(computed.rootNodeId)) {
      return record('fail-closed', 'default-root-node-unresolved');
    }
    // Same immutable shape a proven manual acquisition installs: the turns the
    // default path shares with the host canonical index ARE the canonical rows,
    // tagged as the canonical prefix; only the divergent tail is graph-derived.
    const defaultPath = chatAtlasFreeze(computed.turns.map((turn, index) => (
      index < prefix
        ? chatAtlasFreeze({
          order: Number(canonical.turns[index].order || 0),
          qId: canonical.turns[index].qId,
          turnId: canonical.turns[index].turnId,
          // The anchor row keeps the DEFAULT route's selected answer; the
          // rows above it are the host canonical rows unchanged.
          primaryAId: index === anchorIndex
            ? turn.primaryAId
            : canonical.turns[index].primaryAId,
          answerVariants: chatAtlasFreeze(Array.from(
            (index === anchorIndex ? turn.answerVariants : canonical.turns[index].answerVariants) || [],
          )),
          noAnswer: index === anchorIndex
            ? turn.noAnswer === true
            : canonical.turns[index].noAnswer === true,
          stopped: index === anchorIndex
            ? turn.stopped === true
            : canonical.turns[index].stopped === true,
          // Evidence for the default origin is the host canonical row itself.
          provenance: index === anchorIndex ? 'anchor' : 'canonical-prefix',
          confirmedByNativeEvidence: index === anchorIndex
            ? true
            : canonical.turns[index].confirmedByNativeEvidence === true,
        })
        : turn
    )));
    const proof = chatAtlasFreeze({
      anchorQId: chatAtlasCompleteIndexIdentity(anchor.qId),
      anchorSelectedAId,
      rootNodeId: computed.rootNodeId,
      tailNodeId: computed.terminalNodeId,
      pathLength: defaultPath.length,
      canonicalPrefixLength: prefix,
      canonicalFingerprint: String(canonical.sourceFingerprint || ''),
      graphCapturedAt: String(retained.identityGraph?.capturedAt || ''),
      token,
      chatId: String(state.chatId || ''),
      routeKey: String(state.routeKey || ''),
      generation: Number(state.generation || 0),
      staleRevision: 0,
      // Same reason/source discipline as a proven manual acquisition: this IS
      // a proven complete path derived from the host identity graph.
      reason: 'selected-path-proven',
      source: 'host-identity-graph',
      defaultOrigin: true,
      defaultTerminalNodeId: computed.terminalNodeId,
      defaultTerminalCreateTime: computed.terminalCreateTime,
      defaultPathFingerprint: computed.fingerprint,
      graphCaptureIdentity: captureIdentity,
      manualOverrideRevision: Number(state.manualOverrideRevision || 0),
      defaultDivergenceKind: divergenceKind,
      defaultAnswerOnlyProven: answerOnly.ok === true,
      defaultResolutionSource: answerOnly.ok === true
        ? 'scoped-default-answer-overlay'
        : 'default-latest-created-overlay',
    });
    selectedPathAcquisitionState.origin = 'default-latest-created';
    selectedPathAcquisitionState.token = token;
    selectedPathAcquisitionState.anchorQId = proof.anchorQId;
    selectedPathAcquisitionState.anchorSelectedAId = anchorSelectedAId;
    selectedPathAcquisitionState.chatId = proof.chatId;
    selectedPathAcquisitionState.routeKey = proof.routeKey;
    selectedPathAcquisitionState.generation = proof.generation;
    selectedPathAcquisitionState.staleRevision = 0;
    selectedPathAcquisitionState.status = 'proven';
    selectedPathAcquisitionState.reason = 'default-latest-created-proven';
    selectedPathAcquisitionState.path = defaultPath;
    selectedPathAcquisitionState.proof = proof;
    selectedPathAcquisitionState.provenAt = new Date().toISOString();
    chatAtlasBranchTransactionTrace('default-publish', {
      reason: `${computed.count}@${String(computed.terminalNodeId || '').slice(0, 8)}`,
    });
    let status = null;
    try {
      status = typeof chatAtlasSelectedPathOverlayEvaluate === 'function'
        ? chatAtlasSelectedPathOverlayEvaluate()
        : null;
    } catch { status = null; }
    const active = selectedPathOverlayState.status === 'active';
    chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
    chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
    chatAtlasDefaultOverlayState.pathCount = computed.count;
    chatAtlasDefaultOverlayState.fingerprint = computed.fingerprint;
    chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
    if (!active) return record('fail-closed', String(status?.reason || 'overlay-refused'));
    chatAtlasDefaultOverlayState.key = key;
    chatAtlasDefaultOverlayState.publications += 1;
    chatAtlasDefaultOverlayState.state = 'published';
    chatAtlasDefaultOverlayState.reason = reason;
    return Object.freeze({ ok: true, reason, count: computed.count });
  }

  // Branch metadata for the turns on the effective path: the active position
  // and total at each turn, for the MiniMap boxes. Alternatives never become
  // extra turns — this is metadata ON a turn, not a turn.
  function chatAtlasEffectivePathBranchBadges() {
    const out = new Map();
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return out;
    const index = getEffectivePresentationIndex();
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    for (const turn of turns) {
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, qId, 'productUser');
      if (!questionNode) continue;
      const badge = {
        questionIndex: 0, questionCount: 0, answerIndex: 0, answerCount: 0,
        qId, primaryAId: chatAtlasCompleteIndexIdentity(turn?.primaryAId) || '',
      };
      const questionVariants = chatAtlasConvergenceQuestionVariants(questionNode, scope.byId);
      if (questionVariants.length > 1) {
        const at = questionVariants.findIndex((entry) => entry.nodeId === questionNode.nodeId);
        if (at >= 0) { badge.questionIndex = at + 1; badge.questionCount = questionVariants.length; }
      }
      const answerRoots = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId);
      if (answerRoots.length > 1 && badge.primaryAId) {
        const answerNode = chatAtlasConvergenceUniqueNode(scope.graph, badge.primaryAId, 'productAnswer');
        const root = chatAtlasConvergenceBranchRoot(questionNode, answerNode, scope.byId)
          || answerRoots.find((entry) => chatAtlasAnswerIdentityForRoot(entry, scope.byId) === badge.primaryAId)
          || null;
        const at = root ? answerRoots.findIndex((entry) => entry.nodeId === root.nodeId) : -1;
        if (at >= 0) { badge.answerIndex = at + 1; badge.answerCount = answerRoots.length; }
      }
      if (badge.questionCount > 1 || badge.answerCount > 1) out.set(qId, chatAtlasFreeze(badge));
    }
    return out;
  }

  // The mounted native path, read once, compared against the effective branch.
  function chatAtlasMapMountedNativePath() {
    const index = getEffectivePresentationIndex();
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    let sections = [];
    try {
      sections = Array.from(D.querySelectorAll('[data-testid^="conversation-turn-"]'));
    } catch { sections = []; }
    // A turn's question and answer may share one container or occupy two
    // consecutive ones. Carry the open row forward so the answer is read — and
    // its pager located — under either host topology.
    const rows = [];
    let open = null;
    for (const section of sections) {
      let qEl = null;
      let aEl = null;
      try { qEl = section.querySelector?.('[data-message-author-role="user"][data-message-id]') || null; } catch {}
      try { aEl = section.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null; } catch {}
      const mountedQId = chatAtlasCompleteIndexIdentity(qEl?.getAttribute?.('data-message-id'));
      const mountedAId = chatAtlasCompleteIndexIdentity(aEl?.getAttribute?.('data-message-id')) || '';
      const pagers = chatAtlasNativeVariantPagers(section);
      if (mountedQId) {
        const turn = turns.find((entry) => chatAtlasCompleteIndexIdentity(entry?.qId) === mountedQId) || null;
        open = {
          section,
          answerSection: section,
          mountedQId,
          mountedAId: '',
          order: Number(turn?.order || 0),
          expectedQId: chatAtlasCompleteIndexIdentity(turn?.qId) || '',
          expectedPrimaryAId: chatAtlasCompleteIndexIdentity(turn?.primaryAId) || '',
          questionIndicator: String(pagers.find((p) => p.kind === 'question-edit')?.indicator || ''),
          answerIndicator: '',
          onBranch: !!turn,
          answerSeen: false,
        };
        rows.push(open);
      }
      if (mountedAId && open && !open.answerSeen) {
        open.answerSeen = true;
        open.answerSection = section;
        open.mountedAId = mountedAId;
        open.answerIndicator = String(pagers.find((p) => p.kind === 'assistant-regeneration')?.indicator || '');
      }
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      row.reason = !row.onBranch
        ? 'question-off-branch'
        : ((row.mountedAId && row.expectedPrimaryAId && row.mountedAId !== row.expectedPrimaryAId)
          ? 'answer-variant-off-branch'
          : 'agrees');
      rows[i] = Object.freeze(row);
    }
    const terminalQId = chatAtlasCompleteIndexIdentity(turns[turns.length - 1]?.qId) || '';
    let prefix = 0;
    for (const row of rows) {
      if (row.reason !== 'agrees' || row.order !== prefix + 1) break;
      prefix = row.order;
    }
    return Object.freeze({
      rows: Object.freeze(rows),
      mountedCount: rows.length,
      prefixLength: prefix,
      pathLength: turns.length,
      terminalMounted: !!terminalQId && rows.some((row) => row.mountedQId === terminalQId),
    });
  }

  // Authority contract, made observable: the graph holds EVERY branch node, the
  // effective path holds exactly one selected root-to-leaf route, and Ledger and
  // MiniMap hold exactly that route — never the alternatives. The nested branch
  // choices live in the separate selection plan, not in any linear surface.
  function chatAtlasNativeBranchPlanDiagnostics() {
    const out = {
      graphNodeCount: 0,
      effectivePathTurnCount: 0,
      ledgerTurnCount: 0,
      miniMapTurnCount: 0,
      nativeMountedTurnCount: 0,
      nativeMountedPrefixCount: 0,
      nativeTerminalMounted: false,
      nativeFirstMismatchKind: null,
      nativeFirstMismatchOrder: 0,
      nativeFirstMismatchMountedAId: null,
      nativeFirstMismatchExpectedAId: null,
      nativeBranchPlanReason: null,
      nativeBranchPlanPointCount: 0,
      nativeBranchPlanEditPointCount: 0,
      nativeBranchPlanRegenerationPointCount: 0,
      nativeBranchPlanRemainingMismatches: 0,
    };
    try {
      const graph = selectedPathAcquisitionState.graph?.identityGraph || null;
      out.graphNodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
      const index = getEffectivePresentationIndex();
      out.effectivePathTurnCount = Array.isArray(index?.turns) ? index.turns.length : 0;
      out.ledgerTurnCount = Array.isArray(chatAtlasCoreLedgerMembers())
        ? chatAtlasCoreLedgerMembers().length
        : 0;
      let miniMapRoot = null;
      try { miniMapRoot = D.querySelector(CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL); } catch {}
      if (miniMapRoot) {
        try {
          out.miniMapTurnCount = Array.from(
            miniMapRoot.querySelectorAll(CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL) || [],
          ).length;
        } catch {}
      }
      const map = chatAtlasMapMountedNativePath();
      out.nativeMountedTurnCount = map.mountedCount;
      out.nativeMountedPrefixCount = map.prefixLength;
      out.nativeTerminalMounted = map.terminalMounted === true;
      out.nativeBranchPlanRemainingMismatches = map.rows.filter((row) => row.reason !== 'agrees').length;
      const mismatch = chatAtlasFirstNativePathMismatch();
      if (mismatch) {
        out.nativeFirstMismatchKind = mismatch.kind;
        out.nativeFirstMismatchOrder = Number(mismatch.expectedOrder || 0);
        out.nativeFirstMismatchMountedAId = mismatch.mountedAId || null;
        out.nativeFirstMismatchExpectedAId = mismatch.expectedPrimaryAId || null;
      }
      const plan = chatAtlasBuildNativeBranchSelectionPlan();
      out.nativeBranchPlanReason = plan.ok === true ? null : String(plan.reason || 'unknown');
      out.nativeBranchPlanPointCount = plan.points.length;
      out.nativeBranchPlanEditPointCount = plan.points.filter((p) => p.kind === 'question-edit').length;
      out.nativeBranchPlanRegenerationPointCount = plan.points
        .filter((p) => p.kind === 'assistant-regeneration').length;
    } catch {}
    return out;
  }

  // The first mounted native turn whose identity disagrees with the published
  // effective branch — either the QUESTION variant (a user edit) or, when the
  // question already agrees, the ANSWER variant beneath it (a regeneration).
  // Returns null only when every mounted turn agrees on BOTH.
  function chatAtlasFirstNativePathMismatch(targetTurns = null) {
    // Default target is the published effective branch. The default-origin
    // convergence passes the newest-created path instead, so the SAME proven
    // machinery aligns native content with it.
    const index = targetTurns ? null : getEffectivePresentationIndex();
    const turns = Array.isArray(targetTurns)
      ? targetTurns
      : (Array.isArray(index?.turns) ? index.turns : []);
    if (!turns.length) return null;
    let sections = [];
    try {
      sections = Array.from(D.querySelectorAll('[data-testid^="conversation-turn-"]'));
    } catch { return null; }
    let lastOnBranchOrder = 0;
    // The turn whose answer has not been read yet. It stays open across one
    // container boundary so a host that splits question and answer into
    // separate turn containers is read exactly like one that groups them.
    let open = null;
    for (const section of sections) {
      let qEl = null;
      let aEl = null;
      try { qEl = section.querySelector?.('[data-message-author-role="user"][data-message-id]') || null; } catch {}
      try { aEl = section.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null; } catch {}
      const mountedQId = chatAtlasCompleteIndexIdentity(qEl?.getAttribute?.('data-message-id'));
      const mountedAId = chatAtlasCompleteIndexIdentity(aEl?.getAttribute?.('data-message-id')) || '';
      if (mountedQId) {
        const onBranch = turns.find((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === mountedQId);
        if (!onBranch) {
          // Disagreement: the branch turn this position should carry is the
          // one after the nearest preceding mounted question that IS on it.
          if (!lastOnBranchOrder) return null;
          const expected = turns.find((turn) => Number(turn?.order || 0) === lastOnBranchOrder + 1);
          if (!expected) return null;
          return Object.freeze({
            section,
            kind: 'question-edit',
            mountedQId,
            mountedAId,
            expectedQId: chatAtlasCompleteIndexIdentity(expected.qId),
            expectedPrimaryAId: chatAtlasCompleteIndexIdentity(expected.primaryAId),
            expectedOrder: Number(expected.order || 0),
          });
        }
        lastOnBranchOrder = Number(onBranch.order || 0);
        open = {
          mountedQId,
          expectedPrimaryAId: chatAtlasCompleteIndexIdentity(onBranch.primaryAId),
          order: lastOnBranchOrder,
        };
      }
      if (!mountedAId || !open) continue;
      const pending = open;
      open = null;
      // The question agrees, but the ANSWER variant mounted beneath it may
      // not. That branch point keeps every descendant unmounted while the turn
      // itself looks entirely correct — the exact live Turn-26 shape.
      if (pending.expectedPrimaryAId && mountedAId !== pending.expectedPrimaryAId) {
        return Object.freeze({
          section,
          kind: 'assistant-regeneration',
          mountedQId: pending.mountedQId,
          mountedAId,
          expectedQId: pending.mountedQId,
          expectedPrimaryAId: pending.expectedPrimaryAId,
          expectedOrder: pending.order,
        });
      }
    }
    return null;
  }

  // An indicator is only an indicator when an element's ENTIRE text is "n/m".
  // Scanning a container for the first digit-pair would read a neighbouring
  // pager's numbers — the exact way a turn carrying both an edit pager and a
  // regeneration pager loses control ownership.
  function chatAtlasConvergenceExactIndicator(el) {
    if (!el) return '';
    let nodes = [];
    try { nodes = Array.from(el.querySelectorAll?.('*') || []); } catch { nodes = []; }
    for (const node of nodes.concat([el])) {
      const match = String(node?.textContent || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) return `${match[1]}/${match[2]}`;
    }
    return '';
  }

  // Every variant pager inside one mounted turn container, each bound to the
  // message it belongs to. A turn may carry BOTH a user-edit pager and an
  // assistant-regeneration pager; ownership is structural (containment first,
  // else the nearest message preceding the pager in document order) and the
  // indicator is read from the pager's own group — never from the container,
  // never from screen position, never from visible prose.
  function chatAtlasNativeVariantPagers(section) {
    const out = [];
    if (!section) return out;
    let ordered = [];
    try {
      ordered = Array.from(section.querySelectorAll?.('[data-message-id], button') || []);
    } catch { return out; }
    const groups = new Map();
    let lastMessage = null;
    for (const node of ordered) {
      if (chatAtlasCompleteIndexIdentity(node?.getAttribute?.('data-message-id'))) {
        lastMessage = node;
        continue;
      }
      const label = String(node?.getAttribute?.('aria-label') || '').trim().toLowerCase();
      if (label !== 'previous response' && label !== 'next response') continue;
      let owner = null;
      try { owner = node.closest?.('[data-message-id]') || null; } catch {}
      if (!owner) owner = lastMessage;
      let group = node;
      let indicator = '';
      for (let hop = 0; hop < 8 && group; hop += 1) {
        indicator = chatAtlasConvergenceExactIndicator(group);
        if (indicator) break;
        group = group.parentElement || null;
      }
      const key = group || node;
      let entry = groups.get(key);
      if (!entry) {
        const ownerRole = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
        entry = {
          kind: ownerRole === 'assistant'
            ? 'assistant-regeneration'
            : (ownerRole === 'user' ? 'question-edit' : ''),
          ownerId: chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '',
          ownerRole,
          previous: null,
          next: null,
          indicator,
        };
        groups.set(key, entry);
        out.push(entry);
      }
      if (label === 'previous response' && !entry.previous) entry.previous = node;
      if (label === 'next response' && !entry.next) entry.next = node;
      if (!entry.indicator) entry.indicator = indicator;
    }
    return out;
  }

  function chatAtlasConvergencePagerOfKind(section, kind) {
    const pager = chatAtlasNativeVariantPagers(section).find((entry) => entry.kind === kind);
    return pager
      ? { previous: pager.previous, next: pager.next, indicator: pager.indicator, ownerId: pager.ownerId }
      : { previous: null, next: null, indicator: '', ownerId: '' };
  }

  // Adapter: the user-question edit pager owned by this turn.
  function chatAtlasNativeEditControls(section) {
    return chatAtlasConvergencePagerOfKind(section, 'question-edit');
  }

  // Adapter: the assistant answer/regeneration pager owned by this turn. Same
  // aria labels, different owning message — so it needs its own identity proof.
  function chatAtlasNativeRegenerationControls(section) {
    return chatAtlasConvergencePagerOfKind(section, 'assistant-regeneration');
  }

  // Prove which sibling the control must move to, from the SAME retained
  // identity graph the branch was derived from. Fails closed unless the
  // mounted identity, the sibling set and the control's own position all
  // agree — direction is a RESULT of that proof, never an input.
  function chatAtlasProveConvergenceStep(mismatch) {
    const fail = (reason) => Object.freeze({ ok: false, reason });
    if (!mismatch?.mountedQId || !mismatch?.expectedQId) return fail('mismatch-identity-missing');
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return fail(scope.reason);
    const { graph, byId } = scope;
    const kind = String(mismatch.kind || 'question-edit');
    let siblings = [];
    let currentIndex = -1;
    let targetIndex = -1;
    let controls = null;
    let ownerId = '';
    if (kind === 'assistant-regeneration') {
      // The question already agrees; the answer variant beneath it does not.
      // The pager moves between the question's answer-branch ROOTS, so both
      // the mounted and the expected answer must resolve to one of them.
      const questionNode = chatAtlasConvergenceUniqueNode(graph, mismatch.expectedQId, 'productUser');
      if (!questionNode) return fail('mounted-question-ambiguous');
      const mountedAnswer = chatAtlasConvergenceUniqueNode(graph, mismatch.mountedAId, 'productAnswer');
      if (!mountedAnswer) return fail('mounted-answer-ambiguous');
      const expectedAnswer = chatAtlasConvergenceUniqueNode(graph, mismatch.expectedPrimaryAId, 'productAnswer');
      if (!expectedAnswer) return fail('expected-answer-ambiguous');
      const currentRoot = chatAtlasConvergenceBranchRoot(questionNode, mountedAnswer, byId);
      const targetRoot = chatAtlasConvergenceBranchRoot(questionNode, expectedAnswer, byId);
      if (!currentRoot || !targetRoot) return fail('variants-not-siblings');
      siblings = chatAtlasConvergenceAnswerVariantRoots(questionNode, byId);
      currentIndex = siblings.findIndex((node) => node.nodeId === currentRoot.nodeId);
      targetIndex = siblings.findIndex((node) => node.nodeId === targetRoot.nodeId);
      controls = chatAtlasNativeRegenerationControls(mismatch.section);
      ownerId = mismatch.mountedAId;
    } else {
      const mountedNode = chatAtlasConvergenceUniqueNode(graph, mismatch.mountedQId, 'productUser');
      if (!mountedNode) return fail('mounted-question-ambiguous');
      const expectedNode = chatAtlasConvergenceUniqueNode(graph, mismatch.expectedQId, 'productUser');
      if (!expectedNode) return fail('expected-question-ambiguous');
      if (!mountedNode.parentId || mountedNode.parentId !== expectedNode.parentId) {
        return fail('variants-not-siblings');
      }
      if (!byId.get(mountedNode.parentId)) return fail('variant-parent-unavailable');
      siblings = chatAtlasConvergenceQuestionVariants(mountedNode, byId);
      currentIndex = siblings.findIndex((node) => node.nodeId === mountedNode.nodeId);
      targetIndex = siblings.findIndex((node) => node.nodeId === expectedNode.nodeId);
      controls = chatAtlasNativeEditControls(mismatch.section);
      ownerId = mismatch.mountedQId;
    }
    if (currentIndex < 0 || targetIndex < 0) return fail('variant-index-unresolved');
    if (currentIndex === targetIndex) return fail('variant-already-current');
    if (!controls.previous && !controls.next) return fail('native-control-unavailable');
    // The pager must be the one attached to the message whose variant we are
    // changing; a pager owned by the other message in this turn is not ours.
    if (controls.ownerId && ownerId && controls.ownerId !== ownerId) {
      return fail('native-control-owner-mismatch');
    }
    // The control must agree with the graph about how many variants exist and
    // which one is displayed; any disagreement is ambiguity, not a hint.
    const indicator = String(controls.indicator || '');
    const parts = indicator.split('/');
    const shownPosition = Number(parts[0] || 0);
    const shownTotal = Number(parts[1] || 0);
    if (!shownTotal || shownTotal !== siblings.length) return fail('variant-count-mismatch');
    if (shownPosition !== currentIndex + 1) return fail('variant-position-mismatch');
    const steps = targetIndex - currentIndex;
    const direction = steps > 0 ? 'next' : 'previous';
    const button = direction === 'next' ? controls.next : controls.previous;
    if (!button) return fail('native-direction-control-unavailable');
    if (Math.abs(steps) > CHAT_ATLAS_CONVERGENCE_MAX_STEPS) return fail('variant-distance-exceeded');
    return Object.freeze({
      ok: true,
      button,
      direction,
      steps: Math.abs(steps),
      siblingCount: siblings.length,
      currentIndex,
      targetIndex,
      kind,
      ownerId,
    });
  }

  function chatAtlasConvergenceScopeCurrent(record) {
    const transaction = chatAtlasBranchTransactionCurrent();
    return !!record
      && !!transaction
      && transaction.token === record.token
      && transaction.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && transaction.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(transaction.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0)
      && record.chatId === transaction.chatId
      && record.routeKey === transaction.routeKey
      && Number(record.generation || 0) === Number(transaction.generation || 0);
  }

  // One bounded convergence attempt. Returns a frozen outcome; never throws.
  function chatAtlasRunNativeConvergence(reason = 'convergence', targetTurns = null) {
    const state = completeTurnIndexAuthorityState;
    const transaction = chatAtlasBranchTransactionCurrent();
    if (!transaction || transaction.state === 'reset') {
      state.nativeConvergenceState = null;
      return Object.freeze({ ok: false, reason: 'no-transaction' });
    }
    const existing = state.nativeConvergenceState;
    // A newer capture (manual user branch/edit selection) owns the route now:
    // the older convergence action is inert and must never be replayed.
    if (existing && existing.token !== transaction.token) {
      chatAtlasConvergenceTrace('convergence-superseded', { reason: existing.token });
      state.nativeConvergenceState = null;
    }
    if (state.nativeConvergenceState?.phase === 'fail-closed') {
      return Object.freeze({ ok: false, reason: state.nativeConvergenceState.reason });
    }
    const mismatch = chatAtlasFirstNativePathMismatch(targetTurns);
    if (!mismatch) {
      // Every mounted branch point agrees. Convergence is only COMPLETE when
      // the descendants actually materialised through the terminal turn; an
      // agreeing but short prefix is the host failing to expand, and it is
      // reported as exactly that rather than being called success.
      const map = chatAtlasMapMountedNativePath();
      const complete = targetTurns ? true : map.terminalMounted === true;
      if (state.nativeConvergenceState) {
        state.nativeConvergenceState = Object.freeze({
          ...state.nativeConvergenceState,
          phase: complete ? 'confirmed' : 'fail-closed',
          reason: complete ? 'native-path-matches-through-terminal' : 'native-prefix-short-of-terminal',
          prefixLength: map.prefixLength,
          pathLength: map.pathLength,
        });
        chatAtlasConvergenceTrace(complete ? 'convergence-confirmed' : 'convergence-fail-closed', {
          reason: complete ? reason : `prefix-short:${map.prefixLength}/${map.pathLength}`,
        });
      }
      return Object.freeze({
        ok: complete,
        reason: complete ? 'native-path-matches-through-terminal' : 'native-prefix-short-of-terminal',
        converged: complete,
        prefixLength: map.prefixLength,
        pathLength: map.pathLength,
      });
    }
    // A proven activation must change the native identity it acted on. If the
    // same branch point is still mounted with the same identities after we
    // already activated its control, clicking again is not convergence.
    const priorRecord = state.nativeConvergenceState;
    const mismatchSignature = `${mismatch.kind}|${mismatch.expectedOrder}|${mismatch.mountedQId}|${mismatch.mountedAId}`;
    if (
      priorRecord
      && priorRecord.phase === 'activated'
      && String(priorRecord.mismatchSignature || '') === mismatchSignature
    ) {
      state.nativeConvergenceState = Object.freeze({
        ...priorRecord,
        phase: 'fail-closed',
        reason: 'activation-produced-no-identity-change',
      });
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: 'no-identity-change' });
      return Object.freeze({ ok: false, reason: 'activation-produced-no-identity-change' });
    }
    const attempts = Number(state.nativeConvergenceState?.attempts || 0);
    if (attempts >= CHAT_ATLAS_CONVERGENCE_MAX_STEPS) {
      state.nativeConvergenceState = Object.freeze({
        token: transaction.token,
        chatId: transaction.chatId,
        routeKey: transaction.routeKey,
        generation: transaction.generation,
        phase: 'fail-closed',
        reason: 'convergence-attempts-exhausted',
        attempts,
      });
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: 'attempts-exhausted' });
      return Object.freeze({ ok: false, reason: 'convergence-attempts-exhausted' });
    }
    const proof = chatAtlasProveConvergenceStep(mismatch);
    if (proof.ok !== true) {
      state.nativeConvergenceState = Object.freeze({
        token: transaction.token,
        chatId: transaction.chatId,
        routeKey: transaction.routeKey,
        generation: transaction.generation,
        phase: 'fail-closed',
        reason: proof.reason,
        attempts,
        expectedQId: mismatch.expectedQId,
        mountedQId: mismatch.mountedQId,
      });
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: proof.reason });
      return Object.freeze({ ok: false, reason: proof.reason });
    }
    const record = {
      token: transaction.token,
      chatId: transaction.chatId,
      routeKey: transaction.routeKey,
      generation: transaction.generation,
      expectedQId: mismatch.expectedQId,
      expectedPrimaryAId: mismatch.expectedPrimaryAId,
      mountedQId: mismatch.mountedQId,
      mountedAId: mismatch.mountedAId,
      phase: 'activated',
      reason: 'variant-proven',
      attempts: attempts + 1,
      direction: proof.direction,
      steps: proof.steps,
      kind: proof.kind,
      ownerId: proof.ownerId,
      expectedOrder: Number(mismatch.expectedOrder || 0),
      mismatchSignature,
    };
    if (!chatAtlasConvergenceScopeCurrent(record)) {
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: 'scope-drift' });
      return Object.freeze({ ok: false, reason: 'scope-drift' });
    }
    state.nativeConvergenceState = Object.freeze(record);
    // Our own activation is the execution of an ALREADY captured user intent,
    // not a new one: suppress trusted capture for its duration so it cannot
    // open a competing transaction or supersede the branch it is serving.
    state.nativeConvergenceActivating = true;
    let clicked = 0;
    try {
      for (let step = 0; step < proof.steps; step += 1) {
        try { proof.button.click(); clicked += 1; } catch { break; }
      }
    } finally {
      state.nativeConvergenceActivating = false;
    }
    chatAtlasConvergenceTrace('convergence-activated', {
      reason: `${proof.kind}@${mismatch.expectedOrder}:${proof.direction}:${clicked}`,
    });
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return Object.freeze({
      ok: true,
      reason: 'variant-activated',
      kind: proof.kind,
      direction: proof.direction,
      steps: proof.steps,
      clicked,
      expectedQId: mismatch.expectedQId,
      expectedPrimaryAId: mismatch.expectedPrimaryAId,
    });
  }

  // Post-activation proof: the mounted identity at that exact position must
  // now BE the expected one. Anything else is not convergence.
  function chatAtlasConfirmNativeConvergence(reason = 'convergence-confirm') {
    const record = completeTurnIndexAuthorityState.nativeConvergenceState;
    if (!record || record.phase !== 'activated') return false;
    if (!chatAtlasConvergenceScopeCurrent(record)) {
      completeTurnIndexAuthorityState.nativeConvergenceState = null;
      chatAtlasConvergenceTrace('convergence-superseded', { reason: 'scope-drift' });
      return false;
    }
    let mountedQ = null;
    try {
      mountedQ = D.querySelector(`[data-message-author-role="user"][data-message-id="${record.expectedQId}"]`);
    } catch {}
    if (!mountedQ) return false;
    // A regeneration step only landed when the expected ANSWER is mounted too.
    if (record.kind === 'assistant-regeneration' && record.expectedPrimaryAId) {
      let mountedA = null;
      try {
        mountedA = D.querySelector(`[data-message-author-role="assistant"][data-message-id="${record.expectedPrimaryAId}"]`);
      } catch {}
      if (!mountedA) return false;
    }
    // The step landed. The TRANSACTION is only confirmed when no branch point
    // still disagrees and the path materialised through its terminal turn;
    // otherwise convergence continues at the next proven branch point.
    const remaining = chatAtlasFirstNativePathMismatch();
    const map = chatAtlasMapMountedNativePath();
    const complete = !remaining && map.terminalMounted === true;
    completeTurnIndexAuthorityState.nativeConvergenceState = Object.freeze({
      ...record,
      phase: complete ? 'confirmed' : 'converging',
      reason: complete ? 'expected-identity-mounted' : 'step-landed-path-incomplete',
      prefixLength: map.prefixLength,
      pathLength: map.pathLength,
    });
    chatAtlasConvergenceTrace(complete ? 'convergence-confirmed' : 'convergence-step-landed', {
      reason: complete ? reason : `${record.kind || 'question-edit'}@${record.expectedOrder || 0}`,
    });
    return true;
  }

  function chatAtlasCompleteIndexNativeBranchButton(event) {
    const branchLabel = (node) => {
      if (String(node?.tagName || '').toUpperCase() !== 'BUTTON') return '';
      const label = String(node?.getAttribute?.('aria-label') || '').trim().toLowerCase();
      return (label === 'previous response' || label === 'next response') ? label : '';
    };
    try {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
      for (const node of Array.isArray(path) ? path : []) {
        if (branchLabel(node)) return node;
      }
    } catch {}
    let closest = null;
    try { closest = event?.target?.closest?.('button') || null; } catch { closest = null; }
    return closest && branchLabel(closest) ? closest : null;
  }

  function chatAtlasCompleteIndexNativeBranchDirection(event) {
    if (event?.isTrusted !== true) return '';
    const button = chatAtlasCompleteIndexNativeBranchButton(event);
    const label = String(button?.getAttribute?.('aria-label') || '').trim().toLowerCase();
    if (label === 'previous response') return 'previous';
    if (label === 'next response') return 'next';
    return '';
  }

  function chatAtlasTrustedNativeBranchOwnership(event) {
    // DOM topology may only IDENTIFY the clicked branch control's candidate
    // message IDs (nested SVG/span targets included). Durable authority comes
    // exclusively from a UNIQUE match against the host-proven canonical index:
    // a user message ID must equal exactly one canonical qId, or an assistant
    // answer ID must belong to exactly one canonical turn (primary or same-qId
    // variant). Zero matches, duplicate ownership, or candidates resolving to
    // different turns all fail closed to an untrusted (token-free) capture.
    const button = chatAtlasCompleteIndexNativeBranchButton(event);
    if (!button) return { ok: false, qId: '', reason: 'capture-owner-unresolved' };
    // The real ChatGPT layout groups a turn's user/assistant messages and its
    // Previous/Next branch controls under one conversation-turn container
    // (<div data-testid="conversation-turn-N">) — NOT an <article>. Resolve
    // the owning scope in that order first (the same anchor existing browser
    // scripts use via closest('[data-testid^="conversation-turn-"]')), then
    // keep the legacy article / message-id ancestors as bounded fallbacks.
    let scope = null;
    try {
      scope = button.closest?.('[data-testid^="conversation-turn-"]')
        || button.closest?.('article')
        || button.closest?.('[data-message-id]')
        || null;
    } catch { scope = null; }
    const candidates = [];
    try {
      const nodes = scope?.querySelectorAll?.('[data-message-id]') || [];
      for (const node of nodes) candidates.push(node);
    } catch {}
    if (!candidates.length && scope?.getAttribute?.('data-message-id')) candidates.push(scope);
    const userIds = [];
    const assistantIds = [];
    for (const node of candidates) {
      const id = chatAtlasCompleteIndexIdentity(node?.getAttribute?.('data-message-id'));
      if (!id) continue;
      const role = String(node?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
      if (role === 'user' && !userIds.includes(id)) userIds.push(id);
      if (role === 'assistant' && !assistantIds.includes(id)) assistantIds.push(id);
    }
    if (!userIds.length && !assistantIds.length) {
      return { ok: false, qId: '', reason: 'capture-owner-unresolved' };
    }
    const turns = Array.isArray(completeTurnIndexAuthorityState.index?.turns)
      ? completeTurnIndexAuthorityState.index.turns
      : [];
    if (!turns.length) return { ok: false, qId: '', reason: 'capture-owner-not-canonical' };
    const resolved = new Set();
    let userResolved = false;
    let answerResolved = false;
    for (const id of userIds) {
      const owners = turns.filter((turn) => turn?.qId === id);
      if (owners.length > 1) return { ok: false, qId: '', reason: 'capture-owner-ambiguous' };
      if (owners.length === 1) {
        resolved.add(owners[0].qId);
        userResolved = true;
      }
    }
    for (const id of assistantIds) {
      const owners = turns.filter((turn) => turn?.primaryAId === id
        || (Array.isArray(turn?.answerVariants) && turn.answerVariants.includes(id)));
      if (owners.length > 1) return { ok: false, qId: '', reason: 'capture-owner-ambiguous' };
      if (owners.length === 1) {
        resolved.add(owners[0].qId);
        answerResolved = true;
      }
    }
    if (!resolved.size) return { ok: false, qId: '', reason: 'capture-owner-not-canonical' };
    if (resolved.size > 1) return { ok: false, qId: '', reason: 'capture-owner-ambiguous' };
    // The clicked branch control is the CURRENT assistant answer's pager, so
    // when an assistant answer id uniquely identifies the owning turn that is
    // the branch-specific signal — report it as the resolution method even if
    // the same turn's user qId also matched (both agree on one turn here).
    return {
      ok: true,
      qId: resolved.values().next().value,
      currentAnswerId: assistantIds.length === 1 ? assistantIds[0] : '',
      reason: answerResolved ? 'capture-owner-answer-resolved' : 'capture-owner-qid-resolved',
    };
  }

  function chatAtlasRecordTrustedNativeBranchSelection(event) {
    // Convergence activates a native control to EXECUTE the already captured
    // intent. Treating that synthetic click as a new user selection would
    // open a competing transaction and supersede the branch it is serving.
    if (completeTurnIndexAuthorityState.nativeConvergenceActivating === true) return false;
    const direction = chatAtlasCompleteIndexNativeBranchDirection(event);
    const route = chatAtlasFullIndexRoute();
    if (
      !direction
      || !completeTurnIndexAuthorityState.enabled
      || !route.chatId
      || route.chatId !== completeTurnIndexAuthorityState.chatId
      || route.routeKey !== completeTurnIndexAuthorityState.routeKey
    ) {
      if (direction) {
        chatAtlasTraceTrustedLifecycle('trusted-capture-rejected', {
          direction,
          chat: route.chatId || '',
          reason: !completeTurnIndexAuthorityState.enabled
            ? 'authority-disabled'
            : (!route.chatId
              ? 'route-chat-missing'
              : (route.chatId !== completeTurnIndexAuthorityState.chatId
                ? 'chat-mismatch'
                : 'route-mismatch')),
        });
      }
      return false;
    }
    const observedAt = Date.now();
    const priorIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const priorEffectiveIndex = typeof getEffectivePresentationIndex === 'function'
      ? getEffectivePresentationIndex()
      : completeTurnIndexAuthorityState.index;
    const priorEffectiveCount = Array.isArray(priorEffectiveIndex?.turns)
      ? priorEffectiveIndex.turns.length
      : 0;
    const priorEffectiveFingerprint = String(priorEffectiveIndex?.sourceFingerprint || '');
    const priorPresentationStatus = typeof getEffectivePresentationStatus === 'function'
      ? getEffectivePresentationStatus()
      : null;
    const branchButton = chatAtlasCompleteIndexNativeBranchButton(event);
    const eventStamp = Number(event?.timeStamp);
    let scopeIdentity = '';
    try {
      const scope = branchButton?.closest?.('[data-testid^="conversation-turn-"]') || null;
      scopeIdentity = String(scope?.getAttribute?.('data-testid') || '').trim().slice(0, 128);
    } catch {}
    const deliveryIdentity = (
      branchButton
      && Number.isFinite(eventStamp)
      && eventStamp > 0
    )
      ? `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        Number(completeTurnIndexAuthorityState.generation || 0),
        route.chatId,
        route.routeKey,
        direction,
        String(event?.type || 'click').slice(0, 16),
        eventStamp,
        Number(event?.detail || 0),
        Number(event?.button || 0),
        Number(event?.pointerId || 0),
        scopeIdentity,
      ]))}`
      : '';
    const duplicateDelivery = !!priorIntent
      && !!deliveryIdentity
      && deliveryIdentity === String(priorIntent.deliveryIdentity || '')
      && Math.max(0, observedAt - Number(priorIntent.observedAt || 0)) <= 1000;
    if (duplicateDelivery) {
      chatAtlasTraceTrustedLifecycle('trusted-capture-deduplicated', {
        direction,
        chat: route.chatId,
        qId: priorIntent.qId,
        token: priorIntent.token,
        reason: 'same-native-click-delivery',
      });
      if (typeof scheduleChatAtlasLedgerFlush === 'function') {
        scheduleChatAtlasLedgerFlush('trusted-native-branch-click-deduplicated');
      }
      return true;
    }
    if (typeof chatAtlasResetBranchExpansionLifecycle === 'function') {
      chatAtlasResetBranchExpansionLifecycle('newer-trusted-capture');
    }
    completeTurnIndexAuthorityState.trustedSelectionSequence += 1;
    completeTurnIndexAuthorityState.trustedSelectionCaptureCount += 1;
    const tokenIdentity = [
      Number(completeTurnIndexAuthorityState.generation || 0),
      route.chatId,
      route.routeKey,
      completeTurnIndexAuthorityState.trustedSelectionSequence,
      direction,
      observedAt,
    ];
    const token = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(tokenIdentity))}`;
    chatAtlasTraceTrustedLifecycle('trusted-capture-created', {
      direction,
      chat: route.chatId,
      token,
    });
    if (priorIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: 'superseded-by-newer-capture',
        qId: priorIntent.qId,
        token: priorIntent.token,
      });
    }
    // The clicked control's owning canonical qId resolves and freezes NOW, at
    // capture, from DOM topology verified against the host-proven index. The
    // intent never binds lazily to a first-observed changed turn: a capture
    // whose ownership is unresolved, non-canonical, or ambiguous produces NO
    // trusted intent and the click degrades to generic untrusted observation.
    const ownership = chatAtlasTrustedNativeBranchOwnership(event);
    chatAtlasTraceTrustedLifecycle('trusted-bind-attempt', { token, qId: ownership.qId });
    if (ownership.ok !== true) {
      if (priorIntent) {
        completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
        if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
          chatAtlasClearSelectedPathOverlay('trusted-intent-superseded');
        }
        if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
          chatAtlasClearSelectedPathAcquisition('trusted-intent-superseded', {
            preserveGraph: true,
            resetRefetchGuard: true,
          });
        }
      }
      // A newer click that fails ownership must still cancel any prior click's
      // pending post-event reconciliation task.
      chatAtlasCancelTrustedNativeBranchReconcile();
      chatAtlasTraceTrustedLifecycle('trusted-bind-skipped', { reason: ownership.reason, token });
      return false;
    }
    chatAtlasTraceTrustedLifecycle('trusted-bind-success', {
      qId: ownership.qId,
      token,
      reason: ownership.reason,
    });
    const generation = Number(completeTurnIndexAuthorityState.generation || 0);
    const staleAlreadyCurrent = completeTurnIndexAuthorityState.branchSelectionStale === true
      && String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '') === ownership.qId
      && String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '') === route.chatId
      && String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '') === route.routeKey
      && Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0) === generation;
    const staleRevision = staleAlreadyCurrent
      ? Math.max(1, Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0))
      : Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0) + 1;
    const priorPresentationSource = priorPresentationStatus?.overlayActive === true
      ? 'selected-path-overlay'
      : (typeof selectedPathAcquisitionState !== 'undefined'
        && selectedPathAcquisitionState.graph
        ? 'retained-selected-path-graph'
        : String(priorPresentationStatus?.source || ''));
    const returnTargetCandidate = typeof chatAtlasCaptureBranchReturnCandidate === 'function'
      ? chatAtlasCaptureBranchReturnCandidate({
        token,
        qId: ownership.qId,
        priorAnswerId: ownership.currentAnswerId,
        direction,
        chatId: route.chatId,
        routeKey: route.routeKey,
        generation,
        staleRevision,
        priorEffectiveCount,
        priorEffectiveFingerprint,
        priorPresentationSource,
      }, priorEffectiveIndex)
      : null;
    if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
      chatAtlasClearSelectedPathOverlay(
        priorIntent ? 'trusted-intent-superseded' : 'trusted-intent-created',
      );
    }
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(
        priorIntent ? 'trusted-intent-superseded' : 'trusted-intent-created',
        {
          preserveGraph: true,
          resetRefetchGuard: true,
        },
      );
    }
    // The ownership and route checks above have already proven the exact
    // canonical qId and scope. Mark only this memory-only passive state; the
    // reconciliation scheduler below remains independently gated.
    completeTurnIndexAuthorityState.branchSelectionStale = true;
    completeTurnIndexAuthorityState.branchSelectionStaleRevision = staleRevision;
    completeTurnIndexAuthorityState.branchSelectionStaleQId = ownership.qId;
    completeTurnIndexAuthorityState.branchSelectionStaleChatId = route.chatId;
    completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = route.routeKey;
    completeTurnIndexAuthorityState.branchSelectionStaleGeneration = generation;
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
      token,
      chatId: route.chatId,
      routeKey: route.routeKey,
      generation,
      direction,
      qId: ownership.qId,
      priorAnswerId: ownership.currentAnswerId,
      staleRevision,
      observedAt,
      openedAt: observedAt,
      priorEffectiveCount,
      priorEffectiveFingerprint,
      returnTargetCandidate,
      deliveryIdentity,
      interactionIdentity: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        deliveryIdentity,
        ownership.qId,
        ownership.currentAnswerId,
        direction,
      ]))}`,
    });
    // The production runtime owns this notifier. Isolated function-extraction
    // This is a genuine trusted user branch action — self-generated
    // convergence clicks returned above and never reach here. It takes
    // ownership of the session, so the default newest-created origin becomes
    // inert until a reload or a route/generation reset.
    try { chatAtlasMarkManualBranchOverride('trusted-native-branch-click'); } catch {}
    // harnesses may intentionally omit it while still exercising Gate 5.
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    if (typeof scheduleChatAtlasLedgerFlush === 'function') {
      // A newer manual selection owns the route: the older convergence action
      // is inert and must never force the previous route back.
      completeTurnIndexAuthorityState.nativeConvergenceState = null;
      chatAtlasOpenBranchTransaction(completeTurnIndexAuthorityState.trustedSelectedPathIntent);
      scheduleChatAtlasLedgerFlush('trusted-native-branch-click');
    }
    // The captured qId is already uniquely and canonically known, so trusted
    // reconciliation is DRIVEN by the capture — it never waits for generic
    // live-change inspection to rediscover this qId (the real ChatGPT branch
    // transition only reports downstream changed turns, so that rediscovery
    // never happens). Defer past native event propagation, then enqueue one
    // bounded trusted request for this exact qId/token through the coordinator.
    chatAtlasScheduleTrustedNativeBranchReconcile(token);
    return true;
  }

  function chatAtlasCancelTrustedNativeBranchReconcile() {
    if (completeTurnIndexAuthorityState.trustedNativeReconcileTask != null) {
      try { (W.clearTimeout || clearTimeout)(completeTurnIndexAuthorityState.trustedNativeReconcileTask); } catch {}
      completeTurnIndexAuthorityState.trustedNativeReconcileTask = null;
    }
  }

  function chatAtlasScheduleTrustedNativeBranchReconcile(token, options = {}) {
    // A real native branch click is user-driven work, not automatic
    // reconciliation: it always schedules its single bounded post-event task,
    // memory canary or not. The Round 1 canary continues to gate only the
    // generic-inspection (automatic) lane, whose evidence stays untrusted
    // while the canary is false. Without this, a fresh reload (canary always
    // false) left every branch click with a bound intent that nothing ever
    // consumed: zero fetches, hundreds of rejected signals, and authority
    // stuck on the outgoing branch.
    // The same single task also owns the later expiry wakeup. A newer click,
    // terminal clear, or re-arm cancels the prior task, and every callback
    // re-checks the live token before doing work.
    const expiryWakeup = options?.expiryWakeup === true;
    const delayMs = expiryWakeup
      ? Math.max(0, Number(options?.delayMs || 0))
      : 0;
    chatAtlasCancelTrustedNativeBranchReconcile();
    completeTurnIndexAuthorityState.trustedNativeReconcileTask = (W.setTimeout || setTimeout)(() => {
      completeTurnIndexAuthorityState.trustedNativeReconcileTask = null;
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (!intent || intent.token !== token) return;
      if (expiryWakeup) {
        // Never duplicate the age/route/transaction/request-ownership
        // predicate here. This read is the existing canonical expiry path.
        const current = chatAtlasCurrentTrustedNativeBranchSelection(intent.qId);
        if (!current || current.token !== token) return;

        // Legitimate live work may survive the first legal deadline. Give its
        // existing bounded refresh/confirmation/expansion windows further
        // opportunities, but never create permanent polling: all re-arms end
        // at one cap derived only from existing lifecycle limits.
        const now = Date.now();
        const trustedWindowMs = Math.max(
          1,
          Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000),
        );
        const hardStopAt = Number(intent.observedAt || now)
          + CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS
          + CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS
          + Math.max(100, Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.timeoutMs || 4500))
          + Math.max(100, Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.selectedPathConfirmationDelayMs || 1250))
          + trustedWindowMs
          + 1;
        if (now >= hardStopAt) return;
        chatAtlasScheduleTrustedNativeBranchReconcile(token, {
          expiryWakeup: true,
          delayMs: Math.max(1, Math.min(trustedWindowMs + 1, hardStopAt - now)),
        });
        return;
      }

      chatAtlasRunTrustedNativeBranchReconcile(token);
      const currentIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (!currentIntent || currentIntent.token !== token) return;
      let staleLease = false;
      try {
        const refresh = completeIndexRefreshCoordinator?.getStatus?.();
        staleLease = refresh?.selectedPathRequestLeaseActive === true
          && refresh?.requestActive !== true
          && refresh?.timerPending !== true
          && refresh?.selectedPathConfirmationPending !== true
          && completeIndexRefreshCoordinator?.selectedPathRequestOwnsIntent?.(currentIntent) !== true;
      } catch {}
      // Normal accepted work owns its request lease and already has bounded
      // debounce/request/confirmation callbacks. Arm no extra timer there.
      // The expiry task exists only for the diagnosed quiescent stale lease.
      if (!staleLease) return;
      const returnWindow = typeof chatAtlasPreExpansionCanonicalReturnWindow === 'function'
        ? chatAtlasPreExpansionCanonicalReturnWindow(currentIntent)
        : Object.freeze({ active: false });
      const allowedAgeMs = returnWindow.active === true
        ? CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS
        : Math.max(0, Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000));
      const ageDeadlineAt = Number(currentIntent.observedAt || Date.now()) + allowedAgeMs + 1;
      const transaction = completeTurnIndexAuthorityState.branchTransactionState;
      const transactionDeadlineAt = transaction?.state === 'pending'
        && transaction.token === token
        ? Number(transaction.openedAt || Date.now()) + CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS + 1
        : ageDeadlineAt;
      chatAtlasScheduleTrustedNativeBranchReconcile(token, {
        expiryWakeup: true,
        delayMs: Math.max(0, Math.max(ageDeadlineAt, transactionDeadlineAt) - Date.now()),
      });
    }, delayMs);
  }

  function chatAtlasRunTrustedNativeBranchReconcile(token) {
    // Re-validate the live intent by exact qId: token match plus the standard
    // route/chat/generation/gate/age authority the lookup enforces. Any change
    // since capture (route/gate/generation/supersede/expiry) leaves this a
    // safe no-op, so the post-event task is fully token/route/gate scoped.
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent || intent.token !== token) return;

    const publishedAnchorQId = typeof selectedPathOverlayState !== 'undefined'
      ? chatAtlasCompleteIndexIdentity(selectedPathOverlayState.anchorQId)
      : '';
    const publishedQuestionSiblingSupersedesIntent = !!(
      typeof chatAtlasSelectedPathOverlayCurrent === 'function'
      && typeof chatAtlasQuestionEditSiblingProof === 'function'
      && typeof selectedPathAcquisitionState !== 'undefined'
      && chatAtlasSelectedPathOverlayCurrent()
      && publishedAnchorQId
      && publishedAnchorQId !== intent.qId
      && chatAtlasQuestionEditSiblingProof(
        selectedPathAcquisitionState.graph?.identityGraph,
        intent.qId,
        publishedAnchorQId,
      )
    );
    if (publishedQuestionSiblingSupersedesIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-reconcile-skipped', {
        reason: 'trusted-qid-superseded-by-published-sibling',
        qId: publishedAnchorQId,
        boundQId: intent.qId,
        token,
      });
      return;
    }

    const current = chatAtlasCurrentTrustedNativeBranchSelection(intent.qId);
    if (!current || current.token !== token) return;
    const evidence = chatAtlasCompleteIndexSelectedPathEvidence('trusted-native-branch-click', {
      qId: intent.qId,
    });
    if (!evidence || evidence.trusted !== true || evidence.selectionToken !== token) return;
    chatAtlasTraceTrustedLifecycle('trusted-native-branch-click', {
      qId: intent.qId,
      token,
      direction: intent.direction,
    });
    // The complete identity graph is commonly retained by the initial full
    // index load before the native branch click. Re-evaluate that current
    // graph after native event propagation instead of waiting for another
    // byte-identical host envelope to arrive. A missing graph remains the
    // coordinator's bounded acquisition case; any terminal derivation result
    // retains the transaction decision made by the single publication owner.
    const retainedPublication = chatAtlasTryPublishRetainedBranchTransaction(
      'trusted-native-retained-graph',
    );
    if (retainedPublication?.published === true) return;
    if (
      retainedPublication?.handled === true
      && retainedPublication.reason !== 'branch-transaction-graph-pending'
    ) return;
    void chatAtlasScheduleCompleteIndexRefresh(evidence.cause, { selectedPathEvidence: evidence });
  }

  function chatAtlasCurrentTrustedNativeBranchSelection(qIdRaw = '') {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent) return null;
    const qId = chatAtlasCompleteIndexIdentity(qIdRaw);
    const age = Math.max(0, Date.now() - Number(intent.observedAt || 0));
    // Route/generation/age carry the click's genuine authority; only those
    // expire the shared trusted intent. The intent's qId is resolved and
    // frozen AT CAPTURE from the clicked control's canonically verified owner
    // (chatAtlasTrustedNativeBranchOwnership); a lookup can therefore only
    // ever match that exact qId. There is no lazy binding, so a
    // mid-conversation cascade's other changed turns can never adopt,
    // consume, or destroy the trusted token — the live
    // GATE_5_BRANCH_CONFIRMATION_NOT_REFLECTED wrong-first-turn binding.
    const expansionPending = completeTurnIndexAuthorityState.branchExpansionState === 'pending'
      && completeTurnIndexAuthorityState.branchExpansionLease?.token === intent.token;
    let requestOwnedRefetch = false;
    if (typeof selectedPathAcquisitionState !== 'undefined') {
      const acquisition = selectedPathAcquisitionState;
      const acquisitionScopeCurrent = acquisition.token === intent.token
        && acquisition.refetchAttemptedForToken === intent.token
        && acquisition.refetchActiveForToken === intent.token
        && acquisition.anchorQId === intent.qId
        && acquisition.chatId === intent.chatId
        && acquisition.routeKey === intent.routeKey
        && Number(acquisition.generation || 0) === Number(intent.generation || 0)
        && Number(acquisition.staleRevision || 0) === Number(intent.staleRevision || 0);
      if (acquisitionScopeCurrent && typeof completeIndexRefreshCoordinator !== 'undefined') {
        try {
          requestOwnedRefetch = completeIndexRefreshCoordinator
            ?.selectedPathRequestOwnsIntent?.(intent) === true;
        } catch {}
      }
    }
    const returnExpansionWindow = typeof chatAtlasPreExpansionCanonicalReturnWindow === 'function'
      ? chatAtlasPreExpansionCanonicalReturnWindow(intent)
      : Object.freeze({ active: false });
    const allowedAgeMs = returnExpansionWindow.active === true
      ? CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS
      : Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000);
    const activeTransaction = chatAtlasBranchTransactionCurrent({
      suppressTrustedExpiryReentry: true,
    });
    const transactionOwned = activeTransaction?.state === 'pending'
      && activeTransaction.token === intent.token;
    const ageExpired = !expansionPending
      && !requestOwnedRefetch
      && !transactionOwned
      && age > allowedAgeMs;
    const authoritative = completeTurnIndexAuthorityState.enabled
      && intent.chatId === completeTurnIndexAuthorityState.chatId
      && intent.routeKey === completeTurnIndexAuthorityState.routeKey
      && intent.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && !ageExpired;
    if (!authoritative) {
      let expiredRequestLeaseCleared = false;
      if (ageExpired && returnExpansionWindow.active === true) {
        chatAtlasFailClosedPreExpansionReturn(intent, returnExpansionWindow);
        return null;
      }
      if (ageExpired) {
        try {
          expiredRequestLeaseCleared = completeIndexRefreshCoordinator
            ?.clearExpiredSelectedPathRequestLeaseForIntent?.(intent, 'trusted-intent-expired') === true;
        } catch {}
      }
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      if (typeof chatAtlasCancelTrustedNativeBranchReconcile === 'function') {
        chatAtlasCancelTrustedNativeBranchReconcile();
      }
      // Expiry retires the INTENT, not the outcome. A selection whose branch
      // transaction already published owns the acquisition record until the
      // normal route/generation reset clears it; clearing here rewrote a
      // completed selection into a false 'trusted-intent-expired'.
      if (
        typeof chatAtlasClearSelectedPathAcquisition === 'function'
        && !chatAtlasSelectedPathPublishedForToken(intent.token)
      ) {
        chatAtlasClearSelectedPathAcquisition(
          ageExpired ? 'trusted-intent-expired' : 'trusted-intent-scope-changed',
          { preserveGraph: true },
        );
      }
      chatAtlasTraceTrustedLifecycle(ageExpired ? 'trusted-intent-expired' : 'trusted-intent-cleared', {
        reason: ageExpired
          ? 'age-window-exceeded'
          : (!completeTurnIndexAuthorityState.enabled
            ? 'authority-disabled'
            : (intent.chatId !== completeTurnIndexAuthorityState.chatId
              ? 'chat-mismatch'
              : (intent.routeKey !== completeTurnIndexAuthorityState.routeKey
                ? 'route-mismatch'
                : 'generation-mismatch'))),
        qId: intent.qId || qId,
        token: intent.token,
        age,
      });
      // Expiry clears this lease outside the coordinator's ordinary onState
      // publication path. Publish once after the intent/acquisition mutations
      // are final; the existing complete-index consumer coalesces its rebuild
      // and reaches 0C3a through the public page-structure seam.
      if (
        expiredRequestLeaseCleared
        && typeof chatAtlasNotifyCompleteIndexState === 'function'
      ) chatAtlasNotifyCompleteIndexState();
      return null;
    }
    if (!qId || intent.qId !== qId) {
      if (qId) {
        chatAtlasTraceTrustedLifecycle('trusted-bind-skipped', {
          reason: 'trusted-qid-mismatch',
          qId,
          boundQId: intent.qId,
          token: intent.token,
        });
      }
      return null;
    }
    return intent;
  }

  function chatAtlasCompleteIndexSelectedPathEvidenceCurrent(evidence) {
    const intent = chatAtlasCurrentTrustedNativeBranchSelection(evidence?.qId);
    return !!intent && !!evidence?.selectionToken && intent.token === evidence.selectionToken;
  }

  function chatAtlasCompleteIndexSelectedPathLeaseCurrent(evidence) {
    // Lease validity for a trusted request the coordinator has ALREADY
    // accepted. The five-second capture age window governed capture->bind->
    // trusted-schedule and is deliberately NOT re-applied here: a slow but
    // valid provider response must not convert into a false cancellation.
    // Only a genuinely NEWER trusted capture (a different LIVE token)
    // invalidates the lease; route/chat/gate/generation/reset changes cancel
    // it immediately through the coordinator's own cancel paths instead.
    if (!evidence?.selectionToken) return false;
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (intent && intent.token !== evidence.selectionToken) return false;
    if (!intent) {
      chatAtlasTraceTrustedLifecycle('confirmation-lease-retained', {
        qId: evidence.qId,
        token: evidence.selectionToken,
        reason: 'capture-intent-expired',
      });
    }
    return true;
  }

  function chatAtlasResolveTrustedNativeBranchSelection(evidence, resolutionRaw = 'resolved') {
    const resolution = chatAtlasCompleteIndexCode(resolutionRaw, 'resolved', 48);
    if (resolution === 'confirmed') {
      chatAtlasTraceTrustedLifecycle('confirmation-confirmed', {
        qId: evidence?.qId,
        token: evidence?.selectionToken,
        trusted: evidence?.trusted === true,
      });
    } else if (resolution === 'unconfirmed' || resolution === 'failed') {
      chatAtlasTraceTrustedLifecycle('confirmation-unconfirmed', {
        qId: evidence?.qId,
        token: evidence?.selectionToken,
        reason: resolution,
      });
    } else {
      chatAtlasTraceTrustedLifecycle('confirmation-cancelled', {
        qId: evidence?.qId,
        token: evidence?.selectionToken,
        reason: resolution,
      });
    }
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const expansionOwnsIntent = completeTurnIndexAuthorityState.branchExpansionState === 'pending'
      && completeTurnIndexAuthorityState.branchExpansionLease?.token === intent?.token;
    // A client-side branch switch never moves the server's current_node, so
    // the refetch legitimately comes back "unconfirmed" while the selected
    // branch is still being acquired from the graph. Clearing the intent here
    // aborted that in-flight acquisition at its scope-drift guard and froze
    // authority on the outgoing branch. An unconfirmed resolution therefore
    // must not retire the intent while the token-matched acquisition is still
    // in flight (or proven but not yet published as the current overlay).
    // The pending branch transaction — not the refetch flight alone — owns
    // the intent through graph derivation AND atomic publication. Even a host
    // "confirmed" answer at the anchor is not proof that the returned flat
    // index is the complete selected branch; clearing here admitted the live
    // 26-turn current_node prefix before the full graph path could publish.
    const transaction = chatAtlasBranchTransactionCurrent();
    const transactionOwnsIntent = !!intent
      && transaction?.state === 'pending'
      && transaction.token === intent.token;
    if (transactionOwnsIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-intent-retained', {
        reason: `transaction-owns-${resolution}`,
        qId: intent.qId,
        token: intent.token,
      });
      chatAtlasBranchTransactionTrace('resolution-retained', { reason: resolution });
      return;
    }
    if (intent && evidence?.selectionToken === intent.token && !expansionOwnsIntent) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      chatAtlasCancelTrustedNativeBranchReconcile();
      if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
        chatAtlasClearSelectedPathAcquisition(`trusted-intent-resolved-${resolution}`, { preserveGraph: true });
      }
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: `resolved-${resolution}`,
        qId: intent.qId,
        token: intent.token,
      });
    }
  }

  function chatAtlasCompleteIndexSelectedPathEvidence(causeRaw, detail = {}) {
    const cause = chatAtlasCompleteIndexCode(causeRaw, 'selected-path-changed', 64);
    if (![
      'question-branch-changed',
      'question-selected-path-changed',
      'answer-branch-changed',
      'trusted-native-branch-click',
    ].includes(cause)) return null;
    const captureDriven = cause === 'trusted-native-branch-click';
    const index = completeTurnIndexAuthorityState.index;
    const qId = chatAtlasCompleteIndexIdentity(
      detail?.qId || detail?.questionId || detail?.turn?.qId,
    );
    const observedAnswerId = chatAtlasCompleteIndexIdentity(
      detail?.observedAnswerId
      || detail?.selectedAnswerId
      || detail?.primaryAId
      || detail?.answerId
      || detail?.turn?.primaryAId,
    );
    // The capture-driven request derives its baseline (pre-click) primary from
    // the host-proven canonical index for the captured qId — never from DOM or
    // click direction — so confirmation later depends only on the host payload
    // moving off that baseline.
    const baselineAnswerId = captureDriven
      ? chatAtlasCompleteIndexIdentity(
        (Array.isArray(index?.turns) ? index.turns.find((turn) => turn?.qId === qId) : null)?.primaryAId,
      )
      : '';
    // Round 1 shared reconciliation-authorization gate. The trusted-selection
    // lookup still runs (it preserves the frozen capture intent + canonical qId
    // binding + expiry/route diagnostics that the future passive stale-state
    // badge needs), but while automatic branch reconciliation is DEFERRED the
    // evidence is NOT authorized as trusted and carries NO usable reconciliation
    // token. This is the single narrowest choke point covering EVERY trusted
    // reconciliation entry: the capture-driven Path 1 (run guard) AND the
    // generic-inspection Path 2 (chatAtlasInspectCompleteIndexLiveChanges /
    // chatAtlasHandleCompleteIndexTurnEvent) both obtain their trust here, so
    // neither can schedule a refresh/request/confirmation/mutation when the gate
    // is false. The accepted Gate 5 algorithm is unchanged and re-authorizes
    // the moment the memory-only qualification gate is enabled.
    // Capture-driven evidence (a real native branch click with a live, bound,
    // route-scoped intent) is authorized on its own: the user's click is the
    // authority. The memory canary continues to gate only the generic
    // inspection lane, whose causes are never capture-driven.
    const reconciliationAllowed = completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true
      || captureDriven === true
      // Ledger-driven selected-path causes are user-driven work while the
      // click's intent is alive: the trusted lookup below still enforces the
      // exact captured anchor (a non-anchor qId resolves null and stays
      // untrusted), so this authorizes only the clicked transition.
      || !!completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const trustedSelection = reconciliationAllowed
      ? chatAtlasCurrentTrustedNativeBranchSelection(qId)
      : null;
    const authorizedToken = reconciliationAllowed ? String(trustedSelection?.token || '') : '';
    const identity = [
      Number(completeTurnIndexAuthorityState.generation || 0),
      String(completeTurnIndexAuthorityState.chatId || ''),
      qId,
      observedAnswerId,
      String(index?.sourceFingerprint || ''),
      String(index?.payloadUpdateTime ?? ''),
      cause,
      authorizedToken,
      captureDriven ? `baseline:${baselineAnswerId}` : '',
    ];
    const evidence = Object.freeze({
      signature: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identity))}`,
      cause,
      qId,
      observedAnswerId,
      trusted: reconciliationAllowed && !!trustedSelection,
      selectionToken: authorizedToken,
      baselineAnswerId,
      expectChange: captureDriven,
    });
    chatAtlasTraceTrustedLifecycle('selected-evidence-created', {
      cause,
      qId,
      trusted: evidence.trusted,
      token: evidence.selectionToken,
      signature: evidence.signature,
    });
    return evidence;
  }

  function chatAtlasCompleteIndexSelectedPathConfirmed(index, evidence) {
    if (!index?.complete || !evidence?.qId || !Array.isArray(index?.turns)) return false;
    const turn = index.turns.find((candidate) => candidate?.qId === evidence.qId);
    if (!turn) return false;
    // Capture-driven trusted reconciliation knows the captured turn's PRE-click
    // primary (its canonical baseline) but never the incoming answer — the host
    // payload alone decides that. It is confirmed once the host-proven primary
    // for the captured qId differs from that baseline; direction is never used
    // to guess the new answer. Until then the first refresh stays "unchanged"
    // and schedules exactly one delayed confirmation.
    if (evidence.expectChange === true) {
      return !!evidence.baselineAnswerId && turn.primaryAId !== evidence.baselineAnswerId;
    }
    if (!evidence.observedAnswerId) return true;
    return turn.primaryAId === evidence.observedAnswerId;
  }

  function chatAtlasCompleteIndexCacheKey(chatIdRaw) {
    const chatId = chatAtlasCompleteIndexIdentity(chatIdRaw);
    return chatId ? `${COMPLETE_TURN_INDEX_CACHE_KEY_PREFIX}${chatId}` : '';
  }

  function chatAtlasCompleteIndexExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).slice().sort();
    const wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function chatAtlasNormalizeCompleteIndexEnvelope(raw, chatIdRaw, opts = {}) {
    const source = String(opts?.source || 'host').trim() === 'cache' ? 'cache' : 'host';
    const chatId = chatAtlasCompleteIndexIdentity(chatIdRaw);
    const fail = (errorCode) => ({ ok: false, errorCode, envelope: null });
    if (!chatId || !raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('complete-index-envelope-invalid');
    if (source === 'cache' && !chatAtlasCompleteIndexExactKeys(raw, COMPLETE_TURN_INDEX_CACHE_KEYS)) {
      return fail('complete-index-cache-fields-invalid');
    }
    if (Number(raw?.schema) !== COMPLETE_TURN_INDEX_CACHE_SCHEMA) return fail('complete-index-schema-unsupported');
    if (chatAtlasCompleteIndexIdentity(raw?.chatId) !== chatId) return fail('complete-index-chat-mismatch');
    const complete = source === 'cache' ? raw?.complete === true : raw?.completeness?.complete === true;
    const proof = String(source === 'cache' ? raw?.proof : raw?.completeness?.proof || '').trim();
    if (!complete || proof !== 'host-payload-full-graph') return fail('complete-index-proof-invalid');
    if (!Array.isArray(raw?.turns) || raw.turns.length === 0 || raw.turns.length > 5000) {
      return fail('complete-index-turns-invalid');
    }

    const internalQIds = new Set(COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS);
    const seenQIds = new Set();
    const answerOwners = new Map();
    const turns = [];
    for (let index = 0; index < raw.turns.length; index += 1) {
      const row = raw.turns[index];
      if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('complete-index-row-invalid');
      if (source === 'cache' && !chatAtlasCompleteIndexExactKeys(row, COMPLETE_TURN_INDEX_ROW_KEYS)) {
        return fail('complete-index-row-fields-invalid');
      }
      const order = Number(row?.order);
      const qId = chatAtlasCompleteIndexIdentity(row?.qId);
      const turnId = String(row?.turnId || '').trim();
      if (!Number.isInteger(order) || order !== index + 1 || !qId || turnId !== `turn:${qId}`) {
        return fail('complete-index-row-identity-invalid');
      }
      if (seenQIds.has(qId) || internalQIds.has(qId)) return fail('complete-index-question-identity-invalid');
      seenQIds.add(qId);
      if (!Array.isArray(row?.answerVariants)) return fail('complete-index-answer-variants-invalid');
      const answerVariants = [];
      for (const value of row.answerVariants) {
        const answerId = chatAtlasCompleteIndexIdentity(value);
        if (!answerId || answerVariants.includes(answerId)) return fail('complete-index-answer-identity-invalid');
        const owner = answerOwners.get(answerId);
        if (owner && owner !== qId) return fail('complete-index-answer-ownership-conflict');
        answerOwners.set(answerId, qId);
        answerVariants.push(answerId);
      }
      if (
        answerVariants.some((answerId) => !answerId.startsWith('request-placeholder-'))
        && answerVariants.some((answerId) => answerId.startsWith('request-placeholder-'))
      ) return fail('complete-index-placeholder-invalid');
      const primaryAId = row?.primaryAId == null ? null : chatAtlasCompleteIndexIdentity(row.primaryAId);
      if (row?.primaryAId != null && !primaryAId) return fail('complete-index-primary-invalid');
      if (typeof row?.noAnswer !== 'boolean' || typeof row?.stopped !== 'boolean') {
        return fail('complete-index-answer-state-invalid');
      }
      if (row.noAnswer) {
        if (primaryAId || (answerVariants.length && row.stopped !== true)) {
          return fail('complete-index-no-answer-invalid');
        }
      } else if (!primaryAId || !answerVariants.length || answerVariants[answerVariants.length - 1] !== primaryAId) {
        return fail('complete-index-primary-invalid');
      }
      turns.push(Object.freeze({
        order,
        qId,
        turnId,
        answerVariants: Object.freeze(answerVariants),
        primaryAId,
        noAnswer: row.noAnswer,
        stopped: row.stopped,
      }));
    }

    const sourceFingerprint = String(raw?.sourceFingerprint || '').trim();
    if (!sourceFingerprint || sourceFingerprint !== chatAtlasCompleteIndexFingerprint(turns)) {
      return fail('complete-index-fingerprint-invalid');
    }
    const payloadUpdateTime = raw?.payloadUpdateTime;
    if (payloadUpdateTime != null && typeof payloadUpdateTime !== 'string' && typeof payloadUpdateTime !== 'number') {
      return fail('complete-index-payload-revision-invalid');
    }
    if (typeof payloadUpdateTime === 'number' && !Number.isFinite(payloadUpdateTime)) {
      return fail('complete-index-payload-revision-invalid');
    }
    const capturedAt = String(raw?.capturedAt || '').slice(0, 64);
    const validatedAt = String(
      source === 'cache'
        ? raw?.validatedAt
        : (raw?.completeness?.validatedAt || raw?.capturedAt || new Date().toISOString()),
    ).slice(0, 64);
    if (!capturedAt || !validatedAt) return fail('complete-index-timestamp-invalid');
    const envelope = Object.freeze({
      schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
      chatId,
      payloadUpdateTime: payloadUpdateTime == null ? null : payloadUpdateTime,
      sourceFingerprint,
      capturedAt,
      validatedAt,
      complete: true,
      proof: 'host-payload-full-graph',
      turns: Object.freeze(turns),
    });
    return { ok: true, errorCode: null, envelope };
  }

  function chatAtlasCompareCompleteIndexRevision(incomingRaw, retainedRaw) {
    const comparable = (raw) => {
      if (raw == null || raw === '') return { rank: 0, value: 0 };
      if (typeof raw === 'number' && Number.isFinite(raw)) return { rank: 2, value: raw };
      const text = String(raw).trim();
      const numeric = Number(text);
      if (text && Number.isFinite(numeric)) return { rank: 2, value: numeric };
      const timestamp = Date.parse(text);
      if (Number.isFinite(timestamp)) return { rank: 2, value: timestamp };
      return { rank: 1, value: text };
    };
    const incoming = comparable(incomingRaw);
    const retained = comparable(retainedRaw);
    if (incoming.rank !== retained.rank) return incoming.rank > retained.rank ? 1 : -1;
    if (incoming.value === retained.value) return 0;
    return incoming.value > retained.value ? 1 : -1;
  }

  function chatAtlasReadCompleteIndexCache(chatIdRaw) {
    const key = chatAtlasCompleteIndexCacheKey(chatIdRaw);
    if (!key) return { ok: false, status: 'cache-key-invalid', envelope: null, raw: null };
    completeTurnIndexAuthorityState.cacheReadCount += 1;
    let raw = null;
    try { raw = W.localStorage?.getItem?.(key) ?? null; } catch {
      return { ok: false, status: 'cache-read-failed', envelope: null, raw: null };
    }
    if (raw == null || raw === '') return { ok: false, status: 'cache-missing', envelope: null, raw };
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      return { ok: false, status: 'cache-json-invalid', envelope: null, raw };
    }
    const normalized = chatAtlasNormalizeCompleteIndexEnvelope(parsed, chatIdRaw, { source: 'cache' });
    return normalized.ok
      ? { ok: true, status: 'cache-valid', envelope: normalized.envelope, raw }
      : { ok: false, status: normalized.errorCode, envelope: null, raw };
  }

  function chatAtlasCompleteIndexCacheIdentityBytes(envelope) {
    return JSON.stringify({
      schema: envelope?.schema,
      chatId: envelope?.chatId,
      payloadUpdateTime: envelope?.payloadUpdateTime ?? null,
      sourceFingerprint: envelope?.sourceFingerprint,
      complete: envelope?.complete === true,
      proof: envelope?.proof,
      turns: envelope?.turns,
    });
  }

  function chatAtlasWriteCompleteIndexCache(envelope) {
    const normalized = chatAtlasNormalizeCompleteIndexEnvelope(envelope, envelope?.chatId, { source: 'cache' });
    const key = chatAtlasCompleteIndexCacheKey(envelope?.chatId);
    if (!key || !normalized.ok) return { ok: false, status: normalized.errorCode || 'cache-key-invalid', bytes: null };
    const bytes = JSON.stringify(normalized.envelope);
    const retainedRaw = completeTurnIndexAuthorityState.cacheRaw;
    if (typeof retainedRaw === 'string' && retainedRaw) {
      try {
        const retainedParsed = JSON.parse(retainedRaw);
        const retained = chatAtlasNormalizeCompleteIndexEnvelope(retainedParsed, envelope?.chatId, { source: 'cache' });
        if (
          retained.ok
          && chatAtlasCompleteIndexCacheIdentityBytes(retained.envelope)
            === chatAtlasCompleteIndexCacheIdentityBytes(normalized.envelope)
        ) {
          completeTurnIndexAuthorityState.cacheWriteSkippedUnchangedCount += 1;
          return { ok: true, status: 'cache-write-skipped-unchanged', bytes: retainedRaw, skipped: true };
        }
      } catch {}
    }
    try {
      W.localStorage?.setItem?.(key, bytes);
      completeTurnIndexAuthorityState.cacheRaw = bytes;
      completeTurnIndexAuthorityState.cacheWriteCount += 1;
      return { ok: true, status: 'cache-written', bytes };
    } catch {
      completeTurnIndexAuthorityState.cacheWriteFailureCount += 1;
      return { ok: false, status: 'cache-write-failed', bytes: null };
    }
  }

  function chatAtlasCompleteIndexAuthorityActive() {
    const route = chatAtlasFullIndexRoute();
    return completeTurnIndexAuthorityState.enabled === true
      && !!route.chatId
      && route.chatId === completeTurnIndexAuthorityState.chatId
      && route.routeKey === completeTurnIndexAuthorityState.routeKey
      && Number.isInteger(completeTurnIndexAuthorityState.generation)
      && completeTurnIndexAuthorityState.generation > 0
      && COMPLETE_TURN_INDEX_COMPLETE_STATUSES.includes(completeTurnIndexAuthorityState.status)
      && completeTurnIndexAuthorityState.index?.complete === true
      && completeTurnIndexAuthorityState.index?.proof === 'host-payload-full-graph'
      && Array.isArray(completeTurnIndexAuthorityState.index?.turns)
      && completeTurnIndexAuthorityState.index.turns.length > 0;
  }

  function chatAtlasCompleteIndexCanonicalDrafts(index = completeTurnIndexAuthorityState.index) {
    if (!index || !Array.isArray(index.turns)) return [];
    return index.turns.map((turn, position) => ({
      turnNo: position + 1,
      qId: turn.qId,
      primaryAId: turn.primaryAId,
      answerIds: turn.answerVariants.slice(),
      aliasIds: [turn.turnId, ...turn.answerVariants],
      hasQuestion: true,
      hasAssistant: !turn.noAnswer,
      noAnswer: turn.noAnswer,
      stopped: turn.stopped,
      completeIndexAuthority: true,
      completenessProvenance: index.proof,
      payloadUpdateTime: index.payloadUpdateTime,
      sourceFingerprint: index.sourceFingerprint,
      structure: {
        segmentId: 1,
        flowIdentity: `complete-index:${index.chatId}`,
        structureKnown: true,
        selectedPathEligible: true,
        pairingContiguous: true,
        currentQuestionProof: true,
        unpairedAssistant: false,
        questionOrdinal: position,
        answerOrdinals: turn.answerVariants.map((_id, answerIndex) => position + answerIndex + 1),
      },
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    }));
  }

  function chatAtlasCompleteIndexPendingDraftEligible(draft, index) {
    const qId = chatAtlasCompleteIndexIdentity(draft?.qId);
    if (!qId || !draft?.live?.connected || !canonicalDraftHasStructuralQuestionProof(draft)) return false;
    if (COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS.includes(qId)) return false;
    if (index.turns.some((turn) => turn.qId === qId)) return false;
    const answers = (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
      .map((value) => chatAtlasCompleteIndexIdentity(value))
      .filter(Boolean);
    return answers.length === 0 || answers.every((answerId) => isStreamingAnswerPlaceholderId(answerId));
  }

  function chatAtlasQueueCompleteIndexStateNotify() {
    if (completeTurnIndexAuthorityState.pendingStateNotifyQueued) return;
    completeTurnIndexAuthorityState.pendingStateNotifyQueued = true;
    Promise.resolve().then(() => {
      completeTurnIndexAuthorityState.pendingStateNotifyQueued = false;
      if (completeTurnIndexAuthorityState.enabled) chatAtlasNotifyCompleteIndexState();
    });
  }

  function chatAtlasScheduleCompleteIndexRefresh(cause = 'turn-settled', opts = {}) {
    if (!completeTurnIndexAuthorityState.enabled || !completeIndexRefreshCoordinator) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const transaction = chatAtlasBranchTransactionCurrent();
    if (opts?.selectedPathEvidence && transaction?.state === 'fail-closed') {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const retained = selectedPathAcquisitionState.graph;
    const retainedEvaluationCurrent = opts?.selectedPathEvidence
      && transaction?.state === 'pending'
      && transaction.graphCaptureIdentity
      && transaction.graphCaptureIdentity === String(retained?.captureIdentity || '')
      && transaction.graphEvaluationKey === JSON.stringify([
        transaction.token,
        transaction.graphCaptureIdentity,
        chatAtlasCompleteIndexIdentity(
          completeTurnIndexAuthorityState.trustedSelectedPathIntent
            ?.returnTargetCandidate?.targetVariantAnswerId
            || selectedPathAcquisitionState.anchorSelectedAId,
        ),
      ]);
    if (retainedEvaluationCurrent) {
      chatAtlasSelectedPathEvaluate(chatAtlasCoreLedgerMembers());
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    return completeIndexRefreshCoordinator.schedule(cause, opts);
  }

  function chatAtlasInspectCompleteIndexLiveChanges(source, index) {
    if (!completeTurnIndexAuthorityState.enabled || !index?.turns?.length) return;
    const indexedByQId = new Map(index.turns.map((turn) => [turn.qId, turn]));
    const pendingQIds = new Set(completeTurnIndexAuthorityState.pendingDrafts.keys());
    let refreshCause = '';
    let selectedPathEvidence = null;
    // A single trusted native click yields one shared intent that binds to the
    // turn the user switched (the upstream-most changed turn, processed first in
    // document order). A mid-conversation switch also changes downstream turns
    // whose evidence is untrusted; keep the trusted upstream evidence rather
    // than letting a later untrusted (or stopped/null) turn overwrite it.
    const keepSelectedPathEvidence = (evidence) => {
      if (selectedPathEvidence?.trusted === true && evidence?.trusted !== true) {
        chatAtlasTraceTrustedLifecycle('selected-evidence-replaced', {
          reason: 'kept-trusted-evidence',
          cause: evidence?.cause || refreshCause,
          qId: evidence?.qId,
          trusted: false,
        });
        return;
      }
      if (selectedPathEvidence && evidence && evidence !== selectedPathEvidence) {
        chatAtlasTraceTrustedLifecycle('selected-evidence-replaced', {
          reason: 'overwritten',
          cause: evidence.cause,
          qId: evidence.qId,
          trusted: evidence.trusted === true,
          signature: evidence.signature,
        });
      }
      selectedPathEvidence = evidence;
    };
    for (const draft of Array.isArray(source) ? source : []) {
      const qId = chatAtlasCompleteIndexIdentity(draft?.qId);
      if (!qId || COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS.includes(qId)) continue;
      const answers = (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
        .map((value) => chatAtlasCompleteIndexIdentity(value))
        .filter(Boolean);
      const realAnswers = answers.filter((answerId) => !isStreamingAnswerPlaceholderId(answerId));
      if (pendingQIds.has(qId)) {
        if (realAnswers.length || draft?.stopped === true) refreshCause = draft?.stopped === true ? 'turn-stopped' : 'turn-settled';
        continue;
      }
      const indexed = indexedByQId.get(qId);
      if (!indexed) {
        const selectedPrimary = chatAtlasCompleteIndexIdentity(draft?.primaryAId);
        if (
          canonicalDraftHasStructuralQuestionProof(draft)
          && (realAnswers.length || (!!selectedPrimary && !isStreamingAnswerPlaceholderId(selectedPrimary)))
        ) {
          refreshCause = 'question-selected-path-changed';
          keepSelectedPathEvidence(chatAtlasCompleteIndexSelectedPathEvidence(refreshCause, {
            qId,
            observedAnswerId: selectedPrimary || realAnswers[realAnswers.length - 1] || '',
          }));
        }
        continue;
      }
      const selectedPrimary = chatAtlasCompleteIndexIdentity(draft?.primaryAId);
      const variantChanged = realAnswers.some((answerId) => !indexed.answerVariants.includes(answerId));
      const primaryChanged = !!selectedPrimary
        && !isStreamingAnswerPlaceholderId(selectedPrimary)
        && selectedPrimary !== indexed.primaryAId;
      const stoppedChanged = draft?.stopped === true && indexed.stopped !== true;
      const noAnswerChanged = draft?.noAnswer === true && indexed.noAnswer !== true && draft?.stopped === true;
      if (variantChanged || primaryChanged) {
        refreshCause = 'answer-branch-changed';
        const changedVariant = realAnswers.find((answerId) => !indexed.answerVariants.includes(answerId)) || '';
        keepSelectedPathEvidence(chatAtlasCompleteIndexSelectedPathEvidence(refreshCause, {
          qId,
          observedAnswerId: primaryChanged ? selectedPrimary : changedVariant,
        }));
      } else if (stoppedChanged || noAnswerChanged) {
        refreshCause = 'turn-stopped';
        keepSelectedPathEvidence(null);
      }
    }
    if (refreshCause) {
      void chatAtlasScheduleCompleteIndexRefresh(refreshCause, selectedPathEvidence
        ? { selectedPathEvidence }
        : {});
    }
  }

  function chatAtlasCompleteIndexLiveDrafts(liveDrafts, index) {
    const source = Array.isArray(liveDrafts) ? liveDrafts : [];
    const qIds = new Set(index.turns.map((turn) => turn.qId));
    const answerIds = new Set(index.turns.flatMap((turn) => turn.answerVariants));
    const suppressForeignMembership = chatAtlasBranchTransitionSuppressesLiveAppend();
    for (const qId of qIds) {
      completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
      completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
    }
    if (suppressForeignMembership) {
      for (const qId of Array.from(completeTurnIndexAuthorityState.pendingDrafts.keys())) {
        if (qIds.has(qId)) continue;
        completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
        completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
      }
    }
    const eligiblePending = source.filter((draft) => chatAtlasCompleteIndexPendingDraftEligible(draft, index));
    const latestPending = suppressForeignMembership
      ? null
      : (eligiblePending[eligiblePending.length - 1] || null);
    if (suppressForeignMembership && eligiblePending.length) {
      completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount += eligiblePending.length;
      completeIndexRefreshCoordinator?.markPending?.(0);
    }
    if (latestPending) {
      const alreadyPending = completeTurnIndexAuthorityState.pendingDrafts.has(latestPending.qId);
      const pendingDraft = slimTurnDraft(latestPending);
      completeTurnIndexAuthorityState.pendingDrafts.set(latestPending.qId, {
        ...pendingDraft,
        completeIndexPending: true,
        livePendingProvenance: 'live-pending-overlay',
      });
      if (!alreadyPending) completeTurnIndexAuthorityState.pendingObservedAt.set(latestPending.qId, Date.now());
      completeIndexRefreshCoordinator?.markPending?.(completeTurnIndexAuthorityState.pendingDrafts.size);
      chatAtlasQueueCompleteIndexStateNotify();
    }
    chatAtlasInspectCompleteIndexLiveChanges(source, index);
    const matched = source.filter((draft) => {
      const qId = chatAtlasCompleteIndexIdentity(draft?.qId);
      if (qId && qIds.has(qId)) return true;
      return (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
        .some((answerId) => answerIds.has(chatAtlasCompleteIndexIdentity(answerId)));
    });
    if (latestPending) matched.push(latestPending);
    return matched;
  }

  function chatAtlasCompleteIndexPendingCanonicalDrafts(index) {
    const qIds = new Set(index.turns.map((turn) => turn.qId));
    if (chatAtlasBranchTransitionSuppressesLiveAppend()) {
      let suppressed = 0;
      for (const qId of Array.from(completeTurnIndexAuthorityState.pendingDrafts.keys())) {
        if (qIds.has(qId)) continue;
        completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
        completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
        suppressed += 1;
      }
      completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount += suppressed;
      if (suppressed) completeIndexRefreshCoordinator?.markPending?.(0);
      return [];
    }
    const out = [];
    for (const [qId, draft] of completeTurnIndexAuthorityState.pendingDrafts.entries()) {
      if (!qId || qIds.has(qId)) continue;
      out.push({
        ...draft,
        completeIndexPending: true,
        livePendingProvenance: 'live-pending-overlay',
      });
    }
    return out;
  }

  // Branch metadata for the turns on the effective path, keyed by qId. One
  // entry per branching turn; alternatives never become extra entries.
  // ── Effective-path identity accessor (Stage 2C-2aj2) ─────────────────────
  // A NEW getter. getCompleteTurnIndexProjectionStatus() is a pinned surface
  // and stays byte-identical; consumers that must notice a selected-branch
  // change which leaves the canonical envelope untouched read this instead.
  // Read-only and content-free: counts, enums and hashes.
  function getChatAtlasEffectivePathIdentity() {
    let effective = null;
    let status = null;
    try { effective = getEffectivePresentationIndex(); } catch {}
    try { status = getEffectivePresentationStatus(); } catch {}
    const turns = Array.isArray(effective?.turns) ? effective.turns : [];
    const identity = chatAtlasPathIdentityKey(turns);
    return chatAtlasFreeze({
      version: 1,
      available: true,
      effectiveCount: turns.length,
      effectiveFingerprint: String(effective?.sourceFingerprint || '') || null,
      effectivePathIdentity: `djb2:${chatAtlasCompleteIndexStableHash(identity)}`,
      // Folds in chat, generation and overlay-vs-canonical so a selected-branch
      // change is visible even when the canonical envelope is unchanged.
      effectivePathRevision: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        String(completeTurnIndexAuthorityState.chatId || ''),
        Number(completeTurnIndexAuthorityState.generation || 0),
        status?.overlayActive === true ? 'overlay' : 'canonical',
        identity,
      ]))}`,
      effectiveSource: String(status?.source || 'canonical'),
      overlayActive: status?.overlayActive === true,
      overlayPathLength: Number(status?.pathLength || 0),
    });
  }

  function getChatAtlasBranchBadges() {
    const out = [];
    try {
      for (const [, badge] of chatAtlasEffectivePathBranchBadges()) {
        out.push(Object.freeze({
          qId: badge.qId,
          primaryAId: badge.primaryAId || null,
          questionBranchIndex: Number(badge.questionIndex || 0),
          questionBranchCount: Number(badge.questionCount || 0),
          answerBranchIndex: Number(badge.answerIndex || 0),
          answerBranchCount: Number(badge.answerCount || 0),
        }));
      }
    } catch {}
    return Object.freeze(out);
  }

  function getChatAtlasDefaultLatestCreatedPath() {
    try {
      const result = chatAtlasComputeDefaultLatestCreatedPath();
      return Object.freeze({
        ok: result.ok === true,
        reason: result.reason,
        terminalNodeId: result.terminalNodeId,
        terminalMessageId: result.terminalMessageId,
        terminalCreateTime: result.terminalCreateTime,
        count: result.count,
        fingerprint: result.fingerprint,
        source: result.source,
        branchVector: result.branchVector,
      });
    } catch {
      return Object.freeze({
        ok: false, reason: 'default-path-unavailable', terminalNodeId: null,
        terminalMessageId: null, terminalCreateTime: null, count: 0,
        fingerprint: '', source: 'latest-created-terminal', branchVector: Object.freeze([]),
      });
    }
  }

  function getCompleteTurnIndexProjectionStatus() {
    const index = completeTurnIndexAuthorityState.index;
    const refresh = completeIndexRefreshCoordinator?.getStatus?.() || null;
    const pendingCount = completeTurnIndexAuthorityState.pendingDrafts.size;
    const completeCount = Array.isArray(index?.turns) ? index.turns.length : 0;
    return chatAtlasFreeze({
      canary: COMPLETE_TURN_INDEX_CANARY,
      enabled: completeTurnIndexAuthorityState.enabled,
      memoryOnly: true,
      defaultEnabled: COMPLETE_TURN_INDEX_COMPILED_DEFAULT,
      compiledDefault: COMPLETE_TURN_INDEX_COMPILED_DEFAULT,
      persistedOptInSupported: true,
      activationSource: completeTurnIndexAuthorityState.activationSource,
      status: completeTurnIndexAuthorityState.status,
      authoritative: chatAtlasCompleteIndexAuthorityActive(),
      chatId: completeTurnIndexAuthorityState.chatId,
      routeGeneration: completeTurnIndexAuthorityState.generation,
      count: completeCount,
      completeCount,
      pendingCount,
      projectedCount: completeCount + pendingCount,
      source: completeTurnIndexAuthorityState.indexSource,
      fingerprint: String(index?.sourceFingerprint || '') || null,
      payloadUpdateTime: index?.payloadUpdateTime ?? null,
      completenessProof: String(index?.proof || '') || null,
      fetchCount: completeTurnIndexAuthorityState.fetchCount,
      cacheReadCount: completeTurnIndexAuthorityState.cacheReadCount,
      cacheWriteCount: completeTurnIndexAuthorityState.cacheWriteCount,
      cacheWriteSkippedUnchangedCount: completeTurnIndexAuthorityState.cacheWriteSkippedUnchangedCount,
      cacheWriteFailureCount: completeTurnIndexAuthorityState.cacheWriteFailureCount,
      setterCallCount: completeTurnIndexAuthorityState.setterCallCount,
      automaticSetterCallCount: completeTurnIndexAuthorityState.automaticSetterCallCount,
      preferenceSetterCallCount: completeTurnIndexAuthorityState.preferenceSetterCallCount,
      preferenceReadCount: completeTurnIndexAuthorityState.preferenceReadCount,
      preferenceWriteCount: completeTurnIndexAuthorityState.preferenceWriteCount,
      preferenceClearCount: completeTurnIndexAuthorityState.preferenceClearCount,
      preferenceWriteFailureCount: completeTurnIndexAuthorityState.preferenceWriteFailureCount,
      bootApplyCount: completeTurnIndexAuthorityState.bootApplyCount,
      bootActivationCount: completeTurnIndexAuthorityState.bootActivationCount,
      staleDiscardCount: completeTurnIndexAuthorityState.staleDiscardCount,
      refreshFetchCount: Number(refresh?.fetchCount || 0),
      refreshDebounceCount: Number(refresh?.debounceCount || 0),
      refreshCoalescedCount: Number(refresh?.coalescedCount || 0),
      refreshStaleDiscardCount: Number(refresh?.staleDiscardCount || 0),
      refreshTrailingRequired: refresh?.trailingRequired === true,
      refreshTrailingCount: Number(refresh?.trailingRefreshCount || 0),
      selectedPathSignalCount: Number(refresh?.selectedPathSignalCount || 0),
      selectedPathAcceptanceCount: Number(refresh?.selectedPathAcceptanceCount || 0),
      selectedPathRejectedCount: Number(refresh?.selectedPathRejectedCount || 0),
      selectedPathCancellationCount: Number(refresh?.selectedPathCancellationCount || 0),
      selectedPathDeduplicatedCount: Number(refresh?.selectedPathDeduplicatedCount || 0),
      selectedPathUnconfirmedCount: Number(refresh?.selectedPathUnconfirmedCount || 0),
      selectedPathLastSignature: refresh?.selectedPathLastSignature || null,
      selectedPathActiveSignature: refresh?.selectedPathActiveSignature || null,
      selectedPathActiveTrusted: refresh?.selectedPathActiveTrusted === true,
      selectedPathResultCode: refresh?.selectedPathResultCode || null,
      selectedPathConfirmationPending: refresh?.selectedPathConfirmationPending === true,
      selectedPathConfirmationLeaseActive: refresh?.selectedPathConfirmationLeaseActive === true,
      selectedPathRequestLeaseActive: refresh?.selectedPathRequestLeaseActive === true,
      selectedPathConfirmationScheduledCount: Number(refresh?.selectedPathConfirmationScheduledCount || 0),
      selectedPathConfirmationFetchCount: Number(refresh?.selectedPathConfirmationFetchCount || 0),
      selectedPathConfirmationCancelledCount: Number(refresh?.selectedPathConfirmationCancelledCount || 0),
      trustedSelectionCaptureCount: completeTurnIndexAuthorityState.trustedSelectionCaptureCount,
      trustedSelectionIntentActive: !!completeTurnIndexAuthorityState.trustedSelectedPathIntent,
      trustedSelectionIntentQId: completeTurnIndexAuthorityState.trustedSelectedPathIntent?.qId || null,
      branchSelectionStale: completeTurnIndexAuthorityState.branchSelectionStale === true,
      branchStaleLastClearReason: completeTurnIndexAuthorityState.branchStaleLastClearReason || null,
      branchTransitionSuppressedLiveAppendCount: Number(completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount || 0),
      branchTransactionPending: chatAtlasBranchTransactionCurrent()?.state === 'pending',
      branchTransactionStateCode: String(completeTurnIndexAuthorityState.branchTransactionState?.state || 'none'),
      branchTransactionReason: String(completeTurnIndexAuthorityState.branchTransactionState?.reason || '') || null,
      nativeConvergencePhase: String(completeTurnIndexAuthorityState.nativeConvergenceState?.phase || 'none'),
      nativeConvergenceReason: String(completeTurnIndexAuthorityState.nativeConvergenceState?.reason || '') || null,
      nativeConvergenceExpectedQId: completeTurnIndexAuthorityState.nativeConvergenceState?.expectedQId || null,
      nativeConvergenceAttempts: Number(completeTurnIndexAuthorityState.nativeConvergenceState?.attempts || 0),
      ...chatAtlasNativeBranchPlanDiagnostics(),
      ...chatAtlasDefaultOverlayDiagnostics(),
      branchTransactionTrace: completeTurnIndexAuthorityState.branchTransactionTrace.map((entry) => Object.freeze({ ...entry })),
      branchSelectionStaleRevision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
      branchSelectionStaleQId: completeTurnIndexAuthorityState.branchSelectionStaleQId || null,
      branchExpansionPending: completeTurnIndexAuthorityState.branchExpansionState === 'pending',
      branchExpansionFailClosed: completeTurnIndexAuthorityState.branchExpansionState === 'fail-closed',
      branchExpansionState: completeTurnIndexAuthorityState.branchExpansionState,
      branchExpansionReason: completeTurnIndexAuthorityState.branchExpansionReason,
      branchExpansionPriorCount: Number(completeTurnIndexAuthorityState.branchExpansionPriorCount || 0),
      branchExpansionTargetCount: Number(completeTurnIndexAuthorityState.branchExpansionTargetCount || 0),
      branchExpansionExpectedFingerprint:
        String(completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint || '') || null,
      branchExpansionRequiredPageNums: Object.freeze(
        Array.from(completeTurnIndexAuthorityState.branchExpansionRequiredPageNums || []),
      ),
      selectedPathAcquisition: getSelectedPathAcquisitionStatus(),
      selectedPathOverlay: getEffectivePresentationStatus(),
      autoBranchReconciliationEnabled: completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true,
      autoBranchReconciliationSetterCallCount: completeTurnIndexAuthorityState.autoBranchReconciliationSetterCallCount,
      trustedSelectionLastCaptureTokenHash: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastCaptureTokenHash,
      trustedSelectionLastCaptureDirection: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastCaptureDirection,
      trustedSelectionBindAttemptCount: completeTurnIndexLifecycleDiagnostics.trustedSelectionBindAttemptCount,
      trustedSelectionBindSuccessCount: completeTurnIndexLifecycleDiagnostics.trustedSelectionBindSuccessCount,
      trustedSelectionLastBoundQId: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastBoundQId,
      trustedSelectionClearCount: completeTurnIndexLifecycleDiagnostics.trustedSelectionClearCount,
      trustedSelectionLastClearReason: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastClearReason,
      trustedSelectionLastClearQId: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastClearQId,
      selectedPathTrustedScheduleAttemptCount: completeTurnIndexLifecycleDiagnostics.selectedPathTrustedScheduleAttemptCount,
      selectedPathTrustedScheduleAcceptedCount: completeTurnIndexLifecycleDiagnostics.selectedPathTrustedScheduleAcceptedCount,
      selectedPathLastScheduleTrusted: completeTurnIndexLifecycleDiagnostics.selectedPathLastScheduleTrusted,
      selectedPathLastScheduleQId: completeTurnIndexLifecycleDiagnostics.selectedPathLastScheduleQId,
      selectedPathLastScheduleCause: completeTurnIndexLifecycleDiagnostics.selectedPathLastScheduleCause,
      selectedPathConfirmationEligibilityCheckCount: completeTurnIndexLifecycleDiagnostics.selectedPathConfirmationEligibilityCheckCount,
      selectedPathConfirmationSkipCount: completeTurnIndexLifecycleDiagnostics.selectedPathConfirmationSkipCount,
      selectedPathConfirmationLastSkipReason: completeTurnIndexLifecycleDiagnostics.selectedPathConfirmationLastSkipReason,
      selectedPathLifecycleTraceDroppedCount: completeTurnIndexLifecycleDiagnostics.traceDroppedCount,
      selectedPathLifecycleTrace: completeTurnIndexLifecycleDiagnostics.trace.slice(),
      refreshCauseSample: Array.isArray(refresh?.causeSample) ? refresh.causeSample.slice(0, 8) : [],
      refreshTimerPending: refresh?.timerPending === true,
      refreshRequestActive: refresh?.requestActive === true,
      refreshListenerRegistrationCount: completeTurnIndexAuthorityState.refreshListenerRegistrationCount,
      startedAt: completeTurnIndexAuthorityState.startedAt,
      completedAt: completeTurnIndexAuthorityState.completedAt,
      errorCode: completeTurnIndexAuthorityState.errorCode,
      authorityUnpersisted: completeTurnIndexAuthorityState.authorityUnpersisted === true,
      cacheWriteErrorCode: completeTurnIndexAuthorityState.cacheWriteErrorCode,
      diagnosticStatus: completeTurnIndexAuthorityState.diagnosticStatus,
      cache: {
        schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
        key: chatAtlasCompleteIndexCacheKey(completeTurnIndexAuthorityState.chatId),
      },
      preference: {
        key: COMPLETE_TURN_INDEX_PREFERENCE_KEY,
        resolved: completeTurnIndexAuthorityState.preferenceResolved === true,
        storedValue: completeTurnIndexAuthorityState.preferenceStoredValue,
        resolution: completeTurnIndexAuthorityState.preferenceResolution,
        readErrorCode: completeTurnIndexAuthorityState.preferenceReadErrorCode,
        writeErrorCode: completeTurnIndexAuthorityState.preferenceWriteErrorCode,
      },
    });
  }

  function chatAtlasNotifyCompleteIndexState() {
    // The default origin publishes at most once per graph capture; the guard
    // lives inside the publisher, so this hook cannot become a request storm.
    try { chatAtlasPublishDefaultLatestCreatedPath('complete-index-published'); } catch {}
    // One bounded tick per authority publication, capped inside the callee.
    // While waiting for the conversation to mount, the same notification
    // retries CONTAINER DISCOVERY only. No timer, no observer, no second scroll.
    try {
      if (chatAtlasRevealTransactionState() === 'waiting-for-container-readiness') {
        chatAtlasRevealRunOneShot(chatAtlasRevealReadinessTarget());
      } else {
        chatAtlasRevealReconcileTick();
      }
    } catch {}
    const detail = getCompleteTurnIndexProjectionStatus();
    try { W.dispatchEvent(new CustomEvent(COMPLETE_TURN_INDEX_STATE_EVENT, { detail })); } catch {}
    try { H2O.events?.emit?.(COMPLETE_TURN_INDEX_STATE_EVENT, detail); } catch {}
    try {
      const api = W.H2O_MM_CORE_API || W.top?.H2O_MM_CORE_API || null;
      api?.scheduleRebuild?.(`complete-index:${detail.status}`);
    } catch {}
    return detail;
  }

  function chatAtlasIndexIsStrictPrefixOf(incoming, complete) {
    const prefix = Array.isArray(incoming?.turns) ? incoming.turns : [];
    const full = Array.isArray(complete?.turns) ? complete.turns : [];
    if (!prefix.length || prefix.length >= full.length) return false;
    return prefix.every((turn, index) => {
      const expected = full[index];
      return Number(turn?.order || 0) === index + 1
        && turn?.qId === expected?.qId
        && turn?.primaryAId === expected?.primaryAId
        && turn?.noAnswer === expected?.noAnswer
        && turn?.stopped === expected?.stopped
        && JSON.stringify(turn?.answerVariants || [])
          === JSON.stringify(expected?.answerVariants || []);
    });
  }

  // ── Downstream native parity (Stage 2C-2aj2) ─────────────────────────────
  // The manual anchor is the user's deliberate change and is exempt. Every
  // fork BELOW it must match the host's own selection: the derivation is free
  // to pick a valid sibling continuation, and publishing that sibling is how
  // a 39-turn overlay came to be shown while native was still on a 36-turn
  // chain. Parity is proven by identity (qId + primaryAId) against the host
  // current_node chain, reusing chatAtlasChainToRoot and
  // chatAtlasTurnsFromChain — no second traversal model.
  //
  // No newest-created, longest-path, first/last-answer or DOM-order
  // tie-breaker is consulted here: below the anchor the host chain is the
  // only authority, and an unprovable comparison fails closed.
  function chatAtlasDownstreamNativeParity(derivedPath, anchorQId, targetAnswerId, graph, byId, clientChain = null) {
    const fail = (reason) => Object.freeze({ ok: false, reason, comparedTurns: 0 });
    const path = Array.isArray(derivedPath) ? derivedPath : [];
    const anchor = chatAtlasCompleteIndexIdentity(anchorQId);
    if (!path.length || !anchor) return fail('downstream-parity-scope-unavailable');
    const anchorIndex = path.findIndex(
      (turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === anchor,
    );
    if (anchorIndex < 0) return fail('downstream-parity-anchor-missing');
    // Nothing below the anchor: the manual change is the tail, so there is no
    // downstream fork to disagree about.
    if (anchorIndex === path.length - 1) {
      return Object.freeze({ ok: true, reason: null, comparedTurns: 0 });
    }
    // A proven client selected chain is the manual-session reference: it is
    // the only source that follows a native switch immediately. current_node
    // remains the reference for everything else.
    const clientProven = clientChain && clientChain.ok === true
      && Array.isArray(clientChain.nodes) && clientChain.nodes.length;
    let hostChain = null;
    if (clientProven) {
      // clientChain.nodes carries product message nodes only. Pairing needs the
      // complete structural root-to-leaf chain -- tool, system and shell nodes
      // included -- which is exactly what the fallback branch below builds, so
      // build it the same way from the client chain's own terminal.
      const terminal = clientChain.nodes[clientChain.nodes.length - 1];
      try { hostChain = chatAtlasChainToRoot(byId, terminal); } catch { hostChain = null; }
    } else {
      const currentNode = byId.get(chatAtlasCompleteIndexIdentity(graph?.currentNode));
      if (!currentNode) return fail('downstream-parity-current-node-unresolved');
      try { hostChain = chatAtlasChainToRoot(byId, currentNode); } catch { hostChain = null; }
    }
    if (!hostChain) return fail('downstream-parity-host-chain-unresolved');
    const hostTurns = chatAtlasTurnsFromChain(hostChain, byId);
    if (!hostTurns) return fail('downstream-parity-host-path-invalid');
    // POST-CLICK PROOF. A retained graph captured BEFORE the click still has
    // current_node on the outgoing branch, so it carries no host selection
    // below the new anchor to compare against. Requiring the anchor's newly
    // selected answer to be present on this very chain is what proves the
    // capture is already current. Without it the retained graph is simply not
    // authority for a manual publication yet.
    const target = chatAtlasCompleteIndexIdentity(targetAnswerId);
    const hostAnchor = hostTurns.find(
      (turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === anchor,
    ) || null;
    if (!hostAnchor) return fail('retained-graph-pre-click');
    if (target) {
      const hostAnchorAnswer = chatAtlasCompleteIndexIdentity(hostAnchor.primaryAId);
      const hostAnchorVariants = (hostAnchor.answerVariants || [])
        .map((id) => chatAtlasCompleteIndexIdentity(id));
      if (hostAnchorAnswer !== target && !hostAnchorVariants.includes(target)) {
        return fail('retained-graph-pre-click');
      }
    }
    const hostByQId = new Map(hostTurns.map(
      (turn) => [chatAtlasCompleteIndexIdentity(turn?.qId), turn],
    ));
    let compared = 0;
    for (let index = anchorIndex + 1; index < path.length; index += 1) {
      const turn = path[index];
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const hostTurn = qId ? hostByQId.get(qId) : null;
      // A question the host never selected: the derivation took a different
      // question-edit fork below the anchor.
      if (!hostTurn) return fail('downstream-question-fork-differs');
      if (
        chatAtlasCompleteIndexIdentity(turn?.primaryAId)
        !== chatAtlasCompleteIndexIdentity(hostTurn?.primaryAId)
      ) return fail('downstream-answer-fork-differs');
      compared += 1;
    }
    return Object.freeze({ ok: true, reason: null, comparedTurns: compared });
  }

  function chatAtlasBranchTransactionPublicationDecision(envelope, source) {
    const transaction = chatAtlasBranchTransactionCurrent();
    const incomingCount = Array.isArray(envelope?.turns) ? envelope.turns.length : 0;
    const incomingFingerprint = String(envelope?.sourceFingerprint || '');
    if (transaction?.state === 'fail-closed') {
      selectedPathAcquisitionState.lastPublicationDecision = chatAtlasFreeze({
        source: String(source || ''),
        incomingCount,
        incomingFingerprint: incomingFingerprint || null,
        published: false,
        reason: 'branch-transaction-fail-closed',
      });
      return Object.freeze({
        handled: true,
        published: false,
        reason: 'branch-transaction-fail-closed',
      });
    }
    if (transaction?.state !== 'pending') return Object.freeze({ handled: false });
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const retained = selectedPathAcquisitionState.graph;
    const route = chatAtlasFullIndexRoute();
    const scopeCurrent = !!intent
      && transaction.token === String(intent.token || '')
      && transaction.qId === String(intent.qId || '')
      && transaction.chatId === String(intent.chatId || '')
      && transaction.routeKey === String(intent.routeKey || '')
      && transaction.generation === Number(intent.generation || 0)
      && transaction.staleRevision === Number(intent.staleRevision || 0)
      && intent.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && intent.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(intent.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0)
      && intent.chatId === String(route?.chatId || '')
      && intent.routeKey === String(route?.routeKey || '')
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && Number(intent.staleRevision || 0)
        === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0);
    const remember = (decision) => {
      selectedPathAcquisitionState.lastPublicationDecision = chatAtlasFreeze({
        source: String(source || ''),
        incomingCount,
        incomingFingerprint: incomingFingerprint || null,
        ...decision,
      });
      return Object.freeze({ handled: true, ...decision });
    };
    // A decision that stays PENDING for more evidence has not evaluated this
    // graph to a conclusion, so it must not leave a completed-evaluation record
    // behind: chatAtlasScheduleCompleteIndexRefresh would then treat the
    // retained pre-click graph as already evaluated and skip the one bounded
    // refresh this trusted token owns — starving the selection exactly as the
    // live defect did. Whatever the acquisition lane recorded is restored
    // untouched.
    const priorGraphCaptureIdentity = String(transaction.graphCaptureIdentity || '');
    const priorGraphEvaluationKey = String(transaction.graphEvaluationKey || '');
    const holdPending = (reason) => {
      transaction.graphCaptureIdentity = priorGraphCaptureIdentity;
      transaction.graphEvaluationKey = priorGraphEvaluationKey;
      return remember({ published: false, reason });
    };
    if (!scopeCurrent) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'branch-transaction-scope-invalid',
        String(transaction.token || ''),
      );
      return remember({ published: false, reason: 'branch-transaction-scope-invalid' });
    }
    const graphScopeCurrent = retained?.chatId === intent.chatId
      && retained?.routeKey === intent.routeKey
      && Number(retained?.generation || 0) === Number(intent.generation || 0)
      && chatAtlasIdentityGraphValid(retained?.identityGraph, intent.chatId);
    // ── Deferred native pager target resolution ──────────────────────────────
    // The trusted click retained qId, prior answer and direction; the exact
    // answer the pager moved to could not be proven at capture because no
    // trustworthy graph existed yet. THIS retained graph — the one already
    // being evaluated here, never unrelated global graph state — is that
    // evidence, and it resolves the target exactly once.
    const capturedCandidate = intent.returnTargetCandidate || null;
    const capturedTarget = chatAtlasCompleteIndexIdentity(
      capturedCandidate?.targetVariantAnswerId,
    );
    let activeCandidate = capturedCandidate;
    let resolvedDeferredTarget = '';
    if (
      !capturedTarget
      && graphScopeCurrent
      && chatAtlasReturnTargetCandidatePending(capturedCandidate)
    ) {
      const resolved = chatAtlasResolveNativeReturnTarget(
        retained.identityGraph,
        capturedCandidate.qId || intent.qId,
        capturedCandidate.priorAnswerId || intent.priorAnswerId,
        capturedCandidate.direction || intent.direction,
      );
      if (resolved.ok !== true) {
        // Trustworthy graph evidence now exists. Failure to establish a valid
        // unique neighbour is a genuine verdict, never another deferral.
        const reason = chatAtlasCompleteIndexCode(
          resolved.reason,
          'capture-candidate-invalid',
          64,
        );
        chatAtlasCloseBranchTransaction(
          'fail-closed',
          reason,
          String(transaction.token || ''),
        );
        return remember({ published: false, reason });
      }
      resolvedDeferredTarget = resolved.targetVariantAnswerId;
      activeCandidate = chatAtlasResolvedReturnTargetCandidate(
        capturedCandidate,
        resolvedDeferredTarget,
        retained,
      );
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        ...intent,
        returnTargetCandidate: activeCandidate,
      });
      chatAtlasBranchTransactionTrace('tx-return-target-resolved', {
        token: resolvedDeferredTarget,
      });
    }
    const targetAnswerId = chatAtlasCompleteIndexIdentity(
      capturedTarget
        || resolvedDeferredTarget
        || selectedPathAcquisitionState.anchorSelectedAId,
    );
    const graphCurrent = graphScopeCurrent && !!targetAnswerId;
    if (!graphCurrent) {
      // The ordinary refresh can finish before the one bounded graph
      // acquisition. Retain the previous complete authority and the exact
      // transaction owner; absence is temporary, never permission to publish
      // the host's current_node prefix and never an immediate terminal error.
      return holdPending('branch-transaction-graph-pending');
    }

    transaction.graphCaptureIdentity = String(retained.captureIdentity || '');
    transaction.graphEvaluationKey = JSON.stringify([
      transaction.token,
      transaction.graphCaptureIdentity,
      targetAnswerId,
    ]);

    const clientChain = chatAtlasNativeClientSelectedChain(retained.identityGraph, targetAnswerId);
    const clientProves = chatAtlasClientChainProvesAnchor(clientChain, targetAnswerId);
    const derived = chatAtlasDeriveSelectedPath(
      retained.identityGraph,
      Object.freeze({
        ...intent,
        mountedEvidence: new Map(),
        clientSelectedChainClosure: clientProves ? clientChain.closure : null,
        clientSelectedChain: clientProves ? clientChain : null,
      }),
      targetAnswerId,
    );
    if (!derived.ok || !chatAtlasSelectedPathProofValid(derived)) {
      const reason = derived.ok ? 'branch-transaction-proof-invalid' : derived.reason;
      // Same distinction as the acquisition path, enforced at the one site
      // that actually closes the transaction. A graph whose current_node chain
      // does not prove the newly selected anchor is pre-click evidence, so an
      // unresolved fork below that anchor is an artefact of the graph's age
      // rather than real ambiguity. Stay contained and pending exactly as the
      // downstream-parity gate below does, so the bounded refresh runs. A
      // graph that DOES prove the anchor still fails closed here.
      if (
        !derived.ok
        && !clientProves
        && chatAtlasSelectedPathStaleGraphEvidence(
          retained.identityGraph,
          targetAnswerId,
          reason,
        )
      ) {
        chatAtlasBranchTransactionTrace('tx-graph-pending', { reason });
        return holdPending('branch-transaction-graph-pending');
      }
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        reason,
        String(transaction.token || ''),
      );
      return remember({ published: false, reason });
    }
    const parity = chatAtlasDownstreamNativeParity(
      derived.path,
      intent.qId,
      targetAnswerId,
      retained.identityGraph,
      new Map((retained.identityGraph?.nodes || []).map((node) => [node.nodeId, node])),
      clientProves ? clientChain : null,
    );
    if (parity.ok !== true) {
      // Contained, NOT terminal: the transaction stays pending so the bounded
      // host refresh runs and the derivation is re-proven against a refreshed
      // current_node chain. 20/21 containment is preserved precisely because
      // the transaction remains open and nothing partial is published.
      selectedPathAcquisitionState.downstreamParityReason = parity.reason;
      return holdPending('branch-transaction-graph-pending');
    }
    selectedPathAcquisitionState.downstreamParityReason = null;
    const candidate = activeCandidate;
    const derivedMembers = chatAtlasBranchReturnPathMembers(derived.path);
    const derivedIdentity = chatAtlasBranchReturnPathIdentity(derivedMembers);
    // The frozen route is captured BEFORE any client-chain authority exists,
    // by the independent ranked derivation. When a unique validated client
    // chain has since proven the target and supplied the whole path, that
    // frozen pair describes a route the user is demonstrably not on, so it
    // must not veto the client-selected one. Protection is not lost: the
    // client path was already validated turn-by-turn against the chain inside
    // chatAtlasDeriveSelectedPath (exact length, per-turn qId and primaryAId,
    // exact terminal, no extra or omitted turns) and fails closed as
    // client-chain-path-mismatch. With no proven chain this guard is
    // unchanged, byte for byte.
    if (
      !clientProves
      && Number(candidate?.derivedTargetCount || 0) > 0
      && (
        Number(candidate.derivedTargetCount) !== derived.path.length
        || String(candidate.derivedPathIdentity || '') !== derivedIdentity
      )
    ) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'branch-transaction-frozen-path-mismatch',
        String(transaction.token || ''),
      );
      return remember({ published: false, reason: 'branch-transaction-frozen-path-mismatch' });
    }

    selectedPathAcquisitionState.status = 'proven';
    selectedPathAcquisitionState.reason = 'selected-path-proven';
    selectedPathAcquisitionState.origin = 'manual-native-selection';
    selectedPathAcquisitionState.token = intent.token;
    selectedPathAcquisitionState.anchorQId = intent.qId;
    selectedPathAcquisitionState.anchorSelectedAId = targetAnswerId;
    selectedPathAcquisitionState.priorAnswerId = intent.priorAnswerId || null;
    selectedPathAcquisitionState.chatId = intent.chatId;
    selectedPathAcquisitionState.routeKey = intent.routeKey;
    selectedPathAcquisitionState.generation = intent.generation;
    selectedPathAcquisitionState.staleRevision = intent.staleRevision;
    selectedPathAcquisitionState.path = derived.path;
    selectedPathAcquisitionState.proof = derived.proof;
    selectedPathAcquisitionState.provenAt = new Date().toISOString();
    selectedPathAcquisitionState.evaluationKey = JSON.stringify([
      intent.token,
      completeTurnIndexAuthorityState.index?.sourceFingerprint || '',
      retained.captureIdentity,
      derivedIdentity,
    ]);
    chatAtlasSelectedPathOverlayEvaluate();
    const effective = getEffectivePresentationIndex();
    const expectedFingerprint = chatAtlasCompleteIndexFingerprint(derived.path);
    if (
      !chatAtlasSelectedPathOverlayCurrent()
      || !effective
      || effective.turns.length !== derived.path.length
      || String(effective.sourceFingerprint || '') !== expectedFingerprint
      || !chatAtlasTurnStateMatchesEffectiveIndex(effective)
    ) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'branch-transaction-atomic-publication-failed',
        String(transaction.token || ''),
      );
      return remember({ published: false, reason: 'branch-transaction-atomic-publication-failed' });
    }
    completeIndexRefreshCoordinator?.settleSelectedPathGraphPublication?.(transaction.token);
    return remember({
      published: true,
      reason: 'complete-graph-path-published',
      acceptedCount: effective.turns.length,
      acceptedFingerprint: String(effective.sourceFingerprint || ''),
      tailNodeId: String(derived.proof?.tailNodeId || '') || null,
    });
  }

  function chatAtlasTryPublishRetainedBranchTransaction(source = 'retained-graph-acquisition') {
    const transaction = chatAtlasBranchTransactionCurrent();
    if (transaction?.state !== 'pending') return Object.freeze({ handled: false });
    const index = completeTurnIndexAuthorityState.index;
    if (!index?.turns?.length) return Object.freeze({ handled: false });
    return chatAtlasBranchTransactionPublicationDecision(index, source);
  }

  function chatAtlasPublishCompleteIndex(envelope, source) {
    const transactionDecision = chatAtlasBranchTransactionPublicationDecision(envelope, source);
    if (transactionDecision.handled) return chatAtlasNotifyCompleteIndexState();
    const effective = getEffectivePresentationIndex();
    if (
      chatAtlasSelectedPathOverlayCurrent()
      && chatAtlasIndexIsStrictPrefixOf(envelope, effective)
    ) {
      selectedPathAcquisitionState.lastPublicationDecision = chatAtlasFreeze({
        source: String(source || ''),
        incomingCount: Array.isArray(envelope?.turns) ? envelope.turns.length : 0,
        incomingFingerprint: String(envelope?.sourceFingerprint || '') || null,
        published: false,
        reason: 'host-current-node-prefix-rejected',
        acceptedCount: effective.turns.length,
        acceptedFingerprint: String(effective.sourceFingerprint || ''),
      });
      return chatAtlasNotifyCompleteIndexState();
    }
    const priorSelectedPathFingerprint = (
      typeof selectedPathAcquisitionState !== 'undefined'
      && selectedPathAcquisitionState.status === 'proven'
    )
      ? String(selectedPathAcquisitionState.proof?.canonicalFingerprint || '')
      : '';
    const priorOverlayFingerprint = (
      typeof selectedPathOverlayState !== 'undefined'
      && selectedPathOverlayState.status === 'active'
    )
      ? String(selectedPathOverlayState.canonicalFingerprint || '')
      : '';
    if (
      priorOverlayFingerprint
      && priorOverlayFingerprint !== String(envelope?.sourceFingerprint || '')
      && typeof chatAtlasClearSelectedPathOverlay === 'function'
    ) {
      chatAtlasClearSelectedPathOverlay('canonical-fingerprint-changed');
    }
    completeTurnIndexAuthorityState.index = envelope;
    completeTurnIndexAuthorityState.indexSource = source;
    buildTurns();
    if (
      priorSelectedPathFingerprint
      && priorSelectedPathFingerprint !== String(envelope?.sourceFingerprint || '')
      && typeof chatAtlasClearSelectedPathAcquisition === 'function'
    ) {
      chatAtlasClearSelectedPathAcquisition(
        'canonical-fingerprint-changed',
        { preserveGraph: true },
      );
      if (typeof chatAtlasSelectedPathEvaluate === 'function') {
        chatAtlasSelectedPathEvaluate(chatAtlasCoreLedgerMembers());
      }
    }
    return chatAtlasNotifyCompleteIndexState();
  }

  function chatAtlasResetCompleteIndexRoute(nextRoute, staleStatus = false, options = {}) {
    const clearedIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    completeTurnIndexAuthorityState.nativeConvergenceState = null;
    chatAtlasCloseBranchTransaction('reset', staleStatus ? 'route-changed' : 'authority-reset');
    chatAtlasResetBranchExpansionLifecycle(staleStatus ? 'route-changed' : 'authority-reset');
    if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
      chatAtlasClearSelectedPathOverlay(
        staleStatus ? 'route-changed' : 'authority-reset',
      );
    }
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(
        staleStatus ? 'route-changed' : 'authority-reset',
        { resetRefetchGuard: true },
      );
    }
    const preserveBranchSelectionStale = options?.preserveBranchSelectionStale === true
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && String(nextRoute?.chatId || '') === String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      && String(nextRoute?.routeKey || '') === String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '');
    if (!preserveBranchSelectionStale) {
      chatAtlasClearBranchSelectionStale(null, staleStatus ? 'route-changed' : 'authority-reset', false);
    }
    chatAtlasCancelTrustedNativeBranchReconcile();
    // Lifecycle reset: the memory-only automatic-reconciliation qualification
    // gate must NOT survive an enable/disable transition, a preference clear, or
    // a route/chat generation boundary — all of which funnel through here (from
    // chatAtlasApplyCompleteIndexProjectionEnabled and chatAtlasTriggerCompleteIndexAuthority).
    // It returns to false so re-enabling the projection can never silently
    // reactivate reconciliation; a qualification test must explicitly re-enable
    // it after any lifecycle boundary. Nothing is persisted.
    if (completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true) {
      completeTurnIndexAuthorityState.autoBranchReconciliationEnabled = false;
      chatAtlasTraceTrustedLifecycle('auto-branch-reconciliation-reset', {
        reason: staleStatus ? 'route-reset-route-changed' : 'authority-reset',
        chat: nextRoute?.chatId || '',
      });
    }
    completeIndexRefreshCoordinator?.cancel?.(
      staleStatus ? 'route-changed' : 'authority-reset',
      staleStatus ? 'stale-route-discarded' : 'idle',
    );
    try { completeTurnIndexAuthorityState.controller?.abort?.('route-changed'); } catch {}
    completeTurnIndexAuthorityState.generation += 1;
    try { chatAtlasResetManualBranchOverride('route-generation-reset'); } catch {}
    completeTurnIndexAuthorityState.status = completeTurnIndexAuthorityState.enabled
      ? (staleStatus ? 'stale-route-discarded' : 'loading-full-index')
      : 'disabled';
    completeTurnIndexAuthorityState.chatId = nextRoute?.chatId || null;
    completeTurnIndexAuthorityState.routeKey = nextRoute?.routeKey || '';
    completeTurnIndexAuthorityState.fetchCount = 0;
    completeTurnIndexAuthorityState.startedAt = null;
    completeTurnIndexAuthorityState.completedAt = staleStatus ? new Date().toISOString() : null;
    completeTurnIndexAuthorityState.errorCode = null;
    completeTurnIndexAuthorityState.authorityUnpersisted = false;
    completeTurnIndexAuthorityState.cacheWriteErrorCode = null;
    completeTurnIndexAuthorityState.diagnosticStatus = null;
    completeTurnIndexAuthorityState.index = null;
    completeTurnIndexAuthorityState.indexSource = null;
    completeTurnIndexAuthorityState.cacheChecked = false;
    completeTurnIndexAuthorityState.cacheRaw = null;
    completeTurnIndexAuthorityState.attempted = false;
    completeTurnIndexAuthorityState.promise = null;
    completeTurnIndexAuthorityState.controller = null;
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
    if (preserveBranchSelectionStale) {
      completeTurnIndexAuthorityState.branchSelectionStaleGeneration = completeTurnIndexAuthorityState.generation;
    }
    if (clearedIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: staleStatus ? 'route-reset-route-changed' : 'route-reset-authority-reset',
        qId: clearedIntent.qId,
        token: clearedIntent.token,
        chat: nextRoute?.chatId || '',
      });
    }
    completeTurnIndexAuthorityState.pendingDrafts.clear();
    completeTurnIndexAuthorityState.pendingObservedAt.clear();
    completeTurnIndexAuthorityState.pendingStateNotifyQueued = false;
  }

  function chatAtlasTriggerCompleteIndexAuthority() {
    const route = chatAtlasFullIndexRoute();
    const routeChanged = route.routeKey !== completeTurnIndexAuthorityState.routeKey
      || route.chatId !== completeTurnIndexAuthorityState.chatId;
    if (routeChanged) {
      const stale = completeTurnIndexAuthorityState.status === 'loading-full-index'
        && !!completeTurnIndexAuthorityState.promise;
      if (stale) completeTurnIndexAuthorityState.staleDiscardCount += 1;
      chatAtlasResetCompleteIndexRoute(route, stale && !route.chatId);
    }
    if (!route.chatId) {
      if (routeChanged) chatAtlasNotifyCompleteIndexState();
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }

    if (!completeTurnIndexAuthorityState.cacheChecked) {
      completeTurnIndexAuthorityState.cacheChecked = true;
      const cached = chatAtlasReadCompleteIndexCache(route.chatId);
      completeTurnIndexAuthorityState.cacheRaw = cached.raw;
      if (cached.ok) {
        completeTurnIndexAuthorityState.status = 'complete-from-cache';
        completeTurnIndexAuthorityState.errorCode = null;
        chatAtlasPublishCompleteIndex(cached.envelope, 'cache');
      } else {
        completeTurnIndexAuthorityState.status = 'loading-full-index';
        completeTurnIndexAuthorityState.errorCode = cached.status === 'cache-missing' ? null : cached.status;
        chatAtlasNotifyCompleteIndexState();
      }
    }
    if (completeTurnIndexAuthorityState.promise) return completeTurnIndexAuthorityState.promise;
    if (completeTurnIndexAuthorityState.attempted) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') return Promise.resolve(getCompleteTurnIndexProjectionStatus());

    const Controller = W.AbortController;
    const controller = typeof Controller === 'function' ? new Controller() : null;
    const generation = completeTurnIndexAuthorityState.generation;
    const routeKey = route.routeKey;
    const cachedIndex = completeTurnIndexAuthorityState.index;
    completeTurnIndexAuthorityState.attempted = true;
    completeTurnIndexAuthorityState.fetchCount += 1;
    completeTurnIndexAuthorityState.startedAt = new Date().toISOString();
    completeTurnIndexAuthorityState.completedAt = null;
    completeTurnIndexAuthorityState.controller = controller;
    const operation = Promise.resolve()
      .then(() => provider(route.chatId, {
        signal: controller?.signal,
        includeIdentityGraph: true,
      }))
      .then((result) => {
        const stillCurrent = generation === completeTurnIndexAuthorityState.generation
          && routeKey === completeTurnIndexAuthorityState.routeKey
          && route.chatId === completeTurnIndexAuthorityState.chatId;
        if (!stillCurrent) {
          completeTurnIndexAuthorityState.staleDiscardCount += 1;
          return getCompleteTurnIndexProjectionStatus();
        }
        chatAtlasRetainIdentityGraph(result, {
          chatId: route.chatId,
          routeKey,
          generation,
        });
        completeTurnIndexAuthorityState.completedAt = new Date().toISOString();
        const normalized = result?.ok === true
          ? chatAtlasNormalizeCompleteIndexEnvelope(result.index, route.chatId, { source: 'host' })
          : { ok: false, errorCode: String(result?.errorCode || 'full-index-unavailable') };
        if (!normalized.ok) {
          completeTurnIndexAuthorityState.status = cachedIndex
            ? 'offline-complete-cache'
            : 'full-index-unavailable';
          completeTurnIndexAuthorityState.diagnosticStatus = !cachedIndex && turnState.turns.length
            ? 'partial-fallback-diagnostic-only'
            : null;
          completeTurnIndexAuthorityState.errorCode = chatAtlasCompleteIndexCode(normalized.errorCode, 'full-index-unavailable');
          chatAtlasNotifyCompleteIndexState();
          return getCompleteTurnIndexProjectionStatus();
        }

        const hostIndex = normalized.envelope;
        const sameFingerprint = !!cachedIndex
          && cachedIndex.sourceFingerprint === hostIndex.sourceFingerprint;
        const revisionOrder = cachedIndex
          ? chatAtlasCompareCompleteIndexRevision(hostIndex.payloadUpdateTime, cachedIndex.payloadUpdateTime)
          : 1;
        if (sameFingerprint) {
          if (revisionOrder >= 0) {
            const write = chatAtlasWriteCompleteIndexCache(hostIndex);
            completeTurnIndexAuthorityState.authorityUnpersisted = !write.ok;
            completeTurnIndexAuthorityState.cacheWriteErrorCode = write.ok
              ? null
              : chatAtlasCompleteIndexCode(write.status, 'cache-write-failed');
            if (!write.ok) completeTurnIndexAuthorityState.errorCode = completeTurnIndexAuthorityState.cacheWriteErrorCode;
            completeTurnIndexAuthorityState.index = hostIndex;
            completeTurnIndexAuthorityState.indexSource = write.ok ? 'host-payload' : 'host-payload-unpersisted';
          }
          completeTurnIndexAuthorityState.status = 'complete-validated';
          if (!completeTurnIndexAuthorityState.errorCode) completeTurnIndexAuthorityState.errorCode = null;
          buildTurns();
          chatAtlasNotifyCompleteIndexState();
          return getCompleteTurnIndexProjectionStatus();
        }
        if (cachedIndex && revisionOrder < 0) {
          completeTurnIndexAuthorityState.status = 'complete-from-cache';
          completeTurnIndexAuthorityState.errorCode = 'older-host-payload';
          chatAtlasNotifyCompleteIndexState();
          return getCompleteTurnIndexProjectionStatus();
        }

        const write = chatAtlasWriteCompleteIndexCache(hostIndex);
        completeTurnIndexAuthorityState.status = 'complete-from-host-payload';
        completeTurnIndexAuthorityState.errorCode = write.ok
          ? null
          : chatAtlasCompleteIndexCode(write.status, 'cache-write-failed');
        completeTurnIndexAuthorityState.authorityUnpersisted = !write.ok;
        completeTurnIndexAuthorityState.cacheWriteErrorCode = write.ok
          ? null
          : completeTurnIndexAuthorityState.errorCode;
        chatAtlasPublishCompleteIndex(hostIndex, write.ok ? 'host-payload' : 'host-payload-unpersisted');
        return getCompleteTurnIndexProjectionStatus();
      })
      .catch((error) => {
        if (generation === completeTurnIndexAuthorityState.generation && routeKey === completeTurnIndexAuthorityState.routeKey) {
          completeTurnIndexAuthorityState.status = cachedIndex
            ? 'offline-complete-cache'
            : 'full-index-unavailable';
          completeTurnIndexAuthorityState.diagnosticStatus = !cachedIndex && turnState.turns.length
            ? 'partial-fallback-diagnostic-only'
            : null;
          completeTurnIndexAuthorityState.completedAt = new Date().toISOString();
          completeTurnIndexAuthorityState.errorCode = chatAtlasCompleteIndexCode(error?.code, 'provider-failed');
          chatAtlasNotifyCompleteIndexState();
        }
        return getCompleteTurnIndexProjectionStatus();
      })
      .finally(() => {
        if (generation === completeTurnIndexAuthorityState.generation && routeKey === completeTurnIndexAuthorityState.routeKey) {
          completeTurnIndexAuthorityState.promise = null;
          completeTurnIndexAuthorityState.controller = null;
        }
      });
    completeTurnIndexAuthorityState.promise = operation;
    return operation;
  }

  function chatAtlasApplyCompleteIndexProjectionEnabled(value, source = 'memory-canary') {
    const enabled = value === true;
    completeTurnIndexAuthorityState.activationSource = chatAtlasCompleteIndexCode(source, 'memory-canary', 48);
    if (enabled === completeTurnIndexAuthorityState.enabled) {
      return chatAtlasFreeze({ ok: true, changed: false, ...getCompleteTurnIndexProjectionStatus() });
    }
    completeTurnIndexAuthorityState.enabled = enabled;
    chatAtlasResetCompleteIndexRoute(chatAtlasFullIndexRoute(), false);
    if (enabled) {
      void chatAtlasTriggerCompleteIndexAuthority();
    } else {
      buildTurns();
      chatAtlasNotifyCompleteIndexState();
    }
    return chatAtlasFreeze({ ok: true, changed: true, ...getCompleteTurnIndexProjectionStatus() });
  }

  function setCompleteTurnIndexProjectionCanary(value) {
    completeTurnIndexAuthorityState.setterCallCount += 1;
    return chatAtlasApplyCompleteIndexProjectionEnabled(value === true, 'memory-canary');
  }

  // Memory-only qualification control for the DEFERRED automatic native
  // response-branch reconciliation (Round 2). It writes no localStorage and is
  // never a normal product setting: it exists only so focused validators (and
  // manual Gate 5 qualification) can exercise the accepted reconciliation
  // implementation without enabling it during normal Round 1 operation. Default
  // is false; boot/reload re-initialise it to false; it is independent of the
  // complete-turn projection preference and of the projection canary.
  function setCompleteTurnIndexAutoBranchReconciliationCanary(value) {
    completeTurnIndexAuthorityState.autoBranchReconciliationSetterCallCount += 1;
    const enabled = value === true;
    const disabling = completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true && !enabled;
    completeTurnIndexAuthorityState.autoBranchReconciliationEnabled = enabled;
    if (disabling) {
      // Cause-scoped rollback: revoke only selected-path reconciliation. Initial
      // authority, explicit/manual refresh, streaming, and turn-settled work keep
      // their coordinator state. An already-running selected-only GET is allowed
      // to settle but its result is discarded by the execution guard.
      chatAtlasCancelTrustedNativeBranchReconcile();
      chatAtlasResetBranchExpansionLifecycle('reconciliation-disabled-by-setter');
      completeIndexRefreshCoordinator?.cancelSelectedPathReconciliation?.('reconciliation-disabled-by-setter');
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (intent) {
        completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
        if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
          chatAtlasClearSelectedPathAcquisition(
            'reconciliation-disabled-by-setter',
            { preserveGraph: true },
          );
        }
        chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
          reason: 'reconciliation-disabled-by-setter',
          qId: intent.qId,
          token: intent.token,
        });
      }
    }
    return getCompleteTurnIndexProjectionStatus();
  }

  function chatAtlasResolveCompleteIndexProjectionPreference() {
    if (completeTurnIndexAuthorityState.preferenceResolved) {
      return {
        enabled: completeTurnIndexAuthorityState.preferenceResolution === 'stored-enabled',
        resolution: completeTurnIndexAuthorityState.preferenceResolution,
      };
    }
    completeTurnIndexAuthorityState.preferenceResolved = true;
    completeTurnIndexAuthorityState.preferenceReadCount += 1;
    completeTurnIndexAuthorityState.preferenceReadErrorCode = null;
    let raw = null;
    try {
      raw = W.localStorage?.getItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY) ?? null;
    } catch {
      completeTurnIndexAuthorityState.preferenceStoredValue = null;
      completeTurnIndexAuthorityState.preferenceResolution = 'read-failed-disabled';
      completeTurnIndexAuthorityState.preferenceReadErrorCode = 'preference-read-failed';
      return { enabled: false, resolution: 'read-failed-disabled' };
    }
    if (raw === '1') {
      completeTurnIndexAuthorityState.preferenceStoredValue = '1';
      completeTurnIndexAuthorityState.preferenceResolution = 'stored-enabled';
      return { enabled: true, resolution: 'stored-enabled' };
    }
    if (raw === '0') {
      completeTurnIndexAuthorityState.preferenceStoredValue = '0';
      completeTurnIndexAuthorityState.preferenceResolution = 'stored-disabled';
      return { enabled: false, resolution: 'stored-disabled' };
    }
    completeTurnIndexAuthorityState.preferenceStoredValue = raw == null ? null : 'invalid';
    completeTurnIndexAuthorityState.preferenceResolution = raw == null
      ? 'compiled-default-disabled'
      : 'malformed-disabled';
    return { enabled: COMPLETE_TURN_INDEX_COMPILED_DEFAULT, resolution: completeTurnIndexAuthorityState.preferenceResolution };
  }

  function chatAtlasApplyCompleteIndexProjectionPreferenceAtBoot() {
    const resolved = chatAtlasResolveCompleteIndexProjectionPreference();
    completeTurnIndexAuthorityState.bootApplyCount += 1;
    if (resolved.enabled) completeTurnIndexAuthorityState.bootActivationCount += 1;
    return chatAtlasApplyCompleteIndexProjectionEnabled(
      resolved.enabled === true,
      resolved.enabled
        ? 'persisted-preference-boot'
        : (resolved.resolution === 'stored-disabled' ? 'persisted-preference-boot-disabled' : 'compiled-default-boot'),
    );
  }

  function getCompleteTurnIndexProjectionPreference() {
    if (!completeTurnIndexAuthorityState.preferenceResolved) chatAtlasResolveCompleteIndexProjectionPreference();
    return chatAtlasFreeze({
      key: COMPLETE_TURN_INDEX_PREFERENCE_KEY,
      compiledDefault: COMPLETE_TURN_INDEX_COMPILED_DEFAULT,
      storedValue: completeTurnIndexAuthorityState.preferenceStoredValue,
      resolution: completeTurnIndexAuthorityState.preferenceResolution,
      activationSource: completeTurnIndexAuthorityState.activationSource,
      readCount: completeTurnIndexAuthorityState.preferenceReadCount,
      writeCount: completeTurnIndexAuthorityState.preferenceWriteCount,
      clearCount: completeTurnIndexAuthorityState.preferenceClearCount,
      bootApplyCount: completeTurnIndexAuthorityState.bootApplyCount,
      bootActivationCount: completeTurnIndexAuthorityState.bootActivationCount,
      readErrorCode: completeTurnIndexAuthorityState.preferenceReadErrorCode,
      writeErrorCode: completeTurnIndexAuthorityState.preferenceWriteErrorCode,
    });
  }

  function setCompleteTurnIndexProjectionPreference(value) {
    completeTurnIndexAuthorityState.preferenceSetterCallCount += 1;
    const enabled = value === true || value === '1';
    const disabled = value === false || value === '0';
    if (!enabled && !disabled) {
      return chatAtlasFreeze({ ok: false, changed: false, errorCode: 'preference-value-invalid', ...getCompleteTurnIndexProjectionPreference() });
    }
    const storedValue = enabled ? '1' : '0';
    try {
      W.localStorage?.setItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY, storedValue);
    } catch {
      completeTurnIndexAuthorityState.preferenceWriteFailureCount += 1;
      completeTurnIndexAuthorityState.preferenceWriteErrorCode = 'preference-write-failed';
      return chatAtlasFreeze({ ...getCompleteTurnIndexProjectionStatus(), ok: false, changed: false, errorCode: 'preference-write-failed' });
    }
    completeTurnIndexAuthorityState.preferenceWriteCount += 1;
    completeTurnIndexAuthorityState.preferenceWriteErrorCode = null;
    completeTurnIndexAuthorityState.preferenceResolved = true;
    completeTurnIndexAuthorityState.preferenceStoredValue = storedValue;
    completeTurnIndexAuthorityState.preferenceResolution = enabled ? 'stored-enabled' : 'stored-disabled';
    const applied = chatAtlasApplyCompleteIndexProjectionEnabled(enabled, 'persisted-preference-setter');
    return chatAtlasFreeze({ ok: true, persisted: true, storedValue, ...applied });
  }

  function clearCompleteTurnIndexProjectionPreference() {
    completeTurnIndexAuthorityState.preferenceSetterCallCount += 1;
    try {
      W.localStorage?.removeItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY);
    } catch {
      completeTurnIndexAuthorityState.preferenceWriteFailureCount += 1;
      completeTurnIndexAuthorityState.preferenceWriteErrorCode = 'preference-clear-failed';
      return chatAtlasFreeze({ ...getCompleteTurnIndexProjectionStatus(), ok: false, changed: false, errorCode: 'preference-clear-failed' });
    }
    completeTurnIndexAuthorityState.preferenceClearCount += 1;
    completeTurnIndexAuthorityState.preferenceWriteErrorCode = null;
    completeTurnIndexAuthorityState.preferenceResolved = true;
    completeTurnIndexAuthorityState.preferenceStoredValue = null;
    completeTurnIndexAuthorityState.preferenceResolution = 'compiled-default-disabled';
    const applied = chatAtlasApplyCompleteIndexProjectionEnabled(COMPLETE_TURN_INDEX_COMPILED_DEFAULT, 'preference-cleared');
    return chatAtlasFreeze({ ok: true, cleared: true, ...applied });
  }

  function rebuildCompleteTurnIndexProjection() {
    if (!completeTurnIndexAuthorityState.enabled) {
      buildTurns();
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const route = chatAtlasFullIndexRoute();
    const expansionSnapshot = chatAtlasBranchExpansionRebuildSnapshot();
    chatAtlasResetCompleteIndexRoute(route, false, { preserveBranchSelectionStale: true });
    const staleCheckpoint = chatAtlasBranchSelectionStaleCheckpoint();
    return Promise.resolve(chatAtlasTriggerCompleteIndexAuthority()).then((result) => {
      if (staleCheckpoint && chatAtlasCompleteIndexExplicitRefreshSucceeded(result)) {
        let expansionHandled = false;
        const targetIndex = chatAtlasCanonicalPresentationIndex();
        if (
          expansionSnapshot
          && Array.isArray(targetIndex?.turns)
          && targetIndex.turns.length > Number(expansionSnapshot.priorEffectiveCount || 0)
        ) {
          const rebasedIntent = Object.freeze({
            ...expansionSnapshot,
            generation: Number(completeTurnIndexAuthorityState.generation || 0),
            staleRevision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
          });
          expansionHandled = !!chatAtlasOpenBranchExpansion(rebasedIntent, targetIndex);
          if (expansionHandled) {
            chatAtlasCompleteBranchExpansionCheckpoint('explicit-rebuild-complete', {
              allowConfirmation: true,
            });
          }
        }
        if (!expansionHandled) {
          chatAtlasClearBranchSelectionStale(staleCheckpoint, 'explicit-rebuild-complete');
        }
      }
      return result;
    });
  }

  function refreshCompleteTurnIndexProjection(cause = 'explicit-rebuild') {
    if (!completeTurnIndexAuthorityState.enabled) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const staleCheckpoint = chatAtlasBranchSelectionStaleCheckpoint();
    const refreshScope = Object.freeze({
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
    });
    const requestAlreadyActive = completeIndexRefreshCoordinator?.getStatus?.()?.requestActive === true;
    const runExplicitRefresh = () => chatAtlasScheduleCompleteIndexRefresh(
      String(cause || 'explicit-rebuild'),
      { immediate: true },
    );
    let operation = Promise.resolve(runExplicitRefresh());
    if (requestAlreadyActive) {
      // The in-flight request began before this explicit action and therefore
      // cannot honestly clear its stale checkpoint. Once it settles, replace
      // the coordinator's single queued trailing timer with one immediate,
      // route-scoped explicit validation and await that result instead.
      operation = operation.then(() => {
        const scopeCurrent = completeTurnIndexAuthorityState.enabled === true
          && refreshScope.chatId === String(completeTurnIndexAuthorityState.chatId || '')
          && refreshScope.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
          && refreshScope.generation === Number(completeTurnIndexAuthorityState.generation || 0);
        return scopeCurrent ? runExplicitRefresh() : getCompleteTurnIndexProjectionStatus();
      });
    }
    return operation.then((result) => {
      const refreshSucceeded = chatAtlasCompleteIndexExplicitRefreshSucceeded(result);
      const expansionHandled = refreshSucceeded && (
        chatAtlasCompleteBranchExpansionCheckpoint('explicit-refresh-complete', {
          allowConfirmation: true,
        })
        || chatAtlasRecheckFailedBranchExpansion('explicit-refresh-later-confirmation')
      );
      if (
        !expansionHandled
        &&
        staleCheckpoint
        && chatAtlasCompleteIndexExplicitRefreshSucceeded(result)
        && chatAtlasBranchSelectionStaleReconciled(staleCheckpoint)
      ) {
        chatAtlasClearBranchSelectionStale(staleCheckpoint, 'explicit-refresh-complete');
      }
      return result;
    });
  }

  const COMPLETE_TURN_INDEX_EVENT_CAUSES = Object.freeze({
    'question-branch-selected': 'question-branch-changed',
    'question-branch-switch': 'question-branch-changed',
    'selected-path-changed': 'question-selected-path-changed',
    'selected-path-switch': 'question-selected-path-changed',
    'edited-question-selected-path': 'question-selected-path-changed',
    'answer-branch-selected': 'answer-branch-changed',
    'turn-stopped': 'turn-stopped',
    'response-stopped': 'turn-stopped',
    'turn-settled': 'turn-settled',
    'stream-complete': 'turn-settled',
    'assistant-stream-complete': 'turn-settled',
  });

  function chatAtlasCompleteIndexTurnEventCause(detail) {
    const raw = String(
      detail?.completeIndexCause
      || detail?.cause
      || detail?.reason
      || detail?.kind
      || '',
    ).trim().toLowerCase();
    return COMPLETE_TURN_INDEX_EVENT_CAUSES[raw] || '';
  }

  function chatAtlasHandleCompleteIndexTurnEvent(detail = {}) {
    if (!completeTurnIndexAuthorityState.enabled) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const cause = chatAtlasCompleteIndexTurnEventCause(detail);
    if (!cause) {
      const pendingCount = completeTurnIndexAuthorityState.pendingDrafts.size;
      if (pendingCount) completeIndexRefreshCoordinator?.markPending?.(pendingCount);
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    if (cause === 'turn-stopped') {
      const qId = chatAtlasCompleteIndexIdentity(detail?.qId || detail?.questionId || detail?.turn?.qId);
      const pending = qId ? completeTurnIndexAuthorityState.pendingDrafts.get(qId) : null;
      if (pending) {
        completeTurnIndexAuthorityState.pendingDrafts.set(qId, {
          ...pending,
          stopped: true,
          noAnswer: true,
          completeIndexPending: true,
          livePendingProvenance: 'live-pending-overlay',
        });
        completeIndexRefreshCoordinator?.markPending?.(completeTurnIndexAuthorityState.pendingDrafts.size);
      }
    }
    const selectedPathEvidence = chatAtlasCompleteIndexSelectedPathEvidence(cause, detail);
    return chatAtlasScheduleCompleteIndexRefresh(cause, selectedPathEvidence
      ? { selectedPathEvidence }
      : {});
  }

  function chatAtlasBindCompleteIndexRefreshListeners() {
    if (completeTurnIndexAuthorityState.refreshListenerBound) return true;
    const onCanonicalTurnUpdated = (detail) => { void chatAtlasHandleCompleteIndexTurnEvent(detail || {}); };
    H2O.bus.on(EV_CORE_TURN_UPDATED, onCanonicalTurnUpdated);
    D.addEventListener('click', chatAtlasRecordTrustedNativeBranchSelection, true);
    completeTurnIndexAuthorityState.refreshListenerBound = true;
    completeTurnIndexAuthorityState.refreshListenerRegistrationCount += 1;
    return true;
  }
  completeIndexRefreshCoordinator = createCompleteIndexRefreshCoordinator({
    isEnabled: () => chatAtlasCompleteIndexAuthorityActive(),
    routeKey: () => `${completeTurnIndexAuthorityState.chatId || ''}|${completeTurnIndexAuthorityState.routeKey || ''}`,
    chatId: () => completeTurnIndexAuthorityState.chatId,
    currentIndex: () => completeTurnIndexAuthorityState.index,
    pendingCount: () => completeTurnIndexAuthorityState.pendingDrafts.size,
    provider: () => {
      const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
      if (typeof provider !== 'function') return null;
      return (chatId, opts) => {
        completeTurnIndexAuthorityState.fetchCount += 1;
        const context = Object.freeze({
          chatId: String(completeTurnIndexAuthorityState.chatId || ''),
          routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
          generation: Number(completeTurnIndexAuthorityState.generation || 0),
        });
        return Promise.resolve(provider(chatId, {
          ...(opts || {}),
          includeIdentityGraph: true,
        })).then((result) => {
          const scopeCurrent = context.chatId === String(completeTurnIndexAuthorityState.chatId || '')
            && context.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
            && context.generation === Number(completeTurnIndexAuthorityState.generation || 0);
          if (scopeCurrent) {
            const retainedCurrentGraph = chatAtlasRetainIdentityGraph(result, context);
            if (retainedCurrentGraph) {
              chatAtlasTryPublishRetainedBranchTransaction('coordinator-graph-acquisition');
            }
          }
          return result;
        });
      };
    },
    normalize: (raw, chatId) => chatAtlasNormalizeCompleteIndexEnvelope(raw, chatId, { source: 'host' }),
    compareRevision: chatAtlasCompareCompleteIndexRevision,
    selectedPathConfirmed: chatAtlasCompleteIndexSelectedPathConfirmed,
    selectedPathEvidenceCurrent: chatAtlasCompleteIndexSelectedPathEvidenceCurrent,
    selectedPathLeaseCurrent: chatAtlasCompleteIndexSelectedPathLeaseCurrent,
    selectedPathRequestScope: (evidence) => {
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (
        !intent
        || !evidence?.selectionToken
        || evidence.selectionToken !== intent.token
        || evidence.qId !== intent.qId
      ) return null;
      return Object.freeze({
        requestIdentity: String(evidence.signature || ''),
        token: intent.token,
        chatId: intent.chatId,
        routeKey: intent.routeKey,
        generation: intent.generation,
        staleRevision: intent.staleRevision,
        qId: intent.qId,
      });
    },
    routeGeneration: () => Number(completeTurnIndexAuthorityState.generation || 0),
    reconciliationActive: () => completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true,
    onSelectedPathResolved: chatAtlasResolveTrustedNativeBranchSelection,
    onSelectedPathRequestLeaseQuiescent: (evidence) => {
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (
        !intent?.token
        || intent.token !== String(evidence?.selectionToken || '')
        || intent.qId !== String(evidence?.qId || '')
      ) return;
      // The bounded graph-only refetch is a separate live owner whose result
      // may publish the route and settle this lease. Its own terminal path will
      // close/re-evaluate the transaction; do not arm a competing timer while
      // that exact token is still active.
      if (selectedPathAcquisitionState.refetchActiveForToken === intent.token) return;
      let staleLease = false;
      try {
        const refresh = completeIndexRefreshCoordinator?.getStatus?.();
        staleLease = refresh?.selectedPathRequestLeaseActive === true
          && refresh?.requestActive !== true
          && refresh?.timerPending !== true
          && refresh?.selectedPathConfirmationPending !== true
          && completeIndexRefreshCoordinator?.selectedPathRequestOwnsIntent?.(intent) !== true;
      } catch {}
      if (!staleLease) return;
      const trustedWindowMs = Math.max(
        0,
        Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000),
      );
      const transaction = completeTurnIndexAuthorityState.branchTransactionState;
      const ageDeadlineAt = Number(intent.observedAt || Date.now()) + trustedWindowMs + 1;
      const transactionDeadlineAt = transaction?.state === 'pending'
        && transaction.token === intent.token
        ? Number(transaction.openedAt || Date.now()) + CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS + 1
        : ageDeadlineAt;
      chatAtlasScheduleTrustedNativeBranchReconcile(intent.token, {
        expiryWakeup: true,
        delayMs: Math.max(0, Math.max(ageDeadlineAt, transactionDeadlineAt) - Date.now()),
      });
    },
    trace: chatAtlasTraceTrustedLifecycle,
    writeCache: (envelope) => {
      const transaction = chatAtlasBranchTransactionCurrent();
      const effective = getEffectivePresentationIndex();
      const prefixOfCurrentOverlay = chatAtlasSelectedPathOverlayCurrent()
        && chatAtlasIndexIsStrictPrefixOf(envelope, effective);
      if (
        transaction?.state === 'pending'
        || transaction?.state === 'fail-closed'
        || prefixOfCurrentOverlay
      ) {
        completeTurnIndexAuthorityState.cacheWriteSkippedUnchangedCount += 1;
        return {
          ok: true,
          status: transaction?.state === 'pending' || transaction?.state === 'fail-closed'
            ? 'cache-write-deferred-branch-transaction'
            : 'cache-write-rejected-host-prefix',
          bytes: null,
          skipped: true,
        };
      }
      const result = chatAtlasWriteCompleteIndexCache(envelope);
      if (result.ok) completeTurnIndexAuthorityState.cacheRaw = result.bytes;
      return result;
    },
    publish: chatAtlasPublishCompleteIndex,
    onState: (detail) => {
      completeTurnIndexAuthorityState.status = String(detail?.status || completeTurnIndexAuthorityState.status);
      completeTurnIndexAuthorityState.startedAt = detail?.startedAt || completeTurnIndexAuthorityState.startedAt;
      completeTurnIndexAuthorityState.completedAt = detail?.completedAt || null;
      completeTurnIndexAuthorityState.errorCode = detail?.errorCode || null;
      completeTurnIndexAuthorityState.authorityUnpersisted = detail?.authorityUnpersisted === true;
      completeTurnIndexAuthorityState.cacheWriteErrorCode = detail?.cacheWriteErrorCode || null;
      chatAtlasNotifyCompleteIndexState();
    },
    setTimeout: W.setTimeout.bind(W),
    clearTimeout: W.clearTimeout.bind(W),
    AbortController: W.AbortController,
  });

  // ── Public Chat Atlas Core API ────────────────────────────────────────────
  // Registration key: TOPW.H2O_CHAT_ATLAS_CORE (plus H2O.chatAtlasCore for
  // namespace discovery). Kept narrow on purpose — Milestone 2B grows this file
  // enormously, and every name added here becomes a contract.
  // ── Atlas host surface consumed by the Ledger ─────────────────────────────
  // Milestone 2B-2 moved the central Chat Atlas implementation out of H2O Core
  // and into this file. The Ledger still needs those helpers, and it must not
  // reach past its broker to get them, so this file publishes them the same way
  // 0A1a publishes CHAT_ATLAS_HOST_SURFACE for the generic turn model. Direction
  // stays 0A1a -> 0A3a -> 0A3b: the Ledger asks the broker, and the broker now
  // answers from its own scope instead of forwarding to H2O Core.
  //
  // Declared here, after every member above is initialised, so none of these is
  // read in its temporal dead zone.
  const CHAT_ATLAS_CORE_HOST_SURFACE = {
    completeTurnIndexAuthorityState,
    getEffectivePresentationIndex,
    chatAtlasCanonicalPresentationIndex,
    chatAtlasClearBranchSelectionStale,
    chatAtlasCloseBranchTransaction,
    chatAtlasCompleteBranchExpansionCheckpoint,
    chatAtlasCompleteIndexAuthorityActive,
    chatAtlasCompleteIndexIdentity,
    chatAtlasCurrentChatKey,
    chatAtlasCv2CurrentIds,
    chatAtlasEvaluateHistoricalCompleteness,
    chatAtlasFailClosedPreExpansionReturn,
    chatAtlasFreeze,
    chatAtlasFullIndexRoute,
    chatAtlasNormalizeChatKey,
    chatAtlasNormalizeId,
    chatAtlasNow,
    chatAtlasNullableCount,
    chatAtlasOpenBranchExpansion,
    chatAtlasPairEvidence,
    chatAtlasReadEvidence,
    chatAtlasReadMiniMapCompletenessDiagnostics,
    chatAtlasRealBranchExpansionTargetValidation,
    chatAtlasSelectedPathEvaluate,
    chatAtlasSelectedPathOverlayEvaluate,
    chatAtlasTraceTrustedLifecycle,
  };

  function getAtlasHost() {
    return CHAT_ATLAS_CORE_HOST_SURFACE;
  }

  // -- Reveal semantic context reads -----------------------------------------
  // Reveal needs a handful of facts from central authority state. It does NOT
  // get the state objects: each of these returns a frozen record of primitives,
  // so no live object identity and no nested mutable structure crosses into
  // 0A3c. Every value is coerced here exactly as Reveal coerced it before.
  function getRevealRouteContext() {
    return chatAtlasFreeze({
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
    });
  }

  function getRevealSelectedPathContext() {
    return chatAtlasFreeze({
      graphCaptureIdentity: String(selectedPathAcquisitionState.graph?.captureIdentity || ''),
    });
  }

  function getRevealDefaultOverlayContext() {
    return chatAtlasFreeze({
      revealTargetQId: chatAtlasDefaultOverlayState.revealTargetQId ?? null,
      revealTargetExpectedAId: chatAtlasDefaultOverlayState.revealTargetExpectedAId ?? null,
      revealTargetCurrentAId: chatAtlasDefaultOverlayState.revealTargetCurrentAId ?? null,
      revealTargetOrder: chatAtlasDefaultOverlayState.revealTargetOrder ?? null,
      observedDivergenceKind: chatAtlasDefaultOverlayState.observedDivergenceKind ?? null,
      answerConvergenceSuppressed: chatAtlasDefaultOverlayState.answerConvergenceSuppressed === true,
      nativeRoute: chatAtlasDefaultOverlayState.nativeRoute ?? null,
      terminalNodeId: chatAtlasDefaultOverlayState.terminalNodeId ?? null,
    });
  }

  function getRevealQuestionEditPlanContext() {
    const plan = chatAtlasQuestionEditPlanState.plan;
    return chatAtlasFreeze({
      state: String(chatAtlasQuestionEditPlanState.state || 'idle'),
      reason: chatAtlasQuestionEditPlanState.reason || null,
      activations: Number(chatAtlasQuestionEditPlanState.activations || 0),
      plan: plan ? {
        pagerOwnerProven: plan.pagerOwnerProven === true,
        previousAvailable: plan.previousAvailable === true,
        nextAvailable: plan.nextAvailable === true,
        requiredDirection: plan.requiredDirection || null,
        variantCount: Number(plan.variantCount || 0),
        currentIndex: Number(plan.currentIndex ?? -1),
        targetIndex: Number(plan.targetIndex ?? -1),
        activationPermitted: plan.activationPermitted === true,
      } : null,
    });
  }

  // -- Reveal host surface consumed by 0A3c ----------------------------------
  // Narrow and read-only: the stateless helpers Reveal calls, plus the four
  // semantic context reads above. No central state object crosses this seam.
  // Declared after every member is initialised so none is read in its TDZ.
  const CHAT_ATLAS_REVEAL_HOST_SURFACE = {
    chatAtlasAnswerIdentityForRoot,
    chatAtlasCanonicalPresentationIndex,
    chatAtlasChainToRoot,
    chatAtlasCompleteIndexIdentity,
    chatAtlasCompleteIndexStableHash,
    chatAtlasComputeDefaultLatestCreatedPath,
    chatAtlasConvergenceAnswerVariantRoots,
    chatAtlasConvergenceBranchRoot,
    chatAtlasConvergenceExactIndicator,
    chatAtlasConvergenceGraphScope,
    chatAtlasConvergenceQuestionVariants,
    chatAtlasConvergenceUniqueNode,
    chatAtlasFreeze,
    chatAtlasGraphCreateTime,
    chatAtlasGraphDivergence,
    chatAtlasMapMountedNativePath,
    chatAtlasNativeVariantPagers,
    chatAtlasPagerAuditHash,
    chatAtlasTurn2AuditRole,
    getEffectivePresentationIndex,
    getRevealRouteContext,
    getRevealSelectedPathContext,
    getRevealDefaultOverlayContext,
    getRevealQuestionEditPlanContext,
  };

  function getRevealHost() {
    return CHAT_ATLAS_REVEAL_HOST_SURFACE;
  }

  const CHAT_ATLAS_CORE_API = {
    ver: CHAT_ATLAS_CORE_VER,

    // service registry
    _registerService: registerService,
    _registerLedgerService: (impl) => registerService(LEDGER_SERVICE, impl),
    getService,
    hasLedger,

    // host surfaces used by the Ledger: H2O Core's generic turn model, and the
    // central Chat Atlas implementation this file took over in Milestone 2B-2.
    getHost,
    getAtlasHost,
    getRevealHost,
    _registerRevealService: (impl) => registerService(REVEAL_SERVICE, impl),

    // semantic Ledger reads (no raw state escapes)
    getLedgerMembers,
    getLedgerVersion,

    // policy / entry points
    selectCanonicalDrafts,
    scheduleLedgerFlush,
    startLedger,
    buildLedgerCanonicalRecords,

    // ── Central Chat Atlas policy surface consumed by H2O Core ──────────────
    branchTransitionSuppressesLiveAppend: (...a) => chatAtlasBranchTransitionSuppressesLiveAppend(...a),
    completeIndexAuthorityActive: (...a) => chatAtlasCompleteIndexAuthorityActive(...a),
    getEffectivePresentationIndex: (...a) => getEffectivePresentationIndex(...a),
    completeIndexCanonicalDrafts: (...a) => chatAtlasCompleteIndexCanonicalDrafts(...a),
    completeIndexLiveDrafts: (...a) => chatAtlasCompleteIndexLiveDrafts(...a),
    completeIndexPendingCanonicalDrafts: (...a) => chatAtlasCompleteIndexPendingCanonicalDrafts(...a),
    readEvidence: (...a) => chatAtlasReadEvidence(...a),
    pairEvidence: (...a) => chatAtlasPairEvidence(...a),
    // Owner-side commands: H2O Core never writes this file's state.
    noteBranchTransitionSuppressedLiveAppend() { completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount += 1; },
    clearTrustedSelectedPathIntent() { completeTurnIndexAuthorityState.trustedSelectedPathIntent = null; },
    completeIndexAuthorityIndex: () => completeTurnIndexAuthorityState.index,

    // Peripheral subdomains moved in Milestone 2B-1
    revealDiagnostics: (...a) => chatAtlasRevealDiagnostics(...a),
    revealRunOneShot: (...a) => chatAtlasRevealRunOneShot(...a),
    revealReconcileTick: (...a) => chatAtlasRevealReconcileTick(...a),
    revealSupersede: (...a) => chatAtlasRevealSupersede(...a),
    // Two read-only facts H2O Core still consults while it owns the central
    // pipeline. Reveal state itself never leaves this file.
    getRevealTransactionState: () => chatAtlasRevealTransactionState(),
    getRevealReadinessTarget: () => chatAtlasRevealReadinessTarget(),
    fullIndexRoute: (...a) => chatAtlasFullIndexRoute(...a),
    triggerFullConversationIndex: (...a) => chatAtlasTriggerFullConversationIndex(...a),
    getConversationTurnIndexDiagnostics: (...a) => getConversationTurnIndexDiagnostics(...a),
  };

  try { TOPW.H2O_CHAT_ATLAS_CORE = CHAT_ATLAS_CORE_API; } catch {}
  if (W !== TOPW) { try { W.H2O_CHAT_ATLAS_CORE = CHAT_ATLAS_CORE_API; } catch {} }
  try { H2O.chatAtlasCore = CHAT_ATLAS_CORE_API; } catch {}

  // ── Chat Atlas boot ───────────────────────────────────────────────────────
  // H2O Core no longer orchestrates the Atlas subsystem; it starts itself here,
  // preserving the original ordering and fail-closed behaviour.
  try { chatAtlasBindCompleteIndexRefreshListeners(); } catch {}
  try { chatAtlasApplyCompleteIndexProjectionPreferenceAtBoot(); } catch {}

  try { TOPW.H2O_CHAT_ATLAS_CORE_READY = true; } catch {}

  // ── H2O.turnRuntime — Ledger-facing properties ────────────────────────────
  // H2O Core creates and owns the turnRuntime root; this file adopts the SAME
  // object and contributes only the Ledger-facing members it took over from
  // 0A1a. The certified surface is 37 properties and must stay 37: 31 remain
  // assigned by H2O Core, the 6 below move here. The Ledger never creates a
  // competing runtime root — it only supplies these implementations.
  (() => {
    const adopt = () => {
      const rt = (H2O && typeof H2O.turnRuntime === 'object' && H2O.turnRuntime)
        || (TOPW.H2O && typeof TOPW.H2O.turnRuntime === 'object' && TOPW.H2O.turnRuntime)
        || null;
      if (!rt) return false;
      Object.assign(rt, {
        // Chat-Atlas-facing properties relocated from H2O Core (Milestone 2B-2)
        getChatAtlasHistoricalCompleteness,
        getCompleteTurnIndexProjectionStatus,
        getChatAtlasBranchBadges,
        getChatAtlasEffectivePathIdentity,
        getChatAtlasDefaultLatestCreatedPath,
        getSelectedPathAcquisitionStatus,
        getSelectedPathDerivationDiagnostics,
        getGraphIdentityDiagnostics,
        getCompleteIndexIdentityProof,
        getEffectivePresentationIndex,
        getEffectivePresentationStatus,
        getEffectiveTurnRecordByQId,
        getEffectiveTurnRecordByAId,
        setCompleteTurnIndexProjectionCanary,
        setCompleteTurnIndexAutoBranchReconciliationCanary,
        getCompleteTurnIndexProjectionPreference,
        setCompleteTurnIndexProjectionPreference,
        clearCompleteTurnIndexProjectionPreference,
        rebuildCompleteTurnIndexProjection,
        refreshCompleteTurnIndexProjection,
        getChatAtlasTurnStructureDiagnostics: getCanonicalTurnStructureDiagnostics,
        getConversationTurnIndexDiagnostics,
        getChatAtlasLedgerSnapshot: (...a) => ledger()?.getSnapshot?.(...a) ?? null,
        getChatAtlasLedgerDiagnostics: (...a) => ledger()?.getDiagnostics?.(...a) ?? null,
        getChatAtlasConvergenceParity: (...a) => ledger()?.getConvergenceParity?.(...a) ?? null,
        subscribeChatAtlasLedger: (...a) => ledger()?.subscribe?.(...a) ?? (() => {}),
        getChatAtlasCanonicalSource: (...a) => ledger()?.getCanonicalSource?.(...a) ?? 'legacy',
        setChatAtlasCanonicalSource: (...a) => ledger()?.setCanonicalSource?.(...a) ?? false,
      });
      return true;
    };
    // H2O Core loads first, so the root normally exists already. The ready
    // event is the project's own signal; there is no polling and no timeout.
    if (!adopt()) {
      try { H2O.events?.onReady?.('h2o:core:turnRuntime', adopt); } catch {}
      try { H2O.events?.onReady?.('h2o:core', adopt); } catch {}
    }
  })();
})();
