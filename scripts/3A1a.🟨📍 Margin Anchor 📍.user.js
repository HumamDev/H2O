// ==UserScript==
// @h2o-id      3a.margin.anchor
// @name         3A.🟨📍 Margin Anchor 📍
// @namespace    H2O.Prime.CGX.MarginAnchor
// @version      1.4.7
// @description  Margin Anchor (H2O): left margin anchors with multi-pin dots (Status + Note) + compact popup controls. Sticky Notes portal is split into 3b script (hard-linked via H2O vault + events). No feature loss.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * H2O Module Standard — Contract (v2.0) 💧✅  — STAGE 1 (Mechanics only) 🧱⚙️
   * ========================================================================= */

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  /* [DEFINE][META] Identity (LOCKED first) */
  const TOK = 'MA'; // Margin Anchor → MA

  // ✅ CANONICAL IDs (contracts)
  const PID  = 'mrgnnchr'; // canonical: Disk + Brain shelf key
  const SkID = 'mrnc';     // canonical: Skin/UI hooks (cgxui-*)

  // 🏷️ Identifier prefix (constants only; NOT disk/brain/skin)
  const CID = 'manchor';   // Margin Anchor → MANCHOR (constant naming only)

  // labels only
  const MODTAG = 'MAnchor';
  const SUITE  = 'prm';
  const HOST   = 'cgx';

  // ✅ OPTIONAL ALIASES (readability only — NOT new identities)
  const DsID = PID;        // Disk alias (same exact value)
  const BrID = PID;        // Brain alias (same exact value)

  // for identifier names only
  const PID_UP  = PID.toUpperCase();
  const CID_UP  = CID.toUpperCase(); // "manchor" -> "MANCHOR"

  /* [DEFINE][META] Runtime vault (Brain shelf) */
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD_OBJ.meta = MOD_OBJ.meta || { tok: TOK, pid: PID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };
  MOD_OBJ.api  = MOD_OBJ.api  || {}; // ✅ public surface (versioned sub-APIs live here)

  /* [DEFINE][META] Optional ecosystem registries (MODE B: warn + keep first) */
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

  /* [DEFINE][STORE] Namespace prefixes (Disk + Events) */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;    // no trailing :
  const NS_EV   = `h2o.ev:${SUITE}:${HOST}:${DsID}`; // no trailing :

  /* [DEFINE][DOM] Attribute NAMES (real attribute strings) */
  const ATTR_MSG_ID      = 'data-message-id';
  const ATTR_CGXUI       = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';

  /* [STORE][MAnchor] Keys (versioned) — CID-based identifiers, DsID-based values */
  const KEY_MANCHOR_STATE_PINS_V1 = `${NS_DISK}:state:pins:v1`;
  const KEY_MANCHOR_SYMBOLS_V1    = `${NS_DISK}:symbols:v1`;
  const KEY_MANCHOR_SYMBOL_COLORS_V1 = `${NS_DISK}:symbols_colors:v1`;

  /* [API][MAnchor] Events (topics) — CID-based identifiers, DsID-based values */
  const EV_MANCHOR_READY_V1       = `${NS_EV}:ready:v1`;
  const EV_MANCHOR_NOTE_TOGGLE_V1 = `${NS_EV}:note:toggle:v1`;
  const EV_MANCHOR_NOTE_CLOSE_V1  = `${NS_EV}:note:close:v1`;
  const EV_MANCHOR_NOTE_STATE_V1  = `${NS_EV}:note:state:v1`; // notes -> core (open/closed)
  const EV_MANCHOR_SYMBOLS_CHANGED = 'evt:h2o:margin:symbols:changed';

  /* [UI][MAnchor] UI tokens (values are SkID-based) */
  const UI_MANCHOR_GUTTER = `${SkID}-gutter`;
  const UI_MANCHOR_MARKS  = `${SkID}-marks`;
  const UI_MANCHOR_PINGRP = `${SkID}-pingrp`;
  const UI_MANCHOR_PINDOT = `${SkID}-pindot`;
  const UI_MANCHOR_LABEL  = `${SkID}-label`;

  /* [UI][MAnchor] Popup tokens */
  const UI_MANCHOR_POP_TOP    = `${SkID}-pop-top`;
  const UI_MANCHOR_POP_TOPROW = `${SkID}-pop-toprow`;
  const UI_MANCHOR_POP_ACTDOT = `${SkID}-pop-actdot`;
  const UI_MANCHOR_POP        = `${SkID}-pop`;

  const UI_MANCHOR_POP_TITLE  = `${SkID}-pop-title`;
  const UI_MANCHOR_POP_BACK   = `${SkID}-pop-back`;
  const UI_MANCHOR_POP_BTN    = `${SkID}-pop-btn`;
  const UI_MANCHOR_POP_DOT    = `${SkID}-pop-dot`;
  const UI_MANCHOR_POP_LBL    = `${SkID}-pop-lbl`;
  const UI_MANCHOR_POP_NOTE   = `${SkID}-pop-note`;
  const UI_MANCHOR_POP_ROW    = `${SkID}-pop-row`;
  const UI_MANCHOR_POP_SMALL  = `${SkID}-pop-small`;

  const UI_MANCHOR_POP_HUB     = `${SkID}-pop-hub`;
  const UI_MANCHOR_POP_CHIPS   = `${SkID}-pop-chips`;
  const UI_MANCHOR_POP_CHIP    = `${SkID}-pop-chip`;
  const UI_MANCHOR_POP_GROUP   = `${SkID}-pop-group`;
  const UI_MANCHOR_POP_SUM     = `${SkID}-pop-sum`;
  const UI_MANCHOR_POP_ITEM    = `${SkID}-pop-item`;
  const UI_MANCHOR_POP_ITEMTXT = `${SkID}-pop-itemtxt`;
  const UI_MANCHOR_POP_META    = `${SkID}-pop-meta`;
  const UI_MANCHOR_POP_ICONS   = `${SkID}-pop-icons`;
  const UI_MANCHOR_POP_ICON    = `${SkID}-pop-icon`;
  const UI_MANCHOR_POP_EDITOR  = `${SkID}-pop-editor`;
  const UI_MANCHOR_POP_FIELD   = `${SkID}-pop-field`;
  const UI_MANCHOR_POP_SWROW   = `${SkID}-pop-swrow`;
  const UI_MANCHOR_POP_HELP    = `${SkID}-pop-help`;
  const UI_MANCHOR_POP_PALETTE = `${SkID}-pop-palette`;
  const UI_MANCHOR_POP_SWATCH  = `${SkID}-pop-swatch`;

  const UI_MANCHOR_POP_TABS     = `${SkID}-pop-tabs`;
