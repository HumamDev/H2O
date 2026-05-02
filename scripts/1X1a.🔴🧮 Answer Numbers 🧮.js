// ==UserScript==
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
// ==/UserScript==

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
    TURN: '[data-testid="conversation-turn"]',
    TURNS: '[data-testid="conversation-turns"]',
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

  function UTIL_getCanonicalTurnNum(el) {
    const rt = W.H2O?.turnRuntime || null;
    if (!rt) return 0;

    const aId = String(
      W.H2O?.msg?.getIdFromEl?.(el)
      || el?.getAttribute?.('data-message-id')
      || el?.dataset?.messageId
      || ''
    ).trim();
    if (!aId) return 0;

    try {
      const record = rt.getTurnRecordByAId?.(aId) || null;
      const turnNo = Number(record?.turnNo || record?.idx || record?.index || 0);
      return (Number.isFinite(turnNo) && turnNo > 0) ? turnNo : 0;
    } catch {
      return 0;
    }
  }

  function UTIL_computeNum(el, domIndex1) {
    const canonicalTurnNum = UTIL_getCanonicalTurnNum(el);
    if (canonicalTurnNum > 0) return canonicalTurnNum;

    const tRaw = W.H2O?.turn?.getTurnIndexByAEl?.(el);

    let turnNum = 0;
    if (Number.isFinite(tRaw)) {
      turnNum = (tRaw === 0) ? 1 : (tRaw > 0 ? tRaw : 0);
    }

    const a0 = W.H2O?.index?.getAIndex?.(el);
    const aNum = (Number.isFinite(a0) && a0 > 0) ? a0 : domIndex1;

    return (turnNum || aNum);
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

  function CORE_readPatch(el, domIndex1) {
    if (!el || !(el instanceof HTMLElement)) return null;

    const num = UTIL_computeNum(el, domIndex1);
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
    const hasBig = !!el.querySelector(`:scope > .${CLS.BIG}`);

    if (hasWrap && hasBig && prevSig === nextSig) {
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
      const patch = CORE_readPatch(answers[i], i + 1);
      if (patch) patches.push(patch);
    }

    for (const patch of patches) CORE_applyPatch(patch);

    DIAG.lastFullScanCount = answers.length;
    PERF.fullScans++;
  }

  let rafPending = false;
  let needFull = false;
  let fullDebounceT = 0;
  const pending = new Set();

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
      const patch = CORE_readPatch(targets[j], j + 1);
      if (patch) patches.push(patch);
    }

    for (const patch of patches) CORE_applyPatch(patch);

    if (pending.size) CORE_scheduleFlush();

    DIAG.lastIncCount = patches.length;
    DIAG.lastFlushMs = Math.round(performance.now() - t0);
  }

  function CORE_scheduleFlush() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
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
    if (!el || !(el instanceof HTMLElement)) return;
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

  function OBS_attachMO() {
    const root = UTIL_findConversationRoot();
    if (!root) return;
    if (MO && MO_ROOT === root) return;

    if (MO) {
      try { MO.disconnect(); } catch {}
      MO = null;
    }

    MO_ROOT = root;
    MO = new MutationObserver((muts) => {
      const hit = new Set();
      let needRepair = false;

      for (const m of muts) {
        if (!m.addedNodes?.length) continue;
        for (const n of m.addedNodes) {
          if (UTIL_collectAssistantNode(n, hit)) needRepair = true;
        }
      }

      if (hit.size) {
        hit.forEach(CORE_scheduleAnswer);
      }
      if (needRepair) {
        CORE_scheduleFullScanDebounced();
      }
    });

    MO.observe(root, { childList: true, subtree: true });
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
