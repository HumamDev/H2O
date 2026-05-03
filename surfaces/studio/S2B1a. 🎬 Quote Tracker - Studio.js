// ==UserScript==
// @h2o-id             s2b1a.quote.tracker.studio
// @name               S2B1a. 🎬 Quote Tracker - Studio
// @namespace          H2O.Premium.CGX.quote.tracker
// @author             HumamDev
// @version            1.0.7
// @revision           001
// @build              260304-102754
// @description        Quote Tracker (H2O): wraps replied-content quote into a dedicated box and resolves origin answer index (composer + click + text match). Hard-linked with 2A QWrapper via stable qwrap id + mirrored storage.
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* =============================================================================
   * 🧱 H2O Module Standard — Contract (v2.0) — Stage 1: Foundation/Mechanics
   * Goal: keep Quote UI inside QWrapper AND keep the full origin-solver system.
   * ============================================================================= */

  /* ───────────────────────────── 0) IDENTITY ───────────────────────────── */

  /** @core Identity + namespace anchors (Contract v2.0) */
  const TOK = 'QT';
  const PID = 'qttrckr';
  const CID = 'QTRACKER';
  const SkID = 'qtrk';

  const MODTAG = 'QuoteTracker';
  const MODICON = '💬';
  const EMOJI_HDR = '🟧';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  // Aliases (readability only)
  const BrID = PID;
  const DsID = PID;

  /* ───────────────────────────── 1) REGISTRIES ───────────────────────────── */

  /** @core */
  const SEL_QT_ = Object.freeze({
    USER_MSG:   '[data-message-author-role="user"]',
    ASSIST_MSG: '[data-message-author-role="assistant"]',
    ANY_MSG:    '[data-message-author-role="assistant"],[data-message-author-role="user"]',
    CONV_TURNS: '[data-testid="conversation-turns"]',
    CONV_TURN:  '[data-testid="conversation-turn"]',
    MAIN:       'main',

    // QWrapper wrapper
    QWRAP: '.cgxui-qswr',

    // quote box ui
    QBOX:     '.cgxui-qswr-quoteBox',
    QTITLE:   '.cgxui-qswr-quoteTitle',
    QBOX_BTN: '.cgxui-qswr-quoteBox button, .cgxui-qswr-quoteBox [role="button"]',

    // quoted node (chatgpt composer "replied content")
    MARKDOWN_SCOPE: '.markdown, .prose, [class*="markdown"], [class*="prose"]',

    // highlight nodes (quote jump)
    HL_SEL: '[data-start][data-end][style*="background-color"]',

    // composer chip
    CHIP_BTN:        'form button[aria-label="More about replied content"]',
    CHIP_BTN_THREAD: '#thread-bottom-container form button[aria-label="More about replied content"]',
    CHIP_P_FALLBACK: 'form button p.line-clamp-3, form button p[class*="line-clamp"], form [class*="composer"] button p',

    // wrapper id find
    WRAP_BY_ID: (idEsc) => `.cgxui-qswr[data-ho-qwrap-id="${idEsc}"], .cgxui-qswr[data-h2o-qwrap-id="${idEsc}"]`,
  });

  const ATTR_QT_ = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UI:    'data-cgxui',
    STATE: 'data-cgxui-state',

    // legacy compat
    DONE:   'data-ho-qwrap-done',
    IGNORE: 'data-ho-ignore',
  });

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const VER_MAJOR = '1';

  // QWrap disk namespace (source of truth for quote prefs + origin map)
  const DsID_QWRAP = 'qstnwrppr';
  const NS_DISK_QWRAP = `h2o:${SUITE}:${HOST}:${DsID_QWRAP}`;

  const KEY_QT_ = Object.freeze({
    // prefs (mirror QWrap keys)
    QUOTE_MODE_NEW: `${NS_DISK_QWRAP}:cfg:quote_mode:v${VER_MAJOR}`,
    QUOTE_MODE_OLD: 'ho:qwrap:quoteMode',

    // origin map (mirror QWrap keys)
    ORIGIN_MAP_NEW: `${NS_DISK_QWRAP}:cache:quote_origin_map:v${VER_MAJOR}`,
    ORIGIN_MAP_OLD: 'ho:qwrap:quoteOriginMap',

    MIG_QUOTE_MODE: `${NS_DISK_QWRAP}:migrate:quote_mode:v1`,
    MIG_ORIGIN_MAP: `${NS_DISK_QWRAP}:migrate:quote_origin_map:v1`,

    // init guards
    INIT_BOOT:   `H2O:${TOK}:${PID}:booted`,
    INIT_ORIGIN: `H2O:${TOK}:${PID}:originInstalled`,
    INIT_CLICK:  `H2O:${TOK}:${PID}:clickInstalled`,
  });

  const EV_QT_ = Object.freeze({
    // emitted by QWrapper (our listener)
    WRAPPED: 'h2o:qwrap:wrapped',

    // internal / fallback
    QUOTE_PENDING: 'h2o:quote:pending',
    CHIP_CHANGED:  'h2o:quote:chip',
  });

  const CFG_QT_ = Object.freeze({
    QUOTE_MODE_INSIDE: 'inside',
    QUOTE_MODE_OUTSIDE: 'outside',

    ORIGIN_MODE_TURN: 'turn',

    IDLE_TIMEOUT_MS: 200,
    FALLBACK_DELAY_MS: 30,
    MO_MAX_NODE_CHILDREN: 24,
    BOOT_DELAY_MS: 0,   // ✅ make boot immediate (removes “native → styled” lag)

  });

  const RETRY_QT_DELAYS_ = Object.freeze([120, 300, 700, 1400]);

  /* ───────────────────────────── 2) VAULT + BOUNDED DIAG ───────────────────────────── */

  /** @core */
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

  /* ───────────────────────────── 3) STORAGE WRAPPER (legacy-safe) ───────────────────────────── */

  /** @helper */
  const STORE_QT_storage = (() => {
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
    const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

    const migOnce = (newKey, oldKey, migKey) => {
      try { if (lsGet(migKey) === '1') return; } catch {}
      try {
        const vNew = lsGet(newKey);
        if (vNew == null || vNew === '') {
          const vOld = lsGet(oldKey);
          if (vOld != null && vOld !== '') lsSet(newKey, vOld);
        }
      } catch {}
      try { lsDel(oldKey); } catch {}
      try { lsSet(migKey, '1'); } catch {}
    };

    const read = (newKey, oldKey, migKey, fallbackVal) => {
      migOnce(newKey, oldKey, migKey);
      const vNew = lsGet(newKey);
      if (vNew != null && vNew !== '') return vNew;
      return fallbackVal;
    };

    const write = (newKey, oldKey, migKey, val) => {
      migOnce(newKey, oldKey, migKey);
      lsSet(newKey, val);
    };

    const readJSON = (newKey, oldKey, migKey, fallbackObj) => {
      try {
        const raw = read(newKey, oldKey, migKey, '');
        if (!raw) return fallbackObj;
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : fallbackObj;
      } catch {
        return fallbackObj;
      }
    };

    const writeJSON = (newKey, oldKey, migKey, obj) => {
      try {
        write(newKey, oldKey, migKey, JSON.stringify(obj || {}));
      } catch {}
    };

    return Object.freeze({ read, write, readJSON, writeJSON });
  })();

  /* ───────────────────────────── 4) QUOTE MODE API (mirror QWrap) ───────────────────────────── */

  /** @helper */
  function STORE_QT_getQuoteMode() {
    const m = STORE_QT_storage.read(KEY_QT_.QUOTE_MODE_NEW, KEY_QT_.QUOTE_MODE_OLD, KEY_QT_.MIG_QUOTE_MODE, CFG_QT_.QUOTE_MODE_INSIDE) || CFG_QT_.QUOTE_MODE_INSIDE;
    return (m === CFG_QT_.QUOTE_MODE_OUTSIDE) ? CFG_QT_.QUOTE_MODE_OUTSIDE : CFG_QT_.QUOTE_MODE_INSIDE;
  }

  /** @critical */
  function STORE_QT_setQuoteMode(mode) {
    const m = (mode === CFG_QT_.QUOTE_MODE_OUTSIDE) ? CFG_QT_.QUOTE_MODE_OUTSIDE : CFG_QT_.QUOTE_MODE_INSIDE;
    STORE_QT_storage.write(KEY_QT_.QUOTE_MODE_NEW, KEY_QT_.QUOTE_MODE_OLD, KEY_QT_.MIG_QUOTE_MODE, m);
    DOM_QT_applyQuoteModeToExisting();
    scheduleScan('setQuoteMode');
    scheduleResolve('setQuoteMode');
  }

  // Keep compatibility: scripts historically call H2O_QWRAP.getQuoteMode/setQuoteMode
  W.H2O_QWRAP = W.H2O_QWRAP || {};
  if (typeof W.H2O_QWRAP.getQuoteMode !== 'function') W.H2O_QWRAP.getQuoteMode = STORE_QT_getQuoteMode;
  if (typeof W.H2O_QWRAP.setQuoteMode !== 'function') W.H2O_QWRAP.setQuoteMode = STORE_QT_setQuoteMode;

  MOD.api.getQuoteMode = STORE_QT_getQuoteMode;
  MOD.api.setQuoteMode = STORE_QT_setQuoteMode;

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
  function UTIL_canonQuoteText(s) {
    return UTIL_norm(s)
      .replace(/^[\s>“"']+/g, '')
      .replace(/[\s”"'.!?:;]+$/g, '')
      .trim();
  }

  /** @helper */
  function UTIL_qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  /** @helper */
  function UTIL_cssEscape(val) {
    const s = String(val ?? '');
    return (W.CSS && typeof W.CSS.escape === 'function') ? W.CSS.escape(s) : s.replace(/"/g, '\\"');
  }

  function UTIL_isStudioMode() {
    try {
      if (window.H2O_STUDIO_MODE) return true;
      if (document.documentElement?.dataset?.h2oStudioMode === '1') return true;
      if (document.body?.dataset?.h2oStudioMode === '1') return true;
    } catch {}
    return false;
  }

  function DOM_QT_getStudioConversationRoot() {
    try {
      return (
        document.querySelector('[data-h2o-studio-reader="1"] [data-testid="conversation-turns"]') ||
        document.querySelector('.cgScroll[data-testid="conversation-turns"]') ||
        document.querySelector('[data-testid="conversation-turns"]')
      );
    } catch {
      return null;
    }
  }

  function DOM_QT_getScanScopeRoot() {
    if (UTIL_isStudioMode()) {
      const root = DOM_QT_getStudioConversationRoot();
      if (root) return root;
    }
    return document;
  }

  /** @helper */
  function BUS_emit(topic, payload) {
    if (W.H2O?.events?.emit) {
      try { W.H2O.events.emit(topic, payload); } catch {}
    } else {
      try { W.dispatchEvent(new CustomEvent(topic, { detail: payload })); } catch {}
    }
  }

  /** @helper */
  function BUS_on(topic, handler) {
    const onBus = !!W.H2O?.events?.on;
    if (onBus) {
      try { W.H2O.events.on(topic, handler); return () => { try { W.H2O.events.off?.(topic, handler); } catch {} }; } catch {}
    }
    const wrap = (e) => handler(e?.detail || e);
    W.addEventListener(topic, wrap);
    return () => W.removeEventListener(topic, wrap);
  }

  /* ───────────────────────────── 6) TURN HELPERS (Core-aware) ───────────────────────────── */

  /** @critical */
  function DOM_QT_turnTotal() {
    return (
      (typeof W.H2O?.turn?.total === 'function' ? W.H2O.turn.total() : 0) ||
      document.querySelectorAll(SEL_QT_.USER_MSG).length ||
      0
    );
  }

  /** @helper */
  function DOM_QT_turnIdxFromAId(aId) {
    if (!aId) return 0;
    return (typeof W.H2O?.turn?.getTurnIndexByAId === 'function')
      ? (W.H2O.turn.getTurnIndexByAId(aId) || 0)
      : 0;
  }

  /** @helper */
  function DOM_QT_turnIdxFromAEl(aEl) {
    if (!aEl) return 0;
    const byEl = W.H2O?.turn?.getTurnIndexByAEl?.(aEl) || 0;
    if (byEl) return byEl;
    const aId = (typeof W.H2O_getAId === 'function') ? W.H2O_getAId(aEl) : null;
    return (aId ? DOM_QT_turnIdxFromAId(aId) : 0) || 0;
  }

  /** @helper */
  function DOM_QT_getPrevAssistantForUserMsg(userMsgEl) {
    const root = DOM_QT_getConversationRoot() || DOM_QT_getScanScopeRoot();
    const all = [...root.querySelectorAll(SEL_QT_.ANY_MSG)];
    const i = all.indexOf(userMsgEl);
    if (i < 0) return null;
    for (let k = i - 1; k >= 0; k--) {
      if (all[k].getAttribute('data-message-author-role') === 'assistant') return all[k];
    }
    return null;
  }

  /** @helper */
  function DOM_QT_findWrapperForUserMsg(userMsgEl) {
    return userMsgEl?.querySelector?.(SEL_QT_.QWRAP) || null;
  }

  /** @helper */
  function DOM_QT_findWrapperByStableId(stableId) {
    if (!stableId) return null;
    const esc = UTIL_cssEscape(stableId);
    return document.querySelector(SEL_QT_.WRAP_BY_ID(esc));
  }

  /** @helper */
  function DOM_QT_findQuoteBoxByStableId(stableId) {
    if (!stableId) return null;
    const sidEsc = UTIL_cssEscape(stableId);
    return (
      document.querySelector(`${SEL_QT_.QBOX}[data-ho-qwrap-for="${sidEsc}"]`) ||
      document.querySelector(`${SEL_QT_.QBOX}[data-h2o-qwrap-for="${sidEsc}"]`) ||
      null
    );
  }

  /** @helper */
  function DOM_QT_getConversationRoot() {
    if (UTIL_isStudioMode()) {
      return DOM_QT_getStudioConversationRoot() || null;
    }
    return (
      document.querySelector(SEL_QT_.CONV_TURNS) ||
      document.querySelector(SEL_QT_.CONV_TURN)?.parentElement ||
      document.querySelector(SEL_QT_.MAIN) ||
      null
    );
  }

  /** @helper */
  function DOM_QT_getComposerRoot() {
    if (UTIL_isStudioMode()) return null;
    return (
      document.querySelector('#thread-bottom-container') ||
      document.querySelector('form') ||
      null
    );
  }

  /** @helper */
  function DOM_QT_collectScanSignalsFromNode(node, out) {
    if (!node || node.nodeType !== 1) return false;
    const el = /** @type {Element} */ (node);

    if (el.matches?.(SEL_QT_.ANY_MSG)) {
      out.add(el);
      return false;
    }

    const childCount = el.childElementCount || 0;
    if (!childCount) return false;
    if (childCount > CFG_QT_.MO_MAX_NODE_CHILDREN) return true;

    const firstMsg = el.querySelector?.(SEL_QT_.ANY_MSG);
    if (!firstMsg) return false;
    out.add(firstMsg);

    const isTurnLike = (
      el.matches?.(SEL_QT_.CONV_TURN) ||
      el.matches?.('.group\\/turn-messages') ||
      el.matches?.('[class~="group/turn-messages"]')
    );
    if (isTurnLike && childCount <= 6) {
      const all = el.querySelectorAll?.(SEL_QT_.ANY_MSG);
      if (all?.length) all.forEach((m) => out.add(m));
    }

    return false;
  }

  /* ───────────────────────────── 7) ORIGIN MAP (shared with QWrap) ───────────────────────────── */

  /** @helper */
  function STORE_QT_loadOriginMap() {
    return STORE_QT_storage.readJSON(KEY_QT_.ORIGIN_MAP_NEW, KEY_QT_.ORIGIN_MAP_OLD, KEY_QT_.MIG_ORIGIN_MAP, {});
  }

  /** @helper */
  function STORE_QT_saveOriginMap(map) {
    STORE_QT_storage.writeJSON(KEY_QT_.ORIGIN_MAP_NEW, KEY_QT_.ORIGIN_MAP_OLD, KEY_QT_.MIG_ORIGIN_MAP, map || {});
  }

  let DOM_lastSelAssistant = null;

  /** @helper */
  function DOM_QT_captureSelectionSource() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const node = sel.focusNode || sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const a  = el?.closest?.(SEL_QT_.ASSIST_MSG);
    if (a) DOM_lastSelAssistant = a;
  }

  /** @critical */
  function DOM_QT_installSelectionTracker() {
    const st = MOD.state;
    if (st.selTrackerInstalled) return;
    st.selTrackerInstalled = true;

    if (UTIL_isStudioMode()) {
      st.cleanup = st.cleanup || [];
      st.cleanup.push(() => {
        st.selTrackerInstalled = false;
      });
      return;
    }

    const OPT_CAPTURE_TRUE = true;
    const OPT_PASSIVE = { passive: true };

    document.addEventListener('pointerdown', DOM_QT_captureSelectionSource, OPT_CAPTURE_TRUE);
    document.addEventListener('selectionchange', DOM_QT_captureSelectionSource);
    document.addEventListener('mouseup', DOM_QT_captureSelectionSource, OPT_PASSIVE);
    document.addEventListener('keyup', DOM_QT_captureSelectionSource, OPT_PASSIVE);

    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      document.removeEventListener('pointerdown', DOM_QT_captureSelectionSource, OPT_CAPTURE_TRUE);
      document.removeEventListener('selectionchange', DOM_QT_captureSelectionSource);
      document.removeEventListener('mouseup', DOM_QT_captureSelectionSource, OPT_PASSIVE);
      document.removeEventListener('keyup', DOM_QT_captureSelectionSource, OPT_PASSIVE);
      st.selTrackerInstalled = false;
    });
  }

  /** @critical */
  function DOM_QT_tryCaptureComposerQuote(root = document) {
    const chipBtn = root.querySelector?.(SEL_QT_.CHIP_BTN) || root.querySelector?.(SEL_QT_.CHIP_BTN_THREAD);

    let rawText = '';
    if (chipBtn) rawText = (chipBtn.innerText || chipBtn.textContent || '');
    else {
      const p = root.querySelector?.(SEL_QT_.CHIP_P_FALLBACK);
      if (!p) return;
      rawText = (p.innerText || p.textContent || '');
    }

    let qCanon = UTIL_canonQuoteText(rawText || '');
    qCanon = qCanon.replace(/[.…]+$/g, '').trim();
    if (!qCanon || qCanon.length < 12) return;
    if (!DOM_lastSelAssistant) return;

    const aEl = DOM_lastSelAssistant;

    const aid =
      (typeof W.H2O_getAId === 'function' ? W.H2O_getAId(aEl) : null) ||
      (W.H2O?.index?.getAId?.(aEl)) ||
      aEl.getAttribute?.('data-message-id') ||
      aEl.dataset?.messageId ||
      null;

    const newIdx = (typeof DOM_QT_turnIdxFromAEl === 'function' ? (DOM_QT_turnIdxFromAEl(aEl) || 0) : 0) || 0;
    const convRoot = DOM_QT_getConversationRoot() || document;
    const maxIdx = DOM_QT_turnTotal() || convRoot.querySelectorAll(SEL_QT_.ASSIST_MSG).length || convRoot.querySelectorAll(SEL_QT_.USER_MSG).length || 0;

    if (!newIdx || newIdx < 1 || (maxIdx && newIdx > maxIdx)) return;

    const map = STORE_QT_loadOriginMap();
    const kCanon = UTIL_hash(qCanon);
    const kRaw   = UTIL_hash(UTIL_norm(rawText || ''));

    function writeKey(key) {
      const old = map[key];
      const oldIdx = Number(old?.tidx ?? old?.idx ?? 0);
      const oldVia = old?.via || '';

      const writeTurn = (patch) => {
        map[key] = {
          ...(old || {}),
          mode: CFG_QT_.ORIGIN_MODE_TURN,
          tidx: newIdx,
          idx: newIdx,
          aid: aid || (old?.aid ?? null),
          ...patch,
          t: Date.now(),
          sample: qCanon.slice(0, 80),
        };
      };

      if (!old) { writeTurn({ via: 'composer', verified: 1, amb: 0 }); return true; }
      if (oldIdx === newIdx) {
        if (!old.verified) { writeTurn({ via: 'composer', verified: 1, fixed: 1, amb: 0 }); return true; }
        return false;
      }

      if (oldVia === 'click' || oldVia === 'click_fix') {
        const idxs = Array.isArray(old.idxs) ? old.idxs.slice() : [];
        if (oldIdx > 0 && !idxs.includes(oldIdx)) idxs.push(oldIdx);
        if (!idxs.includes(newIdx)) idxs.push(newIdx);
        map[key] = { ...old, amb: 1, conflict: 1, idxs, t: Date.now() };
        return true;
      }

      const idxs = Array.isArray(old.idxs) ? old.idxs.slice() : [];
      if (oldIdx > 0 && !idxs.includes(oldIdx)) idxs.push(oldIdx);
      if (!idxs.includes(newIdx)) idxs.push(newIdx);

      writeTurn({
        via: 'composer',
        verified: 1,
        conflict: 1,
        fixed: 1,
        amb: 0,
        idxs,
        prev: oldIdx || null,
      });
      return true;
    }

    const changed = writeKey(kCanon) || writeKey(kRaw);
    if (changed) STORE_QT_saveOriginMap(map);

    scheduleResolve('originMapUpdated');
    BUS_emit(EV_QT_.CHIP_CHANGED, { qCanon, idx: newIdx, via: 'composer' });
  }

  /** @critical */
  function CORE_QT_installQuoteOriginCapture() {
    if (W[KEY_QT_.INIT_ORIGIN]) return;
    W[KEY_QT_.INIT_ORIGIN] = true;

    const st = MOD.state;
    st.cleanup = st.cleanup || [];

    if (UTIL_isStudioMode()) {
      st.cleanup.push(() => {
        W[KEY_QT_.INIT_ORIGIN] = false;
      });
      return;
    }

    DOM_QT_installSelectionTracker();

    let lastChipText = '';
    const root = DOM_QT_getComposerRoot() || document.body;
    const mo = new MutationObserver(() => {
      const chipBtn = root.querySelector?.(SEL_QT_.CHIP_BTN);
      if (!chipBtn) return;

      const qText = UTIL_canonQuoteText(chipBtn.innerText || chipBtn.textContent || '');
      if (!qText || qText.length < 12) return;
      if (qText === lastChipText) return;
      lastChipText = qText;

      DOM_QT_tryCaptureComposerQuote(root);
    });

    mo.observe(root, { childList: true, subtree: true });

    MOD.state.originMO = mo;
    st.cleanup.push(() => {
      try { mo.disconnect(); } catch {}
      MOD.state.originMO = null;
      W[KEY_QT_.INIT_ORIGIN] = false;
    });
  }

  /* ───────────────────────────── 8) QUOTE CLICK RESOLVER (strongest) ───────────────────────────── */

  /** @helper */
  function DOM_QT_pickAssistantNearViewport() {
    const x = Math.floor(window.innerWidth * 0.5);
    const y = Math.floor(window.innerHeight * 0.33);

    let el = document.elementFromPoint(x, y);
    if (el && el.nodeType !== 1) el = el.parentElement;

    const direct = el?.closest?.(SEL_QT_.ASSIST_MSG);
    if (direct) return direct;

    const root = DOM_QT_getConversationRoot() || DOM_QT_getScanScopeRoot();
    const as = [...root.querySelectorAll(SEL_QT_.ASSIST_MSG)];
    let best = null, bestDist = 1e9;

    for (const a of as) {
      const r = a.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const cy = (r.top + r.bottom) / 2;
      const d = Math.abs(cy - y);
      if (d < bestDist) { bestDist = d; best = a; }
    }
    return best;
  }

  /** @critical */
  function CORE_QT_installQuoteClickResolver() {
    if (W[KEY_QT_.INIT_CLICK]) return;
    W[KEY_QT_.INIT_CLICK] = true;

    const snapHighlights = () => new Set([...document.querySelectorAll(SEL_QT_.HL_SEL)]);

    function findJumpHighlightAssistant(baselineSet) {
      const nodes = [...document.querySelectorAll(SEL_QT_.HL_SEL)];
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (baselineSet && baselineSet.has(n)) continue;
        const a = n.closest?.(SEL_QT_.ASSIST_MSG);
        if (a) return a;
      }
      for (let i = nodes.length - 1; i >= 0; i--) {
        const a = nodes[i].closest?.(SEL_QT_.ASSIST_MSG);
        if (a) return a;
      }
      return null;
    }

    function waitForJump(baselineSet, maxWait = 2500) {
      const t0 = Date.now();
      let lastY = window.scrollY;
      let stableSince = Date.now();

      return new Promise((resolve) => {
        const tick = () => {
          const now = Date.now();
          if (now - t0 > maxWait) return resolve(null);

          const y = window.scrollY;
          if (Math.abs(y - lastY) > 2) {
            lastY = y;
            stableSince = now;
          }
          const stable = (now - stableSince) > 120;

          if (stable) {
            const a = findJumpHighlightAssistant(baselineSet);
            if (a) return resolve(a);
          }
          setTimeout(tick, 60);
        };
        tick();
      });
    }

    function readQuoteText(qb) {
      return (
        qb.querySelector('button p')?.innerText ||
        qb.querySelector('[role="button"] p')?.innerText ||
        qb.querySelector('button')?.innerText ||
        qb.querySelector('[role="button"]')?.innerText ||
        ''
      );
    }

    const onClick = async (e) => {
      const btn = e.target?.closest?.(SEL_QT_.QBOX_BTN);
      if (!btn) return;

      const qb = btn.closest(SEL_QT_.QBOX);
      if (!qb) return;

      // ALT+click title = manual reset
      if (e.altKey) {
        const titleEl = e.target?.closest?.(SEL_QT_.QTITLE);
        if (titleEl && qb.contains(titleEl)) {
          qb.dataset.hoQuoteFrom = '?';
          qb.dataset.hoQuoteConf = '0';
          qb.dataset.hoQuoteAmb  = '1';
          qb.dataset.hoQuoteVia  = 'manual_reset';
          titleEl.textContent = 'QUOTE (ANSWER ?)';
          scheduleResolve('manual_reset');
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      const oldIdx = parseInt(qb.dataset.hoQuoteFrom || '', 10);
      const hadOld = Number.isFinite(oldIdx) && oldIdx > 0;
      if (!hadOld) return; // preserve legacy: no number => click does nothing

      const token = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
      qb.dataset.hoClickToken = token;

      const baseline = snapHighlights();
      const aEl = await waitForJump(baseline, 2500);
      if (qb.dataset.hoClickToken !== token) return;
      if (!aEl) return;

      let idx = (typeof DOM_QT_turnIdxFromAEl === 'function') ? DOM_QT_turnIdxFromAEl(aEl) : 0;
      if (!idx) {
        const vA = DOM_QT_pickAssistantNearViewport();
        idx = vA ? DOM_QT_turnIdxFromAEl(vA) : 0;
      }

      const convRoot = DOM_QT_getConversationRoot() || DOM_QT_getScanScopeRoot();
    const maxNow = DOM_QT_turnTotal() || convRoot.querySelectorAll(SEL_QT_.ASSIST_MSG).length || convRoot.querySelectorAll(SEL_QT_.USER_MSG).length || 0;
      if (!idx || idx < 1 || (maxNow && idx > maxNow)) return;

      const aid = (typeof W.H2O_getAId === 'function') ? W.H2O_getAId(aEl) : null;

      const changed = oldIdx !== idx;
      const via = changed ? 'click_fix' : 'click';

      const t = qb.querySelector(SEL_QT_.QTITLE);
      if (t) t.textContent = `QUOTE (ANSWER ${idx})`;

      qb.dataset.hoQuoteFrom = String(idx);
      qb.dataset.hoQuoteConf = '1';
      qb.dataset.hoQuoteAmb  = '0';
      qb.dataset.hoQuoteVia  = via;

      const rawText = readQuoteText(qb);
      let qCanon = UTIL_canonQuoteText(rawText || '');
      qCanon = qCanon.replace(/[.…]+$/g, '').trim();

      if (qCanon && qCanon.length >= 12) {
        const map = STORE_QT_loadOriginMap();
        const kCanon = UTIL_hash(qCanon);
        const kNorm  = UTIL_hash(UTIL_norm(rawText || ''));

        const lock = {
          mode: CFG_QT_.ORIGIN_MODE_TURN,
          tidx: idx,
          idx: idx,
          aid: aid || null,
          conf: 1,
          amb: 0,
          via,
          verified: 2,
          t: Date.now(),
        };

        if (kCanon) {
          const prev = map[kCanon];
          map[kCanon] = { ...lock, prev: prev?.tidx ?? prev?.idx ?? null, sample: qCanon.slice(0, 80) };
        }
        if (kNorm) {
          const prev = map[kNorm];
          map[kNorm] = { ...lock, prev: prev?.tidx ?? prev?.idx ?? null, sample: qCanon.slice(0, 80) };
        }

        STORE_QT_saveOriginMap(map);
      }

      scheduleResolve('click');
    };

    document.addEventListener('click', onClick, true);

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      document.removeEventListener('click', onClick, true);
      W[KEY_QT_.INIT_CLICK] = false;
    });
  }

  /* ───────────────────────────── 9) QUOTE NODE EXTRACT + ENSURE BOX (UI) ───────────────────────────── */

  /** @critical */
  function DOM_QT_extractChatGPTQuoteNode(scopeEl) {
    const scope = scopeEl?.querySelector?.(SEL_QT_.MARKDOWN_SCOPE) || scopeEl;
    if (!scope) return null;

    const btns = [
      ...scope.querySelectorAll('button'),
      ...scope.querySelectorAll('[role="button"]')
    ];

    for (const b of btns) {
      if (b.closest(SEL_QT_.QBOX)) continue;

      const p = b.querySelector('p');
      if (!p) continue;

      const cs = getComputedStyle(p);
      const clamp = cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp') || cs.getPropertyValue('line-clamp');
      const hasClamp = clamp && String(clamp).trim() !== 'none' && String(clamp).trim() !== '0';
      const looksHidden = String(cs.overflow || '') === 'hidden' || String(cs.textOverflow || '').includes('ellipsis');

      if (hasClamp && looksHidden) return b;
    }
    return null;
  }

  /** @critical */
  function DOM_QT_ensureQuoteBoxInsideWrapper(userMsgEl, stableId, wrapperEl) {
    if (!userMsgEl) return null;

    const wrapper = wrapperEl || DOM_QT_findWrapperForUserMsg(userMsgEl) || DOM_QT_findWrapperByStableId(stableId);
    if (!wrapper) return null;

    const sid = stableId || wrapper.dataset.hoQwrapId || wrapper.dataset.h2oQwrapId || null;
    if (!sid) return null;

    // Already have a quote box for this stable id?
    let existing = DOM_QT_findQuoteBoxByStableId(sid);

    if (existing) {
      // Force it inside wrapper unless user chose outside.
      const mode = STORE_QT_getQuoteMode();
      if (mode === CFG_QT_.QUOTE_MODE_OUTSIDE) {
        if (wrapper.parentNode && existing.parentNode !== wrapper.parentNode) {
          try { existing.parentNode?.removeChild(existing); } catch {}
          wrapper.parentNode.insertBefore(existing, wrapper);
        }
      } else {
        if (!wrapper.contains(existing)) {
          try { existing.parentNode?.removeChild(existing); } catch {}
          wrapper.insertBefore(existing, wrapper.firstChild);
        }
      }
      return existing;
    }

    const quoteBtn = DOM_QT_extractChatGPTQuoteNode(userMsgEl) || DOM_QT_extractChatGPTQuoteNode(wrapper);
    if (!quoteBtn) return null;
    if (quoteBtn.closest(SEL_QT_.QBOX)) return quoteBtn.closest(SEL_QT_.QBOX);

    const quoteBox = document.createElement('div');
    quoteBox.className = 'cgxui-qswr-quoteBox';
    quoteBox.setAttribute(ATTR_QT_.OWNER, SkID);
    quoteBox.setAttribute(ATTR_QT_.UI, `${SkID}-quoteBox`);

    quoteBox.dataset.hoQwrapFor  = sid;
    quoteBox.dataset.h2oQwrapFor = sid;

    const title = document.createElement('div');
    title.className = 'cgxui-qswr-quoteTitle';

    const prevA = DOM_QT_getPrevAssistantForUserMsg(userMsgEl);
    const aIdx = prevA ? (DOM_QT_turnIdxFromAEl(prevA) || 0) : 0;

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

    try { quoteBtn.parentElement?.removeChild(quoteBtn); } catch {}
    quoteBox.appendChild(title);
    quoteBox.appendChild(quoteBtn);

    // Default: inside wrapper.
    const mode = STORE_QT_getQuoteMode();
    if (mode === CFG_QT_.QUOTE_MODE_OUTSIDE) {
      wrapper.parentNode?.insertBefore(quoteBox, wrapper);
    } else {
      wrapper.insertBefore(quoteBox, wrapper.firstChild);
    }

    BUS_emit(EV_QT_.QUOTE_PENDING, { stableId: sid });
    return quoteBox;
  }

  /* ───────────────────────────── 10) NO-CLICK SOLVER (cache + match + struct) ───────────────────────────── */

  /** @helper */
  function DOM_QT_collectAssistantTexts() {
    const root = DOM_QT_getConversationRoot() || DOM_QT_getScanScopeRoot();
    const as = [...root.querySelectorAll(SEL_QT_.ASSIST_MSG)];
    const txt = as.map(a => UTIL_norm(a.innerText));
    return { as, txt };
  }

  /** @critical */
  function DOM_QT_resolveQuoteAnswerIndex_NoClick(qb, cache) {
    const titleEl = qb.querySelector(SEL_QT_.QTITLE);
    if (!titleEl) return;

    const rawText =
      (qb.querySelector('button p')?.innerText ||
       qb.querySelector('[role="button"] p')?.innerText ||
       qb.querySelector('button')?.innerText ||
       qb.querySelector('[role="button"]')?.innerText ||
       '');

    let qCanon = UTIL_canonQuoteText(rawText || '');
    qCanon = qCanon.replace(/[.…]+$/g, '').trim();

    const convRoot = DOM_QT_getConversationRoot() || DOM_QT_getScanScopeRoot();
      const maxNow = DOM_QT_turnTotal() || convRoot.querySelectorAll(SEL_QT_.ASSIST_MSG).length || convRoot.querySelectorAll(SEL_QT_.USER_MSG).length || 0;

    function setUnknown(via) {
      titleEl.textContent = 'QUOTE (ANSWER ?)';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = via || 'unknown';
    }

    function setGuess(idx, via, amb = '0') {
      if (!idx) return setUnknown(via);
      titleEl.textContent = `QUOTE (ANSWER ${idx})`;
      qb.dataset.hoQuoteFrom = String(idx);
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = String(amb);
      qb.dataset.hoQuoteVia  = via || 'guess';
    }

    function setVerified(idx, via) {
      if (!idx) return setUnknown(via);
      titleEl.textContent = `QUOTE (ANSWER ${idx})`;
      qb.dataset.hoQuoteFrom = String(idx);
      qb.dataset.hoQuoteConf = '1';
      qb.dataset.hoQuoteAmb  = '0';
      qb.dataset.hoQuoteVia  = via || 'verified';
    }

    if (!qCanon || qCanon.length < 12) return setUnknown(qb.dataset.hoQuoteVia || 'too-short');

    const curConf = qb.dataset.hoQuoteConf;
    const curFrom = qb.dataset.hoQuoteFrom;

    if (curConf === '1' && curFrom && curFrom !== '?') {
      const n = Number(curFrom);
      if (Number.isFinite(n) && n >= 1 && n <= maxNow) {
        titleEl.textContent = `QUOTE (ANSWER ${n})`;
        qb.dataset.hoQuoteAmb = '0';
        return;
      }
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = 'conf-invalid';
    }

    // Strategy 1: origin map
    const map = STORE_QT_loadOriginMap();
    const hit = map[UTIL_hash(qCanon)] || map[UTIL_hash(UTIL_norm(rawText))] || null;

    if (hit) {
      const hitIsVerified = !!(Number(hit.verified || 0) >= 1 || hit.conf === 1 || hit.conf === '1');

      if (!(hit.amb && !hitIsVerified)) {
        let idxFromHit = 0;

        if (hit.mode === CFG_QT_.ORIGIN_MODE_TURN) idxFromHit = Number(hit.tidx || hit.idx || 0);
        else if (hit.aid) idxFromHit = (typeof DOM_QT_turnIdxFromAId === 'function') ? DOM_QT_turnIdxFromAId(hit.aid) : Number(hit.idx || 0);
        else {
          const legacyAIdx = Number(hit.idx || 0);
          const aEl = cache?.as?.[legacyAIdx - 1] || null;
          idxFromHit = aEl ? (DOM_QT_turnIdxFromAEl(aEl) || 0) : 0;
        }

        const n = Number(idxFromHit);
        if (Number.isFinite(n) && n >= 1 && n <= maxNow) {
          if (hitIsVerified && !hit.amb) return setVerified(n, hit.via || 'cache_verified');
          return setGuess(n, hit.via || 'cache_guess', hit.amb ? '1' : '0');
        }
      }
    }

    // Strategy 2: text-match across assistant content
    if (cache && cache.as && cache.txt && cache.as.length === cache.txt.length) {
      const qLower = qCanon.toLowerCase();

      let best   = { i: -1, score: -1, pos: 1e9 };
      let second = { i: -1, score: -1, pos: 1e9 };

      for (let i = 0; i < cache.as.length; i++) {
        const aText = cache.txt[i];
        if (!aText) continue;

        const aLower = aText.toLowerCase();
        const pos = aLower.indexOf(qLower);
        if (pos === -1) continue;

        let score = 0;
        score += Math.min(500, qCanon.length);
        score += Math.max(0, 200 - pos);
        if (pos === 0) score += 40;

        if (score > best.score) { second = best; best = { i, score, pos }; }
        else if (score > second.score) { second = { i, score, pos }; }
      }

      if (best.i >= 0) {
        const margin = best.score - (second.score < 0 ? 0 : second.score);
        const strong = margin >= 60;

        const idx = DOM_QT_turnIdxFromAEl(cache.as[best.i]) || 0;
        if (idx && idx >= 1 && idx <= maxNow) {
          if (strong) return setVerified(idx, 'match_strong');
          return setGuess(idx, 'match_weak', '1');
        }
      }
    }

    // Strategy 3: structural fallback
    const wrapId = qb.dataset.hoQwrapFor || qb.dataset.h2oQwrapFor;
    const wrapper = wrapId ? DOM_QT_findWrapperByStableId(wrapId) : null;
    const userMsg = wrapper?.closest?.(SEL_QT_.USER_MSG) || qb.closest?.(SEL_QT_.USER_MSG);

    if (userMsg) {
      const prevA = DOM_QT_getPrevAssistantForUserMsg(userMsg);
      const fallbackIdx = prevA ? (DOM_QT_turnIdxFromAEl(prevA) || 0) : 0;
      if (fallbackIdx && fallbackIdx >= 1 && fallbackIdx <= maxNow) return setGuess(fallbackIdx, 'struct_fallback', '1');
    }

    return setUnknown('no-hit');
  }

  /* ───────────────────────────── 11) APPLY MODE + TITLE REFRESH (reposition safe) ───────────────────────────── */

  /** @critical */
  function DOM_QT_applyQuoteModeToExisting() {
    const mode = STORE_QT_getQuoteMode();

    document.querySelectorAll(SEL_QT_.QBOX).forEach(qb => {
      const wrapId = qb.dataset.hoQwrapFor || qb.dataset.h2oQwrapFor;
      if (!wrapId) return;

      const wrapper = DOM_QT_findWrapperByStableId(wrapId);
      if (!wrapper || !wrapper.parentNode) return;

      // remove then reinsert to avoid duplicate placement
      try { qb.parentNode?.removeChild(qb); } catch {}

      if (mode === CFG_QT_.QUOTE_MODE_OUTSIDE) {
        wrapper.parentNode.insertBefore(qb, wrapper);
      } else {
        wrapper.insertBefore(qb, wrapper.firstChild);
      }
    });

    DOM_QT_refreshQuoteTitles();
  }

  /** @helper */
  function DOM_QT_buildQuoteTitleContext() {
    const msgs = [...document.querySelectorAll(SEL_QT_.ANY_MSG)];

    const aIndex = new Map();
    let ai = 0;
    for (const el of msgs) {
      if (el.getAttribute('data-message-author-role') === 'assistant') {
        ai++;
        aIndex.set(el, ai);
      }
    }

    return {
      msgs,
      aIndex,
      maxNow: DOM_QT_turnTotal() || ai || document.querySelectorAll(SEL_QT_.USER_MSG).length || 0,
      pos: new Map(msgs.map((el, i) => [el, i])),
    };
  }

  /** @helper */
  function DOM_QT_refreshQuoteTitleForBox(qb, ctx = null) {
    if (!qb?.matches?.(SEL_QT_.QBOX)) return null;

    const titleEl = qb.querySelector(SEL_QT_.QTITLE);
    const data = ctx || DOM_QT_buildQuoteTitleContext();
    const msgs = data.msgs || [];
    const aIndex = data.aIndex || new Map();
    const maxNow = Number(data.maxNow || 0);
    const pos = data.pos || new Map();

    if (qb.dataset.hoQuoteConf === '1' && qb.dataset.hoQuoteFrom && qb.dataset.hoQuoteFrom !== '?') {
      const n = Number(qb.dataset.hoQuoteFrom);
      if (n >= 1 && n <= maxNow) {
        if (titleEl) titleEl.textContent = `QUOTE (ANSWER ${n})`;
        qb.dataset.hoQuoteAmb = '0';
        return qb;
      }
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = 'conf-invalid';
    }

    const curRaw = qb.dataset.hoQuoteFrom;
    const curNum = curRaw && curRaw !== '?' ? Number(curRaw) : NaN;

    if (!Number.isNaN(curNum) && curNum >= 1 && curNum <= maxNow) {
      if (titleEl) titleEl.textContent = `QUOTE (ANSWER ${curNum})`;
      return qb;
    }

    const wrapId = qb.dataset.hoQwrapFor || qb.dataset.h2oQwrapFor;
    if (!wrapId) {
      if (titleEl) titleEl.textContent = 'QUOTE (ANSWER ?)';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = qb.dataset.hoQuoteVia || 'no-wrapId';
      return qb;
    }

    const wrapper = DOM_QT_findWrapperByStableId(wrapId);
    const userMsg = wrapper?.closest?.(SEL_QT_.USER_MSG);

    if (!userMsg) {
      if (titleEl) titleEl.textContent = 'QUOTE (ANSWER ?)';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = qb.dataset.hoQuoteVia || 'no-userMsg';
      return qb;
    }

    const i = pos.get(userMsg);
    if (i == null || i < 0) {
      if (titleEl) titleEl.textContent = 'QUOTE (ANSWER ?)';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = qb.dataset.hoQuoteVia || 'no-pos';
      return qb;
    }

    let prevA = null;
    for (let k = i - 1; k >= 0; k--) {
      if (msgs[k].getAttribute('data-message-author-role') === 'assistant') { prevA = msgs[k]; break; }
    }

    const idx = prevA ? (DOM_QT_turnIdxFromAEl(prevA) || aIndex.get(prevA) || 0) : 0;

    if (idx && idx >= 1 && idx <= maxNow) {
      if (titleEl) titleEl.textContent = `QUOTE (ANSWER ${idx})`;
      qb.dataset.hoQuoteFrom = String(idx);
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = qb.dataset.hoQuoteVia || 'struct_refresh';
    } else {
      if (titleEl) titleEl.textContent = 'QUOTE (ANSWER ?)';
      qb.dataset.hoQuoteFrom = '?';
      qb.dataset.hoQuoteConf = '0';
      qb.dataset.hoQuoteAmb  = '1';
      qb.dataset.hoQuoteVia  = qb.dataset.hoQuoteVia || 'struct_none';
    }

    return qb;
  }

  /** @helper */
  function DOM_QT_reconcileQuoteTarget(target, ctx = null) {
    const rec = (target && typeof target === 'object') ? target : {};
    const stableId =
      rec.stableId ||
      rec.quoteBoxEl?.dataset?.hoQwrapFor ||
      rec.quoteBoxEl?.dataset?.h2oQwrapFor ||
      null;

    let wrapper = stableId ? DOM_QT_findWrapperByStableId(stableId) : null;
    let userMsgEl =
      rec.userMsgEl ||
      wrapper?.closest?.(SEL_QT_.USER_MSG) ||
      rec.quoteBoxEl?.closest?.(SEL_QT_.USER_MSG) ||
      null;

    if (!wrapper && userMsgEl) wrapper = DOM_QT_findWrapperForUserMsg(userMsgEl);
    if (!userMsgEl && wrapper) userMsgEl = wrapper.closest?.(SEL_QT_.USER_MSG) || null;

    let qb = null;
    if (wrapper && userMsgEl) qb = DOM_QT_ensureQuoteBoxInsideWrapper(userMsgEl, stableId, wrapper);

    if (!qb) {
      const payloadQb = rec.quoteBoxEl?.matches?.(SEL_QT_.QBOX)
        ? rec.quoteBoxEl
        : rec.quoteBoxEl?.closest?.(SEL_QT_.QBOX);
      qb = (payloadQb && payloadQb.isConnected) ? payloadQb : DOM_QT_findQuoteBoxByStableId(stableId);
    }

    if (!qb) {
      return {
        ok: false,
        retryable: !!stableId,
        stableId,
        target: stableId ? { stableId, userMsgEl: userMsgEl || null } : null,
      };
    }

    DOM_QT_refreshQuoteTitleForBox(qb, ctx);

    if (qb.dataset.hoQuoteConf !== '1') MOD.state.pendingSet?.add?.(qb);
    else MOD.state.pendingSet?.delete?.(qb);

    return { ok: true, qb, stableId };
  }

  /** @critical */
  function DOM_QT_refreshQuoteTitles() {
    const ctx = DOM_QT_buildQuoteTitleContext();
    document.querySelectorAll(SEL_QT_.QBOX).forEach(qb => DOM_QT_refreshQuoteTitleForBox(qb, ctx));
  }

  /* ───────────────────────────── 12) SCAN + RESOLVE (idle schedulers) ───────────────────────────── */

  /** @helper */
  function DOM_QT_cancelLateRetry(clearTargets = false) {
    const st = MOD.state;
    if (st.lateRetryHandle) {
      clearTimeout(st.lateRetryHandle);
      st.lateRetryHandle = 0;
    }
    st.lateRetryAttempt = 0;
    st.lateRetryUntil = 0;
    if (clearTargets && st.lateTargetMap) st.lateTargetMap.clear();
  }

  /** @helper */
  function DOM_QT_queueLateTarget(target) {
    const st = MOD.state;
    const stableId = target?.stableId || null;
    if (!stableId) return false;

    const prev = st.lateTargetMap?.get?.(stableId) || { stableId };
    const next = { ...prev, stableId };
    if (target?.userMsgEl) next.userMsgEl = target.userMsgEl;
    if (target?.quoteBoxEl) next.quoteBoxEl = target.quoteBoxEl;

    st.lateTargetMap?.set?.(stableId, next);
    DOM_QT_scheduleLateRetry();
    return true;
  }

  /** @helper */
  function DOM_QT_scheduleLateRetry(reason = 'late-target-retry') {
    const st = MOD.state;
    if (!st.lateTargetMap?.size) {
      DOM_QT_cancelLateRetry(false);
      return;
    }
    if (st.lateRetryHandle) return;

    const now = Date.now();
    if (!st.lateRetryUntil || now > st.lateRetryUntil) {
      st.lateRetryAttempt = 0;
      st.lateRetryUntil = now + RETRY_QT_DELAYS_.reduce((sum, ms) => sum + ms, 0) + 250;
    }

    if (st.lateRetryAttempt >= RETRY_QT_DELAYS_.length) return;

    const delay = RETRY_QT_DELAYS_[st.lateRetryAttempt++];
    st.lateRetryHandle = setTimeout(() => {
      st.lateRetryHandle = 0;
      if (!st.lateTargetMap?.size) {
        DOM_QT_cancelLateRetry(false);
        return;
      }

      if (st.scanRunning || st.resolveRunning) {
        st.scanQueued = true;
        st.resolveQueued = true;
        return;
      }

      scheduleScan(reason);
    }, delay);
  }

  /** @helper */
  function DOM_QT_drainLateTargets() {
    const st = MOD.state;
    if (!st.lateTargetMap?.size) {
      DOM_QT_cancelLateRetry(false);
      return;
    }

    const ctx = DOM_QT_buildQuoteTitleContext();

    for (const [stableId, target] of Array.from(st.lateTargetMap.entries())) {
      const res = DOM_QT_reconcileQuoteTarget(target, ctx);
      if (res.ok) st.lateTargetMap.delete(stableId);
    }

    if (st.lateTargetMap.size) DOM_QT_scheduleLateRetry();
    else DOM_QT_cancelLateRetry(false);
  }

  /** @critical */
  function DOM_QT_scanEnsureQuoteBoxes() {
    const users = [...document.querySelectorAll(SEL_QT_.USER_MSG)];
    for (const u of users) {
      const wrapper = DOM_QT_findWrapperForUserMsg(u);
      if (!wrapper) continue;

      const stableId = wrapper.dataset.hoQwrapId || wrapper.dataset.h2oQwrapId || null;
      if (!stableId) continue;

      const qb = DOM_QT_ensureQuoteBoxInsideWrapper(u, stableId, wrapper);
      if (qb && qb.dataset.hoQuoteConf !== '1') MOD.state.pendingSet?.add?.(qb);
    }
  }

  /** @helper */
  function scheduleScan(reason = '') {
    const st = MOD.state;
    st.scanQueued = true;

    if (st.scanRunning) return;

    if (st.scanHandle) {
      if (st.scanIsIdle && 'cancelIdleCallback' in window) cancelIdleCallback(st.scanHandle);
      else clearTimeout(st.scanHandle);
      st.scanHandle = 0;
      st.scanIsIdle = false;
    }

    const run = () => {
      st.scanHandle = 0;
      st.scanIsIdle = false;
      if (st.scanRunning) return;
      st.scanQueued = false;
      runScan(reason);
    };

    if ('requestIdleCallback' in window) {
      st.scanIsIdle = true;
      st.scanHandle = requestIdleCallback(run, { timeout: CFG_QT_.IDLE_TIMEOUT_MS });
    } else {
      st.scanIsIdle = false;
      st.scanHandle = setTimeout(run, CFG_QT_.FALLBACK_DELAY_MS);
    }
  }

  /** @critical */
  function runScan(reason = '') {
    const st = MOD.state;
    if (st.scanRunning) { st.scanQueued = true; return; }
    st.scanRunning = true;
    st.scanQueued = false;

    try {
      DOM_QT_drainLateTargets();
      DOM_QT_scanEnsureQuoteBoxes();
      scheduleResolve('scan:' + reason);
    } catch (e) {
      console.warn('[QT] scan error:', reason, e);
    } finally {
      st.scanRunning = false;
      if (st.scanQueued) scheduleScan('queued');
    }
  }

  /** @helper */
  function scheduleResolve(reason = '', opts = null) {
    const st = MOD.state;
    st.resolveQueued = true;
    if (opts?.forceFull) st.resolveForceFull = true;

    if (st.resolveRunning) return;

    if (st.resolveHandle) {
      if (st.resolveIsIdle && 'cancelIdleCallback' in window) cancelIdleCallback(st.resolveHandle);
      else clearTimeout(st.resolveHandle);
      st.resolveHandle = 0;
      st.resolveIsIdle = false;
    }

    const run = () => {
      st.resolveHandle = 0;
      st.resolveIsIdle = false;
      if (st.resolveRunning) return;
      st.resolveQueued = false;
      runResolve(reason);
    };

    if ('requestIdleCallback' in window) {
      st.resolveIsIdle = true;
      st.resolveHandle = requestIdleCallback(run, { timeout: CFG_QT_.IDLE_TIMEOUT_MS });
    } else {
      st.resolveIsIdle = false;
      st.resolveHandle = setTimeout(run, CFG_QT_.FALLBACK_DELAY_MS);
    }
  }

  /** @critical */
  function runResolve(reason = '') {
    const st = MOD.state;
    if (st.resolveRunning) { st.resolveQueued = true; return; }
    st.resolveRunning = true;
    st.resolveQueued = false;

    try {
      let pending = [];
      const useSet = (st.pendingSet && st.pendingSet.size && !st.resolveForceFull);

      if (useSet) {
        for (const qb of Array.from(st.pendingSet)) {
          if (!qb || !qb.isConnected || !qb.matches?.(SEL_QT_.QBOX) || qb.dataset.hoQuoteConf === '1') {
            st.pendingSet.delete(qb);
            continue;
          }
          pending.push(qb);
        }
      } else {
        pending = [...document.querySelectorAll(SEL_QT_.QBOX)].filter(qb => qb.dataset.hoQuoteConf !== '1');
        st.resolveForceFull = false;
      }

      if (!pending.length) return;

      const cache = DOM_QT_collectAssistantTexts();
      for (const qb of pending) DOM_QT_resolveQuoteAnswerIndex_NoClick(qb, cache);

      if (st.pendingSet) {
        for (const qb of pending) {
          if (!qb || !qb.isConnected || qb.dataset.hoQuoteConf === '1') st.pendingSet.delete(qb);
          else st.pendingSet.add(qb);
        }
      }
    } catch (e) {
      console.warn('[QT] resolve error:', reason, e);
    } finally {
      st.resolveRunning = false;
      if (st.resolveQueued) scheduleResolve('queued');
    }
  }

  /* ───────────────────────────── 13) EVENTS ───────────────────────────── */

  /** @critical */
  function CORE_QT_installEventWiring() {
    const st = MOD.state;
    if (st.eventsInstalled) return;
    st.eventsInstalled = true;

    const offA = BUS_on(EV_QT_.WRAPPED, (payload) => {
      const res = DOM_QT_reconcileQuoteTarget(payload);
      if (res.ok) {
        if (res.stableId) st.lateTargetMap?.delete?.(res.stableId);
        if (!st.lateTargetMap?.size) DOM_QT_cancelLateRetry(false);
        scheduleResolve('wrapped:target');
        return;
      }

      if (res.retryable && DOM_QT_queueLateTarget(res.target || payload)) return;
      scheduleScan('wrapped');
    });

    const offB = BUS_on(EV_QT_.QUOTE_PENDING, (payload) => {
      const res = DOM_QT_reconcileQuoteTarget(payload);
      if (res.ok) {
        if (res.stableId) st.lateTargetMap?.delete?.(res.stableId);
        if (!st.lateTargetMap?.size) DOM_QT_cancelLateRetry(false);
        scheduleResolve('quote_pending:target');
        return;
      }

      if (res.retryable && DOM_QT_queueLateTarget(res.target || payload)) return;
      scheduleScan('quote_pending');
    });

    const offC = BUS_on(EV_QT_.CHIP_CHANGED, () => {
      scheduleResolve('chip');
    });

    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => { try { offA?.(); } catch {} });
    st.cleanup.push(() => { try { offB?.(); } catch {} });
    st.cleanup.push(() => { try { offC?.(); } catch {} });
  }

  /* ───────────────────────────── 14) BOOT / DISPOSE ───────────────────────────── */

