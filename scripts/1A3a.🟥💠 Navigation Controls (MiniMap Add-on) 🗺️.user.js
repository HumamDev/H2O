// ==UserScript==
// @h2o-id      1a3.navigation.controls.minimap.add-on
// @name         1A3.🟥💠 Navigation Controls (MiniMap Add-on) 🗺️
// @namespace    H2O.Prime.CGX.NavControls
// @version      1.3.1
// @description  Nav cluster for MiniMap: color wheel + scroll up/down pinned to input. Split-safe: talks ONLY to MiniMap bridge API.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Navigation Controls (Split Module for MiniMap)
   * ----------------------------------------------------------------------------
   * ✅ Contract v2.0 — Stage 1 (Mechanics):
   * - Identity-first, bounded vault, cleanup registry, no top-level side effects outside boot().
   * - Split-safe: NEVER touches MiniMap internals directly.
   * - Talks ONLY through: window.H2O.MM.mnmp.api.mm.nav + window events exposed by MiniMap.
   * ========================================================================== */

  // ✅ Canonical window pointer
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;

  /* ──────────── 0) Identity (Contract v2.0) ──────────── */

  const TOK = 'NC';              // Navigation Controls
  const PID = 'nvctrls';         // consonant-only-ish
  const CID = 'NavCtl';          // human
  const SkID = 'nvcn';           // skin token base (Navigation Controls)

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const BrID = PID;
  const DsID = PID;

  const MODTAG    = 'NavControls';
  const MODICON   = '💠';
  const EMOJI_HDR = '🟥';

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || Object.create(null);

  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {
    diag:  Object.create(null),
    state: Object.create(null),
    api:   Object.create(null),
  });

  VAULT.state.meta = VAULT.state.meta || { TOK, PID, CID, SkID, BrID, DsID, MODTAG, MODICON, EMOJI_HDR, SUITE, HOST };

  /* ──────────── 1) Tokens (Stage 1) ──────────── */

  const ATTR_ = Object.freeze({
    CGX_OWNER: 'data-cgxui-owner',
    CGX_UI:    'data-cgxui',
    CGX_STATE: 'data-cgxui-state',
  });

  const SEL_ = Object.freeze({
    FORM: 'form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]',
    TEXTAREA: [
      '#prompt-textarea',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      'form.group\\/composer [contenteditable="true"]',
      'form[data-testid="composer"] [contenteditable="true"]',
      'form[action*="conversation"] [contenteditable="true"]',
      'form[data-testid="composer"] textarea',
      'form[action*="conversation"] textarea',
    ].join(', '),
  });

  // ⚠️ Event strings are *owned by MiniMap*; we read them from MiniMap API when possible.
  // Fallbacks exist only to avoid "silent dead UI" if MiniMap hasn't booted yet.
  const EV_FALLBACK_ = Object.freeze({
    MM_READY:        'evt:h2o:minimap:ready',
    MM_VIEW_CHANGED: 'evt:h2o:mm:viewChanged',
    INLINE_CHANGED:  'evt:h2o:inline:changed',
    ANSWER_HL:       'evt:h2o:answer:highlight',
  });

  // MiniMap identity (for locating its VAULT)
  const MM_ID_ = Object.freeze({
    TOK: 'MM',
    PID: 'mnmp',
    SUITE: 'prm',
    HOST: 'cgx',
  });

  // Legacy + canonical inline-dots storage keys (read-only; used for counters only)
  const KEY_ = Object.freeze({
    INLINE_DOTS_CANON:  `h2o:${MM_ID_.SUITE}:${MM_ID_.HOST}:${MM_ID_.PID}:state:inline_dots:v2`,
    CHUB_STATE_HUB_V1:  'h2o:prm:cgx:cntrlhb:state:hub:v1',
  });

  const EV_ = Object.freeze({
    CHUB_CHANGED_V1: 'h2o.ev:prm:cgx:cntrlhb:changed:v1',
  });

  const CFG_ = Object.freeze({
    NAV_GAP_Y: 25,
    NAV_GAP_X: 25,

    NAV_CLUSTER_SHIFT_X: -20,
    NAV_CLUSTER_SHIFT_Y: 0,

    // Keep anchor mostly raw; final top is clamped to a safe lane.
    ANCHOR_MAX_VH: 0.9,
    ANCHOR_MIN_PX: 280,
    ANCHOR_MAX_PX: 1200,
    SAFE_TOP_PX: 52,

    // Wheel paging
    WHEEL_THROTTLE_MS: 350,
    WHEEL_MIN_DELTA: 90,

    // Reposition throttle
    LAYOUT_RAF: true,

    // Counters: include inline highlights in totals
    COUNT_INCLUDE_INLINE: true,

    // Toggle for the built-in up/down pair.
    ENABLE_SCROLL_PAIR_BUTTONS: true,
  });

  const NAV_BASE_COLORS = Object.freeze({
    green : '#2C7A4A',
    blue  : '#345E9E',
    red   : '#A83A3A',
    gold  : '#C7A106',

    purple: '#6740A8',
    sky   : '#3FA7D6',
    pink  : '#C05C95',
    orange: '#D47A38',
  });

  const COLOR_PAGES = Object.freeze([
    ['blue', 'red', 'green', 'gold'],
    ['sky', 'pink', 'purple', 'orange'],
  ]);

  /* ──────────── 2) Cleanup (Stage 1) ──────────── */

  /** @helper */
  function UTIL_cleanupMake() {
    const fns = [];
    return {
      add(fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
      run() { while (fns.length) { try { fns.pop()(); } catch {} } },
    };
  }
  const CLEANUP = VAULT.state.cleanup || (VAULT.state.cleanup = UTIL_cleanupMake());

  /** @helper */
  function UTIL_on(target, type, fn, opts) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn, opts);
    CLEANUP.add(() => { try { target.removeEventListener(type, fn, opts); } catch {} });
  }

  /** @helper */
  function UTIL_observe(mo, el, opts) {
    if (!mo || !el) return;
    try { mo.observe(el, opts); } catch {}
    CLEANUP.add(() => { try { mo.disconnect(); } catch {} });
  }

  let __cachedComposerForm = null;

  /** @helper */
  function UTIL_isElementVisible(el) {
    if (!el) return false;
    try {
      if (!document.contains(el)) return false;
      const cs = W.getComputedStyle?.(el);
      if (cs) {
        if (cs.display === 'none') return false;
        if (cs.visibility === 'hidden') return false;
        const op = Number.parseFloat(cs.opacity || '1');
        if (Number.isFinite(op) && op <= 0.02) return false;
      }
      const r = el.getBoundingClientRect?.();
      if (!r) return false;
      if (r.width <= 0 || r.height <= 0) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** @helper */
  function UTIL_pickComposerTextarea() {
    const form = UTIL_pickComposerForm();
    const scoped =
      form?.querySelector?.('#prompt-textarea, textarea, [contenteditable="true"]') ||
      null;
    if (scoped && UTIL_isElementVisible(scoped)) return scoped;

    const candidates = Array.from(document.querySelectorAll(SEL_.TEXTAREA));
    if (!candidates.length) return null;

    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      if (!el) continue;

      let score = 0;
      const hostForm = el.closest?.('form') || null;
      if (el.id === 'prompt-textarea') score += 8;
      if (hostForm?.matches?.('form[data-type="unified-composer"], form.group\\/composer')) score += 8;
      if (hostForm?.matches?.('form[data-testid="composer"]')) score += 7;
      if (hostForm?.matches?.('form[action*="conversation"]')) score += 6;
      if (hostForm?.querySelector?.('button[data-testid="send-button"]')) score += 3;

      const aria = String(el.getAttribute?.('aria-label') || '').toLowerCase();
      const ph = String(el.getAttribute?.('placeholder') || '').toLowerCase();
      if (aria.includes('message') || ph.includes('message')) score += 2;

      if (UTIL_isElementVisible(el)) score += 2;
      try {
        const r = el.getBoundingClientRect();
        if (r && r.bottom >= (W.innerHeight * 0.45)) score += 1;
      } catch {}

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return best;
  }

  /** @helper */
  function UTIL_pickComposerForm() {
    const promptTa = document.getElementById?.('prompt-textarea');
    const promptForm = promptTa?.closest?.('form') || null;
    if (promptForm && UTIL_isElementVisible(promptForm)) return promptForm;

    const forms = Array.from(document.querySelectorAll(SEL_.FORM));
    if (!forms.length) return null;

    let best = null;
    let bestScore = -1;

    for (const f of forms) {
      if (!f) continue;

      const isComposer = !!f.matches?.('form[data-testid="composer"]');
      const isUnified = !!f.matches?.('form[data-type="unified-composer"], form.group\\/composer');
      const isConvo = !!f.matches?.('form[action*="conversation"]');
      const hasPrompt = !!f.querySelector?.('#prompt-textarea');
      const hasSend = !!f.querySelector?.('button[data-testid="send-button"], button[aria-label*="send" i]');
      const hasInput = !!f.querySelector?.('#prompt-textarea, textarea, [contenteditable="true"]');

      if (!(isUnified || isComposer || isConvo || hasPrompt || hasSend || hasInput)) continue;

      let score = 0;
      if (isUnified) score += 13;
      if (isComposer) score += 12;
      if (hasPrompt) score += 10;
      if (isConvo) score += 8;
      if (hasSend) score += 6;
      if (hasInput) score += 4;
      if (UTIL_isElementVisible(f)) score += 3;
      try {
        const r = f.getBoundingClientRect();
        if (r && r.bottom >= (W.innerHeight * 0.45)) score += 2;
      } catch {}

      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }

    if (best && bestScore >= 8) return best;
    return null;
  }

  /** @helper */
  function UTIL_findComposerForm() {
    if (__cachedComposerForm && UTIL_isElementVisible(__cachedComposerForm)) {
      return __cachedComposerForm;
    }
    const f = UTIL_pickComposerForm();
    if (f) return (__cachedComposerForm = f);

    const ta = UTIL_pickComposerTextarea();
    const found = ta ? ta.closest('form') : null;
    __cachedComposerForm = found || null;
    return __cachedComposerForm;
  }

  /** @helper */
  function UTIL_pickComposerSurface() {
    const cands = Array.from(document.querySelectorAll('[data-composer-surface="true"]'));
    if (!cands.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of cands) {
      if (!UTIL_isElementVisible(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width <= 0 || r.height <= 0) continue;

      let score = 0;
      if (r.bottom >= (W.innerHeight * 0.45)) score += 8;
      if (r.bottom <= (W.innerHeight + 24)) score += 2;
      if (r.width >= 300) score += 2;
      if (el.closest?.(SEL_.FORM)) score += 6;
      const distFromBottom = Math.abs(W.innerHeight - r.bottom);
      score += Math.max(0, 420 - distFromBottom) / 70;

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return best;
  }

  let __cachedComposerTextarea = null;

  /** @helper */
  function UTIL_findComposerTextarea() {
    if (__cachedComposerTextarea && UTIL_isElementVisible(__cachedComposerTextarea)) {
      return __cachedComposerTextarea;
    }
    const ta = UTIL_pickComposerTextarea();
    __cachedComposerTextarea = ta || null;
    return __cachedComposerTextarea;
  }

  // 1) Pure, one-shot finder (NO retry inside)
  function UTIL_findComposerForm_once() {
    return UTIL_pickComposerForm() || null;
  }

  // 2) Scheduled waiter (retry OUTSIDE the finder)
  let __nav_waitComposer_inflight = false;

  /** @helper */
  function UTIL_waitComposerForm(cb) {
    let done = false;

    const tryFind = () => {
      if (done) return;
      const form = UTIL_pickComposerForm();

      if (form) { done = true; cb(form); obs.disconnect(); }
    };

    const obs = new MutationObserver(() => { tryFind(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    queueMicrotask(tryFind);

    CLEANUP.add(() => { try { obs.disconnect(); } catch {} });
  }

  UTIL_waitComposerForm((form) => {
    try { VAULT.state._composerFormHint = form; } catch {}
    try {
      if (VAULT.state?.navBoxEl && VAULT.state?.navBoxLeft && VAULT.state?.navBoxRight) {
        scheduleLayout(VAULT.state.navBoxEl, VAULT.state.navBoxLeft, VAULT.state.navBoxRight);
      }
    } catch {}
  });

  /* ──────────── 3) Minimal DIAG (bounded) ──────────── */

  const DIAG = VAULT.diag;
  DIAG.bufMax = DIAG.bufMax || 60;
  DIAG.errMax = DIAG.errMax || 20;
  DIAG.steps  = DIAG.steps  || [];
  DIAG.errors = DIAG.errors || [];

  /** @helper */
  function LOG(tag, data) {
    try {
      DIAG.steps.push({ t: Date.now(), tag, data });
      if (DIAG.steps.length > DIAG.bufMax) DIAG.steps.splice(0, DIAG.steps.length - DIAG.bufMax);
    } catch {}
  }

  /** @helper */
  function ERR(tag, err) {
    try {
      DIAG.errors.push({ t: Date.now(), tag, err: String(err?.message || err) });
      if (DIAG.errors.length > DIAG.errMax) DIAG.errors.splice(0, DIAG.errors.length - DIAG.errMax);
    } catch {}
  }

  /* ──────────── 4) MiniMap Bridge Access (NO internals) ──────────── */

  /** @helper */
  function MM_getVault() {
    return W.H2O?.[MM_ID_.TOK]?.[MM_ID_.PID] || null;
  }

  /** @helper */
  function MM_getApi() {
    const v = MM_getVault();
    return v?.api?.mm || null;
  }

  /** @helper */
  function MM_getNav() {
    return MM_getApi()?.nav || null;
  }

  /** @helper */
  function MM_getCore() {
    try { return TOPW.H2O_MM_SHARED?.get?.()?.api?.core || TOPW.H2O_MM_SHARED_CORE || null; } catch { return null; }
  }

  /** @helper */
  function MM_getEvents() {
    return MM_getApi()?.events || null;
  }

  /** @helper */
  function CHUB_getMiniMapNavSetting() {
    try {
      const raw = localStorage.getItem(KEY_.CHUB_STATE_HUB_V1);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      const val = parsed?.minimap?.mmNav;
      return (typeof val === 'boolean') ? val : true;
    } catch {
      return true;
    }
  }

  /** @helper */
  function MM_isReady() {
    if (W.H2O_MINIMAP_READY === true) return true;
    const v = MM_getVault();
    if (v?.state?.didEverBuildButtons) return true;
    try {
      const sh = TOPW.H2O_MM_SHARED?.get?.();
      const ui = sh?.api?.ui || TOPW.H2O_MM_SHARED_UI;
      if (ui?.getRefs?.()?.panel) return true;
    } catch {}
    if (document.querySelector('[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"]')) return true;
    return false;
  }

  /** @helper */
  function MM_evt(nameFallback) {
    const ev = MM_getEvents();
    return String(ev?.[nameFallback] || EV_FALLBACK_[nameFallback] || '');
  }

  /** @helper */
  function MM_nav_resolveAnswerEl(target) {
    if (!target) return null;
    if (target && target.nodeType === 1) return target;
    const id = String(target || '').trim();
    if (!id) return null;
    try {
      const esc = (window.CSS?.escape) ? CSS.escape(id) : id.replace(/"/g, '\\"');
      const found = (
        document.querySelector(`[data-message-id="${esc}"]`) ||
        document.querySelector(`[data-cgxui-id="${esc}"]`) ||
        document.querySelector(`[data-h2o-ans-id="${esc}"]`) ||
        document.querySelector(`[data-h2o-core-id="${esc}"]`)
      );
      if (found) return found;
      const core = MM_getCore();
      if (core && typeof core.getTurnList === 'function') {
        const list = core.getTurnList() || [];
        const turn = list.find((t) => {
          const tid = String(t?.turnId || '').trim();
          const aid = String(t?.answerId || '').trim();
          return tid === id || aid === id;
        }) || null;
        if (turn?.el) return turn.el;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** @helper */
  function MM_nav_resolveTurnId(anyId) {
    const id = String(anyId || '').trim();
    if (!id) return '';
    if (id.startsWith('turn:')) return id;
    try {
      const core = MM_getCore();
      if (!core || typeof core.getTurnList !== 'function') return '';
      const list = core.getTurnList() || [];
      const t = list.find((x) => {
        const tid = String(x?.turnId || '').trim();
        const aid = String(x?.answerId || '').trim();
        return tid === id || aid === id;
      }) || null;
      return String(t?.turnId || '').trim();
    } catch {
      return '';
    }
  }

  /** @helper */
  function MM_nav_forceMiniMapVisible(reason = 'nav') {
    try { TOPW.H2O_MM_SHARED_UI?.ensureUI?.(`nav:${reason}:ensure`); } catch {}
    try { TOPW.H2O_MM_SHARED_UI?.setCollapsed?.(false); } catch {}
    try { localStorage.setItem('h2o:prm:cgx:mnmp:ui:collapsed:v1', '0'); } catch {}
  }

  /** @helper */
  function MM_nav_jumpToAnswerId(answerId, opts = {}) {
    const id = String(answerId || '').trim();
    if (!id) return false;
    MM_nav_forceMiniMapVisible('jumpToId');
    const turnId = MM_nav_resolveTurnId(id);
    try {
      const sh = TOPW.H2O_MM_SHARED?.get?.();
      const rt = sh?.api?.rt || TOPW.H2O_MM_SHARED_RT;
      const jumpId = turnId || id;
      if (rt && typeof rt.setActiveTurnId === 'function' && rt.setActiveTurnId(jumpId, 'nav:jump')) {
        if (opts.flash !== false) {
          const flashed = MM_nav_resolveAnswerEl(id);
          if (flashed) {
            try { W.flashAnswer?.(flashed); } catch {}
          }
        }
        return true;
      }
    } catch {}
    const el = MM_nav_resolveAnswerEl(id);
    if (!el) return false;
    const smooth = (opts.smooth !== false);
    try { el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); } catch {}
    if (opts.flash !== false) {
      try { W.flashAnswer?.(el); } catch {}
    }
    try {
      const core = MM_getCore();
      if (core) {
        core.setActive?.(id, 'nav');
        core.centerOn?.(id, { force: true, smooth: true });
        core.updateCounter?.(id);
        core.updateToggleColor?.(id);
      }
    } catch {}
    return true;
  }

  /** @helper */
  function MM_nav_jumpFirst() {
    MM_nav_forceMiniMapVisible('jumpFirst');
    const answers = Array.from(document.querySelectorAll('article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]'));
    if (!answers.length) return false;
    const first = answers[0];
    const id = (
      first.getAttribute?.('data-message-id') ||
      first.getAttribute?.('data-cgxui-id') ||
      first.getAttribute?.('data-h2o-ans-id') ||
      ''
    );
    return MM_nav_jumpToAnswerId(id || first, { smooth: true, flash: true });
  }

  /** @helper */
  function MM_nav_jumpLast() {
    MM_nav_forceMiniMapVisible('jumpLast');
    const answers = Array.from(document.querySelectorAll('article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]'));
    if (!answers.length) return false;
    const last = answers[answers.length - 1];
    const id = (
      last.getAttribute?.('data-message-id') ||
      last.getAttribute?.('data-cgxui-id') ||
      last.getAttribute?.('data-h2o-ans-id') ||
      ''
    );
    return MM_nav_jumpToAnswerId(id || last, { smooth: true, flash: true });
  }

  /** @helper */
  function MM_nav_jumpNextColor(colorName) {
    const key = String(colorName || '').toLowerCase();
    const targets = getColorTargets(key);
    const total = targets.length;
    const state = getOrInitColorState(key);
    if (!state || !total) {
      if (state) {
        state.totalCount = 0;
        state.rotationIndex = 0;
        state.lastNavTurnId = null;
      }
      return false;
    }

    const activeTurnId = String(getActiveTurnId() || S.lastKnownActiveTurnId || '').trim();
    if (activeTurnId) S.lastKnownActiveTurnId = activeTurnId;
    const isIdleForThisColor = !state.lastNavTurnId || String(activeTurnId) !== String(state.lastNavTurnId);
    const prevK = Number(state.rotationIndex || 0);
    const nextK = isIdleForThisColor ? 1 : ((prevK % total) + 1);
    const nextIdx = nextK - 1;
    const target = targets[nextIdx] || targets[0];
    const targetAnswerId = String(target?.answerId || '').trim();
    if (!targetAnswerId) return false;

    const ok = MM_nav_jumpToAnswerId(targetAnswerId, { smooth: true, flash: true });
    if (!ok) return false;

    const targetTurnId = String(target?.turnId || MM_nav_resolveTurnId(targetAnswerId) || '').trim();
    state.totalCount = total;
    state.rotationIndex = nextK;
    state.lastNavTurnId = targetTurnId || null;
    state.lastUsedAt = Date.now();
    if (targetTurnId) S.lastKnownActiveTurnId = targetTurnId;
    return true;
  }

  /** @helper */
  function MM_installNavBridge() {
    VAULT.api = VAULT.api || Object.create(null);
    VAULT.api.nav = VAULT.api.nav || Object.create(null);
    VAULT.api.nav.forceVisible = MM_nav_forceMiniMapVisible;
    VAULT.api.nav.jumpToId = MM_nav_jumpToAnswerId;
    VAULT.api.nav.jumpFirst = MM_nav_jumpFirst;
    VAULT.api.nav.jumpLast = MM_nav_jumpLast;
    VAULT.api.nav.jumpNextColor = MM_nav_jumpNextColor;
    VAULT.api.nav.flashAnswer = (elOrId) => {
      const el = MM_nav_resolveAnswerEl(elOrId);
      if (!el) return false;
      try { W.flashAnswer?.(el); } catch {}
      return true;
    };

    const mmVault = MM_getVault();
    if (!mmVault) return false;
    mmVault.api = mmVault.api || Object.create(null);
    mmVault.api.mm = mmVault.api.mm || Object.create(null);
    mmVault.api.mm.nav = mmVault.api.mm.nav || Object.create(null);
    const nav = mmVault.api.mm.nav;
    nav.ping = nav.ping || (() => ({ ok: true, owner: '1A3' }));
    nav.jumpToId = MM_nav_jumpToAnswerId;
    nav.jumpFirst = MM_nav_jumpFirst;
    nav.jumpLast = MM_nav_jumpLast;
    nav.jumpNextColor = MM_nav_jumpNextColor;
    nav.flashAnswer = VAULT.api.nav.flashAnswer;
    return true;
  }

  /* ──────────── 5) Inline HL cache for counters (read-only) ──────────── */

  let __inlineCache = VAULT.state.inlineCache || (VAULT.state.inlineCache = { raw: null, map: null });

  /** @helper */
  function UTIL_disk_get(canonKey) {
    try { return localStorage.getItem(canonKey); }
    catch { return null; }
  }

  /** @helper */
  function readInlineHLMapCached() {
    const raw = UTIL_disk_get(KEY_.INLINE_DOTS_CANON) || '';
    if (raw === __inlineCache.raw && __inlineCache.map) return __inlineCache.map;

    const out = Object.create(null); // msgId -> Set(colors)
    try {
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
          for (const x of data) {
            const mid = x?.msgId;
            const col = x?.color;
            if (!mid || !col) continue;
            const k = String(mid);
            (out[k] ||= new Set()).add(String(col).toLowerCase());
          }
        } else {
          for (const [mid, arr] of Object.entries(data)) {
            if (!mid) continue;
            for (const x of (arr || [])) {
              const col = x?.color;
              if (!col) continue;
              const k = String(mid);
              (out[k] ||= new Set()).add(String(col).toLowerCase());
            }
          }
        }
      }
    } catch {}

    __inlineCache.raw = raw;
    __inlineCache.map = out;
    return out;
  }

  /** @helper */
  function invalidateInlineCache() {
    __inlineCache.raw = null;
    __inlineCache.map = null;
  }

  /* ──────────── 6) UI: Style Inject ──────────── */

  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
    ROTOR_STYLE_ID: 'cgxui-rotor-style', // shared id (safe global)
  });

  /** @critical */
  function UI_injectStyleOnce() {
    if (document.getElementById(CSS_.STYLE_ID)) return;

    const st = document.createElement('style');
    st.id = CSS_.STYLE_ID;
    st.textContent = `
      .cgxui-nav-box,
      .cgxui-nav-box-right{
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .cgxui-nav-btn{
        outline: none !important;
      }
      .cgxui-nav-wheel-mask{
        overflow: hidden;
      }
      .cgxui-nav-wheel{
        will-change: transform;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
    CLEANUP.add(() => { try { st.remove(); } catch {} });
  }

  /** @critical */
  function UI_ensureRotorStyleOnce() {
    if (document.getElementById(CSS_.ROTOR_STYLE_ID)) return;

    const st = document.createElement('style');
    st.id = CSS_.ROTOR_STYLE_ID;
    st.textContent = `
      .cgxui-nav-box.rotor-next .cgxui-nav-btn {
        animation: cgxui-rotor-next 0.38s cubic-bezier(0.22, 0.61, 0.25, 1);
      }
      .cgxui-nav-box.rotor-prev .cgxui-nav-btn {
        animation: cgxui-rotor-prev 0.38s cubic-bezier(0.22, 0.61, 0.25, 1);
      }

      @keyframes cgxui-rotor-next {
        0%   { transform: translateX(22px); opacity: 0; }
        45%  { transform: translateX(-4px); opacity: 1; }
        100% { transform: translateX(0);    opacity: 1; }
      }

      @keyframes cgxui-rotor-prev {
        0%   { transform: translateX(-22px); opacity: 0; }
        45%  { transform: translateX(4px);   opacity: 1; }
        100% { transform: translateX(0);     opacity: 1; }
      }
    `;
    (document.head || document.documentElement).appendChild(st);
    CLEANUP.add(() => { try { st.remove(); } catch {} });
  }

  /* ──────────── 7) UI: Containers ──────────── */

  const S = VAULT.state;

  /** @helper */
  function UI_makeBox(selClass, uiToken) {
    let el = document.querySelector(`.${selClass}[${ATTR_.CGX_OWNER}="${SkID}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = selClass;
      el.setAttribute(ATTR_.CGX_OWNER, SkID);
      el.setAttribute(ATTR_.CGX_UI, uiToken);
      document.body.appendChild(el);
      CLEANUP.add(() => { try { el.remove(); } catch {} });
    }
    return el;
  }

  /** @helper */
  function UI_applyBaseBoxStyles(navBoxEl, navBoxLeft, navBoxRight) {
    navBoxEl.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      overflow: visible;
      box-sizing: border-box;
      pointer-events: auto;
    `;

    navBoxLeft.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 28px;
      box-sizing: border-box;
      pointer-events: auto;
    `;

    navBoxRight.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 28px;
      box-sizing: border-box;
      pointer-events: auto;
    `;
  }

  /* ──────────── 8) UI: Button Factory ──────────── */

  let navHoverLock = false;

  /** @helper */
  function createMatteNavBtn(bg, title, onClick, cgxUi = null) {
    const btn = document.createElement('button');
    btn.classList.add('cgxui-nav-btn');
    btn.setAttribute(ATTR_.CGX_OWNER, SkID);
    if (cgxUi) btn.setAttribute(ATTR_.CGX_UI, String(cgxUi));

    const matte = `linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.1)), ${bg}`;

    btn.style.cssText = `
      width: 28px;
      min-width: 28px;
      max-width: 28px;
      height: 20px;
      min-height: 20px;
      max-height: 20px;
      flex: 0 0 28px;
      flex-shrink: 0;
      align-self: center;
      padding: 0;
      line-height: 20px;
      border-radius: 8px;
      background: ${matte};
      opacity: 0.75;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow:
        inset 0 0 1px rgba(255,255,255,0.05),
        0 2px 5px rgba(0,0,0,0.3);
      font-size: 0;
    `;
    if (title) btn.title = title;

    btn.addEventListener('mouseover', () => {
      if (navHoverLock) return;
      btn.style.opacity = '1';
      btn.style.filter = 'brightness(1.08)';
      btn.style.boxShadow = `
        0 0 6px 2px rgba(255,255,255,0.08),
        0 2px 4px rgba(0,0,0,0.25)
      `;
    });

    btn.addEventListener('mouseout', () => {
      btn.style.opacity = '0.9';
      btn.style.filter = 'none';
      btn.style.boxShadow = `
        inset 0 0 1px rgba(255,255,255,0.05),
        0 2px 5px rgba(0,0,0,0.3)
      `;
    });

    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  /* ──────────── 9) Color Wheel + Roller ──────────── */

  const colorCounters = (S.colorCounters = S.colorCounters || {
    blue:   document.createElement('span'),
    red:    document.createElement('span'),
    green:  document.createElement('span'),
    gold:   document.createElement('span'),
    sky:    document.createElement('span'),
    pink:   document.createElement('span'),
    purple: document.createElement('span'),
    orange: document.createElement('span'),
  });

  const colorButtons = (S.colorButtons = S.colorButtons || Object.create(null));
  const navColorState = (S.navColorState = S.navColorState || Object.create(null));
  const ALL_NAV_COLORS = Object.freeze(['blue','red','green','gold','sky','pink','purple','orange']);

  let currentColorPage = (S.currentColorPage ?? 0);

  /** @helper */
  function getBaseColorHex(name) {
    return NAV_BASE_COLORS[name] || '#777777';
  }

  /** @helper */
  function colorTokenToName(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return '';
    if (NAV_BASE_COLORS[s]) return s;
    const toRgb = (v) => {
      const t = String(v || '').trim().toLowerCase();
      if (!t) return null;
      if (/^#([0-9a-f]{6})$/i.test(t)) {
        return {
          r: parseInt(t.slice(1, 3), 16),
          g: parseInt(t.slice(3, 5), 16),
          b: parseInt(t.slice(5, 7), 16),
        };
      }
      const m = t.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    };
    const rgb = toRgb(s);
    if (!rgb) return '';
    let best = '';
    let bestD = Infinity;
    for (const [name, hex] of Object.entries(NAV_BASE_COLORS)) {
      const crgb = toRgb(hex);
      if (!crgb) continue;
      const d = ((rgb.r - crgb.r) ** 2) + ((rgb.g - crgb.g) ** 2) + ((rgb.b - crgb.b) ** 2);
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  }

  /** @helper */
  function colorValueToName(v) {
    if (!v) return '';
    if (typeof v === 'string') return colorTokenToName(v);
    if (typeof v === 'object') {
      const c =
        v.colorName ?? v.color ?? v.c ?? v.name ?? '';
      return colorTokenToName(c);
    }
    return '';
  }

  /** @helper */
  function anyIdToAnswerId(anyId) {
    const id = String(anyId || '').trim();
    if (!id) return '';
    if (!id.startsWith('turn:')) return id;
    try {
      const core = MM_getCore();
      if (!core || typeof core.getTurnById !== 'function') return id;
      const t = core.getTurnById(id);
      return String(t?.answerId || id).trim();
    } catch {
      return id;
    }
  }

  /** @helper */
  function getOrInitColorState(colorName) {
    const key = String(colorName || '').toLowerCase();
    if (!key) return null;
    const s = navColorState[key] || (navColorState[key] = {
      totalCount: 0,
      rotationIndex: 0,
      lastNavTurnId: null,
      lastUsedAt: 0,
      hasEverHadTargets: false,
    });
    return s;
  }

  /** @helper */
  function getActiveTurnId() {
    try {
      const sh = TOPW.H2O_MM_SHARED?.get?.();
      const rt = sh?.api?.rt || TOPW.H2O_MM_SHARED_RT;
      const activeTurnId = String(rt?.getActiveTurnId?.() || rt?.getActiveId?.() || '').trim();
      if (activeTurnId) return activeTurnId;
    } catch {}
    const activeAnswerId = String(getCurrentAssistantId() || '').trim();
    if (!activeAnswerId) return '';
    return String(MM_nav_resolveTurnId(activeAnswerId) || '').trim();
  }

  /** @helper */
  function getColorTargets(colorName) {
    const answerIds = getIdsForColorInDomOrder(colorName);
    if (!answerIds.length) return [];
    return answerIds.map((answerId) => {
      const aid = String(answerId || '').trim();
      const turnId = String(MM_nav_resolveTurnId(aid) || '').trim();
      return { answerId: aid, turnId };
    });
  }

  /** @helper Collect answer IDs in DOM order for a given color. */
  function getIdsForColorInDomOrder(colorName) {
    const wanted = String(colorName || '').toLowerCase();
    const ids = new Set();

    // 1) Answer-level wash map (canonical) + fallbacks
    let hm =
      (W?.H2O?.MM?.washMap && typeof W.H2O.MM.washMap === 'object') ? W.H2O.MM.washMap :
      (W?.H2O_MM_washMap && typeof W.H2O_MM_washMap === 'object') ? W.H2O_MM_washMap :
      (W?.H2O_MM_highlightMap && typeof W.H2O_MM_highlightMap === 'object') ? W.H2O_MM_highlightMap :
      (W?.highlightMap && typeof W.highlightMap === 'object') ? W.highlightMap :
      {};
    if (!hm || !Object.keys(hm).length) {
      try {
        const washApi = W?.H2O?.MM?.wash;
        if (washApi && typeof washApi.getWashMap === 'function') hm = washApi.getWashMap() || {};
      } catch {}
    }

    for (const [id, c] of Object.entries(hm || {})) {
      const cname = colorValueToName(c);
      if (cname && cname === wanted) ids.add(anyIdToAnswerId(id));
    }

    // 2) Inline highlights (optional totals)
    if (CFG_.COUNT_INCLUDE_INLINE) {
      const inlineMap = readInlineHLMapCached(); // msgId -> Set(colors)
      for (const [mid, set] of Object.entries(inlineMap || {})) {
        if (!set) continue;
        let has = false;
        for (const x of Array.from(set)) {
          if (colorTokenToName(x) === wanted) { has = true; break; }
        }
        if (has) ids.add(anyIdToAnswerId(mid));
      }
    }

    if (!ids.size) return [];

    // 3) Preserve DOM order by scanning answers
    const answers = Array.from(document.querySelectorAll('div[data-message-author-role="assistant"], article[data-message-author-role="assistant"]'));
    return answers
      .map(el => {
        const direct =
          el.getAttribute('data-message-id') ||
          el.getAttribute('data-cgxui-id') ||
          el.getAttribute('data-h2o-ans-id') ||
          el.dataset?.messageId ||
          '';
        if (direct) return direct;
        const host = el.closest?.('[data-message-id],[data-cgxui-id],[data-h2o-ans-id]') || null;
        return (
          host?.getAttribute?.('data-message-id') ||
          host?.getAttribute?.('data-cgxui-id') ||
          host?.getAttribute?.('data-h2o-ans-id') ||
          ''
        );
      })
      .filter(id => id && ids.has(String(id)));
  }

  /** @helper Current assistant answer id (top-most visible). */
  function getCurrentAssistantId() {
    // Prefer canonical runtime/core active turn when available (aligns with MiniMap active state).
    try {
      const sh = TOPW.H2O_MM_SHARED?.get?.();
      const rt = sh?.api?.rt || TOPW.H2O_MM_SHARED_RT;
      const core = MM_getCore();
      const activeTurnId = String(rt?.getActiveTurnId?.() || rt?.getActiveId?.() || '').trim();
      if (activeTurnId && core && typeof core.getTurnById === 'function') {
        const t = core.getTurnById(activeTurnId);
        const aId = String(t?.answerId || '').trim();
        if (aId) return aId;
      }
    } catch {}

    const els = Array.from(document.querySelectorAll('div[data-message-author-role="assistant"], article[data-message-author-role="assistant"]'));
    if (!els.length) return '';
    let bestCrossingTop = null;  // r.top <= 0 < r.bottom
    let bestCrossingTopY = -Infinity;
    let bestBelowTop = null;     // first answer fully below top edge
    let bestBelowTopY = Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0) continue;
      if (r.top >= W.innerHeight) continue;
      if (r.top <= 0 && r.bottom > 0) {
        if (r.top > bestCrossingTopY) {
          bestCrossingTopY = r.top;
          bestCrossingTop = el;
        }
        continue;
      }
      if (r.top >= 0 && r.top < bestBelowTopY) {
        bestBelowTopY = r.top;
        bestBelowTop = el;
      }
    }
    const chosen = bestCrossingTop || bestBelowTop || els[0];
    const direct =
      chosen.getAttribute('data-message-id') ||
      chosen.getAttribute('data-cgxui-id') ||
      chosen.getAttribute('data-h2o-ans-id') ||
      chosen.dataset?.messageId ||
      '';
    if (direct) return direct;
    const host = chosen.closest?.('[data-message-id],[data-cgxui-id],[data-h2o-ans-id]') || null;
    return (
      host?.getAttribute?.('data-message-id') ||
      host?.getAttribute?.('data-cgxui-id') ||
      host?.getAttribute?.('data-h2o-ans-id') ||
      ''
    );
  }

  /** @helper */
  function updateColorNavCounters() {
    const activeTurnId = String(getActiveTurnId() || '').trim();
    if (activeTurnId) S.lastKnownActiveTurnId = activeTurnId;
    const effectiveActiveTurnId = String(S.lastKnownActiveTurnId || '').trim();

    for (const colorName of ALL_NAV_COLORS) {
      const targets = getColorTargets(colorName);
      const total = targets.length;
      const state = getOrInitColorState(colorName);
      if (!state) continue;

      state.totalCount = total;
      if (total > 0) state.hasEverHadTargets = true;
      if (total === 0) {
        state.rotationIndex = 0;
        state.lastNavTurnId = null;
      } else if (!(state.rotationIndex >= 1 && state.rotationIndex <= total)) {
        state.rotationIndex = total;
      }

      const isOnLastNavTurn =
        !!state.lastNavTurnId &&
        !!effectiveActiveTurnId &&
        String(effectiveActiveTurnId) === String(state.lastNavTurnId);

      const shownCurrent = (total === 0) ? 0 : (isOnLastNavTurn ? state.rotationIndex : total);
      const span = colorCounters[colorName];
      if (span) {
        if (total === 0 && !state.hasEverHadTargets) span.textContent = '';
        else span.textContent = `${shownCurrent}/${total}`;
      }
    }
  }

  /** @helper */
  function applyWheelTransform(navWheelMask, navWheel) {
    const btnSample = navWheel.querySelector('.cgxui-nav-btn');
    if (!btnSample) return;

    const btnRect = btnSample.getBoundingClientRect();
    const btnWidth = Math.max(28, btnRect.width || 0);
    const gap = 6;

    const strideWidth = (btnWidth * 4) + (gap * 3);
    const windowWidth = strideWidth + 5;

    navWheelMask.style.width = windowWidth + 'px';
    navWheelMask.style.flex = `0 0 ${windowWidth}px`;

    const offsetX = -(currentColorPage * strideWidth);
    navWheel.style.transform = `translateX(${offsetX}px)`;
  }

  /** @helper */
  function buildNavRoller(navRoller) {
    const totalPages = COLOR_PAGES.length;

    navRoller.innerHTML = '';
    if (totalPages <= 1) return;

    for (let i = 0; i < totalPages; i++) {
      const isActive = (i === currentColorPage);
      const tick = document.createElement('div');
      tick.dataset.page = String(i);

      Object.assign(tick.style, {
        width: '5px',
        height: '5px',
        borderRadius: '999px',
        cursor: 'pointer',
        boxSizing: 'border-box',
        background: isActive ? 'rgba(210,210,210,0.78)' : 'transparent',
        border: '1px solid rgba(185,185,185,0.55)',
        opacity: isActive ? '0.92' : '0.42',
        transition: 'opacity 160ms ease, transform 220ms cubic-bezier(0.22, 0.61, 0.25, 1), background 180ms ease, border-color 180ms ease',
        transform: isActive ? 'scale(1.05)' : 'scale(1.0)',
        willChange: 'transform, opacity',
      });

      tick.addEventListener('mouseenter', () => {
        tick.style.opacity = '0.85';
        tick.style.transform = isActive ? 'scale(1.08)' : 'scale(1.05)';
      });
      tick.addEventListener('mouseleave', () => {
        tick.style.opacity = isActive ? '0.92' : '0.42';
        tick.style.transform = isActive ? 'scale(1.05)' : 'scale(1.0)';
      });

      tick.addEventListener('click', () => {
        if (currentColorPage === i) return;
        currentColorPage = i;
        S.currentColorPage = i;

        applyWheelTransform(S.navWheelMask, S.navWheel);
        buildNavRoller(S.navRoller);
        updateColorNavCounters();
      });

      navRoller.appendChild(tick);
    }
  }

  /** @critical */
  function UI_buildColorNav(navBoxEl) {
    Object.assign(navBoxEl.style, {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '6px',
      overflow: 'visible',
    });

    const navWheelMask = S.navWheelMask || (() => {
      const el = document.createElement('div');
      el.className = 'cgxui-nav-wheel-mask';
      el.setAttribute(ATTR_.CGX_OWNER, SkID);
      el.setAttribute(ATTR_.CGX_UI, `${SkID}-nav-wheel-mask`);
      navBoxEl.appendChild(el);
      return el;
    })();
    S.navWheelMask = navWheelMask;

    Object.assign(navWheelMask.style, {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'hidden',
      pointerEvents: 'auto',
      paddingRight: '1px',
    });

    const navWheel = S.navWheel || (() => {
      const el = document.createElement('div');
      el.className = 'cgxui-nav-wheel';
      el.setAttribute(ATTR_.CGX_OWNER, SkID);
      el.setAttribute(ATTR_.CGX_UI, `${SkID}-nav-wheel`);
      navWheelMask.appendChild(el);
      return el;
    })();
    S.navWheel = navWheel;

    Object.assign(navWheel.style, {
      display: 'flex',
      flexDirection: 'row',
      gap: '6px',
      margin: '0',
      padding: '0',
      transition: 'transform 0.35s cubic-bezier(0.25, 0.8, 0.35, 1.0)',
      willChange: 'transform',
    });

    const navRoller = S.navRoller || (() => {
      const el = document.createElement('div');
      el.className = 'cgxui-nav-roller';
      el.setAttribute(ATTR_.CGX_OWNER, SkID);
      el.setAttribute(ATTR_.CGX_UI, `${SkID}-nav-roller`);
      navBoxEl.appendChild(el);
      return el;
    })();
    S.navRoller = navRoller;

    Object.assign(navRoller.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      width: '10px',
      flex: '0 0 10px',
      pointerEvents: 'auto',
      userSelect: 'none',
      opacity: '0.82',
      padding: '0',
      marginLeft: '-5px',
    });

    navWheel.innerHTML = '';
    Object.keys(colorButtons).forEach(k => { try { delete colorButtons[k]; } catch {} });

    const flattened = COLOR_PAGES.flat();
    for (const colorName of flattened) {
      const base = getBaseColorHex(colorName);

      const btn = createMatteNavBtn(
        base,
        `Cycle ${colorName} answers`,
        async () => {
          let ok = false;
          try {
            ok = !!MM_nav_jumpNextColor(colorName);
          } catch (e) { ERR('jumpNextColor:local', e); }
          if (!ok) {
            try {
              const nav = MM_getNav();
              if (nav?.jumpNextColor) ok = !!nav.jumpNextColor(colorName);
            } catch (e) { ERR('jumpNextColor:bridge', e); }
          }

          if (ok) {
            try { updateColorNavCounters(); } catch {}
          }
          setTimeout(() => { try { updateColorNavCounters(); } catch {} }, 180);
        }
      );

      btn.style.position = 'relative';

      const span = colorCounters[colorName];
      if (span) {
        Object.assign(span.style, {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '10px',
          fontWeight: '500',
          opacity: '0.7',
          color: 'white',
          textShadow: '0 0 2px rgba(0,0,0,0.5)',
          letterSpacing: '0.3px',
          pointerEvents: 'none',
          userSelect: 'none',
        });
        btn.appendChild(span);
      }

      colorButtons[colorName] = btn;
      navWheel.appendChild(btn);
    }

    applyWheelTransform(navWheelMask, navWheel);
    buildNavRoller(navRoller);

    let wheelDeltaAccum = 0;
    let lastSwitch = 0;
    let navPageAnimLock = false;

    navWheelMask.onwheel = null;
    navWheelMask.addEventListener('wheel', (e) => {
      e.preventDefault();

      const now = performance.now();
      if (navPageAnimLock) return;

      wheelDeltaAccum += e.deltaY;
      if (Math.abs(wheelDeltaAccum) < CFG_.WHEEL_MIN_DELTA) return;

      if (now - lastSwitch < CFG_.WHEEL_THROTTLE_MS) {
        wheelDeltaAccum = 0;
        return;
      }

      const dir = wheelDeltaAccum > 0 ? 1 : -1;
      const pages = COLOR_PAGES.length;

      wheelDeltaAccum = 0;
      lastSwitch = now;

      navPageAnimLock = true;
      navHoverLock = true;

      currentColorPage = (currentColorPage + dir + pages) % pages;
      S.currentColorPage = currentColorPage;

      if (dir > 0) {
        navBoxEl.classList.add('rotor-next');
        setTimeout(() => navBoxEl.classList.remove('rotor-next'), 400);
      } else {
        navBoxEl.classList.add('rotor-prev');
        setTimeout(() => navBoxEl.classList.remove('rotor-prev'), 400);
      }

      applyWheelTransform(navWheelMask, navWheel);
      buildNavRoller(navRoller);
      updateColorNavCounters();

      setTimeout(() => {
        navPageAnimLock = false;
        navHoverLock = false;
      }, 420);
    }, { passive: false });
  }

  /* ──────────── 10) Up/Down Nav Buttons ──────────── */

  /** @critical */
  function UI_buildScrollPair(navBoxLeft) {
    navBoxLeft.innerHTML = '';

    if (!CFG_.ENABLE_SCROLL_PAIR_BUTTONS) {
      return;
    }

    const btnUp = createMatteNavBtn(
      'linear-gradient(145deg, #8E8E8E, #606060)',
      'Scroll to first answer',
      () => { try { MM_getNav()?.jumpFirst?.(); } catch (e) { ERR('jumpFirst', e); } },
      `${SkID}-nav-up`
    );

    const btnDown = createMatteNavBtn(
      'linear-gradient(145deg, #6E6E6E, #4A4A4A)',
      'Scroll to last answer',
      () => { try { MM_getNav()?.jumpLast?.(); } catch (e) { ERR('jumpLast', e); } },
      `${SkID}-nav-down`
    );

    for (const [btn, arrow] of [[btnUp, '↑'], [btnDown, '↓']]) {
      btn.textContent = arrow;
      Object.assign(btn.style, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        color: 'rgba(240,240,240,0.9)',
        letterSpacing: '0.3px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
      });
    }

    navBoxLeft.append(btnUp, btnDown);
  }

  /* ──────────── 11) Layout pinning to input ──────────── */
  let roAnchor = null;
  let moAnchor = null;
  let lastAnchorEl = null;
  let __layoutTick = false;
  let __followFrames = 0;

  /** @helper */
  function detachAnchorObservers() {
    try { roAnchor?.disconnect?.(); } catch {}
    try { moAnchor?.disconnect?.(); } catch {}
    roAnchor = null;
    moAnchor = null;
    lastAnchorEl = null;
  }

  /** @helper */
  function UTIL_unionRect(rects) {
    const xs = [], ys = [], x2 = [], y2 = [];
    for (const r of (rects || [])) {
      if (!r) continue;
      if (!isFinite(r.left) || !isFinite(r.top) || !isFinite(r.right) || !isFinite(r.bottom)) continue;
      if (r.width === 0 && r.height === 0) continue;
      xs.push(r.left); ys.push(r.top); x2.push(r.right); y2.push(r.bottom);
    }
    if (!xs.length) return null;
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...x2);
    const bottom = Math.max(...y2);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  /** @helper */
  function UTIL_rectArea(r) {
    if (!r) return 0;
    return Math.max(0, Number(r.width) || 0) * Math.max(0, Number(r.height) || 0);
  }

  /** @helper */
  function UTIL_stabilizeAnchorRect(r) {
    if (!r) return null;

    const left = Number(r.left);
    const top = Number(r.top);
    const right = Number(r.right);
    const bottom = Number(r.bottom);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return r;
    }

    const width = Math.max(0, Number(r.width) || (right - left));
    const rawHeight = Math.max(0, bottom - top);
    const maxAnchorHeight = Math.max(
      CFG_.ANCHOR_MIN_PX,
      Math.min(CFG_.ANCHOR_MAX_PX, Math.round(W.innerHeight * CFG_.ANCHOR_MAX_VH))
    );

    if (rawHeight <= maxAnchorHeight + 1) {
      return { left, top, right, bottom, width, height: rawHeight };
    }

    const clampedTop = Math.max(0, bottom - maxAnchorHeight);
    return {
      left,
      top: clampedTop,
      right,
      bottom,
      width,
      height: Math.max(0, bottom - clampedTop),
    };
  }

  /** @helper */
  function UTIL_getComposerAnchor(anchorHost) {
    const ta = UTIL_findComposerTextarea();
    const bestSurface = UTIL_pickComposerSurface();
    const surface =
      bestSurface ||
      ta?.closest?.('[data-composer-surface="true"]') ||
      anchorHost?.querySelector?.('[data-composer-surface="true"]') ||
      anchorHost?.closest?.('[data-composer-surface="true"]') ||
      null;

    if (surface && UTIL_isElementVisible(surface)) {
      const rectSurface = surface.getBoundingClientRect?.();
      if (rectSurface && rectSurface.width > 0 && rectSurface.height > 0) {
        return { el: surface, rect: rectSurface };
      }
    }

    const parent = anchorHost?.parentElement || null;

    const rectHost = anchorHost?.getBoundingClientRect?.();
    const rectTa   = ta?.getBoundingClientRect?.();
    const rectPar  = parent?.getBoundingClientRect?.();

    const hostArea = UTIL_rectArea(rectHost);
    const parArea = UTIL_rectArea(rectPar);

    const parentCanAnchor =
      !!rectHost &&
      !!rectPar &&
      rectPar.width >= (rectHost.width * 0.9) &&
      rectPar.width <= (rectHost.width * 1.15) &&
      rectPar.height <= Math.max(rectHost.height * 1.9, rectHost.height + 120) &&
      parArea <= Math.max(hostArea * 2.2, hostArea + 15000);

    const rawRect = parentCanAnchor
      ? UTIL_unionRect([rectHost, rectTa, rectPar])
      : UTIL_unionRect([rectHost, rectTa]);
    const stableRect = UTIL_stabilizeAnchorRect(rawRect || rectHost || rectTa || rectPar || null);

    return {
      el: parentCanAnchor ? parent : anchorHost,
      rect: stableRect,
    };
  }

  /** @helper */
  function UTIL_anchorIsVisible(r) {
    if (!r) return false;
    if (r.width === 0 || r.height === 0) return false;
    if (r.bottom <= 0 || r.top >= W.innerHeight) return false;
    if (r.right <= 0 || r.left >= W.innerWidth) return false;
    return true;
  }

  /** @helper */
  function UTIL_followFor(frames = 12) {
    __followFrames = Math.max(__followFrames, frames | 0);
    scheduleLayout(S.navBoxEl, S.navBoxLeft, S.navBoxRight);
  }

  /** @helper */
  function scheduleLayout(navBoxEl, navBoxLeft, navBoxRight) {
    if (__layoutTick) return;
    __layoutTick = true;

    requestAnimationFrame(() => {
      __layoutTick = false;

      const form = UTIL_findComposerForm() || VAULT.state._composerFormHint || null;
      const ta = UTIL_findComposerTextarea();
      const anchorHost = form || ta?.closest?.('form') || ta || null;
      positionNavBox(navBoxEl, anchorHost);
      positionNavBoxLeft(navBoxLeft, anchorHost);
      positionNavBoxRight(navBoxRight, anchorHost);

      if (__followFrames > 0) {
        __followFrames--;
        scheduleLayout(navBoxEl, navBoxLeft, navBoxRight);
      }
    });
  }

  /** @helper */
  function attachAnchorObservers(anchorEl) {
    if (!anchorEl || anchorEl === lastAnchorEl) return;

    detachAnchorObservers();

    roAnchor = new ResizeObserver(() => UTIL_followFor(14));
    CLEANUP.add(() => { try { roAnchor?.disconnect?.(); } catch {} });

    try { roAnchor.observe(anchorEl); } catch {}
    try {
      const ta = UTIL_findComposerTextarea();
      if (ta && ta !== anchorEl) roAnchor.observe(ta);
    } catch {}

    moAnchor = new MutationObserver(() => UTIL_followFor(10));
    CLEANUP.add(() => { try { moAnchor?.disconnect?.(); } catch {} });

    try { moAnchor.observe(anchorEl, { attributes: true, attributeFilter: ['class','style'] }); } catch {}
    try {
      const ta = UTIL_findComposerTextarea();
      if (ta && ta !== anchorEl) moAnchor.observe(ta, { attributes: true, attributeFilter: ['class','style'] });
    } catch {}

    lastAnchorEl = anchorEl;
  }

  /** @helper */
  function positionNavBox(navBoxEl, anchorHost) {
    if (!anchorHost) {
      navBoxEl.style.display = 'none';
      detachAnchorObservers();
      return;
    }

    const anchor = UTIL_getComposerAnchor(anchorHost);
    const r = anchor?.rect || null;

    if (!UTIL_anchorIsVisible(r)) {
      navBoxEl.style.display = 'none';
      detachAnchorObservers();
      return;
    }

    navBoxEl.style.display = 'flex';
    navBoxEl.style.left = 'auto';

    const vvTop = W.visualViewport?.offsetTop || 0;
    const vvLeft = W.visualViewport?.offsetLeft || 0;

    const topPxRaw = (r.top + vvTop - CFG_.NAV_GAP_Y) + CFG_.NAV_CLUSTER_SHIFT_Y;
    const safeTopPx = Math.max(0, vvTop + CFG_.SAFE_TOP_PX);
    const topPx = Math.max(safeTopPx, topPxRaw);
    const rightPx = Math.max(0, (W.innerWidth - (r.right + vvLeft) + CFG_.NAV_GAP_X) + CFG_.NAV_CLUSTER_SHIFT_X);

    navBoxEl.style.setProperty('top', `${topPx}px`, 'important');
    navBoxEl.style.setProperty('right', `${rightPx}px`, 'important');

    attachAnchorObservers(anchor?.el || anchorHost);
  }

  /** @helper */
  function positionNavBoxLeft(navBoxLeft, anchorHost) {
    if (!S.showScrollPair || !CFG_.ENABLE_SCROLL_PAIR_BUTTONS) {
      navBoxLeft.style.display = 'none';
      return;
    }

    if (!anchorHost) {
      navBoxLeft.style.display = 'none';
      return;
    }

    const anchor = UTIL_getComposerAnchor(anchorHost);
    const r = anchor?.rect || null;

    if (!UTIL_anchorIsVisible(r)) {
      navBoxLeft.style.display = 'none';
      return;
    }

    navBoxLeft.style.display = 'flex';
    navBoxLeft.style.right = 'auto';

    const NAV_SCROLL_GAP_Y = -6;
    const NAV_SCROLL_GAP_X = 10;

    const vvTop = W.visualViewport?.offsetTop || 0;
    const vvLeft = W.visualViewport?.offsetLeft || 0;

    const bw = navBoxLeft.getBoundingClientRect().width || 28;
    const topPxRaw = (r.top + vvTop) - NAV_SCROLL_GAP_Y;
    const safeTopPx = Math.max(0, vvTop + CFG_.SAFE_TOP_PX);
    const topPx = Math.max(safeTopPx, topPxRaw);
    const leftPxRaw = (r.left + vvLeft) - NAV_SCROLL_GAP_X - bw;
    const leftPx = Math.min(W.innerWidth - bw - 6, Math.max(6, leftPxRaw));

    navBoxLeft.style.setProperty('top', `${topPx}px`, 'important');
    navBoxLeft.style.setProperty('left', `${leftPx}px`, 'important');
  }

  /** @helper */
  function positionNavBoxRight(navBoxRight, anchorHost) {
    if (!S.showScrollPair) {
      navBoxRight.style.display = 'none';
      return;
    }

    if (!anchorHost) {
      navBoxRight.style.display = 'none';
      return;
    }

    const anchor = UTIL_getComposerAnchor(anchorHost);
    const r = anchor?.rect || null;

    if (!UTIL_anchorIsVisible(r)) {
      navBoxRight.style.display = 'none';
      return;
    }

    navBoxRight.style.display = 'flex';

    const NAV_SCROLL_GAP_Y   = -6;
    const NAV_SCROLL_GAP_X   = 10;
    const NAV_SCROLL_SHIFT_X = 0;

    navBoxRight.style.right = 'auto';

    const vvTop = W.visualViewport?.offsetTop || 0;
    const vvLeft = W.visualViewport?.offsetLeft || 0;

    const topPxRaw = (r.top + vvTop) - NAV_SCROLL_GAP_Y;
    const safeTopPx = Math.max(0, vvTop + CFG_.SAFE_TOP_PX);
    const topPx = Math.max(safeTopPx, topPxRaw);
    const leftPxRaw = (r.right + vvLeft) + NAV_SCROLL_GAP_X + NAV_SCROLL_SHIFT_X;

    const bw = navBoxRight.getBoundingClientRect().width || 28;
    const leftPx = Math.min(W.innerWidth - bw - 6, Math.max(6, leftPxRaw));

    navBoxRight.style.setProperty('top', `${topPx}px`, 'important');
    navBoxRight.style.setProperty('left', `${leftPx}px`, 'important');
  }

  /** @critical */
  function CORE_bindLayoutReactions() {
    if (S.layoutWired) return;
    S.layoutWired = true;

    let tick = false;
    const mo = new MutationObserver(() => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => {
        tick = false;
        scheduleLayout(S.navBoxEl, S.navBoxLeft, S.navBoxRight);
      });
    });
    UTIL_observe(mo, document.body, { childList: true, subtree: true });

    let resizeBurstTimer = 0;
    let resizeBurstUntil = 0;
    const kickResizeBurst = (frames = 16) => {
      resizeBurstUntil = performance.now() + 1100;
      UTIL_followFor(frames);
      if (resizeBurstTimer) return;

      resizeBurstTimer = W.setInterval(() => {
        if (performance.now() > resizeBurstUntil) {
          W.clearInterval(resizeBurstTimer);
          resizeBurstTimer = 0;
          return;
        }
        UTIL_followFor(8);
      }, 70);
    };
    CLEANUP.add(() => {
      if (resizeBurstTimer) {
        W.clearInterval(resizeBurstTimer);
        resizeBurstTimer = 0;
      }
    });

    UTIL_on(W, 'scroll', () => UTIL_followFor(4), { passive: true });
    UTIL_on(W, 'resize', () => kickResizeBurst(20), { passive: true });

    if (W.visualViewport) {
      UTIL_on(W.visualViewport, 'resize', () => kickResizeBurst(24), { passive: true });
      UTIL_on(W.visualViewport, 'scroll', () => UTIL_followFor(12), { passive: true });
    }
  }

  /* ──────────── 12) Sync hooks (MiniMap events + storage) ──────────── */

  /** @critical */
  function CORE_bindSyncHooks() {
    if (S.syncWired) return;
    S.syncWired = true;

    const onSync = () => {
      try { invalidateInlineCache(); } catch {}
      try { updateColorNavCounters(); } catch {}
    };

    function listenDual(ev, fn, opts){
      if (!ev) return;
      UTIL_on(W, ev, fn, opts);
      if (String(ev).startsWith('evt:')) UTIL_on(W, String(ev).slice(4), fn, opts);
    }

    const evReady = MM_evt('MM_READY');
    const evView  = MM_evt('MM_VIEW_CHANGED');
    const evInline = MM_evt('INLINE_CHANGED');
    const evAnswerHL = MM_evt('ANSWER_HL');

    listenDual(evReady, () => { onSync(); scheduleLayout(S.navBoxEl, S.navBoxLeft, S.navBoxRight); }, { passive: true });
    listenDual(evView, () => { onSync(); scheduleLayout(S.navBoxEl, S.navBoxLeft, S.navBoxRight); }, { passive: true });
    listenDual(evInline, () => { onSync(); }, { passive: true });
    if (evAnswerHL) UTIL_on(W, evAnswerHL, () => { onSync(); }, { passive: true });

    // Extra wash-change fallbacks (Answer Wash Engine / older bridges may use these)
    listenDual('evt:h2o:wash:changed', () => { onSync(); }, { passive: true });
    listenDual('evt:h2o:answer:wash',  () => { onSync(); }, { passive: true });

    UTIL_on(W, 'storage', (e) => {
      const k = e?.key || '';
      if (k === KEY_.INLINE_DOTS_CANON) onSync();
      if (k === KEY_.CHUB_STATE_HUB_V1) {
        S.showScrollPair = CHUB_getMiniMapNavSetting();
        scheduleLayout(S.navBoxEl, S.navBoxLeft, S.navBoxRight);
      }
    }, { passive: true });

    UTIL_on(W, EV_.CHUB_CHANGED_V1, (e) => {
      const d = e?.detail || {};
      if (String(d.featureKey || '') !== 'minimap') return;
      if (String(d.optKey || '') !== 'mmNav') return;
      S.showScrollPair = !!d.val;
      scheduleLayout(S.navBoxEl, S.navBoxLeft, S.navBoxRight);
    }, { passive: true });
  }

  /* ──────────── 13) Boot / Dispose ──────────── */

  /** @critical */
  function CORE_boot() {
    if (S.booted) return;
    S.booted = true;

    UI_injectStyleOnce();
    UI_ensureRotorStyleOnce();

    const navBoxEl = (S.navBoxEl = UI_makeBox('cgxui-nav-box', `${SkID}-nav-box`));
    const navBoxLeft = (S.navBoxLeft = UI_makeBox('cgxui-nav-box-left', `${SkID}-nav-box-left`));
    const navBoxRight = (S.navBoxRight = UI_makeBox('cgxui-nav-box-right', `${SkID}-nav-box-right`));
    UI_applyBaseBoxStyles(navBoxEl, navBoxLeft, navBoxRight);

    UI_buildColorNav(navBoxEl);
    UI_buildScrollPair(navBoxLeft);
    S.showScrollPair = CHUB_getMiniMapNavSetting();

    updateColorNavCounters();

    CORE_bindLayoutReactions();
    CORE_bindSyncHooks();
    MM_installNavBridge();

    scheduleLayout(navBoxEl, navBoxLeft, navBoxRight);

    LOG('boot', { ready: MM_isReady(), hasBridge: !!MM_getNav()?.ping });
  }

  /** @critical */
  function CORE_dispose() {
    try { detachAnchorObservers(); } catch {}
    try { CLEANUP.run(); } catch {}
    S.booted = false;
    S.layoutWired = false;
    S.syncWired = false;
  }

  VAULT.api.boot = CORE_boot;
  VAULT.api.dispose = CORE_dispose;

  CORE_boot();
})();