const UI_MANCHOR_POP_TAB      = `${SkID}-pop-tab`;
const UI_MANCHOR_POP_PANE     = `${SkID}-pop-pane`;
const UI_MANCHOR_POP_OVERVIEW = `${SkID}-pop-overview`;
const UI_MANCHOR_POP_KV       = `${SkID}-pop-kv`;
const UI_MANCHOR_POP_K        = `${SkID}-pop-k`;
const UI_MANCHOR_POP_V        = `${SkID}-pop-v`;

    const UI_MANCHOR_POP_SECTION  = `${SkID}-pop-section`;
  const UI_MANCHOR_POP_SECTITLE = `${SkID}-pop-sectitle`;
  const UI_STATE_SHINE          = 'shine';


  /* [UI][MAnchor] UI states */
  const UI_STATE_BOUND = 'bound';
  const UI_STATE_OPEN  = 'open';

  /* [CSS][MAnchor] Style id + vars (values are SkID-based) */
  const CSS_MANCHOR_STYLE_ID  = `cgxui-${SkID}-style`;
  const CSS_MANCHOR_VAR_COLOR = `--cgxui-${SkID}-color`;

  /* [DOM][MAnchor] Selectors registry */
  const SEL_MANCHOR_ASSISTANT  = '[data-message-author-role="assistant"]';
  const SEL_MANCHOR_TURN       = '[data-testid="conversation-turn"]';
  const SEL_MANCHOR_TURN_MSGID = `[${ATTR_MSG_ID}]`;

  const SEL_MANCHOR_CONTENT_MD    = '.markdown';
  const SEL_MANCHOR_CONTENT_PROSE = '.prose';

  const SEL_MANCHOR_POP          = `[${ATTR_CGXUI}="${UI_MANCHOR_POP}"]`;
  const SEL_MANCHOR_GUTTER_LAYER = `[${ATTR_CGXUI}="${UI_MANCHOR_GUTTER}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_MANCHOR_MARKS_LAYER  = `[${ATTR_CGXUI}="${UI_MANCHOR_MARKS}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

  const SEL_MANCHOR_GUTTER_CHILD = `:scope > ${SEL_MANCHOR_GUTTER_LAYER}`;
  const SEL_MANCHOR_MARKS_CHILD  = `:scope > ${SEL_MANCHOR_MARKS_LAYER}`;
  /* [EV][SYS] DOM/Window event names (no raw strings in listeners) */
  const EV_DOC_MOUSEDOWN       = 'mousedown';
  const EV_DOC_KEYDOWN         = 'keydown';
  const EV_WIN_SCROLL          = 'scroll';
  const EV_WIN_RESIZE          = 'resize';
  const EV_DOM_CONTENT_LOADED  = 'DOMContentLoaded';


  /* [CFG][MAnchor] Config knobs */
  const CFG_MANCHOR = {
    AUTO_START: true,

    GUTTER_W_PX: 58,
    GUTTER_GAP_PX: 10,
    GUTTER_SHIFT_X_PX: -58,
    MARKS_SHIFT_X_PX: -58,
    GUTTER_Z: 8,

    PIN_Z: 9,
    PIN_SIZE_PX: 10,
    PIN_HIT_PX: 18,

    NOTE_DEFAULT_COLOR: '#ffd24a',
    NOTE_COLORS: ['#ffd24a', '#86efac', '#fda4af', '#93c5fd', '#c4b5fd', '#ffffff'],

    FP_RADIUS: 24,

    POPUP_Z: 999999,
    POPUP_GAP_PX: 10,

    ENABLE_TAGS: true,
    ENABLE_LINKS: true,
    ENABLE_ASKQUOTE: true,

    REBUILD_THROTTLE_MS: 80,
    MAX_PINS_PER_MSG: 300
  };

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */
  const UTIL_storage = {
    getStr(key, fallback = null) {
      try { return localStorage.getItem(String(key)) ?? fallback; } catch { return fallback; }
    },
    setStr(key, val) {
      try { localStorage.setItem(String(key), String(val)); return true; } catch { return false; }
    },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(String(key), JSON.stringify(obj)); return true; } catch { return false; }
    }
  };

  function STORE_MA_isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  function UTIL_uid() {
    return (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  }

  function STORE_MA_normalizeStore(raw) {
    const out = {};
    if (!STORE_MA_isObj(raw)) return out;

    for (const [msgId, bucketsRaw] of Object.entries(raw)) {
      if (!msgId) continue;

      const bucketsArr = Array.isArray(bucketsRaw)
        ? bucketsRaw
        : (STORE_MA_isObj(bucketsRaw) ? Object.values(bucketsRaw) : []);

      const byOff = new Map();

      for (const b0 of bucketsArr) {
        if (!b0) continue;

        const a0 = STORE_MA_isObj(b0.a) ? b0.a : (STORE_MA_isObj(b0) ? b0 : {});
        const off = Number(a0.off ?? b0.off ?? 0);
        const fp  = String(a0.fp ?? b0.fp ?? '');

        if (!Number.isFinite(off)) continue;

        let itemsRaw = b0.items ?? a0.items ?? [];
        if (STORE_MA_isObj(itemsRaw)) itemsRaw = Object.values(itemsRaw);
        if (!Array.isArray(itemsRaw)) itemsRaw = [];

        const items = [];
        for (const it0 of itemsRaw) {
          if (!STORE_MA_isObj(it0)) continue;
          const id = String(it0.id ?? UTIL_uid());
          const type = String(it0.type ?? '');
          if (!type) continue;

          const data = STORE_MA_isObj(it0.data) ? it0.data : {};
          const ui = STORE_MA_isObj(it0.ui) ? it0.ui : {};
          const ts = Number(it0.ts ?? Date.now());

          items.push({ id, type, data, ui, ts });
        }

        const prev = byOff.get(off);
        if (!prev) {
          byOff.set(off, { a: { off, fp }, items: items.slice() });
        } else {
          const seen = new Set(prev.items.map(x => x.id));
          for (const it of items) {
            if (!seen.has(it.id)) { prev.items.push(it); seen.add(it.id); }
          }
        }
      }

      out[msgId] = Array.from(byOff.values()).sort((x, y) => x.a.off - y.a.off);
    }
    return out;
  }

  function UTIL_noteKey(msgId, off) {
    return `${msgId}:${off}`;
  }

  function UTIL_registryExtend(regObj, additions, label) {
    for (const [k, v] of Object.entries(additions || {})) {
      if (regObj[k] != null) {
        try { console.warn(`[H2O][${label}] registry collision: ${k}`); } catch {}
        continue;
      }
      regObj[k] = v;
    }
  }

  function UTIL_getContentRoot(msgEl) {
    return msgEl.querySelector?.(SEL_MANCHOR_CONTENT_MD)
      || msgEl.querySelector?.(SEL_MANCHOR_CONTENT_PROSE)
      || msgEl;
  }

  function UTIL_getMsgId(msgEl) {
    if (!msgEl) return '';

    const direct =
      (msgEl.getAttribute?.(ATTR_MSG_ID) || msgEl.dataset?.messageId || msgEl.id || '').trim();
    if (direct) return direct;

    const holder =
      msgEl.closest?.(SEL_MANCHOR_TURN_MSGID) ||
      msgEl.closest?.(`${SEL_MANCHOR_TURN} ${SEL_MANCHOR_TURN_MSGID}`) ||
      msgEl.closest?.(SEL_MANCHOR_TURN) ||
      null;

    return (holder?.getAttribute?.(ATTR_MSG_ID) || holder?.dataset?.messageId || holder?.id || '').trim() || '';
  }

  function UTIL_caretRangeAtPoint(x, y) {
    if (D.caretRangeFromPoint) return D.caretRangeFromPoint(x, y);
    if (D.caretPositionFromPoint) {
      const pos = D.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const r = D.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.setEnd(pos.offsetNode, pos.offset);
      return r;
    }
    return null;
  }

  function UTIL_getTextNodes(root) {
    const out = [];
    const walker = D.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n?.nodeValue) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_ACCEPT;

        if (p.closest?.(SEL_MANCHOR_POP)) return NodeFilter.FILTER_REJECT;
        if (p.closest?.(SEL_MANCHOR_GUTTER_LAYER)) return NodeFilter.FILTER_REJECT;
        if (p.closest?.(SEL_MANCHOR_MARKS_LAYER)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function UTIL_getFullText(root) {
    return UTIL_getTextNodes(root).map(n => n.nodeValue).join('');
  }

  function UTIL_rangeToOffset(root, range) {
    const nodes = UTIL_getTextNodes(root);
    let acc = 0;
    for (const tn of nodes) {
      if (tn === range.startContainer) return acc + range.startOffset;
      acc += tn.nodeValue.length;
    }
    return acc;
  }

  function UTIL_offsetToRange(root, off) {
    const nodes = UTIL_getTextNodes(root);
    let acc = 0;
    for (const tn of nodes) {
      const len = tn.nodeValue.length;
      if (off <= acc + len) {
        const r = D.createRange();
        const inner = Math.max(0, off - acc);
        const at = Math.min(inner, len);
        r.setStart(tn, at);
        r.setEnd(tn, at);
        return r;
      }
      acc += len;
    }
    const r = D.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    return r;
  }

  function UTIL_makeFingerprint(root, off) {
    const text = UTIL_getFullText(root);
    if (!text) return '';
    const a = Math.max(0, off - CFG_MANCHOR.FP_RADIUS);
    const b = Math.min(text.length, off + CFG_MANCHOR.FP_RADIUS);
    return text.slice(a, b);
  }

  function UTIL_computeAnchorFromClick(msgEl, clientX, clientY) {
    const contentRoot = UTIL_getContentRoot(msgEl);
    const cr = contentRoot.getBoundingClientRect();

    const x = Math.round(Math.min(cr.left + 90, cr.left + cr.width * 0.35));
    const y = Math.round(clientY);

    const caret = UTIL_caretRangeAtPoint(x, y);
    if (!caret) return null;

    const off = UTIL_rangeToOffset(contentRoot, caret);
    const fp = UTIL_makeFingerprint(contentRoot, off);
    return { off, fp };
  }

  function UTIL_anchorToY(msgEl, a) {
    const contentRoot = UTIL_getContentRoot(msgEl);
    const text = UTIL_getFullText(contentRoot);
    const n = text.length;

    let off = Math.max(0, Math.min(a?.off || 0, n));
    let off2 = Math.min(off + 1, n);

    if (off2 === off && off > 0) { off2 = off; off = off - 1; }

    const r = D.createRange();
    const r1 = UTIL_offsetToRange(contentRoot, off);
    const r2 = UTIL_offsetToRange(contentRoot, off2);

    r.setStart(r1.startContainer, r1.startOffset);
    r.setEnd(r2.startContainer, r2.startOffset);

    const rects = r.getClientRects();
    const rr = (rects && rects[0]) ? rects[0] : r.getBoundingClientRect();
    const mr = msgEl.getBoundingClientRect();

    if (!rr || !mr) return 10;
    const raw = Math.round((rr.top - mr.top) + 1);
    const h = (msgEl.scrollHeight || mr.height || 0);
    return Math.max(6, Math.min(h - 6, raw));
  }

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — DIAG 📝🔓💧 ───────────────────────────── */
  MOD_OBJ.diag = MOD_OBJ.diag || {
    name: MODTAG,
    bootId: Math.random().toString(36).slice(2),
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 160,
    errMax: 30
  };
  const DIAG = MOD_OBJ.diag;

  // Normalize (fail-soft)
  try { if (!Array.isArray(DIAG.steps)) DIAG.steps = []; } catch {}
  try { if (!Array.isArray(DIAG.errors)) DIAG.errors = []; } catch {}
  try { if (!Number.isFinite(DIAG.bufMax)) DIAG.bufMax = 160; } catch {}
  try { if (!Number.isFinite(DIAG.errMax)) DIAG.errMax = 30; } catch {}

  function DIAG_step(msg) {
    try {
      DIAG.steps.push(String(msg));
      if (DIAG.steps.length > DIAG.bufMax) DIAG.steps.splice(0, DIAG.steps.length - DIAG.bufMax);
    } catch {}
  }
  function DIAG_error(err) {
    try {
      DIAG.errors.push(String(err && err.stack ? err.stack : err));
      if (DIAG.errors.length > DIAG.errMax) DIAG.errors.splice(0, DIAG.errors.length - DIAG.errMax);
    } catch {}
  }

/* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */
  const STATE = {
    booted: false,
    disposers: [],
    repaintTimerByMsg: new Map(),
    origPosByMsg: new Map(),
    origOverflowByMsg: new Map(),
    popEl: null,
    obsResize: null,
    obsMut: null,

    muting: 0,
    refreshAllTimer: 0,
    roObserved: new WeakSet(),

    // Core only (notes portal moved out)
    didLegacyScan: false
  };

  /* ───────────────────────────── 🟥 ENGINE — STORE + ITEMS 📝🔓💥 ───────────────────────────── */
  function STATE_loadStoreV1() {
    let store = UTIL_storage.getJSON(KEY_MANCHOR_STATE_PINS_V1, null);
    store = STORE_MA_normalizeStore(store);
    return store;
  }

  function STATE_saveStoreV1(store) {
    UTIL_storage.setJSON(KEY_MANCHOR_STATE_PINS_V1, store || {});
  }

  function STATE_sameStringArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (String(a[i] || '') !== String(b[i] || '')) return false;
    }
    return true;
  }

  function STATE_collectSymbolEntriesForMsg(store, msgId) {
    const id = String(msgId || '').trim();
    if (!id || !STORE_MA_isObj(store)) return [];
    const buckets = Array.isArray(store[id]) ? store[id] : [];
    const out = [];
    let seq = 0;
    for (const b of buckets) {
      const items = Array.isArray(b?.items) ? b.items : [];
      for (const it of items) {
        if (!it || it.type !== 'symbol') continue;
        const sym = String(it?.data?.symbol || '').trim();
        if (!sym) continue;
        const color = String(it?.data?.color || it?.ui?.color || '').trim();
        const ts = Number(it?.ts);
        seq += 1;
        out.push({
          symbol: sym,
          color,
          ts: Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER,
          seq,
        });
      }
    }
    if (!out.length) return [];
    out.sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
    return out.map((x) => ({ symbol: x.symbol, color: x.color }));
  }

  function STATE_collectSymbolsForMsg(store, msgId) {
    return STATE_collectSymbolEntriesForMsg(store, msgId).map((x) => x.symbol);
  }

  function STATE_collectSymbolColorsForMsg(store, msgId) {
    return STATE_collectSymbolEntriesForMsg(store, msgId).map((x) => x.color);
  }

  function STATE_emitSymbolsChanged(msgId, symbols, colors = []) {
    const answerId = String(msgId || '').trim();
    if (!answerId) return false;
    const detail = {
      answerId,
      symbols: (Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').trim()).filter(Boolean),
      colors: (Array.isArray(colors) ? colors : []).map((c) => String(c || '').trim()),
    };
    try {
      W.dispatchEvent(new CustomEvent(EV_MANCHOR_SYMBOLS_CHANGED, { detail }));
      return true;
    } catch {
      return false;
    }
  }

  function STATE_syncSymbolsForMsg(store, msgId, opts = {}) {
    const id = String(msgId || '').trim();
    if (!id) return [];

    const safeStore = STORE_MA_isObj(store) ? store : STATE_loadStoreV1();
    const next = STATE_collectSymbolsForMsg(safeStore, id);
    const nextColors = STATE_collectSymbolColorsForMsg(safeStore, id);

    const rawMap = UTIL_storage.getJSON(KEY_MANCHOR_SYMBOLS_V1, null);
    const map = STORE_MA_isObj(rawMap) ? rawMap : {};
    const rawColorMap = UTIL_storage.getJSON(KEY_MANCHOR_SYMBOL_COLORS_V1, null);
    const colorMap = STORE_MA_isObj(rawColorMap) ? rawColorMap : {};
    const prev = Array.isArray(map[id]) ? map[id].map((s) => String(s || '').trim()).filter(Boolean) : [];
    const prevColors = Array.isArray(colorMap[id]) ? colorMap[id].map((c) => String(c || '').trim()) : [];
    const had = Object.prototype.hasOwnProperty.call(map, id) || Object.prototype.hasOwnProperty.call(colorMap, id);
    const changed = !STATE_sameStringArray(prev, next)
      || !STATE_sameStringArray(prevColors, nextColors)
      || (had && !next.length);
    if (!changed) return next;

    if (next.length) {
      map[id] = next;
      colorMap[id] = nextColors;
    } else {
      delete map[id];
      delete colorMap[id];
    }
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOLS_V1, map);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_COLORS_V1, colorMap);

    if (opts.emit !== false) STATE_emitSymbolsChanged(id, next, nextColors);
    return next;
  }

  function STATE_rebuildSymbolsMapV1(storeIn = null) {
    const store = STORE_MA_isObj(storeIn) ? storeIn : STATE_loadStoreV1();
    const out = {};
    const outColors = {};
    for (const [msgId] of Object.entries(store || {})) {
      const symbols = STATE_collectSymbolsForMsg(store, msgId);
      if (!symbols.length) continue;
      out[msgId] = symbols;
      outColors[msgId] = STATE_collectSymbolColorsForMsg(store, msgId);
    }
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOLS_V1, out);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_COLORS_V1, outColors);
    return out;
  }

  function STATE_getOrCreateBucket(store, msgId, a) {
    const arr = store[msgId] || [];
    let b = arr.find(x => x?.a?.off === a.off);
    if (!b) {
      b = { a: { off: a.off, fp: a.fp || '' }, items: [] };
      arr.push(b);
      store[msgId] = arr;
    }
    return b;
  }

  function STATE_getBucket(store, msgId, off) {
    const arr = store[msgId] || [];
    return arr.find(x => x?.a?.off === off) || null;
  }

  function CORE_MA_addItem(msgEl, a, item) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    const store = STATE_loadStoreV1();
    const b = STATE_getOrCreateBucket(store, msgId, a);
    if (item && item.ts == null) item.ts = Date.now();

    if (!Array.isArray(b.items)) b.items = [];
    b.items.push(item);

    if ((store[msgId] || []).length > CFG_MANCHOR.MAX_PINS_PER_MSG) {
      store[msgId] = store[msgId].slice(0, CFG_MANCHOR.MAX_PINS_PER_MSG);
    }

    STATE_saveStoreV1(store);
    if (item?.type === 'symbol') STATE_syncSymbolsForMsg(store, msgId, { emit: true });

    if (item?.type === 'note' || item?.type === 'status') CORE_MA_syncAutoNoteStatus(msgEl, a.off);
    OBS_MA_scheduleRepaint(msgEl);
  }

  function CORE_MA_patchItem(msgEl, a, itemId, patch, opts) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return false;

    const store = STATE_loadStoreV1();
    const b = STATE_getOrCreateBucket(store, msgId, a);
    const items = b.items || [];
    const idx = items.findIndex(it => it && it.id === itemId);
    if (idx < 0) return false;

    const it = items[idx];
    const t0 = it?.type || '';
    const p = patch || {};
    if (p.data) it.data = Object.assign({}, it.data || {}, p.data);
    if (p.ui)   it.ui   = Object.assign({}, it.ui   || {}, p.ui);
    if (it.ts == null) it.ts = Date.now();
    if (opts?.bumpTs !== false) it.ts = Date.now();

    b.items = items;
    STATE_saveStoreV1(store);
    if (t0 === 'symbol') STATE_syncSymbolsForMsg(store, msgId, { emit: true });


    if (t0 === 'note' || t0 === 'status') CORE_MA_syncAutoNoteStatus(msgEl, a.off);
    if (opts?.repaint !== false) OBS_MA_scheduleRepaint(msgEl);
    return true;
  }

  function CORE_MA_updateItem(msgEl, a, itemId, patch) {
    CORE_MA_patchItem(msgEl, a, itemId, patch, { repaint: true, bumpTs: true });
  }

  function CORE_MA_removeItem(msgEl, off, itemId) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    const store = STATE_loadStoreV1();
    const b = STATE_getBucket(store, msgId, off);
    if (!b) return;

    const it0 = (b.items || []).find(it => it && it.id === itemId);
    const t0 = it0?.type || '';

    b.items = (b.items || []).filter(it => it?.id !== itemId);

    store[msgId] = (store[msgId] || []).filter(x => (x.items || []).length > 0);
    if (!(store[msgId] || []).length) delete store[msgId];

    STATE_saveStoreV1(store);
    if (t0 === 'symbol') STATE_syncSymbolsForMsg(store, msgId, { emit: true });

    if (t0 === 'note' || t0 === 'status') CORE_MA_syncAutoNoteStatus(msgEl, off);
    OBS_MA_scheduleRepaint(msgEl);
  }

  /** @helper Removes ALL status items from a given anchor line (one-status-per-line rule). */
  function CORE_MA_clearStatuses(msgEl, anchorOff) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return 0;

    const store = STATE_loadStoreV1();
    const b = STATE_getBucket(store, msgId, anchorOff);
    if (!b || !Array.isArray(b.items)) return 0;

    const before = b.items.length;
    b.items = b.items.filter(it => (it && it.type !== 'status'));
    const removed = before - b.items.length;

    // cleanup empty buckets/messages
    if (!b.items.length) {
      store[msgId] = (store[msgId] || []).filter(x => x && x !== b && (x.items || []).length);
      if (!(store[msgId] || []).length) delete store[msgId];
    }

    if (removed) {
      STATE_saveStoreV1(store);
      OBS_MA_scheduleRepaint(msgEl);
    }
    return removed;
  }