function CORE_QT_boot() {
  if (W[KEY_QT_.INIT_BOOT]) return;
  W[KEY_QT_.INIT_BOOT] = true;

  const st = (MOD.state = MOD.state || {});
  st.cleanup = st.cleanup || [];
  st.pendingSet = st.pendingSet || new Set();
  st.lateTargetMap = st.lateTargetMap || new Map();

  st.scanRunning = false; st.scanQueued = false; st.scanHandle = 0; st.scanIsIdle = false;
  st.resolveRunning = false; st.resolveQueued = false; st.resolveHandle = 0; st.resolveIsIdle = false;
  st.resolveForceFull = false;
  st.lateRetryHandle = 0;
  st.lateRetryAttempt = 0;
  st.lateRetryUntil = 0;
  st.hubMutOff = (typeof st.hubMutOff === 'function') ? st.hubMutOff : null;
  st.isStudio = UTIL_isStudioMode();

  let hubCleanupBound = false;
  let onObsReady = null;

  CORE_QT_installEventWiring();

  const bootKick = () => {
    // install strongest solvers ASAP
    if (!st.isStudio) {
      CORE_QT_installQuoteOriginCapture();
    }
    CORE_QT_installQuoteClickResolver();

    // ✅ EAGER pass (no idle) → kills the “1–2s wait”
    try { runScan('boot-eager'); } catch {}
    try { runResolve('boot-eager'); } catch {}

    // keep your normal scheduling pipeline afterward
    scheduleScan('boot');
    scheduleResolve('boot');
  };

  const stopObsReady = () => {
    if (!onObsReady) return;
    window.removeEventListener('evt:h2o:obs:ready', onObsReady);
    onObsReady = null;
  };

  const bindHubMut = () => {
    const hub = W.H2O?.obs;
    if (!(hub && typeof hub.onMutations === 'function')) return false;
    if (st.hubMutOff) return true;

    st.hubMutOff = hub.onMutations('quotetk:mut', (payload) => {
      if (!payload?.conversationRelevant) return;
      scheduleScan('hub');
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

  // body-safe under document-start
  const startMO = () => {
    const hub = W.H2O?.obs;
    const hubReady = !!(hub && typeof hub.onMutations === 'function');
    if (hubReady && !st.hubMutOff) bindHubMut();
    if (st.mo) return;

    const root = DOM_QT_getConversationRoot() || DOM_QT_getScanScopeRoot() || document.body;
    const mo = new MutationObserver((muts) => {
      let needScan = false;
      let needChip = false;
      let needRepair = false;
      const scanHits = new Set();

      for (const m of muts) {
        for (const n of (m.addedNodes || [])) {
          if (n.nodeType !== 1) continue;
          if (!st.isStudio && n.closest?.('form, #thread-bottom-container')) needChip = true;
          if (DOM_QT_collectScanSignalsFromNode(n, scanHits)) needRepair = true;
          if (scanHits.size) needScan = true;
          if (needScan && needChip && !needRepair) break;
        }
        if (needScan && needChip && !needRepair) break;
      }

      if (!st.isStudio && needChip) DOM_QT_tryCaptureComposerQuote(DOM_QT_getComposerRoot() || document);
      if (needScan && !st.hubMutOff) scheduleScan('mo');
      if (needRepair) scheduleResolve('mo:repair', { forceFull: true });
    });

    mo.observe(root, { childList: true, subtree: true });
    st.mo = mo;
    st.cleanup.push(() => { try { mo.disconnect(); } catch {} st.mo = null; });
  };

  const start = () => {
    startMO();
    if (!st.hubMutOff) {
      onObsReady = () => { bindHubMut(); };
      window.addEventListener('evt:h2o:obs:ready', onObsReady);
      st.cleanup.push(() => stopObsReady());
    }
    queueMicrotask(bootKick);
  };

  if (document.body) start();
  else requestAnimationFrame(function wait(){ document.body ? start() : requestAnimationFrame(wait); });

  MOD.api.boot = CORE_QT_boot;
  MOD.api.dispose = CORE_QT_dispose;
}


  /** @critical */
  function CORE_QT_dispose() {
    if (!W[KEY_QT_.INIT_BOOT]) return;

    const st = MOD.state;

    if (st.scanHandle) {
      if (st.scanIsIdle && 'cancelIdleCallback' in window) cancelIdleCallback(st.scanHandle);
      else clearTimeout(st.scanHandle);
      st.scanHandle = 0;
    }

    if (st.resolveHandle) {
      if (st.resolveIsIdle && 'cancelIdleCallback' in window) cancelIdleCallback(st.resolveHandle);
      else clearTimeout(st.resolveHandle);
      st.resolveHandle = 0;
    }

    DOM_QT_cancelLateRetry(true);

    const cleanup = st.cleanup || [];
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    st.scanRunning = st.scanQueued = false;
    st.resolveRunning = st.resolveQueued = false;
    st.lateRetryHandle = 0;
    st.lateRetryAttempt = 0;
    st.lateRetryUntil = 0;

    W[KEY_QT_.INIT_BOOT] = false;
  }

  CORE_QT_boot();

})();
