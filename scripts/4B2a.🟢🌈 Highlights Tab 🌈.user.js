// ==UserScript==
// @h2o-id      4c.highlights.tab
// @name         4C.🟢🌈 Highlights Tab 🌈
// @namespace    H2O.ChatGPT.HighlightsTab
// @version      1.1.3
// @description  Highlights Tab module for Dock Panel: store-first highlight index + fast render + scroll-to-highlight + ping flash. Registers into H2O.Dock as "highlights".
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Dock Panel: Highlights Tab (Contract v2, Stage 1) 🌈🧱
   * - Waits for Dock Panel contract: H2O.DP.dckpnl.api.getContract()
   * - Registers: H2O.Dock.registerTab('highlights', { render, onRowClick })
   * - Store-first: prefers localStorage highlight map (fast) + DOM fallback (safe)
   * - Click: scroll to highlight, request remount if needed, and ping-flash
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity ───────────────────────────── */

  /** @core Root window ref. */
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  /** @core Shared identity with Dock Panel (tab module). */
  const TOK = 'DP';
  const PID = 'dckpnl';
  const CID = 'highlightsTab';
  const SkID = 'hltb';
  const BrID = PID;

  const SUITE = 'prm';
  const HOST = 'cgx';

// ───────────── MiniMap Wash (disk fallback) ─────────────
const CFG_HT_WASH_DISK_FALLBACK = true;

// MiniMap uses DsID = PID = 'mnmp'
const KEY_HT_WASH_NEW = `h2o:${SUITE}:${HOST}:mnmp:state:wash_map:v1`;
const KEY_HT_WASH_OLD = `h2o:${SUITE}:${HOST}:mnmp:state:glow_hl:v7`;