/** @helper Auto-maintains a lightweight "note" status only when the line has notes and no real status. */
function CORE_MA_syncAutoNoteStatus(msgEl, anchorOff) {
  const msgId = UTIL_getMsgId(msgEl);
  if (!msgId) return;

  const store = STATE_loadStoreV1();
  const b = STATE_getBucket(store, msgId, anchorOff);
  if (!b || !Array.isArray(b.items)) return;

  const items = b.items;
  const hasNote = items.some(it => it && it.type === 'note');

  const statuses = items.filter(it => it && it.type === 'status');
  const hasRealStatus = statuses.some(s => {
    const st = (s?.data?.state || '');
    return st && st !== 'note';
  });
  const noteStatus = statuses.find(s => (s?.data?.state || '') === 'note');
  const noteStatusId = noteStatus?.id || null;

  let changed = false;

  // If a real status exists, never keep the auto "note" status.
  if (hasRealStatus && noteStatusId) {
    b.items = items.filter(it => it?.id !== noteStatusId);
    changed = true;
  }

  // If no real status exists, add auto "note" status when note exists.
  if (!hasRealStatus && hasNote && !noteStatusId) {
    b.items = [
      ...items,
      { id: UTIL_uid(), type: 'status', ts: Date.now(), data: { state: 'note' }, ui: {} },
    ];
    changed = true;
  }

  // If no notes exist, remove auto "note" status.
  if (!hasNote && noteStatusId) {
    b.items = items.filter(it => it?.id !== noteStatusId);
    changed = true;
  }

  if (!changed) return;

  // cleanup empty buckets/messages
  if (!b.items.length) {
    store[msgId] = (store[msgId] || []).filter(x => x && x !== b && (x.items || []).length);
    if (!(store[msgId] || []).length) delete store[msgId];
  }

  STATE_saveStoreV1(store);
  OBS_MA_scheduleRepaint(msgEl);
}


  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / MOUNT 📝🔓💥 ───────────────────────────── */
  function DOM_MA_ensureLayers(msgEl) {
    if (!msgEl) return { gut: null, marks: null };

    const prev = STATE.origPosByMsg.get(msgEl);
    if (prev == null) STATE.origPosByMsg.set(msgEl, msgEl.style.position || '');
    if (!msgEl.style.position || msgEl.style.position === 'static') msgEl.style.position = 'relative';

    const prevOv = STATE.origOverflowByMsg.get(msgEl);
    if (prevOv == null) STATE.origOverflowByMsg.set(msgEl, msgEl.style.overflow || '');
    if (msgEl.style.overflow !== 'visible') msgEl.style.overflow = 'visible';
    let gut = msgEl.querySelector(SEL_MANCHOR_GUTTER_CHILD);
    if (!gut) {
      gut = D.createElement('div');
      gut.setAttribute(ATTR_CGXUI, UI_MANCHOR_GUTTER);
      gut.setAttribute(ATTR_CGXUI_OWNER, SkID);
      msgEl.insertBefore(gut, msgEl.firstChild);
    }

    let marks = msgEl.querySelector(SEL_MANCHOR_MARKS_CHILD);
    if (!marks) {
      marks = D.createElement('div');
      marks.setAttribute(ATTR_CGXUI, UI_MANCHOR_MARKS);
      marks.setAttribute(ATTR_CGXUI_OWNER, SkID);
      msgEl.insertBefore(marks, msgEl.firstChild);
    }

    return { gut, marks };
  }

