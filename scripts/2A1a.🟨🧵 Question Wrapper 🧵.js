// ==UserScript==
// @h2o-id             2a1a.question.wrapper
// @name               2A1a.🟨🧵 Question Wrapper 🧵
// @namespace          H2O.Premium.CGX.question.wrapper
// @author             HumamDev
// @version            5.4.1
// @revision           001
// @build              260304-102754
// @description        Collapse ONLY long user question text (keep images/files visible). Two right-side toggles (top+bottom). Owns ONE body observer + wrap scan; emits quote events for Quote Tracker.
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* =============================================================================
   * 🧱 H2O Module Standard — Contract (v2.0) — Stage 1: Foundation/Mechanics
   * - Identity-first, registries, cgxui-only hooks, boot/dispose, cleanup.
   * - PERFORMANCE: owns the ONLY document.body subtree MutationObserver.
   * - COUPLING: emits events for Quote Tracker (no quote intelligence here).
   * ============================================================================= */

  /* ───────────────────────────── 0) IDENTITY ───────────────────────────── */

  /** @core Identity + namespace anchors (Contract v2.0) */
  const TOK = 'QR';
  const PID = 'qstnwrppr';
  const CID = 'QWRAPPER';
  const SkID = 'qswr';

  const MODTAG = 'QWrapper';
  const MODICON = '🧵';
  const EMOJI_HDR = '🟧';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  // Aliases (readability only; NOT new identities)
  const DsID = PID;
  const BrID = PID;

  /* ───────────────────────────── 1) REGISTRIES ───────────────────────────── */

  /** @core Constants & registries */
  const SEL_QWRAP_ = Object.freeze({
    USER_MSG:      '[data-message-author-role="user"]',
    ASSIST_MSG:    '[data-message-author-role="assistant"]',
    ANY_MSG:       '[data-message-author-role="assistant"],[data-message-author-role="user"]',
    NOT_WRAPPED_USER: '[data-message-author-role="user"]:not([data-ho-qwrap-done="1"])',

    MARKDOWN_SCOPE: '.markdown, .prose, .whitespace-pre-wrap, [class*="markdown"], [class*="prose"], [class*="whitespace-pre-wrap"], [data-testid*="message-text"], [data-testid*="message"] .whitespace-pre-wrap',
    ATTACHMENT_HINT: '[class*="attachment"], [class*="file"], [data-testid*="attachment"]',
    BUBBLE_HINT: '[data-testid*="message"], [class*="message"]',

    // Quote UI (created here, resolved by QuoteTracker)
    QBOX:      '.cgxui-qswr-quoteBox',
    QTITLE:    '.cgxui-qswr-quoteTitle',

    // Composer (detection only here; QuoteTracker does capture)
    CHIP_AREA_HINT: 'form, #thread-bottom-container',
  });

  const ATTR_QWRAP_ = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UI:    'data-cgxui',
    STATE: 'data-cgxui-state',

    // legacy compat
    DONE:   'data-ho-qwrap-done',
    IGNORE: 'data-ho-ignore',
  });

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const VER_MAJOR = '1';

  const KEY_QWRAP_ = Object.freeze({
    QUOTE_MODE_NEW: `${NS_DISK}:cfg:quote_mode:v${VER_MAJOR}`,
    QUOTE_MODE_OLD: 'ho:qwrap:quoteMode',
    MIG_QUOTE_MODE: `${NS_DISK}:migrate:quote_mode:v1`,

    INIT_BOOT: `H2O:${TOK}:${PID}:booted`,
  });

  // Handoff topics (window events are guaranteed; H2O bus used when present)
  const EV_QWRAP_ = Object.freeze({
    WRAPPED:     'h2o:qwrap:wrapped',      // detail: { stableId, userMsgEl }
    QUOTE_PENDING:'h2o:quote:pending',     // detail: { stableId, quoteBoxEl }
    CHIP_CHANGED:'h2o:quote:chipChanged',  // detail: { reason }
  });

  const CSS_QWRAP_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
    LEGACY_STYLE_IDS: ['cgxui-qswr-style-v15', 'cgxui-qswr-style-v11'],
  });

  const CFG_QWRAP_ = Object.freeze({
    MAX_LINES: 15,
    PREVIEW_LINES: 10,
    AUTO_COLLAPSE_ON_SCROLL_AWAY: false,
    MIN_CHARS: 160,
    SCROLL_IDLE_MS: 140,
    IDLE_TIMEOUT_MS: 900,
    FALLBACK_SCAN_DELAY_MS: 160,
    BOOT_DELAY_MS: 0,

    // ⚡ fast render phase: scan immediately for a short window after load
    FAST_PHASE_MS: 1600,

    // 🎭 masking: prevent native flash by hiding unwrapped user messages briefly
    MASK_UNWRAPPED: true,
    MASK_MAX_MS: 2200, // fail-safe: never hide longer than this

    QUOTE_MODE_INSIDE: 'inside',
    QUOTE_MODE_OUTSIDE: 'outside',
  });

  const RETRY_QWRAP_DELAYS_ = Object.freeze([120, 300, 700, 1400]);


  /* ───────────────────────────── 2) VAULT + BOUNDED DIAG ───────────────────────────── */

  /** @core Module vault (H2O[TOK][PID]) + bounded DIAG (H2O[TOK][BrID].diag) */
  const W = window;

  W.H2O = W.H2O || {};
  W.H2O[TOK] = W.H2O[TOK] || {};
  W.H2O[TOK][PID] = W.H2O[TOK][PID] || {};

  const MOD = W.H2O[TOK][PID];
  MOD.diag  = MOD.diag  || {};
  MOD.state = MOD.state || {};
  MOD.api   = MOD.api   || {};

  W.H2O[TOK][BrID] = W.H2O[TOK][BrID] || {};
  W.H2O[TOK][BrID].diag = W.H2O[TOK][BrID].diag || MOD.diag;

  const DIAG = W.H2O[TOK][BrID].diag;

  /* ───────────────────────────── PERF MODULE (questionWrapper) ───────────────────────────── */

  W.H2O.perf = W.H2O.perf || {};
  W.H2O.perf.modules = W.H2O.perf.modules || Object.create(null);
  const _PERF_MOD = (W.H2O.perf.modules.questionWrapper && typeof W.H2O.perf.modules.questionWrapper === 'object')
    ? W.H2O.perf.modules.questionWrapper
    : (W.H2O.perf.modules.questionWrapper = Object.create(null));

  function _perfNow() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now() : Date.now();
  }

  function _createDurBucket() {
    return { count: 0, totalMs: 0, maxMs: 0, over4: 0, over8: 0, over16: 0, over50: 0, over100: 0 };
  }

  function _recordDur(b, ms) {
    if (!b || !Number.isFinite(ms) || ms < 0) return;
    b.count++;
    b.totalMs += ms;
    if (ms > b.maxMs) b.maxMs = ms;
    if (ms > 4)   b.over4++;
    if (ms > 8)   b.over8++;
    if (ms > 16)  b.over16++;
    if (ms > 50)  b.over50++;
    if (ms > 100) b.over100++;
  }

  function _readDurBucket(b) {
    if (!b) return { count: 0, totalMs: 0, avgMs: null, maxMs: 0, over4: 0, over8: 0, over16: 0, over50: 0, over100: 0 };
    const count = b.count || 0;
    return {
      count,
      totalMs:  Math.round((b.totalMs || 0) * 1000) / 1000,
      avgMs:    count > 0 ? Math.round(((b.totalMs || 0) / count) * 1000) / 1000 : null,
      maxMs:    Math.round((b.maxMs || 0) * 1000) / 1000,
      over4:    b.over4   || 0,
      over8:    b.over8   || 0,
      over16:   b.over16  || 0,
      over50:   b.over50  || 0,
      over100:  b.over100 || 0,
    };
  }

  function _resetDurBucket(b) {
    if (!b) return;
    b.count = 0; b.totalMs = 0; b.maxMs = 0;
    b.over4 = 0; b.over8 = 0; b.over16 = 0; b.over50 = 0; b.over100 = 0;
  }

  function _copyReasons(obj) {
    const out = Object.create(null);
    for (const k of Object.keys(obj || {})) out[k] = Number(obj[k]) || 0;
    return out;
  }

  const _PS = {
    bootCompletedAt: 0,
    idleSchedule: {
      scheduleCount:   0,
      coalescedCount:  0,
      fallbackCount:   0,
      beforeBootCount: 0,
      afterBootCount:  0,
      lastReason:      '',
      lastAt:          0,
      reasons:         Object.create(null),
    },
    idleExecution: Object.assign(_createDurBucket(), {
      timedOutCount:     0,
      fallbackExecCount: 0,
      beforeBootCount:   0,
      afterBootCount:    0,
      lastAt:            0,
    }),
    workPhases: {
      scan: Object.assign(_createDurBucket(), { beforeBootCount: 0, afterBootCount: 0 }),
      wrap: Object.assign(_createDurBucket(), { beforeBootCount: 0, afterBootCount: 0 }),
    },
    nodeWork: {
      scanned:        0,
      wrapAttempts:   0,
      confirmedWraps: 0,
      noOp:           0,
      lastNodeCount:  0,
      lastAt:         0,
    },
    retry: {
      rescheduleCount: 0,
      abortedCount:    0,
      cancelledCount:  0,
    },
    fallback: {
      scheduleCount: 0,
      execCount:     0,
      exec:          _createDurBucket(),
    },
  };

  function _psGetStats() {
    return {
      bootCompletedAt: _PS.bootCompletedAt,
      idleSchedule: {
        scheduleCount:   _PS.idleSchedule.scheduleCount,
        coalescedCount:  _PS.idleSchedule.coalescedCount,
        fallbackCount:   _PS.idleSchedule.fallbackCount,
        beforeBootCount: _PS.idleSchedule.beforeBootCount,
        afterBootCount:  _PS.idleSchedule.afterBootCount,
        lastReason:      _PS.idleSchedule.lastReason,
        lastAt:          _PS.idleSchedule.lastAt,
        reasons:         _copyReasons(_PS.idleSchedule.reasons),
      },
      idleExecution: Object.assign(_readDurBucket(_PS.idleExecution), {
        timedOutCount:     _PS.idleExecution.timedOutCount,
        fallbackExecCount: _PS.idleExecution.fallbackExecCount,
        beforeBootCount:   _PS.idleExecution.beforeBootCount,
        afterBootCount:    _PS.idleExecution.afterBootCount,
        lastAt:            _PS.idleExecution.lastAt,
      }),
      workPhases: {
        scan: Object.assign(_readDurBucket(_PS.workPhases.scan), {
          beforeBootCount: _PS.workPhases.scan.beforeBootCount || 0,
          afterBootCount:  _PS.workPhases.scan.afterBootCount  || 0,
        }),
        wrap: Object.assign(_readDurBucket(_PS.workPhases.wrap), {
          beforeBootCount: _PS.workPhases.wrap.beforeBootCount || 0,
          afterBootCount:  _PS.workPhases.wrap.afterBootCount  || 0,
        }),
      },
      nodeWork: {
        scanned:        _PS.nodeWork.scanned,
        wrapAttempts:   _PS.nodeWork.wrapAttempts,
        confirmedWraps: _PS.nodeWork.confirmedWraps,
        noOp:           _PS.nodeWork.noOp,
        lastNodeCount:  _PS.nodeWork.lastNodeCount,
        lastAt:         _PS.nodeWork.lastAt,
      },
      retry: {
        rescheduleCount: _PS.retry.rescheduleCount,
        abortedCount:    _PS.retry.abortedCount,
        cancelledCount:  _PS.retry.cancelledCount,
      },
      fallback: {
        scheduleCount: _PS.fallback.scheduleCount,
        execCount:     _PS.fallback.execCount,
        exec:          _readDurBucket(_PS.fallback.exec),
      },
    };
  }

  function _psResetStats() {
    // bootCompletedAt is preserved across resets intentionally
    _PS.idleSchedule.scheduleCount   = 0;
    _PS.idleSchedule.coalescedCount  = 0;
    _PS.idleSchedule.fallbackCount   = 0;
    _PS.idleSchedule.beforeBootCount = 0;
    _PS.idleSchedule.afterBootCount  = 0;
    _PS.idleSchedule.lastReason      = '';
    _PS.idleSchedule.lastAt          = 0;
    _PS.idleSchedule.reasons         = Object.create(null);
    _resetDurBucket(_PS.idleExecution);
    _PS.idleExecution.timedOutCount     = 0;
    _PS.idleExecution.fallbackExecCount = 0;
    _PS.idleExecution.beforeBootCount   = 0;
    _PS.idleExecution.afterBootCount    = 0;
    _PS.idleExecution.lastAt            = 0;
    _resetDurBucket(_PS.workPhases.scan);
    _PS.workPhases.scan.beforeBootCount = 0;
    _PS.workPhases.scan.afterBootCount  = 0;
    _resetDurBucket(_PS.workPhases.wrap);
    _PS.workPhases.wrap.beforeBootCount = 0;
    _PS.workPhases.wrap.afterBootCount  = 0;
    _PS.nodeWork.scanned        = 0;
    _PS.nodeWork.wrapAttempts   = 0;
    _PS.nodeWork.confirmedWraps = 0;
    _PS.nodeWork.noOp           = 0;
    _PS.nodeWork.lastNodeCount  = 0;
    _PS.nodeWork.lastAt         = 0;
    _PS.retry.rescheduleCount  = 0;
    _PS.retry.abortedCount     = 0;
    _PS.retry.cancelledCount   = 0;
    _PS.fallback.scheduleCount = 0;
    _PS.fallback.execCount     = 0;
    _resetDurBucket(_PS.fallback.exec);
  }

  _PERF_MOD.getStats   = _psGetStats;
  _PERF_MOD.resetStats = _psResetStats;

  function _psIsAfterBoot() { return _PS.bootCompletedAt > 0; }

  /* ───────────────────────────── 3) BUS (emit-only here) ───────────────────────────── */

  /** @helper */
  function BUS_emit(topic, detail) {
    try { W.H2O?.events?.emit?.(topic, detail); } catch {}
    try { W.dispatchEvent(new CustomEvent(topic, { detail })); } catch {}
  }

  /* ───────────────────────────── 4) STORAGE (read-only fallback for quoteMode) ───────────────────────────── */

  /** @helper One-time legacy quoteMode migration (ho:* -> h2o:*). */
  function MIG_QWRAP_quoteMode_once() {
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
    const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

    try { if (lsGet(KEY_QWRAP_.MIG_QUOTE_MODE) === '1') return; } catch {}

    try {
      const vNew = lsGet(KEY_QWRAP_.QUOTE_MODE_NEW);
      if (vNew == null || vNew === '') {
        const vOld = lsGet(KEY_QWRAP_.QUOTE_MODE_OLD);
        if (vOld != null && vOld !== '') lsSet(KEY_QWRAP_.QUOTE_MODE_NEW, vOld);
      }
    } catch {}

    try { lsDel(KEY_QWRAP_.QUOTE_MODE_OLD); } catch {}
    try { lsSet(KEY_QWRAP_.MIG_QUOTE_MODE, '1'); } catch {}
  }

  /** @helper */
  const STORE_QWRAP_ = (() => {
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const read = (newKey, oldKey, fallbackVal) => {
      const vNew = lsGet(newKey);
      if (vNew != null && vNew !== '') return vNew;
      const vOld = lsGet(oldKey);
      if (vOld != null && vOld !== '') return vOld;
      return fallbackVal;
    };
    return Object.freeze({ read });
  })();

    /** @helper */
  function UTIL_getQuoteMode() {
    try { MIG_QWRAP_quoteMode_once(); } catch {}
    // QuoteTracker is the authority when present.
    const f = W.H2O_QWRAP?.getQuoteMode;
    if (typeof f === 'function') {
      const m = f();
      return (m === CFG_QWRAP_.QUOTE_MODE_OUTSIDE) ? CFG_QWRAP_.QUOTE_MODE_OUTSIDE : CFG_QWRAP_.QUOTE_MODE_INSIDE;
    }

    // Split-safety: without QuoteTracker, do NOT let legacy keys force OUTSIDE.
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const vNew = lsGet(KEY_QWRAP_.QUOTE_MODE_NEW);
    if (vNew != null && vNew !== '') {
      return (vNew === CFG_QWRAP_.QUOTE_MODE_OUTSIDE) ? CFG_QWRAP_.QUOTE_MODE_OUTSIDE : CFG_QWRAP_.QUOTE_MODE_INSIDE;
    }

    // Default (pre-split behavior): inside.
    return CFG_QWRAP_.QUOTE_MODE_INSIDE;
  }

  /* ───────────────────────────── 5) SMALL HELPERS ───────────────────────────── */

  /** @helper */
  function UTIL_hash(s) {
    s = String(s || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  /** @helper */
  function UTIL_stripMdMarkers(s) {
    s = String(s || '');
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/\*([^*\n]+)\*/g, '$1');
    s = s.replace(/_([^_\n]+)_/g, '$1');
    s = s.replace(/```/g, '');
    s = s.replace(/`/g, '');
    s = s.replace(/^\s*[=]{6,}\s*$/gm, '');
    s = s.replace(/^\s*[-]{6,}\s*$/gm, '');
    s = s.replace(/^\s*↪\s*/gm, '');
    return s;
  }

  /** @helper */
  function UTIL_norm(s) {
    s = UTIL_stripMdMarkers(s);
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/^"+|"+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** @helper */
  function UTIL_qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  /* ───────────────────────────── Mask HELPERS ───────────────────────────── */
  /** @helper */
function UI_maskEnable(){
  if (!CFG_QWRAP_.MASK_UNWRAPPED) return;
  try { document.documentElement.setAttribute('data-cgxui-qswr-pre', '1'); } catch {}
}

/** @helper */
function UI_maskDisable(){
  if (!CFG_QWRAP_.MASK_UNWRAPPED) return;
  try { document.documentElement.removeAttribute('data-cgxui-qswr-pre'); } catch {}
}

/** @critical */
function UI_removePrestyleOnce() {
  if (!document.documentElement.getAttribute(CSS_QWRAP_PRE_.PRE_ATTR)) return;

  try { document.documentElement.removeAttribute(CSS_QWRAP_PRE_.PRE_ATTR); } catch {}
  try { MOD.state.preStyleEl?.remove?.(); } catch {}
  MOD.state.preStyleEl = null;
}

  /** @helper */
function UI_finishPrestyleOnce() {
  try { document.documentElement.removeAttribute(CSS_QWRAP_PRE_.PRE_ATTR); } catch {}
  const el = document.getElementById(CSS_QWRAP_PRE_.PRE_ID);
  if (el) { try { el.remove(); } catch {} }
}

  /* ───────────────────────────── 6) DOM HELPERS (wrap-only) ───────────────────────────── */

  /** @helper */
  function DOM_isUserMsg(el) { return el?.getAttribute?.('data-message-author-role') === 'user'; }

  /** @helper */
  function DOM_getUserMessageRoot(msgEl) {
    return (
      msgEl.querySelector(SEL_QWRAP_.MARKDOWN_SCOPE) ||
      msgEl
    );
  }

  /** @helper */
  function DOM_findBubbleHost(el) {
    let cur = el;
    for (let i = 0; i < 24 && cur; i++) {
      const cs = getComputedStyle(cur);
      const br = parseFloat(cs.borderTopLeftRadius) || 0;

      const bg = cs.backgroundColor || '';
      const bgImg = cs.backgroundImage || '';
      const bgOk =
        (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') ||
        (bgImg && bgImg !== 'none');

      if (br >= 10 && bgOk) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  /** @helper */
  function DOM_findTextBlock(msgEl, allowShort = false) {
    const root = DOM_getUserMessageRoot(msgEl);

    // Prefer the actual rendered text container ChatGPT commonly uses for user messages.
    const preferredSel = [
      '.whitespace-pre-wrap',
      '[class*="whitespace-pre-wrap"]',
      '[data-testid*="message-text"]',
      '[data-testid*="message"] .whitespace-pre-wrap',
      '.markdown',
      '.prose',
      '[class*="markdown"]',
      '[class*="prose"]',
    ].join(',');

    let textEl =
      (root?.matches?.(preferredSel) ? root : null) ||
      root?.querySelector?.(preferredSel) ||
      null;

    const minChars = allowShort ? 1 : CFG_QWRAP_.MIN_CHARS;

    // Heuristic fallback: scan for the first reasonable text block inside the message.
    if (!textEl) {
      const candidates = UTIL_qsa('p, div, article, section', root).slice(0, 80);
      textEl = candidates.find((el) => {
        if (!el || !el.isConnected) return false;
        if (el.closest?.('.cgxui-qswr')) return false; // avoid re-wrapping our own UI

        const t = (el.innerText || '').trim();
        if (t.length < minChars) return false;

        const hasMedia =
          el.querySelector?.('img, video, audio, canvas, input[type="file"]') ||
          el.querySelector?.('a[href*="file"], a[download]');

        const looksLikeAttachment = el.querySelector?.(SEL_QWRAP_.ATTACHMENT_HINT);

        // Avoid picking broad containers that include the action-row / buttons
        const hasButtons = !!el.querySelector?.('button,[role="button"]');

        return !hasMedia && !looksLikeAttachment && !hasButtons;
      });
    }

    // If the selected block contains attachments/media, do not wrap (we only collapse plain text).
    if (textEl?.querySelector?.('img, video, audio, canvas, input[type="file"]')) return null;
    return textEl || null;
  }

  /** @helper */
  function DOM_measureLines(el) {
    if (!el || !el.isConnected) return 0;

    const cs = getComputedStyle(el);
    let lh = parseFloat(cs.lineHeight);

    // fallback when line-height is "normal" (parseFloat -> NaN)
    if (!lh || !isFinite(lh)) {
      const fs = parseFloat(cs.fontSize) || 14;
      lh = fs * 1.35;
    }

    // Use the larger of client rect height and scroll height.
    let h = el.getBoundingClientRect().height || 0;
    const sh = el.scrollHeight || 0;
    h = Math.max(h, sh);

    // If we still can't measure (freshly inserted / display quirks), do an offscreen clone.
    if ((!h || h < lh * 2) && lh && isFinite(lh)) {
      try {
        const w = Math.max(120, el.getBoundingClientRect().width || 0);
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:-99999px;top:-99999px;visibility:hidden;pointer-events:none;contain:layout style paint;';
        probe.style.width = w + 'px';

        const clone = el.cloneNode(true);
        clone.style.webkitLineClamp = 'unset';
        clone.style.maxHeight = 'none';
        clone.style.overflow = 'visible';

        probe.appendChild(clone);
        document.body.appendChild(probe);

        const ch = clone.scrollHeight || clone.getBoundingClientRect().height || 0;
        if (ch) h = Math.max(h, ch);

        probe.remove();
      } catch {}
    }

    if (!lh || !isFinite(lh) || h <= 0) return 0;
    return Math.max(1, Math.ceil(h / lh));
  }

/** @helper */
  function UI_buildToggle(label, icon) {
    const btn = document.createElement('div');
    btn.className = 'cgxui-qswr-toggle';
    btn.setAttribute(ATTR_QWRAP_.IGNORE, '1');
    btn.setAttribute(ATTR_QWRAP_.OWNER, SkID);
    btn.setAttribute(ATTR_QWRAP_.UI, `${SkID}-toggle`);

    const ic = document.createElement('span');
    ic.className = 'cgxui-qswr-ic';
    ic.textContent = icon;

    const tx = document.createElement('span');
    tx.className = 'cgxui-qswr-tx';
    tx.textContent = label;

    btn.appendChild(ic);
    btn.appendChild(tx);
    return btn;
  }

  /* ───────────────────────────── 7) STABLE QWRAP ID (exported) ───────────────────────────── */

  /** @critical */
  function DOM_getStableQwrapId(msgEl, textEl) {
    if (!msgEl) return 'q_' + Math.random().toString(36).slice(2);

    if (msgEl.dataset.h2oQwrapStableKey) {
      return 'q_' + UTIL_hash(msgEl.dataset.h2oQwrapStableKey);
    }

    const attrCandidates = [
      'data-message-id',
      'data-msg-id',
      'data-id',
      'data-uuid',
      'data-turn-id',
      'data-testid'
    ];

    let key = '';
    for (const a of attrCandidates) {
      const v = msgEl.getAttribute?.(a);
      if (v && String(v).length >= 6) { key = `${a}:${v}`; break; }
    }

    if (!key) {
      const id = msgEl.id || msgEl.getAttribute?.('id') || '';
      if (id && id.length >= 6) key = `id:${id}`;
    }

    if (!key) {
      const users = [...document.querySelectorAll(SEL_QWRAP_.USER_MSG)];
      const idx = users.indexOf(msgEl);
      if (idx >= 0) key = `userIndex:${idx + 1}`;
    }

    if (!key) {
      const t = textEl ? UTIL_norm(textEl.innerText || '') : '';
      key = `textHash:${UTIL_hash(t.slice(0, 240))}`;
    }

    msgEl.dataset.h2oQwrapStableKey = key;
    return 'q_' + UTIL_hash(key);
  }

  // external compatibility (kept)
  W.H2O_getStableQwrapId = DOM_getStableQwrapId;

  /* ───────────────────────────── 8) TURN HELPERS (for initial quote title) ───────────────────────────── */

  /** @helper */
  function DOM_turnTotal() {
    return (
      (typeof W.H2O?.turn?.total === 'function' ? W.H2O.turn.total() : 0) ||
      document.querySelectorAll(SEL_QWRAP_.USER_MSG).length ||
      0
    );
  }

  /** @helper */
  function DOM_turnIdxFromAEl(aEl) {
    if (!aEl) return 0;
    const byEl = W.H2O?.turn?.getTurnIndexByAEl?.(aEl) || 0;
    if (byEl) return byEl;
    const aId = (typeof W.H2O_getAId === 'function') ? W.H2O_getAId(aEl) : null;
    return (aId && typeof W.H2O?.turn?.getTurnIndexByAId === 'function') ? (W.H2O.turn.getTurnIndexByAId(aId) || 0) : 0;
  }

  /** @helper */
  function DOM_getPrevAssistantForUserMsg(userMsgEl) {
    const all = [...document.querySelectorAll(SEL_QWRAP_.ANY_MSG)];
    const i = all.indexOf(userMsgEl);
    if (i < 0) return null;
    for (let k = i - 1; k >= 0; k--) {
      if (all[k].getAttribute('data-message-author-role') === 'assistant') return all[k];
    }
    return null;
  }

  /* ───────────────────────────── 9) QUOTE NODE EXTRACT (kept here; QuoteTracker resolves) ───────────────────────────── */

  /** @critical */
function DOM_extractChatGPTQuoteNode(msgEl) {
  // Robustly detect the native "replied content" preview chip inside a USER message.
  // ChatGPT keeps changing this DOM (p/div/span, clamp classes, aria-labels), so we use multi-signal heuristics.
  const scope =
    msgEl?.querySelector?.(SEL_QWRAP_.MARKDOWN_SCOPE) ||
    msgEl?.querySelector?.(SEL_QWRAP_.BUBBLE_HINT) ||
    msgEl;

  if (!scope) return null;

  const nodes = [
    ...scope.querySelectorAll('button'),
    ...scope.querySelectorAll('[role="button"]')
  ];

  /** @helper */
  const pickClampTextNode = (btn) => {
    if (!btn) return null;

    // Prefer explicit line-clamp class nodes (newer UI), else fall back to common text nodes.
    const first =
      btn.querySelector?.('[class*="line-clamp"]') ||
      btn.querySelector?.('p') ||
      btn.querySelector?.('div') ||
      btn.querySelector?.('span') ||
      null;

    const cands = first
      ? [first, ...Array.from(btn.querySelectorAll('p,div,span')).slice(0, 18)]
      : Array.from(btn.querySelectorAll('p,div,span')).slice(0, 18);

    for (const el of cands) {
      if (!el) continue;
      const cs = getComputedStyle(el);

      const clamp =
        cs.webkitLineClamp ||
        cs.getPropertyValue('-webkit-line-clamp') ||
        cs.getPropertyValue('line-clamp');

      const hasClamp = clamp && String(clamp).trim() !== 'none' && String(clamp).trim() !== '0';

      const looksEllipsized =
        String(cs.overflow || '') === 'hidden' ||
        String(cs.textOverflow || '').includes('ellipsis') ||
        (String(cs.display || '').includes('-webkit-box') && hasClamp);

      if (hasClamp || looksEllipsized) return el;
    }

    return first;
  };

  for (const b of nodes) {
    if (!b) continue;

    // Never steal our own UI / already-wrapped areas
    if (b.closest?.(SEL_QWRAP_.QBOX) || b.closest?.('.cgxui-qswr')) continue;

    // Ignore composer controls
    if (b.closest?.('form')) continue;

    const aria = (b.getAttribute?.('aria-label') || '').toLowerCase();
    const looksLikeReply =
      aria.includes('replied content') ||
      aria.includes('more about replied') ||
      aria.includes('replied') ||
      aria.includes('reply');

    const tNode = pickClampTextNode(b);
    const txt = UTIL_norm((tNode?.innerText || b.innerText || b.textContent || ''));

    if (!txt || txt.length < 12) continue;
    if (txt.length > 1200) continue;

    const hasClampClass = !!(tNode && String(tNode.className || '').includes('line-clamp'));

    // UI usually renders a "reply arrow" glyph; accept that as a signal too.
    const hasArrow = /↩|↪|⤴|⤶|⮐|⤷/.test(b.innerText || '');

    if (looksLikeReply || hasClampClass || hasArrow) return b;

    // Legacy heuristic: <p> with line-clamp + overflow hidden
    const p = b.querySelector?.('p');
    if (!p) continue;

    const cs = getComputedStyle(p);
    const clamp =
      cs.webkitLineClamp ||
      cs.getPropertyValue('-webkit-line-clamp') ||
      cs.getPropertyValue('line-clamp');

    const hasClamp = clamp && String(clamp).trim() !== 'none' && String(clamp).trim() !== '0';
    const looksHidden =
      String(cs.overflow || '') === 'hidden' ||
      String(cs.textOverflow || '').includes('ellipsis');

    if (hasClamp && looksHidden) return b;
  }

  return null;
}

  /* ───────────────────────────── 10) USER BUBBLE LOOK ───────────────────────────── */

  /** @helper */
  function DOM_applyUserBubbleLook(msgEl) {
    if (!msgEl || msgEl.getAttribute?.('data-message-author-role') !== 'user') return;

    const bubble =
      DOM_findBubbleHost(msgEl) ||
      DOM_findBubbleHost(DOM_getUserMessageRoot(msgEl)) ||
      DOM_findBubbleHost(msgEl.firstElementChild);

    if (!bubble) return;

    const w = msgEl.querySelector?.('.cgxui-qswr');
    const wantsWide = !!(w && w.classList.contains('cgxui-qswr-collapsed'));

    bubble.classList.remove('cgxui-qswr-bubble', 'cgxui-qswr-bubble-short');
    bubble.classList.add(wantsWide ? 'cgxui-qswr-bubble' : 'cgxui-qswr-bubble-short');
  }

  /* ───────────────────────────── 11) WRAP QUESTION (no feature loss) ───────────────────────────── */

  /** @critical */
  function DOM_wrapQuestion(msgEl) {
    if (!DOM_isUserMsg(msgEl)) return;
    if (msgEl.dataset.hoQwrapDone === '1') {
      const stillHas = msgEl.querySelector?.('.cgxui-qswr');
      if (stillHas) return;
      try { delete msgEl.dataset.hoQwrapDone; } catch {}
    }

    const textEl = DOM_findTextBlock(msgEl, true);
    if (!textEl) return;

    const lines = DOM_measureLines(textEl);
    const tLen = (UTIL_norm(textEl.innerText || '')).length;

    const has2Plus = (lines > 2) || (lines === 0 && tLen >= CFG_QWRAP_.MIN_CHARS);

    // Collapse rule: prefer real line-count; fall back to char-count when measurement is unreliable.
    const doCollapse =
      (lines >= CFG_QWRAP_.MAX_LINES) ||
      (lines === 0 && tLen >= CFG_QWRAP_.MIN_CHARS) ||
      (tLen >= (CFG_QWRAP_.MIN_CHARS * 3));



    const bubbleHost = DOM_findBubbleHost(textEl) || DOM_findBubbleHost(msgEl);

    const wrapper = document.createElement('div');
    wrapper.className = 'cgxui-qswr' + (doCollapse ? ' cgxui-qswr-collapsed' : ' cgxui-qswr-short');
    wrapper.dataset.hoQwrap = '1';
    wrapper.setAttribute(ATTR_QWRAP_.OWNER, SkID);
    wrapper.setAttribute(ATTR_QWRAP_.UI, `${SkID}-wrap`);

    if (has2Plus) wrapper.classList.add('cgxui-qswr-2plus');

    const stableId = DOM_getStableQwrapId(msgEl, textEl);
    wrapper.dataset.hoQwrapId = stableId;
    wrapper.dataset.h2oQwrapId = stableId;

    // Reuse any existing quoteBox already associated with this stableId
    let quoteBox =
      document.querySelector(`.cgxui-qswr-quoteBox[data-ho-qwrap-for="${stableId}"]`) ||
      document.querySelector(`.cgxui-qswr-quoteBox[data-h2o-qwrap-for="${stableId}"]`) ||
      null;

    const topSlot = doCollapse ? document.createElement('div') : null;
    const bottomRow = doCollapse ? document.createElement('div') : null;

    if (topSlot) {
      topSlot.className = 'cgxui-qswr-toggle-top';
      topSlot.setAttribute(ATTR_QWRAP_.OWNER, SkID);
      topSlot.setAttribute(ATTR_QWRAP_.UI, `${SkID}-toggleTop`);
    }
    if (bottomRow) {
      bottomRow.className = 'cgxui-qswr-toggle-row';
      bottomRow.setAttribute(ATTR_QWRAP_.OWNER, SkID);
      bottomRow.setAttribute(ATTR_QWRAP_.UI, `${SkID}-toggleBottom`);
    }

    const quoteBtn =
      DOM_extractChatGPTQuoteNode(msgEl) ||
      DOM_extractChatGPTQuoteNode(textEl);

    if (!quoteBox && quoteBtn && !quoteBtn.closest('.cgxui-qswr')) {
      quoteBox = document.createElement('div');
      quoteBox.className = 'cgxui-qswr-quoteBox';
      quoteBox.setAttribute(ATTR_QWRAP_.OWNER, SkID);
      quoteBox.setAttribute(ATTR_QWRAP_.UI, `${SkID}-quoteBox`);

      quoteBox.dataset.hoQwrapFor  = stableId;
      quoteBox.dataset.h2oQwrapFor = stableId;

      const title = document.createElement('div');
      title.className = 'cgxui-qswr-quoteTitle';

      const userMsg = msgEl.closest?.(SEL_QWRAP_.USER_MSG) || msgEl;
      const prevA = DOM_getPrevAssistantForUserMsg(userMsg);
      const aIdx = prevA ? (DOM_turnIdxFromAEl(prevA) || 0) : 0;

      if (aIdx) {
        title.textContent = `QUOTE (ANSWER ${aIdx})`;
        quoteBox.dataset.hoQuoteFrom = String(aIdx);
        quoteBox.dataset.hoQuoteConf = '0';
        quoteBox.dataset.hoQuoteAmb  = '0';
        quoteBox.dataset.hoQuoteVia  = 'struct_init';
      } else {
        title.textContent = 'QUOTE (ANSWER ?)';
        quoteBox.dataset.hoQuoteFrom = '?';
        quoteBox.dataset.hoQuoteConf = '0';
        quoteBox.dataset.hoQuoteAmb  = '1';
        quoteBox.dataset.hoQuoteVia  = 'struct_none';
      }

      quoteBtn.parentElement?.removeChild(quoteBtn);
      quoteBox.appendChild(title);
      quoteBox.appendChild(quoteBtn);
    }

    const textHolder = textEl;

    if (doCollapse) {
      const body = document.createElement('div');
      body.className = 'cgxui-qswr-text';
      body.setAttribute(ATTR_QWRAP_.OWNER, SkID);
      body.setAttribute(ATTR_QWRAP_.UI, `${SkID}-text`);

      while (textHolder.firstChild) body.appendChild(textHolder.firstChild);
      textHolder.appendChild(body);

      if (!quoteBox) {
        const fallbackBtn = DOM_extractChatGPTQuoteNode(textHolder);
        if (fallbackBtn) {
          quoteBox = document.createElement('div');
          quoteBox.className = 'cgxui-qswr-quoteBox';
          quoteBox.setAttribute(ATTR_QWRAP_.OWNER, SkID);
          quoteBox.setAttribute(ATTR_QWRAP_.UI, `${SkID}-quoteBox`);

          quoteBox.dataset.hoQwrapFor  = stableId;
          quoteBox.dataset.h2oQwrapFor = stableId;

          const title = document.createElement('div');
          title.className = 'cgxui-qswr-quoteTitle';

          const userMsg = msgEl.closest?.(SEL_QWRAP_.USER_MSG) || msgEl;
          const prevA = DOM_getPrevAssistantForUserMsg(userMsg);
          const aIdx = prevA ? (DOM_turnIdxFromAEl(prevA) || 0) : 0;

          if (aIdx) {
            title.textContent = `QUOTE (ANSWER ${aIdx})`;
            quoteBox.dataset.hoQuoteFrom = String(aIdx);
            quoteBox.dataset.hoQuoteConf = '0';
            quoteBox.dataset.hoQuoteAmb  = '0';
            quoteBox.dataset.hoQuoteVia  = 'struct_init_fallback';
          } else {
            title.textContent = 'QUOTE (ANSWER ?)';
            quoteBox.dataset.hoQuoteFrom = '?';
            quoteBox.dataset.hoQuoteConf = '0';
            quoteBox.dataset.hoQuoteAmb  = '1';
            quoteBox.dataset.hoQuoteVia  = 'struct_none_fallback';
          }

          fallbackBtn.parentElement?.removeChild(fallbackBtn);
          quoteBox.appendChild(title);
          quoteBox.appendChild(fallbackBtn);
        }
      }
    }

    // Replace original text container with wrapper
    textHolder.replaceWith(wrapper);

    if (doCollapse) {
      wrapper.appendChild(topSlot);
      wrapper.appendChild(textHolder);
      wrapper.appendChild(bottomRow);
    } else {
      wrapper.appendChild(textHolder);
    }

    // Bubble geometry class (no shift)
    if (bubbleHost) {
      bubbleHost.classList.remove('cgxui-qswr-bubble', 'cgxui-qswr-bubble-short');
      bubbleHost.classList.add(doCollapse ? 'cgxui-qswr-bubble' : 'cgxui-qswr-bubble-short');
    }

    // Place quoteBox inside/outside based on mode (same behavior)
    if (quoteBox) {
      const mode = UTIL_getQuoteMode();
      if (mode === CFG_QWRAP_.QUOTE_MODE_OUTSIDE) {
        wrapper.parentNode?.insertBefore(quoteBox, wrapper);
      } else {
        const lastPre = textHolder.querySelector?.('pre:last-of-type');
        if (lastPre && lastPre.parentNode) {
          lastPre.parentNode.insertBefore(quoteBox, lastPre.nextSibling);
        } else if (topSlot && topSlot.parentNode === wrapper) {
          wrapper.insertBefore(quoteBox, topSlot.nextSibling);
        } else {
          wrapper.insertBefore(quoteBox, wrapper.firstChild);
        }
      }
    }

    // Toggle UI (same)
    if (doCollapse) {
      let expanded = false;

      const btnTop = UI_buildToggle('See more', '▾');
      const btnBottom = UI_buildToggle('See less', '▴');

      topSlot.appendChild(btnTop);
      bottomRow.appendChild(btnBottom);

      const sync = () => {
        wrapper.classList.toggle('cgxui-qswr-collapsed', !expanded);
        btnTop.querySelector('.cgxui-qswr-tx').textContent = expanded ? 'See less' : 'See more';
        btnTop.querySelector('.cgxui-qswr-ic').textContent = expanded ? '▴' : '▾';
        btnBottom.querySelector('.cgxui-qswr-tx').textContent = 'See less';
        btnBottom.querySelector('.cgxui-qswr-ic').textContent = '▴';
      };

      const toggle = () => { expanded = !expanded; sync(); };
      btnTop.onclick = toggle;
      btnBottom.onclick = toggle;

      sync();

      if (CFG_QWRAP_.AUTO_COLLAPSE_ON_SCROLL_AWAY) {
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting && expanded) { expanded = false; sync(); }
          }
        }, { threshold: 0.05 });
        io.observe(wrapper);
        MOD.state.cleanup = MOD.state.cleanup || [];
        MOD.state.cleanup.push(() => { try { io.disconnect(); } catch {} });
      }
    }

    msgEl.dataset.hoQwrapDone = '1';
    DOM_applyUserBubbleLook(msgEl);

    // Handoff events (QuoteTracker will resolve intelligently)
    BUS_emit(EV_QWRAP_.WRAPPED, { stableId, userMsgEl: msgEl });

    if (quoteBox) {
      BUS_emit(EV_QWRAP_.QUOTE_PENDING, { stableId, quoteBoxEl: quoteBox });
    }
  }

  /* ───────────────────────────── 12) SCAN SCHEDULER (wrap-only) ───────────────────────────── */

  /** @helper */
  function DOM_cancelScheduledScan() {
    const st = MOD.state;
    if (!st.scanHandle) return;
    if (st.scanIsIdle && 'cancelIdleCallback' in window) cancelIdleCallback(st.scanHandle);
    else clearTimeout(st.scanHandle);
    st.scanHandle = 0;
    st.scanIsIdle = false;
    _PS.retry.cancelledCount++;
  }

  /** @helper */
  function DOM_cancelRetryScan() {
    const st = MOD.state;
    if (st.retryHandle) {
      clearTimeout(st.retryHandle);
      st.retryHandle = 0;
      _PS.retry.cancelledCount++;
    }
    st.retryAttempt = 0;
    st.retryUntil = 0;
  }

  /** @helper */
  function DOM_hasUnwrappedUsers() {
    return !!document.querySelector?.(SEL_QWRAP_.NOT_WRAPPED_USER);
  }

  /** @helper */
  function DOM_scheduleRetryScan(reason = 'retry') {
    const st = MOD.state;
    if (st.retryHandle) return;

    const delays = RETRY_QWRAP_DELAYS_;
    if (!Array.isArray(delays) || !delays.length) return;

    const now = Date.now();
    if (!st.retryUntil || now > st.retryUntil) {
      st.retryAttempt = 0;
      st.retryUntil = now + delays.reduce((sum, ms) => sum + ms, 0) + 250;
    }

    if (st.retryAttempt >= delays.length) return;

    const delay = delays[st.retryAttempt++];
    st.retryHandle = setTimeout(() => {
      st.retryHandle = 0;

      if (!DOM_hasUnwrappedUsers()) {
        DOM_cancelRetryScan();
        return;
      }

      if (st.scanRunning || st.scrolling) {
        st.scanQueued = true;
        return;
      }

      DOM_scheduleScan(reason);
    }, delay);
  }

  /** @critical */
  function DOM_scheduleScan(reason = '') {
    const st = MOD.state;
    st.scanQueued = true;

    if (st.scanRunning || st.scrolling) return;

    // ── perf: scheduling entry ──
    const _isAfterBoot = _psIsAfterBoot();
    _PS.idleSchedule.scheduleCount++;
    if (_isAfterBoot) _PS.idleSchedule.afterBootCount++;
    else              _PS.idleSchedule.beforeBootCount++;
    const _r = String(reason || 'unspecified');
    _PS.idleSchedule.lastReason = _r;
    _PS.idleSchedule.lastAt     = Date.now();
    _PS.idleSchedule.reasons[_r] = (_PS.idleSchedule.reasons[_r] || 0) + 1;

    if (st.scanHandle) {
      // replacing an existing pending scan = coalesced + cancellation of old handle
      _PS.idleSchedule.coalescedCount++;
      _PS.retry.cancelledCount++;
      if (st.scanIsIdle && 'cancelIdleCallback' in window) cancelIdleCallback(st.scanHandle);
      else clearTimeout(st.scanHandle);
      st.scanHandle = 0;
      st.scanIsIdle = false;
    }

    const run = (deadline) => {
      st.scanHandle = 0;
      st.scanIsIdle = false;
      if (st.scanRunning || st.scrolling) return;
      st.scanQueued = false;
      // ── perf: true idle execution ──
      const _t0 = _perfNow();
      const _ab = _psIsAfterBoot();
      if (_ab) _PS.idleExecution.afterBootCount++;
      else      _PS.idleExecution.beforeBootCount++;
      if (deadline && deadline.didTimeout) _PS.idleExecution.timedOutCount++;
      _PS.idleExecution.lastAt = Date.now();
      DOM_runScan(reason);
      _recordDur(_PS.idleExecution, _perfNow() - _t0);
    };

    if ('requestIdleCallback' in window) {
      st.scanIsIdle = true;
      st.scanHandle = requestIdleCallback(run, { timeout: CFG_QWRAP_.IDLE_TIMEOUT_MS });
    } else {
      // ── perf: fallback scheduling ──
      _PS.idleSchedule.fallbackCount++;
      _PS.fallback.scheduleCount++;
      st.scanIsIdle = false;
      st.scanHandle = setTimeout(() => {
        // ── perf: fallback execution (boot-phase split handled inside run()) ──
        _PS.fallback.execCount++;
        _PS.idleExecution.fallbackExecCount++;
        const _t0 = _perfNow();
        run();
        _recordDur(_PS.fallback.exec, _perfNow() - _t0);
      }, CFG_QWRAP_.FALLBACK_SCAN_DELAY_MS);
    }
  }

/** @critical */
function DOM_runScan(reason = '') {
  const st = MOD.state;
  if (st.scanRunning || st.scrolling) { st.scanQueued = true; _PS.retry.abortedCount++; return; }

  st.scanRunning = true;
  st.scanQueued  = false;
  let unresolvedAfter = 0;

  try {
    // ── perf: scan phase ──
    const _scanT0 = _perfNow();
    const _wbBoot = _psIsAfterBoot();
    const newUsers = UTIL_qsa(SEL_QWRAP_.NOT_WRAPPED_USER);
    _recordDur(_PS.workPhases.scan, _perfNow() - _scanT0);
    if (_wbBoot) _PS.workPhases.scan.afterBootCount++;
    else          _PS.workPhases.scan.beforeBootCount++;

    const _scanned = newUsers.length;
    _PS.nodeWork.scanned      += _scanned;
    _PS.nodeWork.lastNodeCount = _scanned;
    _PS.nodeWork.lastAt        = Date.now();

    // ── perf: wrap phase ──
    let wrapped = 0;
    let confirmedWraps = 0;
    if (newUsers.length) {
      const _wrapT0 = _perfNow();
      for (const msgEl of newUsers) {
        DOM_wrapQuestion(msgEl);
        wrapped++;
        if (msgEl.dataset.hoQwrapDone === '1') confirmedWraps++;
      }
      _recordDur(_PS.workPhases.wrap, _perfNow() - _wrapT0);
      if (_wbBoot) _PS.workPhases.wrap.afterBootCount++;
      else          _PS.workPhases.wrap.beforeBootCount++;
    }

    unresolvedAfter = UTIL_qsa(SEL_QWRAP_.NOT_WRAPPED_USER).length;

    _PS.nodeWork.wrapAttempts  += wrapped;
    _PS.nodeWork.confirmedWraps += confirmedWraps;
    if (_scanned > 0 && confirmedWraps === 0) _PS.nodeWork.noOp++;

    // ── perf: stamp boot on first confirmed wrap completion ──
    if (confirmedWraps > 0 && !_PS.bootCompletedAt) {
      _PS.bootCompletedAt = Date.now();
    }

    // ✅ First successful wrap pass: end prestyle + unmask ASAP
    if (wrapped > 0 && !st.prestyleRemoved) {
      st.prestyleRemoved = true;

      // remove prestyle ASAP (same frame / next paint)
      const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
      raf(() => {
        try { UI_removePrestyle?.(); } catch {}
      });

      // ✅ disable mask immediately once we have styled content
      try { UI_maskDisable?.(); } catch {}
    }

    if (unresolvedAfter > 0) DOM_scheduleRetryScan('retry');
    else DOM_cancelRetryScan();

  } catch (e) {
    console.warn('[QWRAP] scan error:', reason, e);

    // ✅ safety: if scan fails, do not keep the UI masked forever
    try { UI_maskDisable?.(); } catch {}

  } finally {
    st.scanRunning = false;
    if (st.scanQueued && !st.scrolling) {
      _PS.retry.rescheduleCount++;
      DOM_scheduleScan('queued');
    }
  }
}



  /* ───────────────────────────── 13) CSS (unchanged) ───────────────────────────── */
const CSS_QWRAP_PRE_ = Object.freeze({
  PRE_ID: `cgxui-${SkID}-prestyle`,
  PRE_ATTR: `data-cgxui-${SkID}-pre`,
});

/** @critical */
function UI_injectPrestyleOnce() {
  if (document.getElementById(CSS_QWRAP_PRE_.PRE_ID)) return;

  // mark "pre" mode immediately (lets CSS target native DOM before wrapping)
  try { document.documentElement.setAttribute(CSS_QWRAP_PRE_.PRE_ATTR, '1'); } catch {}

  const style = document.createElement('style');
  style.id = CSS_QWRAP_PRE_.PRE_ID;

  style.textContent = `
/* ─────────────────────────────────────────────────────────────
   PRESTYLE: minimize native→styled snap (removed after first wrap pass)
   ───────────────────────────────────────────────────────────── */

/* 0) disable native transitions while pre is active */
html[${CSS_QWRAP_PRE_.PRE_ATTR}="1"] ${SEL_QWRAP_.USER_MSG}{
  transition: none !important;
}

/* 1) 🎭 NO-FLASH MASK: hide ONLY unwrapped user messages */
html[${CSS_QWRAP_PRE_.PRE_ATTR}="1"] ${SEL_QWRAP_.USER_MSG}{
  transition: opacity 140ms ease !important;
}
html[${CSS_QWRAP_PRE_.PRE_ATTR}="1"] ${SEL_QWRAP_.USER_MSG}:not([data-ho-qwrap-done="1"]){
  opacity: 0 !important;
}

/* 2) pre-shape the native bubble host so when it fades in it already looks premium */
/* (Safer) Optional: tiny rounding on first wrapper only (avoid [class*='message'] shredding). */
html[${CSS_QWRAP_PRE_.PRE_ATTR}="1"] ${SEL_QWRAP_.USER_MSG} > div:first-child{
  border-radius: 16px !important;
}

/* 3) pre-style the native replied-content chip (quote) so it doesn't flash ugly */
html[${CSS_QWRAP_PRE_.PRE_ATTR}="1"] ${SEL_QWRAP_.USER_MSG} button[aria-label*="replied"],
html[${CSS_QWRAP_PRE_.PRE_ATTR}="1"] ${SEL_QWRAP_.USER_MSG} button:has([class*="line-clamp"]){
  display:block !important;
  width:100% !important;
  margin:10px 0 !important;
  padding:10px 12px !important;
  border-radius:14px !important;
  background: rgba(255,255,255,.05) !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  box-shadow: 0 8px 20px rgba(0,0,0,.14) !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
  `.trim();

  const host = document.head || document.documentElement;
  host.appendChild(style);

  // keep refs for cleanup
  MOD.state.preStyleEl = style;
}


function UI_removePrestyle() {
  try { document.documentElement.removeAttribute(CSS_QWRAP_PRE_.PRE_ATTR); } catch {}
  try { document.getElementById(CSS_QWRAP_PRE_.PRE_ID)?.remove?.(); } catch {}
}

  /** @critical */
  function UI_injectCSSOnce() {
    if (document.getElementById(CSS_QWRAP_.STYLE_ID)) return;
    for (const id of CSS_QWRAP_.LEGACY_STYLE_IDS) {
      if (document.getElementById(id)) return;
    }

    const style = document.createElement('style');
    style.id = CSS_QWRAP_.STYLE_ID;

    style.textContent = `
/* =======================================================================
   H2O QWrap — Stable Bubble Geometry + Always Bottom Shadow (ALL STATES)
   Goals:
   1) Bottom shadow ALWAYS (short/long/collapsed/expanded)
   2) ZERO width/position shift on toggle
   3) NO borders/rings around user bubbles (ever)
   ======================================================================= */

html { scrollbar-gutter: stable; }
body { overflow-y: scroll; }

.cgxui-qswr{
  position: relative;
  display: block;
  box-sizing: border-box;
  overflow: visible;
  margin: 0 !important;
  padding: 0 !important;
}

.cgxui-qswr.cgxui-qswr-short{
  margin: 0 !important;
  padding: 0 !important;
}

.cgxui-qswr-bubble,
.cgxui-qswr-bubble-short{
  --h2o-bubble-pad-x: 14px;
  --h2o-bubble-shift-x: 14px;

  --h2o-bottom-shadow-h: 42px;
  --h2o-bottom-shadow-a: 0.42;

  position: relative !important;
  box-sizing: border-box !important;

  overflow: visible !important;

  padding-left:  var(--h2o-bubble-pad-x) !important;
  padding-right: var(--h2o-bubble-pad-x) !important;
  margin-left:  calc(-1 * var(--h2o-bubble-shift-x)) !important;
  margin-right: calc(-1 * var(--h2o-bubble-shift-x)) !important;

  border: 0 !important;
  outline: 0 !important;

  border-radius: 16px !important;
  box-shadow: 0 10px 28px rgba(0,0,0,.22) !important;
}

.cgxui-qswr-text{
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  padding-right: 78px !important;
  box-sizing: border-box;
}

.cgxui-qswr.cgxui-qswr-collapsed .cgxui-qswr-text{
  -webkit-line-clamp: ${CFG_QWRAP_.PREVIEW_LINES};
  overflow: hidden !important;
  padding-bottom: 8px;
}

.cgxui-qswr:not(.cgxui-qswr-collapsed) .cgxui-qswr-text{
  -webkit-line-clamp: unset;
  overflow: visible !important;
}

.cgxui-qswr-fade{ display:none !important; }

.cgxui-qswr-toggle-top{
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 10;
  display: flex;
  justify-content: flex-end;
}

.cgxui-qswr-toggle-row{
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.cgxui-qswr.cgxui-qswr-collapsed .cgxui-qswr-toggle-row{
  display: none;
}

.cgxui-qswr-toggle{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  user-select: none;

  background: rgba(255,255,255,.06);
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);

  color: rgba(255,255,255,.92);
  opacity: .90;

  transition: transform .12s ease, opacity .12s ease, background .12s ease;
}

.cgxui-qswr-toggle:hover{
  opacity: 1;
  transform: translateY(-1px);
  background: rgba(255,255,255,.08);
}

.cgxui-qswr-toggle:active{
  transform: translateY(0px) scale(.98);
}

.cgxui-qswr-quoteBox{
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 10px 0;
  padding: 10px 12px;

  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.10);

  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  box-shadow: 0 8px 20px rgba(0,0,0,.18);

  overflow: hidden !important;
  box-sizing: border-box !important;
}

.cgxui-qswr-quoteTitle{
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 6px 0;
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  opacity: .65;
}

.cgxui-qswr-quoteBox button,
.cgxui-qswr-quoteBox [role="button"]{
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;

  margin: 0 !important;

  outline: 0 !important;
  box-shadow: none !important;
}

.cgxui-qswr-quoteBox button p{ margin:0 !important; }

.cgxui-qswr-quoteBox *{
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}

.cgxui-qswr-quoteBox p,
.cgxui-qswr-quoteBox span,
.cgxui-qswr-quoteBox div{
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.cgxui-qswr-quoteBox pre{
  max-width: 100% !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  white-space: pre !important;
  -webkit-overflow-scrolling: touch;
}
.cgxui-qswr-quoteBox code{ white-space: pre !important; }

.cgxui-qswr.cgxui-qswr-2plus::after{
  content:"";
  position:absolute;
  left:-8px;
  right:-4px;
  bottom:0;
  height:38px;
  pointer-events:none;

  background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.45));
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;

  opacity: .85;
  z-index: 1;
}

.cgxui-qswr > *{
  position: relative;
  z-index: 2;
}

/* Quote Confidence Dot (subtle) */
.cgxui-qswr-quoteTitle{
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cgxui-qswr-quoteTitle::after{
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 999px;
  opacity: .55;
  background: currentColor;
  box-shadow: 0 0 0 1px color-mix(in oklab, currentColor 75%, transparent);
}

.cgxui-qswr-quoteBox[data-ho-quote-conf="1"] .cgxui-qswr-quoteTitle::after{
  background: color-mix(in oklab, #2ecc71 55%, transparent);
  opacity: .65;
}

.cgxui-qswr-quoteBox[data-ho-quote-conf="0"][data-ho-quote-amb="0"] .cgxui-qswr-quoteTitle::after{
  background: color-mix(in oklab, #f1c40f 55%, transparent);
  opacity: .60;
}

.cgxui-qswr-quoteBox[data-ho-quote-conf="0"][data-ho-quote-amb="1"] .cgxui-qswr-quoteTitle::after{
  background: color-mix(in oklab, #e74c3c 55%, transparent);
  opacity: .55;
}
    `.trim();

    document.head.appendChild(style);

    MOD.state.styleEl = style;
    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { style.remove(); } catch {}
      MOD.state.styleEl = null;
    });
  }

  /* ───────────────────────────── 14) BOOT / DISPOSE ───────────────────────────── */
