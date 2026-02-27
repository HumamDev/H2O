// ==UserScript==
// @h2o-id      5a.prompt.manager
// @name         5A.⬜️✍️ Prompt Manager ✍️
// @namespace    https://h2o.dev/prime-manager
// @version      3.1.3
// @description  Prompt Manager (Simple + Settings/Edit), Quick Replies tray, History capture, Sortable reorder — Contract v2.0 Stage-1 compliant.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-end
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js
// ==/UserScript==

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
  const ATTR_ROLE = 'data-message-author-role';

  /* [DEFINE][STORE] Namespaces (boundary-only) */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  /* [DEFINE][EV] Canonical events */
  const EV_PM_READY_V1 = 'evt:h2o:promptmgr:ready';
  const EV_PM_CHANGED_V1 = 'evt:h2o:promptmgr:changed';
  // Legacy bridge (kept for older consumers, including Control Hub bridge code)
  const EV_PM_READY_LEGACY_V1 = 'evt:h2o:pm:ready:v1';
  const EV_PM_CHANGED_LEGACY_V1 = 'evt:h2o:pm:changed:v1';

  /* [STATE][EV] ready emitted guard */
  let PM_READY_EMITTED = false;


  /* [DEFINE][UI] UI tokens (SkID-based values) */
  const UI_PM_WRAP = `${SkID}-wrap`;
  const UI_PM_BTNBOX = `${SkID}-btnbox`;
  const UI_PM_BTN = `${SkID}-btn`;
  const UI_PM_PANEL = `${SkID}-panel`;
  const UI_PM_OVERLAY = `${SkID}-overlay`;

  const UI_PM_MODE_SIMPLE = `${SkID}-mode-simple`;
  const UI_PM_MODE_EDIT = `${SkID}-mode-edit`;

  const UI_PM_SEARCH = `${SkID}-search`;

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
    SEND_CLICK_DELAY_MS: 20,
    QUICK_TRAY_SHOW_ON_BOOT: true,
    HISTORY_MAX: 50,
    DRAFTS_MAX: 50,
    PASTED_MAX: 50,
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

  /* [DEFINE][KEY] Disk keys */
  const KEY_PM_STATE_PROMPTS_V1 = `${NS_DISK}:state:prompts:v1`;
  const KEY_PM_CFG_AUTOSEND_V1 = `${NS_DISK}:cfg:auto_send:v1`;
  const KEY_PM_STATE_LAST_USED_V1 = `${NS_DISK}:state:last_used_id:v1`;
  const KEY_PM_STATE_QUICK_V1 = `${NS_DISK}:state:quick_replies:v1`;
  const KEY_PM_STATE_HISTORY_V1 = `${NS_DISK}:state:history:v1`;
  const KEY_PM_STATE_DRAFTS_V1 = `${NS_DISK}:state:drafts:v1`;
  const KEY_PM_STATE_PASTED_V1 = `${NS_DISK}:state:pasted:v1`;
  const KEY_PM_UI_MODE_V1 = `${NS_DISK}:ui:mode:v1`;
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

  /* ───────────────────────────── 🔴 STATE — Registries / Caches 📄🔓💧 ───────────────────────────── */
  const STATE_PM = {
    booted: false,
    ui: {
      root: null,
      tooltip: null,
      pmClickTimer: 0,
      quickSendMode: false,
      quickReorderMode: false,
      simpleTypeFilter: 'all', // all|prompt|append|quick|history|draft|pasted
      editCategory: 'all',     // all|prompt|append|quick|history|draft|pasted
    },
    data: {
      prompts: [],
      quick: [],
    },
    sortable: {
      editList: null,
      quickTray: null,
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
      timers: [],
      nodes: [],
    },
  };

  const CLEAN_addFn = (fn) => { if (typeof fn === 'function') STATE_PM.clean.fns.push(fn); };
  const CLEAN_addTimer = (id) => { if (id) STATE_PM.clean.timers.push(id); };
  const CLEAN_addNode = (n) => { if (n) STATE_PM.clean.nodes.push(n); };
  const CLEAN_addObs = (o) => { if (o) STATE_PM.clean.obs.push(o); };

  let PM_BOOT_RETRY_TIMER = 0;
  let PM_SELF_HEAL_TIMER = 0;
  let PM_SELF_HEAL_OBS = null;
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
      try {
        const r = el.getBoundingClientRect();
        if (r.bottom >= (W.innerHeight * 0.45)) score += 2;
      } catch {}

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
  };

  const DOM_pickComposerSurface = () => {
    const cands = DOM_qa('[data-composer-surface="true"]');
    if (!cands.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of cands) {
      if (!DOM_isVisible(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width <= 0 || r.height <= 0) continue;

      let score = 0;
      if (r.bottom >= (W.innerHeight * 0.45)) score += 8;
      if (r.bottom <= (W.innerHeight + 24)) score += 2;
      if (r.width >= 300) score += 2;
      if (el.closest?.(SEL_PM.HOST_FORM)) score += 6;
      const distFromBottom = Math.abs(W.innerHeight - r.bottom);
      score += Math.max(0, 420 - distFromBottom) / 70;

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
    const bestSurface = DOM_pickComposerSurface();
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

    return DOM_clampAnchorRect(DOM_unionRect([rForm, rInput]) || rInput || rForm || null);
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
      const t = W.setTimeout(() => {
        SAFE_try('DOM_setInputText.autoSend', () => DOM_getSendButton()?.click(), null);
      }, CFG_PM.SEND_CLICK_DELAY_MS);
      CLEAN_addTimer(t);
    }

    return true;
  };

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES (pure) 📄🔓💧 ───────────────────────────── */
  const CSS_PM_TEXT = () => {
    const selScoped = (ui) => `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

    const WRAP = selScoped(UI_PM_WRAP);
    const BTNBOX = selScoped(UI_PM_BTNBOX);
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
    const CLS_DRAG = `.cgxui-${SkID}--drag`;
    const CLS_MOVE_BTNS = `.cgxui-${SkID}--movebtns`;
    const CLS_MOVE = `.cgxui-${SkID}--move`;

    const CLS_OVERLAY_SHOW = `.cgxui-${SkID}--overlay-show`;
    const CLS_PANEL_OPEN = `.cgxui-${SkID}--panel-open`;
    const CLS_QUICK_SHOW = `.cgxui-${SkID}--quick-show`;
    const CLS_DOT_SHOW = `.cgxui-${SkID}--dot-show`;
    const CLS_DOT_SEND = `.cgxui-${SkID}--dot-send`;
    const CLS_DOT_REORDER = `.cgxui-${SkID}--dot-reorder`;
    const CLS_QUICK_REORDER = `.cgxui-${SkID}--quick-reorder`;

    // Sortable class (external) — allowed, but styled safely within our subtree by scoping parent selector:
    const SORT_GHOST = `.sortable-ghost`;

    return `
:root{
  --cgxui-${SkID}-bg: rgba(18, 18, 18, 0.94);
  --cgxui-${SkID}-border: rgba(255,255,255,.08);
  --cgxui-${SkID}-text: rgba(220, 220, 220, 0.82);
  --cgxui-${SkID}-muted: rgba(180, 180, 180, 0.5);
  --cgxui-${SkID}-card: rgba(28, 29, 32, 0.85);
  --cgxui-${SkID}-input: rgba(24, 25, 28, 0.85);
  --cgxui-${SkID}-btn: rgba(38, 39, 45, .78);
  --cgxui-${SkID}-btn-hover: rgba(48, 50, 57, .82);
  --cgxui-${SkID}-accent: #9ca3af;
  --cgxui-${SkID}-shadow: 0 12px 40px rgba(0,0,0,.35);
  --cgxui-${SkID}-radius: 14px;
}
@media (prefers-color-scheme: light){
  :root{
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
  }
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

${BTNBOX}{
  position: absolute;
  top: 0;
  left: 0;
  z-index: ${CFG_PM.PANEL_Z};
  display: flex;
  align-items: center;
  gap: 6px;
}

${BTN}{
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
${BTN}:hover{
  opacity: 1;
  filter: brightness(1.08);
  box-shadow: 0 0 6px 2px rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.25);
}
${BTN}:active{ transform: scale(0.98); }

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
  color: ${CFG_PM.GLASS_TEXT};
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
  transition: opacity .22s ease, transform .22s ease;
  z-index: ${CFG_PM.PANEL_Z};
}
${PANEL}${CLS_PANEL_OPEN}{
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
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

${CLS_DRAG}{
  cursor: grab;
  line-height: 1;
  color: var(--cgxui-${SkID}-muted);
  padding: 0 6px;
  margin-right: 8px;
  font-size: 16px;
  opacity: 0.6;
  user-select: none;
  transition: transform .1s ease, color .15s ease, opacity .15s ease;
}
${CLS_DRAG}:hover{ color: var(--cgxui-${SkID}-text); opacity: .85; }
${CLS_DRAG}:active{ transform: scale(0.95); cursor: grabbing; }

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
${QUICK_TRAY}${CLS_QUICK_REORDER} button{ cursor: grab; }
${QUICK_TRAY}${CLS_QUICK_REORDER} button:active{ cursor: grabbing; }

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
${QUICK_DOT}${CLS_DOT_REORDER}{
  border-color: color-mix(in srgb, #3b82f6 65%, var(--cgxui-${SkID}-border));
  box-shadow: 0 0 5px rgba(59,130,246,0.9), 0 2px 7px rgba(0,0,0,0.38);
  filter: brightness(1.08);
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

/* Sortable ghost: scope via our panel */
${PANEL} ${SORT_GHOST}{
  opacity: 0.6;
  background: var(--cgxui-${SkID}-input);
  border: 1px dashed var(--cgxui-${SkID}-accent);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  transform: scale(1.02);
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
  const ENGINE_PM = {
    migrateKeysOnce() {
      SAFE_try('ENGINE_PM.migrateKeysOnce', () => {
        if (UTIL_storage.getStr(KEY_PM_MIG_KEYS_V1, '0') === '1') return;

        const pairs = [
          [KEY_PM_STATE_PROMPTS_V1, KEY_LEG_PROMPTS],
          [KEY_PM_CFG_AUTOSEND_V1, KEY_LEG_AUTOSEND],
          [KEY_PM_STATE_LAST_USED_V1, KEY_LEG_LAST_USED],
          [KEY_PM_STATE_QUICK_V1, KEY_LEG_QUICK],
          [KEY_PM_STATE_HISTORY_V1, KEY_LEG_HISTORY],
          [KEY_PM_UI_MODE_V1, KEY_LEG_MODE],
        ];

        for (const [kNew, kOld] of pairs) {
          const vNew = UTIL_storage.getStr(kNew, null);
          if (vNew == null || vNew === '') {
            const vOld = UTIL_storage.getStr(kOld, null);
            if (vOld != null && vOld !== '') UTIL_storage.setStr(kNew, vOld);
          }
          UTIL_storage.del(kOld);
        }

        UTIL_storage.setStr(KEY_PM_MIG_KEYS_V1, '1');
      }, null);
    },

    migrateDraftsFromHistoryOnce() {
      SAFE_try('ENGINE_PM.migrateDraftsFromHistoryOnce', () => {
        if (UTIL_storage.getStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '0') === '1') return;

        const histRaw = UTIL_storage.getJSON(KEY_PM_STATE_HISTORY_V1, []);
        const hist = Array.isArray(histRaw) ? histRaw : [];
        const keep = [];
        let drafts = ENGINE_PM.loadDrafts();

        for (const it of hist) {
          const source = String(it?.source || '').toLowerCase();
          const text = String(it?.text || '').trim();
          if (!text) continue;
          if (source === 'draft') {
            const last = drafts[drafts.length - 1];
            if (last && last.text === text) continue;
            drafts.push({
              id: String(it?.id || UTIL_cryptoId()),
              text,
              createdAt: Number(it?.createdAt) || UTIL_now(),
            });
            continue;
          }
          keep.push(it);
        }

        if (drafts.length > CFG_PM.DRAFTS_MAX) drafts = drafts.slice(drafts.length - CFG_PM.DRAFTS_MAX);
        ENGINE_PM.saveDrafts(drafts);
        ENGINE_PM.saveHistory(keep);
        UTIL_storage.setStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '1');
      }, null);
    },

    defaultPromptsSeed() {
      const now = UTIL_now();
      return [
        { id: UTIL_cryptoId(), title: 'G: (grammar only)', body: 'G:', favorite: true, type: 'append', createdAt: now, updatedAt: now },
        { id: UTIL_cryptoId(), title: 'Deep Dive', body: 'Give a structured deep dive on this topic…', favorite: false, type: 'prompt', createdAt: now, updatedAt: now },
      ];
    },

    loadPrompts() {
      return SAFE_try('ENGINE_PM.loadPrompts', () => {
        const arr = UTIL_storage.getJSON(KEY_PM_STATE_PROMPTS_V1, null);
        if (!Array.isArray(arr) || arr.length === 0) {
          const seeded = ENGINE_PM.defaultPromptsSeed();
          UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, seeded);
          return seeded;
        }
        let changed = false;
        for (const p of arr) {
          if (!p.type) { p.type = 'prompt'; changed = true; }
          if (!p.createdAt) { p.createdAt = UTIL_now(); changed = true; }
          if (!p.updatedAt) { p.updatedAt = UTIL_now(); changed = true; }
        }
        if (changed) UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, arr);
        return arr;
      }, []);
    },

    savePrompts(list) {
      SAFE_try('ENGINE_PM.savePrompts', () => {
        UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, Array.isArray(list) ? list : []);
        UTIL_emitPmChanged({ what: 'prompts' });
      }, null);
    },

    getAutoSend() {
      return UTIL_storage.getStr(KEY_PM_CFG_AUTOSEND_V1, '0') === '1';
    },
    setAutoSend(on) {
      UTIL_storage.setStr(KEY_PM_CFG_AUTOSEND_V1, on ? '1' : '0');
      UTIL_emitPmChanged({ what: 'autosend', on: !!on });
    },

    loadHistory() {
      return SAFE_try('ENGINE_PM.loadHistory', () => {
        const arr = UTIL_storage.getJSON(KEY_PM_STATE_HISTORY_V1, []);
        if (!Array.isArray(arr)) return [];
        let changed = false;
        const out = [];
        for (const h of arr) {
          const text = String(h?.text || '').trim();
          if (!text) { changed = true; continue; }
          const source = String(h?.source || '').toLowerCase();
          if (source === 'draft') { changed = true; continue; } // drafts moved to Drafts bucket
          const id = String(h?.id || UTIL_cryptoId());
          const createdAt = Number(h?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt, source: 'send' });
          if (h?.id !== id || h?.createdAt !== createdAt || h?.source !== 'send' || h?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.HISTORY_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.HISTORY_MAX);
        }
        if (changed) UTIL_storage.setJSON(KEY_PM_STATE_HISTORY_V1, out);
        return out;
      }, []);
    },
    saveHistory(list) {
      SAFE_try('ENGINE_PM.saveHistory', () => {
        UTIL_storage.setJSON(KEY_PM_STATE_HISTORY_V1, Array.isArray(list) ? list : []);
      }, null);
    },
    pushHistory(text) {
      SAFE_try('ENGINE_PM.pushHistory', () => {
        const clean = String(text || '').trim();
        if (!clean) return;

        let hist = ENGINE_PM.loadHistory();
        const last = hist[hist.length - 1];
        if (last && last.text === clean) return;

        hist.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now(), source: 'send' });
        if (hist.length > CFG_PM.HISTORY_MAX) hist = hist.slice(hist.length - CFG_PM.HISTORY_MAX);

        ENGINE_PM.saveHistory(hist);
        UTIL_diagStep(`[HIST][${MODTAG}] capture`, `send:${clean.length}`);
      }, null);
    },

    loadDrafts() {
      return SAFE_try('ENGINE_PM.loadDrafts', () => {
        const arr = UTIL_storage.getJSON(KEY_PM_STATE_DRAFTS_V1, []);
        if (!Array.isArray(arr)) return [];
        let changed = false;
        const out = [];
        for (const d of arr) {
          const text = String(d?.text || '').trim();
          if (!text) { changed = true; continue; }
          const id = String(d?.id || UTIL_cryptoId());
          const createdAt = Number(d?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt });
          if (d?.id !== id || d?.createdAt !== createdAt || d?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.DRAFTS_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.DRAFTS_MAX);
        }
        if (changed) UTIL_storage.setJSON(KEY_PM_STATE_DRAFTS_V1, out);
        return out;
      }, []);
    },
    saveDrafts(list) {
      SAFE_try('ENGINE_PM.saveDrafts', () => {
        UTIL_storage.setJSON(KEY_PM_STATE_DRAFTS_V1, Array.isArray(list) ? list : []);
      }, null);
    },
    pushDraft(text) {
      SAFE_try('ENGINE_PM.pushDraft', () => {
        const clean = String(text || '').trim();
        if (!clean) return;
        let drafts = ENGINE_PM.loadDrafts();
        const last = drafts[drafts.length - 1];
        if (last && last.text === clean) return;
        drafts.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now() });
        if (drafts.length > CFG_PM.DRAFTS_MAX) drafts = drafts.slice(drafts.length - CFG_PM.DRAFTS_MAX);
        ENGINE_PM.saveDrafts(drafts);
        UTIL_diagStep(`[DRF][${MODTAG}] capture`, `${clean.length}`);
      }, null);
    },

    loadPasted() {
      return SAFE_try('ENGINE_PM.loadPasted', () => {
        const arr = UTIL_storage.getJSON(KEY_PM_STATE_PASTED_V1, []);
        if (!Array.isArray(arr)) return [];
        let changed = false;
        const out = [];
        for (const p of arr) {
          const text = String(p?.text || '').trim();
          if (!text) { changed = true; continue; }
          const id = String(p?.id || UTIL_cryptoId());
          const createdAt = Number(p?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt });
          if (p?.id !== id || p?.createdAt !== createdAt || p?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.PASTED_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.PASTED_MAX);
        }
        if (changed) UTIL_storage.setJSON(KEY_PM_STATE_PASTED_V1, out);
        return out;
      }, []);
    },
    savePasted(list) {
      SAFE_try('ENGINE_PM.savePasted', () => {
        UTIL_storage.setJSON(KEY_PM_STATE_PASTED_V1, Array.isArray(list) ? list : []);
      }, null);
    },
    pushPasted(text) {
      SAFE_try('ENGINE_PM.pushPasted', () => {
        const clean = String(text || '').trim();
        if (!clean) return;
        let pasted = ENGINE_PM.loadPasted();
        const last = pasted[pasted.length - 1];
        if (last && last.text === clean) return;
        pasted.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now() });
        if (pasted.length > CFG_PM.PASTED_MAX) pasted = pasted.slice(pasted.length - CFG_PM.PASTED_MAX);
        ENGINE_PM.savePasted(pasted);
        UTIL_diagStep(`[PST][${MODTAG}] capture`, `${clean.length}`);
      }, null);
    },

    loadQuick() {
      return SAFE_try('ENGINE_PM.loadQuick', () => {
        let arr = UTIL_storage.getJSON(KEY_PM_STATE_QUICK_V1, null);
        if (!Array.isArray(arr) || arr.length === 0) {
          const now = UTIL_now();
          const base = ['Yes', 'No', 'Continue', 'Next'];
          arr = base.map((text, idx) => ({
            id: UTIL_cryptoId(), text, order: idx, createdAt: now, updatedAt: now,
          }));
          UTIL_storage.setJSON(KEY_PM_STATE_QUICK_V1, arr);
          return arr;
        }
        arr.forEach((q, idx) => { if (typeof q.order !== 'number') q.order = idx; });
        return arr.sort((a, b) => a.order - b.order);
      }, []);
    },
    saveQuick(list) {
      SAFE_try('ENGINE_PM.saveQuick', () => {
        UTIL_storage.setJSON(KEY_PM_STATE_QUICK_V1, Array.isArray(list) ? list : []);
        UTIL_emitPmChanged({ what: 'quick' });
      }, null);
    },

    getUiMode() { return UTIL_storage.getStr(KEY_PM_UI_MODE_V1, 'simple') || 'simple'; },
    setUiMode(m) { UTIL_storage.setStr(KEY_PM_UI_MODE_V1, (m === 'edit') ? 'edit' : 'simple'); },
  };

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
          if (String(raw || '').trim()) {
            ENGINE_PM.pushPasted(raw);
            return;
          }

          // Fallback: read the resulting input content after native paste commits.
          const tm = W.setTimeout(() => {
            const current = DOM_getEditableInput() || input;
            if (!current) return;
            const isCE = current.getAttribute && current.getAttribute('contenteditable') === 'true';
            const txt = (isCE ? current.innerText : current.value) || '';
            ENGINE_PM.pushPasted(txt);
          }, 0);
          CLEAN_addTimer(tm);
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
        const form = DOM_getForm();
        if (!form) return null;

        const existing = UI_PM.getRoot();
        if (existing) return existing;

        const wrap = D.createElement('div');
        wrap.setAttribute(ATTR_CGXUI, UI_PM_WRAP);
        wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

        wrap.innerHTML = `
          <div ${ATTR_CGXUI}="${UI_PM_BTNBOX}" ${ATTR_CGXUI_OWNER}="${SkID}">
            <button type="button" ${ATTR_CGXUI}="${UI_PM_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}">Prompts</button>
            <div ${ATTR_CGXUI}="${UI_PM_QUICK_TRAY}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true"></div>
            <button type="button" ${ATTR_CGXUI}="${UI_PM_QUICK_MODE_DOT}" ${ATTR_CGXUI_OWNER}="${SkID}" title="Quick replies: append only">•</button>
          </div>

          <div ${ATTR_CGXUI}="${UI_PM_OVERLAY}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true"></div>

          <div ${ATTR_CGXUI}="${UI_PM_PANEL}" ${ATTR_CGXUI_OWNER}="${SkID}">
            <div ${ATTR_CGXUI}="${UI_PM_MODE_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}">
              <div class="cgxui-${SkID}--top">
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_SEARCH}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Search prompts…" />
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
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_SEARCH}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Search prompts…" />
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

  function UI_PM_placeFloatingRoot(root) {
    SAFE_try('UI_PM.placeFloatingRoot', () => {
      if (!root || !D.contains(root)) return;
      const btnBox = DOM_q(UI_PM.selOwned(UI_PM_BTNBOX), root);
      if (!btnBox) return;

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
          const history = ENGINE_PM.loadHistory()
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .filter(h => !q || String(h.text || '').toLowerCase().includes(q));

          if (history.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No history yet. Send a message and it will appear here.</div>`;
            return;
          }

          list.innerHTML = history.map(h => {
            const t = String(h.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-hid="${UTIL_escapeHtml(h.id)}">
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
          const drafts = ENGINE_PM.loadDrafts()
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .filter(d => !q || String(d.text || '').toLowerCase().includes(q));

          if (drafts.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No drafts yet. Unsent text is saved when you close or reload the page.</div>`;
            return;
          }

          list.innerHTML = drafts.map(d => {
            const t = String(d.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-did="${UTIL_escapeHtml(d.id)}">
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
          const pasted = ENGINE_PM.loadPasted()
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .filter(p => !q || String(p.text || '').toLowerCase().includes(q));

          if (pasted.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No pasted text yet. Paste in the input bar and it will appear here.</div>`;
            return;
          }

          list.innerHTML = pasted.map(p => {
            const t = String(p.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-pstid="${UTIL_escapeHtml(p.id)}">
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
          const history = ENGINE_PM.loadHistory()
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .filter(h => !q || String(h.text || '').toLowerCase().includes(q));

          list.innerHTML = (history.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No history yet. Messages you send will appear here automatically.</div>`
            : history.map(h => {
              const t = String(h.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-hid="${UTIL_escapeHtml(h.id)}">
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
          const drafts = ENGINE_PM.loadDrafts()
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .filter(d => !q || String(d.text || '').toLowerCase().includes(q));

          list.innerHTML = (drafts.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No drafts yet. Unsent text is saved when you close or reload the page.</div>`
            : drafts.map(d => {
              const t = String(d.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-did="${UTIL_escapeHtml(d.id)}">
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
          const pasted = ENGINE_PM.loadPasted()
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .filter(p => !q || String(p.text || '').toLowerCase().includes(q));

          list.innerHTML = (pasted.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No pasted text yet. Paste in the input bar and it will appear here.</div>`
            : pasted.map(p => {
              const t = String(p.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-pstid="${UTIL_escapeHtml(p.id)}">
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
                  <span class="cgxui-${SkID}--drag" title="Drag to reorder">⋮</span>
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

  /* ───────────────────────────── 🟨 TIME — Sortable Wiring 📝🔓💥 ───────────────────────────── */
  const SORT_PM = {
    initEditSortable(root) {
      SAFE_try('SORT_PM.initEditSortable', () => {
        const listEl = DOM_q(UI_PM.selOwned(UI_PM_LIST_EDIT), root);
        if (!listEl) return;
        if (STATE_PM.sortable.editList) return;

        const ensureSortable = () => {
          if (!W.Sortable) return false;
          const s = W.Sortable.create(listEl, {
            handle: `.cgxui-${SkID}--drag`,
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: `.cgxui-${SkID}--move, .cgxui-${SkID}--btn, .cgxui-${SkID}--star, input, button, textarea, select, a`,
            preventOnFilter: true,
            onEnd(evt) {
              SAFE_try('Sortable.onEnd', () => {
                const newOrder = Array.from(evt.to.children).map(el => el.getAttribute('data-id')).filter(Boolean);
                STATE_PM.data.prompts.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
                ENGINE_PM.savePrompts(STATE_PM.data.prompts);
                RENDER_PM.flashMoved(evt.item);
              }, null);
            },
          });
          STATE_PM.sortable.editList = s;
          CLEAN_addFn(() => { try { s.destroy(); } catch {} STATE_PM.sortable.editList = null; });
          return true;
        };

        if (!ensureSortable()) {
          const t = W.setTimeout(() => SORT_PM.initEditSortable(root), 250);
          CLEAN_addTimer(t);
        }
      }, null);
    },

    initQuickSortable(root) {
      SAFE_try('SORT_PM.initQuickSortable', () => {
        const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);
        if (!tray) return;
        if (STATE_PM.sortable.quickTray) return;

        const ensureSortable = () => {
          if (!W.Sortable) return false;
          const s = W.Sortable.create(tray, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            handle: 'button',
            disabled: true,
            onEnd() {
              SAFE_try('QuickSortable.onEnd', () => {
                const ids = Array.from(tray.children).map(el => el.getAttribute('data-id')).filter(Boolean);
                for (const q of STATE_PM.data.quick) q.order = ids.indexOf(q.id);
                ENGINE_PM.saveQuick(STATE_PM.data.quick);
              }, null);
            },
          });
          STATE_PM.sortable.quickTray = s;
          CLEAN_addFn(() => { try { s.destroy(); } catch {} STATE_PM.sortable.quickTray = null; });
          return true;
        };

        if (!ensureSortable()) {
          const t = W.setTimeout(() => SORT_PM.initQuickSortable(root), 250);
          CLEAN_addTimer(t);
        }
      }, null);
    },

    setQuickReorderMode(root, on) {
      STATE_PM.ui.quickReorderMode = !!on;
      const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);
      const dot = DOM_q(UI_PM.selOwned(UI_PM_QUICK_MODE_DOT), root);

      if (tray) tray.classList.toggle(`cgxui-${SkID}--quick-reorder`, STATE_PM.ui.quickReorderMode);

      const s = STATE_PM.sortable.quickTray;
      if (s && typeof s.option === 'function') {
        SAFE_try('QuickSortable.option', () => s.option('disabled', !STATE_PM.ui.quickReorderMode), null);
      }

      if (dot) dot.classList.toggle(`cgxui-${SkID}--dot-reorder`, STATE_PM.ui.quickReorderMode);
    },
  };

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */
  function CORE_PM_scheduleBootRetry(delayMs = 240) {
    if (STATE_PM.booted) return;
    if (PM_BOOT_RETRY_TIMER) return;
    const wait = Math.max(80, Number(delayMs) || 240);
    PM_BOOT_RETRY_TIMER = W.setTimeout(() => {
      PM_BOOT_RETRY_TIMER = 0;
      if (!STATE_PM.booted) CORE_PM_boot();
    }, wait);
  }

  function CORE_PM_scheduleSelfHeal(delayMs = 120) {
    if (PM_SELF_HEAL_TIMER) return;
    const wait = Math.max(0, Number(delayMs) || 0);
    PM_SELF_HEAL_TIMER = W.setTimeout(() => {
      PM_SELF_HEAL_TIMER = 0;
      const hasRoot = !!UI_PM.getRoot();
      const hasForm = !!DOM_getForm();
      const root = STATE_PM.ui.root || UI_PM.getRoot();
      if (root) UI_PM_scheduleFloatingLayout(root);
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
      try { PM_SELF_HEAL_OBS.observe(D.body || D.documentElement, { childList: true, subtree: true }); } catch {}
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
      ENGINE_PM.migrateKeysOnce();
      ENGINE_PM.migrateDraftsFromHistoryOnce();

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

      // cache nodes
      const panel = DOM_q(UI_PM.selOwned(UI_PM_PANEL), root);
      const overlay = DOM_q(UI_PM.selOwned(UI_PM_OVERLAY), root);
      const btn = DOM_q(UI_PM.selOwned(UI_PM_BTN), root);
      const search = root.querySelector(UI_PM.selOwned(UI_PM_SEARCH));
      const autoSimple = DOM_q(UI_PM.selOwned(UI_PM_AUTOSEND_SIMPLE), root);
      const autoEdit = DOM_q(UI_PM.selOwned(UI_PM_AUTOSEND_EDIT), root);
      const dot = DOM_q(UI_PM.selOwned(UI_PM_QUICK_MODE_DOT), root);
      const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);

      let resizeBurstTimer = 0;
      let resizeBurstUntil = 0;

      const onLayout = () => UI_PM_scheduleFloatingLayout(root);
      const onResizeBurst = () => {
        resizeBurstUntil = performance.now() + 1100;
        onLayout();
        if (resizeBurstTimer) return;
        resizeBurstTimer = W.setInterval(() => {
          if (performance.now() > resizeBurstUntil) {
            W.clearInterval(resizeBurstTimer);
            resizeBurstTimer = 0;
            return;
          }
          onLayout();
        }, 70);
      };

      W.addEventListener('resize', onLayout, { passive: true });
      W.addEventListener('scroll', onLayout, { passive: true });
      W.addEventListener('resize', onResizeBurst, { passive: true });
      CLEAN_addFn(() => W.removeEventListener('resize', onLayout));
      CLEAN_addFn(() => W.removeEventListener('scroll', onLayout));
      CLEAN_addFn(() => W.removeEventListener('resize', onResizeBurst));
      CLEAN_addFn(() => {
        if (resizeBurstTimer) {
          W.clearInterval(resizeBurstTimer);
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
      UI_PM_scheduleFloatingLayout(root);

      const getPanelOpen = () => !!panel?.classList.contains(UI_PM_CLS_OPEN);
      const openPanel = () => {
        if (!panel || !overlay) return;
        panel.classList.add(UI_PM_CLS_OPEN);
        overlay.classList.add(UI_PM_CLS_OVSHOW);
        const mode = ENGINE_PM.getUiMode();
        RENDER_PM.setMode(root, mode);
        RENDER_PM.renderSimple(root, search?.value || '');
        RENDER_PM.renderEdit(root, search?.value || '');
        SORT_PM.initEditSortable(root);
        search?.focus?.();
      };
      const closePanel = () => {
        if (!panel || !overlay) return;
        panel.classList.remove(UI_PM_CLS_OPEN);
        overlay.classList.remove(UI_PM_CLS_OVSHOW);
      };

      // ESC
      TIME_PM.attachEscClose(getPanelOpen, closePanel);

      // Overlay click closes
      if (overlay) {
        const onOv = () => closePanel();
        overlay.addEventListener('click', onOv);
        CLEAN_addFn(() => overlay.removeEventListener('click', onOv));
      }

      // Main button click (single) + dblclick (quick tray)
      if (btn) {
        const onClick = () => {
          if (STATE_PM.ui.pmClickTimer) return;
          STATE_PM.ui.pmClickTimer = W.setTimeout(() => {
            STATE_PM.ui.pmClickTimer = 0;
            getPanelOpen() ? closePanel() : openPanel();
          }, CFG_PM.CLICK_DELAY_MS);
          CLEAN_addTimer(STATE_PM.ui.pmClickTimer);
        };
        const onDbl = (e) => {
          e.preventDefault();
          if (STATE_PM.ui.pmClickTimer) {
            W.clearTimeout(STATE_PM.ui.pmClickTimer);
            STATE_PM.ui.pmClickTimer = 0;
          }
          // toggle quick tray visibility
          if (!tray || !dot) return;
          const show = !tray.classList.contains(UI_PM_CLS_QSHOW);
          tray.classList.toggle(UI_PM_CLS_QSHOW, show);
          tray.setAttribute('aria-hidden', show ? 'false' : 'true');
          dot.classList.toggle(UI_PM_CLS_DOT_SHOW, show);
          UI_PM_scheduleFloatingLayout(root);

          if (show) {
            RENDER_PM.renderQuickTray(root);
            SORT_PM.initQuickSortable(root);
          } else {
            SORT_PM.setQuickReorderMode(root, false);
          }
        };

        btn.addEventListener('click', onClick);
        btn.addEventListener('dblclick', onDbl);
        CLEAN_addFn(() => btn.removeEventListener('click', onClick));
        CLEAN_addFn(() => btn.removeEventListener('dblclick', onDbl));
      }

      // Search input
      if (search) {
        const onInput = () => {
          RENDER_PM.renderSimple(root, search.value);
          RENDER_PM.renderEdit(root, search.value);
        };
        search.addEventListener('input', onInput);
        CLEAN_addFn(() => search.removeEventListener('input', onInput));
      }

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
        const on = () => { RENDER_PM.setSimpleFilter(root, type); RENDER_PM.renderSimple(root, search?.value || ''); };
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
        const on = () => { RENDER_PM.setEditCategory(root, type); RENDER_PM.renderEdit(root, search?.value || ''); SORT_PM.initEditSortable(root); };
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
        const on = () => { RENDER_PM.setMode(root, 'edit'); RENDER_PM.renderEdit(root, search?.value || ''); SORT_PM.initEditSortable(root); };
        btnSettings.addEventListener('click', on);
        CLEAN_addFn(() => btnSettings.removeEventListener('click', on));
      }
      if (btnBack) {
        const on = () => { RENDER_PM.setMode(root, 'simple'); RENDER_PM.renderSimple(root, search?.value || ''); };
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

      // Quick dot: click = send mode, dblclick = reorder mode
      if (dot) {
        const onClick = () => {
          STATE_PM.ui.quickSendMode = !STATE_PM.ui.quickSendMode;
          dot.classList.toggle(`cgxui-${SkID}--dot-send`, STATE_PM.ui.quickSendMode);
          dot.title = STATE_PM.ui.quickSendMode ? 'Quick replies: send immediately' : 'Quick replies: append only';
        };
        const onDbl = (e) => {
          e.preventDefault();
          SORT_PM.setQuickReorderMode(root, !STATE_PM.ui.quickReorderMode);
        };
        dot.addEventListener('click', onClick);
        dot.addEventListener('dblclick', onDbl);
        CLEAN_addFn(() => dot.removeEventListener('click', onClick));
        CLEAN_addFn(() => dot.removeEventListener('dblclick', onDbl));
      }

      // Click handling: Simple list
      const listSimple = DOM_q(UI_PM.selOwned(UI_PM_LIST_SIMPLE), root);
      if (listSimple) {
        const on = (e) => {
          const filter = STATE_PM.ui.simpleTypeFilter;

          // History actions
          if (filter === 'history') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const hid = card.getAttribute('data-hid');
            const hist = ENGINE_PM.loadHistory();
            const item = hist.find(h => h.id === hid);
            if (!item) return;

            const act = e.target.getAttribute('data-hact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              const now = UTIL_now();
              STATE_PM.data.prompts.push({
                id: UTIL_cryptoId(),
                title: (String(item.text || '').slice(0, 40) || 'From history'),
                body: item.text,
                favorite: false,
                type: (act === 'append') ? 'append' : 'prompt',
                createdAt: now,
                updatedAt: now,
              });
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
              return;
            }
            return;
          }

          // Draft actions
          if (filter === 'draft') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const did = card.getAttribute('data-did');
            const drafts = ENGINE_PM.loadDrafts();
            const item = drafts.find(d => d.id === did);
            if (!item) return;

            const act = e.target.getAttribute('data-dact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              const now = UTIL_now();
              STATE_PM.data.prompts.push({
                id: UTIL_cryptoId(),
                title: (String(item.text || '').slice(0, 40) || 'From draft'),
                body: item.text,
                favorite: false,
                type: (act === 'append') ? 'append' : 'prompt',
                createdAt: now,
                updatedAt: now,
              });
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
              return;
            }
            return;
          }

          // Pasted actions
          if (filter === 'pasted') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const pstid = card.getAttribute('data-pstid');
            const pasted = ENGINE_PM.loadPasted();
            const item = pasted.find(p => p.id === pstid);
            if (!item) return;

            const act = e.target.getAttribute('data-pact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              const now = UTIL_now();
              STATE_PM.data.prompts.push({
                id: UTIL_cryptoId(),
                title: (String(item.text || '').slice(0, 40) || 'From pasted'),
                body: item.text,
                favorite: false,
                type: (act === 'append') ? 'append' : 'prompt',
                createdAt: now,
                updatedAt: now,
              });
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
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
            const id = card?.getAttribute('data-id');
            const p = STATE_PM.data.prompts.find(x => x.id === id);
            if (!p) return;
            p.favorite = !p.favorite;
            p.updatedAt = UTIL_now();
            ENGINE_PM.savePrompts(STATE_PM.data.prompts);
            RENDER_PM.renderSimple(root, search?.value || '');
            RENDER_PM.renderEdit(root, search?.value || '');
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
          p.updatedAt = UTIL_now();
          ENGINE_PM.savePrompts(STATE_PM.data.prompts);
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
            const hid = card.getAttribute('data-hid');
            let hist = ENGINE_PM.loadHistory();
            const idx = hist.findIndex(h => h.id === hid);
            if (idx === -1) return;
            const item = hist[idx];

            const act = e.target.getAttribute('data-hact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              const now = UTIL_now();
              STATE_PM.data.prompts.push({
                id: UTIL_cryptoId(),
                title: (String(item.text || '').slice(0, 40) || 'From history'),
                body: item.text,
                favorite: false,
                type: (act === 'append') ? 'append' : 'prompt',
                createdAt: now,
                updatedAt: now,
              });
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
              return;
            }
            if (act === 'delete') {
              hist.splice(idx, 1);
              ENGINE_PM.saveHistory(hist);
              RENDER_PM.renderEdit(root, search?.value || '');
              return;
            }
            return;
          }

          // Drafts manage
          if (cat === 'draft') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const did = card.getAttribute('data-did');
            let drafts = ENGINE_PM.loadDrafts();
            const idx = drafts.findIndex(d => d.id === did);
            if (idx === -1) return;
            const item = drafts[idx];

            const act = e.target.getAttribute('data-dact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              const now = UTIL_now();
              STATE_PM.data.prompts.push({
                id: UTIL_cryptoId(),
                title: (String(item.text || '').slice(0, 40) || 'From draft'),
                body: item.text,
                favorite: false,
                type: (act === 'append') ? 'append' : 'prompt',
                createdAt: now,
                updatedAt: now,
              });
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
              return;
            }
            if (act === 'delete') {
              drafts.splice(idx, 1);
              ENGINE_PM.saveDrafts(drafts);
              RENDER_PM.renderEdit(root, search?.value || '');
              return;
            }
            return;
          }

          // Pasted manage
          if (cat === 'pasted') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const pstid = card.getAttribute('data-pstid');
            let pasted = ENGINE_PM.loadPasted();
            const idx = pasted.findIndex(p => p.id === pstid);
            if (idx === -1) return;
            const item = pasted[idx];

            const act = e.target.getAttribute('data-pact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              const now = UTIL_now();
              STATE_PM.data.prompts.push({
                id: UTIL_cryptoId(),
                title: (String(item.text || '').slice(0, 40) || 'From pasted'),
                body: item.text,
                favorite: false,
                type: (act === 'append') ? 'append' : 'prompt',
                createdAt: now,
                updatedAt: now,
              });
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
              return;
            }
            if (act === 'delete') {
              pasted.splice(idx, 1);
              ENGINE_PM.savePasted(pasted);
              RENDER_PM.renderEdit(root, search?.value || '');
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
                STATE_PM.data.quick.splice(idx, 1);
                STATE_PM.data.quick.forEach((q, i) => { q.order = i; });
                ENGINE_PM.saveQuick(STATE_PM.data.quick);
                RENDER_PM.renderEdit(root, search?.value || '');
                RENDER_PM.renderQuickTray(root);
              }
              return;
            }
            if (act === 'edit') {
              const cur = STATE_PM.data.quick[idx];
              const newText = prompt('Edit quick reply:', cur.text || '');
              if (newText === null) return;
              cur.text = String(newText).trim();
              cur.updatedAt = UTIL_now();
              ENGINE_PM.saveQuick(STATE_PM.data.quick);
              RENDER_PM.renderEdit(root, search?.value || '');
              RENDER_PM.renderQuickTray(root);
              return;
            }
            return;
          }

          // Move ▲▼
          const moveBtn = e.target.closest(`.cgxui-${SkID}--move`);
          if (moveBtn) {
            e.stopPropagation();
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            const id = card?.getAttribute('data-id');
            const dir = moveBtn.getAttribute('data-act');
            if (!id || !dir) return;

            const idx = STATE_PM.data.prompts.findIndex(x => x.id === id);
            if (idx === -1) return;

            if (dir === 'up' && idx > 0) {
              const [it] = STATE_PM.data.prompts.splice(idx, 1);
              STATE_PM.data.prompts.splice(idx - 1, 0, it);
            } else if (dir === 'down' && idx < STATE_PM.data.prompts.length - 1) {
              const [it] = STATE_PM.data.prompts.splice(idx, 1);
              STATE_PM.data.prompts.splice(idx + 1, 0, it);
            } else return;

            ENGINE_PM.savePrompts(STATE_PM.data.prompts);
            RENDER_PM.renderSimple(root, search?.value || '');
            RENDER_PM.renderEdit(root, search?.value || '');
            const movedEl = listEdit.querySelector(`.cgxui-${SkID}--item[data-id="${CSS.escape(id)}"]`);
            RENDER_PM.flashMoved(movedEl);
            return;
          }

          // Favorite
          if (e.target.classList.contains(`cgxui-${SkID}--star`)) {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            const id = card?.getAttribute('data-id');
            const p = STATE_PM.data.prompts.find(x => x.id === id);
            if (!p) return;
            p.favorite = !p.favorite;
            p.updatedAt = UTIL_now();
            ENGINE_PM.savePrompts(STATE_PM.data.prompts);
            RENDER_PM.renderSimple(root, search?.value || '');
            RENDER_PM.renderEdit(root, search?.value || '');
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
            p.updatedAt = UTIL_now();
            ENGINE_PM.savePrompts(STATE_PM.data.prompts);
            if (ENGINE_PM.getAutoSend()) closePanel();
            return;
          }

          if (act === 'delete') {
            if (confirm(`Delete prompt "${p.title}"?`)) {
              STATE_PM.data.prompts = STATE_PM.data.prompts.filter(x => x.id !== p.id);
              ENGINE_PM.savePrompts(STATE_PM.data.prompts);
              RENDER_PM.renderEdit(root, search?.value || '');
            }
            return;
          }

          if (act === 'edit') {
            const newTitle = prompt('Edit title:', p.title);
            if (newTitle === null) return;
            const newBody = prompt('Edit body:', p.body);
            if (newBody === null) return;
            p.title = String(newTitle).trim() || 'Untitled';
            p.body = String(newBody).trim();
            p.updatedAt = UTIL_now();
            ENGINE_PM.savePrompts(STATE_PM.data.prompts);
            RENDER_PM.renderEdit(root, search?.value || '');
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
            STATE_PM.data.quick.push({ id: UTIL_cryptoId(), text: title, order: STATE_PM.data.quick.length, createdAt: now, updatedAt: now });
            ENGINE_PM.saveQuick(STATE_PM.data.quick);
            addTitle.value = '';
            RENDER_PM.renderEdit(root, search?.value || '');
            RENDER_PM.renderQuickTray(root);
            return;
          }

          if (!title || !body) return alert('Fill title and body');

          const now = UTIL_now();
          STATE_PM.data.prompts.push({
            id: UTIL_cryptoId(),
            title,
            body,
            favorite: false,
            type: (STATE_PM.ui.editCategory === 'append') ? 'append' : 'prompt',
            createdAt: now,
            updatedAt: now,
          });
          ENGINE_PM.savePrompts(STATE_PM.data.prompts);
          addTitle.value = '';
          addBody.value = '';
          RENDER_PM.renderEdit(root, search?.value || '');
          RENDER_PM.renderSimple(root, search?.value || '');
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
      RENDER_PM.renderSimple(root, '');
      RENDER_PM.renderEdit(root, '');
      RENDER_PM.renderQuickTray(root);
      SORT_PM.initQuickSortable(root);
      if (tray && dot && CFG_PM.QUICK_TRAY_SHOW_ON_BOOT) {
        tray.classList.add(UI_PM_CLS_QSHOW);
        tray.setAttribute('aria-hidden', 'false');
        dot.classList.add(UI_PM_CLS_DOT_SHOW);
        SORT_PM.setQuickReorderMode(root, false);
        UI_PM_scheduleFloatingLayout(root);
      }

      // capture wiring
      TIME_PM.ensureHistoryCapture();
      TIME_PM.attachDraftCaptureOnClose();
      TIME_PM.attachPastedCapture();

      if (!PM_READY_EMITTED) {
        PM_READY_EMITTED = true;
        const detail = { tok: TOK, pid: PID, skid: SkID, v: '3.1.1', api: MOD_OBJ.api };
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

      // destroy sortables (if not already destroyed via cleanup)
      SAFE_try('dispose.sortable.edit', () => { STATE_PM.sortable.editList?.destroy?.(); }, null);
      SAFE_try('dispose.sortable.quick', () => { STATE_PM.sortable.quickTray?.destroy?.(); }, null);
      STATE_PM.sortable.editList = null;
      STATE_PM.sortable.quickTray = null;
      TIME_PM.resetHistoryCapture();

      // observers
      for (const o of STATE_PM.clean.obs.splice(0)) {
        SAFE_try('dispose.obs', () => o?.disconnect?.(), null);
      }

      // timers
      for (const t of STATE_PM.clean.timers.splice(0)) {
        SAFE_try('dispose.timer', () => W.clearTimeout(t), null);
      }
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
      STATE_PM.ui.tooltip = null;
      STATE_PM.ui.pmClickTimer = 0;

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

  function API_PM_isOpen() {
    const panel = API_PM_findPanel();
    return !!panel?.classList.contains(UI_PM_CLS_OPEN);
  }

  function API_PM_open() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (API_PM_isOpen()) return true;

    const btn = API_PM_findToggleBtn(root);
    if (btn) {
      btn.click();
      return true;
    }

    const panel = API_PM_findPanel(root);
    const overlay = API_PM_findOverlay(root);
    panel?.classList?.add?.(UI_PM_CLS_OPEN);
    overlay?.classList?.add?.(UI_PM_CLS_OVSHOW);
    return true;
  }

  function API_PM_close() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (!API_PM_isOpen()) return true;

    const btn = API_PM_findToggleBtn(root);
    if (btn) {
      btn.click();
      return true;
    }

    const panel = API_PM_findPanel(root);
    const overlay = API_PM_findOverlay(root);
    panel?.classList?.remove?.(UI_PM_CLS_OPEN);
    overlay?.classList?.remove?.(UI_PM_CLS_OVSHOW);
    return true;
  }

  function API_PM_toggle() {
    const root = API_PM_findRoot();
    if (!root) return false;
    const btn = API_PM_findToggleBtn(root);
    if (btn) {
      btn.click();
      return true;
    }
    const panel = API_PM_findPanel(root);
    const overlay = API_PM_findOverlay(root);
    const next = !panel?.classList?.contains?.(UI_PM_CLS_OPEN);
    panel?.classList?.toggle?.(UI_PM_CLS_OPEN, next);
    overlay?.classList?.toggle?.(UI_PM_CLS_OVSHOW, next);
    return true;
  }

  function API_PM_focusSearch() {
    const ok = API_PM_open();
    if (!ok) return false;
    const root = API_PM_findRoot();
    const el = root?.querySelector(UI_PM.selOwned(UI_PM_SEARCH));
    if (el && typeof el.focus === 'function') {
      el.focus();
      return true;
    }
    return false;
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