function DOM_MA_statusInfo(items) {
  const pick = (state) => (items || []).find(it => it.type === 'status' && it.data?.state === state);
  const statuses = (items || []).filter(it => it && it.type === 'status');
  if (!statuses.length) return null;

  // Priority (top wins). Add/remove as you like.
  const p = [
    pick('notworking'),
    pick('blocked'),
    pick('important'),
    pick('revise'),
    pick('question'),
    pick('inprogress'),
    pick('waiting'),
    pick('comeback'),
    pick('later'),
    pick('draft'),
    pick('note'),
    pick('answer'),
    pick('done'),
  ].filter(Boolean);

  const st = p[0] || statuses[statuses.length - 1];
  const s = st?.data?.state || '';

  const map = {
    done:        { txt: 'Done',        c: '#2bd576' },
    later:       { txt: 'Read later',  c: '#4aa8ff' },
    important:   { txt: 'Important',   c: '#ff4a6e' },
    comeback:    { txt: 'Come back',   c: '#ffbf3c' },
    inprogress:  { txt: 'In progress', c: '#60a5fa' },
    waiting:     { txt: 'Waiting',     c: '#fbbf24' },
    blocked:     { txt: 'Blocked',     c: '#f87171' },
    question:    { txt: 'Question',    c: '#a78bfa' },
    answer:      { txt: 'Answer',      c: '#22d3ee' },
    revise:      { txt: 'Revise',      c: '#ffffff' },
    notworking:  { txt: 'Not working', c: '#111827' },
    draft:       { txt: 'Draft',       c: '#94a3b8' },

    note:        { txt: 'Note',        c:'#e5e7eb'  },

  };

  if (s === 'note') {
    // Keep note status color fixed (white) regardless of note color.
    return { txt: 'Note', c: '#ffffff', state: 'note' };
  }

  const picked = map[s] || { txt: String(s || 'Status'), c: '#e5e7eb' };
  return { ...picked, state: s };
}


  function CORE_MA_notesAPI() {
    // notes script attaches here: MOD_OBJ.api.notes = { isOpen, open, close, toggle, ensure, remove }
    return MOD_OBJ.api?.notes || null;
  }

  function DOM_MA_renderPins(msgEl) {
    const { marks } = DOM_MA_ensureLayers(msgEl);
    if (!marks) return;

    marks.textContent = '';

    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    const store = STATE_loadStoreV1();
    const buckets = store[msgId] || [];
    if (!Array.isArray(buckets) || !buckets.length) return;

    const keyFor = (off) => UTIL_noteKey(msgId, off);

    const getLatestNote = (items) => {
      for (let i = (items?.length || 0) - 1; i >= 0; i--) {
        const it = items[i];
        if (it && it.type === 'note') return it;
      }
      return null;
    };

    for (const b of buckets) {
      const items = b.items || [];
      if (!items.length) continue;

const si = DOM_MA_statusInfo(items);
const noteIt = getLatestNote(items);
const symbols = (items || []).filter(it => it && it.type === 'symbol');

const hasStatus = !!si;
const hasNote = !!noteIt;
const hasSymbol = !!symbols.length;


      const k = keyFor(b.a.off);

      // If note item was deleted, ask notes portal (if present) to close + remove it.
      if (!hasNote) {
        try {
          const notes = CORE_MA_notesAPI();
          notes?.remove?.(k);
        } catch {}
        // also broadcast close (in case notes script only listens to events)
        try {
          D.dispatchEvent(new CustomEvent(EV_MANCHOR_NOTE_CLOSE_V1, { detail: { key: k } }));
        } catch {}
      }

      if (!hasStatus && !hasNote && !hasSymbol) continue;

      const y = UTIL_anchorToY(msgEl, b.a);

      const grp = D.createElement('div');
      grp.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINGRP);
      grp.setAttribute(ATTR_CGXUI_OWNER, SkID);

      grp.toggleAttribute('data-has-note', hasNote);
      grp.toggleAttribute('data-has-status', hasStatus);
      grp.toggleAttribute('data-has-symbol', hasSymbol);

      grp.style.top = `${y}px`;
      grp.dataset.off = String(b.a.off);

      grp.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target && e.target !== grp) return;
        e.preventDefault();
        e.stopPropagation();
        UI_MA_openMenu({ msgEl, anchor: b.a, clientX: e.clientX, clientY: e.clientY });
      }, true);

      if (hasStatus) {
        const sdot = D.createElement('div');
        sdot.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINDOT);
        sdot.setAttribute(ATTR_CGXUI_OWNER, SkID);
        sdot.dataset.kind = 'status';
        if (si?.state) sdot.dataset.state = si.state;
        sdot.style.setProperty(CSS_MANCHOR_VAR_COLOR, si.c || '#ffffff');

        if (si.txt) {
          const lbl = D.createElement('div');
          lbl.setAttribute(ATTR_CGXUI, UI_MANCHOR_LABEL);
          lbl.setAttribute(ATTR_CGXUI_OWNER, SkID);
          lbl.textContent = si.txt;
          sdot.appendChild(lbl);
        }

        sdot.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          UI_MA_openMenu({ msgEl, anchor: b.a, clientX: e.clientX, clientY: e.clientY });
        }, true);

        grp.appendChild(sdot);
      }

      if (hasSymbol) {
        const baseLeft = hasStatus ? (hasNote ? 35 : 50) : (hasNote ? 75 : 50);
        const step = 36;
        const lead = hasStatus ? 70 : 14;
        const syms = symbols.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
        for (let i = 0; i < syms.length; i++) {
          const sym = syms[i];
          const sdot = D.createElement('div');
          sdot.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINDOT);
          sdot.setAttribute(ATTR_CGXUI_OWNER, SkID);
          sdot.dataset.kind = 'symbol';
          const symChar = (sym?.data?.symbol || '').trim() || '•';
          const symColor = sym?.data?.color || sym?.ui?.color || '#ffffff';
          sdot.textContent = symChar;
          sdot.style.setProperty(CSS_MANCHOR_VAR_COLOR, symColor);
          sdot.style.left = `calc(${baseLeft}% - ${lead + (i * step)}px)`;

          sdot.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            UI_MA_openMenu({ msgEl, anchor: b.a, clientX: e.clientX, clientY: e.clientY });
          }, true);

          grp.appendChild(sdot);
        }
      }

      if (hasNote) {
        const noteColor = (noteIt?.ui?.color || noteIt?.data?.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a');

        const ndot = D.createElement('div');
        ndot.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINDOT);
        ndot.setAttribute(ATTR_CGXUI_OWNER, SkID);
        ndot.dataset.kind = 'note';
        ndot.style.setProperty(CSS_MANCHOR_VAR_COLOR, noteColor);

        const notes = CORE_MA_notesAPI();
        const isOpen = !!(notes?.isOpen?.(k));
        if (isOpen) ndot.setAttribute(ATTR_CGXUI_STATE, UI_STATE_OPEN);

        ndot.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;

          e.preventDefault();
          e.stopPropagation();

          // IMPORTANT: do NOT toggle twice.
          // If the Notes module API is present, call it directly.
          // Otherwise, broadcast an event so Notes can react when/if it loads.
          if (notes?.toggle) {
            try { notes.toggle({ key: k, msgEl, a: b.a, item: noteIt }); } catch {}
          } else {
            try {
              D.dispatchEvent(new CustomEvent(EV_MANCHOR_NOTE_TOGGLE_V1, {
                detail: { key: k, msgId, off: b.a.off, msgEl, a: b.a, item: noteIt }
              }));
            } catch {}
          }

          // re-render soon to reflect open/close glow state
          OBS_MA_scheduleRepaint(msgEl);
          setTimeout(() => OBS_MA_scheduleRepaint(msgEl), 60);
        }, true);

        grp.appendChild(ndot);
      }

      marks.appendChild(grp);
    }
  }

  function DOM_MA_bindGutter(msgEl) {
    const { gut } = DOM_MA_ensureLayers(msgEl);
    if (!gut) return;

    if (gut.getAttribute(ATTR_CGXUI_STATE) === UI_STATE_BOUND) return;
    gut.setAttribute(ATTR_CGXUI_STATE, UI_STATE_BOUND);

    gut.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const a = UTIL_computeAnchorFromClick(msgEl, e.clientX, e.clientY);
      if (!a) return;

      UI_MA_openMenu({ msgEl, anchor: a, clientX: e.clientX, clientY: e.clientY });
    }, true);
  }

  function DOM_MA_bindMarks(msgEl) {
    const { marks } = DOM_MA_ensureLayers(msgEl);
    if (!marks) return;

    if (marks.getAttribute(ATTR_CGXUI_STATE) === UI_STATE_BOUND) return;
    marks.setAttribute(ATTR_CGXUI_STATE, UI_STATE_BOUND);

    marks.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      // If the user clicked an existing pin/dot, let that handler win.
      const hitPin =
        e.target?.closest?.(selScoped(PINDOT)) ||
        e.target?.closest?.(selScoped(PINGRP));
      if (hitPin) return;

      e.preventDefault();
      e.stopPropagation();

      const a = UTIL_computeAnchorFromClick(msgEl, e.clientX, e.clientY);
      if (!a) return;

      UI_MA_openMenu({ msgEl, anchor: a, clientX: e.clientX, clientY: e.clientY });
    }, true);
  }


  function DOM_MA_attach(msgEl) {
    if (!msgEl) return;

    UI_MA_ensureStyle();
    DOM_MA_ensureLayers(msgEl);
    DOM_MA_bindGutter(msgEl);

    DOM_MA_bindMarks(msgEl);
    if (STATE.obsResize && !STATE.roObserved.has(msgEl)) {
      STATE.roObserved.add(msgEl);
      STATE.obsResize.observe(msgEl);
    }

    DOM_MA_renderPins(msgEl);
  }

  function DOM_MA_refreshAll() {
    UI_MA_ensureStyle();
    const list = D.querySelectorAll(SEL_MANCHOR_ASSISTANT);
    for (const el of list) DOM_MA_attach(el);
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */
  const CSS_MA_TEXT = () => {
    const ATTR  = ATTR_CGXUI;
    const OWN   = ATTR_CGXUI_OWNER;
    const ASTATE = ATTR_CGXUI_STATE;
    const CFG   = CFG_MANCHOR;

    const GUTTER  = UI_MANCHOR_GUTTER;
    const MARKS   = UI_MANCHOR_MARKS;

    const PINGRP  = UI_MANCHOR_PINGRP;
    const PINDOT  = UI_MANCHOR_PINDOT;
    const LABEL   = UI_MANCHOR_LABEL;

    const selScoped = (ui) => `[${ATTR}="${ui}"][${OWN}="${SkID}"]`;

    return `
      ${selScoped(GUTTER)}{
        position:absolute;
        top:0; left:0;
        width:${CFG.GUTTER_W_PX}px; height:100%;
        transform: translateX(${CFG.GUTTER_SHIFT_X_PX}px);
        pointer-events:auto;
        background: transparent;
        z-index:${CFG.GUTTER_Z};
        user-select:none;
      }

      ${selScoped(MARKS)}{
        position:absolute;
        top:0; left:0;
        width:${CFG.GUTTER_W_PX}px; height:100%;
        transform: translateX(${CFG.MARKS_SHIFT_X_PX}px);

        pointer-events:none;
        z-index:${CFG.PIN_Z};
        overflow: visible;
      }

      ${selScoped(PINGRP)}{
        position:absolute;
        left:0;
        width:100%;
        height:${CFG.PIN_HIT_PX}px;
        pointer-events:auto;
      }

      ${selScoped(PINDOT)}{
        position:absolute;
        top:0;
        width:${CFG.PIN_HIT_PX}px;
        height:${CFG.PIN_HIT_PX}px;
        border-radius:999px;
        pointer-events:auto;
        cursor:pointer;
        background: transparent;
        user-select:none;
        ${CSS_MANCHOR_VAR_COLOR}: #ffffff;
        left: 50%;
        transform: translateX(-50%);

      /* 🎯 Lane layout: Status / Symbols / Notes */
      ${selScoped(PINGRP)}[data-has-note="1"] ${selScoped(PINDOT)}[data-kind="status"]{
        left: 35%;
        top: -10px;
        z-index: 4;
      }
      ${selScoped(PINGRP)}:not([data-has-note="1"]) ${selScoped(PINDOT)}[data-kind="status"]{
        left: 50%;
        top: 0;
        z-index: 4;
      }

      }
      ${selScoped(PINDOT)}[data-kind="note"]{ border-radius:2px; }
      ${selScoped(PINDOT)}[data-kind="symbol"]{
        z-index: 2;
        width:28px;
        height:28px;
        border-radius:4px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:700;
        line-height:1;
        color: var(${CSS_MANCHOR_VAR_COLOR});
        background: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 18%, transparent);
        text-shadow: 0 1px 2px rgba(0,0,0,.35);
      }
      ${selScoped(PINDOT)}[data-kind="symbol"]::before,
      ${selScoped(PINDOT)}[data-kind="symbol"]::after{ display:none; }

      ${selScoped(PINDOT)}::before{
        content:"";
        position:absolute;
        left:50%; top:50%;
        transform: translate(-50%,-50%);
        width:${CFG.PIN_SIZE_PX}px;
        height:${CFG.PIN_SIZE_PX}px;
        border-radius:999px;
        background: var(${CSS_MANCHOR_VAR_COLOR});
        box-shadow: 0 0 0 1px rgba(255,255,255,.16), 0 10px 20px rgba(0,0,0,.35);
        opacity:.92;
      }

      ${selScoped(PINDOT)}[data-kind="note"]::before{
        /* 🗒️ Sticky-note pin (paper sheet) — color follows the latest note */
        content:"";
        position:absolute;
        left:50%; top:50%;
        transform: translate(-50%,-50%);
        width:13px;
        height:18px;
        border-radius:2px;

        /* matte paper + visible lines (no "shiny" overlay) */
        background:
          linear-gradient(to bottom,
            color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 90%, #ffffff 10%) 0%,
            color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 96%, #000000 4%) 100%),
          repeating-linear-gradient(to bottom,
            rgba(17,24,39,.22) 0 1px,
            rgba(17,24,39,0) 1px 4px);

        box-shadow:
          0 0 0 1px color-mix(in oklab, #000 18%, transparent),
          0 5px 12px rgba(0,0,0,.18);

        opacity:0.98;
      }

      ${selScoped(PINDOT)}[data-kind="status"]::after{
        content:"";
        position:absolute;
        left:50%; top:50%;
        transform: translate(-50%,-50%);
        width:3px;
        height:3px;
        border-radius:999px;
        background: radial-gradient(circle at 35% 35%, #e5e7eb 0%, #9ca3af 42%, #374151 100%);
        box-shadow: 0 0 0 1px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.35);
        opacity:.95;
        pointer-events:none;
      }
      ${selScoped(PINDOT)}[data-kind="note"]::after{
        /* folded corner */
        content:"";
        position:absolute;
        left:50%; top:50%;
        transform: translate(-50%,-50%);
        width:13px;
        height:18px;
        border-radius:2px;

        background:
          linear-gradient(315deg,
            color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 70%, #ffffff 30%) 0 18%,
            transparent 18% 100%);

        opacity:0.55;
        pointer-events:none;
      }

      ${selScoped(PINDOT)}[data-kind="note"]{
        left: 75%;
        transform: translateX(-50%);
      }

      ${selScoped(PINDOT)}[data-kind="note"][${ASTATE}="open"]::before{
        box-shadow: 0 0 0 1px rgba(255,255,255,.28), 0 0 18px rgba(255,255,255,.18), 0 14px 28px rgba(0,0,0,.45);
      }

      ${selScoped(LABEL)}{
        position:absolute;
        right: calc(100% + 6px);
        top: 50%;
        transform: translateY(-50%);
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 10px;
        letter-spacing: .3px;
        text-transform: uppercase;
        border: 1px solid color-mix(in oklab, #ffffff 14%, transparent);
        background: color-mix(in oklab, #0b0f14 72%, transparent);
        color: var(${CSS_MANCHOR_VAR_COLOR});
        white-space: nowrap;
        box-shadow: 0 12px 30px rgba(0,0,0,.35);
        pointer-events: none;
      }
      /* If symbols exist on this line, move the status label to the right to avoid overlap. */
      ${selScoped(PINGRP)}[data-has-symbol="1"] ${selScoped(PINDOT)}[data-kind="status"] ${selScoped(LABEL)}{
        right: auto;
        left: calc(100% + 6px);
      }
      ${selScoped(PINDOT)}[data-kind="status"][data-state="note"] ${selScoped(LABEL)}{
        border-radius: 4px;
        letter-spacing: .6px;
      }

      /* Popup (unchanged) */
      [${ATTR}="${UI_MANCHOR_POP}"]{
        position:fixed;
        z-index:${CFG.POPUP_Z};
        max-height: calc(100vh - 24px);
        overflow: auto;
        width: 420px;
        max-width: calc(100vw - 24px);
        padding: 10px;
        border-radius: 14px;
        border: 1px solid color-mix(in oklab, #ffffff 14%, transparent);
        background: color-mix(in oklab, #0b0f14 78%, transparent);
        box-shadow: 0 18px 50px rgba(0,0,0,.45);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: color-mix(in oklab, #ffffff 90%, #9aa6b2);
        font: 12px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }

      [${ATTR}="${UI_MANCHOR_POP_TITLE}"]{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom: 8px;
        font-size: 11px;
        letter-spacing: .25px;
        opacity:.85;
      }

      [${ATTR}="${UI_MANCHOR_POP_BACK}"]{
        border:none;
        background: color-mix(in oklab, #ffffff 10%, transparent);
        color: inherit;
        border-radius: 8px;
        padding: 6px 8px;
        cursor:pointer;
        opacity:.9;
      }

      [${ATTR}="${UI_MANCHOR_POP_TOP}"]{
        display:flex;
        flex-direction:column;
        gap:8px;
        margin: 6px 0 10px;
      }
      [${ATTR}="${UI_MANCHOR_POP_TOPROW}"]{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      }

      [${ATTR}="${UI_MANCHOR_POP_CHIP}"]{
        display:inline-flex;
        align-items:center;
        gap:8px;
        border: 1px solid color-mix(in oklab, #ffffff 14%, transparent);
        background: color-mix(in oklab, #ffffff 7%, transparent);
        color: inherit;
        border-radius: 999px;
        padding: 6px 10px;
        cursor:pointer;
        font: inherit;
        line-height: 1.1;
        opacity:.95;
        transition: background .15s ease, transform .12s ease, opacity .15s ease, box-shadow .15s ease, border-color .15s ease;
        user-select:none;
        --chipc: #ffffff;
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"] .cgxui-dot{
        width:8px;
        height:8px;
        border-radius:999px;
        box-shadow: 0 0 0 2px color-mix(in oklab, #000 30%, transparent);
        opacity:.95;
        flex: 0 0 auto;
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"]:hover{
        background: color-mix(in oklab, #ffffff 10%, transparent);
        transform: translateY(-0.5px);
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"][${ASTATE}="active"]{
        background: color-mix(in oklab, #ffffff 14%, transparent);
        opacity: 1;
        border-color: color-mix(in oklab, var(--chipc) 55%, transparent);
        box-shadow: 0 0 0 1px color-mix(in oklab, var(--chipc) 45%, transparent), 0 0 20px color-mix(in oklab, var(--chipc) 22%, transparent);
      }

      [${ATTR}="${UI_MANCHOR_POP_EDITOR}"]{
        border: 1px solid color-mix(in oklab, #ffffff 14%, transparent);
        background: color-mix(in oklab, #ffffff 6%, transparent);
        border-radius: 14px;
        padding: 10px;
        margin: 6px 0 10px;
      }
      [${ATTR}="${UI_MANCHOR_POP_HELP}"]{ opacity:.85; margin-bottom: 8px; }
      [${ATTR}="${UI_MANCHOR_POP_FIELD}"]{
        width: 100%;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid color-mix(in oklab, #ffffff 14%, transparent);
        background: color-mix(in oklab, #0b0f14 70%, transparent);
        color: inherit;
        padding: 8px 10px;
        outline: none;
        resize: vertical;
        min-height: 28px;
        font: inherit;
      }

      [${ATTR}="${UI_MANCHOR_POP_ROW}"]{ display:flex; gap:8px; margin-top:8px; }

      [${ATTR}="${UI_MANCHOR_POP_BTN}"]{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid color-mix(in oklab, #ffffff 10%, transparent);
        background: color-mix(in oklab, #0b0f14 62%, transparent);
        cursor:pointer;
        flex: 1;
        user-select:none;
      }
      [${ATTR}="${UI_MANCHOR_POP_DOT}"]{
        width: 10px; height: 10px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--c, #fff) 75%, #0b0f14 25%);
        box-shadow: 0 0 0 2px color-mix(in oklab, #000 35%, transparent);
      }
      [${ATTR}="${UI_MANCHOR_POP_LBL}"]{ opacity:.95; }

      [${ATTR}="${UI_MANCHOR_POP_GROUP}"]{
        border: 1px solid color-mix(in oklab, #ffffff 12%, transparent);
        background: color-mix(in oklab, #ffffff 4%, transparent);
        border-radius: 14px;
        padding: 6px 8px;
        margin: 8px 0;
      }
      [${ATTR}="${UI_MANCHOR_POP_SUM}"]{
        cursor:pointer;
        user-select:none;
        list-style:none;
        opacity:.95;
        padding: 2px 2px;
      }
      [${ATTR}="${UI_MANCHOR_POP_SUM}"]::-webkit-details-marker{ display:none; }

      [${ATTR}="${UI_MANCHOR_POP_ITEM}"]{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap: 10px;
        padding: 8px 6px;
        border-radius: 8px;
        margin-top: 6px;
        background: color-mix(in oklab, #ffffff 4%, transparent);
      }
      [${ATTR}="${UI_MANCHOR_POP_ITEMTXT}"]{ min-width: 0; }
      [${ATTR}="${UI_MANCHOR_POP_META}"]{
        opacity:.7;
        font-size: 11px;
        margin-top: 2px;
        white-space: nowrap;
      }

      [${ATTR}="${UI_MANCHOR_POP_ICONS}"]{
        display:flex;
        gap:8px;
        flex: 0 0 auto;
        align-items:center;
        padding-top: 4px;
      }
      [${ATTR}="${UI_MANCHOR_POP_ACTDOT}"]{
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--c, #fff) 62%, #0b0f14 38%);
        border: 1px solid color-mix(in oklab, #ffffff 12%, transparent);
        box-shadow: none;
        opacity: .78;
        transition: transform .14s ease, opacity .14s ease, filter .14s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_ACTDOT}"]:hover{
        transform: scale(1.12);
        opacity: .95;
        filter: brightness(1.06);
      }


        /* Tabs */
  [${ATTR}="${UI_MANCHOR_POP_TABS}"]{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin: 8px 0 10px;
  }
  [${ATTR}="${UI_MANCHOR_POP_TAB}"]{
    border: 1px solid color-mix(in oklab, #ffffff 12%, transparent);
    background: color-mix(in oklab, #ffffff 6%, transparent);
    color: inherit;
    border-radius: 999px;
    padding: 6px 10px;
    cursor:pointer;
    font: inherit;
    opacity:.92;
    user-select:none;
    transition: background .15s ease, transform .12s ease, opacity .15s ease, border-color .15s ease;
    white-space: nowrap;
  }
  [${ATTR}="${UI_MANCHOR_POP_TAB}"]:hover{
    background: color-mix(in oklab, #ffffff 10%, transparent);
    transform: translateY(-0.5px);
    opacity: 1;
  }
  [${ATTR}="${UI_MANCHOR_POP_TAB}"][${ASTATE}="active"]{
    background: color-mix(in oklab, #ffffff 14%, transparent);
    border-color: color-mix(in oklab, #ffffff 22%, transparent);
    opacity: 1;
    box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 0 18px rgba(255,255,255,.06);
  }

  /* Overview */
  [${ATTR}="${UI_MANCHOR_POP_OVERVIEW}"]{
    border: 1px solid color-mix(in oklab, #ffffff 12%, transparent);
    background: color-mix(in oklab, #ffffff 4%, transparent);
    border-radius: 14px;
    padding: 10px;
    margin: 10px 0 8px;
  }
  [${ATTR}="${UI_MANCHOR_POP_KV}"]{
    display:flex;
    justify-content:space-between;
    gap:10px;
    padding: 6px 6px;
    border-radius: 10px;
    background: color-mix(in oklab, #ffffff 4%, transparent);
    margin-top: 6px;
  }
  [${ATTR}="${UI_MANCHOR_POP_K}"]{ opacity:.78; }
  [${ATTR}="${UI_MANCHOR_POP_V}"]{ opacity:.95; text-align:right; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; max-width: 60%; }


      /* Section wrappers (Status / Attachments / Overview) */
      [${ATTR}="${UI_MANCHOR_POP_SECTION}"]{
        border: 1px solid color-mix(in oklab, #ffffff 12%, transparent);
        background: color-mix(in oklab, #ffffff 4%, transparent);
        border-radius: 14px;
        padding: 10px;
        margin: 8px 0;
      }
      [${ATTR}="${UI_MANCHOR_POP_SECTITLE}"]{
        font-size: 11px;
        letter-spacing: .35px;
        text-transform: uppercase;
        opacity: .78;
        margin-bottom: 8px;
      }


      @keyframes cgxui-${SkID}-pinshine{
        0%   { filter: brightness(1);   }
        40%  { filter: brightness(1.35);}
        100% { filter: brightness(1);   }
      }

      /* Shine the pin group briefly (triggered after Jump) */
      [${ATTR}="${UI_MANCHOR_PINGRP}"][${OWN}="${SkID}"][${ASTATE}="${UI_STATE_SHINE}"] [${ATTR}="${UI_MANCHOR_PINDOT}"][${OWN}="${SkID}"]::before{
        animation: cgxui-${SkID}-pinshine 900ms ease-out 1;
        box-shadow: 0 0 0 1px rgba(255,255,255,.28),
                    0 0 22px rgba(96,165,250,.22),
                    0 14px 30px rgba(0,0,0,.45);
      }

    `;
  };

  function UI_MA_ensureStyle() {
    let style = D.getElementById(CSS_MANCHOR_STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = CSS_MANCHOR_STYLE_ID;
      D.documentElement.appendChild(style);
      STATE.disposers.push(() => style.remove());
    }
    const txt = CSS_MA_TEXT();
    if (style.textContent !== txt) style.textContent = txt;
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / REACTIVITY 📝🔓💥 ───────────────────────────── */
  function SAFE_MA_withLocalMut(fn) {
    STATE.muting++;
    try { return fn(); } finally { STATE.muting--; }
  }

  function OBS_MA_scheduleRefreshAll() {
    if (STATE.refreshAllTimer) return;
    STATE.refreshAllTimer = setTimeout(() => {
      STATE.refreshAllTimer = 0;
      try { SAFE_MA_withLocalMut(() => DOM_MA_refreshAll()); } catch (e) { DIAG_error(e); }
    }, 120);
  }

  function OBS_MA_scheduleRepaint(msgEl) {
    const prev = STATE.repaintTimerByMsg.get(msgEl);
    if (prev) clearTimeout(prev);

    const id = setTimeout(() => {
      STATE.repaintTimerByMsg.delete(msgEl);
      try { DOM_MA_renderPins(msgEl); } catch (e) { DIAG_error(e); }
    }, CFG_MANCHOR.REBUILD_THROTTLE_MS);

    STATE.repaintTimerByMsg.set(msgEl, id);
  }

  function OBS_MA_onResize(entries) {
    for (const ent of entries || []) {
      if (ent?.target) OBS_MA_scheduleRepaint(ent.target);
    }
  }

  /* ───────────────────────────── ⚫️ LIFECYCLE — MENU + UI 📝🔓💥 ───────────────────────────── */
  function UI_MA_hideMenu() {
    if (STATE.popEl) STATE.popEl.remove();
    STATE.popEl = null;
  }

  function UI_MA_placePopup(popEl, x, y) {
    const pr = popEl.getBoundingClientRect();
    const px = Math.max(8, Math.min(x + CFG_MANCHOR.POPUP_GAP_PX, W.innerWidth - pr.width - 8));
    const py = Math.max(8, Math.min(y + CFG_MANCHOR.POPUP_GAP_PX, W.innerHeight - pr.height - 8));
    popEl.style.left = `${px}px`;
    popEl.style.top = `${py}px`;
  }

  function UI_MA_menuTitle(text, showBack, onBack) {
    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TITLE);
    wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const t = D.createElement('div');
    t.textContent = text;
    wrap.appendChild(t);

    if (showBack) {
      const b = D.createElement('button');
      b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_BACK);
      b.setAttribute(ATTR_CGXUI_OWNER, SkID);
      b.textContent = 'Back';
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onBack?.(); }, true);
      wrap.appendChild(b);
    }
    return wrap;
  }

  function UI_MA_mkBtn(label, color, onClick) {
    const btn = D.createElement('div');
    btn.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_BTN);
    btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
    btn.style.setProperty('--c', color || '#ffffff');

    const dot = D.createElement('span');
    dot.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_DOT);
    dot.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const lbl = D.createElement('span');
    lbl.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_LBL);
    lbl.setAttribute(ATTR_CGXUI_OWNER, SkID);
    lbl.textContent = label;

    btn.append(dot, lbl);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }, true);
    return btn;
  }

  function UI_MA_mkChip(label, active, onClick, dotColor) {
    const chip = D.createElement('button');
    chip.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_CHIP);
    chip.setAttribute(ATTR_CGXUI_OWNER, SkID);
    if (active) chip.setAttribute(ATTR_CGXUI_STATE, 'active');

    if (dotColor) {
      chip.style.setProperty('--chipc', dotColor);
      const dot = D.createElement('span');
      dot.className = 'cgxui-dot';
      dot.style.background = dotColor;
      chip.appendChild(dot);
    }

    const t = D.createElement('span');
    t.textContent = label;
    chip.appendChild(t);

    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick && onClick(); } catch {}
    }, true);

    return chip;
  }

  function UI_MA_mkActDot(color, title, onClick) {
    const b = D.createElement('button');
    b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ACTDOT);
    b.setAttribute(ATTR_CGXUI_OWNER, SkID);
    b.title = title || '';
    b.style.setProperty('--c', color || '#ffffff');

    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick && onClick(); } catch {}
    }, true);

    return b;
  }

  function UI_MA_fmtTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');

      if (sameDay) return `${hh}:${mm}`;

      const yy = String(d.getFullYear());
      const mo = String(d.getMonth()+1).padStart(2,'0');
      const da = String(d.getDate()).padStart(2,'0');
      return `${yy}-${mo}-${da} ${hh}:${mm}`;
    } catch { return ''; }
  }

    function UI_MA_flashPin(msgEl, off) {
    try {
      const sel =
        `[${ATTR_CGXUI}="${UI_MANCHOR_PINGRP}"][${ATTR_CGXUI_OWNER}="${SkID}"][data-off="${String(off)}"]`;
      const grp = msgEl?.querySelector?.(sel);
      if (!grp) return;

      grp.setAttribute(ATTR_CGXUI_STATE, UI_STATE_SHINE);
      setTimeout(() => {
        try {
          if (grp.getAttribute(ATTR_CGXUI_STATE) === UI_STATE_SHINE) grp.removeAttribute(ATTR_CGXUI_STATE);
        } catch {}
      }, 950);
    } catch {}
  }


  function UI_MA_jumpToAnchor(msgEl, a) {
    try {
      const y = UTIL_anchorToY(msgEl, a);
      const r = msgEl.getBoundingClientRect();
      const top = W.scrollY + r.top + y - 140;
      W.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } catch {}
  }

  function UI_MA_openMenu({ msgEl, anchor, clientX, clientY }) {
    UI_MA_ensureStyle();
    UI_MA_hideMenu();

    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    let draft = null;

    let activeTab = 'overview'; // default
 // all | note | tag | link | quote | todo | file

const tabLabel = (t) => ({
  all: 'All',
  note: 'NOTES',
  tag: 'TAGS',
  link: 'LINKS',
  quote: 'QUOTES',
  todo: 'TODO',
  file: 'FILES'
}[t] || String(t).toUpperCase());

function setTab(t) {
  const allowedTabs = new Set([
    'overview',
    'note',
    ...(CFG_MANCHOR.ENABLE_TAGS ? ['tag'] : []),
    ...(CFG_MANCHOR.ENABLE_LINKS ? ['link'] : []),
    ...(CFG_MANCHOR.ENABLE_ASKQUOTE ? ['quote'] : []),
    ...(CFG_MANCHOR.ENABLE_TODO ? ['todo'] : []),
    ...(CFG_MANCHOR.ENABLE_FILES ? ['file'] : []),
  ]);

  activeTab = allowedTabs.has(t) ? t : 'overview';
  renderHub();
}


function getSelTextWithinMsg() {
  try {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return '';
    const s = String(sel.toString() || '').trim();
    if (!s) return '';

    // only accept if selection is inside this message element
    const r = sel.getRangeAt(0);
    const common = r.commonAncestorContainer;
    const el = (common instanceof Element) ? common : common?.parentElement;
    if (!el || !msgEl.contains(el)) return '';

    return s.length > 600 ? (s.slice(0, 600) + '…') : s;
  } catch { return ''; }
}

    const popEl = D.createElement('div');
    popEl.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP);
    popEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
    STATE.popEl = popEl;
    D.body.appendChild(popEl);

    const load = () => {
      const store = STATE_loadStoreV1();
      const b = STATE_getOrCreateBucket(store, msgId, anchor);
      return { store, b, items: b.items || [] };
    };

    const getLatestStatus = (items) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it && it.type === 'status' && it.data && it.data.state) return it;
      }
      return null;
    };

    const getLatestNote = (items) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it && it.type === 'note') return it;
      }
      return null;
    };

