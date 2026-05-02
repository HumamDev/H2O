// ==UserScript==
// @h2o-id             1a3a.highlight.dots.minimap.plugin
// @name               1A3a.🔴🌈🗺️ Highlight Dots (MiniMap 🔌 Plugin) 🗺️
// @namespace          H2O.Premium.CGX.highlight.dots.minimap.plugin
// @author             HumamDev
// @version            1.4.0
// @revision           003
// @build              260330-174525
// @description        Self-contained copy of the MiniMap left-side inline highlight dots (identical visuals + behavior)
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ----------------------------------------------------------------------
   *  GOAL
   *  Reproduce the MiniMap "inline highlight dots" that sit on the LEFT of
   *  each MiniMap button, with the same persistence, rendering, dot-menu,
   *  anti-flicker cache, and event bridges—without depending on the full
   *  MiniMap userscript.
   * ---------------------------------------------------------------------- */

  /* ───────────────────────── 0) Realm + Identity ───────────────────────── */
  const W = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
  const R = window;

  // ✅ Ownership flag: this script is the single authority for MiniMap left-side dots
  const TOPW = (W.top || W);
  const DOTS_VER = '1.3.12';
  const BOOT_KEY = '__H2O_MM_DOTS_PLUGIN_BOOT__';
  if (TOPW?.[BOOT_KEY]?.active) return;
  TOPW[BOOT_KEY] = { active: true, version: DOTS_VER, cleanup: null };
  TOPW.H2O_MM_DOTS_PLUGIN = true;
  TOPW.H2O_MM_DOTS_PLUGIN_VER = DOTS_VER;
  const MM_HAS_EXTERNAL_WASH = () => !!TOPW.H2O_MM_WASH_PLUGIN || !!(W.H2O && W.H2O.MM && W.H2O.MM.wash);

  const SUITE = 'prm';
  const HOST  = 'cgx';
  const DsID  = 'mnmp';
  const SkID  = 'mnmp';
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_DISK_INLINE = 'h2o:prm:cgx:nlnhghlghtr';

  /* ───────────────────────── 1) Tokens (attrs/ui/cls/sel) ───────────────────────── */
  const ATTR_ = Object.freeze({
    CGXUI_OWNER:  'data-cgxui-owner',
    CGXUI:        'data-cgxui',
    CGXUI_STATE:  'data-cgxui-state',
    CGXUI_ID:     'data-cgxui-id',
    MSG_ID:       'data-message-id',
    MSG_ROLE:     'data-message-author-role',
    PRIMARY_A_ID: 'data-primary-a-id',
    QUESTION_ID:  'data-question-id',
    DOT_COLORS:   'data-dot-colors',
    TURN_ID:      'data-turn-id',
    DOT_COLOR:    'data-h2o-dot-color',
    DOT_SURFACE:  'data-h2o-dot-surface',
  });

  const UI_ = Object.freeze({
    MINIMAP:   `${SkID}-minimap`,
    COL:       `${SkID}-col`,
    WRAP:      `${SkID}-wrap`,
    BTN:       `${SkID}-btn`,
    DOTROW:    `${SkID}-dotrow`,
    DOT_CELL:  `${SkID}-dot-cell`,
    DOT_MENU:  `${SkID}-dot-menu`,
    SWATCH_ROW:`${SkID}-hl-swatches`,
    SWATCH:    `${SkID}-hl-swatch`,
  });

  const CLS_ = Object.freeze({
    WRAP:      `cgxui-${SkID}-wrap`,
    DOTROW:    `cgxui-${SkID}-dotrow`,
    DOT_CELL:  `cgxui-${SkID}-dot-cell`,
    DOT_MENU:  `cgxui-${SkID}-dot-menu`,
    SWATCH_ROW:`cgxui-${SkID}-hl-swatches`,
    SWATCH:    `cgxui-${SkID}-hl-swatch`,
  });

  const SEL_ = Object.freeze({
    MINIMAP:   `[${ATTR_.CGXUI}="${UI_.MINIMAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_COL:    `[${ATTR_.CGXUI}="${UI_.COL}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_WRAP:   `[${ATTR_.CGXUI}="${UI_.WRAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"], [${ATTR_.CGXUI}="mm-wrap"][${ATTR_.CGXUI_OWNER}="${SkID}"], .cgxui-mm-wrap, .ho-mm-wrap`,
    MM_BTN:    `[${ATTR_.CGXUI}="${UI_.BTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"], [${ATTR_.CGXUI}="mm-btn"][${ATTR_.CGXUI_OWNER}="${SkID}"], [${ATTR_.CGXUI}="${UI_.BTN}"], [${ATTR_.CGXUI}="mm-btn"], .cgxui-mm-btn, .ho-mm-btn`,
    MM_QBTN:   `[data-cgxui="mnmp-qbtn"][data-cgxui-owner="${SkID}"], [data-cgxui="mm-qbtn"][data-cgxui-owner="${SkID}"], .cgxui-mm-qbtn, .ho-mm-qbtn`,
    MM_DOTROW: `[${ATTR_.CGXUI}="${UI_.DOTROW}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
  });

  /* ───────────────────────── 2) Events & Keys ───────────────────────── */
  const EV_ = Object.freeze({
    INLINE_CHANGED:   'evt:h2o:inline:changed',
    INLINE_CHANGED_HO:'h2o-inline:changed',
    INLINE_CHANGED_CGXUI:'cgxui-inline:changed',
    INLINE_RESTORED:  'evt:h2o:inline:restored',
    INLINE_HL_CHANGED:'evt:h2o:inlineHL:changed',
    ANSWERS_SCAN:     'evt:h2o:answers:scan',
    SHELL_READY:      'evt:h2o:minimap:shell-ready',
    ENGINE_READY:     'evt:h2o:minimap:engine-ready',
    MM_INDEX_HYDRATED:'evt:h2o:minimap:index:hydrated',
    MM_INDEX_APPENDED:'evt:h2o:minimap:index:appended',
    MM_VIEW_CHANGED:  'evt:h2o:minimap:view-changed',
    PAGINATION_CHANGED:'evt:h2o:pagination:pagechanged',
    ANSWER_WASH:      'evt:h2o:answer:wash',
    ANSWER_WASH_ALIAS:'h2o:answer:wash',
    ANSWER_WASH_LEGACY_EVT:'evt:h2o:answer:highlight',
    ANSWER_WASH_LEGACY_ALIAS:'h2o:answer:highlight',
  });

  // Live Sync signal (WebDAV LiveState poll/push can listen without monkeypatching storage)
  const EV_LIVE_CHANGED = 'evt:h2o:data:liveChanged';

  const KEY_ = Object.freeze({
    DISK_WASH_MAP_LEGACY_GLOW_HL: `${NS_DISK}:state:glow_hl:v7`,
    DISK_WASH_MAP:     `${NS_DISK}:state:wash_map:v1`,
    DISK_INLINE_DOTS:  `${NS_DISK}:state:inline_dots:v2`,
    DISK_INLINE_DOTS_V1:`${NS_DISK}:state:inline_dots:v1`,
    DISK_INLINE_DOTS_LEGACY_A: 'h2o:mm:inlineDotMap:v1',
    DISK_INLINE_DOTS_LEGACY_B: 'h2o:mm:inlineDotMap',
    DISK_INLINE_HL_STORE_V3: `${NS_DISK_INLINE}:state:inline_highlights:v3`,
    DISK_INLINE_HL_STORE_V2: `${NS_DISK_INLINE}:state:inline_highlights:v2`,
    DISK_INLINE_HL_STORE_V1: `${NS_DISK_INLINE}:state:inline_highlights:v1`,
    DISK_INLINE_HL_STORE_ALIAS_V3: 'h2o:inlineHighlights.v3',
    DISK_INLINE_HL_STORE_ALIAS_V2: 'h2o:inlineHighlights.v2',
    DISK_INLINE_HL_STORE_ALIAS: 'h2o:inlineHighlights',
    DISK_INLINE_HL_STORE_LEGACY_HO_V2: 'ho:inlineHighlights.v2',
    DISK_INLINE_HL_STORE_LEGACY_HO_V1: 'ho:inlineHighlights',
  });

  /* ───────────────────────── 3) Storage helpers ───────────────────────── */
  const UTIL_storage = {
    getStr(key, fb = null) {
      try { return localStorage.getItem(key) ?? fb; } catch { return fb; }
    },
    setStr(key, val) {
      try { localStorage.setItem(key, String(val)); return true; } catch { return false; }
    },
    getJSON(key, fb = null) {
      const s = this.getStr(key, null);
      if (s == null) return fb;
      try { return JSON.parse(s); } catch { return fb; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
    }
  };

  /* ───────────────────────── 4) Palette + helpers ───────────────────────── */
  const COLORS = [
    { name:'blue',   color:'#3A8BFF' },
    { name:'red',    color:'#FF4A4A' },
    { name:'green',  color:'#31D158' },
    { name:'gold',   color:'#FFD700' },
    { name:'sky',    color:'#4CD3FF' },
    { name:'pink',   color:'#FF71C6' },
    { name:'purple', color:'#A36BFF' },
    { name:'orange', color:'#FFA63A' },
  ];

  const DOT_ORDER = (() => {
    const legacy = Array.isArray(R.H2O?.MM?.DOT_ORDER) ? R.H2O.MM.DOT_ORDER : null;
    const fallback = ['blue','red','green','gold','sky','pink','purple','orange'];
    return legacy && legacy.length ? legacy.slice() : fallback;
  })();

  const COLOR_BY_NAME = Object.fromEntries(COLORS.map(c => [String(c.name).toLowerCase(), c.color]));
  const DOT_REF_HEX = {
    green:  '#22c55e',
    blue:   '#3b82f6',
    red:    '#ef4444',
    gold:   '#facc15',
    purple: '#a855f7',
    sky:    '#5BAFEF',
    pink:   '#ec4899',
    orange: '#f97316'
  };

  function cssToRgb(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    if (DOT_REF_HEX[str]) return cssToRgb(DOT_REF_HEX[str]);
    let m = /^#?([0-9a-f]{6})$/i.exec(str);
    if (m) {
      const hex = m[1];
      return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
    }
    m = /^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(str);
    if (m) return { r:+m[1], g:+m[2], b:+m[3] };
    return null;
  }

  function nearestDotColorName(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    if (DOT_ORDER.includes(s)) return s;
    if (COLOR_BY_NAME[s]) s = COLOR_BY_NAME[s];
    const rgb = cssToRgb(s);
    if (!rgb) return null;
    let best = null, bestDist = Infinity;
    for (const name of DOT_ORDER) {
      const ref = cssToRgb(DOT_REF_HEX[name]);
      if (!ref) continue;
      const dr = rgb.r - ref.r, dg = rgb.g - ref.g, db = rgb.b - ref.b;
      const d = dr*dr + dg*dg + db*db;
      if (d < bestDist) { bestDist = d; best = name; }
    }
    return best;
  }

  function canonicalInlineColors(raw) {
    const set = new Set();
    (raw || []).forEach(c => {
      const name = nearestDotColorName(c);
      if (name) set.add(name);
    });
    return DOT_ORDER.filter(n => set.has(n));
  }

  const VALID_WASH_NAMES = new Set(COLORS.map(({ name }) => name.toLowerCase()));
  const VALID_DOT_NAMES  = new Set(DOT_ORDER.map(n => n.toLowerCase()));
  const isValidWashName  = (n) => !!n && VALID_WASH_NAMES.has(String(n).toLowerCase());
  const isValidDotName   = (n) => !!n && VALID_DOT_NAMES.has(String(n).toLowerCase());
  const DEBUG_DOT_CLICK  = !!(TOPW.H2O_MM_DEBUG_DOT_CLICK || TOPW.H2O_MM_DEBUG || false);
  const INLINE_NODE_SEL  = '[data-h2o-inline-color], [data-inline-hl], .cgxui-inline-hl, mark, span[data-inline-hl], span[data-h2o-inline-color], span[style*="background"], mark[style*="background"]';

  /* ───────────────────────── 5) Wash + Inline dot maps (persisted) ───────────────────────── */
  const STORAGE_WASH_MAP_NEW = KEY_.DISK_WASH_MAP;
  const STORAGE_WASH_MAP_LEGACY_GLOW_HL = KEY_.DISK_WASH_MAP_LEGACY_GLOW_HL;
  const KEY_INLINE_DOTS      = KEY_.DISK_INLINE_DOTS;
  const KEY_INLINE_DOTS_LEGACY = [
    KEY_.DISK_INLINE_DOTS_V1,
    KEY_.DISK_INLINE_DOTS_LEGACY_A,
    KEY_.DISK_INLINE_DOTS_LEGACY_B,
  ];
  const KEY_INLINE_HL_STORE_LEGACY = [
    KEY_.DISK_INLINE_HL_STORE_V2,
    KEY_.DISK_INLINE_HL_STORE_V1,
    KEY_.DISK_INLINE_HL_STORE_ALIAS_V3,
    KEY_.DISK_INLINE_HL_STORE_ALIAS_V2,
    KEY_.DISK_INLINE_HL_STORE_ALIAS,
    KEY_.DISK_INLINE_HL_STORE_LEGACY_HO_V2,
    KEY_.DISK_INLINE_HL_STORE_LEGACY_HO_V1,
  ];
  let STATE_INLINE_DOTS_LOADED_FROM_COMPAT = false;

  const washMap = (() => {
    const topW = (W && W.top) ? W.top : window;
    let shared = topW.H2O_MM_washMap;
    if (!shared || typeof shared !== 'object' || Array.isArray(shared)) {
      let fromDisk = null;
      try {
        const raw = UTIL_storage.getStr(STORAGE_WASH_MAP_NEW, null);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fromDisk = parsed;
      } catch {}
      if (!fromDisk) {
        try {
          const rawOld = UTIL_storage.getStr(STORAGE_WASH_MAP_LEGACY_GLOW_HL, null);
          const parsedOld = rawOld ? JSON.parse(rawOld) : null;
          if (parsedOld && typeof parsedOld === 'object' && !Array.isArray(parsedOld)) fromDisk = parsedOld;
        } catch {}
      }
      shared = fromDisk || Object.create(null);
    }
    topW.H2O_MM_washMap = shared;
    return shared;
  })();

  function saveWashMap() {
    try {
      UTIL_storage.setStr(STORAGE_WASH_MAP_NEW, JSON.stringify(washMap || {}));
      try {
        TOPW.dispatchEvent(new CustomEvent(EV_LIVE_CHANGED, {
          detail: {
            domain: DsID,
            source: 'dots',
            keys: [STORAGE_WASH_MAP_NEW, STORAGE_WASH_MAP_LEGACY_GLOW_HL],
            at: Date.now(),
          }
        }));
      } catch {}
    } catch {}
  }

  function hasOwnKeys(obj) {
    if (!obj || typeof obj !== 'object') return false;
    try { return Object.keys(obj).length > 0; } catch { return false; }
  }

  function readJSONObj(key) {
    if (!key) return null;
    try {
      const raw = UTIL_storage.getStr(key, null);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function readJSONObjWithPresence(key) {
    if (!key) return { present: false, value: null };
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return { present: false, value: null };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { present: true, value: null };
      }
      return { present: true, value: parsed };
    } catch {
      return { present: false, value: null };
    }
  }

  function normalizeDotMapShape(rawMap) {
    const out = Object.create(null);
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
    for (const [idRaw, rawColors] of Object.entries(rawMap)) {
      const id = String(idRaw || '').trim();
      if (!id) continue;
      const arr = Array.isArray(rawColors) ? rawColors : (rawColors == null ? [] : [rawColors]);
      const colors = canonicalInlineColors(arr).filter(isValidDotName);
      if (!colors.length) continue;
      mergeDotColorEntry(out, canonicalizeDotAnswerId(id) || id, colors);
    }
    return out;
  }

  function normalizeDotId(raw) {
    let id = String(raw || '').replace(/^conversation-turn-/, '').trim();
    if (!id) return '';
    if (id.startsWith('turn:a:')) id = id.slice(7).trim();
    else if (id.startsWith('turn:')) id = id.slice(5).trim();
    return id;
  }

  function sameDotId(a, b) {
    const aa = normalizeDotId(a);
    const bb = normalizeDotId(b);
    return !!aa && !!bb && aa === bb;
  }

  function isSyntheticNoAnswerId(raw) {
    return /^no-answer:/i.test(String(raw || '').trim());
  }

  function resolveDotMessageEl(raw) {
    const id = normalizeDotId(raw);
    if (!id) return null;
    const esc = escAttrValue(id);
    return document.querySelector(`[${ATTR_.MSG_ID}="${esc}"]`) || document.querySelector(`[id="${esc}"]`) || null;
  }

  function resolveDotCanonicalMeta(raw) {
    const id = normalizeDotId(raw);
    if (!id) return null;

    try {
      const pg = W.H2O_Pagination || null;
      const resolved = pg?.resolveAnyIdToPage?.(id) || pg?.resolveAnyIdToTurnRecord?.(id) || null;
      const answerId = String(
        resolved?.answerId
        || resolved?.answer?.answerId
        || resolved?.answer?.primaryAId
        || resolved?.turn?.answerId
        || resolved?.turn?.primaryAId
        || ''
      ).trim();
      const questionId = String(
        resolved?.questionId
        || resolved?.qId
        || resolved?.turn?.questionId
        || resolved?.turn?.qId
        || ''
      ).trim();
      const turnId = String(
        resolved?.turnId
        || resolved?.turn?.turnId
        || resolved?.answer?.turnId
        || ''
      ).trim();
      if (answerId || questionId || turnId) return { answerId, questionId, turnId };
    } catch {}

    try {
      const meta =
        W?.H2O?.inline?.resolveAnswerMeta?.(id, { role: 'assistant' }) ||
        W?.H2OInline?.resolveAnswerMeta?.(id, { role: 'assistant' }) ||
        null;
      const answerId = String(meta?.answerId || '').trim();
      const turnId = String(meta?.turnId || '').trim();
      if (answerId || turnId) return { answerId, questionId: '', turnId };
    } catch {}

    try {
      const rt = TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
      const record =
        rt?.getTurnRecordByTurnId?.(id)
        || rt?.getTurnRecordByAId?.(id)
        || rt?.getTurnRecordByQId?.(id)
        || null;
      const answerId = String(record?.answerId || record?.primaryAId || '').trim();
      const questionId = String(record?.qId || record?.questionId || '').trim();
      const turnId = String(record?.turnId || record?.id || '').trim();
      if (answerId || questionId || turnId) return { answerId, questionId, turnId };
    } catch {}

    try {
      const turnId = String(TOPW.H2O_MM_turnIdByAId?.get?.(id) || '').trim();
      const row = turnId ? (TOPW.H2O_MM_turnById?.get?.(turnId) || null) : (TOPW.H2O_MM_turnById?.get?.(id) || null);
      const answerId = String(row?.answerId || row?.primaryAId || '').trim();
      const questionId = String(row?.questionId || row?.qId || '').trim();
      const resolvedTurnId = String(row?.turnId || turnId || '').trim();
      if (answerId || questionId || resolvedTurnId) return { answerId, questionId, turnId: resolvedTurnId };
    } catch {}

    try {
      const turnSvc = W.H2O?.turn || null;
      const turns = (typeof turnSvc?.getTurns === 'function') ? (turnSvc.getTurns.call(turnSvc) || []) : [];
      let turnIndex = 0;
      if (typeof turnSvc?.getTurnIndexByQId === 'function') {
        turnIndex = Number(turnSvc.getTurnIndexByQId(id) || 0) || 0;
      }
      if (turnIndex <= 0 && typeof turnSvc?.getTurnIndexByAId === 'function') {
        turnIndex = Number(turnSvc.getTurnIndexByAId(id) || 0) || 0;
      }
      if (turnIndex > 0) {
        const turn = Array.isArray(turns) ? (turns[turnIndex - 1] || null) : null;
        const answerId = String(turn?.primaryAId || turn?.answerId || '').trim();
        const questionId = String(turn?.qId || turn?.questionId || '').trim();
        const turnId = String(turn?.turnId || turn?.id || '').trim();
        if (answerId || questionId || turnId) return { answerId, questionId, turnId };
      }
    } catch {}

    try {
      const primary = String(W.H2O?.turn?.getPrimaryAIdByAId?.(id) || '').trim();
      if (primary) return { answerId: primary, questionId: '', turnId: '' };
    } catch {}

    try {
      const msgEl = resolveDotMessageEl(id);
      const role = String(msgEl?.getAttribute?.(ATTR_.MSG_ROLE) || '').trim().toLowerCase();
      const turnId = String(msgEl?.getAttribute?.(ATTR_.TURN_ID) || msgEl?.dataset?.turnId || '').trim();
      if (role === 'user' || role === 'question') return { answerId: '', questionId: id, turnId };
      if (role === 'assistant' || role === 'answer') return { answerId: id, questionId: '', turnId };
    } catch {}

    return null;
  }

  function canonicalizeDotAnswerId(raw) {
    let id = normalizeDotId(raw);
    if (!id) return '';
    const meta = resolveDotCanonicalMeta(id);
    const primary = String(meta?.answerId || '').trim();
    if (primary) id = normalizeDotId(primary) || primary;
    return id;
  }

  function canonicalizeDotQuestionId(raw) {
    let id = normalizeDotId(raw);
    if (!id) return '';
    const meta = resolveDotCanonicalMeta(id);
    const questionId = String(meta?.questionId || '').trim();
    if (questionId) id = normalizeDotId(questionId) || questionId;
    return id;
  }

  function resolveDotSurfaceMeta(anyId = '', btn = null, roleHint = '') {
    const raw = String(anyId || '').replace(/^conversation-turn-/, '').trim();
    const id = normalizeDotId(raw);
    const wrap = btn?.closest?.(SEL_.MM_WRAP) || null;
    const meta = resolveDotCanonicalMeta(id || raw) || null;
    const answerId = canonicalizeDotAnswerId(
      meta?.answerId
      || btn?.dataset?.primaryAId
      || btn?.getAttribute?.(ATTR_.PRIMARY_A_ID)
      || wrap?.getAttribute?.(ATTR_.PRIMARY_A_ID)
      || ''
    ) || '';
    const questionId = canonicalizeDotQuestionId(
      meta?.questionId
      || btn?.dataset?.questionId
      || btn?.getAttribute?.(ATTR_.QUESTION_ID)
      || wrap?.getAttribute?.(ATTR_.QUESTION_ID)
      || ''
    ) || '';
    const turnId = String(
      meta?.turnId
      || btn?.dataset?.turnId
      || btn?.dataset?.id
      || wrap?.getAttribute?.(ATTR_.TURN_ID)
      || ''
    ).trim();

    let surfaceRole = String(roleHint || btn?.dataset?.surfaceRole || '').trim().toLowerCase();
    if (surfaceRole !== 'question' && surfaceRole !== 'answer') surfaceRole = '';
    if (!surfaceRole && id && questionId && sameDotId(id, questionId)) surfaceRole = 'question';
    if (!surfaceRole && id && answerId && sameDotId(id, answerId)) surfaceRole = 'answer';
    if (!surfaceRole && raw.startsWith('turn:a:')) surfaceRole = 'answer';
    if (!surfaceRole) {
      const msgRole = String(resolveDotMessageEl(id || raw)?.getAttribute?.(ATTR_.MSG_ROLE) || '').trim().toLowerCase();
      if (msgRole === 'user' || msgRole === 'question') surfaceRole = 'question';
      else if (msgRole === 'assistant' || msgRole === 'answer') surfaceRole = 'answer';
    }
    if (!surfaceRole) surfaceRole = questionId && !answerId ? 'question' : 'answer';

    const storageKey = surfaceRole === 'question'
      ? (questionId || normalizeDotId(id || raw) || String(raw || '').trim())
      : (answerId || canonicalizeDotAnswerId(id || raw) || normalizeDotId(id || raw) || String(raw || '').trim());

    return {
      surfaceRole,
      storageKey: String(storageKey || '').trim(),
      answerId,
      questionId,
      turnId,
    };
  }

  function resolveDotStorageKey(anyId = '', btn = null, roleHint = '') {
    return String(resolveDotSurfaceMeta(anyId, btn, roleHint)?.storageKey || '').trim();
  }

  function resolveDotPaintKey(anyId = '', btn = null) {
    const meta = resolveDotSurfaceMeta(anyId, btn);
    return String(meta?.answerId || meta?.turnId || meta?.storageKey || normalizeDotId(anyId) || '').trim();
  }

  function buildDotIdVariants(...inputs) {
    const out = new Set();
    const push = (raw) => {
      const value = String(raw || '').replace(/^conversation-turn-/, '').trim();
      if (!value) return;
      out.add(value);

      const bare = normalizeDotId(value);
      if (!bare) return;
      out.add(bare);
      out.add(`turn:${bare}`);
      out.add(`turn:a:${bare}`);

      const primary = canonicalizeDotAnswerId(bare);
      if (primary) {
        out.add(primary);
        out.add(`turn:${primary}`);
        out.add(`turn:a:${primary}`);
        try {
          const meta = resolveDotCanonicalMeta(primary) || resolveDotCanonicalMeta(bare);
          const canonicalTurnId = String(meta?.turnId || '').trim();
          if (canonicalTurnId) out.add(canonicalTurnId);
        } catch {}
        try {
          const mappedTurnId = String(TOPW.H2O_MM_turnIdByAId?.get?.(primary) || '').trim();
          if (mappedTurnId) out.add(mappedTurnId);
        } catch {}
      }

      try {
        const mappedTurnId = String(TOPW.H2O_MM_turnIdByAId?.get?.(bare) || '').trim();
        if (mappedTurnId) out.add(mappedTurnId);
      } catch {}
    };
    for (const input of inputs.flat(Infinity)) push(input);

    for (const candidate of Array.from(out)) {
      try {
        const row = TOPW.H2O_MM_turnById?.get?.(candidate) || null;
        if (!row) continue;
        const answerId = String(row?.answerId || row?.primaryAId || '').trim();
        const turnId = String(row?.turnId || '').trim();
        if (answerId) {
          out.add(answerId);
          out.add(`turn:${answerId}`);
          out.add(`turn:a:${answerId}`);
        }
        if (turnId) out.add(turnId);
      } catch {}
    }
    return Array.from(out);
  }

  function buildDotQuestionVariants(...inputs) {
    const out = new Set();
    const push = (raw) => {
      const value = String(raw || '').replace(/^conversation-turn-/, '').trim();
      if (!value) return;
      out.add(value);

      const bare = normalizeDotId(value);
      if (!bare) return;
      out.add(bare);

      const questionId = canonicalizeDotQuestionId(bare);
      if (questionId) out.add(questionId);
    };
    for (const input of inputs.flat(Infinity)) push(input);
    return Array.from(out);
  }

  function buildDotStorageVariants(anyId, btn = null, roleHint = '') {
    const meta = resolveDotSurfaceMeta(anyId, btn, roleHint);
    if (meta.surfaceRole === 'question') {
      const variants = buildDotQuestionVariants(meta.storageKey || anyId, meta.questionId || anyId);
      if (!variants.length && meta.storageKey) variants.push(meta.storageKey);
      return variants;
    }
    return buildDotIdVariants(meta.storageKey || anyId, meta.answerId || anyId);
  }

  function mergeDotColorEntry(target, anyId, colors, opts = {}) {
    if (!target || typeof target !== 'object') return false;
    const variants = buildDotStorageVariants(anyId, opts?.btn || null, opts?.roleHint || '');
    const normalized = canonicalInlineColors(colors).filter(isValidDotName);
    if (!normalized.length || !variants.length) return false;

    let key = '';
    for (const variant of variants) {
      if (Object.prototype.hasOwnProperty.call(target, variant)) {
        key = variant;
        break;
      }
    }
    if (!key) key = resolveDotStorageKey(anyId, opts?.btn || null, opts?.roleHint || '') || normalizeDotId(anyId) || variants[0] || '';
    if (!key) return false;

    const prev = Array.isArray(target[key]) ? target[key] : [];
    const merged = canonicalInlineColors([...(prev || []), ...normalized]).filter(isValidDotName);
    const same = (prev.length === merged.length) && prev.every((c, i) => String(c || '') === String(merged[i] || ''));
    if (!same) target[key] = merged;

    for (const variant of variants) {
      if (variant === key) continue;
      const prevVariant = Array.isArray(target[variant]) ? target[variant] : [];
      if (prevVariant.length && sameColorList(prevVariant, merged)) delete target[variant];
    }
    return !same;
  }

  function mergeDotTurnRecord(baseRecord = null, nextRecord = null) {
    const out = (baseRecord && typeof baseRecord === 'object') ? { ...baseRecord } : {};
    const next = (nextRecord && typeof nextRecord === 'object') ? nextRecord : null;
    if (!next) return Object.keys(out).length ? out : null;

    for (const [key, value] of Object.entries(next)) {
      if (value == null) continue;
      if (typeof value === 'string') {
        if (!String(value || '').trim()) continue;
        if (!String(out?.[key] || '').trim()) out[key] = value;
        continue;
      }
      if (typeof value === 'object') {
        if (!out[key]) out[key] = value;
        continue;
      }
      if (out[key] == null) out[key] = value;
    }

    const answerId = String(next?.answerId || next?.primaryAId || '').trim();
    const questionId = String(next?.questionId || next?.qId || '').trim();
    const turnId = String(next?.turnId || next?.id || '').trim();

    if (answerId) {
      if (!String(out?.answerId || '').trim()) out.answerId = answerId;
      if (!String(out?.primaryAId || '').trim()) out.primaryAId = answerId;
    }
    if (questionId) {
      if (!String(out?.questionId || '').trim()) out.questionId = questionId;
      if (!String(out?.qId || '').trim()) out.qId = questionId;
    }
    if (turnId) {
      if (!String(out?.turnId || '').trim()) out.turnId = turnId;
      if (!String(out?.id || '').trim()) out.id = turnId;
    }

    return Object.keys(out).length ? out : null;
  }

  function resolveDotTurnRecord(anyId = '') {
    const direct = resolveDotCanonicalMeta(anyId);
    const directQuestionId = String(direct?.questionId || direct?.qId || '').trim();
    if (directQuestionId) return direct;

    let merged = mergeDotTurnRecord(null, direct);
    const hasRichIdentity = (record) => (
      !!String(record?.turnId || record?.id || '').trim()
      && !!String(record?.answerId || record?.primaryAId || '').trim()
      && !!String(record?.questionId || record?.qId || '').trim()
    );
    const accept = (candidate) => {
      merged = mergeDotTurnRecord(merged, candidate);
      return hasRichIdentity(merged);
    };

    const variants = buildDotIdVariants(
      anyId,
      canonicalizeDotAnswerId(anyId),
      canonicalizeDotQuestionId(anyId),
      direct?.turnId || '',
      direct?.answerId || '',
      direct?.questionId || ''
    );

    for (const variant of variants) {
      try {
        const row = TOPW.H2O_MM_turnById?.get?.(variant) || null;
        if (accept(row)) return merged;
      } catch {}
    }

    const rt = TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
    for (const variant of variants) {
      if (!variant) continue;
      try {
        const record =
          rt?.getTurnRecordByTurnId?.(variant)
          || rt?.getTurnRecordByAId?.(variant)
          || rt?.getTurnRecordByQId?.(variant)
          || null;
        if (accept(record)) return merged;
      } catch {}
    }

    try {
      const turnSvc = W?.H2O?.turn || null;
      const turns = (typeof turnSvc?.getTurns === 'function') ? (turnSvc.getTurns.call(turnSvc) || []) : [];
      for (const variant of variants) {
        if (!variant) continue;
        let turnIndex = 0;
        try { turnIndex = Number(turnSvc?.getTurnIndexByQId?.(variant) || 0) || 0; } catch {}
        if (turnIndex <= 0) {
          try { turnIndex = Number(turnSvc?.getTurnIndexByAId?.(variant) || 0) || 0; } catch {}
        }
        if (turnIndex <= 0) continue;
        const turn = Array.isArray(turns) ? (turns[turnIndex - 1] || null) : null;
        if (accept(turn)) return merged;
      }
    } catch {}

    return merged;
  }

  function resolveDotPrimaryId(anyId = '', btn = null) {
    const fromBtn = String(
      btn?.dataset?.primaryAId ||
      btn?.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
      btn?.getAttribute?.('data-primary-a-id') ||
      ''
    ).trim();
    if (fromBtn) return canonicalizeDotAnswerId(fromBtn) || normalizeDotId(fromBtn) || fromBtn;

    const row = resolveDotTurnRecord(anyId);
    const fromRow = String(row?.answerId || row?.primaryAId || '').trim();
    if (fromRow) return canonicalizeDotAnswerId(fromRow) || normalizeDotId(fromRow) || fromRow;

    const raw = String(anyId || '').replace(/^conversation-turn-/, '').trim();
    if (!raw) return '';
    const canonical = canonicalizeDotAnswerId(raw);
    if (canonical) return canonical;
    if (raw.startsWith('turn:a:')) return normalizeDotId(raw);
    return normalizeDotId(raw) || raw;
  }

  function getDotColorsForId(anyId, btn = null, opts = {}) {
    const variants = buildDotStorageVariants(anyId, btn, opts?.roleHint || '');
    for (const variant of variants) {
      const colors = inlineDotMap?.[variant];
      if (!Array.isArray(colors) || !colors.length) continue;
      return canonicalInlineColors(colors).filter(isValidDotName);
    }
    return [];
  }

  function setDotColorsForId(anyId, colors, opts = {}) {
    const key = resolveDotStorageKey(anyId, opts?.btn || null, opts?.roleHint || '') || anyId;
    return mergeDotColorEntry(inlineDotMap, key, colors, opts);
  }

  function clearDotColorsForId(anyId, btn = null, opts = {}) {
    const variants = buildDotStorageVariants(anyId, btn, opts?.roleHint || '');
    let changed = false;
    for (const variant of variants) {
      if (!variant) continue;
      if (Object.prototype.hasOwnProperty.call(inlineDotMap, variant)) {
        delete inlineDotMap[variant];
        changed = true;
      }
    }
    return changed;
  }

  function getCurrentDotConvoKey() {
    const m = String(location.pathname || '').match(/\/c\/([a-z0-9-]+)/i);
    return m?.[1] ? `c/${m[1]}` : '';
  }

  function isCurrentDotStoreEntry(answerId, item) {
    if (!item || typeof item !== 'object') return false;
    const currentConvoId = getCurrentDotConvoKey();
    const convoId = String(item?.convoId || item?.chatId || item?.conversationId || '').trim();
    if (convoId) return !currentConvoId || convoId === currentConvoId;
    if (resolveDotCanonicalMeta(answerId)) return true;
    try {
      const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(answerId || '')) : String(answerId || '');
      return !!document.querySelector(`[${ATTR_.MSG_ID}="${esc}"]`);
    } catch {}
    return false;
  }

  function dotMapFromHighlightStore(rawStore) {
    const out = Object.create(null);
    const itemsByAnswer = rawStore?.itemsByAnswer;
    if (!itemsByAnswer || typeof itemsByAnswer !== 'object') return out;
    for (const [idRaw, list] of Object.entries(itemsByAnswer)) {
      const meta = resolveDotSurfaceMeta(idRaw);
      const id = resolveDotStorageKey(idRaw, null, meta?.surfaceRole || '') || String(idRaw || '').trim();
      if (!id || !Array.isArray(list) || !list.length) continue;
      const scoped = list.filter((item) => isCurrentDotStoreEntry(id, item));
      if (!scoped.length) continue;
      const src = [];
      for (const item of scoped) {
        const colorName = String(item?.color || '').trim().toLowerCase();
        const hexColor = String(item?.hex || '').trim();
        if (colorName) src.push(colorName);
        if (hexColor) src.push(hexColor);
      }
      const colors = canonicalInlineColors(src).filter(isValidDotName);
      if (colors.length) mergeDotColorEntry(out, id, colors, { roleHint: meta?.surfaceRole || '' });
    }
    return out;
  }

  function mergeNormalizedDotMap(target, mapLike) {
    if (!target || typeof target !== 'object') return 0;
    const src = normalizeDotMapShape(mapLike);
    if (!hasOwnKeys(src)) return 0;
    let changed = 0;
    for (const [id, colors] of Object.entries(src)) {
      if (mergeDotColorEntry(target, id, colors)) changed += 1;
    }
    return changed;
  }

  function loadInlineDotsCompat() {
    STATE_INLINE_DOTS_LOADED_FROM_COMPAT = false;
    const out = Object.create(null);
    const highlightStoreCanon = readJSONObjWithPresence(KEY_.DISK_INLINE_HL_STORE_V3);
    if (!highlightStoreCanon.present) return out;
    mergeNormalizedDotMap(out, dotMapFromHighlightStore(highlightStoreCanon.value));
    return out;
  }

  const inlineDotMap = (() => {
    const topW = (W && W.top) ? W.top : window;
    if (topW.H2O_MM_inlineDotMap && typeof topW.H2O_MM_inlineDotMap === 'object') {
      const shared = topW.H2O_MM_inlineDotMap;
      if (!hasOwnKeys(shared)) {
        const compat = loadInlineDotsCompat();
        for (const [id, colors] of Object.entries(compat)) shared[id] = colors;
      }
      return shared;
    }
    let obj = loadInlineDotsCompat();
    topW.H2O_MM_inlineDotMap = obj;
    return obj;
  })();

  function purgeSyntheticNoAnswerDotKeys({ persist = false } = {}) {
    let changed = 0;
    for (const key of Object.keys(inlineDotMap || {})) {
      if (!isSyntheticNoAnswerId(key)) continue;
      delete inlineDotMap[key];
      changed += 1;
    }
    if (changed && persist) saveInlineDots();
    return changed;
  }

  function sameColorList(a, b) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
      if (String(aa[i] || '') !== String(bb[i] || '')) return false;
    }
    return true;
  }

  function mergeInlineDotsMap(rawMap, { persist = false } = {}) {
    const next = normalizeDotMapShape(rawMap);
    if (!hasOwnKeys(next)) return 0;
    let changed = 0;
    for (const [id, colors] of Object.entries(next)) {
      if (mergeDotColorEntry(inlineDotMap, id, colors)) changed += 1;
    }
    if (changed && persist) saveInlineDots();
    return changed;
  }

  function rekeyInlineDotMapToCanonical({ persist = false } = {}) {
    let changed = 0;
    for (const [idRaw, colors] of Object.entries({ ...(inlineDotMap || {}) })) {
      const id = String(idRaw || '').trim();
      const nextKey = resolveDotStorageKey(id) || '';
      if (!id || !nextKey || id === nextKey) continue;
      if (mergeDotColorEntry(inlineDotMap, nextKey, colors)) changed += 1;
      if (Object.prototype.hasOwnProperty.call(inlineDotMap, id)) {
        delete inlineDotMap[id];
        changed += 1;
      }
    }
    if (changed && persist) saveInlineDots();
    return changed;
  }

  function hydrateInlineDotsFromInlineApi({ persist = true } = {}) {
    void persist;
    const readers = [
      W?.H2O?.inline?.getStore,
      W?.H2OInline?.getStore,
      TOPW?.H2O?.inline?.getStore,
      TOPW?.H2OInline?.getStore,
    ];
    for (const readStore of readers) {
      if (typeof readStore !== 'function') continue;
      try {
        const out = readStore();
        if (out && typeof out.then === 'function') {
          try {
            out.then((store) => {
              try {
                const map = dotMapFromHighlightStore(store);
                const changed = mergeInlineDotsMap(map, { persist: false });
                if (changed) scheduleRepaintDotsForAllMiniBtns();
              } catch {}
            }).catch(() => {});
          } catch {}
          continue;
        }
        const map = dotMapFromHighlightStore(out);
        const changed = mergeInlineDotsMap(map, { persist: false });
        if (changed) return changed;
      } catch {}
    }
    return 0;
  }

  function saveInlineDots() {
    try {
      const snapshot = normalizeDotMapShape(inlineDotMap);
      try {
        if (inlineDotMap && typeof inlineDotMap === 'object') {
          for (const key of Object.keys(inlineDotMap)) {
            if (!Object.prototype.hasOwnProperty.call(snapshot, key)) delete inlineDotMap[key];
          }
          for (const [key, colors] of Object.entries(snapshot)) {
            inlineDotMap[key] = colors;
          }
        }
      } catch {}
      const ok = !!UTIL_storage.setStr(KEY_INLINE_DOTS, JSON.stringify(snapshot || {}));
      try {
        TOPW.dispatchEvent(new CustomEvent(EV_LIVE_CHANGED, {
          detail: {
            domain: DsID,
            source: 'dots',
            keys: [KEY_INLINE_DOTS],
            at: Date.now(),
          }
        }));
      } catch {}
      return ok;
    } catch {
      return false;
    }
  }

  purgeSyntheticNoAnswerDotKeys({ persist: true });

  try {
    W.H2O = W.H2O || {};
    W.H2O.MM = W.H2O.MM || {};
    W.H2O.MM.inlineDotMap = inlineDotMap;
    W.H2O.MM.washMap = washMap;
  } catch {}

/* ───────────────────────── 6) Style injection (dot layout) ───────────────────────── */
(function injectDotCSS() {
  const ID = 'h2o-mm-dots-standalone-css';
  let st = document.getElementById(ID);
  if (!st) {
    st = document.createElement('style');
    st.id = ID;
    document.head.appendChild(st);
  } else {
    document.head.appendChild(st);
  }

  const wrapSel   = `.${CLS_.WRAP}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.WRAP}"]`;
  const minimapSel = `[${ATTR_.CGXUI}="${UI_.MINIMAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;
  const dotRowSel = `.${CLS_.DOTROW}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.DOTROW}"]`;
  const dotSel    = `.${CLS_.DOT_CELL}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.DOT_CELL}"]`;

  st.textContent = `
:root{
  --mm-dot-gutter: 22px;
  --mm-dot-gap: 10px;
  --mm-dot-x: calc(-2 * (var(--mm-dot-gutter) - var(--mm-dot-gap)) + 8px);
  --mm-dot-shift: 2px;
  --mm-dot-size: 5px;
  --mm-dot-col-gap: 3px;
  --mm-dot-row-gap: 3px;
  --mm-dot-cols: 4;
  --mm-btn-h: 24px;
}

${wrapSel}{
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: var(--mm-btn-h, 24px) !important;
}

${dotRowSel}{
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;

  display: grid !important;
  align-items: center !important;
  justify-items: center !important;
  pointer-events: auto !important;
  z-index: 10 !important;
  box-sizing: content-box !important;
  contain: paint !important;

  grid-template-columns: repeat(var(--mm-dot-cols), var(--mm-dot-size)) !important;
  grid-auto-rows: var(--mm-dot-size) !important;
  column-gap: var(--mm-dot-col-gap) !important;
  row-gap: var(--mm-dot-row-gap) !important;

  left: calc(var(--mm-dot-x) + var(--mm-dot-shift)) !important;
}

${minimapSel}[data-cgxui-view="qa"] ${wrapSel} ${dotRowSel}[data-h2o-dot-surface="question"]{
  top: calc(var(--mm-q-btn-h, 18px) / 2) !important;
}

${minimapSel}[data-cgxui-view="qa"] ${wrapSel} ${dotRowSel}[data-h2o-dot-surface="answer"]{
  top: calc(var(--mm-q-btn-h, 18px) + var(--mm-qa-gap, 8px) + (var(--mm-btn-h, 24px) / 2) + 1px) !important;
}

${dotSel}{
  width: 5px !important;
  height: 5px !important;
  border-radius: 50% !important;
  margin: 0 !important;
  background: transparent;
  box-shadow: none;
}
`;
})();


  /* ───────────────────────── 7) Dot Menu UI (palette) ───────────────────────── */
  const Z = 2147483647;
  const dotMenu = document.createElement('div');
  dotMenu.className = CLS_.DOT_MENU;
  dotMenu.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  dotMenu.setAttribute(ATTR_.CGXUI, UI_.DOT_MENU);
  Object.assign(dotMenu.style, {
    position: 'fixed',
    zIndex: Z,
    display: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '5px 6px',
    borderRadius: '6px',
    background: 'rgba(26,26,26,0.85)',
    border: '1px solid rgba(255,255,255,0.04)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
  });
  document.body.appendChild(dotMenu);

  const styleDotMenu = document.createElement('style');
  styleDotMenu.textContent = `
  .${CLS_.SWATCH_ROW} { display: inline-flex; gap: 3px; margin-right: 3px; }
  .${CLS_.SWATCH} {
    all: unset;
    width: 12px;
    height: 4px;
    border-radius: 2px;
    cursor: pointer;
    border: 1px solid rgba(0,0,0,0.4);
    opacity: 0.85;
    filter: brightness(0.7) contrast(0.7);
    transition: transform .15s, opacity .15s, filter .15s;
  }
  .${CLS_.SWATCH}:hover { opacity: 1; transform: scaleY(1.2); filter: brightness(1.05) contrast(1); }
  `;
  document.head.appendChild(styleDotMenu);

  const swatchRow = document.createElement('div');
  swatchRow.className = CLS_.SWATCH_ROW;
  swatchRow.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  swatchRow.setAttribute(ATTR_.CGXUI, UI_.SWATCH_ROW);
  dotMenu.appendChild(swatchRow);

  COLORS.forEach(({ name, color }) => {
    const sw = document.createElement('button');
    sw.className = CLS_.SWATCH;
    sw.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    sw.setAttribute(ATTR_.CGXUI, UI_.SWATCH);
    sw.style.background = color;
    sw.title = name;
    sw.addEventListener('click', () => {
      if (!dotMenu._target) return;
      const { answerId, colorIndex } = dotMenu._target;
      const arr = inlineDotMap[answerId] || [];
      if (isValidDotName(name)) arr[colorIndex] = name;
      else delete arr[colorIndex];
      inlineDotMap[answerId] = arr.filter(Boolean);
      saveInlineDots();
      syncMiniMapDot(answerId, arr);
      hideDotMenu();
    });
    swatchRow.appendChild(sw);
  });

  function showDotMenu(event, answerId, colorIndex) {
    event.preventDefault();
    dotMenu._target = { answerId, colorIndex };
    dotMenu.style.display = 'flex';
    const rect = event.target.getBoundingClientRect();
    const menuWidth = 110;
    dotMenu.style.left = Math.max(4, rect.left - menuWidth - 8) + 'px';
    dotMenu.style.top  = Math.max(6, rect.top - 4) + 'px';
  }
  function hideDotMenu() { dotMenu.style.display = 'none'; dotMenu._target = null; }
  window.addEventListener('click', e => { if (!dotMenu.contains(e.target)) hideDotMenu(); }, true);
  window.showDotMenu = showDotMenu;

  /* ───────────────────────── 7.5) Turn recolor popup bridge (Highlights Engine authority) ───────────────────────── */
  function openHighlightsPopupBridge(event, ctx) {
    const payload = {
      turnId: String(ctx?.turnId || '').trim(),
      answerId: String(ctx?.answerId || '').trim(),
      sourceColor: String(ctx?.sourceColor || '').trim().toLowerCase(),
      anchorRect: ctx?.anchorRect || null,
      leftAnchorX: ctx?.leftAnchorX,
      clientX: Number(event?.clientX || 0),
      clientY: Number(event?.clientY || 0),
      mode: 'bulk-recolor',
      source: 'dots:middle'
    };
    const openFns = [
      TOPW?.H2O_HL?.openPopup,
      W?.H2O?.inline?.openPopup,
      W?.H2OInline?.openPopup,
    ].filter((fn) => typeof fn === 'function');
    for (const fn of openFns) {
      try {
        const out = fn(payload);
        if (out === true || (out && typeof out === 'object')) return true;
      } catch {}
    }
    return false;
  }

  /* ───────────────────────── 8) Button resolver ───────────────────────── */
  const TOPW_REF = (W && W.top) ? W.top : window;
  const getMapButtons = () => {
    if (TOPW_REF.H2O_MM_mapButtons instanceof Map) return TOPW_REF.H2O_MM_mapButtons;
    const m = new Map();
    TOPW_REF.H2O_MM_mapButtons = m;
    return m;
  };

  function getConnectedMiniMapButtons() {
    const out = [];
    const seen = new Set();
    try {
      const map = getMapButtons();
      for (const btn of map.values()) {
        if (!btn || !btn.isConnected || seen.has(btn)) continue;
        seen.add(btn);
        out.push(btn);
      }
    } catch {}
    if (out.length) return out;

    let scanRoot = null;
    try {
      scanRoot = document.querySelector(SEL_.MM_COL) || document.querySelector(SEL_.MINIMAP) || null;
    } catch {}

    try {
      const btns = Array.from((scanRoot || document).querySelectorAll(SEL_.MM_BTN));
      for (const btn of btns) {
        if (!btn || seen.has(btn)) continue;
        seen.add(btn);
        out.push(btn);
      }
    } catch {}
    return out;
  }

  function countMiniMapButtons() {
    return getConnectedMiniMapButtons().length;
  }

  function H2O_MM_findMiniBtn(anyId) {
    const key = String(anyId || '').trim();
    const surface = resolveDotSurfaceMeta(key);
    const paintKey = resolveDotPaintKey(key) || key;
    const variants = buildDotIdVariants(paintKey, surface?.answerId || '', surface?.turnId || '');
    if (!variants.length) return null;
    for (const variant of variants) {
      try {
        const b = getMapButtons().get(variant);
        if (b) return b;
      } catch {}
    }

    // dataset primaryAId scan fallback
    try {
      let found = null;
      getMapButtons().forEach((b) => {
        if (found) return;
        const pid = String(b?.dataset?.primaryAId || '').trim();
        const bid = String(b?.dataset?.id || b?.dataset?.turnId || '').trim();
        const keys = buildDotIdVariants(pid, bid);
        if (keys.some((candidate) => variants.includes(candidate))) found = b;
      });
      if (found) return found;
    } catch {}

    try {
      const coreFns = [
        TOPW?.H2O_MM_SHARED?.get?.()?.api?.core?.getBtnById,
        W?.H2O?.MM?.core?.getBtnById,
        TOPW?.H2O_MM_getBtnById,
        W?.H2O_MM_getBtnById,
      ].filter((fn) => typeof fn === 'function');
      for (const fn of coreFns) {
        for (const variant of variants) {
          try {
            const btn = fn(variant);
            if (btn) return btn;
          } catch {}
        }
      }
    } catch {}

    try {
      const qId = String(surface?.questionId || '').trim();
      if (qId) {
        const buttons = getConnectedMiniMapButtons();
        for (const btn of buttons) {
          const wrap = btn?._h2oHost || btn?.closest?.(SEL_.MM_WRAP) || null;
          const wrapQId = String(
            wrap?.getAttribute?.(ATTR_.QUESTION_ID) ||
            wrap?.dataset?.questionId ||
            ''
          ).trim();
          if (wrapQId && wrapQId === qId) return btn;
        }

        const escQ = escAttrValue(qId);
        let wrap = document.querySelector(`${SEL_.MM_WRAP}[${ATTR_.QUESTION_ID}="${escQ}"]`) || null;
        if (!wrap) {
          const qBtns = document.querySelectorAll(SEL_.MM_QBTN);
          for (const qBtn of qBtns) {
            if (String(qBtn?.getAttribute?.(ATTR_.QUESTION_ID) || qBtn?.dataset?.questionId || '').trim() !== qId) continue;
            wrap = qBtn.closest?.(SEL_.MM_WRAP) || null;
            if (wrap) break;
          }
        }
        const btn = wrap?.querySelector?.(SEL_.MM_BTN) || null;
        if (btn) return btn;
      }
    } catch {}

    // DOM scan fallback
    try {
      const scanRoot = document.querySelector(SEL_.MM_COL) || document.querySelector(SEL_.MINIMAP) || document;
      const btns = scanRoot.querySelectorAll(SEL_.MM_BTN);
      for (const btn of btns) {
        const pid = String(
          btn?.dataset?.primaryAId ||
          btn?.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
          btn?.getAttribute?.('data-primary-a-id') ||
          ''
        ).trim();
        const bid = String(
          btn?.dataset?.id ||
          btn?.dataset?.turnId ||
          btn?.getAttribute?.(ATTR_.CGXUI_ID) ||
          ''
        ).trim();
        const qid = String(
          btn?.closest?.(SEL_.MM_WRAP)?.getAttribute?.(ATTR_.QUESTION_ID) ||
          btn?.closest?.(SEL_.MM_WRAP)?.dataset?.questionId ||
          ''
        ).trim();
        const keys = buildDotIdVariants(pid, bid);
        if (qid) keys.push(qid);
        if (keys.some((candidate) => variants.includes(candidate))) return btn;
      }
    } catch {}
    return null;
  }

  /* ───────────────────────── 9) Wash + dot application ───────────────────────── */
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function luminance({ r, g, b }) {
    const srgb = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }
  function bestTextColor(bgHex) {
    const L = luminance(hexToRgb(bgHex || '#222'));
    return L > 0.5 ? '#111' : '#fff';
  }

  function applyMiniMapWash(primaryId, btn) {
    const washApi = W?.H2O?.MM?.wash;
    if (washApi && typeof washApi.applyToMiniBtn === 'function') {
      try { washApi.applyToMiniBtn(primaryId, btn); return; } catch {}
    }

    const rawName = primaryId ? washMap?.[primaryId] : null;
    const colorName = isValidWashName(rawName) ? rawName : null;
    if (rawName && !colorName) { try { delete washMap[primaryId]; } catch {} }
    const bg = colorName ? (COLOR_BY_NAME?.[colorName] || null) : null;
    if (bg) {
      const text = bestTextColor(bg);
      btn.style.background =
        `linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10)), ${bg}`;
      btn.style.color = text;
      btn.style.textShadow =
        text === '#fff' ? '0 0 2px rgba(0,0,0,.35)' : '0 1px 0 rgba(255,255,255,.35)';
      btn.style.boxShadow = `0 0 6px 2px ${bg}40`;
      btn.dataset.wash = 'true';
      try { btn.setAttribute('data-cgxui-wash', '1'); } catch {}
    } else {
      btn.style.background = 'rgba(255,255,255,.06)';
      btn.style.color = '#e5e7eb';
      btn.style.textShadow = '0 0 2px rgba(0,0,0,.25)';
      btn.style.boxShadow = 'none';
      btn.dataset.wash = 'false';
      try { btn.removeAttribute('data-cgxui-wash'); } catch {}
    }
  }

  function repaintMiniMapWash(primaryId, btn) {
    const id = String(primaryId || '').trim();
    if (!id || !btn) return false;
    const coreFns = [
      TOPW?.H2O_MM_SHARED?.get?.()?.api?.core?.repaintMiniBtnByAnswerId,
      W?.H2O?.MM?.core?.repaintMiniBtnByAnswerId,
      TOPW?.H2O_MM_repaintMiniBtnByAnswerId,
      W?.H2O_MM_repaintMiniBtnByAnswerId,
    ].filter((fn) => typeof fn === 'function');
    for (const fn of coreFns) {
      try {
        const out = fn(id, btn);
        if (out !== false) return true;
      } catch {}
    }
    if (isQaMiniMapView()) return false;
    try {
      applyMiniMapWash(id, btn);
      return true;
    } catch {}
    return false;
  }

  function isQaMiniMapView() {
    const minimap = document.querySelector(SEL_.MINIMAP) || null;
    return String(minimap?.getAttribute?.('data-cgxui-view') || '').trim().toLowerCase() === 'qa';
  }

  function getQuestionBtnForWrap(wrap) {
    if (!wrap) return null;
    return wrap.querySelector?.(SEL_.MM_QBTN) || null;
  }

  function getDotRowForHost(host, surface = 'combined') {
    if (!host) return null;
    const esc = escAttrValue(surface);
    return host.querySelector?.(`${SEL_.MM_DOTROW}[${ATTR_.DOT_SURFACE}="${esc}"]`)
      || (surface === 'combined' ? (host.querySelector?.(`${SEL_.MM_DOTROW}:not([${ATTR_.DOT_SURFACE}])`) || null) : null);
  }

  function removeDotRowForHost(host, surface = 'combined') {
    if (!host) return false;
    const esc = escAttrValue(surface);
    const rows = surface === 'combined'
      ? host.querySelectorAll?.(`${SEL_.MM_DOTROW}[${ATTR_.DOT_SURFACE}="${esc}"], ${SEL_.MM_DOTROW}:not([${ATTR_.DOT_SURFACE}])`)
      : host.querySelectorAll?.(`${SEL_.MM_DOTROW}[${ATTR_.DOT_SURFACE}="${esc}"]`);
    if (!rows?.length) return false;
    rows.forEach((row) => {
      try { row.remove?.(); } catch {}
    });
    return true;
  }

  function setDotRowMeta(row, meta = {}) {
    if (!row) return row;
    const surface = String(meta?.surface || 'combined').trim() || 'combined';
    row.setAttribute(ATTR_.DOT_SURFACE, surface);
    const turnId = String(meta?.turnId || '').trim();
    const answerId = String(meta?.answerId || '').trim();
    const questionId = String(meta?.questionId || '').trim();
    if (turnId) row.setAttribute(ATTR_.TURN_ID, turnId);
    else row.removeAttribute(ATTR_.TURN_ID);
    if (answerId) row.setAttribute(ATTR_.PRIMARY_A_ID, answerId);
    else row.removeAttribute(ATTR_.PRIMARY_A_ID);
    if (questionId) row.setAttribute(ATTR_.QUESTION_ID, questionId);
    else row.removeAttribute(ATTR_.QUESTION_ID);
    try {
      row.style.top = surface === 'question'
        ? 'calc(var(--mm-q-btn-h) / 2)'
        : (surface === 'answer'
          ? 'calc(var(--mm-q-btn-h) + var(--mm-qa-gap) + (var(--mm-btn-h) / 2) + 1px)'
          : '50%');
      row.style.transform = 'translateY(-50%)';
    } catch {}
    return row;
  }

  function dotRowMatchesMeta(row, meta = {}) {
    if (!row) return false;
    const wantSurface = String(meta?.surface || 'combined').trim() || 'combined';
    const gotSurface = String(row.getAttribute?.(ATTR_.DOT_SURFACE) || 'combined').trim() || 'combined';
    if (wantSurface !== gotSurface) return false;

    const checks = [
      [ATTR_.TURN_ID, String(meta?.turnId || '').trim()],
      [ATTR_.PRIMARY_A_ID, String(meta?.answerId || '').trim()],
      [ATTR_.QUESTION_ID, String(meta?.questionId || '').trim()],
    ];

    for (const [attrName, expected] of checks) {
      if (!expected) continue;
      const got = String(row.getAttribute?.(attrName) || '').trim();
      if (!got || !sameDotId(got, expected)) return false;
    }
    return true;
  }

  function collectInlineColorsFromMessageEl(messageEl) {
    if (!messageEl) return [];
    const seen = new Set();
    try {
      const nodes = messageEl.querySelectorAll?.(INLINE_NODE_SEL) || [];
      for (const node of nodes) {
        const c = String(readInlineNodeColor(node) || '').trim().toLowerCase();
        if (!c || !isValidDotName(c)) continue;
        seen.add(c);
      }
    } catch {}
    return DOT_ORDER.filter((c) => seen.has(c));
  }

  function surfaceRoleMatchesMessage(roleValue, surfaceRole = '') {
    const role = String(roleValue || '').trim().toLowerCase();
    if (!role) return false;
    if (surfaceRole === 'question') return role === 'user' || role === 'question';
    if (surfaceRole === 'answer') return role === 'assistant' || role === 'answer';
    return false;
  }

  function resolveSurfaceMessageEl(messageEl, surfaceRole = '', messageId = '') {
    const targetRole = String(surfaceRole || '').trim().toLowerCase();
    if (targetRole !== 'question' && targetRole !== 'answer') return null;
    const targetId = String(messageId || '').trim();
    const roleSelector = `[${ATTR_.MSG_ROLE}], [data-message-author-role]`;
    const matchesSurface = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const role = String(
        el.getAttribute?.(ATTR_.MSG_ROLE) ||
        el.getAttribute?.('data-message-author-role') ||
        el.dataset?.messageAuthorRole ||
        ''
      ).trim().toLowerCase();
      if (!surfaceRoleMatchesMessage(role, targetRole)) return false;
      if (!targetId) return true;
      const elId = String(
        el.getAttribute?.(ATTR_.MSG_ID) ||
        el.getAttribute?.('data-message-id') ||
        el.dataset?.messageId ||
        ''
      ).trim();
      return !elId || sameDotId(elId, targetId);
    };

    const root = messageEl && messageEl.nodeType === 1 ? messageEl : messageEl?.parentElement || null;
    if (!root) return null;
    if (matchesSurface(root)) return root;

    if (targetId) {
      const escId = escAttrValue(targetId);
      const byId = root.querySelector?.(`[${ATTR_.MSG_ID}="${escId}"], [data-message-id="${escId}"]`) || null;
      if (matchesSurface(byId)) return byId;
    }

    const scoped = root.querySelectorAll?.(roleSelector) || [];
    for (const candidate of scoped) {
      if (matchesSurface(candidate)) return candidate;
    }

    const owner = root.closest?.(roleSelector) || null;
    return matchesSurface(owner) ? owner : null;
  }

  function getLiveDotColorsForSurface(messageEl, surfaceRole = '', messageId = '') {
    const scoped = resolveSurfaceMessageEl(messageEl, surfaceRole, messageId);
    if (!scoped) return { colors: [], hasMessage: false };
    return { colors: collectInlineColorsFromMessageEl(scoped), hasMessage: true };
  }

  function preferLiveOrStoredDotColors(liveResult, storedColors = []) {
    const live = canonicalInlineColors(Array.isArray(liveResult?.colors) ? liveResult.colors : []).filter(isValidDotName);
    if (live.length) return live;
    const stored = canonicalInlineColors(Array.isArray(storedColors) ? storedColors : [storedColors]).filter(isValidDotName);
    if (stored.length) return stored;
    return liveResult?.hasMessage ? [] : stored;
  }

  function resolveQaMiniMapSurfaceContext(host, btn) {
    const qBtn = getQuestionBtnForWrap(host);
    let turnId = String(
      qBtn?.dataset?.turnId ||
      btn?.dataset?.turnId ||
      btn?.dataset?.id ||
      host?.getAttribute?.(ATTR_.TURN_ID) ||
      host?.dataset?.turnId ||
      ''
    ).trim();
    let primaryId = String(
      resolveDotPrimaryId('', btn) ||
      btn?.dataset?.primaryAId ||
      qBtn?.dataset?.primaryAId ||
      host?.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
      host?.dataset?.primaryAId ||
      ''
    ).trim();
    let questionId = String(
      qBtn?.dataset?.questionId ||
      host?.getAttribute?.(ATTR_.QUESTION_ID) ||
      host?.dataset?.questionId ||
      ''
    ).trim();

    if (!turnId) {
      const turnRecord = resolveDotTurnRecord(primaryId || questionId || '');
      turnId = String(turnRecord?.turnId || '').trim();
    }
    if (!primaryId && turnId) primaryId = String(resolveAnswerIdForTurn(turnId, '') || '').trim();

    questionId = canonicalizeDotQuestionId(questionId) || questionId;
    if (!questionId && turnId) questionId = String(resolveQuestionIdForTurn(turnId, questionId) || '').trim();
    if (!questionId) {
      const turnRecord = resolveDotTurnRecord(primaryId || turnId || '');
      const recordQuestionId = String(turnRecord?.questionId || turnRecord?.qId || '').trim();
      questionId = canonicalizeDotQuestionId(recordQuestionId) || recordQuestionId;
      if (!primaryId) {
        const recordAnswerId = String(turnRecord?.answerId || turnRecord?.primaryAId || '').trim();
        primaryId = canonicalizeDotAnswerId(recordAnswerId) || normalizeDotId(recordAnswerId) || recordAnswerId;
      }
      if (!turnId) turnId = String(turnRecord?.turnId || '').trim();
    }

    if (host) {
      if (turnId) {
        host.setAttribute(ATTR_.TURN_ID, turnId);
        host.dataset.turnId = turnId;
      }
      if (primaryId) {
        host.setAttribute(ATTR_.PRIMARY_A_ID, primaryId);
        host.dataset.primaryAId = primaryId;
      }
      if (questionId) {
        host.setAttribute(ATTR_.QUESTION_ID, questionId);
        host.dataset.questionId = questionId;
      }
    }
    if (btn) {
      if (turnId) btn.dataset.turnId = turnId;
      if (primaryId) btn.dataset.primaryAId = primaryId;
    }
    if (qBtn) {
      if (turnId) qBtn.dataset.turnId = turnId;
      if (primaryId) qBtn.dataset.primaryAId = primaryId;
      if (questionId) qBtn.dataset.questionId = questionId;
    }

    return { qBtn, turnId, primaryId, questionId };
  }

  function getQuestionDotColors(host, btn) {
    const ctx = resolveQaMiniMapSurfaceContext(host, btn);
    const qBtn = ctx?.qBtn || getQuestionBtnForWrap(host);
    const questionId = String(ctx?.questionId || '').trim();
    if (!questionId) return [];
    const turnId = String(ctx?.turnId || '').trim();
    if (!isTurnOnCurrentPaginationPage(turnId, '', questionId)) return [];
    const live = getLiveDotColorsForSurface(resolveQuestionElInTurn(turnId, questionId), 'question', questionId);
    const stored = getDotColorsForId(questionId, qBtn || btn, { roleHint: 'question' });
    return preferLiveOrStoredDotColors(live, stored);
  }

  function getAnswerDotColors(btn) {
    const answerId = resolveDotPrimaryId('', btn);
    if (!answerId || isSyntheticNoAnswerId(answerId)) return [];
    const turnId = String(btn?.dataset?.turnId || btn?.dataset?.id || '').trim();
    if (!isTurnOnCurrentPaginationPage(turnId, answerId, '')) return [];
    const live = getLiveDotColorsForSurface(resolveAnswerElInTurn(turnId, answerId), 'answer', answerId);
    const stored = getDotColorsForId(answerId, btn, { roleHint: 'answer' });
    return preferLiveOrStoredDotColors(live, stored);
  }

  function getCombinedDotColors(host, btn) {
    return canonicalInlineColors([...(getQuestionDotColors(host, btn) || []), ...(getAnswerDotColors(btn) || [])]).filter(isValidDotName);
  }

  function applyMiniMapDots(host, btn, colors = null, opts = {}) {
    const {
      surface = 'combined',
      turnId = '',
      answerId = '',
      questionId = '',
      preserveExistingOnEmpty = false,
    } = opts;
    if (!host || !btn) return;
    const staleInBtn = btn.querySelector?.(SEL_.MM_DOTROW) || null;
    if (staleInBtn && staleInBtn.parentElement === btn) {
      try { staleInBtn.remove?.(); } catch {}
    }

    let source = colors;
    if (source == null) {
      if (surface === 'question') source = getQuestionDotColors(host, btn);
      else if (surface === 'answer') source = getAnswerDotColors(btn);
      else source = getCombinedDotColors(host, btn);
    }
    if (!Array.isArray(source)) source = [source];

    const names = canonicalInlineColors(source).filter(isValidDotName);
    let row = getDotRowForHost(host, surface);

    if (!names.length) {
      if (row) {
        const sameTarget = dotRowMatchesMeta(row, { surface, turnId, answerId, questionId });
        if (preserveExistingOnEmpty && sameTarget && !(surface === 'answer' && isSyntheticNoAnswerId(answerId))) return;
        row?.remove?.();
      }
      return;
    }

    const active = new Set(names.map((n) => String(n).toLowerCase()));
    const ORDER = (W.H2O?.MM?.DOT_ORDER && W.H2O.MM.DOT_ORDER.length) ? W.H2O.MM.DOT_ORDER : DOT_ORDER;
    const dotKey = ORDER.map((n) => {
      const nn = String(n).toLowerCase();
      return active.has(nn) ? nn : '';
    }).join('|');

    if (!row) {
      row = document.createElement('div');
      row.className = CLS_.DOTROW;
      row.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      row.setAttribute(ATTR_.CGXUI, UI_.DOTROW);
      host.appendChild(row);
    }
    setDotRowMeta(row, { surface, turnId, answerId, questionId });
    if (row.getAttribute(ATTR_.DOT_COLORS) === dotKey) return;
    row.setAttribute(ATTR_.DOT_COLORS, dotKey);

    if (!row._h2oRecolorBound) {
      row._h2oRecolorBound = true;
      const openTurnRecolor = (event) => {
        if ((event.button ?? -1) !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

        const rowEl = event.currentTarget;
        const surfaceRole = String(rowEl?.getAttribute?.(ATTR_.DOT_SURFACE) || 'combined').trim().toLowerCase();
        if (surfaceRole === 'question') return;

        const btnEl = rowEl?.closest?.(SEL_.MM_WRAP)?.querySelector?.(SEL_.MM_BTN) || rowEl?.closest?.(SEL_.MM_BTN) || null;
        const turnId = String(
          rowEl?.getAttribute?.(ATTR_.TURN_ID) ||
          btnEl?.dataset?.turnId ||
          btnEl?.dataset?.id ||
          ''
        ).trim();
        const answerId = String(
          rowEl?.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
          btnEl?.dataset?.primaryAId ||
          ''
        ).trim();
        if (!turnId) return;

        const dotEl = event.target?.closest?.(`.${CLS_.DOT_CELL}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.DOT_CELL}"]`) || null;
        let sourceColor = String(dotEl?.getAttribute?.(ATTR_.DOT_COLOR) || '').trim().toLowerCase();
        if (!sourceColor || !isValidDotName(sourceColor)) sourceColor = '';

        const answerEl = resolveAnswerElInTurn(turnId, answerId);
        if (!sourceColor || !hasTurnColor(answerEl, answerId, sourceColor)) {
          sourceColor = getDominantTurnColor(answerEl, answerId);
        }

        const anchorRect = btnEl?.getBoundingClientRect?.() || rowEl?.getBoundingClientRect?.() || null;
        const leftAnchorX = Number.isFinite(rowEl?.getBoundingClientRect?.()?.left)
          ? rowEl.getBoundingClientRect().left
          : Number.isFinite(anchorRect?.left) ? anchorRect.left : (event?.clientX || 0);
        openHighlightsPopupBridge(event, { turnId, answerId, sourceColor, anchorRect, leftAnchorX });
      };
      row.addEventListener('mousedown', openTurnRecolor, true);
      row.addEventListener('auxclick', (event) => {
        if ((event.button ?? -1) !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      }, true);
    }

    row.innerHTML = '';

    ORDER.forEach((slotName) => {
      const name = String(slotName).toLowerCase();
      const dot = document.createElement('span');
      dot.className = CLS_.DOT_CELL;
      dot.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      dot.setAttribute(ATTR_.CGXUI, UI_.DOT_CELL);
      dot.setAttribute(ATTR_.DOT_COLOR, name);
      Object.assign(dot.style, {
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: 'transparent',
        boxShadow: 'none',
        cursor: active.has(name) ? 'pointer' : 'default',
        margin: '0'
      });
      if (active.has(name)) {
        const resolveDotContext = (event) => {
          const rowEl = event.currentTarget?.closest?.(SEL_.MM_DOTROW) || null;
          const btnEl =
            rowEl?.closest?.(SEL_.MM_WRAP)?.querySelector?.(SEL_.MM_BTN) ||
            rowEl?.closest?.(SEL_.MM_BTN) ||
            event.currentTarget?.closest?.(SEL_.MM_WRAP)?.querySelector?.(SEL_.MM_BTN) ||
            null;
          const turnId = String(
            rowEl?.getAttribute?.(ATTR_.TURN_ID) ||
            btnEl?.dataset?.turnId ||
            btnEl?.dataset?.id ||
            ''
          ).trim();
          const colorKey = String(event.currentTarget?.getAttribute?.(ATTR_.DOT_COLOR) || name || '').trim().toLowerCase();
          const answerId = String(
            rowEl?.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
            btnEl?.dataset?.primaryAId ||
            ''
          ).trim();
          const questionId = String(
            rowEl?.getAttribute?.(ATTR_.QUESTION_ID) ||
            rowEl?.closest?.(SEL_.MM_WRAP)?.getAttribute?.(ATTR_.QUESTION_ID) ||
            ''
          ).trim();
          const surfaceRole = String(rowEl?.getAttribute?.(ATTR_.DOT_SURFACE) || 'combined').trim().toLowerCase();
          return { turnId, colorKey, answerId, questionId, surfaceRole };
        };

        dot.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }, true);

        dot.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          const ctx = resolveDotContext(e);
          scrollToFirstHighlightInTurn(ctx.turnId, ctx.colorKey, {
            answerId: ctx.answerId,
            questionId: ctx.questionId,
            surfaceRole: ctx.surfaceRole,
            dotEl: e.currentTarget
          });
        }, true);

        const c = COLOR_BY_NAME?.[name] || DOT_REF_HEX?.[name];
        if (c) {
          dot.style.background = c;
          dot.style.boxShadow = `0 0 2px ${c}`;
        }
        dot.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }, true);
      }
      row.appendChild(dot);
    });
  }

  function syncMiniMapDot(anyId, colors = null, opts = {}) {
    const { persist = false, roleHint = '', payload = null } = opts;
    if (!anyId || anyId === 'undefined') return;
    const key = String(anyId).trim();
    const inferredSurface = resolveDotSurfaceMeta(key, null, roleHint);
    const persistedRoleHint = String(inferredSurface?.surfaceRole || roleHint || '').trim().toLowerCase();
    const suppressSyntheticAnswer = persistedRoleHint !== 'question' && isSyntheticNoAnswerId(key);
    if (persist) {
      if (suppressSyntheticAnswer) {
        clearDotColorsForId(key, null, { roleHint: persistedRoleHint || 'answer' });
      } else {
        const arr = Array.isArray(colors) ? colors : (colors == null ? [] : [colors]);
        const names = canonicalInlineColors(arr);
        const valid = names.filter(isValidDotName);
        if (valid.length) setDotColorsForId(key, valid, { roleHint: persistedRoleHint });
        else clearDotColorsForId(key, null, { roleHint: persistedRoleHint });
      }
      saveInlineDots();
    }

    const btn = H2O_MM_findMiniBtn(key);
    if (btn) btn._h2oHost = btn._h2oHost || btn.closest?.(SEL_.MM_WRAP) || null;

    if (!btn) return;

    const colEl =
      document.querySelector(SEL_.MM_COL) ||
      btn.closest?.(SEL_.MM_COL) ||
      document.querySelector(SEL_.MINIMAP);

    let host = btn._h2oHost || btn.closest?.(SEL_.MM_WRAP) || null;
    if (!host || !host.matches?.(SEL_.MM_WRAP)) {
      const wrap = document.createElement('div');
      wrap.className = CLS_.WRAP;
      wrap.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      wrap.setAttribute(ATTR_.CGXUI, UI_.WRAP);
      if (btn.isConnected) { btn.replaceWith(wrap); } else { (colEl || document.body).appendChild(wrap); }
      wrap.appendChild(btn);
      host = wrap;
    }
    btn._h2oHost = host;
    if (colEl && host.parentElement !== colEl) colEl.appendChild(host);

    const qaCtx = isQaMiniMapView() ? resolveQaMiniMapSurfaceContext(host, btn) : null;
    const primaryId = String(qaCtx?.primaryId || resolveDotPrimaryId(key, btn) || '').trim();
    const turnId = String(qaCtx?.turnId || btn?.dataset?.turnId || btn?.dataset?.id || host?.getAttribute?.(ATTR_.TURN_ID) || '').trim();
    const questionId = String(
      qaCtx?.questionId ||
      getQuestionBtnForWrap(host)?.dataset?.questionId ||
      host?.getAttribute?.(ATTR_.QUESTION_ID) ||
      host?.dataset?.questionId ||
      ''
    ).trim();
    if (!primaryId && !questionId) {
      try { host.querySelectorAll?.(SEL_.MM_DOTROW)?.forEach((row) => row.remove?.()); } catch {}
      return;
    }

    if (primaryId) repaintMiniMapWash(primaryId, btn);

    if (isQaMiniMapView() && (qaCtx?.qBtn || getQuestionBtnForWrap(host))) {
      const questionPayload = payload && typeof payload === 'object' ? payload.question || null : null;
      const answerPayload = payload && typeof payload === 'object' ? payload.answer || null : null;
      const suppressAnswerSurface = isSyntheticNoAnswerId(primaryId);
      removeDotRowForHost(host, 'combined');
      applyMiniMapDots(host, btn, questionPayload?.explicit ? questionPayload.colors : getQuestionDotColors(host, btn), {
        surface: 'question',
        turnId,
        answerId: primaryId,
        questionId,
        preserveExistingOnEmpty: !questionPayload?.explicit
      });
      applyMiniMapDots(host, btn, suppressAnswerSurface ? [] : (answerPayload?.explicit ? answerPayload.colors : getAnswerDotColors(btn)), {
        surface: 'answer',
        turnId,
        answerId: primaryId,
        questionId,
        preserveExistingOnEmpty: !answerPayload?.explicit && !suppressAnswerSurface
      });
      return;
    }

    removeDotRowForHost(host, 'question');
    removeDotRowForHost(host, 'answer');
    applyMiniMapDots(host, btn, getCombinedDotColors(host, btn), {
      surface: 'combined',
      turnId,
      answerId: primaryId,
      questionId
    });
  }

  const STATE_DOT_SYNC_QUEUE = new Map();
  let STATE_DOT_SYNC_RAF = 0;
  function scheduleDotSync(answerId, colors, persist) {
    const rawId = String(answerId || '').trim();
    if (!rawId) return;
    const meta = resolveDotSurfaceMeta(rawId);
    const surfaceRole = meta?.surfaceRole === 'question' ? 'question' : 'answer';
    const suppressSyntheticAnswer = surfaceRole !== 'question' && isSyntheticNoAnswerId(rawId);
    if (persist) {
      if (suppressSyntheticAnswer) {
        clearDotColorsForId(rawId, null, { roleHint: surfaceRole });
      } else {
        const arr = Array.isArray(colors) ? colors : (colors == null ? [] : [colors]);
        const names = canonicalInlineColors(arr);
        const valid = names.filter(isValidDotName);
        if (valid.length) setDotColorsForId(rawId, valid, { roleHint: surfaceRole });
        else clearDotColorsForId(rawId, null, { roleHint: surfaceRole });
      }
      saveInlineDots();
    }

    const id = resolveDotPaintKey(rawId) || resolveDotPrimaryId(rawId) || rawId;
    if (!id) return;
    const entry = STATE_DOT_SYNC_QUEUE.get(id) || { question: null, answer: null };
    if (persist) {
      const arr = Array.isArray(colors) ? colors : (colors == null ? [] : [colors]);
      entry[surfaceRole] = {
        explicit: true,
        colors: canonicalInlineColors(arr).filter(isValidDotName)
      };
    }
    STATE_DOT_SYNC_QUEUE.set(id, entry);

    if (STATE_DOT_SYNC_RAF) return;
    STATE_DOT_SYNC_RAF = requestAnimationFrame(() => {
      STATE_DOT_SYNC_RAF = 0;
      const entries = Array.from(STATE_DOT_SYNC_QUEUE.entries());
      STATE_DOT_SYNC_QUEUE.clear();
      for (const [queuedId, queuedPayload] of entries) {
        try {
          syncMiniMapDot(queuedId, null, { persist: false, payload: queuedPayload });
        } catch {}
      }
    });
  }

  let STATE_DOTS_REPAINT_RAF = 0;
  function repaintDotsForBtn(btn) {
    if (!btn) return false;
    const id = resolveDotPrimaryId('', btn);
    if (!id) return false;
    syncMiniMapDot(id);
    return true;
  }

  function repaintDotsForAllMiniBtns() {
    const seen = new Set();
    let painted = 0;
    const btns = getConnectedMiniMapButtons();
    for (const btn of btns) {
      if (!btn || seen.has(btn)) continue;
      seen.add(btn);
      if (repaintDotsForBtn(btn)) painted += 1;
    }
    return painted;
  }

  function scheduleRepaintDotsForAllMiniBtns() {
    if (STATE_DOTS_REPAINT_RAF) return;
    STATE_DOTS_REPAINT_RAF = requestAnimationFrame(() => {
      STATE_DOTS_REPAINT_RAF = 0;
      try { repaintDotsForAllMiniBtns(); } catch {}
    });
  }

  function hasAnyStoredDots() {
    try {
      for (const value of Object.values(inlineDotMap || {})) {
        if (!Array.isArray(value)) continue;
        if (canonicalInlineColors(value).filter(isValidDotName).length) return true;
      }
    } catch {}
    return false;
  }

  function countStoredDotIds() {
    let total = 0;
    try {
      for (const value of Object.values(inlineDotMap || {})) {
        if (!Array.isArray(value)) continue;
        if (canonicalInlineColors(value).filter(isValidDotName).length) total += 1;
      }
    } catch {}
    return total;
  }

  function countDotRowsInMiniMap() {
    try {
      const seenWraps = new Set();
      let total = 0;
      for (const btn of getConnectedMiniMapButtons()) {
        const wrap = btn?._h2oHost || btn?.closest?.(SEL_.MM_WRAP) || null;
        if (!wrap || seenWraps.has(wrap)) continue;
        seenWraps.add(wrap);
        total += wrap.querySelectorAll?.(`.${CLS_.DOTROW}`).length || 0;
      }
      if (seenWraps.size) return total;
    } catch {}
    try {
      const root = document.querySelector(SEL_.MM_COL) || document.querySelector(SEL_.MINIMAP) || document;
      return root.querySelectorAll(`.${CLS_.DOTROW}`).length;
    } catch { return 0; }
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * PATCH §A — View-only repaint pipeline
   *
   * scheduleDotsViewRepaint()
   *   Cheap repaint from inlineDotMap only. No persist, no hydrate, no rekey.
   *   Use for all view-only events (pagination, shell, engine, view-changed, etc.)
   *
   * scheduleDotsViewRepaintWithRecovery()
   *   Same cheap repaint + a single deferred safety check.
   *   The safety check fires once after a short delay; if row count is unexpectedly
   *   low relative to stored dot IDs, it runs hydrateInlineDotsFromInlineApi() as
   *   a last-resort recovery — but only that once, with no further persist calls.
   *   Use for events that imply a possible MiniMap DOM rebuild (shell, engine, DOM).
   * ───────────────────────────────────────────────────────────────────────────── */

  let STATE_DOTS_VIEW_REPAINT_RAF = 0;
  let STATE_DOTS_VIEW_RECOVERY_TIMER = 0;

  /**
   * View-only repaint. Reads from inlineDotMap; no storage writes.
   */
  function scheduleDotsViewRepaint() {
    if (STATE_DOTS_VIEW_REPAINT_RAF) return;
    STATE_DOTS_VIEW_REPAINT_RAF = requestAnimationFrame(() => {
      STATE_DOTS_VIEW_REPAINT_RAF = 0;
      try { repaintDotsForAllMiniBtns(); } catch {}
    });
  }

  /**
   * View-only repaint + a single deferred recovery check.
   * Recovery only runs hydrateInlineDotsFromInlineApi if dot rows are absent
   * despite stored data existing, implying a MiniMap DOM rebuild occurred.
   */
  function scheduleDotsViewRepaintWithRecovery(reason) {
    // Always do the cheap immediate repaint.
    scheduleDotsViewRepaint();

    // Arm a single deferred recovery check (no-op if already armed).
    if (STATE_DOTS_VIEW_RECOVERY_TIMER) return;
    STATE_DOTS_VIEW_RECOVERY_TIMER = setTimeout(() => {
      STATE_DOTS_VIEW_RECOVERY_TIMER = 0;
      try {
        let btnCount = 0;
        try { btnCount = countMiniMapButtons(); } catch { btnCount = 0; }
        if (!btnCount) return;

        const storedCount = countStoredDotIds();
        if (!storedCount) return;

        const rowCount = countDotRowsInMiniMap();
        const maxRows = isQaMiniMapView() ? (btnCount * 2) : btnCount;
        const targetRows = Math.max(1, Math.min(maxRows, storedCount || maxRows));

        if (rowCount >= targetRows) {
          // Rows are present — just a normal repaint is enough.
          scheduleRepaintDotsForAllMiniBtns();
          return;
        }

        // Rows are genuinely missing: last-resort hydrate then repaint.
        // Only persists if the hydrate actually found new data not already in inlineDotMap.
        try { hydrateInlineDotsFromInlineApi({ persist: true }); } catch {}
        scheduleRepaintDotsForAllMiniBtns();
      } catch {}
    }, 900);
  }

  /* PATCH §A end ─────────────────────────────────────────────────────────────── */

  /* ─────────────────────────────────────────────────────────────────────────────
   * PATCH §B — scheduleSafetyRepaint() rewrite
   *
   * Original: called hydrateInlineDotsFromInlineApi({ persist:true }) unconditionally
   *           at the TOP of the timeout, before any row-count check.
   * Fixed: hydrate is moved INSIDE the row-count shortfall branch only.
   *        The safety repaint is now purely view-based unless rows are truly missing.
   * ───────────────────────────────────────────────────────────────────────────── */

  let STATE_DOTS_SAFETY_TIMER = 0;
  function scheduleSafetyRepaint(reason) {
    void reason;
    if (STATE_DOTS_SAFETY_TIMER) return;
    STATE_DOTS_SAFETY_TIMER = setTimeout(() => {
      STATE_DOTS_SAFETY_TIMER = 0;
      try {
        let btnCount = 0;
        try { btnCount = countMiniMapButtons(); } catch { btnCount = 0; }
        if (!btnCount) return;

        // Only call repaint if there is anything stored to show.
        if (!hasAnyStoredDots()) return;

        const rowCount = countDotRowsInMiniMap();
        const storedCount = countStoredDotIds();
        const maxRows = isQaMiniMapView() ? (btnCount * 2) : btnCount;
        const targetRows = Math.max(1, Math.min(maxRows, storedCount || maxRows));

        if (rowCount >= targetRows) return;

        // Row shortfall: hydrate as last resort, then repaint.
        // (moved here from the unconditional top-of-timer call in the original)
        try { hydrateInlineDotsFromInlineApi({ persist: true }); } catch {}
        try { repaintDotsForAllMiniBtns(); } catch {}
      } catch {}
    }, 1000);
  }

  /* PATCH §B end ─────────────────────────────────────────────────────────────── */

  /* ─────────────────────────────────────────────────────────────────────────────
   * PATCH §C — scheduleDotsRepaintBurst() rewrite
   *
   * Original: always called hydrate+rekey+repaint+safety + two more delayed
   *           hydrate+rekey timers (at 140ms and 520ms).
   * Fixed:
   *   - scheduleDotsRepaintBurst() now delegates to scheduleDotsViewRepaintWithRecovery()
   *     for all callers that only need a view refresh.
   *   - The two delayed "extra hydrate" timers are removed entirely.
   *   - A single deferred recovery check (inside scheduleDotsViewRepaintWithRecovery)
   *     handles the DOM-rebuild case cheaply.
   *
   * scheduleDotsRepaintBurst() is kept with the same public name so any external
   * callers (MiniMap Engine, etc.) continue to work without change.
   * ───────────────────────────────────────────────────────────────────────────── */


  function scheduleDotsRepaintBurst(reason) {
    // Cheap immediate path: repaint from stored truth only.
    scheduleDotsViewRepaintWithRecovery(reason);
    // The extra delayed timers that called hydrate+rekey have been removed.
    // Recovery is handled by the single deferred check inside scheduleDotsViewRepaintWithRecovery.
  }

  /* PATCH §C end ─────────────────────────────────────────────────────────────── */

  function isMiniMapDomHit(node) {
    if (!(node instanceof Element)) return false;
    try {
      if (
        node.matches?.(SEL_.MM_BTN)
        || node.matches?.(SEL_.MM_COL)
        || node.matches?.(SEL_.MINIMAP)
        || node.matches?.(SEL_.MM_WRAP)
      ) return true;
    } catch {}
    try {
      return !!(
        node.querySelector?.(SEL_.MM_BTN)
        || node.querySelector?.(SEL_.MM_COL)
        || node.querySelector?.(SEL_.MINIMAP)
        || node.querySelector?.(SEL_.MM_WRAP)
      );
    } catch {
      return false;
    }
  }

  let STATE_MM_DOM_OBSERVER = null;
  let STATE_MM_DOM_OFF_MUT = null;
  let STATE_MM_DOM_THROTTLE_UNTIL = 0;
  function detachMiniMapDomObserver() {
    if (STATE_MM_DOM_OFF_MUT) {
      try { STATE_MM_DOM_OFF_MUT(); } catch {}
      STATE_MM_DOM_OFF_MUT = null;
    }
    if (STATE_MM_DOM_OBSERVER) {
      try { STATE_MM_DOM_OBSERVER.disconnect(); } catch {}
      STATE_MM_DOM_OBSERVER = null;
    }
  }
  function scheduleMiniMapDomRecovery() {
    const now = Date.now();
    if (now < Number(STATE_MM_DOM_THROTTLE_UNTIL || 0)) return;
    STATE_MM_DOM_THROTTLE_UNTIL = now + 120;
    // PATCH §D: MiniMap DOM rebuilds are view-only; use cheap repaint+recovery.
    scheduleDotsViewRepaintWithRecovery('minimap:dom');
  }
  function attachMiniMapDomObserver() {
    const hub = TOPW?.H2O?.obs || W?.H2O?.obs || null;
    if (hub && typeof hub.onMutations === 'function') {
      if (STATE_MM_DOM_OBSERVER) {
        try { STATE_MM_DOM_OBSERVER.disconnect(); } catch {}
        STATE_MM_DOM_OBSERVER = null;
      }
      if (STATE_MM_DOM_OFF_MUT) return;
      STATE_MM_DOM_OFF_MUT = hub.onMutations('dots:dom', (payload) => {
        if (!payload?.conversationRelevant) return;
        if (!payload?.hasAdded && !payload?.hasRemoved && !payload?.removedTurnLike && !payload?.removedAnswerLike) return;
        scheduleMiniMapDomRecovery();
      });
      return;
    }
    if (STATE_MM_DOM_OFF_MUT) {
      try { STATE_MM_DOM_OFF_MUT(); } catch {}
      STATE_MM_DOM_OFF_MUT = null;
    }
    if (STATE_MM_DOM_OBSERVER || typeof MutationObserver === 'undefined') return;
    const root = document.body;
    if (!root) return;

    STATE_MM_DOM_OBSERVER = new MutationObserver((muts) => {
      let hit = false;
      for (const m of muts || []) {
        if (m?.type !== 'childList') continue;
        for (const node of [...(m.addedNodes || []), ...(m.removedNodes || [])]) {
          if (
            node.nodeType === 1 &&
            !node.matches?.('[data-message-author-role]') &&
            !node.querySelector?.('[data-message-author-role]')
          ) {
            continue;
          }
          if (!isMiniMapDomHit(node)) continue;
          hit = true;
          break;
        }
        if (hit) break;
      }
      if (!hit) return;
      scheduleMiniMapDomRecovery();
    });

    try { STATE_MM_DOM_OBSERVER.observe(root, { childList: true, subtree: true }); } catch {}
  }

  function extractAnswerIds(detail = {}) {
    const out = [];
    const seen = new Set();
    const pushId = (idRaw) => {
      const base = String(idRaw || '').trim();
      const meta = resolveDotSurfaceMeta(base);
      const ids = [base, resolveDotStorageKey(base, null, meta?.surfaceRole || '')];
      for (const candidate of ids) {
        const id = String(candidate || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    };
    pushId(detail.answerId);
    pushId(detail.primaryAId);
    pushId(detail.id);
    pushId(detail.turnId);
    const arrKeys = ['answerIds', 'primaryAIds', 'ids', 'turnIds'];
    for (const key of arrKeys) {
      const arr = detail[key];
      if (!Array.isArray(arr)) continue;
      for (const idRaw of arr) pushId(idRaw);
    }
    return out;
  }

  const INLINE_EVENT_DEDUPE_MS = 35;
  const WASH_EVENT_DEDUPE_MS = 45;
  let STATE_LAST_INLINE_DETAIL = null;
  let STATE_LAST_INLINE_SIG = '';
  let STATE_LAST_INLINE_TS = 0;
  const STATE_REMOUNT_RECOVERY = new Set();
  let STATE_LAST_WASH_DETAIL = null;
  let STATE_LAST_WASH_SIG = '';
  let STATE_LAST_WASH_TS = 0;

  function shouldSkipInlineEvent(detail, answerIds = []) {
    const now = performance.now();
    const sig = `${answerIds.join(',')}|${String(detail?.source || '')}|${String(detail?.ts || '')}`;
    if ((detail && detail === STATE_LAST_INLINE_DETAIL) || (sig && sig === STATE_LAST_INLINE_SIG)) {
      if ((now - STATE_LAST_INLINE_TS) < INLINE_EVENT_DEDUPE_MS) return true;
    }
    STATE_LAST_INLINE_DETAIL = detail || null;
    STATE_LAST_INLINE_SIG = sig;
    STATE_LAST_INLINE_TS = now;
    return false;
  }

  function shouldSkipWashEvent(detail, answerId, colorName) {
    const now = performance.now();
    const sig = `${String(answerId || '').trim()}|${String(colorName || '')}`;
    if ((detail && detail === STATE_LAST_WASH_DETAIL) || (sig && sig === STATE_LAST_WASH_SIG)) {
      if ((now - STATE_LAST_WASH_TS) < WASH_EVENT_DEDUPE_MS) return true;
    }
    STATE_LAST_WASH_DETAIL = detail || null;
    STATE_LAST_WASH_SIG = sig;
    STATE_LAST_WASH_TS = now;
    return false;
  }

  function collectRemountRecoveryIds(rawId = '') {
    const ids = new Set();
    const add = (value, roleHint = '') => {
      const raw = String(value || '').trim();
      if (!raw) return;
      ids.add(raw);
      const normalized = normalizeDotId(raw);
      if (normalized) ids.add(normalized);
      const storageKey = String(resolveDotStorageKey(raw, null, roleHint) || '').trim();
      if (storageKey) ids.add(storageKey);
    };

    const base = String(rawId || '').trim();
    if (!base) return ids;

    const surface = resolveDotSurfaceMeta(base);
    const turnRecord = resolveDotTurnRecord(base);
    const turnId = String(turnRecord?.turnId || surface?.turnId || '').trim();
    const answerId = String(
      turnRecord?.answerId ||
      turnRecord?.primaryAId ||
      surface?.answerId ||
      canonicalizeDotAnswerId(base) ||
      ''
    ).trim();
    let questionId = String(
      turnRecord?.questionId ||
      turnRecord?.qId ||
      surface?.questionId ||
      ''
    ).trim();
    if (!questionId && turnId) questionId = String(resolveQuestionIdForTurn(turnId, '') || '').trim();

    add(base, surface?.surfaceRole || '');
    add(turnId);
    add(answerId, 'answer');
    add(questionId, 'question');
    return ids;
  }

  function isRemountRecoveryId(id = '') {
    const key = String(id || '').trim();
    if (!key) return false;
    if (STATE_REMOUNT_RECOVERY.has(key)) return true;

    const restoringUid = String(W.H2O_UM_RESTORING_UID || '').trim();
    if (!restoringUid) return false;
    return collectRemountRecoveryIds(restoringUid).has(key);
  }

  /* ───────────────────────── 10) Inline → dots bridge ───────────────────────── */
  function onInlineChanged(e) {
    const detail = e?.detail || {};
    const answerIds = extractAnswerIds(detail);
    if (!answerIds.length) {
      try { window.H2O_scheduleMiniMapRebuild?.('inline:changed (no answerId)'); } catch {}
      scheduleRepaintDotsForAllMiniBtns();
      scheduleSafetyRepaint('inline:changed:no-id');
      return;
    }
    if (shouldSkipInlineEvent(detail, answerIds)) return;
    const colorsById = (detail.colorsById && typeof detail.colorsById === 'object') ? detail.colorsById : null;
    const hasGlobalColors = detail.colors != null;
    const globalColors = hasGlobalColors ? detail.colors : null;
    for (const answerId of answerIds) {
      const hasSpecific = !!(colorsById && Object.prototype.hasOwnProperty.call(colorsById, answerId));
      const nextColors = hasSpecific ? colorsById[answerId] : globalColors;
      const hasContent = Array.isArray(nextColors) && nextColors.length > 0;
      const inRestoreWindow = Array.isArray(nextColors) && nextColors.length === 0
        && isRemountRecoveryId(answerId);
      if (hasContent) STATE_REMOUNT_RECOVERY.delete(answerId);
      const effectiveColors = inRestoreWindow ? null : nextColors;
      const persist = effectiveColors != null;
      scheduleDotSync(answerId, persist ? effectiveColors : null, persist);
    }
    if (!hasGlobalColors && !colorsById && answerIds.length > 1) {
      scheduleRepaintDotsForAllMiniBtns();
    }
    scheduleSafetyRepaint('inline:changed');
  }

  function onAnswerWash(e) {
    const detail = e?.detail || {};
    const answerId = String(detail.answerId || detail.primaryAId || '').trim();
    const color = detail.color ?? detail.colorName ?? null;
    if (!answerId) return;
    if (shouldSkipWashEvent(detail, answerId, color)) return;

    // Washer add-on owns wash-map writes when present.
    if (!MM_HAS_EXTERNAL_WASH()) {
      if (isValidWashName(color)) washMap[answerId] = color;
      else delete washMap[answerId];
      saveWashMap();
    }

    scheduleDotSync(answerId, null, false);
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * PATCH §E — bindDotBridgesOnce() event classification rewrite
   *
   * BEFORE (original):
   *   MM_INDEX_HYDRATED → scheduleDotsRepaintBurst  (heavy: hydrate+rekey+repaint)
   *   MM_INDEX_APPENDED → scheduleDotSync OR scheduleDotsRepaintBurst (heavy)
   *   MM_VIEW_CHANGED   → scheduleDotsRepaintBurst  (heavy)
   *   SHELL_READY       → scheduleDotsRepaintBurst  (heavy)
   *   ENGINE_READY      → scheduleDotsRepaintBurst  (heavy)
   *   PAGINATION_CHANGED→ scheduleRepaintDotsForAllMiniBtns + scheduleSafetyRepaint
   *
   * AFTER (patched):
   *   Content-changing events  → targeted sync (scheduleDotSync / onInlineChanged)
   *   View-only events         → scheduleDotsViewRepaint()           (no persist)
   *   View events w/ DOM risk  → scheduleDotsViewRepaintWithRecovery() (one deferred check)
   *
   * Classification table:
   *   INLINE_CHANGED        → onInlineChanged          [content]
   *   INLINE_RESTORED       → onInlineChanged          [content]
   *   INLINE_HL_CHANGED     → onInlineChanged          [content]
   *   ANSWER_WASH           → onAnswerWash             [content/wash]
   *   PAGINATION_CHANGED    → scheduleDotsViewRepaint  [view-only]
   *   MM_INDEX_APPENDED     → scheduleDotSync if id present, else scheduleDotsViewRepaint [targeted/view]
   *   MM_INDEX_HYDRATED     → scheduleDotsViewRepaintWithRecovery  [view+recovery]
   *   MM_VIEW_CHANGED       → scheduleDotsViewRepaintWithRecovery  [view+recovery]
   *   SHELL_READY           → scheduleDotsViewRepaintWithRecovery  [view+recovery]
   *   ENGINE_READY          → scheduleDotsViewRepaintWithRecovery  [view+recovery]
   *   ANSWERS_SCAN          → scheduleDotsViewRepaintWithRecovery  [view+recovery]
   * ───────────────────────────────────────────────────────────────────────────── */

  (function bindDotBridgesOnce() {
    if (window.H2O_MM_DOT_BRIDGES) return;
    window.H2O_MM_DOT_BRIDGES = true;

    const dual = (ev, fn) => {
      window.addEventListener(ev, fn);
      if (ev.startsWith('evt:')) window.addEventListener(ev.slice(4), fn);
    };

    // ── Content-changing: targeted sync (no change from original) ──
    dual(EV_.INLINE_CHANGED,     onInlineChanged);
    window.addEventListener(EV_.INLINE_CHANGED_HO,    onInlineChanged);
    window.addEventListener(EV_.INLINE_CHANGED_CGXUI, onInlineChanged);
    dual(EV_.INLINE_RESTORED,    onInlineChanged);
    dual(EV_.INLINE_HL_CHANGED,  onInlineChanged);
    dual(EV_.ANSWER_WASH,        onAnswerWash);
    window.addEventListener(EV_.ANSWER_WASH_LEGACY_EVT,   onAnswerWash);
    window.addEventListener(EV_.ANSWER_WASH_LEGACY_ALIAS, onAnswerWash);
    dual('evt:h2o:message:remounted', (ev) => {
      const uid = String(
        ev?.detail?.answerId ||
        ev?.detail?.uid ||
        ev?.detail?.id ||
        ''
      ).trim();
      if (!uid) return;
      const recoveryIds = Array.from(collectRemountRecoveryIds(uid));
      if (!recoveryIds.length) return;
      recoveryIds.forEach((id) => STATE_REMOUNT_RECOVERY.add(id));
      setTimeout(() => {
        recoveryIds.forEach((id) => STATE_REMOUNT_RECOVERY.delete(id));
      }, 3000);
    });

    // ── View-only: pagination — repaint only, no storage work ──
    dual(EV_.PAGINATION_CHANGED, () => {
      scheduleDotsViewRepaint();
    });

    // ── View-only: index appended — targeted if id present, else cheap repaint ──
    const onIndexAppended = (e) => {
      const detail = e?.detail || {};
      const answerId = String(detail?.msgId || detail?.answerId || '').trim();
      if (answerId) {
        // Targeted sync: reads from inlineDotMap, no persist needed
        scheduleDotSync(answerId, null, false);
      } else {
        scheduleDotsViewRepaint();
      }
    };
    dual(EV_.MM_INDEX_APPENDED, onIndexAppended);

    // ── View + possible DOM rebuild: use repaint-with-recovery ──
    dual(EV_.MM_INDEX_HYDRATED, () => {
      scheduleDotsViewRepaintWithRecovery('index:hydrated');
    });

    dual(EV_.MM_VIEW_CHANGED, () => {
      scheduleDotsViewRepaintWithRecovery('view:changed');
    });

    dual(EV_.SHELL_READY, () => {
      scheduleDotsViewRepaintWithRecovery('shell:ready');
    });

    dual(EV_.ENGINE_READY, () => {
      scheduleDotsViewRepaintWithRecovery('engine:ready');
    });

    dual(EV_.ANSWERS_SCAN, () => {
      scheduleDotsViewRepaintWithRecovery('answers:scan');
    });

    attachMiniMapDomObserver();

    // Boot: view-only repaint (inlineDotMap already loaded from disk at startup)
    scheduleDotsViewRepaintWithRecovery('boot');
  })();

  /* PATCH §E end ─────────────────────────────────────────────────────────────── */

  /* ───────────────────────── 11) Optional: Inline mutation observer ─────────────────────────
   * Only runs if helper functions exist; otherwise skipped harmlessly.
   */
  const STATE_INLINE_DIRTY = new Set();
  let STATE_INLINE_SCHED = false;
  let STATE_INLINE_IDLE_HANDLE = 0;
  let STATE_INLINE_IDLE_KIND = '';
  let STATE_INLINE_RETRY_TIMER = 0;
  let STATE_INLINE_OBSERVER = null;
  let STATE_INLINE_OBSERVER_ROOT = null;
  let STATE_INLINE_ATTACH_TIMER = 0;

  function cancelInlineIdleHandle() {
    if (!STATE_INLINE_IDLE_HANDLE) return;
    try {
      if (STATE_INLINE_IDLE_KIND === 'idle' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(STATE_INLINE_IDLE_HANDLE);
      } else {
        clearTimeout(STATE_INLINE_IDLE_HANDLE);
      }
    } catch {}
    STATE_INLINE_IDLE_HANDLE = 0;
    STATE_INLINE_IDLE_KIND = '';
  }

  function inlineScheduleFlush() {
    if (STATE_INLINE_SCHED) return;
    STATE_INLINE_SCHED = true;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 80));
    STATE_INLINE_IDLE_KIND = (typeof window.requestIdleCallback === 'function') ? 'idle' : 'timeout';
    STATE_INLINE_IDLE_HANDLE = idle(() => {
      STATE_INLINE_IDLE_HANDLE = 0;
      STATE_INLINE_IDLE_KIND = '';
      STATE_INLINE_SCHED = false;
      if (document.documentElement.dataset.h2oMmMutating === '1') {
        if (!STATE_INLINE_RETRY_TIMER) {
          STATE_INLINE_RETRY_TIMER = setTimeout(() => {
            STATE_INLINE_RETRY_TIMER = 0;
            inlineScheduleFlush();
          }, 120);
        }
        return;
      }
      if (typeof getMessageId !== 'function' || typeof collectInlineColors !== 'function') {
        STATE_INLINE_DIRTY.clear();
        return;
      }

      const changedEntries = [];
      for (const answerEl of Array.from(STATE_INLINE_DIRTY)) {
        const id = getMessageId(answerEl);
        if (!id) continue;
        const target = (typeof getAnswerContent === 'function' ? (getAnswerContent(answerEl) || answerEl) : answerEl);
        const raw = collectInlineColors(target);
        const colors = canonicalInlineColors(raw);
        const prev = inlineDotMap[id] || [];
        if (prev.length === colors.length && prev.every((c, i) => c === colors[i])) continue;
        inlineDotMap[id] = colors;
        changedEntries.push({ answerId: id, colors });
      }
      STATE_INLINE_DIRTY.clear();

      if (changedEntries.length) saveInlineDots();
      for (const entry of changedEntries) {
        window.dispatchEvent(new CustomEvent(EV_.INLINE_CHANGED, {
          detail: { answerId: entry.answerId, colors: entry.colors },
          bubbles: true,
          composed: true
        }));
      }
    }, { timeout: 600 });
  }

  function detachLegacyInlineObserver() {
    const roots = [
      document.querySelector('[data-testid="conversation-turns"]'),
      document.querySelector('main'),
      document.body
    ].filter(Boolean);
    for (const root of roots) {
      const obs = root?._h2oInlineObs;
      if (obs && typeof obs.disconnect === 'function') {
        try { obs.disconnect(); } catch {}
        try { delete root._h2oInlineObs; } catch { root._h2oInlineObs = null; }
        if (obs === STATE_INLINE_OBSERVER) {
          STATE_INLINE_OBSERVER = null;
          STATE_INLINE_OBSERVER_ROOT = null;
        }
      }
    }
  }

  function detachInlineMutationObserver() {
    cancelInlineIdleHandle();
    if (STATE_INLINE_RETRY_TIMER) {
      try { clearTimeout(STATE_INLINE_RETRY_TIMER); } catch {}
      STATE_INLINE_RETRY_TIMER = 0;
    }
    try { STATE_INLINE_OBSERVER?.disconnect?.(); } catch {}
    if (STATE_INLINE_OBSERVER_ROOT?._h2oInlineObs === STATE_INLINE_OBSERVER) {
      try { delete STATE_INLINE_OBSERVER_ROOT._h2oInlineObs; } catch { STATE_INLINE_OBSERVER_ROOT._h2oInlineObs = null; }
    }
    STATE_INLINE_OBSERVER = null;
    STATE_INLINE_OBSERVER_ROOT = null;
    detachLegacyInlineObserver();
    try { delete window.H2O_MM_DOTS_INLINE_OBS; } catch { window.H2O_MM_DOTS_INLINE_OBS = false; }
    try { delete window.H2O_MM_INLINE_OBS; } catch { window.H2O_MM_INLINE_OBS = false; }
    return true;
  }

  function attachInlineMutationObserver(force = (TOPW.H2O_MM_DOTS_FORCE_OBSERVER === true)) {
    if (!force && hasInlineApiProvider()) {
      detachInlineMutationObserver();
      return false;
    }
    if (typeof MutationObserver === 'undefined') return false;
    if (typeof isInlineNode !== 'function' || typeof collectInlineColors !== 'function') return false;

    const root =
      document.querySelector('[data-testid="conversation-turns"]') ||
      document.querySelector('main') ||
      document.body;
    if (!root) return false;

    if (STATE_INLINE_OBSERVER && STATE_INLINE_OBSERVER_ROOT === root && root._h2oInlineObs === STATE_INLINE_OBSERVER) {
      window.H2O_MM_INLINE_OBS = true;
      window.H2O_MM_DOTS_INLINE_OBS = true;
      return true;
    }

    detachInlineMutationObserver();
    window.H2O_MM_INLINE_OBS = true;
    window.H2O_MM_DOTS_INLINE_OBS = true;

    if (root._h2oInlineObs && typeof root._h2oInlineObs.disconnect === 'function') {
      STATE_INLINE_OBSERVER = root._h2oInlineObs;
      STATE_INLINE_OBSERVER_ROOT = root;
      return true;
    }

    const mo = new MutationObserver((muts) => {
      if (document.documentElement.dataset.h2oMmMutating === '1') return;
      for (const m of muts) {
        if (m.type === 'attributes') {
          if (!isInlineNode(m.target)) continue;
          const ans = m.target.closest?.(`div[${ATTR_.MSG_ROLE}="assistant"]`);
          if (ans) STATE_INLINE_DIRTY.add(ans);
          continue;
        }
        if (m.type === 'childList') {
          const nodes = [...m.addedNodes, ...m.removedNodes];
          for (const n of nodes) {
            if (!(n instanceof HTMLElement)) continue;
            const hit = isInlineNode(n) || !!n.querySelector?.(INLINE_NODE_SEL);
            if (!hit) continue;
            const ans = (n.matches?.(`div[${ATTR_.MSG_ROLE}="assistant"]`) ? n : null) ||
                        (n.closest?.(`div[${ATTR_.MSG_ROLE}="assistant"]`) || null) ||
                        (n.querySelector?.(`div[${ATTR_.MSG_ROLE}="assistant"]`) || null);
            if (ans) STATE_INLINE_DIRTY.add(ans);
          }
        }
      }
      if (STATE_INLINE_DIRTY.size) inlineScheduleFlush();
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style','class','data-inline-hl','data-h2o-inline-color'] });
    root._h2oInlineObs = mo;
    STATE_INLINE_OBSERVER = mo;
    STATE_INLINE_OBSERVER_ROOT = root;
    return true;
  }

  function hasInlineApiProvider() {
    return !!(
      W?.H2O?.inline ||
      W?.H2OInline ||
      TOPW?.H2O?.inline ||
      TOPW?.H2OInline
    );
  }

  function maybeAttachInlineMutationObserver() {
    const force = (TOPW.H2O_MM_DOTS_FORCE_OBSERVER === true);
    if (!force && hasInlineApiProvider()) {
      detachInlineMutationObserver();
      return false;
    }
    attachInlineMutationObserver(force);
    return true;
  }
  STATE_INLINE_ATTACH_TIMER = setTimeout(() => { try { maybeAttachInlineMutationObserver(); } catch {} finally { STATE_INLINE_ATTACH_TIMER = 0; } }, 1100);

  /* ───────────────────────── 12) Dot click → turn-scoped inline jump ───────────────────────── */
  const STATE_DOT_DEBUG = { lastBtnCaptureTs: 0, lastBtnCaptureTurnId: '' };
  const HEADER_CANDIDATE_SEL = [
    'header',
    '[data-testid="page-header"]',
    '[data-headlessui-state] header',
    'div[class*="top-0"][class*="sticky"]',
    'div[class*="top-0"][class*="fixed"]',
  ].join(', ');

  if (DEBUG_DOT_CLICK) {
    window.addEventListener('click', (e) => {
      const btn = e?.target?.closest?.(SEL_.MM_BTN);
      if (!btn) return;
      STATE_DOT_DEBUG.lastBtnCaptureTs = performance.now();
      STATE_DOT_DEBUG.lastBtnCaptureTurnId = String(btn.dataset?.turnId || btn.dataset?.id || '').trim();
    }, true);
  }

  function escAttrValue(raw) {
    const s = String(raw || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return s.replace(/"/g, '\\"');
  }

  function resolveTurnObj(turnId = '') {
    const key = String(turnId || '').trim();
    if (!key) return null;
    try {
      const t = TOPW.H2O_MM_turnById?.get?.(key);
      if (t) return t;
    } catch {}
    try {
      const t = W?.H2O?.MM?.core?.getTurnById?.(key);
      if (t) return t;
    } catch {}
    try {
      const rt = TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
      const t =
        rt?.getTurnRecordByTurnId?.(key)
        || rt?.getTurnRecordByAId?.(key)
        || rt?.getTurnRecordByQId?.(key)
        || null;
      if (t) return t;
    } catch {}
    try {
      const t = resolveDotTurnRecord(key);
      if (t) return t;
    } catch {}
    return null;
  }

  function isPaginationWindowingEnabled() {
    try {
      return !!W?.H2O_Pagination?.getPageInfo?.()?.enabled;
    } catch {
      return false;
    }
  }

  function isTurnOnCurrentPaginationPage(turnId = '', answerId = '', questionId = '') {
    if (!isPaginationWindowingEnabled()) return true;
    const record = resolveTurnObj(turnId || answerId || questionId);
    const inCurrent = record?.page?.inCurrentPage;
    return (typeof inCurrent === 'boolean') ? inCurrent : true;
  }

  function resolveAnswerIdForTurn(turnId = '', answerIdHint = '') {
    const hint = String(answerIdHint || '').trim();
    if (hint) return hint;
    const turn = resolveTurnObj(turnId);
    const fromTurn = String(turn?.answerId || turn?.primaryAId || '').trim();
    if (fromTurn) return fromTurn;
    const key = String(turnId || '').trim();
    if (!key) return '';
    try {
      const entries = TOPW.H2O_MM_turnIdByAId?.entries?.();
      if (entries) {
        for (const [aId, tId] of entries) {
          if (String(tId || '').trim() === key) return String(aId || '').trim();
        }
      }
    } catch {}
    return '';
  }

  function resolveQuestionIdForTurn(turnId = '', questionIdHint = '') {
    const hint = String(questionIdHint || '').trim();
    if (hint) return canonicalizeDotQuestionId(hint) || hint;
    const turn = resolveTurnObj(turnId);
    const fromTurn = String(turn?.questionId || turn?.qId || '').trim();
    if (fromTurn) return canonicalizeDotQuestionId(fromTurn) || fromTurn;
    const key = String(turnId || '').trim();
    if (key.startsWith('turn:') && !key.startsWith('turn:a:')) {
      const fromTurnId = normalizeDotId(key);
      if (fromTurnId) return canonicalizeDotQuestionId(fromTurnId) || fromTurnId;
    }
    return '';
  }

  function resolveAnswerElInTurn(turnId = '', answerIdHint = '') {
    const turn = resolveTurnObj(turnId);
    const fromTurn = turn?.el || null;
    if (fromTurn?.isConnected) return fromTurn;

    const answerId = resolveAnswerIdForTurn(turnId, answerIdHint);
    if (answerId) {
      const escA = escAttrValue(answerId);
      const byMsgId =
        document.querySelector(`div[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.MSG_ID}="${escA}"]`) ||
        document.querySelector(`article[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.MSG_ID}="${escA}"]`) ||
        document.querySelector(`[${ATTR_.MSG_ID}="${escA}"]`);
      if (byMsgId) return byMsgId;
    }

    const key = String(turnId || '').trim();
    if (key) {
      const escT = escAttrValue(key);
      const byTurn =
        document.querySelector(`div[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`article[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`[${ATTR_.TURN_ID}="${escT}"]`);
      if (byTurn) return byTurn;
    }
    return null;
  }

  function resolveQuestionElInTurn(turnId = '', questionIdHint = '') {
    const turn = resolveTurnObj(turnId);
    const fromTurn = turn?.questionEl || turn?.qEl || turn?.live?.qEl || null;
    if (fromTurn?.isConnected) return fromTurn;

    const questionId = resolveQuestionIdForTurn(turnId, questionIdHint);
    if (questionId) {
      const escQ = escAttrValue(questionId);
      const byMsgId =
        document.querySelector(`div[${ATTR_.MSG_ROLE}="user"][${ATTR_.MSG_ID}="${escQ}"]`) ||
        document.querySelector(`article[${ATTR_.MSG_ROLE}="user"][${ATTR_.MSG_ID}="${escQ}"]`) ||
        document.querySelector(`[${ATTR_.MSG_ROLE}="user"][${ATTR_.MSG_ID}="${escQ}"]`) ||
        document.querySelector(`[${ATTR_.MSG_ID}="${escQ}"]`);
      if (byMsgId) return byMsgId;
    }

    const key = String(turnId || '').trim();
    if (key) {
      const escT = escAttrValue(key);
      const byTurn =
        document.querySelector(`div[${ATTR_.MSG_ROLE}="user"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`article[${ATTR_.MSG_ROLE}="user"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`[${ATTR_.MSG_ROLE}="user"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`[${ATTR_.TURN_ID}="${escT}"]`);
      if (byTurn) return byTurn;
    }
    return null;
  }

  function readInlineNodeColor(node) {
    if (!node) return '';
    const a = String(node.getAttribute?.('data-h2o-inline-color') || '').trim().toLowerCase();
    if (a) return String(nearestDotColorName(a) || a || '').trim().toLowerCase();
    const b = String(node.getAttribute?.('data-inline-hl') || '').trim().toLowerCase();
    if (b) {
      const tok = b.split(/\s+/).find(Boolean) || '';
      if (tok) return String(nearestDotColorName(tok) || tok || '').trim().toLowerCase();
    }
    const cls = String(node.className || '').trim().toLowerCase();
    if (cls) {
      const hit = DOT_ORDER.find((c) => cls.includes(c));
      if (hit) return hit;
    }
    const inlineBg = String(node.style?.backgroundColor || node.style?.background || '').trim();
    const c1 = nearestDotColorName(inlineBg);
    if (c1) return c1;
    let c2 = '';
    try { c2 = nearestDotColorName(String(getComputedStyle(node).backgroundColor || '').trim()) || ''; } catch {}
    return c2;
  }

  function hasTurnColor(answerEl, answerId = '', colorName = '') {
    const c = String(colorName || '').trim().toLowerCase();
    if (!c) return false;
    const id = String(answerId || '').trim();
    if (id && Array.isArray(inlineDotMap?.[id]) && canonicalInlineColors(inlineDotMap[id]).includes(c)) return true;
    if (!answerEl) return false;
    const hit = findFirstHighlightInAnswer(answerEl, c);
    return !!hit;
  }

  function getDominantTurnColor(answerEl, answerId = '') {
    const id = String(answerId || '').trim();
    if (answerEl) {
      const counts = Object.create(null);
      const nodes = answerEl.querySelectorAll?.(INLINE_NODE_SEL) || [];
      for (const n of nodes) {
        const c = readInlineNodeColor(n);
        if (!c || !isValidDotName(c)) continue;
        counts[c] = (counts[c] || 0) + 1;
      }
      let best = '', bestCount = -1;
      for (const c of DOT_ORDER) {
        const ct = Number(counts[c] || 0);
        if (ct > bestCount) { bestCount = ct; best = c; }
      }
      if (best && bestCount > 0) return best;
    }
    const fromMap = canonicalInlineColors(inlineDotMap?.[id] || []);
    return fromMap[0] || '';
  }

  function recolorTurnHighlights(turnId, fromColor, toColor, opts = {}) {
    const turnKey = String(turnId || '').trim();
    const from = String(nearestDotColorName(fromColor) || fromColor || '').trim().toLowerCase();
    const to = String(nearestDotColorName(toColor) || toColor || '').trim().toLowerCase();
    const answerId = resolveAnswerIdForTurn(turnKey, opts.answerId || '');
    if (!turnKey || !answerId || !from || !to || !isValidDotName(from) || !isValidDotName(to) || from === to) {
      return { ok: false, changed: 0, reason: 'noop' };
    }
    const fn =
      TOPW?.H2O_HL?.recolorTurnHighlights ||
      W?.H2O?.inline?.recolorTurnHighlights ||
      W?.H2OInline?.recolorTurnHighlights ||
      null;
    if (typeof fn !== 'function') return { ok: false, changed: 0, reason: 'hl-api-missing' };
    try {
      return fn(turnKey, from, to, { answerId, source: 'dots:bulk-recolor' }) || { ok: true, changed: 0, answerId, turnId: turnKey, from, to };
    } catch (err) {
      try { console.warn('[MiniMap Dots] recolorTurnHighlights failed', err); } catch {}
      return { ok: false, changed: 0, reason: 'exception' };
    }
  }

  function findFirstHighlightInMessage(messageEl, colorKey) {
    if (!messageEl || !colorKey) return null;
    const c = escAttrValue(colorKey);
    const exactSel = `[data-h2o-inline-color="${c}"], [data-inline-hl="${c}"], [data-h2o-inline-color~="${c}"], [data-inline-hl~="${c}"]`;
    const exact = messageEl.querySelector?.(exactSel);
    if (exact) return exact;

    const fallbackNodes = messageEl.querySelectorAll?.(INLINE_NODE_SEL);
    if (!fallbackNodes?.length) return null;
    for (const el of fallbackNodes) {
      if (readInlineNodeColor(el) === colorKey) return el;
    }
    return null;
  }

  function findFirstHighlightInAnswer(answerEl, colorKey) {
    return findFirstHighlightInMessage(answerEl, colorKey);
  }

  function getHeaderOffsetPx() {
    let maxBottom = 0;
    const nodes = document.querySelectorAll(HEADER_CANDIDATE_SEL);
    nodes.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      let cs = null;
      try { cs = getComputedStyle(el); } catch { cs = null; }
      if (!cs) return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      const r = el.getBoundingClientRect?.();
      if (!r || !Number.isFinite(r.height) || r.height <= 0) return;
      if (r.top > 6 || r.bottom <= 0) return;
      if (r.height > Math.max(240, window.innerHeight * 0.45)) return;
      maxBottom = Math.max(maxBottom, r.bottom);
    });
    return Math.max(0, Math.round(maxBottom + 8));
  }

  function smoothScrollToTargetWithOffset(targetEl) {
    if (!targetEl) return;
    try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' }); } catch {}
    const headerOffset = getHeaderOffsetPx();
    if (headerOffset <= 0) return;
    requestAnimationFrame(() => {
      try {
        const y = window.pageYOffset + targetEl.getBoundingClientRect().top - headerOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      } catch {}
    });
  }

  function tryEnsureInlineRestoreForTurn(turnId, answerId) {
    try { W.H2O?.MM?.dots?.attachInlineMutationObserver?.(); } catch {}
    const detail = {
      answerId: String(answerId || '').trim(),
      turnId: String(turnId || '').trim(),
      source: 'dots:jump-retry'
    };
    try { window.dispatchEvent(new CustomEvent(EV_.INLINE_RESTORED, { detail, bubbles: true, composed: true })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_.INLINE_RESTORED.replace(/^evt:/, ''), { detail, bubbles: true, composed: true })); } catch {}
  }

  function runDotClickDebugCheck({ turnId, answerEl, foundElement, colorKey, dotEl }) {
    if (!DEBUG_DOT_CLICK) return;
    const sameTurn = !!(answerEl && foundElement && answerEl.contains(foundElement));
    const hitBtn = (performance.now() - Number(STATE_DOT_DEBUG.lastBtnCaptureTs || 0)) < 120 &&
      String(STATE_DOT_DEBUG.lastBtnCaptureTurnId || '') === String(turnId || '');
    try {
      console.debug('[MiniMap Dots] dot click jump', {
        turnId: String(turnId || ''),
        color: String(colorKey || ''),
        foundElement: foundElement || null,
        foundInsideTurn: sameTurn,
        dotTriggeredMiniBtnClick: hitBtn,
        dotEl: dotEl || null,
      });
    } catch {}
  }

  function scrollToFirstHighlightInTurn(turnId, colorKey, opts = {}) {
    const turnKey = String(turnId || '').trim();
    const color = String(nearestDotColorName(colorKey) || colorKey || '').trim().toLowerCase();
    const surfaceRole = String(opts.surfaceRole || 'answer').trim().toLowerCase() === 'question' ? 'question' : 'answer';
    const answerId = resolveAnswerIdForTurn(turnKey, opts.answerId || '');
    const questionId = resolveQuestionIdForTurn(turnKey, opts.questionId || '');
    const storageKey = surfaceRole === 'question'
      ? resolveDotStorageKey(questionId, null, 'question')
      : resolveDotStorageKey(answerId, null, 'answer');
    const hasColorInMap = !!(storageKey && inlineDotMap?.[storageKey] && canonicalInlineColors(inlineDotMap[storageKey]).includes(color));
    let targetEl = surfaceRole === 'question'
      ? resolveQuestionElInTurn(turnKey, questionId)
      : resolveAnswerElInTurn(turnKey, answerId);
    let found = findFirstHighlightInMessage(targetEl, color);

    if (!found && (hasColorInMap || targetEl) && opts.retry !== false) {
      tryEnsureInlineRestoreForTurn(turnKey, surfaceRole === 'question' ? (questionId || answerId) : answerId);
      targetEl = surfaceRole === 'question'
        ? resolveQuestionElInTurn(turnKey, questionId)
        : resolveAnswerElInTurn(turnKey, answerId);
      found = findFirstHighlightInMessage(targetEl, color);
    }

    if (found) {
      smoothScrollToTargetWithOffset(found);
      try { W.applyTempFlash?.(found); } catch {}
    }
    runDotClickDebugCheck({ turnId: turnKey, answerEl: targetEl, foundElement: found, colorKey: color, dotEl: opts.dotEl || null });
    return found || null;
  }

  /* ───────────────────────── 12.5) Public API (Split contract) ───────────────────────── */
  try {
    W.H2O = W.H2O || {};
    W.H2O.MM = W.H2O.MM || {};
    W.H2O.MM.dots = W.H2O.MM.dots || {};
    W.H2O.MM.dots.getInlineDotMap = () => inlineDotMap;
    W.H2O.MM.dots.syncMiniMapDot = syncMiniMapDot;
    W.H2O.MM.dots.attachInlineMutationObserver = attachInlineMutationObserver;
    W.H2O.MM.dots.saveInlineDots = saveInlineDots;
    W.H2O.MM.dots.showDotMenu = showDotMenu;
    W.H2O.MM.dots.scrollToFirstHighlightInTurn = scrollToFirstHighlightInTurn;
    W.H2O.MM.dots.recolorTurnHighlights = recolorTurnHighlights;
    W.H2O.MM.dots.openHighlightsPopupBridge = openHighlightsPopupBridge;
    W.H2O.MM.dots.repaintDotsForBtn = repaintDotsForBtn;
    W.H2O.MM.dots.repaintDotsForAllMiniBtns = repaintDotsForAllMiniBtns;
    W.H2O.MM.dots.cleanup = cleanupOwnedDotsResources;
  } catch {}

  try { if (typeof window.syncMiniMapDot !== 'function') window.syncMiniMapDot = syncMiniMapDot; } catch {}

  /* ───────────────────────── 13) Public helper to repaint all dots (optional) ───────────────────────── */
  window.H2O_MM_repaintDots = function repaintAll() {
    return repaintDotsForAllMiniBtns();
  };

  function cleanupOwnedDotsResources() {
    try { detachMiniMapDomObserver(); } catch {}
    try { detachInlineMutationObserver(); } catch {}
    if (STATE_DOT_SYNC_RAF) { try { cancelAnimationFrame(STATE_DOT_SYNC_RAF); } catch {} STATE_DOT_SYNC_RAF = 0; }
    if (STATE_DOTS_REPAINT_RAF) { try { cancelAnimationFrame(STATE_DOTS_REPAINT_RAF); } catch {} STATE_DOTS_REPAINT_RAF = 0; }
    if (STATE_DOTS_VIEW_REPAINT_RAF) { try { cancelAnimationFrame(STATE_DOTS_VIEW_REPAINT_RAF); } catch {} STATE_DOTS_VIEW_REPAINT_RAF = 0; }
    if (STATE_DOTS_VIEW_RECOVERY_TIMER) { try { clearTimeout(STATE_DOTS_VIEW_RECOVERY_TIMER); } catch {} STATE_DOTS_VIEW_RECOVERY_TIMER = 0; }
    if (STATE_DOTS_SAFETY_TIMER) { try { clearTimeout(STATE_DOTS_SAFETY_TIMER); } catch {} STATE_DOTS_SAFETY_TIMER = 0; }
    if (STATE_INLINE_ATTACH_TIMER) { try { clearTimeout(STATE_INLINE_ATTACH_TIMER); } catch {} STATE_INLINE_ATTACH_TIMER = 0; }
    cancelInlineIdleHandle();
    try {
      if (TOPW?.[BOOT_KEY] && typeof TOPW[BOOT_KEY] === 'object') {
        TOPW[BOOT_KEY].active = false;
      }
    } catch {}
  }

  try { TOPW[BOOT_KEY].cleanup = cleanupOwnedDotsResources; } catch {}
})();