/** @critical Boot: prestyle+mask ASAP, fast-phase rAF scan, MO flagging, full cleanup. */
function CORE_boot() {
  if (W[KEY_QWRAP_.INIT_BOOT]) return;
  W[KEY_QWRAP_.INIT_BOOT] = true;

  const st = (MOD.state = MOD.state || {});
  st.cleanup = st.cleanup || [];

  st.scanRunning = false;
  st.scanQueued  = false;
  st.scanHandle  = 0;
  st.scanIsIdle  = false;
  st.retryHandle = 0;
  st.retryAttempt = 0;
  st.retryUntil = 0;

  st.scrolling = false;
  st.scrollT   = 0;
  st.hubMutOff = (typeof st.hubMutOff === 'function') ? st.hubMutOff : null;
  st.chipMO = st.chipMO || null;

  // 1) Hide native flash + make native look closer BEFORE any wrapping
  UI_maskEnable();
  if (typeof UI_injectPrestyleOnce === 'function') UI_injectPrestyleOnce();

  // 2) Fast-phase window (MO can trigger rAF scans inside it)
  const nowPerf = () =>
    (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

  st.bootPerf   = nowPerf();
  st.fastUntil  = st.bootPerf + (CFG_QWRAP_.FAST_PHASE_MS || 0);

  // 3) Main CSS (your real wrapper styles)
  UI_injectCSSOnce();

  // 4) Scroll gating (same behavior, minimal work)
  const onScroll = () => {
    st.scrolling = true;
    clearTimeout(st.scrollT);
    st.scrollT = setTimeout(() => {
      st.scrolling = false;
      if (st.scanQueued) DOM_scheduleScan('scroll-idle');
    }, CFG_QWRAP_.SCROLL_IDLE_MS);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  st.cleanup.push(() => window.removeEventListener('scroll', onScroll));

  // 5) rAF-fast scan (one per frame max)
  st.fastScanQueued = false;
  const fastScan = (why) => {
    if (st.fastScanQueued) return;
    st.fastScanQueued = true;

    const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
    raf(() => {
      st.fastScanQueued = false;
      if (st.scanRunning || st.scrolling) { st.scanQueued = true; return; }
      DOM_runScan(why || 'fast');
    });
  };

  // 6) MutationObserver: just flag (chip/msg) then pick fast vs scheduled scan
  const isEl = (n) => n && n.nodeType === 1;
  const nodeToEl = (n) => {
    if (!n) return null;
    if (n.nodeType === 1) return n;
    if (n.nodeType === 3) return n.parentElement || null;
    return null;
  };
  const touchesMsg = (n) => {
    const el = nodeToEl(n);
    if (!el) return false;
    return !!(
      el.matches?.(SEL_QWRAP_.NOT_WRAPPED_USER) ||
      el.querySelector?.(SEL_QWRAP_.NOT_WRAPPED_USER) ||
      el.closest?.(SEL_QWRAP_.NOT_WRAPPED_USER)
    );
  };
  const touchesChip = (n) => !!(n.closest?.(SEL_QWRAP_.CHIP_AREA_HINT) || n.querySelector?.(SEL_QWRAP_.CHIP_AREA_HINT));
  let hubCleanupBound = false;
  let chipCleanupBound = false;
  let onObsReady = null;

  const qwrapMO = new MutationObserver((muts) => {
    let needScan = false;
    let needChip = false;

    for (const m of muts) {
      if (!needScan && touchesMsg(m.target)) needScan = true;

      for (const n of (m.addedNodes || [])) {
        const el = nodeToEl(n);
        if (!el) continue;
        if (!needChip && touchesChip(n)) needChip = true;
        if (!needScan && touchesMsg(el)) needScan = true;
        if (needScan && needChip) break;
      }
      if (needScan && needChip) break;

      for (const n of (m.removedNodes || [])) {
        const el = nodeToEl(n);
        if (!el) continue;
        if (!needScan && touchesMsg(el)) needScan = true;
        if (needScan && needChip) break;
      }
      if (needScan && needChip) break;
    }

    if (needChip) BUS_emit(EV_QWRAP_.CHIP_CHANGED, { reason: 'mut' });

    if (needScan) {
      const t = nowPerf();
      if (t < (st.fastUntil || 0)) fastScan('mut-fast');
      else DOM_scheduleScan('mut');
    }
  });

  const chipMO = new MutationObserver((muts) => {
    let needChip = false;

    for (const m of muts) {
      for (const n of (m.addedNodes || [])) {
        if (!isEl(n)) continue;
        if (touchesChip(n)) { needChip = true; break; }
      }
      if (needChip) break;

      for (const n of (m.removedNodes || [])) {
        if (!isEl(n)) continue;
        if (touchesChip(n)) { needChip = true; break; }
      }
      if (needChip) break;
    }

    if (needChip) BUS_emit(EV_QWRAP_.CHIP_CHANGED, { reason: 'mut' });
  });

  const stopObsReady = () => {
    if (!onObsReady) return;
    window.removeEventListener('evt:h2o:obs:ready', onObsReady);
    onObsReady = null;
  };

  const bindQwrapHub = () => {
    const hub = W.H2O?.obs;
    if (!hub || typeof hub.onMutations !== 'function') return false;
    if (st.hubMutOff) return true;

    st.hubMutOff = hub.onMutations('qwrap:mut', (payload) => {
      if (!payload?.conversationRelevant) return;
      const t = nowPerf();
      if (t < (st.fastUntil || 0)) fastScan('hub-fast');
      else DOM_scheduleScan('hub');
    });

    if (!hubCleanupBound) {
      hubCleanupBound = true;
      st.cleanup.push(() => {
        if (typeof st.hubMutOff === 'function') {
          try { st.hubMutOff(); } catch {}
        }
        st.hubMutOff = null;
      });
    }

    stopObsReady();
    return true;
  };

  const ensureChipObserver = () => {
    if (st.chipMO) return true;
    if (!document.body) return false;

    chipMO.observe(document.body, { childList: true, subtree: true });
    st.chipMO = chipMO;

    if (!chipCleanupBound) {
      chipCleanupBound = true;
      st.cleanup.push(() => {
        try { chipMO.disconnect(); } catch {}
        st.chipMO = null;
      });
    }

    return true;
  };

  // 7) Observe ASAP (body may not exist at document-start)
  const startObserver = () => {
    if (!document.body) return false;

    if (bindQwrapHub()) {
      if (!ensureChipObserver()) return false;
      if (st.qwrapMO) {
        try { st.qwrapMO.disconnect(); } catch {}
        st.qwrapMO = null;
      }
      return true;
    }

    if (st.qwrapMO) return true;
    qwrapMO.observe(document.body, { childList: true, subtree: true });
    st.qwrapMO = qwrapMO;
    st.cleanup.push(() => {
      try { qwrapMO.disconnect(); } catch {}
      st.qwrapMO = null;
    });
    return true;
  };

  if (!st.hubMutOff) {
    onObsReady = () => {
      startObserver();
      if (st.hubMutOff) stopObsReady();
    };
    window.addEventListener('evt:h2o:obs:ready', onObsReady);
    st.cleanup.push(() => stopObsReady());
  }

  // Observe ASAP; at document-start body can be null for a while, so retry briefly.
  if (!startObserver()) {
    let cancelled = false;
    const t0 = nowPerf();
    const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));

    const tick = () => {
      if (cancelled || st.qwrapMO || st.chipMO || st.hubMutOff) return;
      if (startObserver()) return;
      if (nowPerf() - t0 > (CFG_QWRAP_.OBS_WAIT_MS || 2500)) return;
      raf(tick);
    };

    raf(tick);
    st.cleanup.push(() => { cancelled = true; });
  }

  // 8) Boot kick: do the earliest possible conversion pass
  fastScan('boot-fast');
  BUS_emit(EV_QWRAP_.CHIP_CHANGED, { reason: 'boot' });

  // Extra boot passes: ChatGPT may paint messages after our first scan.
  // These are no-ops if everything is already wrapped.
  const bootDelays = [60, 180, 420, 900];
  const bootTimers = [];
  for (const ms of bootDelays) {
    const h = setTimeout(() => {
      if (st.scanRunning || st.scrolling) { st.scanQueued = true; return; }
      DOM_runScan('boot+' + ms);
    }, ms);
    bootTimers.push(h);
  }
  st.cleanup.push(() => { for (const h of bootTimers) try { clearTimeout(h); } catch {} });

  // 9) Mask fail-safe (never leave UI masked)
  const tMask = setTimeout(() => UI_removePrestyle(), (CFG_QWRAP_.MASK_MAX_MS || 2200));
  st.cleanup.push(() => clearTimeout(tMask));

  MOD.api.boot = CORE_boot;
  MOD.api.dispose = CORE_dispose;
}


  /** @critical */
  function CORE_dispose() {
    if (!W[KEY_QWRAP_.INIT_BOOT]) return;

    DOM_cancelScheduledScan();
    DOM_cancelRetryScan();

    const cleanup = MOD.state.cleanup || [];
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    MOD.state.scanRunning = false;
    MOD.state.scanQueued = false;
    MOD.state.scanHandle = 0;
    MOD.state.scanIsIdle = false;
    MOD.state.retryHandle = 0;
    MOD.state.retryAttempt = 0;
    MOD.state.retryUntil = 0;

    W[KEY_QWRAP_.INIT_BOOT] = false;
  }

  // Minimal bootstrap
  CORE_boot();

})();