function openEditor(mode, item) {
  const value =
    mode === 'note'  ? (item?.data?.text || '') :
    mode === 'tag'   ? (item?.data?.name || '') :
    mode === 'link'  ? (item?.data?.url  || '') :
    mode === 'quote' ? (item?.data?.text || '') :
    mode === 'todo'  ? (item?.data?.text || '') :
    mode === 'file'  ? (item?.data?.ref  || '') : '';

  const color = (mode === 'note')
    ? (item?.ui?.color || item?.data?.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a')
    : null;

  const done = (mode === 'todo') ? !!item?.data?.done : false;

  // auto-prefill quote from selection
  const autoQuote = (mode === 'quote' && !value) ? getSelTextWithinMsg() : '';

  draft = { mode, itemId: item?.id || null, value: (autoQuote || value), color, done };
  renderHub();
}

function saveEditor() {
  const mode = draft?.mode;
  const v = (draft?.value || '').trim();
  if (!mode) return;

  if (mode === 'note') {
    if (!v) { draft = null; return renderHub(); }
    const c = (draft.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a');
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { text: v }, ui: { color: c } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'note', data: { text: v, color: c }, ui: { color: c } });
  }

  if (mode === 'tag') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { name: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'tag', data: { name: v }, ui: {} });
  }

  if (mode === 'link') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { url: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'link', data: { url: v }, ui: {} });
  }

  if (mode === 'quote') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { text: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'quote', data: { text: v }, ui: {} });
  }

  if (mode === 'todo') {
    if (!v) { draft = null; return renderHub(); }
    const done = !!draft.done;
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { text: v, done } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'todo', data: { text: v, done }, ui: {} });
  }

  if (mode === 'file') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { ref: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'file', data: { ref: v }, ui: {} });
  }

  draft = null;
  renderHub();
}