// tiny cache to avoid parsing JSON repeatedly
let HT_washDiskCache = { at: 0, map: null };

  const MODTAG = 'DPanel.HighlightsTab';
  const MODICON = '🌈';
  const EMOJI_HDR = '🟢';

  /** @core Module vault (H2O). */
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };
  VAULT.diag = VAULT.diag || { bootCount: 0, lastBootAt: 0, steps: [] };
  const DIAG = VAULT.diag;

  VAULT.state = VAULT.state || {};
  const STATE = VAULT.state;
  STATE.booted = Boolean(STATE.booted);
  STATE.cache = STATE.cache || {
    pickedKey: null,
    lastRaw: null,
    lastBuiltAt: 0,
    items: [],
    domFallbackAt: 0,
  };
  const CACHE = STATE.cache;

  /* ───────────────────────────── 1) Tokens ───────────────────────────── */

  /** @core Known highlight colors order (your requested order). */
  const CFG_HT_COLOR_ORDER = Object.freeze(['gold', 'green', 'red', 'blue', 'orange', 'purple', 'pink', 'sky']);

  /** @core Storage candidates (supports old + new ecosystems). */
  const KEY_HT_STORE_CANDIDATES = Object.freeze([
    'h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3',
  ]);

  /** @core Namespace guards. */
  const NS_MEM_ONCE = `${TOK}:${PID}:${MODTAG}:once`;

  /** @core Ping/flash knobs. */
  const CFG_HT = Object.freeze({
    MAX_ITEMS_SOFT: 2000,
    SNIP_MAX: 140,
    PING_MS: 680,
    FLASH_MS: 720,
    DOM_FALLBACK_THROTTLE_MS: 650,
  });

  const ATTR_SUMMARY_TOGGLE = 'data-h2o-summary-toggle';
  const ATTR_SUMMARY_VISIBLE = 'data-h2o-summary-visible';
  const SUMMARY_WRAPPER_CLASS = 'cgxui-hl-summary-wrapper';
  const SUMMARY_VISIBLE_VALUE = '1';
  const SUMMARY_HIDDEN_VALUE = '0';

  /* ───────────────────────────── 2) Small utils ───────────────────────────── */

  /** @helper Color rank. */
  function UTIL_HT_colorRank(name) {
    const key = (name || '').toLowerCase();
    const idx = CFG_HT_COLOR_ORDER.indexOf(key);
    return idx === -1 ? (CFG_HT_COLOR_ORDER.length + 99) : idx;
  }

  /** @helper Clamp. */
  function UTIL_HT_clamp(n, a, b) { n = +n || 0; return Math.max(a, Math.min(b, n)); }

  /** @helper Safe string. */
  function UTIL_HT_s(v) { return (v == null) ? '' : String(v); }


  /** @helper Normalize stored highlight color (name/index/css) into a supported color token. */
  function UTIL_HT_normalizeColor(raw) {
    if (raw == null) return 'gold';

    // numeric index (0..N-1)
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const n = CFG_HT_COLOR_ORDER.length || 1;
      const idx = ((raw % n) + n) % n;
      return CFG_HT_COLOR_ORDER[idx] || 'gold';
    }

    const s0 = String(raw).trim();
    if (!s0) return 'gold';

    const s = s0.toLowerCase();

    // digits-as-string index
    if (/^\d+$/.test(s)) {
      const num = Number(s);
      const n = CFG_HT_COLOR_ORDER.length || 1;
      const idx = ((num % n) + n) % n;
      return CFG_HT_COLOR_ORDER[idx] || 'gold';
    }

    // direct supported token
    if (CFG_HT_COLOR_ORDER.includes(s)) return s;

    // common aliases
    if (s === 'yellow') return 'gold';
    if (s === 'violet') return 'purple';
    if (s === 'magenta' || s === 'fuchsia') return 'pink';
    if (s === 'cyan' || s === 'teal') return 'sky';

    // allow class-ish tokens like "c3", "color-2", "hl_4"
    const mIdx = s.match(/(?:^|[^a-z0-9])(\d+)(?:[^a-z0-9]|$)/);
    if (mIdx && mIdx[1]) {
      const num = Number(mIdx[1]);
      if (Number.isFinite(num)) {
        const n = CFG_HT_COLOR_ORDER.length || 1;
        const idx = ((num % n) + n) % n;
        return CFG_HT_COLOR_ORDER[idx] || 'gold';
      }
    }

    // css colors (rgb/rgba/hex) -> best-effort buckets
    const v = s.replace(/\s+/g, '');
    if (v.startsWith('#')) {
      // crude hex buckets by dominant channel
      const hex = v.slice(1);
      const full = (hex.length === 3)
        ? hex.split('').map(ch => ch + ch).join('')
        : hex;
      if (/^[0-9a-f]{6}$/i.test(full)) {
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return UTIL_HT_rgbToToken(r, g, b);
      }
    }
    if (v.startsWith('rgb')) {
      const m = v.match(/rgba?\((\d+),(\d+),(\d+)/);
      if (m) return UTIL_HT_rgbToToken(Number(m[1]), Number(m[2]), Number(m[3]));
    }

    return 'gold';
  }

  /** @helper Normalize message role tokens. */
  function UTIL_HT_normalizeRole(raw) {
    if (!raw) return null;
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'assistant' || s === 'answer') return 'assistant';
    if (s === 'user' || s === 'question') return 'user';
    return null;
  }

  /** @helper Inline highlighter API resolver (legacy + current). */
  function UTIL_HT_getInlineApi() {
    return W.HoInline || W.H2OInline || W.H2O?.inline || null;
  }

  /** @helper Resolve the actual answer number for a msgId (1-based). */
  function UTIL_HT_resolveAnswerNumber(msgId, items, fallbackIndex) {
    if (!msgId) return null;
    const list = Array.isArray(items) ? items : [];

    for (const it of list) {
      if (!it || String(it.msgId || '') !== msgId) continue;
      const explicit = Number.isFinite(Number(it.answerNumber)) ? Number(it.answerNumber) : null;
      if (explicit && explicit > 0) return explicit;
      const idx = Number.isFinite(Number(it.answerIndex)) ? Number(it.answerIndex) + 1 : null;
      if (idx && idx > 0) return idx;
    }

    const indexFn = W.H2O?.index?.getAIndex;
    const resolved = Number(indexFn ? indexFn(msgId) : 0);
    if (Number.isFinite(resolved) && resolved > 0) return resolved;

    if (Number.isFinite(Number(fallbackIndex))) return Number(fallbackIndex) + 1;
    return null;
  }

  /** @helper Try get the turn index via H2O.turn helpers. */
  function UTIL_HT_tryTurnIndex(msgId, role) {
    if (!msgId) return 0;
    const turnSvc = W.H2O?.turn;
    if (!turnSvc) return 0;

    const callFn = (fn) => (typeof fn === 'function' ? Number(fn(msgId) || 0) : 0);
    if (role === 'assistant') {
      const byRole = callFn(turnSvc.getTurnIndexByAId);
      if (byRole > 0) return byRole;
    } else if (role === 'user') {
      const byRole = callFn(turnSvc.getTurnIndexByQId);
      if (byRole > 0) return byRole;
    }

    const byA = callFn(turnSvc.getTurnIndexByAId);
    if (byA > 0) return byA;
    const byQ = callFn(turnSvc.getTurnIndexByQId);
    if (byQ > 0) return byQ;
    return 0;
  }

  /** @helper Resolve the turn index for an item (fallbacks to metadata order). */
  function UTIL_HT_resolveTurnIndex(item, items, fallbackIndex) {
    if (!item) return null;
    const msgId = item.msgId || '';
    if (!msgId) return null;
    const role = UTIL_HT_normalizeRole(item.role);
    const turnIndex = UTIL_HT_tryTurnIndex(msgId, role);
    if (turnIndex > 0) return turnIndex;
    return UTIL_HT_resolveAnswerNumber(msgId, items, fallbackIndex);
  }

  /** @helper Best-effort RGB -> token mapping for the known palette. */
  function UTIL_HT_rgbToToken(r, g, b) {
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return 'gold';

    // strong yellow
    if (r > 200 && g > 160 && b < 120) return 'gold';
    // strong red
    if (r > 180 && g < 120 && b < 120) return 'red';
    // strong green
    if (g > 160 && r < 140 && b < 140) return 'green';
    // strong blue
    if (b > 160 && r < 140 && g < 160) return 'blue';
    // orange-ish
    if (r > 200 && g > 100 && g < 190 && b < 120) return 'orange';
    // purple-ish
    if (r > 140 && b > 140 && g < 140) return 'purple';
    // pink-ish
    if (r > 200 && b > 120 && g < 180) return 'pink';
    // sky-ish
    if (g > 160 && b > 160 && r < 170) return 'sky';

    // fallback by dominant channel
    const max = Math.max(r, g, b);
    if (max === r) return (g > 120 ? 'orange' : 'red');
    if (max === g) return 'green';
    return 'blue';
  }

  /** @helper Escape HTML (for innerHTML). */
  function UTIL_HT_escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** @helper Truncate. */
  function UTIL_HT_trunc(s, max = CFG_HT.SNIP_MAX) {
    s = (s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, Math.max(10, max - 1)).trimEnd() + '…';
  }

  /** @helper CSS.escape fallback. */
  function UTIL_HT_cssEsc(s) {
    try { return (W.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s); } catch (_) { return String(s); }
  }

  /** @helper Best-effort pick the first existing storage key. */
  function UTIL_HT_pickStoreKey(lsGet) {
    for (const k of KEY_HT_STORE_CANDIDATES) {
      const v = lsGet(k);
      if (v && typeof v === 'string' && v.trim().length > 2) return k;
    }
    return null;
  }

  /* ───────────────────────────── 3) Contract wait ───────────────────────────── */

  /** @helper Wait until Dock Panel API + Dock registry exist. */
  function UTIL_HT_waitForDockPanelApi(maxMs = 5000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.[TOK]?.[BrID]?.api || null;
        const ok = !!(api?.getContract && W.H2O?.Dock?.registerTab);
        if (ok) return resolve(api);
        if (performance.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  /* ───────────────────────────── 4) Cache (store-first) ───────────────────────────── */
  /**
   * @critical Normalize arbitrary highlight store shapes into flat items.
   * Supports:
   * - { "<msgId>": [{start,end,color,text?}, ...], ... }
   * - { items:[{msgId,start,end,color,text?}, ...] }
   * - [{msgId,start,end,color,text?}, ...]
   */
  function CORE_HT_normalizeFromStore(obj) {
    const out = [];

    const pushItem = (it, msgIdHint) => {
      if (!it || typeof it !== 'object') return;
      const msgId = UTIL_HT_s(it.msgId || it.messageId || msgIdHint).trim();
      if (!msgId) return;

      const start = Number.isFinite(+it.start) ? +it.start : (Number.isFinite(+it.s) ? +it.s : null);
      const end   = Number.isFinite(+it.end)   ? +it.end   : (Number.isFinite(+it.e) ? +it.e : null);

      const color = UTIL_HT_normalizeColor(it.color ?? it.c ?? it.kind ?? it.name);
      const text  = UTIL_HT_s(it.text || it.snip || it.snippet || it.t || '').trim();

      // Stable-ish id (store-first). If no offsets, still produce deterministic-ish id.
      const hlId = (start != null && end != null)
        ? `${msgId}:${start}-${end}:${color}`
        : `${msgId}:${UTIL_HT_s(it.id || it.hid || it.key || '') || (text ? text.slice(0, 40) : 'hl')}:${color}`;

      const answerIndexRaw = it.answerIndex ?? it.answerIdx ?? it.idx ?? null;
      const answerNumberRaw = it.answerNumber ?? it.answerNo ?? it.pairNo ?? null;

      out.push({
        hlId,
        msgId,
        start: (start != null ? start : -1),
        end:   (end != null ? end : -1),
        color: color.toLowerCase(),
        text: text,
        role: UTIL_HT_normalizeRole(it.role || it.msgRole || it.authorRole || it.messageRole || it.type || ''),
        answerIndex: Number.isFinite(Number(answerIndexRaw)) ? Number(answerIndexRaw) : null,
        answerNumber: Number.isFinite(Number(answerNumberRaw)) ? Number(answerNumberRaw) : null,
      });
    };

    if (Array.isArray(obj)) {
      obj.forEach(it => pushItem(it, null));
      return out;
    }

    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj.items)) {
        obj.items.forEach(it => pushItem(it, null));
        return out;
      }
      if (obj.itemsByAnswer && typeof obj.itemsByAnswer === 'object') {
        for (const [answerId, arr] of Object.entries(obj.itemsByAnswer)) {
          if (!Array.isArray(arr)) continue;
          arr.forEach(it => pushItem(it, answerId));
        }
        return out;
      }
      // Map shape: { msgId: [ranges] }
      for (const k of Object.keys(obj)) {
        const arr = obj[k];
        if (!Array.isArray(arr)) continue;
        arr.forEach(it => pushItem(it, k));
      }
      return out;
    }

    return out;
  }

  /** @critical Build cache from storage; returns true if built. */
  function CORE_HT_buildFromStorage(helpers) {
    const { lsGet, jsonParse } = helpers;

    // Prefer live API from the Inline Highlighter engine (most accurate: per-range color).
    const api = UTIL_HT_getInlineApi();
    if (api?.listEntries) {
      try {
        const entries = api.listEntries({ includeText: true }) || [];
        const items = entries.map((e) => ({
          hlId: e.hlId || `${e.answerId}:${e.start}-${e.end}:${UTIL_HT_normalizeColor(e.colorName)}`,
          msgId: helpers.normalizeMsgId(e.answerId || e.msgId || ''),
          start: (typeof e.start === 'number' ? e.start : -1),
          end:   (typeof e.end === 'number' ? e.end : -1),
          color: UTIL_HT_normalizeColor(e.colorName || e.color || '').toLowerCase(),
          role: UTIL_HT_normalizeRole(e.role || e.msgRole || e.messageRole || e.type || ''),
          answerIndex: Number.isFinite(Number(e.answerIndex)) ? Number(e.answerIndex) : null,
          answerNumber: Number.isFinite(Number(e.answerNumber)) ? Number(e.answerNumber) : null,
          text:  UTIL_HT_s(e.text || '').trim(),
        })).filter(x => x.msgId);

        const capped = items.slice(0, CFG_HT.MAX_ITEMS_SOFT).map((x, i) => ({
          ...x,
          idx: i,
          colorRank: UTIL_HT_colorRank(x.color),
        }));

        CACHE.pickedKey = 'api:HoInline.listEntries';
        CACHE.lastRaw = '__api__';
        CACHE.lastBuiltAt = Date.now();
        CACHE.items = capped;
        return true;
      } catch (e) {
        // fall through to storage
      }
    }

    const picked = UTIL_HT_pickStoreKey(lsGet);
    CACHE.pickedKey = picked;

    if (!picked) return false;

    const raw = lsGet(picked);
    if (!raw || typeof raw !== 'string') return false;

    // If unchanged, keep existing cache.
    if (CACHE.lastRaw === raw && Array.isArray(CACHE.items) && CACHE.items.length) return true;

    const parsed = jsonParse(raw, null);
    const items = CORE_HT_normalizeFromStore(parsed);

    // Light sanitization + cap.
    const capped = items.slice(0, CFG_HT.MAX_ITEMS_SOFT).map((x, i) => ({
      ...x,
      idx: i,
      colorRank: UTIL_HT_colorRank(x.color),
    }));

    CACHE.lastRaw = raw;
    CACHE.lastBuiltAt = Date.now();
    CACHE.items = capped;

    return true;
  }

  /* ───────────────────────────── 5) DOM fallback (safe) ───────────────────────────── */

  /** @helper Find closest conversation-turn msgId for any element. */
  function UTIL_HT_findMsgIdFromEl(contract, el) {
    const { attr, helpers, sel } = contract;
    const { normalizeMsgId } = helpers;

    const host =
      el?.closest?.(`[${attr.ATTR_DPANEL_TESTID}^="conversation-turn-"]`) ||
      el?.closest?.(`[data-testid^="conversation-turn-"]`) ||
      null;

    const tid = host?.getAttribute?.(attr.ATTR_DPANEL_TESTID) || host?.getAttribute?.('data-testid') || '';
    const m = String(tid || '').match(/^conversation-turn-(.+)$/);
    if (m && m[1]) return normalizeMsgId(m[1]);

    // Last resort: scan nearest assistant/user message and use Core if available.
    const msgEl = el?.closest?.(sel.MSG_ANY) || null;
    const coreId = W.H2O?.msg?.getIdFromEl?.(msgEl);
    if (coreId) return normalizeMsgId(coreId);

    return '';
  }

  /** @helper Try infer highlight "color name" from style/class. */
  function UTIL_HT_inferColorFromMark(mark) {
    if (!mark) return 'gold';
    const cls = (mark.getAttribute('class') || '').toLowerCase();


    // dataset/class-based tokens (e.g. data-color="2", class="... c3 ...")
    const ds = (mark.dataset && (mark.dataset.color || mark.dataset.hoColor || mark.dataset.h2oColor)) ? (mark.dataset.color || mark.dataset.hoColor || mark.dataset.h2oColor) : '';
    if (ds != null && String(ds).trim()) return UTIL_HT_normalizeColor(ds);
    const mIdx = cls.match(/(?:^|\s)(?:c|col|color)[-_]?(\d+)\b/);
    if (mIdx && mIdx[1]) return UTIL_HT_normalizeColor(mIdx[1]);
// Common color words.
    for (const c of CFG_HT_COLOR_ORDER) {
      if (cls.includes(c)) return c;
    }

    // Background parsing fallback (very soft).
    try {
      const bg = getComputedStyle(mark).backgroundColor || '';
      return UTIL_HT_normalizeColor(bg);
    } catch (_) {}

    return 'gold';
  }

  /** @critical Build cache by scanning DOM marks (throttled). */
  function CORE_HT_buildFromDomFallback(contract) {
    const now = Date.now();
    if (now - CACHE.domFallbackAt < CFG_HT.DOM_FALLBACK_THROTTLE_MS && CACHE.items.length) return true;
    CACHE.domFallbackAt = now;

    const { sel } = contract;
    const marks = Array.from(document.querySelectorAll(sel.MARK_HL || 'mark[class*="inline-hl"]'));
    if (!marks.length) {
      CACHE.items = [];
      return true;
    }

    const items = [];
    for (let i = 0; i < marks.length && items.length < CFG_HT.MAX_ITEMS_SOFT; i++) {
      const m = marks[i];
      const msgId = UTIL_HT_findMsgIdFromEl(contract, m);
      if (!msgId) continue;

      const color = UTIL_HT_inferColorFromMark(m);
      const text = UTIL_HT_trunc(m.textContent || '');
      const hlId = `${msgId}:dom:${i}:${color}`;
      const msgHost = m.closest(contract.sel.MSG_ANY) || null;
      const role = UTIL_HT_normalizeRole(msgHost?.getAttribute('data-message-author-role') || msgHost?.dataset?.messageAuthorRole);

      items.push({
        hlId,
        msgId,
        start: -1,
        end: -1,
        color,
        text,
        role,
        idx: items.length,
        colorRank: UTIL_HT_colorRank(color),
      });
    }

    CACHE.items = items;
    CACHE.lastBuiltAt = now;
    return true;
  }

  /* ───────────────────────────── 6) Ping + Flash ───────────────────────────── */

  /** @critical Ensure ping styles + flash styles once. */
  function UI_HT_ensureStylesOnce(contract) {
    const { ui, cfg } = contract;
    const id = ui.ID_DPANEL_PING || 'cgxui-dcpn-ping';

    const STYLE_ID = `cgxui-${PID}-hl-tab-style`;
    if (document.getElementById(STYLE_ID)) return;

    const css = `
/* ===================== ${EMOJI_HDR} ${MODICON} ${MODTAG} ===================== */
#${id}{
  position: fixed;
  left: 50%;
  top: 18px;
  transform: translateX(-50%);
  z-index: ${cfg?.Z_PING ?? 2147483646};
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(20,20,20,0.92);
  border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.90);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.2px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.55);
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
}
#${id}[data-on="1"]{ opacity: 1; transform: translateX(-50%) translateY(0); }
#${id}[data-on="0"]{ opacity: 0; transform: translateX(-50%) translateY(-6px); }

mark.cgxui-inline-hl[data-h2o-flash="1"],
mark[class*="inline-hl"][data-h2o-flash="1"]{
  outline: 2px solid rgba(251,191,36,0.85);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.55), 0 0 18px rgba(251,191,36,0.25);
  transition: outline .18s ease, box-shadow .18s ease;
}
    .${SUMMARY_WRAPPER_CLASS}[${ATTR_SUMMARY_VISIBLE}="${SUMMARY_HIDDEN_VALUE}"]{
      display: none !important;
    }
    .${SUMMARY_WRAPPER_CLASS}[${ATTR_SUMMARY_VISIBLE}="${SUMMARY_VISIBLE_VALUE}"]{
      display: block;
    }
`;

    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.documentElement.appendChild(st);
  }

  /** @helper Ensure ping node. */
  function UI_HT_ensurePingNode(contract) {
    const { ui } = contract;
    const id = ui.ID_DPANEL_PING || 'cgxui-dcpn-ping';
    let el = document.getElementById(id);
    if (el) return el;

    el = document.createElement('div');
    el.id = id;
    el.setAttribute('data-on', '0');
    el.textContent = '';
    document.documentElement.appendChild(el);
    return el;
  }

  /** @helper Show ping. */
  function UI_HT_ping(contract, text) {
    const el = UI_HT_ensurePingNode(contract);
    el.textContent = text || 'Ping';
    el.setAttribute('data-on', '1');
    setTimeout(() => { try { el.setAttribute('data-on', '0'); } catch (_) {} }, CFG_HT.PING_MS);
  }

  /** @helper Flash a mark. */
  function UI_HT_flashMark(mark) {
    if (!mark) return;
    try { mark.setAttribute('data-h2o-flash', '1'); } catch (_) {}
    setTimeout(() => { try { mark.removeAttribute('data-h2o-flash'); } catch (_) {} }, CFG_HT.FLASH_MS);
  }

  /* ───────────────────────────── 7) Locate + Scroll ───────────────────────────── */

  /**
   * @critical Find the actual DOM mark for an item.
   * Strategy:
   * 1) Prefer marks within the target conversation-turn (fast).
   * 2) Try match by exact text snippet (best effort).
   * 3) Fallback: first mark in that message.
   */
  function CORE_HT_findMarkForItem(contract, item) {
    const { helpers, attr } = contract;
    const { selConversationTurnByEsc } = helpers;

    const msgId = item?.msgId;
    if (!msgId) return null;

    const esc = UTIL_HT_cssEsc(msgId);
    const host = document.querySelector(selConversationTurnByEsc(esc));
    const scope = host || document;

    const marks = Array.from(scope.querySelectorAll(contract.sel.MARK_HL || 'mark[class*="inline-hl"]'));
    if (!marks.length) return null;

    const want = (item.text || '').trim();
    if (want) {
      const exact = marks.find(m => (m.textContent || '').trim() === want);
      if (exact) return exact;

      const contained = marks.find(m => (m.textContent || '').trim().includes(want) || want.includes((m.textContent || '').trim()));
      if (contained) return contained;
    }

    // If we have a hlId that encodes offsets, we can sometimes match by data attributes (if your highlighter adds them).
    const byId =
      marks.find(m => (m.getAttribute(attr.ATTR_DPANEL_HL_ID) || '') === item.hlId) ||
      marks.find(m => (m.getAttribute('data-h2o-hl-id') || '') === item.hlId) ||
      null;
    if (byId) return byId;

    return marks[0] || null;
  }

  /** @critical Scroll to a highlight item; requests remount if needed. */
  function CORE_HT_scrollToItem(contract, item, apiDock) {
    const { helpers } = contract;
    const { requestRemountByMsgId, diagSafe } = helpers;

    const msgId = item?.msgId || '';
    if (!msgId) return false;

    // Ask unmount/core to ensure message exists.
    try { requestRemountByMsgId(msgId); } catch (_) {}
    try { apiDock?.ensurePanel?.(); } catch (_) {}

    // Try locate mark immediately; if not found, retry shortly (remount may take a beat).
    const attempt = (triesLeft) => {
      const mark = CORE_HT_findMarkForItem(contract, item);

      if (mark) {
        try { mark.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
        UI_HT_flashMark(mark);
        UI_HT_ping(contract, `Highlight • ${item.color || 'gold'}`);
        return true;
      }

      if (triesLeft <= 0) return false;

      setTimeout(() => attempt(triesLeft - 1), 120);
      return true;
    };

    const ok = attempt(6);
    if (!ok) diagSafe?.('hl:scroll:fail', { msgId, hlId: item?.hlId });
    return ok;
  }

  /* ───────────────────────────── 8) Render ───────────────────────────── */

  /** @helper Group items by answer/message id. */
  function UTIL_HT_groupByMsg(items) {
    const map = new Map();
    for (const it of items) {
      const k = it.msgId || '';
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return map;
  }

  /** @helper Group items by color. */
  function UTIL_HT_groupByColor(items) {
    const map = new Map();
    for (const it of items) {
      const k = (it.color || 'gold').toLowerCase();
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return map;
  }

  /** @helper Sort items according to current arrange. */
  function UTIL_HT_sortItems(items, arrange) {
    const a = String(arrange || 'order');
    const copy = items.slice(0);

    if (a === 'color') {
      copy.sort((x, y) => (x.colorRank - y.colorRank) || (x.msgId.localeCompare(y.msgId)) || (x.idx - y.idx));
      return copy;
    }

    // "order": keep stable order; if DOM fallback, idx approximates DOM order.
    copy.sort((x, y) => (x.msgId.localeCompare(y.msgId)) || (x.idx - y.idx));
    return copy;
  }


  /** @helper Render highlights-only modebar controls into Dock Panel shell. */
  function UI_HT_renderModebar(ctx) {
    const panelEl = ctx?.panelEl;
    const state = ctx?.state || {};
    const ui = ctx?.ui || {};
    const attr = ctx?.attr || {};
    if (!panelEl) return;

    const cgx = attr.ATTR_DPANEL_CGXUI;
    const modebarToken = ui.UI_DPANEL_MODEBAR;
    if (!cgx || !modebarToken) return;

    const modebarEl = panelEl.querySelector(`[${cgx}="${modebarToken}"]`);
    if (!modebarEl) return;

    // Build when empty (Dock Panel may clear this area on other views).
    const hasModeBtn = !!modebarEl.querySelector(`button[${attr.ATTR_DPANEL_MODE}]`);
    const hasArrBtn  = !!modebarEl.querySelector(`button[${attr.ATTR_DPANEL_ARRANGE}]`);
    if (!modebarEl.__h2oHlModebarBuilt || !hasModeBtn || !hasArrBtn) {
      const clsBlock = ui.CSS_DPANEL_CLS_BLOCK;
      const clsLabel = ui.CSS_DPANEL_CLS_LABEL;
      const clsPill  = ui.CSS_DPANEL_CLS_PILL;

      modebarEl.innerHTML = `
        <div class="${clsBlock}">
          <div class="${clsLabel}">Group by</div>
          <div class="${clsPill}">
            <button type="button" ${attr.ATTR_DPANEL_MODE}="answer">Answers</button>
            <button type="button" ${attr.ATTR_DPANEL_MODE}="color">Colors</button>
          </div>
        </div>

        <div class="${clsBlock}">
          <div class="${clsLabel}">Arrange by</div>
          <div class="${clsPill}">
            <button type="button" ${attr.ATTR_DPANEL_ARRANGE}="order">Order</button>
            <button type="button" ${attr.ATTR_DPANEL_ARRANGE}="color">Color</button>
          </div>
        </div>
      `.trim();

      modebarEl.__h2oHlModebarBuilt = 1;
    }

    // Sync active states to current Dock Panel state.
    const mode = String(state.mode || 'answer');
    const arrange = String(state.arrange || 'order');

    const setActive = (btn, isActive) => {
      try { btn.setAttribute(attr.ATTR_DPANEL_CGXUI_STATE, isActive ? 'active' : ''); } catch (_) {}
    };

    const modeBtns = modebarEl.querySelectorAll(`button[${attr.ATTR_DPANEL_MODE}]`);
    modeBtns.forEach((b) => setActive(b, b.getAttribute(attr.ATTR_DPANEL_MODE) === mode));

    const arrBtns = modebarEl.querySelectorAll(`button[${attr.ATTR_DPANEL_ARRANGE}]`);
    arrBtns.forEach((b) => setActive(b, b.getAttribute(attr.ATTR_DPANEL_ARRANGE) === arrange));
  }

/** @critical Render tab content into Dock Panel listEl. */
  function CORE_HT_renderTab(ctx, contract, apiDock) {
    const { listEl, state, helpers, ui, attr } = ctx;
    const { diagSafe, escapeHtml: helperEscape } = helpers || {};
    const escapeHtml = helperEscape || UTIL_HT_escapeHtml;

    UI_HT_ensureStylesOnce(contract);

    UI_HT_renderModebar(ctx);

    // Build cache (storage first, DOM fallback second).
    const builtStore = CORE_HT_buildFromStorage(helpers);
    if (!builtStore) CORE_HT_buildFromDomFallback(contract);

    const rawItems = Array.isArray(CACHE.items) ? CACHE.items : [];
    const items = UTIL_HT_sortItems(rawItems, state?.arrange);

    if (!items.length) {
      listEl.innerHTML = `<div class="${ui.CSS_DPANEL_CLS_EMPTY}">No highlights yet. Use your inline highlighter (⌘+§ / Ctrl+§) then come back here 🌈</div>`;
      return;
    }

    const mode = String(state?.mode || 'answer'); // 'answer' or 'color'

    // Build sections.
    let sections = [];

    if (mode === 'color') {
      const g = UTIL_HT_groupByColor(items);
      const colorKeys = Array.from(g.keys()).sort((a, b) => UTIL_HT_colorRank(a) - UTIL_HT_colorRank(b));

      sections = colorKeys.map((color) => ({
        title: color[0].toUpperCase() + color.slice(1),
        key: `color:${color}`,
        dot: color,
        items: g.get(color) || [],
      }));
    } else {
      const g = UTIL_HT_groupByMsg(items);
      // Sort message groups by appearance in list (based on earliest idx after sorting).
      const msgKeys = Array.from(g.keys());
      msgKeys.sort((a, b) => {
        const aa = g.get(a) || [];
        const bb = g.get(b) || [];
        const ai = aa.length ? Math.min(...aa.map(x => x.idx)) : 0;
        const bi = bb.length ? Math.min(...bb.map(x => x.idx)) : 0;
        return ai - bi || a.localeCompare(b);
      });

    sections = msgKeys.map((msgId) => {
      const its = g.get(msgId) || [];
      const dot = (its[0]?.color || 'gold').toLowerCase();
      const fallbackIndex = msgKeys.indexOf(msgId);
      const primary = its[0] || { msgId };
      const answerNum = UTIL_HT_resolveTurnIndex(primary, rawItems, fallbackIndex);
      const label = (primary.role === 'user') ? 'Question' : 'Answer';
      const title = answerNum ? `${label} ${answerNum}` : `${label} ${fallbackIndex + 1}`;
      const washColor = UTIL_HT_getWashColor(msgId);
      const washHex = washColor ? UTIL_HT_cssDot(washColor) : '';
      const hasWashFill = Boolean(washHex && mode === 'answer');
      let headerStyle = '';
      if (hasWashFill) {
        headerStyle = `background: ${UTIL_HT_hexToRgba(washHex, 0.26)}; box-shadow: inset 0 0 6px ${UTIL_HT_hexToRgba(washHex, 0.25)}; color: #fff; border: 1px solid ${UTIL_HT_hexToRgba(washHex, 0.45)};`;
      } else if (mode === 'answer') {
        headerStyle = 'background: rgba(210,210,210,0.18); color: #fff; box-shadow: inset 0 0 10px rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.35);';
      }
      return { title, key: `msg:${msgId}`, dot, headerStyle, items: its };
    });
    }

    const makeSummaryHtml = (secItems) => {
      const counts = new Map();
      for (const it of secItems) {
        const c = (it.color || 'gold').toLowerCase();
        counts.set(c, (counts.get(c) || 0) + 1);
      }
      const keys = Array.from(counts.keys()).sort((a, b) => UTIL_HT_colorRank(a) - UTIL_HT_colorRank(b));
      const parts = keys.map(c => `
        <span class="${ui.CSS_DPANEL_CLS_SUM_ITEM}">
          <span class="${ui.CSS_DPANEL_CLS_DOT}" style="--dot-color:${UTIL_HT_cssDot(c)}"></span>${counts.get(c)}
        </span>
      `);
      const summaryInner = `<div class="${ui.CSS_DPANEL_CLS_SUMMARY}">${parts.join('')}</div>`;
      return `
        <div class="${SUMMARY_WRAPPER_CLASS}" ${ATTR_SUMMARY_VISIBLE}="${SUMMARY_HIDDEN_VALUE}">
          ${summaryInner}
        </div>
      `;
    };

    const rowsHtml = (secItems) => secItems.map((it) => {
      const dot = UTIL_HT_cssDot(it.color);
      const txt = escapeHtml(UTIL_HT_trunc(it.text || '(highlight)'));
      const hlIdSafe = escapeHtml(it.hlId);
      const msgIdSafe = escapeHtml(it.msgId);

      return `
        <button class="${ui.CSS_DPANEL_CLS_ROW}" ${attr.ATTR_DPANEL_HL_ID}="${hlIdSafe}" ${attr.ATTR_DPANEL_MSG_ID}="${msgIdSafe}">
          <span class="${ui.CSS_DPANEL_CLS_DOT}" style="--dot-color:${dot}"></span>
          <span class="${ui.CSS_DPANEL_CLS_ROW_MAIN}">
            <span class="${ui.CSS_DPANEL_CLS_ROW_TEXT}">${txt}</span>
          </span>
        </button>
      `;
    }).join('');

    const secHtml = sections.map((sec) => {
      const title = escapeHtml(sec.title);
      const body = rowsHtml(sec.items);
      const summary = makeSummaryHtml(sec.items);
      const hasHeaderDot = (mode === 'color' && sec.dot);
      const headerDotHtml = hasHeaderDot
        ? `<span class="${ui.CSS_DPANEL_CLS_DOT}" style="--dot-color:${UTIL_HT_cssDot(sec.dot)}"></span>`
        : '';
      const headerStyleAttr = sec.headerStyle ? `style="${sec.headerStyle}"` : '';

      return `
        <div class="${ui.CSS_DPANEL_CLS_SEC}" data-sec="${escapeHtml(sec.key)}" ${attr.ATTR_DPANEL_COLLAPSED}="false">
          <button class="${ui.CSS_DPANEL_CLS_SEC_TITLE}" type="button" ${ATTR_SUMMARY_TOGGLE}="1" ${headerStyleAttr}>
            ${headerDotHtml}
            <span>${title}</span>
            <span class="${ui.CSS_DPANEL_CLS_CHEVRON}" aria-hidden="true">▾</span>
          </button>
          ${body}
          ${summary}
        </div>
      `;
    }).join('');

    listEl.innerHTML = secHtml;

    if (!listEl.__h2oHlSummaryDbl) {
      const getChildren = (section) => Array.from(section.children).slice(1);
      const ensureSectionOpen = (section) => {
        section.setAttribute(attr.ATTR_DPANEL_COLLAPSED, 'false');
        const kids = getChildren(section);
        kids.forEach(k => { k.style.display = ''; });
        const chev = section.querySelector(`.${ui.CSS_DPANEL_CLS_CHEVRON}`);
        if (chev) chev.textContent = '▾';
      };
      const toggleSummary = (section) => {
        const summary = section.querySelector(`.${SUMMARY_WRAPPER_CLASS}`);
        if (!summary) return;
        const isVisible = (summary.getAttribute(ATTR_SUMMARY_VISIBLE) === SUMMARY_VISIBLE_VALUE);
        summary.setAttribute(ATTR_SUMMARY_VISIBLE, isVisible ? SUMMARY_HIDDEN_VALUE : SUMMARY_VISIBLE_VALUE);
      };

      const dblClickHandler = (evt) => {
        const trigger = evt.target?.closest?.(`[${ATTR_SUMMARY_TOGGLE}]`);
        if (!trigger) return;
        const section = trigger.closest('[data-sec]');
        if (!section) return;
        evt.preventDefault();
        evt.stopPropagation();
        ensureSectionOpen(section);
        toggleSummary(section);
      };

      listEl.addEventListener('dblclick', dblClickHandler);
      listEl.__h2oHlSummaryDbl = dblClickHandler;
    }

    // Attach lookup table for click handler (fast).
    // (No global mutation; stored on the list element only.)
    try {
      listEl.__h2oHlTab = { itemsById: CORE_HT_indexById(items) };
    } catch (e) {
      diagSafe?.('hl:bind:err', String(e?.stack || e));
    }
  }

  /** @helper Build id -> item map. */
  function CORE_HT_indexById(items) {
    const m = new Map();
    for (const it of items) m.set(it.hlId, it);
    return m;
  }

  /** @helper Map color name to CSS dot color. */
  function UTIL_HT_cssDot(color) {
    const raw = String(color || 'gold').trim();
    // allow direct CSS colors coming from legacy stores (hex/rgb)
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
    if (/^rgb(a)?\(/i.test(raw)) return raw;

    const c = raw.toLowerCase();
    switch (c) {
      case 'green':  return '#22c55e';
      case 'red':    return '#ef4444';
      case 'blue':   return '#3b82f6';
      case 'orange': return '#f97316';
      case 'purple': return '#a855f7';
      case 'pink':   return '#ec4899';
      case 'sky':    return '#38bdf8';
      case 'gold':
      default:       return '#fbbf24';
    }
  }

  function UTIL_HT_hexToRgba(color, alpha = 1) {
    if (!color) return '';
    const str = String(color).trim();
    const hexMatch = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    const rgbMatch = str.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return str;
  }

function UTIL_HT_readWashMapFromDisk() {
  if (!CFG_HT_WASH_DISK_FALLBACK) return null;

  // cache 1.5s (fast scrolling / frequent renders)
  const now = Date.now();
  if (HT_washDiskCache.map && (now - HT_washDiskCache.at) < 1500) return HT_washDiskCache.map;

  const tryParseObj = (raw) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
    return null;
  };

  let map = null;
  try { map = tryParseObj(localStorage.getItem(KEY_HT_WASH_NEW)); } catch {}
  if (!map) {
    try { map = tryParseObj(localStorage.getItem(KEY_HT_WASH_OLD)); } catch {}
  }

  HT_washDiskCache = { at: now, map: map || null };
  return HT_washDiskCache.map;
}



function UTIL_HT_getWashColor(msgId) {
  if (!msgId) return null;
// ✅ Prefer runtime wash channel if present
let map =
  W.H2O?.MM?.washMap ||
  ((W.top && W.top.H2O_MM_washMap) ? W.top.H2O_MM_washMap : null) ||
  (W.H2O_MM_washMap || null);

// ✅ If MiniMap isn't booted yet, read from disk (new → old)
if (!map || typeof map !== 'object') {
  map = UTIL_HT_readWashMapFromDisk();
}

if (!map || typeof map !== 'object') return null;


  const normalize = (id) => String(id || '').trim();
  const norm = normalize(msgId);
  const candidates = [
    norm,
    norm.replace(/^conversation-turn-/, ''),
    norm.replace(/^turn:/, ''),
    `turn:${norm}`,
    `msg:${norm}`
  ];

  for (const key of candidates) {
    if (!key) continue;
    const val = map[key];
    if (val) return val;
  }
  return null;
}

  /* ───────────────────────────── 9) Tab API (Dock.registerTab) ───────────────────────────── */

  /** @core Create the tab definition used by Dock Panel. */
  function CORE_HT_makeTab(contract, apiDock) {
    const { helpers, ui, attr } = contract;

    return {
      id: 'highlights',
      title: 'Highlights',
      /**
       * @critical Render function called by Dock Panel render router.
       * ctx = { panelEl, listEl, view, state, helpers, api }
       */
      render(ctx) {
        const safeCtx = {
          ...ctx,
          helpers: contract.helpers, // force contract helpers (stable)
          ui: contract.ui,
          attr: contract.attr,
        };
        CORE_HT_renderTab(safeCtx, contract, apiDock);
      },

      /**
       * @critical Row click hook called by Dock Panel click router.
       * payload = { rowEl, panelEl, listEl, view, state, helpers, api }
       */
      onRowClick(payload) {
        const rowEl = payload?.rowEl;
        const listEl = payload?.listEl;
        if (!rowEl || !listEl) return;

        const hlId = rowEl.getAttribute(attr.ATTR_DPANEL_HL_ID) || '';
        const msgId = rowEl.getAttribute(attr.ATTR_DPANEL_MSG_ID) || '';
        const lookup = listEl.__h2oHlTab?.itemsById || null;

        const item = (lookup && hlId && lookup.get?.(hlId)) ? lookup.get(hlId) : (hlId ? { hlId, msgId } : { msgId });

        if (item && item.msgId) {
          CORE_HT_scrollToItem(contract, item, apiDock);
        }
      },
    };
  }

  /* ───────────────────────────── 10) Boot ───────────────────────────── */

  /** @critical Boot once: register tab. */
  async function CORE_HT_boot() {
    const onceKey = `${NS_MEM_ONCE}:boot`;
    if (STATE.booted || W[onceKey]) return;
    STATE.booted = true;
    W[onceKey] = 1;
    DIAG.bootCount += 1;
    DIAG.lastBootAt = Date.now();

    const apiDock = await UTIL_HT_waitForDockPanelApi(6000);
    if (!apiDock) return;

    const contract = apiDock.getContract();
    if (!contract?.helpers || !contract?.ui || !contract?.attr) return;

    // Ensure styles/ping infra exists (cheap).
    UI_HT_ensureStylesOnce(contract);
    UI_HT_ensurePingNode(contract);

    // Register tab (idempotent).
    const Dock = W.H2O?.Dock;
    if (!Dock?.registerTab) return;

    const tab = CORE_HT_makeTab(contract, apiDock);
    Dock.registerTab('highlights', tab);

    // If panel is already open on highlights, request a repaint (smooth handoff).
    try { apiDock.requestRender?.(); } catch (_) {}
  }

  CORE_HT_boot();
})();
