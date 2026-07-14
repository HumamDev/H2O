/*
 * CV-3.2 reversible canonical-source canary console harness.
 *
 * Paste this whole file into the authenticated ChatGPT tab's DevTools console.
 * Evaluation only installs window.H2O_CV3_CANARY. It does not run a stage,
 * switch sources, click branches, submit prompts, scroll, or rebuild MiniMap.
 */
(() => {
  'use strict';

  const G = globalThis;
  const VERSION = 'cv3.2-canary-harness-v2';
  const SOURCE_LEGACY = 'legacy-durable-cache';
  const SOURCE_LEDGER = 'chat-atlas-ledger';
  const STAGE_PREFIX = 'h2o:cv3:';
  const BASELINE_KEY = 'h2o:cv3:legacy-baseline';
  const TURN_UPDATED_EVENT = 'evt:h2o:core:turn:updated';
  const ROLLBACK_INSTRUCTION = [
    'Run: await H2O_CV3_CANARY.P8()',
    'If normal rollback fails or throws: reload the page immediately.',
    'After reload, reinstall this harness and run: await H2O_CV3_CANARY.P8_RELOAD_VERIFY()',
  ];
  const OPTIONAL = 'optional';

  function nowIso() {
    return new Date().toISOString();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asString(value) {
    return value == null ? '' : String(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqueOrdered(values) {
    const seen = new Set();
    const result = [];
    for (const raw of values || []) {
      const value = asString(raw).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  function stableValue(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth > 12) return '[depth-limit]';
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return {
        element: true,
        tag: value.tagName,
        id: value.id || null,
        cgxui: value.getAttribute?.('data-cgxui') || null,
      };
    }
    if (value instanceof Map) {
      return Array.from(value.entries()).map(([key, item]) => [stableValue(key, depth + 1, seen), stableValue(item, depth + 1, seen)]);
    }
    if (value instanceof Set) return Array.from(value).map((item) => stableValue(item, depth + 1, seen));
    if (Array.isArray(value)) return value.slice(0, 500).map((item) => stableValue(item, depth + 1, seen));
    if (typeof value === 'object') {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      const output = {};
      for (const key of Object.keys(value).sort()) {
        const item = stableValue(value[key], depth + 1, seen);
        if (item !== undefined) output[key] = item;
      }
      seen.delete(value);
      return output;
    }
    return String(value);
  }

  function stableJson(value) {
    return JSON.stringify(stableValue(value));
  }

  function readStored(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStored(key, value) {
    const normalized = stableValue(value);
    const raw = JSON.stringify(normalized);
    if (raw.length > 900000) throw new Error(`bounded-evidence-limit-exceeded:${key}:${raw.length}`);
    sessionStorage.setItem(key, raw);
    return normalized;
  }

  function saveStage(stage, payload) {
    const result = {
      stage,
      capturedAt: nowIso(),
      ...payload,
    };
    writeStored(`${STAGE_PREFIX}${stage.toLowerCase()}`, result);
    console.log(`[CV-3.2 ${stage}]`, result);
    return result;
  }

  function getStage(stage) {
    return readStored(`${STAGE_PREFIX}${stage.toLowerCase()}`);
  }

  function safeRead(fn, fallback = null) {
    try {
      const value = fn();
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function runtime() {
    return G.H2O?.turnRuntime || null;
  }

  function activeChatKey() {
    const fromApi = safeRead(() => G.H2O?.surface?.chatId?.(), '');
    if (fromApi) return asString(fromApi);
    const path = asString(G.location?.pathname);
    const match = path.match(/\/(?:c|g\/[^/]+\/c)\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function comparableChatKey(value) {
    const text = asString(value).trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (!text) return '';
    const match = text.match(/(?:^|\/)(?:c\/)?([^/]+)$/);
    return asString(match?.[1] || text);
  }

  function canonicalRecords() {
    const rt = runtime();
    const records = safeRead(() => rt?.listTurnRecords?.(), []);
    return asArray(records).slice().sort((a, b) => {
      return asNumber(a?.turnNo || a?.idx || a?.index) - asNumber(b?.turnNo || b?.idx || b?.index);
    });
  }

  function ledgerSnapshot() {
    return safeRead(() => runtime()?.getChatAtlasLedgerSnapshot?.(), { ledgerReady: false, members: [] });
  }

  function ledgerDiagnostics() {
    return safeRead(() => runtime()?.getChatAtlasLedgerDiagnostics?.(), { ledgerReady: false });
  }

  function convergenceParity() {
    return safeRead(() => runtime()?.getChatAtlasConvergenceParity?.(), {
      parityStatus: 'unknown',
      blockers: ['convergence-api-unavailable'],
    });
  }

  function sourceState(diagnostics = ledgerDiagnostics()) {
    const source = diagnostics?.canonicalSource || {};
    const active = safeRead(() => runtime()?.getChatAtlasCanonicalSource?.(), null);
    return {
      activeSource: active || source.activeSource || null,
      effectiveSource: source.effectiveSource || null,
      defaultSource: source.defaultSource || null,
      supportedSources: asArray(source.supportedSources).slice(),
      switchCount: asNumber(source.switchCount),
      invalidSwitchCount: asNumber(source.invalidSwitchCount),
      rejectedSwitchCount: asNumber(source.rejectedSwitchCount),
      lastSourceSwitch: source.lastSourceSwitch || null,
      lastSelection: source.lastSelection || null,
      persisted: source.persisted,
    };
  }

  function turnVersion() {
    return asNumber(safeRead(() => G.H2O?.turn?.version?.(), 0));
  }

  function miniMapRoot() {
    return document.querySelector([
      '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
      '[data-h2o-owner="minimap-v10"]',
    ].join(', '));
  }

  function miniMapBoxes() {
    const root = miniMapRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll('[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"], .cgxui-mm-btn'))
      .map((button, domIndex) => {
        const wrap = button.closest?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap');
        return {
          domIndex,
          label: asString(button.textContent).replace(/\s+/g, ' ').trim().slice(0, 80),
          turnNo: asNumber(button.dataset?.turnIdx || wrap?.dataset?.turnIdx),
          turnId: asString(button.dataset?.turnId || wrap?.dataset?.turnId).replace(/^turn:/, ''),
          qId: asString(button.dataset?.questionId || wrap?.dataset?.questionId),
          primaryAId: asString(button.dataset?.primaryAId || wrap?.dataset?.primaryAId),
          pageNo: asNumber(button.dataset?.page || wrap?.dataset?.page),
          noAnswer: button.hasAttribute?.('data-h2o-no-answer') || wrap?.hasAttribute?.('data-h2o-no-answer') || false,
          washName: button.getAttribute?.('data-h2o-wash-name') || null,
          washId: button.getAttribute?.('data-h2o-wash-id') || null,
        };
      })
      .sort((a, b) => a.domIndex - b.domIndex);
  }

  function compatMapSizes() {
    return {
      mapButtons: G.H2O_MM_mapButtons instanceof Map ? G.H2O_MM_mapButtons.size : null,
      turnById: G.H2O_MM_turnById instanceof Map ? G.H2O_MM_turnById.size : null,
      coreTurnList: asNumber(safeRead(() => G.H2O_MM_CORE_API?.getTurnList?.().length, 0)),
    };
  }

  function miniMapPerf() {
    const stats = safeRead(() => G.H2O?.perf?.modules?.miniMapEngine?.getStats?.(), null);
    return stats ? {
      rebuild: stats.rebuild || null,
      automaticRefresh: stats.automaticRefresh || null,
      rafOnce: stats.rafOnce || null,
      structureRecovery: stats.structureRecovery || null,
    } : null;
  }

  function recordAliases(record) {
    return uniqueOrdered([
      record?.turnId,
      record?.qId,
      record?.primaryAId,
      ...asArray(record?.answerIds),
      ...asArray(record?._aliasIds),
      ...asArray(record?.aliasIds),
    ].map((value) => asString(value).replace(/^turn:/, '')));
  }

  function ledgerRows(snapshot = ledgerSnapshot()) {
    return asArray(snapshot?.members).map((member) => ({
      logicalMemberKey: member?.logicalMemberKey || null,
      turnNo: asNumber(member?.turnNo),
      qId: member?.question?.qId || null,
      primaryAId: member?.answer?.primaryAId || null,
      currentAnswerIds: asArray(member?.answer?.currentAnswerIds).slice(),
      questionCurrentAliases: asArray(member?.question?.currentAliases).slice(),
      answerCurrentAliases: asArray(member?.answer?.currentAliases).slice(),
      questionResolverAliases: asArray(member?.question?.aliases).slice(),
      answerResolverAliases: asArray(member?.answer?.aliases).slice(),
      resolverAliases: asArray(member?.resolverAliases).slice(),
      noAnswer: !!member?.noAnswer,
      hydration: member?.hydration || 'none',
      pageNo: asNumber(member?.pageNo),
      pageIndex: asNumber(member?.pageIndex),
    })).sort((a, b) => a.turnNo - b.turnNo);
  }

  function canonicalRows(records = canonicalRecords()) {
    return records.map((record, index) => {
      const turnNo = asNumber(record?.turnNo || record?.idx || record?.index || index + 1);
      return {
        turnNo,
        idx: record?.idx ?? null,
        turnId: asString(record?.turnId).replace(/^turn:/, '') || null,
        qId: record?.qId || null,
        primaryAId: record?.primaryAId || null,
        answerIds: asArray(record?.answerIds).slice(),
        aliases: asArray(record?._aliasIds).slice(),
        noAnswer: record?.noAnswer === true || record?.hasAssistant === false || (!record?.primaryAId && !asArray(record?.answerIds).length),
        pageNo: turnNo > 0 ? Math.floor((turnNo - 1) / 25) + 1 : 0,
      };
    });
  }

  function perTurnRows(records = canonicalRecords(), snapshot = ledgerSnapshot()) {
    const ledgerByTurn = new Map(ledgerRows(snapshot).map((row) => [row.turnNo, row]));
    return canonicalRows(records).map((record) => {
      const ledger = ledgerByTurn.get(record.turnNo) || null;
      return {
        logicalMemberKey: ledger?.logicalMemberKey || null,
        turnNo: record.turnNo,
        qId: record.qId,
        primaryAId: record.primaryAId,
        currentAnswerIds: ledger?.currentAnswerIds || [],
        currentAliases: uniqueOrdered([
          ...(ledger?.questionCurrentAliases || []),
          ...(ledger?.answerCurrentAliases || []),
        ]),
        answerResolverAliases: asArray(ledger?.answerResolverAliases).slice(),
        resolverAliases: asArray(ledger?.resolverAliases).slice(),
        answerIds: record.answerIds,
        noAnswer: record.noAnswer,
        pageNo: record.pageNo,
      };
    });
  }

  function identityAlignment(records = canonicalRecords(), boxes = miniMapBoxes()) {
    const boxByTurn = new Map();
    const duplicateTurns = [];
    for (const box of boxes) {
      if (boxByTurn.has(box.turnNo)) duplicateTurns.push(box.turnNo);
      else boxByTurn.set(box.turnNo, box);
    }
    const drifts = [];
    for (const row of canonicalRows(records)) {
      const box = boxByTurn.get(row.turnNo);
      const reasons = [];
      if (!box) reasons.push('box-missing');
      else {
        if (row.qId && box.qId && row.qId !== box.qId) reasons.push('question-id-mismatch');
        if (row.primaryAId) {
          if (row.primaryAId !== box.primaryAId) reasons.push('primary-id-mismatch');
        } else if (row.noAnswer && box.primaryAId) reasons.push('no-answer-primary-present');
      }
      if (reasons.length) drifts.push({ turnNo: row.turnNo, expected: row, actual: box || null, reasons });
    }
    return {
      ok: drifts.length === 0 && duplicateTurns.length === 0 && records.length === boxes.length,
      drifts,
      duplicateTurns: uniqueOrdered(duplicateTurns.map(String)).map(Number),
    };
  }

  function visibleNumbers() {
    const read = (selector, type) => Array.from(document.querySelectorAll(selector)).slice(0, 250).map((el) => ({
      type,
      text: asString(el.textContent).replace(/\s+/g, ' ').trim().slice(0, 80),
      number: asNumber(el.getAttribute?.('data-h2o-big-answer-num') || el.getAttribute?.('data-h2o-turn-num') || el.textContent),
      answerId: el.getAttribute?.('data-h2o-big-answer-id') || el.closest?.('[data-message-id]')?.getAttribute?.('data-message-id') || null,
      turnId: el.getAttribute?.('data-h2o-big-answer-turn-id') || el.closest?.('[data-turn-id]')?.getAttribute?.('data-turn-id') || null,
    }));
    return {
      answer: read('[data-h2o-big-answer-num]', 'answer'),
      question: read('.cgxui-qbig-number', 'question'),
    };
  }

  function titleBars() {
    return Array.from(document.querySelectorAll('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]')).slice(0, 250).map((bar) => ({
      turnNo: asNumber(bar.getAttribute?.('data-h2o-turn-num') || bar.getAttribute?.('data-h2o-stack-turn-no')),
      answerId: bar.getAttribute?.('data-answer-id') || null,
      title: asString(bar.textContent).replace(/\s+/g, ' ').trim().slice(0, 160),
      inTitleStack: bar.hasAttribute?.('data-h2o-in-title-stack'),
      washName: bar.getAttribute?.('data-h2o-title-wash') || null,
    }));
  }

  function timestamps() {
    return Array.from(document.querySelectorAll('.cgxui-ats-ts, [data-cgxui="ats-stamp"], .chatgpt-timestamp')).slice(0, 250).map((stamp) => ({
      text: asString(stamp.textContent).replace(/\s+/g, ' ').trim().slice(0, 100),
      fullLabel: stamp.dataset?.fullLabel || null,
      answerId: stamp.closest?.('[data-message-id]')?.getAttribute?.('data-message-id') || null,
    }));
  }

  function pageDividers() {
    const selector = [
      '[data-cgxui*="page-divider"]',
      '[data-h2o-page-num]',
      '[data-page-num][data-cgxui-owner]',
      '[data-cgxui="chat-page-title-list-synth"]',
    ].join(', ');
    return Array.from(document.querySelectorAll(selector)).slice(0, 100).map((el) => ({
      cgxui: el.getAttribute?.('data-cgxui') || null,
      pageNo: asNumber(el.getAttribute?.('data-h2o-page-num') || el.getAttribute?.('data-page-num') || el.dataset?.page),
      text: asString(el.textContent).replace(/\s+/g, ' ').trim().slice(0, 120),
      hidden: !!el.hidden,
    }));
  }

  function washerProjection(records = canonicalRecords(), boxes = miniMapBoxes()) {
    const api = G.H2O?.MM?.wash;
    if (!api || typeof api.inspectMiniBtn !== 'function') return { available: false, rows: [], mismatches: [] };
    const boxesByTurn = new Map(boxes.map((box) => [box.turnNo, box]));
    const root = miniMapRoot();
    const rows = [];
    for (const record of canonicalRows(records)) {
      const box = boxesByTurn.get(record.turnNo);
      const button = box && root?.querySelector?.(`[data-cgxui="mnmp-btn"][data-turn-idx="${record.turnNo}"], [data-cgxui="mm-btn"][data-turn-idx="${record.turnNo}"]`);
      if (!button) continue;
      const inspected = safeRead(() => api.inspectMiniBtn(record.primaryAId || record.qId || '', button), null);
      rows.push({
        turnNo: record.turnNo,
        primaryAId: record.primaryAId,
        matchesExpected: inspected?.matchesExpected ?? null,
        shouldWash: inspected?.shouldWash ?? null,
        actualWashed: inspected?.actualWashed ?? null,
        colorName: inspected?.colorName || null,
        projectedWashName: inspected?.projectedWashName || null,
      });
    }
    return { available: true, rows, mismatches: rows.filter((row) => row.matchesExpected === false) };
  }

  function consumerResult(name, present, failures = [], evidence = null) {
    return {
      name,
      status: !present ? 'absent' : (failures.length ? 'present-failing' : 'present-passing'),
      optionality: OPTIONAL,
      failures,
      evidence,
    };
  }

  function consumerAudit(records = canonicalRecords(), snapshot = ledgerSnapshot(), parity = convergenceParity()) {
    const rows = canonicalRows(records);
    const aliases = new Map();
    for (const row of records) {
      for (const id of recordAliases(row)) aliases.set(id, row);
    }
    const boxes = miniMapBoxes();
    const alignment = identityAlignment(records, boxes);
    const maps = compatMapSizes();
    const bars = titleBars();
    const numbers = visibleNumbers();
    const stampRows = timestamps();
    const dividers = pageDividers();
    const wash = washerProjection(records, boxes);
    const navigator = G.H2ONavigator || G.HoNavigator || null;
    const navNodes = safeRead(() => navigator?.listNodes?.(), []);
    const shared = safeRead(() => G.H2O_MM_SHARED?.get?.(), null);
    const navControls = shared?.api?.rt || null;
    const threadPages = shared?.api?.mm?.chatPagesCtl || G.H2O?.ChatPageTitleIntent?.api || null;
    const threadState = safeRead(() => threadPages?.getState?.(), null);
    const pagination = G.H2O_Pagination || null;
    const paginationState = safeRead(() => pagination?.getDividerPaginationState?.(), null);
    const unmount = G.H2O?.UM?.nmntmssgs || null;
    const highlightDots = Array.from(document.querySelectorAll('[data-cgxui="mnmp-dotrow"][data-cgxui-owner="mnmp"]'));
    const highlightFailures = highlightDots.map((row) => ({
      turnId: asString(row.getAttribute?.('data-turn-id')).replace(/^turn:/, ''),
      answerId: asString(row.getAttribute?.('data-primary-a-id')),
      questionId: asString(row.getAttribute?.('data-question-id')),
    })).filter((row) => {
      const ids = [row.turnId, row.answerId, row.questionId].filter(Boolean);
      return ids.length > 0 && !ids.some((id) => aliases.has(id));
    }).map((row) => ({ reason: 'highlight-dot-identity-unresolved', row }));
    const activeNavigationId = asString(safeRead(() => navControls?.getActiveTurnId?.(), '')).replace(/^turn:/, '');
    const navigationFailures = activeNavigationId && !aliases.has(activeNavigationId)
      ? [{ reason: 'active-navigation-id-unresolved', activeNavigationId }]
      : [];

    const titleFailures = [];
    const titleTurnCounts = new Map();
    for (const bar of bars) {
      if (bar.turnNo) titleTurnCounts.set(bar.turnNo, (titleTurnCounts.get(bar.turnNo) || 0) + 1);
      if (bar.answerId && !aliases.has(asString(bar.answerId).replace(/^turn:/, ''))) titleFailures.push({ reason: 'unresolved-title-answer-id', row: bar });
    }
    for (const [turnNo, count] of titleTurnCounts) if (count > 1) titleFailures.push({ reason: 'duplicate-title-bars', turnNo, count });

    const answerNumberFailures = numbers.answer.filter((item) => item.number && !rows.some((row) => row.turnNo === item.number));
    const questionNumberFailures = numbers.question.filter((item) => item.number && !rows.some((row) => row.turnNo === item.number));
    const navFailures = asArray(navNodes).filter((node) => {
      const id = asString(node?.answerId || node?.turnId || node?.qId).replace(/^turn:/, '');
      return id && !aliases.has(id);
    }).slice(0, 24).map((node) => ({ reason: 'navigator-node-unresolved', node: stableValue(node) }));

    return {
      canonicalRecords: consumerResult('canonical-records', true, rows.length ? [] : ['canonical-records-empty'], { count: rows.length }),
      miniMap: consumerResult('MiniMap', !!miniMapRoot(), alignment.ok ? [] : alignment.drifts.concat(alignment.duplicateTurns), { count: boxes.length, alignment }),
      miniMapCompatMaps: consumerResult('MiniMap compat maps', maps.mapButtons != null || maps.turnById != null, [
        ...(maps.mapButtons != null && maps.mapButtons !== rows.length ? [`mapButtons:${maps.mapButtons}!=${rows.length}`] : []),
        ...(maps.turnById != null && maps.turnById !== rows.length ? [`turnById:${maps.turnById}!=${rows.length}`] : []),
      ], maps),
      pageDividers: consumerResult('page dividers', !!pagination || dividers.length > 0, [], { dividerRows: dividers, paginationState }),
      titleBars: consumerResult('title bars', bars.length > 0, titleFailures, { count: bars.length, rows: bars }),
      answerNumbers: consumerResult('Answer Numbers', numbers.answer.length > 0, answerNumberFailures, numbers.answer),
      questionNumbers: consumerResult('Question Numbers', numbers.question.length > 0, questionNumberFailures, numbers.question),
      timestamps: consumerResult('timestamps', stampRows.length > 0, [], { count: stampRows.length, rows: stampRows }),
      navigator: consumerResult('Navigator', !!navigator, navFailures, { nodeCount: asArray(navNodes).length }),
      navigationControls: consumerResult('Navigation Controls', !!navControls, navigationFailures, {
        activeTurnId: activeNavigationId || null,
      }),
      washer: consumerResult('Washer', wash.available, wash.mismatches, wash),
      threadPages: consumerResult('Thread Pages', !!threadPages, [], threadState),
      unmountAdapter: consumerResult('Unmount adapter', !!unmount, [], stableValue(unmount?.state || null)),
      paginationAdapter: consumerResult('Pagination adapter', !!pagination, [], paginationState),
      highlightDots: consumerResult('Highlight dots', highlightDots.length > 0, highlightFailures, { count: highlightDots.length }),
      convergence: consumerResult('convergence probe', true, asArray(parity?.blockers), {
        parityStatus: parity?.parityStatus,
        washerMatches: parity?.washerMatches,
        noAnswerMatches: parity?.noAnswerMatches,
      }),
    };
  }

  function aliasDiagnostics(diagnostics = ledgerDiagnostics(), snapshot = ledgerSnapshot()) {
    return {
      currentCrossMemberDuplicateCount: asNumber(diagnostics?.currentCrossMemberDuplicateCount),
      crossMemberAliasConflictCount: asNumber(diagnostics?.crossMemberAliasConflictCount),
      crossMemberAliasRepairCount: asNumber(diagnostics?.crossMemberAliasRepairCount),
      currentAliasConflictCount: asNumber(diagnostics?.currentAliasConflictCount),
      historicalAliasConflictCount: asNumber(diagnostics?.historicalAliasConflictCount),
      duplicateAliasCount: asNumber(diagnostics?.duplicateAliasCount),
      quarantinedAliasCount: asNumber(diagnostics?.quarantinedAliasCount ?? snapshot?.quarantinedAliasCount),
      quarantinedAliasResolutionCount: asNumber(diagnostics?.quarantinedAliasResolutionCount ?? snapshot?.quarantinedAliasResolutionCount),
      recentAliasConflicts: asArray(diagnostics?.recentAliasConflicts).slice(-12),
      quarantinedAliases: asArray(snapshot?.quarantinedAliases).slice(0, 12),
    };
  }

  function captureState(options = {}) {
    const records = canonicalRecords();
    const ledger = ledgerSnapshot();
    const diagnostics = ledgerDiagnostics();
    const parity = convergenceParity();
    const boxes = miniMapBoxes();
    const state = {
      href: location.href,
      activeChatKey: activeChatKey(),
      source: sourceState(diagnostics),
      turnVersion: turnVersion(),
      counts: {
        canonical: records.length,
        ledger: asNumber(ledger?.memberCount, asArray(ledger?.members).length),
        miniMap: boxes.length,
        ...compatMapSizes(),
      },
      ledgerSummary: {
        ledgerReady: !!ledger?.ledgerReady,
        chatKey: ledger?.chatKey || null,
        version: asNumber(ledger?.version),
        memberCount: asNumber(ledger?.memberCount, asArray(ledger?.members).length),
        completeShellMap: ledger?.completeShellMap ?? null,
      },
      dualRun: diagnostics?.dualRun || null,
      convergence: parity,
      aliasDiagnostics: aliasDiagnostics(diagnostics, ledger),
      miniMapAutomaticRefresh: miniMapPerf(),
      miniMapIdentityAlignment: identityAlignment(records, boxes),
    };
    if (options.includeRows) {
      state.canonicalRecords = canonicalRows(records);
      state.ledgerSnapshot = stableValue(ledger);
      state.perTurn = perTurnRows(records, ledger);
      state.miniMapBoxes = boxes;
      state.visibleNumbers = visibleNumbers();
      state.pageDividers = pageDividers();
      state.titleBars = titleBars();
      state.timestamps = timestamps();
      state.washerProjection = washerProjection(records, boxes);
      state.consumers = consumerAudit(records, ledger, parity);
      const variants = state.perTurn.filter((row) => row.answerIds.length > 1);
      state.knownMultiVariantTurn = variants.length ? variants[0] : null;
    }
    return state;
  }

  function countsEqual(counts) {
    const required = [counts?.canonical, counts?.ledger, counts?.miniMap, counts?.mapButtons, counts?.turnById];
    return required.every((value) => Number.isInteger(value) && value > 0) && new Set(required).size === 1;
  }

  function dualRunClean(dualRun) {
    return !!dualRun?.ready
      && dualRun?.exactParity === true
      && asNumber(dualRun?.currentMismatchCount) === 0
      && asNumber(dualRun?.totalMismatchCount) === 0
      && asNumber(dualRun?.missingInLegacyCount) === 0
      && asNumber(dualRun?.missingInAdapterCount) === 0
      && asNumber(dualRun?.duplicateIdentityCount) === 0
      && asNumber(dualRun?.duplicateAliasCount) === 0
      && asNumber(dualRun?.primaryRekeyCount) === 0
      && asNumber(dualRun?.instrumentationErrorCount) === 0;
  }

  function aliasClean(alias) {
    return asNumber(alias?.currentCrossMemberDuplicateCount) === 0
      && asNumber(alias?.crossMemberAliasConflictCount) === 0
      && asNumber(alias?.currentAliasConflictCount) === 0
      && asNumber(alias?.historicalAliasConflictCount) === 0
      && asNumber(alias?.duplicateAliasCount) === 0
      && asNumber(alias?.quarantinedAliasCount) === 0;
  }

  function broadAnswerResolverAliases(row) {
    return uniqueOrdered([
      ...asArray(row?.answerResolverAliases),
      ...asArray(row?.resolverAliases),
    ]);
  }

  function sameLogicalTurn(left, right) {
    if (!left || !right) return false;
    if (asNumber(left.turnNo) !== asNumber(right.turnNo)) return false;
    if (left.qId && right.qId && left.qId !== right.qId) return false;
    if (left.logicalMemberKey && right.logicalMemberKey
      && left.logicalMemberKey !== right.logicalMemberKey) return false;
    return true;
  }

  function evaluateStreamingIdentityContinuity(duringTurn, finalTurn, state = {}) {
    const reasons = [];
    const duringPrimaryAId = asString(duringTurn?.primaryAId).trim() || null;
    const finalPrimaryAId = asString(finalTurn?.primaryAId).trim() || null;
    const placeholderDuring = !!duringPrimaryAId
      && duringPrimaryAId.startsWith('request-placeholder-');

    if (!duringTurn) reasons.push('missing-p7-during-turn');
    if (!duringPrimaryAId) reasons.push('missing-p7-during-primary');
    if (!finalTurn) reasons.push('missing-final-turn');

    if (duringTurn && finalTurn) {
      if (!asNumber(duringTurn.turnNo) || !asNumber(finalTurn.turnNo)
        || asNumber(duringTurn.turnNo) !== asNumber(finalTurn.turnNo)) {
        reasons.push('streaming-turn-number-mismatch');
      }
      if (!duringTurn.qId || !finalTurn.qId) reasons.push('streaming-question-id-missing');
      else if (duringTurn.qId !== finalTurn.qId) reasons.push('streaming-question-id-mismatch');
      if (duringTurn.logicalMemberKey && finalTurn.logicalMemberKey
        && duringTurn.logicalMemberKey !== finalTurn.logicalMemberKey) {
        reasons.push('streaming-logical-member-key-mismatch');
      }
    }

    const finalBroadAliases = broadAnswerResolverAliases(finalTurn);
    const ownerRows = duringPrimaryAId
      ? asArray(state?.perTurn).filter((row) => broadAnswerResolverAliases(row).includes(duringPrimaryAId))
      : [];
    const quarantined = duringPrimaryAId
      ? asArray(state?.aliasDiagnostics?.quarantinedAliases).some((entry) => {
        return asString(entry?.alias ?? entry) === duringPrimaryAId;
      })
      : false;

    if (placeholderDuring) {
      if (!finalPrimaryAId) reasons.push('final-primary-missing');
      else {
        if (finalPrimaryAId === duringPrimaryAId) reasons.push('placeholder-remains-settled-primary');
        if (finalPrimaryAId.startsWith('request-placeholder-')) reasons.push('final-primary-is-placeholder');
      }
      if (!finalBroadAliases.includes(duringPrimaryAId)) {
        reasons.push('placeholder-broad-resolver-continuity-missing');
      }
      if (ownerRows.length !== 1) reasons.push('placeholder-owner-count-not-one');
      if (ownerRows.some((row) => !sameLogicalTurn(row, finalTurn))) {
        reasons.push('placeholder-owned-by-another-member');
      }
      if (quarantined) reasons.push('placeholder-quarantined');
      if (!aliasClean(state?.aliasDiagnostics)) reasons.push('alias-diagnostics-not-clean');
    } else if (duringPrimaryAId && finalPrimaryAId !== duringPrimaryAId) {
      reasons.push('already-final-primary-changed');
    }

    return {
      ok: reasons.length === 0,
      reasons: uniqueOrdered(reasons),
      placeholderDuring,
      duringPrimaryAId,
      finalPrimaryAId,
      sameTurn: sameLogicalTurn(duringTurn, finalTurn),
      finalBroadAliases,
      placeholderOwnerCount: ownerRows.length,
      placeholderOwnerTurnNos: ownerRows.map((row) => row.turnNo),
      placeholderQuarantined: quarantined,
      currentAliasesContainPlaceholder: placeholderDuring
        ? asArray(finalTurn?.currentAliases).includes(duringPrimaryAId)
        : false,
      currentAnswerIdsContainPlaceholder: placeholderDuring
        ? asArray(finalTurn?.currentAnswerIds).includes(duringPrimaryAId)
        : false,
    };
  }

  function sourceIs(state, source) {
    return state?.source?.activeSource === source && state?.source?.effectiveSource === source;
  }

  function currentProjectionIds(state) {
    const ids = new Set();
    for (const row of asArray(state?.perTurn)) {
      for (const id of [row.qId, row.primaryAId, ...asArray(row.currentAnswerIds), ...asArray(row.currentAliases)]) {
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  function counterDelta(before, after) {
    const result = {};
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of keys) {
      const a = before?.[key];
      const b = after?.[key];
      if (typeof a === 'number' || typeof b === 'number') result[key] = asNumber(b) - asNumber(a);
    }
    return result;
  }

  function sourceHistory() {
    return ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']
      .map((key) => readStored(`${STAGE_PREFIX}${key}`))
      .filter(Boolean)
      .map((stage) => ({
        stage: stage.stage,
        capturedAt: stage.capturedAt,
        activeSource: stage.state?.source?.activeSource || stage.after?.source?.activeSource || stage.source?.activeSource || null,
        effectiveSource: stage.state?.source?.effectiveSource || stage.after?.source?.effectiveSource || stage.source?.effectiveSource || null,
      }));
  }

  async function captureTurnEvents(action, settleMs = 1200) {
    const events = [];
    const handler = (event) => events.push(stableValue(event?.detail || {}));
    G.addEventListener(TURN_UPDATED_EVENT, handler);
    try {
      const result = action();
      await wait(settleMs);
      return { result: stableValue(result), events };
    } finally {
      G.removeEventListener(TURN_UPDATED_EVENT, handler);
    }
  }

  function compareAliasGauges(before, after) {
    const keys = [
      'currentCrossMemberDuplicateCount',
      'crossMemberAliasConflictCount',
      'currentAliasConflictCount',
      'historicalAliasConflictCount',
      'duplicateAliasCount',
      'quarantinedAliasCount',
    ];
    return Object.fromEntries(keys.map((key) => [key, asNumber(after?.[key]) - asNumber(before?.[key])]));
  }

  async function P0() {
    const rt = runtime();
    const state = captureState({ includeRows: false });
    const api = {
      runtime: !!rt,
      getter: typeof rt?.getChatAtlasCanonicalSource === 'function',
      setter: typeof rt?.setChatAtlasCanonicalSource === 'function',
      ledgerSnapshot: typeof rt?.getChatAtlasLedgerSnapshot === 'function',
      ledgerDiagnostics: typeof rt?.getChatAtlasLedgerDiagnostics === 'function',
      convergence: typeof rt?.getChatAtlasConvergenceParity === 'function',
      records: typeof rt?.listTurnRecords === 'function',
    };
    const ledgerChatMatches = !!comparableChatKey(state.activeChatKey)
      && comparableChatKey(state.activeChatKey) === comparableChatKey(state.ledgerSummary.chatKey);
    const gates = {
      APIsAvailable: Object.values(api).every(Boolean),
      legacyDefault: state.source.defaultSource === SOURCE_LEGACY,
      legacyActive: sourceIs(state, SOURCE_LEGACY),
      sourceNotPersisted: state.source.persisted === false,
      ledgerReady: state.ledgerSummary.ledgerReady === true,
      ledgerChatMatches,
      countsAgree: countsEqual(state.counts),
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
    };
    const ok = Object.values(gates).every(Boolean);
    return saveStage('P0', {
      ok,
      canSwitch: ok,
      api,
      gates,
      state,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      instruction: ok ? 'Run P1 next.' : 'ABORT. Do not run P2.',
    });
  }

  async function P1() {
    const preflight = getStage('P0');
    if (!preflight?.ok) return saveStage('P1', { ok: false, failureReasons: ['p0-not-passed'], instruction: 'Run P0 and resolve every gate.' });
    const state = captureState({ includeRows: true });
    const baseline = {
      capturedAt: nowIso(),
      ...state,
    };
    writeStored(BASELINE_KEY, baseline);
    const ok = sourceIs(state, SOURCE_LEGACY) && countsEqual(state.counts) && dualRunClean(state.dualRun);
    return saveStage('P1', {
      ok,
      baselineKey: BASELINE_KEY,
      state: baseline,
      multiVariantTurnFound: !!baseline.knownMultiVariantTurn,
      instruction: ok ? 'Review the baseline, then run P2.' : 'ABORT. Do not run P2.',
    });
  }

  async function P2() {
    const p0 = getStage('P0');
    const baseline = readStored(BASELINE_KEY);
    const before = captureState({ includeRows: false });
    if (!p0?.ok || !baseline || !sourceIs(before, SOURCE_LEGACY)) {
      return saveStage('P2', {
        ok: false,
        switched: false,
        failureReasons: ['preflight-or-baseline-invalid-or-source-not-legacy'],
        rollbackInstruction: ROLLBACK_INSTRUCTION,
      });
    }
    const eventCapture = await captureTurnEvents(() => {
      return runtime().setChatAtlasCanonicalSource(SOURCE_LEDGER);
    });
    const after = captureState({ includeRows: false });
    const result = eventCapture.result || {};
    const aliasDelta = compareAliasGauges(before.aliasDiagnostics, after.aliasDiagnostics);
    const gates = {
      setterOk: result.ok === true,
      changed: result.changed === true,
      ledgerActive: sourceIs(after, SOURCE_LEDGER),
      versionAdvanced: after.turnVersion > before.turnVersion,
      sourceNotPersisted: after.source.persisted === false,
      oneTurnUpdate: eventCapture.events.length === 1,
      mismatchStillZero: dualRunClean(after.dualRun),
      aliasGaugesUnchanged: Object.values(aliasDelta).every((value) => value === 0),
      ledgerStillReady: after.ledgerSummary.ledgerReady === true,
    };
    const ok = Object.values(gates).every(Boolean);
    return saveStage('P2', {
      ok,
      switched: sourceIs(after, SOURCE_LEDGER),
      gates,
      setterResult: result,
      turnUpdateEvents: eventCapture.events,
      before,
      after,
      aliasGaugeDelta: aliasDelta,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
      instruction: ok ? 'Wait for a stable UI, then run P3.' : 'STOP. Run P8 now; reload immediately if rollback fails.',
    });
  }

  async function P3() {
    await wait(1200);
    const baseline = readStored(BASELINE_KEY);
    const state = captureState({ includeRows: true });
    const baselineByTurn = new Map(asArray(baseline?.perTurn).map((row) => [row.turnNo, row]));
    const rawOrderChanges = state.perTurn.filter((row) => {
      const before = baselineByTurn.get(row.turnNo);
      return before && JSON.stringify(before.answerIds) !== JSON.stringify(row.answerIds);
    }).map((row) => ({ turnNo: row.turnNo, legacy: baselineByTurn.get(row.turnNo).answerIds, ledger: row.answerIds }));
    const visibleVariantChanges = rawOrderChanges.filter((change) => {
      const before = baselineByTurn.get(change.turnNo);
      const after = state.perTurn.find((row) => row.turnNo === change.turnNo);
      return before?.primaryAId !== after?.primaryAId;
    });
    const consumerFailures = Object.values(state.consumers || {}).filter((consumer) => consumer.status === 'present-failing');
    const gates = {
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      countsAgree: countsEqual(state.counts),
      identityAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
      consumersPass: consumerFailures.length === 0,
      visibleVariantBehaviorStable: visibleVariantChanges.length === 0,
    };
    return saveStage('P3', {
      ok: Object.values(gates).every(Boolean),
      gates,
      state,
      rawVariantOrderChanged: rawOrderChanges.length > 0,
      rawVariantOrderChanges: rawOrderChanges,
      visibleVariantBehaviorChanged: visibleVariantChanges.length > 0,
      visibleVariantBehaviorChanges: visibleVariantChanges,
      consumerResults: state.consumers,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P4_ARM() {
    const state = captureState({ includeRows: true });
    const ok = sourceIs(state, SOURCE_LEDGER) && countsEqual(state.counts);
    const payload = { ok, state, manualAction: 'Rapidly scroll top/bottom three times, pause mid-chat for two seconds, return to bottom, then wait ten seconds.' };
    writeStored(`${STAGE_PREFIX}p4-arm`, payload);
    console.log('[CV-3.2 P4 ARM]', payload);
    return payload;
  }

  async function P4() {
    const arm = readStored(`${STAGE_PREFIX}p4-arm`);
    if (!arm?.ok) return saveStage('P4', { ok: false, failureReasons: ['p4-arm-missing-or-failed'], rollbackInstruction: ROLLBACK_INSTRUCTION });
    const first = captureState({ includeRows: true });
    await wait(3000);
    const second = captureState({ includeRows: true });
    const beforeAuto = arm.state?.miniMapAutomaticRefresh?.automaticRefresh || {};
    const afterAuto = second.miniMapAutomaticRefresh?.automaticRefresh || {};
    const idleAutoDelta = counterDelta(first.miniMapAutomaticRefresh?.automaticRefresh || {}, afterAuto);
    const gates = {
      ledgerSource: sourceIs(second, SOURCE_LEDGER),
      countsAgree: countsEqual(second.counts),
      logicalMembershipStable: arm.state.counts.canonical === second.counts.canonical,
      miniMapAligned: second.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(second.dualRun),
      convergenceClean: asArray(second.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(second.aliasDiagnostics),
      noInstrumentationError: asNumber(second.dualRun?.instrumentationErrorCount) === 0,
      noIdleRebuildLoop: asNumber(idleAutoDelta.identityDriftRebuildCount) === 0 && asNumber(idleAutoDelta.coreTurnUpdatedRebuildCount) === 0,
    };
    return saveStage('P4', {
      ok: Object.values(gates).every(Boolean),
      gates,
      before: arm.state,
      firstSettledRead: first,
      state: second,
      automaticRefreshDelta: counterDelta(beforeAuto, afterAuto),
      idleThreeSecondAutomaticRefreshDelta: idleAutoDelta,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P5_ARM() {
    const state = captureState({ includeRows: true });
    const payload = {
      ok: sourceIs(state, SOURCE_LEDGER) && countsEqual(state.counts),
      state,
      manualAction: 'In the disposable branch conversation, select the shorter branch so downstream turns disappear. Do not navigate to another conversation.',
    };
    writeStored(`${STAGE_PREFIX}p5-arm`, payload);
    console.log('[CV-3.2 P5 ARM]', payload);
    return payload;
  }

  async function P5() {
    await wait(1500);
    const arm = readStored(`${STAGE_PREFIX}p5-arm`);
    const state = captureState({ includeRows: true });
    const beforeTurns = new Map(asArray(arm?.state?.perTurn).map((row) => [row.turnNo, row]));
    const afterTurns = new Map(state.perTurn.map((row) => [row.turnNo, row]));
    const removedTurns = Array.from(beforeTurns.values()).filter((row) => !afterTurns.has(row.turnNo));
    const currentIds = currentProjectionIds(state);
    const leakedRemovedIds = [];
    for (const row of removedTurns) {
      for (const id of [row.qId, row.primaryAId, ...row.currentAnswerIds]) if (id && currentIds.has(id)) leakedRemovedIds.push(id);
    }
    const gates = {
      armPassed: !!arm?.ok,
      sameChatRoute: comparableChatKey(arm?.state?.activeChatKey) === comparableChatKey(state.activeChatKey),
      countReduced: state.counts.canonical < asNumber(arm?.state?.counts?.canonical),
      countsAgree: countsEqual(state.counts),
      removedTurnsExist: removedTurns.length > 0,
      removedIdentitiesAbsent: leakedRemovedIds.length === 0,
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
    };
    return saveStage('P5', {
      ok: Object.values(gates).every(Boolean),
      gates,
      expectedReducedCount: state.counts.canonical,
      removedTurns,
      leakedRemovedIds: uniqueOrdered(leakedRemovedIds),
      state,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P6_ARM() {
    const p5 = getStage('P5');
    const payload = {
      ok: !!p5?.ok,
      state: captureState({ includeRows: true }),
      manualAction: 'Switch back to the original longer branch under the same conversation route, then wait for automatic MiniMap regrowth.',
    };
    writeStored(`${STAGE_PREFIX}p6-arm`, payload);
    console.log('[CV-3.2 P6 ARM]', payload);
    return payload;
  }

  async function P6() {
    await wait(1500);
    const arm = readStored(`${STAGE_PREFIX}p6-arm`);
    const baseline = readStored(BASELINE_KEY);
    const state = captureState({ includeRows: true });
    const baselineByTurn = new Map(asArray(baseline?.perTurn).map((row) => [row.turnNo, row]));
    const currentByTurn = new Map(state.perTurn.map((row) => [row.turnNo, row]));
    const restoredIdentityMismatches = [];
    for (const [turnNo, before] of baselineByTurn) {
      const after = currentByTurn.get(turnNo);
      if (!after || before.qId !== after.qId || before.primaryAId !== after.primaryAId) {
        restoredIdentityMismatches.push({ turnNo, expected: before, actual: after || null });
      }
    }
    const shortIds = currentProjectionIds(arm?.state || {});
    const baselineIds = currentProjectionIds(baseline || {});
    const currentIds = currentProjectionIds(state);
    const shortOnlyIds = Array.from(shortIds).filter((id) => !baselineIds.has(id));
    const leakedShortOnlyIds = shortOnlyIds.filter((id) => currentIds.has(id));
    const gates = {
      armPassed: !!arm?.ok,
      sameChatRoute: comparableChatKey(arm?.state?.activeChatKey) === comparableChatKey(state.activeChatKey),
      originalCountRestored: state.counts.canonical === asNumber(baseline?.counts?.canonical),
      countsAgree: countsEqual(state.counts),
      originalIdentitiesRestored: restoredIdentityMismatches.length === 0,
      shortOnlyCurrentIdentitiesAbsent: leakedShortOnlyIds.length === 0,
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
    };
    return saveStage('P6', {
      ok: Object.values(gates).every(Boolean),
      gates,
      restoredIdentityMismatches,
      shortOnlyIds,
      leakedShortOnlyIds,
      state,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P7_ARM() {
    const state = captureState({ includeRows: true });
    const payload = {
      ok: sourceIs(state, SOURCE_LEDGER) && countsEqual(state.counts),
      state,
      exactPrompt: 'CV-3 LEDGER CANARY STREAMING PASS',
      manualAction: 'Submit the exact prompt, then run P7_DURING while the answer is still streaming. Run P7 after completion.',
    };
    writeStored(`${STAGE_PREFIX}p7-arm`, payload);
    console.log('[CV-3.2 P7 ARM]', payload);
    return payload;
  }

  async function P7_DURING() {
    const state = captureState({ includeRows: true });
    const lastTurn = state.perTurn.at(-1) || null;
    const payload = {
      ok: !!lastTurn?.primaryAId,
      capturedAt: nowIso(),
      state,
      lastTurn,
      failureReasons: lastTurn?.primaryAId ? [] : ['missing-p7-during-primary'],
    };
    writeStored(`${STAGE_PREFIX}p7-during`, payload);
    console.log('[CV-3.2 P7 DURING]', payload);
    return payload;
  }

  async function P7() {
    await wait(1500);
    const arm = readStored(`${STAGE_PREFIX}p7-arm`);
    const during = readStored(`${STAGE_PREFIX}p7-during`);
    const state = captureState({ includeRows: true });
    const finalTurn = state.perTurn.at(-1) || null;
    const duringTurn = during?.lastTurn || null;
    const placeholder = duringTurn?.primaryAId || null;
    const streamingIdentityContinuity = evaluateStreamingIdentityContinuity(
      duringTurn,
      finalTurn,
      state,
    );
    const gates = {
      armPassed: !!arm?.ok,
      duringCapturePresent: !!during,
      canonicalIncreasedOne: state.counts.canonical === asNumber(arm?.state?.counts?.canonical) + 1,
      countsAgree: countsEqual(state.counts),
      finalAnswerPresent: !!finalTurn?.primaryAId && finalTurn.noAnswer === false,
      finalPrimaryPublishedByMiniMap: state.miniMapBoxes.some((box) => box.turnNo === finalTurn.turnNo && box.primaryAId === finalTurn.primaryAId),
      streamingIdentityContinuity: streamingIdentityContinuity.ok,
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
    };
    return saveStage('P7', {
      ok: Object.values(gates).every(Boolean),
      gates,
      exactPrompt: arm?.exactPrompt,
      before: arm?.state,
      during,
      finalTurn,
      requestPlaceholderCandidate: placeholder,
      streamingIdentityContinuity,
      state,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P8() {
    const baseline = readStored(BASELINE_KEY);
    const before = captureState({ includeRows: true });
    if (before.source.activeSource !== SOURCE_LEDGER) {
      return saveStage('P8', {
        ok: sourceIs(before, SOURCE_LEGACY),
        changed: false,
        state: before,
        failureReasons: sourceIs(before, SOURCE_LEGACY) ? [] : ['unexpected-source-before-rollback'],
        rollbackInstruction: ROLLBACK_INSTRUCTION,
      });
    }
    let eventCapture;
    try {
      eventCapture = await captureTurnEvents(() => {
        return runtime().setChatAtlasCanonicalSource(SOURCE_LEGACY);
      });
    } catch (error) {
      return saveStage('P8', {
        ok: false,
        changed: false,
        error: asString(error?.message || error),
        emergencyRollbackRequired: true,
        rollbackInstruction: ROLLBACK_INSTRUCTION,
      });
    }
    const after = captureState({ includeRows: true });
    const unchangedBaselineMismatches = [];
    const currentByTurn = new Map(after.perTurn.map((row) => [row.turnNo, row]));
    for (const row of asArray(baseline?.perTurn)) {
      const current = currentByTurn.get(row.turnNo);
      if (!current || row.qId !== current.qId || row.primaryAId !== current.primaryAId) {
        unchangedBaselineMismatches.push({ turnNo: row.turnNo, baseline: row, current: current || null });
      }
    }
    const result = eventCapture.result || {};
    const gates = {
      setterOk: result.ok === true,
      changed: result.changed === true,
      legacyActive: sourceIs(after, SOURCE_LEGACY),
      versionAdvanced: after.turnVersion > before.turnVersion,
      sourceNotPersisted: after.source.persisted === false,
      oneTurnUpdate: eventCapture.events.length === 1,
      countsAgree: countsEqual(after.counts),
      miniMapAligned: after.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(after.dualRun),
      convergenceClean: asArray(after.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(after.aliasDiagnostics),
      originalUnchangedTurnsEquivalent: unchangedBaselineMismatches.length === 0,
    };
    const ok = Object.values(gates).every(Boolean);
    return saveStage('P8', {
      ok,
      changed: result.changed === true,
      gates,
      setterResult: result,
      turnUpdateEvents: eventCapture.events,
      before,
      after,
      state: after,
      unchangedBaselineMismatches,
      emergencyRollbackRequired: !ok,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
      instruction: ok ? 'Run P9_ARM, wait 60 seconds, then run P9.' : 'Reload immediately, reinstall this harness, then run P8_RELOAD_VERIFY.',
    });
  }

  async function P8_RELOAD_VERIFY() {
    const state = captureState({ includeRows: true });
    const gates = {
      legacyActive: sourceIs(state, SOURCE_LEGACY),
      defaultLegacy: state.source.defaultSource === SOURCE_LEGACY,
      sourceNotPersisted: state.source.persisted === false,
      countsAgree: countsEqual(state.counts),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
    };
    const result = {
      ok: Object.values(gates).every(Boolean),
      emergencyRollbackUsed: true,
      gates,
      state,
      capturedAt: nowIso(),
    };
    writeStored(`${STAGE_PREFIX}p8-reload`, result);
    console.log('[CV-3.2 P8 RELOAD VERIFY]', result);
    return result;
  }

  async function P9_ARM() {
    const state = captureState({ includeRows: true });
    const payload = {
      ok: sourceIs(state, SOURCE_LEGACY),
      armedAt: nowIso(),
      state,
      manualAction: 'Wait a full 60 seconds without interacting, then run P9.',
    };
    writeStored(`${STAGE_PREFIX}p9-arm`, payload);
    console.log('[CV-3.2 P9 ARM]', payload);
    return payload;
  }

  async function P9() {
    const arm = readStored(`${STAGE_PREFIX}p9-arm`);
    const elapsedMs = Date.now() - Date.parse(arm?.armedAt || 0);
    const state = captureState({ includeRows: true });
    const beforeAuto = arm?.state?.miniMapAutomaticRefresh?.automaticRefresh || {};
    const afterAuto = state.miniMapAutomaticRefresh?.automaticRefresh || {};
    const autoDelta = counterDelta(beforeAuto, afterAuto);
    const aliasDelta = compareAliasGauges(arm?.state?.aliasDiagnostics || {}, state.aliasDiagnostics);
    const gates = {
      armPassed: !!arm?.ok,
      waitedAtLeast60Seconds: elapsedMs >= 60000,
      legacyActive: sourceIs(state, SOURCE_LEGACY),
      sourceSwitchCountStable: state.source.switchCount === arm?.state?.source?.switchCount,
      countsAgree: countsEqual(state.counts),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      noIdentityDriftRebuildGrowth: asNumber(autoDelta.identityDriftRebuildCount) === 0,
      noCoreRebuildGrowth: asNumber(autoDelta.coreTurnUpdatedRebuildCount) === 0,
      noMismatchGrowth: asNumber(state.dualRun?.totalMismatchCount) === asNumber(arm?.state?.dualRun?.totalMismatchCount),
      noConflictOrQuarantineGrowth: Object.values(aliasDelta).every((value) => value === 0),
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
    };
    return saveStage('P9', {
      ok: Object.values(gates).every(Boolean),
      gates,
      elapsedMs,
      automaticRefreshDelta: autoDelta,
      aliasGaugeDelta: aliasDelta,
      state,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P10() {
    const stages = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
      const key = `P${index}`;
      return [key, getStage(key)];
    }));
    const emergency = readStored(`${STAGE_PREFIX}p8-reload`);
    const missingStages = Object.entries(stages).filter(([, result]) => !result).map(([name]) => name);
    const failedStages = Object.entries(stages).filter(([, result]) => result && result.ok !== true).map(([name]) => name);
    const p3 = stages.P3;
    let canaryVerdict;
    if (!stages.P0?.ok) canaryVerdict = 'CANARY_ABORTED_PREFLIGHT';
    else if (emergency?.emergencyRollbackUsed) canaryVerdict = emergency.ok ? 'CANARY_FAILED_RELOAD_RECOVERED' : 'CANARY_FAILED_ROLLED_BACK';
    else if (failedStages.length || missingStages.length) canaryVerdict = 'CANARY_FAILED_ROLLED_BACK';
    else if (p3?.rawVariantOrderChanged && !p3?.visibleVariantBehaviorChanged) canaryVerdict = 'CANARY_PASS_WITH_VARIANT_ORDER_WATCH';
    else canaryVerdict = 'CANARY_PASS';
    const ok = canaryVerdict === 'CANARY_PASS' || canaryVerdict === 'CANARY_PASS_WITH_VARIANT_ORDER_WATCH';
    const result = {
      ok,
      canaryVerdict,
      emergencyRollbackUsed: !!emergency?.emergencyRollbackUsed,
      stageResults: Object.fromEntries(Object.entries(stages).map(([key, value]) => [key, value ? { ok: value.ok, failureReasons: value.failureReasons || [] } : null])),
      sourceHistory: sourceHistory(),
      baselineSummary: stages.P1?.state ? { counts: stages.P1.state.counts, source: stages.P1.state.source, turnVersion: stages.P1.state.turnVersion } : null,
      ledgerSummary: stages.P7?.state ? { counts: stages.P7.state.counts, source: stages.P7.state.source, ledger: stages.P7.state.ledgerSummary } : null,
      rollbackSummary: stages.P8?.state ? { counts: stages.P8.state.counts, source: stages.P8.state.source, turnVersion: stages.P8.state.turnVersion } : emergency || null,
      variantOrderFinding: {
        rawVariantOrderChanged: !!p3?.rawVariantOrderChanged,
        visibleVariantBehaviorChanged: !!p3?.visibleVariantBehaviorChanged,
        changes: p3?.rawVariantOrderChanges || [],
      },
      consumerResults: p3?.consumerResults || null,
      aliasDiagnostics: stages.P9?.state?.aliasDiagnostics || stages.P8?.state?.aliasDiagnostics || null,
      dualRunResults: stages.P9?.state?.dualRun || stages.P8?.state?.dualRun || null,
      convergenceResults: stages.P9?.state?.convergence || stages.P8?.state?.convergence || null,
      automaticRefreshResults: stages.P9?.state?.miniMapAutomaticRefresh || null,
      idleResults: stages.P9 || null,
      failureStage: failedStages[0] || missingStages[0] || null,
      failureReasons: [
        ...failedStages.flatMap((stage) => asArray(stages[stage]?.failureReasons).map((reason) => `${stage}:${reason}`)),
        ...missingStages.map((stage) => `${stage}:not-run`),
      ],
    };
    return saveStage('P10', result);
  }

  const API = Object.freeze({
    version: VERSION,
    sourceValues: Object.freeze({ legacy: SOURCE_LEGACY, ledger: SOURCE_LEDGER }),
    rollbackInstruction: Object.freeze(ROLLBACK_INSTRUCTION.slice()),
    P0,
    P1,
    P2,
    P3,
    P4_ARM,
    P4,
    P5_ARM,
    P5,
    P6_ARM,
    P6,
    P7_ARM,
    P7_DURING,
    P7,
    P8,
    P8_RELOAD_VERIFY,
    P9_ARM,
    P9,
    P10,
    evaluateStreamingIdentityContinuity,
    inspect: () => captureState({ includeRows: true }),
    readStage: (stage) => getStage(asString(stage).toUpperCase()),
  });

  Object.defineProperty(G, 'H2O_CV3_CANARY', {
    value: API,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  console.info(`[CV-3.2] Installed ${VERSION}. No stage or source switch has run.`);
})();