function renderEditor() {
  if (!draft) return null;

  const box = D.createElement('div');
  box.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_EDITOR);
  box.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const help = D.createElement('div');
  help.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_HELP);
  help.setAttribute(ATTR_CGXUI_OWNER, SkID);
  help.textContent =
    draft.mode === 'note'  ? '📝 Note' :
    draft.mode === 'tag'   ? '🏷️ Tag' :
    draft.mode === 'link'  ? '🔗 Link' :
    draft.mode === 'quote' ? '❝ Quote' :
    draft.mode === 'todo'  ? '☑️ Todo' :
    '📎 File';
  box.appendChild(help);

  const wantsArea = (draft.mode === 'note' || draft.mode === 'quote');
  const input = wantsArea ? D.createElement('textarea') : D.createElement('input');
  input.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_FIELD);
  input.setAttribute(ATTR_CGXUI_OWNER, SkID);
  if (input.tagName === 'INPUT') input.type = 'text';

  input.value = draft.value || '';
  input.placeholder =
    draft.mode === 'note'  ? 'Write a sticky note…' :
    draft.mode === 'tag'   ? 'Tag name…' :
    draft.mode === 'link'  ? 'Link URL…' :
    draft.mode === 'quote' ? 'Paste or edit the quote…' :
    draft.mode === 'todo'  ? 'Todo text…' :
    'File ref (name / URL / path)…';

  input.addEventListener('input', () => { draft.value = input.value; }, true);
  box.appendChild(input);

  if (draft.mode === 'todo') {
    const row = D.createElement('div');
    row.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ROW);
    row.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const tgl = UI_MA_mkBtn(draft.done ? 'Mark as NOT done' : 'Mark as DONE', draft.done ? '#fbbf24' : '#22c55e', () => {
      draft.done = !draft.done;
      renderHub();
    });
    row.appendChild(tgl);
    box.appendChild(row);
  }

  if (draft.mode === 'note') {
    const pal = D.createElement('div');
    pal.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_PALETTE);
    pal.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const activeC = (draft.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a');
    for (const c of (CFG_MANCHOR.NOTE_COLORS || [])) {
      const sw = D.createElement('div');
      sw.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SWATCH);
      sw.setAttribute(ATTR_CGXUI_OWNER, SkID);
      sw.style.setProperty('--c', c);
      sw.setAttribute(ATTR_CGXUI_STATE, (c === activeC) ? 'active' : 'idle');
      sw.title = c;
      sw.addEventListener('click', () => { draft.color = c; renderHub(); }, true);
      pal.appendChild(sw);
    }
    box.appendChild(pal);
  }

  const row2 = D.createElement('div');
  row2.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ROW);
  row2.setAttribute(ATTR_CGXUI_OWNER, SkID);
  row2.appendChild(UI_MA_mkBtn('Save', '#6ee7b7', saveEditor));
  row2.appendChild(UI_MA_mkBtn('Cancel', '#ffffff', () => { draft = null; renderHub(); }));
  box.appendChild(row2);

  setTimeout(() => { try { input.focus(); } catch {} }, 0);
  return box;
}


    function mkGroup(title, groupItems, builder, open) {
      const det = D.createElement('details');
      det.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_GROUP);
      det.setAttribute(ATTR_CGXUI_OWNER, SkID);
      det.open = !!open;

      const sum = D.createElement('summary');
      sum.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SUM);
      sum.setAttribute(ATTR_CGXUI_OWNER, SkID);
      sum.textContent = `${title}  (${groupItems.length})`;
      det.appendChild(sum);

      if (!groupItems.length) {
        const none = D.createElement('div');
        none.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_META);
        none.setAttribute(ATTR_CGXUI_OWNER, SkID);
        none.textContent = 'Nothing here yet';
        det.appendChild(none);
        return det;
      }

      for (const it of groupItems) det.appendChild(builder(it));
      return det;
    }

