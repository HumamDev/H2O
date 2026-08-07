// ==H2O Module==
// @h2o-id             7a1a.prompt.manager
// @name               7A1a.⬜️✍️ Prompt Manager ✍️
// @namespace          H2O.Premium.CGX.prompt.manager
// @author             HumamDev
// @version            3.1.4
// @revision           001
// @build              260304-102754
// @description        Prompt Manager (Simple + Settings/Edit), Quick Replies tray, History capture, ▲▼ reorder — Contract v2.0 Stage-1 compliant.
// @match              https://chatgpt.com/*
// @run-at             document-end
// @grant              none
// ==/H2O Module==
//
// NOTE: the former `@require` of sortablejs was removed. `@require` is a
// userscript directive; the extension loader parses it only to derive
// `/alias/` load-order hints and never fetches it, so `window.Sortable` was
// never defined at runtime. Reordering is served by the ▲/▼ controls, which
// are keyboard-reachable and need no third-party dependency.

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  // ✅ Identity (LOCKED first)
  const TOK = 'PM';                 // Prompt Manager
  const PID = 'prmptmngr';          // canonical (lowercase consonant-only)
  const BrID = PID;                 // default
  const DsID = PID;                 // default
  const CID = 'pmanager';           // identifiers only
  const SkID = 'prmn';              // Skin/UI hooks (Prompt->pr, Manager->mn)

  // ✅ Version — single source of truth.
  // Must stay byte-identical to the `@version` metadata line above; a comment
  // cannot interpolate a constant, so the pairing is asserted by
  // tools/validation/prompt-manager/validate-prompt-manager-source-invariants.mjs.
  const MOD_VERSION = '3.1.4';

  // Labels only
  const MODTAG = 'PMgr';
  const MODICON = '✍️';
  const EMOJI_HDR = 'OFF';
  const SUITE = 'prm';
  const HOST = 'cgx';

  // Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* [DEFINE][DOM] Real attribute-name constants (ATTR_) */
  const ATTR_CGXUI = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_CGXUI_THEME = 'data-cgxui-theme'; // owned theme token (host-theme authority)
  const ATTR_ROLE = 'data-message-author-role';

  /* [DEFINE][STORE] Namespaces (boundary-only) */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  /* [DEFINE][EV] Canonical events */
  const EV_PM_READY_V1 = 'evt:h2o:promptmgr:ready';
  const EV_PM_CHANGED_V1 = 'evt:h2o:promptmgr:changed';
  const EV_EXPORT_RUN = 'evt:h2o:export:run';
  const EV_INPUT_DOCK_READY = 'evt:h2o:inputdock:ready';
  // Legacy bridge (kept for older consumers, including Control Hub bridge code)
  const EV_PM_READY_LEGACY_V1 = 'evt:h2o:pm:ready:v1';
  const EV_PM_CHANGED_LEGACY_V1 = 'evt:h2o:pm:changed:v1';

  /* [STATE][EV] ready emitted guard */
  let PM_READY_EMITTED = false;


  /* [DEFINE][UI] UI tokens (SkID-based values) */
  const UI_PM_WRAP = `${SkID}-wrap`;
  const UI_PM_BTNBOX = `${SkID}-btnbox`;
  const UI_PM_EXPORT_BTN = `${SkID}-export-btn`;
  const UI_PM_BTN = `${SkID}-btn`;
  const UI_PM_PANEL = `${SkID}-panel`;
  const UI_PM_OVERLAY = `${SkID}-overlay`;

  const UI_PM_MODE_SIMPLE = `${SkID}-mode-simple`;
  const UI_PM_MODE_EDIT = `${SkID}-mode-edit`;

  // Distinct per-mode search identifiers. Both panes previously shared one
  // token, so `querySelector` bound only the first (Simple) input and the Edit
  // search box was inert while the Edit list was filtered by the Simple value.
  const UI_PM_SEARCH_SIMPLE = `${SkID}-search-simple`;
  const UI_PM_SEARCH_EDIT = `${SkID}-search-edit`;

  const UI_PM_AUTOSEND_SIMPLE = `${SkID}-autosend-simple`;
  const UI_PM_AUTOSEND_EDIT = `${SkID}-autosend-edit`;

  const UI_PM_LIST_SIMPLE = `${SkID}-list-simple`;
  const UI_PM_LIST_EDIT = `${SkID}-list-edit`;

  const UI_PM_ADD_TITLE = `${SkID}-add-title`;
  const UI_PM_ADD_BODY = `${SkID}-add-body`;
  const UI_PM_ADD_BTN = `${SkID}-add-btn`;

  const UI_PM_SETTINGS = `${SkID}-settings`;
  const UI_PM_BACK = `${SkID}-back`;
  const UI_PM_CLOSE_SIMPLE = `${SkID}-close-simple`;
  const UI_PM_CLOSE_EDIT = `${SkID}-close-edit`;

  const UI_PM_FILTER_ROW = `${SkID}-filter-row`;
  const UI_PM_FILTER_ALL = `${SkID}-filter-all`;
  const UI_PM_FILTER_PROMPTS = `${SkID}-filter-prompts`;
  const UI_PM_FILTER_APPEND = `${SkID}-filter-append`;
  const UI_PM_FILTER_QUICK = `${SkID}-filter-quick`;
  const UI_PM_FILTER_HISTORY = `${SkID}-filter-history`;
  const UI_PM_FILTER_DRAFTS = `${SkID}-filter-drafts`;
  const UI_PM_FILTER_PASTED = `${SkID}-filter-pasted`;

  const UI_PM_EDIT_FILTER_ROW = `${SkID}-edit-filter-row`;
  const UI_PM_EDIT_FILTER_ALL = `${SkID}-edit-filter-all`;
  const UI_PM_EDIT_FILTER_PROMPTS = `${SkID}-edit-filter-prompts`;
  const UI_PM_EDIT_FILTER_APPEND = `${SkID}-edit-filter-append`;
  const UI_PM_EDIT_FILTER_QUICK = `${SkID}-edit-filter-quick`;
  const UI_PM_EDIT_FILTER_HISTORY = `${SkID}-edit-filter-history`;
  const UI_PM_EDIT_FILTER_DRAFTS = `${SkID}-edit-filter-drafts`;
  const UI_PM_EDIT_FILTER_PASTED = `${SkID}-edit-filter-pasted`;

  const UI_PM_QUICK_TRAY = `${SkID}-quick-tray`;
  const UI_PM_QUICK_MODE_DOT = `${SkID}-quick-mode-dot`;

  const UI_PM_TOOLTIP = `${SkID}-tooltip`;
  const LEGACY_XPCH_PROMPT_EXPORT_SEL = '[data-cgxui-owner="xpch"][data-cgxui="xpch-prompt-export-btn"]';

  const DOCK_PM = Object.freeze({
    REG_TOP: `${SkID}-dock-top`,
    STATE_DOCK: 'dock',
  });

  // state classes (shared across render + public API)
  const UI_PM_CLS_OPEN = `cgxui-${SkID}--panel-open`;
  const UI_PM_CLS_OVSHOW = `cgxui-${SkID}--overlay-show`;
  const UI_PM_CLS_QSHOW = `cgxui-${SkID}--quick-show`;
  const UI_PM_CLS_DOT_SHOW = `cgxui-${SkID}--dot-show`;

  /* [DEFINE][CSS] style id */
  const CSS_PM_STYLE_ID = `cgxui-${SkID}-style`;

  /* [DEFINE][CFG] knobs */
  const CFG_PM = {
    PANEL_MAX_H: 0.62, // vh
    PANEL_W_MAX: 580,
    PANEL_W_VW: 90,
    FLOAT_TOP_GAP_Y: 25,
    FLOAT_LEFT_INSET_X_FALLBACK: 5,
    ANCHOR_MAX_VH: 0.9,
    ANCHOR_MIN_PX: 280,
    ANCHOR_MAX_PX: 1200,
    FLOAT_MIN_TOP_SAFE_Y: 52,
    CLICK_DELAY_MS: 220,
    EXPORT_BTN_LABEL: 'Export',
    EXPORT_BTN_TITLE: 'Export this chat',
    EXPORT_MODE_FULL: 'full',
    EXPORT_MODE_MINIMAL: 'minimal',
    CHAT_PATH_RE: /\/c\/([a-z0-9-]+)/i,
    CHAT_TITLE_SUFFIX_RE: /\s*[-|]\s*ChatGPT.*$/i,
    CHAT_TITLE_PREFIX: 'Chat',
    CHAT_TITLE_FALLBACK: 'Chat',
    SEND_CLICK_DELAY_MS: 20,
    QUICK_TRAY_SHOW_ON_BOOT: true,
    HISTORY_MAX: 50,
    HISTORY_BYTE_CAP: 80_000,
    DRAFTS_MAX: 50,
    DRAFTS_BYTE_CAP: 60_000,
    PASTED_MAX: 50,
    PASTED_BYTE_CAP: 80_000,
    TOOLTIP_PAD: 12,
    // 🎨 Aurora Glass panel skin (tweak freely)
    GLASS_TEXT: '#f4f6fb',
    GLASS_TINT_A: 'rgba(255,255,255,0.00)',
    GLASS_TINT_B: 'rgba(255,255,255,0.00)',
    GLASS_BG_A: 'rgba(255,255,255,0.045)',
    GLASS_BG_B: 'rgba(255,255,255,0.030)',
    GLASS_BLUR_PX: 14,
    GLASS_SAT: 1.05,
    GLASS_SHADOW: '0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10)',
    GLASS_CONTRAST: 1.08,
    GLASS_BRIGHT: 1.03,
    PANEL_Z: 9999,
  };

  const VIEW_PM = Object.freeze({
    CHAT_PATH_RE: /^(?:\/c\/|\/g\/[^/]+\/c\/)/i,
    SEARCH_SEL: [
      '[role="dialog"] input[placeholder*="Search chats" i]',
      'input[placeholder*="Search chats" i]',
      '[role="dialog"] input[type="search"]',
    ].join(', '),
  });

  /* [DEFINE][KEY] Disk keys */
  const KEY_PM_STATE_PROMPTS_V1 = `${NS_DISK}:state:prompts:v1`;
  const KEY_PM_CFG_AUTOSEND_V1 = `${NS_DISK}:cfg:auto_send:v1`;
  const KEY_PM_STATE_LAST_USED_V1 = `${NS_DISK}:state:last_used_id:v1`;
  const KEY_PM_STATE_QUICK_V1 = `${NS_DISK}:state:quick_replies:v1`;
  const KEY_PM_STATE_HISTORY_V1 = `${NS_DISK}:state:history:v1`;
  const KEY_PM_STATE_DRAFTS_V1 = `${NS_DISK}:state:drafts:v1`;
  const KEY_PM_STATE_PASTED_V1 = `${NS_DISK}:state:pasted:v1`;
  const KEY_PM_UI_MODE_V1 = `${NS_DISK}:ui:mode:v1`;
  // One-time seed marker: `{ prompts:boolean, quickReplies:boolean }`. A flag is
  // set only after that collection's seed write actually succeeded. Once set, an
  // absent primary key resolves to [] instead of resurrecting the defaults.
  const KEY_PM_STATE_SEEDED_V1 = `${NS_DISK}:state:seeded:v1`;
  const KEY_PM_MIG_KEYS_V1 = `${NS_DISK}:migrate:pm_keys:v1`;
  const KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1 = `${NS_DISK}:migrate:pm_drafts_from_history:v1`;

  /* [DEFINE][MIG] legacy keys (read+remove once) */
  const KEY_LEG_PROMPTS = 'ho:pm:prompts';
  const KEY_LEG_AUTOSEND = 'ho:pm:autoSend';
  const KEY_LEG_LAST_USED = 'ho:pm:lastUsedId';
  const KEY_LEG_QUICK = 'ho:pm:quickReplies';
  const KEY_LEG_HISTORY = 'ho:pm:history';
  const KEY_LEG_MODE = 'ho:pm:mode';

  /* ───────────────────────────── ⬛️ DEFINE — Runtime Vault (Brain) 📄🔒💧 ───────────────────────────── */
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));
  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST,
  };
  MOD_OBJ.api = MOD_OBJ.api || {};

  /* [DIAG] bounded flight recorder */
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;
  /* [DIAG] durable failure counters (data-safety signals; no UI in this phase) */
  DIAG.counters = DIAG.counters || { writeFailures: 0, corruptReads: 0, seeds: 0 };

  /* ───────────────────────────── 🟦 SHAPE — Contracts / Types 📄🔒💧 ───────────────────────────── */
  // Prompt item:
  // { id, title, body, favorite, type: 'prompt'|'append', createdAt, updatedAt }
  // Quick item:
  // { id, text, order, createdAt, updatedAt }
  // History item:
  // { id, text, createdAt, source?: 'send' }
  // Draft item:
  // { id, text, createdAt }
  // Pasted item:
  // { id, text, createdAt }

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */
  const UTIL_storage = {
    getStr(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val) { try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
    del(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },

    /* [STORE] Raw read that distinguishes "absent" from "present but malformed".
     *
     * getJSON() above collapses both into its `fallback`, which is what let a
     * single unparseable value be treated as a first run — and overwritten with
     * seed data. This path is additive: getJSON()'s contract is unchanged for
     * its existing callers.
     *
     * Absence is defined strictly as `getItem() === null`. ANY returned string
     * counts as present — including the empty string, which is a real stored
     * value that JSON.parse rejects. Treating '' as absent would let a truncated
     * or cleared-to-empty write be re-seeded over, which is exactly the class of
     * data loss this path exists to prevent.
     *
     * Returns { ok, present, raw }:
     *   ok:false              → the storage read itself threw (blocked/unavailable)
     *   ok:true present:false → key genuinely absent (getItem returned null)
     *   ok:true present:true  → `raw` is the exact stored string, byte-for-byte
     */
    readRaw(key) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return { ok: true, present: false, raw: null, err: null };
        return { ok: true, present: true, raw, err: null };
      } catch (e) {
        return { ok: false, present: false, raw: null, err: e };
      }
    },

    /* [STORE] Bounded key listing — used only to look for an existing quarantine
     * copy. Returns [] and reports diagnostically if enumeration is unavailable. */
    keys() {
      try {
        const out = [];
        const n = Number(localStorage.length) || 0;
        for (let i = 0; i < n; i += 1) {
          const k = localStorage.key(i);
          if (typeof k === 'string') out.push(k);
        }
        return out;
      } catch {
        return null; // null = enumeration failed (distinct from "no keys")
      }
    },
  };

  const UTIL_now = () => Date.now();

  const UTIL_diagStep = (msg, extra) => {
    try {
      const it = { t: Math.round(performance.now() - DIAG.t0), msg: String(msg || '') };
      if (extra !== undefined) it.x = (typeof extra === 'string') ? extra.slice(0, 240) : undefined;
      DIAG.steps.push(it);
      if (DIAG.steps.length > DIAG.bufMax) DIAG.steps.splice(0, DIAG.steps.length - DIAG.bufMax);
    } catch {}
  };
  const UTIL_diagErr = (where, err) => {
    try {
      const it = { t: Math.round(performance.now() - DIAG.t0), where: String(where || ''), err: String(err?.stack || err || '') };
      DIAG.errors.push(it);
      if (DIAG.errors.length > DIAG.errMax) DIAG.errors.splice(0, DIAG.errors.length - DIAG.errMax);
    } catch {}
  };

  const UTIL_escapeHtml = (str = '') =>
    String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

  /* [UTIL] Small stable hash (FNV-1a, 32-bit, hex).
   * Deterministic across runs and processes — no clock, no randomness — so a
   * value derived from it can be recomputed identically on a later boot. Used
   * only to compress text into a migration identity, never for security. */
  const UTIL_hash32 = (input) => {
    const s = String(input ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  const UTIL_cryptoId = () => {
    try {
      if (W.crypto?.randomUUID) return W.crypto.randomUUID();
      const a = new Uint8Array(16);
      W.crypto.getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return `pm_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    }
  };

  const UTIL_event = {
    emit(type, detail) {
      try { W.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
    },
  };

  const UTIL_emitPmChanged = (detail) => {
    UTIL_event.emit(EV_PM_CHANGED_V1, detail);
    UTIL_event.emit(EV_PM_CHANGED_LEGACY_V1, detail);
  };

  const UTIL_getChatId = () => {
    const fromCore = String(W.H2O?.util?.getChatId?.() || '').trim();
    if (fromCore) return fromCore;
    const m = String(W.location?.pathname || '').match(CFG_PM.CHAT_PATH_RE);
    return m ? String(m[1] || '').trim() : '';
  };

  const UTIL_getChatTitle = (chatId = '') => {
    const heading = D.querySelector('main h1, [data-testid="conversation-title"], [data-testid="chat-title"]');
    const text = String(heading?.textContent || '').trim();
    if (text) return text;
    const raw = String(D.title || '').trim();
    const stripped = raw.replace(CFG_PM.CHAT_TITLE_SUFFIX_RE, '').trim();
    if (stripped) return stripped;
    return chatId ? `${CFG_PM.CHAT_TITLE_PREFIX} ${chatId}` : CFG_PM.CHAT_TITLE_FALLBACK;
  };

  const UTIL_emitExportRun = (modeRaw, shiftKey = false) => {
    const mode = (String(modeRaw || '').toLowerCase() === CFG_PM.EXPORT_MODE_MINIMAL || !!shiftKey)
      ? CFG_PM.EXPORT_MODE_MINIMAL
      : CFG_PM.EXPORT_MODE_FULL;
    const chatId = UTIL_getChatId();
    const title = UTIL_getChatTitle(chatId);
    UTIL_event.emit(EV_EXPORT_RUN, { chatId, title, ts: Date.now(), mode });
  };

  /* ───────────────────────────── 🔴 STATE — Registries / Caches 📄🔓💧 ───────────────────────────── */
  const STATE_PM = {
    booted: false,
    // Set when a read was malformed or a write failed. Diagnostics-only in this
    // phase; the user-facing banner is a later phase.
    dataError: false,
    ui: {
      root: null,
      panel: null,
      overlay: null,
      tooltip: null,
      pmClickTimer: 0,
      dockMode: false,
      dockBridgeWired: false,
      dockRegActive: false,
      quickSendMode: false,
      // Canonical search query. Neither DOM input owns the query; both mirror it.
      searchQuery: '',
      simpleTypeFilter: 'all', // all|prompt|append|quick|history|draft|pasted
      editCategory: 'all',     // all|prompt|append|quick|history|draft|pasted
    },
    data: {
      prompts: [],
      quick: [],
    },
    historyCapture: {
      form: null,
      sendBtn: null,
      unbindForm: null,
      unbindSendBtn: null,
    },
    clean: {
      fns: [],
      obs: [],
      timers: new Set(),    // one-shot timeout ids; self-removing when they fire
      intervals: new Set(), // interval ids; owned until explicitly cleared
      nodes: [],
    },
  };

  const CLEAN_addFn = (fn) => { if (typeof fn === 'function') STATE_PM.clean.fns.push(fn); };
  const CLEAN_addNode = (n) => { if (n) STATE_PM.clean.nodes.push(n); };
  const CLEAN_addObs = (o) => { if (o) STATE_PM.clean.obs.push(o); };

  /* [CLEAN] Owned timer helpers.
   * One-shot ids drop out of the Set as soon as they fire (or when cleared), so
   * the bookkeeping cannot grow without bound. Interval ids stay owned until
   * cleared or disposed. */
  const CLEAN_setTimeout = (fn, ms) => {
    let id = 0;
    id = W.setTimeout(() => {
      STATE_PM.clean.timers.delete(id);
      SAFE_try('CLEAN_setTimeout.cb', fn, null);
    }, ms);
    if (id) STATE_PM.clean.timers.add(id);
    return id;
  };
  const CLEAN_clearTimeout = (id) => {
    if (!id) return;
    STATE_PM.clean.timers.delete(id);
    try { W.clearTimeout(id); } catch {}
  };
  const CLEAN_setInterval = (fn, ms) => {
    const id = W.setInterval(fn, ms);
    if (id) STATE_PM.clean.intervals.add(id);
    return id;
  };
  const CLEAN_clearInterval = (id) => {
    if (!id) return;
    STATE_PM.clean.intervals.delete(id);
    try { W.clearInterval(id); } catch {}
  };

  let PM_BOOT_RETRY_TIMER = 0;
  let PM_SELF_HEAL_TIMER = 0;
  let PM_SELF_HEAL_OBS = null;
  let PM_THEME_OBS = null;
  let PM_FORCE_RECOVER = false;
  let PM_LAYOUT_RAF = 0;

  /* ───────────────────────────── 🟫 VERIFY/SAFETY — Guards 📝🔓💧 ───────────────────────────── */
  const SAFE_try = (where, fn, fallback) => {
    try { return fn(); } catch (e) { UTIL_diagErr(where, e); return fallback; }
  };

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO Adapters 📝🔓💥 ───────────────────────────── */
  /* [SEL] registry (no ad-hoc selector strings elsewhere) */
  const SEL_PM = {
    HOST_FORM: 'form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]',
    HOST_EDITABLE: [
      '#prompt-textarea',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      'form.group\\/composer [contenteditable="true"]',
      'form[data-testid="composer"] [contenteditable="true"]',
      'form[action*="conversation"] [contenteditable="true"]',
    ].join(', '),
    HOST_TEXTAREA: 'form[data-testid="composer"] textarea, form[action*="conversation"] textarea',
    HOST_SEND_BTN: 'form[data-type="unified-composer"] button[data-testid="send-button"], form.group\\/composer button[data-testid="send-button"], form[data-testid="composer"] button[data-testid="send-button"], form[action*="conversation"] button[data-testid="send-button"]',
    HOST_ANY_FORM_BTN: 'form[data-type="unified-composer"] button, form.group\\/composer button, form[data-testid="composer"] button, form[action*="conversation"] button',

    HOST_MESSAGE_GROUP: `[${ATTR_ROLE}="assistant"],[${ATTR_ROLE}="user"]`,

    // owned UI (scoped by owner in helpers)
    UI_WRAP: () => `[${ATTR_CGXUI}="${UI_PM_WRAP}"][${ATTR_CGXUI_OWNER}="${SkID}"]`,
    UI_TOOLTIP: () => `[${ATTR_CGXUI}="${UI_PM_TOOLTIP}"][${ATTR_CGXUI_OWNER}="${SkID}"]`,
  };

  const DOM_q = (sel, root = D) => root.querySelector(sel);
  const DOM_qa = (sel, root = D) => Array.from(root.querySelectorAll(sel));

  const DOM_isVisible = (el) => {
    if (!el) return false;
    try {
      if (!D.contains(el)) return false;
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
  };

  const VIEW_PM_isChatPath = () => VIEW_PM.CHAT_PATH_RE.test(String(W.location?.pathname || '').trim());

  const VIEW_PM_isSearchPanelOpen = () => {
    const cands = DOM_qa(VIEW_PM.SEARCH_SEL);
    if (!cands.length) return false;
    for (const el of cands) {
      if (!DOM_isVisible(el)) continue;
      const ph = String(el.getAttribute?.('placeholder') || '').toLowerCase();
      if (ph.includes('search chats')) return true;
      if (el.closest?.('[role="dialog"]')) return true;
    }
    return false;
  };

  const VIEW_PM_shouldShow = () => VIEW_PM_isChatPath() && !VIEW_PM_isSearchPanelOpen();

  const DOM_setStateToken = (el, token, on) => {
    if (!el || !token) return;
    const t = String(token).trim();
    if (!t) return;
    const raw = String(el.getAttribute?.(ATTR_CGXUI_STATE) || '').trim();
    const set = new Set(raw ? raw.split(/\s+/g) : []);
    if (on) set.add(t);
    else set.delete(t);
    if (set.size) el.setAttribute(ATTR_CGXUI_STATE, Array.from(set).join(' '));
    else el.removeAttribute(ATTR_CGXUI_STATE);
  };

  const DOM_scoreBottomLaneRect = (r) => {
    if (!r) return 0;
    const vh = Math.max(1, Number(W.innerHeight) || 0);
    const bottom = Number(r.bottom);
    let score = 0;
    if (Number.isFinite(bottom)) {
      if (bottom >= (vh * 0.45)) score += 2;
      if (bottom <= (vh + 24)) score += 1;
      const distFromBottom = Math.abs(vh - bottom);
      score += Math.max(0, 420 - distFromBottom) / 70;
    }
    return score;
  };

  const DOM_pickEditableInForm = (form) => {
    if (!form) return null;
    const cands = Array.from(form.querySelectorAll('#prompt-textarea, textarea, div[contenteditable="true"], [contenteditable="true"]'));
    if (!cands.length) return null;

    let best = null;
    let bestScore = -1;
    for (const el of cands) {
      if (!el) continue;
      let score = 0;
      if (el.id === 'prompt-textarea') score += 12;
      if (String(el.getAttribute?.('contenteditable') || '').toLowerCase() === 'true') score += 3;
      if (el.tagName === 'TEXTAREA') score += 2;
      if (DOM_isVisible(el)) score += 4;
      try { score += DOM_scoreBottomLaneRect(el.getBoundingClientRect()); } catch {}

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  };

  const DOM_getForm = () => {
    const promptTa = D.getElementById?.('prompt-textarea');
    const promptForm = promptTa?.closest?.('form') || null;
    if (promptForm && DOM_isVisible(promptForm)) return promptForm;

    const forms = DOM_qa(SEL_PM.HOST_FORM);
    if (!forms.length) return null;

    let best = null;
    let bestScore = -1;
    for (const f of forms) {
      if (!f) continue;

      const isComposer = !!f.matches?.('form[data-testid="composer"]');
      const isUnified = !!f.matches?.('form[data-type="unified-composer"], form.group\\/composer');
      const isConvo = !!f.matches?.('form[action*="conversation"]');
      const hasPrompt = !!f.querySelector?.('#prompt-textarea');
      const hasSend = !!f.querySelector?.('button[data-testid="send-button"], button[aria-label*="Send" i]');
      const hasInput = !!DOM_pickEditableInForm(f);

      if (!(isUnified || isComposer || isConvo || hasPrompt || hasSend || hasInput)) continue;

      let score = 0;
      if (isUnified) score += 13;
      if (isComposer) score += 12;
      if (hasPrompt) score += 10;
      if (isConvo) score += 8;
      if (hasSend) score += 6;
      if (hasInput) score += 4;
      if (DOM_isVisible(f)) score += 3;
      try { score += DOM_scoreBottomLaneRect(f.getBoundingClientRect()); } catch {}

      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }

    if (best && bestScore >= 8) return best;

    // Fallback: visible input host form if direct selectors miss.
    const fallbackInput = (
      D.getElementById?.('prompt-textarea') ||
      DOM_qa(SEL_PM.HOST_EDITABLE).find((el) => DOM_isVisible(el)) ||
      DOM_qa(SEL_PM.HOST_TEXTAREA).find((el) => DOM_isVisible(el)) ||
      null
    );
    const inputForm = fallbackInput?.closest?.('form') || null;
    if (inputForm && DOM_isVisible(inputForm)) return inputForm;

    // Last fallback: visible bottom-lane form with a send button.
    let tail = null;
    let tailScore = -Infinity;
    const tailForms = DOM_qa('form');
    for (const f of tailForms) {
      if (!DOM_isVisible(f)) continue;
      if (!f.querySelector?.('button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="send" i]')) continue;
      let score = 6;
      const hasInput = !!DOM_pickEditableInForm(f);
      if (hasInput) score += 3;
      try { score += DOM_scoreBottomLaneRect(f.getBoundingClientRect()); } catch {}
      if (score >= tailScore) {
        tail = f;
        tailScore = score;
      }
    }
    return tail || null;
  };

  const DOM_pickComposerSurface = (inputHint = null) => {
    const cands = DOM_qa('[data-composer-surface="true"]');
    if (!cands.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of cands) {
      if (!DOM_isVisible(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width <= 0 || r.height <= 0) continue;

      let score = 0;
      if (r.width >= 300) score += 2;
      if (el.closest?.(SEL_PM.HOST_FORM)) score += 6;
      if (inputHint && el.contains?.(inputHint)) score += 18;
      score += DOM_scoreBottomLaneRect(r);

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  };
  const DOM_getEditableInput = () => {
    const form = DOM_getForm();
    if (form) {
      const picked = DOM_pickEditableInForm(form);
      if (picked) return picked;
    }
    return null;
  };

  const DOM_getSendButton = () => {
    const form = DOM_getForm();
    if (!form) return null;
    let btn = form.querySelector('button[data-testid="send-button"]');
    if (btn) return btn;
    const all = DOM_qa('button', form);
    const found = all.find(b => String(b.getAttribute('aria-label') || '').toLowerCase().includes('send'));
    return found || null;
  };

  const DOM_isSendButton = (btn) => {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    const tid = String(btn.getAttribute('data-testid') || '').toLowerCase();
    if (tid === 'send-button') return true;
    const aria = String(btn.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('send')) return true;
    return false;
  };

  const DOM_unionRect = (rects) => {
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
  };

  const DOM_clampAnchorRect = (r) => {
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
      CFG_PM.ANCHOR_MIN_PX,
      Math.min(CFG_PM.ANCHOR_MAX_PX, Math.round(W.innerHeight * CFG_PM.ANCHOR_MAX_VH))
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
  };

  const DOM_getComposerAnchorRect = () => {
    const form = DOM_getForm();
    const input = DOM_getEditableInput();
    const bestSurface = DOM_pickComposerSurface(input || null);
    const surface =
      bestSurface ||
      input?.closest?.('[data-composer-surface="true"]') ||
      form?.querySelector?.('[data-composer-surface="true"]') ||
      form?.closest?.('[data-composer-surface="true"]') ||
      null;

    if (surface && DOM_isVisible(surface)) {
      const rSurface = surface.getBoundingClientRect?.();
      if (rSurface && rSurface.width > 0 && rSurface.height > 0) return rSurface;
    }

    const rForm = (form && DOM_isVisible(form)) ? form.getBoundingClientRect() : null;
    const rInput = (input && DOM_isVisible(input)) ? input.getBoundingClientRect() : null;
    const sendBtn =
      form?.querySelector?.('button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="send" i]') ||
      null;
    const rSend = (sendBtn && DOM_isVisible(sendBtn)) ? sendBtn.getBoundingClientRect() : null;

    return DOM_clampAnchorRect(DOM_unionRect([rForm, rInput, rSend]) || rInput || rForm || rSend || null);
  };

  const DOM_getMirroredNavRightInset = (anchorRect) => {
    const fallback = CFG_PM.FLOAT_LEFT_INSET_X_FALLBACK;
    if (!anchorRect) return fallback;
    try {
      const navRef =
        D.querySelector('[data-cgxui-owner="nvcn"][data-cgxui="nvcn-nav-wheel-mask"]') ||
        D.querySelector('.cgxui-nav-wheel-mask[data-cgxui-owner="nvcn"]') ||
        D.querySelector('[data-cgxui-owner="nvcn"][data-cgxui="nvcn-nav-box"]') ||
        D.querySelector('.cgxui-nav-box[data-cgxui-owner="nvcn"]');
      if (!navRef) return fallback;

      const navRect = navRef.getBoundingClientRect?.();
      if (!navRect || navRect.width <= 0 || navRect.height <= 0) return fallback;

      const inset = Math.round((anchorRect.right || 0) - navRect.right);
      if (!Number.isFinite(inset)) return fallback;
      return Math.max(-40, Math.min(60, inset));
    } catch {
      return fallback;
    }
  };

  const DOM_getInputText = () => {
    const el = DOM_getEditableInput();
    if (!el) return '';
    const isCE = el.getAttribute && el.getAttribute('contenteditable') === 'true';
    return (isCE ? el.innerText : el.value) || '';
  };

  const DOM_setInputText = (text, opts) => {
    const el = DOM_getEditableInput();
    if (!el) return false;
    const isCE = el.getAttribute && el.getAttribute('contenteditable') === 'true';

    const append = !!opts?.append;
    const autoSend = !!opts?.autoSend;

    const doSet = () => {
      el.focus();
      if (isCE) {
        const current = el.innerText || '';
        if (append) {
          const trimmed = current.replace(/\s+$/, '');
          if (!trimmed) el.innerText = text;
          else el.innerText = current + (current.endsWith('\n') ? '' : '\n') + text;
        } else {
          el.innerText = text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const current = el.value || '';
        if (append) {
          const trimmed = current.replace(/\s+$/, '');
          if (!trimmed) el.value = text;
          else el.value = current + (current.endsWith('\n') ? '' : '\n') + text;
        } else {
          el.value = text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    doSet();

    if (autoSend) {
      CLEAN_setTimeout(() => {
        SAFE_try('DOM_setInputText.autoSend', () => DOM_getSendButton()?.click(), null);
      }, CFG_PM.SEND_CLICK_DELAY_MS);
    }

    return true;
  };

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES (pure) 📄🔓💧 ───────────────────────────── */
  const CSS_PM_TEXT = () => {
    const selScoped = (ui) => `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

    const WRAP = selScoped(UI_PM_WRAP);
    const BTNBOX = selScoped(UI_PM_BTNBOX);
    const EXPORT_BTN = selScoped(UI_PM_EXPORT_BTN);
    const BTN = selScoped(UI_PM_BTN);
    const PANEL = selScoped(UI_PM_PANEL);
    const OVERLAY = selScoped(UI_PM_OVERLAY);
    const TOOLTIP = selScoped(UI_PM_TOOLTIP);
    const QUICK_TRAY = selScoped(UI_PM_QUICK_TRAY);
    const QUICK_DOT = selScoped(UI_PM_QUICK_MODE_DOT);

    // internal-only classes (scoped)
    const CLS_ITEM = `.cgxui-${SkID}--item`;
    const CLS_MOVED = `.cgxui-${SkID}--moved`;
    const CLS_TOP = `.cgxui-${SkID}--top`;
    const CLS_LIST = `.cgxui-${SkID}--list`;
    const CLS_INPUT = `.cgxui-${SkID}--input`;
    const CLS_BTN = `.cgxui-${SkID}--btn`;
    const CLS_CHIP = `.cgxui-${SkID}--chip`;
    const CLS_CHIP_ACTIVE = `.cgxui-${SkID}--chip-active`;
    const CLS_STAR = `.cgxui-${SkID}--star`;
    const CLS_STAR_ACTIVE = `.cgxui-${SkID}--star-active`;
    const CLS_PREV = `.cgxui-${SkID}--prev`;
    const CLS_TITLE = `.cgxui-${SkID}--title`;
    const CLS_TITLE_LEFT = `.cgxui-${SkID}--title-left`;
    const CLS_ACTIONS = `.cgxui-${SkID}--actions`;
    const CLS_MOVE_BTNS = `.cgxui-${SkID}--movebtns`;
    const CLS_MOVE = `.cgxui-${SkID}--move`;

    const CLS_OVERLAY_SHOW = `.cgxui-${SkID}--overlay-show`;
    const CLS_PANEL_OPEN = `.cgxui-${SkID}--panel-open`;
    const CLS_QUICK_SHOW = `.cgxui-${SkID}--quick-show`;
    const CLS_DOT_SHOW = `.cgxui-${SkID}--dot-show`;
    const CLS_DOT_SEND = `.cgxui-${SkID}--dot-send`;

    /* Theme variable block, emitted once per theme.
     * Authority order: the owned `data-cgxui-theme` token (stamped from
     * ChatGPT's own root class) wins; `prefers-color-scheme` is the fallback
     * used only while the host theme cannot be determined. The token selector
     * targets `[data-cgxui-owner]` rather than the wrap specifically so that
     * owned nodes mounted outside the wrap — the tooltip lives on <body> — also
     * resolve against the host theme. */
    const OWNED = `[${ATTR_CGXUI_OWNER}="${SkID}"]`;
    const VARS_DARK = `
  --cgxui-${SkID}-bg: rgba(18, 18, 18, 0.94);
  --cgxui-${SkID}-border: rgba(255,255,255,.08);
  --cgxui-${SkID}-text: ${CFG_PM.GLASS_TEXT};
  --cgxui-${SkID}-muted: rgba(180, 180, 180, 0.5);
  --cgxui-${SkID}-card: rgba(28, 29, 32, 0.85);
  --cgxui-${SkID}-input: rgba(24, 25, 28, 0.85);
  --cgxui-${SkID}-btn: rgba(38, 39, 45, .78);
  --cgxui-${SkID}-btn-hover: rgba(48, 50, 57, .82);
  --cgxui-${SkID}-accent: #9ca3af;
  --cgxui-${SkID}-shadow: 0 12px 40px rgba(0,0,0,.35);
  --cgxui-${SkID}-radius: 14px;`;
    const VARS_LIGHT = `
  --cgxui-${SkID}-bg: rgba(255,255,255,.86);
  --cgxui-${SkID}-border: rgba(0,0,0,.08);
  --cgxui-${SkID}-text: #111827;
  --cgxui-${SkID}-muted: #4b5563;
  --cgxui-${SkID}-card: rgba(249, 250, 251, .92);
  --cgxui-${SkID}-input: rgba(243, 244, 246, .92);
  --cgxui-${SkID}-btn: rgba(243, 244, 246, .96);
  --cgxui-${SkID}-btn-hover: rgba(229, 231, 235, .98);
  --cgxui-${SkID}-accent: #0ea5e9;
  --cgxui-${SkID}-shadow: 0 12px 40px rgba(0,0,0,.15);
  --cgxui-${SkID}-radius: 14px;`;

    return `
:root{${VARS_DARK}
}
@media (prefers-color-scheme: light){
  :root{${VARS_LIGHT}
  }
}
${OWNED}[${ATTR_CGXUI_THEME}="dark"]{${VARS_DARK}
}
${OWNED}[${ATTR_CGXUI_THEME}="light"]{${VARS_LIGHT}
}

${WRAP}{
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 0;
  height: 0;
  display: block;
  margin: 0;
  z-index: ${CFG_PM.PANEL_Z};
}
${WRAP}[${ATTR_CGXUI_STATE}~="${DOCK_PM.STATE_DOCK}"]{
  position: relative;
  left: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: auto;
  height: auto;
  z-index: auto;
  display: inline-block;
  margin: 0;
}

${BTNBOX}{
  position: absolute;
  top: 0;
  left: 0;
  z-index: ${CFG_PM.PANEL_Z};
  display: flex;
  align-items: center;
  gap: 6px;
}
${WRAP}[${ATTR_CGXUI_STATE}~="${DOCK_PM.STATE_DOCK}"] ${BTNBOX}{
  position: relative;
  top: auto;
  left: auto;
}

${BTN},
${EXPORT_BTN}{
  width: auto;
  min-width: 50px;
  max-width: none;
  height: 20px;
  min-height: 20px;
  max-height: 20px;
  flex: 0 0 auto;
  flex-shrink: 0;
  align-self: center;
  padding: 0 6px;
  line-height: 20px;
  border-radius: 8px;
  border: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
  background: linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)), var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  opacity: 0.75;
  box-shadow: inset 0 0 1px rgba(255,255,255,0.05), 0 2px 5px rgba(0,0,0,0.30);
  cursor: pointer;
  transition: all 0.2s ease;
}
${BTN}:hover,
${EXPORT_BTN}:hover{
  opacity: 1;
  filter: brightness(1.08);
  box-shadow: 0 0 6px 2px rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.25);
}
${BTN}:active,
${EXPORT_BTN}:active{ transform: scale(0.98); }

${OVERLAY}{
  position: fixed;
  inset: 0;
  backdrop-filter: blur(3px);
  background: rgba(0,0,0,.05);
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s ease;
  z-index: 9998;
}
${OVERLAY}${CLS_OVERLAY_SHOW}{
  opacity: 1;
  pointer-events: auto;
}

${PANEL}{
  position: absolute;
  left: 0;
  bottom: 46px;
  width: min(${CFG_PM.PANEL_W_MAX}px, ${CFG_PM.PANEL_W_VW}vw);
  color: var(--cgxui-${SkID}-text);
  background:
    radial-gradient(circle at 0% 0%, ${CFG_PM.GLASS_TINT_A}, transparent 45%),
    radial-gradient(circle at 100% 100%, ${CFG_PM.GLASS_TINT_B}, transparent 55%),
    linear-gradient(135deg, ${CFG_PM.GLASS_BG_A}, ${CFG_PM.GLASS_BG_B});
  border: 1px solid rgba(255,255,255,.12);
  border-radius: var(--cgxui-${SkID}-radius);
  box-shadow: ${CFG_PM.GLASS_SHADOW};
  filter:none !important;
  backdrop-filter: blur(${CFG_PM.GLASS_BLUR_PX}px) saturate(${CFG_PM.GLASS_SAT}) contrast(${CFG_PM.GLASS_CONTRAST}) brightness(${CFG_PM.GLASS_BRIGHT});
  -webkit-backdrop-filter: blur(${CFG_PM.GLASS_BLUR_PX}px) saturate(${CFG_PM.GLASS_SAT}) contrast(${CFG_PM.GLASS_CONTRAST}) brightness(${CFG_PM.GLASS_BRIGHT});
  padding: 12px;
  max-height: ${Math.round(CFG_PM.PANEL_MAX_H * 100)}vh;
  overflow: auto;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  /* Closed panels must not hold focusable controls in the tab order. The inert
     attribute is applied from script; visibility:hidden is the fallback for
     engines without inert support and is what actually removes the subtree
     from sequential focus navigation. Both are driven by UI_PM_applyPanelState
     so they cannot disagree with the open class. */
  visibility: hidden;
  /* visibility flips only AFTER the fade-out finishes, so adding it does not
     cut the existing close animation; on open it flips immediately. */
  transition: opacity .22s ease, transform .22s ease, visibility 0s linear .22s;
  z-index: ${CFG_PM.PANEL_Z};
}
${PANEL}${CLS_PANEL_OPEN}{
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  visibility: visible;
  transition: opacity .22s ease, transform .22s ease, visibility 0s linear 0s;
}
${WRAP}[${ATTR_CGXUI_STATE}~="${DOCK_PM.STATE_DOCK}"] ${PANEL}{
  left: 0;
  top: calc(100% + 10px);
  bottom: auto;
}
${PANEL}::-webkit-scrollbar{ width: 10px; }
${PANEL}::-webkit-scrollbar-thumb{
  background: rgba(255,255,255,.14);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

${CLS_TOP}{
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  margin-bottom: 10px;
}
${CLS_INPUT}{
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-input);
  color: var(--cgxui-${SkID}-text);
  outline: none;
  transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
}
${CLS_INPUT}::placeholder{ color: var(--cgxui-${SkID}-muted); }
${CLS_INPUT}:focus{
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 45%, var(--cgxui-${SkID}-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cgxui-${SkID}-accent) 25%, transparent);
}

${CLS_BTN}{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  cursor: pointer;
  transition: background .2s ease, transform .06s ease, box-shadow .2s ease;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
}
${CLS_BTN}:hover{ background: var(--cgxui-${SkID}-btn-hover); }
${CLS_BTN}:active{ transform: translateY(1px) scale(.99); }

${CLS_LIST}{ display: grid; gap: 10px; }
${CLS_ITEM}{
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-card);
  border-radius: 10px;
  padding: 6px 10px;
  transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
}
${CLS_ITEM}:hover{
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0,0,0,.25);
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 35%, var(--cgxui-${SkID}-border));
}

${CLS_TITLE}{ font-weight: 700; font-size: 12px; letter-spacing: .2px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
${CLS_TITLE_LEFT}{ display:inline-flex; align-items:center; gap:6px; }
${CLS_PREV}{
  font-size: 10px;
  opacity: .9;
  margin-top: 6px;
  white-space: pre-wrap;
  line-height: 1.4;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 8px;
}

${CLS_STAR}{
  cursor:pointer;
  margin-right:6px;
  font-size:14px;
  user-select:none;
  transition: color .2s ease;
}
${CLS_STAR}${CLS_STAR_ACTIVE}{ color: #fbbf24; }

${CLS_ACTIONS}{
  display:flex !important;
  flex-direction:row !important;
  flex-wrap:wrap;
  justify-content:flex-start;
  align-items:center;
  gap: 8px;
  margin-top: 6px;
  padding: 4px 0;
}

${CLS_CHIP}{
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,0.02);
  color: var(--cgxui-${SkID}-muted);
  font-size: 10px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
${CLS_CHIP}${CLS_CHIP_ACTIVE}{
  background: color-mix(in srgb, var(--cgxui-${SkID}-accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 60%, var(--cgxui-${SkID}-border));
  color: var(--cgxui-${SkID}-text);
}

${CLS_MOVE_BTNS}{ display:inline-flex; align-items:center; gap:6px; }
${CLS_MOVE}{
  width: 22px;
  height: 20px;
  line-height: 18px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-muted);
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
  transition: background .2s ease, transform .06s ease, color .2s ease;
}
${CLS_MOVE}:hover{ background: var(--cgxui-${SkID}-btn-hover); color: var(--cgxui-${SkID}-text); transform: scale(1.05); }
${CLS_MOVE}:active{ transform: translateY(1px); }

${CLS_ITEM}${CLS_MOVED}{
  animation: cgxui_${SkID}_flash .6s ease-out;
}
@keyframes cgxui_${SkID}_flash{
  0%{ background-color: rgba(125,211,252,.1); box-shadow: 0 0 0 0 rgba(125,211,252,.5); }
  100%{ background-color: transparent; box-shadow: 0 0 0 16px rgba(125,211,252,0); }
}

/* Quick tray */
${QUICK_TRAY}{
  display: none;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 0;
  overflow-x: auto;
}
${QUICK_TRAY}${CLS_QUICK_SHOW}{ display:flex; }

${QUICK_TRAY} button{
  height: 20px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(0,0,0,0.03)), var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.52;
  box-shadow: inset 0 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.25);
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease, opacity .12s ease;
}
${QUICK_TRAY} button:hover{ transform: translateY(-1px); opacity: 0.76; box-shadow: 0 0 4px rgba(255,255,255,0.10), 0 2px 4px rgba(0,0,0,0.28); }

${QUICK_DOT}{
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)), var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  font-size: 9px;
  line-height: 1;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 2px;
  box-shadow: inset 0 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.25);
  transition: box-shadow .15s ease, border-color .15s ease, transform .10s ease, filter .15s ease;
}
${QUICK_DOT}${CLS_DOT_SHOW}{ display:flex; }
${QUICK_DOT}${CLS_DOT_SEND}{
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 60%, var(--cgxui-${SkID}-border));
  box-shadow: 0 0 4px rgba(250,204,21,0.8), 0 2px 6px rgba(0,0,0,0.35);
  transform: translateY(-1px);
}

/* Tooltip */
${TOOLTIP}{
  position: fixed;
  z-index: 99999;
  max-width: 400px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--cgxui-${SkID}-card);
  border: 1px solid rgba(255,255,255,.12);
  color: var(--cgxui-${SkID}-text);
  box-shadow: var(--cgxui-${SkID}-shadow);
  font-size: 12px;
  line-height: 1.4;
  display: none;
  white-space: pre-wrap;
}
${TOOLTIP} .cgxui-${SkID}--tip-title{
  font-weight: 600;
  margin-bottom: 4px;
  opacity: .9;
}

@media (prefers-reduced-motion: reduce){
  ${PANEL}, ${OVERLAY}, ${CLS_ITEM}, ${CLS_BTN}, ${CLS_INPUT}{ transition: none; }
}
`.trim();
  };

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS INJECTOR 📝🔓💥 ───────────────────────────── */
  const UI_ensureStyle = () => SAFE_try('UI_ensureStyle', () => {
    let st = D.getElementById(CSS_PM_STYLE_ID);
    const css = CSS_PM_TEXT();
    if (!st) {
      st = D.createElement('style');
      st.id = CSS_PM_STYLE_ID;
      st.setAttribute(ATTR_CGXUI, `${SkID}-style`);
      st.setAttribute(ATTR_CGXUI_OWNER, SkID);
      st.textContent = css;
      D.documentElement.appendChild(st);
      CLEAN_addNode(st);
    } else {
      if (st.textContent !== css) st.textContent = css;
    }
  }, null);

  /* ───────────────────────────── 🟥 ENGINE — Domain Logic 📝🔓💥 ───────────────────────────── */

  /* [ENGINE][ORDER] Slot-preserving movement within the visible subsequence.
   *
   * Pure. Never mutates `list` or any record in it; returns a NEW array, or
   * `null` for "no change" (which callers must treat as a no-op — not as an
   * empty list). Being pure is what lets the caller persist first and commit to
   * in-memory state only on success.
   *
   * The rule: the visible items exchange positions only among the array slots
   * they already occupy. Every filtered-out record keeps its exact absolute
   * index, so reordering under an active search or category filter can no
   * longer relocate hidden prompts.
   *
   *   Global  [A, B, C, D, E]
   *   Visible [B, D]            (a filter is hiding A, C, E)
   *   Move D up ->  [A, D, C, B, E]      (slots 1 and 3 swap; 0/2/4 untouched)
   *
   * Returns null for: unknown/!visible id, first-visible up, last-visible down,
   * fewer than two visible items, and any malformed or duplicated visible-id
   * sequence — a corrupt input is rejected rather than applied.
   */
  const ENGINE_PM_reorderVisible = (list, visibleIdsRaw, id, dir) => {
    if (!Array.isArray(list) || !Array.isArray(visibleIdsRaw)) return null;

    const moveId = (typeof id === 'string') ? id : '';
    const step = (dir === 'up') ? -1 : (dir === 'down') ? 1 : 0;
    if (!moveId || !step) return null;

    // Reject a malformed/duplicated visible sequence outright.
    const visible = [];
    const seen = new Set();
    for (const raw of visibleIdsRaw) {
      if (typeof raw !== 'string' || !raw) return null;
      if (seen.has(raw)) return null;
      seen.add(raw);
      visible.push(raw);
    }
    if (visible.length < 2) return null;

    // Each visible id must resolve to exactly one record; otherwise the rendered
    // view is stale relative to the array and we must not rewrite slots.
    const slots = [];
    for (let i = 0; i < list.length; i += 1) {
      const rid = list[i]?.id;
      if (typeof rid === 'string' && seen.has(rid)) slots.push(i);
    }
    if (slots.length !== visible.length) return null;

    const from = visible.indexOf(moveId);
    if (from === -1) return null;
    const to = from + step;
    if (to < 0 || to >= visible.length) return null;

    const ordered = visible.slice();
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    const byId = new Map();
    for (const slot of slots) byId.set(list[slot].id, list[slot]);

    const next = list.slice();
    slots.forEach((slot, k) => { next[slot] = byId.get(ordered[k]); });
    return next;
  };

  /* [ENGINE][MIGRATE] Draft migration identity.
   *
   * Exactly ONE authoritative identity per source record — the record's ID.
   *
   *   valid non-empty id  → that id IS the identity. Two records with different
   *                         valid ids are DISTINCT even when their text and
   *                         timestamps match; text must never override ids.
   *   no valid id         → a deterministic id derived from normalized text,
   *                         normalized createdAt, and the occurrence ordinal
   *                         among idless source drafts sharing that same
   *                         text+timestamp.
   *
   * The ordinal is what lets two genuinely separate idless records with
   * identical text AND timestamp both survive. The derived id contains no clock
   * reading and no randomness, so a retry recomputes it exactly and recognises
   * the copy made by the previous attempt.
   *
   * The earlier model attached a universal `tx:<text>` key to every record and
   * deduplicated on ANY key match, which silently collapsed distinct drafts
   * that merely shared text. That model is gone. */
  /* [ENGINE][MIGRATE] Reserved createdAt for migrated drafts whose source row
   * carried no usable timestamp.
   *
   * A migrated record must be recognisable on a later retry by comparing its
   * stored fields to the source row. Storing UTIL_now() for a missing timestamp
   * made that impossible — the value differed every attempt — so the retry test
   * used to skip the timestamp comparison whenever the source timestamp was 0.
   * That bypass meant an UNRELATED draft sitting on the generated id with the
   * same text was accepted as the retry copy, and the source row was then
   * dropped from History without ever being preserved.
   *
   * This sentinel closes that hole. It is deterministic, survives JSON
   * round-tripping, and is truthy, so loadDrafts()'s
   * `Number(d?.createdAt) || UTIL_now()` normalization leaves it intact rather
   * than replacing it with the current time. It is RESERVED: no real capture
   * path ever produces a negative createdAt. */
  const PM_MIG_UNKNOWN_CREATED_AT = -1;

  const ENGINE_PM_normDraftText = (v) => String(v ?? '').trim();
  /* Finite-only normalization. `Number(v) || 0` accepted Infinity because
   * Infinity is truthy, and a record stored with `createdAt: Infinity`
   * JSON-serializes to `null`. A retry then re-normalized that null to 0,
   * resolved it to the sentinel, failed to match the stored value, and created
   * a duplicate under the next suffix. Anything non-finite — Infinity,
   * -Infinity, NaN, non-numeric strings, absent/null/empty — normalizes to 0,
   * which the caller resolves to PM_MIG_UNKNOWN_CREATED_AT. Finite values,
   * including decimals, pass through unchanged. */
  const ENGINE_PM_normDraftTs = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const ENGINE_PM_validRecordId = (rec) => {
    const id = (typeof rec?.id === 'string') ? rec.id.trim() : '';
    return id || '';
  };
  // Identity material: timestamp, ordinal, text length and a hash of the text.
  // Length + hash together keep ordinary same-timestamp records apart; the
  // ordinal separates true duplicates of the same text at the same timestamp.
  const ENGINE_PM_migratedDraftId = (text, createdAt, ordinal) => {
    const t = ENGINE_PM_normDraftText(text);
    const ts = ENGINE_PM_normDraftTs(createdAt);
    const n = Number(ordinal) || 0;
    return `pmmig_${ts}_${n}_${t.length}_${UTIL_hash32(t)}`;
  };

  /* [ENGINE][STORE] Bound on quarantine candidate probing. Exhausting it is a
   * diagnostic no-op, never an overwrite. */
  const PM_QUARANTINE_MAX_CANDIDATES = 50;

  /* [ENGINE][STORE] Classified array read. */
  const PM_READ_ABSENT = 'absent';
  const PM_READ_CORRUPT = 'corrupt';
  const PM_READ_VALID = 'valid';

  const ENGINE_PM_readArray = (key) => {
    const rd = UTIL_storage.readRaw(key);
    if (!rd.ok) return { kind: PM_READ_CORRUPT, raw: null, value: [], err: rd.err };
    if (!rd.present) return { kind: PM_READ_ABSENT, raw: null, value: [], err: null };
    let parsed;
    try { parsed = JSON.parse(rd.raw); }
    catch (e) { return { kind: PM_READ_CORRUPT, raw: rd.raw, value: [], err: e }; }
    if (!Array.isArray(parsed)) {
      return { kind: PM_READ_CORRUPT, raw: rd.raw, value: [], err: new Error('stored value is not an array') };
    }
    return { kind: PM_READ_VALID, raw: rd.raw, value: parsed, err: null };
  };

  /* [ENGINE][STORE] Quarantine a malformed value.
   *
   * NEVER touches the primary key: the original bytes stay exactly where they
   * are, so a bad read is recoverable by hand.
   *
   * Deduplicated. A corrupt value is re-read on every boot, so writing a new
   * `<key>.corrupt.<ts>` each time would multiply the same payload across the
   * namespace and consume the very quota that produces write failures. If an
   * existing quarantine entry for this primary key already holds byte-identical
   * data, it is reused and nothing is written.
   *
   * A lookup or copy failure is diagnostic only — the primary key is never
   * modified on any path through this function.
   */
  const ENGINE_PM_quarantine = (key, raw, err) => {
    DIAG.counters.corruptReads += 1;
    STATE_PM.dataError = true;
    UTIL_diagErr(`ENGINE_PM.corruptRead:${key}`, err || 'malformed stored value');
    if (typeof raw !== 'string') return false;

    const prefix = `${key}.corrupt.`;

    // Reuse an existing byte-identical copy if one is already on disk.
    const allKeys = UTIL_storage.keys();
    if (allKeys === null) {
      UTIL_diagErr('ENGINE_PM.quarantineScan', `could not enumerate keys for ${prefix}`);
    } else {
      for (const k of allKeys) {
        if (!k.startsWith(prefix)) continue;
        if (UTIL_storage.getStr(k, null) === raw) return true; // already quarantined
      }
    }

    /* Explicit candidate selection. The key is timestamped to the millisecond,
     * so two DISTINCT corrupt payloads quarantined inside the same millisecond
     * resolve to the same base key. Reaching this point already proves no
     * byte-identical copy exists, so any occupied candidate holds DIFFERENT
     * bytes and must never be written over.
     *
     * Each candidate is generated, then read, and is used only when that read
     * both succeeds and reports present:false. setStr() is never called on an
     * occupied — or unprovable — candidate. An earlier bounded loop tested the
     * candidate before incrementing and so could fall out of the loop still
     * holding the occupied final suffix; selection now proves freedom first.
     *
     * If the bounded space is exhausted, nothing is written: no existing
     * quarantine entry changes and the primary key is untouched. */
    const base = `${prefix}${UTIL_now()}`; // one reading; all candidates share it
    let qKey = '';
    for (let n = 1; n <= PM_QUARANTINE_MAX_CANDIDATES; n += 1) {
      const candidate = (n === 1) ? base : `${base}.${n}`;
      const probe = UTIL_storage.readRaw(candidate);
      if (!probe.ok) {
        UTIL_diagErr('ENGINE_PM.quarantineProbe',
          `could not read candidate ${candidate}; refusing to write unproven slot`);
        return false;
      }
      if (!probe.present) { qKey = candidate; break; }
    }

    if (!qKey) {
      UTIL_diagErr('ENGINE_PM.quarantineExhausted',
        `no free quarantine slot for ${key} after ${PM_QUARANTINE_MAX_CANDIDATES} candidates; `
        + 'nothing written, existing copies and the primary key are untouched');
      return false;
    }

    const ok = UTIL_storage.setStr(qKey, raw);
    if (!ok) UTIL_diagErr('ENGINE_PM.quarantineFailed', `could not write ${qKey}`);
    return ok;
  };

  /* [ENGINE][STORE] Shared strict reader for the three capture stores.
   *
   * History, Drafts and Pasted previously read through
   * `UTIL_storage.getJSON(key, [])`, which collapses "key absent", "malformed
   * JSON" and "parsed non-array" into the same empty array. Automatic capture
   * then wrote a fresh one-item collection straight over the malformed bytes.
   *
   * Returns { ok, list }:
   *   { ok:true,  list:[]    } key genuinely absent
   *   { ok:true,  list:[...] } valid array (caller applies compatible normalization)
   *   { ok:false, list:[]    } malformed JSON or parsed non-array
   *
   * On corrupt input the primary key is left byte-identical, the approved
   * deduplicated quarantine mechanism runs (which sets dataError and records
   * diagnostics), and failure is reported. The quarantine implementation itself
   * is untouched. */
  /* [ENGINE][CAPTURE] Exact occurrence snapshot for a capture record.
   *
   * Identity for a rendered card is the WHOLE record, not its id: ids are not
   * unique across History/Drafts/Pasted, so an id-only check let a different
   * record occupy the rendered index and pass verification. Normalized through
   * the same helpers the stores use, so a snapshot round-trips exactly. */
  const ENGINE_PM_captureSnapshot = (rec) => ({
    id: String(rec?.id ?? ''),
    text: ENGINE_PM_normDraftText(rec?.text),
    createdAt: ENGINE_PM_normDraftTs(rec?.createdAt),
    source: String(rec?.source ?? '').toLowerCase(),
  });

  /* [ENGINE][CAPTURE] Verify a rendered card against the CURRENT full
   * collection. Pure, and shared by all three capture stores.
   *
   * Returns the live record only when the recorded index still holds a record
   * matching the complete rendered snapshot — id, normalized text, normalized
   * finite createdAt and source — and (when supplied) the expected source.
   * Otherwise null, and the caller must abort and rerender rather than guess.
   *
   * Comparison is on the exact normalized fields. No hash is used as the
   * comparison authority: earlier audits proved 32-bit collisions are real.
   * When two records are byte-equivalent across these fields either occurrence
   * is semantically equivalent, and the verified index still guarantees that a
   * deletion removes exactly one of them. */
  const ENGINE_PM_verifyCaptureOccurrence = (list, fullIndex, snapshot, expectedSource) => {
    if (!Array.isArray(list)) return null;
    if (!snapshot || typeof snapshot !== 'object') return null;

    const i = Number(fullIndex);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) return null;

    const rec = list[i];
    if (!rec) return null;

    const cur = ENGINE_PM_captureSnapshot(rec);
    const want = ENGINE_PM_captureSnapshot(snapshot);

    if (expectedSource && cur.source !== String(expectedSource).toLowerCase()) return null;
    if (cur.id !== want.id) return null;
    if (cur.text !== want.text) return null;
    if (cur.createdAt !== want.createdAt) return null;
    if (cur.source !== want.source) return null;
    return rec;
  };

  /* Parse a snapshot serialized into a card's data attribute. */
  const ENGINE_PM_parseSnapshot = (raw) => {
    try {
      const o = JSON.parse(String(raw ?? ''));
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
    } catch { return null; }
  };

  const ENGINE_PM_readCaptureStore = (key) => {
    const rd = ENGINE_PM_readArray(key);
    if (rd.kind === PM_READ_CORRUPT) {
      ENGINE_PM_quarantine(key, rd.raw, rd.err);
      return { ok: false, list: [] };
    }
    return { ok: true, list: rd.value };
  };

  /* [ENGINE][STORE] Record a failed write uniformly. */
  const ENGINE_PM_noteWriteFailure = (where) => {
    DIAG.counters.writeFailures += 1;
    STATE_PM.dataError = true;
    UTIL_diagErr(where, 'localStorage write failed');
    return false;
  };

  const ENGINE_PM = {
    /* [MIGRATE] Legacy `ho:pm:*` keys → namespaced keys. Non-destructive.
     *
     * Presence is `getItem(key) !== null`, so '' counts as PRESENT. The previous
     * implementation treated '' as absent and copied a legacy value over it,
     * destroying the one artefact the safe loader would otherwise quarantine.
     * It also deleted the legacy key unconditionally — including when the
     * destination write had failed — losing the only remaining copy.
     *
     * Per pair, exactly one terminal state is acceptable:
     *   destination present            → never overwritten; legacy RETAINED as a
     *                                    recovery copy (safer than deleting it,
     *                                    and explicitly permitted)
     *   destination + legacy absent    → nothing to copy
     *   destination absent, legacy present → write, read back, require byte
     *                                    equality, and only then delete legacy
     *
     * Any failure leaves the legacy key untouched and the marker unset, so the
     * next boot retries. Returns true only when every pair reached a terminal
     * state AND the marker was persisted. */
    migrateKeysOnce() {
      return SAFE_try('ENGINE_PM.migrateKeysOnce', () => {
        if (UTIL_storage.getStr(KEY_PM_MIG_KEYS_V1, '0') === '1') return true;

        const pairs = [
          [KEY_PM_STATE_PROMPTS_V1, KEY_LEG_PROMPTS],
          [KEY_PM_CFG_AUTOSEND_V1, KEY_LEG_AUTOSEND],
          [KEY_PM_STATE_LAST_USED_V1, KEY_LEG_LAST_USED],
          [KEY_PM_STATE_QUICK_V1, KEY_LEG_QUICK],
          [KEY_PM_STATE_HISTORY_V1, KEY_LEG_HISTORY],
          [KEY_PM_UI_MODE_V1, KEY_LEG_MODE],
        ];

        let allTerminal = true;

        for (const [kNew, kOld] of pairs) {
          const dst = UTIL_storage.readRaw(kNew);
          if (!dst.ok) {
            STATE_PM.dataError = true;
            UTIL_diagErr('ENGINE_PM.migrateKeysOnce.readDest', `unreadable destination ${kNew}`);
            allTerminal = false;
            continue;
          }

          // Destination present — including '' and any malformed string. Never
          // overwritten, and a differing legacy value is never deleted.
          if (dst.present) continue;

          const src = UTIL_storage.readRaw(kOld);
          if (!src.ok) {
            STATE_PM.dataError = true;
            UTIL_diagErr('ENGINE_PM.migrateKeysOnce.readLegacy', `unreadable legacy ${kOld}`);
            allTerminal = false;
            continue;
          }
          if (!src.present) continue; // nothing to copy — terminal

          // Verified copy: write → read back → require byte equality.
          if (!UTIL_storage.setStr(kNew, src.raw)) {
            ENGINE_PM_noteWriteFailure(`ENGINE_PM.migrateKeysOnce.write:${kNew}`);
            allTerminal = false;
            continue; // legacy untouched
          }
          const back = UTIL_storage.readRaw(kNew);
          if (!back.ok || !back.present || back.raw !== src.raw) {
            STATE_PM.dataError = true;
            UTIL_diagErr('ENGINE_PM.migrateKeysOnce.verify',
              `read-back mismatch for ${kNew}; legacy ${kOld} retained`);
            allTerminal = false;
            continue; // legacy untouched
          }

          UTIL_storage.del(kOld); // only after verified persistence
        }

        if (!allTerminal) return false; // marker stays unset → retry next boot

        if (!UTIL_storage.setStr(KEY_PM_MIG_KEYS_V1, '1')) {
          ENGINE_PM_noteWriteFailure('ENGINE_PM.migrateKeysOnce.marker');
          return false; // source data already safe; retry is harmless
        }
        return true;
      }, false);
    },

    /* [MIGRATE] Move `source:'draft'` rows out of History into Drafts.
     *
     * Lossless and retry-safe. The previous implementation wrote Drafts and the
     * filtered History without checking either result, then set the marker
     * unconditionally — so a failed Drafts write still stripped those rows from
     * History and declared the migration done, destroying them. It also read
     * History through getJSON(..., []), which turns a malformed value into an
     * empty array and would then persist that emptiness over the real bytes.
     *
     * Ordering (each step gated on the previous one):
     *   1. read History and Drafts WITHOUT modifying either; fail closed if
     *      either is present-but-malformed
     *   2. compute the candidate Drafts and the candidate filtered History
     *   3. persist Drafts first
     *   4. persist filtered History only if Drafts succeeded
     *   5. write the marker only if BOTH writes succeeded
     *
     * Any failure returns false with the marker unset. A retry cannot duplicate
     * already-copied rows because candidates are deduplicated against whatever
     * Drafts currently holds. */
    migrateDraftsFromHistoryOnce() {
      return SAFE_try('ENGINE_PM.migrateDraftsFromHistoryOnce', () => {
        if (UTIL_storage.getStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '0') === '1') return true;

        // 1. Fail closed on malformed source data — never rewrite it to [].
        const histRd = ENGINE_PM_readArray(KEY_PM_STATE_HISTORY_V1);
        if (histRd.kind === PM_READ_CORRUPT) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.history',
            'History is present but malformed — migration deferred, bytes untouched');
          return false;
        }
        const draftRd = ENGINE_PM_readArray(KEY_PM_STATE_DRAFTS_V1);
        if (draftRd.kind === PM_READ_CORRUPT) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.drafts',
            'Drafts is present but malformed — migration deferred, bytes untouched');
          return false;
        }

        const hist = histRd.value;
        const drafts = draftRd.value.slice();

        /* Retry-safe dedup keyed on the ONE authoritative identity: the record
         * id. Existing drafts contribute their valid ids; a source row supplies
         * either its own valid id or a deterministic derived one. Text is never
         * an identity on its own, so distinct records that merely share text are
         * preserved.
         *
         * Note: an existing draft carrying no valid id cannot be matched by
         * identity. Such rows are never removed — they are simply not dedup
         * targets. (Only a migration left half-finished by the pre-correction
         * code could produce one, since that path assigned random ids.) */
        // id -> record, so a candidate collision can be inspected rather than
        // merely detected. Records without a valid id are not dedup targets.
        const existingById = new Map();
        for (const d of drafts) {
          const id = ENGINE_PM_validRecordId(d);
          if (id) existingById.set(id, d);
        }

        /* Bound on deterministic collision suffixes. DRAFTS_MAX + 1 exceeds the
         * number of records the store can hold, so exhausting it means the
         * candidate space is genuinely unusable rather than merely crowded. */
        const MAX_ID_CANDIDATES = (Number(CFG_PM.DRAFTS_MAX) || 50) + 1;

        // 2. Build both candidates.
        const keep = [];
        /* ONE monotonic ordinal across every idless draft row, in source order.
         * A bucket-local ordinal restarted at 0 for each distinct text, so two
         * different rows of equal length whose text hashes collided derived the
         * SAME id and the second was silently dropped as "already migrated"
         * (e.g. '7QjG3tiYE8' and 'KNjz6XA4ov' both hash to 5f9d7f26). The global
         * ordinal makes row uniqueness structural; the hash is now only
         * descriptive material. It advances for EVERY idless row, migrated or
         * not, so a retry over the byte-identical source assigns identical
         * ordinals. */
        let idlessOrdinal = 0;
        let handled = 0;
        let identityExhausted = '';
        let validIdCollision = '';

        for (const it of hist) {
          const source = String(it?.source || '').toLowerCase();
          const text = ENGINE_PM_normDraftText(it?.text);
          if (!text) continue; // unchanged: empty rows were already dropped
          if (source === 'draft') {
            handled += 1;

            /* Two distinct timestamps, deliberately:
             *   sourceTs — the normalized source value (0 when missing). Feeds
             *              the generated id, so the id format and the global
             *              ordinal are unchanged.
             *   storedTs — what the migrated record actually carries. A missing
             *              timestamp becomes the reserved sentinel instead of
             *              UTIL_now(), so the stored value is DETERMINISTIC and
             *              a later retry can compare against it. The migration
             *              never reads the clock for either record shape. */
            const sourceTs = ENGINE_PM_normDraftTs(it?.createdAt);
            const storedTs = (sourceTs !== 0) ? sourceTs : PM_MIG_UNKNOWN_CREATED_AT;

            /* Content comparator, shared by both identity paths. An occupant is
             * the already-migrated copy of THIS row only when its normalized
             * text and its deterministic stored timestamp both match. */
            const isRetryCopy = (rec) => {
              if (!rec) return false;
              if (ENGINE_PM_normDraftText(rec.text) !== text) return false;
              if (ENGINE_PM_normDraftTs(rec.createdAt) !== storedTs) return false;
              return true;
            };

            /* A valid source id stays authoritative — but an existing record
             * already holding that id is no longer accepted blindly. Accepting
             * it discarded the source row whenever the two differed. A valid id
             * is never silently suffixed in this phase: on a genuine collision
             * the migration fails closed and both stores are preserved intact
             * for the owner to resolve. */
            const ownId = ENGINE_PM_validRecordId(it);
            if (ownId) {
              const occupant = existingById.get(ownId);
              if (occupant) {
                if (isRetryCopy(occupant)) continue; // idempotent retry
                validIdCollision = ownId;
                break; // fail closed, before any collection is written
              }
              const ownRec = { id: ownId, text, createdAt: storedTs };
              existingById.set(ownId, ownRec);
              drafts.push(ownRec);
              continue;
            }

            /* Idless row: derive a deterministic base, then resolve collisions
             * against records that already occupy that id.
             *
             * An occupied candidate counts as a retry copy ONLY when its
             * content matches this source row — text AND timestamp, always.
             * The former `ts !== 0` bypass skipped the timestamp check for a
             * source row with no usable timestamp, which let an UNRELATED
             * record with the same text be accepted as the retry copy and the
             * source row silently dropped. Comparing against storedTs makes the
             * check total: a genuine retry copy carries the sentinel, anything
             * else does not and is skipped over to a deterministic suffix. */
            const ordinal = idlessOrdinal;
            idlessOrdinal += 1;
            const base = ENGINE_PM_migratedDraftId(text, sourceTs, ordinal);

            let chosen = '';
            let alreadyMigrated = false;
            for (let n = 1; n <= MAX_ID_CANDIDATES; n += 1) {
              const candidate = (n === 1) ? base : `${base}.${n}`;
              const occupant = existingById.get(candidate);
              if (!occupant) { chosen = candidate; break; }  // proven unused
              if (isRetryCopy(occupant)) { alreadyMigrated = true; break; }
              // occupied by a DIFFERENT record — keep looking
            }

            if (alreadyMigrated) continue;
            if (!chosen) {
              identityExhausted = base;
              break; // fail closed, before any collection is written
            }

            const rec = { id: chosen, text, createdAt: storedTs };
            existingById.set(chosen, rec);
            drafts.push(rec);
            continue;
          }
          keep.push(it);
        }

        if (validIdCollision) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.validIdCollision',
            `draft id ${validIdCollision} is already held by a record with different content; `
            + 'nothing written, History and Drafts left byte-identical, migration deferred');
          return false;
        }

        if (identityExhausted) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.identityExhausted',
            `no free draft id after ${MAX_ID_CANDIDATES} candidates from ${identityExhausted}; `
            + 'nothing written, History and Drafts left byte-identical, migration deferred');
          return false;
        }

        // Nothing to move and nothing to drop → no writes, just record completion.
        const historyUnchanged = (handled === 0 && keep.length === hist.length);
        const draftsUnchanged = (drafts.length === draftRd.value.length);

        let nextDrafts = drafts;
        if (nextDrafts.length > CFG_PM.DRAFTS_MAX) {
          nextDrafts = nextDrafts.slice(nextDrafts.length - CFG_PM.DRAFTS_MAX);
        }

        // 3. Drafts FIRST. On failure History is left byte-for-byte untouched.
        if (!(draftsUnchanged && historyUnchanged)) {
          if (!ENGINE_PM.saveDrafts(nextDrafts)) {
            UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.saveDrafts',
              'Drafts write failed — History left untouched, migration deferred');
            return false;
          }

          // 4. Filtered History only after Drafts is safely stored. If this
          //    fails the original History survives; the retry dedups.
          if (!historyUnchanged && !ENGINE_PM.saveHistory(keep)) {
            UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.saveHistory',
              'History write failed after Drafts succeeded — original History retained, '
              + 'migration deferred; retry is idempotent');
            return false;
          }
        }

        // 5. Marker only once both collections are safe.
        if (!UTIL_storage.setStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '1')) {
          ENGINE_PM_noteWriteFailure('ENGINE_PM.migrateDraftsFromHistoryOnce.marker');
          return false; // migrated data is already safe; retry is idempotent
        }
        return true;
      }, false);
    },

    defaultPromptsSeed() {
      const now = UTIL_now();
      return [
        { id: UTIL_cryptoId(), title: 'G: (grammar only)', body: 'G:', favorite: true, type: 'append', createdAt: now, updatedAt: now },
        { id: UTIL_cryptoId(), title: 'Deep Dive', body: 'Give a structured deep dive on this topic…', favorite: false, type: 'prompt', createdAt: now, updatedAt: now },
      ];
    },

    /* [SEED] One-time seed state, independent per collection. */
    loadSeedState() {
      return SAFE_try('ENGINE_PM.loadSeedState', () => {
        const raw = UTIL_storage.getJSON(KEY_PM_STATE_SEEDED_V1, null);
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        return { prompts: o.prompts === true, quickReplies: o.quickReplies === true };
      }, { prompts: false, quickReplies: false });
    },
    markSeeded(field) {
      return SAFE_try('ENGINE_PM.markSeeded', () => {
        const cur = ENGINE_PM.loadSeedState();
        cur[field] = true;
        if (!UTIL_storage.setJSON(KEY_PM_STATE_SEEDED_V1, cur)) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.markSeeded');
        }
        return true;
      }, false);
    },

    loadPrompts() {
      return SAFE_try('ENGINE_PM.loadPrompts', () => {
        const rd = ENGINE_PM_readArray(KEY_PM_STATE_PROMPTS_V1);

        // Malformed: preserve the original bytes, quarantine a copy, hand back
        // an empty list. The primary key is never written on this path.
        if (rd.kind === PM_READ_CORRUPT) {
          ENGINE_PM_quarantine(KEY_PM_STATE_PROMPTS_V1, rd.raw, rd.err);
          return [];
        }

        // Absent: seed at most once, ever.
        if (rd.kind === PM_READ_ABSENT) {
          if (ENGINE_PM.loadSeedState().prompts) return [];
          const seeded = ENGINE_PM.defaultPromptsSeed();
          if (!UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, seeded)) {
            ENGINE_PM_noteWriteFailure('ENGINE_PM.loadPrompts.seedWrite');
            return []; // never report a seed that was not persisted
          }
          DIAG.counters.seeds += 1;
          ENGINE_PM.markSeeded('prompts');
          return seeded;
        }

        // Valid — including a legitimately empty list, which is never reseeded.
        const arr = rd.value;
        let changed = false;
        for (const p of arr) {
          if (!p || typeof p !== 'object') continue;
          if (!p.type) { p.type = 'prompt'; changed = true; }
          if (!p.createdAt) { p.createdAt = UTIL_now(); changed = true; }
          if (!p.updatedAt) { p.updatedAt = UTIL_now(); changed = true; }
        }
        if (changed && !UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, arr)) {
          ENGINE_PM_noteWriteFailure('ENGINE_PM.loadPrompts.normalizeWrite');
        }
        return arr;
      }, []);
    },

    /* [STORE] Raw persistence — writes bytes only.
     * Never adopts state and never emits. Kept separate from the commit path so
     * that state adoption always precedes event publication. */
    persistPrompts(list) {
      return SAFE_try('ENGINE_PM.persistPrompts', () => {
        const next = Array.isArray(list) ? list : [];
        if (!UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, next)) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.persistPrompts');
        }
        return true;
      }, false);
    },
    persistQuick(list) {
      return SAFE_try('ENGINE_PM.persistQuick', () => {
        const next = Array.isArray(list) ? list : [];
        if (!UTIL_storage.setJSON(KEY_PM_STATE_QUICK_V1, next)) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.persistQuick');
        }
        return true;
      }, false);
    },

    /* [STORE] Commit — the single ordering that callers and listeners rely on:
     *
     *   1. persist the candidate
     *   2. adopt it as the authoritative in-memory array
     *   3. emit canonical + legacy changed events
     *   4. report success
     *
     * A synchronous `changed` listener therefore always observes the NEW array
     * on STATE_PM.data.*, never the array it is replacing. A failed write stops
     * at step 1: nothing is adopted and no event is emitted, so the previous
     * authoritative state survives untouched (callers build candidates without
     * mutating the live array or its records, so this holds by construction).
     *
     * savePrompts/saveQuick are the public spelling of this same commit; they
     * are NOT raw writes. Use persist* when bytes-only is genuinely intended. */
    savePrompts(list) {
      return SAFE_try('ENGINE_PM.savePrompts', () => {
        const next = Array.isArray(list) ? list : [];
        if (!ENGINE_PM.persistPrompts(next)) return false;
        STATE_PM.data.prompts = next;              // adopt BEFORE publishing
        UTIL_emitPmChanged({ what: 'prompts' });
        return true;
      }, false);
    },
    commitPrompts(nextList) {
      if (!Array.isArray(nextList)) return false;
      return ENGINE_PM.savePrompts(nextList);
    },
    commitQuick(nextList) {
      if (!Array.isArray(nextList)) return false;
      return ENGINE_PM.saveQuick(nextList);
    },

    getAutoSend() {
      return UTIL_storage.getStr(KEY_PM_CFG_AUTOSEND_V1, '0') === '1';
    },
    setAutoSend(on) {
      UTIL_storage.setStr(KEY_PM_CFG_AUTOSEND_V1, on ? '1' : '0');
      UTIL_emitPmChanged({ what: 'autosend', on: !!on });
    },

    /* True once migrateDraftsFromHistoryOnce() has safely copied every
     * draft-source row into Drafts. Until then those rows are the ONLY copy. */
    draftsMigrationComplete() {
      return UTIL_storage.getStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '0') === '1';
    },

    /* Loads the FULL History collection.
     *
     * While the drafts migration is incomplete, `source: 'draft'` rows are the
     * only copy of that text anywhere. This routine used to drop them, flag the
     * collection changed and write the filtered array straight back — so a
     * single ordinary read after a safely deferred migration destroyed exactly
     * the data the deferral was protecting. Now they are carried through
     * VERBATIM (not even re-id'd or re-timestamped) so the migration's
     * deterministic identity derivation stays stable across attempts, and so any
     * normalization write still contains them.
     *
     * Callers that display sent history must filter `source: 'draft'` for
     * DISPLAY ONLY — the returned collection is what save paths write back, and
     * dropping rows from it is what caused the loss. */
    /* Strict read: { ok, list }. ok === false means the caller must NOT treat
     * `list` as authoritative — either the stored value was corrupt (list is
     * empty, primary bytes preserved and quarantined) or a required
     * normalization write failed. Mutations must abort on !ok; UI reads may
     * still render `list`. */
    loadHistoryStrict() {
      return SAFE_try('ENGINE_PM.loadHistoryStrict', () => {
        const rd = ENGINE_PM_readCaptureStore(KEY_PM_STATE_HISTORY_V1);
        if (!rd.ok) return { ok: false, list: [] };
        const arr = rd.list;
        const migDone = ENGINE_PM.draftsMigrationComplete();
        let changed = false;
        const out = [];
        for (const h of arr) {
          const text = String(h?.text || '').trim();
          if (!text) { changed = true; continue; }
          const source = String(h?.source || '').toLowerCase();
          if (source === 'draft') {
            // Migration complete ⇒ the Drafts copy is proven, so a stale row is
            // cleanup. Incomplete ⇒ preserve verbatim; this is the only copy.
            if (migDone) { changed = true; continue; }
            out.push(h);
            continue;
          }
          const id = String(h?.id || UTIL_cryptoId());
          // Finite-only normalization: a non-finite value would otherwise
          // serialize to null on the normalization write.
          const createdAt = ENGINE_PM_normDraftTs(h?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt, source: 'send' });
          if (h?.id !== id || h?.createdAt !== createdAt || h?.source !== 'send' || h?.text !== text) changed = true;
        }

        /* Retention trimming drops the OLDEST entry. While the migration is
         * incomplete a pending draft must never be the one dropped, so trimming
         * removes the oldest non-draft row instead and stops if only pending
         * drafts remain. */
        const dropOldest = () => {
          if (migDone) { out.shift(); return true; }
          const i = out.findIndex(r => String(r?.source || '').toLowerCase() !== 'draft');
          if (i === -1) return false;
          out.splice(i, 1);
          return true;
        };

        while (out.length > CFG_PM.HISTORY_MAX) {
          if (!dropOldest()) break;
          changed = true;
        }
        // Byte-level cap: trim oldest entries until serialised size is within budget
        let byteLen = JSON.stringify(out).length;
        while (byteLen > CFG_PM.HISTORY_BYTE_CAP && out.length > 1) {
          if (!dropOldest()) break;
          changed = true;
          byteLen = JSON.stringify(out).length;
        }
        // Normalization must go through the truthful save function; a failed
        // write means the normalized shape is NOT authoritative.
        if (changed && !ENGINE_PM.saveHistory(out)) return { ok: false, list: out };
        return { ok: true, list: out };
      }, { ok: false, list: [] });
    },

    // UI/back-compat view. Callers that mutate must use loadHistoryStrict().
    loadHistory() { return ENGINE_PM.loadHistoryStrict().list; },

    /* Visible sent entries paired with their FULL-collection index.
     *
     * Cards must be addressed by occurrence, not by id alone: a hidden pending
     * draft can carry the same id as a visible sent row, and two sent rows can
     * share an id, so an id-only lookup can resolve — or delete — the wrong
     * record. Each entry is { item, fullIndex } against the full collection. */
    sentHistoryEntries() {
      const list = ENGINE_PM.loadHistory();
      const out = [];
      list.forEach((item, fullIndex) => {
        if (String(item?.source || '').toLowerCase() === 'send') {
          out.push({ item, fullIndex, snapshot: ENGINE_PM_captureSnapshot(item) });
        }
      });
      return out;
    },

    /* Occurrence entries for a capture collection. Derived from the FULL
     * normalized collection BEFORE any sort or filter, so each entry keeps its
     * original full index; sorting/filtering the entries afterwards cannot
     * disturb it. Used by Drafts and Pasted, which are id-addressed today and
     * can legitimately hold two rows sharing an id. */
    captureEntries(list) {
      const out = [];
      (Array.isArray(list) ? list : []).forEach((item, fullIndex) => {
        out.push({ item, fullIndex, snapshot: ENGINE_PM_captureSnapshot(item) });
      });
      return out;
    },

    /* Sent-only view of History, for rendering. Display-only: never write this
     * back, or pending drafts are lost. */
    loadHistorySent() {
      return ENGINE_PM.loadHistory().filter(
        (h) => String(h?.source || '').toLowerCase() !== 'draft',
      );
    },
    saveHistory(list) {
      return SAFE_try('ENGINE_PM.saveHistory', () => {
        if (!UTIL_storage.setJSON(KEY_PM_STATE_HISTORY_V1, Array.isArray(list) ? list : [])) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.saveHistory');
        }
        return true;
      }, false);
    },
    // Returns true when the store ends in the intended state — including the
    // deliberate empty/duplicate skips. False means a write was attempted and
    // failed.
    pushHistory(text) {
      return SAFE_try('ENGINE_PM.pushHistory', () => {
        const clean = String(text || '').trim();
        if (!clean) return true;

        // Strict read: a corrupt (or unpersistable) collection must abort the
        // capture, never be replaced by a fresh one-item array.
        const rd = ENGINE_PM.loadHistoryStrict();
        if (!rd.ok) {
          UTIL_diagErr('ENGINE_PM.pushHistory.strictRead',
            'History is not authoritative — capture aborted, primary bytes preserved');
          return false;
        }
        // Full collection — pending drafts included, so this save preserves them.
        let hist = rd.list;

        /* Dedup against the most recent SENT record. The final element is not
         * necessarily a sent one: while the drafts migration is deferred a
         * pending draft can sit at the tail, and comparing against it would
         * both miss a real duplicate and let a draft's text suppress a genuine
         * send. */
        let lastSent = null;
        for (let i = hist.length - 1; i >= 0; i -= 1) {
          if (String(hist[i]?.source || '').toLowerCase() === 'send') { lastSent = hist[i]; break; }
        }
        if (lastSent && lastSent.text === clean) return true;

        hist.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now(), source: 'send' });
        // Trim the oldest SENT rows only; a pending draft is the only copy.
        if (hist.length > CFG_PM.HISTORY_MAX) {
          const keepDrafts = !ENGINE_PM.draftsMigrationComplete();
          while (hist.length > CFG_PM.HISTORY_MAX) {
            const i = keepDrafts
              ? hist.findIndex(r => String(r?.source || '').toLowerCase() !== 'draft')
              : 0;
            if (i === -1) break;
            hist.splice(i, 1);
          }
        }

        const ok = ENGINE_PM.saveHistory(hist);
        if (ok) UTIL_diagStep(`[HIST][${MODTAG}] capture`, `send:${clean.length}`);
        return ok;
      }, false);
    },

    /* Strict read: { ok, list }. See loadHistoryStrict for the contract. */
    loadDraftsStrict() {
      return SAFE_try('ENGINE_PM.loadDraftsStrict', () => {
        const rd = ENGINE_PM_readCaptureStore(KEY_PM_STATE_DRAFTS_V1);
        if (!rd.ok) return { ok: false, list: [] };
        let changed = false;
        const out = [];
        for (const d of rd.list) {
          const text = String(d?.text || '').trim();
          if (!text) { changed = true; continue; }
          const id = String(d?.id || UTIL_cryptoId());
          // Finite-only: the reserved sentinel (-1) is finite and survives;
          // a non-finite value would otherwise serialize to null.
          const createdAt = ENGINE_PM_normDraftTs(d?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt });
          if (d?.id !== id || d?.createdAt !== createdAt || d?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.DRAFTS_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.DRAFTS_MAX);
        }
        let byteLen = JSON.stringify(out).length;
        while (byteLen > CFG_PM.DRAFTS_BYTE_CAP && out.length > 1) {
          out.shift(); changed = true;
          byteLen = JSON.stringify(out).length;
        }
        if (changed && !ENGINE_PM.saveDrafts(out)) return { ok: false, list: out };
        return { ok: true, list: out };
      }, { ok: false, list: [] });
    },
    // UI/back-compat view. Callers that mutate must use loadDraftsStrict().
    loadDrafts() { return ENGINE_PM.loadDraftsStrict().list; },
    saveDrafts(list) {
      return SAFE_try('ENGINE_PM.saveDrafts', () => {
        if (!UTIL_storage.setJSON(KEY_PM_STATE_DRAFTS_V1, Array.isArray(list) ? list : [])) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.saveDrafts');
        }
        return true;
      }, false);
    },
    pushDraft(text) {
      return SAFE_try('ENGINE_PM.pushDraft', () => {
        const clean = String(text || '').trim();
        if (!clean) return true;
        const rd = ENGINE_PM.loadDraftsStrict();
        if (!rd.ok) {
          UTIL_diagErr('ENGINE_PM.pushDraft.strictRead',
            'Drafts is not authoritative — capture aborted, primary bytes preserved');
          return false;
        }
        let drafts = rd.list;
        const last = drafts[drafts.length - 1];
        if (last && last.text === clean) return true;
        drafts.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now() });
        if (drafts.length > CFG_PM.DRAFTS_MAX) drafts = drafts.slice(drafts.length - CFG_PM.DRAFTS_MAX);
        const ok = ENGINE_PM.saveDrafts(drafts);
        if (ok) UTIL_diagStep(`[DRF][${MODTAG}] capture`, `${clean.length}`);
        return ok;
      }, false);
    },

    /* Strict read: { ok, list }. See loadHistoryStrict for the contract. */
    loadPastedStrict() {
      return SAFE_try('ENGINE_PM.loadPastedStrict', () => {
        const rd = ENGINE_PM_readCaptureStore(KEY_PM_STATE_PASTED_V1);
        if (!rd.ok) return { ok: false, list: [] };
        let changed = false;
        const out = [];
        for (const p of rd.list) {
          const text = String(p?.text || '').trim();
          if (!text) { changed = true; continue; }
          const id = String(p?.id || UTIL_cryptoId());
          const createdAt = ENGINE_PM_normDraftTs(p?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt });
          if (p?.id !== id || p?.createdAt !== createdAt || p?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.PASTED_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.PASTED_MAX);
        }
        let byteLen = JSON.stringify(out).length;
        while (byteLen > CFG_PM.PASTED_BYTE_CAP && out.length > 1) {
          out.shift(); changed = true;
          byteLen = JSON.stringify(out).length;
        }
        if (changed && !ENGINE_PM.savePasted(out)) return { ok: false, list: out };
        return { ok: true, list: out };
      }, { ok: false, list: [] });
    },
    // UI/back-compat view. Callers that mutate must use loadPastedStrict().
    loadPasted() { return ENGINE_PM.loadPastedStrict().list; },
    savePasted(list) {
      return SAFE_try('ENGINE_PM.savePasted', () => {
        if (!UTIL_storage.setJSON(KEY_PM_STATE_PASTED_V1, Array.isArray(list) ? list : [])) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.savePasted');
        }
        return true;
      }, false);
    },
    pushPasted(text) {
      return SAFE_try('ENGINE_PM.pushPasted', () => {
        const clean = String(text || '').trim();
        if (!clean) return true;
        const rd = ENGINE_PM.loadPastedStrict();
        if (!rd.ok) {
          UTIL_diagErr('ENGINE_PM.pushPasted.strictRead',
            'Pasted is not authoritative — capture aborted, primary bytes preserved');
          return false;
        }
        let pasted = rd.list;
        const last = pasted[pasted.length - 1];
        if (last && last.text === clean) return true;
        pasted.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now() });
        if (pasted.length > CFG_PM.PASTED_MAX) pasted = pasted.slice(pasted.length - CFG_PM.PASTED_MAX);
        const ok = ENGINE_PM.savePasted(pasted);
        if (ok) UTIL_diagStep(`[PST][${MODTAG}] capture`, `${clean.length}`);
        return ok;
      }, false);
    },

    defaultQuickSeed() {
      const now = UTIL_now();
      return ['Yes', 'No', 'Continue', 'Next'].map((text, idx) => ({
        id: UTIL_cryptoId(), text, order: idx, createdAt: now, updatedAt: now,
      }));
    },

    loadQuick() {
      return SAFE_try('ENGINE_PM.loadQuick', () => {
        const rd = ENGINE_PM_readArray(KEY_PM_STATE_QUICK_V1);

        if (rd.kind === PM_READ_CORRUPT) {
          ENGINE_PM_quarantine(KEY_PM_STATE_QUICK_V1, rd.raw, rd.err);
          return [];
        }

        if (rd.kind === PM_READ_ABSENT) {
          if (ENGINE_PM.loadSeedState().quickReplies) return [];
          const seeded = ENGINE_PM.defaultQuickSeed();
          if (!UTIL_storage.setJSON(KEY_PM_STATE_QUICK_V1, seeded)) {
            ENGINE_PM_noteWriteFailure('ENGINE_PM.loadQuick.seedWrite');
            return [];
          }
          DIAG.counters.seeds += 1;
          ENGINE_PM.markSeeded('quickReplies');
          return seeded;
        }

        const arr = rd.value;
        arr.forEach((q, idx) => { if (q && typeof q.order !== 'number') q.order = idx; });
        return arr.sort((a, b) => (a?.order || 0) - (b?.order || 0));
      }, []);
    },
    // Commit: persist → adopt → emit (see the ordering note on savePrompts).
    saveQuick(list) {
      return SAFE_try('ENGINE_PM.saveQuick', () => {
        const next = Array.isArray(list) ? list : [];
        if (!ENGINE_PM.persistQuick(next)) return false;
        STATE_PM.data.quick = next;                // adopt BEFORE publishing
        UTIL_emitPmChanged({ what: 'quick' });
        return true;
      }, false);
    },

    getUiMode() { return UTIL_storage.getStr(KEY_PM_UI_MODE_V1, 'simple') || 'simple'; },
    setUiMode(m) { UTIL_storage.setStr(KEY_PM_UI_MODE_V1, (m === 'edit') ? 'edit' : 'simple'); },
  };

  /* ───────────────────────────── 🧪 TEST HOOK (flag-gated, off in production) ─────────────────────────────
   * Exposes the real storage engine and the real ordering helper so validators
   * exercise production code instead of a copy. The flag must be set on the
   * window BEFORE this module is evaluated; in a normal page nothing is defined
   * here, nothing is observed, and no behaviour changes. The six-method public
   * API is untouched either way. */
  if (W.__H2O_PM_TEST__ === true) {
    MOD_OBJ.__test = Object.freeze({
      version: MOD_VERSION,
      engine: ENGINE_PM,
      state: STATE_PM,
      diag: DIAG,
      storage: UTIL_storage,
      reorderVisible: ENGINE_PM_reorderVisible,
      readArray: ENGINE_PM_readArray,
      hash32: UTIL_hash32,
      migratedDraftId: ENGINE_PM_migratedDraftId,
      quarantineMaxCandidates: PM_QUARANTINE_MAX_CANDIDATES,
      migUnknownCreatedAt: PM_MIG_UNKNOWN_CREATED_AT,
      normDraftTs: ENGINE_PM_normDraftTs,
      normDraftText: ENGINE_PM_normDraftText,
      verifyCaptureOccurrence: ENGINE_PM_verifyCaptureOccurrence,
      readKinds: Object.freeze({ absent: PM_READ_ABSENT, corrupt: PM_READ_CORRUPT, valid: PM_READ_VALID }),
      keys: Object.freeze({
        prompts: KEY_PM_STATE_PROMPTS_V1,
        quick: KEY_PM_STATE_QUICK_V1,
        seeded: KEY_PM_STATE_SEEDED_V1,
        history: KEY_PM_STATE_HISTORY_V1,
        drafts: KEY_PM_STATE_DRAFTS_V1,
        pasted: KEY_PM_STATE_PASTED_V1,
        autoSend: KEY_PM_CFG_AUTOSEND_V1,
        uiMode: KEY_PM_UI_MODE_V1,
        migKeys: KEY_PM_MIG_KEYS_V1,
        migDrafts: KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1,
      }),
      // Legacy key names, so migration tests drive the real pairs rather than
      // hard-coding strings that could drift from the production list.
      legacyKeys: Object.freeze({
        prompts: KEY_LEG_PROMPTS,
        autoSend: KEY_LEG_AUTOSEND,
        lastUsed: KEY_LEG_LAST_USED,
        quick: KEY_LEG_QUICK,
        history: KEY_LEG_HISTORY,
        mode: KEY_LEG_MODE,
      }),
      events: Object.freeze({
        ready: EV_PM_READY_V1,
        changed: EV_PM_CHANGED_V1,
        readyLegacy: EV_PM_READY_LEGACY_V1,
        changedLegacy: EV_PM_CHANGED_LEGACY_V1,
      }),
    });
  }

  /* ───────────────────────────── 🟨 TIME — Reactivity / Scheduling 📝🔓💥 ───────────────────────────── */
  const TIME_PM = {
    resetHistoryCapture() {
      SAFE_try('TIME_PM.resetHistoryCapture', () => {
        const hc = STATE_PM.historyCapture;
        if (!hc) return;
        if (typeof hc.unbindForm === 'function') { try { hc.unbindForm(); } catch {} }
        if (typeof hc.unbindSendBtn === 'function') { try { hc.unbindSendBtn(); } catch {} }
        hc.unbindForm = null;
        hc.unbindSendBtn = null;
        hc.form = null;
        hc.sendBtn = null;
      }, null);
    },

    ensureHistoryCapture() {
      SAFE_try('TIME_PM.ensureHistoryCapture', () => {
        const hc = STATE_PM.historyCapture;
        if (!hc) return;
        const captureHistory = () => {
          const txt = DOM_getInputText();
          ENGINE_PM.pushHistory(txt);
        };

        const form = DOM_getForm();
        if (!form) {
          TIME_PM.resetHistoryCapture();
          return;
        }

        if (hc.form !== form) {
          if (typeof hc.unbindForm === 'function') { try { hc.unbindForm(); } catch {} }
          const onSubmit = () => captureHistory();
          const onClick = (e) => {
            const btn = e?.target?.closest?.('button');
            if (!btn || !form.contains(btn)) return;
            if (!DOM_isSendButton(btn)) return;
            captureHistory();
          };
          const onKeyDown = (e) => {
            if (e?.key !== 'Enter') return;
            if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
            const activeInput = DOM_pickEditableInForm(form);
            if (!activeInput) return;
            const t = e.target;
            if (!t) return;
            const inActiveInput = (t === activeInput) || !!activeInput.contains?.(t);
            if (!inActiveInput) return;
            captureHistory();
          };
          form.addEventListener('submit', onSubmit, true);
          form.addEventListener('click', onClick, true);
          form.addEventListener('keydown', onKeyDown, true);
          hc.unbindForm = () => {
            form.removeEventListener('submit', onSubmit, true);
            form.removeEventListener('click', onClick, true);
            form.removeEventListener('keydown', onKeyDown, true);
          };
          hc.form = form;
          UTIL_diagStep(`[HIST][${MODTAG}] rebind`, 'form');
        }

        const btn = DOM_getSendButton();
        if (hc.sendBtn !== btn) {
          if (typeof hc.unbindSendBtn === 'function') { try { hc.unbindSendBtn(); } catch {} }
          if (btn) {
            const onBtnClick = () => captureHistory();
            btn.addEventListener('click', onBtnClick, true);
            hc.unbindSendBtn = () => btn.removeEventListener('click', onBtnClick, true);
          } else {
            hc.unbindSendBtn = null;
          }
          hc.sendBtn = btn || null;
          UTIL_diagStep(`[HIST][${MODTAG}] rebind`, btn ? 'sendBtn' : 'sendBtn:none');
        }
      }, null);
    },

    attachDraftCaptureOnClose() {
      SAFE_try('TIME_PM.attachDraftCaptureOnClose', () => {
        const onClose = () => {
          const txt = DOM_getInputText();
          ENGINE_PM.pushDraft(txt);
        };
        W.addEventListener('beforeunload', onClose, true);
        W.addEventListener('pagehide', onClose, true);
        CLEAN_addFn(() => W.removeEventListener('beforeunload', onClose, true));
        CLEAN_addFn(() => W.removeEventListener('pagehide', onClose, true));
      }, null);
    },

    attachPastedCapture() {
      SAFE_try('TIME_PM.attachPastedCapture', () => {
        const onPaste = (e) => {
          const input = DOM_getEditableInput();
          if (!input) return;
          const t = e?.target;
          const inInput = !!t && ((t === input) || !!input.contains?.(t));
          if (!inInput) return;

          let raw = '';
          try {
            raw = String(e?.clipboardData?.getData('text/plain') || e?.clipboardData?.getData('text') || '');
          } catch {}
          if (String(raw || '').trim()) ENGINE_PM.pushPasted(raw);

          // No fallback by design. The former post-paste read captured the WHOLE
          // composer — including text typed before the paste — whenever the
          // clipboard carried no text/plain (image, file, some rich sources).
          // A paste with no plain text has no pasted text to record.
        };

        D.addEventListener('paste', onPaste, true);
        CLEAN_addFn(() => D.removeEventListener('paste', onPaste, true));
      }, null);
    },

    attachEscClose(getPanelOpen, closePanel) {
      const onKey = (e) => {
        if (e.key === 'Escape' && getPanelOpen()) closePanel();
      };
      D.addEventListener('keydown', onKey);
      CLEAN_addFn(() => D.removeEventListener('keydown', onKey));
    },
  };

  /* ───────────────────────────── 🟦 SURFACE — Events / Public API (spec-only) 📄🔒💧 ───────────────────────────── */
  // Public guarantees:
  // - window events: EV_PM_READY_V1, EV_PM_CHANGED_V1
  // - lifecycle entrypoints exist (boot/dispose) via MOD_OBJ.port if needed in future (not required now)

  /* ───────────────────────────── 🟧 BOUNDARIES — UI Mount / DOM Ops 📝🔓💥 ───────────────────────────── */
  const UI_PM = {
    selOwned(ui) { return `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`; },

    getRoot() { return DOM_q(UI_PM.selOwned(UI_PM_WRAP)); },

    ensureTooltip() {
      return SAFE_try('UI_PM.ensureTooltip', () => {
        let tip = DOM_q(UI_PM.selOwned(UI_PM_TOOLTIP));
        if (tip) return tip;

        tip = D.createElement('div');
        tip.setAttribute(ATTR_CGXUI, UI_PM_TOOLTIP);
        tip.setAttribute(ATTR_CGXUI_OWNER, SkID);
        tip.innerHTML = `<div class="cgxui-${SkID}--tip-title"></div><div class="cgxui-${SkID}--tip-body"></div>`;
        // The tooltip is created lazily, on first hover — long after boot and
        // after the theme observer's initial sweep. Stamp the host theme now, or
        // it renders with the media-query fallback until the next root-class
        // mutation (which may never come in a stable session).
        UI_PM_applyThemeToEl(tip);
        D.body.appendChild(tip);
        CLEAN_addNode(tip);
        return tip;
      }, null);
    },

    tooltipShow(e, title, body) {
      SAFE_try('UI_PM.tooltipShow', () => {
        const tip = STATE_PM.ui.tooltip || UI_PM.ensureTooltip();
        if (!tip) return;
        STATE_PM.ui.tooltip = tip;
        const t = tip.querySelector(`.cgxui-${SkID}--tip-title`);
        const b = tip.querySelector(`.cgxui-${SkID}--tip-body`);
        if (t) t.textContent = String(title || '');
        if (b) b.textContent = String(body || '');
        tip.style.display = 'block';
        UI_PM.tooltipMove(e);
      }, null);
    },
    tooltipMove(e) {
      SAFE_try('UI_PM.tooltipMove', () => {
        const tip = STATE_PM.ui.tooltip;
        if (!tip) return;
        const pad = CFG_PM.TOOLTIP_PAD;
        tip.style.left = `${(e?.clientX || 0) + pad}px`;
        tip.style.top = `${(e?.clientY || 0) + pad}px`;
      }, null);
    },
    tooltipHide() {
      SAFE_try('UI_PM.tooltipHide', () => {
        const tip = STATE_PM.ui.tooltip;
        if (!tip) return;
        tip.style.display = 'none';
      }, null);
    },

    ensureUI() {
      return SAFE_try('UI_PM.ensureUI', () => {
        try { D.querySelector(LEGACY_XPCH_PROMPT_EXPORT_SEL)?.remove?.(); } catch {}
        const form = DOM_getForm();
        if (!form) return null;

        const existing = UI_PM.getRoot();
        if (existing) return existing;

        const wrap = D.createElement('div');
        wrap.setAttribute(ATTR_CGXUI, UI_PM_WRAP);
        wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

        wrap.innerHTML = `
          <div ${ATTR_CGXUI}="${UI_PM_BTNBOX}" ${ATTR_CGXUI_OWNER}="${SkID}">
            <button type="button" ${ATTR_CGXUI}="${UI_PM_EXPORT_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}" title="${CFG_PM.EXPORT_BTN_TITLE}">${CFG_PM.EXPORT_BTN_LABEL}</button>
            <button type="button" ${ATTR_CGXUI}="${UI_PM_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}">Prompts</button>
            <div ${ATTR_CGXUI}="${UI_PM_QUICK_TRAY}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true"></div>
            <button type="button" ${ATTR_CGXUI}="${UI_PM_QUICK_MODE_DOT}" ${ATTR_CGXUI_OWNER}="${SkID}" title="Quick replies: append only">•</button>
          </div>

          <div ${ATTR_CGXUI}="${UI_PM_OVERLAY}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true"></div>

          <div ${ATTR_CGXUI}="${UI_PM_PANEL}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true" inert>
            <div ${ATTR_CGXUI}="${UI_PM_MODE_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}">
              <div class="cgxui-${SkID}--top">
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_SEARCH_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Search prompts…" />
                <label class="cgxui-${SkID}--btn" title="Auto-send after insert">
                  <input type="checkbox" ${ATTR_CGXUI}="${UI_PM_AUTOSEND_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}" style="margin-right:6px">Auto-send
                </label>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_SETTINGS}" ${ATTR_CGXUI_OWNER}="${SkID}">Settings</button>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_CLOSE_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}">Close</button>
              </div>

              <div ${ATTR_CGXUI}="${UI_PM_FILTER_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:flex; gap:6px; margin:4px 0 10px;">
                <button type="button" class="cgxui-${SkID}--chip cgxui-${SkID}--chip-active" ${ATTR_CGXUI}="${UI_PM_FILTER_ALL}" ${ATTR_CGXUI_OWNER}="${SkID}">All</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_PROMPTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Prompts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_APPEND}" ${ATTR_CGXUI_OWNER}="${SkID}">Append</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_QUICK}" ${ATTR_CGXUI_OWNER}="${SkID}">Quick</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_HISTORY}" ${ATTR_CGXUI_OWNER}="${SkID}">History</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_DRAFTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Drafts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_PASTED}" ${ATTR_CGXUI_OWNER}="${SkID}">Pasted</button>
              </div>

              <div class="cgxui-${SkID}--list" ${ATTR_CGXUI}="${UI_PM_LIST_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}"></div>
            </div>

            <div ${ATTR_CGXUI}="${UI_PM_MODE_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:none">
              <div class="cgxui-${SkID}--top">
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_SEARCH_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Search prompts…" />
                <label class="cgxui-${SkID}--btn" title="Auto-send after insert">
                  <input type="checkbox" ${ATTR_CGXUI}="${UI_PM_AUTOSEND_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}" style="margin-right:6px">Auto-send
                </label>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_BACK}" ${ATTR_CGXUI_OWNER}="${SkID}">Back</button>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_CLOSE_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}">Close</button>
              </div>

              <div ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:flex; gap:6px; margin-bottom:8px;">
                <button type="button" class="cgxui-${SkID}--chip cgxui-${SkID}--chip-active" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_ALL}" ${ATTR_CGXUI_OWNER}="${SkID}">All</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_PROMPTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Prompts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_APPEND}" ${ATTR_CGXUI_OWNER}="${SkID}">Append</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_QUICK}" ${ATTR_CGXUI_OWNER}="${SkID}">Quick</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_HISTORY}" ${ATTR_CGXUI_OWNER}="${SkID}">History</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_DRAFTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Drafts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_PASTED}" ${ATTR_CGXUI_OWNER}="${SkID}">Pasted</button>
              </div>

              <div class="cgxui-${SkID}--list" ${ATTR_CGXUI}="${UI_PM_LIST_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}"></div>

              <div style="border-top:1px solid var(--cgxui-${SkID}-border); margin-top:10px; padding-top:10px; display:grid; gap:6px;">
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_ADD_TITLE}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="New prompt title" />
                <textarea class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_ADD_BODY}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="New prompt body…" style="min-height:90px"></textarea>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_ADD_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}">Add Prompt</button>
              </div>
            </div>
          </div>
        `.trim();

        // Mount in body as a floating layer so composer re-renders do not remount/move us.
        (D.body || D.documentElement).appendChild(wrap);
        CLEAN_addNode(wrap);
        return wrap;
      }, null);
    },
  };

  /* ───────────────────────────── 🎨 THEME — Host-theme authority 📝🔓💥 ─────────────────────────────
   * ChatGPT's theme is a class on <html>; the OS `prefers-color-scheme` can
   * disagree with it. Read the host, stamp an owned token on our own nodes, and
   * let the CSS token block win over the media-query fallback. */
  /* Authority rule:
   *   root classList has 'dark'          → 'dark'
   *   root classList exists, no 'dark'   → 'light'
   *   root classList unavailable         → '' (media-query fallback)
   *
   * Light is deliberately the DEFAULT once the host root is readable, rather
   * than requiring an explicit 'light' class. Nothing in this repository or in
   * any live capture proves ChatGPT always marks light mode with a class, and
   * requiring one would silently drop us back to `prefers-color-scheme` — the
   * exact OS-vs-page mismatch this authority exists to remove. Only a genuinely
   * unreadable root (no documentElement/classList) falls back. */
  const UI_PM_detectHostTheme = () => SAFE_try('UI_PM.detectHostTheme', () => {
    const cl = D.documentElement?.classList;
    if (!cl || typeof cl.contains !== 'function') return '';
    return cl.contains('dark') ? 'dark' : 'light';
  }, '');

  /* Applies the CURRENT host theme to exactly one owned element. Deliberately
   * flat — no call back into UI_PM_applyTheme — so newly created owned nodes
   * (the lazily mounted tooltip) can be stamped at creation time without any
   * recursion between the two helpers. */
  const UI_PM_applyThemeToEl = (el, themeArg) => SAFE_try('UI_PM.applyThemeToEl', () => {
    if (!el || typeof el.setAttribute !== 'function') return '';
    const theme = (themeArg === undefined) ? UI_PM_detectHostTheme() : themeArg;
    if (theme) el.setAttribute(ATTR_CGXUI_THEME, theme);
    else el.removeAttribute?.(ATTR_CGXUI_THEME);
    return theme;
  }, '');

  const UI_PM_applyTheme = () => SAFE_try('UI_PM.applyTheme', () => {
    const theme = UI_PM_detectHostTheme();
    // Stamp every owned root: the wrap, and the tooltip which lives on <body>.
    // Detected once and passed down, so one sweep cannot straddle a theme flip.
    const targets = [
      STATE_PM.ui.root || UI_PM.getRoot(),
      STATE_PM.ui.tooltip || DOM_q(SEL_PM.UI_TOOLTIP()),
    ];
    for (const el of targets) {
      if (!el) continue;
      UI_PM_applyThemeToEl(el, theme);
    }
    return theme;
  }, '');

  const UI_PM_installThemeObserver = () => SAFE_try('UI_PM.installThemeObserver', () => {
    if (PM_THEME_OBS) return;
    const rootEl = D.documentElement;
    if (!rootEl || typeof MutationObserver !== 'function') return;
    UI_PM_applyTheme();
    PM_THEME_OBS = new MutationObserver(() => { UI_PM_applyTheme(); });
    try { PM_THEME_OBS.observe(rootEl, { attributes: true, attributeFilter: ['class'] }); } catch {}
    CLEAN_addObs(PM_THEME_OBS);
    CLEAN_addFn(() => {
      try { PM_THEME_OBS?.disconnect?.(); } catch {}
      PM_THEME_OBS = null;
    });
  }, null);

  /* ───────────────────────────── 🪟 PANEL STATE — single authority 📝🔓💥 ─────────────────────────────
   * One function owns open class, visibility, inert and aria-hidden together so
   * they can never disagree. Public API methods call these directly rather than
   * synthesising a button click through the 220 ms human click timer. */
  const UI_PM_panelNodes = () => {
    const root = STATE_PM.ui.root || UI_PM.getRoot();
    if (!root) return { root: null, panel: null, overlay: null };
    const panel = (STATE_PM.ui.panel && D.contains(STATE_PM.ui.panel))
      ? STATE_PM.ui.panel
      : DOM_q(UI_PM.selOwned(UI_PM_PANEL), root);
    const overlay = (STATE_PM.ui.overlay && D.contains(STATE_PM.ui.overlay))
      ? STATE_PM.ui.overlay
      : DOM_q(UI_PM.selOwned(UI_PM_OVERLAY), root);
    return { root, panel, overlay };
  };

  const UI_PM_isPanelOpen = () => {
    const { panel } = UI_PM_panelNodes();
    return !!panel?.classList?.contains(UI_PM_CLS_OPEN);
  };

  /* Applies `open` and returns the resulting open-state. */
  const UI_PM_applyPanelState = (open) => SAFE_try('UI_PM.applyPanelState', () => {
    const { panel, overlay } = UI_PM_panelNodes();
    if (!panel) return false;
    const on = !!open;
    panel.classList.toggle(UI_PM_CLS_OPEN, on);
    panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    // inert must be cleared before any focus attempt, and set whenever closed.
    if (on) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    overlay?.classList?.toggle?.(UI_PM_CLS_OVSHOW, on);
    return on;
  }, false);

  const PM_DOCK_getApi = () => W.H2O?.InputDock?.api || null;

  const PM_DOCK_enable = (root, api) => {
    if (!root || !api || typeof api.register !== 'function') return false;
    DOM_setStateToken(root, DOCK_PM.STATE_DOCK, true);
    STATE_PM.ui.dockMode = true;
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    const ok = !!api.register({
      id: DOCK_PM.REG_TOP,
      slot: 'top',
      el: root,
      mode: 'move',
      pin: 'prepend',
      order: 220,
    });
    STATE_PM.ui.dockRegActive = ok;
    if (!ok) {
      DOM_setStateToken(root, DOCK_PM.STATE_DOCK, false);
      STATE_PM.ui.dockMode = false;
    }
    return ok;
  };

  const PM_DOCK_disable = (root, apiRaw) => {
    const api = apiRaw || PM_DOCK_getApi();
    if (api && typeof api.unregister === 'function') {
      SAFE_try('PM_DOCK.disable.unregister', () => api.unregister(DOCK_PM.REG_TOP), null);
    }
    if (root) {
      DOM_setStateToken(root, DOCK_PM.STATE_DOCK, false);
    }
    STATE_PM.ui.dockMode = false;
    STATE_PM.ui.dockRegActive = false;
  };

  const PM_DOCK_sync = (root = (STATE_PM.ui.root || UI_PM.getRoot())) => {
    if (!root) return false;
    if (!VIEW_PM_shouldShow()) {
      PM_DOCK_disable(root);
      root.style.display = 'none';
      return false;
    }
    root.style.display = '';
    const api = PM_DOCK_getApi();
    const canDock = !!(
      api &&
      typeof api.ready === 'function' &&
      typeof api.register === 'function' &&
      typeof api.unregister === 'function' &&
      api.ready()
    );
    if (!canDock) {
      if (STATE_PM.ui.dockMode || STATE_PM.ui.dockRegActive) PM_DOCK_disable(root, api);
      return false;
    }
    try {
      const topSlot = api.getSlot?.('top');
      if (
        STATE_PM.ui.dockMode &&
        STATE_PM.ui.dockRegActive &&
        topSlot &&
        root.parentElement === topSlot
      ) return true;
    } catch {}
    const ok = PM_DOCK_enable(root, api);
    if (!ok) {
      PM_DOCK_disable(root, api);
      return false;
    }
    return true;
  };

  const PM_DOCK_installBridge = () => {
    if (STATE_PM.ui.dockBridgeWired) return;
    STATE_PM.ui.dockBridgeWired = true;

    const syncSoon = () => {
      W.requestAnimationFrame(() => {
        if (!STATE_PM.booted) return;
        const root = STATE_PM.ui.root || UI_PM.getRoot();
        const ok = PM_DOCK_sync(root);
        if (!ok && root) UI_PM_scheduleFloatingLayout(root);
      });
    };

    W.addEventListener(EV_INPUT_DOCK_READY, syncSoon, { passive: true });
    W.addEventListener('popstate', syncSoon, { passive: true });
    W.addEventListener('pageshow', syncSoon, { passive: true });
    CLEAN_addFn(() => W.removeEventListener(EV_INPUT_DOCK_READY, syncSoon));
    CLEAN_addFn(() => W.removeEventListener('popstate', syncSoon));
    CLEAN_addFn(() => W.removeEventListener('pageshow', syncSoon));

    let tries = 0;
    let warmTimer = 0;
    warmTimer = CLEAN_setInterval(() => {
      if (!STATE_PM.booted) {
        CLEAN_clearInterval(warmTimer);
        return;
      }
      tries += 1;
      const root = STATE_PM.ui.root || UI_PM.getRoot();
      const ok = PM_DOCK_sync(root);
      if (!ok && root) UI_PM_scheduleFloatingLayout(root);
      if (ok || tries >= 80) CLEAN_clearInterval(warmTimer);
    }, 250);
    CLEAN_addFn(() => CLEAN_clearInterval(warmTimer));
  };

  function UI_PM_placeFloatingRoot(root) {
    SAFE_try('UI_PM.placeFloatingRoot', () => {
      if (!root || !D.contains(root)) return;
      if (!VIEW_PM_shouldShow()) {
        root.style.display = 'none';
        UI_PM_applyPanelState(false);
        return;
      }
      root.style.display = '';
      const btnBox = DOM_q(UI_PM.selOwned(UI_PM_BTNBOX), root);
      if (!btnBox) return;
      if (STATE_PM.ui.dockMode) {
        btnBox.style.display = 'flex';
        root.style.left = 'auto';
        root.style.top = 'auto';
        root.style.right = 'auto';
        root.style.bottom = 'auto';
        return;
      }

      const anchor = DOM_getComposerAnchorRect();
      if (!anchor || anchor.width <= 0 || anchor.height <= 0) {
        btnBox.style.display = 'none';
        return;
      }
      if (anchor.bottom <= 0 || anchor.top >= W.innerHeight) {
        btnBox.style.display = 'none';
        return;
      }

      btnBox.style.display = 'flex';

      const vvTop = W.visualViewport?.offsetTop || 0;
      const vvLeft = W.visualViewport?.offsetLeft || 0;

      const desiredTop = Math.round(anchor.top + vvTop - CFG_PM.FLOAT_TOP_GAP_Y);
      const mirroredLeftInset = DOM_getMirroredNavRightInset(anchor);
      const desiredLeft = Math.round(anchor.left + vvLeft + mirroredLeftInset);

      const bw = Math.max(50, btnBox.getBoundingClientRect().width || 0);
      const left = Math.min(Math.max(6, desiredLeft), Math.max(6, W.innerWidth - bw - 6));
      const safeTop = Math.max(6, vvTop + CFG_PM.FLOAT_MIN_TOP_SAFE_Y);
      const top = Math.max(safeTop, desiredTop);

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }, null);
  }

  function UI_PM_scheduleFloatingLayout(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
    if (!root) return;
    if (STATE_PM.ui.dockMode) return;
    if (PM_LAYOUT_RAF) return;
    PM_LAYOUT_RAF = W.requestAnimationFrame(() => {
      PM_LAYOUT_RAF = 0;
      UI_PM_placeFloatingRoot(root);
    });
  }

  /* ───────────────────────────── 🟥 ENGINE — UI Rendering 📝🔓💥 ───────────────────────────── */
  const RENDER_PM = {
    setMode(root, mode) {
      SAFE_try('RENDER_PM.setMode', () => {
        const m = (mode === 'edit') ? 'edit' : 'simple';
        ENGINE_PM.setUiMode(m);

        const simple = DOM_q(UI_PM.selOwned(UI_PM_MODE_SIMPLE), root);
        const edit = DOM_q(UI_PM.selOwned(UI_PM_MODE_EDIT), root);
        if (simple) simple.style.display = (m === 'simple') ? 'block' : 'none';
        if (edit) edit.style.display = (m === 'edit') ? 'block' : 'none';
      }, null);
    },

    flashMoved(el) {
      SAFE_try('RENDER_PM.flashMoved', () => {
        if (!el) return;
        el.classList.remove(`cgxui-${SkID}--moved`);
        void el.offsetWidth;
        el.classList.add(`cgxui-${SkID}--moved`);
      }, null);
    },

    setSimpleFilter(root, type) {
      STATE_PM.ui.simpleTypeFilter = type;
      const map = [
        [UI_PM_FILTER_ALL, 'all'],
        [UI_PM_FILTER_PROMPTS, 'prompt'],
        [UI_PM_FILTER_APPEND, 'append'],
        [UI_PM_FILTER_QUICK, 'quick'],
        [UI_PM_FILTER_HISTORY, 'history'],
        [UI_PM_FILTER_DRAFTS, 'draft'],
        [UI_PM_FILTER_PASTED, 'pasted'],
      ];
      for (const [ui, t] of map) {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (b) b.classList.toggle(`cgxui-${SkID}--chip-active`, t === type);
      }
    },

    setEditCategory(root, type) {
      STATE_PM.ui.editCategory = type;
      const map = [
        [UI_PM_EDIT_FILTER_ALL, 'all'],
        [UI_PM_EDIT_FILTER_PROMPTS, 'prompt'],
        [UI_PM_EDIT_FILTER_APPEND, 'append'],
        [UI_PM_EDIT_FILTER_QUICK, 'quick'],
        [UI_PM_EDIT_FILTER_HISTORY, 'history'],
        [UI_PM_EDIT_FILTER_DRAFTS, 'draft'],
        [UI_PM_EDIT_FILTER_PASTED, 'pasted'],
      ];
      for (const [ui, t] of map) {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (b) b.classList.toggle(`cgxui-${SkID}--chip-active`, t === type);
      }
    },

    renderQuickTray(root) {
      SAFE_try('RENDER_PM.renderQuickTray', () => {
        const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);
        if (!tray) return;

        const items = (STATE_PM.data.quick || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        tray.innerHTML = items.map(q => `
          <button type="button" ${ATTR_CGXUI}="${SkID}-quick-bubble" ${ATTR_CGXUI_OWNER}="${SkID}" data-id="${UTIL_escapeHtml(q.id)}">
            ${UTIL_escapeHtml(q.text)}
          </button>
        `.trim()).join('');
      }, null);
    },

    renderSimple(root, filter) {
      SAFE_try('RENDER_PM.renderSimple', () => {
        const list = DOM_q(UI_PM.selOwned(UI_PM_LIST_SIMPLE), root);
        if (!list) return;

        const q = String(filter || '').trim().toLowerCase();
        const mode = STATE_PM.ui.simpleTypeFilter;

        // Quick
        if (mode === 'quick') {
          const items = (STATE_PM.data.quick || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(it => !q || String(it.text || '').toLowerCase().includes(q));

          if (items.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No quick replies yet. Open Settings → Quick to add.</div>`;
            return;
          }

          list.innerHTML = items.map(it => `
            <div class="cgxui-${SkID}--item" data-qid="${UTIL_escapeHtml(it.id)}">
              <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(it.text)}</span></div>
            </div>
          `.trim()).join('');
          return;
        }

        // History
        if (mode === 'history') {
          // Display-only sent view, addressed by OCCURRENCE. Each card carries
          // its verified full-collection index alongside the id, because ids are
          // not unique: a hidden pending draft — or another sent row — can share
          // one, and an id-only lookup would resolve the wrong record.
          const history = ENGINE_PM.sentHistoryEntries()
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          if (history.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No history yet. Send a message and it will appear here.</div>`;
            return;
          }

          list.innerHTML = history.map(({ item: h, fullIndex, snapshot }) => {
            const t = String(h.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-hid="${UTIL_escapeHtml(h.id)}" data-hidx="${UTIL_escapeHtml(String(fullIndex))}" data-hsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-hact="insert">Insert</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-hact="prompt">+Prompt</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-hact="append">+Append</button>
                </div>
              </div>
            `.trim();
          }).join('');
          return;
        }

        // Drafts
        if (mode === 'draft') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const drafts = ENGINE_PM.captureEntries(ENGINE_PM.loadDrafts())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          if (drafts.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No drafts yet. Unsent text is saved when you close or reload the page.</div>`;
            return;
          }

          list.innerHTML = drafts.map(({ item: d, fullIndex, snapshot }) => {
            const t = String(d.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-did="${UTIL_escapeHtml(d.id)}" data-didx="${UTIL_escapeHtml(String(fullIndex))}" data-dsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-dact="insert">Insert</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-dact="prompt">+Prompt</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-dact="append">+Append</button>
                </div>
              </div>
            `.trim();
          }).join('');
          return;
        }

        // Pasted
        if (mode === 'pasted') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const pasted = ENGINE_PM.captureEntries(ENGINE_PM.loadPasted())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          if (pasted.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No pasted text yet. Paste in the input bar and it will appear here.</div>`;
            return;
          }

          list.innerHTML = pasted.map(({ item: p, fullIndex, snapshot }) => {
            const t = String(p.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-pstid="${UTIL_escapeHtml(p.id)}" data-pidx="${UTIL_escapeHtml(String(fullIndex))}" data-psnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-pact="insert">Insert</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-pact="prompt">+Prompt</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-pact="append">+Append</button>
                </div>
              </div>
            `.trim();
          }).join('');
          return;
        }

        // Prompts/Append/All
        const items = (STATE_PM.data.prompts || []).slice().filter(p => {
          const t = p.type || 'prompt';
          if (mode === 'prompt' && t !== 'prompt') return false;
          if (mode === 'append' && t !== 'append') return false;
          return (!q || String(p.title || '').toLowerCase().includes(q) || String(p.body || '').toLowerCase().includes(q));
        });

        if (items.length === 0) {
          list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No prompts yet. Open Settings to add.</div>`;
          return;
        }

        list.innerHTML = items.map(p => `
          <div class="cgxui-${SkID}--item" data-id="${UTIL_escapeHtml(p.id)}">
            <div class="cgxui-${SkID}--title">
              <span class="cgxui-${SkID}--title-left">
                <span class="cgxui-${SkID}--star ${p.favorite ? `cgxui-${SkID}--star-active` : ''}" title="Favorite">${p.favorite ? '★' : '☆'}</span>
                <span>${UTIL_escapeHtml(p.title)}</span>
              </span>
            </div>
            <div class="cgxui-${SkID}--prev">${UTIL_escapeHtml(p.body)}</div>
          </div>
        `.trim()).join('');

        // Tooltips
        for (const p of items) {
          const el = list.querySelector(`.cgxui-${SkID}--item[data-id="${CSS.escape(p.id)}"]`);
          if (!el) continue;
          el.addEventListener('mouseenter', (e) => UI_PM.tooltipShow(e, p.title, p.body));
          el.addEventListener('mousemove', (e) => UI_PM.tooltipMove(e));
          el.addEventListener('mouseleave', () => UI_PM.tooltipHide());
        }
      }, null);
    },

    renderEdit(root, filter) {
      SAFE_try('RENDER_PM.renderEdit', () => {
        const list = DOM_q(UI_PM.selOwned(UI_PM_LIST_EDIT), root);
        const addTitle = DOM_q(UI_PM.selOwned(UI_PM_ADD_TITLE), root);
        const addBody = DOM_q(UI_PM.selOwned(UI_PM_ADD_BODY), root);
        const addBtn = DOM_q(UI_PM.selOwned(UI_PM_ADD_BTN), root);
        if (!list || !addTitle || !addBody || !addBtn) return;

        const q = String(filter || '').trim().toLowerCase();
        const cat = STATE_PM.ui.editCategory;

        // Quick manage
        if (cat === 'quick') {
          const items = (STATE_PM.data.quick || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(it => !q || String(it.text || '').toLowerCase().includes(q));

          list.innerHTML = (items.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No quick replies yet. Add one below.</div>`
            : items.map(it => `
              <div class="cgxui-${SkID}--item" data-qid="${UTIL_escapeHtml(it.id)}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(it.text)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-qact="edit">Edit</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-qact="delete">Delete</button>
                </div>
              </div>
            `.trim()).join('');

          addTitle.disabled = false;
          addTitle.placeholder = 'New quick reply text';
          addBody.style.display = 'none';
          addBtn.disabled = false;
          addBtn.textContent = 'Add Quick Reply';
          return;
        }

        // History manage
        if (cat === 'history') {
          // Display-only sent view, addressed by OCCURRENCE (see renderSimple).
          const history = ENGINE_PM.sentHistoryEntries()
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          list.innerHTML = (history.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No history yet. Messages you send will appear here automatically.</div>`
            : history.map(({ item: h, fullIndex, snapshot }) => {
              const t = String(h.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-hid="${UTIL_escapeHtml(h.id)}" data-hidx="${UTIL_escapeHtml(String(fullIndex))}" data-hsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                  <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                  <div class="cgxui-${SkID}--actions">
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="insert">Insert</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="prompt">+Prompt</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="append">+Append</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="delete">Delete</button>
                  </div>
                </div>
              `.trim();
            }).join('');

          addTitle.placeholder = 'History is recorded automatically (no manual add)';
          addTitle.disabled = true;
          addBody.style.display = 'none';
          addBtn.disabled = true;
          addBtn.textContent = 'Add Prompt';
          return;
        }

        // Drafts manage
        if (cat === 'draft') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const drafts = ENGINE_PM.captureEntries(ENGINE_PM.loadDrafts())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          list.innerHTML = (drafts.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No drafts yet. Unsent text is saved when you close or reload the page.</div>`
            : drafts.map(({ item: d, fullIndex, snapshot }) => {
              const t = String(d.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-did="${UTIL_escapeHtml(d.id)}" data-didx="${UTIL_escapeHtml(String(fullIndex))}" data-dsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                  <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                  <div class="cgxui-${SkID}--actions">
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="insert">Insert</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="prompt">+Prompt</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="append">+Append</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="delete">Delete</button>
                  </div>
                </div>
              `.trim();
            }).join('');

          addTitle.placeholder = 'Drafts are saved automatically on close/reload (no manual add)';
          addTitle.disabled = true;
          addBody.style.display = 'none';
          addBtn.disabled = true;
          addBtn.textContent = 'Add Prompt';
          return;
        }

        // Pasted manage
        if (cat === 'pasted') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const pasted = ENGINE_PM.captureEntries(ENGINE_PM.loadPasted())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          list.innerHTML = (pasted.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No pasted text yet. Paste in the input bar and it will appear here.</div>`
            : pasted.map(({ item: p, fullIndex, snapshot }) => {
              const t = String(p.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-pstid="${UTIL_escapeHtml(p.id)}" data-pidx="${UTIL_escapeHtml(String(fullIndex))}" data-psnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                  <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                  <div class="cgxui-${SkID}--actions">
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="insert">Insert</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="prompt">+Prompt</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="append">+Append</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="delete">Delete</button>
                  </div>
                </div>
              `.trim();
            }).join('');

          addTitle.placeholder = 'Pasted text is recorded automatically (no manual add)';
          addTitle.disabled = true;
          addBody.style.display = 'none';
          addBtn.disabled = true;
          addBtn.textContent = 'Add Prompt';
          return;
        }

        // Prompts/Append/All
        let items = (STATE_PM.data.prompts || []).slice().filter(p =>
          (!q || String(p.title || '').toLowerCase().includes(q) || String(p.body || '').toLowerCase().includes(q))
        );

        if (cat === 'prompt') items = items.filter(p => (p.type || 'prompt') === 'prompt');
        if (cat === 'append') items = items.filter(p => (p.type || 'prompt') === 'append');

        list.innerHTML = (items.length === 0)
          ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No prompts yet. Add one below.</div>`
          : items.map(p => `
            <div class="cgxui-${SkID}--item" data-id="${UTIL_escapeHtml(p.id)}">
              <div class="cgxui-${SkID}--title">
                <span class="cgxui-${SkID}--title-left">
                  <span class="cgxui-${SkID}--star ${p.favorite ? `cgxui-${SkID}--star-active` : ''}" title="Favorite">${p.favorite ? '★' : '☆'}</span>
                  <span>${UTIL_escapeHtml(p.title)}</span>
                </span>
                <span class="cgxui-${SkID}--movebtns">
                  <button type="button" class="cgxui-${SkID}--move" data-act="up">▲</button>
                  <button type="button" class="cgxui-${SkID}--move" data-act="down">▼</button>
                </span>
              </div>
              <div class="cgxui-${SkID}--prev">${UTIL_escapeHtml(p.body)}</div>
              <div class="cgxui-${SkID}--actions">
                <button type="button" class="cgxui-${SkID}--btn" data-act="insert">Insert</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="append">Append</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="edit">Edit</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="delete">Delete</button>
              </div>
            </div>
          `.trim()).join('');

        addTitle.disabled = false;
        addTitle.placeholder = 'New prompt title';
        addBody.style.display = 'block';
        addBtn.disabled = false;
        addBtn.textContent = 'Add Prompt';

        // Tooltips
        for (const p of items) {
          const el = list.querySelector(`.cgxui-${SkID}--item[data-id="${CSS.escape(p.id)}"]`);
          if (!el) continue;
          el.addEventListener('mouseenter', (e) => UI_PM.tooltipShow(e, p.title, p.body));
          el.addEventListener('mousemove', (e) => UI_PM.tooltipMove(e));
          el.addEventListener('mouseleave', () => UI_PM.tooltipHide());
        }
      }, null);
    },
  };

  /* ───────────────────────────── 🔎 SEARCH — canonical query 📝🔓💥 ─────────────────────────────
   * Neither DOM input owns the query. Both mirror STATE_PM.ui.searchQuery, so
   * switching modes can never leave one pane filtered by a value the visible
   * box does not show. */
  const SEARCH_PM = {
    get() { return String(STATE_PM.ui.searchQuery || ''); },

    inputFor(mode, root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      if (!root) return null;
      const token = (mode === 'edit') ? UI_PM_SEARCH_EDIT : UI_PM_SEARCH_SIMPLE;
      return DOM_q(UI_PM.selOwned(token), root);
    },

    activeInput(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SEARCH_PM.inputFor(ENGINE_PM.getUiMode(), root);
    },

    /* Push the canonical value into both inputs. `except` skips the element the
     * user is typing in so the caret is never disturbed. */
    syncInputs(root = (STATE_PM.ui.root || UI_PM.getRoot()), except = null) {
      SAFE_try('SEARCH_PM.syncInputs', () => {
        if (!root) return;
        const value = SEARCH_PM.get();
        for (const token of [UI_PM_SEARCH_SIMPLE, UI_PM_SEARCH_EDIT]) {
          const el = DOM_q(UI_PM.selOwned(token), root);
          if (!el || el === except) continue;
          if (el.value !== value) el.value = value;
        }
      }, null);
    },

    set(value, root = (STATE_PM.ui.root || UI_PM.getRoot()), except = null) {
      STATE_PM.ui.searchQuery = String(value == null ? '' : value);
      SEARCH_PM.syncInputs(root, except);
      return STATE_PM.ui.searchQuery;
    },
  };

  /* ───────────────────────────── 🪟 PANEL — open/close (module scope) 📝🔓💥 ─────────────────────────────
   * Defined here (not inside boot) so the public API can drive real state
   * synchronously instead of synthesising a click. */
  function UI_PM_renderBoth(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
    if (!root) return;
    const q = SEARCH_PM.get();
    RENDER_PM.renderSimple(root, q);
    RENDER_PM.renderEdit(root, q);
  }

  function UI_PM_openPanel(opts) {
    const root = STATE_PM.ui.root || UI_PM.getRoot();
    if (!root) return false;
    const { panel } = UI_PM_panelNodes();
    if (!panel) return false;

    // State first: inert/visibility must be lifted before rendering or focusing.
    UI_PM_applyPanelState(true);

    const mode = ENGINE_PM.getUiMode();
    RENDER_PM.setMode(root, mode);
    SEARCH_PM.syncInputs(root);
    UI_PM_renderBoth(root);

    if (opts?.focus !== false) {
      SAFE_try('UI_PM.openPanel.focus', () => SEARCH_PM.activeInput(root)?.focus?.(), null);
    }
    return UI_PM_isPanelOpen();
  }

  function UI_PM_closePanel() {
    const { panel } = UI_PM_panelNodes();
    if (!panel) return false;
    UI_PM_applyPanelState(false);
    return !UI_PM_isPanelOpen();
  }

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */
  function CORE_PM_scheduleBootRetry(delayMs = 240) {
    if (STATE_PM.booted) return;
    if (PM_BOOT_RETRY_TIMER) return;
    const wait = Math.max(80, Number(delayMs) || 240);
    PM_BOOT_RETRY_TIMER = CLEAN_setTimeout(() => {
      PM_BOOT_RETRY_TIMER = 0;
      if (!STATE_PM.booted) CORE_PM_boot();
    }, wait);
  }

  function CORE_PM_scheduleSelfHeal(delayMs = 120) {
    if (PM_SELF_HEAL_TIMER) return;
    const wait = Math.max(0, Number(delayMs) || 0);
    PM_SELF_HEAL_TIMER = CLEAN_setTimeout(() => {
      PM_SELF_HEAL_TIMER = 0;
      const hasRoot = !!UI_PM.getRoot();
      const hasForm = !!DOM_getForm();
      const root = STATE_PM.ui.root || UI_PM.getRoot();
      if (root) {
        PM_DOCK_sync(root);
        UI_PM_scheduleFloatingLayout(root);
      }
      if (STATE_PM.booted) TIME_PM.ensureHistoryCapture();

      if (!STATE_PM.booted) {
        if (PM_FORCE_RECOVER || !PM_READY_EMITTED) {
          if (hasForm) CORE_PM_boot();
          else CORE_PM_scheduleBootRetry(260);
        }
        return;
      }

      if (!hasRoot) {
        PM_FORCE_RECOVER = true;
        CORE_PM_dispose();
        STATE_PM.booted = false;
        if (hasForm) CORE_PM_boot();
        else CORE_PM_scheduleBootRetry(260);
      }
    }, wait);
  }

  function CORE_PM_installSelfHealObserver() {
    if (PM_SELF_HEAL_OBS) return;

    const start = () => {
      if (PM_SELF_HEAL_OBS) return;
      PM_SELF_HEAL_OBS = new MutationObserver(() => { CORE_PM_scheduleSelfHeal(120); });
      try {
        PM_SELF_HEAL_OBS.observe(D.body || D.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
        });
      } catch {}
    };

    if (D.body) start();
    else D.addEventListener('DOMContentLoaded', start, { once: true });

    W.addEventListener('pageshow', () => { CORE_PM_scheduleSelfHeal(40); }, { passive: true });
  }

  function CORE_PM_boot() {
    if (STATE_PM.booted) return;
    STATE_PM.booted = true;

    SAFE_try('CORE_PM_boot', () => {
      UTIL_diagStep(`[BOOT][${MODTAG}] start`);

      // migrate (boot-time allowed)
      //
      // Both routines fail closed: on any problem they leave every source value
      // byte-for-byte intact and leave their marker unset, so the next boot
      // retries. A safe deferral must NOT block the UI from mounting — but it
      // must not be silent either, so the failure stays visible in dataError and
      // in the diagnostics rather than being swallowed here. No cleanup, no
      // fallback write, and no reseed is triggered by a deferral.
      const migKeysOk = ENGINE_PM.migrateKeysOnce();
      const migDraftsOk = ENGINE_PM.migrateDraftsFromHistoryOnce();
      if (!migKeysOk || !migDraftsOk) {
        STATE_PM.dataError = true;
        UTIL_diagStep(`[BOOT][${MODTAG}] migration deferred`,
          `keys:${migKeysOk ? 'ok' : 'deferred'} drafts:${migDraftsOk ? 'ok' : 'deferred'}`);
      }

      // load data
      STATE_PM.data.prompts = ENGINE_PM.loadPrompts();
      STATE_PM.data.quick = ENGINE_PM.loadQuick();

      // css
      UI_ensureStyle();

      // mount
      const root = UI_PM.ensureUI();
      STATE_PM.ui.root = root;
      if (!root) {
        UTIL_diagStep(`[BOOT][${MODTAG}] no root (form missing?)`);
        STATE_PM.booted = false;
        PM_FORCE_RECOVER = true;
        CORE_PM_scheduleBootRetry(260);
        return;
      }
      PM_DOCK_installBridge();
      PM_DOCK_sync(root);

      // cache nodes
      const panel = DOM_q(UI_PM.selOwned(UI_PM_PANEL), root);
      const overlay = DOM_q(UI_PM.selOwned(UI_PM_OVERLAY), root);
      // Published so the module-scope panel authority (and therefore the public
      // API) can act without re-querying or synthesising a click.
      STATE_PM.ui.panel = panel;
      STATE_PM.ui.overlay = overlay;
      const exportBtn = DOM_q(UI_PM.selOwned(UI_PM_EXPORT_BTN), root);
      const btn = DOM_q(UI_PM.selOwned(UI_PM_BTN), root);
      const searchSimple = DOM_q(UI_PM.selOwned(UI_PM_SEARCH_SIMPLE), root);
      const searchEdit = DOM_q(UI_PM.selOwned(UI_PM_SEARCH_EDIT), root);
      const autoSimple = DOM_q(UI_PM.selOwned(UI_PM_AUTOSEND_SIMPLE), root);
      const autoEdit = DOM_q(UI_PM.selOwned(UI_PM_AUTOSEND_EDIT), root);
      const dot = DOM_q(UI_PM.selOwned(UI_PM_QUICK_MODE_DOT), root);
      const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);

      // Closed-state invariants applied up front, before anything can focus.
      UI_PM_applyPanelState(false);
      UI_PM_installThemeObserver();

      let resizeBurstTimer = 0;
      let resizeBurstUntil = 0;

      const onLayout = () => UI_PM_scheduleFloatingLayout(root);
      const onResizeBurst = () => {
        resizeBurstUntil = performance.now() + 1100;
        onLayout();
        if (resizeBurstTimer) return;
        resizeBurstTimer = CLEAN_setInterval(() => {
          if (performance.now() > resizeBurstUntil) {
            CLEAN_clearInterval(resizeBurstTimer);
            resizeBurstTimer = 0;
            return;
          }
          onLayout();
        }, 70);
      };

      W.addEventListener('resize', onLayout, { passive: true });
      W.addEventListener('scroll', onLayout, { passive: true });
      W.addEventListener('resize', onResizeBurst, { passive: true });
      W.addEventListener('popstate', onLayout, { passive: true });
      W.addEventListener('hashchange', onLayout, { passive: true });
      W.addEventListener('pageshow', onLayout, { passive: true });
      CLEAN_addFn(() => W.removeEventListener('resize', onLayout));
      CLEAN_addFn(() => W.removeEventListener('scroll', onLayout));
      CLEAN_addFn(() => W.removeEventListener('resize', onResizeBurst));
      CLEAN_addFn(() => W.removeEventListener('popstate', onLayout));
      CLEAN_addFn(() => W.removeEventListener('hashchange', onLayout));
      CLEAN_addFn(() => W.removeEventListener('pageshow', onLayout));
      CLEAN_addFn(() => {
        if (resizeBurstTimer) {
          CLEAN_clearInterval(resizeBurstTimer);
          resizeBurstTimer = 0;
        }
      });
      if (W.visualViewport) {
        W.visualViewport.addEventListener('resize', onLayout, { passive: true });
        W.visualViewport.addEventListener('scroll', onLayout, { passive: true });
        W.visualViewport.addEventListener('resize', onResizeBurst, { passive: true });
        CLEAN_addFn(() => W.visualViewport?.removeEventListener?.('resize', onLayout));
        CLEAN_addFn(() => W.visualViewport?.removeEventListener?.('scroll', onLayout));
        CLEAN_addFn(() => W.visualViewport?.removeEventListener?.('resize', onResizeBurst));
      }

      // Composer geometry follow (single bounded owner): the composer form
      // resizes when text wraps or when ChatGPT swaps its DOM — no window
      // resize fires for that, which left these fixed-position buttons at
      // stale coordinates (visible shake/drift on refresh/reflow). One
      // ResizeObserver, re-targeted whenever the form identity changes,
      // funnels into the same rAF-debounced layout. When ChatGPT replaces
      // the form, the dying observer fires a final time (size → 0), which
      // re-runs layout → re-acquires the new form → re-targets the RO.
      let composerRo = null;
      let composerRoTarget = null;
      const ensureComposerRo = () => {
        if (typeof ResizeObserver !== 'function') return;
        const form = SAFE_try('UI_PM.composerRoForm', () => DOM_getForm(), null);
        if (form === composerRoTarget) return;
        try { composerRo?.disconnect?.(); } catch {}
        composerRo = null;
        composerRoTarget = form || null;
        if (!form) return;
        composerRo = new ResizeObserver(() => {
          onLayout();
          W.requestAnimationFrame(ensureComposerRo);
        });
        try { composerRo.observe(form); } catch {}
      };
      const onLayoutWithRo = () => { ensureComposerRo(); onLayout(); };
      W.addEventListener('resize', onLayoutWithRo, { passive: true });
      CLEAN_addFn(() => W.removeEventListener('resize', onLayoutWithRo));
      CLEAN_addFn(() => { try { composerRo?.disconnect?.(); } catch {} composerRo = null; composerRoTarget = null; });
      ensureComposerRo();

      UI_PM_scheduleFloatingLayout(root);

      // Human-facing wrappers over the single module-scope authority, so the
      // click path and the public API can never diverge.
      const getPanelOpen = () => UI_PM_isPanelOpen();
      const openPanel = () => UI_PM_openPanel();
      const closePanel = () => UI_PM_closePanel();

      // ESC
      TIME_PM.attachEscClose(getPanelOpen, closePanel);

      // Overlay click closes
      if (overlay) {
        const onOv = () => closePanel();
        overlay.addEventListener('click', onOv);
        CLEAN_addFn(() => overlay.removeEventListener('click', onOv));
      }

      // Main button click (single) + dblclick (quick tray)
      if (exportBtn) {
        const onExport = (e) => {
          e.preventDefault();
          e.stopPropagation();
          UTIL_emitExportRun(CFG_PM.EXPORT_MODE_FULL, !!e?.shiftKey);
        };
        exportBtn.addEventListener('click', onExport);
        CLEAN_addFn(() => exportBtn.removeEventListener('click', onExport));
      }

      if (btn) {
        // Human click keeps the existing single/double-click disambiguation.
        const onClick = () => {
          if (STATE_PM.ui.pmClickTimer) return;
          STATE_PM.ui.pmClickTimer = CLEAN_setTimeout(() => {
            STATE_PM.ui.pmClickTimer = 0;
            getPanelOpen() ? closePanel() : openPanel();
          }, CFG_PM.CLICK_DELAY_MS);
        };
        const onDbl = (e) => {
          e.preventDefault();
          if (STATE_PM.ui.pmClickTimer) {
            CLEAN_clearTimeout(STATE_PM.ui.pmClickTimer);
            STATE_PM.ui.pmClickTimer = 0;
          }
          // toggle quick tray visibility
          if (!tray || !dot) return;
          const show = !tray.classList.contains(UI_PM_CLS_QSHOW);
          tray.classList.toggle(UI_PM_CLS_QSHOW, show);
          tray.setAttribute('aria-hidden', show ? 'false' : 'true');
          dot.classList.toggle(UI_PM_CLS_DOT_SHOW, show);
          UI_PM_scheduleFloatingLayout(root);

          if (show) RENDER_PM.renderQuickTray(root);
        };

        btn.addEventListener('click', onClick);
        btn.addEventListener('dblclick', onDbl);
        CLEAN_addFn(() => btn.removeEventListener('click', onClick));
        CLEAN_addFn(() => btn.removeEventListener('dblclick', onDbl));
      }

      // Search inputs — both panes write to the one canonical query.
      const bindSearch = (el) => {
        if (!el) return;
        const onInput = () => {
          SEARCH_PM.set(el.value, root, el); // mirror into the other pane
          UI_PM_renderBoth(root);
        };
        el.addEventListener('input', onInput);
        CLEAN_addFn(() => el.removeEventListener('input', onInput));
      };
      bindSearch(searchSimple);
      bindSearch(searchEdit);

      // Auto-send toggles sync
      const syncAuto = () => {
        const v = ENGINE_PM.getAutoSend();
        if (autoSimple) autoSimple.checked = v;
        if (autoEdit) autoEdit.checked = v;
      };
      syncAuto();

      if (autoSimple) {
        const onCh = () => { ENGINE_PM.setAutoSend(!!autoSimple.checked); syncAuto(); };
        autoSimple.addEventListener('change', onCh);
        CLEAN_addFn(() => autoSimple.removeEventListener('change', onCh));
      }
      if (autoEdit) {
        const onCh = () => { ENGINE_PM.setAutoSend(!!autoEdit.checked); syncAuto(); };
        autoEdit.addEventListener('change', onCh);
        CLEAN_addFn(() => autoEdit.removeEventListener('change', onCh));
      }

      // Filters (simple)
      const bindFilter = (ui, type) => {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (!b) return;
        const on = () => { RENDER_PM.setSimpleFilter(root, type); RENDER_PM.renderSimple(root, SEARCH_PM.get()); };
        b.addEventListener('click', on);
        CLEAN_addFn(() => b.removeEventListener('click', on));
      };
      bindFilter(UI_PM_FILTER_ALL, 'all');
      bindFilter(UI_PM_FILTER_PROMPTS, 'prompt');
      bindFilter(UI_PM_FILTER_APPEND, 'append');
      bindFilter(UI_PM_FILTER_QUICK, 'quick');
      bindFilter(UI_PM_FILTER_HISTORY, 'history');
      bindFilter(UI_PM_FILTER_DRAFTS, 'draft');
      bindFilter(UI_PM_FILTER_PASTED, 'pasted');

      // Filters (edit)
      const bindEditFilter = (ui, type) => {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (!b) return;
        const on = () => { RENDER_PM.setEditCategory(root, type); RENDER_PM.renderEdit(root, SEARCH_PM.get()); };
        b.addEventListener('click', on);
        CLEAN_addFn(() => b.removeEventListener('click', on));
      };
      bindEditFilter(UI_PM_EDIT_FILTER_ALL, 'all');
      bindEditFilter(UI_PM_EDIT_FILTER_PROMPTS, 'prompt');
      bindEditFilter(UI_PM_EDIT_FILTER_APPEND, 'append');
      bindEditFilter(UI_PM_EDIT_FILTER_QUICK, 'quick');
      bindEditFilter(UI_PM_EDIT_FILTER_HISTORY, 'history');
      bindEditFilter(UI_PM_EDIT_FILTER_DRAFTS, 'draft');
      bindEditFilter(UI_PM_EDIT_FILTER_PASTED, 'pasted');

      // Mode buttons
      const btnSettings = DOM_q(UI_PM.selOwned(UI_PM_SETTINGS), root);
      const btnBack = DOM_q(UI_PM.selOwned(UI_PM_BACK), root);
      const btnCloseSimple = DOM_q(UI_PM.selOwned(UI_PM_CLOSE_SIMPLE), root);
      const btnCloseEdit = DOM_q(UI_PM.selOwned(UI_PM_CLOSE_EDIT), root);

      if (btnSettings) {
        const on = () => {
          RENDER_PM.setMode(root, 'edit');
          SEARCH_PM.syncInputs(root); // the Edit box must show the query it filters by
          RENDER_PM.renderEdit(root, SEARCH_PM.get());
        };
        btnSettings.addEventListener('click', on);
        CLEAN_addFn(() => btnSettings.removeEventListener('click', on));
      }
      if (btnBack) {
        const on = () => {
          RENDER_PM.setMode(root, 'simple');
          SEARCH_PM.syncInputs(root);
          RENDER_PM.renderSimple(root, SEARCH_PM.get());
        };
        btnBack.addEventListener('click', on);
        CLEAN_addFn(() => btnBack.removeEventListener('click', on));
      }
      if (btnCloseSimple) {
        const on = () => closePanel();
        btnCloseSimple.addEventListener('click', on);
        CLEAN_addFn(() => btnCloseSimple.removeEventListener('click', on));
      }
      if (btnCloseEdit) {
        const on = () => closePanel();
        btnCloseEdit.addEventListener('click', on);
        CLEAN_addFn(() => btnCloseEdit.removeEventListener('click', on));
      }

      // Quick dot: click = send mode. (The dblclick reorder mode went with the
      // Sortable removal; ▲▼ in Settings covers ordering.)
      if (dot) {
        const onClick = () => {
          STATE_PM.ui.quickSendMode = !STATE_PM.ui.quickSendMode;
          dot.classList.toggle(`cgxui-${SkID}--dot-send`, STATE_PM.ui.quickSendMode);
          dot.title = STATE_PM.ui.quickSendMode ? 'Quick replies: send immediately' : 'Quick replies: append only';
        };
        dot.addEventListener('click', onClick);
        CLEAN_addFn(() => dot.removeEventListener('click', onClick));
      }

      /* Convert a captured item into a saved prompt.
       * One shared implementation: the candidate is built without touching the
       * live array, persisted, and adopted only on success. */
      const convertToPrompt = (text, act, fallbackTitle) => {
        const body = String(text || '');
        const now = UTIL_now();
        const next = (STATE_PM.data.prompts || []).concat([{
          id: UTIL_cryptoId(),
          title: (body.slice(0, 40) || fallbackTitle),
          body,
          favorite: false,
          type: (act === 'append') ? 'append' : 'prompt',
          createdAt: now,
          updatedAt: now,
        }]);
        return ENGINE_PM.commitPrompts(next);
      };

      /* Record a use without mutating the live record: clone just that entry. */
      const touchPromptUpdatedAt = (id) => {
        const now = UTIL_now();
        const next = (STATE_PM.data.prompts || []).map(p => (p && p.id === id) ? { ...p, updatedAt: now } : p);
        return ENGINE_PM.commitPrompts(next);
      };

      /* Toggle favourite via a cloned record, then re-render on success only. */
      const toggleFavorite = (id) => {
        const list = STATE_PM.data.prompts || [];
        if (!list.some(p => p && p.id === id)) return false;
        const now = UTIL_now();
        const next = list.map(p => (p && p.id === id) ? { ...p, favorite: !p.favorite, updatedAt: now } : p);
        if (!ENGINE_PM.commitPrompts(next)) return false;
        UI_PM_renderBoth(root);
        return true;
      };

      // Click handling: Simple list
      const listSimple = DOM_q(UI_PM.selOwned(UI_PM_LIST_SIMPLE), root);
      if (listSimple) {
        const on = (e) => {
          const filter = STATE_PM.ui.simpleTypeFilter;

          // History actions
          if (filter === 'history') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const hidx = card.getAttribute('data-hidx');
            const hsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-hsnap'));
            // Re-read and verify the EXACT rendered occurrence. Matching the id
            // alone let a different sent record occupy the index and pass.
            const hist = ENGINE_PM.loadHistory();
            const item = ENGINE_PM_verifyCaptureOccurrence(hist, hidx, hsnap, 'send');
            if (!item) { RENDER_PM.renderSimple(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-hact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              convertToPrompt(item.text, act, 'From history');
              return;
            }
            return;
          }

          // Draft actions
          if (filter === 'draft') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const didx = card.getAttribute('data-didx');
            const dsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-dsnap'));
            // Two Drafts rows may share an id, so resolve the exact occurrence.
            const drafts = ENGINE_PM.loadDrafts();
            const item = ENGINE_PM_verifyCaptureOccurrence(drafts, didx, dsnap);
            if (!item) { RENDER_PM.renderSimple(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-dact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              convertToPrompt(item.text, act, 'From draft');
              return;
            }
            return;
          }

          // Pasted actions
          if (filter === 'pasted') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const pidx = card.getAttribute('data-pidx');
            const psnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-psnap'));
            // Two Pasted rows may share an id, so resolve the exact occurrence.
            const pasted = ENGINE_PM.loadPasted();
            const item = ENGINE_PM_verifyCaptureOccurrence(pasted, pidx, psnap);
            if (!item) { RENDER_PM.renderSimple(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-pact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              convertToPrompt(item.text, act, 'From pasted');
              return;
            }
            return;
          }

          // Quick insert
          if (filter === 'quick') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const qid = card.getAttribute('data-qid');
            const q = STATE_PM.data.quick.find(x => x.id === qid);
            if (!q) return;
            DOM_setInputText(q.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
            return;
          }

          // Favorite toggle
          if (e.target.classList.contains(`cgxui-${SkID}--star`)) {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            toggleFavorite(card?.getAttribute('data-id'));
            return;
          }

          // Insert prompt
          const card = e.target.closest(`.cgxui-${SkID}--item`);
          if (!card) return;
          const id = card.getAttribute('data-id');
          const p = STATE_PM.data.prompts.find(x => x.id === id);
          if (!p) return;
          const isAppend = (p.type === 'append');
          DOM_setInputText(p.body, { append: isAppend, autoSend: ENGINE_PM.getAutoSend() });
          touchPromptUpdatedAt(id);
          if (ENGINE_PM.getAutoSend()) closePanel();
        };

        listSimple.addEventListener('click', on);
        CLEAN_addFn(() => listSimple.removeEventListener('click', on));
      }

      // Click handling: Edit list
      const listEdit = DOM_q(UI_PM.selOwned(UI_PM_LIST_EDIT), root);
      if (listEdit) {
        const on = (e) => {
          const cat = STATE_PM.ui.editCategory;

          // History manage
          if (cat === 'history') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const hidx = card.getAttribute('data-hidx');
            const hsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-hsnap'));
            // Strict read: a corrupt collection must not be rewritten.
            const rd = ENGINE_PM.loadHistoryStrict();
            if (!rd.ok) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }
            const hist = rd.list;
            // Verify the EXACT rendered occurrence against the CURRENT collection.
            const item = ENGINE_PM_verifyCaptureOccurrence(hist, hidx, hsnap, 'send');
            if (!item) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-hact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              convertToPrompt(item.text, act, 'From history');
              return;
            }
            if (act === 'delete') {
              /* Remove exactly ONE verified sent occurrence. The former
               * `hist.filter(h => h.id !== hid)` removed EVERY record sharing
               * that id — including a hidden pending draft, and including a
               * second sent row the user did not select. */
              const next = hist.slice();
              next.splice(Number(hidx), 1);
              if (ENGINE_PM.saveHistory(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
              return;
            }
            return;
          }

          // Drafts manage
          if (cat === 'draft') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const didx = card.getAttribute('data-didx');
            const dsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-dsnap'));
            // Strict read: a corrupt collection must not be rewritten by delete.
            const rdD = ENGINE_PM.loadDraftsStrict();
            if (!rdD.ok) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }
            const drafts = rdD.list;
            const item = ENGINE_PM_verifyCaptureOccurrence(drafts, didx, dsnap);
            if (!item) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-dact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              convertToPrompt(item.text, act, 'From draft');
              return;
            }
            if (act === 'delete') {
              // Remove exactly ONE verified occurrence. Filtering by id would
              // delete every Drafts row sharing that id.
              const next = drafts.slice();
              next.splice(Number(didx), 1);
              if (ENGINE_PM.saveDrafts(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
              return;
            }
            return;
          }

          // Pasted manage
          if (cat === 'pasted') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const pidx = card.getAttribute('data-pidx');
            const psnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-psnap'));
            // Strict read: a corrupt collection must not be rewritten by delete.
            const rdP = ENGINE_PM.loadPastedStrict();
            if (!rdP.ok) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }
            const pasted = rdP.list;
            const item = ENGINE_PM_verifyCaptureOccurrence(pasted, pidx, psnap);
            if (!item) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-pact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              convertToPrompt(item.text, act, 'From pasted');
              return;
            }
            if (act === 'delete') {
              // Remove exactly ONE verified occurrence. Filtering by id would
              // delete every Pasted row sharing that id.
              const next = pasted.slice();
              next.splice(Number(pidx), 1);
              if (ENGINE_PM.savePasted(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
              return;
            }
            return;
          }

          // Quick manage
          if (cat === 'quick') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const qid = card.getAttribute('data-qid');
            const act = e.target.getAttribute('data-qact');
            if (!qid || !act) return;

            const idx = STATE_PM.data.quick.findIndex(q => q.id === qid);
            if (idx === -1) return;

            if (act === 'delete') {
              if (confirm('Delete this quick reply?')) {
                const next = STATE_PM.data.quick
                  .filter(q => q.id !== qid)
                  .map((q, i) => ({ ...q, order: i }));
                if (ENGINE_PM.commitQuick(next)) {
                  RENDER_PM.renderEdit(root, SEARCH_PM.get());
                  RENDER_PM.renderQuickTray(root);
                }
              }
              return;
            }
            if (act === 'edit') {
              const cur = STATE_PM.data.quick[idx];
              const newText = prompt('Edit quick reply:', cur.text || '');
              if (newText === null) return;
              const now = UTIL_now();
              const next = STATE_PM.data.quick.map(q =>
                (q.id === qid) ? { ...q, text: String(newText).trim(), updatedAt: now } : q
              );
              if (ENGINE_PM.commitQuick(next)) {
                RENDER_PM.renderEdit(root, SEARCH_PM.get());
                RENDER_PM.renderQuickTray(root);
              }
              return;
            }
            return;
          }

          // Move ▲▼ — slot-preserving within the visible subsequence.
          // The rendered order is the source of truth for what "adjacent" means;
          // filtered-out prompts keep their absolute index untouched.
          const moveBtn = e.target.closest(`.cgxui-${SkID}--move`);
          if (moveBtn) {
            e.stopPropagation();
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            const id = card?.getAttribute('data-id');
            const dir = moveBtn.getAttribute('data-act');
            if (!id || !dir) return;

            const visibleIds = Array.from(listEdit.children)
              .map(el => el.getAttribute?.('data-id'))
              .filter(v => typeof v === 'string' && v);

            const next = ENGINE_PM_reorderVisible(STATE_PM.data.prompts, visibleIds, id, dir);
            if (!next) return;                          // boundary / rejected input → no-op
            if (!ENGINE_PM.commitPrompts(next)) return; // persist before adopting

            UI_PM_renderBoth(root);
            const movedEl = listEdit.querySelector(`.cgxui-${SkID}--item[data-id="${CSS.escape(id)}"]`);
            RENDER_PM.flashMoved(movedEl);
            return;
          }

          // Favorite
          if (e.target.classList.contains(`cgxui-${SkID}--star`)) {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            toggleFavorite(card?.getAttribute('data-id'));
            return;
          }

          // Other actions
          const card = e.target.closest(`.cgxui-${SkID}--item`);
          if (!card) return;
          const id = card.getAttribute('data-id');
          const p = STATE_PM.data.prompts.find(x => x.id === id);
          if (!p) return;

          const act = e.target.getAttribute('data-act');
          if (!act) return;

          if (act === 'insert' || act === 'append') {
            DOM_setInputText(p.body, { append: act === 'append', autoSend: ENGINE_PM.getAutoSend() });
            touchPromptUpdatedAt(id);
            if (ENGINE_PM.getAutoSend()) closePanel();
            return;
          }

          if (act === 'delete') {
            if (confirm(`Delete prompt "${p.title}"?`)) {
              const next = STATE_PM.data.prompts.filter(x => x.id !== p.id);
              if (ENGINE_PM.commitPrompts(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
            }
            return;
          }

          if (act === 'edit') {
            const newTitle = prompt('Edit title:', p.title);
            if (newTitle === null) return;
            const newBody = prompt('Edit body:', p.body);
            if (newBody === null) return;
            const now = UTIL_now();
            const next = STATE_PM.data.prompts.map(x => (x.id === p.id)
              ? { ...x, title: String(newTitle).trim() || 'Untitled', body: String(newBody).trim(), updatedAt: now }
              : x);
            if (ENGINE_PM.commitPrompts(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
            return;
          }
        };

        listEdit.addEventListener('click', on);
        CLEAN_addFn(() => listEdit.removeEventListener('click', on));
      }

      // Add button
      const addBtn = DOM_q(UI_PM.selOwned(UI_PM_ADD_BTN), root);
      if (addBtn) {
        const on = () => {
          const addTitle = DOM_q(UI_PM.selOwned(UI_PM_ADD_TITLE), root);
          const addBody = DOM_q(UI_PM.selOwned(UI_PM_ADD_BODY), root);
          if (!addTitle || !addBody) return;

          const title = String(addTitle.value || '').trim();
          const body = String(addBody.value || '').trim();

          if (STATE_PM.ui.editCategory === 'quick') {
            if (!title) return alert('Enter quick reply text');
            const now = UTIL_now();
            const next = STATE_PM.data.quick.concat([{
              id: UTIL_cryptoId(), text: title, order: STATE_PM.data.quick.length, createdAt: now, updatedAt: now,
            }]);
            // Clear the field only once the entry is actually persisted.
            if (!ENGINE_PM.commitQuick(next)) return;
            addTitle.value = '';
            RENDER_PM.renderEdit(root, SEARCH_PM.get());
            RENDER_PM.renderQuickTray(root);
            return;
          }

          if (!title || !body) return alert('Fill title and body');

          const now = UTIL_now();
          const next = STATE_PM.data.prompts.concat([{
            id: UTIL_cryptoId(),
            title,
            body,
            favorite: false,
            type: (STATE_PM.ui.editCategory === 'append') ? 'append' : 'prompt',
            createdAt: now,
            updatedAt: now,
          }]);
          if (!ENGINE_PM.commitPrompts(next)) return;
          addTitle.value = '';
          addBody.value = '';
          UI_PM_renderBoth(root);
        };

        addBtn.addEventListener('click', on);
        CLEAN_addFn(() => addBtn.removeEventListener('click', on));
      }

      // Quick tray click: insert quick bubble
      if (tray) {
        const on = (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          const id = b.getAttribute('data-id');
          const q = STATE_PM.data.quick.find(x => x.id === id);
          if (!q) return;
          DOM_setInputText(q.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
        };
        tray.addEventListener('click', on);
        CLEAN_addFn(() => tray.removeEventListener('click', on));
      }

      // initial mode + render
      RENDER_PM.setMode(root, ENGINE_PM.getUiMode());
      RENDER_PM.setSimpleFilter(root, 'all');
      RENDER_PM.setEditCategory(root, 'all');
      SEARCH_PM.set('', root);
      UI_PM_renderBoth(root);
      RENDER_PM.renderQuickTray(root);
      if (tray && dot && CFG_PM.QUICK_TRAY_SHOW_ON_BOOT) {
        tray.classList.add(UI_PM_CLS_QSHOW);
        tray.setAttribute('aria-hidden', 'false');
        dot.classList.add(UI_PM_CLS_DOT_SHOW);
        UI_PM_scheduleFloatingLayout(root);
      }

      // capture wiring
      TIME_PM.ensureHistoryCapture();
      TIME_PM.attachDraftCaptureOnClose();
      TIME_PM.attachPastedCapture();

      if (!PM_READY_EMITTED) {
        PM_READY_EMITTED = true;
        const detail = { tok: TOK, pid: PID, skid: SkID, v: MOD_VERSION, api: MOD_OBJ.api };
        UTIL_event.emit(EV_PM_READY_V1, detail);
        UTIL_event.emit(EV_PM_READY_LEGACY_V1, detail);
      }
      PM_FORCE_RECOVER = false;
      CORE_PM_scheduleSelfHeal(80);
      UTIL_diagStep(`[BOOT][${MODTAG}] ready`);
    }, null);
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */
  function CORE_PM_dispose() {
    SAFE_try('CORE_PM_dispose', () => {
      if (!STATE_PM.booted) return;
      STATE_PM.booted = false;
      PM_DOCK_disable(STATE_PM.ui.root || UI_PM.getRoot());

      TIME_PM.resetHistoryCapture();

      // observers
      for (const o of STATE_PM.clean.obs.splice(0)) {
        SAFE_try('dispose.obs', () => o?.disconnect?.(), null);
      }
      PM_THEME_OBS = null;

      // timers — one-shots and intervals are owned separately and both drained
      for (const t of Array.from(STATE_PM.clean.timers)) {
        SAFE_try('dispose.timer', () => W.clearTimeout(t), null);
      }
      STATE_PM.clean.timers.clear();
      for (const iv of Array.from(STATE_PM.clean.intervals)) {
        SAFE_try('dispose.interval', () => W.clearInterval(iv), null);
      }
      STATE_PM.clean.intervals.clear();
      if (PM_BOOT_RETRY_TIMER) {
        SAFE_try('dispose.bootRetryTimer', () => W.clearTimeout(PM_BOOT_RETRY_TIMER), null);
        PM_BOOT_RETRY_TIMER = 0;
      }
      if (PM_SELF_HEAL_TIMER) {
        SAFE_try('dispose.selfHealTimer', () => W.clearTimeout(PM_SELF_HEAL_TIMER), null);
        PM_SELF_HEAL_TIMER = 0;
      }
      if (PM_LAYOUT_RAF) {
        SAFE_try('dispose.layoutRaf', () => W.cancelAnimationFrame(PM_LAYOUT_RAF), null);
        PM_LAYOUT_RAF = 0;
      }

      // listeners
      for (const fn of STATE_PM.clean.fns.splice(0)) {
        SAFE_try('dispose.fn', () => fn(), null);
      }

      // nodes
      for (const n of STATE_PM.clean.nodes.splice(0)) {
        SAFE_try('dispose.node', () => n?.remove?.(), null);
      }

      // reset refs
      STATE_PM.ui.root = null;
      STATE_PM.ui.panel = null;
      STATE_PM.ui.overlay = null;
      STATE_PM.ui.tooltip = null;
      STATE_PM.ui.pmClickTimer = 0;
      STATE_PM.ui.dockMode = false;
      STATE_PM.ui.dockBridgeWired = false;
      STATE_PM.ui.dockRegActive = false;

      UTIL_diagStep(`[DISPOSE][${MODTAG}] done`);
    }, null);
  }

  /* ───────────────────────────── ⚫️ BOOTSTRAP (no top-level DOM mutation beyond calling boot) ───────────────────────────── */
  // Contract allows boot call here because side-effects are inside CORE_PM_boot().
  CORE_PM_installSelfHealObserver();
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', CORE_PM_boot, { once: true });
  else CORE_PM_boot();

  // Optional: expose lifecycle on vault for internal debugging (not a promised public API)
  MOD_OBJ.core = MOD_OBJ.core || {};
  MOD_OBJ.core.boot = CORE_PM_boot;
  MOD_OBJ.core.dispose = CORE_PM_dispose;

  /* [API][PUBLIC] External API (for Control Hub + other modules) */
  function API_PM_findRoot() {
    return UI_PM.getRoot?.() || DOM_q(UI_PM.selOwned(UI_PM_WRAP));
  }

  function API_PM_findPanel(root) {
    const r = root || API_PM_findRoot();
    if (!r) return null;
    return r.querySelector(UI_PM.selOwned(UI_PM_PANEL));
  }

  function API_PM_findToggleBtn(root) {
    const r = root || API_PM_findRoot();
    if (!r) return null;
    return r.querySelector(UI_PM.selOwned(UI_PM_BTN));
  }

  function API_PM_findOverlay(root) {
    const r = root || API_PM_findRoot();
    if (!r) return null;
    return r.querySelector(UI_PM.selOwned(UI_PM_OVERLAY));
  }

  /* Panel-state methods act synchronously on real state. They deliberately do
   * NOT route through btn.click(): the human click path defers by
   * CFG_PM.CLICK_DELAY_MS to disambiguate double-click, which made these
   * methods return before anything happened and made two rapid calls collapse
   * into one.
   *
   * Return contract (unchanged for consumers, now actually truthful):
   *   open()   → true iff the panel is open afterwards
   *   close()  → true iff the panel is closed afterwards
   *   toggle() → the resulting open-state (true = now open) */
  function API_PM_isOpen() {
    return UI_PM_isPanelOpen();
  }

  function API_PM_open() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (API_PM_isOpen()) return true;
    UI_PM_openPanel();
    return API_PM_isOpen();
  }

  function API_PM_close() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (!API_PM_isOpen()) return true;
    UI_PM_closePanel();
    return !API_PM_isOpen();
  }

  function API_PM_toggle() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (API_PM_isOpen()) UI_PM_closePanel();
    else UI_PM_openPanel();
    return API_PM_isOpen();
  }

  function API_PM_focusSearch() {
    const root = API_PM_findRoot();
    if (!root) return false;
    // Open without stealing focus, then focus the input for the CURRENT mode —
    // focusing the Simple input while the Edit pane is shown is a silent no-op.
    if (!API_PM_isOpen()) UI_PM_openPanel({ focus: false });
    if (!API_PM_isOpen()) return false;
    const el = SEARCH_PM.activeInput(root);
    if (!el || typeof el.focus !== 'function') return false;
    el.focus();
    return D.activeElement === el;
  }

  // Optional: Quick Tray (if present)
  function API_PM_toggleQuickTray() {
    const root = API_PM_findRoot();
    if (!root) return false;
    const tray = root.querySelector(UI_PM.selOwned(UI_PM_QUICK_TRAY));
    if (!tray) return false;

    const btn = API_PM_findToggleBtn(root);
    if (btn) {
      try {
        btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return true;
      } catch {}
    }

    const dot = root.querySelector(UI_PM.selOwned(UI_PM_QUICK_MODE_DOT));
    const next = !tray.classList.contains(UI_PM_CLS_QSHOW);
    tray.classList.toggle(UI_PM_CLS_QSHOW, next);
    tray.setAttribute('aria-hidden', next ? 'false' : 'true');
    dot?.classList?.toggle?.(UI_PM_CLS_DOT_SHOW, next);
    return true;
  }

  // Publish stable API
  MOD_OBJ.api.open = API_PM_open;
  MOD_OBJ.api.close = API_PM_close;
  MOD_OBJ.api.toggle = API_PM_toggle;
  MOD_OBJ.api.isOpen = API_PM_isOpen;
  MOD_OBJ.api.focusSearch = API_PM_focusSearch;
  MOD_OBJ.api.toggleQuickTray = API_PM_toggleQuickTray;

  // Legacy-friendly alias for external consumers (no overwrite)
  W.H2O = W.H2O || {};
  W.H2O.PromptManager = W.H2O.PromptManager || {};
  Object.assign(W.H2O.PromptManager, MOD_OBJ.api);

})();
