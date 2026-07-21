// ==H2O Module==
// @h2o-id             1x1a.answer.numbers
// @name               1X1a.🔴🧮 Answer Numbers 🧮
// @namespace          H2O.Premium.CGX.answer.numbers
// @author             HumamDev
// @version            1.1.3
// @revision           002
// @build              260412-190500
// @description        Big left answer numbers extracted from Answer Numbers & Style, with incremental updates and lower layout churn.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  const W = window;
  const D = document;

  const TOK = 'H2O';
  const PID = 'AnsNums';
  const SkID = 'ansn'; // keep compatibility with prior classes/attrs
  const BrID = 'BR_ANSNUM';

  W[TOK] = W[TOK] || {};
  const H2O = W[TOK];

  H2O[BrID] = H2O[BrID] || {};
  const DIAG = (H2O[BrID].diag = H2O[BrID].diag || {
    pid: PID,
    bootCount: 0,
    disposeCount: 0,
    lastFlushMs: 0,
    lastFullScanCount: 0,
    lastIncCount: 0,
    lastErr: null,
  });

  const SEL = Object.freeze({
    ANSWER: '[data-message-author-role="assistant"]',
    USER: '[data-message-author-role="user"]',
    TURN: '[data-testid="conversation-turn"]',
    TURN_ANY: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
    TURNS: '[data-testid="conversation-turns"]',
    NUMBER_META: '[data-h2o-turn-num], .cgxui-ats-ts, .chatgpt-timestamp, [data-cgxui="ats-stamp"]',
  });

  const EV = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    IDX_UPDATED_WIN: 'h2o:index:updated',
    TURN_UPDATED_WIN: 'h2o:turn:updated',
    BUS_IDX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
    ROUTE_CHANGED: 'evt:h2o:route:changed',
  });

  const ATTR = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UNCLIP_DONE: `data-cgxui-${SkID}-unclip-done`,
    TURN_OVF_DONE: `data-cgxui-${SkID}-turn-ovf-done`,
    SIG_NUM: `data-cgxui-${SkID}-num`,
    SIG_SHORT: `data-cgxui-${SkID}-short`,
    SIG_REGEN: `data-cgxui-${SkID}-regen`,
    SIG_FAST: 'data-h2o-x1n-sig',
    CONTENT_SIG: 'data-h2o-x1n-csig',
    BIG_NUM: 'data-h2o-big-answer-num',
    BIG_NUM_SOURCE: 'data-h2o-big-answer-num-source',
    BIG_NUM_STABLE: 'data-h2o-big-answer-num-stable',
    BIG_TURN_ID: 'data-h2o-big-answer-turn-id',
    BIG_ANSWER_ID: 'data-h2o-big-answer-id',
  });

  const CSS = Object.freeze({
    STYLE_ID: 'cgxui-ansnum-style-v100',
    VAR_FADE_TOP: `--cgxui-${SkID}-bg-fade-top-px`,
    VAR_FADE_BOT: `--cgxui-${SkID}-bg-fade-bot-px`,
  });

  const CLS = Object.freeze({
    UNCLIP: `cgxui-${SkID}-ovf-unclip`,
    TURN_OVF: `cgxui-${SkID}-turn-ovf`,
    WRAP: `cgxui-${SkID}-answer-wrap`,
    BIG: `cgxui-${SkID}-big-number`,
    VFADE: `cgxui-${SkID}-big-vfade`,
    MAIN: `cgxui-${SkID}-abig-main`,
    REGEN: `cgxui-${SkID}-abig-regens`,
    DIGIT_1: `cgxui-${SkID}-digit-1`,
    DIGIT_2: `cgxui-${SkID}-digit-2`,
    DIGIT_3: `cgxui-${SkID}-digit-3`,
    DIGIT_4: `cgxui-${SkID}-digit-4`,
  });

  const CFG = Object.freeze({
    INC_PER_FRAME: 40,
    SHORT_SCROLLH_PX: 170,
    SHORT_MEASURE_MIN_MS: 500,
    BUS_DEBOUNCE_MS: 260,
    MAX_DELTA_CHILDREN: 24,
    PERF_LOG_MS: 10000,
  });

  const UI_CFG = Object.freeze({
    KEY: 'h2o:prm:cgx:ansn:cfg:ui:v1',
    DEFAULTS: Object.freeze({
      normalOpacity: 0.12,
      normalLeftPx: -140,
      normalScale: 1,
      normalRightFadeStartPct: 56,
      normalRightFadeEndOpacity: 0.12,
      collapsedOpacity: 0.09,
      collapsedLeftPx: -132,
      collapsedScale: 0.42,
      collapsedRightFadeStartPct: 70,
      collapsedRightFadeEndOpacity: 0.18,
    }),
  });

  const PERF = {
    enabled: false,
    processed: 0,
    fullScans: 0,
    deltaUpdates: 0,
    skippedBySig: 0,
    ticker: 0,
  };

  // Stable answer identity survives hydration churn; DOM position does not.
  // Route-scoped keys prevent a prior chat from supplying another chat's value.
  const STABLE_NUMBERS = {
    byAnswerId: new Map(),
    byTurnId: new Map(),
  };

  function PERF_init() {
    if (PERF.ticker) return;
    try { PERF.enabled = W.localStorage?.getItem('h2o:perf') === '1'; } catch {}
    if (!PERF.enabled) return;
    PERF.ticker = W.setInterval(() => {
      try {
        console.log('[1X1b/nums][perf]', {
          processed: PERF.processed,
          fullScans: PERF.fullScans,
          deltaUpdates: PERF.deltaUpdates,
          skippedBySig: PERF.skippedBySig,
        });
      } catch {}
      PERF.processed = 0;
      PERF.fullScans = 0;
      PERF.deltaUpdates = 0;
      PERF.skippedBySig = 0;
    }, CFG.PERF_LOG_MS);
  }

  function q(sel, root = D) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function UI_readCfg() {
    try {
      const raw = JSON.parse(W.localStorage?.getItem(UI_CFG.KEY) || '{}') || {};
      return UI_normalizeCfg(raw);
    } catch {
      return { ...UI_CFG.DEFAULTS };
    }
  }

  function UI_writeCfg(next) {
    const cfg = UI_normalizeCfg(next);
    try { W.localStorage?.setItem(UI_CFG.KEY, JSON.stringify(cfg)); } catch {}
    return cfg;
  }

  function UI_normalizeCfg(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const legacyFadeStrength = clamp(src.rightFadeStrength, 0.0, 1.0, 0.65);
    const legacyFadeStartPct = 68 - (50 * legacyFadeStrength);
    const legacyFadeEndOpacity = clamp(src.rightFadeEndOpacity, 0.0, 1.0, 0.0);
    return {
      normalOpacity: clamp(src.normalOpacity, 0.02, 0.35, UI_CFG.DEFAULTS.normalOpacity),
      normalLeftPx: clamp(src.normalLeftPx, -260, -20, UI_CFG.DEFAULTS.normalLeftPx),
      normalScale: clamp(src.normalScale, 0.55, 1.35, UI_CFG.DEFAULTS.normalScale),
      normalRightFadeStartPct: clamp(src.normalRightFadeStartPct, 20, 100, legacyFadeStartPct),
      normalRightFadeEndOpacity: clamp(src.normalRightFadeEndOpacity, 0.0, 1.0, legacyFadeEndOpacity),
      collapsedOpacity: clamp(src.collapsedOpacity, 0.02, 0.35, UI_CFG.DEFAULTS.collapsedOpacity),
      collapsedLeftPx: clamp(src.collapsedLeftPx, -260, -20, UI_CFG.DEFAULTS.collapsedLeftPx),
      collapsedScale: clamp(src.collapsedScale, 0.20, 1.10, UI_CFG.DEFAULTS.collapsedScale),
      collapsedRightFadeStartPct: clamp(src.collapsedRightFadeStartPct, 20, 100, legacyFadeStartPct),
      collapsedRightFadeEndOpacity: clamp(src.collapsedRightFadeEndOpacity, 0.0, 1.0, legacyFadeEndOpacity),
    };
  }

  function UI_applyCfgVars() {
    const cfg = UI_readCfg();
    const root = D.documentElement?.style;
    if (!root) return cfg;

    const collapsedRowMinPx = Math.round(Math.max(46, 24 + (150 * cfg.collapsedScale * 0.72)));
    const columnWidthPx = 136;

    root.setProperty('--cgxui-ansn-normal-opacity', String(cfg.normalOpacity));
    root.setProperty('--cgxui-ansn-normal-left', `${Math.round(cfg.normalLeftPx)}px`);
    root.setProperty('--cgxui-ansn-normal-scale', String(cfg.normalScale));
    root.setProperty('--cgxui-ansn-normal-fade-start', `${Number(cfg.normalRightFadeStartPct).toFixed(2)}%`);
    root.setProperty('--cgxui-ansn-normal-fade-end-alpha', Number(cfg.normalRightFadeEndOpacity).toFixed(3));

    root.setProperty('--cgxui-ansn-collapsed-opacity', String(cfg.collapsedOpacity));
    root.setProperty('--cgxui-ansn-collapsed-left', `${Math.round(cfg.collapsedLeftPx)}px`);
    root.setProperty('--cgxui-ansn-collapsed-scale', String(cfg.collapsedScale));
    root.setProperty('--cgxui-ansn-collapsed-fade-start', `${Number(cfg.collapsedRightFadeStartPct).toFixed(2)}%`);
    root.setProperty('--cgxui-ansn-collapsed-fade-end-alpha', Number(cfg.collapsedRightFadeEndOpacity).toFixed(3));

    root.setProperty('--cgxui-ansn-column-width', `${columnWidthPx}px`);
    root.setProperty('--cgxui-ansn-collapsed-row-min-h', `${collapsedRowMinPx}px`);
    return cfg;
  }

  function CSS_ensure() {
    if (D.getElementById(CSS.STYLE_ID)) return;

    const style = D.createElement('style');
    style.id = CSS.STYLE_ID;
    style.textContent = `
:root{
  ${CSS.VAR_FADE_TOP}: 28px;
  ${CSS.VAR_FADE_BOT}: 52px;
  --cgxui-ansn-normal-opacity: 0.12;
  --cgxui-ansn-normal-left: -140px;
  --cgxui-ansn-normal-scale: 1;
  --cgxui-ansn-normal-fade-start: 56%;
  --cgxui-ansn-normal-fade-end-alpha: 0.12;
  --cgxui-ansn-collapsed-opacity: 0.09;
  --cgxui-ansn-collapsed-left: -132px;
  --cgxui-ansn-collapsed-scale: 0.42;
  --cgxui-ansn-collapsed-fade-start: 70%;
  --cgxui-ansn-collapsed-fade-end-alpha: 0.18;
  --cgxui-ansn-column-width: 136px;
  --cgxui-ansn-collapsed-row-min-h: 70px;
}

.${CLS.UNCLIP}{
  overflow: visible !important;
  overflow-clip-margin: 999px !important;
}

${SEL.TURN}{ overflow: visible !important; }
.${CLS.TURN_OVF}{ overflow: visible !important; }

.${CLS.WRAP}{
  position: relative;
  overflow: visible !important;
  isolation: isolate;
  z-index: 0;
}

.${CLS.WRAP} .markdown{
  position: relative;
  z-index: 2;
}

.${CLS.BIG}{
  --cgxui-ansn-current-opacity: var(--cgxui-ansn-normal-opacity);
  --cgxui-ansn-current-left: var(--cgxui-ansn-normal-left);
  --cgxui-ansn-current-scale: var(--cgxui-ansn-normal-scale);
  --cgxui-ansn-current-fade-start: var(--cgxui-ansn-normal-fade-start);
  --cgxui-ansn-current-fade-end-alpha: var(--cgxui-ansn-normal-fade-end-alpha);

  position: absolute;
  left: var(--cgxui-ansn-current-left);
  top: 50%;
  width: var(--cgxui-ansn-column-width);
  transform: translateY(-50%) scale(var(--cgxui-ansn-current-scale));
  transform-origin: right center;
  transition: transform 180ms ease, left 180ms ease, opacity 180ms ease;

  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;

  font-weight: 700;
  font-family: Georgia, serif;
  font-feature-settings: 'onum' 1;
  color: rgba(128, 128, 128, var(--cgxui-ansn-current-opacity));

  pointer-events: none;
  z-index: 1;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  mix-blend-mode: multiply;
  text-align: right;
  overflow: visible;

  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    rgba(0,0,0,0.35) calc(${CSS.VAR_FADE_TOP} * 0.35),
    black ${CSS.VAR_FADE_TOP},
    black calc(100% - ${CSS.VAR_FADE_BOT}),
    rgba(0,0,0,0.35) calc(100% - (${CSS.VAR_FADE_BOT} * 0.35)),
    transparent 100%
  );

  mask-image: linear-gradient(
    to right,
    black 0%,
    black var(--cgxui-ansn-current-fade-start, 56%),
    rgba(0,0,0,var(--cgxui-ansn-current-fade-end-alpha, 0.12)) 100%
  );
}

.${CLS.BIG}.${CLS.VFADE}{
  -webkit-mask-image:
    linear-gradient(
      to right,
      black 0%,
      black var(--cgxui-ansn-current-fade-start, 56%),
      rgba(0,0,0,var(--cgxui-ansn-current-fade-end-alpha, 0.12)) 100%
    ),
    linear-gradient(
      to bottom,
      transparent 0%,
      rgba(0,0,0,0.35) 2%,
      black var(${CSS.VAR_FADE_TOP}),
      black calc(100% - var(${CSS.VAR_FADE_BOT})),
      rgba(0,0,0,0.35) 98%,
      transparent 100%
    );
  -webkit-mask-composite: source-in;
}

.${CLS.BIG} .${CLS.MAIN}{
  display: block;
  width: 100%;
  text-align: right;
  font-weight: 700;
  font-family: Georgia, serif;
  font-feature-settings: 'onum' 1;
  color: rgba(128, 128, 128, var(--cgxui-ansn-current-opacity));
  mix-blend-mode: multiply;

  -webkit-mask-image: linear-gradient(
    to right,
    black 0%,
    black var(--cgxui-ansn-current-fade-start, 56%),
    rgba(0,0,0,var(--cgxui-ansn-current-fade-end-alpha, 0.12)) 100%
  );
  mask-image: linear-gradient(
    to right,
    black 0%,
    black var(--cgxui-ansn-current-fade-start, 56%),
    rgba(0,0,0,var(--cgxui-ansn-current-fade-end-alpha, 0.12)) 100%
  );
}

.${CLS.BIG} .${CLS.REGEN}{
  display: block;
  width: 100%;
  text-align: right;
  margin: 10px 0 0 0;

  font-family: Georgia, serif;
  font-weight: 700;
  font-feature-settings: 'onum' 1;
  letter-spacing: 0;
  font-size: 34px;
  line-height: 1;

  color: rgba(128, 128, 128, var(--cgxui-ansn-current-opacity));
  mix-blend-mode: multiply;

  pointer-events: none;
  white-space: nowrap;
  text-shadow: none;
}

${SEL.ANSWER}[data-at-collapsed="1"].${CLS.WRAP}{
  min-height: var(--cgxui-ansn-collapsed-row-min-h);
}

${SEL.ANSWER}[data-at-collapsed="1"].${CLS.WRAP} > .${CLS.BIG}{
  --cgxui-ansn-current-opacity: var(--cgxui-ansn-collapsed-opacity);
  --cgxui-ansn-current-left: var(--cgxui-ansn-collapsed-left);
  --cgxui-ansn-current-scale: var(--cgxui-ansn-collapsed-scale);
  --cgxui-ansn-current-fade-start: var(--cgxui-ansn-collapsed-fade-start);
  --cgxui-ansn-current-fade-end-alpha: var(--cgxui-ansn-collapsed-fade-end-alpha);
}

${SEL.ANSWER}[data-at-collapsed="1"].${CLS.WRAP} > .${CLS.BIG} .${CLS.REGEN}{
  display: none;
}

.${CLS.DIGIT_1} { font-size: 150px; }
.${CLS.DIGIT_2} { font-size: 125px; }
.${CLS.DIGIT_3} { font-size: 100px; }
.${CLS.DIGIT_4} { font-size: 70px;  }
    `.trim();

    D.head.appendChild(style);
  }

  function UTIL_findConversationRoot() {
    const turnsRoot = q(SEL.TURNS);
    if (turnsRoot) return turnsRoot;

    const firstTurn = q(SEL.TURN);
    if (firstTurn?.parentElement) return firstTurn.parentElement;

    return q('main') || D.body;
  }

  function UTIL_digitClass(n) {
    const len = String(n).length;
    if (len === 1) return CLS.DIGIT_1;
    if (len === 2) return CLS.DIGIT_2;
    if (len === 3) return CLS.DIGIT_3;
    return CLS.DIGIT_4;
  }

  function UTIL_buildInnerHTML(num, regenStr) {
    return `
      <span class="${CLS.MAIN}">${num}</span>
      ${regenStr ? `<span class="${CLS.REGEN}">${regenStr}</span>` : ''}
    `.trim();
  }

  function UTIL_getRegenInfoForAnswer(el) {
    const turn =
      el.closest(SEL.TURN) ||
      el.closest('[class*="group/turn-messages"]') ||
      el.parentElement;

    if (!turn) return null;

    const els = turn.querySelectorAll('div.tabular-nums');
    for (let i = els.length - 1; i >= 0; i--) {
      const txt = (els[i].textContent || '').trim();
      const m = txt.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m) continue;

      const cur = +m[1];
      const total = +m[2];

      if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 0) return null;
      if (total === 1) return null;
      return { cur, total };
    }

    return null;
  }

  function UTIL_positiveInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function UTIL_getAnswerId(el) {
    return String(
      W.H2O?.msg?.getIdFromEl?.(el)
      || el?.getAttribute?.('data-message-id')
      || el?.dataset?.messageId
      || ''
    ).trim();
  }

  function UTIL_routeKey() {
    return String(W.location?.pathname || '/');
  }

  function UTIL_cacheKey(kind, id) {
    const value = String(id || '').trim();
    return value ? `${UTIL_routeKey()}|${kind}:${value}` : '';
  }

  function UTIL_completeTurnIndexProjectionEnabled() {
    const rt = W.H2O?.turnRuntime || null;
    if (!rt) return false;
    const completeApiPresent = [
      'getCompleteTurnIndexProjectionPreference',
      'setCompleteTurnIndexProjectionPreference',
      'refreshCompleteTurnIndexProjection',
      'rebuildCompleteTurnIndexProjection',
    ].some((name) => typeof rt?.[name] === 'function');
    if (typeof rt.getCompleteTurnIndexProjectionStatus !== 'function') return completeApiPresent;
    try {
      const status = rt.getCompleteTurnIndexProjectionStatus();
      if (status?.enabled === true) return true;
      if (status?.enabled === false) return false;
      return true;
    } catch {
      return true;
    }
  }

  function UTIL_readCanonicalTurnNumber(record) {
    const turnNo = Number(record?.turnNo || record?.idx || record?.index || 0);
    return Number.isFinite(turnNo) && turnNo > 0 ? Math.floor(turnNo) : 0;
  }

  function UTIL_getUserCandidates(host, answerEl = null) {
    if (!host) return [];
    const out = [];
    const seen = new Set();
    const add = (node) => {
      if (!node || seen.has(node) || node === answerEl || node.contains?.(answerEl)) return;
      seen.add(node);
      out.push(node);
    };
    if (host.matches?.(SEL.USER)) add(host);
    try { host.querySelectorAll?.(SEL.USER)?.forEach(add); } catch {}
    return out;
  }

  function UTIL_getUniqueCanonicalQuestionRecord(nodes, rt) {
    const owners = new Map();
    for (const questionEl of Array.from(nodes || [])) {
      const qId = String(
        W.H2O?.msg?.getIdFromEl?.(questionEl)
        || questionEl?.getAttribute?.('data-message-id')
        || questionEl?.dataset?.messageId
        || ''
      ).trim();
      if (!qId) continue;
      try {
        const record = rt?.getTurnRecordByQId?.(qId) || null;
        const recordQId = String(record?.qId || '').trim();
        if (!UTIL_readCanonicalTurnNumber(record) || (recordQId && recordQId !== qId)) continue;
        owners.set(qId, record);
      } catch {}
    }
    if (owners.size !== 1) return null;
    const [qId, record] = Array.from(owners.entries())[0];
    return { qId, record };
  }

  function UTIL_getCanonicalOwnerRecord(el, rt) {
    const answerTurn = el?.closest?.(SEL.TURN_ANY) || null;
    if (!answerTurn || !rt) return null;
    const sameTurnCandidates = UTIL_getUserCandidates(answerTurn, el);
    if (sameTurnCandidates.length) {
      return UTIL_getUniqueCanonicalQuestionRecord(sameTurnCandidates, rt);
    }
    const root = UTIL_findConversationRoot() || D;
    const turns = Array.from(root.querySelectorAll?.(SEL.TURN_ANY) || []);
    const index = turns.indexOf(answerTurn);
    if (index <= 0) return null;
    const previous = turns[index - 1] || null;
    const role = String(previous?.getAttribute?.('data-turn') || '').trim().toLowerCase();
    if ((role && role !== 'user') || previous?.querySelector?.(SEL.ANSWER)) return null;
    return UTIL_getUniqueCanonicalQuestionRecord(UTIL_getUserCandidates(previous), rt);
  }

  function UTIL_getRuntimeIdentity(el, answerId) {
    const rt = W.H2O?.turnRuntime || null;
    let record = null;
    let qId = '';
    let canonicalSource = 'unresolved';

    try {
      if (answerId && rt) {
        record = rt.getTurnRecordByAId?.(answerId)
          || rt.getTurnRecordByTurnId?.(answerId)
          || rt.getTurnRecordByTurnId?.(`turn:a:${answerId}`)
          || null;
        if (record) canonicalSource = 'answer-runtime';
      }
    } catch {}

    if (!record && rt) {
      const owner = UTIL_getCanonicalOwnerRecord(el, rt);
      if (owner?.record) {
        record = owner.record;
        qId = owner.qId;
        canonicalSource = 'question-runtime';
      }
    }

    const turnHost = el?.closest?.(SEL.TURN) || null;
    const turnId = String(
      record?.turnId
      || turnHost?.getAttribute?.('data-turn-id')
      || turnHost?.dataset?.turnId
      || turnHost?.getAttribute?.('data-testid')
      || ''
    ).trim();

    return {
      answerId,
      qId: qId || String(record?.qId || '').trim(),
      turnId,
      record,
      runtimeNumber: UTIL_readCanonicalTurnNumber(record),
      canonicalSource,
    };
  }

  function UTIL_getTitleTurnNum(el, answerId) {
    const local = el?.querySelector?.('[data-h2o-turn-num]') || null;
    const localNum = UTIL_positiveInt(local?.getAttribute?.('data-h2o-turn-num'));
    if (localNum) return localNum;

    if (!answerId) return 0;
    try {
      const escaped = W.CSS?.escape ? W.CSS.escape(answerId) : '';
      if (!escaped) return 0;
      const title = D.querySelector(`[data-answer-id="${escaped}"][data-h2o-turn-num]`);
      return UTIL_positiveInt(title?.getAttribute?.('data-h2o-turn-num'));
    } catch {
      return 0;
    }
  }

  function UTIL_getTimestampTurnNum(el) {
    const stamp = el?.querySelector?.(
      ':scope > .cgxui-ats-ts, :scope > .chatgpt-timestamp, :scope > [data-cgxui="ats-stamp"]'
    ) || null;
    const label = String(stamp?.dataset?.fullLabel || stamp?.textContent || '').trim();
    const match = label.match(/\|\s*(\d+)\s*$/);
    return UTIL_positiveInt(match?.[1]);
  }

  function UTIL_getCachedStableNumber(identity) {
    const aKey = UTIL_cacheKey('a', identity?.answerId);
    const tKey = UTIL_cacheKey('t', identity?.turnId);
    return UTIL_positiveInt(
      (aKey && STABLE_NUMBERS.byAnswerId.get(aKey))
      || (tKey && STABLE_NUMBERS.byTurnId.get(tKey))
      || 0
    );
  }

  function UTIL_rememberStableNumber(identity, number) {
    const stableNumber = UTIL_positiveInt(number);
    if (!stableNumber) return;
    const aKey = UTIL_cacheKey('a', identity?.answerId);
    const tKey = UTIL_cacheKey('t', identity?.turnId);
    if (aKey) STABLE_NUMBERS.byAnswerId.set(aKey, stableNumber);
    if (tKey) STABLE_NUMBERS.byTurnId.set(tKey, stableNumber);
  }

  function UTIL_forgetStableNumber(identity) {
    const aKey = UTIL_cacheKey('a', identity?.answerId);
    const tKey = UTIL_cacheKey('t', identity?.turnId);
    if (aKey) STABLE_NUMBERS.byAnswerId.delete(aKey);
    if (tKey) STABLE_NUMBERS.byTurnId.delete(tKey);
  }

  function UTIL_getStampedStableNumber(el, identity) {
    const big = el?.querySelector?.(`:scope > .${CLS.BIG}`) || null;
    if (!big || big.getAttribute(ATTR.BIG_NUM_STABLE) !== '1') return 0;
    const stampedAnswerId = String(big.getAttribute(ATTR.BIG_ANSWER_ID) || '').trim();
    const stampedTurnId = String(big.getAttribute(ATTR.BIG_TURN_ID) || '').trim();
    const sameIdentity = (identity.answerId && stampedAnswerId === identity.answerId)
      || (identity.turnId && stampedTurnId === identity.turnId);
    return sameIdentity ? UTIL_positiveInt(big.getAttribute(ATTR.BIG_NUM)) : 0;
  }

  function resolveStableBigAnswerNumber(answerHostOrMessage) {
    const el = answerHostOrMessage;
    const answerId = UTIL_getAnswerId(el);
    const identity = UTIL_getRuntimeIdentity(el, answerId);
    const timestampNumber = UTIL_getTimestampTurnNum(el);
    const titleNumber = UTIL_getTitleTurnNum(el, answerId);
    const stampedNumber = UTIL_getStampedStableNumber(el, identity);
    const cachedNumber = UTIL_getCachedStableNumber(identity);

    let number = 0;
    let source = 'unresolved';

    if (UTIL_completeTurnIndexProjectionEnabled()) {
      const canonical = UTIL_positiveInt(identity.runtimeNumber);
      if (!canonical) return { number: null, source, stable: false, ...identity };
      number = canonical;
      if (timestampNumber === canonical) source = 'timestamp-metadata';
      else if (titleNumber === canonical) source = 'title-metadata';
      else source = identity.canonicalSource || 'turn-runtime';
      UTIL_rememberStableNumber(identity, number);
      return { number, source, stable: true, ...identity };
    }

    // Timestamp and title metadata are the existing stable display contract.
    if (timestampNumber) {
      number = timestampNumber;
      source = 'timestamp-metadata';
    } else if (titleNumber) {
      number = titleNumber;
      source = 'title-metadata';
    } else if (stampedNumber) {
      number = stampedNumber;
      source = 'last-rendered-stable';
    } else if (cachedNumber) {
      number = cachedNumber;
      source = 'stable-cache';
    } else if (identity.runtimeNumber > 1) {
      number = identity.runtimeNumber;
      source = 'turn-runtime';
    } else {
      // A transient visible-subset rebuild commonly reports 1. Runtime-only 1
      // is therefore not proof of answer 1; wait for metadata or prior state.
      return { number: null, source, stable: false, ...identity };
    }

    UTIL_rememberStableNumber(identity, number);
    return { number, source, stable: true, ...identity };
  }

  function CORE_suppressUnstableBigNumber(el, resolution) {
    if (UTIL_completeTurnIndexProjectionEnabled()) UTIL_forgetStableNumber(resolution);
    const big = el?.querySelector?.(`:scope > .${CLS.BIG}`) || null;
    if (big) {
      big.hidden = true;
      big.style.setProperty('display', 'none', 'important');
      big.setAttribute('aria-hidden', 'true');
      big.setAttribute(ATTR.BIG_NUM_STABLE, '0');
      big.setAttribute(ATTR.BIG_NUM_SOURCE, String(resolution?.source || 'unresolved'));
      big.setAttribute(ATTR.BIG_ANSWER_ID, String(resolution?.answerId || ''));
      big.setAttribute(ATTR.BIG_TURN_ID, String(resolution?.turnId || ''));
      big.removeAttribute(ATTR.BIG_NUM);
    }
    const legacyBig = el?.querySelector?.(':scope > .ho-big-number') || null;
    if (legacyBig && legacyBig !== big) legacyBig.style.setProperty('display', 'none', 'important');
    el.removeAttribute(ATTR.SIG_FAST);
    el.removeAttribute(ATTR.SIG_NUM);
  }

  function UTIL_unclipAncestorsOnce(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    if (el.getAttribute(ATTR.UNCLIP_DONE) === '1') return;
    el.setAttribute(ATTR.UNCLIP_DONE, '1');

    let p = el;
    let steps = 0;
    while (p && p !== D.body && steps < 10) {
      if (p instanceof HTMLElement) p.classList.add(CLS.UNCLIP);
      p = p.parentElement;
      steps++;
    }
  }

  function UTIL_ensureTurnOverflowOnce(el) {
    const turn = el.closest?.(SEL.TURN);
    if (!turn) return;
    if (turn.getAttribute(ATTR.TURN_OVF_DONE) === '1') return;
    turn.setAttribute(ATTR.TURN_OVF_DONE, '1');
    turn.classList.add(CLS.TURN_OVF);
  }

  function UTIL_contentSig(el) {
    const len = (el.textContent || '').length;
    const children = el.childElementCount || 0;
    return `${len}:${children}`;
  }

  const shortMeasureAt = new WeakMap();

  function UTIL_readShort(el, contentSig) {
    const prevContentSig = el.getAttribute(ATTR.CONTENT_SIG) || '';
    const prevShort = el.getAttribute(ATTR.SIG_SHORT) || '';
    const hasPrevShort = (prevShort === '1' || prevShort === '0');

    if (hasPrevShort && prevContentSig === contentSig) {
      return prevShort === '1';
    }

    const now = Date.now();
    const last = shortMeasureAt.get(el) || 0;

    if (hasPrevShort && (now - last) < CFG.SHORT_MEASURE_MIN_MS) {
      return prevShort === '1';
    }

    shortMeasureAt.set(el, now);
    return (el.scrollHeight || 0) < CFG.SHORT_SCROLLH_PX;
  }

  function CORE_readPatch(el) {
    if (!el || !(el instanceof HTMLElement)) return null;

    const resolution = resolveStableBigAnswerNumber(el);
    if (!resolution.stable || !resolution.number) {
      CORE_suppressUnstableBigNumber(el, resolution);
      return null;
    }

    const num = resolution.number;
    const regen = UTIL_getRegenInfoForAnswer(el);
    const regenStr = (regen && regen.total > 1) ? `(${regen.cur}/${regen.total})` : '';

    const contentSig = UTIL_contentSig(el);
    const isShort = UTIL_readShort(el, contentSig);

    const nextNum = String(num);
    const nextShort = isShort ? '1' : '0';
    const nextRegen = regenStr;
    const nextSig = `${nextNum}|${nextShort}|${nextRegen}`;

    const prevSig = el.getAttribute(ATTR.SIG_FAST) || '';
    const hasWrap = el.classList.contains(CLS.WRAP);
    const currentBig = el.querySelector(`:scope > .${CLS.BIG}`);
    const hasBig = !!currentBig;
    const projectionCurrent = !!currentBig
      && !currentBig.hidden
      && currentBig.getAttribute(ATTR.BIG_NUM_STABLE) === '1'
      && currentBig.getAttribute(ATTR.BIG_NUM) === nextNum
      && currentBig.getAttribute(ATTR.BIG_ANSWER_ID) === String(resolution.answerId || '')
      && currentBig.getAttribute(ATTR.BIG_TURN_ID) === String(resolution.turnId || '');

    if (hasWrap && hasBig && projectionCurrent && prevSig === nextSig) {
      PERF.skippedBySig++;
      return null;
    }

    return {
      el,
      num,
      regenStr,
      isShort,
      contentSig,
      nextNum,
      nextShort,
      nextRegen,
      nextSig,
      desiredHTML: UTIL_buildInnerHTML(num, regenStr),
      digitClass: UTIL_digitClass(num),
      resolution,
    };
  }

  function CORE_applyPatch(patch) {
    if (!patch?.el || !(patch.el instanceof HTMLElement)) return;
    const el = patch.el;

    UTIL_ensureTurnOverflowOnce(el);
    UTIL_unclipAncestorsOnce(el);

    if (!el.classList.contains(CLS.WRAP)) el.classList.add(CLS.WRAP);

    el.setAttribute(ATTR.SIG_NUM, patch.nextNum);
    el.setAttribute(ATTR.SIG_SHORT, patch.nextShort);
    el.setAttribute(ATTR.SIG_REGEN, patch.nextRegen);
    el.setAttribute(ATTR.SIG_FAST, patch.nextSig);
    el.setAttribute(ATTR.CONTENT_SIG, patch.contentSig);

    let big = el.querySelector(`:scope > .${CLS.BIG}`);
    if (!big) {
      big = D.createElement('div');
      big.className = `${CLS.BIG} ${patch.digitClass}`;
      big.setAttribute(ATTR.OWNER, SkID);
      big.setAttribute('data-cgxui', `${SkID}-abig`);
      el.insertBefore(big, el.firstChild);
    }

    big.className = `${CLS.BIG} ${patch.digitClass}`;
    big.hidden = false;
    big.style.removeProperty('display');
    big.setAttribute('aria-hidden', 'true');
    big.setAttribute(ATTR.BIG_NUM, patch.nextNum);
    big.setAttribute(ATTR.BIG_NUM_SOURCE, patch.resolution.source);
    big.setAttribute(ATTR.BIG_NUM_STABLE, '1');
    big.setAttribute(ATTR.BIG_TURN_ID, String(patch.resolution.turnId || ''));
    big.setAttribute(ATTR.BIG_ANSWER_ID, String(patch.resolution.answerId || ''));
    if (patch.isShort) big.classList.add(CLS.VFADE);
    else big.classList.remove(CLS.VFADE);

    if ((big._cgxuiLastHTML || '') !== patch.desiredHTML) {
      big.innerHTML = patch.desiredHTML;
      big._cgxuiLastHTML = patch.desiredHTML;
    }

    const legacyBig = el.querySelector(':scope > .ho-big-number');
    if (legacyBig && legacyBig !== big) legacyBig.remove();

    const legacySmall = el.querySelector(':scope > .ho-small-number-box');
    if (legacySmall) legacySmall.remove();

    PERF.processed++;
  }

  function CORE_fullScan() {
    const answers = Array.from(D.querySelectorAll(SEL.ANSWER));
    const patches = [];

    for (let i = 0; i < answers.length; i++) {
      const patch = CORE_readPatch(answers[i]);
      if (patch) patches.push(patch);
    }

    for (const patch of patches) CORE_applyPatch(patch);

    DIAG.lastFullScanCount = answers.length;
    PERF.fullScans++;
  }

  let rafPending = false;
  let rafHandle = 0;
  let needFull = false;
  let fullDebounceT = 0;
  const pending = new Set();

  function CORE_isCurrentAnswerTarget(el, root = UTIL_findConversationRoot()) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isConnected !== true || !el.matches?.(SEL.ANSWER)) return false;
    if (!root || root.isConnected === false) return false;
    return root === el || root.contains?.(el) === true;
  }

  function CORE_cancelPendingFlush() {
    if (!rafPending) return;
    try {
      if (rafHandle && typeof W.cancelAnimationFrame === 'function') {
        W.cancelAnimationFrame(rafHandle);
      }
    } catch {}
    rafPending = false;
    rafHandle = 0;
  }

  function CORE_clearPendingAnswers(cancelFlush = false) {
    pending.clear();
    if (cancelFlush && !needFull) CORE_cancelPendingFlush();
  }

  function CORE_flush() {
    const t0 = performance.now();

    if (needFull) {
      needFull = false;
      pending.clear();
      OBS_attachMO();
      CORE_fullScan();
      DIAG.lastIncCount = 0;
      DIAG.lastFlushMs = Math.round(performance.now() - t0);
      return;
    }

    const targets = [];
    let i = 0;
    for (const el of pending) {
      pending.delete(el);
      targets.push(el);
      i++;
      if (i >= CFG.INC_PER_FRAME) break;
    }

    const patches = [];
    for (let j = 0; j < targets.length; j++) {
      const target = targets[j];
      if (!CORE_isCurrentAnswerTarget(target)) continue;
      const patch = CORE_readPatch(target);
      if (patch) patches.push(patch);
    }

    let applied = 0;
    for (const patch of patches) {
      if (!CORE_isCurrentAnswerTarget(patch?.el)) continue;
      CORE_applyPatch(patch);
      applied++;
    }

    if (pending.size) CORE_scheduleFlush();

    DIAG.lastIncCount = applied;
    DIAG.lastFlushMs = Math.round(performance.now() - t0);
  }

  function CORE_scheduleFlush() {
    if (rafPending) return;
    rafPending = true;
    rafHandle = requestAnimationFrame(() => {
      rafPending = false;
      rafHandle = 0;
      try { CORE_flush(); } catch (e) { DIAG.lastErr = String(e); }
    });
  }

  function CORE_scheduleFullScan() {
    needFull = true;
    CORE_scheduleFlush();
  }

  function CORE_scheduleFullScanDebounced() {
    if (fullDebounceT) W.clearTimeout(fullDebounceT);
    fullDebounceT = W.setTimeout(() => {
      fullDebounceT = 0;
      CORE_scheduleFullScan();
    }, CFG.BUS_DEBOUNCE_MS);
  }

  function CORE_scheduleAnswer(el) {
    if (!CORE_isCurrentAnswerTarget(el)) return;
    pending.add(el);
    PERF.deltaUpdates++;
    CORE_scheduleFlush();
  }

  let MO = null;
  let MO_ROOT = null;

  function UTIL_collectAssistantNode(node, out) {
    if (!node || node.nodeType !== 1) return false;
    const el = /** @type {Element} */ (node);

    if (el.matches?.(SEL.ANSWER)) {
      out.add(el);
      return false;
    }

    if (el.matches?.(SEL.TURN)) {
      const hitInTurn = el.querySelector?.(SEL.ANSWER);
      if (hitInTurn) out.add(hitInTurn);
      return (el.childElementCount || 0) > CFG.MAX_DELTA_CHILDREN;
    }

    const cc = el.childElementCount || 0;
    if (cc === 0) return false;
    if (cc > CFG.MAX_DELTA_CHILDREN) return true;

    const hit = el.querySelector?.(SEL.ANSWER);
    if (hit) out.add(hit);
    return false;
  }

  function OBS_collectNumberMutationSignals(muts) {
    const hit = new Set();
    let needRepair = false;
    for (const m of Array.from(muts || [])) {
      const targetEl = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
      const metadataChanged = m.type === 'attributes'
        || (m.type === 'childList' && targetEl?.matches?.(SEL.NUMBER_META));
      if (metadataChanged) {
        const answer = targetEl?.closest?.(SEL.ANSWER) || null;
        if (CORE_isCurrentAnswerTarget(answer)) hit.add(answer);
      }
      if (!m.addedNodes?.length) continue;
      for (const n of m.addedNodes) {
        if (UTIL_collectAssistantNode(n, hit)) needRepair = true;
      }
    }
    return { hit, needRepair };
  }

  function OBS_attachMO() {
    const root = UTIL_findConversationRoot();
    if (!root) return;
    if (MO && MO_ROOT === root) return;

    if (MO_ROOT && MO_ROOT !== root) CORE_clearPendingAnswers(true);

    if (MO) {
      try { MO.disconnect(); } catch {}
      MO = null;
    }

    MO_ROOT = root;
    MO = new MutationObserver((muts) => {
      const { hit, needRepair } = OBS_collectNumberMutationSignals(muts);

      if (hit.size) {
        hit.forEach(CORE_scheduleAnswer);
      }
      if (needRepair) {
        CORE_scheduleFullScanDebounced();
      }
    });

    MO.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-h2o-turn-num', 'data-full-label'],
    });
  }

  function OBS_detachMO() {
    if (!MO) return;
    try { MO.disconnect(); } catch {}
    MO = null;
    MO_ROOT = null;
  }

  let coreHooked = false;
  const CLEAN = [];

  function CORE_hookCore() {
    if (coreHooked) return;
    if (!W.H2O?.bus) return;

    coreHooked = true;

    const onCoreRefresh = () => CORE_scheduleFullScanDebounced();

    try { W.H2O.bus.on(EV.BUS_IDX_UPDATED, onCoreRefresh); } catch {}
    try { W.H2O.bus.on(EV.BUS_TURN_UPDATED, onCoreRefresh); } catch {}

    W.addEventListener(EV.IDX_UPDATED_WIN, onCoreRefresh, { passive: true });
    W.addEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh, { passive: true });

    CLEAN.push(() => W.removeEventListener(EV.IDX_UPDATED_WIN, onCoreRefresh));
    CLEAN.push(() => W.removeEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh));
  }

  function onRouteOrPageEvent() {
    CORE_clearPendingAnswers(true);
    OBS_attachMO();
    CORE_scheduleFullScanDebounced();
  }

  let booted = false;

  function CORE_ANSNUM_boot() {
    if (booted) return;
    booted = true;
    DIAG.bootCount++;

    PERF_init();
    CSS_ensure();
    UI_applyCfgVars();
    OBS_attachMO();

    CORE_hookCore();
    const onReady = () => CORE_hookCore();
    W.addEventListener(EV.CORE_READY, onReady, { once: true });
    CLEAN.push(() => W.removeEventListener(EV.CORE_READY, onReady));

    W.addEventListener(EV.ROUTE_CHANGED, onRouteOrPageEvent, true);
    W.addEventListener('popstate', onRouteOrPageEvent, true);
    W.addEventListener('hashchange', onRouteOrPageEvent, true);

    CLEAN.push(() => W.removeEventListener(EV.ROUTE_CHANGED, onRouteOrPageEvent, true));
    CLEAN.push(() => W.removeEventListener('popstate', onRouteOrPageEvent, true));
    CLEAN.push(() => W.removeEventListener('hashchange', onRouteOrPageEvent, true));

    CORE_scheduleFullScan();
  }

  function CORE_ANSNUM_dispose() {
    if (!booted) return;
    booted = false;
    DIAG.disposeCount++;

    needFull = false;
    CORE_clearPendingAnswers(true);
    try { OBS_detachMO(); } catch {}
    try { if (fullDebounceT) W.clearTimeout(fullDebounceT); } catch {}
    fullDebounceT = 0;

    try {
      for (const fn of CLEAN.splice(0)) { try { fn(); } catch {} }
    } catch {}

    const style = D.getElementById(CSS.STYLE_ID);
    if (style) style.remove();

    if (PERF.ticker) {
      try { W.clearInterval(PERF.ticker); } catch {}
      PERF.ticker = 0;
    }
  }

  H2O[PID] = H2O[PID] || {};
  H2O[PID].api = H2O[PID].api || {};
  H2O[PID].api.boot = CORE_ANSNUM_boot;
  H2O[PID].api.dispose = CORE_ANSNUM_dispose;
  H2O[PID].api.rescan = CORE_scheduleFullScan;
  H2O[PID].api.getConfig = UI_readCfg;
  H2O[PID].api.applySetting = (key, value) => {
    const current = UI_readCfg();
    const next = UI_writeCfg({ ...current, [String(key || '')]: value });
    UI_applyCfgVars();
    CORE_scheduleFullScanDebounced();
    return next;
  };

  CORE_ANSNUM_boot();
})();