function mkItemRow(it, main, meta, canEdit, onEdit) {
  const row = D.createElement('div');
  row.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ITEM);
  row.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const txt = D.createElement('div');
  txt.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ITEMTXT);
  txt.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const a = D.createElement('div');
  a.textContent = main;
  txt.appendChild(a);

  const b = D.createElement('div');
  b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_META);
  b.setAttribute(ATTR_CGXUI_OWNER, SkID);
  b.textContent = meta || '';
  txt.appendChild(b);

  const icons = D.createElement('div');
  icons.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ICONS);
  icons.setAttribute(ATTR_CGXUI_OWNER, SkID);

  if (canEdit) icons.appendChild(UI_MA_mkActDot('#22c55e', 'Edit', onEdit));

  icons.appendChild(UI_MA_mkActDot('#3b82f6', 'Jump to', () => {
    UI_MA_hideMenu();
    UI_MA_jumpToAnchor(msgEl, anchor);
    setTimeout(() => UI_MA_flashPin(msgEl, anchor.off), 220);
  }));

  icons.appendChild(UI_MA_mkActDot('#ef4444', 'Delete', () => {
    CORE_MA_removeItem(msgEl, anchor.off, it.id);
    renderHub();
  }));

  row.appendChild(txt);
  row.appendChild(icons);
  return row;
}


    function spawnStickyNoteNow() {
      const { items } = load();
      let note = getLatestNote(items);

      if (!note) {
        const c = (CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a');
        note = { id: UTIL_uid(), type: 'note', data: { text: '', color: c }, ui: { color: c }, ts: Date.now() };
        CORE_MA_addItem(msgEl, anchor, note);
      }

      const key = UTIL_noteKey(msgId, anchor.off);

      // Open note portal (avoid double-open via both event + direct API)
      const _notes = CORE_MA_notesAPI();
      if (_notes?.open) {
        try { _notes.open({ key, msgEl, a: anchor, item: note }); } catch {}
      } else {
        try {
          D.dispatchEvent(new CustomEvent(EV_MANCHOR_NOTE_TOGGLE_V1, {
            detail: { key, msgId, off: anchor.off, msgEl, a: anchor, item: note, forceOpen: true }
          }));
        } catch {}
      }

      CORE_MA_syncAutoNoteStatus(msgEl, anchor.off);
      OBS_MA_scheduleRepaint(msgEl);
      UI_MA_hideMenu();
    }


function renderHub() {
  const { items } = load();
  // Auto-rule: if a note exists and there is no real status, keep a synthetic 'note' status.
  CORE_MA_syncAutoNoteStatus(msgEl, anchor.off);

  const latestStatus = getLatestStatus(items);
  const latestState = latestStatus?.data?.state || null;

  const byType = (t) => items.filter(it => it && it.type === t);

  // ✅ tab labels (ADD overview HERE)
  const tabLabel = (k) => (
    k === 'overview' ? 'Overview' :
    k === 'note'     ? 'Notes' :
    k === 'tag'      ? 'Tags' :
    k === 'link'     ? 'Links' :
    k === 'quote'    ? 'Quotes' :
    k === 'todo'     ? 'Todo' :
    'Files'
  );

  // Guard: if activeTab becomes invalid (feature disabled), bounce to 'overview'
  const allowedTabs = new Set([
    'overview',
    'note',
    ...(CFG_MANCHOR.ENABLE_TAGS ? ['tag'] : []),
    ...(CFG_MANCHOR.ENABLE_LINKS ? ['link'] : []),
    ...(CFG_MANCHOR.ENABLE_ASKQUOTE ? ['quote'] : []),
    ...(CFG_MANCHOR.ENABLE_TODO ? ['todo'] : []),
    ...(CFG_MANCHOR.ENABLE_FILES ? ['file'] : []),
  ]);
  if (!allowedTabs.has(activeTab)) activeTab = 'overview';

  popEl.textContent = '';
  popEl.appendChild(UI_MA_menuTitle('Anchor menu', false));

  // ✅ Section wrapper helper (ADD mkSection HERE, inside renderHub, before rows)
  const mkSection = (title, child) => {
    const sec = D.createElement('div');
    sec.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTION);
    sec.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const st = D.createElement('div');
    st.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTITLE);
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    st.textContent = title;

    sec.appendChild(st);
    if (child) sec.appendChild(child);
    return sec;
  };

  // ── 1) Status section
  const rowStatus = D.createElement('div');
  rowStatus.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  rowStatus.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const toggleStatus = (state) => {
    const { items } = load();
    const latest = getLatestStatus(items);
    const cur = latest?.data?.state || null;

    // Enforce: exactly ONE status per line.
    if (cur === state) {
      // Toggle OFF → clear statuses, then if a note exists keep auto "note" status.
      CORE_MA_clearStatuses(msgEl, anchor.off);
      CORE_MA_syncAutoNoteStatus(msgEl, anchor.off);
    } else {
      // Toggle ON → replace any existing status with the new one.
      CORE_MA_clearStatuses(msgEl, anchor.off);
      CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'status', data: { state }, ui: {} });
    }

    renderHub();
  };

  rowStatus.appendChild(UI_MA_mkChip('Done',        latestState === 'done',       () => toggleStatus('done'),       '#2bd576'));
  rowStatus.appendChild(UI_MA_mkChip('Draft',       latestState === 'draft',      () => toggleStatus('draft'),      '#94a3b8'));
  rowStatus.appendChild(UI_MA_mkChip('In progress', latestState === 'inprogress', () => toggleStatus('inprogress'), '#60a5fa'));
  rowStatus.appendChild(UI_MA_mkChip('Waiting',     latestState === 'waiting',    () => toggleStatus('waiting'),    '#fbbf24'));
  rowStatus.appendChild(UI_MA_mkChip('Read later',  latestState === 'later',      () => toggleStatus('later'),      '#4aa8ff'));
  rowStatus.appendChild(UI_MA_mkChip('Come back',   latestState === 'comeback',   () => toggleStatus('comeback'),   '#ffbf3c'));
  rowStatus.appendChild(UI_MA_mkChip('Question',    latestState === 'question',   () => toggleStatus('question'),   '#a78bfa'));
  rowStatus.appendChild(UI_MA_mkChip('Answer',      latestState === 'answer',     () => toggleStatus('answer'),     '#22d3ee'));
  rowStatus.appendChild(UI_MA_mkChip('Revise',      latestState === 'revise',     () => toggleStatus('revise'),     '#ffffff'));
  rowStatus.appendChild(UI_MA_mkChip('Important',   latestState === 'important',  () => toggleStatus('important'),  '#ff4a6e'));
  rowStatus.appendChild(UI_MA_mkChip('Blocked',     latestState === 'blocked',    () => toggleStatus('blocked'),    '#f87171'));
  rowStatus.appendChild(UI_MA_mkChip('Not Working', latestState === 'notworking', () => toggleStatus('notworking'), '#111827'));
  const statusWrap = D.createElement('div');
  statusWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  statusWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  statusWrap.appendChild(rowStatus);
  popEl.appendChild(mkSection('Status', statusWrap));

  // ── 1b) Symbols section (lane 3)
  const symbolDefs = [
    { id: 'arrow', label: '➡︎', symbol: '➡︎', color: '#38bdf8' },
    { id: 'check', label: '⩗', symbol: '⩗', color: '#22c55e' },
    { id: 'cross', label: '✕', symbol: '✕', color: '#ef4444' },
    { id: 'flag',  label: '⚑', symbol: '⚑', color: '#f59e0b' },
    { id: 'star',  label: '★', symbol: '★', color: '#facc15' },
    { id: 'bolt',  label: '⚡', symbol: '⚡', color: '#a855f7' },
  ];

  const hasSym = (items0, def) => (items0 || []).some(it => it && it.type === 'symbol' && ((it.data?.key || '') === def.id || (it.data?.symbol || '') === def.symbol));
  const toggleSymbol = (def) => {
    const { items } = load();
    const existing = (items || []).filter(it => it && it.type === 'symbol' && ((it.data?.key || '') === def.id || (it.data?.symbol || '') === def.symbol));
    if (existing.length) {
      for (const it of existing) CORE_MA_removeItem(msgEl, anchor.off, it.id);
    } else {
      CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'symbol', data: { key: def.id, symbol: def.symbol, color: def.color }, ui: { color: def.color } });
    }
    renderHub();
    OBS_MA_scheduleRepaint(msgEl);
  };

  const rowSyms = D.createElement('div');
  rowSyms.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  rowSyms.setAttribute(ATTR_CGXUI_OWNER, SkID);

  for (const def of symbolDefs) {
    const active = hasSym(items, def);
    const chip = UI_MA_mkChip(def.label, active, () => toggleSymbol(def), def.color);
    chip.style.color = def.color;
    chip.style.fontWeight = '700';
    chip.style.fontSize = '14px';
    rowSyms.appendChild(chip);
  }

  const symWrap = D.createElement('div');
  symWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  symWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  symWrap.appendChild(rowSyms);
  popEl.appendChild(mkSection('Symbols', symWrap));

  // ── 2) Attachments section
  const rowAdd = D.createElement('div');
  rowAdd.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  rowAdd.setAttribute(ATTR_CGXUI_OWNER, SkID);

  rowAdd.appendChild(UI_MA_mkChip('+ Note', false, spawnStickyNoteNow, '#ffffff'));
  if (CFG_MANCHOR.ENABLE_TAGS)     rowAdd.appendChild(UI_MA_mkChip('+ Tag',   false, () => openEditor('tag'),   '#ffffff'));
  if (CFG_MANCHOR.ENABLE_LINKS)    rowAdd.appendChild(UI_MA_mkChip('+ Link',  false, () => openEditor('link'),  '#ffffff'));
  if (CFG_MANCHOR.ENABLE_ASKQUOTE) rowAdd.appendChild(UI_MA_mkChip('+ Quote', false, () => openEditor('quote'), '#ffffff'));
  if (CFG_MANCHOR.ENABLE_TODO)     rowAdd.appendChild(UI_MA_mkChip('+ Todo',  false, () => openEditor('todo'),  '#ffffff'));
  if (CFG_MANCHOR.ENABLE_FILES)    rowAdd.appendChild(UI_MA_mkChip('+ File',  false, () => openEditor('file'),  '#ffffff'));

  const attWrap = D.createElement('div');
  attWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  attWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  attWrap.appendChild(rowAdd);
  popEl.appendChild(mkSection('Attachments', attWrap));

  // editor appears right after attachments (when active)
  const ed = renderEditor();
  if (ed) popEl.appendChild(ed);

  // ── 3) Tabs
  const tabs = D.createElement('div');
  tabs.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TABS);
  tabs.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const tabDefs = [
    { k: 'overview', ok: true },
    { k: 'note',     ok: true },
    { k: 'tag',      ok: !!CFG_MANCHOR.ENABLE_TAGS },
    { k: 'link',     ok: !!CFG_MANCHOR.ENABLE_LINKS },
    { k: 'quote',    ok: !!CFG_MANCHOR.ENABLE_ASKQUOTE },
    { k: 'todo',     ok: !!CFG_MANCHOR.ENABLE_TODO },
    { k: 'file',     ok: !!CFG_MANCHOR.ENABLE_FILES }
  ].filter(x => x.ok);

  for (const t of tabDefs) {
    const b = D.createElement('button');
    b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TAB);
    b.setAttribute(ATTR_CGXUI_OWNER, SkID);
    if (activeTab === t.k) b.setAttribute(ATTR_CGXUI_STATE, 'active');

    // Overview shows NO count
    const cnt =
      t.k === 'overview' ? '' :
      t.k === 'note'     ? byType('note').length :
      t.k === 'tag'      ? byType('tag').length :
      t.k === 'link'     ? byType('link').length :
      t.k === 'quote'    ? byType('quote').length :
      t.k === 'todo'     ? byType('todo').length :
      byType('file').length;

    b.textContent = (t.k === 'overview') ? tabLabel('overview') : `${tabLabel(t.k)} (${cnt})`;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTab(t.k); }, true);
    tabs.appendChild(b);
  }
  popEl.appendChild(tabs);

  const mkItem = (it, main, meta, canEdit, onEdit) => mkItemRow(it, main, meta, canEdit, onEdit);

  const renderListFor = (type) => {
    const arr = byType(type);
    return mkGroup(tabLabel(type), arr, (it) => {
      if (type === 'note') {
        const txt = (it.data?.text || '').trim();
        const one = txt.length > 56 ? (txt.slice(0, 56) + '…') : txt;
        return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('note', it));
      }
      if (type === 'tag') {
        const nm = `#${(it.data?.name || '').trim() || 'tag'}`;
        return mkItem(it, nm, UI_MA_fmtTs(it.ts), true, () => openEditor('tag', it));
      }
      if (type === 'link') {
        const url = (it.data?.url || '').trim();
        const one = url.length > 56 ? (url.slice(0, 56) + '…') : url;
        return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('link', it));
      }
      if (type === 'quote') {
        const q = (it.data?.text || '').trim();
        const one = q.length > 56 ? (q.slice(0, 56) + '…') : q;
        return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('quote', it));
      }
      if (type === 'todo') {
        const t = (it.data?.text || '').trim();
        const one = t.length > 56 ? (t.slice(0, 56) + '…') : t;
        const done = !!it.data?.done;
        const label = done ? `✅ ${one}` : `⬜ ${one}`;
        return mkItem(it, label || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('todo', it));
      }
      // file
      const ref = (it.data?.ref || '').trim();
      const one = ref.length > 56 ? (ref.slice(0, 56) + '…') : ref;
      return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('file', it));
    }, true);
  };

  // ── Content area (ONLY active tab)
  if (activeTab === 'overview') {
    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTION);
    wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const st = D.createElement('div');
    st.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTITLE);
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    st.textContent = 'Overview';
    wrap.appendChild(st);

    const ov = D.createElement('div');
    ov.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_OVERVIEW);
    ov.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const mkKV = (k, v) => {
      const kv = D.createElement('div');
      kv.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_KV);
      kv.setAttribute(ATTR_CGXUI_OWNER, SkID);

      const kk = D.createElement('div');
      kk.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_K);
      kk.setAttribute(ATTR_CGXUI_OWNER, SkID);
      kk.textContent = k;

      const vv = D.createElement('div');
      vv.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_V);
      vv.setAttribute(ATTR_CGXUI_OWNER, SkID);
      vv.textContent = v;

      kv.append(kk, vv);
      return kv;
    };

    ov.appendChild(mkKV('Msg ID', msgId));
    ov.appendChild(mkKV('Anchor off', String(anchor?.off ?? '0')));
    ov.appendChild(mkKV('Items', String(items.length)));
    ov.appendChild(mkKV('Notes / Tags / Links', `${byType('note').length} / ${byType('tag').length} / ${byType('link').length}`));
    ov.appendChild(mkKV('Quotes / Todo / Files', `${byType('quote').length} / ${byType('todo').length} / ${byType('file').length}`));

    // optional: quick peek of current status
    ov.appendChild(mkKV('Latest status', latestState ? String(latestState) : '—'));

    wrap.appendChild(ov);
    popEl.appendChild(wrap);

  } else {
    popEl.appendChild(renderListFor(activeTab));
  }

  UI_MA_placePopup(popEl, clientX, clientY);
  requestAnimationFrame(() => UI_MA_placePopup(popEl, clientX, clientY));
  requestAnimationFrame(() => UI_MA_placePopup(popEl, clientX, clientY));
}

// ✅ Keep this call at the end of UI_MA_openMenu
renderHub();
}

/* ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */
  function CORE_MA_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    DIAG_step('boot');

    try {
      UTIL_registryExtend(H2O.KEYS, {
        [`${PID_UP}_STATE_PINS_V1`]: KEY_MANCHOR_STATE_PINS_V1,
        [`${PID_UP}_SYMBOLS_V1`]: KEY_MANCHOR_SYMBOLS_V1,
        [`${PID_UP}_SYMBOL_COLORS_V1`]: KEY_MANCHOR_SYMBOL_COLORS_V1
      }, `${MODTAG}/KEYS`);
      UTIL_registryExtend(H2O.SEL,  { [`${PID_UP}_ASSISTANT`]: SEL_MANCHOR_ASSISTANT }, `${MODTAG}/SEL`);
      UTIL_registryExtend(H2O.UI,   { [`${PID_UP}_SkID`]: SkID }, `${MODTAG}/UI`);
      UTIL_registryExtend(H2O.EV,   {
        [`${PID_UP}_READY_V1`]: EV_MANCHOR_READY_V1,
        [`${PID_UP}_NOTE_TOGGLE_V1`]: EV_MANCHOR_NOTE_TOGGLE_V1,
        [`${PID_UP}_NOTE_CLOSE_V1`]: EV_MANCHOR_NOTE_CLOSE_V1,
        [`${PID_UP}_NOTE_STATE_V1`]: EV_MANCHOR_NOTE_STATE_V1,
        [`${PID_UP}_SYMBOLS_CHANGED`]: EV_MANCHOR_SYMBOLS_CHANGED
      }, `${MODTAG}/EV`);

      UI_MA_ensureStyle();
      STATE_rebuildSymbolsMapV1();

      // Listen for note state updates (notes script -> core) so pins can reflect "open" glow quickly.
      const onNoteState = (ev) => {
        try {
          const d = ev?.detail || {};
          const msgEl = d.msgEl;
          if (msgEl instanceof HTMLElement) OBS_MA_scheduleRepaint(msgEl);
          else OBS_MA_scheduleRefreshAll();
        } catch {}
      };
      D.addEventListener(EV_MANCHOR_NOTE_STATE_V1, onNoteState, true);
      STATE.disposers.push(() => { try { D.removeEventListener(EV_MANCHOR_NOTE_STATE_V1, onNoteState, true); } catch {} });

      STATE.obsResize = new ResizeObserver((entries) => {
        try { OBS_MA_onResize(entries); } catch (e) { DIAG_error(e); }
      });

      DOM_MA_refreshAll();

      let STATE_scrollRaf = 0;
      const OBS_MA_onScroll = () => {
        if (STATE_scrollRaf) return;
        STATE_scrollRaf = requestAnimationFrame(() => {
          STATE_scrollRaf = 0;
          OBS_MA_scheduleRefreshAll('scroll');
          // Notes script will also reposition portals on scroll; this is okay.
        });
      };
      W.addEventListener(EV_WIN_SCROLL, OBS_MA_onScroll, { passive: true });
      STATE.disposers.push(() => {
        try { W.removeEventListener(EV_WIN_SCROLL, OBS_MA_onScroll); } catch {}
      });

      STATE.obsMut = new MutationObserver((muts) => {
        if (STATE.muting) return;

        let need = false;

        for (const m of muts || []) {
          if (m.type !== 'childList') continue;

          for (const n of m.addedNodes || []) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.closest?.(`[${ATTR_CGXUI_OWNER}="${SkID}"]`)) continue;

            if (n.matches?.(SEL_MANCHOR_ASSISTANT) || n.querySelector?.(SEL_MANCHOR_ASSISTANT)) {
              need = true;
              break;
            }
          }
          if (need) break;
        }

        if (need) OBS_MA_scheduleRefreshAll();
      });
      STATE.obsMut.observe(D.documentElement, { childList: true, subtree: true });

      const onMouseDown = (e) => {
  if (!STATE.popEl) return;
  const t = e && e.target;
  // Don't immediately close on the same click that opened the popup (pins / gutter are outside popEl).
  if (t && (t.closest?.(SEL_MANCHOR_GUTTER_LAYER) || t.closest?.(SEL_MANCHOR_MARKS_LAYER))) return;
  if (STATE.popEl.contains(t)) return;
  UI_MA_hideMenu();
};
      const onKeyDown = (e) => {
        if (e.key === 'Escape') UI_MA_hideMenu();
      };

      D.addEventListener(EV_DOC_MOUSEDOWN, onMouseDown, true);
      D.addEventListener(EV_DOC_KEYDOWN, onKeyDown, true);

      STATE.disposers.push(() => D.removeEventListener(EV_DOC_MOUSEDOWN, onMouseDown, true));
      STATE.disposers.push(() => D.removeEventListener(EV_DOC_KEYDOWN, onKeyDown, true));

      const onResize = () => {
        const els = D.querySelectorAll(SEL_MANCHOR_ASSISTANT);
        for (const el of els) OBS_MA_scheduleRepaint(el);
      };
      W.addEventListener(EV_WIN_RESIZE, onResize, { passive: true });
      STATE.disposers.push(() => W.removeEventListener(EV_WIN_RESIZE, onResize));

      STATE.disposers.push(() => { try { STATE.obsMut?.disconnect(); } catch {} });
      STATE.disposers.push(() => { try { STATE.obsResize?.disconnect(); } catch {} });

      STATE.disposers.push(() => {
        if (STATE.refreshAllTimer) clearTimeout(STATE.refreshAllTimer);
        STATE.refreshAllTimer = 0;

        for (const t of STATE.repaintTimerByMsg.values()) clearTimeout(t);
        STATE.repaintTimerByMsg.clear();
      });

      // ✅ Publish Core API surface for other scripts (Sticky Notes Portal)
      MOD_OBJ.api.core = MOD_OBJ.api.core || {};
      Object.assign(MOD_OBJ.api.core, {
        v: '1.0.0',
        TOK, PID, SkID, BrID, DsID, MODTAG,
        cfg: CFG_MANCHOR,
        keys: { KEY_MANCHOR_STATE_PINS_V1, KEY_MANCHOR_SYMBOLS_V1, KEY_MANCHOR_SYMBOL_COLORS_V1 },
        ev: {
          EV_MANCHOR_READY_V1,
          EV_MANCHOR_NOTE_TOGGLE_V1,
          EV_MANCHOR_NOTE_CLOSE_V1,
          EV_MANCHOR_NOTE_STATE_V1,
          EV_MANCHOR_SYMBOLS_CHANGED
        },
        sel: { SEL_MANCHOR_ASSISTANT },

        util: {
          uid: UTIL_uid,
          getMsgId: UTIL_getMsgId,
          getContentRoot: UTIL_getContentRoot,
          anchorToY: UTIL_anchorToY,
          noteKey: UTIL_noteKey
        },

        store: {
          loadV1: STATE_loadStoreV1,
          saveV1: STATE_saveStoreV1
        },

        items: {
          addItem: CORE_MA_addItem,
          updateItem: CORE_MA_updateItem,
          removeItem: CORE_MA_removeItem
        },

        ui: {
          scheduleRepaint: OBS_MA_scheduleRepaint,
          scheduleRefreshAll: OBS_MA_scheduleRefreshAll
        }
      });

      // Fire READY event (notes script can wait on this)
      try { D.dispatchEvent(new CustomEvent(EV_MANCHOR_READY_V1, { detail: { tok: TOK, pid: PID, skid: SkID } })); } catch {}

      DIAG_step('boot:ok');
    } catch (e) {
      DIAG_error(e);
      try { console.error(`[H2O][${MODTAG}] boot crashed (fail-soft).`, e); } catch {}
    }
  }

  function CORE_MA_dispose() {
    try {
      UI_MA_hideMenu();

      for (const fn of STATE.disposers.splice(0)) {
        try { fn?.(); } catch {}
      }

      const msgs = D.querySelectorAll(SEL_MANCHOR_ASSISTANT);
      for (const msgEl of msgs) {
        try {
          msgEl.querySelector(SEL_MANCHOR_GUTTER_CHILD)?.remove();
          msgEl.querySelector(SEL_MANCHOR_MARKS_CHILD)?.remove();

          if (STATE.origPosByMsg.has(msgEl)) {
            msgEl.style.position = STATE.origPosByMsg.get(msgEl) || '';
            STATE.origPosByMsg.delete(msgEl);
            msgEl.style.overflow = STATE.origOverflowByMsg.get(msgEl) || '';
            STATE.origOverflowByMsg.delete(msgEl);
          }
        } catch {}
      }

      D.getElementById(CSS_MANCHOR_STYLE_ID)?.remove();

      STATE.booted = false;
      DIAG_step('dispose:ok');
    } catch (e) {
      DIAG_error(e);
    }
  }

  MOD_OBJ.boot = MOD_OBJ.boot || CORE_MA_boot;
  MOD_OBJ.dispose = MOD_OBJ.dispose || CORE_MA_dispose;

  function CORE_MA_autostart() {
    if (!CFG_MANCHOR.AUTO_START) return;
    if (D.readyState === 'loading') {
      D.addEventListener(EV_DOM_CONTENT_LOADED, CORE_MA_boot, { once: true });
    } else {
      CORE_MA_boot();
    }
  }

  CORE_MA_autostart();

})();
